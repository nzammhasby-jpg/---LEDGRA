import React, { useState, useEffect, useCallback } from 'react';
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
  AlertCircle,
  HelpCircle,
  FileCode,
  QrCode
} from 'lucide-react';

export const ZatcaSettingsComp: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  
  const isPrivileged = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin';

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
      console.error('ZATCA settings load failed:', err);
      setErrorMsg('تعذر تحميل إعدادات الفوترة الإلكترونية. تأكد من تشغيل Migration المرحلة 12 أو راجع صلاحيات المستخدم.');
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

  // Helper validation checklist details computed from settings
  const hasSellerName = settings.seller_name.trim().length > 0;
  
  // Tax number validation: 15 digits, starts with 3, ends with 3, English digits only.
  const hasVatNumber = /^[3]\d{13}[3]$/.test(settings.seller_vat_number.trim());
  const hasCr = settings.seller_commercial_registration.trim().length > 0;
  const hasAddress = settings.seller_address.trim().length > 0;
  const hasCity = settings.seller_city.trim().length > 0;
  const hasPostalCode = settings.seller_postal_code.trim().length > 0;
  const isSa = settings.seller_country === 'SA';

  const isReadyForZatca = settings.is_enabled && hasSellerName && hasVatNumber && hasCr && hasAddress && hasCity && isSa;

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

    // Validate Tax Number format before saving
    if (settings.is_enabled && settings.seller_vat_number.trim().length > 0 && !hasVatNumber) {
      setErrorMsg('الرقم الضريبي يجب أن يكون 15 رقمًا ويبدأ بـ 3 وينتهي بـ 3.');
      setSavingObj(false);
      return;
    }

    try {
      await zatcaService.updateZatcaSettings(currentOrg.id, settings);
      setSuccessMsg('تم حفظ إعدادات الفوترة الإلكترونية بنجاح.');
      
      // Re-trigger validation with saved settings
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
      setErrorMsg(err.message || 'فشل حفظ إعدادات الفوترة الإلكترونية في قاعدة البيانات.');
    } finally {
      setSavingObj(false);
    }
  };

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
      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="bg-slate-100 text-slate-700 p-2.5 rounded-xl shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">الفوترة الإلكترونية</h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              هذه الصفحة تضبط بيانات الفوترة الإلكترونية المستخدمة في توليد QR وملفات XML الأولية للفواتير المعتمدة.
            </p>
          </div>
        </div>
        <div className="bg-slate-200/80 text-slate-800 text-[11px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap">
          مرحلة تأسيسية — بدون ربط API مباشر مع ZATCA
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
            <h4 className="text-xs font-bold text-slate-950">بيانات البائع وإعدادات الفاتورة</h4>
          </div>

          <form onSubmit={handleManualSave} className="space-y-5">
            
            {/* Enable switch */}
            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="space-y-0.5 pl-3">
                <label className="text-xs font-bold text-slate-900 block">تفعيل الفوترة الإلكترونية</label>
                <p className="text-[10px] text-slate-500">تمكين توليد وطباعة أرقام QR ورموز XML الضريبية للفواتير المعتمدة</p>
              </div>
              <input 
                type="checkbox"
                name="is_enabled"
                id="is_enabled"
                checked={settings.is_enabled}
                onChange={handleInputChange}
                disabled={!isPrivileged}
                className="w-5 h-5 rounded text-brand-blue border-slate-300 focus:ring-brand-blue cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Seller Arabic Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block" id="label-seller-name">اسم البائع اللفظي (بالعربية)</label>
                <input 
                  type="text"
                  name="seller_name"
                  id="seller_name"
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
                <label className="text-xs font-bold text-slate-700 block" id="label-vat-number">الرقم الضريبي للبائع</label>
                <input 
                  type="text"
                  name="seller_vat_number"
                  id="seller_vat_number"
                  value={settings.seller_vat_number}
                  onChange={handleInputChange}
                  disabled={!isPrivileged}
                  placeholder="300000000000003"
                  maxLength={15}
                  className={`w-full text-slate-800 text-xs px-3 py-2.5 rounded-xl border outline-none focus:border-brand-blue ${
                    settings.seller_vat_number.trim().length > 0 && !hasVatNumber ? 'border-rose-300 focus:border-rose-400' : 'border-slate-200'
                  }`}
                  required
                />
                {settings.seller_vat_number.trim().length > 0 && !hasVatNumber && (
                  <p className="text-[10px] text-rose-600 font-semibold mt-1">الرقم الضريبي يجب أن يكون 15 رقمًا ويبدأ بـ 3 وينتهي بـ 3.</p>
                )}
              </div>

              {/* Commercial Registration */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block" id="label-cr">رقم السجل التجاري</label>
                <input 
                  type="text"
                  name="seller_commercial_registration"
                  id="seller_commercial_registration"
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
                <label className="text-xs font-bold text-slate-700 block" id="label-address">العنوان الجغرافي للشركة</label>
                <input 
                  type="text"
                  name="seller_address"
                  id="seller_address"
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
                <label className="text-xs font-bold text-slate-700 block" id="label-city">المدينة</label>
                <input 
                  type="text"
                  name="seller_city"
                  id="seller_city"
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
                <label className="text-xs font-bold text-slate-700 block" id="label-postal-code">الرمز البريدي</label>
                <input 
                  type="text"
                  name="seller_postal_code"
                  id="seller_postal_code"
                  value={settings.seller_postal_code}
                  onChange={handleInputChange}
                  disabled={!isPrivileged}
                  placeholder="مثال: 12211"
                  className="w-full text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                />
              </div>

              {/* Country */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block" id="label-country">الدولة</label>
                <input 
                  type="text"
                  name="seller_country"
                  id="seller_country"
                  value={settings.seller_country}
                  onChange={handleInputChange}
                  disabled
                  className="w-full text-slate-400 bg-slate-50 text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none cursor-not-allowed"
                />
              </div>

              {/* Default Invoice Type */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block" id="label-invoice-type">نوع الفاتورة الافتراضي</label>
                <select
                  name="invoice_type_default"
                  id="invoice_type_default"
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
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-bold text-slate-700 block" id="label-environment">بيئة التشغيل</label>
                <select
                  name="environment"
                  id="environment"
                  value={settings.environment}
                  onChange={handleInputChange}
                  disabled={!isPrivileged}
                  className="w-full text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-brand-blue cursor-pointer"
                >
                  <option value="sandbox">Sandbox (بيئة التجريب والتطوير)</option>
                  <option value="simulation">Simulation (المحاكاة مع هيئة الزكاة)</option>
                  <option value="production">Production (الإطلاق الفعلي المحفوظ)</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                  اختيار البيئة حاليًا للتجهيز فقط، ولا يتم إرسال أي فاتورة إلى ZATCA في هذه المرحلة.
                </p>
              </div>

            </div>

            {isPrivileged ? (
              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  id="btn-save-zatca-settings"
                  disabled={savingObj}
                  className="bg-brand-blue text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition hover:brightness-95 cursor-pointer"
                >
                  {savingObj ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>حفظ إعدادات الفوترة الإلكترونية</span>
                </button>
              </div>
            ) : (
              <div className="text-[10px] text-slate-400 bg-slate-50 p-2.5 rounded-xl flex items-center gap-1.5 justify-center">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>أنت مسجل بصلاحية مشاهد. لا تملك حق تعديل الخيارات الضريبية للهيئة.</span>
              </div>
            )}
            
          </form>
        </div>

        {/* Readiness Checklist */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-5 shadow-sm h-fit">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <Building2 className="w-4 h-4 text-slate-500" />
            <h4 className="text-xs font-bold text-slate-950">حالة الجاهزية العامة</h4>
          </div>

          <div className="space-y-4">
            
            {/* General Status Card */}
            {!settings.is_enabled ? (
              <div className="p-4 rounded-2xl border text-center space-y-1 bg-slate-50 border-slate-200 text-slate-700">
                <div className="text-xs font-extrabold flex items-center justify-center gap-1.5">
                  <AlertCircle className="w-4.5 h-4.5 text-slate-500 shrink-0" />
                  <span>الفوترة الإلكترونية غير مفعلة</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  فعّل الخيار ثم أكمل بيانات البائع للبدء.
                </p>
              </div>
            ) : !isReadyForZatca ? (
              <div className="p-4 rounded-2xl border text-center space-y-1 bg-rose-50 border-rose-100 text-rose-800">
                <div className="text-xs font-extrabold flex items-center justify-center gap-1.5">
                  <XCircle className="w-4.5 h-4.5 text-rose-600 shrink-0" />
                  <span>غير جاهز — بيانات ناقصة</span>
                </div>
                <p className="text-[10px] text-rose-500 leading-relaxed">
                  أكمل الحقول المطلوبة لتوليد QR و XML.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-2xl border text-center space-y-1 bg-emerald-50 border-emerald-100 text-emerald-800">
                <div className="text-xs font-extrabold flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                  <span>جاهز لتوليد QR و XML أولي</span>
                </div>
                <p className="text-[10px] text-emerald-600 leading-relaxed">
                  تم استيعاب كافة الخصائص الإلزامية لصيغة الفاتورة الضريبية ومحرك TLV.
                </p>
              </div>
            )}

            {/* Checklist elements block */}
            <div className="space-y-3 pt-1 text-[11px]">
              <div className="font-bold text-slate-700 text-xs">قائمة التحقق التفصيلية:</div>

              {/* 1. Enable */}
              <div className="flex flex-col border-b border-slate-100 pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">تفعيل الفوترة الإلكترونية</span>
                  {settings.is_enabled ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                </div>
                {!settings.is_enabled && (
                  <p className="text-[9px] text-amber-600 mt-0.5">الفوترة معطلة — الرجاء تفعيل المفتاح لحفظ وتوليد بيانات ZATCA.</p>
                )}
              </div>

              {/* 2. Seller Name */}
              <div className="flex flex-col border-b border-slate-100 pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">اسم البائع موجود</span>
                  {hasSellerName ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                </div>
                {!hasSellerName && (
                  <p className="text-[9px] text-rose-500 mt-0.5">اسم البائع ناقص — أدخل اسم المنشأة اللفظي بالعربية.</p>
                )}
              </div>

              {/* 3. VAT Number */}
              <div className="flex flex-col border-b border-slate-100 pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">الرقم الضريبي صحيح</span>
                  {hasVatNumber ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                </div>
                {!hasVatNumber && (
                  <p className="text-[9px] text-rose-500 mt-0.5">الرقم الضريبي ناقص أو خاطئ — يجب أن يكون 15 رقمًا ويبدأ بـ 3 وينتهي بـ 3.</p>
                )}
              </div>

              {/* 4. CR */}
              <div className="flex flex-col border-b border-slate-100 pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">السجل التجاري موجود</span>
                  {hasCr ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                </div>
                {!hasCr && (
                  <p className="text-[9px] text-rose-500 mt-0.5">رقم السجل التجاري ناقص — الرجاء تعبئته لإضافته للفواتير.</p>
                )}
              </div>

              {/* 5. Address */}
              <div className="flex flex-col border-b border-slate-100 pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">العنوان موجود</span>
                  {hasAddress ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                </div>
                {!hasAddress && (
                  <p className="text-[9px] text-rose-500 mt-0.5">العنوان ناقص — أدخل عنوان المنشأة الجغرافي بالتفصيل.</p>
                )}
              </div>

              {/* 6. City */}
              <div className="flex flex-col border-b border-slate-100 pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">المدينة موجودة</span>
                  {hasCity ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                </div>
                {!hasCity && (
                  <p className="text-[9px] text-rose-500 mt-0.5">المدينة ناقصة — أدخل اسم المدينة التي تتواجد فيها المنشأة.</p>
                )}
              </div>

              {/* 7. Postal Code */}
              <div className="flex flex-col border-b border-slate-100 pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">الرمز البريدي موجود</span>
                  {hasPostalCode ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                </div>
                {!hasPostalCode && (
                  <p className="text-[9px] text-amber-600 mt-0.5">الرمز البريدي ناقص — يفضل كتابة الرمز البريدي لتطابق بيانات العنوان.</p>
                )}
              </div>

              {/* 8. Country */}
              <div className="flex flex-col border-b border-slate-100 pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">الدولة SA</span>
                  {isSa ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                </div>
              </div>

              {/* 9. QR */}
              <div className="flex flex-col border-b border-slate-100 pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 flex items-center gap-1">
                    <QrCode className="w-3.5 h-3.5 text-slate-400" />
                    <span>توليد ترميز الـ TLV/Base64</span>
                  </span>
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                </div>
              </div>

              {/* 10. XML */}
              <div className="flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 flex items-center gap-1">
                    <FileCode className="w-3.5 h-3.5 text-slate-400" />
                    <span>توليد ملفات XML UBL 2.1</span>
                  </span>
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                </div>
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
              <span className="font-bold block text-slate-700">📌 تنويه بخصوص إرسال البيانات:</span>
              <p>توليد رموز الاستجابة السريعة (QR) وربطها بملفات XML للمستندات الإلكترونية يتطلب فواتير مبيعات ضريبية برقم ضريبي نشط. لا يقوم النظام بإرسال فواتير مباشرة لمصلحة الضرائب والزكاة والجمارك (ZATCA) في النسخة الحالية.</p>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};
