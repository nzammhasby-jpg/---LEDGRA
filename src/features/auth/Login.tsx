import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation, Locale } from '../../i18n/translations';
import { Logo } from '../../components/Logo';
import { Mail, Lock, CheckCircle2, ShieldAlert, Sparkles, Building2 } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().min(1, { message: 'البريد الإلكتروني مطلوب' }).email({ message: 'البريد الإلكتروني غير صحيح' }),
  password: z.string().min(6, { message: 'كلمة المرور يجب أن لا تقل عن 6 أحرف' }),
});

type LoginFields = z.infer<typeof loginSchema>;

export const Login: React.FC = () => {
  const { signIn, sendPasswordReset } = useAuth();
  const { t } = useTranslation('ar');
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiSuccess, setApiSuccess] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [isResetMode, setIsResetMode] = useState<boolean>(false);
  const [resetEmail, setResetEmail] = useState<string>('');
  const [isResetSubmitting, setIsResetSubmitting] = useState<boolean>(false);
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFields>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    }
  });

  const onSubmit = async (data: LoginFields) => {
    setApiError(null);
    setApiSuccess(false);
    try {
      const response = await signIn(data.email, data.password);
      if (response.error) {
        setApiError(response.error);
      } else {
        setSuccessMessage('جاري توجيهك إلى لوحة التحكم...');
        setApiSuccess(true);
        setTimeout(() => {
          navigate('/');
        }, 800);
      }
    } catch (e: any) {
      setApiError(e.message || 'حدث خطأ غير متوقع أثناء تسجيل الدخول.');
    }
  };

  const handlePasswordResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail || !resetEmail.includes('@')) {
      setApiError('الرجاء كتابة بريد إلكتروني صحيح.');
      return;
    }
    setApiError(null);
    setIsResetSubmitting(true);
    try {
      const response = await sendPasswordReset(resetEmail);
      if (response.error) {
        setApiError(response.error);
      } else {
        setSuccessMessage('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني بنجاح. يرجى مراجعة صندوق الوارد.');
        setApiSuccess(true);
        setResetEmail('');
        setTimeout(() => {
          setIsResetMode(false);
          setApiSuccess(false);
        }, 5000);
      }
    } catch (e: any) {
      setApiError(e.message || 'فشل في إرسال طلب إعادة التعيين.');
    } finally {
      setIsResetSubmitting(false);
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
              <span>الجيل القادم من المحاسبة السحابية</span>
            </div>
            
            <h1 className="text-3xl font-bold leading-tight">
              أدر ماليتك وفواتيرك الضريبية بدقة متناهية
            </h1>
            
            <p className="text-slate-300 text-sm leading-relaxed">
              منصة محاسبية سعودية مهيأة لاحقًا لدعم متطلبات الفوترة الإلكترونية والضريبة داخل المملكة، تقدم حلولاً مرنة ومكينة ماليًا للمنشآت.
            </p>

            {/* Feature lists */}
            <div className="space-y-4 pt-4 border-t border-slate-700/50">
              <div className="flex items-start gap-3">
                <div className="bg-brand-turquoise/10 p-1 rounded-lg shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4 text-brand-turquoise" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold">بنية سحابية آمنة وموثوقة</h4>
                  <p className="text-xs text-slate-400">تشفير وحماية كاملة لبيانات شركتك المالية على مدار الساعة.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-brand-blue/10 p-1 rounded-lg shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4 text-brand-blue" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold">فروع ومخازن متعددة</h4>
                  <p className="text-xs text-slate-400">عزل كامل لبيانات الفروع لمراقبة مبيعاتك لحظة بلحظة.</p>
                </div>
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

      {/* Login Form Panel - Right on Desktop */}
      <div className="col-span-1 lg:col-span-7 flex flex-col justify-center items-center p-6 md:p-12 xl:p-16 relative">
        <div className="w-full max-w-md space-y-8">
          
          {/* Logo element for Mobile / Small resolutions */}
          <div className="lg:hidden flex justify-center mb-6">
            <Logo variant="full" theme="light" size="md" />
          </div>

          {!isResetMode ? (
            <>
              {/* Form Header */}
              <div className="text-center lg:text-right space-y-2">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
                  {t('auth.login_title')}
                </h2>
                <p className="text-slate-500 text-sm">
                  {t('auth.login_subtitle')}
                </p>
              </div>

              {/* Form Submit response feedback */}
              {apiError && (
                <div className="bg-red-50 border-r-4 border-red-500 p-4 rounded-xl flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-semibold text-red-900">فشل عملية تسجيل الدخول</h5>
                    <p className="text-xs text-red-700 mt-0.5">{apiError}</p>
                  </div>
                </div>
              )}

              {apiSuccess && (
                <div className="bg-emerald-50 border-r-4 border-emerald-500 p-4 rounded-xl flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-semibold text-emerald-900">مرحباً بك مجدداً</h5>
                    <p className="text-xs text-emerald-700 mt-0.5">{successMessage}</p>
                  </div>
                </div>
              )}

              {/* Interactive login form using React Hook Form */}
              <form id="login-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    {t('auth.email')}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      id="email-field"
                      type="email"
                      placeholder="name@company.com"
                      {...register('email')}
                      className={`w-full pr-10 pl-4 py-2.5 bg-white border ${
                        errors.email ? 'border-red-400 focus:ring-red-200' : 'border-slate-200 focus:ring-brand-blue/20'
                      } rounded-xl text-sm focus:outline-none focus:ring-4 transition`}
                      style={{ direction: 'ltr', textAlign: 'right' }}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-semibold text-slate-700">
                      {t('auth.password')}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setApiError(null);
                        setApiSuccess(false);
                        setIsResetMode(true);
                      }}
                      className="text-xs font-semibold text-brand-blue hover:underline bg-transparent border-none cursor-pointer"
                    >
                      {t('auth.forgot_password')}
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      id="password-field"
                      type="password"
                      placeholder="••••••••"
                      {...register('password')}
                      className={`w-full pr-10 pl-4 py-2.5 bg-white border ${
                        errors.password ? 'border-red-400 focus:ring-red-200' : 'border-slate-200 focus:ring-brand-blue/20'
                      } rounded-xl text-sm focus:outline-none focus:ring-4 transition`}
                      style={{ direction: 'ltr', textAlign: 'right' }}
                    />
                  </div>
                  {errors.password && (
                    <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>
                  )}
                </div>

                {/* Submit Action */}
                <button
                  id="submit-login-btn"
                  type="submit"
                  disabled={isSubmitting || apiSuccess}
                  className="w-full py-3 px-4 bg-brand-blue hover:bg-blue-600 text-white font-bold rounded-xl text-sm shadow-md hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-brand-blue/20 transition disabled:opacity-55 flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {isSubmitting ? (
                    <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <span>{t('auth.sign_in')}</span>
                  )}
                </button>
              </form>

              {/* Form Switch Link */}
              <div className="text-center pt-4 border-t border-slate-100">
                <span className="text-sm text-slate-500">{t('auth.no_account')} </span>
                <Link id="link-to-register" to="/register" className="text-sm font-bold text-brand-blue hover:underline">
                  {t('auth.sign_up')}
                </Link>
              </div>
            </>
          ) : (
            <>
              {/* Password Recovery Mode */}
              <div className="text-center lg:text-right space-y-2">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
                  استعادة كلمة المرور
                </h2>
                <p className="text-slate-500 text-sm">
                  أدخل بريدك الإلكتروني لإرسال الرابط الآمن لإعادة التعيين عبر بريدك الإلكتروني.
                </p>
              </div>

              {/* Reset Feedback */}
              {apiError && (
                <div className="bg-red-50 border-r-4 border-red-500 p-4 rounded-xl flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-semibold text-red-900">فشل الطلب</h5>
                    <p className="text-xs text-red-700 mt-0.5">{apiError}</p>
                  </div>
                </div>
              )}

              {apiSuccess && (
                <div className="bg-emerald-50 border-r-4 border-emerald-500 p-4 rounded-xl flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-semibold text-emerald-900">طلب ناجح</h5>
                    <p className="text-xs text-emerald-700 mt-0.5">{successMessage}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handlePasswordResetRequest} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    {t('auth.email')}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      required
                      placeholder="name@company.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full pr-10 pl-4 py-2.5 bg-white border border-slate-200 focus:ring-brand-blue/20 rounded-xl text-sm focus:outline-none focus:ring-4 transition"
                      style={{ direction: 'ltr', textAlign: 'right' }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isResetSubmitting || apiSuccess}
                  className="w-full py-3 px-4 bg-brand-blue hover:bg-blue-600 text-white font-bold rounded-xl text-sm shadow-md hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-brand-blue/20 transition disabled:opacity-55 flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {isResetSubmitting ? (
                    <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <span>إرسال رابط إعادة التعيين</span>
                  )}
                </button>
              </form>

              <div className="text-center pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setApiError(null);
                    setApiSuccess(false);
                    setIsResetMode(false);
                  }}
                  className="text-sm font-bold text-brand-blue hover:underline bg-transparent border-none cursor-pointer"
                >
                  العودة إلى تسجيل الدخول
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
};
export default Login;
