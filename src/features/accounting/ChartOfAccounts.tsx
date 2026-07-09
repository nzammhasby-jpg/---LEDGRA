import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { accountingService } from '../../lib/accountingService';
import { CoaTemplateSelector } from './CoaTemplateSelector';
import { Account, AccountClassification, AccountNature } from '../../types';
import { normalizeIntegerInput, normalizeInputDigits } from '../../lib/formatters';
import { 
  Folder, 
  FolderOpen, 
  FileText, 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  ChevronRight, 
  ChevronDown, 
  Compass, 
  ShieldCheck, 
  HelpCircle,
  FolderTree,
  CheckCircle2,
  AlertOctagon,
  ChevronsUpDown,
  X,
  Lock
} from 'lucide-react';

interface ChartOfAccountsProps {
  onViewLedger?: (accountId: string) => void;
  onViewSettings?: () => void;
}

export const ChartOfAccounts: React.FC<ChartOfAccountsProps> = ({ onViewLedger, onViewSettings }) => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterClassification, setFilterClassification] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [collapsedNodes, setCollapsedNodes] = useState<{ [id: string]: boolean }>({});
  
  // Custom dialog state for disabling accounts
  const [confirmDisableAccount, setConfirmDisableAccount] = useState<Account | null>(null);

  // CRUD Dialog Modals
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [selectedParent, setSelectedParent] = useState<Account | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // Form Fields State
  const [formCode, setFormCode] = useState<string>('');
  const [formNameAr, setFormNameAr] = useState<string>('');
  const [formNameEn, setFormNameEn] = useState<string>('');
  const [formClassification, setFormClassification] = useState<AccountClassification>('assets');
  const [formNature, setFormNature] = useState<AccountNature>('debit');
  const [formAllowDirect, setFormAllowDirect] = useState<boolean>(true);
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [formDescription, setFormDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // COA Phase 2A - Industry Templates State
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('general_trading');
  const [loadingTemplates, setLoadingTemplates] = useState<boolean>(false);

  const canManage = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin';
  const isPrivileged = ['owner', 'admin', 'accountant'].includes(roleInCurrentOrg || '');

  // Set of all parent account IDs
  const parentIdsSet = useMemo(() => {
    return new Set(accounts.map(a => a.parent_id).filter(Boolean));
  }, [accounts]);

  // Compute stats
  const stats = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter(a => a.is_active).length;
    const inactive = accounts.filter(a => !a.is_active).length;
    const system = accounts.filter(a => a.is_system).length;
    const postable = accounts.filter(a => a.allow_direct_posting && !parentIdsSet.has(a.id) && a.is_active).length;

    return { total, active, inactive, system, postable };
  }, [accounts, parentIdsSet]);

  // Custom translation helper for database and RPC errors
  const translateRPCError = (err: any): string => {
    const msg = err?.message || '';
    if (msg.includes('in use') || msg.includes('has transactions') || msg.includes('لديه قيود') || msg.includes('violates foreign key constraint') || msg.includes('foreign key')) {
      return 'لا يمكن حذف الحساب أو تعديله لأنه يحتوي على قيود مالية مسجلة.';
    }
    if (msg.includes('system') || msg.includes('نظامي')) {
      return 'لا يمكن تعديل أو تعطيل الحساب لأنه حساب نظامي محمي.';
    }
    if (msg.includes('parent') || msg.includes('تجميعي')) {
      return 'لا يمكن استخدام حساب تجميعي في تسجيل القيود المالية المباشرة.';
    }
    if (msg.includes('permission') || msg.includes('صلاحية') || msg.includes('unauthorized') || msg.includes('غير مصرح')) {
      return 'ليس لديك صلاحية كافية لإدارة دليل الحسابات.';
    }
    if (msg.includes('linked') || msg.includes('مرتبط') || msg.includes('setting')) {
      return 'لا يمكن تعطيل أو تعديل هذا الحساب لأنه مرتبط بالإعدادات المحاسبية والضريبية للمنشأة.';
    }
    return 'فشلت العملية المحاسبية. يرجى التحقق من المدخلات والمحاولة لاحقاً.';
  };

  const hasActiveChildren = (accountId: string): boolean => {
    return accounts.some(a => a.parent_id === accountId && a.is_active);
  };

  const handleToggleActive = async (account: Account, newStatus: boolean) => {
    if (!currentOrg) return;
    
    if (!newStatus) {
      // Disabling safety checks
      if (account.is_system) {
        alert('لا يمكن تعطيل حساب نظامي محمي.');
        return;
      }
      if (hasActiveChildren(account.id)) {
        alert('لا يمكن تعطيل حساب تجميعي يحتوي على حسابات فرعية نشطة.');
        return;
      }
      setConfirmDisableAccount(account);
    } else {
      // Enabling
      setLoading(true);
      setError(null);
      setSuccess(null);
      try {
        await accountingService.updateAccount(currentOrg.id, account.id, {
          code: account.code,
          name_ar: account.name_ar,
          name_en: account.name_en,
          classification: account.classification,
          nature: account.nature,
          parent_id: account.parent_id,
          allow_direct_posting: account.allow_direct_posting,
          is_active: true,
          description: account.description
        });
        setSuccess(`تم إعادة تفعيل الحساب المحاسبي "${account.name_ar}" بنجاح.`);
        await loadAccounts();
      } catch (err: any) {
        console.error('Error re-activating account:', err);
        setError(translateRPCError(err));
      } finally {
        setLoading(false);
      }
    }
  };

  const handleConfirmDisable = async () => {
    if (!currentOrg || !confirmDisableAccount) return;
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const act = confirmDisableAccount;
      await accountingService.updateAccount(currentOrg.id, act.id, {
        code: act.code,
        name_ar: act.name_ar,
        name_en: act.name_en,
        classification: act.classification,
        nature: act.nature,
        parent_id: act.parent_id,
        allow_direct_posting: act.allow_direct_posting,
        is_active: false,
        description: act.description
      });
      setSuccess(`تم تعطيل الحساب المحاسبي "${act.name_ar}" بنجاح.`);
      setConfirmDisableAccount(null);
      await loadAccounts();
    } catch (err: any) {
      console.error('Error disabling account:', err);
      setError(translateRPCError(err));
    } finally {
      setLoading(false);
    }
  };

  // Fetch Accounts list
  const loadAccounts = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const data = await accountingService.getAccounts(currentOrg.id);
      setAccounts(data);
    } catch (err: any) {
      console.error('Error loading accounts:', err);
      setError(err.message || 'حدث خطأ غير متوقع أثناء تحميل شجرة الحسابات.');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const data = await accountingService.getAvailableCoaTemplates();
      setTemplates(data || []);
      if (data && data.length > 0) {
        const hasGeneral = data.some(t => t.industry_type === 'general_trading');
        setSelectedTemplate(hasGeneral ? 'general_trading' : data[0].industry_type);
      }
    } catch (err) {
      console.error('Error loading COA templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, [currentOrg]);

  useEffect(() => {
    if (accounts.length === 0 && currentOrg) {
      loadTemplates();
    }
  }, [accounts, currentOrg]);

  const getTemplateLabel = (type: string): string => {
    switch (type) {
      case 'general_trading': return 'التجارة العامة والتجزئة';
      case 'services': return 'الخدمات والحلول المهنية';
      case 'real_estate': return 'التسويق والتطوير العقاري';
      case 'contracting': return 'المقاولات والإنشاءات';
      case 'ecommerce': return 'التجارة الإلكترونية والمنصات';
      case 'restaurant': return 'المطاعم والأغذية والمقاهي';
      case 'simple_establishment': return 'المؤسسات والمنشآت البسيطة';
      default: return type;
    }
  };

  // Seed default Chart Of Accounts
  const handleSeedCOA = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const status = await accountingService.generateDefaultChartOfAccounts(currentOrg.id);
      if (status === 'created') {
        setSuccess('تم تأسيس الدليل المحاسبي السعودي الافتراضي بنجاح وتجهيز كافة الحسابات الأساسية!');
      } else if (status === 'already_initialized') {
        setSuccess('الدليل المحاسبي للمنشأة مهيأ مسبقاً بالفعل.');
      }
      await loadAccounts();
    } catch (err: any) {
      console.error('Error seeding COA:', err);
      setError(err.message || 'فشلت عملية تأسيس الشجرة الافتراضية.');
    } finally {
      setLoading(false);
    }
  };

  // Seed industry-specific Chart Of Accounts
  const handleSeedIndustryCOA = async (industryType: string) => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await accountingService.seedIndustryChartOfAccounts(currentOrg.id, industryType);
      if (res && (res.status === 'success' || res.status === 'created')) {
        const count = res.inserted_accounts || 0;
        setSuccess(`تم تأسيس الدليل المحاسبي لقطاع (${getTemplateLabel(industryType)}) بنجاح! تم إنشاء ${count} حساباً وتأمين الحسابات النظامية والضريبية.`);
      } else if (res && res.status === 'already_initialized') {
        setSuccess('الدليل المحاسبي للمنشأة مهيأ مسبقاً بالفعل.');
      }
      await loadAccounts();
    } catch (err: any) {
      console.error('Error seeding industry COA:', err);
      setError(err.message || 'فشلت عملية تأسيس شجرة الحسابات الخاصة بالقطاع.');
    } finally {
      setLoading(false);
    }
  };

  // Verify and complete Chart Of Accounts
  const handleVerifyAndCompleteCOA = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const industryType = currentOrg.activity_type || 'general_trading';
      const res = await accountingService.ensureDefaultChartOfAccounts(currentOrg.id, industryType);
      
      if (res && res.status === 'already_initialized') {
        setSuccess('شجرة الحسابات موجودة بالفعل ولا تحتاج إلى إنشاء جديد.');
      } else if (res && res.status === 'success') {
        const count = res.inserted_accounts || 0;
        if (count > 0) {
          setSuccess(`تم فحص دليل الحسابات واستكمال الحسابات الناقصة بنجاح (تم إنشاء ${count} حساب جديد).`);
        } else {
          setSuccess('شجرة الحسابات موجودة بالفعل ولا تحتاج إلى إنشاء جديد.');
        }
      } else {
        setSuccess('شجرة الحسابات موجودة بالفعل ولا تحتاج إلى إنشاء جديد.');
      }
      await loadAccounts();
    } catch (err: any) {
      console.error('Error verifying and completing COA:', err);
      setError(err.message || 'فشلت عملية فحص واستكمال شجرة الحسابات.');
    } finally {
      setLoading(false);
    }
  };

  // Convert flat array into nested tree structured list
  const accountTree = useMemo(() => {
    const map: { [id: string]: Account & { children: Account[] } } = {};
    const roots: Account[] = [];

    // First pass: map nodes
    accounts.forEach(act => {
      map[act.id] = { ...act, children: [] };
    });

    // Second pass: associate parents
    accounts.forEach(act => {
      const mapped = map[act.id];
      if (act.parent_id && map[act.parent_id]) {
        map[act.parent_id].children.push(mapped);
      } else {
        roots.push(mapped);
      }
    });

    // Sort childrens and roots by code ascendingly
    const sortTree = (node: Account) => {
      if (node.children) {
        node.children.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
        node.children.forEach(sortTree);
      }
    };

    roots.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    roots.forEach(sortTree);

    return roots;
  }, [accounts]);

  // Toggle Collapse on specific Node
  const toggleNode = (id: string) => {
    setCollapsedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Expand all / Collapse all helpers
  const handleExpandAll = () => {
    setCollapsedNodes({});
  };

  const handleCollapseAll = () => {
    const newCollapsed: { [id: string]: boolean } = {};
    const parentIds = new Set(accounts.map(a => a.parent_id).filter(Boolean));
    accounts.forEach(act => {
      if (parentIds.has(act.id)) {
        newCollapsed[act.id] = true;
      }
    });
    setCollapsedNodes(newCollapsed);
  };

  const isDescendant = (potentialDescendantId: string, ancestorId: string): boolean => {
    let currentId: string | null = potentialDescendantId;
    while (currentId) {
      const parent = accounts.find(a => a.id === currentId);
      if (!parent) break;
      if (parent.parent_id === ancestorId) return true;
      currentId = parent.parent_id;
    }
    return false;
  };

  const parentOptions = useMemo(() => {
    if (!editingAccount) return [];
    return accounts.filter(acc => {
      // 1. Cannot select self
      if (acc.id === editingAccount.id) return false;
      // 2. Cannot select a descendant
      if (isDescendant(acc.id, editingAccount.id)) return false;
      // 3. Must match classification
      if (acc.classification !== formClassification) return false;
      // 4. Must match nature
      if (acc.nature !== formNature) return false;
      return true;
    });
  }, [accounts, editingAccount, formClassification, formNature]);

  // Open Form Dialog for Create
  const openAddModal = (parent: Account | null = null) => {
    if (!isPrivileged) return;
    setFormError(null);
    setSelectedParent(parent);
    
    if (parent) {
      setFormClassification(parent.classification);
      setFormNature(parent.nature);
      // Automatically suggest next sublevel code based on parent and sibling max
      const siblingMaxCode = accounts
        .filter(a => a.parent_id === parent.id)
        .reduce((max, curr) => {
          return curr.code > max ? curr.code : max;
        }, '');
        
      if (siblingMaxCode) {
        // Increment the last digit if numerical
        const match = siblingMaxCode.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1]) + 1;
          const pre = siblingMaxCode.substring(0, siblingMaxCode.length - match[1].length);
          setFormCode(pre + num.toString());
        } else {
          setFormCode(parent.code + '1');
        }
      } else {
        setFormCode(parent.code + '1');
      }
    } else {
      setFormCode('');
      setFormClassification('assets');
      setFormNature('debit');
    }
    
    setFormNameAr('');
    setFormNameEn('');
    setFormAllowDirect(true);
    setFormIsActive(true);
    setFormDescription('');
    setShowAddModal(true);
  };

  // Open Form Dialog for Edit
  const openEditModal = (account: Account) => {
    if (!isPrivileged) return;
    setFormError(null);
    setEditingAccount(account);
    setFormCode(account.code);
    setFormNameAr(account.name_ar);
    setFormNameEn(account.name_en || '');
    setFormClassification(account.classification);
    setFormNature(account.nature);
    setFormAllowDirect(account.allow_direct_posting);
    setFormIsActive(account.is_active);
    setFormParentId(account.parent_id);
    setFormDescription(account.description || '');
    setShowEditModal(true);
  };

  // Submit Account Creation
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || submitting) return;
    
    // Validations (Arabic characters required, numerals in English only)
    if (!formCode || !formNameAr) {
      setFormError('يرجى تحديد رمز الحساب واسمه باللغة العربية كحقول إلزامية.');
      return;
    }

    if (!/^[0-9]+$/.test(formCode)) {
      setFormError('رمز الحساب يجب أن يحتوي على أرقام إنجليزية (0-9) فقط دون فراغات أو حروف.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const level = selectedParent ? selectedParent.level + 1 : 1;
      await accountingService.createAccount(currentOrg.id, {
        code: formCode,
        name_ar: formNameAr,
        name_en: formNameEn || null,
        classification: formClassification,
        parent_id: selectedParent ? selectedParent.id : null,
        level: level,
        nature: formNature,
        allow_direct_posting: formAllowDirect,
        is_active: formIsActive,
        is_system: false,
        description: formDescription || null
      });

      setSuccess(`تم استحداث الحساب الجديد "${formNameAr}" بنجاح في المنشأة.`);
      setShowAddModal(false);
      await loadAccounts();
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || 'حدث خطأ أثناء محاولة إنشاء الحساب.');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Account Edition
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !editingAccount || submitting) return;

    if (!formNameAr) {
      setFormError('اسم الحساب باللغة العربية مطلوب إلزاميًا.');
      return;
    }

    if (!/^[0-9]+$/.test(formCode)) {
      setFormError('رمز الحساب يجب أن يحتوي على أرقام إنجليزية (0-9) فقط.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await accountingService.updateAccount(currentOrg.id, editingAccount.id, {
        code: formCode,
        name_ar: formNameAr,
        name_en: formNameEn || null,
        classification: formClassification,
        nature: formNature,
        parent_id: formParentId,
        allow_direct_posting: formAllowDirect,
        is_active: formIsActive,
        description: formDescription || null
      });

      setSuccess(`تم تعديل بيانات الحساب المحاسبي "${formNameAr}" بنجاح.`);
      setShowEditModal(false);
      await loadAccounts();
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || 'حدث خطأ أثناء محاولة تحديث الحساب.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Account Deletion
  const handleDeleteAccount = async (account: Account) => {
    if (!currentOrg) return;
    if (account.is_system) {
      alert('يمنع حذف الحسابات النظامية المحمية بنظام لِدجرا.');
      return;
    }

    const checkHasKids = accounts.some(a => a.parent_id === account.id);
    if (checkHasKids) {
      alert('لا يمكن حذف الحساب نظراً لاحتوائه على فروع تابعة دونه.');
      return;
    }

    if (!window.confirm(`هل أنت متأكد تماماً من رغبتك بحذف الحساب المحاسبي "${account.name_ar}" (${account.code})؟`)) {
      return;
    }

    setLoading(true);
    try {
      await accountingService.deleteAccount(currentOrg.id, account.id);
      setSuccess(`تم حذف الحساب المحاسبي "${account.name_ar}" بنجاح.`);
      await loadAccounts();
    } catch (err: any) {
      console.error('Error deleting account:', err);
      alert(err.message || 'تعذر إتمام عملية الحذف من قاعدة البيانات.');
    } finally {
      setLoading(false);
    }
  };

  // Translate classifications for labels
  const getClassificationLabel = (cls: AccountClassification): string => {
    switch (cls) {
      case 'assets': return 'الأصول (Assets)';
      case 'liabilities': return 'الالتزامات (Liabilities)';
      case 'equity': return 'حقوق الملكية (Equity)';
      case 'revenue': return 'الإيرادات (Revenues)';
      case 'expenses': return 'المصروفات (Expenses)';
      default: return cls;
    }
  };

  // Style class helper depending on classification
  const getClassificationStyles = (cls: AccountClassification) => {
    switch (cls) {
      case 'assets': return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-600' };
      case 'liabilities': return { bg: 'bg-red-50 text-red-700 border-red-200', text: 'text-red-600' };
      case 'equity': return { bg: 'bg-indigo-50 text-indigo-700 border-indigo-200', text: 'text-indigo-600' };
      case 'revenue': return { bg: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-600' };
      case 'expenses': return { bg: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-600' };
      default: return { bg: 'bg-slate-50 text-slate-700 border-slate-200', text: 'text-slate-600' };
    }
  };

  // Filtering accounts recursively
  const filterAndFormatTree = (nodes: Account[]): Account[] => {
    return nodes
      .map(node => {
        const children = node.children ? filterAndFormatTree(node.children) : [];
        const matchesSearch = 
          node.name_ar.includes(searchQuery) || 
          (node.name_en && node.name_en.toLowerCase().includes(searchQuery.toLowerCase())) ||
          node.code.includes(searchQuery);

        const matchesClass = filterClassification === 'all' || node.classification === filterClassification;

        const matchesStatus = filterStatus === 'all' ||
          (filterStatus === 'active' && node.is_active) ||
          (filterStatus === 'inactive' && !node.is_active);

        let matchesType = true;
        if (filterType !== 'all') {
          const isParent = !node.allow_direct_posting || parentIdsSet.has(node.id);
          const isPostable = node.allow_direct_posting && !parentIdsSet.has(node.id) && node.is_active;
          const isSystem = node.is_system;

          if (filterType === 'parent') {
            matchesType = isParent;
          } else if (filterType === 'postable') {
            matchesType = isPostable;
          } else if (filterType === 'system') {
            matchesType = isSystem;
          }
        }

        if (matchesSearch && matchesClass && matchesStatus && matchesType) {
          // If node matches directly, preserve all its subbranches
          return { ...node, children } as Account;
        } else if (children.length > 0) {
          // If some nested child matched, retain this parent block to show nested path
          return { ...node, children } as Account;
        }
        return null;
      })
      .filter((node): node is Account => node !== null);
  };

  const filteredTree = useMemo(() => {
    if (!searchQuery && filterClassification === 'all' && filterStatus === 'all' && filterType === 'all') return accountTree;
    return filterAndFormatTree(accountTree);
  }, [accountTree, searchQuery, filterClassification, filterStatus, filterType]);

  // Recursively render tree row layout
  const renderAccountTreeNode = (node: Account, depth = 0) => {
    const isCollapsed = searchQuery ? false : collapsedNodes[node.id];
    const hasChildren = node.children && node.children.length > 0;
    const styles = getClassificationStyles(node.classification);

    return (
      <div key={node.id} className="space-y-1">
        
        {/* Account Row */}
        <div 
          className={`flex items-center justify-between p-3.5 rounded-2xl border transition group ${
            !node.is_active
              ? 'bg-slate-50/45 border-slate-100 text-slate-400 opacity-65'
              : node.is_system 
                ? 'bg-slate-50/55 border-slate-100 hover:bg-slate-50 hover:border-slate-200' 
                : 'bg-white border-slate-100 hover:bg-slate-50/40 hover:border-slate-200/80 hover:shadow-sm'
          }`}
          style={{ marginRight: `${depth * 28}px` }}
        >
          <div className="flex items-center gap-3 truncate text-right">
            {/* Collapse toggle */}
            {hasChildren ? (
              <button 
                onClick={() => toggleNode(node.id)}
                className="w-6 h-6 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition shrink-0 cursor-pointer"
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            ) : (
              <div className="w-6 h-6 flex items-center justify-center shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
              </div>
            )}

            {/* Icon representation */}
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              hasChildren 
                ? 'bg-slate-100 text-slate-500' 
                : 'bg-brand-blue/5 text-brand-blue'
            }`}>
              {hasChildren ? (
                isCollapsed ? <Folder className="w-4.5 h-4.5" /> : <FolderOpen className="w-4.5 h-4.5" />
              ) : (
                <FileText className="w-4.5 h-4.5" />
              )}
            </div>

            {/* Data details */}
            <div className="truncate">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Account Code (English numerals, left-to-right representation) */}
                <span className="font-mono text-xs font-semibold text-slate-400 select-all tabular-nums" dir="ltr">
                  {node.code}
                </span>
                
                {/* Account Name */}
                <span className={`text-xs font-bold leading-none ${
                  !node.is_active
                    ? 'text-slate-400 line-through decoration-slate-300'
                    : hasChildren 
                      ? 'text-slate-800' 
                      : 'text-slate-600'
                }`}>
                  {node.name_ar}
                </span>

                {/* English Name if exits */}
                {node.name_en && (
                  <span className="text-[10px] text-slate-400 font-mono hidden md:inline leading-none" style={{ direction: 'ltr' }}>
                    ({node.name_en})
                  </span>
                )}

                {/* Safety Status Badges */}
                {node.is_system && (
                  <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[9px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 select-none shrink-0" title="حساب نظامي محمي غير قابل للتعطيل أو الحذف">
                    <Lock className="w-3 h-3 text-slate-400" />
                    <span>نظامي</span>
                  </span>
                )}

                {(!node.allow_direct_posting || parentIdsSet.has(node.id)) && (
                  <span className="bg-amber-50 text-amber-700 border border-amber-220 text-[9px] font-bold px-2 py-0.5 rounded-md select-none shrink-0" title="حساب رئيسي تجميعي لتصنيف الحسابات الفرعية">
                    تجميعي
                  </span>
                )}

                {(node.allow_direct_posting && !parentIdsSet.has(node.id) && node.is_active) && (
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-250 text-[9px] font-bold px-2 py-0.5 rounded-md select-none shrink-0" title="حساب فرعي نشط وقابل لترحيل المعاملات المالية المباشرة">
                    قابل للترحيل
                  </span>
                )}

                {!node.is_active && (
                  <span className="bg-red-50 text-red-600 border border-red-200 text-[9px] font-bold px-2 py-0.5 rounded-md select-none shrink-0" title="حساب معطل خارج الخدمة">
                    غير نشط
                  </span>
                )}
              </div>
              
              {/* Optional Description */}
              {node.description && (
                <p className="text-[10px] text-slate-400 mt-1 block truncate max-w-lg">
                  {node.description}
                </p>
              )}
            </div>
          </div>

          {/* Action Tools */}
          <div className="flex items-center gap-1.5 shrink-0 opacity-100 md:opacity-20 group-hover:opacity-100 transition-opacity">
            {/* Nature indicator */}
            <span className="text-[10px] font-bold py-1 px-2.5 rounded-full border hidden sm:inline ml-2 select-none font-mono text-slate-400 bg-slate-50 border-slate-200">
              {node.nature === 'debit' ? 'مدين + ' : 'دائن - '}
            </span>

            {/* Classification Badge */}
            <span className={`text-[10px] font-bold py-1 px-2.5 rounded-full border hidden lg:inline ml-2 select-none uppercase ${styles.bg}`}>
              {getClassificationLabel(node.classification).split(' ')[0]}
            </span>

            {/* Details Button */}
            <button
              onClick={() => setSelectedAccount(node)}
              className="flex items-center gap-1 text-[10px] font-bold py-1 px-2.5 rounded-lg border text-slate-600 bg-slate-50 border-slate-250 hover:bg-slate-100 transition cursor-pointer font-sans"
              title="عرض تفاصيل الحساب"
            >
              <span>تفاصيل</span>
            </button>

            {/* View Ledger Button */}
            {node.allow_direct_posting ? (
              <button
                onClick={() => onViewLedger?.(node.id)}
                className="flex items-center gap-1 text-[10px] font-bold py-1 px-2.5 rounded-lg border text-brand-blue bg-brand-blue/5 border-brand-blue/20 hover:bg-brand-blue/15 transition cursor-pointer font-sans"
                title="عرض دفتر الأستاذ"
              >
                <span>دفتر الأستاذ</span>
              </button>
            ) : (
              <span
                className="text-[10px] text-slate-400 py-1 px-2 select-none font-sans hidden sm:inline"
                title="حساب تجميعي لا يحتوي على قيود مباشرة"
              >
                لا يقبل الترحيل
              </span>
            )}

            {canManage && (
              <div className="flex items-center gap-1 border-r border-slate-100 pr-1.5 mr-1.5">
                {/* Create sub-ledger under this */}
                {node.is_active && (
                  <button 
                    onClick={() => openAddModal(node)}
                    className="p-1.5 hover:bg-brand-blue/10 text-slate-400 hover:text-brand-blue rounded-lg transition cursor-pointer shrink-0"
                    title="إضافة حساب فرعي"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}

                {/* Edit accounts definitions */}
                <button 
                  onClick={() => openEditModal(node)}
                  className="p-1.5 hover:bg-amber-500/10 text-slate-400 hover:text-amber-500 rounded-lg transition cursor-pointer shrink-0"
                  title="تعديل الحساب"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                {/* Disable/Reactivate Button for non-system accounts */}
                {!node.is_system && (
                  node.is_active ? (
                    <button
                      onClick={() => handleToggleActive(node, false)}
                      className="text-[9px] font-bold py-1 px-2 rounded-md border text-red-600 bg-red-50 border-red-200 hover:bg-red-100 transition cursor-pointer font-sans shrink-0"
                      title="تعطيل الحساب المحاسبي"
                    >
                      تعطيل
                    </button>
                  ) : (
                    <button
                      onClick={() => handleToggleActive(node, true)}
                      className="text-[9px] font-bold py-1 px-2 rounded-md border text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 transition cursor-pointer font-sans shrink-0"
                      title="إعادة تفعيل الحساب المحاسبي"
                    >
                      تفعيل
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* Child level render */}
        {hasChildren && !isCollapsed && (
          <div className="space-y-1">
            {node.children.map(child => renderAccountTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Alert Notices */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-800 text-xs font-bold flex items-start gap-2.5 text-right">
          <AlertOctagon className="w-4.5 h-4.5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-800 text-xs font-bold flex items-start gap-2.5 text-right">
          <CheckCircle2 className="w-4.5 h-4.5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{success}</p>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-500 text-xs hover:text-emerald-700 font-bold shrink-0">إغلاق</button>
        </div>
      )}

      {/* Top Statistics Cards */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-full text-right" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 text-right space-y-1 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 block font-sans">إجمالي الحسابات</span>
            <span className="text-xl font-extrabold text-slate-800 font-mono leading-none select-all">{stats.total}</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 text-right space-y-1 shadow-xs">
            <span className="text-[10px] font-bold text-emerald-600 block font-sans">الحسابات النشطة</span>
            <span className="text-xl font-extrabold text-emerald-700 font-mono leading-none select-all">{stats.active}</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 text-right space-y-1 shadow-xs">
            <span className="text-[10px] font-bold text-red-500 block font-sans">الحسابات غير النشطة</span>
            <span className="text-xl font-extrabold text-red-600 font-mono leading-none select-all">{stats.inactive}</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 text-right space-y-1 shadow-xs">
            <span className="text-[10px] font-bold text-slate-500 block font-sans">الحسابات النظامية</span>
            <span className="text-xl font-extrabold text-slate-700 font-mono leading-none select-all">{stats.system}</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 text-right space-y-1 shadow-xs">
            <span className="text-[10px] font-bold text-brand-blue block font-sans">الحسابات القابلة للترحيل</span>
            <span className="text-xl font-extrabold text-brand-blue-deep font-mono leading-none select-all">{stats.postable}</span>
          </div>
        </div>
      )}

      {/* Primary Toolbar Grid */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4 text-right" dir="rtl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          {/* Search Inputs */}
          <div className="relative w-full">
            <label className="text-[10px] font-bold text-slate-400 block mb-1.5">البحث السريع</label>
            <div className="relative">
              <Search className="absolute right-3.5 top-3 w-4 h-4 text-slate-400" />
              <input 
                type="text"
                placeholder="ابحث بالرمز أو اسم الحساب..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-3 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-blue text-right font-sans"
              />
            </div>
          </div>

          {/* Classification Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 block mb-1.5">التصنيف المحاسبي</label>
            <select
              value={filterClassification}
              onChange={(e) => setFilterClassification(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue cursor-pointer font-sans"
            >
              <option value="all">الكل (كافة التصنيفات)</option>
              <option value="assets">الأصول</option>
              <option value="liabilities">الالتزامات</option>
              <option value="equity">حقوق الملكية</option>
              <option value="revenue">الإيرادات</option>
              <option value="expenses">المصروفات</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 block mb-1.5">الحالة</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue cursor-pointer font-sans"
            >
              <option value="all">الكل (نشط وغير نشط)</option>
              <option value="active">نشط فقط</option>
              <option value="inactive">غير نشط فقط</option>
            </select>
          </div>

          {/* Account Type Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 block mb-1.5">نوع الحساب</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue cursor-pointer font-sans"
            >
              <option value="all">الكل (تجميعي وقابل للترحيل ونظامي)</option>
              <option value="parent">حساب تجميعي</option>
              <option value="postable">قابل للترحيل</option>
              <option value="system">حساب نظامي</option>
            </select>
          </div>

        </div>

        {/* Expand/Collapse and main actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button 
              onClick={handleExpandAll}
              className="text-xs bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:text-slate-800 text-slate-600 font-bold px-3 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer font-sans w-1/2 sm:w-auto justify-center"
              title="توسيع شجرة الدليل"
            >
              <FolderTree className="w-4 h-4" />
              <span>توسيع الكل</span>
            </button>

            <button 
              onClick={handleCollapseAll}
              className="text-xs bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:text-slate-800 text-slate-600 font-bold px-3 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer font-sans w-1/2 sm:w-auto justify-center"
              title="طي فروع شجرة الدليل"
            >
              <ChevronsUpDown className="w-4 h-4" />
              <span>طي الكل</span>
            </button>

            {onViewSettings && (
              <button 
                onClick={onViewSettings}
                className="text-xs bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:text-slate-800 text-slate-600 font-bold px-3 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer font-sans w-1/2 sm:w-auto justify-center"
                title="ربط الحسابات الافتراضية"
              >
                <Lock className="w-4 h-4 text-brand-blue" />
                <span>ربط الحسابات الافتراضية</span>
              </button>
            )}

            {canManage && (
              <button 
                onClick={handleVerifyAndCompleteCOA}
                className="text-xs bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:text-slate-800 text-slate-600 font-bold px-3 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer font-sans w-1/2 sm:w-auto justify-center"
                title="فحص واستكمال شجرة الحسابات"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>فحص واستكمال شجرة الحسابات</span>
              </button>
            )}
          </div>

          {canManage && (
            <button 
              onClick={() => openAddModal(null)}
              className="text-xs bg-brand-blue hover:bg-brand-blue-deep text-white font-extrabold px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-brand-blue/15 font-sans w-full sm:w-auto justify-center"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة حساب رئيسي جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* Main tree layout representation */}
      {loading ? (
        <div className="bg-white border border-slate-100 rounded-3xl p-16 text-center shadow-none space-y-4">
          <div className="w-9 h-9 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-400 font-bold text-xs font-sans">يرجى الانتظار جاري تحميل شجرة الحسابات والتحقق من التجهيزات...</p>
        </div>
      ) : accounts.length === 0 ? (
        
        /* Empty accounts trigger onboarding COA Setup panel with industry templates */
        <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-12 text-center text-slate-800 space-y-6 flex flex-col items-center justify-center max-w-4xl mx-auto shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-brand-turquoise">
            <Compass className="w-7 h-7 animate-pulse" />
          </div>
          <div className="space-y-2 max-w-xl text-center">
            <h3 className="text-lg font-extrabold text-slate-900">لم يتم تأسيس دليل الحسابات بعد</h3>
            <p className="text-xs text-slate-500 font-sans">
              يرحب بك نظام LEDGRA | لِدجرا. لم يتم تأسيس وتثبيت أي حسابات محاسبية مسجلة لمنشأتك حتى الآن. 
              يرجى اختيار قالب دليل الحسابات الملائم لقطاعك لتأسيس الهيكل المالي فوراً:
            </p>
          </div>

          <div className="w-full">
            {currentOrg && (
              <CoaTemplateSelector 
                orgId={currentOrg.id}
                onSuccess={loadAccounts}
              />
            )}
          </div>
        </div>
      ) : filteredTree.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center space-y-3 font-sans">
          <FolderTree className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-xs font-bold text-slate-400">لم يتم العثور على أي حسابات مطابقة لخيارات البحث أو التصفية الحالية.</p>
        </div>
      ) : (
        <div className="space-y-2 max-w-6xl mx-auto">
          {filteredTree.map(node => renderAccountTreeNode(node))}
        </div>
      )}


      {/* Modal Dialog: CREATE / ADD */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg shadow-2xl p-6 text-right space-y-6 font-sans">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-sm font-extrabold text-slate-800">
                {selectedParent ? `إضافة حساب فرعي تحت: ${selectedParent.name_ar}` : 'إضافة حساب رئيسي جديد'}
              </h3>
            </div>

            {/* Form Error Panel */}
            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-800 text-[11px] font-bold">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">رمز الحساب (أرقام إنجليزية فقط)</label>
                  <input 
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(normalizeIntegerInput(e.target.value))}
                    placeholder="مثل 1111"
                    className="w-full text-xs font-semibold font-mono text-left bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-brand-blue tabular-nums"
                    dir="ltr"
                    inputMode="numeric"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">طبيعة الحساب الافتراضية</label>
                  <select
                    value={formNature}
                    onChange={(e) => setFormNature(e.target.value as AccountNature)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                    disabled={!!selectedParent}
                  >
                    <option value="debit">مدين (Debit) - أصول ومصروفات</option>
                    <option value="credit">دائن (Credit) - التزامات، حقوق، إيرادات</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">اسم الحساب باللغة العربية</label>
                <input 
                  type="text"
                  required
                  value={formNameAr}
                  onChange={(e) => setFormNameAr(e.target.value)}
                  placeholder="مثال: حساب الأرباح المبقاة"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-brand-blue"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">اسم الحساب بالإنجليزية (اختياري)</label>
                <input 
                  type="text"
                  value={formNameEn}
                  onChange={(e) => setFormNameEn(e.target.value)}
                  placeholder="Example: Retained Earnings"
                  className="w-full text-xs font-mono text-left bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-brand-blue"
                  style={{ direction: 'ltr' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">التصنيف المحاسبي الرئيسي</label>
                  <select
                    value={formClassification}
                    onChange={(e) => setFormClassification(e.target.value as AccountClassification)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                    disabled={!!selectedParent}
                  >
                    <option value="assets">الأصول</option>
                    <option value="liabilities">الالتزامات</option>
                    <option value="equity">حقوق الملكية</option>
                    <option value="revenue">الإيرادات</option>
                    <option value="expenses">المصروفات</option>
                  </select>
                </div>

                <div className="pt-5 flex items-center justify-end">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={formAllowDirect}
                      onChange={(e) => setFormAllowDirect(e.target.checked)}
                      className="rounded border-slate-300 text-brand-blue"
                    />
                    <span className="text-[11px] font-bold text-slate-600">يقبل الترحيل والقيود المباشرة</span>
                  </label>
                </div>
              </div>

              {selectedParent && (
                <div className="bg-amber-50/60 border border-amber-250 rounded-xl p-3.5 text-[11px] text-amber-800 leading-relaxed font-sans">
                  • الحساب الفرعي يرث نوع وطبيعة الحساب الأب تلقائياً لضمان سلامة الهيكل المحاسبي ({selectedParent.name_ar}).
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">الوصف أو الملاحظات (اختياري)</label>
                <textarea 
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="اكتب وظيفة هذا الحساب في الشجرة..."
                  rows={2}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none"
                />
              </div>

              <div className="flex justify-start gap-3 border-t border-slate-100 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="text-xs bg-brand-blue hover:bg-brand-blue-deep text-white font-extrabold px-5 py-2.5 rounded-xl transition cursor-pointer"
                >
                  {submitting ? 'جاري الحفظ...' : 'حفظ الحساب'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2.5 rounded-xl cursor-pointer"
                >
                  إلغاء الأمر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Modal Dialog: EDIT */}
      {showEditModal && editingAccount && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg shadow-2xl p-6 text-right space-y-6 font-sans">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <button 
                onClick={() => setShowEditModal(false)}
                className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-sm font-extrabold text-slate-800">
                تعديل بيانات الحساب: {editingAccount.name_ar}
              </h3>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-red-800 text-[11px] font-bold">
                {formError}
              </div>
            )}

            {editingAccount.is_system && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-[11px] text-blue-800 leading-relaxed flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-600 shrink-0" />
                <span>هذا حساب نظامي محمي. يسمح بتعديل الاسم والوصف فقط لضمان سلامة العمليات المحاسبية والنظام.</span>
              </div>
            )}

            {formParentId && !editingAccount.is_system && (
              <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3.5 text-[11px] text-amber-800 leading-relaxed font-sans">
                • الحساب الفرعي يرث نوع وطبيعة الحساب الأب تلقائياً لضمان سلامة الهيكل المحاسبي.
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">رمز الحساب</label>
                  <input 
                    type="text"
                    required
                    disabled={editingAccount.is_system}
                    value={formCode}
                    onChange={(e) => setFormCode(normalizeIntegerInput(e.target.value))}
                    className="w-full text-xs font-semibold font-mono text-left bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none disabled:bg-slate-100 disabled:text-slate-400 tabular-nums"
                    dir="ltr"
                    inputMode="numeric"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">طبيعة الحساب</label>
                  <select
                    value={formNature}
                    onChange={(e) => setFormNature(e.target.value as AccountNature)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                    disabled={editingAccount.is_system}
                  >
                    <option value="debit">مدين (Debit)</option>
                    <option value="credit">دائن (Credit)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">اسم الحساب باللغة العربية</label>
                <input 
                  type="text"
                  required
                  value={formNameAr}
                  onChange={(e) => setFormNameAr(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-brand-blue"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">اسم الحساب بالإنجليزية</label>
                <input 
                  type="text"
                  value={formNameEn}
                  onChange={(e) => setFormNameEn(e.target.value)}
                  className="w-full text-xs font-mono text-left bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none"
                  style={{ direction: 'ltr' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">التصنيف المحاسبي</label>
                  <select
                    value={formClassification}
                    onChange={(e) => setFormClassification(e.target.value as AccountClassification)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                    disabled={editingAccount.is_system}
                  >
                    <option value="assets">الأصول</option>
                    <option value="liabilities">الالتزامات</option>
                    <option value="equity">حقوق الملكية</option>
                    <option value="revenue">الإيرادات</option>
                    <option value="expenses">المصروفات</option>
                  </select>
                </div>

                <div className="pt-5 flex flex-col justify-center gap-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={formAllowDirect}
                      onChange={(e) => setFormAllowDirect(e.target.checked)}
                      disabled={editingAccount.is_system}
                      className="rounded border-slate-300 text-brand-blue disabled:opacity-50"
                    />
                    <span className="text-[11px] font-bold text-slate-600">يقبل ترحيل القيود مباشرة</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      disabled={editingAccount.is_system}
                      className="rounded border-slate-300 text-brand-blue disabled:opacity-50"
                    />
                    <span className="text-[11px] font-bold text-slate-600 text-emerald-600">نشط وفعّال ومتاح للقيود</span>
                  </label>
                </div>
              </div>

              {!editingAccount.is_system && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">الحساب الأب (نقل الحساب)</label>
                  <select
                    value={formParentId || ''}
                    onChange={(e) => {
                      const newParentId = e.target.value || null;
                      setFormParentId(newParentId);
                      if (newParentId) {
                        const p = accounts.find(a => a.id === newParentId);
                        if (p) {
                          setFormClassification(p.classification);
                          setFormNature(p.nature);
                        }
                      }
                    }}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                  >
                    <option value="">« بدون حساب أب - حساب رئيسي »</option>
                    {parentOptions.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.code} - {p.name_ar} {p.name_en ? `(${p.name_en})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">الوصف والملاحظات</label>
                <textarea 
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-brand-blue"
                />
              </div>

              <div className="flex justify-start gap-4 border-t border-slate-100 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="text-xs bg-brand-blue hover:bg-brand-blue-deep text-white font-extrabold px-5 py-2.5 rounded-xl transition"
                >
                  {submitting ? 'جاري التحديث...' : 'حفظ التعديلات'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2.5 rounded-xl"
                >
                  إلغاء الأمر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drawer: ACCOUNT DETAILS */}
      {selectedAccount && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex justify-end z-50 animate-fadeIn" dir="rtl">
          {/* Overlay click to close */}
          <div className="absolute inset-0" onClick={() => setSelectedAccount(null)}></div>
          
          <div className="relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col animate-slideLeft">
            
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b border-slate-150 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <FileText className="w-4.5 h-4.5 text-brand-blue" />
                <span>تفاصيل الحساب المحاسبي</span>
              </h3>
              <button 
                onClick={() => setSelectedAccount(null)}
                className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-right font-sans">
              
              <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4.5 space-y-1.5">
                <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider">رمز الحساب</span>
                <span className="text-base font-black text-slate-800 font-mono" dir="ltr">{selectedAccount.code}</span>
              </div>

              <div className="space-y-4 divide-y divide-slate-100">
                <div className="pt-3.5 first:pt-0">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">اسم الحساب العربي</span>
                  <p className="text-xs font-bold text-slate-800">{selectedAccount.name_ar}</p>
                </div>

                <div className="pt-3.5">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">اسم الحساب الإنجليزي</span>
                  <p className="text-xs font-mono text-slate-800" dir="ltr">
                    {selectedAccount.name_en || <span className="text-slate-300 font-sans italic">غير متوفر</span>}
                  </p>
                </div>

                <div className="pt-3.5">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">تصنيف الحساب</span>
                  <span className={`inline-block text-[10px] font-black py-1 px-3 rounded-full border uppercase ${getClassificationStyles(selectedAccount.classification).bg}`}>
                    {getClassificationLabel(selectedAccount.classification)}
                  </span>
                </div>

                <div className="pt-3.5">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">طبيعة الحساب</span>
                  <span className="text-xs font-bold text-slate-700">
                    {selectedAccount.nature === 'debit' ? 'مدين (Debit)' : 'دائن (Credit)'}
                  </span>
                </div>

                <div className="pt-3.5">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">الحساب الأب</span>
                  <p className="text-xs text-slate-700">
                    {selectedAccount.parent_id ? (
                      <>
                        <span className="font-mono font-bold text-slate-850" dir="ltr">
                          {accounts.find(a => a.id === selectedAccount.parent_id)?.code}
                        </span>
                        {' - '}
                        <span className="font-bold">
                          {accounts.find(a => a.id === selectedAccount.parent_id)?.name_ar}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400 italic">لا يوجد (حساب جذر رئيسي)</span>
                    )}
                  </p>
                </div>

                <div className="pt-3.5">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">المستوى في الشجرة المحاسبية</span>
                  <span className="text-xs font-black text-slate-800 font-mono">الـمـسـتـوى {selectedAccount.level}</span>
                </div>

                <div className="pt-3.5">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">نوع ترحيل الحساب</span>
                  <span className={`inline-block text-[10px] font-black py-1 px-3 rounded-full border ${
                    selectedAccount.allow_direct_posting 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {selectedAccount.allow_direct_posting ? 'يقبل القيود والترحيل المباشر' : 'حساب تجميعي لا يقبل قيود مباشرة'}
                  </span>
                </div>

                <div className="pt-3.5">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">حالة الحساب</span>
                  <span className={`inline-block text-[10px] font-black py-1 px-3 rounded-full border ${
                    selectedAccount.is_active 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {selectedAccount.is_active ? 'نشط ومتاح' : 'معطل ومغلق'}
                  </span>
                </div>

                <div className="pt-3.5">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">مصدر الحساب</span>
                  <span className={`inline-block text-[10px] font-black py-1 px-3 rounded-full border ${
                    selectedAccount.is_system 
                      ? 'bg-slate-100 text-slate-600 border-slate-200' 
                      : 'bg-purple-50 text-purple-700 border-purple-200'
                  }`}>
                    {selectedAccount.is_system ? 'حساب نظامي افتراضي ومحمي' : 'حساب مخصص للمنشأة'}
                  </span>
                </div>

                {selectedAccount.description && (
                  <div className="pt-3.5">
                    <span className="text-[10px] font-bold text-slate-400 block mb-1">الوصف والملاحظات التفصيلية</span>
                    <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3 leading-relaxed">
                      {selectedAccount.description}
                    </p>
                  </div>
                )}
              </div>

            </div>

            {/* Drawer Footer Actions */}
            <div className="p-6 border-t border-slate-150 bg-slate-50/50 flex flex-col gap-3">
              {selectedAccount.allow_direct_posting ? (
                <button
                  onClick={() => {
                    onViewLedger?.(selectedAccount.id);
                    setSelectedAccount(null);
                  }}
                  className="w-full py-3 bg-brand-blue hover:bg-brand-blue-deep text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 font-sans"
                >
                  <FileText className="w-4 h-4" />
                  <span>عرض دفتر الأستاذ العام</span>
                </button>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-[10px] font-bold text-right leading-relaxed font-sans">
                  هذا حساب تجميعي، اختر حسابًا فرعيًا يقبل القيود المباشرة لعرض دفتر الأستاذ.
                </div>
              )}
              
              <button
                onClick={() => setSelectedAccount(null)}
                className="w-full py-3 bg-slate-150 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition cursor-pointer font-sans"
              >
                إغلاق التفاصيل
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal Dialog: DISABLE CONFIRMATION */}
      {confirmDisableAccount && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 text-right space-y-6 font-sans" dir="rtl">
            <div className="flex items-center gap-3 text-red-650">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-extrabold text-slate-850">تأكيد تعطيل الحساب المحاسبي</h3>
            </div>

            <div className="space-y-3.5">
              <p className="text-xs text-slate-600 leading-relaxed">
                هل أنت متأكد من رغبتك في تعطيل الحساب <strong className="text-slate-900 font-bold">"{confirmDisableAccount.name_ar}"</strong> ({confirmDisableAccount.code})؟
              </p>
              <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-[11px] text-slate-500 leading-relaxed">
                سيتم إيقاف استخدام هذا الحساب في العمليات الجديدة، لكنه سيبقى ظاهرًا في التقارير التاريخية.
              </div>
            </div>

            <div className="flex justify-start gap-3 pt-2">
              <button
                type="button"
                onClick={handleConfirmDisable}
                className="text-xs bg-red-600 hover:bg-red-700 text-white font-extrabold px-5 py-2.5 rounded-xl transition cursor-pointer"
              >
                تأكيد التعطيل
              </button>
              <button
                type="button"
                onClick={() => setConfirmDisableAccount(null)}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2.5 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
