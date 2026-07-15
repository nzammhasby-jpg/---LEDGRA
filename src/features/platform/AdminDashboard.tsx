import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  platformService, 
  PlatformOrganizationRow, 
  PlatformOrganizationDetails, 
  SubscriptionPlan,
  SubscriptionEvent,
  PlatformDashboardStats,
  PlatformUserRow,
  PlatformOrgMemberRow,
  PlatformDeletedDocumentRow
} from '../../lib/platformService';
import { 
  Building, 
  Users, 
  Mail, 
  Phone, 
  ExternalLink, 
  Calendar, 
  Search, 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Save, 
  MessageCircle, 
  X, 
  Package, 
  Award,
  AlertCircle,
  Hash,
  Activity,
  User,
  MapPin,
  Notebook,
  RefreshCw,
  PlusCircle,
  TrendingUp,
  SlidersHorizontal,
  Trash2,
  FileText,
  CreditCard,
  ArrowRightLeft,
  FileSpreadsheet,
  HelpCircle,
  Info
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState<boolean>(true);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'stats' | 'organizations' | 'users' | 'support' | 'audit' | 'plans'>('stats');

  // Plans Management States
  const [plansAdmin, setPlansAdmin] = useState<SubscriptionPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState<boolean>(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [showPlanModal, setShowPlanModal] = useState<boolean>(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [submittingPlan, setSubmittingPlan] = useState<boolean>(false);
  
  const [planForm, setPlanForm] = useState({
    code: '',
    name_ar: '',
    name_en: '',
    description_ar: '',
    description_en: '',
    plan_type: 'paid' as 'paid' | 'free' | 'trial',
    billing_interval: 'monthly' as 'monthly' | 'yearly' | 'custom' | 'none',
    duration_days: 30,
    price: 0,
    currency_code: 'SAR',
    trial_days: 0,
    max_users: 10,
    max_branches: 3,
    max_invoices_per_month: 100,
    sort_order: 0,
    is_active: true,
    is_public: true,
    is_default_trial: false,
    features: {
      inventory: true,
      zatca: true,
      reports: true
    }
  });

  // Stats Tab States
  const [stats, setStats] = useState<PlatformDashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Organizations Tab States
  const [orgs, setOrgs] = useState<PlatformOrganizationRow[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState<boolean>(true);
  const [orgsError, setOrgsError] = useState<string | null>(null);
  const [orgSearchQuery, setOrgSearchQuery] = useState<string>('');
  const [orgStatusFilter, setOrgStatusFilter] = useState<string>('all');

  // Users Tab States
  const [users, setUsers] = useState<PlatformUserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');

  // Support & Deleted Docs States
  const [deletedDocs, setDeletedDocs] = useState<PlatformDeletedDocumentRow[]>([]);
  const [loadingDeleted, setLoadingDeleted] = useState<boolean>(false);
  const [deletedError, setDeletedError] = useState<string | null>(null);
  const [deletedSearchQuery, setDeletedSearchQuery] = useState<string>('');
  
  // Restore Confirm States
  const [confirmingRestoreDoc, setConfirmingRestoreDoc] = useState<PlatformDeletedDocumentRow | null>(null);
  const [restoring, setRestoring] = useState<boolean>(false);

  // Organization Details Drawer States
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [details, setDetails] = useState<PlatformOrganizationDetails | null>(null);
  const [events, setEvents] = useState<SubscriptionEvent[]>([]);
  const [members, setMembers] = useState<PlatformOrgMemberRow[]>([]);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [orgDetailTab, setOrgDetailTab] = useState<'info' | 'members' | 'documents' | 'history'>('info');
  const [docTypeFilter, setDocTypeFilter] = useState<'sales_invoice' | 'purchase_bill' | 'receipt' | 'payment' | 'credit_note' | 'debit_note' | 'journal_entry'>('sales_invoice');

  // Read-only Document Lists
  const [orgDocs, setOrgDocs] = useState<any[]>([]);
  const [loadingOrgDocs, setLoadingOrgDocs] = useState<boolean>(false);
  const [orgDocsError, setOrgDocsError] = useState<string | null>(null);

  // Edit Subscription Form States
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editForm, setEditForm] = useState({
    planId: '',
    status: 'trial' as any,
    billingCycle: 'monthly' as any,
    startsAt: '',
    endsAt: '',
    trialEndsAt: '',
    note: ''
  });
  const [showConfirmUpdate, setShowConfirmUpdate] = useState<boolean>(false);
  const [submittingSubscription, setSubmittingSubscription] = useState<boolean>(false);

  // Add Internal Notes States
  const [addNoteText, setAddNoteText] = useState<string>('');
  const [submittingNote, setSubmittingNote] = useState<boolean>(false);
  const [showNoteModal, setShowNoteModal] = useState<boolean>(false);

  // Toasts
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Verify platform admin on load
  useEffect(() => {
    let active = true;
    async function checkAdmin() {
      try {
        setCheckingAdmin(true);
        const adminCheck = await platformService.isPlatformAdmin();
        if (active) {
          setIsAdmin(adminCheck);
          if (adminCheck) {
            const role = await platformService.getPlatformAdminRole();
            if (active) {
              setAdminRole(role);
              await handleTabChange('stats');
            }
          }
        }
      } catch (err) {
        console.error('Error verifying admin profile:', err);
        if (active) setIsAdmin(false);
      } finally {
        if (active) setCheckingAdmin(false);
      }
    }
    checkAdmin();
    return () => { active = false; };
  }, [user?.id]);

  // Handle Tab Switch
  const handleTabChange = async (tab: 'stats' | 'organizations' | 'users' | 'support' | 'audit' | 'plans') => {
    setActiveTab(tab);
    if (tab === 'stats') {
      await loadStats();
    } else if (tab === 'organizations') {
      await loadOrganizations();
    } else if (tab === 'users') {
      await loadUsers();
    } else if (tab === 'support') {
      await loadDeletedDocs();
    } else if (tab === 'audit') {
      await loadStats(); // Audit is fed from stats
    } else if (tab === 'plans') {
      await loadPlansAdmin();
    }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => { setToast(null); }, 5000);
  };

  // Load General Stats Tab
  const loadStats = async () => {
    try {
      setLoadingStats(true);
      setStatsError(null);
      const data = await platformService.getDashboardStats();
      setStats(data);
    } catch (err: any) {
      console.error('Failed loading stats:', err);
      setStatsError('فشل في تحميل إحصائيات المنصة وسجلات العمليات الحالية.');
    } finally {
      setLoadingStats(false);
    }
  };

  // Load Organizations Tab
  const loadOrganizations = async () => {
    try {
      setLoadingOrgs(true);
      setOrgsError(null);
      const [orgsList, plansList] = await Promise.all([
        platformService.listOrganizations(),
        platformService.getSubscriptionPlans()
      ]);
      setOrgs(orgsList);
      setPlans(plansList);
    } catch (err: any) {
      console.error('Failed loading organizations:', err);
      setOrgsError('تعذر سحب كشف المؤسسات والشركات المفعّلة في المنصة.');
    } finally {
      setLoadingOrgs(false);
    }
  };

  // Load Users Tab
  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      setUsersError(null);
      const list = await platformService.listUsers();
      setUsers(list);
    } catch (err: any) {
      console.error('Failed loading users:', err);
      setUsersError('فشل في قراءة كشف مستخدمي النظام ومطابقة حساباتهم.');
    } finally {
      setLoadingUsers(false);
    }
  };

  // Load Deleted Documents
  const loadDeletedDocs = async () => {
    try {
      setLoadingDeleted(true);
      setDeletedError(null);
      const list = await platformService.listDeletedDocuments();
      setDeletedDocs(list);
    } catch (err: any) {
      console.error('Failed loading deleted docs details:', {
        rpcName: 'platform_list_deleted_documents',
        error: err
      });
      setDeletedError('تعذر تحميل مركز المحذوفات. تحقق من تشغيل Migrations الخاصة بسلة المحذوفات ولوحة الإدارة.');
    } finally {
      setLoadingDeleted(false);
    }
  };

  // Load Plans Admin-exclusive List
  const loadPlansAdmin = async () => {
    try {
      setLoadingPlans(true);
      setPlansError(null);
      const list = await platformService.listPlansAdmin();
      setPlansAdmin(list);
    } catch (err: any) {
      console.error('Failed loading plans:', err);
      setPlansError(err.message || 'فشل في تحميل خطط وباقات الاشتراكات.');
    } finally {
      setLoadingPlans(false);
    }
  };

  const handleOpenPlanModal = (plan: SubscriptionPlan | null = null) => {
    if (plan) {
      setEditingPlan(plan);
      setPlanForm({
        code: plan.code,
        name_ar: plan.name_ar,
        name_en: plan.name_en || '',
        description_ar: plan.description_ar || '',
        description_en: plan.description_en || '',
        plan_type: plan.plan_type as any,
        billing_interval: plan.billing_interval as any,
        duration_days: plan.duration_days || 30,
        price: plan.price || 0,
        currency_code: plan.currency_code || 'SAR',
        trial_days: plan.trial_days || 0,
        max_users: plan.max_users || 10,
        max_branches: plan.max_branches || 3,
        max_invoices_per_month: plan.max_invoices_per_month || 100,
        sort_order: plan.sort_order || 0,
        is_active: plan.is_active ?? true,
        is_public: plan.is_public ?? true,
        is_default_trial: plan.is_default_trial ?? false,
        features: {
          inventory: plan.features?.inventory ?? true,
          zatca: plan.features?.zatca ?? true,
          reports: plan.features?.reports ?? true,
        }
      });
    } else {
      setEditingPlan(null);
      setPlanForm({
        code: '',
        name_ar: '',
        name_en: '',
        description_ar: '',
        description_en: '',
        plan_type: 'paid',
        billing_interval: 'monthly',
        duration_days: 30,
        price: 0,
        currency_code: 'SAR',
        trial_days: 0,
        max_users: 10,
        max_branches: 3,
        max_invoices_per_month: 100,
        sort_order: 0,
        is_active: true,
        is_public: true,
        is_default_trial: false,
        features: {
          inventory: true,
          zatca: true,
          reports: true
        }
      });
    }
    setShowPlanModal(true);
  };

  const handleSavePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminRole === 'support') {
      showToast('غير مصرح لك: حسابات الدعم الفني لا تملك صلاحية تعديل باقات الاشتراكات.', 'error');
      return;
    }

    try {
      setSubmittingPlan(true);
      const params = {
        code: planForm.code,
        nameAr: planForm.name_ar,
        nameEn: planForm.name_en || null,
        descriptionAr: planForm.description_ar || null,
        descriptionEn: planForm.description_en || null,
        planType: planForm.plan_type,
        billingInterval: planForm.billing_interval,
        durationDays: Number(planForm.duration_days) || null,
        price: Number(planForm.price) || 0,
        currencyCode: planForm.currency_code,
        trialDays: Number(planForm.trial_days) || 0,
        maxUsers: Number(planForm.max_users) || null,
        maxBranches: Number(planForm.max_branches) || null,
        maxInvoicesPerMonth: Number(planForm.max_invoices_per_month) || null,
        features: planForm.features,
        isActive: planForm.is_active,
        isPublic: planForm.is_public,
        isDefaultTrial: planForm.is_default_trial,
        sortOrder: Number(planForm.sort_order) || 0
      };

      if (editingPlan) {
        await platformService.updatePlan(editingPlan.id, params);
        showToast('تم تحديث تفاصيل باقة الاشتراك بنجاح!', 'success');
      } else {
        await platformService.createPlan(params);
        showToast('تم إنشاء باقة الاشتراك الجديدة بنجاح!', 'success');
      }
      setShowPlanModal(false);
      await loadPlansAdmin();
    } catch (err: any) {
      console.error('Failed to save plan:', err);
      showToast(err.message || 'فشل في حفظ باقة الاشتراك.', 'error');
    } finally {
      setSubmittingPlan(false);
    }
  };

  const handleArchivePlan = async (planId: string) => {
    if (adminRole === 'support') {
      showToast('غير مصرح لك: حسابات الدعم الفني لا تملك صلاحية تعديل باقات الاشتراكات.', 'error');
      return;
    }
    if (!confirm('هل ترغب في أرشفة هذه الباقة؟ لن تتمكن المنشآت من الاشتراك بها كعرض عام.')) return;
    try {
      await platformService.archivePlan(planId);
      showToast('تمت أرشفة الباقة بنجاح!', 'success');
      await loadPlansAdmin();
    } catch (err: any) {
      console.error('Failed to archive plan:', err);
      showToast(err.message || 'فشل في أرشفة الباقة.', 'error');
    }
  };

  const handleRestorePlan = async (planId: string) => {
    if (adminRole === 'support') {
      showToast('غير مصرح لك: حسابات الدعم الفني لا تملك صلاحية تعديل باقات الاشتراكات.', 'error');
      return;
    }
    try {
      await platformService.restorePlan(planId);
      showToast('تم فك أرشفة واستعادة الباقة بنجاح!', 'success');
      await loadPlansAdmin();
    } catch (err: any) {
      console.error('Failed to restore plan:', err);
      showToast(err.message || 'فشل في استعادة الباقة.', 'error');
    }
  };

  // Load Read-Only Documents inside Organization detail drawer
  const loadOrgDocuments = async (orgId: string, type: string) => {
    try {
      setLoadingOrgDocs(true);
      setOrgDocsError(null);
      setOrgDocs([]);
      let data: any[] = [];
      if (type === 'sales_invoice') {
        data = await platformService.listOrgSalesInvoices(orgId);
      } else if (type === 'purchase_bill') {
        data = await platformService.listOrgPurchaseBills(orgId);
      } else if (type === 'receipt') {
        data = await platformService.listOrgReceipts(orgId);
      } else if (type === 'payment') {
        data = await platformService.listOrgPayments(orgId);
      } else if (type === 'credit_note') {
        data = await platformService.listOrgCreditNotes(orgId);
      } else if (type === 'debit_note') {
        data = await platformService.listOrgDebitNotes(orgId);
      } else if (type === 'journal_entry') {
        data = await platformService.listOrgJournalEntries(orgId);
      }
      setOrgDocs(data);
    } catch (err: any) {
      console.error('Failed fetching org read-only docs:', {
        organizationId: orgId,
        documentType: type,
        rpcName: 'platform_list_organization_documents',
        error: err
      });

      const errMsg = err?.message || '';
      if (type === 'debit_note' && (errMsg.includes('debit_note') || errMsg.includes('الإشعارات المدينة') || errMsg.includes('Relation does not exist'))) {
        setOrgDocsError('جدول الإشعارات المدينة غير متاح أو لم يتم تشغيل Migration الخاص به.');
      } else if (type === 'credit_note' && (errMsg.includes('credit_note') || errMsg.includes('الإشعارات الدائنة') || errMsg.includes('Relation does not exist'))) {
        setOrgDocsError('جدول الإشعارات الدائنة غير متاح أو لم يتم تشغيل Migration الخاص به.');
      } else {
        setOrgDocsError(err?.message || 'فشل في جلب مستندات العميل الحالية لقراءة التشخيص الفني.');
      }
    } finally {
      setLoadingOrgDocs(false);
    }
  };

  // Trigger Doc Type Change in Drawer
  useEffect(() => {
    if (selectedOrgId && orgDetailTab === 'documents') {
      loadOrgDocuments(selectedOrgId, docTypeFilter);
    }
  }, [docTypeFilter, orgDetailTab, selectedOrgId]);

  // Open Organization Details Drawer
  const handleOpenDetails = async (orgId: string) => {
    try {
      setSelectedOrgId(orgId);
      setDetails(null);
      setEvents([]);
      setMembers([]);
      setOrgDocs([]);
      setLoadingDetails(true);
      setDetailsError(null);
      setOrgDetailTab('info');
      setIsEditing(false);

      const [orgDetails, orgEvents, orgMembers] = await Promise.all([
        platformService.getOrganizationDetails(orgId),
        platformService.getSubscriptionEvents(orgId),
        platformService.getOrgMembers(orgId)
      ]);

      setDetails(orgDetails);
      setEvents(orgEvents);
      setMembers(orgMembers);

      // Pre-fill edit subscription form
      setEditForm({
        planId: orgDetails.plan_id || '',
        status: orgDetails.subscription_status || 'trial',
        billingCycle: orgDetails.billing_cycle || 'monthly',
        startsAt: orgDetails.starts_at ? new Date(orgDetails.starts_at).toISOString().split('T')[0] : '',
        endsAt: orgDetails.ends_at ? new Date(orgDetails.ends_at).toISOString().split('T')[0] : '',
        trialEndsAt: orgDetails.trial_ends_at ? new Date(orgDetails.trial_ends_at).toISOString().split('T')[0] : '',
        note: ''
      });
    } catch (err: any) {
      console.error('Error opening organization details:', err);
      setDetailsError('فشل في سحب تفاصيل المنشأة الحالية وحركات الدعم التقني.');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Handle Edit Subscription click
  const handleUpdateSubscriptionClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !editForm.planId) return;
    
    if (adminRole === 'support') {
      showToast('غير مصرح لك: حساب الدعم الفني لا يملك صلاحية تعديل الخطط أو الاشتراكات.', 'error');
      return;
    }

    if (!editForm.note.trim()) {
      showToast('يرجى كتابة سبب التعديل أو ملاحظة التفعيل الداخلي للمتابعة.', 'error');
      return;
    }
    
    setShowConfirmUpdate(true);
  };

  // Confirm Subscription Modification
  const confirmUpdateSubscription = async () => {
    if (!selectedOrgId || !editForm.planId) return;

    try {
      setSubmittingSubscription(true);
      await platformService.updateSubscription({
        organizationId: selectedOrgId,
        planId: editForm.planId,
        status: editForm.status,
        billingCycle: editForm.billingCycle,
        startsAt: editForm.startsAt ? new Date(editForm.startsAt).toISOString() : null,
        endsAt: editForm.endsAt ? new Date(editForm.endsAt).toISOString() : null,
        trialEndsAt: editForm.trialEndsAt ? new Date(editForm.trialEndsAt).toISOString() : null,
        note: editForm.note.trim()
      });

      showToast('تم تحديث خطة اشتراك المنشأة بنجاح وتسجيل العملية.', 'success');
      setIsEditing(false);
      setShowConfirmUpdate(false);
      
      // Refresh current details & events logs
      const [updatedDetails, updatedEvents] = await Promise.all([
        platformService.getOrganizationDetails(selectedOrgId),
        platformService.getSubscriptionEvents(selectedOrgId)
      ]);
      setDetails(updatedDetails);
      setEvents(updatedEvents);

      // Refresh organizations list
      await loadOrganizations();
    } catch (err: any) {
      console.error('Failed to update subscription:', err);
      showToast('خطأ فني أثناء تعديل اشتراك المنشأة يرجى مراجعة المدخلات.', 'error');
    } finally {
      setSubmittingSubscription(false);
    }
  };

  // Add Subscription note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !addNoteText.trim()) return;

    try {
      setSubmittingNote(true);
      await platformService.addSubscriptionNote(selectedOrgId, addNoteText.trim());
      showToast('تم حفظ الملاحظة الداخلية بنجاح في سجل المنشأة.', 'success');
      setAddNoteText('');
      setShowNoteModal(false);

      // Refresh events log
      const updatedEvents = await platformService.getSubscriptionEvents(selectedOrgId);
      setEvents(updatedEvents);
    } catch (err: any) {
      console.error('Failed to add note:', err);
      showToast('تعذر حفظ الملاحظة الداخلية.', 'error');
    } finally {
      setSubmittingNote(false);
    }
  };

  // Restore Soft Deleted Document
  const handleRestoreDocument = async () => {
    if (!confirmingRestoreDoc) return;

    if (adminRole === 'support') {
      showToast('غير مصرح لك: حسابات الدعم الفني تملك صلاحية القراءة فقط ولا يمكنها استعادة مستندات.', 'error');
      setConfirmingRestoreDoc(null);
      return;
    }

    try {
      setRestoring(true);
      await platformService.restoreDocument(
        confirmingRestoreDoc.document_type,
        confirmingRestoreDoc.document_id
      );

      showToast(`تمت استعادة المستند ${confirmingRestoreDoc.document_number} بنجاح وإعادته للمنشأة كمسودة.`, 'success');
      setConfirmingRestoreDoc(null);
      
      // Refresh Lists
      await loadDeletedDocs();
    } catch (err: any) {
      console.error('Failed restoring document:', err);
      showToast(err.message || 'فشل في استعادة المستند المحدد، يرجى التحقق من حالة الملف.', 'error');
    } finally {
      setRestoring(false);
    }
  };

  // WhatsApp Link Helper
  const getWhatsAppLink = (phone: string | null): { url: string; disabled: boolean; text: string } => {
    if (!phone || phone === 'غير محدد' || phone.trim() === '') {
      return { url: '#', disabled: true, text: 'لا يوجد رقم جوال' };
    }
    let cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('05')) {
      cleaned = '9665' + cleaned.substring(2);
    } else if (cleaned.startsWith('5') && cleaned.length === 9) {
      cleaned = '966' + cleaned;
    } else if (cleaned.startsWith('+966')) {
      cleaned = '966' + cleaned.substring(4);
    }
    cleaned = cleaned.replace('+', '');
    const message = "مرحبًا بك، معك فريق الدعم الفني والعمليات لمنصة لِدجرا المحاسبية LEDGRA. نود الاستفسار وتقديم المساعدة بخصوص منشأتكم الكريمة.";
    return {
      url: `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`,
      disabled: false,
      text: 'تواصل فوري عبر الواتساب'
    };
  };

  // Filter Orgs
  const filteredOrgs = orgs.filter(o => {
    const matchesStatus = orgStatusFilter === 'all' || o.subscription_status === orgStatusFilter;
    const q = orgSearchQuery.toLowerCase().trim();
    if (!q) return matchesStatus;

    const matchesSearch = 
      o.organization_name.toLowerCase().includes(q) ||
      (o.owner_name && o.owner_name.toLowerCase().includes(q)) ||
      (o.owner_email && o.owner_email.toLowerCase().includes(q)) ||
      (o.owner_phone && o.owner_phone.includes(q)) ||
      (o.plan_name && o.plan_name.toLowerCase().includes(q));

    return matchesStatus && matchesSearch;
  });

  // Filter Users
  const filteredUsers = users.filter(u => {
    const q = userSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.full_name.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.phone && u.phone.includes(q))
    );
  });

  // Filter Deleted Docs
  const filteredDeletedDocs = deletedDocs.filter(d => {
    const q = deletedSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      d.document_number.toLowerCase().includes(q) ||
      d.organization_name.toLowerCase().includes(q) ||
      (d.delete_reason && d.delete_reason.toLowerCase().includes(q)) ||
      d.document_type.toLowerCase().includes(q)
    );
  });

  // Skeleton UI for early platform auth verification
  if (checkingAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans select-none" dir="rtl">
        <div className="space-y-4 text-center">
          <div className="relative w-12 h-12 mx-auto bg-slate-900 rounded-xl flex items-center justify-center shadow animate-pulse">
            <span className="text-white font-mono font-bold text-lg">L</span>
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-slate-800">جاري التحقق من الصلاحيات الإدارية...</h4>
            <p className="text-[10px] text-slate-400 font-mono">LEDGRA SECURE GATEWAY</p>
          </div>
        </div>
      </div>
    );
  }

  // Not Admin View
  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans select-none" dir="rtl">
        <div className="w-full max-w-md bg-white border border-slate-200 p-8 rounded-3xl text-center space-y-6 shadow-sm">
          <div className="mx-auto w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center shadow-inner">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-black text-slate-900">حظر أمني: وصول غير مصرح</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              هذه اللوحة مخصصة لإدارة المنصة والدعم الفني المعتمد لـ LEDGRA فقط. لا يملك حسابك الحالي الصلاحيات الكافية للوصول.
            </p>
          </div>
          <button
            onClick={() => window.location.hash = '#/'}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition shadow-sm cursor-pointer"
          >
            العودة للنظام والمنشأة الحالية
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 font-sans text-right select-none space-y-8" dir="rtl" id="platform-admin-panel">
      
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-6 z-[70] p-4 rounded-2xl shadow-xl border flex items-center gap-2.5 text-xs font-bold transition-all ${
          toast.type === 'success' 
            ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
            : 'bg-rose-50 border-rose-100 text-rose-800'
        }`} id="admin-toast">
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <ShieldAlert className="w-4 h-4 text-rose-600" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header and Branding Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="font-sans font-black text-xl md:text-2xl text-slate-900">لوحة الإدارة المركزية والرقابة الفنية</span>
            {adminRole === 'support' ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-100 flex items-center gap-1">
                <Info className="w-3 h-3" />
                حساب دعم فني (قراءة فقط)
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                مطور / مدير منصة كامل
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 font-medium">
            متابعة المشتركين والعملاء، تتبع سجل العمليات المحذوفة، وتقديم خدمات الاستعادة الفورية مع عزل حماية المنشآت RLS تماماً.
          </p>
        </div>
        
        {/* Tab Selection Navigation */}
        <div className="flex gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/40 overflow-x-auto">
          {[
            { id: 'stats', label: 'الرئيسية والإحصائيات', icon: Activity },
            { id: 'organizations', label: 'المنشآت والشركات', icon: Building },
            { id: 'users', label: 'مستخدمو النظام', icon: Users },
            { id: 'plans', label: 'باقات الاشتراك', icon: Package },
            { id: 'support', label: 'مركز سلة المحذوفات', icon: Trash2 },
            { id: 'audit', label: 'سجل عمليات النظام', icon: Notebook }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id as any)}
                className={`px-4 py-2 text-xs font-black rounded-xl transition whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-250'
                    : 'text-slate-600 hover:text-slate-950 hover:bg-slate-50/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ======================= TAB: STATS / DASHBOARD ======================= */}
      {activeTab === 'stats' && (
        <div className="space-y-8">
          {loadingStats ? (
            <div className="text-center py-20 space-y-3">
              <span className="w-8 h-8 rounded-full border-4 border-slate-900 border-t-transparent animate-spin inline-block" />
              <p className="text-xs font-bold text-slate-400">جاري سحب تحليلات ومؤشرات المنصة الحالية...</p>
            </div>
          ) : statsError ? (
            <div className="p-6 bg-rose-50 border border-rose-100 text-rose-800 text-xs font-bold rounded-2xl flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <span>{statsError}</span>
            </div>
          ) : stats && (
            <div className="space-y-8">
              {/* Counts Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
                <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400">إجمالي المنشآت</span>
                  <h3 className="text-2xl font-black text-slate-900">{stats.orgs_count}</h3>
                  <p className="text-[9px] text-slate-400">شركات مسجلة بالكامل</p>
                </div>
                <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400">المستخدمين</span>
                  <h3 className="text-2xl font-black text-slate-950">{stats.users_count}</h3>
                  <p className="text-[9px] text-slate-400">حساب موظف ومالك</p>
                </div>
                <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400">فواتير المبيعات</span>
                  <h3 className="text-2xl font-black text-emerald-600">{stats.sales_invoices_count}</h3>
                  <p className="text-[9px] text-slate-400">مستندات معتمدة ومسودة</p>
                </div>
                <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400">فواتير المشتريات</span>
                  <h3 className="text-2xl font-black text-blue-600">{stats.purchase_bills_count}</h3>
                  <p className="text-[9px] text-slate-400">مشتريات مسجلة وموثقة</p>
                </div>
                <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400">سندات القبض</span>
                  <h3 className="text-2xl font-black text-indigo-600">{stats.receipts_count}</h3>
                  <p className="text-[9px] text-slate-400">سندات تصفية العملاء</p>
                </div>
                <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400">سندات الصرف</span>
                  <h3 className="text-2xl font-black text-violet-600">{stats.payments_count}</h3>
                  <p className="text-[9px] text-slate-400">سندات سداد الموردين</p>
                </div>
                <div className="bg-slate-950 text-white border border-slate-900 p-4 rounded-2xl shadow-xs space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400">المحذوفات النشطة</span>
                  <h3 className="text-2xl font-black text-brand-turquoise">{stats.deleted_documents_count}</h3>
                  <p className="text-[9px] text-slate-300">مستند معلق في سلة المهملات</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Section: Unusual subscription accounts */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-xs">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    <span>منشآت بحاجة لمتابعة عاجلة (الحالة أو التجارب المكتملة)</span>
                  </h4>
                  <p className="text-xs text-slate-500">حسابات انتهت فترتهم التجريبية أو حُجبت اشتراكاتهم بانتظار التواصل والتفعيل اليدوي.</p>

                  {stats.unusual_organizations.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-150 rounded-2xl">
                      جميع حسابات منشآت العملاء في حالة صحية ممتازة ولا توجد تجارب معلقة حالياً.
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {stats.unusual_organizations.map((uo: any) => (
                        <div key={uo.organization_id} className="p-4 rounded-2xl border border-slate-150 flex items-center justify-between hover:bg-slate-50/50 transition">
                          <div className="space-y-1">
                            <span className="font-bold text-xs text-slate-800 block">{uo.organization_name}</span>
                            <div className="text-[10px] text-slate-400 space-x-2 space-x-reverse">
                              <span>خطة الاشتراك: <strong className="text-slate-600">{uo.plan_name || 'باقة تجريبية'}</strong></span>
                              <span>•</span>
                              <span>حالة الحساب: <strong className="text-rose-600">{uo.subscription_status === 'trial' ? 'تجربة منتهية' : 'موقوف'}</strong></span>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => handleOpenDetails(uo.organization_id)}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] rounded-lg transition cursor-pointer"
                          >
                            إجراء مراجعة
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section: Recent audit events log */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-xs">
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <SlidersHorizontal className="w-5 h-5 text-slate-700" />
                    <span>سجل آخر عمليات الرقابة (التحكم والتعديلات)</span>
                  </h4>
                  <p className="text-xs text-slate-500">مخرجات العمليات الإدارية الفائتة لمديري النظام لضمان النزاهة التامة والتتبع المحمي.</p>

                  {stats.recent_activities.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-150 rounded-2xl">
                      لا توجد عمليات تحكم مسجلة حديثاً في سجل النظام الإداري.
                    </div>
                  ) : (
                    <div className="space-y-3 font-medium text-slate-700 text-xs max-h-[350px] overflow-y-auto">
                      {stats.recent_activities.map((act: any) => (
                        <div key={act.id} className="p-3 border-b border-slate-100 last:border-0 flex justify-between gap-4 items-start hover:bg-slate-50/20">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{act.admin_name || 'أدمن غير محدد'}</span>
                              <span className="text-[10px] px-1.5 py-0.25 bg-slate-100 text-slate-600 rounded">
                                {act.action === 'restore_document' ? 'استعادة مستند' : 'تعديل اشتراك'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-normal">
                              {act.action === 'restore_document' 
                                ? `قام باستعادة المستند رقم ${act.metadata?.document_number || ''} في منشأة ${act.org_name || ''}` 
                                : `حدّث باقة المنشأة ${act.org_name || ''} لـ ${act.metadata?.plan_name || ''}`
                              }
                            </p>
                          </div>
                          <span className="text-[9px] text-slate-400 shrink-0 font-mono">
                            {new Date(act.created_at).toLocaleString('ar-SA')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB: ORGANIZATIONS ======================= */}
      {activeTab === 'organizations' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
          {/* Header Filtering and Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto self-start">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'trial', label: 'تجربة مجانية' },
                { id: 'active', label: 'فعال ونشط' },
                { id: 'suspended', label: 'موقوف ومحجوب' },
                { id: 'past_due', label: 'متأخر الدفع' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setOrgStatusFilter(t.id)}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer ${
                    orgStatusFilter === t.id
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-150'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-80">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="البحث باسم المنشأة، المالك، الباقة..."
                value={orgSearchQuery}
                onChange={(e) => setOrgSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 transition text-right"
              />
            </div>
          </div>

          {/* Main List Render */}
          {loadingOrgs ? (
            <div className="text-center py-20">
              <span className="w-8 h-8 rounded-full border-4 border-slate-900 border-t-transparent animate-spin inline-block" />
            </div>
          ) : orgsError ? (
            <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 text-xs font-bold rounded-xl">
              {orgsError}
            </div>
          ) : filteredOrgs.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs">
              لا توجد منشآت مطابقة للفلاتر أو قيم البحث المدخلة حالياً.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
              <table className="w-full text-right border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                    <th className="py-3.5 px-4">اسم المنشأة</th>
                    <th className="py-3.5 px-4">مالك المنشأة</th>
                    <th className="py-3.5 px-4">بيانات المالك</th>
                    <th className="py-3.5 px-4">الباقة الحالية</th>
                    <th className="py-3.5 px-4">الحالة</th>
                    <th className="py-3.5 px-4">تاريخ التسجيل</th>
                    <th className="py-3.5 px-4 text-left">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-xs text-slate-700">
                  {filteredOrgs.map(o => {
                    const wa = getWhatsAppLink(o.owner_phone);
                    return (
                      <tr key={o.organization_id} className="hover:bg-slate-50/30 transition">
                        <td className="py-4 px-4 font-bold text-slate-900">{o.organization_name}</td>
                        <td className="py-4 px-4 font-bold text-slate-800">{o.owner_name}</td>
                        <td className="py-4 px-4 space-y-0.5 text-[11px] font-mono">
                          <span className="block text-slate-500">{o.owner_email}</span>
                          <span className="block text-slate-400" style={{ direction: 'ltr' }}>{o.owner_phone}</span>
                        </td>
                        <td className="py-4 px-4">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">
                            {o.plan_name}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                            o.subscription_status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : o.subscription_status === 'trial'
                              ? 'bg-blue-50 text-blue-700 border-blue-100'
                              : 'bg-rose-50 text-rose-700 border-rose-100'
                          }`}>
                            {o.subscription_status === 'trial' ? 'تجريبي مجاني' : o.subscription_status === 'active' ? 'فعال ونشط' : 'موقوف'}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-slate-400 font-mono text-[11px]">
                          {new Date(o.created_at).toLocaleDateString('ar-SA')}
                        </td>
                        <td className="py-4 px-4 text-left">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenDetails(o.organization_id)}
                              className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] rounded-lg transition cursor-pointer"
                            >
                              تفاصيل وتشخيص
                            </button>
                            <a
                              href={wa.url}
                              target={wa.disabled ? undefined : "_blank"}
                              rel="noopener noreferrer"
                              className={`p-1.5 rounded-lg border transition ${
                                wa.disabled ? 'opacity-30 pointer-events-none' : 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                              }`}
                              title={wa.text}
                            >
                              <MessageCircle className="w-4 h-4" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB: USERS ======================= */}
      {activeTab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
          <div className="flex justify-between items-center gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-black text-slate-900">مستخدمو النظام والمنشآت المرتبطة</h3>
              <p className="text-xs text-slate-500">قائمة بجميع الملفات الشخصية المسجلة وهوياتهم وصلاحياتهم داخل منشآت العملاء.</p>
            </div>
            
            <div className="relative w-80">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="ابحث باسم المستخدم، البريد، الجوال..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 transition text-right"
              />
            </div>
          </div>

          {loadingUsers ? (
            <div className="text-center py-20">
              <span className="w-8 h-8 rounded-full border-4 border-slate-900 border-t-transparent animate-spin inline-block" />
            </div>
          ) : usersError ? (
            <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 text-xs font-bold rounded-xl">
              {usersError}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs">
              لا يوجد مستخدمون مطابقون لبحثك الحالي.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
              <table className="w-full text-right border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                    <th className="py-3.5 px-4">الاسم الكامل</th>
                    <th className="py-3.5 px-4">بيانات الاتصال</th>
                    <th className="py-3.5 px-4">المنشآت المرتبطة والصلاحيات</th>
                    <th className="py-3.5 px-4">تاريخ الانضمام</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-xs text-slate-700 font-medium">
                  {filteredUsers.map(u => (
                    <tr key={u.profile_id} className="hover:bg-slate-50/20 transition">
                      <td className="py-4 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-[10px] uppercase">
                            {u.full_name?.charAt(0) || <User className="w-3.5 h-3.5" />}
                          </div>
                          <span>{u.full_name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 space-y-0.5 font-mono text-[11px]">
                        <span className="block text-slate-500">{u.email}</span>
                        <span className="block text-slate-400" style={{ direction: 'ltr' }}>{u.phone || 'بدون جوال'}</span>
                      </td>
                      <td className="py-4 px-4">
                        {u.organizations_json && u.organizations_json.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 max-w-sm">
                            {u.organizations_json.map((o: any) => (
                              <span key={o.org_id} className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-800 px-2 py-0.5 rounded text-[9px] font-bold">
                                <strong>{o.org_name}</strong>
                                <span className="text-slate-400">•</span>
                                <span className="text-slate-600">
                                  {o.role === 'owner' ? 'مالك' : o.role === 'admin' ? 'مدير' : 'موظف مبيعات'}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10px]">غير منضم لأي منشأة حالياً</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-slate-400 font-mono text-[11px]">
                        {new Date(u.created_at).toLocaleDateString('ar-SA')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB: PLANS (SUBSCRIPTION PLANS MANAGEMENT) ======================= */}
      {activeTab === 'plans' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-black text-slate-900">هندسة وباقات اشتراكات منصة لِدجرا</h3>
              <p className="text-xs text-slate-500">متابعة باقات الاشتراك النشطة والمؤرشفة، تعديل تسعير وحزم الموارد لكل شريحة من منشآت العملاء.</p>
            </div>
            
            {adminRole !== 'support' && (
              <button
                onClick={() => handleOpenPlanModal(null)}
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm self-start md:self-auto"
              >
                <PlusCircle className="w-4 h-4" />
                <span>إضافة باقة اشتراك جديدة</span>
              </button>
            )}
          </div>

          {loadingPlans ? (
            <div className="text-center py-20 flex flex-col items-center justify-center space-y-3">
              <span className="w-8 h-8 rounded-full border-4 border-slate-900 border-t-transparent animate-spin" />
              <p className="text-xs font-bold text-slate-400">جاري تحميل الباقات والخيارات الفنية للمنصة...</p>
            </div>
          ) : plansError ? (
            <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 text-xs font-bold rounded-2xl flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <span>{plansError}</span>
            </div>
          ) : plansAdmin.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs border border-dashed border-slate-150 rounded-2xl">
              لا توجد باقات اشتراكات معرفة في المنصة حالياً.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
              <table className="w-full text-right border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                    <th className="py-3.5 px-4">كود الباقة واسمها</th>
                    <th className="py-3.5 px-4">نوع الباقة ودورة الفوترة</th>
                    <th className="py-3.5 px-4">السعر الشهري</th>
                    <th className="py-3.5 px-4">مدة الصلاحية والتجربة</th>
                    <th className="py-3.5 px-4">سقف الموارد والمستخدمين</th>
                    <th className="py-3.5 px-4">الميزات المشمولة</th>
                    <th className="py-3.5 px-4">الحالة والظهور العامة</th>
                    <th className="py-3.5 px-4 text-left">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-xs text-slate-700 font-medium">
                  {plansAdmin.map(p => (
                    <tr key={p.id} className={`hover:bg-slate-50/20 transition ${!p.is_active ? 'bg-slate-50/40 opacity-75' : ''}`}>
                      <td className="py-4 px-4 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{p.name_ar}</span>
                          <span className="text-[9px] bg-slate-100 text-slate-650 px-1.5 py-0.5 rounded font-mono uppercase font-bold border border-slate-200">
                            {p.code}
                          </span>
                        </div>
                        {p.name_en && <p className="text-[10px] text-slate-400 font-mono">{p.name_en}</p>}
                        {p.description_ar && <p className="text-[10px] text-slate-500 line-clamp-1 max-w-xs font-sans leading-relaxed">{p.description_ar}</p>}
                      </td>
                      
                      <td className="py-4 px-4 space-y-1">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black border ${
                          p.plan_type === 'trial' ? 'bg-blue-50 text-blue-700 border-blue-150' :
                          p.plan_type === 'free' ? 'bg-emerald-50 text-emerald-700 border-emerald-150' :
                          'bg-slate-900 text-white border-slate-950'
                        }`}>
                          {p.plan_type === 'trial' && 'تجريبية'}
                          {p.plan_type === 'free' && 'مجانية'}
                          {p.plan_type === 'paid' && 'مدفوعة'}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-1">
                          دورة: {p.billing_interval === 'monthly' ? 'شهري' : p.billing_interval === 'yearly' ? 'سنوي' : p.billing_interval === 'custom' ? 'مخصص / يدوي' : 'بدون'}
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex items-baseline gap-0.5">
                          <span className="text-sm font-black font-mono text-slate-900">{p.price}</span>
                          <span className="text-[9px] text-slate-400 font-bold">{p.currency_code || 'SAR'}</span>
                        </div>
                      </td>

                      <td className="py-4 px-4 space-y-1 font-mono text-[11px]">
                        <span className="text-slate-800 font-bold block">{p.duration_days ? `${p.duration_days} يوم` : 'غير محدد / مفتوح'}</span>
                        {p.trial_days > 0 && (
                          <span className="text-blue-600 font-bold block text-[10px] font-sans">تتضمن تجربة: {p.trial_days} يوم</span>
                        )}
                      </td>

                      <td className="py-4 px-4 space-y-1 font-mono text-[10px] text-slate-500">
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-slate-700 font-sans">المستخدمون:</span>
                          <span>{p.max_users || 'غير محدود'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-slate-700 font-sans">الفروع:</span>
                          <span>{p.max_branches || 'غير محدود'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-slate-700 font-sans">الفواتير / شهر:</span>
                          <span>{p.max_invoices_per_month || 'غير محدود'}</span>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-1 text-[10px]">
                          <span className={`inline-flex items-center gap-1 font-bold ${p.features?.inventory ? 'text-emerald-700' : 'text-slate-350 line-through'}`}>
                            • إدارة المخازن
                          </span>
                          <span className={`inline-flex items-center gap-1 font-bold ${p.features?.zatca ? 'text-emerald-700' : 'text-slate-350 line-through'}`}>
                            • ربط هيئة الزكاة
                          </span>
                          <span className={`inline-flex items-center gap-1 font-bold ${p.features?.reports ? 'text-emerald-700' : 'text-slate-350 line-through'}`}>
                            • تقارير متقدمة
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-4 space-y-1">
                        <div className="flex flex-col gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black inline-flex items-center gap-1 w-fit ${p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${p.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            {p.is_active ? 'مفعلة بالمنصة' : 'مؤرشفة / معطلة'}
                          </span>
                          {p.is_public ? (
                            <span className="text-[9px] text-slate-500 font-bold">✓ معروضة للعامة</span>
                          ) : (
                            <span className="text-[9px] text-slate-400">✗ باقة مخفية / خاصة</span>
                          )}
                          {p.is_default_trial && (
                            <span className="px-1.5 py-0.25 bg-amber-50 text-amber-700 border border-amber-150 rounded text-[9px] font-black w-fit animate-pulse">التجريبية الافتراضية</span>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          {adminRole !== 'support' && (
                            <>
                              <button
                                onClick={() => handleOpenPlanModal(p)}
                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[10px] rounded-lg transition cursor-pointer"
                              >
                                تعديل الباقة
                              </button>
                              
                              {p.is_active ? (
                                <button
                                  onClick={() => handleArchivePlan(p.id)}
                                  className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[10px] rounded-lg transition cursor-pointer"
                                >
                                  أرشفة
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleRestorePlan(p.id)}
                                  className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[10px] rounded-lg transition cursor-pointer"
                                >
                                  استعادة
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB: SUPPORT (DELETED DOCUMENTS) ======================= */}
      {activeTab === 'support' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-black text-slate-900">سلة المحذوفات المشتركة ومركز الدعم الفني</h3>
              <p className="text-xs text-slate-500">عرض جميع المستندات والمسودات التي تم حذفها من قبل مستخدمي المنشآت مع صلاحية استعادتها فوراً للمساعدة وحل مشكلات الحذف الخاطئ.</p>
            </div>
            
            <div className="relative w-80">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="البحث برقم المستند، المنشأة، سبب الحذف..."
                value={deletedSearchQuery}
                onChange={(e) => setDeletedSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 transition text-right"
              />
            </div>
          </div>

          {loadingDeleted ? (
            <div className="text-center py-20">
              <span className="w-8 h-8 rounded-full border-4 border-slate-900 border-t-transparent animate-spin inline-block" />
            </div>
          ) : deletedError ? (
            <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 text-xs font-bold rounded-xl">
              {deletedError}
            </div>
          ) : filteredDeletedDocs.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs border border-dashed border-slate-150 rounded-2xl">
              لا توجد مستندات محذوفة تطابق معايير البحث والفلترة حالياً.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
              <table className="w-full text-right border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                    <th className="py-3.5 px-4">رقم المستند</th>
                    <th className="py-3.5 px-4">نوع المستند</th>
                    <th className="py-3.5 px-4">المنشأة الأصلية</th>
                    <th className="py-3.5 px-4">القيمة المالية</th>
                    <th className="py-3.5 px-4">حذف بواسطة</th>
                    <th className="py-3.5 px-4">سبب الحذف وتاريخه</th>
                    <th className="py-3.5 px-4 text-left">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-xs text-slate-700 font-medium">
                  {filteredDeletedDocs.map(doc => (
                    <tr key={doc.document_id} className="hover:bg-slate-50/20 transition">
                      <td className="py-4 px-4 font-black text-slate-900 font-mono">{doc.document_number}</td>
                      <td className="py-4 px-4">
                        <span className="bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded text-[10px] font-bold">
                          {doc.document_type === 'sales_invoice' && 'فاتورة مبيعات'}
                          {doc.document_type === 'purchase_bill' && 'فاتورة مشتريات'}
                          {doc.document_type === 'receipt' && 'سند قبض مالي'}
                          {doc.document_type === 'payment' && 'سند صرف مالي'}
                          {doc.document_type === 'sales_credit_note' && 'إشعار دائن'}
                          {doc.document_type === 'purchase_debit_note' && 'إشعار مدين'}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-bold text-slate-800">{doc.organization_name}</td>
                      <td className="py-4 px-4 font-bold text-slate-900 font-mono">
                        {doc.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })} {doc.currency}
                      </td>
                      <td className="py-4 px-4 text-slate-600">{doc.deleted_by_name}</td>
                      <td className="py-4 px-4 space-y-1">
                        <span className="block text-[11px] text-slate-400 font-mono">
                          {new Date(doc.deleted_at).toLocaleString('ar-SA')}
                        </span>
                        {doc.delete_reason ? (
                          <span className="block text-[10px] bg-amber-50 border border-amber-100/50 text-amber-800 px-2 py-0.5 rounded max-w-xs truncate" title={doc.delete_reason}>
                            {doc.delete_reason}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">بدون ذكر سبب</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-left">
                        {doc.can_restore ? (
                          <button
                            onClick={() => setConfirmingRestoreDoc(doc)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] rounded-lg transition cursor-pointer shadow-xs whitespace-nowrap"
                          >
                            استعادة المستند
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold" title="لا يمكن استعادة الفواتير المعتمدة لسلامة التسلسل المحاسبي">
                            لا يمكن الاستعادة (معتمد)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB: AUDIT ======================= */}
      {activeTab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-black text-slate-900">سجل الرقابة والتدقيق لعمليات الأدمن</h3>
            <p className="text-xs text-slate-500">سجل دائم غير قابل للتعديل يوثق عمليات مديري النظام لضمان الامتثال التام وحماية بيانات العملاء.</p>
          </div>

          {loadingStats ? (
            <div className="text-center py-20">
              <span className="w-8 h-8 rounded-full border-4 border-slate-900 border-t-transparent animate-spin inline-block" />
            </div>
          ) : statsError ? (
            <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 text-xs font-bold rounded-xl">
              {statsError}
            </div>
          ) : stats && stats.recent_activities.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs border border-dashed border-slate-150 rounded-2xl">
              لا توجد عمليات مسجلة حالياً في سجل التدقيق الإداري للمنصة.
            </div>
          ) : stats && (
            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
              <table className="w-full text-right border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                    <th className="py-3.5 px-4">أدمن المنصة</th>
                    <th className="py-3.5 px-4">العملية الإدارية</th>
                    <th className="py-3.5 px-4">المنشأة المستهدفة</th>
                    <th className="py-3.5 px-4">البيانات الفنية (Metadata)</th>
                    <th className="py-3.5 px-4">تاريخ العملية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-xs text-slate-700 font-medium">
                  {stats.recent_activities.map((act: any) => (
                    <tr key={act.id} className="hover:bg-slate-50/20 transition">
                      <td className="py-4 px-4 font-bold text-slate-900">{act.admin_name}</td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          act.action === 'restore_document' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100/50' : 'bg-slate-100 text-slate-800 border border-slate-200'
                        }`}>
                          {act.action === 'restore_document' ? 'استعادة مستند ملغي' : 'تعديل حزمة اشتراك'}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-bold text-slate-800">{act.org_name || 'غير محدد'}</td>
                      <td className="py-4 px-4 font-mono text-[10px] text-slate-500 max-w-xs truncate" title={JSON.stringify(act.metadata)}>
                        {JSON.stringify(act.metadata)}
                      </td>
                      <td className="py-4 px-4 text-slate-400 font-mono text-[11px]">
                        {new Date(act.created_at).toLocaleString('ar-SA')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ======================= MODAL: CONFIRM DOCUMENT RESTORE ======================= */}
      {confirmingRestoreDoc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none" dir="rtl">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-150 p-6 space-y-6 shadow-2xl text-right font-sans">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="bg-emerald-50 p-2.5 rounded-xl text-emerald-600">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900">تأكيد عملية الاستعادة الفنية</h4>
                <p className="text-[11px] text-slate-400">LEDGRA SUPPORT AUTHORIZATION</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              هل أنت متأكد من رغبتك في استعادة المستند المحذوف رقم <strong className="font-mono text-slate-900">{confirmingRestoreDoc.document_number}</strong> وإعادته كمسودة (Draft) داخل منشأة <strong className="text-slate-900">{confirmingRestoreDoc.organization_name}</strong>؟
            </p>

            <div className="bg-amber-50 border border-amber-100 p-3.5 rounded-2xl text-[10px] text-amber-800 space-y-1">
              <span className="font-bold block">ملاحظة أمنية ومحاسبية مهمة:</span>
              <p className="leading-relaxed">
                ستتم الاستعادة بدون المساس بالتسلسلات المحاسبية أو حركات الحماية. سيتم تسجيل هذه العملية بالكامل باسمك في سجل التدقيق لأغراض الحماية والنزاهة.
              </p>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setConfirmingRestoreDoc(null)}
                disabled={restoring}
                className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                إلغاء التراجع
              </button>
              <button
                onClick={handleRestoreDocument}
                disabled={restoring}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer disabled:opacity-50"
              >
                {restoring ? 'جاري استعادة المسودة...' : 'تأكيد واستعادة فورية'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================= DRAWER: ORGANIZATION DETAIL / DIAGNOSTIC ======================= */}
      {selectedOrgId && (
        <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
          <div className="absolute inset-0 overflow-hidden">
            <div 
              onClick={() => setSelectedOrgId(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
            />

            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-0 sm:pl-10">
              <div className="pointer-events-auto w-screen max-w-2xl transform transition ease-in-out duration-300 sm:duration-400">
                <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-2xl text-right font-sans">
                  
                  {/* Drawer Header */}
                  <div className="p-6 border-b border-slate-100 bg-slate-50 sticky top-0 z-10 flex items-center justify-between">
                    <div className="space-y-1">
                      <h2 className="text-base font-black text-slate-900" id="slide-over-title">
                        مراجعة المنشأة وتشخيص الحركات الفنية
                      </h2>
                      <p className="text-[10px] text-slate-500 font-semibold font-mono">
                        Organization ID: {selectedOrgId}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedOrgId(null)}
                      className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Drawer Body Sub-navigation */}
                  <div className="bg-slate-50 border-b border-slate-100 px-6 py-2 flex gap-4 overflow-x-auto">
                    {[
                      { id: 'info', label: 'معلومات الاشتراك' },
                      { id: 'members', label: 'كادر الموظفين' },
                      { id: 'documents', label: 'استعراض الحركات (قراءة فقط)' },
                      { id: 'history', label: 'سجل الاشتراكات' }
                    ].map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => setOrgDetailTab(sub.id as any)}
                        className={`py-2 text-xs font-black whitespace-nowrap border-b-2 transition cursor-pointer ${
                          orgDetailTab === sub.id
                            ? 'border-slate-900 text-slate-950 font-bold'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>

                  {/* Drawer Content */}
                  <div className="p-6 space-y-6 flex-1">
                    {loadingDetails ? (
                      <div className="text-center py-20 flex flex-col items-center justify-center space-y-3">
                        <span className="w-7 h-7 rounded-full border-4 border-slate-950 border-t-transparent animate-spin" />
                        <span className="text-xs font-bold text-slate-400">جاري سحب تفاصيل المنشأة وبيانات التشخيص الفني...</span>
                      </div>
                    ) : detailsError ? (
                      <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-xs font-bold text-rose-800 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-rose-600" />
                        <span>{detailsError}</span>
                      </div>
                    ) : details ? (
                      <div className="space-y-6">
                        
                        {/* ============= SUB-TAB: INFO ============= */}
                        {orgDetailTab === 'info' && (
                          <div className="space-y-6">
                            {/* Subscription Stats Card */}
                            <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-4 shadow-sm relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-24 h-24 bg-brand-navy/60 rounded-full blur-2xl opacity-40 pointer-events-none" />
                              
                              <div className="flex items-center justify-between border-b border-slate-850 pb-3">
                                <h4 className="text-xs font-black text-slate-300 flex items-center gap-1.5">
                                  <Package className="w-4 h-4 text-brand-turquoise" />
                                  الاشتراك الحالي للمنشأة
                                </h4>

                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                                  details.subscription_status === 'active'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : details.subscription_status === 'trial'
                                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                    : 'bg-red-500/10 text-rose-400 border-rose-500/20'
                                }`}>
                                  {details.subscription_status === 'trial' ? 'تجريبي مجاني' : details.subscription_status === 'active' ? 'فعال ونشط' : 'موقوف'}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-y-3.5 gap-x-4 text-xs">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-slate-400 text-[10px]">باقة الاشتراك</span>
                                  <span className="font-bold text-white">{details.plan_name_ar || 'تجريبية'}</span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-slate-400 text-[10px]">الفوترة</span>
                                  <span className="font-bold text-white">
                                    {details.billing_cycle === 'monthly' ? 'شهري' : details.billing_cycle === 'yearly' ? 'سنوي' : 'يدوي بالاتفاق'}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-0.5 font-mono">
                                  <span className="text-slate-400 text-[10px] font-sans">تاريخ التفعيل</span>
                                  <span className="text-slate-200">{details.starts_at ? new Date(details.starts_at).toLocaleDateString('ar-SA') : 'غير محدد'}</span>
                                </div>
                                <div className="flex flex-col gap-0.5 font-mono">
                                  <span className="text-slate-400 text-[10px] font-sans">تاريخ الانتهاء</span>
                                  <span className="text-slate-200">{details.ends_at ? new Date(details.ends_at).toLocaleDateString('ar-SA') : 'مفتوح / يدوي'}</span>
                                </div>
                              </div>

                              {!isEditing && (
                                <button
                                  onClick={() => setIsEditing(true)}
                                  className="w-full py-2 bg-white text-slate-900 hover:bg-slate-100 font-black text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                  <span>تعديل الاشتراك يدوياً</span>
                                </button>
                              )}
                            </div>

                            {/* Form to edit subscription */}
                            {isEditing && (
                              <form onSubmit={handleUpdateSubscriptionClick} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                  <h4 className="text-xs font-black text-slate-950 flex items-center gap-1.5">
                                    <PlusCircle className="w-4 h-4 text-brand-blue" />
                                    تعديل باقة وحالة الاشتراك
                                  </h4>
                                  <button
                                    type="button"
                                    onClick={() => setIsEditing(false)}
                                    className="text-[10px] text-slate-400 hover:text-slate-600 font-bold"
                                  >
                                    تراجع
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 block">الباقة:</label>
                                    <select
                                      value={editForm.planId}
                                      onChange={(e) => setEditForm(prev => ({ ...prev, planId: e.target.value }))}
                                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                                      required
                                    >
                                      <option value="">-- اختر باقة --</option>
                                      {plans.map(p => (
                                        <option key={p.id} value={p.id}>{p.name_ar} ({p.price} ريال/شهرياً)</option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 block">حالة الاشتراك:</label>
                                    <select
                                      value={editForm.status}
                                      onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value as any }))}
                                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                                      required
                                    >
                                      <option value="trial">تجربة مجانية (trial)</option>
                                      <option value="active">فعال ونشط (active)</option>
                                      <option value="past_due">متأخر (past_due)</option>
                                      <option value="suspended">موقوف (suspended)</option>
                                      <option value="cancelled">ملغي (cancelled)</option>
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 block">دورة الفوترة:</label>
                                    <select
                                      value={editForm.billingCycle}
                                      onChange={(e) => setEditForm(prev => ({ ...prev, billingCycle: e.target.value as any }))}
                                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                                      required
                                    >
                                      <option value="monthly">شهري</option>
                                      <option value="yearly">سنوي</option>
                                      <option value="manual">يدوي / مخصص</option>
                                    </select>
                                  </div>

                                  <div className="space-y-1 font-mono">
                                    <label className="text-[10px] font-bold text-slate-450 block font-sans">نهاية الاشتراك:</label>
                                    <input
                                      type="date"
                                      value={editForm.endsAt}
                                      onChange={(e) => setEditForm(prev => ({ ...prev, endsAt: e.target.value }))}
                                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1.5 pt-2">
                                  <label className="text-[10px] font-bold text-slate-400 block">السبب / ملاحظة تفعيل داخلية:</label>
                                  <textarea
                                    value={editForm.note}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, note: e.target.value }))}
                                    placeholder="اكتب تفاصيل التفعيل أو الترتيبات المالية للاتفاق مع العميل..."
                                    rows={2}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-slate-900 text-right"
                                    required
                                  />
                                </div>

                                <button
                                  type="submit"
                                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl transition"
                                >
                                  حفظ واعتماد التعديل اليدوي
                                </button>
                              </form>
                            )}

                            {/* Legal profile properties */}
                            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                              <h5 className="text-xs font-black text-slate-900 border-b border-slate-100 pb-2">بيانات السجل التجاري والاتصال الفني</h5>
                              
                              <div className="grid grid-cols-2 gap-4 text-xs font-medium text-slate-700">
                                <div>
                                  <span className="text-[10px] text-slate-400 block">السجل التجاري</span>
                                  <span className="font-mono">{details.cr_number || 'غير مدخل'}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block">الرقم الضريبي VAT</span>
                                  <span className="font-mono">{details.vat_number || 'غير خاضع'}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block">المدينة والمقر</span>
                                  <span>{details.city || 'الرياض، المملكة العربية السعودية'}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block">بريد الاتصال الفني</span>
                                  <span className="font-mono text-slate-600">{details.email || 'غير محدد'}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* ============= SUB-TAB: MEMBERS ============= */}
                        {orgDetailTab === 'members' && (
                          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                            <h5 className="text-xs font-black text-slate-900 border-b border-slate-100 pb-2">كادر الموظفين والوصول للمنشأة</h5>
                            
                            {members.length === 0 ? (
                              <p className="text-slate-400 text-xs text-center py-6">لا يوجد مستخدمون مضافون لهذه المنشأة حالياً.</p>
                            ) : (
                              <div className="space-y-3">
                                {members.map(m => (
                                  <div key={m.profile_id} className="p-3 border border-slate-100 rounded-xl flex items-center justify-between">
                                    <div className="space-y-0.5">
                                      <span className="font-bold text-slate-800 text-xs block">{m.full_name}</span>
                                      <span className="text-[10px] text-slate-450 font-mono block">{m.email}</span>
                                    </div>
                                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                                      {m.role === 'owner' ? 'مالك رئيسي' : m.role === 'admin' ? 'مدير منشأة' : 'مبيعات / موظف'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ============= SUB-TAB: DOCUMENTS (READ-ONLY VIEW) ============= */}
                        {orgDetailTab === 'documents' && (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-slate-400 block">اختر نوع المستند لاستعراض الحركات (قراءة فقط):</label>
                              <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl">
                                {[
                                  { id: 'sales_invoice', label: 'فواتير المبيعات' },
                                  { id: 'purchase_bill', label: 'فواتير المشتريات' },
                                  { id: 'receipt', label: 'سندات القبض' },
                                  { id: 'payment', label: 'سندات الصرف' },
                                  { id: 'credit_note', label: 'إشعارات دائنة' },
                                  { id: 'debit_note', label: 'إشعارات مدينة' },
                                  { id: 'journal_entry', label: 'قيود اليومية' }
                                ].map(docType => (
                                  <button
                                    key={docType.id}
                                    onClick={() => setDocTypeFilter(docType.id as any)}
                                    className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition whitespace-nowrap cursor-pointer ${
                                      docTypeFilter === docType.id
                                        ? 'bg-white text-slate-900 shadow-xs'
                                        : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                  >
                                    {docType.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {loadingOrgDocs ? (
                              <div className="text-center py-12">
                                <span className="w-6 h-6 rounded-full border-4 border-slate-900 border-t-transparent animate-spin inline-block" />
                              </div>
                            ) : orgDocsError ? (
                              <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 text-[11px] rounded-xl font-bold">
                                {orgDocsError}
                              </div>
                            ) : orgDocs.length === 0 ? (
                              <p className="text-center py-10 text-slate-400 text-xs border border-dashed border-slate-150 rounded-2xl">
                                لا توجد حركات أو مستندات مسجلة تحت هذا التصنيف للمنشأة.
                              </p>
                            ) : (
                              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                                <table className="w-full text-right border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-slate-50 text-slate-450 text-[9px] font-black border-b border-slate-100">
                                      <th className="py-2 px-3">رقم المستند</th>
                                      <th className="py-2 px-3">التاريخ</th>
                                      <th className="py-2 px-3">الحالة</th>
                                      <th className="py-2 px-3 text-left">المبلغ</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 text-slate-700">
                                    {orgDocs.map((docItem: any) => (
                                      <tr key={docItem.id} className="hover:bg-slate-50/20">
                                        <td className="py-2 px-3 font-bold font-mono">
                                          {docItem.invoice_number || docItem.bill_number || docItem.receipt_number || docItem.payment_number || docItem.note_number || docItem.entry_number}
                                        </td>
                                        <td className="py-2 px-3 font-mono text-slate-500">
                                          {new Date(docItem.invoice_date || docItem.bill_date || docItem.receipt_date || docItem.payment_date || docItem.note_date || docItem.entry_date).toLocaleDateString('ar-SA')}
                                        </td>
                                        <td className="py-2 px-3">
                                          <span className="text-[10px] font-bold text-slate-600">
                                            {docItem.status === 'draft' ? 'مسودة' : docItem.status === 'posted' ? 'معتمد ومرحل' : 'معتمد'}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 text-left font-bold font-mono text-slate-900">
                                          {(docItem.total || docItem.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {docItem.currency || 'SAR'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ============= SUB-TAB: HISTORY ============= */}
                        {orgDetailTab === 'history' && (
                          <div className="space-y-4">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                              <h5 className="text-xs font-black text-slate-900">سجل حركات العضوية وتغيير الخطط</h5>
                              <button
                                onClick={() => setShowNoteModal(true)}
                                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-[10px] rounded-lg transition"
                              >
                                إضافة ملاحظة داخلية
                              </button>
                            </div>

                            {events.length === 0 ? (
                              <p className="text-slate-450 text-xs text-center py-6">لا توجد حركات اشتراك سابقة مسجلة.</p>
                            ) : (
                              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                                {events.map(ev => (
                                  <div key={ev.id} className="p-3.5 border border-slate-100 rounded-xl bg-slate-50/50 space-y-1 text-xs">
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-slate-900">
                                        {ev.event_type === 'created' && 'إنشاء الاشتراك'}
                                        {ev.event_type === 'plan_changed' && 'ترقية أو تغيير الباقة'}
                                        {ev.event_type === 'activated' && 'تفعيل يدوي'}
                                        {ev.event_type === 'suspended' && 'حجب وتجميد الاشتراك'}
                                        {ev.event_type === 'cancelled' && 'إلغاء الحساب'}
                                        {ev.event_type === 'note_added' && 'ملاحظة إدارية داخلية'}
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-mono">
                                        {new Date(ev.created_at).toLocaleString('ar-SA')}
                                      </span>
                                    </div>
                                    {ev.note && (
                                      <p className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-100/60 leading-relaxed">
                                        {ev.note}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    ) : null}
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================= MODAL: CONFIRM SUBSCRIPTION UPDATE ======================= */}
      {showConfirmUpdate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none" dir="rtl">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-150 p-6 space-y-6 shadow-2xl text-right font-sans">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="bg-amber-50 p-2.5 rounded-xl text-amber-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900">تأكيد تعديل باقة الاشتراك</h4>
                <p className="text-[11px] text-slate-405 font-mono">LEDGRA BILLING AUTHORIZATION</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              هل أنت متأكد من رغبتك في تعديل خطة اشتراك المنشأة المحددة؟ سيتم تطبيق التغييرات فوراً على حساب المشترك وكامل منسوبي الشركة.
            </p>

            <div className="bg-slate-50 p-3 rounded-2xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-450">الباقة الجديدة:</span>
                <span className="font-bold text-slate-900">
                  {plans.find(p => p.id === editForm.planId)?.name_ar}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-450">حالة الاشتراك:</span>
                <span className="font-bold text-rose-600">
                  {editForm.status === 'active' ? 'فعال ومفعل' : 'موقوف / تجريبي'}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmUpdate(false)}
                disabled={submittingSubscription}
                className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold transition"
              >
                إلغاء التعديل
              </button>
              <button
                type="button"
                onClick={confirmUpdateSubscription}
                disabled={submittingSubscription}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-md disabled:opacity-50"
              >
                {submittingSubscription ? 'جاري ترحيل التعديلات...' : 'تأكيد وحفظ التغيير'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================= MODAL: ADD MANUAL SUBSCRIPTION NOTE ======================= */}
      {showNoteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none" dir="rtl">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-150 p-6 space-y-6 shadow-2xl text-right font-sans">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="bg-slate-100 p-2.5 rounded-xl text-slate-700">
                <Notebook className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900">إضافة ملاحظة إدارية داخلية</h4>
                <p className="text-[11px] text-slate-400">LEDGRA INTERNAL LOGS</p>
              </div>
            </div>

            <form onSubmit={handleAddNote} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-450 block">محتوى الملاحظة التقنية / الإدارية:</label>
                <textarea
                  value={addNoteText}
                  onChange={(e) => setAddNoteText(e.target.value)}
                  placeholder="اكتب ملاحظة التواصل مع العميل، شروط التفعيل، أو الترتيبات الفنية..."
                  rows={4}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-slate-900 text-right"
                  required
                />
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setShowNoteModal(false)}
                  disabled={submittingNote}
                  className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold transition"
                >
                  إلغاء الملاحظة
                </button>
                <button
                  type="submit"
                  disabled={submittingNote}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-md disabled:opacity-50"
                >
                  {submittingNote ? 'جاري حفظ السجل...' : 'حفظ الملاحظة الفورية'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================= MODAL: CREATE / EDIT SUBSCRIPTION PLAN ======================= */}
      {showPlanModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto select-none" dir="rtl">
          <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-150 p-6 space-y-6 shadow-2xl text-right font-sans my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="bg-slate-900 p-2.5 rounded-xl text-white">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">{editingPlan ? 'تعديل باقة الاشتراك الحالية' : 'إنشاء باقة اشتراك جديدة'}</h4>
                  <p className="text-[10px] text-slate-400 font-mono">LEDGRA SUBSCRIPTION BLUEPRINTS</p>
                </div>
              </div>
              <button 
                onClick={() => setShowPlanModal(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlanSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto px-1">
              
              {/* Row 1: Code & Arabic Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 block">كود الباقة الفريد (Unique Code):</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingPlan}
                    placeholder="مثال: basic_monthly, pro_yearly"
                    value={planForm.code}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, code: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 font-bold"
                  />
                  {!editingPlan && <p className="text-[9px] text-slate-405">لا يمكن تغيير الكود بعد الحفظ لربطه بقاعدة البيانات.</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 block">اسم الباقة (بالعربية):</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: الباقة الأساسية"
                    value={planForm.name_ar}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, name_ar: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 font-bold"
                  />
                </div>
              </div>

              {/* Row 2: English Name & Sort Order */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 block">اسم الباقة (بالإنجليزية) - اختياري:</label>
                  <input
                    type="text"
                    placeholder="مثال: Basic Plan"
                    value={planForm.name_en}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, name_en: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 block">ترتيب الفرز (Sort Order):</label>
                  <input
                    type="number"
                    value={planForm.sort_order}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, sort_order: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              {/* Description inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 block">الوصف بالعربية:</label>
                  <textarea
                    rows={2}
                    placeholder="أدخل ميزات ووصف الباقة بالكامل..."
                    value={planForm.description_ar}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, description_ar: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 block">الوصف بالإنجليزية:</label>
                  <textarea
                    rows={2}
                    placeholder="Plan features and brief summary in English..."
                    value={planForm.description_en}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, description_en: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 text-left font-mono"
                  />
                </div>
              </div>

              {/* Pricing, Billing and Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 block">نوع الباقة:</label>
                  <select
                    value={planForm.plan_type}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, plan_type: e.target.value as any }))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-slate-900 font-bold"
                  >
                    <option value="paid">مدفوعة (paid)</option>
                    <option value="free">مجانية (free)</option>
                    <option value="trial">تجريبية (trial)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 block">دورة الفوترة:</label>
                  <select
                    value={planForm.billing_interval}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, billing_interval: e.target.value as any }))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-slate-900 font-bold"
                  >
                    <option value="monthly">شهري</option>
                    <option value="yearly">سنوي</option>
                    <option value="custom">مخصص / يدوي</option>
                    <option value="none">بدون</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 block">السعر الشهري (ريال):</label>
                  <input
                    type="number"
                    required
                    value={planForm.price}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, price: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 block">أيام الصلاحية:</label>
                  <input
                    type="number"
                    placeholder="مثال: 30, 365"
                    value={planForm.duration_days}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, duration_days: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 font-bold"
                  />
                </div>
              </div>

              {/* Resource caps and limits */}
              <div className="bg-slate-50 p-4 rounded-2xl space-y-4">
                <h5 className="text-xs font-black text-slate-800 border-b border-slate-200 pb-1.5">أسقف استهلاك الموارد المشمولة بالباقة</h5>
                
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-medium text-slate-700">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block">أقصى عدد مستخدمين:</label>
                    <input
                      type="number"
                      placeholder="اتركه فارغاً لغير محدود"
                      value={planForm.max_users || ''}
                      onChange={(e) => setPlanForm(prev => ({ ...prev, max_users: Number(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block">أقصى عدد فروع:</label>
                    <input
                      type="number"
                      placeholder="اتركه فارغاً لغير محدود"
                      value={planForm.max_branches || ''}
                      onChange={(e) => setPlanForm(prev => ({ ...prev, max_branches: Number(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>

                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 block">الفواتير الشهرية المسموحة:</label>
                    <input
                      type="number"
                      placeholder="اتركه فارغاً لغير محدود"
                      value={planForm.max_invoices_per_month || ''}
                      onChange={(e) => setPlanForm(prev => ({ ...prev, max_invoices_per_month: Number(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Features flags */}
              <div className="bg-slate-50 p-4 rounded-2xl space-y-4">
                <h5 className="text-xs font-black text-slate-800 border-b border-slate-200 pb-1.5">الميزات والخيارات الحصرية للباقة</h5>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-bold text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-white rounded-lg transition">
                    <input
                      type="checkbox"
                      checked={planForm.features.inventory}
                      onChange={(e) => setPlanForm(prev => ({
                        ...prev,
                        features: { ...prev.features, inventory: e.target.checked }
                      }))}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span>إدارة المخازن والمستودعات</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-white rounded-lg transition">
                    <input
                      type="checkbox"
                      checked={planForm.features.zatca}
                      onChange={(e) => setPlanForm(prev => ({
                        ...prev,
                        features: { ...prev.features, zatca: e.target.checked }
                      }))}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span>الربط والفوترة المباشرة مع هيئة الزكاة</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-white rounded-lg transition">
                    <input
                      type="checkbox"
                      checked={planForm.features.reports}
                      onChange={(e) => setPlanForm(prev => ({
                        ...prev,
                        features: { ...prev.features, reports: e.target.checked }
                      }))}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span>الميزانيات والتقارير المتقدمة</span>
                  </label>
                </div>
              </div>

              {/* Scope and Display flags */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-bold text-slate-700 pt-2">
                <label className="flex items-center gap-2 cursor-pointer p-2 border border-slate-150 rounded-xl hover:bg-slate-50 transition">
                  <input
                    type="checkbox"
                    checked={planForm.is_active}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <div>
                    <span className="block">باقة نشطة بالمنصة</span>
                    <span className="text-[9px] text-slate-400 font-normal">تفعيل إتاحة الباقة للاستخدام والتعيين.</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer p-2 border border-slate-150 rounded-xl hover:bg-slate-50 transition">
                  <input
                    type="checkbox"
                    checked={planForm.is_public}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, is_public: e.target.checked }))}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <div>
                    <span className="block">باقة عامة ومعروضة</span>
                    <span className="text-[9px] text-slate-400 font-normal">عرض الباقة كخيار ترقية عام للمشتركين.</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer p-2 border border-slate-150 rounded-xl hover:bg-slate-50 transition">
                  <input
                    type="checkbox"
                    checked={planForm.is_default_trial}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, is_default_trial: e.target.checked }))}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <div>
                    <span className="block">الباقة التجريبية التلقائية</span>
                    <span className="text-[9px] text-slate-400 font-normal">تعيينها كباقة تجريبية للمنشآت الجديدة.</span>
                  </div>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  disabled={submittingPlan}
                  className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  إلغاء وتراجع
                </button>
                <button
                  type="submit"
                  disabled={submittingPlan}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {submittingPlan && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>{editingPlan ? 'حفظ وتثبيت التعديلات' : 'اعتماد وحفظ الباقة الجديدة'}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;
