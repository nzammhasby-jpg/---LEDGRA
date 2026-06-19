import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { accountingService } from '../../lib/accountingService';
import { Account, AccountingSettings as IAccountingSettings } from '../../types';
import { 
  Settings, 
  Save, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  ShieldAlert, 
  Wallet, 
  TrendingUp, 
  Scale 
} from 'lucide-react';

export const AccountingSettings: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data States
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [leafAccounts, setLeafAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<Partial<IAccountingSettings>>({});

  const isPrivileged = ['owner', 'admin', 'accountant'].includes(roleInCurrentOrg || '');

  const loadSettingsData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      // 1. Fetch all accounts
      const accountsList = await accountingService.getAccounts(currentOrg.id);
      setAllAccounts(accountsList);

      // Filter only active & leaf accounts (where direct posting is allowed)
      const leaves = accountsList.filter(acc => acc.is_active && acc.allow_direct_posting);
      setLeafAccounts(leaves);

      // 2. Fetch current settings
      const currentSettings = await accountingService.getAccountingSettings(currentOrg.id);
      if (currentSettings) {
        setSettings(currentSettings);
      } else {
        setSettings({});
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'حدث خطأ أثناء تحميل إعدادات الحسابات المحاسبية الافتراضية.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettingsData();
  }, [currentOrg]);

  const handleFieldChange = (field: keyof IAccountingSettings, value: string | null) => {
    if (!isPrivileged) return;
    setSettings(prev => ({
      ...prev,
      [field]: value || null
    }));
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !isPrivileged) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await accountingService.updateAccountingSettings(currentOrg.id, settings);
      setSettings(updated);
      setSuccess('تم حفظ وتعريف إعدادات الحسابات الافتراضية للمنشأة بنجاح.');
      
      // Auto dismiss success toast after 4s
      setTimeout(() => {
        setSuccess(null);
      }, 4000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'فشل حفظ الإعدادات، يرجى التأكد من صلاحيات الحساب وتصنيفاته.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-brand-blue animate-spin" />
        <span className="text-xs text-slate-500 font-semibold">جاري جلب إعدادات الحسابات الافتراضية...</span>
      </div>
    );
  }

  // Group accounts helper to display beautifully
  const renderAccountSelect = (
    field: keyof IAccountingSettings, 
    label: string, 
    placeholder: string,
    filterFn?: (acc: Account) => boolean
  ) => {
    const value = (settings[field] as string) || '';
    const filteredOptions = filterFn ? leafAccounts.filter(filterFn) : leafAccounts;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        <label className="text-[10.5px] font-bold text-slate-700 flex items-center justify-between">
          <span>{label}</span>
          {value && (
            <span className="font-mono text-[9px] text-brand-blue bg-brand-blue/5 px-1.5 py-0.5 rounded">
              LTR {leafAccounts.find(a => a.id === value)?.code || ''}
            </span>
          )}
        </label>
        <select
          value={value}
          disabled={!isPrivileged || saving}
          onChange={(e) => handleFieldChange(field, e.target.value || null)}
          className={`w-full px-3.5 py-2.5 text-xs text-slate-800 bg-white border rounded-xl outline-none transition-all ${
            !isPrivileged 
              ? 'bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed'
              : 'border-slate-200 hover:border-slate-300 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10'
          }`}
        >
          <option value="">{placeholder}</option>
          {filteredOptions.map(acc => (
            <option key={acc.id} value={acc.id}>
              {acc.code} - {acc.name_ar} {acc.name_en ? `(${acc.name_en})` : ''}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <form onSubmit={handleSaveSettings} className="space-y-6 text-right font-sans" dir="rtl">
      
      {/* Messages */}
      {error && (
        <div className="bg-red-50/70 border border-red-100 text-red-600 rounded-2xl p-4 text-xs font-semibold flex items-start gap-2.5 leading-relaxed">
          <AlertCircle className="w-4.5 h-4.5 text-red-500 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50/70 border border-emerald-100 text-emerald-700 rounded-2xl p-4 text-xs font-semibold flex items-center gap-2.5">
          <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Role Warnings */}
      {!isPrivileged && (
        <div className="bg-amber-50/60 border border-amber-100 text-amber-700 rounded-2xl p-4 text-xs font-semibold flex items-start gap-2.5 leading-relaxed">
          <ShieldAlert className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <span className="block font-bold">صلاحيات العرض والقراءة فقط</span>
            <span className="text-[11px] text-amber-600 font-normal">
              حسابك الحالي كموظف أو مشاهد لا يملك الصلاحية لتعديل محددات الحسابات الافتراضية. يحق لمالك المنشأة، المدير المالي ومحاسب النظام فقط حفظ هذه الإعدادات.
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* SECTION 1: ASSETS CONFIGURATION */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-slate-50 pb-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-slate-800">حسابات الأصول والمخازن</h3>
              <p className="text-[9.5px] text-slate-400">تحديد الحسابات الافتراضية للمدفوعات النقدية والبنكية والمخزون.</p>
            </div>
          </div>

          <div className="space-y-4">
            {renderAccountSelect(
              'default_cash_account_id',
              'الحساب النقدي للصندوق (خزينة المنشأة)',
              'اختر حساب الصندوق الرئيسي...',
              (acc) => acc.classification === 'assets'
            )}

            {renderAccountSelect(
              'default_bank_account_id',
              'الحساب البنكي الافتراضي للمخرجات والتسويات',
              'اختر البنك الافتراضي للمنشأة...',
              (acc) => acc.classification === 'assets'
            )}

            {renderAccountSelect(
              'default_receivables_account_id',
              'حساب ذمم العملاء (Receivables)',
              'اختر حساب العملاء الموحد...',
              (acc) => acc.classification === 'assets'
            )}

            {renderAccountSelect(
              'default_inventory_account_id',
              'حساب المخزون السلعي المستمر (Assets)',
              'اختر الحساب الجاري للمخازن...',
              (acc) => acc.classification === 'assets'
            )}
          </div>
        </div>

        {/* SECTION 2: LIABILITIES & EQUITY */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-slate-50 pb-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-slate-800">الالتزامات وحقوق الملكية والضرائب</h3>
              <p className="text-[9.5px] text-slate-400">تحديد محددات الموردين وحسابات القيمة المضافة والأرباح.</p>
            </div>
          </div>

          <div className="space-y-4">
            {renderAccountSelect(
              'default_payables_account_id',
              'حساب ذمم الموردين والدائنين (Payables)',
              'اختر حساب الموردين الموحد...',
              (acc) => acc.classification === 'liabilities'
            )}

            {renderAccountSelect(
              'default_tax_input_account_id',
              'حساب ضريبة مدخلات المشتريات (VAT Input)',
              'اختر حساب الضريبة المدخلة للمشتريات...',
              (acc) => acc.classification === 'assets'
            )}

            {renderAccountSelect(
              'default_tax_output_account_id',
              'حساب ضريبة مخرجات المبيعات (VAT Output)',
              'اختر حساب الضريبة المخرجة للمبيعات...',
              (acc) => acc.classification === 'liabilities'
            )}

            {renderAccountSelect(
              'default_retained_earnings_account_id',
              'حساب الأرباح والخسائر المبقاة (Equity)',
              'اختر حساب الأرباح المدورة...',
              (acc) => acc.classification === 'equity'
            )}
          </div>
        </div>

        {/* SECTION 3: REVENUE & COST OF OPERATIONS */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-slate-50 pb-3">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-slate-800">حسابات الإيرادات وتكاليف المبيعات</h3>
              <p className="text-[9.5px] text-slate-400">توجيه العمليات المالية للمبيعات البضائعية والخدمات وتكلفتها.</p>
            </div>
          </div>

          <div className="space-y-4">
            {renderAccountSelect(
              'default_sales_account_id',
              'حساب مبيعات المنتجات والسلع البضائعية (Revenue)',
              'اختر إيرادات بيع المنتجات والسلع...',
              (acc) => acc.classification === 'revenue'
            )}

            {renderAccountSelect(
              'default_service_sales_account_id',
              'حساب إيرادات الخدمات والاستشارات (Revenue)',
              'اختر إيرادات الخدمات...',
              (acc) => acc.classification === 'revenue'
            )}

            {renderAccountSelect(
              'default_cogs_account_id',
              'حساب تكلفة البضاعة المباعة (COGS)',
              'اختر حساب تكلفة المبيعات السلعية...',
              (acc) => acc.classification === 'expenses'
            )}
          </div>
        </div>

      </div>

      {/* Control Actions bar */}
      {isPrivileged && (
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between gap-4">
          <span className="text-[10.5px] font-semibold text-slate-500">
            يرجى مراجعة تناسق وفاعلية فئات الحسابات المختارة وتأكيد تفعيلها كحسابات ترحيل أخيرة.
          </span>
          <button
            type="submit"
            disabled={saving}
            className="bg-brand-blue hover:bg-brand-blue/90 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl border border-brand-blue/10 flex items-center gap-2 cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>جاري الحفظ والتدقيق...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>حفظ محددات الحسابات المعتمدة</span>
              </>
            )}
          </button>
        </div>
      )}

    </form>
  );
};
