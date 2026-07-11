import React, { useState } from 'react';
import { Printer, FileSpreadsheet, RefreshCw, FileText, Info, X } from 'lucide-react';

interface ReportActionsProps {
  onPrint: () => void;
  onExportCSV: () => void;
  onRefresh: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export const ReportActions: React.FC<ReportActionsProps> = ({
  onPrint,
  onExportCSV,
  onRefresh,
  loading = false,
  disabled = false
}) => {
  const [showPdfTip, setShowPdfTip] = useState(false);

  const handlePrintClick = () => {
    setShowPdfTip(true);
    // Wait briefly so the notice renders, then open print dialog
    setTimeout(() => {
      onPrint();
    }, 400);
  };

  return (
    <div className="flex flex-col gap-2.5 w-full sm:w-auto print:hidden" dir="rtl">
      <div 
        className="flex flex-wrap gap-2 items-center" 
        id="report-action-buttons"
      >
        {/* Refresh Button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || disabled}
          className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50 select-none shadow-sm"
          title="تحديث بيانات التقرير"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand-blue' : 'text-slate-500'}`} />
          <span>تحديث</span>
        </button>

        {/* Export CSV Button */}
        <button
          type="button"
          onClick={onExportCSV}
          disabled={loading || disabled}
          className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50 select-none shadow-sm"
          title="تصدير كجدول بيانات CSV للـ Excel"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>تصدير CSV</span>
        </button>

        {/* Print / Save PDF Button */}
        <button
          type="button"
          onClick={handlePrintClick}
          disabled={loading || disabled}
          className="bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50 select-none shadow-sm"
          title="طباعة التقرير أو الحفظ كـ PDF"
        >
          <Printer className="w-4 h-4 text-white/90" />
          <span>تحميل PDF / طباعة (A4)</span>
        </button>
      </div>

      {showPdfTip && (
        <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-start gap-2.5 text-[11px] text-blue-800 relative animate-fade-in max-w-md shadow-sm">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-extrabold text-blue-900">للحصول على تقرير PDF رسمي وبأعلى جودة:</p>
            <ul className="list-disc list-inside space-y-0.5 text-blue-800 font-semibold">
              <li>اختر الوجهة <span className="underline font-bold">حفظ بتنسيق PDF</span> (Save as PDF).</li>
              <li>عطّل خيار <span className="underline font-bold">الرؤوس والتذييلات</span> (Headers and footers) في إعدادات الطباعة الإضافية لإخفاء رابط الويب والتاريخ الافتراضي.</li>
              <li>تأكد من تفعيل <span className="underline font-bold">رسومات الخلفية</span> (Background graphics) للحفاظ على جودة الألوان والخطوط المصممة.</li>
            </ul>
          </div>
          <button 
            type="button" 
            onClick={() => setShowPdfTip(false)}
            className="absolute top-2 left-2 text-blue-500 hover:text-blue-700 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
