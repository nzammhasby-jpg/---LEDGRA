import React from 'react';
import { Printer, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PrintActionsProps {
  onPrint?: () => void;
  customBackPath?: string;
}

export const PrintActions: React.FC<PrintActionsProps> = ({ onPrint, customBackPath }) => {
  const navigate = useNavigate();

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  const handleBack = () => {
    if (customBackPath) {
      navigate(customBackPath);
    } else {
      window.history.back();
    }
  };

  return (
    <div className="no-print bg-slate-900 border-b border-slate-800 text-white px-6 py-4 flex items-center justify-between shadow-md sticky top-0 z-50 select-none">
      <div className="flex items-center gap-3">
        <button
          onClick={handleBack}
          className="p-2 hover:bg-slate-800 rounded-xl transition flex items-center gap-1.5 text-xs font-bold text-slate-300 cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>رجوع</span>
        </button>
        <span className="text-slate-500">|</span>
        <div className="text-xs font-bold">معاينة الطباعة الرسمية - لِدجرا LEDGRA</div>
      </div>

      <button
        onClick={handlePrint}
        className="px-5 py-2.25 bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-extrabold rounded-xl transition flex items-center gap-2 cursor-pointer shadow-lg active:scale-95"
      >
        <Printer className="w-4 h-4" />
        <span>طباعة المستند الحالية (A4)</span>
      </button>
    </div>
  );
};
