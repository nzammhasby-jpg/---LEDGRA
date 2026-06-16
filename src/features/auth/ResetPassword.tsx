import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Logo } from '../../components/Logo';
import { Lock, CheckCircle2, ShieldAlert } from 'lucide-react';

const resetPasswordSchema = z.object({
  password: z.string().min(6, { message: 'كلمة المرور يجب أن لا تقل عن 6 أحرف' }),
  confirmPassword: z.string().min(6, { message: 'تأكيد كلمة المرور مطلوب' }),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'كلمتا المرور غير متطابقتين',
  path: ['confirmPassword'],
});

type ResetPasswordFields = z.infer<typeof resetPasswordSchema>;

export const ResetPassword: React.FC = () => {
  const { updateUserPassword, signOut } = useAuth();
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiSuccess, setApiSuccess] = useState<boolean>(false);
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ResetPasswordFields>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    }
  });

  const onSubmit = async (data: ResetPasswordFields) => {
    setApiError(null);
    setApiSuccess(false);
    try {
      const response = await updateUserPassword(data.password);
      if (response.error) {
        setApiError(response.error);
      } else {
        setApiSuccess(true);
        try {
          await signOut();
        } catch (signOutErr) {
          console.error("Error signing out after password reset success:", signOutErr);
        }
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }
    } catch (e: any) {
      setApiError(e.message || 'حدث خطأ غير متوقع أثناء تحديث كلمة المرور.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-6 bg-slate-50 font-sans" dir="rtl">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-6">
        
        {/* Logo */}
        <div className="flex justify-center mb-2">
          <Logo variant="full" theme="light" size="md" />
        </div>

        {/* Header */}
        <div className="text-center space-y-1">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
            تعيين كلمة مرور جديدة
          </h2>
          <p className="text-slate-500 text-xs">
            أدخل كلمة المرور الجديدة لحسابك وقم بتأكيدها للمتابعة.
          </p>
        </div>

        {/* Responses */}
        {apiError && (
          <div className="bg-red-50 border-r-4 border-red-500 p-4 rounded-xl flex items-start gap-2">
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h5 className="text-sm font-semibold text-red-900">فشل التحديث</h5>
              <p className="text-xs text-red-700 mt-0.5">{apiError}</p>
            </div>
          </div>
        )}

        {apiSuccess && (
          <div className="bg-emerald-50 border-r-4 border-emerald-500 p-4 rounded-xl flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h5 className="text-sm font-semibold text-emerald-900">تم التحديث بنجاح</h5>
              <p className="text-xs text-emerald-700 mt-0.5">جاهز لتسجيل الدخول! جاري التوجيه...</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* New Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              كلمة المرور الجديدة
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                placeholder="••••••••"
                {...register('password')}
                className={`w-full pr-9 pl-3 py-2.5 bg-white border ${
                  errors.password ? 'border-red-400 focus:ring-red-100' : 'border-slate-200 focus:ring-brand-blue/20'
                } rounded-xl text-sm focus:outline-none focus:ring-4 transition`}
                style={{ direction: 'ltr', textAlign: 'right' }}
              />
            </div>
            {errors.password && (
              <p className="text-xs text-red-600 mt-0.5">{errors.password.message}</p>
            )}
          </div>

          {/* Confirm New Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              تأكيد كلمة المرور الجديدة
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                placeholder="••••••••"
                {...register('confirmPassword')}
                className={`w-full pr-9 pl-3 py-2.5 bg-white border ${
                  errors.confirmPassword ? 'border-red-400 focus:ring-red-100' : 'border-slate-200 focus:ring-brand-blue/20'
                } rounded-xl text-sm focus:outline-none focus:ring-4 transition`}
                style={{ direction: 'ltr', textAlign: 'right' }}
              />
            </div>
            {errors.confirmPassword && (
              <p className="text-xs text-red-600 mt-0.5">{errors.confirmPassword.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || apiSuccess}
            className="w-full py-2.5 px-4 bg-brand-blue hover:bg-blue-600 text-white font-bold rounded-xl text-sm shadow-md hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-brand-blue/20 transition disabled:opacity-55 flex items-center justify-center gap-2 cursor-pointer pt-2"
          >
            {isSubmitting ? (
              <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <span>تحديث كلمة المرور</span>
            )}
          </button>
        </form>

      </div>
    </div>
  );
};
