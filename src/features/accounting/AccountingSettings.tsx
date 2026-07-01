import React, { useState, useEffect, useMemo } from 'react';
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
  Scale,
  Coins,
  Percent,
  Activity,
  FileCheck2,
  XCircle,
  HelpCircle,
  FolderLock,
  Lock,
  ArrowLeft,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

interface CheckResult {
  status: 'completed' | 'not_configured' | 'needs_review';
  message: string;
}

export const AccountingSettings: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data States
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<Partial<IAccountingSettings>>({});
  
  // Verification check details
  const [showCheckResult, setShowCheckResult] = useState<boolean>(false);
  const [checkSummary, setCheckSummary] = useState<{
    completed: number;
    missing: number;
    invalid: number;
    issues: string[];
  } | null>(null);

  // Roles permission check
  const isOwnerOrAdmin = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin';
  const isAccountant = roleInCurrentOrg === 'accountant';
  const isSales = roleInCurrentOrg === 'sales';
  const canEdit = isOwnerOrAdmin;
  const canView = isOwnerOrAdmin || isAccountant;

  // Set of parent IDs that have children
  const parentIdsSet = useMemo(() => {
    return new Set(allAccounts.map(a => a.parent_id).filter(Boolean));
  }, [allAccounts]);

  // Load configuration and accounts list
  const loadSettingsData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    setShowCheckResult(false);
    try {
      // 1. Fetch all accounts
      const accountsList = await accountingService.getAccounts(currentOrg.id);
      setAllAccounts(accountsList);

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

  // Translate database/RPC error messages to human-friendly Arabic
  const translateSettingsRPCError = (err: any): string => {
    const msg = err?.message || err?.details || String(err);
    if (msg.includes('غير متاح للترحيل المباشر') || msg.includes('حساب رتبة تجميعية')) {
      return 'خطأ في الربط: أحد الحسابات المحددة هو حساب رئيسي/تجميعي ولا يسمح بالترحيل المباشر عليه. يرجى اختيار حسابات فرعية نهائية.';
    }
    if (msg.includes('لا ينتمي لهذه المنشأة')) {
      return 'خطأ أمني: الحساب المحدد لا ينتمي للمنشأة الحالية.';
    }
    if (msg.includes('معطل وغير نشط')) {
      return 'خطأ: أحد الحسابات المحددة معطل أو تم إيقاف تنشيطه. يرجى تفعيل الحساب أولاً أو اختيار حساب نشط آخر.';
    }
    if (msg.includes('خطأ في تصفية الحساب') || msg.includes('التصنيف المطلوب هو')) {
      return 'خطأ في التصنيف: تصنيف الحساب المختار غير مناسب للإعداد المحاسبي المحدد.';
    }
    if (msg.includes('ليس لديك الصلاحية') || msg.includes('غير مصرح')) {
      return 'صلاحية مرفوضة: لا تملك الصلاحيات الكافية لتعديل الإعدادات المحاسبية الافتراضية.';
    }
    return msg;
  };

  // Helper function to check status of a specific setting in real-time
  const getFieldStatus = (
    field: keyof IAccountingSettings,
    expectedClassification: string
  ): CheckResult => {
    const accountId = settings[field];
    if (!accountId) {
      return { status: 'not_configured', message: 'غير مضبوط' };
    }
    const acc = allAccounts.find(a => a.id === accountId);
    if (!acc) {
      return { status: 'needs_review', message: 'الحساب غير موجود بالنظام' };
    }
    if (!acc.is_active) {
      return { status: 'needs_review', message: 'الحساب غير نشط حالياً' };
    }
    if (!acc.allow_direct_posting) {
      return { status: 'needs_review', message: 'الحساب تجميعي/رئيسي لا يقبل الترحيل المباشر' };
    }
    if (parentIdsSet.has(acc.id)) {
      return { status: 'needs_review', message: 'الحساب يحتوي على حسابات فرعية تابعة له' };
    }
    if (acc.classification !== expectedClassification) {
      return { 
        status: 'needs_review', 
        message: `التصنيف غير متطابق (المتوقع: ${translateClassification(expectedClassification)})` 
      };
    }
    return { status: 'completed', message: 'مكتمل وصحيح' };
  };

  // Translate classifications for labels
  const translateClassification = (cls: string): string => {
    switch (cls) {
      case 'assets': return 'أصول';
      case 'liabilities': return 'التزامات';
      case 'equity': return 'حقوق ملكية';
      case 'revenue': return 'إيرادات';
      case 'expenses': return 'مصروفات';
      default: return cls;
    }
  };

  // Check Settings function (runs local verification summary)
  const handleCheckSettings = () => {
    setChecking(true);
    setError(null);
    setSuccess(null);

    const fieldDefinitions: { field: keyof IAccountingSettings; label: string; expected: string; optional?: boolean }[] = [
      { field: 'default_cash_account_id', label: 'حساب الصندوق', expected: 'assets' },
      { field: 'default_bank_account_id', label: 'حساب البنك', expected: 'assets' },
      { field: 'default_receivables_account_id', label: 'حساب العملاء / الذمم المدينة', expected: 'assets' },
      { field: 'default_payables_account_id', label: 'حساب الموردين / الذمم الدائنة', expected: 'liabilities' },
      { field: 'default_sales_account_id', label: 'حساب مبيعات السلع', expected: 'revenue' },
      { field: 'default_service_sales_account_id', label: 'حساب مبيعات الخدمات', expected: 'revenue' },
      { field: 'default_tax_output_account_id', label: 'حساب ضريبة المخرجات', expected: 'liabilities' },
      { field: 'default_tax_input_account_id', label: 'حساب ضريبة المدخلات', expected: 'assets' },
      { field: 'default_inventory_account_id', label: 'حساب المخزون', expected: 'assets', optional: true },
      { field: 'default_cogs_account_id', label: 'حساب تكلفة البضاعة المباعة', expected: 'expenses', optional: true },
      { field: 'default_retained_earnings_account_id', label: 'حساب الأرباح المبقاة', expected: 'equity' },
    ];

    let completed = 0;
    let missing = 0;
    let invalid = 0;
    const issues: string[] = [];

    fieldDefinitions.forEach(({ field, label, expected, optional }) => {
      const res = getFieldStatus(field, expected);
      if (res.status === 'completed') {
        completed++;
      } else if (res.status === 'not_configured') {
        if (optional) {
          completed++; // Optional can be counted as complete if not used
        } else {
          missing++;
          issues.push(`الإعداد "${label}" غير معين حالياً وهو مطلوب للعمليات المالية.`);
        }
      } else if (res.status === 'needs_review') {
        invalid++;
        issues.push(`الإعداد "${label}" يحتاج إلى مراجعة: ${res.message}.`);
      }
    });

    setCheckSummary({
      completed,
      missing,
      invalid,
      issues
    });
    setShowCheckResult(true);
    setChecking(false);

    if (issues.length === 0) {
      setSuccess('فحص الإعدادات: جميع الحسابات الافتراضية مضبوطة بشكل متوافق تماماً وسليم للقيود التلقائية.');
    } else {
      setError('فحص الإعدادات: تم العثور على إعدادات مفقودة أو غير صالحة تحتاج إلى تصحيح.');
    }
  };

  // Filtered accounts for selections
  const getFilteredAccounts = (expectedClassification: string): Account[] => {
    return allAccounts.filter(acc => 
      acc.is_active && 
      acc.allow_direct_posting && 
      acc.classification === expectedClassification &&
      !parentIdsSet.has(acc.id)
    );
  };

  const handleFieldChange = (field: keyof IAccountingSettings, value: string | null) => {
    if (!canEdit) return;
    setSettings(prev => ({
      ...prev,
      [field]: value || null
    }));
  };

  // Submit Handler
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !canEdit) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    setShowCheckResult(false);

    // Business validations before saving
    const missingRequired: string[] = [];
    if (!settings.default_cash_account_id) missingRequired.push('حساب الصندوق');
    if (!settings.default_bank_account_id) missingRequired.push('حساب البنك');
    if (!settings.default_receivables_account_id) missingRequired.push('حساب العملاء / الذمم المدينة');
    if (!settings.default_payables_account_id) missingRequired.push('حساب الموردين / الذمم الدائنة');
    if (!settings.default_tax_output_account_id) missingRequired.push('حساب ضريبة المخرجات');
    if (!settings.default_tax_input_account_id) missingRequired.push('حساب ضريبة المدخلات');
    if (!settings.default_retained_earnings_account_id) missingRequired.push('حساب الأرباح المبقاة');

    // At least one of product or service sales must be set
    if (!settings.default_sales_account_id && !settings.default_service_sales_account_id) {
      missingRequired.push('يجب تحديد حساب مبيعات السلع أو حساب مبيعات الخدمات على الأقل لفوترة الإيرادات.');
    }

    if (missingRequired.length > 0) {
      setError(`لا يمكن حفظ الإعدادات، الحقول التالية مطلوبة ويجب ضبطها أولاً: ${missingRequired.join(' ، ')}.`);
      setSaving(false);
      return;
    }

    // Verify all set accounts are client-side valid
    const fieldDefinitions: { field: keyof IAccountingSettings; label: string; expected: string }[] = [
      { field: 'default_cash_account_id', label: 'حساب الصندوق', expected: 'assets' },
      { field: 'default_bank_account_id', label: 'حساب البنك', expected: 'assets' },
      { field: 'default_receivables_account_id', label: 'حساب العملاء / الذمم المدينة', expected: 'assets' },
      { field: 'default_payables_account_id', label: 'حساب الموردين / الذمم الدائنة', expected: 'liabilities' },
      { field: 'default_sales_account_id', label: 'حساب مبيعات السلع', expected: 'revenue' },
      { field: 'default_service_sales_account_id', label: 'حساب مبيعات الخدمات', expected: 'revenue' },
      { field: 'default_tax_output_account_id', label: 'حساب ضريبة المخرجات', expected: 'liabilities' },
      { field: 'default_tax_input_account_id', label: 'حساب ضريبة المدخلات', expected: 'assets' },
      { field: 'default_inventory_account_id', label: 'حساب المخزون', expected: 'assets' },
      { field: 'default_cogs_account_id', label: 'حساب تكلفة البضاعة المباعة', expected: 'expenses' },
      { field: 'default_retained_earnings_account_id', label: 'حساب الأرباح المبقاة', expected: 'equity' },
    ];

    const invalidFields: string[] = [];
    fieldDefinitions.forEach(({ field, label, expected }) => {
      const accountId = settings[field];
      if (accountId) {
        const res = getFieldStatus(field, expected);
        if (res.status === 'needs_review') {
          invalidFields.push(`${label} (${res.message})`);
        }
      }
    });

    if (invalidFields.length > 0) {
      setError(`تنبيه: يوجد إعدادات غير صالحة يجب مراجعتها قبل الحفظ: ${invalidFields.join(' ، ')}.`);
      setSaving(false);
      return;
    }

    try {
      const updated = await accountingService.updateAccountingSettings(currentOrg.id, settings);
      setSettings(updated);
      setSuccess('تم حفظ وفحص إعدادات الحسابات الافتراضية بنجاح للقيود التلقائية لـ LEDGRA.');
      
      // Clear alerts after some seconds
      setTimeout(() => {
        setSuccess(null);
      }, 5000);
    } catch (err: any) {
      console.error(err);
      setError(translateSettingsRPCError(err));
    } finally {
      setSaving(false);
    }
  };

  // If role is Sales, show forbidden view immediately
  if (isSales) {
    return (
      <div className="bg-white border border-red-100 rounded-3xl p-10 text-center max-w-2xl mx-auto my-12 shadow-sm space-y-4 font-sans" dir="rtl">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto text-red-650">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-base font-extrabold text-slate-850">غير مصرح بالوصول</h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          عذرًا، لا تملك الصلاحية الكافية لزيارة أو مراجعة الإعدادات المحاسبية الافتراضية لـ LEDGRA.
          هذه الصفحة مخصصة فقط لمالكي المنشأة، المدراء والمحاسبين المعتمدين لحماية نزاهة وسلامة القيود الآلية.
        </p>
      </div>
    );
  }

  // Loader state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 font-sans">
        <Loader2 className="w-8 h-8 text-brand-blue animate-spin" />
        <span className="text-xs text-slate-500 font-semibold">جاري تحميل إعدادات التوجيه المحاسبي الافتراضي...</span>
      </div>
    );
  }

  // Empty charts warning
  if (allAccounts.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center max-w-2xl mx-auto my-12 shadow-sm space-y-5 font-sans text-right" dir="rtl">
        <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center text-amber-500 mx-auto">
          <FolderLock className="w-7 h-7" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-sm font-extrabold text-slate-800">لم يتم العثور على شجرة الحسابات</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            لم يتم إنشاء الإعدادات المحاسبية بعد. يرجى تأسيس دليل الحسابات أولاً لتتمكن من تعيين الحسابات الافتراضية وإقفالها.
          </p>
        </div>
      </div>
    );
  }

  // Render method for selection field with validation badges and description
  const renderSettingRow = (
    field: keyof IAccountingSettings,
    label: string,
    classification: string,
    optional: boolean = false
  ) => {
    const value = (settings[field] as string) || '';
    const filteredAccounts = getFilteredAccounts(classification);
    const statusResult = getFieldStatus(field, classification);

    return (
      <div className="bg-slate-50/40 hover:bg-slate-50/85 border border-slate-100 rounded-2xl p-4.5 space-y-3 transition">
        <div className="flex items-start justify-between gap-2.5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] font-bold text-slate-800 font-sans">{label}</span>
              {optional && (
                <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-sans">اختياري للخدمات</span>
              )}
            </div>
            <p className="text-[9.5px] text-slate-400">
              التصنيف المطلوب: <strong className="text-slate-500 font-bold">{translateClassification(classification)}</strong>
            </p>
          </div>

          {/* Validation Status Badge */}
          <div>
            {statusResult.status === 'completed' && (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>مكتمل</span>
              </span>
            )}
            {statusResult.status === 'not_configured' && (
              <span className={`text-[10px] font-bold ${optional ? 'text-slate-500 bg-slate-50' : 'text-amber-600 bg-amber-50 border border-amber-100'} px-2.5 py-1 rounded-lg flex items-center gap-1`}>
                <AlertCircle className="w-3.5 h-3.5" />
                <span>غير مضبوط</span>
              </span>
            )}
            {statusResult.status === 'needs_review' && (
              <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-lg flex items-center gap-1" title={statusResult.message}>
                <XCircle className="w-3.5 h-3.5" />
                <span>يحتاج مراجعة</span>
              </span>
            )}
          </div>
        </div>

        {/* Account Dropdown Select */}
        <div className="relative">
          <select
            value={value}
            disabled={!canEdit || saving}
            onChange={(e) => handleFieldChange(field, e.target.value || null)}
            className={`w-full text-xs bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-700 outline-none transition focus:border-brand-blue ${
              !canEdit ? 'bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed' : 'hover:border-slate-300'
            }`}
          >
            <option value="">« انقر هنا لتحديد الحساب المناسب »</option>
            {filteredAccounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.code} — {acc.name_ar} {acc.name_en ? `(${acc.name_en})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Detailed status error message */}
        {statusResult.status === 'needs_review' && (
          <p className="text-[10px] text-red-650 font-semibold flex items-center gap-1 mt-1 leading-none font-sans">
            <AlertTriangle className="w-3 h-3" />
            <span>{statusResult.message}</span>
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      
      {/* Title section with quick diagnostic controls */}
      <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-1.5 text-right w-full md:w-auto">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-blue/10 flex items-center justify-center text-brand-blue shrink-0">
              <Settings className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-850">ربط الحسابات الافتراضية ومحددات التوجيه المالي</h3>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            مراجعة الحسابات الافتراضية المعتمدة للفواتير، النقد، البنوك، والمخازن. التغيير هنا يؤثر فوراً على التوجيه والترحيل الآلي للقيود اليومية.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={handleCheckSettings}
            disabled={checking || saving}
            className="text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-extrabold px-4.5 py-2.5 rounded-xl transition cursor-pointer flex items-center gap-1.5"
          >
            <Activity className="w-4 h-4 text-brand-blue shrink-0" />
            <span>فحص وضبط الإعدادات</span>
          </button>
        </div>
      </div>

      {/* Security notice / Warning of Accountant privilege */}
      {isAccountant && (
        <div className="bg-amber-50/60 border border-amber-200 text-amber-800 rounded-2xl p-4.5 text-xs font-semibold flex items-start gap-3 leading-relaxed">
          <ShieldAlert className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <span className="block font-bold">صلاحية العرض والقراءة فقط للمحاسب</span>
            <span className="text-[11px] text-amber-600 font-normal block mt-1">
              حسابك الحالي بصفة "محاسب" مخول بمشاهدة وفحص إعدادات التوجيه فقط لتسهيل التدقيق والمطابقة. يتطلب إجراء التعديلات والحفظ صلاحية مالك المنشأة (Owner) أو مدير النظام (Admin).
            </span>
          </div>
        </div>
      )}

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

      {/* Diagnostic check results box */}
      {showCheckResult && checkSummary && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4 animate-fade-in text-right">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileCheck2 className="w-5 h-5 text-brand-blue shrink-0" />
            <h4 className="text-xs font-extrabold text-slate-850">تقرير ملخص الفحص والتحقق الفني</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl p-4.5 space-y-1">
              <span className="text-[10px] text-emerald-600 font-bold block">إعدادات مكتملة وسليمة</span>
              <span className="text-xl font-extrabold text-emerald-700 font-mono block leading-none">{checkSummary.completed}</span>
            </div>
            <div className="bg-amber-50/40 border border-amber-100 rounded-2xl p-4.5 space-y-1">
              <span className="text-[10px] text-amber-600 font-bold block">إعدادات مطلوبة مفقودة</span>
              <span className="text-xl font-extrabold text-amber-700 font-mono block leading-none">{checkSummary.missing}</span>
            </div>
            <div className="bg-red-50/40 border border-red-100 rounded-2xl p-4.5 space-y-1">
              <span className="text-[10px] text-red-600 font-bold block">توجيه غير متطابق/مخالف للضوابط</span>
              <span className="text-xl font-extrabold text-red-700 font-mono block leading-none">{checkSummary.invalid}</span>
            </div>
          </div>

          {checkSummary.issues.length > 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
              <span className="text-[10.5px] font-bold text-slate-500 block">تفاصيل المسائل والملاحظات:</span>
              <ul className="space-y-1.5 pr-2.5 list-disc text-[11px] text-slate-650 font-medium">
                {checkSummary.issues.map((issue, idx) => (
                  <li key={idx} className="leading-relaxed">{issue}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="bg-emerald-50/30 border border-emerald-100 text-emerald-800 rounded-2xl p-4 text-[11px] font-bold">
              • الفحص ممتاز: هيكل التوجيه الافتراضي متوافق بنسبة 100% مع شجرة الحسابات الحالية وجاهز للترحيل التلقائي بدون قيود معلقة.
            </div>
          )}
        </div>
      )}

      {/* CORE CONFIGURATION FORM */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* GROUP A: CASH AND BANKS */}
          <div className="bg-white border border-slate-150 rounded-3xl p-5.5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2.5 border-b border-slate-50 pb-3">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <Coins className="w-4.5 h-4.5" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-800">أ. النقد والبنوك</h4>
                <p className="text-[10px] text-slate-400">توجيه المبالغ المقبوضة والمسددة نقدًا أو المودعة بالبنك.</p>
              </div>
            </div>

            <div className="space-y-4.5">
              {renderSettingRow('default_cash_account_id', 'حساب الصندوق الرئيسي / الكاش', 'assets')}
              {renderSettingRow('default_bank_account_id', 'حساب البنك الرئيسي للشركة', 'assets')}
            </div>
          </div>

          {/* GROUP B: CUSTOMERS AND VENDORS */}
          <div className="bg-white border border-slate-150 rounded-3xl p-5.5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2.5 border-b border-slate-50 pb-3">
              <div className="p-2 bg-blue-50 text-brand-blue rounded-xl">
                <Wallet className="w-4.5 h-4.5" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-800">ب. العملاء والموردون</h4>
                <p className="text-[10px] text-slate-400">إقفال مستحقات فواتير المبيعات وفواتير المشتريات بالذمم المعتمدة.</p>
              </div>
            </div>

            <div className="space-y-4.5">
              {renderSettingRow('default_receivables_account_id', 'حساب ذمم العملاء / المدينون', 'assets')}
              {renderSettingRow('default_payables_account_id', 'حساب ذمم الموردين / الدائنون', 'liabilities')}
            </div>
          </div>

          {/* GROUP C: SALES AND REVENUE */}
          <div className="bg-white border border-slate-150 rounded-3xl p-5.5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2.5 border-b border-slate-50 pb-3">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <TrendingUp className="w-4.5 h-4.5" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-800">ج. المبيعات والإيرادات</h4>
                <p className="text-[10px] text-slate-400">توجيه بنود فواتير المبيعات إلى حساب الإيرادات المناسب.</p>
              </div>
            </div>

            <div className="space-y-4.5">
              {renderSettingRow('default_sales_account_id', 'حساب مبيعات السلع والمنتجات', 'revenue')}
              {renderSettingRow('default_service_sales_account_id', 'حساب مبيعات وإيرادات الخدمات الاستشارية', 'revenue')}
            </div>
          </div>

          {/* GROUP D: TAX SETTINGS */}
          <div className="bg-white border border-slate-150 rounded-3xl p-5.5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2.5 border-b border-slate-50 pb-3">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                <Percent className="w-4.5 h-4.5" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-800">د. ضريبة القيمة المضافة</h4>
                <p className="text-[10px] text-slate-400">فصل المخرجات الضريبية والمدخلات لإصدار الإقرارات المتوافقة.</p>
              </div>
            </div>

            <div className="space-y-4.5">
              {renderSettingRow('default_tax_output_account_id', 'حساب ضريبة مخرجات المبيعات (VAT Output)', 'liabilities')}
              {renderSettingRow('default_tax_input_account_id', 'حساب ضريبة مدخلات المشتريات (VAT Input)', 'assets')}
            </div>
          </div>

          {/* GROUP E: INVENTORY AND COGS */}
          <div className="bg-white border border-slate-150 rounded-3xl p-5.5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2.5 border-b border-slate-50 pb-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Scale className="w-4.5 h-4.5" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-800">هـ. المخزون وتكلفة البضاعة</h4>
                <p className="text-[10px] text-slate-400">حسابات الترحيل والتكلفة المعتمدة للتقييم المستمر للمخازن.</p>
              </div>
            </div>

            <div className="space-y-4.5">
              {renderSettingRow('default_inventory_account_id', 'حساب المخزون الجاري (Assets)', 'assets', true)}
              {renderSettingRow('default_cogs_account_id', 'حساب تكلفة البضاعة المباعة (Expenses)', 'expenses', true)}
            </div>
          </div>

          {/* GROUP F: CLOSING AND EQUITY */}
          <div className="bg-white border border-slate-150 rounded-3xl p-5.5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2.5 border-b border-slate-50 pb-3">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                <Lock className="w-4.5 h-4.5" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-800">و. الإقفال وحقوق الملكية</h4>
                <p className="text-[10px] text-slate-400">الحساب المحدد لترحيل صافي الأرباح والخسائر للسنوات السابقة.</p>
              </div>
            </div>

            <div className="space-y-4.5">
              {renderSettingRow('default_retained_earnings_account_id', 'حساب الأرباح والخسائر المبقاة (Equity)', 'equity')}
            </div>
          </div>

        </div>

        {/* Save and Controls action footer */}
        {canEdit && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-[11px] font-bold text-slate-500 leading-relaxed text-right">
              يرجى التأكد من اختيار حسابات ختامية نشطة وغير تجميعية لضمان عدم حدوث تجميد أو تعليق بالقيود المالية التلقائية للفواتير والمدفوعات.
            </span>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto bg-brand-blue hover:bg-brand-blue-deep text-white font-extrabold text-xs px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-brand-blue/15 shrink-0"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري التحقق والحفظ...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>حفظ محددات الحسابات الافتراضية</span>
                </>
              )}
            </button>
          </div>
        )}

      </form>

    </div>
  );
};
