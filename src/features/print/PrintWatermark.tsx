import React from 'react';

interface PrintWatermarkProps {
  status: 'draft' | 'cancelled' | string | null;
}

export const PrintWatermark: React.FC<PrintWatermarkProps> = ({ status }) => {
  if (!status || (status !== 'draft' && status !== 'cancelled' && status !== 'draft_bill')) return null;

  const isCancelled = status === 'cancelled';
  const label = isCancelled ? 'ملغاة' : 'مسودة';
  const colorClass = isCancelled 
    ? 'text-red-500/10 border-red-500/10' 
    : 'text-amber-500/10 border-amber-500/10';

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden select-none z-10">
      <div 
        className={`text-6xl md:text-8xl font-black tracking-widest uppercase border-8 rounded-2xl px-12 py-4 rotate-[-35deg] ${colorClass}`}
        style={{ direction: 'rtl' }}
      >
        {label}
      </div>
    </div>
  );
};
