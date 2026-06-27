import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n/translations';
import { supabase } from '../../lib/supabase';
import { Branch, Account, AccountingSettings as AccountingSettingsType } from '../../types';
import { accountingService } from '../../lib/accountingService';
import { normalizeIntegerInput } from '../../lib/formatters';
import { organizationSettingsService } from '../../lib/organizationSettingsService';
import { ZatcaSettingsComp } from './ZatcaSettings';
import { useOrganizationSubscription } from '../../hooks/useOrganizationSubscription';
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
  HelpCircle,
  Upload,
  Trash2,
  Palette,
  Check,
  Globe,
  Tag,
  Phone,
  Layout,
  LayoutGrid,
  Award,
  MessageCircle,
  Clock,
  CreditCard
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
  const { currentOrg, roleInCurrentOrg, updateOrg } = useAuth();
  const { t } = useTranslation('ar');
  const [activeTab, setActiveTab] = useState<'info' | 'users' | 'branches' | 'accounting' | 'zatca' | 'subscription'>('info');

  const { 
    subscription, 
    status: subStatus, 
    plan: subPlan, 
    isActive: subIsActive, 
    isTrial: subIsTrial, 
    isSuspended: subIsSuspended, 
    loading: subLoading 
  } = useOrganizationSubscription();

  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (currentOrg?.logo_url) {
      if (currentOrg.logo_url.startsWith('http://') || currentOrg.logo_url.startsWith('https://')) {
        setLogoUrl(currentOrg.logo_url);
      } else {
        organizationSettingsService.getLogoSignedUrl(currentOrg.logo_url)
          .then(url => {
            if (active) setLogoUrl(url);
          })
          .catch(err => {
            console.error('Failed to retrieve logo signed URL:', err);
            if (active) setLogoUrl(null);
          });
      }
    } else {
      setLogoUrl(null);
    }
    return () => {
      active = false;
    };
  }, [currentOrg?.logo_url]);

  // ==========================================
  // Phase 10: Enterprise & Print Brand Settings Space
  // ==========================================
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [formData, setFormData] = useState({
    name_ar: '',
    name_en: '',
    cr_number: '',
    vat_number: '',
    is_vat_registered: false,
    phone: '',
    email: '',
    website: '',
    address_line: '',
    city: '',
    country: 'المملكة العربية السعودية',
    postal_code: '',
    print_primary_color: '#111827',
    print_footer_text: '',
    default_invoice_note: '',
    default_receipt_note: '',
    default_payment_note: '',
    show_logo_on_print: true,
    show_tax_number_on_print: true,
    show_commercial_registration_on_print: true,
  });

  useEffect(() => {
    if (currentOrg) {
      setFormData({
        name_ar: currentOrg.name_ar || '',
        name_en: currentOrg.name_en || '',
        cr_number: currentOrg.cr_number || '',
        vat_number: currentOrg.vat_number || '',
        is_vat_registered: currentOrg.is_vat_registered || false,
        phone: currentOrg.phone || '',
        email: currentOrg.email || '',
        website: currentOrg.website || '',
        address_line: currentOrg.address_line || '',
        city: currentOrg.city || '',
        country: currentOrg.country || 'المملكة العربية السعودية',
        postal_code: currentOrg.postal_code || '',
        print_primary_color: currentOrg.print_primary_color || '#111827',
        print_footer_text: currentOrg.print_footer_text || '',
        default_invoice_note: currentOrg.default_invoice_note || '',
        default_receipt_note: currentOrg.default_receipt_note || '',
        default_payment_note: currentOrg.default_payment_note || '',
        show_logo_on_print: currentOrg.show_logo_on_print ?? true,
        show_tax_number_on_print: currentOrg.show_tax_number_on_print ?? true,
        show_commercial_registration_on_print: currentOrg.show_commercial_registration_on_print ?? true,
      });
    }
  }, [currentOrg]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormData(prev => ({ ...prev, [name]: checked }));
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    if (!isPrivileged) {
      setSettingsError('عذراً، لا تمتلك الصلاحيات الكافية لتعديل إعدادات المنشأة. الحفظ متاح فقط للمالك والمسؤولين.');
      return;
    }

    setSavingSettings(true);
    setSettingsSuccess(null);
    setSettingsError(null);

    try {
      // Direct call to standard updateOrg that refreshes Context AND database beautifully
      const { error } = await updateOrg(currentOrg.id, {
        name_ar: formData.name_ar,
        name_en: formData.name_en,
        cr_number: formData.cr_number || null,
        vat_number: formData.vat_number || null,
        is_vat_registered: formData.is_vat_registered,
        phone: formData.phone || null,
        email: formData.email || null,
        website: formData.website || null,
        address_line: formData.address_line || null,
        city: formData.city || null,
        country: formData.country || null,
        postal_code: formData.postal_code || null,
        print_primary_color: formData.print_primary_color,
        print_footer_text: formData.print_footer_text || null,
        default_invoice_note: formData.default_invoice_note || null,
        default_receipt_note: formData.default_receipt_note || null,
        default_payment_note: formData.default_payment_note || null,
        show_logo_on_print: formData.show_logo_on_print,
        show_tax_number_on_print: formData.show_tax_number_on_print,
        show_commercial_registration_on_print: formData.show_commercial_registration_on_print,
      });

      if (error) {
        setSettingsError(error);
      } else {
        setSettingsSuccess('تم حفظ إعدادات الكيان والهوية التجارية بنجاح!');
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      setSettingsError(errorObj.message || 'حدث خطأ غير متوقع أثناء الحفظ.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentOrg) return;
    if (!isPrivileged) {
      setSettingsError('عذراً، لا تمتلك الصلاحيات لتعديل هويات أو شعارات المنشأة.');
      return;
    }

    setUploadingLogo(true);
    setSettingsSuccess(null);
    setSettingsError(null);

    try {
      const file = files[0];
      const filePath = await organizationSettingsService.uploadLogo(currentOrg.id, file);
      // Sync with context so it triggers everywhere with reactive goodness
      await updateOrg(currentOrg.id, { logo_url: filePath });
      setSettingsSuccess('تم رفع شعار المنشأة بنجاح وأرشفته بمركز الملفات!');
    } catch (err: unknown) {
      const errorObj = err as Error;
      setSettingsError(errorObj.message || 'حدث خطأ غير متوقع أثناء الرفع.');
    } finally {
      setUploadingLogo(false);
      // clear output element
      e.target.value = '';
    }
  };

  const handleLogoDelete = async () => {
    if (!currentOrg) return;
    if (!isPrivileged) {
      setSettingsError('عذراً، لا تمتلك صلاحية حذف الشعار.');
      return;
    }
    if (!confirm('هل ترغب في إزالة الشعار بالكامل؟ سيتم الاحتفاظ بباقي الإعدادات.')) return;

    setUploadingLogo(true);
    setSettingsSuccess(null);
    setSettingsError(null);

    try {
      await organizationSettingsService.deleteLogo(currentOrg.id);
      await updateOrg(currentOrg.id, { logo_url: null });
      setSettingsSuccess('تم إزالة شعار المنشأة بشكل آمن!');
    } catch (err: unknown) {
      const errorObj = err as Error;
      setSettingsError(errorObj.message || 'حدث خطأ غير متوقع أثناء الحذف.');
    } finally {
      setUploadingLogo(false);
    }
  };

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
    const bCode = normalizeIntegerInput(formData.get('branch_code') as string);
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
          { id: 'accounting', label: 'الإعدادات المحاسبية والسيرفر', icon: BookOpen },
          { id: 'zatca', label: 'الفوترة الإلكترونية (ZATCA)', icon: ShieldAlert },
          { id: 'subscription', label: 'اشتراك المؤسسة', icon: CreditCard }
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
          <form onSubmit={handleSaveSettings} className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Building className="w-5 h-5 text-brand-blue" />
                  <span>إعدادات المنشأة والهوية التجارية للطباعة</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">أدخل البيانات الرسمية وهوية الفواتير والمستندات والتقارير المطبوعة A4.</p>
              </div>
              {isPrivileged && (
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="bg-brand-blue hover:bg-brand-blue/90 disabled:bg-slate-300 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingSettings ? 'جاري الحفظ...' : 'حفظ التغييرات'}</span>
                </button>
              )}
            </div>

            {!isPrivileged && (
              <div className="bg-slate-50 border border-slate-200 text-slate-600 rounded-xl p-3.5 text-xs font-bold leading-relaxed flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                <span>عذراً، تتوفر الإعدادات للقراءة فقط، والتعديل مقتصر على الملاك والمشرفين (Owner & Admin).</span>
              </div>
            )}

            {settingsSuccess && (
              <div className="bg-emerald-50 border-r-4 border-emerald-500 text-emerald-800 p-4 rounded-xl text-xs font-bold flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>{settingsSuccess}</span>
              </div>
            )}

            {settingsError && (
              <div className="bg-red-50 border-r-4 border-red-500 text-red-800 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span>{settingsError}</span>
              </div>
            )}

            {/* Grid for General Fields & Logo uploading */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left Column (2 Cols): General Information Fields */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* 1. الأسماء وعناوين الكيان */}
                <div className="bg-slate-50/50 border border-slate-200/60 p-5 rounded-2xl space-y-4">
                  <h4 className="text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-2 mb-2">البيانات الأساسية للمنشأة</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">اسم المنشأة بالعربية <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        name="name_ar"
                        value={formData.name_ar}
                        onChange={handleInputChange}
                        required
                        disabled={!isPrivileged}
                        placeholder="مثال: شركة لِدجرا للتقنية المحاسبية"
                        className="w-full text-xs font-bold border border-slate-200 py-2.5 px-3 rounded-xl focus:border-brand-blue outline-none transition disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">اسم المنشأة بالإنجليزية</label>
                      <input
                        type="text"
                        name="name_en"
                        value={formData.name_en}
                        onChange={handleInputChange}
                        disabled={!isPrivileged}
                        placeholder="e.g. Ledgra Accounting Tech LLC"
                        className="w-full text-xs font-bold border border-slate-200 py-2.5 px-3 rounded-xl focus:border-brand-blue outline-none transition text-left font-mono disabled:bg-slate-100 placeholder:font-sans"
                        style={{ direction: 'ltr' }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">رقم السجل التجاري / الرقم الموحد (10 خانات)</label>
                      <input
                        type="text"
                        name="cr_number"
                        value={formData.cr_number}
                        onChange={handleInputChange}
                        disabled={!isPrivileged}
                        placeholder="أدخل 10 أرقام رقمية فقط"
                        className="w-full text-xs font-bold border border-slate-200 py-2.5 px-3 rounded-xl focus:border-brand-blue outline-none transition font-sans disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">الرقم الضريبي الموحد للمنشأة (15 خانة)</label>
                      <input
                        type="text"
                        name="vat_number"
                        value={formData.vat_number}
                        onChange={handleInputChange}
                        disabled={!isPrivileged}
                        placeholder="يبدأ بالرقم 3 وينتهي بـ 3"
                        className="w-full text-xs font-bold border border-slate-200 py-2.5 px-3 rounded-xl focus:border-brand-blue outline-none transition font-sans disabled:bg-slate-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">الهاتف</label>
                      <input
                        type="text"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        disabled={!isPrivileged}
                        placeholder="مثال: 0500000000"
                        className="w-full text-xs font-bold border border-slate-200 py-2.5 px-3 rounded-xl focus:border-brand-blue outline-none transition disabled:bg-slate-100 text-left font-mono"
                        style={{ direction: 'ltr' }}
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">البريد الإلكتروني للخطابات</label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        disabled={!isPrivileged}
                        placeholder="مثال: info@company.com"
                        className="w-full text-xs font-bold border border-slate-200 py-2.5 px-3 rounded-xl focus:border-brand-blue outline-none transition disabled:bg-slate-100 text-left font-mono placeholder:font-sans"
                        style={{ direction: 'ltr' }}
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">الموقع الإلكتروني</label>
                      <input
                        type="text"
                        name="website"
                        value={formData.website}
                        onChange={handleInputChange}
                        disabled={!isPrivileged}
                        placeholder="مثال: www.company.com"
                        className="w-full text-xs font-bold border border-slate-200 py-2.5 px-3 rounded-xl focus:border-brand-blue outline-none transition disabled:bg-slate-100 text-left font-mono placeholder:font-sans"
                        style={{ direction: 'ltr' }}
                      />
                    </div>
                  </div>
                </div>

                {/* 2. تفاصيل العنوان الفعلي */}
                <div className="bg-slate-50/50 border border-slate-200/60 p-5 rounded-2xl space-y-4">
                  <h4 className="text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-2 mb-2">العنوان والمدينة الفروع الرئيسية</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">اسم الشارع والحي فند ريادي</label>
                      <input
                        type="text"
                        name="address_line"
                        value={formData.address_line}
                        onChange={handleInputChange}
                        disabled={!isPrivileged}
                        placeholder="مثال: طريق الملك عبد العزيز، حي الياسمين"
                        className="w-full text-xs font-bold border border-slate-200 py-2.5 px-3 rounded-xl focus:border-brand-blue outline-none transition disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">المدينة</label>
                      <input
                        type="text"
                        name="city"
                        value={formData.city}
                        onChange={handleInputChange}
                        disabled={!isPrivileged}
                        placeholder="مثال: الرياض"
                        className="w-full text-xs font-bold border border-slate-200 py-2.5 px-3 rounded-xl focus:border-brand-blue outline-none transition disabled:bg-slate-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">الدولة</label>
                      <input
                        type="text"
                        name="country"
                        value={formData.country}
                        onChange={handleInputChange}
                        disabled={!isPrivileged}
                        placeholder="مثال: المملكة العربية السعودية"
                        className="w-full text-xs font-bold border border-slate-200 py-2.5 px-3 rounded-xl focus:border-brand-blue outline-none transition disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">الرمز البريدي</label>
                      <input
                        type="text"
                        name="postal_code"
                        value={formData.postal_code}
                        onChange={handleInputChange}
                        disabled={!isPrivileged}
                        placeholder="مثال: 11145"
                        className="w-full text-xs font-bold border border-slate-200 py-2.5 px-3 rounded-xl focus:border-brand-blue outline-none transition disabled:bg-slate-100 font-sans text-right"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. ملاحظات افتراضية للفواتير والسندات */}
                <div className="bg-slate-50/50 border border-slate-200/60 p-5 rounded-2xl space-y-4">
                  <h4 className="text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-2 mb-2">الملاحظات الافتراضية والشروط للمستندات</h4>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">شروط وملاحظات فاتورة المبيعات الافتراضية</label>
                      <textarea
                        name="default_invoice_note"
                        value={formData.default_invoice_note}
                        onChange={handleInputChange}
                        disabled={!isPrivileged}
                        rows={2}
                        placeholder="تظهر أسفل الفاتورة مبيعات، مثل: البضاعة المباعة لا ترد ولا تستبدل بعد 3 أيام."
                        className="w-full text-xs font-bold border border-slate-200 py-2.5 px-3 rounded-xl focus:border-brand-blue outline-none transition disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">ملاحظات و بنود سند القبض الافتراضية</label>
                      <textarea
                        name="default_receipt_note"
                        value={formData.default_receipt_note}
                        onChange={handleInputChange}
                        disabled={!isPrivileged}
                        rows={2}
                        placeholder="تظهر أسفل سند القبض، مثل: شكرًا لتعاملكم مع شركتنا."
                        className="w-full text-xs font-bold border border-slate-200 py-2.5 px-3 rounded-xl focus:border-brand-blue outline-none transition disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">ملاحظات و بنود سند الصرف الافتراضية</label>
                      <textarea
                        name="default_payment_note"
                        value={formData.default_payment_note}
                        onChange={handleInputChange}
                        disabled={!isPrivileged}
                        rows={2}
                        placeholder="تظهر أسفل سند الصرف للموردين، مثل: مستند لصرف مستحقات المشتريات المعتمدة."
                        className="w-full text-xs font-bold border border-slate-200 py-2.5 px-3 rounded-xl focus:border-brand-blue outline-none transition disabled:bg-slate-100"
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Column (1 Col): Brand Identity, Logo, Print switches */}
              <div className="space-y-6">
                
                {/* الشعار */}
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4 flex flex-col items-center text-center">
                  <h4 className="text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-2 w-full text-right">شعار المنشأة المعتمد</h4>
                  
                  {currentOrg?.logo_url ? (
                    <div className="space-y-3 w-full">
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-center min-h-[140px] shadow-sm relative group overflow-hidden">
                        {logoUrl ? (
                          <img 
                            src={logoUrl} 
                            alt="Company Logo" 
                            referrerPolicy="no-referrer"
                            className="max-h-[120px] max-w-full object-contain"
                            onError={() => setLogoUrl(null)}
                          />
                        ) : (
                          <div className="text-xs text-slate-400">جاري تحميل الشعار...</div>
                        )}
                      </div>
                      {isPrivileged && (
                        <div className="flex gap-2 justify-center">
                          <label className="bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1 transition">
                            <Upload className="w-3 h-3" />
                            <span>تغيير</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleLogoUpload}
                              className="hidden"
                              disabled={uploadingLogo}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={handleLogoDelete}
                            disabled={uploadingLogo}
                            className="bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer font-sans"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>حذف الشعار</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-6 w-full flex flex-col items-center justify-center min-h-[140px] text-slate-400">
                      <Building2 className="w-10 h-10 text-slate-300 mb-2" />
                      <span className="text-[10px] font-bold">لا يوجد شعار حالياً</span>
                      <span className="text-[9px] text-slate-400 mt-1">يُوصى بصيغة مربعة وبحجم أقل من 2MB</span>
                      {isPrivileged && (
                        <label className="bg-brand-blue hover:bg-brand-blue/90 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer mt-4 flex items-center gap-1 transition shadow-sm">
                          <Upload className="w-3 h-3" />
                          <span>رفع شعار</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="hidden"
                            disabled={uploadingLogo}
                          />
                        </label>
                      )}
                    </div>
                  )}

                  {uploadingLogo && (
                    <div className="text-[10px] font-bold text-brand-blue animate-pulse mt-1">
                      جاري رفع الشعار ومعالجة الأرشفة الآمنة...
                    </div>
                  )}
                </div>

                {/* اللون الرئيسي للطباعة */}
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4">
                  <h4 className="text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                    <Palette className="w-4 h-4 text-brand-blue" />
                    <span>اللون الرئيسي للطباعة</span>
                  </h4>

                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-500 block">اختر لون الطابع الأساسي للخطوط والعناوين</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        name="print_primary_color"
                        value={formData.print_primary_color}
                        onChange={handleInputChange}
                        disabled={!isPrivileged}
                        className="w-10 h-10 border border-slate-200 rounded-lg cursor-pointer shrink-0"
                      />
                      <input
                        type="text"
                        name="print_primary_color"
                        value={formData.print_primary_color}
                        onChange={handleInputChange}
                        disabled={!isPrivileged}
                        placeholder="#111827"
                        className="w-full text-xs font-mono font-bold border border-slate-200 py-2 px-2 rounded-xl focus:border-brand-blue outline-none bg-white uppercase"
                      />
                    </div>

                    {/* Quick presets */}
                    <div className="pt-2">
                      <span className="text-[9px] font-bold text-slate-400 block mb-1.5">لوحات مسبقة الضبط ومحاسبية:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { name: 'الافتراضي الفاخر', color: '#111827' },
                          { name: 'الأزرق الملكي', color: '#1e3a8a' },
                          { name: 'الأخضر الداكن', color: '#14532d' },
                          { name: 'البحريني الدافئ', color: '#881337' },
                          { name: 'الرمادي المطفي', color: '#334155' }
                        ].map((pCol) => (
                          <button
                            key={pCol.color}
                            type="button"
                            onClick={() => isPrivileged && setFormData(prev => ({ ...prev, print_primary_color: pCol.color }))}
                            className="bg-white border hover:bg-slate-50 text-[10px] py-1 px-2 rounded-lg flex items-center gap-1 cursor-pointer transition select-none"
                          >
                            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: pCol.color }} />
                            <span>{pCol.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* نص التذييل للطباعة */}
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4">
                  <h4 className="text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-2">تفاصيل ذيل الورقة الفاخرة</h4>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">نص تذييل الفواتير المطبوعة</label>
                    <input
                      type="text"
                      name="print_footer_text"
                      value={formData.print_footer_text}
                      onChange={handleInputChange}
                      disabled={!isPrivileged}
                      placeholder="مثال: يسعدنا خدمتكم، الرقم الموحد للإرجاع والدعم 920000000"
                      className="w-full text-xs font-bold border border-slate-200 py-2.5 px-3 rounded-xl focus:border-brand-blue outline-none transition bg-white disabled:bg-slate-100"
                    />
                  </div>
                </div>

                {/* خيارات الظهور */}
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-3.5">
                  <h4 className="text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-2">خيارات الهوية في الطباعة</h4>
                  
                  <div className="space-y-2.5 pt-1">
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={formData.show_logo_on_print}
                        onChange={(e) => isPrivileged && handleCheckboxChange('show_logo_on_print', e.target.checked)}
                        disabled={!isPrivileged}
                        className="w-4 h-4 accent-brand-blue rounded border-slate-300"
                      />
                      <span>إظهار شعار المنشأة في الطباعة</span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={formData.show_tax_number_on_print}
                        onChange={(e) => isPrivileged && handleCheckboxChange('show_tax_number_on_print', e.target.checked)}
                        disabled={!isPrivileged}
                        className="w-4 h-4 accent-brand-blue rounded border-slate-300"
                      />
                      <span>إظهار الرقم الضريبي للمنشأة</span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={formData.show_commercial_registration_on_print}
                        onChange={(e) => isPrivileged && handleCheckboxChange('show_commercial_registration_on_print', e.target.checked)}
                        disabled={!isPrivileged}
                        className="w-4 h-4 accent-brand-blue rounded border-slate-300"
                      />
                      <span>إظهار السجل التجاري في الهيدر</span>
                    </label>
                  </div>
                </div>

              </div>

            </div>

            {/* Bottom Save Action Panel */}
            {isPrivileged && (
              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="bg-brand-blue hover:bg-brand-blue/90 disabled:bg-slate-300 text-white text-xs font-bold px-7 py-3 rounded-xl transition flex items-center gap-2 shadow-md cursor-pointer"
                >
                  <Save className="w-4.5 h-4.5" />
                  <span>{savingSettings ? 'جاري حفظ التعديلات...' : 'حفظ إعدادات المنشأة والهوية'}</span>
                </button>
              </div>
            )}
          </form>
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
                    <input 
                      type="text" 
                      name="branch_code" 
                      required 
                      placeholder="002" 
                      onChange={(e) => {
                        e.target.value = normalizeIntegerInput(e.target.value);
                      }}
                      className="w-full px-3 py-1.5 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none font-mono text-center tabular-nums" 
                      dir="ltr"
                      inputMode="numeric"
                    />
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
                      <span>1. حسابات السيولة السريعة والنقدية</span>
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
                      <span>2. حسابات الشركاء والذمم (العملاء والموردين)</span>
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
                      <span>3. حسابات المبيعات وإيرادات النشاط</span>
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
                      <span>4. حسابات المخازن وتكاليف البضاعة</span>
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
                      <span>5. ضريبة القيمة المضافة والأرباح المدورة</span>
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

        {/* Tab 5: ZATCA Compliance */}
        {activeTab === 'zatca' && (
          <ZatcaSettingsComp />
        )}

        {/* Tab 6: Subscription */}
        {activeTab === 'subscription' && (
          <div className="space-y-6">
            <div className="border-b border-slate-150 pb-4">
              <h3 className="text-base font-black text-slate-900">اشتراك المؤسسة</h3>
              <p className="text-[11px] text-slate-500 font-medium">بيانات الباقة الحالية ومتابعة وتجديد اشتراكك السحابي مع لِدجرا.</p>
            </div>

            {subLoading ? (
              <div className="py-12 text-center text-xs font-bold text-slate-400">جاري سحب بيانات الاشتراك الحية...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Subscription Details Card */}
                <div className="md:col-span-2 space-y-4">
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-slate-900 rounded-xl text-white">
                          <Award className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">
                            {subPlan?.name_ar || 'فترة تجريبية مجانية'}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono">CODE: {subPlan?.code || 'free_trial'}</span>
                        </div>
                      </div>
                      
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-tight ${
                        subStatus === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          : subStatus === 'trial'
                          ? 'bg-blue-50 text-blue-700 border border-blue-100'
                          : subStatus === 'suspended'
                          ? 'bg-amber-50 text-amber-700 border border-amber-100'
                          : 'bg-rose-50 text-rose-700 border border-rose-100'
                      }`}>
                        {subStatus === 'active' && 'نشط / فعال'}
                        {subStatus === 'trial' && 'تحت التجربة المجانية'}
                        {subStatus === 'suspended' && 'موقوف مؤقتاً'}
                        {subStatus === 'past_due' && 'متأخر الدفع'}
                        {subStatus === 'cancelled' && 'ملغي'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-medium text-slate-700">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 block">دورة الفوترة:</span>
                        <p className="font-bold text-slate-900">
                          {subscription?.billing_cycle === 'monthly' && 'شهري'}
                          {subscription?.billing_cycle === 'yearly' && 'سنوي'}
                          {subscription?.billing_cycle === 'manual' && 'يدوي بالاتفاق'}
                          {!subscription?.billing_cycle && 'شهري'}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 block">تاريخ انتهاء الصلاحية:</span>
                        <p className="font-mono text-slate-900">
                          {subStatus === 'trial' 
                            ? subscription?.trial_ends_at ? new Date(subscription.trial_ends_at).toLocaleDateString('ar-SA') : 'منتهي'
                            : subscription?.ends_at ? new Date(subscription.ends_at).toLocaleDateString('ar-SA') : 'مفتوح'
                          }
                        </p>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 block">تاريخ بدء الاشتراك:</span>
                        <p className="font-mono text-slate-900">
                          {subscription?.starts_at ? new Date(subscription.starts_at).toLocaleDateString('ar-SA') : 'غير محدد'}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 block">المنشأة المستفيدة:</span>
                        <p className="font-bold text-slate-900">
                          {currentOrg?.name_ar || currentOrg?.name_en}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Pricing Info Notice Banner */}
                  <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 space-y-3 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-24 h-24 bg-slate-800 rounded-full blur-xl opacity-30 pointer-events-none" />
                    <h5 className="text-xs font-black text-slate-300">طريقة التجديد والترقية اليدوية</h5>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      الاشتراك في منصة لِدجرا يتم بالكامل يدوياً وبدون سحب تلقائي للبطاقات. لتمديد صلاحية الفترة التجريبية أو تفعيل الباقة (الأساسية، الاحترافية، أو باقة الشركات)، يرجى النقر على زر التواصل لفتح محادثة فورية مع مهندس المبيعات والدعم الفني بالواتساب.
                    </p>
                    <div className="pt-2 text-[10px] text-slate-400">
                      * يرجى إرفاق اسم المنشأة والبريد الضريبي المسجل لتسريع تفعيل باقتك.
                    </div>
                  </div>
                </div>

                {/* Right Action column */}
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-center space-y-4">
                    <div className="w-10 h-10 bg-brand-blue/10 text-brand-blue rounded-full flex items-center justify-center mx-auto">
                      <MessageCircle className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h5 className="text-xs font-black text-slate-900">تفعيل أو ترقية الباقة</h5>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        لتفعيل أو ترقية الاشتراك، تواصل معنا عبر واتساب مباشرة.
                      </p>
                    </div>

                    <a
                      href={`https://wa.me/966500000000?text=${encodeURIComponent(
                        `مرحبًا، أرغب في تفعيل أو ترقية باقة اشتراكي في منصة لِدجرا للمحاسبة السحابية. منشأتي: ${currentOrg?.name_ar || currentOrg?.name_en || 'غير مسماة'}.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>تواصل معنا بالواتساب</span>
                    </a>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
};
export default Settings;
