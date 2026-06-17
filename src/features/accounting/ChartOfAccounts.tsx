import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { accountingService } from '../../lib/accountingService';
import { Account, AccountClassification, AccountNature } from '../../types';
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
  X
} from 'lucide-react';

export const ChartOfAccounts: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterClassification, setFilterClassification] = useState<string>('all');
  const [collapsedNodes, setCollapsedNodes] = useState<{ [id: string]: boolean }>({});

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
  const [formDescription, setFormDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isPrivileged = ['owner', 'admin', 'accountant'].includes(roleInCurrentOrg || '');

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

  useEffect(() => {
    loadAccounts();
  }, [currentOrg]);

  // Seed default Chart Of Accounts
  const handleSeedCOA = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      await accountingService.generateDefaultChartOfAccounts(currentOrg.id);
      setSuccess('تم تأسيس الدليل المحاسبي السعودي الافتراضي بنجاح وتجهيز كافة الحسابات الأساسية!');
      await loadAccounts();
    } catch (err: any) {
      console.error('Error seeding COA:', err);
      setError(err.message || 'فشلت عملية تأسيس الشجرة الافتراضية.');
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
    accounts.forEach(act => {
      if (act.children && act.children.length > 0) {
        newCollapsed[act.id] = true;
      }
    });
    setCollapsedNodes(newCollapsed);
  };

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

        if (matchesSearch && matchesClass) {
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
    if (!searchQuery && filterClassification === 'all') return accountTree;
    return filterAndFormatTree(accountTree);
  }, [accountTree, searchQuery, filterClassification]);

  // Recursively render tree row layout
  const renderAccountTreeNode = (node: Account, depth = 0) => {
    const isCollapsed = collapsedNodes[node.id];
    const hasChildren = node.children && node.children.length > 0;
    const styles = getClassificationStyles(node.classification);

    return (
      <div key={node.id} className="space-y-1">
        
        {/* Account Row */}
        <div 
          className={`flex items-center justify-between p-3.5 rounded-2xl border transition group ${
            node.is_system 
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
                <span className="font-mono text-xs font-semibold text-slate-400 select-all" style={{ direction: 'ltr' }}>
                  {node.code}
                </span>
                
                {/* Account Name */}
                <span className={`text-xs font-bold leading-none ${hasChildren ? 'text-slate-800' : 'text-slate-600'}`}>
                  {node.name_ar}
                </span>

                {/* English Name if exits */}
                {node.name_en && (
                  <span className="text-[10px] text-slate-400 font-mono hidden md:inline leading-none" style={{ direction: 'ltr' }}>
                    ({node.name_en})
                  </span>
                )}

                {/* Protected standard indicators */}
                {node.is_system && (
                  <span className="bg-slate-100 text-slate-500 text-[8.5px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5" title="حساب افتراضي مقفل ومحمي للنظام">
                    <ShieldCheck className="w-3 h-3 text-slate-400" />
                    <span>نظامي</span>
                  </span>
                )}

                {/* Direct posting label */}
                {!node.allow_direct_posting && (
                  <span className="bg-slate-50 border border-slate-200 text-slate-400 text-[8.5px] font-bold px-1.5 py-0.5 rounded-md">
                    تجميعي
                  </span>
                )}

                {/* Inactive indicators */}
                {!node.is_active && (
                  <span className="bg-red-50 text-red-500 text-[8.5px] font-bold px-1.5 py-0.5 rounded-md">
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
          <div className="flex items-center gap-1 shrink-0 opacity-100 md:opacity-20 group-hover:opacity-100 transition-opacity">
            {/* Nature indicator */}
            <span className="text-[10px] font-bold py-1 px-2.5 rounded-full border hidden sm:inline ml-2 select-none font-mono text-slate-400 bg-slate-50 border-slate-200">
              {node.nature === 'debit' ? 'مدين + ' : 'دائن - '}
            </span>

            {/* Classification Badge */}
            <span className={`text-[10px] font-bold py-1 px-2.5 rounded-full border hidden lg:inline ml-2 select-none uppercase ${styles.bg}`}>
              {getClassificationLabel(node.classification).split(' ')[0]}
            </span>

            {isPrivileged && (
              <>
                {/* Create sub-ledger under this */}
                <button 
                  onClick={() => openAddModal(node)}
                  className="p-1.5 hover:bg-brand-blue/10 text-slate-400 hover:text-brand-blue rounded-lg transition cursor-pointer"
                  title="إضافة حساب فرعي"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {/* Edit accounts definitions */}
                <button 
                  onClick={() => openEditModal(node)}
                  className="p-1.5 hover:bg-amber-500/10 text-slate-400 hover:text-amber-500 rounded-lg transition cursor-pointer"
                  title="تعديل الحساب"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                {/* Remove, restrict system tags */}
                {!node.is_system && (
                  <button 
                    onClick={() => handleDeleteAccount(node)}
                    className="p-1.5 hover:bg-red-500/10 text-slate-400 hover:text-red-500 rounded-lg transition cursor-pointer"
                    title="حذف الحساب"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
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

      {/* Primary Toolbar Grid */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Search Inputs */}
          <div className="relative w-full md:w-80">
            <Search className="absolute right-3.5 top-2.5 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="ابحث بالرمز أو اسم الحساب..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-3 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-blue text-right font-sans"
            />
          </div>

          {/* Sorters and Category Filter lists */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <select
              value={filterClassification}
              onChange={(e) => setFilterClassification(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue cursor-pointer font-sans"
            >
              <option value="all">كافة الحسابات الرئيسية والفرعية</option>
              <option value="assets">الأصول</option>
              <option value="liabilities">الالتزامات</option>
              <option value="equity">حقوق الملكية</option>
              <option value="revenue">الإيرادات</option>
              <option value="expenses">المصروفات</option>
            </select>

            <button 
              onClick={handleExpandAll}
              className="text-xs bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:text-slate-800 text-slate-600 font-bold px-3 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer font-sans"
              title="توسيع شجرة الدليل"
            >
              <FolderTree className="w-4 h-4" />
              <span>توسيع الكل</span>
            </button>

            <button 
              onClick={handleCollapseAll}
              className="text-xs bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:text-slate-800 text-slate-600 font-bold px-3 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer font-sans"
              title="طي فروع شجرة الدليل"
            >
              <ChevronsUpDown className="w-4 h-4" />
              <span>طي الكل</span>
            </button>

            {isPrivileged && (
              <button 
                onClick={() => openAddModal(null)}
                className="text-xs bg-brand-blue hover:bg-brand-blue-deep text-white font-extrabold px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-brand-blue/15 font-sans"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة حساب رئيسي</span>
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Main tree layout representation */}
      {loading ? (
        <div className="bg-white border border-slate-100 rounded-3xl p-16 text-center shadow-none space-y-4">
          <div className="w-9 h-9 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-400 font-bold text-xs font-sans">يرجى الانتظار جاري تحميل شجرة الحسابات والتحقق من التجهيزات...</p>
        </div>
      ) : accounts.length === 0 ? (
        
        /* Empty accounts trigger onboarding COA Setup panel */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-white space-y-6 flex flex-col items-center justify-center max-w-4xl mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-brand-turquoise">
            <Compass className="w-7 h-7" />
          </div>
          <div className="space-y-2 max-w-xl text-center">
            <h3 className="text-base font-extrabold text-white">تأسيس الدليل المحاسبي الشجري لمنشأتك</h3>
            <p className="text-xs text-slate-400">
              يرحب بك نظام LEDGRA | لِدجرا. لم يتم العثور على أي حسابات محاسبية مسجلة لمنشأتك حتى الآن. 
              هل ترغب بتأسيس دليل حسابات سعودي قياسي متكامل ومعتمد يدعم طبيعة عملك بكافة الحسابات والترابطات الضريبية الأساسية؟
            </p>
          </div>
          
          <button 
            onClick={handleSeedCOA}
            className="text-xs bg-brand-turquoise hover:bg-brand-turquoise/90 text-slate-950 font-extrabold px-6 py-3.5 rounded-xl transition shadow-lg shadow-brand-turquoise/15 cursor-pointer font-sans"
          >
            تأسيس الدليل الحسابي لِدجرا القياسي
          </button>
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
                className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-750 rounded-lg cursor-pointer transition"
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
                    onChange={(e) => setFormCode(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="مثل 1111"
                    className="w-full text-xs font-semibold font-mono text-left bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-850 outline-none focus:border-brand-blue"
                    style={{ direction: 'ltr' }}
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
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-850 outline-none focus:border-brand-blue"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">اسم الحساب بالإنجليزية (اختياري)</label>
                <input 
                  type="text"
                  value={formNameEn}
                  onChange={(e) => setFormNameEn(e.target.value)}
                  placeholder="Example: Retained Earnings"
                  className="w-full text-xs font-mono text-left bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-850 outline-none focus:border-brand-blue"
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
                    <span className="text-[11px] font-bold text-slate-650">يقبل الترحيل والقيود المباشرة</span>
                  </label>
                </div>
              </div>

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
                className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-750"
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

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">رمز الحساب</label>
                  <input 
                    type="text"
                    required
                    disabled={editingAccount.is_system}
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full text-xs font-semibold font-mono text-left bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                    style={{ direction: 'ltr' }}
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
                  className="w-full text-xs font-mono text-left bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-850 outline-none"
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
                      className="rounded border-slate-300 text-brand-blue"
                    />
                    <span className="text-[11px] font-bold text-slate-650">يقبل ترحيل القيود مباشرة</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="rounded border-slate-300 text-brand-blue"
                    />
                    <span className="text-[11px] font-bold text-slate-650 text-emerald-600">نشط وفعّال ومتاح للقيود</span>
                  </label>
                </div>
              </div>

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

    </div>
  );
};
