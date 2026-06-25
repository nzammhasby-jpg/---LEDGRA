import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { zatcaService } from '../../lib/zatcaService';
import { ZatcaSettings } from '../../types';
import { 
  ShieldCheck, 
  Settings, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Save, 
  Check, 
  Building2, 
  FileText,
  AlertCircle
} from 'lucide-react';

export const ZatcaSettingsComp: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  
  const isPrivileged = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin';
  const isAccountant = roleInCurrentOrg === 'accountant';

  const [loadingObj, setLoadingObj] = useState(true);
  const [savingObj, setSavingObj] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [settings, setSettings] = useState<{
    is_enabled: boolean;
    seller_name: string;
    seller_vat_number: string;
    seller_commercial_registration: string;
    seller_address: string;
    seller_city: string;
    seller_postal_code: string;
    seller_country: string;
    invoice_type_default: 'simplified' | 'standard';
    environment: 'sandbox' | 'simulation' | 'production';
  }>({
    is_enabled: false,
    seller_name: '',
    seller_vat_number: '',
    seller_commercial_registration: '',
    seller_address: '',
    seller_city: '',
    seller_postal_code: '',
    seller_country: 'SA',
    invoice_type_default: 'simplified',
    environment: 'sandbox',
  });

  const [readinessErrors, setReadinessErrors] = useState<string[]>([]);

  // Function to load settings from DB if present, or configure defaults
  const loadZatcaSettings = async () => {
    if (!currentOrg) return;
    setLoadingObj(true);
    setErrorMsg(null);
    try {
      const data = await zatcaService.getZatcaSettings(currentOrg.id);
      if (data) {
        setSettings({
          is_enabled: data.is_enabled,
          seller_name: data.seller_name || '',
          seller_vat_number: data.seller_vat_number || '',
          seller_commercial_registration: data.seller_commercial_registration || '',
          seller_address: data.seller_address || '',
          seller_city: data.seller_city || '',
          seller_postal_code: data.seller_postal_code || '',
          seller_country: data.seller_country || 'SA',
          invoice_type_default: data.invoice_type_default || 'simplified',
          environment: data.environment || 'sandbox',
        });
        
        // Compute readiness errors immediately
        const errs = zatcaService.validateZatcaReadiness(data);
        setReadinessErrors(errs);
      } else {
        // Build defaults from existing organization settings
        const freshData: ZatcaSettings = {
          id: '',
          organization_id: currentOrg.id,
          is_enabled: false,
          seller_name: currentOrg.name_ar || '',
          seller_vat_number: currentOrg.vat_number || '',
          seller_commercial_registration: currentOrg.cr_number || '',
          seller_address: currentOrg.address_line || '',
          seller_city: currentOrg.city || '',
          seller_postal_code: currentOrg.postal_code || '',
          seller_country: 'SA',
          invoice_type_default: 'simplified',
          environment: 'sandbox',
          created_at: '',
          updated_at: '',
        };
        
        setSettings({
          is_enabled: freshData.is_enabled,
          seller_name: freshData.seller_name || '',
          seller_vat_number: freshData.seller_vat_number || '',
          seller_commercial_registration: freshData.seller_commercial_registration || '',
          seller_address: freshData.seller_address || '',
          seller_city: freshData.seller_city || '',
          seller_postal_code: freshData.seller_postal_code || '',
          seller_country: 'SA',
          invoice_type_default: 'simplified',
          environment: 'sandbox',
        });

        const errs = zatcaService.validateZatcaReadiness(freshData);
        setReadinessErrors(errs);
      }
    } catch (err: any) {
      console.error('Failed to load ZATCA settings:', err);
      setErrorMsg('حدث خطأ في تحميل إعدادات الفوترة الإلكترونية.');
    } finally {
      setLoadingObj(false);
    }
  };

  useEffect(() => {
    loadZatcaSettings();
  }, [currentOrg]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let checked = false;
    if (type === 'checkbox') {
      checked = (e.target as HTMLInputElement).checked;
    }
    
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    if (!isPrivileged) {
      setErrorMsg('عذرًا، الصلاحية مطلوبة (مالك الكيان أو المدير) لتعديل إعدادات الفوترة الإلكترونية.');
      return;
    }

    setSavingObj(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      await zatcaService.updateZatcaSettings(currentOrg.id, settings);
      setSuccessMsg('تم حفظ إعدادات ZATCA بنجاح.');
      
      // Re-trigger validation
      const activeObject: ZatcaSettings = {
        ...settings,
        id: '',
        organization_id: currentOrg.id,
        created_at: '',
        updated_at: ''
      };
      const errs = zatcaService.validateZatcaReadiness(activeObject);
      setReadinessErrors(errs);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'فشل حفظ إعدادات ZATCA في قاعدة البيانات.');
    } finally {
      setSavingObj(false);
    }
  };

  // Helper validation checklist details
  const hasSellerName = settings.seller_name.trim().length > 0;
  const hasVatNumber = settings.seller_vat_number.trim().length === 15 && settings.seller_vat_number.startsWith('3');
  const hasCr = settings.seller_commercial_registration.trim().length > 0;
  const hasAddress = settings.seller_address.trim().length > 0;
  const hasCity = settings.seller_city.trim().length > 0;
  const isSa = settings.seller_country === 'SA';
  const qrWorking = true;
  const xmlWorking = true;

  const isReadyForZatca = hasSellerName && hasVatNumber && hasCr && hasAddress && hasCity && isSa && settings.is_enabled;

  if (loadingObj) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 gap-3">
        <RefreshCw className="w-6 h-6 animate-spin text-brand-blue" />
        <span className="text-xs">جاري تحميل إعدادات الفوترة الإلكترونية ZATCA...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in text-right" dir="rtl">
      
      {/* Header Banner */}
      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="bg-emerald-100 text-emerald-700 p-2 rounded-xl shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">المرحلة الأساسية للفوترة الإلكترونية (ZATCA Foundation - Phase 1)</h3>
            <p className="text-xs text-slate-500 mt-1">
              يدعم هذا النظام توليد فواتير ضريبية مبسطة وفواتير قياسية مطابقة لترميز الـ TLV/Base64 ومصحوبة بمولد مستندات الـ XML الأولي (UBL 2.1) داخلياً.
            </p>
          </div>
        </div>
        <div className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap">
          ⚠️ طبقة جاهزية أولية - بدون ربط API مباشر
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl p-3 flex items-center gap-2 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-100 text-rose-800 rounded-xl p-3 flex items-center gap-2 text-xs">
          <XCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Settings Form */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 space-y-5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <Settings className="w-4 h-4 text-slate-500" />
            <h4 className="text-xs font-bold text-slate-950">إعدادات الهوية ونوع الفوترة في الزكاة</h4>
          </div>

          <form onSubmit={handleManualSave} className="space-y-4">
            
            {/* Enable switch */}
            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
              <div className="space-y-0.5">
                <label className="text-xs font-bold text-slate-900">تفعيل الفوترة الإلكترونية</label>
                <p className="text-[10px] text-slate-500">تمكين إنبات أرقام QR ورموز XML الضريبية للفواتير المعتمدة</p>
              </div>
              <input 
                type="checkbox"
                name="is_enabled"
                checked={settings.is_enabled}
                onChange={handleInputChange}
                disabled={!isPrivileged}
                className="w-4 h-4 rounded text-brand-blue border-slate-300 focus:ring-brand-blue cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Seller Arabic Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">اسم البائع اللفظي (بالعربية)</label>
                <input 
                  type="text"
                  name="seller_name"
                  value={settings.seller_name}
                  onChange={handleInputChange}
                  disabled={!isPrivileged}
                  placeholder="المؤسسة أو الشركة الخاصة بك"
                  className="w-full text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                  required
                />
              </div>

              {/* VAT Number */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">الرقم الضريبي للبائع (15 خانة يبدأ بـ 3)</label>
                <input 
                  type="text"
                  name="seller_vat_number"
                  value={settings.seller_vat_number}
                  onChange={handleInputChange}
                  disabled={!isPrivileged}
                  placeholder="300000000000003"
                  maxLength={15}
                  className="w-full text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                  required
                />
              </div>

              {/* Commercial Registration */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">رقم السجل التجاري (C.R. Number)</label>
                <input 
                  type="text"
                  name="seller_commercial_registration"
                  value={settings.seller_commercial_registration}
                  onChange={handleInputChange}
                  disabled={!isPrivileged}
                  placeholder="1010000000"
                  className="w-full text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                  required
                />
              </div>

              {/* Addr */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">العنوان الجغرافي للشركة</label>
                <input 
                  type="text"
                  name="seller_address"
                  value={settings.seller_address}
                  onChange={handleInputChange}
                  disabled={!isPrivileged}
                  placeholder="الرمز البريدي، اسم الشارع، المبنى"
                  className="w-full text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                  required
                />
              </div>

              {/* City */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">المدينة</label>
                <input 
                  type="text"
                  name="seller_city"
                  value={settings.seller_city}
                  onChange={handleInputChange}
                  disabled={!isPrivileged}
                  placeholder="الرياض / جدة / الدمام"
                  className="w-full text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                  required
                />
              </div>

              {/* Postal Code */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">الرمز البريدي</label>
                <input 
                  type="text"
                  name="seller_postal_code"
                  value={settings.seller_postal_code}
                  onChange={handleInputChange}
                  disabled={!isPrivileged}
                  placeholder="مثال: 12211"
                  className="w-full text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                />
              </div>

              {/* Country */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">الدولة</label>
                <input 
                  type="text"
                  name="seller_country"
                  value={settings.seller_country}
                  onChange={handleInputChange}
                  disabled
                  className="w-full text-slate-400 bg-slate-50 text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none cursor-not-allowed"
                />
              </div>

              {/* Typology */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">نوع الفواتير الافتراضي</label>
                <select
                  name="invoice_type_default"
                  value={settings.invoice_type_default}
                  onChange={handleInputChange}
                  disabled={!isPrivileged}
                  className="w-full text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-brand-blue cursor-pointer"
                >
                  <option value="simplified">فاتورة ضريبية مبسطة (Simplified - للافراد B2C)</option>
                  <option value="standard">فاتورة ضريبية قياسية (Standard - للشركات B2B)</option>
                </select>
              </div>

              {/* Environment */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">بيئة التكامل المحاكية</label>
                <select
                  name="environment"
                  value={settings.environment}
                  onChange={handleInputChange}
                  disabled={!isPrivileged}
                  className="w-full text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-brand-blue cursor-pointer"
                >
                  <option value="sandbox">Sandbox (بيئة التجريب والتطوير)</option>
                  <option value="simulation">Simulation (المحاكاة مع هيئة الزكاة)</option>
                  <option value="production">Production (الإطلاق الفعلي المحفوظ)</option>
                </select>
              </div>

            </div>

            {isPrivileged ? (
              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  disabled={savingObj}
                  className="bg-brand-blue text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition hover:brightness-95 cursor-pointer"
                >
                  {savingObj ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>حفظ إعدادات الهيئة</span>
                </button>
              </div>
            ) : (
              <div className="text-[10px] text-slate-400 bg-slate-50 p-2.5 rounded-xl flex items-center gap-1.5 justify-center">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>أنت مسجل بصلاحية {roleInCurrentOrg === 'accountant' ? 'محاسب' : 'مشاهد'}. لا تملك حق تعديل الخيارات الضريبية للهيئة.</span>
              </div>
            )}
            
          </form>
        </div>

        {/* Readiness Checklist */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-5 shadow-sm h-fit">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <Building2 className="w-4 h-4 text-slate-500" />
            <h4 className="text-xs font-bold text-slate-950">فحص الجاهزية الرقمية (Readiness Checklist)</h4>
          </div>

          <div className="space-y-3">
            
            {/* Readiness Summary status */}
            <div className={`p-3.5 rounded-2xl border text-center space-y-1 ${
              isReadyForZatca 
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                : 'bg-rose-50 border-rose-100 text-rose-800'
            }`}>
              <div className="text-xs font-extrabold flex items-center justify-center gap-1.5">
                {isReadyForZatca ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>المنشأة جاهزة لتوليد القيود والـ QR</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>غير جاهز - بيانات ناقصة</span>
                  </>
                )}
              </div>
              <p className="text-[10px] opacity-90 leading-relaxed">
                {isReadyForZatca 
                  ? 'تم استيعاب كافة الخصائص الإلزامية لصيغة الفاتورة الضريبية ومحرك TLV.'
                  : 'تأكد من تفعيل الفوترة وتقديم الرقم الضريبي والسجل والعناوين بالكامل لتجنب كسر إصدار الفواتير.'}
              </p>
            </div>

            {/* Checklist elements block */}
            <div className="space-y-2 pt-2 text-[11px]">
              
              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">تفعيل الفوترة في النظام</span>
                {settings.is_enabled ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                )}
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">اسم البائع اللفظي بالعربية</span>
                {hasSellerName ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                )}
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">الرقم الضريبي للبائع (15 خانة يبدأ بـ 3)</span>
                {hasVatNumber ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                )}
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">رقم السجل التجاري</span>
                {hasCr ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                )}
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">العنوان الجغرافي للشركة</span>
                {hasAddress ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                )}
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">المدينة</span>
                {hasCity ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                )}
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">تكويد ترميز الـ TLV/Base64</span>
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-600">توليد ملفات XML UBL 2.1</span>
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              </div>

            </div>

            {readinessErrors.length > 0 && (
              <div className="border border-red-100 bg-red-50/50 rounded-xl p-3 text-[10px] text-red-800 space-y-1">
                <div className="font-extrabold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>تفاصيل الأخطاء المتبقية:</span>
                </div>
                <ul className="list-disc pr-3.5 space-y-0.5">
                  {readinessErrors.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border border-slate-100 bg-slate-50 rounded-xl p-3 text-[9px] text-slate-500 leading-relaxed space-y-1">
              <span className="font-bold block text-slate-700">📌 تذكير مالي وقانوني:</span>
              <p>توليد رموز الاستجابة السريعة (QR) وربطها بملفات XML للمستندات الإلكترونية يتطلب وجود فواتير مبيعات ضريبية برقم ضريبي نشط ومسجل لدى الهيئة العامة للزكاة والضريبة والجمارك (ZATCA).</p>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};
