import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';

export const EmailVerifiedPage: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(3);

  useEffect(() => {
    let active = true;
    
    const handleVerification = async () => {
      try {
        // Parse code from search params (e.g., ?code=xxxx)
        const getCodeFromUrl = () => {
          const searchParams = new URLSearchParams(window.location.search);
          let code = searchParams.get('code');
          if (code) return code;

          const hash = window.location.hash || '';
          if (hash.includes('?')) {
            const hashQuery = hash.split('?')[1];
            const hashParams = new URLSearchParams(hashQuery);
            code = hashParams.get('code');
          }
          return code;
        };

        const code = getCodeFromUrl();

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // Check if we have a valid session now (either from code exchange or from hash auto-login)
        const { data: { session } } = await supabase.auth.getSession();
        
        if (active) {
          setStatus('success');
          // Clean the URL search/hash to avoid showing tokens/codes in the browser address bar
          window.history.replaceState(null, '', `${window.location.origin}/#/email-verified`);
        }
      } catch (err: any) {
        console.error('Email verification error'); // Do not print code/token/detailed error
        if (active) {
          setStatus('error');
          setErrorMessage(err.message || 'رابط التحقق غير صالح أو منتهي.');
        }
      }
    };

    handleVerification();

    return () => {
      active = false;
    };
  }, []);

  // Countdown and auto-redirect
  useEffect(() => {
    if (status !== 'success') return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Auto-redirect based on session presence
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
              navigate('/', { replace: true });
            } else {
              navigate('/login', { replace: true });
            }
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, navigate]);

  const handleGoToApp = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      navigate('/', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-6 font-sans select-none" dir="rtl">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700/80 p-8 rounded-3xl space-y-6 shadow-2xl relative overflow-hidden">
        
        {/* Glow Decoration */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-slate-900 rounded-full blur-3xl pointer-events-none -z-10" />

        {status === 'verifying' && (
          <div className="text-center space-y-6 py-4">
            <div className="flex justify-center">
              <Loader2 className="w-14 h-14 text-slate-300 animate-spin" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-slate-100">جاري التحقق من حسابك...</h1>
              <p className="text-xs text-slate-400">نحن نعمل على تأكيد بريدك الإلكتروني وتأمين حسابك.</p>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center space-y-6 py-4">
            <div className="flex justify-center">
              <div className="bg-emerald-500/10 p-4 rounded-full border border-emerald-500/20">
                <ShieldCheck className="w-14 h-14 text-emerald-400" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-black text-slate-100">تم التحقق من حسابك بنجاح</h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                تم تأكيد بريدك الإلكتروني. يمكنك الآن الدخول إلى منصة لِدجرا وإكمال إعداد منشأتك.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={handleGoToApp}
                className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold rounded-xl text-xs transition duration-200 cursor-pointer shadow-md"
              >
                الدخول إلى لِدجرا
              </button>
              
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="w-full py-2.5 px-4 bg-slate-700/50 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition duration-200 cursor-pointer"
              >
                تسجيل الدخول
              </button>
            </div>

            <p className="text-[10px] text-slate-500 font-medium">
              سيتم تحويلك تلقائياً خلال {countdown} ثوانٍ...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center space-y-6 py-4">
            <div className="flex justify-center">
              <div className="bg-rose-500/10 p-4 rounded-full border border-rose-500/20">
                <ShieldAlert className="w-14 h-14 text-rose-400" />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold text-slate-100">فشل التحقق من البريد</h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                رابط التحقق غير صالح أو منتهي. حاول تسجيل الدخول أو اطلب رابطًا جديدًا.
              </p>
              {errorMessage && (
                <p className="text-[10px] text-rose-400/80 font-mono mt-1 select-text">
                  {errorMessage}
                </p>
              )}
            </div>

            <div className="pt-2">
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold rounded-xl text-xs transition duration-200 cursor-pointer shadow-md"
              >
                العودة إلى تسجيل الدخول
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
