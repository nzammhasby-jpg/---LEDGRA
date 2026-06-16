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

const registerSchema = z.object({
  fullName: z.string().min(3, { message: 'الاسم الكامل يجب أن لا يقل عن 3 أحرف' }),
  email: z.string().min(1, { message: 'البريد الإلكتروني مطلوب' }).email({ message: 'البريد الإلكتروني غير صحيح' }),
  phone: z.string()
    .min(10, { message: 'رقم الجوال يجب أن لا يقل عن 10 أرقام' })
    .regex(/^05\d{8}$/, { message: 'رقم الجوال السعودي يجب أن يبدأ بـ 05 ويتكون من 10 أرقام' }),
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
  const [needsVerification, setNeedsVerification] = useState<boolean>(false);
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
    setNeedsVerification(false);
    try {
      const response = await signUp(data.email, data.password, data.fullName, data.phone);
      if (response.error) {
        setApiError(response.error);
      } else if (response.verificationRequired) {
        setNeedsVerification(true);
        setApiSuccess(true);
      } else {
        setApiSuccess(true);
        setTimeout(() => {
          navigate('/onboarding');
        }, 1200);
      }
    } catch (e: any) {
      setApiError(e.message || 'حدث خطأ أثناء إنشاء حسابك.');
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-slate-50 overflow-hidden font-sans" dir="rtl">
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
          <span>لِدجرا للمحاسبة السحابية © ٢٠٢٦</span>
          <span className="flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            <span>رؤية المملكة ٢٠٣٠</span>
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

          {apiSuccess && (
            <div className={`border-r-4 p-4 rounded-xl flex items-start gap-2 ${
              needsVerification 
              ? 'bg-amber-50 border-amber-500' 
              : 'bg-emerald-50 border-emerald-500'
            }`}>
              <CheckCircle2 className={`w-5 h-5 shrink-0 mt-0.5 ${needsVerification ? 'text-amber-600' : 'text-emerald-600'}`} />
              <div>
                <h5 className={`text-sm font-semibold ${needsVerification ? 'text-amber-900' : 'text-emerald-900'}`}>
                  {needsVerification ? 'تأكيد البريد الإلكتروني مطلوب' : 'تم تسجيل الحساب بنجاح'}
                </h5>
                <p className={`text-xs mt-0.5 ${needsVerification ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {needsVerification 
                    ? 'تم إرسال رابط تأكيد الحساب إلى بريدك الإلكتروني. يرجى مراجعة صندوق الوارد والضغط عليه لتفعيل حسابك ومتابعة التسجيل.'
                    : 'مرحباً بك! جاري توجيهك لصفحة تهيئة المنشأة...'
                  }
                </p>
              </div>
            </div>
          )}

          {/* Prompt verification state or show standard signup form */}
          {!needsVerification ? (
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
                    {...register('phone')}
                    className={`w-full pr-9 pl-3 py-2 bg-white border ${
                      errors.phone ? 'border-red-400 focus:ring-red-100' : 'border-slate-200 focus:ring-brand-blue/20'
                    } rounded-xl text-sm focus:outline-none focus:ring-4 transition`}
                    style={{ direction: 'ltr', textAlign: 'right' }}
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
          ) : (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setNeedsVerification(false)}
                className="text-sm font-bold text-brand-blue hover:underline bg-transparent border-none cursor-pointer"
              >
                ← العودة وتعديل بيانات التسجيل
              </button>
            </div>
          )}

          {/* Form switch link */}
          <div className="text-center pt-4 border-t border-slate-100">
            <span className="text-sm text-slate-500">{t('auth.already_have_account')} </span>
            <Link id="link-to-login" to="/login" className="text-sm font-bold text-brand-blue hover:underline">
              {t('auth.sign_in')}
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
};
export default Register;
