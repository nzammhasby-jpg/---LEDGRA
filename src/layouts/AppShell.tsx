import React, { useState, useEffect } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTranslation, Locale } from '../i18n/translations';
import { formatArabicDateWithLatinDigits } from '../lib/formatters';
import { Logo } from '../components/Logo';
import { 
  Home, 
  Tag, 
  ShoppingCart, 
  CreditCard, 
  FileText, 
  Users, 
  Truck, 
  SlidersHorizontal, 
  HelpCircle, 
  LogOut, 
  Search, 
  Plus, 
  Bell, 
  Settings, 
  ChevronDown, 
  Menu, 
  X,
  Building,
  ArrowRightLeft,
  ChevronsRight,
  ChevronsLeft,
  Sparkles,
  User,
  CheckCircle,
  FileSpreadsheet
} from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { 
    currentOrg, 
    orgsList, 
    profile, 
    signOut, 
    selectOrg, 
    roleInCurrentOrg 
  } = useAuth();
  const { t } = useTranslation('ar');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [quickActionOpen, setQuickActionOpen] = useState<boolean>(false);
  const [orgSwitcherOpen, setOrgSwitcherOpen] = useState<boolean>(false);
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState<boolean>(false);
  
  const navigate = useNavigate();
  const location = useLocation();

  // Highlight page title depending on router path
  const getPageTitle = () => {
    switch (location.pathname) {
      case '/':
        return 'الرئيسية';
      case '/settings':
        return 'إعدادات المنشأة';
      case '/onboarding':
        return 'إعداد المنشأة';
      case '/customers':
        return 'إدارة العملاء والعملاء المعتمدين';
      case '/vendors':
        return 'إدارة الموردين والشركاء';
      case '/items':
        return 'المنتجات والخدمات';
      default:
        return 'لوحة التحكم';
    }
  };

  // Sidebar Links
  const sidebarItems = [
    { name: t('sidebar.home'), path: '/', icon: Home, isSoon: false },
    { name: t('sidebar.sales'), path: '/sales-soon', icon: Tag, isSoon: true },
    { name: t('sidebar.purchases'), path: '/purchases-soon', icon: ShoppingCart, isSoon: true },
    { name: t('sidebar.expenses'), path: '/expenses-soon', icon: CreditCard, isSoon: true },
    { name: t('sidebar.items'), path: '/items', icon: FileText, isSoon: false },
    { name: t('sidebar.customers'), path: '/customers', icon: Users, isSoon: false },
    { name: t('sidebar.vendors'), path: '/vendors', icon: Truck, isSoon: false },
    { name: t('sidebar.accounting'), path: '/accounting', icon: FileSpreadsheet, isSoon: false },
    { name: t('sidebar.reports'), path: '/reports-soon', icon: SlidersHorizontal, isSoon: true },
    { name: t('sidebar.settings'), path: '/settings', icon: Settings, isSoon: false }
  ];

  const handleLogoutClick = async () => {
    await signOut();
    navigate('/login');
  };

  interface AppNotification {
    id: string;
    title: string;
    message: string;
    type: string;
    is_read: boolean;
    created_at: string;
  }

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    const fetchNotifications = async () => {
      if (!currentOrg?.id) {
        setNotifications([]);
        return;
      }
      setLoadingNotifications(true);
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('id, title, message, type, is_read, created_at')
          .eq('organization_id', currentOrg.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error("Error reading notifications:", error);
        } else if (data && active) {
          setNotifications(data as AppNotification[]);
        }
      } catch (err) {
        console.error("Failed fetching notifications:", err);
      } finally {
        if (active) setLoadingNotifications(false);
      }
    };

    fetchNotifications();

    return () => {
      active = false;
    };
  }, [currentOrg?.id]);

  const handleMarkAllAsRead = async () => {
    if (!currentOrg?.id || notifications.length === 0) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('organization_id', currentOrg.id)
        .eq('is_read', false);

      if (!error) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      }
    } catch (err) {
      console.error("Error marking read:", err);
    }
  };

  const hasUnread = notifications.some(n => !n.is_read);

  const formatNotificationDate = (dateStr: string) => {
    try {
      return formatArabicDateWithLatinDigits(dateStr, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }, 'ar-SA');
    } catch {
      return '';
    }
  };

  return (
    <div className="min-h-screen flex bg-brand-bg select-none font-sans text-slate-800 overflow-x-hidden" dir="rtl">
      
      {/* 1. Backdrop for mobile drawer */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/45 md:hidden z-40 transition-opacity" 
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* 2. SIDEBAR - Responsive drawer/rail layout */}
      <aside 
        className={`fixed md:sticky top-0 right-0 h-screen bg-brand-navy text-white z-50 flex flex-col justify-between transition-all duration-300 overflow-x-hidden ${
          sidebarCollapsed ? 'w-20' : 'w-72'
        } ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}
      >
        {/* Sidebar Header containing logo & close toggle */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <Link to="/" onClick={() => setMobileMenuOpen(false)}>
            <Logo 
              variant={sidebarCollapsed ? 'icon' : 'short'} 
              theme="dark" 
              size="sm" 
            />
          </Link>
          
          {/* Collapse Trigger for Desktop */}
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden md:flex p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition cursor-pointer"
            title={sidebarCollapsed ? 'توسيع القائمة' : 'طي القائمة'}
          >
            {sidebarCollapsed ? <ChevronsLeft className="w-4 h-4" /> : <ChevronsRight className="w-4 h-4" />}
          </button>

          {/* Close Trigger for Mobile screens */}
          <button 
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sidebar Center Links list scrollable */}
        <nav className="flex-1 overflow-y-auto py-4">
          {sidebarItems.map((item) => {
            const isHome = item.path === '/';
            const isActive = isHome ? location.pathname === '/' : location.pathname.startsWith(item.path);
            const IconComponent = item.icon;

            return (
              <div key={item.name} className="relative group">
                {item.isSoon ? (
                  // Locked/Disabled module buttons
                  <div 
                    className={`flex items-center gap-3 py-3 border-r-4 border-r-transparent text-white/40 text-sm font-semibold cursor-not-allowed transition hover:bg-white/5 ${
                      sidebarCollapsed ? 'px-4 justify-center' : 'px-6'
                    }`}
                    title={`${item.name} - قريبًا`}
                  >
                    <IconComponent className="w-4.5 h-4.5 shrink-0" />
                    {!sidebarCollapsed && <span className="min-w-0 flex-1 whitespace-nowrap">{item.name}</span>}
                    {!sidebarCollapsed && (
                      <span className="mr-auto text-[9px] font-bold bg-white/10 text-brand-turquoise px-1.5 py-0.5 rounded shrink-0">
                        {t('sidebar.soon')}
                      </span>
                    )}
                  </div>
                ) : (
                  // Fully Active Route Link
                  <NavLink
                    id={`nav-${item.path.replace('/', '') || 'home'}`}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) => `flex items-center gap-3 py-3 border-r-4 text-sm font-semibold transition-all duration-200 ${
                      sidebarCollapsed ? 'px-4 justify-center' : 'px-6'
                    }  ${
                      isActive 
                        ? 'bg-brand-blue/15 text-white border-r-brand-blue font-bold' 
                        : 'text-white/70 hover:text-white hover:bg-white/5 border-r-transparent'
                    }`}
                  >
                    <IconComponent className="w-4.5 h-4.5 shrink-0" />
                    {!sidebarCollapsed && <span className="min-w-0 flex-1 whitespace-nowrap">{item.name}</span>}
                  </NavLink>
                )}
                
                {/* Visual tooltip on hover if collapsed */}
                {sidebarCollapsed && (
                  <span className="absolute right-full mr-2 top-1.5 bg-slate-900 text-white text-[10px] font-bold px-2.5 py-1.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-250 z-50 whitespace-nowrap shadow-md">
                    {item.name} {item.isSoon && `(${t('sidebar.soon')})`}
                  </span>
                )}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer detailing Active corporate profile & tenant switcher */}
        <div className="p-4 border-t border-white/5 bg-slate-950/40 space-y-3 shrink-0">
          
          {/* Tenant Org Display */}
          {!sidebarCollapsed ? (
            <div className="bg-white/5 px-3 py-2 rounded-xl flex items-center justify-between gap-1.5">
              <div className="truncate text-right">
                <span className="text-[9px] font-semibold text-brand-turquoise uppercase block leading-none mb-1">
                  {t('sidebar.active_org')}
                </span>
                <span className="font-bold text-xs text-white block truncate">
                  {currentOrg ? currentOrg.name_ar : 'منشأة معلقة'}
                </span>
              </div>
              <Building className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
          ) : (
            <div className="flex justify-center" title={currentOrg?.name_ar || 'المنشأة'}>
              <Building className="w-5 h-5 text-brand-turquoise" />
            </div>
          )}

          {/* User Profile Info on Bottom of Bar */}
          <div className="flex items-center justify-between gap-2">
            {!sidebarCollapsed ? (
              <div className="flex items-center gap-2.5 truncate text-right">
                <div className="w-8 h-8 rounded-full bg-brand-blue/15 border border-brand-blue/25 text-brand-blue font-bold flex items-center justify-center text-xs shrink-0 uppercase">
                  {profile?.full_name?.charAt(0) || <User className="w-4 h-4" />}
                </div>
                <div className="truncate">
                  <span className="text-xs font-bold text-white block truncate">{profile?.full_name}</span>
                  <span className="text-[10px] text-slate-400 block truncate">{roleInCurrentOrg === 'owner' ? 'مالك' : 'عضو'}</span>
                </div>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-brand-blue/10 text-brand-blue font-bold flex items-center justify-center text-xs shrink-0 mx-auto">
                {profile?.full_name?.charAt(0) || <User className="w-4 h-4" />}
              </div>
            )}

            {/* Singout Quick */}
            {!sidebarCollapsed && (
              <button 
                onClick={handleLogoutClick}
                className="p-1.5 hover:bg-red-500/10 hover:text-red-400 text-slate-400 rounded-lg transition shrink-0 cursor-pointer"
                title={t('common.logout')}
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>

        </div>
      </aside>

      {/* 3. CORE CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        
        {/* Topbar Header */}
        <header className="bg-white border-b border-slate-200 h-16 px-4 md:px-8 flex items-center justify-between sticky top-0 z-35 shadow-sm shrink-0">
          
          {/* Right Section: Mobile toggle and Page Title */}
          <div className="flex items-center gap-3">
            <button 
              id="mobile-sidebar-toggle"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 hover:bg-slate-50 text-slate-600 rounded-xl cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            
            <h1 className="text-lg font-bold text-slate-900 hidden sm:block">
              {getPageTitle()}
            </h1>
          </div>

          {/* Center search element (disabled mock design) */}
          <div className="hidden lg:flex w-64 mx-4">
            <div className="relative w-full">
              <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input 
                type="text" 
                placeholder={t('common.search')}
                className="w-full pr-9 pl-3 py-1.5 bg-slate-100 border-none rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/50 transition"
              />
            </div>
          </div>

          {/* Left Action Elements */}
          <div className="flex items-center gap-2 md:gap-3">
            
            {/* Quick CreateDropdown */}
            <div className="relative">
              <button 
                id="btn-quick-create"
                onClick={() => setQuickActionOpen(!quickActionOpen)}
                onBlur={() => setTimeout(() => setQuickActionOpen(false), 200)}
                className="py-1.5 px-3.5 bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-medium rounded-lg transition flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden md:inline">+ إنشاء سريع</span>
                <ChevronDown className="w-3 h-3" />
              </button>

              {quickActionOpen && (
                <div className="absolute left-0 mt-2 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 py-1.5 animate-fadeIn">
                  <button 
                    onClick={() => { navigate('/'); }}
                    className="w-full text-right px-4 py-2 hover:bg-slate-50 text-xs font-semibold text-slate-700 block cursor-pointer"
                  >
                    📝 فاتورة مبيعات جديدة
                  </button>
                  <button 
                    onClick={() => { navigate('/'); }}
                    className="w-full text-right px-4 py-2 hover:bg-slate-50 text-xs font-semibold text-slate-700 block cursor-pointer"
                  >
                    👤 إضافة عميل جديد
                  </button>
                  <button 
                    onClick={() => { navigate('/'); }}
                    className="w-full text-right px-4 py-2 hover:bg-slate-50 text-xs font-semibold text-slate-700 block cursor-pointer"
                  >
                    💳 قيد مصروف جديد
                  </button>
                </div>
              )}
            </div>

            {/* Organization Selector Switcher Dropdown */}
            {orgsList.length > 1 && (
              <div className="relative">
                <button 
                  id="btn-org-switcher"
                  onClick={() => setOrgSwitcherOpen(!orgSwitcherOpen)}
                  onBlur={() => setTimeout(() => setOrgSwitcherOpen(false), 200)}
                  className="py-1.5 px-3 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden lg:inline">{currentOrg?.name_ar}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>

                {orgSwitcherOpen && (
                  <div className="absolute left-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 py-1.5 animate-fadeIn">
                    <span className="block px-4 py-1 text-[9px] font-bold text-slate-400 border-b border-slate-100 uppercase pb-1.5 mb-1 text-right">
                      التبديل بين المنشآت
                    </span>
                    {orgsList.map((org) => (
                      <button
                        key={org.id}
                        onClick={() => selectOrg(org.id)}
                        className={`w-full text-right px-4 py-2.5 hover:bg-slate-50 text-xs flex items-center justify-between cursor-pointer ${
                          currentOrg?.id === org.id ? 'font-bold text-brand-blue bg-blue-50/10' : 'text-slate-600'
                        }`}
                      >
                        <span className="truncate">{org.name_ar}</span>
                        {currentOrg?.id === org.id && <CheckCircle className="w-3.5 h-3.5 text-brand-blue ml-1" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Notifications Alert Popup Panel */}
            <div className="relative">
              <button 
                id="btn-notifications"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                onBlur={() => setTimeout(() => setNotificationsOpen(false), 200)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition relative cursor-pointer"
              >
                {hasUnread && (
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-amber absolute top-2 right-2 animate-pulse" />
                )}
                <Bell className="w-4 h-4" />
              </button>

              {notificationsOpen && (
                <div className="absolute left-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-fadeIn text-right">
                  <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">التنبيهات المهنية</span>
                    <button 
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleMarkAllAsRead();
                      }}
                      className="text-[10px] text-brand-blue font-semibold hover:underline cursor-pointer bg-transparent border-0 outline-none"
                    >
                      تحديد كقروء
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {loadingNotifications ? (
                      <div className="p-4 text-center text-xs text-slate-400">جاري قراءة التنبيهات...</div>
                    ) : notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">لا توجد تنبيهات حاليًا</div>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className={`p-3 transition text-right ${n.is_read ? 'opacity-70 hover:bg-slate-50/50' : 'hover:bg-slate-50 bg-brand-blue/5'}`}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${n.type === 'warning' ? 'bg-amber-500' : n.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                            <span className="text-xs font-bold text-slate-800">{n.title}</span>
                            <span className="text-[9px] text-slate-400 mr-auto">{formatNotificationDate(n.created_at)}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-relaxed">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Help / Support Drawer Link */}
            <Link 
              to="/help-panel" 
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
              title="مركز المساعدة"
            >
              <HelpCircle className="w-4 h-4" />
            </Link>

          </div>
        </header>

        {/* 4. ACTUAL PAGE DYNAMIC INJECT CHASSIS ROW */}
        <div className="flex-grow overflow-y-auto p-4 md:p-8">
          {children}
        </div>

      </div>
    </div>
  );
};
export default AppShell;
