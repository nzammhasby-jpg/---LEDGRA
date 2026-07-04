import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n/translations';
import { Logo } from '../../components/Logo';
import { Mail, Lock, CheckCircle2, ShieldAlert, Sparkles, Building2, Phone, User } from 'lucide-react';
import { normalizeIntegerInput } from '../../lib/formatters';

const registerSchema = z.object({
  fullName: z.string().min(3, { message: 'الاسم الكامل يجب أن لا يقل عن 3 أحرف' }),
  email: z.string().min(1, { message: 'البريد الإلكتروني مطلوب' }).email({ message: 'البريد الإلكتروني غير صحيح' }),
  phone: z.string()
    .regex(/^05\d{8}$/, { message: 'أدخل رقم جوال سعودي صحيح يبدأ بـ 05 ويتكون من 10 أرقام.' }),
  password: z.string().min(6, { message: 'كلمة المرور يجب أن لا تقل عن 6 أحرف' }),
  confirmPassword: z.string().min(1, { message: 'تأكيد كلمة المرور مطلوب' }),
  agreeTerms: z.boolean().refine((val) => val === true, {
    message: 'يجب الموافقة على الشروط والأحكام و سياسة الخصوصية',
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'كلمتا المرور غير متابقتين',
  path: ['confirmPassword'],
});

type RegisterFields = z.infer<typeof registerSchema>;

export const Register: React.FC = () => {
  const { signUp } = useAuth();
  const { t } = useTranslation('ar');
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiSuccess, setApiSuccess] = useState<boolean>(false);
  const [registrationSuccess, setRegistrationSuccess] = useState<boolean>(false);
  const [registeredEmail, setRegisteredEmail] = useState<string>('');
  const [showToast, setShowToast] = useState<boolean>(false);
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterFields>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      agreeTerms: true
    }
  });

  const onSubmit = async (data: RegisterFields) => {
    setApiError(null);
    setApiSuccess(false);
    setRegistrationSuccess(false);
    try {
      const response = await signUp(data.email, data.password, data.fullName, data.phone);
      if (response.error) {
        const errorMsg = response.error.toLowerCase();
        if (errorMsg.includes('already exists') || errorMsg.includes('already registered') || errorMsg.includes('مسجل مسبق')) {
          setApiError('هذا البريد الإلكتروني مسجل مسبقاً في النظام. يرجى محاولة تسجيل الدخول أو استعادة كلمة المرور.');
        } else if (errorMsg.includes('password should be') || errorMsg.includes('weak') || errorMsg.includes('خانات أو أكثر') || errorMsg.includes('ضعيفة')) {
          setApiError('كلمة المرور المدخلة ضعيفة جداً. يجب أن تحتوي كلمة المرور على 6 خانات أو أكثر لتأمين الحساب بشكل صحيح.');
        } else if (errorMsg.includes('rate limit') || errorMsg.includes('too many requests')) {
          setApiError('تم تجاوز الحد المسموح به لطلبات تسجيل الحساب مؤقتاً. يرجى الانتظار بضع دقائق والمحاولة مجدداً.');
        } else {
          setApiError(`تعذر إنشاء الحساب: ${response.error}. يرجى التحقق من المدخلات والمحاولة لاحقاً.`);
        }
      } else {
        setApiSuccess(true);
        setRegistrationSuccess(true);
        setRegisteredEmail(data.email);
        setShowToast(true);
      }
    } catch (e: any) {
      setApiError('تعذر إنشاء الحساب حاليًا. حاول مرة أخرى.');
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-slate-50 overflow-hidden font-sans" dir="rtl">
      {/* Toast Alert */}
      {showToast && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          className="fixed top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs md:text-sm px-6 py-4 rounded-2xl shadow-2xl z-50 flex items-center justify-between gap-4 max-w-[95vw] border border-slate-800"
          dir="rtl"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <span className="font-bold">تم إرسال رسالة تأكيد إلى بريدك الإلكتروني. افتح البريد وفعّل حسابك لإكمال الدخول.</span>
          </div>
          <button
            onClick={() => setShowToast(false)}
            className="text-slate-400 hover:text-white text-sm focus:outline-none cursor-pointer"
          >
            ✕
          </button>
        </motion.div>
      )}

      {/* Visual Brand Panel - Left on Desktop */}
      <div className="hidden lg:flex lg:col-span-5 bg-brand-navy relative flex-col justify-between p-12 text-white">
        <div className="absolute inset-0 bg-radial-gradient opacity-20 pointer-events-none" />
        
        {/* Top header */}
        <div className="relative z-10 flex items-center justify-between">
          <Logo variant="full" theme="dark" size="md" />
        </div>

        {/* Central Illustration Area */}
        <div className="relative z-10 my-auto max-w-sm mt-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs font-medium text-brand-turquoise">
              <Sparkles className="w-3.5 h-3.5" />
              <span>خطوة واحدة لتأمين حساباتك</span>
            </div>
            
            <h1 className="text-3xl font-bold leading-tight">
              أنشئ حسابك وابدأ تجربة محاسبية لا مثيل لها
            </h1>
            
            <p className="text-slate-300 text-sm leading-relaxed">
              انتقل الآن بالمحاسبة الكلاسيكية المعقدة إلى الفضاء المحاسبي الرقمي السهل. إعدادات سريعة، تجربة خالية من الأوراق، وتقارير لحظية دقيقة.
            </p>

            <div className="space-y-4 pt-4 border-t border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="bg-brand-turquoise/10 p-1.5 rounded-lg shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-brand-turquoise" />
                </div>
                <span className="text-sm font-semibold">بثبات تام طوال السنة المالية</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-brand-blue/10 p-1.5 rounded-lg shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-brand-blue" />
                </div>
                <span className="text-sm font-semibold">أمان وسرية بيانات معزولة بالكامل</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-xs text-slate-400 flex items-center justify-between">
          <span>لِدجرا للمحاسبة السحابية © 2026</span>
          <span className="flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            <span>رؤية المملكة 2030</span>
          </span>
        </div>
      </div>

      {/* Registration Form Panel - Right on Desktop */}
      <div className="col-span-1 lg:col-span-7 flex flex-col justify-center items-center p-6 md:p-12 xl:p-16 relative overflow-y-auto">
        <div className="w-full max-w-md space-y-6 py-8">
          
          {/* Logo element for Mobile */}
          <div className="lg:hidden flex justify-center mb-4">
            <Logo variant="full" theme="light" size="md" />
          </div>

          {!registrationSuccess ? (
            <>
              {/* Form Header */}
              <div className="text-center lg:text-right space-y-1">
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                  {t('auth.register_title')}
                </h2>
                <p className="text-slate-500 text-xs">
                  {t('auth.register_subtitle')}
                </p>
              </div>

              {/* Submit responses */}
              {apiError && (
                <div className="bg-red-50 border-r-4 border-red-500 p-4 rounded-xl flex items-start gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-semibold text-red-900">فشل إنشاء الحساب</h5>
                    <p className="text-xs text-red-700 mt-0.5">{apiError}</p>
                  </div>
                </div>
              )}

              {apiSuccess && !registrationSuccess && (
                <div className="bg-emerald-50 border-r-4 border-emerald-500 p-4 rounded-xl flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-semibold text-emerald-900">تم إنشاء الحساب بنجاح</h5>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      تم إنشاء الحساب بنجاح. تم إرسال رسالة تأكيد إلى بريدك الإلكتروني، افتح البريد واضغط رابط التفعيل لإكمال الدخول.
                    </p>
                  </div>
                </div>
              )}

              <form id="register-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('auth.full_name')}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                      <User className="w-4 h-4" />
                    </span>
                    <input
                      id="reg-fullname-field"
                      type="text"
                      placeholder="محمد أحمد"
                      {...register('fullName')}
                      className={`w-full pr-9 pl-3 py-2 bg-white border ${
                        errors.fullName ? 'border-red-400 focus:ring-red-100' : 'border-slate-200 focus:ring-brand-blue/20'
                      } rounded-xl text-sm focus:outline-none focus:ring-4 transition`}
                    />
                  </div>
                  {errors.fullName && (
                    <p className="text-xs text-red-600 mt-0.5">{errors.fullName.message}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('auth.email')}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      id="reg-email-field"
                      type="email"
                      placeholder="name@company.com"
                      {...register('email')}
                      className={`w-full pr-9 pl-3 py-2 bg-white border ${
                        errors.email ? 'border-red-400 focus:ring-red-100' : 'border-slate-200 focus:ring-brand-blue/20'
                      } rounded-xl text-sm focus:outline-none focus:ring-4 transition`}
                      style={{ direction: 'ltr', textAlign: 'right' }}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-red-600 mt-0.5">{errors.email.message}</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    رقم الجوال (السعودي)
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                      <Phone className="w-4 h-4" />
                    </span>
                    <input
                      id="reg-phone-field"
                      type="text"
                      placeholder="05XXXXXXXX"
                      {...register('phone', {
                        onChange: (e) => {
                          e.target.value = normalizeIntegerInput(e.target.value);
                        }
                      })}
                      className={`w-full pr-9 pl-3 py-2 bg-white border ${
                        errors.phone ? 'border-red-400 focus:ring-red-100' : 'border-slate-200 focus:ring-brand-blue/20'
                      } rounded-xl text-sm focus:outline-none focus:ring-4 transition text-left font-mono tabular-nums`}
                      dir="ltr"
                      inputMode="numeric"
                    />
                  </div>
                  {errors.phone && (
                    <p className="text-xs text-red-600 mt-0.5">{errors.phone.message}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('auth.password')}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      id="reg-password-field"
                      type="password"
                      placeholder="••••••••"
                      {...register('password')}
                      className={`w-full pr-9 pl-3 py-2 bg-white border ${
                        errors.password ? 'border-red-400 focus:ring-red-100' : 'border-slate-200 focus:ring-brand-blue/20'
                      } rounded-xl text-sm focus:outline-none focus:ring-4 transition`}
                      style={{ direction: 'ltr', textAlign: 'right' }}
                    />
                  </div>
                  {errors.password && (
                    <p className="text-xs text-red-600 mt-0.5">{errors.password.message}</p>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('auth.confirm_password')}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      id="reg-confirmpassword-field"
                      type="password"
                      placeholder="••••••••"
                      {...register('confirmPassword')}
                      className={`w-full pr-9 pl-3 py-2 bg-white border ${
                        errors.confirmPassword ? 'border-red-400 focus:ring-red-100' : 'border-slate-200 focus:ring-brand-blue/20'
                      } rounded-xl text-sm focus:outline-none focus:ring-4 transition`}
                      style={{ direction: 'ltr', textAlign: 'right' }}
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-xs text-red-600 mt-0.5">{errors.confirmPassword.message}</p>
                  )}
                </div>

                {/* Terms and Conditions */}
                <div className="flex items-start gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="agree-checkbox"
                    {...register('agreeTerms')}
                    className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue/30 w-4 h-4 mt-0.5"
                  />
                  <label htmlFor="agree-checkbox" className="text-[11px] leading-relaxed text-slate-500 cursor-pointer select-none">
                    أوافق على <a href="#" className="text-brand-blue font-semibold hover:underline">شروط الخدمة</a> و <a href="#" className="text-brand-blue font-semibold hover:underline">سياسة الخصوصية</a> الخاصة بمنصة لِدجرا.
                  </label>
                </div>
                {errors.agreeTerms && (
                  <p className="text-xs text-red-600 mt-0.5">{errors.agreeTerms.message}</p>
                )}

                {/* Submit btn */}
                <button
                  id="submit-register-btn"
                  type="submit"
                  disabled={isSubmitting || apiSuccess}
                  className="w-full py-2.5 px-4 bg-brand-blue hover:bg-blue-600 text-white font-bold rounded-xl text-sm shadow-md hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-brand-blue/20 transition disabled:opacity-55 flex items-center justify-center gap-2 cursor-pointer pt-2"
                >
                  {isSubmitting ? (
                    <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <span>{t('auth.sign_up_btn')}</span>
                  )}
                </button>
              </form>

              {/* Form switch link */}
              <div className="text-center pt-4 border-t border-slate-100">
                <span className="text-sm text-slate-500">{t('auth.already_have_account')} </span>
                <Link id="link-to-login" to="/login" className="text-sm font-bold text-brand-blue hover:underline">
                  {t('auth.sign_in')}
                </Link>
              </div>
            </>
          ) : (
            <div className="bg-white border border-slate-200/80 p-8 rounded-3xl text-center space-y-6 shadow-xl animate-fade-in relative overflow-hidden" dir="rtl">
              <div className="bg-emerald-50 text-emerald-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-900">تم إرسال رابط تأكيد إلى بريدك الإلكتروني</h3>
                <p className="text-slate-500 text-xs leading-relaxed px-2">
                  افتح بريدك واضغط على رابط التفعيل لإكمال إنشاء الحساب
                </p>
              </div>
              
              <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl text-xs text-slate-700 font-semibold space-y-1">
                <span className="text-slate-400 block text-[10px] font-bold">تم الإرسال إلى</span>
                <span className="font-bold text-brand-blue font-mono text-sm block select-all">{registeredEmail}</span>
              </div>

              <div className="pt-2 space-y-3">
                <Link
                  id="btn-login-after-verify"
                  to="/login"
                  className="block w-full py-3 px-4 bg-brand-blue hover:bg-blue-600 text-white font-bold rounded-xl text-xs shadow-md hover:shadow-lg transition text-center duration-200 cursor-pointer"
                >
                  العودة لتسجيل الدخول
                </Link>
                
                <button
                  type="button"
                  onClick={() => {
                    setRegistrationSuccess(false);
                    setApiSuccess(false);
                    setApiError(null);
                  }}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-xs transition duration-200 cursor-pointer text-center"
                >
                  تعديل بيانات التسجيل
                </button>
              </div>

              <p className="text-[10px] text-slate-400 leading-relaxed px-4 pt-2">
                إذا لم تجد الرسالة في صندوق الوارد، يرجى التحقق من مجلد البريد غير الهام (Spam) أو إعادة المحاولة لاحقاً.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
export default Register;
