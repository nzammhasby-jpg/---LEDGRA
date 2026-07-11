import React from 'react';

export const ReportSignatures: React.FC = () => {
  return (
    <div className="mt-12 space-y-8">
      {/* Signature & Authorization Section (shows on print only) */}
      <div className="hidden print:grid grid-cols-3 gap-8 text-center text-xs font-extrabold text-slate-700">
        <div className="border-t border-dashed border-slate-300 pt-3">
          <p className="mb-1 text-slate-800">توقيع المحاسب المالي</p>
          <p className="text-[10px] text-slate-450 font-normal">............................</p>
        </div>
        <div className="border-t border-dashed border-slate-300 pt-3">
          <p className="mb-1 text-slate-800">توقيع المدير المالي</p>
          <p className="text-[10px] text-slate-450 font-normal">............................</p>
        </div>
        <div className="border-t border-dashed border-slate-300 pt-3">
          <p className="mb-1 text-slate-800">توقيع المدير العام / الاعتماد</p>
          <p className="text-[10px] text-slate-450 font-normal">............................</p>
        </div>
      </div>

      {/* Print Footer Details */}
      <div className="hidden print:flex items-center justify-between border-t border-slate-200 pt-2 text-[9px] text-slate-400 font-bold w-full">
        <span>تم التوليد وتصميم الميزانيات آليًا عبر منصة لِدجرا للمحاسبة السحابية (LEDGRA)</span>
        <span>صفحة 1 من 1</span>
      </div>
    </div>
  );
};
