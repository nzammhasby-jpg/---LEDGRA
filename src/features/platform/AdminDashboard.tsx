import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  platformService, 
  PlatformOrganizationRow, 
  PlatformOrganizationDetails, 
  SubscriptionPlan,
  SubscriptionEvent 
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
  SlidersHorizontal
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState<boolean>(true);

  // States for organizations lists
  const [orgs, setOrgs] = useState<PlatformOrganizationRow[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Drawer & Details states
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [details, setDetails] = useState<PlatformOrganizationDetails | null>(null);
  const [events, setEvents] = useState<SubscriptionEvent[]>([]);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Edit Subscription Form states
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
  
  // Confirmation states
  const [showConfirmUpdate, setShowConfirmUpdate] = useState<boolean>(false);
  const [submittingSubscription, setSubmittingSubscription] = useState<boolean>(false);

  // Internal Notes states
  const [addNoteText, setAddNoteText] = useState<string>('');
  const [submittingNote, setSubmittingNote] = useState<boolean>(false);
  const [showNoteModal, setShowNoteModal] = useState<boolean>(false);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Verify platform admin on load
  useEffect(() => {
    let active = true;
    async function checkAdminRole() {
      try {
        setCheckingAdmin(true);
        const adminCheck = await platformService.isPlatformAdmin();
        if (active) {
          setIsAdmin(adminCheck);
          if (adminCheck) {
            await loadData();
          }
        }
      } catch (err) {
        console.error('Failed to verify platform admin status:', err);
        if (active) {
          setIsAdmin(false);
        }
      } finally {
        if (active) {
          setCheckingAdmin(false);
        }
      }
    }
    checkAdminRole();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [orgsList, plansList] = await Promise.all([
        platformService.listOrganizations(),
        platformService.getSubscriptionPlans()
      ]);
      setOrgs(orgsList);
      setPlans(plansList);
    } catch (err: any) {
      console.error('Error loading platform admin data:', err);
      setError('تعذر تحميل بيانات المنصة. حاول تحديث الصفحة أو إعادة المحاولة.');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  const handleOpenDetails = async (orgId: string) => {
    try {
      setSelectedOrgId(orgId);
      setDetails(null);
      setEvents([]);
      setLoadingDetails(true);
      setDetailsError(null);
      setIsEditing(false);

      const [orgDetails, orgEvents] = await Promise.all([
        platformService.getOrganizationDetails(orgId),
        platformService.getSubscriptionEvents(orgId)
      ]);

      setDetails(orgDetails);
      setEvents(orgEvents);

      // Initialize edit form
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
      setDetailsError('فشل في تحميل تفاصيل المنشأة وحركات الاشتراك.');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Triggers the confirmation dialog for editing a subscription
  const handleUpdateSubscriptionClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !editForm.planId) return;
    
    // Validate note requirement
    if (!editForm.note.trim()) {
      showToast('يرجى كتابة ملاحظة التفعيل الداخلي / السبب قبل المتابعة.', 'error');
      return;
    }
    
    setShowConfirmUpdate(true);
  };

  // Perform the actual backend update after confirmation
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

      showToast('تم تحديث الاشتراك بنجاح وتسجيل العملية.', 'success');
      setIsEditing(false);
      setShowConfirmUpdate(false);
      
      // Refresh current details & events
      const [updatedDetails, updatedEvents] = await Promise.all([
        platformService.getOrganizationDetails(selectedOrgId),
        platformService.getSubscriptionEvents(selectedOrgId)
      ]);
      setDetails(updatedDetails);
      setEvents(updatedEvents);

      // Refresh main dashboard list
      await loadData();
    } catch (err: any) {
      console.error('Failed to update subscription:', err);
      showToast('فشل في تحديث الاشتراك. يرجى مراجعة المدخلات والمحاولة لاحقاً.', 'error');
    } finally {
      setSubmittingSubscription(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !addNoteText.trim()) return;

    try {
      setSubmittingNote(true);
      await platformService.addSubscriptionNote(selectedOrgId, addNoteText.trim());
      showToast('تم حفظ الملاحظة الداخلية بنجاح.', 'success');
      setAddNoteText('');
      setShowNoteModal(false);

      // Refresh events log
      const updatedEvents = await platformService.getSubscriptionEvents(selectedOrgId);
      setEvents(updatedEvents);
    } catch (err: any) {
      console.error('Failed to add note:', err);
      showToast('فشل في إضافة الملاحظة الداخلية.', 'error');
    } finally {
      setSubmittingNote(false);
    }
  };

  // Clean and format phone number into standard WhatsApp format
  const getWhatsAppLinkAndStatus = (phone: string | null): { url: string; disabled: boolean; text: string } => {
    if (!phone || phone === 'غير محدد' || phone.trim() === '') {
      return { url: '#', disabled: true, text: 'لا يوجد رقم جوال' };
    }
    
    // Clean symbols, spaces, dashes
    let cleaned = phone.replace(/[^\d+]/g, '');
    
    // Convert local zero-start numbers to Saudi country code
    if (cleaned.startsWith('05')) {
      cleaned = '9665' + cleaned.substring(2);
    } else if (cleaned.startsWith('5') && cleaned.length === 9) {
      cleaned = '966' + cleaned;
    } else if (cleaned.startsWith('+966')) {
      cleaned = '966' + cleaned.substring(4);
    } else if (cleaned.startsWith('966')) {
      // already Saudi format
    } else {
      // fallback without edits if already country format or weird code
    }

    // Clean any residual '+' sign
    cleaned = cleaned.replace('+', '');
    
    const message = "مرحبًا، معك فريق لِدجرا للمحاسبة السحابية. نرغب بالتواصل معك بخصوص تفعيل أو متابعة اشتراك منشأتك في منصة لِدجرا.";
    return {
      url: `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`,
      disabled: false,
      text: 'تواصل عبر واتساب'
    };
  };

  const resetFilters = () => {
    setStatusFilter('all');
    setSearchQuery('');
  };

  // Filter organizations based on search query and status tab
  const filteredOrgs = orgs.filter(o => {
    // Exact status match
    const matchesStatus = statusFilter === 'all' || o.subscription_status === statusFilter;

    // Search query matches
    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchesStatus;

    // Arabic translations of statuses for smart search
    const getStatusText = (status: string) => {
      switch(status) {
        case 'trial': return 'تجربة مجانية تجريبي trial';
        case 'active': return 'فعال نشط مفعّل active';
        case 'suspended': return 'موقوف معطل محجوب suspended';
        case 'past_due': return 'متأخر الدفع متراكم past_due';
        case 'cancelled': return 'ملغي خارج الخدمة cancelled';
        default: return '';
      }
    };

    const matchesSearch = 
      o.organization_name.toLowerCase().includes(q) ||
      (o.owner_name && o.owner_name.toLowerCase().includes(q)) ||
      (o.owner_email && o.owner_email.toLowerCase().includes(q)) ||
      (o.owner_phone && o.owner_phone.includes(q)) ||
      (o.plan_name && o.plan_name.toLowerCase().includes(q)) ||
      getStatusText(o.subscription_status).includes(q);

    return matchesStatus && matchesSearch;
  });

  // Calculate stats summary
  const totalOrgs = orgs.length;
  const activeSubs = orgs.filter(o => o.subscription_status === 'active').length;
  const trialSubs = orgs.filter(o => o.subscription_status === 'trial').length;
  const suspendedSubs = orgs.filter(o => o.subscription_status === 'suspended').length;
  
  // Need follow-up: expired trials, expired active subs, past due or cancelled
  const pendingFollowUp = orgs.filter(o => {
    if (o.subscription_status === 'past_due' || o.subscription_status === 'cancelled') return true;
    if (o.subscription_status === 'trial' && o.trial_ends_at && new Date(o.trial_ends_at) < new Date()) return true;
    if (o.subscription_status === 'active' && o.ends_at && new Date(o.ends_at) < new Date()) return true;
    return false;
  }).length;

  // Expires soon (Within the next 7 days in the future)
  const expiresSoon = orgs.filter(o => {
    const targetDateStr = o.subscription_status === 'trial' ? o.trial_ends_at : o.ends_at;
    if (!targetDateStr) return false;
    const expiryDate = new Date(targetDateStr);
    const now = new Date();
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  }).length;

  if (checkingAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans select-none" dir="rtl">
        <div className="space-y-4 text-center">
          <div className="relative w-12 h-12 mx-auto bg-slate-900 rounded-xl flex items-center justify-center shadow animate-pulse">
            <span className="text-white font-mono font-bold text-lg">L</span>
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-slate-800">جاري التحقق من الصلاحيات...</h4>
            <p className="text-[10px] text-slate-400 font-mono">LEDGRA PLATFORM CENTRAL ADMIN</p>
          </div>
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans select-none" dir="rtl" id="platform-unauthorized-view">
        <div className="w-full max-w-md bg-white border border-slate-200 p-8 rounded-3xl text-center space-y-6 shadow-sm">
          <div className="mx-auto w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center shadow-inner">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-black text-slate-900">غير مصرح بالوصول</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              غير مصرح لك بالوصول إلى لوحة إدارة المنصة. تواصل مع المطور أو مالك النظام لترقية حسابك لصلاحيات سوبر أدمن.
            </p>
          </div>
          <button
            onClick={() => window.location.hash = '#/'}
            className="w-full py-2.5 px-4 bg-brand-blue hover:bg-blue-600 text-white font-bold rounded-xl text-xs transition shadow-sm cursor-pointer"
          >
            العودة للوحة تحكم لِدجرا الرئيسية
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 font-sans text-right select-none space-y-8" dir="rtl" id="platform-admin-dashboard">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 left-6 z-[70] p-4 rounded-2xl shadow-lg border flex items-center gap-2.5 text-xs font-bold transition-all ${
          toast.type === 'success' 
            ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
            : 'bg-rose-50 border-rose-100 text-rose-800'
        }`} id="admin-dashboard-toast">
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <ShieldAlert className="w-4 h-4 text-rose-600" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div className="space-y-1.5">
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-slate-900 rounded-xl text-white">
              <Activity className="w-5 h-5" />
            </div>
            لوحة إدارة منصة لِدجرا
          </h1>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            متابعة إحصائيات المشتركين، تحكيم خطط الاشتراكات اليدوية وتوثيق التواصل المباشر.
          </p>
        </div>
        <button 
          onClick={loadData}
          disabled={loading}
          className="self-start px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>تحديث البيانات الحية</span>
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Card 1 */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400">إجمالي المؤسسات</span>
            <div className="bg-slate-100 p-1.5 rounded-lg text-slate-700">
              <Building className="w-4 h-4" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-slate-900">{totalOrgs}</h2>
          <p className="text-[10px] text-slate-400 font-medium">مؤسسة مسجلة بالكامل</p>
        </div>

        {/* Card 2 */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400">اشتراكات فعالة</span>
            <div className="bg-emerald-50 p-1.5 rounded-lg text-emerald-700">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-emerald-600">{activeSubs}</h2>
          <p className="text-[10px] text-slate-400 font-medium">نشطة وذات فوترة دورية</p>
        </div>

        {/* Card 3 */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400">تجارب مجانية</span>
            <div className="bg-blue-50 p-1.5 rounded-lg text-blue-700">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-blue-600">{trialSubs}</h2>
          <p className="text-[10px] text-slate-400 font-medium">تحت التجربة التجريبية</p>
        </div>

        {/* Card 4 */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400">موقوفة ومجمدة</span>
            <div className="bg-red-50 p-1.5 rounded-lg text-red-700">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-rose-600">{suspendedSubs}</h2>
          <p className="text-[10px] text-slate-400 font-medium">متوقفة وتحت الفحص</p>
        </div>

        {/* Card 5 */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400">تحتاج متابعة</span>
            <div className="bg-amber-50 p-1.5 rounded-lg text-amber-700">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-amber-600">{pendingFollowUp}</h2>
          <p className="text-[10px] text-slate-400 font-medium">منتهية أو متأخرة السداد</p>
        </div>

        {/* Card 6 - NEW: Expires within 7 days */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm space-y-2.5 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-brand-navy/30 rounded-full blur-xl pointer-events-none" />
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400">تنتهي خلال 7 أيام</span>
            <div className="bg-white/10 p-1.5 rounded-lg text-brand-turquoise">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-brand-turquoise">{expiresSoon}</h2>
          <p className="text-[10px] text-slate-300 font-medium">تجارب/اشتراكات تشارف الانتهاء</p>
        </div>
      </div>

      {/* Main Filter & Table Frame */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
        
        {/* Search & Tabs Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Status Tabs */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto self-start md:self-auto max-w-full">
            {[
              { id: 'all', label: 'الكل' },
              { id: 'trial', label: 'تجربة مجانية' },
              { id: 'active', label: 'فعال' },
              { id: 'past_due', label: 'متأخر' },
              { id: 'suspended', label: 'موقوف' },
              { id: 'cancelled', label: 'ملغي' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-150'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search bar & reset */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative w-full md:w-80">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="ابحث باسم المؤسسة، المالك، الجوال، الإيميل، الباقة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-950 transition text-right"
              />
            </div>

            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-3 py-2 bg-slate-50 text-slate-500 hover:bg-slate-100 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer border border-slate-200"
              >
                مسح البحث
              </button>
            )}
          </div>
        </div>

        {/* Main Content Render */}
        {loading ? (
          <div className="text-center py-16 flex flex-col items-center justify-center space-y-3">
            <span className="w-8 h-8 rounded-full border-4 border-slate-900 border-t-transparent animate-spin" />
            <span className="text-xs font-bold text-slate-500">جاري تحميل مؤسسات المنصة...</span>
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 text-center space-y-4">
            <div className="mx-auto w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h5 className="text-sm font-bold text-rose-900">تعذر تحميل البيانات</h5>
              <p className="text-xs text-rose-700">{error}</p>
            </div>
            <button
              onClick={loadData}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : orgs.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <Building className="w-12 h-12 text-slate-300 mx-auto" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-800">لا توجد مؤسسات مسجلة بعد.</h4>
              <p className="text-xs text-slate-400">ستظهر المؤسسات هنا فور اكتمال عمليات التسجيل بالمنصة.</p>
            </div>
          </div>
        ) : filteredOrgs.length === 0 ? (
          <div className="text-center py-16 space-y-4 border border-dashed border-slate-200 rounded-2xl">
            <SlidersHorizontal className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-800">
                {statusFilter !== 'all' ? 'لا توجد مؤسسات بالحالة المحددة.' : 'لا توجد مؤسسات مطابقة للبحث أو الفلتر المختار.'}
              </h4>
              <p className="text-xs text-slate-400">حاول تغيير قيمة البحث أو إعادة تعيين الفلاتر لعرض الكيانات.</p>
            </div>
            <button
              onClick={resetFilters}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition"
            >
              {statusFilter !== 'all' ? 'عرض كل المؤسسات' : 'إعادة ضبط الفلاتر'}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-100 rounded-2xl">
            <table className="w-full text-right border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                  <th className="py-3.5 px-4">اسم المؤسسة</th>
                  <th className="py-3.5 px-4">المالك</th>
                  <th className="py-3.5 px-4">بيانات الاتصال</th>
                  <th className="py-3.5 px-4">الباقة</th>
                  <th className="py-3.5 px-4">حالة الاشتراك</th>
                  <th className="py-3.5 px-4">تاريخ التسجيل</th>
                  <th className="py-3.5 px-4">نهاية التجربة / الاشتراك</th>
                  <th className="py-3.5 px-4 text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredOrgs.map((o) => {
                  const endsDate = o.subscription_status === 'trial' ? o.trial_ends_at : o.ends_at;
                  const isExpired = endsDate ? new Date(endsDate) < new Date() : false;
                  const wa = getWhatsAppLinkAndStatus(o.owner_phone);
                  
                  return (
                    <tr key={o.organization_id} className="hover:bg-slate-50/40 transition">
                      <td className="py-4 px-4 font-bold text-slate-900">
                        {o.organization_name}
                      </td>
                      <td className="py-4 px-4 font-bold text-slate-800">
                        {o.owner_name}
                      </td>
                      <td className="py-4 px-4 space-y-0.5 text-[11px] font-mono">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-600">{o.owner_email}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-600" style={{ direction: 'ltr' }}>{o.owner_phone}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                          {o.plan_name}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-tight border ${
                          o.subscription_status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                            : o.subscription_status === 'trial'
                            ? 'bg-blue-50 text-blue-700 border-blue-100'
                            : o.subscription_status === 'suspended'
                            ? 'bg-red-50 text-rose-700 border-rose-100'
                            : o.subscription_status === 'past_due'
                            ? 'bg-orange-50 text-orange-700 border-orange-100'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {o.subscription_status === 'trial' && 'تجربة مجانية'}
                          {o.subscription_status === 'active' && 'فعال'}
                          {o.subscription_status === 'past_due' && 'متأخر'}
                          {o.subscription_status === 'suspended' && 'موقوف'}
                          {o.subscription_status === 'cancelled' && 'ملغي'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-slate-500 font-mono text-[11px]">
                        {new Date(o.created_at).toLocaleDateString('ar-SA')}
                      </td>
                      <td className="py-4 px-4">
                        {endsDate ? (
                          <div className="space-y-0.5">
                            <span className="font-mono text-[11px] text-slate-600">
                              {new Date(endsDate).toLocaleDateString('ar-SA')}
                            </span>
                            {isExpired && (
                              <div className="text-[9px] font-extrabold text-rose-600 flex items-center gap-0.5">
                                <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                                <span>انتهى الوقت</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">مفتوح / يدوي</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-left">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenDetails(o.organization_id)}
                            className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-white font-bold text-[10px] rounded-lg transition shadow-xs cursor-pointer whitespace-nowrap"
                          >
                            عرض التفاصيل
                          </button>
                          
                          <a
                            href={wa.url}
                            target={wa.disabled ? undefined : "_blank"}
                            rel="noopener noreferrer"
                            className={`p-1.5 rounded-lg border transition shrink-0 ${
                              wa.disabled 
                                ? 'bg-slate-50 text-slate-300 border-slate-100 pointer-events-none' 
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
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

      {/* Detail / Edit Subscription Slide-over Drawer (Modern Left/Right Slide-over layout) */}
      {selectedOrgId && (
        <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
          <div className="absolute inset-0 overflow-hidden">
            {/* Backdrop element */}
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
                        إدارة ملف وتفاصيل المنشأة
                      </h2>
                      <p className="text-[10px] text-slate-500 font-semibold font-mono">
                        ID: {selectedOrgId}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedOrgId(null)}
                      className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Drawer Body */}
                  <div className="p-6 space-y-6 flex-1">
                    {loadingDetails ? (
                      <div className="text-center py-20 flex flex-col items-center justify-center space-y-3">
                        <span className="w-7 h-7 rounded-full border-4 border-slate-900 border-t-transparent animate-spin" />
                        <span className="text-xs font-bold text-slate-400">جاري سحب تفاصيل المنشأة وسجل العمليات الفائتة...</span>
                      </div>
                    ) : detailsError ? (
                      <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 text-xs font-bold text-rose-800 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-rose-600" />
                        <span>{detailsError}</span>
                      </div>
                    ) : details ? (
                      <div className="space-y-6">
                        
                        {/* Section 1: Active subscription badge and rapid edit state toggle */}
                        <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-4 shadow-xs relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-24 h-24 bg-brand-navy/60 rounded-full blur-2xl opacity-40 pointer-events-none" />
                          
                          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <h4 className="text-xs font-black text-slate-300 flex items-center gap-1.5">
                              <Package className="w-4 h-4 text-brand-turquoise" />
                              الاشتراك اليدوي الحالي
                            </h4>

                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                              details.subscription_status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : details.subscription_status === 'trial'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                : details.subscription_status === 'suspended'
                                ? 'bg-red-500/10 text-rose-400 border-rose-500/20'
                                : details.subscription_status === 'past_due'
                                ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {details.subscription_status === 'trial' && 'تجربة مجانية'}
                              {details.subscription_status === 'active' && 'فعال ونشط'}
                              {details.subscription_status === 'suspended' && 'موقوف ومجمد'}
                              {details.subscription_status === 'past_due' && 'متأخر الدفع'}
                              {details.subscription_status === 'cancelled' && 'ملغي'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-y-3.5 gap-x-4 text-xs">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-slate-400 text-[10px]">الباقة الحالية</span>
                              <span className="font-bold text-white">{details.plan_name_ar || 'تجريبية'}</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-slate-400 text-[10px]">دورة الفوترة</span>
                              <span className="font-bold text-white">
                                {details.billing_cycle === 'monthly' && 'شهري'}
                                {details.billing_cycle === 'yearly' && 'سنوي'}
                                {details.billing_cycle === 'manual' && 'يدوي بالاتفاق'}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5 font-mono">
                              <span className="text-slate-400 text-[10px] font-sans">تاريخ بدء الاشتراك</span>
                              <span className="text-slate-200">{details.starts_at ? new Date(details.starts_at).toLocaleDateString('ar-SA') : 'غير محدد'}</span>
                            </div>
                            <div className="flex flex-col gap-0.5 font-mono">
                              <span className="text-slate-400 text-[10px] font-sans">تاريخ انتهاء الاشتراك</span>
                              <span className="text-slate-200">{details.ends_at ? new Date(details.ends_at).toLocaleDateString('ar-SA') : 'مفتوح / يدوي'}</span>
                            </div>
                            <div className="flex flex-col gap-0.5 font-mono col-span-2">
                              <span className="text-slate-400 text-[10px] font-sans">تاريخ نهاية التجربة المجانية</span>
                              <span className="text-slate-200">{details.trial_ends_at ? new Date(details.trial_ends_at).toLocaleDateString('ar-SA') : 'غير محدد'}</span>
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

                        {/* Section 2: Edit subscription Form (renders in place if toggled) */}
                        {isEditing && (
                          <form onSubmit={handleUpdateSubscriptionClick} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                              <h4 className="text-xs font-black text-slate-950 flex items-center gap-1.5">
                                <PlusCircle className="w-4 h-4 text-brand-blue" />
                                تعديل الاشتراك اليدوي
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
                                    <option key={p.id} value={p.id}>{p.name_ar} ({p.price_monthly} ريال/شهرياً)</option>
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
                                  <option value="manual">يدوي بالاتفاق</option>
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 block">تاريخ بداية التفعيل:</label>
                                <input
                                  type="date"
                                  value={editForm.startsAt}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, startsAt: e.target.value }))}
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-1 focus:ring-slate-900 text-right font-mono"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 block">تاريخ نهاية التفعيل:</label>
                                <input
                                  type="date"
                                  value={editForm.endsAt}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, endsAt: e.target.value }))}
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-1 focus:ring-slate-900 text-right font-mono"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 block">تاريخ نهاية التجربة:</label>
                                <input
                                  type="date"
                                  value={editForm.trialEndsAt}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, trialEndsAt: e.target.value }))}
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-1 focus:ring-slate-900 text-right font-mono"
                                />
                              </div>

                              <div className="space-y-1 col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 block">ملاحظة التفعيل الداخلي / السبب (مطلوب):</label>
                                <textarea
                                  rows={2}
                                  placeholder="مثال: تم تأكيد السداد البنكي رقم #1234 - أو تمديد تجربة العميل 14 يوم..."
                                  value={editForm.note}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, note: e.target.value }))}
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-1 focus:ring-slate-900 text-right leading-relaxed"
                                  required
                                />
                              </div>
                            </div>

                            <div className="flex gap-2 pt-2">
                              <button
                                type="submit"
                                className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <Save className="w-3.5 h-3.5" />
                                <span>حفظ وتأمين الاشتراك</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsEditing(false)}
                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                              >
                                إلغاء
                              </button>
                            </div>
                          </form>
                        )}

                        {/* Section 3: General Corporate Profile */}
                        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 space-y-4">
                          <h4 className="text-xs font-black text-slate-950 border-b border-slate-200/50 pb-2 flex items-center gap-1.5">
                            <Building className="w-4 h-4 text-slate-500" />
                            بيانات الكيان والمؤسسة
                          </h4>

                          <div className="grid grid-cols-2 gap-y-3.5 gap-x-4 text-xs">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-slate-400 text-[10px]">الاسم العربي</span>
                              <span className="font-bold text-slate-900">{details.organization_name_ar || 'غير محدد'}</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-slate-400 text-[10px]">الاسم الإنجليزي</span>
                              <span className="font-bold text-slate-900">{details.organization_name_en || 'غير محدد'}</span>
                            </div>
                            <div className="flex flex-col gap-0.5 font-mono">
                              <span className="text-slate-400 text-[10px] font-sans">الرقم الضريبي (VAT)</span>
                              <span className="font-bold text-slate-900">{details.vat_number || 'غير محدد'}</span>
                            </div>
                            <div className="flex flex-col gap-0.5 font-mono">
                              <span className="text-slate-400 text-[10px] font-sans">السجل التجاري (CR)</span>
                              <span className="font-bold text-slate-900">{details.cr_number || 'غير محدد'}</span>
                            </div>
                            <div className="flex flex-col gap-0.5 font-mono">
                              <span className="text-slate-400 text-[10px] font-sans">عدد مستخدمي المنشأة</span>
                              <span className="font-bold text-slate-900">{orgs.find(o => o.organization_id === selectedOrgId)?.users_count || 0} مستخدم</span>
                            </div>
                            <div className="flex flex-col gap-0.5 font-mono">
                              <span className="text-slate-400 text-[10px] font-sans">عدد الفواتير المصدرة</span>
                              <span className="font-bold text-slate-900">{orgs.find(o => o.organization_id === selectedOrgId)?.invoices_count || 0} فاتورة</span>
                            </div>
                            <div className="flex flex-col gap-0.5 font-mono col-span-2">
                              <span className="text-slate-400 text-[10px] font-sans">تاريخ الانضمام للمنصة</span>
                              <span className="text-slate-700">{new Date(details.created_at).toLocaleString('ar-SA')}</span>
                            </div>
                          </div>
                        </div>

                        {/* Section 4: Owner Information */}
                        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 space-y-4">
                          <h4 className="text-xs font-black text-slate-950 border-b border-slate-200/50 pb-2 flex items-center gap-1.5">
                            <User className="w-4 h-4 text-slate-500" />
                            بيانات المالك والاتصال
                          </h4>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-slate-400 text-[10px]">اسم المالك</span>
                              <span className="font-bold text-slate-900">{details.owner_name}</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-slate-400 text-[10px]">البريد الإلكتروني للكيان</span>
                              <span className="font-bold text-slate-900 font-mono">{details.email || details.owner_email}</span>
                            </div>
                            <div className="flex flex-col gap-0.5 col-span-2">
                              <span className="text-slate-400 text-[10px]">جوال التواصل</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="font-bold text-slate-900 font-mono" style={{ direction: 'ltr' }}>{details.owner_phone}</span>
                                {getWhatsAppLinkAndStatus(details.owner_phone).disabled === false && (
                                  <a
                                    href={getWhatsAppLinkAndStatus(details.owner_phone).url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-extrabold border border-emerald-200 flex items-center gap-1 transition shrink-0"
                                  >
                                    <MessageCircle className="w-3 h-3" />
                                    <span>مراسلة واتساب</span>
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Section 5: Subscription Event Logs */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black text-slate-950 flex items-center gap-1.5">
                              <Notebook className="w-4 h-4 text-slate-500" />
                              سجل الفوترة والتعليقات الداخلية
                            </h4>
                            <button
                              onClick={() => setShowNoteModal(true)}
                              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] rounded-lg transition shadow-xs cursor-pointer"
                            >
                              إضافة ملاحظة داخلية
                            </button>
                          </div>

                          <div className="border border-slate-150 rounded-2xl max-h-64 overflow-y-auto divide-y divide-slate-100 bg-white">
                            {events.length === 0 ? (
                              <div className="text-center py-10 text-xs font-medium text-slate-400">لا يوجد حركات فوترة مسجلة لهذه المنشأة.</div>
                            ) : (
                              events.map((ev) => (
                                <div key={ev.id} className="p-3.5 text-xs leading-relaxed hover:bg-slate-50/50 transition">
                                  <div className="flex justify-between items-center gap-2 mb-1.5">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                                      ev.event_type === 'activated'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                        : ev.event_type === 'suspended'
                                        ? 'bg-amber-50 text-amber-700 border-amber-100'
                                        : ev.event_type === 'cancelled'
                                        ? 'bg-rose-50 text-rose-700 border-rose-100'
                                        : ev.event_type === 'plan_changed'
                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                        : 'bg-slate-50 text-slate-700 border-slate-150'
                                    }`}>
                                      {ev.event_type === 'created' && 'تأسيس الاشتراك'}
                                      {ev.event_type === 'plan_changed' && 'تغيير الباقة'}
                                      {ev.event_type === 'activated' && 'تفعيل'}
                                      {ev.event_type === 'suspended' && 'إيقاف مؤقت'}
                                      {ev.event_type === 'cancelled' && 'إلغاء الاشتراك'}
                                      {ev.event_type === 'trial_extended' && 'تمديد التجربة'}
                                      {ev.event_type === 'note_added' && 'إضافة ملاحظة'}
                                    </span>
                                    <span className="font-mono text-[10px] text-slate-400">
                                      {new Date(ev.created_at).toLocaleString('ar-SA')}
                                    </span>
                                  </div>
                                  {ev.note && <p className="text-slate-600 font-bold pl-1">{ev.note}</p>}
                                  {(ev.old_status || ev.new_status) && ev.event_type !== 'note_added' && (
                                    <div className="text-[10px] text-slate-400 font-mono mt-1">
                                      تحديث الحالة: {ev.old_status || 'البداية'} ← {ev.new_status}
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                      </div>
                    ) : null}
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal Box on manual change */}
      {showConfirmUpdate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[60] p-4" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl text-right font-sans">
            <div className="flex items-center gap-2.5 text-amber-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-black text-slate-900">تأكيد تعديل باقة الاشتراك</h4>
            </div>
            
            <p className="text-xs text-slate-600 leading-relaxed">
              يرجى تأكيد رغبتك في تعديل قيم الاشتراك للكيان المحدد بالمعلومات والتواريخ الآتية:
            </p>

            <div className="p-4 bg-amber-50 border-r-4 border-amber-500 rounded-xl text-xs text-slate-800 space-y-2 font-medium leading-relaxed">
              <p>المؤسسة المستهدفة: <span className="font-black text-slate-950">{details?.organization_name_ar || details?.organization_name_en || orgs.find(o => o.organization_id === selectedOrgId)?.organization_name}</span></p>
              <p>الباقة الجديدة: <span className="font-black text-slate-950">{plans.find(p => p.id === editForm.planId)?.name_ar || editForm.planId}</span></p>
              <p>حالة الاشتراك الجديدة: <span className="font-black text-slate-950">{
                editForm.status === 'trial' ? 'تجربة مجانية' :
                editForm.status === 'active' ? 'فعال ونشط' :
                editForm.status === 'past_due' ? 'متأخر الدفع' :
                editForm.status === 'suspended' ? 'موقوف ومجمد' : 'ملغي بالكامل'
              }</span></p>
              <p>دورة الفوترة: <span className="font-black text-slate-950">{
                editForm.billingCycle === 'monthly' ? 'شهري' :
                editForm.billingCycle === 'yearly' ? 'سنوي' : 'يدوي بالاتفاق'
              }</span></p>
              <p>ملاحظة التفعيل: <span className="italic text-slate-700 font-bold block mt-1">"{editForm.note}"</span></p>
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={confirmUpdateSubscription}
                disabled={submittingSubscription}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-xs transition cursor-pointer flex items-center justify-center"
              >
                {submittingSubscription ? 'جاري الحفظ...' : 'تأكيد وترقية الاشتراك'}
              </button>
              <button
                onClick={() => setShowConfirmUpdate(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Internal Note Modal Drawer option */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[60] p-4" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl text-right font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="text-sm font-black text-slate-900">كتابة ملاحظة داخلية جديدة</h4>
              <button onClick={() => setShowNoteModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddNote} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400">الملاحظة الداخلية (لا تظهر للعميل):</label>
                <textarea
                  rows={4}
                  placeholder="اكتب ملاحظة فوترة دورية، تفاصيل اتفاق مالي، أو مرجع حوالة يدوية هنا..."
                  value={addNoteText}
                  onChange={(e) => setAddNoteText(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 text-right leading-relaxed text-xs"
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submittingNote || !addNoteText.trim()}
                  className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-black rounded-xl text-xs transition cursor-pointer"
                >
                  {submittingNote ? 'جاري الحفظ...' : 'حفظ الملاحظة'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNoteModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  إلغاء
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
