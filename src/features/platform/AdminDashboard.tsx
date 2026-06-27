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
  Notebook
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modal states
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
  const [submittingSubscription, setSubmittingSubscription] = useState<boolean>(false);
  const [addNoteText, setAddNoteText] = useState<string>('');
  const [submittingNote, setSubmittingNote] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Verify platform admin on load
  useEffect(() => {
    async function checkAdminRole() {
      try {
        setCheckingAdmin(true);
        const adminCheck = await platformService.isPlatformAdmin();
        setIsAdmin(adminCheck);
        if (adminCheck) {
          // If is admin, fetch data
          await loadData();
        }
      } catch (err) {
        console.error('Failed to verify platform admin status:', err);
        setIsAdmin(false);
      } finally {
        setCheckingAdmin(false);
      }
    }
    checkAdminRole();
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
      setError(err?.message || 'فشل في تحميل بيانات إدارة المنصة.');
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
        note: orgDetails.internal_notes || ''
      });
    } catch (err: any) {
      console.error('Error opening organization details:', err);
      setDetailsError(err?.message || 'فشل في تحميل تفاصيل المنشأة.');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleUpdateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
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
        note: editForm.note
      });

      showToast('تم تحديث الاشتراك بنجاح وتسجيل العملية.', 'success');
      setIsEditing(false);
      
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
      showToast(err?.message || 'فشل في تحديث الاشتراك.', 'error');
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
      showToast('تم إضافة الملاحظة بنجاح.', 'success');
      setAddNoteText('');

      // Refresh events
      const updatedEvents = await platformService.getSubscriptionEvents(selectedOrgId);
      setEvents(updatedEvents);
    } catch (err: any) {
      console.error('Failed to add note:', err);
      showToast(err?.message || 'فشل في إضافة الملاحظة.', 'error');
    } finally {
      setSubmittingNote(false);
    }
  };

  // Helper: Format phone number into WhatsApp standard
  const getWhatsAppLink = (phone: string | null) => {
    if (!phone) return '#';
    
    // Clean symbols, spaces, dashes
    let cleaned = phone.replace(/[^\d+]/g, '');
    
    // Convert local zero-start numbers to Saudi country code
    if (cleaned.startsWith('05')) {
      cleaned = '9665' + cleaned.substring(2);
    } else if (cleaned.startsWith('5')) {
      cleaned = '966' + cleaned;
    } else if (cleaned.startsWith('+966')) {
      cleaned = '966' + cleaned.substring(4);
    }
    
    const message = "مرحبًا، معك فريق لِدجرا للمحاسبة السحابية. نرغب بالتواصل معك بخصوص تفعيل أو متابعة اشتراك منشأتك في منصة لِدجرا.";
    return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
  };

  // Filter organizations based on search query and status tab
  const filteredOrgs = orgs.filter(o => {
    const matchesSearch = 
      o.organization_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.owner_name && o.owner_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (o.owner_email && o.owner_email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (o.owner_phone && o.owner_phone.includes(searchQuery));

    const matchesStatus = 
      statusFilter === 'all' || 
      o.subscription_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Calculate stats summary
  const totalOrgs = orgs.length;
  const activeSubs = orgs.filter(o => o.subscription_status === 'active').length;
  const trialSubs = orgs.filter(o => o.subscription_status === 'trial').length;
  const suspendedSubs = orgs.filter(o => o.subscription_status === 'suspended').length;
  const pendingFollowUp = orgs.filter(o => {
    if (o.subscription_status === 'past_due' || o.subscription_status === 'cancelled') return true;
    // Expired free trials
    if (o.subscription_status === 'trial' && o.trial_ends_at && new Date(o.trial_ends_at) < new Date()) return true;
    // Expired subscriptions
    if (o.subscription_status === 'active' && o.ends_at && new Date(o.ends_at) < new Date()) return true;
    return false;
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
            <p className="text-[10px] text-slate-400">لوحة الإدارة المركزية لمنصة لِدجرا</p>
          </div>
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans select-none" dir="rtl">
        <div className="w-full max-w-md bg-white border border-slate-200 p-8 rounded-3xl text-center space-y-4 shadow-sm">
          <div className="mx-auto w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-black text-slate-900">غير مصرح بالوصول</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            غير مصرح لك بالوصول إلى لوحة إدارة المنصة. تواصل مع مالك النظام للحصول على صلاحيات Super Admin.
          </p>
          <a href="/" className="inline-block mt-2 text-xs font-extrabold text-brand-blue hover:underline">
            العودة للوحة تحكم لِدجرا الرئيسية
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 font-sans text-right select-none space-y-8" dir="rtl">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 left-6 z-50 p-4 rounded-2xl shadow-lg border flex items-center gap-2 text-xs font-bold transition-all ${
          toast.type === 'success' 
            ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
            : 'bg-rose-50 border-rose-100 text-rose-800'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <ShieldAlert className="w-4 h-4 text-rose-600" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <div className="p-1.5 bg-slate-900 rounded-xl text-white">
              <Activity className="w-5 h-5" />
            </div>
            لوحة إدارة منصة لِدجرا
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            إدارة المؤسسات والاشتراكات اليدوية والتواصل مع العملاء.
          </p>
        </div>
        <button 
          onClick={loadData}
          className="self-start px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs rounded-xl transition shadow-sm cursor-pointer"
        >
          تحديث البيانات الحية
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1 */}
        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400">إجمالي المؤسسات</span>
            <div className="bg-slate-50 p-1.5 rounded-lg text-slate-700">
              <Building className="w-4 h-4" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-slate-900">{totalOrgs}</h2>
          <p className="text-[10px] text-slate-400 font-medium">مسجلة بالكامل</p>
        </div>

        {/* Card 2 */}
        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400">اشتراكات فعالة</span>
            <div className="bg-emerald-50 p-1.5 rounded-lg text-emerald-700">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-emerald-700">{activeSubs}</h2>
          <p className="text-[10px] text-slate-400 font-medium">اشتراكات مفعلة يدويًا</p>
        </div>

        {/* Card 3 */}
        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400">فترات تجريبية</span>
            <div className="bg-blue-50 p-1.5 rounded-lg text-blue-700">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-blue-700">{trialSubs}</h2>
          <p className="text-[10px] text-slate-400 font-medium">تحت التجربة المجانية</p>
        </div>

        {/* Card 4 */}
        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400">موقوفة</span>
            <div className="bg-amber-50 p-1.5 rounded-lg text-amber-700">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-amber-600">{suspendedSubs}</h2>
          <p className="text-[10px] text-slate-400 font-medium">موقوفة ومحجوبة الصلاحيات</p>
        </div>

        {/* Card 5 */}
        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400">تحتاج متابعة</span>
            <div className="bg-rose-50 p-1.5 rounded-lg text-rose-700">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-rose-600">{pendingFollowUp}</h2>
          <p className="text-[10px] text-slate-400 font-medium">منتهية وتحتاج اتصال فوري</p>
        </div>
      </div>

      {/* Main Filter & Table Frame */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
        
        {/* Search & Tabs Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Status Tabs */}
          <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl overflow-x-auto self-start md:self-auto">
            {[
              { id: 'all', label: 'الكل' },
              { id: 'trial', label: 'تجريبي' },
              { id: 'active', label: 'فعال' },
              { id: 'suspended', label: 'موقوف' },
              { id: 'past_due', label: 'متأخر' },
              { id: 'cancelled', label: 'ملغي' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative w-full md:w-80">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="ابحث باسم المؤسسة، المالك، الجوال..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 transition leading-relaxed text-right"
            />
          </div>
        </div>

        {/* Main Table */}
        {loading ? (
          <div className="text-center py-12 text-xs font-bold text-slate-400">جاري سحب بيانات المشتركين...</div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 text-xs font-bold text-rose-800 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <span>{error}</span>
          </div>
        ) : filteredOrgs.length === 0 ? (
          <div className="text-center py-12 text-xs font-medium text-slate-400">لا يوجد أي منشآت مطابقة للبحث أو الفلتر المختار.</div>
        ) : (
          <div className="overflow-x-auto border border-slate-100 rounded-2xl">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                  <th className="py-3 px-4">اسم المؤسسة</th>
                  <th className="py-3 px-4">المالك</th>
                  <th className="py-3 px-4">بيانات الاتصال</th>
                  <th className="py-3 px-4">الباقة الحالية</th>
                  <th className="py-3 px-4">الحالة</th>
                  <th className="py-3 px-4 text-center">المستخدمين / الفواتير</th>
                  <th className="py-3 px-4">نهاية الاشتراك</th>
                  <th className="py-3 px-4 text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredOrgs.map((o) => {
                  const endsDate = o.subscription_status === 'trial' ? o.trial_ends_at : o.ends_at;
                  const isExpired = endsDate ? new Date(endsDate) < new Date() : false;
                  
                  return (
                    <tr key={o.organization_id} className="hover:bg-slate-50/50 transition">
                      <td className="py-4 px-4 font-bold text-slate-900">
                        {o.organization_name}
                      </td>
                      <td className="py-4 px-4 font-bold">
                        {o.owner_name}
                      </td>
                      <td className="py-4 px-4 space-y-0.5 text-[11px] font-mono">
                        <div className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{o.owner_email}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span style={{ direction: 'ltr' }}>{o.owner_phone}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
                          {o.plan_name}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-tight ${
                          o.subscription_status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : o.subscription_status === 'trial'
                            ? 'bg-blue-50 text-blue-700 border border-blue-100'
                            : o.subscription_status === 'suspended'
                            ? 'bg-amber-50 text-amber-700 border border-amber-100'
                            : 'bg-rose-50 text-rose-700 border border-rose-100'
                        }`}>
                          {o.subscription_status === 'active' && 'فعال'}
                          {o.subscription_status === 'trial' && 'تجريبي'}
                          {o.subscription_status === 'suspended' && 'موقوف'}
                          {o.subscription_status === 'past_due' && 'متأخر الدفع'}
                          {o.subscription_status === 'cancelled' && 'ملغي'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center font-mono text-[11px]">
                        {o.users_count} مستخدم / {o.invoices_count} فاتورة
                      </td>
                      <td className="py-4 px-4">
                        {endsDate ? (
                          <div className="space-y-0.5">
                            <span className="font-mono text-[11px]">
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
                          {/* Details Button */}
                          <button
                            onClick={() => handleOpenDetails(o.organization_id)}
                            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[10px] rounded-lg transition shadow-sm cursor-pointer"
                          >
                            عرض وإدارة
                          </button>
                          
                          {/* WhatsApp Chat Button */}
                          {o.owner_phone && o.owner_phone !== 'غير محدد' && (
                            <a
                              href={getWhatsAppLink(o.owner_phone)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition shrink-0"
                              title="فتح واتساب العميل"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </a>
                          )}
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

      {/* Detail / Edit Subscription Modal Panel */}
      {selectedOrgId && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col text-right">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="space-y-1">
                <h3 className="text-base font-black text-slate-900">
                  تفاصيل المنشأة والاشتراك اليدوي
                </h3>
                <p className="text-[10px] text-slate-500 font-medium">
                  مراجعة الحساب الحركي، تعديل الباقة والمدد، أو تدوين ملاحظات الفوترة.
                </p>
              </div>
              <button
                onClick={() => setSelectedOrgId(null)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {loadingDetails ? (
                <div className="text-center py-12 text-xs font-bold text-slate-400">جاري سحب تفاصيل المنشأة وحركات الفوترة...</div>
              ) : detailsError ? (
                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 text-xs font-bold text-rose-800 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  <span>{detailsError}</span>
                </div>
              ) : details ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Left block: General Information card & Notes log */}
                  <div className="lg:col-span-2 space-y-6">
                    
                    {/* General info Card */}
                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-4">
                      <h4 className="text-xs font-black text-slate-950 border-b border-slate-200/60 pb-2 flex items-center gap-1.5">
                        <Building className="w-4 h-4 text-slate-500" />
                        بيانات الكيان المحاسبي
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400">اسم المنشأة العربي:</span>
                          <p className="font-bold text-slate-900">{details.organization_name_ar || 'غير محدد'}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400">اسم المنشأة الإنجليزي:</span>
                          <p className="font-bold text-slate-900">{details.organization_name_en || 'غير محدد'}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400">الرقم الضريبي (VAT):</span>
                          <p className="font-mono font-bold text-slate-900">{details.vat_number || 'غير محدد'}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400">السجل التجاري (CR):</span>
                          <p className="font-mono font-bold text-slate-900">{details.cr_number || 'غير محدد'}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400">مالك المؤسسة:</span>
                          <p className="font-bold text-slate-900">{details.owner_name}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400">جوال المالك:</span>
                          <p className="font-mono font-bold text-slate-900" style={{ direction: 'ltr', textAlign: 'right' }}>{details.owner_phone}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400">البريد الإلكتروني للكيان:</span>
                          <p className="font-mono text-slate-900">{details.email || details.owner_email}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400">تاريخ التسجيل بالمنصة:</span>
                          <p className="font-mono text-slate-900">{new Date(details.created_at).toLocaleString('ar-SA')}</p>
                        </div>
                      </div>
                    </div>

                    {/* Subscription events log */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-slate-950 flex items-center gap-1.5">
                        <Notebook className="w-4 h-4 text-slate-500" />
                        سجل التغييرات وملاحظات الفوترة
                      </h4>

                      {/* Add note inline form */}
                      <form onSubmit={handleAddNote} className="flex gap-2">
                        <input
                          type="text"
                          placeholder="اكتب ملاحظة فوترة جديدة داخلية..."
                          value={addNoteText}
                          onChange={(e) => setAddNoteText(e.target.value)}
                          className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 transition text-right"
                        />
                        <button
                          type="submit"
                          disabled={submittingNote || !addNoteText.trim()}
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition cursor-pointer"
                        >
                          {submittingNote ? 'جاري الحفظ...' : 'إضافة ملاحظة'}
                        </button>
                      </form>

                      {/* Events list */}
                      <div className="border border-slate-100 rounded-2xl max-h-56 overflow-y-auto divide-y divide-slate-100 bg-white">
                        {events.length === 0 ? (
                          <div className="text-center py-8 text-xs font-medium text-slate-400">لا يوجد حركات فوترة مسجلة حتى الآن.</div>
                        ) : (
                          events.map((ev) => (
                            <div key={ev.id} className="p-3 text-xs leading-relaxed hover:bg-slate-50/50 transition">
                              <div className="flex justify-between items-center gap-2 mb-1">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  ev.event_type === 'activated'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : ev.event_type === 'suspended'
                                    ? 'bg-amber-50 text-amber-700'
                                    : ev.event_type === 'cancelled'
                                    ? 'bg-rose-50 text-rose-700'
                                    : ev.event_type === 'plan_changed'
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {ev.event_type === 'created' && 'تأسيس الاشتراك'}
                                  {ev.event_type === 'plan_changed' && 'تغيير الباقة'}
                                  {ev.event_type === 'activated' && 'تفعيل'}
                                  {ev.event_type === 'suspended' && 'إيقاف مؤقت'}
                                  {ev.event_type === 'cancelled' && 'إلغاء الاشتراك'}
                                  {ev.event_type === 'trial_extended' && 'تمديد التجربة'}
                                  {ev.event_type === 'note_added' && 'إضافة ملاحظة فوترة'}
                                </span>
                                <span className="font-mono text-[10px] text-slate-400">
                                  {new Date(ev.created_at).toLocaleString('ar-SA')}
                                </span>
                              </div>
                              {ev.note && <p className="text-slate-600 font-medium pl-1">{ev.note}</p>}
                              {(ev.old_status || ev.new_status) && ev.event_type !== 'note_added' && (
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  تغيير الحالة: {ev.old_status || 'البداية'} ← {ev.new_status}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right block: Billing Controls or Form */}
                  <div className="space-y-4">
                    
                    {/* Active Subscription State display */}
                    {!isEditing ? (
                      <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 space-y-4 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-32 h-32 bg-slate-800 rounded-full blur-2xl opacity-40 pointer-events-none" />
                        
                        <h4 className="text-xs font-black text-slate-300 border-b border-slate-800 pb-2 flex items-center gap-1.5">
                          <Package className="w-4 h-4 text-brand-turquoise" />
                          حالة الاشتراك الحالية
                        </h4>

                        <div className="space-y-3.5 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">الباقة النشطة:</span>
                            <span className="font-black text-white text-[13px] bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-700">
                              {details.plan_name_ar || 'تجريبية'}
                            </span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">حالة الاشتراك:</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              details.subscription_status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : details.subscription_status === 'trial'
                                ? 'bg-blue-500/10 text-blue-400'
                                : details.subscription_status === 'suspended'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-rose-500/10 text-rose-400'
                            }`}>
                              {details.subscription_status === 'active' && 'فعال'}
                              {details.subscription_status === 'trial' && 'تجريبي'}
                              {details.subscription_status === 'suspended' && 'موقوف'}
                              {details.subscription_status === 'past_due' && 'متأخر'}
                              {details.subscription_status === 'cancelled' && 'ملغي'}
                            </span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">دورة الفوترة:</span>
                            <span className="font-bold">
                              {details.billing_cycle === 'monthly' && 'شهري'}
                              {details.billing_cycle === 'yearly' && 'سنوي'}
                              {details.billing_cycle === 'manual' && 'يدوي بالاتفاق'}
                            </span>
                          </div>

                          <div className="flex justify-between items-center font-mono">
                            <span className="text-slate-400 font-sans">بدء الفوترة:</span>
                            <span>{details.starts_at ? new Date(details.starts_at).toLocaleDateString('ar-SA') : 'غير محدد'}</span>
                          </div>

                          <div className="flex justify-between items-center font-mono">
                            <span className="text-slate-400 font-sans">انتهاء الفوترة:</span>
                            <span>{details.ends_at ? new Date(details.ends_at).toLocaleDateString('ar-SA') : 'غير محدد'}</span>
                          </div>

                          <div className="flex justify-between items-center font-mono">
                            <span className="text-slate-400 font-sans">نهاية الفترة التجريبية:</span>
                            <span>{details.trial_ends_at ? new Date(details.trial_ends_at).toLocaleDateString('ar-SA') : 'غير محدد'}</span>
                          </div>

                          {details.internal_notes && (
                            <div className="border-t border-slate-800 pt-2.5 space-y-1">
                              <span className="text-[10px] text-slate-400">ملاحظات التفعيل اليدوي:</span>
                              <p className="text-[11px] text-slate-300 leading-relaxed font-medium bg-slate-850 p-2 rounded-lg border border-slate-800/80">
                                {details.internal_notes}
                              </p>
                            </div>
                          )}

                          <button
                            onClick={() => setIsEditing(true)}
                            className="w-full py-2 bg-white text-slate-900 hover:bg-slate-100 font-black text-xs rounded-xl transition cursor-pointer"
                          >
                            تعديل الاشتراك يدوياً
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Edit Subscription Form */
                      <form onSubmit={handleUpdateSubscription} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                        <h4 className="text-xs font-black text-slate-900 border-b border-slate-200 pb-2 flex items-center justify-between">
                          <span>تعديل قيم الاشتراك</span>
                          <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="text-[10px] text-slate-400 hover:text-slate-600"
                          >
                            إلغاء التعديل
                          </button>
                        </h4>

                        <div className="space-y-3.5 text-xs">
                          {/* Choose Plan */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 block">اختيار الباقة:</label>
                            <select
                              value={editForm.planId}
                              onChange={(e) => setEditForm(prev => ({ ...prev, planId: e.target.value }))}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
                              required
                            >
                              <option value="">-- اختر باقة --</option>
                              {plans.map(p => (
                                <option key={p.id} value={p.id}>{p.name_ar} (Monthly: {p.price_monthly} SAR)</option>
                              ))}
                            </select>
                          </div>

                          {/* Choose Status */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 block">حالة الاشتراك:</label>
                            <select
                              value={editForm.status}
                              onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value as any }))}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
                              required
                            >
                              <option value="trial">تجريبي (trial)</option>
                              <option value="active">فعال ونشط (active)</option>
                              <option value="suspended">موقوف مؤقتاً (suspended)</option>
                              <option value="past_due">متأخر الدفع (past_due)</option>
                              <option value="cancelled">ملغي بالكامل (cancelled)</option>
                            </select>
                          </div>

                          {/* Choose Billing Cycle */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 block">دورة الفوترة:</label>
                            <select
                              value={editForm.billingCycle}
                              onChange={(e) => setEditForm(prev => ({ ...prev, billingCycle: e.target.value as any }))}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none"
                              required
                            >
                              <option value="monthly">شهري</option>
                              <option value="yearly">سنوي</option>
                              <option value="manual">يدوي بالاتفاق</option>
                            </select>
                          </div>

                          {/* Starts At Date */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 block">تاريخ بداية التفعيل:</label>
                            <input
                              type="date"
                              value={editForm.startsAt}
                              onChange={(e) => setEditForm(prev => ({ ...prev, startsAt: e.target.value }))}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium focus:outline-none text-right"
                            />
                          </div>

                          {/* Ends At Date */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 block">تاريخ نهاية التفعيل:</label>
                            <input
                              type="date"
                              value={editForm.endsAt}
                              onChange={(e) => setEditForm(prev => ({ ...prev, endsAt: e.target.value }))}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium focus:outline-none text-right"
                            />
                          </div>

                          {/* Trial Ends At Date */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 block">تاريخ نهاية التجربة:</label>
                            <input
                              type="date"
                              value={editForm.trialEndsAt}
                              onChange={(e) => setEditForm(prev => ({ ...prev, trialEndsAt: e.target.value }))}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium focus:outline-none text-right"
                            />
                          </div>

                          {/* Internal note input */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 block">ملاحظة التفعيل الداخلي / السبب:</label>
                            <textarea
                              rows={3}
                              placeholder="اكتب سبب تفعيل الباقة يدوياً، مرجع الحوالة البنكية، إلخ..."
                              value={editForm.note}
                              onChange={(e) => setEditForm(prev => ({ ...prev, note: e.target.value }))}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium focus:outline-none leading-relaxed text-right"
                              required
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={submittingSubscription}
                            className="w-full py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{submittingSubscription ? 'جاري حفظ التغييرات...' : 'حفظ وتأمين الاشتراك'}</span>
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                </div>
              ) : null}
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
