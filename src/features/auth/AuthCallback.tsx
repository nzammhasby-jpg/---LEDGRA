import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Logo } from '../../components/Logo';
import { CheckCircle2, ShieldAlert, Loader2 } from 'lucide-react';

export const AuthCallback: React.FC = () => {
  const [status, setStatus] = useState<'verifying' | 'success_email' | 'success_recovery' | 'error'>('verifying');
  const [countdown, setCountdown] = useState<number>(2);

  useEffect(() => {
    let active = true;

    const performVerification = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const tokenHash = searchParams.get('token_hash');
        const type = searchParams.get('type');
        const error = searchParams.get('error');
        const errorCode = searchParams.get('error_code');
        const errorDescription = searchParams.get('error_description');

        if (error || errorCode || errorDescription) {
          if (active) {
            setStatus('error');
          }
          return;
        }

        if (!tokenHash || !type) {
          if (active) {
            setStatus('error');
          }
          return;
        }

        if (type !== 'email' && type !== 'recovery') {
          if (active) {
            setStatus('error');
          }
          return;
        }

        // Call verifyOtp
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'email' | 'recovery',
        });

        if (verifyError) {
          throw verifyError;
        }

        if (active) {
          if (type === 'email') {
            setStatus('success_email');
          } else if (type === 'recovery') {
            setStatus('success_recovery');
          }
        }
      } catch (err) {
        // Do NOT log the token hash or authentication URL
        console.error('Authentication verification error occurred.');
        if (active) {
          setStatus('error');
        }
      }
    };

    performVerification();

    return () => {
      active = false;
    };
  }, []);

  // Countdown timer for automatic redirect on email verification success
  useEffect(() => {
    if (status === 'success_email') {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            window.location.replace(`${window.location.origin}/#/`);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    } else if (status === 'success_recovery') {
      // Recovery success redirects immediately to /#/reset-password
      window.location.replace(`${window.location.origin}/#/reset-password`);
    }
  }, [status]);

  const handleGoToApp = () => {
    window.location.replace(`${window.location.origin}/#/`);
  };

  const handleBackToLogin = () => {
    window.location.replace(`${window.location.origin}/#/login`);
  };

  const handleRequestNewReset = () => {
    window.location.replace(`${window.location.origin}/#/login?reset=true`);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-6 font-sans select-none" dir="rtl">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700/80 p-8 rounded-3xl space-y-6 shadow-2xl relative overflow-hidden text-center">
        
        {/* Glow Decoration */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-slate-900 rounded-full blur-3xl pointer-events-none -z-10" />

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Logo variant="full" theme="dark" size="md" />
        </div>

        {status === 'verifying' && (
          <div className="space-y-6 py-4">
            <div className="flex justify-center">
              <Loader2 className="w-14 h-14 text-slate-300 animate-spin" />
            </div>
            <div className="space-y-2 text-center">
              <h1 className="text-xl font-bold text-slate-100">جاري التحقق من الهوية...</h1>
              <p className="text-xs text-slate-400">نعمل على تأكيد الرمز وتأمين اتصالك السحابي.</p>
            </div>
          </div>
        )}

        {status === 'success_email' && (
          <div className="space-y-6 py-4">
            <div className="flex justify-center">
              <div className="bg-emerald-500/10 p-4 rounded-full border border-emerald-500/20">
                <CheckCircle2 className="w-14 h-14 text-emerald-400" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-black text-slate-100">تم تأكيد بريدك الإلكتروني بنجاح</h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                تم تأكيد بريدك الإلكتروني بنجاح. يمكنك الآن الدخول إلى منصة لِدجرا وإكمال إعداد منشأتك.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={handleGoToApp}
                className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold rounded-xl text-xs transition duration-200 cursor-pointer shadow-md"
              >
                الدخول إلى لِدجرا
              </button>
            </div>

            <p className="text-[10px] text-slate-500 font-medium">
              سيتم توجيهك تلقائياً خلال {countdown} ثوانٍ...
            </p>
          </div>
        )}

        {status === 'success_recovery' && (
          <div className="space-y-6 py-4">
            <div className="flex justify-center">
              <Loader2 className="w-14 h-14 text-slate-300 animate-spin" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-slate-100">تم التحقق من رابط الاستعادة</h1>
              <p className="text-xs text-slate-400">جاري توجيهك لصفحة تعيين كلمة المرور الجديدة...</p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-6 py-4">
            <div className="flex justify-center">
              <div className="bg-rose-500/10 p-4 rounded-full border border-rose-500/20">
                <ShieldAlert className="w-14 h-14 text-rose-400" />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold text-slate-100">الرابط غير صالح</h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                الرابط غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              {(() => {
                const searchParams = new URLSearchParams(window.location.search);
                const type = searchParams.get('type');
                if (type === 'recovery') {
                  return (
                    <button
                      onClick={handleRequestNewReset}
                      className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold rounded-xl text-xs transition duration-200 cursor-pointer shadow-md"
                    >
                      طلب رابط استعادة جديد
                    </button>
                  );
                } else {
                  return (
                    <button
                      onClick={handleBackToLogin}
                      className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold rounded-xl text-xs transition duration-200 cursor-pointer shadow-md"
                    >
                      العودة إلى تسجيل الدخول
                    </button>
                  );
                }
              })()}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AuthCallback;
