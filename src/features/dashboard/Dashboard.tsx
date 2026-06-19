import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { formatArabicDateWithLatinDigits } from '../../lib/formatters';
import { 
  Building2, 
  TrendingUp, 
  TrendingDown, 
  CreditCard, 
  ArrowLeftRight, 
  PlusCircle, 
  UserPlus, 
  PackagePlus, 
  Receipt,
  Sparkles,
  BarChart4,
  AlertCircle
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { profile, currentOrg, roleInCurrentOrg } = useAuth();
  const navigate = useNavigate();

  // Saudi formatted localized date with Latin digits
  const getSaudiFormattedDate = () => {
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return formatArabicDateWithLatinDigits(new Date(), options, 'ar-SA');
  };

  return (
    <div className="space-y-6 font-sans text-right" dir="rtl">
      
      {/* 1. Welcoming High-End Header */}
      <div className="bg-gradient-to-l from-brand-navy to-slate-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden border border-slate-800 shadow-md">
        {/* Glow decoration */}
        <div className="absolute top-0 right-0 w-80 h-32 bg-brand-turquoise/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-brand-turquoise/20 text-brand-turquoise px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3 animate-pulse" />
                <span>المنصة متصلة سحابياً بالكامل</span>
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">
              أهلاً بك، {profile?.full_name || 'مستخدم لِدجرا'} ⚡
            </h1>
            <p className="text-slate-300 text-xs">
              لوحة التحكم المالية لمنشأتك: <span className="text-white font-bold">{currentOrg?.name_ar}</span>
            </p>
          </div>
          
          <div className="text-right md:text-left shrink-0">
            <span className="text-xs text-slate-400 block mb-0.5">تاريخ ممارسة الأعمال اليوم:</span>
            <span className="text-sm font-semibold text-brand-turquoise font-sans">{getSaudiFormattedDate()}</span>
          </div>
        </div>
      </div>

      {/* 2. KPI Cards - Clean Zeroed/Real-world States */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Sales KPI */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400">إجمالي مبيعات الفترة (SAR)</span>
            <div className="bg-blue-50 p-2 rounded-xl text-brand-blue">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xl md:text-2xl font-extrabold text-slate-900 font-mono tracking-tight">0.00</span>
            <span className="text-xs text-slate-500 font-bold block">ر.س (SAR)</span>
          </div>
          <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 pt-1 border-t border-slate-100">
            <span>● لا توجد فواتير مقيدة بعد</span>
          </span>
        </div>

        {/* Expenses KPI */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400">إجمالي المصروفات المقيدة</span>
            <div className="bg-purple-50 p-2 rounded-xl text-brand-purple">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xl md:text-2xl font-extrabold text-slate-900 font-mono tracking-tight">0.00</span>
            <span className="text-xs text-slate-500 font-bold block">ر.س</span>
          </div>
          <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1 pt-1 border-t border-slate-100">
            <span>● السجل المالي سليم وخالٍ</span>
          </span>
        </div>

        {/* Profits KPI */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400">الأرباح الصافية التقديرية</span>
            <div className="bg-teal-50 p-2 rounded-xl text-brand-turquoise">
              <BarChart4 className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xl md:text-2xl font-extrabold text-slate-900 font-mono tracking-tight">0.00</span>
            <span className="text-xs text-slate-500 font-bold block">ر.س</span>
          </div>
          <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 pt-1 border-t border-slate-100">
            <span>● بانتظار استيراد الأرصدة بدايةً</span>
          </span>
        </div>

        {/* Receivables KPI */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400">ذمم العملاء والذمم الدائنة</span>
            <div className="bg-amber-50 p-2 rounded-xl text-brand-amber">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xl md:text-2xl font-extrabold text-slate-900 font-mono tracking-tight">0.00</span>
            <span className="text-xs text-slate-500 font-bold block">ر.س</span>
          </div>
          <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-1 pt-1 border-t border-slate-100">
            <span>● لا توجد ديون معلقة</span>
          </span>
        </div>

      </div>

      {/* 3. Empty State Center Dashboard Plate & Quick CTAs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* High-End Professional Empty State Panel */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm flex flex-col justify-center items-center text-center space-y-5 min-h-[350px]">
          <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-3xl">
            📈
          </div>
          
          <div className="space-y-2 max-w-md">
            <h3 className="text-base font-bold text-slate-900">بانتظار البيانات والقيود المالية للمنشأة</h3>
            <p className="text-xs leading-relaxed text-slate-500">
              قمت لتوك بتهيئة منشأتك وعزل فروعها سحابياً بنجاح تحت نظام <strong>لِدجرا</strong> الآمن.
              الحسابات والتقارير والرسوم البيانية الضريبية ستظهر تلقائياً بمجرد تفعيل المرحلة الثانية وتدوين أول فاتورة إلكترونية أو قيد يومي ومصروفات.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100/60 px-4 py-1.5 rounded-full text-[11px] font-bold text-brand-navy">
            <AlertCircle className="w-3.5 h-3.5 text-brand-blue shrink-0" />
            <span>نظام الفواتير والقيود اليومية قيد التطوير في المرحلة القادمة</span>
          </div>
        </div>

        {/* Quick Action Navigation Buttons */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2.5 mb-2 flex items-center justify-between">
              <span>إجراءات سريعة</span>
              <span className="text-[9px] bg-brand-blue/10 text-brand-blue px-2 py-0.5 rounded-full font-bold">المرحلة الثانية</span>
            </h3>
            
            <p className="text-xs text-slate-400 leading-normal mb-1">
              هذه الإجراءات تم تخطيطها لتفعيل مستندات التدوين المحاسبي الفوري عند إطلاق الإصدار 2.0:
            </p>

            <div className="space-y-2.5">
              {[
                { id: 'sales-soon', label: 'إصدار فاتورة مبيعات هجينة', icon: PlusCircle, route: '/sales-soon' },
                { id: 'customers-soon', label: 'إضافة عميل سعودي جديد', icon: UserPlus, route: '/customers-soon' },
                { id: 'expenses-soon', label: 'إضافة مستند مصروفات', icon: CreditCard, route: '/expenses-soon' },
                { id: 'items-soon', label: 'إضافة منتجات ومخزون', icon: PackagePlus, route: '/items-soon' }
              ].map((act) => {
                const IconComp = act.icon;
                return (
                  <button
                    key={act.id}
                    onClick={() => navigate(act.route)}
                    className="w-full p-3 border border-slate-200 hover:border-brand-blue/30 rounded-xl flex items-center justify-between hover:bg-slate-50/50 transition cursor-pointer text-right outline-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-50 p-1.5 rounded-lg text-slate-500">
                        <IconComp className="w-4 h-4 shrink-0" />
                      </div>
                      <span className="text-xs font-semibold text-slate-700">{act.label}</span>
                    </div>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Coming Soon</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
export default Dashboard;
