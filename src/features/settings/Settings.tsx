import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n/translations';
import { supabase } from '../../lib/supabase';
import { Branch, Account, AccountingSettings as AccountingSettingsType } from '../../types';
import { accountingService } from '../../lib/accountingService';
import { 
  Building, 
  Users, 
  MapPin, 
  ShieldAlert, 
  Plus, 
  Building2,
  Mail,
  UserCheck,
  AlertCircle,
  BookOpen,
  Save,
  HelpCircle
} from 'lucide-react';

interface SettingsMember {
  id: string;
  name: string;
  phone: string;
  role: string;
  status: string;
}

interface RPCMemberResult {
  membership_id: string;
  profile_id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  created_at: string;
}

export const Settings: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const { t } = useTranslation('ar');
  const [activeTab, setActiveTab] = useState<'info' | 'users' | 'branches' | 'accounting'>('info');

  // Accounting Settings state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountingSettings, setAccountingSettings] = useState<AccountingSettingsType | null>(null);
  const [loadingAccounting, setLoadingAccounting] = useState<boolean>(true);
  const [accountingError, setAccountingError] = useState<string | null>(null);
  const [accountingSuccess, setAccountingSuccess] = useState<string | null>(null);
  const [savingAccounting, setSavingAccounting] = useState<boolean>(false);

  // Real Database state lists
  const [branches, setBranches] = useState<Branch[]>([]);
  const [membersList, setMembersList] = useState<SettingsMember[]>([]);
  const [loadingBranches, setLoadingBranches] = useState<boolean>(true);
  const [loadingMembers, setLoadingMembers] = useState<boolean>(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);

  // Forms statuses
  const [newBranchSuccess, setNewBranchSuccess] = useState<string | null>(null);
  const [newBranchError, setNewBranchError] = useState<string | null>(null);
  const [submittingBranch, setSubmittingBranch] = useState<boolean>(false);

  const isPrivileged = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin';

  // Fetch Branches from Supabase
  const loadBranches = async () => {
    if (!currentOrg) return;
    setLoadingBranches(true);
    setBranchesError(null);
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('is_main', { ascending: false });

      if (error) {
        setBranchesError(error.message || 'فشلت قراءة الفروع من خادم البيانات');
      } else if (data) {
        setBranches(data as Branch[]);
      }
    } catch (e: unknown) {
      const err = e as Error;
      console.error('Error loading branches:', err);
      setBranchesError(err.message || 'فشل الاتصال لقراءة قائمة الفروع.');
    } finally {
      setLoadingBranches(false);
    }
  };

  // Fetch Members from Supabase
  const loadMembers = async () => {
    if (!currentOrg) return;
    setLoadingMembers(true);
    setMembersError(null);
    try {
      // Securely fetch members using our dedicated security-definer RPC function to bypass recursion and secure internal join
      const { data, error } = await supabase
        .rpc('get_organization_members', { p_organization_id: currentOrg.id });

      if (error) {
        console.error('Error fetching members via RPC:', error);
        setMembersError(error.message || 'فشلت قراءة دليل الموظفين من الخادم لإفتقار التصاريح الكافية.');
      } else if (data) {
        const mapped = (data as RPCMemberResult[]).map((m: RPCMemberResult) => ({
          id: m.membership_id,
          name: m.full_name || 'عضو غير معروف',
          phone: m.phone || 'غير مسجل',
          role: m.role,
          status: 'نشط'
        }));
        setMembersList(mapped);
      }
    } catch (e: unknown) {
      const err = e as Error;
      console.error('Error loading members:', err);
      setMembersError(err.message || 'حدث خطأ غير متوقع أثناء محاولة قراءة الأعضاء.');
    } finally {
      setLoadingMembers(false);
    }
  };

  const loadAccounting = async () => {
    if (!currentOrg) return;
    setLoadingAccounting(true);
    setAccountingError(null);
    setAccountingSuccess(null);
    try {
      const data = await accountingService.getAccountingSettings(currentOrg.id);
      setAccountingSettings(data);
      
      const allAccounts = await accountingService.getAccounts(currentOrg.id);
      setAccounts(allAccounts.filter(a => a.is_active && a.allow_direct_posting));
    } catch (e: any) {
      console.error(e);
      setAccountingError(e.message || 'حدث خطأ أثناء تحميل إعدادات الحسابات الافتراضية.');
    } finally {
      setLoadingAccounting(false);
    }
  };

  const handleSaveAccountingSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentOrg || !accountingSettings || savingAccounting) return;

    setSavingAccounting(true);
    setAccountingError(null);
    setAccountingSuccess(null);

    const formData = new FormData(e.currentTarget);
    const updates: Partial<AccountingSettingsType> = {
      default_cash_account_id: (formData.get('default_cash') as string) || null,
      default_bank_account_id: (formData.get('default_bank') as string) || null,
      default_receivables_account_id: (formData.get('default_receivables') as string) || null,
      default_payables_account_id: (formData.get('default_payables') as string) || null,
      default_sales_account_id: (formData.get('default_sales') as string) || null,
      default_service_sales_account_id: (formData.get('default_service_sales') as string) || null,
      default_tax_output_account_id: (formData.get('default_tax_output') as string) || null,
      default_tax_input_account_id: (formData.get('default_tax_input') as string) || null,
      default_inventory_account_id: (formData.get('default_inventory') as string) || null,
      default_cogs_account_id: (formData.get('default_cogs') as string) || null,
      default_retained_earnings_account_id: (formData.get('default_retained_earnings') as string) || null,
    };

    try {
      const updated = await accountingService.updateAccountingSettings(currentOrg.id, updates);
      setAccountingSettings(updated);
      setAccountingSuccess('تم حفظ إعدادات وتكميم الروابط المحاسبية الافتراضية بنجاح!');
    } catch (err: any) {
      console.error(err);
      setAccountingError(err.message || 'فشلت معالجة حفظ الاختيارات.');
    } finally {
      setSavingAccounting(false);
    }
  };

  useEffect(() => {
    if (currentOrg) {
      if (activeTab === 'branches') {
        loadBranches();
      } else if (activeTab === 'users' && isPrivileged) {
        loadMembers();
      } else if (activeTab === 'accounting') {
        loadAccounting();
      } else {
        // Initial tab or switcher load
        loadBranches();
      }
    }
  }, [currentOrg, activeTab, roleInCurrentOrg]);

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
      const { error } = await supabase
        .from('branches')
        .insert({
          organization_id: currentOrg.id,
          name_ar: bName,
          code: bCode,
          address: bAddress || null,
          is_main: false
        });

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
    } catch (err: unknown) {
      const errorObj = err as Error;
      setNewBranchError(errorObj.message || 'حدث خطأ غير متوقع.');
    } finally {
      setSubmittingBranch(false);
    }
  };

  const handleDeleteBranch = async (branchId: string, isMain: boolean) => {
    if (!isPrivileged) return;
    if (isMain) {
      alert('لا يمكن حذف الفرع الرئيسي المعتمد.');
      return;
    }
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا الفرع؟')) return;

    try {
      const { error } = await supabase
        .from('branches')
        .delete()
        .eq('id', branchId);

      if (error) {
        alert(error.message || 'فشل حذف الفرع');
      } else {
        await loadBranches();
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      console.error('Error deleting branch:', errorObj);
      alert(errorObj.message || 'حدث خطأ غير متوقع أثناء الحذف.');
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
          { id: 'branches', label: t('settings.tab_branches'), icon: MapPin },
          { id: 'accounting', label: 'الإعدادات المحاسبية والسيرفر', icon: BookOpen }
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

            {!isPrivileged ? (
              <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-2xl text-xs font-semibold flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
                <span>عذراً، هذا التبويب وصلاحيات دليل المستخدمين متاح فقط لمالك المنشأة والمشرفين المعتمدين عليها.</span>
              </div>
            ) : (
              <>
                {membersError && (
                  <div className="bg-red-50 border-r-4 border-red-500 p-3 rounded-lg text-xs text-red-800 font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span>خطأ في مزامنة الأعضاء: {membersError}</span>
                  </div>
                )}

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
              </>
            )}
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

            {branchesError && (
              <div className="bg-red-50 border-r-4 border-red-500 p-3 rounded-lg text-xs text-red-800 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span>خطأ في استرجاع الفروع: {branchesError}</span>
              </div>
            )}

            {/* Branch Creation Form */}
            {isPrivileged && (
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
            )}

            {/* Branches listing cards list */}
            {loadingBranches ? (
              <div className="text-center py-6 text-xs text-slate-400">جاري قراءة قائمة الفروع المؤمنة...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {branches.map((b) => (
                  <div key={b.id} className="border border-slate-200 rounded-2xl p-4 hover:border-slate-300 transition flex items-start gap-4 relative overflow-hidden bg-slate-50/20 pb-12">
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

                    {isPrivileged && !b.is_main && (
                      <button
                        onClick={() => handleDeleteBranch(b.id, b.is_main)}
                        className="absolute bottom-3 left-3 px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[10px] font-bold transition cursor-pointer border border-red-200/50"
                      >
                        حذف الفرع
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* Tab 4: Accounting configuration mappings */}
        {activeTab === 'accounting' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-brand-blue" />
                  <span>لوحة الربط المحاسبي التلقائي للقيود والعمليات المالية</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  قم بضبط الحسابات الافتراضية للدفاتر لتفويض منصة لِدجرا بإنشاء ومطابقة قيود اليومية للضربيات والعملاء والنقدية تلقائياً دون تدخل بشري.
                </p>
              </div>
            </div>

            {accountingSuccess && (
              <div className="bg-emerald-50 border-r-4 border-emerald-500 p-3 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
                <span>✓ {accountingSuccess}</span>
              </div>
            )}

            {accountingError && (
              <div className="bg-red-50 border-r-4 border-red-500 p-3 rounded-lg text-xs text-red-800 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span>خطأ: {accountingError}</span>
              </div>
            )}

            {loadingAccounting ? (
              <div className="text-center py-12 text-xs text-slate-400 space-y-2">
                <span className="w-6 h-6 border-2 border-brand-blue border-t-transparent rounded-full animate-spin inline-block" />
                <p>جاري تحميل خريطة الحسابات وتفضيلات الخادم المالي...</p>
              </div>
            ) : (
              <form onSubmit={handleSaveAccountingSettings} className="space-y-6">
                
                {/* Visual guidance box */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed text-slate-600">
                  <HelpCircle className="w-5 h-5 text-brand-blue shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-slate-800">نهج الامتثال المالي السحابي:</h5>
                    <p className="text-[10px] mt-1 text-slate-500">
                      يتم تصفية قائمة الحسابات أدناه آلياً لعرض الحسابات النشطة القابلة لترحيل المعاملات المباشرة فقط (Allow Direct Posting). إذا لم تجد الحساب المطلوب، يرجى تفعيله أولاً من شجرة الحسابات المحاسبية.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Category 1: Cash & Banks */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-sm/50">
                    <h4 className="text-xs font-bold text-brand-blue border-b border-slate-100 pb-2 flex items-center gap-1.5">
                      <span>١. حسابات السيولة السريعة والنقدية</span>
                    </h4>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">الخزينة النقدية الافتراضية (الصندوق)</label>
                        <select 
                          name="default_cash" 
                          defaultValue={accountingSettings?.default_cash_account_id || ''}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-blue/10 font-mono"
                        >
                          <option value="">-- اختر حساب الصندوق النقدي --</option>
                          {accounts.filter(a => a.classification === 'assets').map(a => (
                            <option key={a.id} value={a.id}>({a.code}) {a.name_ar}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">الحساب البنكي الافتراضي للمنشأة</label>
                        <select 
                          name="default_bank" 
                          defaultValue={accountingSettings?.default_bank_account_id || ''}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-blue/10 font-mono"
                        >
                          <option value="">-- اختر الحساب البنكي الافتراضي --</option>
                          {accounts.filter(a => a.classification === 'assets').map(a => (
                            <option key={a.id} value={a.id}>({a.code}) {a.name_ar}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Category 2: Receivables & Payables */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-sm/50">
                    <h4 className="text-xs font-bold text-brand-blue border-b border-slate-100 pb-2 flex items-center gap-1.5">
                      <span>٢. حسابات الشركاء والذمم (العملاء والموردين)</span>
                    </h4>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">حساب العملاء والذمم المدينة (Customer Receivables)</label>
                        <select 
                          name="default_receivables" 
                          defaultValue={accountingSettings?.default_receivables_account_id || ''}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-blue/10 font-mono"
                        >
                          <option value="">-- اختر حساب الذمم المدينة الموحد --</option>
                          {accounts.filter(a => a.classification === 'assets').map(a => (
                            <option key={a.id} value={a.id}>({a.code}) {a.name_ar}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">حساب الموردين والذمم الدائنة (Vendor Payables)</label>
                        <select 
                          name="default_payables" 
                          defaultValue={accountingSettings?.default_payables_account_id || ''}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-blue/10 font-mono"
                        >
                          <option value="">-- اختر حساب الذمم الدائنة الموحد --</option>
                          {accounts.filter(a => a.classification === 'liabilities').map(a => (
                            <option key={a.id} value={a.id}>({a.code}) {a.name_ar}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Category 3: Product & Service Sales */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-sm/50">
                    <h4 className="text-xs font-bold text-brand-blue border-b border-slate-100 pb-2 flex items-center gap-1.5">
                      <span>٣. حسابات المبيعات وإيرادات النشاط</span>
                    </h4>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">حساب مبيعات المنتجات والسلع</label>
                        <select 
                          name="default_sales" 
                          defaultValue={accountingSettings?.default_sales_account_id || ''}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-blue/10 font-mono"
                        >
                          <option value="">-- اختر حساب إيرادات المبيعات السلعية --</option>
                          {accounts.filter(a => a.classification === 'revenue').map(a => (
                            <option key={a.id} value={a.id}>({a.code}) {a.name_ar}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">حساب مبيعات الخدمات والتشغيل</label>
                        <select 
                          name="default_service_sales" 
                          defaultValue={accountingSettings?.default_service_sales_account_id || ''}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-blue/10 font-mono"
                        >
                          <option value="">-- اختر حساب إيرادات مبيعات الخدمات --</option>
                          {accounts.filter(a => a.classification === 'revenue').map(a => (
                            <option key={a.id} value={a.id}>({a.code}) {a.name_ar}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Category 4: Inventory & Cost */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-sm/50">
                    <h4 className="text-xs font-bold text-brand-blue border-b border-slate-100 pb-2 flex items-center gap-1.5">
                      <span>٤. حسابات المخازن وتكاليف البضاعة</span>
                    </h4>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">حساب المخزون السلعي (Inventory Assets)</label>
                        <select 
                          name="default_inventory" 
                          defaultValue={accountingSettings?.default_inventory_account_id || ''}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-blue/10 font-mono"
                        >
                          <option value="">-- اختر حساب المخزون العام --</option>
                          {accounts.filter(a => a.classification === 'assets').map(a => (
                            <option key={a.id} value={a.id}>({a.code}) {a.name_ar}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">حساب تكلفة البضاعة المباعة (COGS Expenses)</label>
                        <select 
                          name="default_cogs" 
                          defaultValue={accountingSettings?.default_cogs_account_id || ''}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-blue/10 font-mono"
                        >
                          <option value="">-- اختر حساب تكلفة المبيعات --</option>
                          {accounts.filter(a => a.classification === 'expenses').map(a => (
                            <option key={a.id} value={a.id}>({a.code}) {a.name_ar}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Category 5: Taxes and Retained Earnings */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-sm/50 md:col-span-2">
                    <h4 className="text-xs font-bold text-brand-blue border-b border-slate-100 pb-2 flex items-center gap-1.5">
                      <span>٥. ضريبة القيمة المضافة والأرباح المدورة</span>
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1 font-sans">حساب الضريبة المدخلة (المشتريات)</label>
                        <select 
                          name="default_tax_input" 
                          defaultValue={accountingSettings?.default_tax_input_account_id || ''}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-blue/10 font-mono"
                        >
                          <option value="">-- اختر حساب ضريبة المدخلات --</option>
                          {accounts.filter(a => a.classification === 'assets').map(a => (
                            <option key={a.id} value={a.id}>({a.code}) {a.name_ar}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1 font-sans">حساب الضريبة المخرجة (المبيعات)</label>
                        <select 
                          name="default_tax_output" 
                          defaultValue={accountingSettings?.default_tax_output_account_id || ''}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-blue/10 font-mono"
                        >
                          <option value="">-- اختر حساب ضريبة المخرجات --</option>
                          {accounts.filter(a => a.classification === 'liabilities').map(a => (
                            <option key={a.id} value={a.id}>({a.code}) {a.name_ar}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1 font-sans">حساب الأرباح المبقاة (Retained Earnings)</label>
                        <select 
                          name="default_retained_earnings" 
                          defaultValue={accountingSettings?.default_retained_earnings_account_id || ''}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-blue/10 font-mono"
                        >
                          <option value="">-- اختر حساب الأرباح المدورة --</option>
                          {accounts.filter(a => a.classification === 'equity').map(a => (
                            <option key={a.id} value={a.id}>({a.code}) {a.name_ar}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                </div>

                <div className="flex justify-end pt-4">
                  <button 
                    type="submit" 
                    disabled={savingAccounting}
                    className="flex items-center gap-1.5 px-6 py-2.5 bg-brand-blue hover:bg-blue-600 text-white font-bold rounded-xl text-xs cursor-pointer select-none transition disabled:opacity-50 shadow-md shadow-brand-blue/10"
                  >
                    {savingAccounting ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>جاري حفظ العلاقات والمطابقات ممارسياً...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>حفظ وثاق الروابط المحاسبية الافتراضية</span>
                      </>
                    )}
                  </button>
                </div>

              </form>
            )}

          </div>
        )}

      </div>

    </div>
  );
};
export default Settings;
