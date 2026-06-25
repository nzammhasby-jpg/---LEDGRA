import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Info, 
  CheckCircle, 
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  HelpCircle,
  Briefcase,
  Layers
} from 'lucide-react';

export const HelpPanel: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4 text-right space-y-8 font-sans">
      
      {/* Title */}
      <div className="space-y-2 border-b border-slate-100 pb-5">
        <h2 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <Info className="w-6 h-6 text-slate-700" />
          <span>عن لِدجرا</span>
        </h2>
        <p className="text-slate-600 text-sm leading-relaxed">
          لِدجرا نظام محاسبة سحابي عربي موجه للمنشآت الصغيرة والمتوسطة، يساعد على إدارة الفواتير، السندات، العملاء، الموردين، المخزون، القيود اليومية، والتقارير المالية من مكان واحد.
        </p>
      </div>

      {/* Sections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Section 1: What is Ledgra */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Layers className="w-4.5 h-4.5 text-slate-500" />
            <span>ما هو لِدجرا؟</span>
          </h3>
          <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside pr-2">
            <li>نظام محاسبي سحابي سهل الاستخدام.</li>
            <li>دعم المنشآت المتعددة وإدارتها بمرونة.</li>
            <li>تغطية شاملة للفواتير، السندات، المخازن، والتقارير المالية.</li>
          </ul>
        </div>

        {/* Section 2: What does it provide */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Briefcase className="w-4.5 h-4.5 text-slate-500" />
            <span>ماذا يوفر النظام؟</span>
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
            <div className="space-y-1">
              <div>• فواتير مبيعات وسندات قبض</div>
              <div>• فواتير مشتريات وسندات صرف</div>
              <div>• إدارة العملاء والموردين</div>
              <div>• المنتجات والخدمات والمخزون</div>
            </div>
            <div className="space-y-1">
              <div>• قيود يومية وتقارير مالية</div>
              <div>• طباعة الفواتير بنسق A4</div>
              <div>• هويّة مخصصة للمنشأة</div>
              <div>• أساسيات الفوترة الإلكترونية (QR/XML)</div>
            </div>
          </div>
        </div>

        {/* Section 3: System Status */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3 md:col-span-2">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <CheckCircle className="w-4.5 h-4.5 text-slate-500" />
            <span>حالة النظام والفوترة الإلكترونية</span>
          </h3>
          <ul className="text-xs text-slate-600 space-y-2 pr-2">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span><strong>النسخة الحالية:</strong> نسخة تشغيل أولية مستقرة لتجربة وإدارة الأعمال اليومية.</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span><strong>الفوترة الإلكترونية:</strong> مرحلة تأسيسية تدعم توليد ترميز QR وملفات XML للفواتير بشكل محلي للفحص والامتثال الداخلي الأولي.</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span>لا يوجد ربط API مباشر أو تكامل مع منصة (فاتورة) التابعة لهيئة الزكاة والضريبة والجمارك (ZATCA) في النسخة التشغيلية الحالية.</span>
            </li>
          </ul>
        </div>

      </div>

      {/* Warning Box */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-2">
        <h4 className="text-sm font-bold text-amber-800 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-600" />
          <span>تنبيه هام ومسؤولية قانونية</span>
        </h4>
        <p className="text-xs text-amber-700 leading-relaxed">
          تنبيه: لِدجرا لا يرسل الفواتير حاليًا إلى منصة فاتورة ZATCA ولا يعتبر ربطًا رسميًا متكاملاً حتى يتم تفعيل مرحلة التكامل اللاحقة. إن استخدام ميزات الفوترة الإلكترونية الحالية هو للتجريب والتجهيز الأولي فقط.
        </p>
      </div>

      {/* Support Box */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <HelpCircle className="w-4.5 h-4.5 text-slate-500" />
            <span>الدعم الفني والاستفسارات</span>
          </h4>
          <p className="text-[11px] text-slate-500">
            للدعم أو الاستفسار بخصوص الصلاحيات والتعديلات، يرجى التواصل مع مسؤول النظام أو مالك المنشأة.
          </p>
        </div>
      </div>

      {/* Return to Dashboard link */}
      <div className="text-center pt-2">
        <Link 
          to="/" 
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:underline"
        >
          <span>العودة للرئيسية</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

    </div>
  );
};

export default HelpPanel;
