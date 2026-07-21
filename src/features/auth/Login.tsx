import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n/translations';
import { Logo } from '../../components/Logo';
import { Mail, Lock, CheckCircle2, ShieldAlert, Sparkles, Building2, Globe } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().min(1, { message: 'البريد الإلكتروني مطلوب' }).email({ message: 'البريد الإلكتروني غير صحيح' }),
  password: z.string().min(6, { message: 'كلمة المرور يجب أن لا تقل عن 6 أحرف' }),
});

type LoginFields = z.infer<typeof loginSchema>;

export const Login: React.FC = () => {
  const { signIn, sendPasswordReset } = useAuth();
  const { t, i18n, currentLanguage } = useTranslation();
  const isAr = currentLanguage === 'ar';

  const [apiError, setApiError] = useState<string | null>(null);
  const [apiSuccess, setApiSuccess] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [isResetMode, setIsResetMode] = useState<boolean>(() => {
    const hashPart = window.location.hash || '';
    const queryIndex = hashPart.indexOf('?');
    if (queryIndex !== -1) {
      const params = new URLSearchParams(hashPart.substring(queryIndex + 1));
      return params.get('reset') === 'true';
    }
    return false;
  });
  const [passwordResetSuccess, setPasswordResetSuccess] = useState<boolean>(() => {
    const hashPart = window.location.hash || '';
    const queryIndex = hashPart.indexOf('?');
    if (queryIndex !== -1) {
      const params = new URLSearchParams(hashPart.substring(queryIndex + 1));
      return params.get('passwordReset') === 'success';
    }
    return false;
  });
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

  const toggleLanguage = () => {
    const newLang = currentLanguage === 'ar' ? 'en' : 'ar';
    i18n.changeLanguage(newLang);
    localStorage.setItem('ledgra_lang', newLang);
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
    setApiError(null);
    setApiSuccess(false);
  };

  const getEmailError = () => {
    if (!errors.email) return null;
    if (errors.email.message === 'البريد الإلكتروني مطلوب') {
      return isAr ? 'البريد الإلكتروني مطلوب' : 'Email address is required';
    }
    if (errors.email.message === 'البريد الإلكتروني غير صحيح') {
      return isAr ? 'البريد الإلكتروني غير صحيح' : 'Invalid email address';
    }
    return errors.email.message;
  };

  const getPasswordError = () => {
    if (!errors.password) return null;
    if (errors.password.message === 'كلمة المرور يجب أن لا تقل عن 6 أحرف') {
      return isAr ? 'كلمة المرور يجب أن لا تقل عن 6 أحرف' : 'Password must be at least 6 characters';
    }
    return errors.password.message;
  };

  const onSubmit = async (data: LoginFields) => {
    setApiError(null);
    setApiSuccess(false);
    try {
      const response = await signIn(data.email, data.password);
      if (response.error) {
        setApiError(response.error);
      } else {
        setSuccessMessage(isAr ? 'جاري توجيهك إلى لوحة التحكم...' : 'Redirecting to the dashboard...');
        setApiSuccess(true);
        setTimeout(() => {
          navigate('/');
        }, 800);
      }
    } catch (e: any) {
      setApiError(e.message || (isAr ? 'حدث خطأ غير متوقع أثناء تسجيل الدخول.' : 'An unexpected error occurred during login.'));
    }
  };

  const handlePasswordResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail || !resetEmail.includes('@')) {
      setApiError(isAr ? 'الرجاء كتابة بريد إلكتروني صحيح.' : 'Please enter a valid email address.');
      return;
    }
    setApiError(null);
    setIsResetSubmitting(true);
    try {
      const response = await sendPasswordReset(resetEmail);
      if (response.error) {
        setApiError(response.error);
      } else {
        setSuccessMessage(isAr 
          ? 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني بنجاح. يرجى مراجعة صندوق الوارد.' 
          : 'A password reset link has been successfully sent to your email. Please check your inbox.');
        setApiSuccess(true);
        setResetEmail('');
        setTimeout(() => {
          setIsResetMode(false);
          setApiSuccess(false);
        }, 5000);
      }
    } catch (e: any) {
      setApiError(e.message || (isAr ? 'فشل في إرسال طلب إعادة التعيين.' : 'Failed to send password reset request.'));
    } finally {
      setIsResetSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-slate-50 overflow-hidden font-sans" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Visual Brand Panel - Left/Right on Desktop depending on direction */}
      <div className={`hidden lg:flex lg:col-span-5 bg-brand-navy relative flex-col justify-between p-12 text-white ${isAr ? 'text-right order-first' : 'text-left order-last'}`}>
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
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              <span>{isAr ? "الجيل القادم من المحاسبة السحابية" : "Next-gen Cloud Accounting"}</span>
            </div>
            
            <h1 className="text-3xl font-bold leading-tight">
              {isAr ? "أدر ماليتك وفواتيرك الضريبية بدقة متناهية" : "Manage your finances & tax invoices with precision"}
            </h1>
            
            <p className="text-slate-300 text-sm leading-relaxed">
              {isAr 
                ? "منصة محاسبية سعودية مهيأة لاحقًا لدعم متطلبات الفوترة الإلكترونية والضريبة داخل المملكة، تقدم حلولاً مرنة ومكينة ماليًا للمنشآت."
                : "A Saudi accounting platform designed to support future e-invoicing and VAT requirements in the Kingdom, providing flexible and robust enterprise solutions."}
            </p>

            {/* Feature lists */}
            <div className="space-y-4 pt-4 border-t border-slate-700/50">
              <div className="flex items-start gap-3">
                <div className="bg-brand-turquoise/10 p-1.5 rounded-lg shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4 text-brand-turquoise" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold">
                    {isAr ? "بنية سحابية آمنة وموثوقة" : "Secure & Reliable Cloud Infrastructure"}
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isAr 
                      ? "تشفير وحماية كاملة لبيانات شركتك المالية على مدار الساعة."
                      : "Full encryption and protection of your business financial data around the clock."}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-brand-blue/10 p-1.5 rounded-lg shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4 text-brand-blue" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold">
                    {isAr ? "فروع ومخازن متعددة" : "Multiple Branches & Warehouses"}
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isAr 
                      ? "عزل كامل لبيانات الفروع لمراقبة مبيعاتك لحظة بلحظة."
                      : "Complete branch isolation to monitor your sales and inventory in real-time."}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-xs text-slate-400 flex items-center justify-between">
          <span>{isAr ? "لِدجرا للمحاسبة السحابية © 2026" : "LEDGRA Cloud Accounting © 2026"}</span>
          <span className="flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            <span>{isAr ? "رؤية المملكة 2030" : "Saudi Vision 2030"}</span>
          </span>
        </div>
      </div>

      {/* Login Form Panel - Right/Left on Desktop depending on direction */}
      <div className={`col-span-1 lg:col-span-7 flex flex-col justify-center items-center p-6 md:p-12 xl:p-16 relative ${isAr ? 'order-last' : 'order-first'}`}>
        {/* Floating Language Toggle in corner */}
        <div className={`absolute top-6 ${isAr ? 'left-6 md:left-12' : 'right-6 md:right-12'} z-20`}>
          <button
            id="lang-toggle-btn"
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
          >
            <Globe className="w-4 h-4 text-slate-500" />
            <span>{isAr ? 'English' : 'العربية'}</span>
          </button>
        </div>

        <div className="w-full max-w-md space-y-8 mt-8 lg:mt-0">
          
          {/* Logo element for Mobile / Small resolutions */}
          <div className="lg:hidden flex justify-center mb-6">
            <Logo variant="full" theme="light" size="md" />
          </div>

          {!isResetMode ? (
            <>
              {/* Form Header */}
              <div className={`text-center ${isAr ? 'lg:text-right' : 'lg:text-left'} space-y-2`}>
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
                  {t('auth.login_title')}
                </h2>
                <p className="text-slate-500 text-sm leading-relaxed">
                  {t('auth.login_subtitle')}
                </p>
              </div>

              {/* Form Submit response feedback */}
              {apiError && (
                <div className={`bg-red-50 ${isAr ? 'border-r-4 border-red-500' : 'border-l-4 border-red-500'} p-4 rounded-xl flex items-start gap-2.5 shadow-sm`}>
                  <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-semibold text-red-900">
                      {isAr ? "فشل عملية تسجيل الدخول" : "Login Failed"}
                    </h5>
                    <p className="text-xs text-red-700 mt-0.5">{apiError}</p>
                  </div>
                </div>
              )}

              {apiSuccess && (
                <div className={`bg-emerald-50 ${isAr ? 'border-r-4 border-emerald-500' : 'border-l-4 border-emerald-500'} p-4 rounded-xl flex items-start gap-2.5 shadow-sm`}>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-semibold text-emerald-900">
                      {isAr ? "مرحباً بك مجدداً" : "Welcome Back"}
                    </h5>
                    <p className="text-xs text-emerald-700 mt-0.5">{successMessage}</p>
                  </div>
                </div>
              )}

              {passwordResetSuccess && (
                <div className={`bg-emerald-50 ${isAr ? 'border-r-4 border-emerald-500' : 'border-l-4 border-emerald-500'} p-4 rounded-xl flex items-start gap-2.5 shadow-sm`}>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-semibold text-emerald-900">
                      {isAr ? "تم تغيير كلمة المرور بنجاح" : "Password Changed Successfully"}
                    </h5>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      {isAr ? "تم تغيير كلمة المرور بنجاح، يمكنك الآن تسجيل الدخول." : "Your password has been changed successfully. You can now log in."}
                    </p>
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
                    <span className={`absolute inset-y-0 ${isAr ? 'right-0 pr-3.5' : 'left-0 pl-3.5'} flex items-center pointer-events-none text-slate-400`}>
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      id="email-field"
                      type="email"
                      placeholder="name@company.com"
                      autoComplete="email"
                      {...register('email')}
                      className={`w-full ${
                        isAr ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4 text-left'
                      } py-3 bg-white border ${
                        errors.email ? 'border-red-400 focus:border-red-400 focus:ring-red-200' : 'border-slate-200 focus:border-brand-blue focus:ring-brand-blue/20'
                      } rounded-xl text-sm focus:outline-none focus:ring-4 transition duration-200 shadow-sm`}
                    />
                  </div>
                  {errors.email && (
                    <p className={`text-xs text-red-600 mt-1 ${isAr ? 'text-right' : 'text-left'}`}>{getEmailError()}</p>
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
                      className="text-xs font-semibold text-brand-blue hover:text-blue-700 hover:underline bg-transparent border-none cursor-pointer transition-all duration-150"
                    >
                      {t('auth.forgot_password')}
                    </button>
                  </div>
                  <div className="relative">
                    <span className={`absolute inset-y-0 ${isAr ? 'right-0 pr-3.5' : 'left-0 pl-3.5'} flex items-center pointer-events-none text-slate-400`}>
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      id="password-field"
                      type="password"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      {...register('password')}
                      className={`w-full ${
                        isAr ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4 text-left'
                      } py-3 bg-white border ${
                        errors.password ? 'border-red-400 focus:border-red-400 focus:ring-red-200' : 'border-slate-200 focus:border-brand-blue focus:ring-brand-blue/20'
                      } rounded-xl text-sm focus:outline-none focus:ring-4 transition duration-200 shadow-sm`}
                    />
                  </div>
                  {errors.password && (
                    <p className={`text-xs text-red-600 mt-1 ${isAr ? 'text-right' : 'text-left'}`}>{getPasswordError()}</p>
                  )}
                </div>

                {/* Submit Action */}
                <button
                  id="submit-login-btn"
                  type="submit"
                  disabled={isSubmitting || apiSuccess}
                  className="w-full py-3.5 px-4 bg-brand-blue hover:bg-blue-600 text-white font-bold rounded-xl text-sm shadow-md hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-brand-blue/20 transition-all duration-200 disabled:opacity-55 flex items-center justify-center gap-2 cursor-pointer mt-2 active:scale-98"
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
                <Link id="link-to-register" to="/register" className="text-sm font-bold text-brand-blue hover:text-blue-700 hover:underline transition duration-150">
                  {t('auth.sign_up')}
                </Link>
              </div>
            </>
          ) : (
            <>
              {/* Password Recovery Mode */}
              <div className={`text-center ${isAr ? 'lg:text-right' : 'lg:text-left'} space-y-2`}>
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
                  {isAr ? "استعادة كلمة المرور" : "Password Recovery"}
                </h2>
                <p className="text-slate-500 text-sm leading-relaxed">
                  {isAr 
                    ? "أدخل بريدك الإلكتروني لإرسال الرابط الآمن لإعادة التعيين عبر بريدك الإلكتروني."
                    : "Enter your email address to receive a secure password reset link."}
                </p>
              </div>

              {/* Reset Feedback */}
              {apiError && (
                <div className={`bg-red-50 ${isAr ? 'border-r-4 border-red-500' : 'border-l-4 border-red-500'} p-4 rounded-xl flex items-start gap-2.5 shadow-sm`}>
                  <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-semibold text-red-900">
                      {isAr ? "فشل الطلب" : "Request Failed"}
                    </h5>
                    <p className="text-xs text-red-700 mt-0.5">{apiError}</p>
                  </div>
                </div>
              )}

              {apiSuccess && (
                <div className={`bg-emerald-50 ${isAr ? 'border-r-4 border-emerald-500' : 'border-l-4 border-emerald-500'} p-4 rounded-xl flex items-start gap-2.5 shadow-sm`}>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-semibold text-emerald-900">
                      {isAr ? "طلب ناجح" : "Request Successful"}
                    </h5>
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
                    <span className={`absolute inset-y-0 ${isAr ? 'right-0 pr-3.5' : 'left-0 pl-3.5'} flex items-center pointer-events-none text-slate-400`}>
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      required
                      placeholder="name@company.com"
                      autoComplete="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className={`w-full ${
                        isAr ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4 text-left'
                      } py-3 bg-white border border-slate-200 focus:border-brand-blue focus:ring-brand-blue/20 rounded-xl text-sm focus:outline-none focus:ring-4 transition duration-200 shadow-sm`}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isResetSubmitting || apiSuccess}
                  className="w-full py-3.5 px-4 bg-brand-blue hover:bg-blue-600 text-white font-bold rounded-xl text-sm shadow-md hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-brand-blue/20 transition-all duration-200 disabled:opacity-55 flex items-center justify-center gap-2 cursor-pointer mt-2 active:scale-98"
                >
                  {isResetSubmitting ? (
                    <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <span>
                      {isAr ? "إرسال رابط إعادة التعيين" : "Send Reset Link"}
                    </span>
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
                  className="text-sm font-bold text-brand-blue hover:text-blue-700 hover:underline bg-transparent border-none cursor-pointer transition duration-150"
                >
                  {isAr ? "العودة إلى تسجيل الدخول" : "Back to Login"}
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
