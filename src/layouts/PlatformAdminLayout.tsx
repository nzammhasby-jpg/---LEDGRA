import React from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/Logo';
import { Home, LogOut, ShieldCheck } from 'lucide-react';

export const PlatformAdminLayout: React.FC = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out from platform admin layout:', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans" dir="rtl" id="platform-admin-layout">
      {/* Platform Admin Top Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Right side: Logo & Title (RTL: right alignment) */}
          <div className="flex items-center gap-4">
            <Link to="/platform/admin" className="flex items-center gap-3">
              <Logo variant="icon" theme="dark" size="sm" />
              <div className="flex flex-col text-right">
                <span className="font-bold text-sm tracking-wide text-white">إدارة المنصة</span>
                <span className="text-[10px] text-slate-400 font-mono">LEDGRA PLATFORM ADMIN</span>
              </div>
            </Link>
            <span className="hidden sm:inline px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              سوبر أدمن
            </span>
          </div>

          {/* Left side: Navigation / Actions (RTL: left alignment) */}
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition duration-150 border border-slate-700"
              id="platform-back-to-app"
            >
              <Home className="w-4 h-4" />
              <span>العودة للنظام</span>
            </Link>

            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-950/20 hover:bg-red-900/40 text-red-400 transition duration-150 border border-red-500/20 cursor-pointer"
              id="platform-logout-btn"
            >
              <LogOut className="w-4 h-4" />
              <span>تسجيل الخروج</span>
            </button>
          </div>

        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default PlatformAdminLayout;
