import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Mail, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export const AcceptInvitePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading, refreshUserData } = useAuth();
  
  const [status, setStatus] = useState<'loading' | 'pending_auth' | 'accepting' | 'success' | 'error'>('loading');
  const [inviteError, setInviteError] = useState<string>('');

  const getTokenFromUrl = (): string | null => {
    const searchParams = new URLSearchParams(window.location.search);
    let token = searchParams.get('token');
    if (token) return token;

    const hash = window.location.hash || '';
    if (hash.includes('?')) {
      const hashQuery = hash.split('?')[1];
      const hashParams = new URLSearchParams(hashQuery);
      token = hashParams.get('token');
    }
    return token;
  };

  useEffect(() => {
    if (loading) return;

    const token = getTokenFromUrl() || sessionStorage.getItem('ledgra_pending_invite_token');

    if (!user) {
      if (token) {
        sessionStorage.setItem('ledgra_pending_invite_token', token);
      }
      setStatus('pending_auth');
      return;
    }

    // User is logged in
    if (!token) {
      setStatus('error');
      setInviteError('عذراً، لم يتم العثور على رمز دعوة صالح في الرابط.');
      return;
    }

    const acceptInvitation = async () => {
      setStatus('accepting');
      try {
        const { error } = await supabase.rpc('accept_organization_invitation', {
          p_token: token
        });

        if (error) {
          throw new Error(error.message);
        }

        // Successfully accepted
        sessionStorage.removeItem('ledgra_pending_invite_token');
        await refreshUserData();
        setStatus('success');
      } catch (err: any) {
        // Do not print raw token or detailed error to console
        console.error('Failed to accept invitation due to a processing error.');
        setStatus('error');
        const errMsg = err.message || '';
        if (errMsg.includes('مختلف') || errMsg.includes('بريد') || errMsg.includes('different') || errMsg.includes(' email ')) {
          setInviteError('هذه الدعوة موجهة إلى بريد مختلف. سجّل الدخول بالبريد الصحيح أو اطلب دعوة جديدة.');
        } else if (errMsg.includes('منتهي') || errMsg.includes('expired') || errMsg.includes('صلاحية')) {
          setInviteError('رابط الدعوة منتهي. اطلب دعوة جديدة.');
        } else {
          setInviteError(errMsg || 'حدث خطأ أثناء قبول الدعوة. يرجى الاتصال بمسؤول المنشأة.');
        }
      }
    };

    acceptInvitation();
  }, [user, loading]);

  const handleEnterOrg = () => {
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-6 font-sans select-none" dir="rtl">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700/80 p-8 rounded-3xl space-y-6 shadow-2xl relative overflow-hidden text-center">
        
        {/* Glow Decoration */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-slate-900 rounded-full blur-3xl pointer-events-none -z-10" />

        {(status === 'loading' || status === 'accepting') && (
          <div className="space-y-6 py-4">
            <div className="flex justify-center">
              <Loader2 className="w-14 h-14 text-slate-300 animate-spin" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-slate-100">
                {status === 'loading' ? 'جاري التحقق من الدعوة...' : 'جاري قبول الدعوة وإضافتك...'}
              </h1>
              <p className="text-xs text-slate-400">يرجى الانتظار لحين معالجة وتجهيز صلاحيات الانضمام.</p>
            </div>
          </div>
        )}

        {status === 'pending_auth' && (
          <div className="space-y-6 py-4">
            <div className="flex justify-center">
              <div className="bg-brand-blue/10 p-4 rounded-full border border-brand-blue/20">
                <Mail className="w-14 h-14 text-brand-blue" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-black text-slate-100">قبول دعوة المنشأة</h1>
              <p className="text-xs text-slate-300 leading-relaxed">
                سجّل الدخول أو أنشئ حسابًا لقبول الدعوة.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold rounded-xl text-xs transition duration-200 cursor-pointer shadow-md"
              >
                تسجيل الدخول
              </button>
              
              <button
                onClick={() => navigate('/register', { replace: true })}
                className="w-full py-2.5 px-4 bg-slate-700/50 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition duration-200 cursor-pointer"
              >
                إنشاء حساب
              </button>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-6 py-4">
            <div className="flex justify-center">
              <div className="bg-emerald-500/10 p-4 rounded-full border border-emerald-500/20">
                <CheckCircle className="w-14 h-14 text-emerald-400" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-black text-slate-100">تم قبول الدعوة بنجاح</h1>
              <p className="text-xs text-slate-300 leading-relaxed">
                تمت إضافتك إلى المؤسسة. يمكنك الآن البدء في استخدام مميزات لِدجرا للمنشأة المشتركة.
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={handleEnterOrg}
                className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold rounded-xl text-xs transition duration-200 cursor-pointer shadow-md"
              >
                الدخول إلى المؤسسة
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-6 py-4">
            <div className="flex justify-center">
              <div className="bg-rose-500/10 p-4 rounded-full border border-rose-500/20">
                <XCircle className="w-14 h-14 text-rose-400" />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold text-slate-100">فشل قبول الدعوة</h1>
              <p className="text-xs text-slate-300 leading-relaxed">
                {inviteError}
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold rounded-xl text-xs transition duration-200 cursor-pointer shadow-md"
              >
                تسجيل الدخول بحساب آخر
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
