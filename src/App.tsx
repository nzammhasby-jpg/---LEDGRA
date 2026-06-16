import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppShell } from './layouts/AppShell';
import { Login } from './features/auth/Login';
import { Register } from './features/auth/Register';
import { ResetPassword } from './features/auth/ResetPassword';
import { Onboarding } from './features/onboarding/Onboarding';
import { Dashboard } from './features/dashboard/Dashboard';
import { Settings } from './features/settings/Settings';
import { SoonModule } from './components/SoonModule';
import { HelpPanel } from './components/HelpPanel';
import { isSupabaseConfigured } from './lib/supabase';
import { ShieldAlert, Terminal, HelpCircle } from 'lucide-react';

const queryClient = new QueryClient();

// Beautiful configuration missing notice for development when secrets are not set
const SupabaseConfigAlert: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-6 font-sans select-none" dir="rtl">
      <div className="w-full max-w-lg bg-slate-850 border border-slate-750 p-8 rounded-3xl space-y-6 shadow-2xl relative overflow-hidden">
        
        {/* Glow decoration */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-brand-navy/60 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="flex items-center gap-3 border-b border-slate-750 pb-4">
          <div className="bg-red-500/10 p-2.5 rounded-xl shrink-0">
            <ShieldAlert className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">إعداد ربط قاعدة البيانات غير مكتمل</h1>
            <p className="text-xs text-slate-400">LEDGRA l لِدجرا — منصة محاسبة سحابية آمنة</p>
          </div>
        </div>

        <div className="space-y-4 text-sm leading-relaxed text-slate-300">
          <p>
            تطلب منصة لِدجرا الاتصال بمشروع <strong>Supabase</strong> سحابي لحفظ الحركات المالية وتشفير جلسات المشتركين ومطابقة قواعد RLS الأمنية.
          </p>

          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 space-y-3">
            <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-brand-turquoise" />
              <span>المفاتيح المطلوبة في إعدادات البيئة (Secrets):</span>
            </span>

            <ul className="space-y-2 text-xs font-mono text-left" style={{ direction: 'ltr' }}>
              <li className="flex items-center justify-between text-slate-305">
                <span>VITE_SUPABASE_URL</span>
                <span className="text-red-400 font-sans text-[10px] bg-red-450/10 px-2 py-0.5 rounded-full">Missing</span>
              </li>
              <li className="flex items-center justify-between text-slate-305">
                <span>VITE_SUPABASE_ANON_KEY</span>
                <span className="text-red-400 font-sans text-[10px] bg-red-450/10 px-2 py-0.5 rounded-full">Missing</span>
              </li>
            </ul>
          </div>

          <div className="text-xs text-slate-400 space-y-2 leading-relaxed">
            <h5 className="font-semibold text-slate-305 flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5 text-brand-blue" />
              <span>طريقة حل المشكلة ممارسياً:</span>
            </h5>
            <ol className="list-decimal list-inside space-y-1 pr-1">
              <li>افتح لوحة <strong>Secrets</strong> في واجهة <strong>AI Studio</strong>.</li>
              <li>أضف المتغيرات المذكورة أعلاه مع قيم مشروعك الحقيقية على Supabase.</li>
              <li>أعد تشغيل التطبيق وسيقوم بالاتصال فوراً بطريقة آمنة.</li>
            </ol>
          </div>
        </div>

        <div className="text-center pt-2 text-[10px] text-slate-500">
          منصة لِدجرا المحاسبية © ٢٠٢٦ — تكنولوجيا السحب المحمية
        </div>

      </div>
    </div>
  );
};

// Elegant Skeleton Loading UI when app validates Supabase sessions and roles
const FullScreenLoader: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans select-none" dir="rtl">
      <div className="space-y-4 text-center">
        {/* Animated pulsing skeleton logo */}
        <div className="relative w-16 h-16 mx-auto bg-brand-navy rounded-2xl flex items-center justify-center shadow-lg animate-pulse">
          <span className="text-white font-mono font-bold text-xl font-sans">L</span>
          <div className="absolute inset-0 border-2 border-brand-turquoise rounded-2xl animate-ping opacity-25" style={{ animationDuration: '2s' }} />
        </div>
        
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-slate-800 font-sans">جاري تحميل لِدجرا...</h4>
          <p className="text-[11px] text-slate-400 font-sans">تأمين الجلسة ومطابقة الصلاحيات السحابية</p>
        </div>

        {/* Skeleton progress indicator bar */}
        <div className="w-40 h-1 bg-slate-200 rounded-full mx-auto overflow-hidden">
          <div className="h-full bg-brand-blue rounded-full animate-pulse" style={{ width: '45%' }} />
        </div>
      </div>
    </div>
  );
};

// PROTECTED ROUTES: Requires Login AND Completed Onboarding
const ProtectedRoute: React.FC = () => {
  const { user, currentOrg, loading } = useAuth();

  if (loading) return <FullScreenLoader />;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If user signed up but hasn't initialized any corporate organization, force them to Onboarding
  if (!currentOrg) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
};

// ONBOARDING ROUTES: Requires Login BUT must NOT have completed onboarding yet
const OnboardingRoute: React.FC = () => {
  const { user, currentOrg, loading } = useAuth();

  if (loading) return <FullScreenLoader />;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If already onboarding complete, go to dashboard
  if (currentOrg) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

// PUBLIC ONLY ROUTES: Reject if already logged in
const PublicRoute: React.FC = () => {
  const { user, currentOrg, loading } = useAuth();

  if (loading) return <FullScreenLoader />;

  if (user) {
    if (!currentOrg) {
      return <Navigate to="/onboarding" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default function App() {
  if (!isSupabaseConfigured) {
    return <SupabaseConfigAlert />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Routes>
            
            {/* Public auth screens */}
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/reset-password" element={<ResetPassword />} />
            </Route>

            {/* Force Onboarding screens */}
            <Route element={<OnboardingRoute />}>
              <Route path="/onboarding" element={<Onboarding />} />
            </Route>

            {/* Protected SaaS Hub screens */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/settings" element={<Settings />} />
              
              {/* Coming soon locked modules */}
              <Route path="/sales-soon" element={<SoonModule />} />
              <Route path="/purchases-soon" element={<SoonModule />} />
              <Route path="/expenses-soon" element={<SoonModule />} />
              <Route path="/items-soon" element={<SoonModule />} />
              <Route path="/customers-soon" element={<SoonModule />} />
              <Route path="/vendors-soon" element={<SoonModule />} />
              <Route path="/accounting-soon" element={<SoonModule />} />
              <Route path="/reports-soon" element={<SoonModule />} />
              <Route path="/help-panel" element={<HelpPanel />} />
            </Route>

            {/* Absolute Fallback Redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />

          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}
