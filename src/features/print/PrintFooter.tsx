import React from 'react';
import { formatArabicDateWithLatinDigits } from '../../lib/formatters';
import { useAuth } from '../../context/AuthContext';

interface PrintFooterProps {
  description?: string;
  showSignatures?: boolean;
}

export const PrintFooter: React.FC<PrintFooterProps> = ({
  description,
  showSignatures = true
}) => {
  const { currentOrg } = useAuth();
  const printDate = new Date().toISOString().split('T')[0];
  const printTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const printFooterText = currentOrg?.print_footer_text;

  return (
    <div className="mt-12 print:mt-4 text-right font-sans select-none" dir="rtl">
      
      {/* Signatures & Certification Zone */}
      {showSignatures && (
        <div className="grid grid-cols-2 gap-12 print:gap-4 border-t border-slate-100 pt-8 print:pt-4 mb-8 print:mb-4">
          
          <div className="space-y-6 print:space-y-2 text-center">
            <span className="text-xs font-black text-slate-500 block">إعداد وتوقيع الموظف المسؤول</span>
            <div className="h-16 print:h-8 border-b border-dashed border-slate-200" />
            <span className="text-[10px] text-slate-400">التوقيع / الختم الرسمي</span>
          </div>
  
          <div className="space-y-6 print:space-y-2 text-center">
            <span className="text-xs font-black text-slate-500 block">اعتماد وتوقيع الطرف الثاني (العميل/المورد)</span>
            <div className="h-16 print:h-8 border-b border-dashed border-slate-200" />
            <span className="text-[10px] text-slate-400">التوقيع / الختم المقابل</span>
          </div>
  
        </div>
      )}

      {/* Dynamic print footer text from branding */}
      {printFooterText && (
        <div className="text-center text-[10px] font-bold text-slate-500 mb-6 print:mb-3 bg-slate-50 border border-slate-100 py-2.5 print:py-1 px-3 rounded-xl border-dashed">
          {printFooterText}
        </div>
      )}

      {/* Notes or legal disclaimer */}
      {description && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 print:p-2 mb-6 print:mb-3 text-slate-650 text-[10px] leading-relaxed">
          <span className="font-extrabold text-slate-800 block mb-1">تعليمات وشروط المستند:</span>
          <p>{description}</p>
        </div>
      )}

      {/* System identifier metadata */}
      <div className="border-t border-slate-200 pt-4 print:pt-2 flex flex-col sm:flex-row justify-between items-center text-[9px] text-slate-400 font-bold select-none gap-2">
        <div>
          <span>تم التوليد السحابي الفوري عبر منصة </span>
          <span className="text-slate-500 font-extrabold uppercase">لِدجرا للمحاسبة l LEDGRA</span>
        </div>
        <div className="font-mono">
          <span>تاريخ الطباعة: </span>
          <span>{printDate} {printTime}</span>
        </div>
      </div>

    </div>
  );
};
