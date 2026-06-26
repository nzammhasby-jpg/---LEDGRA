import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { zatcaService } from '../../lib/zatcaService';
import { zatcaSigningService } from '../../lib/zatcaSigningService';
import { ZatcaSettings, ZatcaSigningProfile, ZatcaEnvironment, ZatcaProfileStatus, ZatcaPrivateKeyStorageMode } from '../../types';
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
  QrCode,
  Copy,
  Info,
  Lock,
  Key,
  Database,
  Terminal,
  ExternalLink,
  ListTodo
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
  const [sdkStats, setSdkStats] = useState<Record<string, number>>({
    passed: 0,
    failed: 0,
    needs_review: 0,
    ready_for_check: 0,
    not_checked: 0
  });

  // Tab state
  const [activeTab, setActiveTab] = useState<'basic' | 'signing' | 'sandbox'>('basic');

  // Sandbox / Simulation Integration states
  const [submissionLogs, setSubmissionLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [testingConnectivity, setTestingConnectivity] = useState<boolean>(false);
  const [connectivityStatus, setConnectivityStatus] = useState<{
    checked: boolean;
    success: boolean;
    message: string;
    environment: 'sandbox' | 'simulation';
  } | null>(null);
  const [sandboxEnv, setSandboxEnv] = useState<'sandbox' | 'simulation'>('sandbox');

  // Signing Profile states
  const [signingEnv, setSigningEnv] = useState<'sandbox' | 'simulation' | 'production'>('sandbox');
  const [signingProfile, setSigningProfile] = useState<ZatcaSigningProfile | null>(null);
  const [signingLoading, setSigningLoading] = useState<boolean>(false);
  const [signingSaving, setSigningSaving] = useState<boolean>(false);
  const [signingSuccessMsg, setSigningSuccessMsg] = useState<string | null>(null);
  const [signingErrorMsg, setSigningErrorMsg] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState({
    profile_status: 'not_configured',
    csr_common_name: '',
    csr_serial_number: '',
    csr_organization_identifier: '',
    csr_organization_unit_name: '',
    csr_organization_name: '',
    csr_country_name: 'SA',
    csr_invoice_type: '1100',
    csr_location: '',
    csr_industry: '',
    csr_pem: '',
    certificate_pem: '',
    csid_value: '',
    csid_type: '',
    certificate_subject: '',
    certificate_issuer: '',
    certificate_valid_from: '',
    certificate_valid_to: '',
    private_key_storage_mode: 'not_stored' as ZatcaPrivateKeyStorageMode,
    private_key_secret_reference: '',
    notes: ''
  });

  const loadSigningProfile = async (env: 'sandbox' | 'simulation' | 'production') => {
    if (!currentOrg) return;
    setSigningLoading(true);
    setSigningErrorMsg(null);
    setSigningSuccessMsg(null);
    try {
      const profile = await zatcaSigningService.getZatcaSigningProfile(currentOrg.id, env);
      if (profile) {
        setSigningProfile(profile);
        setProfileForm({
          profile_status: profile.profile_status || 'not_configured',
          csr_common_name: profile.csr_common_name || '',
          csr_serial_number: profile.csr_serial_number || '',
          csr_organization_identifier: profile.csr_organization_identifier || '',
          csr_organization_unit_name: profile.csr_organization_unit_name || '',
          csr_organization_name: profile.csr_organization_name || '',
          csr_country_name: profile.csr_country_name || 'SA',
          csr_invoice_type: profile.csr_invoice_type || '1100',
          csr_location: profile.csr_location || '',
          csr_industry: profile.csr_industry || '',
          csr_pem: profile.csr_pem || '',
          certificate_pem: profile.certificate_pem || '',
          csid_value: profile.csid_value || '',
          csid_type: profile.csid_type || '',
          certificate_subject: profile.certificate_subject || '',
          certificate_issuer: profile.certificate_issuer || '',
          certificate_valid_from: profile.certificate_valid_from ? new Date(profile.certificate_valid_from).toISOString().substring(0, 16) : '',
          certificate_valid_to: profile.certificate_valid_to ? new Date(profile.certificate_valid_to).toISOString().substring(0, 16) : '',
          private_key_storage_mode: profile.private_key_storage_mode || 'not_stored',
          private_key_secret_reference: profile.private_key_secret_reference || '',
          notes: profile.notes || ''
        });
      } else {
        setSigningProfile(null);
        setProfileForm({
          profile_status: 'not_configured',
          csr_common_name: currentOrg.website || `${currentOrg.name_en || 'company'}.com`,
          csr_serial_number: currentOrg.cr_number || '',
          csr_organization_identifier: currentOrg.vat_number || '',
          csr_organization_unit_name: 'IT',
          csr_organization_name: currentOrg.name_ar || '',
          csr_country_name: 'SA',
          csr_invoice_type: '1100',
          csr_location: currentOrg.city || '',
          csr_industry: currentOrg.activity_type || '',
          csr_pem: '',
          certificate_pem: '',
          csid_value: '',
          csid_type: '',
          certificate_subject: '',
          certificate_issuer: '',
          certificate_valid_from: '',
          certificate_valid_to: '',
          private_key_storage_mode: 'not_stored',
          private_key_secret_reference: '',
          notes: ''
        });
      }
    } catch (err) {
      console.error('Failed to load ZATCA signing profile:', err);
      setSigningErrorMsg('تعذر تحميل ملف التوقيع والربط.');
    } finally {
      setSigningLoading(false);
    }
  };

  useEffect(() => {
    if (currentOrg) {
      loadSigningProfile(signingEnv);
    }
  }, [currentOrg, signingEnv]);

  const loadLogs = useCallback(async () => {
    if (!currentOrg) return;
    setLoadingLogs(true);
    try {
      const logs = await zatcaService.getSubmissionLogs(currentOrg.id);
      setSubmissionLogs(logs);
    } catch (err) {
      console.error('Error loading submission logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    if (activeTab === 'sandbox') {
      loadLogs();
    }
  }, [activeTab, loadLogs]);

  const handleTestConnectivity = async () => {
    if (!currentOrg) return;
    setTestingConnectivity(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const res = await zatcaService.testConnectivity(currentOrg.id, sandboxEnv);
      setConnectivityStatus({
        checked: true,
        success: res.success,
        message: res.message,
        environment: sandboxEnv
      });
      if (res.success) {
        setSuccessMsg(`تم فحص طبقة الاتصال والجاهزية بنجاح للبيئة (${sandboxEnv}).`);
      } else {
        setErrorMsg(res.message);
      }
      await loadLogs();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'حدث خطأ أثناء فحص اتصال دالة الخادم التجريبية.');
    } finally {
      setTestingConnectivity(false);
    }
  };

  const handleProfileFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfileForm(prev => ({
      ...prev,
      [name]: value
    }));
  };


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

      // Fetch SDK Validation counts/statistics
      try {
        const stats = await zatcaService.getSdkValidationStats(currentOrg.id);
        setSdkStats(stats);
      } catch (statsErr) {
        console.error('Error fetching SDK stats:', statsErr);
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

  const handleCopyOpenSslConfig = () => {
    const config = `oid_section = my_oids

[my_oids]
TST-generalName = 1.3.6.1.4.1.311.20.2.3

[req]
default_bits = 2048
emailAddress = admin@${profileForm.csr_common_name || 'example.com'}
req_extensions = v3_req
x509_extensions = v3_ca
prompt = no
distinguished_name = req_distinguished_name

[req_distinguished_name]
C = SA
OU = ${profileForm.csr_organization_unit_name || 'IT'}
O = ${profileForm.csr_organization_name || 'Company'}
CN = ${profileForm.csr_common_name || 'example.com'}

[v3_req]
# Extensions for a typical ZATCA CSR
basicConstraints = CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment
subjectAltName = dirName:alt_names

[alt_names]
CN = ${profileForm.csr_common_name || 'example.com'}
OU = ${profileForm.csr_organization_unit_name || 'IT'}
O = ${profileForm.csr_organization_name || 'Company'}
C = SA
# ZATCA Specific Alt Name structure
UID = ${profileForm.csr_organization_identifier || '300000000000003'}
title = ${profileForm.csr_invoice_type || '1100'}
registeredAddress = ${profileForm.csr_location || 'Riyadh'}
businessCategory = ${profileForm.csr_industry || 'Retail'}
`;
    navigator.clipboard.writeText(config);
    alert('تم نسخ إعدادات OpenSSL الخاصة بـ ZATCA إلى الحافظة بنجاح!');
  };

  const handleSaveSigningProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    if (!isPrivileged) {
      setSigningErrorMsg('عذرًا، الصلاحية مطلوبة لتعديل إعدادات التوقيع والربط.');
      return;
    }

    setSigningSaving(true);
    setSigningErrorMsg(null);
    setSigningSuccessMsg(null);

    // Client-side leak checking for absolute safety before any database call
    const hasLeak = zatcaSigningService.detectPrivateKeyLeak(profileForm.csr_pem) ||
                    zatcaSigningService.detectPrivateKeyLeak(profileForm.certificate_pem) ||
                    zatcaSigningService.detectPrivateKeyLeak(profileForm.notes) ||
                    zatcaSigningService.detectPrivateKeyLeak(profileForm.private_key_secret_reference);

    if (hasLeak) {
      setSigningErrorMsg('لا يمكن حفظ المفتاح الخاص داخل الواجهة أو قاعدة البيانات. استخدم Secret Manager أو Edge Function Secrets في مرحلة التكامل اللاحقة.');
      setSigningSaving(false);
      return;
    }

    // Client-side PEM validation
    if (profileForm.csr_pem && !profileForm.csr_pem.includes('BEGIN CERTIFICATE REQUEST')) {
      setSigningErrorMsg('نص CSR PEM غير صالح. يجب أن يبدأ بـ -----BEGIN CERTIFICATE REQUEST-----');
      setSigningSaving(false);
      return;
    }

    if (profileForm.certificate_pem && !profileForm.certificate_pem.includes('BEGIN CERTIFICATE')) {
      setSigningErrorMsg('نص شهادة التوقيع غير صالح. يجب أن يبدأ بـ -----BEGIN CERTIFICATE-----');
      setSigningSaving(false);
      return;
    }

    try {
      const res = await zatcaSigningService.upsertZatcaSigningProfile({
        organization_id: currentOrg.id,
        environment: signingEnv,
        profile_status: profileForm.profile_status as any,
        csr_common_name: profileForm.csr_common_name || null,
        csr_serial_number: profileForm.csr_serial_number || null,
        csr_organization_identifier: profileForm.csr_organization_identifier || null,
        csr_organization_unit_name: profileForm.csr_organization_unit_name || null,
        csr_organization_name: profileForm.csr_organization_name || null,
        csr_country_name: profileForm.csr_country_name || 'SA',
        csr_invoice_type: profileForm.csr_invoice_type || null,
        csr_location: profileForm.csr_location || null,
        csr_industry: profileForm.csr_industry || null,
        csr_pem: profileForm.csr_pem || null,
        certificate_pem: profileForm.certificate_pem || null,
        csid_value: profileForm.csid_value || null,
        csid_type: (profileForm.csid_type as any) || null,
        certificate_subject: profileForm.certificate_subject || null,
        certificate_issuer: profileForm.certificate_issuer || null,
        certificate_valid_from: profileForm.certificate_valid_from || null,
        certificate_valid_to: profileForm.certificate_valid_to || null,
        private_key_storage_mode: profileForm.private_key_storage_mode,
        private_key_secret_reference: profileForm.private_key_secret_reference || null,
        notes: profileForm.notes || null
      });

      if (res.success) {
        setSigningSuccessMsg('تم حفظ بيانات ومعلومات التوقيع بأمان.');
        await loadSigningProfile(signingEnv);
      } else {
        setSigningErrorMsg(res.error || 'تعذر حفظ ملف إعداد التوقيع.');
      }
    } catch (err: any) {
      console.error(err);
      setSigningErrorMsg(err.message || 'حدث خطأ غير متوقع أثناء الحفظ.');
    } finally {
      setSigningSaving(false);
    }
  };

  const readiness = zatcaSigningService.getSigningReadiness(signingProfile, settings, sdkStats);

  return (
    <div className="space-y-8 animate-fade-in text-right" dir="rtl">
      
      {/* Header Banner */}
      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="bg-slate-100 text-slate-700 p-2.5 rounded-xl shrink-0">
            <ShieldCheck className="w-6 h-6 animate-pulse text-brand-blue" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">الفوترة الإلكترونية ZATCA</h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              تجهيز وتهيئة ملفات التعريف الرقمي وشهادات التوقيع للامتثال والتحضير لربط هيئة الزكاة والضريبة والجمارك.
            </p>
          </div>
        </div>
        <div className="bg-brand-blue/10 text-brand-blue text-[11px] font-black px-3 py-1.5 rounded-full whitespace-nowrap border border-brand-blue/20">
          المرحلة 16: Sandbox / Simulation API Integration
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-100 gap-2">
        <button
          type="button"
          onClick={() => {
            setActiveTab('basic');
            setSuccessMsg(null);
            setErrorMsg(null);
          }}
          className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'basic'
              ? 'border-brand-blue text-slate-950 font-black bg-slate-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>إعدادات المنشأة والفوترة الأساسية</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('signing');
            setSigningSuccessMsg(null);
            setSigningErrorMsg(null);
          }}
          className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'signing'
              ? 'border-brand-blue text-slate-950 font-black bg-slate-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>تجهيز التوقيع والربط (CSR / CSID)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('sandbox');
            setSuccessMsg(null);
            setErrorMsg(null);
          }}
          className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'sandbox'
              ? 'border-brand-blue text-slate-950 font-black bg-slate-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>اختبارات الربط والتكامل (Sandbox)</span>
        </button>
      </div>

      {/* Basic Tab Error/Success messages */}
      {activeTab === 'basic' && successMsg && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl p-3 flex items-center gap-2 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {activeTab === 'basic' && errorMsg && (
        <div className="bg-rose-50 border border-rose-100 text-rose-800 rounded-xl p-3 flex items-center gap-2 text-xs">
          <XCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Sandbox Tab Error/Success messages */}
      {activeTab === 'sandbox' && successMsg && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl p-3 flex items-center gap-2 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {activeTab === 'sandbox' && errorMsg && (
        <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-xl p-3 flex items-center gap-2 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Signing Tab Error/Success messages */}
      {activeTab === 'signing' && signingSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl p-3 flex items-center gap-2 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{signingSuccessMsg}</span>
        </div>
      )}

      {activeTab === 'signing' && signingErrorMsg && (
        <div className="bg-rose-50 border border-rose-100 text-rose-800 rounded-xl p-3 flex items-center gap-2 text-xs font-sans leading-relaxed">
          <XCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <span>{signingErrorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ========================================================================= */}
        {/* LEFT COLUMN: FORMS (BASIC vs SIGNING) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-2 space-y-6">
          
          {activeTab === 'basic' && (
            /* Tab Basic Form */
            <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-5 shadow-sm">
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
                      <p className="text-[10px] text-rose-600 font-semibold mt-1 font-sans">الرقم الضريبي يجب أن يكون 15 رقمًا ويبدأ بـ 3 وينتهي بـ 3.</p>
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

                  {/* Address */}
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
                      className="w-full text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-brand-blue cursor-pointer font-bold"
                    >
                      <option value="simplified">فاتورة ضريبية مبسطة (Simplified - للافراد B2C)</option>
                      <option value="standard">فاتورة ضريبية قياسية (Standard - للشركات B2B)</option>
                    </select>
                  </div>

                  {/* Environment */}
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-slate-700 block" id="label-environment">بيئة التشغيل العامة</label>
                    <select
                      name="environment"
                      id="environment"
                      value={settings.environment}
                      onChange={handleInputChange}
                      disabled={!isPrivileged}
                      className="w-full text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-brand-blue cursor-pointer font-bold"
                    >
                      <option value="sandbox">Sandbox (بيئة التجريب والتطوير)</option>
                      <option value="simulation">Simulation (المحاكاة مع هيئة الزكاة)</option>
                      <option value="production">Production (الإطلاق الفعلي المحفوظ)</option>
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                      تغيير البيئة هنا يؤثر على ملفات التصدير ومخرجات المعاملات الضريبية.
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

              {/* Fast link to Signing tab */}
              <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-brand-blue" />
                    <span>جاهزية التوقيع والربط (CSR / CSID)</span>
                  </div>
                  <p className="text-[10.5px] text-slate-500">
                    حالة الإعداد لبيئة التوقيع: {signingProfile ? (
                      <span className="text-brand-blue font-bold">
                        {signingProfile.profile_status === 'ready_for_integration' ? 'جاهز لمرحلة التكامل التجريبية' : 'قيد الإعداد وتدوين الميتاداتا'}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-bold">غير مجهز بعد</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('signing')}
                  className="text-xs bg-white text-brand-blue border border-brand-blue/30 px-3.5 py-1.5 rounded-xl font-bold hover:bg-slate-100 transition cursor-pointer"
                >
                  فتح إعدادات التوقيع
                </button>
              </div>

            </div>
          )}

          {activeTab === 'signing' && (
            /* Tab Signing Profile Form */
            <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-6 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-slate-500" />
                  <h4 className="text-xs font-bold text-slate-950">إعداد وتجهيز ملفات التوقيع وربط الـ CSID</h4>
                </div>
                
                {/* Environment Selector within signing profile */}
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] font-bold text-slate-500">البيئة المستهدفة:</span>
                  <select
                    value={signingEnv}
                    onChange={(e) => setSigningEnv(e.target.value as any)}
                    className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 bg-slate-50 font-bold outline-none cursor-pointer"
                  >
                    <option value="sandbox">Sandbox (المطوّرين)</option>
                    <option value="simulation">Simulation (المحاكاة)</option>
                    <option value="production">Production (الإطلاق الفعلي)</option>
                  </select>
                </div>
              </div>

              {/* Warnings and Sandbox simulation reminders */}
              <div className="bg-amber-50/70 border border-amber-100 p-4 rounded-xl text-amber-900 text-xs leading-relaxed space-y-2">
                <div className="font-extrabold flex items-center gap-1.5 text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>تنبيه أمني هام جداً حول مرحلة التوقيع والربط (Phase 15):</span>
                </div>
                <p>
                  هذه الواجهة مخصصة <strong>لتجهيز وإدخال مخرجات الفحص وحفظ شهادات الهيئة فقط</strong> تمهيداً للمرحلة القادمة. لا يتم حالياً إرسال الفواتير بشكل فوري ومطابقتها بـ API الهيئة المباشر، ولا يشتمل النظام على توليد أو توقيع مستندات XML رقمياً أو Clearance أو توثيق CSID فوري.
                </p>
                <div className="text-[10.5px] text-amber-800 font-semibold">
                  ملاحظة: تلتزم المنشأة بنسخ بيانات الـ CSR metadata المعتمدة أدناه وبناء ملف التوقيع خارج النظام، ثم رفع الشهادة العامة الناتجة للتوثيق والامتثال.
                </div>
              </div>

              {signingLoading ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-brand-blue" />
                  <span className="text-xs">جاري تحميل بيانات التوقيع للبيئة المختارة...</span>
                </div>
              ) : (
                <form onSubmit={handleSaveSigningProfile} className="space-y-6">
                  
                  {/* Status update simulator */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="space-y-0.5">
                      <label className="text-xs font-bold text-slate-900 block">حالة ملف تعريف التوقيع</label>
                      <p className="text-[10px] text-slate-500">حالة تقدم وتوثيق الامتثال لشهادة الربط الحالية</p>
                    </div>
                    <select
                      name="profile_status"
                      value={profileForm.profile_status}
                      onChange={handleProfileFormChange}
                      disabled={!isPrivileged}
                      className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 bg-white font-extrabold outline-none cursor-pointer"
                    >
                      <option value="not_configured">غير مجهز (Not Configured)</option>
                      <option value="csr_metadata_ready">بيانات CSR جاهزة (CSR Metadata Ready)</option>
                      <option value="csr_created_external">CSR تم إنشاؤه خارجياً (CSR Created Externally)</option>
                      <option value="csid_added">CSID مضاف (CSID Added)</option>
                      <option value="ready_for_integration">جاهز لمرحلة التكامل التجريبية (Ready for Integration)</option>
                    </select>
                  </div>

                  {/* Section 1: CSR Configuration Metadata */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
                      <Building2 className="w-4 h-4 text-slate-400" />
                      <h5 className="text-[11.5px] font-extrabold text-slate-900">بيانات طلب توقيع الشهادة (CSR Metadata)</h5>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">الاسم الشائع (Common Name / Domain)</label>
                        <input 
                          type="text"
                          name="csr_common_name"
                          value={profileForm.csr_common_name}
                          onChange={handleProfileFormChange}
                          disabled={!isPrivileged}
                          placeholder="e.g. company.com"
                          className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">الرقم التسلسلي للجهاز (Serial Number / UUID)</label>
                        <input 
                          type="text"
                          name="csr_serial_number"
                          value={profileForm.csr_serial_number}
                          onChange={handleProfileFormChange}
                          disabled={!isPrivileged}
                          placeholder="e.g. 1-APP|2-Device|3-Version"
                          className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">معرّف المنشأة الضريبي (Organization UID / VAT)</label>
                        <input 
                          type="text"
                          name="csr_organization_identifier"
                          value={profileForm.csr_organization_identifier}
                          onChange={handleProfileFormChange}
                          disabled={!isPrivileged}
                          placeholder="15 خانة تبدأ بـ 3"
                          className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">اسم القسم / الوحدة (Organizational Unit / OU)</label>
                        <input 
                          type="text"
                          name="csr_organization_unit_name"
                          value={profileForm.csr_organization_unit_name}
                          onChange={handleProfileFormChange}
                          disabled={!isPrivileged}
                          placeholder="e.g. IT Department"
                          className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">اسم المنشأة القانوني (Organization Name / O)</label>
                        <input 
                          type="text"
                          name="csr_organization_name"
                          value={profileForm.csr_organization_name}
                          onChange={handleProfileFormChange}
                          disabled={!isPrivileged}
                          placeholder="اسم الشركة بالعربية كما هو مسجل بالضريبة"
                          className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">كود الدولة (Country C / SA)</label>
                        <input 
                          type="text"
                          name="csr_country_name"
                          value="SA"
                          disabled
                          className="w-full text-slate-400 bg-slate-50 text-xs px-3 py-2 rounded-xl border border-slate-200 cursor-not-allowed"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">نوع الفواتير للربط (Invoice Type Flag)</label>
                        <select
                          name="csr_invoice_type"
                          value={profileForm.csr_invoice_type}
                          onChange={handleProfileFormChange}
                          disabled={!isPrivileged}
                          className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue cursor-pointer"
                        >
                          <option value="1100">مبسطة و قياسية (1100 - Simplified & Standard)</option>
                          <option value="1000">قياسية فقط (1000 - Standard Only)</option>
                          <option value="0100">مبسطة فقط (0100 - Simplified Only)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">العنوان أو المدينة (Location / city)</label>
                        <input 
                          type="text"
                          name="csr_location"
                          value={profileForm.csr_location}
                          onChange={handleProfileFormChange}
                          disabled={!isPrivileged}
                          placeholder="Riyadh, Saudi Arabia"
                          className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                        />
                      </div>

                      <div className="space-y-1 md:col-span-2">
                        <label className="text-[11px] font-bold text-slate-700 block">طبيعة النشاط / الصناعة (Industry Category)</label>
                        <input 
                          type="text"
                          name="csr_industry"
                          value={profileForm.csr_industry}
                          onChange={handleProfileFormChange}
                          disabled={!isPrivileged}
                          placeholder="e.g. Retail, Healthcare, Construction"
                          className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                        />
                      </div>

                    </div>

                    {/* Helper to copy OpenSSL config */}
                    <div className="bg-slate-50 border border-slate-250 p-3.5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="text-[10.5px] font-extrabold text-slate-900 flex items-center gap-1 text-right">
                          <Terminal className="w-4 h-4 text-slate-600" />
                          <span>توليد ملف الإعداد لـ OpenSSL / ZATCA SDK</span>
                        </div>
                        <p className="text-[9.5px] text-slate-500 leading-relaxed">
                          استخدم هذا الزر لنسخ نص الإعداد config file لتشغيل أداة الفاتوورة الرسمية لإنتاج الـ CSR.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyOpenSslConfig}
                        className="text-[10px] bg-slate-200 text-slate-700 px-3 py-1.5 rounded-xl font-bold hover:bg-slate-300 transition flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>نسخ إعدادات OpenSSL</span>
                      </button>
                    </div>

                  </div>

                  {/* Section 2: CSR & Certificate Public Key Content */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
                      <FileCode className="w-4 h-4 text-slate-400" />
                      <h5 className="text-[11.5px] font-extrabold text-slate-900">محتوى طلب التوقيع والشهادة المعتمدة (Public PEMs)</h5>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">نص الـ CSR PEM المولد</label>
                        <textarea
                          name="csr_pem"
                          rows={4}
                          value={profileForm.csr_pem}
                          onChange={handleProfileFormChange}
                          disabled={!isPrivileged}
                          placeholder="لصق نص طلب الشهادة الذي تم إنشاؤه خارجياً - يبدأ بـ -----BEGIN CERTIFICATE REQUEST-----"
                          className="w-full text-slate-800 text-[10px] font-mono px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue text-left"
                          dir="ltr"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">شهادة التوقيع الصادرة من الهيئة (Certificate PEM)</label>
                        <textarea
                          name="certificate_pem"
                          rows={4}
                          value={profileForm.certificate_pem}
                          onChange={handleProfileFormChange}
                          disabled={!isPrivileged}
                          placeholder="لصق نص الشهادة الصادرة - يبدأ بـ -----BEGIN CERTIFICATE-----"
                          className="w-full text-slate-800 text-[10px] font-mono px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue text-left"
                          dir="ltr"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 block">معرّف الشهادة العام (CSID Value)</label>
                          <input 
                            type="text"
                            name="csid_value"
                            value={profileForm.csid_value}
                            onChange={handleProfileFormChange}
                            disabled={!isPrivileged}
                            placeholder="e.g. CSID-Base64-Hex-Key-From-Zatca"
                            className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 block">نوع الـ CSID</label>
                          <select
                            name="csid_type"
                            value={profileForm.csid_type}
                            onChange={handleProfileFormChange}
                            disabled={!isPrivileged}
                            className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue cursor-pointer"
                          >
                            <option value="">لا يوجد شهادة مدخلة حالياً</option>
                            <option value="compliance">شهادة امتثال (Compliance CSID)</option>
                            <option value="production">شهادة إنتاج (Production CSID)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 block">موضوع الشهادة (Certificate Subject)</label>
                          <input 
                            type="text"
                            name="certificate_subject"
                            value={profileForm.certificate_subject}
                            onChange={handleProfileFormChange}
                            disabled={!isPrivileged}
                            placeholder="e.g. CN=Taxpayer, O=Enterprise"
                            className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 block">الجهة المصدرة للشهادة (Certificate Issuer)</label>
                          <input 
                            type="text"
                            name="certificate_issuer"
                            value={profileForm.certificate_issuer}
                            onChange={handleProfileFormChange}
                            disabled={!isPrivileged}
                            placeholder="e.g. ZATCA Compliance CA"
                            className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 block">تاريخ بدء صلاحية الشهادة</label>
                          <input 
                            type="datetime-local"
                            name="certificate_valid_from"
                            value={profileForm.certificate_valid_from}
                            onChange={handleProfileFormChange}
                            disabled={!isPrivileged}
                            className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue font-sans text-right"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 block">تاريخ انتهاء صلاحية الشهادة</label>
                          <input 
                            type="datetime-local"
                            name="certificate_valid_to"
                            value={profileForm.certificate_valid_to}
                            onChange={handleProfileFormChange}
                            disabled={!isPrivileged}
                            className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue font-sans text-right"
                          />
                        </div>

                      </div>

                    </div>
                  </div>

                  {/* Section 3: Private Key Storage Settings */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
                      <Lock className="w-4 h-4 text-slate-400" />
                      <h5 className="text-[11.5px] font-extrabold text-slate-900">إدارة المفتاح الخاص للمنشأة (Private Key Isolation)</h5>
                    </div>

                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-slate-600 text-[10.5px] leading-relaxed space-y-2">
                      <div className="font-extrabold text-slate-900 flex items-center gap-1 text-[11px]">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>سياسة عزل وحظر المفاتيح الخاصة بالمتصفح وقاعدة البيانات:</span>
                      </div>
                      <p>
                        التزاماً بمعايير الهيئة للأمن السيبراني وحماية البنية التحتية، <strong>يُحظر تماماً لصق أو حفظ أو نقل المفتاح الخاص (Private Key)</strong> كـ plaintext داخل كود النظام أو جداول قاعدة البيانات. النظام يكتفي برسم السياسات ومزامنة المرجع المعرف لمخزن الأسرار الخارجي.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">طريقة ونمط تخزين المفتاح الخاص</label>
                        <select
                          name="private_key_storage_mode"
                          value={profileForm.private_key_storage_mode}
                          onChange={handleProfileFormChange}
                          disabled={!isPrivileged}
                          className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue cursor-pointer font-bold"
                        >
                          <option value="not_stored">غير مخزن حالياً (Not Stored - Manual Outside)</option>
                          <option value="external_secret_manager">مخزن خارجي أمن (AWS/GCP Secret Manager)</option>
                          <option value="edge_function_secret_reference">مرجع وظائف مشفر (Edge Function Secrets Encryption)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">اسم المرجع التعريفي (Secret Reference Name)</label>
                        <input 
                          type="text"
                          name="private_key_secret_reference"
                          value={profileForm.private_key_secret_reference}
                          onChange={handleProfileFormChange}
                          disabled={!isPrivileged}
                          placeholder="e.g. ZATCA_PRIVATE_KEY_SANDBOX"
                          className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                        />
                      </div>

                    </div>
                  </div>

                  {/* Section 4: Notes */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-700 block">ملاحظات توثيقية إضافية للامتثال</label>
                    <textarea
                      name="notes"
                      rows={3}
                      value={profileForm.notes}
                      onChange={handleProfileFormChange}
                      disabled={!isPrivileged}
                      placeholder="سجل أي تدوينات أو خطوات متبعة لامتثال شهادات المنشأة..."
                      className="w-full text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                    />
                  </div>

                  {isPrivileged ? (
                    <div className="flex justify-end pt-3">
                      <button
                        type="submit"
                        disabled={signingSaving}
                        className="bg-brand-blue text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition hover:brightness-95 cursor-pointer"
                      >
                        {signingSaving ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        <span>حفظ تهيئة وإعدادات التوقيع والربط</span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400 bg-slate-50 p-2.5 rounded-xl flex items-center gap-1.5 justify-center">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>صلاحية العرض فقط. لا تملك حق تحديل ميتاداتا التوقيع.</span>
                    </div>
                  )}

                </form>
              )}

            </div>
          )}

          {activeTab === 'sandbox' && (
            /* Tab Sandbox/Simulation API Integration View */
            <div className="space-y-6">
              {/* Connectivity check card */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-5 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-slate-500" />
                    <h4 className="text-xs font-bold text-slate-950">فحص جاهزية الاتصال التلقائي (Connectivity Check)</h4>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-bold text-slate-500">البيئة المراد فحصها:</span>
                    <select
                      value={sandboxEnv}
                      onChange={(e) => setSandboxEnv(e.target.value as any)}
                      className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 bg-slate-50 font-bold outline-none cursor-pointer"
                    >
                      <option value="sandbox">Sandbox (بيئة المطورين)</option>
                      <option value="simulation">Simulation (المحاكاة)</option>
                    </select>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  هذا الإجراء يقوم باستدعاء دالة الخادم الآمنة (Edge Function) للتحقق من تهيئة روابط الـ APIs وحالة تصاريح وصول المنشأة في بيئة الاختبار والتكامل لـ ZATCA.
                </p>

                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={handleTestConnectivity}
                    disabled={testingConnectivity}
                    className="bg-brand-blue text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition hover:brightness-95 cursor-pointer"
                  >
                    {testingConnectivity ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Terminal className="w-4 h-4" />
                    )}
                    <span>فحص اتصال دالة الخادم لـ ZATCA</span>
                  </button>
                </div>

                {connectivityStatus && (
                  <div className={`p-4 rounded-xl border ${connectivityStatus.success ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-100 text-amber-800'} space-y-1.5`}>
                    <div className="text-xs font-extrabold flex items-center gap-1.5">
                      {connectivityStatus.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                      <span>النتيجة: {connectivityStatus.success ? 'متصل وجاهز' : 'محظور / غير جاهز'}</span>
                    </div>
                    <p className="text-[10.5px] leading-relaxed font-sans font-semibold">
                      {connectivityStatus.message}
                    </p>
                  </div>
                )}
              </div>

              {/* Submission Logs card */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-slate-500" />
                    <h4 className="text-xs font-bold text-slate-950">سجل محاولات الربط والتكامل التجريبي</h4>
                  </div>
                  <button
                    type="button"
                    onClick={loadLogs}
                    disabled={loadingLogs}
                    className="text-[10px] text-brand-blue font-bold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingLogs ? 'animate-spin' : ''}`} />
                    <span>تحديث السجل</span>
                  </button>
                </div>

                {loadingLogs ? (
                  <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-brand-blue" />
                    <span>جاري تحميل سجلات المحاولات...</span>
                  </div>
                ) : submissionLogs.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs leading-normal">
                    لا توجد عمليات إرسال مسجلة حتى الآن.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-[11px] border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-500 font-bold">
                          <th className="pb-2">التاريخ</th>
                          <th className="pb-2">البيئة</th>
                          <th className="pb-2">العملية</th>
                          <th className="pb-2">رقم الفاتورة</th>
                          <th className="pb-2">الحالة</th>
                          <th className="pb-2">HTTP</th>
                          <th className="pb-2">الرسالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-slate-700">
                        {submissionLogs.map((log) => {
                          const statusColors: Record<string, string> = {
                            blocked: 'bg-amber-50 text-amber-700 border-amber-100',
                            failed: 'bg-rose-50 text-rose-700 border-rose-100',
                            accepted: 'bg-emerald-50 text-emerald-700 border-emerald-100',
                            rejected: 'bg-red-50 text-red-700 border-red-100',
                            submitted: 'bg-blue-50 text-blue-700 border-blue-100'
                          };
                          return (
                            <tr key={log.id} className="hover:bg-slate-50/50">
                              <td className="py-2.5 font-mono text-[10px] whitespace-nowrap text-slate-500">
                                {new Date(log.created_at).toLocaleString('ar-SA', { hour12: false })}
                              </td>
                              <td className="py-2.5 font-bold whitespace-nowrap">
                                <span className="capitalize">{log.environment}</span>
                              </td>
                              <td className="py-2.5 font-medium whitespace-nowrap">
                                {log.operation === 'connectivity_check' ? 'فحص اتصال' : log.operation}
                              </td>
                              <td className="py-2.5 font-bold text-slate-900 whitespace-nowrap">
                                {log.sales_invoices?.invoice_number || '-'}
                              </td>
                              <td className="py-2.5 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded-full border text-[9.5px] font-bold ${statusColors[log.submission_status] || 'bg-slate-50 text-slate-600 border-slate-100'}`}>
                                  {log.submission_status}
                                </span>
                              </td>
                              <td className="py-2.5 font-mono font-bold text-slate-600">
                                {log.http_status || '-'}
                              </td>
                              <td className="py-2.5 max-w-[150px] truncate text-slate-500 text-[10.5px]" title={log.error_message || log.zatca_status}>
                                {log.error_message || log.zatca_status || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: READINESS & STATS */}
        {/* ========================================================================= */}
        <div className="space-y-6">
          
          {activeTab === 'basic' && (
            /* Basic Tab Right Panel: General Readiness & stats */
            <>
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
                        <p className="text-[9px] text-amber-600 mt-0.5 font-sans leading-relaxed">الفوترة معطلة — الرجاء تفعيل المفتاح لحفظ وتوليد بيانات ZATCA.</p>
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
                        <p className="text-[9px] text-rose-500 mt-0.5 font-sans">الرقم الضريبي ناقص أو خاطئ — يجب أن يكون 15 رقمًا ويبدأ بـ 3 وينتهي بـ 3.</p>
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

                  <div className="border border-slate-200 bg-slate-50/60 rounded-xl p-3.5 text-[10px] text-slate-700 leading-relaxed space-y-2">
                    <div className="font-extrabold flex items-center gap-1.5 text-slate-900 text-[11px]">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>المرحلة الحالية: تقوية XML والتحقق الداخلي</span>
                    </div>
                    <p>هذه المرحلة لا ترسل الفواتير إلى ZATCA. الهدف هو تجهيز XML و QR للفحص الداخلي والمرحلة التالية SDK Validation.</p>
                    <p className="text-[9px] text-slate-500 font-medium">مستندات الفحص جاهزة تحت بروتوكول ZATCA XML Preparation.</p>
                  </div>

                </div>
              </div>

              {/* ZATCA SDK Validation Summary Card */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4 shadow-sm h-fit">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <ShieldCheck className="w-4 h-4 text-slate-500" />
                  <h4 className="text-xs font-bold text-slate-950">إحصاءات فحص ZATCA SDK</h4>
                </div>

                <p className="text-[10px] text-slate-500 leading-relaxed">
                  مؤشرات وحالة مستندات الفوترة الإلكترونية التي خضعت للفحص والتحقق عبر الأدوات والـ SDK الخارجي:
                </p>

                <div className="grid grid-cols-2 gap-2 text-center text-[10.5px]">
                  <div className="bg-emerald-50 border border-emerald-100/70 rounded-xl p-2.5">
                    <span className="text-emerald-700 block text-[9.5px] font-black">اجتاز الفحص</span>
                    <strong className="text-emerald-900 text-sm font-black">{sdkStats.passed}</strong>
                  </div>
                  <div className="bg-red-50 border border-red-100/70 rounded-xl p-2.5">
                    <span className="text-red-700 block text-[9.5px] font-black">فشل الفحص</span>
                    <strong className="text-red-900 text-sm font-black">{sdkStats.failed}</strong>
                  </div>
                  <div className="bg-amber-50 border border-amber-100/70 rounded-xl p-2.5">
                    <span className="text-amber-700 block text-[9.5px] font-black">يحتاج مراجعة</span>
                    <strong className="text-amber-900 text-sm font-black">{sdkStats.needs_review}</strong>
                  </div>
                  <div className="bg-blue-50 border border-blue-100/70 rounded-xl p-2.5">
                    <span className="text-blue-700 block text-[9.5px] font-black">جاهز للفحص</span>
                    <strong className="text-blue-900 text-sm font-black">{sdkStats.ready_for_check}</strong>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex justify-between items-center text-[10px] text-slate-600 font-bold">
                  <span>لم تفحص بعد (معلق):</span>
                  <span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded-full font-extrabold">{sdkStats.not_checked}</span>
                </div>
              </div>
            </>
          )}

          {activeTab === 'signing' && (
            /* Signing Tab Right Panel: Signing Readiness Checklist */
            <>
              {/* Signing Compliance Readiness Card */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-5 shadow-sm h-fit">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <ShieldCheck className="w-4 h-4 text-slate-500" />
                  <h4 className="text-xs font-bold text-slate-950">جاهزية التوقيع للامتثال</h4>
                </div>

                <div className="space-y-4">
                  {/* Readiness Status Visualizer */}
                  {readiness.isReady ? (
                    <div className="p-4 rounded-2xl border text-center space-y-1 bg-emerald-50 border-emerald-100 text-emerald-800">
                      <div className="text-xs font-extrabold flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                        <span>جاهز ومكتمل للامتثال والربط!</span>
                      </div>
                      <p className="text-[10px] text-emerald-600 leading-relaxed font-sans font-semibold">
                        تم تلبية الحد الأدنى للتجهيز والجاهزية للمرحلة 16: Sandbox Integration.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl border text-center space-y-1 bg-amber-50 border-amber-100 text-amber-800">
                      <div className="text-xs font-extrabold flex items-center justify-center gap-1.5">
                        <AlertTriangle className="w-4.5 h-4.5 text-amber-600 shrink-0" />
                        <span>ملف التوقيع قيد الإعداد</span>
                      </div>
                      <p className="text-[10px] text-amber-500 leading-relaxed font-sans font-semibold">
                        يرجى ملء ميتاداتا الـ CSR وإرفاق الشهادة العامة لتفعيل الجاهزية.
                      </p>
                    </div>
                  )}

                  {/* Checklist of Readiness items */}
                  <div className="space-y-3 pt-1 text-[11px]">
                    <div className="font-bold text-slate-700 text-xs">بنود تدقيق التجهيز الضريبي:</div>

                    {readiness.checks.map((check, index) => (
                      <div key={index} className="flex flex-col border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="font-semibold text-slate-700 text-[10.5px] leading-normal">{check.title}</span>
                          {check.checked ? (
                            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            check.type === 'critical' ? (
                              <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Architecture Description */}
                  <div className="border border-slate-200 bg-slate-50/60 rounded-xl p-3.5 text-[10px] text-slate-700 leading-relaxed space-y-2">
                    <div className="font-extrabold flex items-center gap-1.5 text-slate-900 text-[11px]">
                      <Terminal className="w-4 h-4 text-brand-blue" />
                      <span>المرحلة 15: CSR/CSID Isolation</span>
                    </div>
                    <p>
                      تتكامل هذه المرحلة مع مخرجات الـ SDK اليدوي من المرحلة 14 لتسجيل وتجريب بيئات الربط قبل إدخال الـ Web APIs.
                    </p>
                    <p className="text-[9px] text-slate-500 font-semibold">
                      يتم تفعيل الامتثال بدون أي مشاركة للمفاتيح الخاصة على السيرفر المشترك.
                    </p>
                  </div>

                </div>
              </div>

              {/* Secure Vault Architecture helper */}
              <div className="bg-slate-950 text-slate-100 rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-bold text-slate-100">بنية الأمان المشددة للمفاتيح</h4>
                </div>

                <div className="text-[10px] text-slate-400 space-y-2.5 leading-relaxed font-sans">
                  <p>
                    يتوافق هذا النظام مع إرشادات الأمن الخاصة بهيئة الزكاة والجمارك والضريبة (ZATCA Security Directives).
                  </p>
                  <p className="text-emerald-400 font-bold">
                    حماية من تسريب البيانات (Zero-leak policy):
                  </p>
                  <ul className="list-disc pr-3 space-y-1 text-slate-300">
                    <li>يتم الكشف وتصفية الكلمات الحساسة تلقائياً قبل الحفظ في السيرفر.</li>
                    <li>يتم إقران المفتاح الخاص لاحقاً بمرجع مخفي (Secret Reference Path) مستقر في Edge Functions المشفرة بالكامل.</li>
                  </ul>
                </div>
              </div>
            </>
          )}

          {activeTab === 'sandbox' && (
            /* Sandbox Tab Right Panel: Safety, Secrets, and Integration Guidance */
            <>
              {/* Secure Sandbox Vault helper */}
              <div className="bg-slate-950 text-slate-100 rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-bold text-slate-100 font-sans">بنية أمان وخصوصية الربط</h4>
                </div>

                <div className="text-[10px] text-slate-400 space-y-2.5 leading-relaxed font-sans">
                  <p>
                    يتوافق نظام LEDGRA تماماً مع شروط الحماية وضوابط الأمن القومي السيبراني.
                  </p>
                  <p className="text-emerald-400 font-bold text-[10.5px]">
                    سياسة عدم مشاركة الأسرار (Secrets Isolation):
                  </p>
                  <ul className="list-disc pr-3.5 space-y-1.5 text-slate-300">
                    <li>يتم إرسال كافة الطلبات مباشرة من خادم Edge Functions المشفر، دون مرور مفاتيح البيئة للعميل.</li>
                    <li>يتم استيراد الروابط وقواعد السماح بالولوج من الخزائن الآمنة (Encrypted Environment Secrets) في بيئة التشغيل.</li>
                  </ul>
                </div>
              </div>

              {/* Next Steps for Integration */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4 shadow-sm h-fit">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <Terminal className="w-4 h-4 text-slate-500" />
                  <h4 className="text-xs font-bold text-slate-950">مستويات امتثال الربط للمرحلة القادمة</h4>
                </div>

                <div className="space-y-3.5 text-[10.5px] text-slate-600 leading-relaxed font-sans">
                  <div className="flex gap-2">
                    <span className="bg-slate-100 text-slate-800 font-extrabold px-1.5 py-0.5 h-fit rounded text-[10px]">1</span>
                    <p><strong>تفعيل خيار الإرسال:</strong> يجب تهيئة المتغير <code className="bg-slate-100 px-1 py-0.5 rounded text-[9.5px] font-mono">ZATCA_ENABLE_SANDBOX_SUBMIT</code> يدوياً على السيرفر لتفعيل النقل الفعلي لـ XML.</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="bg-slate-100 text-slate-800 font-extrabold px-1.5 py-0.5 h-fit rounded text-[10px]">2</span>
                    <p><strong>بناء التوقيع الرقمي (Digital Signing):</strong> لامتثال الإرسال، يجب توقيع الفواتير بترميز الـ ECDSA واستيراد التوقيع لملفات الـ XML أولاً.</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="bg-slate-100 text-slate-800 font-extrabold px-1.5 py-0.5 h-fit rounded text-[10px]">3</span>
                    <p><strong>محاكاة الاستجابات (Mock Verification):</strong> يتم تدوين كل المعاملات الصادرة والواردة داخل قاعدة بياناتك بصورة تفصيلية وموثوقة للفحص والمراجعة.</p>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>

      </div>

    </div>
  );
};

