import React, { useState } from 'react';
import { useForm, FormProvider, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n/translations';
import { Logo } from '../../components/Logo';
import { 
  Building2, 
  MapPin, 
  Phone, 
  Mail, 
  Receipt, 
  CalendarClock, 
  Settings2, 
  BadgeCheck, 
  ArrowRight, 
  ArrowLeft,
  ChevronLeft,
  Coins,
  Globe2,
  ShieldCheck
} from 'lucide-react';

// Unified schema for the entire wizard
import { normalizeIntegerInput, normalizeInputDigits } from '../../lib/formatters';
import { supabase } from '../../lib/supabase';
import { CoaTemplateSelector } from '../accounting/CoaTemplateSelector';
import {
  getCountryProfile,
  validatePhone,
  validateCommercialRegistration,
  validateTaxNumber,
  countryProfiles
} from '../../lib/countryProfiles';

const onboardingSchema = z.object({
  // Step 1
  name_ar: z.string().min(3, { message: 'اسم المنشأة بالعربية مطلوب ولا يقل عن 3 أحرف' }),
  name_en: z.string().optional(),
  activity_type: z.string().min(1, { message: 'يرجى اختيار نوع النشاط الرئيسي' }),
  country_code: z.string().default('SA'),
  city: z.string().min(1, { message: 'المدينة مطلوبة' }),
  phone: z.preprocess((val) => {
    if (typeof val === 'string') return val.trim();
    return val;
  }, z.string().optional().or(z.literal(''))),
  email: z.string().min(1, { message: 'البريد الإلكتروني مطلوب' }).email({ message: 'البريد الإلكتروني غير صحيح' }),
  
  // Step 2
  legal_type: z.string().min(1, { message: 'يرجى تحديد الشكل القانوني للمنشأة' }),
  cr_number: z.preprocess((val) => {
    if (typeof val === 'string') return normalizeIntegerInput(val);
    return val;
  }, z.string().optional()),
  vat_number: z.preprocess((val) => {
    if (typeof val === 'string') return normalizeIntegerInput(val);
    return val;
  }, z.string().optional()),
  is_vat_registered: z.boolean().default(false),
  fiscal_year_start: z.preprocess((val) => {
    if (typeof val === 'string') return normalizeInputDigits(val);
    return val;
  }, z.string().min(1, { message: 'تاريخ بداية السنة المالية مطلوب' })),
  currency_code: z.string().default('SAR'),
  primary_language: z.string().default('ar'),

  // Step 3
  accounting_mode: z.enum(['simple', 'pro']).default('pro'),
  use_system_start: z.preprocess((val) => {
    if (typeof val === 'string') return normalizeInputDigits(val);
    return val;
  }, z.string().min(1, { message: 'تاريخ بدء استخدام النظام مطلوب' })),
  starting_balances_later: z.boolean().default(true)
}).superRefine((data, ctx) => {
  // Dynamic validation using countryProfiles helpers
  
  // 1. Phone validation
  const phoneRes = validatePhone(data.country_code, data.phone);
  if (!phoneRes.isValid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: phoneRes.errorAr || 'رقم الجوال غير صحيح',
      path: ['phone']
    });
  }

  // 2. Commercial Registration (CR) validation
  const profile = getCountryProfile(data.country_code);
  if (profile.crRequired || (data.cr_number && data.cr_number.trim() !== '')) {
    const crRes = validateCommercialRegistration(data.country_code, data.cr_number);
    if (!crRes.isValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: crRes.errorAr || 'رقم السجل التجاري غير صحيح',
        path: ['cr_number']
      });
    }
  }

  // 3. VAT Number validation
  if (data.is_vat_registered) {
    const vatRes = validateTaxNumber(data.country_code, data.vat_number, true);
    if (!vatRes.isValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: vatRes.errorAr || 'الرقم الضريبي غير صحيح',
        path: ['vat_number']
      });
    }
  }
});

type OnboardingFields = z.infer<typeof onboardingSchema>;

const activityTypeOptions = Array.from(new Set([
  'التجارة بالتجزئة والجملة',
  'الخدمات التقنية وتقنية المعلومات',
  'المقاولات والإنشاءات والتشغيل',
  'المطاعم والمقاهي والأغذية',
  'الخدمات الطبية والرعاية الصحية',
  'المصانع والتصنيع والإنتاج',
  'الاستشارات والتدريب والتعليم',
  'أخرى'
]));

const cityOptions = ['الرياض', 'جدة', 'الدمام', 'مكة المكرمة', 'المدينة المنورة', 'الخبر', 'بريدة', 'أبها', 'تبوك'];

export const Onboarding: React.FC = () => {
  const { createOrg, updateOrg, currentOrg, profile, signOut, user, orgsList, roleInCurrentOrg } = useAuth();
  const { t } = useTranslation('ar');
  const navigate = useNavigate();
  const [step, setStep] = useState<number>(1);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [hasAccounts, setHasAccounts] = useState<boolean>(false);

  React.useEffect(() => {
    const checkAccounts = async () => {
      if (currentOrg?.id) {
        try {
          const { count, error } = await supabase
            .from('accounts')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', currentOrg.id);
          
          if (!error && count !== null) {
            if (count > 0) {
              setHasAccounts(true);
            } else {
              // Auto-seed in the background to ensure accounts exist
              const industryType = currentOrg.activity_type || 'general_trading';
              const { error: seedError } = await supabase.rpc('ensure_default_chart_of_accounts', {
                p_organization_id: currentOrg.id,
                p_industry_type: industryType
              });
              if (!seedError) {
                setHasAccounts(true);
              }
            }
          }
        } catch (err) {
          console.error('Error checking accounts for onboarding:', err);
        }
      }
    };
    checkAccounts();
  }, [currentOrg]);

  const methods = useForm<OnboardingFields>({
    resolver: zodResolver(onboardingSchema) as any,
    mode: 'onChange',
    defaultValues: {
      name_ar: '',
      name_en: '',
      activity_type: 'الخدمات التقنية وتقنية المعلومات',
      country_code: 'SA',
      city: 'الرياض',
      phone: profile?.phone || '',
      email: '',
      legal_type: 'individual',
      cr_number: '',
      vat_number: '',
      is_vat_registered: false,
      fiscal_year_start: '2026-01-01',
      currency_code: 'SAR',
      primary_language: 'ar',
      accounting_mode: 'pro',
      use_system_start: new Date().toISOString().split('T')[0],
      starting_balances_later: true
    }
  });

  const { register, trigger, handleSubmit, watch, setValue, formState: { isValid, isSubmitting } } = methods;

  const currentValues = watch();
  const currentProfile = getCountryProfile(currentValues.country_code);

  // Load initial draft state of organization if it already exists (Requirement 6)
  React.useEffect(() => {
    if (currentOrg && !currentOrg.onboarding_completed) {
      methods.reset({
        name_ar: currentOrg.name_ar || '',
        name_en: currentOrg.name_en || '',
        activity_type: currentOrg.activity_type || 'الخدمات التقنية وتقنية المعلومات',
        country_code: currentOrg.country_code || 'SA',
        city: currentOrg.city || 'الرياض',
        phone: currentOrg.phone || profile?.phone || '',
        email: currentOrg.email || '',
        legal_type: currentOrg.legal_type || 'individual',
        cr_number: currentOrg.cr_number || '',
        vat_number: currentOrg.vat_number || '',
        is_vat_registered: currentOrg.is_vat_registered || false,
        fiscal_year_start: currentOrg.fiscal_year_start || '2026-01-01',
        currency_code: currentOrg.currency_code || 'SAR',
        primary_language: currentOrg.primary_language || 'ar',
        accounting_mode: (currentOrg.accounting_mode as 'simple' | 'pro') || 'pro',
        use_system_start: currentOrg.system_start_date || new Date().toISOString().split('T')[0],
        starting_balances_later: currentOrg.starting_balances_later ?? true
      });
      if (currentOrg.onboarding_step) {
        setStep(currentOrg.onboarding_step);
      }
    }
  }, [currentOrg, profile, methods]);

  // Validate step before advancing and save progress to Supabase (Requirement 6)
  const handleNext = async () => {
    let fieldsToValidate: Array<keyof OnboardingFields> = [];
    if (step === 1) {
      fieldsToValidate = ['name_ar', 'name_en', 'activity_type', 'city', 'phone', 'email'];
    } else if (step === 2) {
      fieldsToValidate = ['legal_type', 'cr_number', 'vat_number', 'fiscal_year_start'];
    } else if (step === 3) {
      fieldsToValidate = ['use_system_start'];
    }

    const isStepValid = await trigger(fieldsToValidate);
    if (isStepValid) {
      // Save progress to database on step transition so state is not lost
      const vals = methods.getValues();
      try {
        setIsSaving(true);
        setApiError(null);
        if (step === 1) {
          const existingDraft = (currentOrg && !currentOrg.onboarding_completed)
            ? currentOrg
            : orgsList.find(o => !o.onboarding_completed);

          if (!existingDraft) {
            // Create draft organization
            const response = await createOrg({
              name_ar: vals.name_ar,
              name_en: vals.name_en || '',
              activity_type: vals.activity_type,
              country_code: vals.country_code || 'SA',
              city: vals.city,
              phone: vals.phone?.trim() ? vals.phone.trim() : null,
              email: vals.email,
              legal_type: vals.legal_type || 'individual',
              vat_number: vals.vat_number || '',
              is_vat_registered: vals.is_vat_registered || false,
              fiscal_year_start: vals.fiscal_year_start || '2026-01-01',
              cr_number: vals.cr_number || '',
              system_start_date: vals.use_system_start || new Date().toISOString().split('T')[0],
              accounting_mode: vals.accounting_mode || 'pro',
              starting_balances_later: vals.starting_balances_later ?? true,
              currency_code: vals.currency_code || 'SAR',
              primary_language: vals.primary_language || 'ar',
              onboarding_completed: false,
              onboarding_step: 2
            });
            if (response.error) {
              setApiError(response.error);
              return;
            }
          } else {
            // Update draft organization
            const response = await updateOrg(existingDraft.id, {
              name_ar: vals.name_ar,
              name_en: vals.name_en || '',
              activity_type: vals.activity_type,
              city: vals.city,
              phone: vals.phone?.trim() ? vals.phone.trim() : null,
              email: vals.email,
              onboarding_step: 2
            });
            if (response.error) {
              setApiError(response.error);
              return;
            }
          }
        } else if (step === 2) {
          const draftOrg = (currentOrg && !currentOrg.onboarding_completed)
            ? currentOrg
            : orgsList.find(o => !o.onboarding_completed);

          if (draftOrg) {
            // Update draft with step 2 values
            const response = await updateOrg(draftOrg.id, {
              legal_type: vals.legal_type,
              cr_number: vals.cr_number,
              vat_number: vals.vat_number || '',
              is_vat_registered: vals.is_vat_registered,
              fiscal_year_start: vals.fiscal_year_start,
              onboarding_step: 3
            });
            if (response.error) {
              setApiError(response.error);
              return;
            }
          }
        } else if (step === 3) {
          const draftOrg = (currentOrg && !currentOrg.onboarding_completed)
            ? currentOrg
            : orgsList.find(o => !o.onboarding_completed);

          if (draftOrg) {
            // Update draft with step 3 values
            const response = await updateOrg(draftOrg.id, {
              system_start_date: vals.use_system_start || new Date().toISOString().split('T')[0],
              accounting_mode: vals.accounting_mode || 'pro',
              starting_balances_later: vals.starting_balances_later ?? true,
              onboarding_step: 4
            });
            if (response.error) {
              setApiError(response.error);
              return;
            }
          }
        }
        
        setStep((prev) => prev + 1);
        setApiError(null);
      } catch (err: unknown) {
        const errorObj = err as Error;
        setApiError(errorObj.message || 'فشل حفظ المسودة التلقائي.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Save progress and go back
  const handlePrev = () => {
    setStep((prev) => prev - 1);
    setApiError(null);
  };

  const onWizardFinish: SubmitHandler<OnboardingFields> = async (data) => {
    setApiError(null);
    try {
      setIsSaving(true);
      // Save onboarding completion (Requirement 2 & 3)
      let response;
      const draftOrg = (currentOrg && !currentOrg.onboarding_completed)
        ? currentOrg
        : orgsList.find(o => !o.onboarding_completed);

      const cleanPhone = data.phone?.trim() ? data.phone.trim() : null;
      if (draftOrg) {
        // Update existing org to final status
        response = await updateOrg(draftOrg.id, {
          name_ar: data.name_ar,
          name_en: data.name_en || '',
          activity_type: data.activity_type,
          country_code: data.country_code || 'SA',
          city: data.city,
          phone: cleanPhone,
          email: data.email,
          legal_type: data.legal_type,
          cr_number: data.cr_number,
          vat_number: data.vat_number || '',
          is_vat_registered: data.is_vat_registered,
          fiscal_year_start: data.fiscal_year_start,
          system_start_date: data.use_system_start,
          accounting_mode: data.accounting_mode,
          starting_balances_later: data.starting_balances_later ?? true,
          onboarding_completed: true,
          onboarding_step: 4,
          setup_completed_at: new Date().toISOString()
        });
      } else {
        // Create new directly as completed
        response = await createOrg({
          name_ar: data.name_ar,
          name_en: data.name_en || '',
          activity_type: data.activity_type,
          country_code: data.country_code || 'SA',
          city: data.city,
          phone: cleanPhone,
          email: data.email,
          legal_type: data.legal_type,
          cr_number: data.cr_number,
          vat_number: data.vat_number || '',
          is_vat_registered: data.is_vat_registered,
          fiscal_year_start: data.fiscal_year_start,
          system_start_date: data.use_system_start,
          accounting_mode: data.accounting_mode,
          starting_balances_later: data.starting_balances_later ?? true,
          onboarding_completed: true,
          onboarding_step: 4
        });
      }

      if (response && response.error) {
        setApiError(response.error);
      } else {
        if (!response || !response.org || !response.org.onboarding_completed) {
          throw new Error('لم يتم تثبيت اكتمال إعداد المنشأة في قاعدة البيانات.');
        }

        // Save the correct selected ID using always user.id as requested
        if (user) {
          localStorage.setItem(`ledgra_selected_org_${user.id}`, response.org.id);
        }

        // Redirect directly to base url to trigger guard validation (Requirement 2 & 3)
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 100);
      }
    } catch (e: unknown) {
      const errorObj = e as Error;
      setApiError(errorObj.message || 'حدث خطأ غير متوقع أثناء إعداد المنشأة.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans" dir="rtl">
      
      {/* Top Professional Banner */}
      <header className="bg-white border-b border-slate-200 py-4 px-6 md:px-12 flex items-center justify-between shadow-sm shrink-0">
        <Logo variant="full" theme="light" size="sm" />
        <div className="flex items-center gap-4 text-xs md:text-sm">
          <div className="text-right">
            <span className="text-slate-500">مرحباً بـ</span>
            <span className="font-bold text-slate-800 mr-1">{profile?.full_name || 'العميل المشارك'}</span>
          </div>
          <button
            onClick={() => signOut()}
            className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-600 transition shrink-0 cursor-pointer"
          >
            خروج من الحساب
          </button>
        </div>
      </header>

      {/* Main Core View Area */}
      <main className="grow flex flex-col items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-4xl bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[580px]">
          
          {/* Stepper Sidebar Left */}
          <div className="md:col-span-4 bg-brand-navy p-6 md:p-8 text-white flex flex-col justify-between border-l border-slate-700/30">
            <div>
              <span className="text-xs font-bold text-brand-turquoise tracking-wide uppercase bg-brand-turquoise/10 px-2.5 py-1 rounded-full">
                الإعداد السحابي الأولي
              </span>
              <h3 className="text-lg font-bold mt-4 leading-tight">تهيئة منشأتك على لِدجرا</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                نقوم بتضبيط شجرة القيود والتهيئة المحاسبية الفورية بما يسهل نشاطك التجاري والمالي تمهيداً للامتثال لاحقاً.
              </p>
            </div>

            {/* Steps visual track */}
            <div className="space-y-6 my-8">
              {[
                { num: 1, title: 'معلومات المنشأة', icon: Building2 },
                { num: 2, title: 'المعلومات الضريبية والقانونية', icon: Receipt },
                { num: 3, title: 'الإعداد المحاسبي والبدء', icon: Settings2 },
                { num: 4, title: 'التأسيس المالي لقطاعك', icon: ShieldCheck }
              ].map((s) => {
                const isActive = step === s.num;
                const isCompleted = step > s.num;
                const Icon = s.icon;
                return (
                  <div key={s.num} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                      isActive 
                        ? 'bg-brand-blue text-white ring-4 ring-brand-blue/30' 
                        : isCompleted 
                        ? 'bg-brand-turquoise text-white' 
                        : 'bg-slate-800 text-slate-500'
                    }`}>
                      {isCompleted ? '✓' : s.num}
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-bold transition-colors ${isActive ? 'text-white' : isCompleted ? 'text-slate-300' : 'text-slate-500'}`}>
                        {s.title}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {isActive ? 'جاري التعبئة' : isCompleted ? 'مكتمل بنجاح' : 'معلق'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Security and compliance card */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-right">
              <span className="text-[10px] font-bold text-brand-turquoise uppercase block">الأمن والامتثال</span>
              <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                {currentValues.country_code === 'YE'
                  ? 'مهيأ لتلبية متطلبات الامتثال الضريبي ولائحة الفوترة والقوانين المالية للجمهورية اليمنية.'
                  : 'مهيأ لتطوير ودعم متطلبات هيئة الزكاة والضريبة والجمارك ولائحة الفوترة الإلكترونية بالمملكة العربية السعودية.'
                }
              </p>
            </div>
          </div>

          {/* Form Wizard Fields Area - Right */}
          <div className="md:col-span-8 p-6 md:p-10 flex flex-col justify-between">
            <FormProvider {...methods}>
              <form id="onboarding-form" onSubmit={handleSubmit(onWizardFinish as any)} className="space-y-6">
                
                {/* Error Banner */}
                {apiError && (
                  <div className="bg-red-50 border-r-4 border-red-500 p-3 rounded-lg text-xs text-red-700 flex items-center gap-2">
                    <span className="font-bold">خطأ في التهيئة:</span>
                    <span>{apiError}</span>
                  </div>
                )}

                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 15 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-5"
                  >
                    {/* STEP 1: General Company Info */}
                    {step === 1 && (
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">معلومات المنشأة وعنوان النشاط</h4>
                          <p className="text-xs text-slate-500 mt-1">ابدأ وإدخل البيانات الأساسية التي ستظهر على مراسلاتك وفواتيرك.</p>
                        </div>

                        {/* Country Selection Cards */}
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-700">دولة المقر للمنشأة *</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Saudi Arabia Card */}
                            <div
                              id="country-card-sa"
                              onClick={() => {
                                setValue('country_code', 'SA');
                                setValue('currency_code', countryProfiles.SA.currencyCode);
                                setValue('city', countryProfiles.SA.cities[0]);
                              }}
                              className={`cursor-pointer border-2 rounded-2xl p-4 flex items-center justify-between transition ${
                                currentValues.country_code === 'SA'
                                  ? 'border-brand-blue bg-blue-50/20 shadow-md ring-2 ring-brand-blue/30'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              <div className="text-right">
                                <span className="text-xs font-bold text-slate-900 block">{countryProfiles.SA.nameAr}</span>
                                <span className="text-[10px] text-slate-500 block mt-1">العملة الأساسية: {countryProfiles.SA.currencyNameAr} ({countryProfiles.SA.currencyCode})</span>
                                <span className="text-[10px] text-emerald-600 block mt-0.5">الضريبة الافتراضية: {countryProfiles.SA.defaultTaxRate}% {countryProfiles.SA.zatcaEnabled ? '(ZATCA مدعوم)' : ''}</span>
                              </div>
                              <Globe2 className={`w-6 h-6 transition-colors ${
                                currentValues.country_code === 'SA' ? 'text-brand-blue' : 'text-slate-400'
                              }`} />
                            </div>

                            {/* Yemen Card */}
                            <div
                              id="country-card-ye"
                              onClick={() => {
                                setValue('country_code', 'YE');
                                setValue('currency_code', countryProfiles.YE.currencyCode);
                                setValue('city', countryProfiles.YE.cities[0]);
                              }}
                              className={`cursor-pointer border-2 rounded-2xl p-4 flex items-center justify-between transition ${
                                currentValues.country_code === 'YE'
                                  ? 'border-brand-purple bg-purple-50/20 shadow-md ring-2 ring-brand-purple/30'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              <div className="text-right">
                                <span className="text-xs font-bold text-slate-900 block">{countryProfiles.YE.nameAr}</span>
                                <span className="text-[10px] text-slate-500 block mt-1">العملة الأساسية: {countryProfiles.YE.currencyNameAr} ({countryProfiles.YE.currencyCode})</span>
                                <span className="text-[10px] text-slate-500 block mt-0.5">ضريبة افتراضية: {countryProfiles.YE.defaultTaxRate}% {countryProfiles.YE.zatcaEnabled ? '(ZATCA مدعوم)' : ''}</span>
                              </div>
                              <Globe2 className={`w-6 h-6 transition-colors ${
                                currentValues.country_code === 'YE' ? 'text-brand-purple' : 'text-slate-400'
                              }`} />
                            </div>
                          </div>
                        </div>

                        {/* Hidden Inputs for Form State Registration */}
                        <input type="hidden" {...register('country_code')} />
                        <input type="hidden" {...register('currency_code')} />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم المنشأة بالعربية *</label>
                            <input
                              id="input-name-ar"
                              type="text"
                              placeholder="مثال: شركة لِدجرا المحدودة"
                              {...register('name_ar')}
                              className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
                            />
                            {methods.formState.errors.name_ar && (
                              <p className="text-xs text-red-600 mt-1">{methods.formState.errors.name_ar.message}</p>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم المنشأة بالإنجليزية (اختياري)</label>
                            <input
                              id="input-name-en"
                              type="text"
                              placeholder="e.g. LEDGRA Ltd."
                              {...register('name_en')}
                              className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
                              style={{ direction: 'ltr', textAlign: 'right' }}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع النشاط التجاري *</label>
                            <select
                              id="select-activity-type"
                              {...register('activity_type')}
                              className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
                            >
                              {activityTypeOptions.map((act) => (
                                <option key={act} value={act}>{act}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">المدينة *</label>
                            <input
                              id="input-city"
                              type="text"
                              placeholder={`مثال: ${currentProfile.cities[0]}`}
                              {...register('city')}
                              className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
                              list="cities-list"
                            />
                            <datalist id="cities-list">
                              {currentProfile.cities.map((c) => <option key={c} value={c} />)}
                            </datalist>
                            {methods.formState.errors.city && (
                              <p className="text-xs text-red-600 mt-1">{methods.formState.errors.city.message}</p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">الدولة المحددة</label>
                            <div className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-xl text-sm text-slate-600 font-semibold flex items-center justify-between">
                              <span>{currentProfile.nameAr}</span>
                              <Globe2 className="w-4 h-4 text-emerald-600" />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">رقم جوال المنشأة (اختياري)</label>
                            <input
                              id="input-phone"
                              type="tel"
                              placeholder={currentProfile.phonePlaceholder ? `${currentProfile.phonePlaceholder} (اختياري)` : '05XXXXXXXX (اختياري)'}
                              {...register('phone')}
                              className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition text-left font-mono tabular-nums"
                              dir="ltr"
                            />
                            {methods.formState.errors.phone && (
                              <p className="text-xs text-red-600 mt-1">{methods.formState.errors.phone.message}</p>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">البريد الإلكتروني التجاري المعتمد *</label>
                          <input
                            id="input-email"
                            type="email"
                            placeholder="finance@yourcompany.com"
                            {...register('email')}
                            className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
                            style={{ direction: 'ltr', textAlign: 'right' }}
                          />
                          {methods.formState.errors.email && (
                            <p className="text-xs text-red-600 mt-1">{methods.formState.errors.email.message}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* STEP 2: Legal structure, taxation compliance */}
                    {step === 2 && (
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">الكيان القانوني والتسجيل الضريبي</h4>
                          <p className="text-xs text-slate-500 mt-1">تحديد الهيكل القانوني ورقم السجل التجاري لغايات مطابقة شروط التسجيل وضوابط ممارسة الأعمال بسلاسة.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع الكيان والكيان القانوني *</label>
                            <select
                              id="select-legal-type"
                              {...register('legal_type')}
                              className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
                            >
                              <option value="individual">مؤسسة فردية</option>
                              <option value="llc">شركة ذات مسؤولية محدودة (LLC)</option>
                              <option value="joint">شركة مساهمة عامة / مغلقة</option>
                              <option value="branch">فرع شركة أجنبية</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">{currentProfile.crLabel} {currentProfile.crRequired ? '*' : '(اختياري)'}</label>
                            <input
                              id="input-cr-number"
                              type="text"
                              placeholder={currentProfile.code === 'SA' ? 'مثال: 1010xxxxxx' : 'رقم السجل التجاري'}
                              {...register('cr_number', {
                                onChange: (e) => {
                                  e.target.value = currentProfile.code === 'SA'
                                    ? normalizeIntegerInput(e.target.value)
                                    : normalizeInputDigits(e.target.value);
                                }
                              })}
                              className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition text-left font-mono tabular-nums"
                              dir="ltr"
                              inputMode={currentProfile.code === 'SA' ? 'numeric' : 'text'}
                            />
                            {methods.formState.errors.cr_number && (
                              <p className="text-xs text-red-600 mt-1">{methods.formState.errors.cr_number.message}</p>
                            )}
                          </div>
                        </div>

                        {/* Interactive toggle for VAT Registration */}
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                          <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                              id="checkbox-vat-registered"
                              type="checkbox"
                              {...register('is_vat_registered')}
                              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue/20 w-4.5 h-4.5"
                            />
                            <div className="text-right">
                              <span className="text-xs font-bold text-slate-900 block">هل المنشأة مسجلة في ضريبة القيمة المضافة؟</span>
                              <span className="text-[10px] text-slate-500">
                                {currentProfile.code === 'SA' 
                                  ? 'اختر هذا الخيار فقط في حال حصولك على شهادة التسجيل الضريبي بضريبة القيمة المضافة بالمملكة العربية السعودية.' 
                                  : 'اختر هذا الخيار في حال كون المنشأة مسجلة في مصلحة الضرائب بالجمهورية اليمنية.'}
                              </span>
                            </div>
                          </label>

                          {currentValues.is_vat_registered && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="pt-2 border-t border-slate-200/80"
                            >
                              <label className="block text-xs font-bold text-slate-700 mb-1.5">{currentProfile.vatLabel} *</label>
                              <input
                                id="input-vat-number"
                                type="text"
                                placeholder={currentProfile.code === 'SA' ? '3xxxxxxxxxxxx3' : 'رقم الملف الضريبي'}
                                {...register('vat_number', {
                                  onChange: (e) => {
                                    e.target.value = currentProfile.code === 'SA'
                                      ? normalizeIntegerInput(e.target.value)
                                      : normalizeInputDigits(e.target.value);
                                  }
                                })}
                                className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition text-left font-mono tabular-nums"
                                dir="ltr"
                                inputMode={currentProfile.code === 'SA' ? 'numeric' : 'text'}
                              />
                              {methods.formState.errors.vat_number && (
                                <p className="text-xs text-red-600 mt-1">{methods.formState.errors.vat_number.message}</p>
                              )}
                            </motion.div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ بداية السنة المالية *</label>
                            <input
                              id="input-fiscal-start"
                              type="date"
                              {...register('fiscal_year_start')}
                              className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">العملة الأساسية</label>
                            <div className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-xl text-sm text-slate-600 font-bold flex items-center justify-between">
                              <span>{currentProfile.currencyNameAr} ({currentProfile.currencyCode})</span>
                              <Coins className="w-4 h-4 text-amber-500" />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* STEP 3: Accounting system type, ledger configuration */}
                    {step === 3 && (
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">تفاصيل الوضع المحاسبي والبدء</h4>
                          <p className="text-xs text-slate-500 mt-1">تحديد مستوى التفاصيل لتسجيل القيود وعكس الأرصدة وعمل الحسابات.</p>
                        </div>

                        {/* Interactive toggle between simple and pro accounting modes */}
                        <div className="grid grid-cols-1 gap-3">
                          <label className={`border-2 p-4 rounded-2xl flex items-start gap-3 cursor-pointer transition ${
                            currentValues.accounting_mode === 'pro'
                              ? 'border-brand-purple bg-purple-50/20'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}>
                            <input
                              type="radio"
                              value="pro"
                              {...register('accounting_mode')}
                              className="mt-1 text-brand-purple focus:ring-brand-purple/20 w-4 h-4"
                            />
                            <div className="text-right">
                              <span className="text-xs font-bold text-slate-900 block flex items-center gap-1.5">
                                <span>🚀 وضع محاسبي متكامل (احترافي) — مستحسن للمنشآت</span>
                              </span>
                              <span className="text-[10px] text-slate-500 block mt-1">
                                شجرة حسابات (دليل محاسبي) متكاملة، قيود يومية مزدوجة، ميزان المراجعة والمطابقة البنكية، مراكز التكلفة، وإقفال الفترات.
                              </span>
                            </div>
                          </label>

                          <label className={`border-2 p-4 rounded-2xl flex items-start gap-3 cursor-pointer transition ${
                            currentValues.accounting_mode === 'simple'
                              ? 'border-brand-blue bg-blue-50/20'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}>
                            <input
                              type="radio"
                              value="simple"
                              {...register('accounting_mode')}
                              className="mt-1 text-brand-blue focus:ring-brand-blue/20 w-4 h-4"
                            />
                            <div className="text-right">
                              <span className="text-xs font-bold text-slate-900 block">⚡ وضع فواتير مبيعات سريعة (مبسط)</span>
                              <span className="text-[10px] text-slate-500 block mt-1">
                                نظام مبسط للمتاجر ومقدمي الخدمة والعمل الحر. يسجل فواتير المبيعات ونقاط البيع مباشرة مع الإيرادات والمصروفات دون قيود محاسبية مركبة.
                              </span>
                            </div>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ بدء العمل بالنظام لِدجرا *</label>
                            <input
                              id="input-system-start"
                              type="date"
                              {...register('use_system_start')}
                              className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
                            />
                          </div>
                        </div>

                        {/* Starting Balance Options */}
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            id="checkbox-opening-balances"
                            {...register('starting_balances_later')}
                            className="mt-0.5 rounded border-slate-300 text-brand-blue focus:ring-brand-blue/20 w-4 h-4"
                          />
                          <label htmlFor="checkbox-opening-balances" className="text-xs text-slate-600 leading-relaxed select-none cursor-pointer">
                            <strong className="text-slate-800">إضافة الأرصدة الافتتاحية في مرحلة لاحقة بشكل مستقل.</strong>
                            <p className="text-[10px] text-slate-500 mt-0.5">يتيح لك بدء استعمال النظام على الفور وإدخال الأصول، والمخزون، والالتزامات لاحقاً عند اكتمال مطابقة السنة المالية السابقة.</p>
                          </label>
                        </div>
                      </div>
                    )}

                    {/* STEP 4: Financial setup & COA Template Selection */}
                    {step === 4 && currentOrg && (
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">التأسيس المالي للهيكل المحاسبي</h4>
                          <p className="text-xs text-slate-500 mt-1 font-sans">تجهيز شجرة الحسابات والدليل المحاسبي ليكون مهيئاً ومطابقاً لقطاع أعمالك مباشرة.</p>
                        </div>
                        
                        <CoaTemplateSelector 
                          orgId={currentOrg.id}
                          hasAccountsAlready={hasAccounts}
                          onSuccess={() => {
                            setHasAccounts(true);
                          }}
                        />
                      </div>
                    )}

                  </motion.div>
                </AnimatePresence>

                {/* Navigation Buttons Area */}
                <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                  {step > 1 ? (
                    <button
                      type="button"
                      disabled={isSaving || isSubmitting}
                      onClick={handlePrev}
                      className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <ArrowRight className="w-4 h-4" />
                      <span>{t('common.prev')}</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  {step < 4 ? (
                    <button
                      type="button"
                      id="onboarding-next-btn"
                      disabled={isSaving || isSubmitting}
                      onClick={handleNext}
                      className="px-5 py-2.5 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow disabled:opacity-50"
                    >
                      {isSaving ? (
                        <>
                          <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          <span>جاري الحفظ...</span>
                        </>
                      ) : (
                        <>
                          <span>{t('common.next')}</span>
                          <ArrowLeft className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="flex flex-col items-end gap-1.5">
                      <button
                        id="onboarding-submit-btn"
                        type="submit"
                        disabled={isSaving || isSubmitting || !hasAccounts}
                        className="px-6 py-2.5 bg-brand-turquoise hover:bg-brand-turquoise/90 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-55"
                      >
                        {isSaving || isSubmitting ? (
                          <>
                            <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                            <span>جاري الحفظ والإنهاء...</span>
                          </>
                        ) : (
                          <>
                            <BadgeCheck className="w-4 h-4" />
                            <span>{t('common.finish')}</span>
                          </>
                        )}
                      </button>
                      {!hasAccounts && (
                        roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' ? (
                          <span className="text-[10px] text-amber-600 font-sans font-bold">يرجى تأسيس دليل الحسابات أولاً لإتمام التسجيل</span>
                        ) : (
                          <span className="text-[10px] text-red-600 font-sans font-bold">لا يمكن إكمال إعداد المنشأة قبل تأسيس دليل الحسابات. يرجى التواصل مع المالك أو المدير.</span>
                        )
                      )}
                    </div>
                  )}
                </div>

              </form>
            </FormProvider>
          </div>
        </div>
      </main>
    </div>
  );
};
export default Onboarding;
