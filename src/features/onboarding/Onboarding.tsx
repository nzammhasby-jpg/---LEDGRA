import React, { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
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
  Globe2
} from 'lucide-react';

// Unified schema for the entire wizard
const onboardingSchema = z.object({
  // Step 1
  name_ar: z.string().min(3, { message: 'اسم المنشأة بالعربية مطلوب ولا يقل عن 3 أحرف' }),
  name_en: z.string().optional(),
  activity_type: z.string().min(1, { message: 'يرجى اختيار نوع النشاط الرئيسي' }),
  country: z.string().default('السعودية'),
  city: z.string().min(1, { message: 'المدينة مطلوبة' }),
  phone: z.string().regex(/^05\d{8}$/, { message: 'رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام' }),
  email: z.string().min(1, { message: 'البريد الإلكتروني مطلوب' }).email({ message: 'البريد الإلكتروني غير صحيح' }),
  
  // Step 2
  legal_type: z.string().min(1, { message: 'يرجى تحديد الشكل القانوني للمنشأة' }),
  cr_number: z.string().min(10, { message: 'السجل التجاري يجب أن يتكون من 10 أرقام' }),
  vat_number: z.string().optional()
    .refine((val) => !val || (val.length === 15 && val.startsWith('3') && val.endsWith('3')), {
      message: 'الرقم الضريبي السعودي يتكون من 15 خانة ويبدأ وينتهي بالرقم 3'
    }),
  is_vat_registered: z.boolean().default(false),
  fiscal_year_start: z.string().min(1, { message: 'تاريخ بداية السنة المالية مطلوب' }),
  currency: z.string().default('ر.س'),
  primary_language: z.string().default('ar'),

  // Step 3
  accounting_mode: z.enum(['simple', 'pro']).default('pro'),
  use_system_start: z.string().min(1, { message: 'تاريخ بدء استخدام النظام مطلوب' }),
  starting_balances_later: z.boolean().default(true)
});

type OnboardingFields = z.infer<typeof onboardingSchema>;

const mockActivityTypes = [
  'التجارة بالتجزئة والجملة',
  'الخدمات التقنية وتقنية المعلومات',
  'المقاولات والإنشاءات والتشغيل',
  'المطاعم والمقاهي والأغذية',
  'الخدمات الطبية والرعاية الصحية',
  'المصانع والتصنيع والإنتاج',
  'الاستشارات والتدريب والتعليم',
  'أخرى'
];

const mockCities = ['الرياض', 'جدة', 'الدمام', 'مكة المكرمة', 'المدينة المنورة', 'الخبر', 'بريدة', 'أبها', 'تبوك'];

export const Onboarding: React.FC = () => {
  const { createOrg, profile, signOut } = useAuth();
  const { t } = useTranslation('ar');
  const navigate = useNavigate();
  const [step, setStep] = useState<number>(1);
  const [apiError, setApiError] = useState<string | null>(null);

  const methods = useForm<OnboardingFields>({
    resolver: zodResolver(onboardingSchema) as any,
    mode: 'onChange',
    defaultValues: {
      name_ar: '',
      name_en: '',
      activity_type: 'الخدمات التقنية وتقنية المعلومات',
      country: 'السعودية',
      city: 'الرياض',
      phone: profile?.phone || '',
      email: '',
      legal_type: 'individual',
      cr_number: '',
      vat_number: '',
      is_vat_registered: false,
      fiscal_year_start: '2026-01-01',
      currency: 'ر.س',
      primary_language: 'ar',
      accounting_mode: 'pro',
      use_system_start: new Date().toISOString().split('T')[0],
      starting_balances_later: true
    }
  });

  const { register, trigger, handleSubmit, watch, formState: { isValid, isSubmitting } } = methods;

  const currentValues = watch();

  // Validate step before advancing
  const handleNext = async () => {
    let fieldsToValidate: Array<keyof OnboardingFields> = [];
    if (step === 1) {
      fieldsToValidate = ['name_ar', 'name_en', 'activity_type', 'city', 'phone', 'email'];
    } else if (step === 2) {
      fieldsToValidate = ['legal_type', 'cr_number', 'vat_number', 'fiscal_year_start'];
    }

    const isStepValid = await trigger(fieldsToValidate);
    if (isStepValid) {
      setStep((prev) => prev + 1);
      setApiError(null);
    }
  };

  const handlePrev = () => {
    setStep((prev) => prev - 1);
    setApiError(null);
  };

  const onWizardFinish = async (data: OnboardingFields) => {
    setApiError(null);
    try {
      const response = await createOrg({
        name_ar: data.name_ar,
        name_en: data.name_en || '',
        activity_type: data.activity_type,
        city: data.city,
        phone: data.phone,
        email: data.email,
        legal_type: data.legal_type,
        vat_number: data.vat_number || '',
        is_vat_registered: data.is_vat_registered,
        fiscal_year_start: data.fiscal_year_start,
        cr_number: data.cr_number,
        system_start_date: data.use_system_start,
        accounting_mode: data.accounting_mode,
        starting_balances_later: data.starting_balances_later
      });

      if (response.error) {
        setApiError(response.error);
      } else {
        // Success redirect
        navigate('/');
      }
    } catch (e: any) {
      setApiError(e.message || 'حدث خطأ غير متوقع أثناء إعداد المنشأة.');
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
                نقوم بتضبيط شجرة القيود وهدف الفواتير بما يتوافق مع نشاطك ومعايير المحاسبة والزكاة والضريبة.
              </p>
            </div>

            {/* Steps visual track */}
            <div className="space-y-6 my-8">
              {[
                { num: 1, title: 'معلومات المنشأة', icon: Building2 },
                { num: 2, title: 'المعلومات الضريبية والقانونية', icon: Receipt },
                { num: 3, title: 'الإعداد المحاسبي والبدء', icon: Settings2 }
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

            {/* Saudi compliance card */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-right">
              <span className="text-[10px] font-bold text-brand-turquoise uppercase block">الأمن والامتثال</span>
              <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                مبني طبقا لمتطلبات هيئة الزكاة والضريبة والجمارك ولائحة الفوترة الإلكترونية بالمملكة العربية السعودية.
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
                          <p className="text-xs text-slate-500 mt-1">ابدأ وإدخال البيانات الأساسية التي ستظهر على مراسلاتك وفواتيرك.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم المنشأة بالعربية *</label>
                            <input
                              id="input-name-ar"
                              type="text"
                              placeholder="مثال: شركة لِدجرا المحدودة"
                              {...register('name_ar')}
                              className="w-full px-3 py-2 border border-slate-250 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
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
                              className="w-full px-3 py-2 border border-slate-250 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
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
                              className="w-full px-3 py-2 border border-slate-250 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
                            >
                              {mockActivityTypes.map((act) => (
                                <option key={act} value={act}>{act}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">المدينة *</label>
                            <input
                              id="input-city"
                              type="text"
                              placeholder="مثال: الرياض"
                              {...register('city')}
                              className="w-full px-3 py-2 border border-slate-250 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
                              list="cities-list"
                            />
                            <datalist id="cities-list">
                              {mockCities.map((c) => <option key={c} value={c} />)}
                            </datalist>
                            {methods.formState.errors.city && (
                              <p className="text-xs text-red-600 mt-1">{methods.formState.errors.city.message}</p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">الدولة</label>
                            <div className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-xl text-sm text-slate-650 font-semibold flex items-center justify-between">
                              <span>المملكة العربية السعودية</span>
                              <Globe2 className="w-4 h-4 text-emerald-600" />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">رقم جوال المنشأة *</label>
                            <input
                              id="input-phone"
                              type="tel"
                              placeholder="05xxxxxxxx"
                              {...register('phone')}
                              className="w-full px-3 py-2 border border-slate-250 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
                              style={{ direction: 'ltr', textAlign: 'right' }}
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
                            className="w-full px-3 py-2 border border-slate-250 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
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
                          <p className="text-xs text-slate-500 mt-1">تحديد الهيكل القانوني ورقم السجل التجاري للامتثال لمتطلبات الزكاة والضريبة.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع الكيان والكيان القانوني *</label>
                            <select
                              id="select-legal-type"
                              {...register('legal_type')}
                              className="w-full px-3 py-2 border border-slate-250 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
                            >
                              <option value="individual">مؤسسة فردية</option>
                              <option value="llc">شركة ذات مسؤولية محدودة (LLC)</option>
                              <option value="joint">شركة مساهمة عامة / مغلقة</option>
                              <option value="branch">فرع شركة أجنبية</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">الرقم الموحد / السجل التجاري (CR) *</label>
                            <input
                              id="input-cr-number"
                              type="text"
                              placeholder="مثال: 1010xxxxxx"
                              {...register('cr_number')}
                              className="w-full px-3 py-2 border border-slate-250 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
                              style={{ direction: 'ltr', textAlign: 'right' }}
                            />
                            {methods.formState.errors.cr_number && (
                              <p className="text-xs text-red-600 mt-1">{methods.formState.errors.cr_number.message}</p>
                            )}
                          </div>
                        </div>

                        {/* Interactive toggle for VAT Registration */}
                        <div className="bg-slate-55 border border-slate-200 rounded-2xl p-4 space-y-3">
                          <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                              id="checkbox-vat-registered"
                              type="checkbox"
                              {...register('is_vat_registered')}
                              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue/20 w-4.5 h-4.5"
                            />
                            <div className="text-right">
                              <span className="text-xs font-bold text-slate-900 block">هل المنشأة مسجلة في ضريبة القيمة المضافة؟</span>
                              <span className="text-[10px] text-slate-500">اختر هذا الخيار فقط في حال حصولك على شهادة التسجيل الضريبي بضريبة القيمة المضافة بالمملكة العربية السعودية.</span>
                            </div>
                          </label>

                          {currentValues.is_vat_registered && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="pt-2 border-t border-slate-205/80"
                            >
                              <label className="block text-xs font-bold text-slate-700 mb-1.5">الرقم الضريبي المكون من 15 رقم يبدأ بـ 3 *</label>
                              <input
                                id="input-vat-number"
                                type="text"
                                placeholder="3xxxxxxxxxxxx3"
                                {...register('vat_number')}
                                className="w-full px-3 py-2 border border-slate-250 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
                                style={{ direction: 'ltr', textAlign: 'right' }}
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
                              className="w-full px-3 py-2 border border-slate-250 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">العملة الأساسية</label>
                            <div className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-xl text-sm text-slate-650 font-bold flex items-center justify-between">
                              <span>الريال السعودي (SAR)</span>
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
                              className="w-full px-3 py-2 border border-slate-250 bg-white rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition"
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
                          <label htmlFor="checkbox-opening-balances" className="text-xs text-slate-650 leading-relaxed select-none cursor-pointer">
                            <strong className="text-slate-800">إضافة الأرصدة الافتتاحية في مرحلة لاحقة بشكل مستقل.</strong>
                            <p className="text-[10px] text-slate-500 mt-0.5">يتيح لك بدء استعمال النظام على الفور وإدخال الأصول، والمخزون، والالتزامات لاحقاً عند اكتمال مطابقة السنة المالية السابقة.</p>
                          </label>
                        </div>
                      </div>
                    )}

                  </motion.div>
                </AnimatePresence>

                {/* Navigation Buttons Area */}
                <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                  {step > 1 ? (
                    <button
                      type="button"
                      onClick={handlePrev}
                      className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 transition flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowRight className="w-4 h-4" />
                      <span>{t('common.prev')}</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  {step < 3 ? (
                    <button
                      type="button"
                      id="onboarding-next-btn"
                      onClick={handleNext}
                      className="px-5 py-2.5 bg-brand-blue hover:bg-blue-655 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow"
                    >
                      <span>{t('common.next')}</span>
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      id="onboarding-submit-btn"
                      type="submit"
                      disabled={isSubmitting}
                      className="px-6 py-2.5 bg-brand-turquoise hover:bg-teal-655 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-55"
                    >
                      {isSubmitting ? (
                        <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      ) : (
                        <>
                          <BadgeCheck className="w-4 h-4" />
                          <span>{t('common.finish')}</span>
                        </>
                      )}
                    </button>
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
