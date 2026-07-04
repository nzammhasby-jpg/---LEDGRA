import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Calendar, Tag, Info, ShieldAlert } from 'lucide-react';

interface ReportHeaderProps {
  reportName: string;
  dateFrom: string;
  dateTo: string;
  excludeClosingEntries?: boolean;
  yearStatus?: 'open' | 'closed' | 'locked' | 'draft' | string;
}

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  reportName,
  dateFrom,
  dateTo,
  excludeClosingEntries,
  yearStatus
}) => {
  const { currentOrg } = useAuth();
  const printDate = new Date().toLocaleString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const getYearStatusLabel = (status?: string) => {
    switch (status) {
      case 'open':
        return 'السنة المالية مفتوحة';
      case 'closed':
        return 'السنة المالية مغلقة (بانتظار الإقفال)';
      case 'locked':
        return 'السنة المالية مقفلة بالكامل';
      case 'draft':
        return 'مسودة سنة مالية';
      default:
        return status ? `حالة السنة: ${status}` : null;
    }
  };

  return (
    <div 
      className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4 text-right rtl print:border-0 print:shadow-none print:p-0" 
      dir="rtl"
      id="report-print-header"
    >
      {/* Visual top bar for print decoration */}
      <div className="h-1.5 w-full bg-brand-blue rounded-t-lg print:bg-slate-800 print:h-1" />

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        {/* Main Info */}
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase font-black tracking-wider text-slate-400 print:text-slate-500">
            {currentOrg?.name_ar || currentOrg?.name || 'منصة لِدجرا للمحاسبة'}
          </p>
          <h2 className="text-xl font-black text-slate-800 print:text-2xl print:text-slate-900">
            {reportName}
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-semibold print:text-slate-700">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>الفترة:</span>
              <span className="font-sans font-bold" style={{ direction: 'ltr' }}>{dateFrom}</span>
              <span>إلى</span>
              <span className="font-sans font-bold" style={{ direction: 'ltr' }}>{dateTo}</span>
            </span>
            <span className="flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              <span>العملة الحالية:</span>
              <span className="font-bold">{currentOrg?.currency_code || ''}</span>
            </span>
          </div>
        </div>

        {/* Meta details */}
        <div className="text-xs space-y-1.5 md:text-left text-slate-500 print:text-slate-700 md:self-end">
          <p className="font-semibold">
            <span>تاريخ توليد التقرير: </span>
            <span className="font-sans font-bold">{printDate}</span>
          </p>
          <div className="flex flex-wrap gap-2 md:justify-end">
            {/* Year Status Badge */}
            {yearStatus && (
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black print:border ${
                yearStatus === 'open' 
                  ? 'bg-blue-50 text-blue-700 border-blue-200' 
                  : yearStatus === 'locked'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {getYearStatusLabel(yearStatus)}
              </span>
            )}

            {/* Closing Entry Badge */}
            {excludeClosingEntries !== undefined && (
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black print:border ${
                excludeClosingEntries 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {excludeClosingEntries ? 'تم استبعاد قيود الإقفال' : 'يشمل قيود الإقفال السنوية'}
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* Decorative hairline */}
      <div className="border-b border-slate-100 print:border-slate-300" />
    </div>
  );
};
