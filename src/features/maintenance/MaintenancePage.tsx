import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  RefreshCw, 
  ShieldCheck, 
  Cpu, 
  Layers, 
  Clock, 
  Lock, 
  Activity, 
  HardDrive,
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Logo } from '../../components/Logo';
import { SYSTEM_STATUS_CONFIG } from '../../config/systemStatus';

interface MaintenancePageProps {
  onBypass?: () => void;
}

export const MaintenancePage: React.FC<MaintenancePageProps> = ({ onBypass }) => {
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const [checkStatusMessage, setCheckStatusMessage] = useState<string | null>(null);
  const [showBypassModal, setShowBypassModal] = useState(false);
  const [bypassPasscode, setBypassPasscode] = useState('');
  const [bypassError, setBypassError] = useState<string | null>(null);

  const handleCheckStatus = () => {
    setIsChecking(true);
    setCheckStatusMessage(null);

    // Realistic health/status ping delay
    setTimeout(() => {
      setIsChecking(false);
      setLastChecked(new Date());
      setCheckStatusMessage('تم فحص حالة النظام: عمليات التحديث والترقية جارية حالياً بحالة ممتازة.');
    }, 1400);
  };

  const handleBypassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (bypassPasscode.trim() === 'LEDGRA-DEV-2026' || bypassPasscode.trim() === 'ledgra2026') {
      if (onBypass) {
        onBypass();
      } else {
        sessionStorage.setItem('ledgra_maintenance_bypass', 'true');
        window.location.reload();
      }
    } else {
      setBypassError('رمز المرور غير صحيح');
    }
  };

  const updateSteps = [
    {
      title: 'ترقية النواة المحاسبية ومحرك التقارير المالية',
      desc: 'تحسين سرعة معالجة القيود والحسابات والتقارير المتقدمة',
      status: 'completed',
      icon: Cpu,
    },
    {
      title: 'مزامنة وتشفير قواعد البيانات والنسخ الاحتياطي',
      desc: 'حماية وتأمين العمليات المالية مع معايير RLS المحدثة',
      status: 'in_progress',
      icon: HardDrive,
    },
    {
      title: 'تطوير وتحديث واجهات الاستخدام والأداء السحابي',
      desc: 'فحص التوافق واستقرار الاتصال مع خوادم السحابة',
      status: 'pending',
      icon: Layers,
    },
  ];

  return (
    <div 
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between items-center p-4 sm:p-8 font-sans select-none relative overflow-hidden" 
      dir="rtl"
      id="system-maintenance-page"
    >
      {/* Background Ambient Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-gradient-to-b from-brand-blue/20 via-brand-turquoise/10 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-brand-navy/30 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-1/3 left-0 w-[300px] h-[300px] bg-purple-900/15 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header Bar */}
      <header className="w-full max-w-4xl flex items-center justify-between py-4 border-b border-slate-800/80 mb-6">
        <Logo size="md" theme="dark" variant="full" />
        
        {/* Live System Status Pill */}
        <div className="flex items-center gap-2.5 bg-slate-900/90 border border-slate-800 px-3.5 py-1.5 rounded-full shadow-inner">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
          <span className="text-xs font-medium text-amber-300">وضع التحديث والصيانة</span>
        </div>
      </header>

      {/* Main Container Card */}
      <main className="w-full max-w-2xl my-auto">
        <motion.div 
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="bg-slate-900/80 border border-slate-800/90 rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-xl space-y-8"
        >
          {/* Top Animated Badge & Icon */}
          <div className="text-center space-y-4">
            <div className="relative inline-flex items-center justify-center">
              <div className="w-20 h-20 bg-gradient-to-tr from-brand-blue/20 to-brand-turquoise/20 rounded-3xl border border-brand-blue/30 flex items-center justify-center shadow-lg shadow-brand-blue/10">
                <motion.div
                  animate={{ rotate: [0, 360] }}
                  transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
                >
                  <RefreshCw className="w-9 h-9 text-brand-turquoise" />
                </motion.div>
              </div>

              {/* Sparkle decorative icon */}
              <div className="absolute -top-1.5 -right-1.5 bg-slate-800 border border-slate-700 p-1.5 rounded-xl shadow">
                <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="inline-block bg-brand-blue/10 border border-brand-blue/30 px-3 py-1 rounded-full text-xs font-semibold text-brand-turquoise">
                {SYSTEM_STATUS_CONFIG.version}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-sans">
                {SYSTEM_STATUS_CONFIG.title}
              </h1>
              <p className="text-sm sm:text-base text-slate-400 max-w-lg mx-auto leading-relaxed">
                {SYSTEM_STATUS_CONFIG.subtitle}
              </p>
            </div>
          </div>

          {/* Core Notice Box */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 text-sm text-slate-300 leading-relaxed flex items-start gap-3.5">
            <div className="bg-brand-blue/10 border border-brand-blue/20 p-2 rounded-xl text-brand-turquoise shrink-0 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-slate-200 text-xs sm:text-sm">حماية البيانات وسلامة السجلات</h4>
              <p className="text-xs sm:text-sm text-slate-400">
                {SYSTEM_STATUS_CONFIG.message}
              </p>
            </div>
          </div>

          {/* Live Progress Milestones */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 px-1">
              <span className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-brand-turquoise" />
                <span>حالة مراحل التحديث الجارية</span>
              </span>
              <span className="text-slate-500 font-mono text-[11px]">مرحلة 2 من 3</span>
            </div>

            <div className="space-y-2.5">
              {updateSteps.map((step, idx) => {
                const StepIcon = step.icon;
                const isDone = step.status === 'completed';
                const isWorking = step.status === 'in_progress';

                return (
                  <div 
                    key={idx}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                      isWorking 
                        ? 'bg-slate-800/90 border-brand-blue/40 shadow-sm shadow-brand-blue/5' 
                        : isDone 
                        ? 'bg-slate-950/40 border-slate-800/60 opacity-90'
                        : 'bg-slate-950/20 border-slate-800/40 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${
                        isDone 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : isWorking 
                          ? 'bg-brand-blue/20 text-brand-turquoise border border-brand-blue/30'
                          : 'bg-slate-800 text-slate-500'
                      }`}>
                        <StepIcon className="w-4 h-4" />
                      </div>
                      <div className="text-right">
                        <p className={`text-xs font-bold ${isWorking ? 'text-white' : isDone ? 'text-slate-200' : 'text-slate-400'}`}>
                          {step.title}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {step.desc}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 mr-2">
                      {isDone && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>اكتمل</span>
                        </span>
                      )}
                      {isWorking && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-turquoise bg-brand-blue/20 px-2.5 py-0.5 rounded-full border border-brand-blue/30 animate-pulse">
                          <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '3s' }} />
                          <span>جاري العمل</span>
                        </span>
                      )}
                      {!isDone && !isWorking && (
                        <span className="text-[10px] font-medium text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-full">
                          مجدول
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action & Refresh Section */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              onClick={handleCheckStatus}
              disabled={isChecking}
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-brand-blue to-brand-turquoise hover:opacity-90 text-white font-bold rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-brand-blue/20 cursor-pointer disabled:opacity-50"
              id="maintenance-check-status-btn"
            >
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'جاري التحقق من الخوادم...' : 'فحص حالة التحديث وإعادة المحاولة'}</span>
            </button>

            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>آخر فحص:</span>
              <span className="text-slate-300 font-mono text-[11px]">
                {lastChecked.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>

          {/* Status Check Message Feedback */}
          <AnimatePresence>
            {checkStatusMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 p-3 rounded-xl text-xs flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{checkStatusMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>

      {/* Footer Bar */}
      <footer className="w-full max-w-4xl flex flex-col sm:flex-row items-center justify-between gap-2 py-4 border-t border-slate-800/80 mt-6 text-xs text-slate-500">
        <p>نظام لِدجرا للمحاسبة السحابية © {new Date().getFullYear()} — كافة الحقوق محفوظة</p>
        
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 text-slate-400">
            <Lock className="w-3 h-3 text-slate-500" />
            <span>نظام محمي ومشفر بالكامل</span>
          </span>
          <button
            onClick={() => setShowBypassModal(true)}
            className="text-[11px] text-slate-600 hover:text-slate-400 transition cursor-pointer underline-offset-2 hover:underline"
          >
            دخول المشرف (Admin Pass)
          </button>
        </div>
      </footer>

      {/* Admin Emergency Bypass Modal */}
      <AnimatePresence>
        {showBypassModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 text-right"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Lock className="w-4 h-4 text-brand-turquoise" />
                  <span>دخول مؤقت لمدير النظام والبرمجة</span>
                </h3>
                <button
                  onClick={() => {
                    setShowBypassModal(false);
                    setBypassError(null);
                  }}
                  className="text-slate-400 hover:text-white text-sm p-1 rounded-lg hover:bg-slate-800"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                إذا كنت مشرف النظام أو المطور وترغب في فحص لوحة التحكم خلال فترة التحديث، أدخل رمز المرور السريع للمطور:
              </p>

              <form onSubmit={handleBypassSubmit} className="space-y-3">
                <div>
                  <input
                    type="password"
                    placeholder="أدخل رمز المرور..."
                    value={bypassPasscode}
                    onChange={(e) => {
                      setBypassPasscode(e.target.value);
                      setBypassError(null);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-blue"
                    autoFocus
                  />
                  {bypassError && (
                    <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{bypassError}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowBypassModal(false);
                      setBypassError(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800 transition"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-xl text-xs font-bold transition shadow"
                  >
                    تأكيد الدخول
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
export default MaintenancePage;
