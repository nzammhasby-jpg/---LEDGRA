import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppShell } from './layouts/AppShell';
import { Login } from './features/auth/Login';
import { Register } from './features/auth/Register';
import { ResetPassword } from './features/auth/ResetPassword';
import { Onboarding } from './features/onboarding/Onboarding';
import { Dashboard } from './features/dashboard/Dashboard';
import { Settings } from './features/settings/Settings';
import { AccountingLayout } from './features/accounting/AccountingLayout';
import { CustomersPage } from './features/customers/CustomersPage';
import { VendorsPage } from './features/vendors/VendorsPage';
import { ItemsPage } from './features/items/ItemsPage';
import { InvoicesPage } from './features/sales/InvoicesPage';
import { ReceiptsPage } from './features/sales/ReceiptsPage';
import { PurchaseBillsPage } from './features/purchases/PurchaseBillsPage';
import { PaymentsPage } from './features/purchases/PaymentsPage';
import { InventoryBalancesPage } from './features/inventory/InventoryBalancesPage';
import { InventoryMovementsPage } from './features/inventory/InventoryMovementsPage';
import { ReportsLayout } from './features/reports/ReportsLayout';
import { SoonModule } from './components/SoonModule';
import { HelpPanel } from './components/HelpPanel';
import { isSupabaseConfigured } from './lib/supabase';
import { ShieldAlert, Terminal, HelpCircle } from 'lucide-react';

// Beautiful configuration missing notice for development when secrets are not set
const SupabaseConfigAlert: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-6 font-sans select-none" dir="rtl">
      <div className="w-full max-w-lg bg-slate-800 border border-slate-700 p-8 rounded-3xl space-y-6 shadow-2xl relative overflow-hidden">
        
        {/* Glow decoration */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-brand-navy/60 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="flex items-center gap-3 border-b border-slate-700 pb-4">
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
              <li className="flex items-center justify-between text-slate-300">
                <span>VITE_SUPABASE_URL</span>
                <span className="text-red-400 font-sans text-[10px] bg-red-400/10 px-2 py-0.5 rounded-full">Missing</span>
              </li>
              <li className="flex items-center justify-between text-slate-300">
                <span>VITE_SUPABASE_ANON_KEY</span>
                <span className="text-red-400 font-sans text-[10px] bg-red-400/10 px-2 py-0.5 rounded-full">Missing</span>
              </li>
            </ul>
          </div>

          <div className="text-xs text-slate-400 space-y-2 leading-relaxed">
            <h5 className="font-semibold text-slate-300 flex items-center gap-1">
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
          منصة لِدجرا المحاسبية © 2026 — تكنولوجيا السحب المحمية
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

// Professional Database Error Full-screen Alert when connection, RLS or DB errors occur
const DatabaseErrorAlert: React.FC<{ error: string; onRetry: () => void }> = ({ error, onRetry }) => {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-6 font-sans select-none" dir="rtl">
      <div className="w-full max-w-lg bg-slate-800 border border-slate-700 p-8 rounded-3xl space-y-6 shadow-2xl relative overflow-hidden">
        
        {/* red glow background decoration */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-red-900/30 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="flex items-center gap-3 border-b border-slate-700 pb-4">
          <div className="bg-red-500/10 p-2.5 rounded-xl shrink-0">
            <ShieldAlert className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100 font-sans">فشل في مزامنة البيانات السحابية</h1>
            <p className="text-xs text-slate-400 font-sans">مزود قاعدة بيانات لِدجرا — خطأ اتصال مع خادم Supabase</p>
          </div>
        </div>

        <div className="space-y-4 text-sm leading-relaxed text-slate-300">
          <p>
            تتعذر مزامنة حسابك أو قراءة الكيانات بسبب خطأ الاتصال، أو عدم تفعيل مشغلات الحماية والأمن RLS:
          </p>

          <div className="bg-slate-900 rounded-2xl p-4 border border-slate-700/60 font-mono text-xs text-red-400 break-words leading-relaxed" style={{ direction: 'ltr', textAlign: 'left' }}>
            {error}
          </div>

          <p className="text-xs text-slate-400">
            يرجى تشغيل الملف الموحد <code className="bg-slate-700 inline-block px-1 py-0.5 rounded text-slate-200 text-[10px]">supabase/initial_schema.sql</code> بالكامل في مخرجات Supabase لتجهيز الجداول وخدمات الحماية المنشآتية وتفعيل triggers.
          </p>
        </div>

        <div className="flex justify-between items-center pt-2">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-bold text-slate-200 transition cursor-pointer"
          >
            تحديث الصفحة بالكامل
          </button>
          
          <button
            onClick={onRetry}
            className="px-5 py-2.25 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-xl text-xs font-bold transition shadow-lg cursor-pointer"
          >
            إعادة المحاولة السحابية
          </button>
        </div>
      </div>
    </div>
  );
};

// PROTECTED ROUTES: Requires Login AND Completed Onboarding
const ProtectedRoute: React.FC = () => {
  const { user, currentOrg, loading, dataError, refreshUserData } = useAuth();

  if (dataError) return <DatabaseErrorAlert error={dataError} onRetry={refreshUserData} />;

  if (loading) return <FullScreenLoader />;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If user signed up but hasn't completed onboarding for any organization, force them to Onboarding
  if (!currentOrg || !currentOrg.onboarding_completed) {
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
  const { user, currentOrg, loading, dataError, refreshUserData } = useAuth();

  if (dataError) return <DatabaseErrorAlert error={dataError} onRetry={refreshUserData} />;

  if (loading) return <FullScreenLoader />;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If already onboarding complete, go to dashboard
  if (currentOrg && currentOrg.onboarding_completed) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

// PUBLIC ONLY ROUTES: Reject if already logged in
const PublicRoute: React.FC = () => {
  const { user, currentOrg, loading, dataError, refreshUserData } = useAuth();

  if (dataError) return <DatabaseErrorAlert error={dataError} onRetry={refreshUserData} />;

  if (loading) return <FullScreenLoader />;

  if (user) {
    if (!currentOrg || !currentOrg.onboarding_completed) {
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
    <AuthProvider>
      <Router>
        <Routes>
          
          {/* Public auth screens */}
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>

          {/* Independent route for resetting password */}
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Force Onboarding screens */}
          <Route element={<OnboardingRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
          </Route>

          {/* Protected SaaS Hub screens */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/settings" element={<Settings />} />
            
            {/* Sales Invoices & Receipts Module */}
            <Route path="/sales/invoices" element={<InvoicesPage />} />
            <Route path="/sales/receipts" element={<ReceiptsPage />} />
            <Route path="/purchases/bills" element={<PurchaseBillsPage />} />
            <Route path="/purchases/payments" element={<PaymentsPage />} />
            
            {/* Basic Inventory Module */}
            <Route path="/inventory/balances" element={<InventoryBalancesPage />} />
            <Route path="/inventory/movements" element={<InventoryMovementsPage />} />

            <Route path="/items" element={<ItemsPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/vendors" element={<VendorsPage />} />
            <Route path="/accounting" element={<AccountingLayout />} />
            <Route path="/reports" element={<ReportsLayout />} />
            <Route path="/reports-soon" element={<SoonModule />} />
            <Route path="/help-panel" element={<HelpPanel />} />
          </Route>

          {/* Absolute Fallback Redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </Router>
    </AuthProvider>
  );
}
