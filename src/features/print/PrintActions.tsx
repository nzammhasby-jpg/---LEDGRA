import React, { useState } from 'react';
import { Printer, ArrowRight, FileDown, Info, HelpCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PrintActionsProps {
  onPrint?: () => void;
  customBackPath?: string;
}

export const PrintActions: React.FC<PrintActionsProps> = ({ onPrint, customBackPath }) => {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState<boolean>(false);

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  const handleDownloadPDF = () => {
    setShowHelp(true);
    // Auto trigger print after showing the helpful guide
    setTimeout(() => {
      if (onPrint) {
        onPrint();
      } else {
        window.print();
      }
    }, 800);
  };

  const handleBack = () => {
    if (customBackPath) {
      navigate(customBackPath);
    } else {
      window.history.back();
    }
  };

  return (
    <>
      {/* Print Actions Toolbar - Hidden during actual print */}
      <div className="no-print bg-slate-900 border-b border-slate-800 text-white px-4 sm:px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md sticky top-0 z-50 select-none">
        <div className="flex items-center justify-between w-full md:w-auto gap-3">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-slate-800 rounded-xl transition flex items-center gap-1.5 text-xs font-bold text-slate-300 cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>رجوع</span>
          </button>
          <span className="text-slate-750">|</span>
          <div className="text-xs font-bold text-slate-100">معاينة الطباعة الرسمية - لِدجرا LEDGRA</div>
        </div>

        {/* Tip for clean printing */}
        <div className="hidden lg:flex items-center gap-2 text-[11px] text-slate-400 max-w-xl text-right bg-slate-850/60 py-1.5 px-3 rounded-lg border border-slate-800">
          <Info className="w-3.5 h-3.5 text-brand-blue shrink-0" />
          <span>لإزالة رابط الصفحة والتاريخ من الورقة، يرجى تعطيل خيار <strong>Headers and Footers (الرؤوس والتذييلات)</strong> في إعدادات الطباعة.</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-2.5">
          <button
            onClick={() => setShowHelp(true)}
            className="p-2.25 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl transition cursor-pointer"
            title="تعليمات الطباعة النظيفة"
          >
            <HelpCircle className="w-4.5 h-4.5" />
          </button>

          <button
            onClick={handleDownloadPDF}
            className="flex-1 md:flex-initial px-4 py-2.25 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            <FileDown className="w-4 h-4 text-brand-turquoise" />
            <span>تحميل كـ PDF</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex-1 md:flex-initial px-5 py-2.25 bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-extrabold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة المستند (A4)</span>
          </button>
        </div>
      </div>

      {/* Helper Modal detailing browser settings for PDF export */}
      {showHelp && (
        <div className="no-print fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn select-none">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-100 shadow-2xl overflow-hidden p-6 space-y-4 text-right">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-brand-blue">
                <Info className="w-5 h-5" />
                <h3 className="text-sm font-bold text-slate-800">تعليمات حفظ PDF وطباعة نظيفة</h3>
              </div>
              <button 
                onClick={() => setShowHelp(false)} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-lg hover:bg-slate-50 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-600 leading-relaxed">
              <p>
                للحصول على مستند مالي أو فاتورة بصيغة <strong>PDF نظيفة ومثالية</strong> وبأعلى جودة خطوط متجهة (Vector):
              </p>
              
              <ol className="list-decimal list-inside space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 font-sans">
                <li>
                  اختر الطابعة لتكون <strong>Save as PDF (حفظ بتنسيق PDF)</strong>.
                </li>
                <li>
                  افتح <strong>More Settings (المزيد من الإعدادات)</strong> في نافذة الطباعة.
                </li>
                <li>
                  <span className="text-red-600 font-extrabold">مهم جداً:</span> قم بإلغاء تفعيل خيار <strong>Headers and Footers (الرؤوس والتذييلات)</strong> لكي يختفي رابط الموقع وتاريخ اليوم من أطراف المستند المالي.
                </li>
                <li>
                  تأكد من تفعيل خيار <strong>Background Graphics (رسومات الخلفية)</strong> لإظهار ألوان وتصميم الهوية الرسمي.
                </li>
              </ol>

              <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-2xl text-[11px] text-blue-800 flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>يرجى الملاحظة أن استخدام ميزة طباعة المتصفح يضمن طباعة النصوص العربية بخط متصل وصحيح 100% بخلاف الطرق التلقائية التي قد تشوه الكلمات العربية.</span>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  setShowHelp(false);
                  if (onPrint) {
                    onPrint();
                  } else {
                    window.print();
                  }
                }}
                className="px-5 py-2 bg-brand-blue hover:bg-brand-blue/95 text-white rounded-xl text-xs font-black transition cursor-pointer"
              >
                متابعة وإجراء الطباعة
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
