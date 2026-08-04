import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Logo } from '../../components/Logo';
import { CheckCircle2, ShieldAlert, Loader2 } from 'lucide-react';

interface ErrorText {
  title: string;
  description: string;
}

const resolveErrorMessage = (
  err?: { message?: string; code?: string; status?: number } | null,
  errorCodeParam?: string | null,
  errorDescParam?: string | null
): ErrorText => {
  const codeStr = (err?.code || errorCodeParam || '').toLowerCase();
  const descStr = (err?.message || errorDescParam || '').toLowerCase();

  if (
    codeStr.includes('expired') ||
    descStr.includes('expired') ||
    descStr.includes('token_expired') ||
    descStr.includes('otp_expired')
  ) {
    return {
      title: 'الرابط منتهي الصلاحية',
      description: 'رابط التحقق منتهي الصلاحية. يرجى طلب رابط جديد للمتابعة.',
    };
  }

  if (
    codeStr.includes('already_used') ||
    descStr.includes('already_used') ||
    descStr.includes('already used') ||
    descStr.includes('grant_type') ||
    descStr.includes('invalid_grant') ||
    descStr.includes('code_verifier') ||
    descStr.includes('already been used')
  ) {
    return {
      title: 'الرابط مستخدم مسبقاً',
      description: 'تم استخدام هذا الرابط مسبقاً للتحقق. يمكنك تسجيل الدخول مباشرة أو طلب رابط جديد.',
    };
  }

  if (
    codeStr.includes('invalid') ||
    descStr.includes('invalid') ||
    descStr.includes('validation_failed')
  ) {
    return {
      title: 'الرابط غير صالح',
      description: 'رابط التحقق غير صالح أو يحتوي على رموز غير مكتملة.',
    };
  }

  if (err || errorDescParam || errorCodeParam) {
    return {
      title: 'تعذر إكمال التحقق',
      description: 'حدث خطأ أثناء محاولة التأكد من رمز الحساب. يرجى إعادة المحاولة.',
    };
  }

  return {
    title: 'الرابط غير صالح',
    description: 'رابط التحقق ناقص أو غير صالح. يرجى استخدام الرابط المرسل إلى بريدك الإلكتروني.',
  };
};

export const AuthCallback: React.FC = () => {
  const [status, setStatus] = useState<'verifying' | 'success_email' | 'success_recovery' | 'error'>('verifying');
  const [countdown, setCountdown] = useState<number>(2);
  const [errorMessage, setErrorMessage] = useState<ErrorText>({
    title: 'الرابط غير صالح',
    description: 'الرابط غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً.',
  });
  const [isRecoveryFlow, setIsRecoveryFlow] = useState<boolean>(false);

  const hasExecutedRef = useRef(false);

  useEffect(() => {
    if (hasExecutedRef.current) return;
    hasExecutedRef.current = true;

    let active = true;

    const cleanUrlParams = () => {
      try {
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        window.history.replaceState({}, document.title, url.toString());
      } catch (e) {
        // Ignore history errors
      }
    };

    const performVerification = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        let hashParams = new URLSearchParams();
        if (window.location.hash && window.location.hash.startsWith('#')) {
          const hashContent = window.location.hash.substring(1);
          if (hashContent.includes('=')) {
            hashParams = new URLSearchParams(hashContent);
          }
        }

        const code = searchParams.get('code') || hashParams.get('code');
        const tokenHash = searchParams.get('token_hash') || hashParams.get('token_hash');
        const type = searchParams.get('type') || hashParams.get('type');
        const flow = searchParams.get('flow') || hashParams.get('flow');

        const error = searchParams.get('error') || hashParams.get('error');
        const errorCode = searchParams.get('error_code') || hashParams.get('error_code');
        const errorDescription = searchParams.get('error_description') || hashParams.get('error_description');

        const isRecovery = flow === 'recovery' || type === 'recovery';
        if (active) {
          setIsRecoveryFlow(isRecovery);
        }

        if (error || errorCode || errorDescription) {
          cleanUrlParams();
          if (active) {
            setErrorMessage(resolveErrorMessage(null, errorCode, errorDescription));
            setStatus('error');
          }
          return;
        }

        // 1. PKCE Code Exchange Flow
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          cleanUrlParams();

          if (exchangeError) {
            if (active) {
              setErrorMessage(resolveErrorMessage(exchangeError, errorCode, errorDescription));
              setStatus('error');
            }
            return;
          }

          if (active) {
            if (isRecovery) {
              setStatus('success_recovery');
            } else {
              setStatus('success_email');
            }
          }
          return;
        }

        // 2. Token Hash Flow
        if (tokenHash) {
          const otpType = (type === 'signup' ? 'email' : type) as 'email' | 'recovery';
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType || 'email',
          });
          cleanUrlParams();

          if (verifyError) {
            if (active) {
              setErrorMessage(resolveErrorMessage(verifyError, errorCode, errorDescription));
              setStatus('error');
            }
            return;
          }

          if (active) {
            if (isRecovery) {
              setStatus('success_recovery');
            } else {
              setStatus('success_email');
            }
          }
          return;
        }

        // 3. Automatically Established Session Check
        const { data: { session } } = await supabase.auth.getSession();
        cleanUrlParams();

        if (session && session.user) {
          if (active) {
            if (isRecovery) {
              setStatus('success_recovery');
            } else {
              setStatus('success_email');
            }
          }
          return;
        }

        // No parameters and no session
        if (active) {
          setErrorMessage(resolveErrorMessage(null, null, null));
          setStatus('error');
        }

      } catch (err: any) {
        cleanUrlParams();
        console.error('Authentication verification error occurred.');
        if (active) {
          setErrorMessage({
            title: 'تعذر إكمال التحقق',
            description: 'حدث خطأ غير متوقع أثناء معالجة رابط التحقق. يرجى إعادة المحاولة.',
          });
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
              <h1 className="text-xl font-bold text-slate-100">{errorMessage.title}</h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                {errorMessage.description}
              </p>
            </div>

            <div className="pt-2 space-y-3">
              {isRecoveryFlow ? (
                <button
                  onClick={handleRequestNewReset}
                  className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold rounded-xl text-xs transition duration-200 cursor-pointer shadow-md"
                >
                  طلب رابط استعادة جديد
                </button>
              ) : (
                <button
                  onClick={handleBackToLogin}
                  className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold rounded-xl text-xs transition duration-200 cursor-pointer shadow-md"
                >
                  العودة إلى تسجيل الدخول
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AuthCallback;
