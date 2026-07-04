import React from 'react';
import { Printer, FileSpreadsheet, RefreshCw } from 'lucide-react';

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
  return (
    <div 
      className="flex flex-wrap gap-2 items-center print:hidden" 
      id="report-action-buttons"
      dir="rtl"
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

      {/* Print Button */}
      <button
        type="button"
        onClick={onPrint}
        disabled={loading || disabled}
        className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50 select-none shadow-sm"
        title="طباعة التقرير أو الحفظ كـ PDF"
      >
        <Printer className="w-4 h-4 text-slate-350" />
        <span>طباعة (A4)</span>
      </button>
    </div>
  );
};
