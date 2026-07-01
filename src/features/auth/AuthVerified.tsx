import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { CheckCircle2, ShieldAlert, Loader2, ArrowRight } from 'lucide-react';
import { Logo } from '../../components/Logo';

export const AuthVerified: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let active = true;

    const verifyCodeAndSession = async () => {
      try {
        // Robust parameter extractor checking both search and hash query strings
        const getParam = (name: string) => {
          const searchParams = new URLSearchParams(window.location.search);
          let val = searchParams.get(name);
          if (val) return val;

          const hash = window.location.hash || '';
          if (hash.includes('?')) {
            const hashQuery = hash.split('?')[1];
            const hashParams = new URLSearchParams(hashQuery);
            val = hashParams.get(name);
          }
          return val;
        };

        const error = getParam('error');
        const errorDescription = getParam('error_description');

        if (error || errorDescription) {
          if (active) {
            setStatus('error');
            setErrorMessage(errorDescription || error || 'رابط التحقق غير صالح أو منتهي الصلاحية.');
          }
          return;
        }

        const code = getParam('code');

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        }

        // Check if we have a valid session now (either exchanged or already authenticated)
        const { data: { session } } = await supabase.auth.getSession();

        if (active) {
          setStatus('success');
          // Clean the URL search/hash to avoid showing raw tokens/codes in address bar
          window.history.replaceState(null, '', `${window.location.origin}/#/auth/verified`);
        }
      } catch (err: any) {
        console.error('Email verification exchange error');
        if (active) {
          setStatus('error');
          setErrorMessage(err.message || 'تعذر تأكيد البريد الإلكتروني. الرابط قد يكون منتهي الصلاحية أو تم استخدامه بالفعل.');
        }
      }
    };

    verifyCodeAndSession();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6 font-sans select-none" dir="rtl">
      {/* Brand Logo Header */}
      <div className="mb-8">
        <Logo variant="full" theme="light" size="md" />
      </div>

      {/* Main Verification Card */}
      <div className="w-full max-w-md bg-white border border-slate-200/80 p-8 rounded-3xl shadow-xl relative overflow-hidden text-center space-y-6">
        
        {status === 'verifying' && (
          <div className="space-y-6 py-4">
            <div className="flex justify-center">
              <Loader2 className="w-12 h-12 text-brand-blue animate-spin" />
            </div>
            <div className="space-y-2">
              <h1 className="text-lg font-bold text-slate-800">جاري التحقق من بريدك الإلكتروني...</h1>
              <p className="text-xs text-slate-500">نعمل على تأكيد حسابك وتأمينه بالكامل، يرجى الانتظار.</p>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-6 py-4">
            <div className="flex justify-center">
              <div className="bg-emerald-50 p-4 rounded-full border border-emerald-100">
                <CheckCircle2 className="w-12 h-12 text-emerald-600" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-black text-slate-900">تم التحقق من حسابك بنجاح</h1>
              <p className="text-xs text-slate-500 leading-relaxed px-2">
                تم تأكيد بريدك الإلكتروني بنجاح. يمكنك الآن تسجيل الدخول ومتابعة إعداد منشأتك على منصة لِدجرا.
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="w-full py-3 px-4 bg-brand-blue hover:bg-blue-600 text-white font-bold rounded-xl text-xs transition duration-200 cursor-pointer shadow-md"
              >
                تسجيل الدخول
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-6 py-4">
            <div className="flex justify-center">
              <div className="bg-red-50 p-4 rounded-full border border-red-100">
                <ShieldAlert className="w-12 h-12 text-red-600" />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-lg font-bold text-slate-900">تعذر تأكيد البريد</h1>
              <p className="text-xs text-slate-500 leading-relaxed px-2">
                رابط التحقق الذي استخدمته غير صالح، أو منتهي الصلاحية، أو تم استخدامه مسبقاً لإثبات الهوية.
              </p>
              {errorMessage && (
                <div className="bg-red-50 text-red-800 text-[10.5px] p-3 rounded-xl border border-red-100/50 mt-3 font-mono text-center overflow-auto max-h-24 select-text">
                  {errorMessage}
                </div>
              )}
            </div>

            <div className="pt-2 space-y-3">
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition duration-200 cursor-pointer shadow-md"
              >
                العودة لتسجيل الدخول
              </button>
              
              <button
                onClick={() => navigate('/register', { replace: true })}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs transition duration-200 cursor-pointer"
              >
                إنشاء حساب جديد
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Footer Info */}
      <p className="mt-8 text-[11px] text-slate-400 font-medium">
        لِدجرا للمحاسبة السحابية © 2026
      </p>
    </div>
  );
};

export default AuthVerified;
