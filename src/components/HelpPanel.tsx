import React from 'react';
import { Link } from 'react-router-dom';
import { 
  HelpCircle, 
  Database, 
  ArrowRight 
} from 'lucide-react';

export const HelpPanel: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto py-8 text-right space-y-8 font-sans">
      
      {/* Title */}
      <div className="space-y-1">
        <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
          <HelpCircle className="w-5.5 h-5.5 text-brand-blue" />
          <span>مركز الدعم الفني ودليل إعداد لِدجرا</span>
        </h2>
        <p className="text-xs text-slate-500">دليلك الكامل لتشغيل المنصة وربطها بقاعدة بيانات سحابية خارجيّة.</p>
      </div>

      {/* Database Connection Steps Segment */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
        <span className="text-[10px] font-bold text-brand-purple uppercase bg-purple-50 px-2.5 py-1 rounded-sm inline-block">
          دليل الربط السحابي (Supabase Integration)
        </span>
        
        <p className="text-xs text-slate-600 leading-relaxed">
          تم تصميم لِدجرا LEDGRA ليكون نظاماً مالياً جاهزاً للعمل بالربط الفعلي بقاعدة بيانات <strong>Supabase</strong> السحابية لضمان حفظ كل تدوينة، مستند، ومنشأة بشكل آمن تماماً. اتبع الخطوات التالية لإتمام الربط:
        </p>

        {/* Step-by-Step interactive process cards */}
        <div className="space-y-4">
          
          <div className="flex gap-4 items-start border-b border-slate-100 pb-4">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 font-bold flex items-center justify-center shrink-0">
              ١
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-slate-900">إنشاء مشروع Supabase جديد</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                انتقل إلى <a href="https://supabase.com" target="_blank" className="text-brand-blue font-bold hover:underline" rel="noreferrer">Supabase.com</a> وقم بإنشاء مشروع جديد مجاني. اختر المنطقة الأقرب للمملكة العربية السعودية (مثال: EU Central أو AWS Bahrain).
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start border-b border-slate-100 pb-4">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 font-bold flex items-center justify-center shrink-0">
              ٢
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-slate-900">تشغيل ملف الهيكل المحاسبي والـ Schema</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                افتح مشروعك الجديد، ومن القائمة الجانبية اختر <strong>SQL Editor</strong> ثم اضغط على <strong>New Query</strong>. انسخ كامل محتويات ملف <code className="font-mono px-1 py-0.5 bg-slate-50 border rounded text-[10px]">supabase_schema.sql</code> الموجود في المجلد الرئيسي لهذا المشروع، والصقه هناك ثم اضغط <strong>Run</strong>.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start border-b border-slate-100 pb-4">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 font-bold flex items-center justify-center shrink-0">
              ٣
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-slate-900">تفعيل متغيرات البيئة في AI Studio</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                من إعداد مشروع Supabase (Project Settings ثم API)، انسخ المفتاحين: <strong>Project URL</strong> و <strong>Anon Public Key</strong>. ثم في لوحة تحكم <strong>Google AI Studio Build</strong>، افتح قائمة <strong>Secrets</strong> وأضف:
              </p>
              
              <div className="bg-slate-900 text-slate-300 p-3.5 rounded-lg font-mono text-left mt-2 block space-y-1 select-all text-xs" style={{ direction: 'ltr' }}>
                <div className="text-emerald-400"># في قائمة Secrets بـ Google AI Studio أضف المتغيرات التالية:</div>
                <div>VITE_SUPABASE_URL="https://your-project-id.supabase.co"</div>
                <div>VITE_SUPABASE_ANON_KEY="your-anon-public-jwt-key"</div>
              </div>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0">
              ✓
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-slate-900">إعادة تشغيل الخادم وتأكيد نجاح التكوين</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                بمجرد إدراج المتغيرات، سيتم تحديث معالج المنصة وسيرتبط تسجيل الدخول، والمشتركين، والهيكل الفعلي بالمحيط السحابي بشكل كامل وفوري!
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* Platform Security architecture block */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3.5">
        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <Database className="w-4.5 h-4.5 text-brand-turquoise" />
          <span>بنية عزل البيانات المتعددة المستأجرين (Multi-Tenant Isolation)</span>
        </h4>
        
        <p className="text-[11px] text-slate-600 leading-relaxed">
          تعتمد لِدجرا على حماية صارمة تعزل كل شركة/سجل تجاري بمستأجر مستقل. تم بناء جداول <code className="font-mono bg-white px-1 py-0.5 border rounded text-[10px]">organization_members</code> لتنظيم الصلاحيات. في حال محاولة مستخدم خارجي استدعاء بيانات ومستندات منشأة لم يسجل كعضو فيها، ستقوم برمجية <strong>Row Level Security (RLS)</strong> التي قمنا بتضمينها في SQL بمنع الاتصال في الحال وإرجاع خطأ غير مصرح.
        </p>
      </div>

      {/* Escape redirect */}
      <div className="text-center pt-2">
        <Link 
          to="/" 
          className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-blue hover:underline"
        >
          <span>العودة للرئيسية</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

    </div>
  );
};

export default HelpPanel;
