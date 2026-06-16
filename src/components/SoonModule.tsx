import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { 
  Sparkles, 
  ArrowRight, 
  Lock, 
  ShieldCheck, 
  Zap, 
  Workflow, 
  CalendarRange 
} from 'lucide-react';

export const SoonModule: React.FC = () => {
  const location = useLocation();

  // Deduce module name based on path
  const getModuleInfo = () => {
    const path = location.pathname;
    if (path.includes('sales')) {
      return {
        title: 'برنامج المبيعات والفواتير الضريبية',
        desc: 'مبيعات شاملة، إصدار فواتير ضريبية، وعروض أسعار، والربط مع الدفع الرقمي.',
        bullets: ['فواتير مبسطة وضريبية موجهة للعملاء', 'إعداد عروض الأسعار والمطالبات وحفظها', 'مهيأ لاحقًا لدعم متطلبات الفوترة الإلكترونية والضريبة داخل المملكة']
      };
    }
    if (path.includes('purchases')) {
      return {
        title: 'برنامج المشتريات وإقرار الموردين',
        desc: 'تتبع مستندات التوريد، تسجيل فواتير الشراء، وإدارة سدادات خط الائتمان للموردين.',
        bullets: ['تسجيل قيود الشراء المباشرة والخصومات', 'سلسلة مطابقة أوامر الشراء للاعتماد المحاسبي', 'تتبع ذمم الموردين والمدفوعات المتأخرة']
      };
    }
    if (path.includes('expenses')) {
      return {
        title: 'مسير وعقود المصروفات العامة',
        desc: 'أتمتة تقييد وإرجاع سندات الدفع وقبوضات المصاريف الإدارية والتشغيلية.',
        bullets: ['تسجيل سندات الصرف المباشرة بنقرات سريعة', 'تنظيم تبويبات وأبواب دليل التكاليف والمصاريف', 'عكس وإصدار إيصالات المشتريات النقدية والعهد']
      };
    }
    if (path.includes('items')) {
      return {
        title: 'مستودع المنتجات وقائمة الخدمات',
        desc: 'دليل شامل للخدمات والسلع، تتبع كلف التصنيع وحد الطلب الموصى به للمخزون.',
        bullets: ['إدارة المنتجات المخزنية والخدمية مسبقة الأسعار', 'دعم الأكواد القياسية، الأرقام التسلسلية والتصنيفات', 'مراقبة حركة البضائع وحساب المتوسط المرجح للتكلفة']
      };
    }
    if (path.includes('customers') || path.includes('vendors')) {
      return {
        title: 'إدارة شؤون العملاء والموردين (CRM)',
        desc: 'قاعدة بيانات موحدة لجهات الاتصال، حدود الائتمان، المديونيات وأرصدة الدفعات المسبقة.',
        bullets: ['ملخص كشف حساب تفصيلي مرسل كأف دي إف', 'علاقات وسجّلات الاتصال الدائمة، الدعم، ومواعيد الالتزامات', 'تقييد أرصدة المدفوعات والقبوضات المقدمة وعكسها تلقائياً']
      };
    }
    if (path.includes('accounting')) {
      return {
        title: 'مقيّد الدفاتر وقيود اليومية المزدوجة',
        desc: 'محرك المحاسبة المركزي. شجرة حسابات سعودية مرنة، وقيود تعديل الفترات الدقيقة.',
        bullets: ['تحكم كامل بالدليل المحاسبي (Chart of Accounts) الموصى به لعملك', 'تقييد القيود الافتتاحية وقيود التسويات يدوياً وحساب ضريبة المخرجات', 'إقفال الأشهر، السنوات المالية، وعزل البيانات بضوابط صارمة']
      };
    }
    if (path.includes('reports')) {
      return {
        title: 'مركز التقارير المالية والإقرارات الضريبية',
        desc: 'مخرجات ذكاء مالي فوري: الأرباح والخسائر، الميزانية العمومية، وكشوفات تسوية ضريبة القيمة المضافة.',
        bullets: ['تقرير تجريبي لضريبة القيمة المضافة لغايات التخطيط المالي والمبكر', 'تقارير مالية قابلة للتطوير وفق احتياج المنشآت السعودية', 'مقارنات سنوية وسلوكية ذكية لتقييم السيولة والربحية']
      };
    }

    // Default Fallback
    return {
      title: 'الوحدة المحوسبة الإضافية',
      desc: 'الخدمة قيد الإنشاء الفني المكثف لتأمين التوافق المحاسبي الفائق.',
      bullets: ['واجهة مبسطة سهلة ومريحة لكل مستويات الخبرة المحاسبية', 'حماية فائقة وربط سحابي مشفر وآمن بالكامل', 'تحديثات مجانية مستمرة لكل المشتركين المسجلين']
    };
  };

  const module = getModuleInfo();

  return (
    <div className="max-w-2xl mx-auto py-12 text-right space-y-6 font-sans">
      
      {/* Icon top header */}
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 bg-brand-purple/5 w-32 h-32 rounded-full blur-2xl pointer-events-none" />
        
        <div className="inline-flex items-center gap-2 bg-purple-50/80 px-3 py-1.5 rounded-full text-brand-purple text-xs font-bold mb-4">
          <Lock className="w-3.5 h-3.5" />
          <span>مرحلة التطوير والامتثال لـ لِدجرا</span>
        </div>

        <div className="space-y-3">
          <h2 className="text-xl font-extrabold text-slate-900">{module.title}</h2>
          <p className="text-xs text-slate-500 leading-relaxed">{module.desc}</p>
        </div>

        {/* Feature roadmap bullet lists */}
        <div className="mt-6 pt-5 border-t border-slate-100 space-y-4">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">ما سنوفره في هذه الوحدة:</span>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600">
            {module.bullets.map((b, i) => (
              <div key={i} className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded bg-brand-turquoise shrink-0 animate-pulse" />
                <span>{b}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Info block explaining the release */}
      <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl flex items-start gap-3.5">
        <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl shrink-0 mt-0.5">
          <Workflow className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
        </div>
        
        <div className="space-y-1">
          <strong className="text-xs text-slate-800 font-bold block">مبني بمرونة تامة للتوسع المتكامل</strong>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            تأسست قاعدة بيانات LEDGRA لِدجرا على قيد معزول لـ <code className="font-mono bg-white px-1 py-0.5 border border-slate-200 rounded">organization_id</code>. هذا يعني أنه بمجرد فتح هذه الميزات الإضافية لاحقًا، ستنعكس البيانات في جداولك الحقيقية والفرعية فورا دون تكبد تكاليف ترحيل أو تداخل الحسابات.
          </p>
        </div>
      </div>

      {/* Primary escape redirect */}
      <div className="text-center pt-2">
        <Link 
          to="/" 
          className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-blue hover:underline"
        >
          <span>الرجوع إلى لوحة التحكم الرئيسية</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

    </div>
  );
};
export default SoonModule;
