import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n/translations';
import { supabase } from '../../lib/supabase';
import { 
  Building, 
  Users, 
  MapPin, 
  ShieldAlert, 
  Plus, 
  Building2,
  Mail,
  UserCheck,
  AlertCircle
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { currentOrg, profile, roleInCurrentOrg } = useAuth();
  const { t } = useTranslation('ar');
  const [activeTab, setActiveTab] = useState<'info' | 'users' | 'branches'>('info');

  // Real Database state lists
  const [branches, setBranches] = useState<any[]>([]);
  const [membersList, setMembersList] = useState<any[]>([]);
  const [loadingBranches, setLoadingBranches] = useState<boolean>(true);
  const [loadingMembers, setLoadingMembers] = useState<boolean>(true);

  // Forms statuses
  const [newBranchSuccess, setNewBranchSuccess] = useState<string | null>(null);
  const [newBranchError, setNewBranchError] = useState<string | null>(null);
  const [submittingBranch, setSubmittingBranch] = useState<boolean>(false);

  // Fetch Branches from Supabase
  const loadBranches = async () => {
    if (!currentOrg) return;
    setLoadingBranches(true);
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('is_main', { ascending: false });

      if (!error && data) {
        setBranches(data);
      }
    } catch (e) {
      console.error('Error loading branches:', e);
    } finally {
      setLoadingBranches(false);
    }
  };

  // Fetch Members from Supabase
  const loadMembers = async () => {
    if (!currentOrg) return;
    setLoadingMembers(true);
    try {
      // Use standard join to pull member role + profile details
      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          id,
          role,
          profiles:profile_id (
            id,
            full_name,
            phone
          )
        `)
        .eq('organization_id', currentOrg.id);

      if (!error && data) {
        const mapped = data.map((m: any) => ({
          id: m.id,
          name: m.profiles?.full_name || 'عضو غير معروف',
          phone: m.profiles?.phone || 'غير مسجل',
          role: m.role,
          status: 'نشط'
        }));
        setMembersList(mapped);
      }
    } catch (e) {
      console.error('Error loading members:', e);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (currentOrg) {
      loadBranches();
      loadMembers();
    }
  }, [currentOrg, activeTab]);

  // Handle adding custom branches to DB
  const handleAddBranchSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentOrg) return;
    
    setNewBranchSuccess(null);
    setNewBranchError(null);
    setSubmittingBranch(true);

    const formData = new FormData(e.currentTarget);
    const bName = formData.get('branch_name') as string;
    const bCode = formData.get('branch_code') as string;
    const bAddress = formData.get('branch_address') as string;

    if (!bName || !bCode) {
      setNewBranchError('الرجاء كتابة اسم الفرع وكود الفرع');
      setSubmittingBranch(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('branches')
        .insert({
          organization_id: currentOrg.id,
          name_ar: bName,
          code: bCode,
          address: bAddress || null,
          is_main: false
        })
        .select();

      if (error) {
        // Humanize common errors
        if (error.code === '23505') {
          setNewBranchError('كود الفرع مكرر بالفعل لهذه المنشأة. يرجى اختيار رمز ترميز فريد.');
        } else {
          setNewBranchError(error.message || 'فشل التحديث الأمني للفرع.');
        }
      } else {
        setNewBranchSuccess('تم تسجيل وإدراج الفرع الفرعي بنجاح في قاعدة البيانات.');
        e.currentTarget.reset();
        await loadBranches();
      }
    } catch (err: any) {
      setNewBranchError(err.message || 'حدث خطأ غير متوقع.');
    } finally {
      setSubmittingBranch(false);
    }
  };

  return (
    <div className="space-y-6 font-sans text-right" dir="rtl">
      
      {/* Page Title & description header */}
      <div className="space-y-1">
        <h2 className="text-xl font-extrabold text-slate-900">{t('settings.title')}</h2>
        <p className="text-xs text-slate-500">{t('settings.subtitle')}</p>
      </div>

      {/* Tabs selectors row */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto pb-px">
        {[
          { id: 'info', label: t('settings.tab_info'), icon: Building },
          { id: 'users', label: t('settings.tab_users'), icon: Users },
          { id: 'branches', label: t('settings.tab_branches'), icon: MapPin }
        ].map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap outline-none ${
                isActive 
                  ? 'border-brand-blue text-brand-blue font-extrabold' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <TabIcon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Dynamic Tabs view frame */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        
        {/* Tab 1: Organization & VAT profiles */}
        {activeTab === 'info' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4 flex items-center gap-2">
                <Building className="w-5 h-5 text-brand-blue" />
                <span>بيانات الكيان والهوية الضريبية للشركة</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <span className="text-[11px] text-slate-400 block mb-1">اسم المنشأة بالعربية</span>
                <p className="text-sm font-bold text-slate-800 bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl">
                  {currentOrg ? currentOrg.name_ar : 'منشأة غير محددة'}
                </p>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block mb-1">اسم المنشأة بالإنجليزية</span>
                <p className="text-sm font-semibold text-slate-600 bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl font-mono text-left" style={{ direction: 'ltr' }}>
                  {currentOrg?.name_en || 'None English Name'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <span className="text-[11px] text-slate-400 block mb-1">مدينة التشغيل الرئيسي</span>
                <p className="text-sm font-bold text-slate-800 bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl">
                  {currentOrg?.city || 'الرياض'}
                </p>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block mb-1">الرقم الموحد / السجل التجاري (CR)</span>
                <p className="text-sm font-bold text-slate-800 bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl font-mono tracking-wide" style={{ direction: 'ltr', textAlign: 'right' }}>
                  {currentOrg?.cr_number || 'غير متوفر'}
                </p>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block mb-1">العملة الأساسية للتقارير المالية</span>
                <p className="text-sm font-extrabold text-brand-navy bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl">
                  الريال السعودي (ر.س)
                </p>
              </div>
            </div>

            {/* VAT Specific panel */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">{t('settings.vat_status')}</span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">نهج ومعلومات الامتثال والربط الضريبي للمنشأة</span>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                  currentOrg?.is_vat_registered ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                }`}>
                  {currentOrg?.is_vat_registered ? 'منشأة مسجلة ضريبياً' : 'غير مسجلة حالياً'}
                </span>
              </div>

              {currentOrg?.is_vat_registered && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">الرقم الضريبي الموحد للمنشأة (15 خانة)</span>
                    <p className="text-sm font-extrabold font-mono text-slate-800 bg-white border border-slate-200 py-2 px-3 rounded-xl tracking-wider">
                      {currentOrg?.vat_number || 'غير متوفر'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">نسبة ضريبة القيمة المضافة الافتراضية باتحاد المملكة</span>
                    <p className="text-sm font-extrabold font-mono text-slate-800 bg-white border border-slate-200 py-2 px-3 rounded-xl">
                      15%
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Users & permissions memberships */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Users className="w-5 h-5 text-brand-purple" />
                  <span>دليل المستخدمين وصلاحيات الارتباط</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">توضح هذه القائمة الأفراد المصرح لهم بالدخول وصلاحية استخدام دفاتر المنشأة بناءً على الرول المخول لهم من المالك.</p>
              </div>
            </div>

            {/* Simulated Add user form - Protected per guidelines */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <h4 className="text-xs font-bold text-slate-800 mb-2">دعوة الزملاء والانضمام كعضو</h4>
              
              <div className="bg-amber-50 border-r-4 border-amber-500 p-3 rounded-xl flex items-start gap-2 text-amber-900 text-xs leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <h5 className="font-bold text-amber-950">دعوة الزملاء بالبريد الإلكتروني تطلب تهيئة Edge Functions</h5>
                  <p className="text-[10px] mt-0.5">
                    التحايل عبر كتابة الـ Service Role Key داخل التطبيق ممنوع برمجياً لحماية الأمن المالي. تم إخفاء نموذج الدعوات مؤقتاً لحين ربط وتفعيل الدوال السحابية الآمنة لـ Supabase Edge Functions.
                  </p>
                </div>
              </div>
            </div>

            {/* Listing table */}
            <div className="overflow-x-auto pt-2">
              {loadingMembers ? (
                <div className="text-center py-6 text-xs text-slate-400">جاري مطابقة الأعضاء...</div>
              ) : (
                <table className="w-full text-xs text-right border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400">
                      <th className="pb-2 font-bold">{t('settings.user_name')}</th>
                      <th className="pb-2 font-bold text-right">رقم الهاتف الشريك</th>
                      <th className="pb-2 font-bold text-center">{t('settings.user_role')}</th>
                      <th className="pb-2 font-bold text-left">حالة الاتصال</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {membersList.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3 font-semibold text-slate-800 flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-brand-purple shrink-0" />
                          <span>{u.name}</span>
                        </td>
                        <td className="py-3 font-mono text-slate-500 tracking-wide" style={{ direction: 'ltr', textAlign: 'right' }}>{u.phone}</td>
                        <td className="py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.role === 'owner' 
                              ? 'bg-amber-100 text-amber-800' 
                              : u.role === 'admin'
                              ? 'bg-blue-100 text-blue-800'
                              : u.role === 'accountant'
                              ? 'bg-purple-100 text-brand-purple'
                              : 'bg-indigo-50 text-indigo-700'
                          }`}>
                            {u.role === 'owner' && 'المالك والمؤسس'}
                            {u.role === 'admin' && 'مدير نظام معتمد'}
                            {u.role === 'accountant' && 'محاسب مالي مرخص'}
                            {u.role === 'sales' && 'مسؤول مبيعات'}
                            {u.role === 'viewer' && 'مستعرض فقط'}
                          </span>
                        </td>
                        <td className="py-3 text-left">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-800">
                            {u.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Outlet Branches */}
        {activeTab === 'branches' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-brand-turquoise" />
                  <span>دليل فروع المنشأة المعتمدة</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">تتيح لك لِدجرا تتبع مبيعات ومصروفات كل فرع أو مستودع مستقل لتطبيق عزل الحسابات والامتثال المالي بشكل صحيح للغايات الضريبية والمحاسبية.</p>
              </div>
            </div>

            {/* Branch Creation Form */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <h4 className="text-xs font-bold text-slate-800 mb-3">{t('settings.add_branch')}</h4>
              
              {newBranchSuccess && (
                <div className="bg-emerald-50 border-r-4 border-emerald-500 p-2.5 rounded-lg text-xs text-emerald-800 mb-3 font-semibold">
                  ✓ {newBranchSuccess}
                </div>
              )}

              {newBranchError && (
                <div className="bg-red-50 border-r-4 border-red-500 p-2.5 rounded-lg text-xs text-red-800 mb-3 font-semibold">
                  ✕ {newBranchError}
                </div>
              )}

              <form onSubmit={handleAddBranchSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-5">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">{t('settings.branch_name')}</label>
                  <input type="text" name="branch_name" required placeholder="فرع المنطقة الشرقية (الخبر)" className="w-full px-3 py-1.5 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none focus:ring-4 focus:ring-brand-turquoise/10" />
                </div>
                
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">{t('settings.branch_code')}</label>
                  <input type="text" name="branch_code" required placeholder="002" className="w-full px-3 py-1.5 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none font-mono text-center" />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">{t('settings.branch_address')}</label>
                  <input type="text" name="branch_address" placeholder="الشارع التجاري" className="w-full px-3 py-1.5 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none focus:ring-4 focus:ring-brand-turquoise/10" />
                </div>

                <div className="sm:col-span-2">
                  <button 
                    type="submit" 
                    disabled={submittingBranch}
                    className="w-full py-2 px-3 bg-brand-turquoise hover:bg-teal-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    {submittingBranch ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>تسجيل الفرع</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Branches listing cards list */}
            {loadingBranches ? (
              <div className="text-center py-6 text-xs text-slate-400">جاري قراءة قائمة الفروع المؤمنة...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {branches.map((b) => (
                  <div key={b.id} className="border border-slate-200 rounded-2xl p-4 hover:border-slate-300 transition flex items-start gap-3.5 relative overflow-hidden bg-slate-50/20">
                    {b.is_main && (
                      <span className="absolute top-0 left-0 bg-brand-blue text-white text-[9px] font-bold px-2.5 py-0.5 rounded-br-xl">
                        الفرع الرئيسي المعتمد للفوترة
                      </span>
                    )}
                    
                    <div className="p-2.5 bg-brand-blue/5 rounded-xl text-brand-blue shrink-0">
                      <Building2 className="w-6 h-6" />
                    </div>
                    
                    <div className="space-y-1 text-right truncate">
                      <h4 className="text-xs font-bold text-slate-800 truncate">{b.name_ar}</h4>
                      <span className="text-[10px] font-mono text-slate-400 block pb-0.5">رمز ترميز الفرع: {b.code || '001'}</span>
                      <span className="text-[10px] text-slate-500 block truncate">العنوان بالتسجيل: {b.address || 'غير محدد'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

      </div>

    </div>
  );
};
export default Settings;
