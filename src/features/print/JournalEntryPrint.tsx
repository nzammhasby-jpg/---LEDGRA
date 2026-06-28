import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { journalService } from '../../lib/journalService';
import { JournalEntry } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { formatArabicDateWithLatinDigits, formatNumberWithLatinDigits } from '../../lib/formatters';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintWatermark } from './PrintWatermark';
import { AlertCircle, Loader2 } from 'lucide-react';

export const JournalEntryPrint: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useAuth();

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id && id) {
      loadEntry();
    }
  }, [currentOrg?.id, id]);

  const loadEntry = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await journalService.getJournalEntry(currentOrg!.id, id!);
      if (data.organization_id !== currentOrg!.id) {
        throw new Error('غير مصرح لك بالوصول إلى هذه المنشأة أو المستند');
      }
      setEntry(data);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-bold">جاري تحميل مستند القيد المحاسبي...</p>
        </div>
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-6 text-center space-y-4 shadow-xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">تعذر تحميل سند القيد اليومي للطباعة</h3>
            <p className="text-xs text-slate-400 mt-1">{error || 'المستند غير موجود أو تم حذفه'}</p>
          </div>
          <button
            onClick={() => window.history.back()}
            className="w-full py-2.25 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition"
          >
            رجوع للخلف
          </button>
        </div>
      </div>
    );
  }

  const totalDebit = entry.lines?.reduce((sum, l) => sum + Number(l.debit || 0), 0) || 0;
  const totalCredit = entry.lines?.reduce((sum, l) => sum + Number(l.credit || 0), 0) || 0;

  return (
    <div className="bg-slate-100 min-h-screen animate-fadeIn">
      <PrintActions customBackPath="/accounting" />

      {/* Main A4 Printable Sheet Content Chassis */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden">
        
        {/* Watermark of status */}
        <PrintWatermark status={entry.status} />

        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle="سـند قـيـد يـومـي رســمي"
          documentNumber={entry.entry_number || 'مسودة غير رحلة'}
          documentDate={entry.entry_date}
          extraMeta={[
            { label: 'حالة القيد', value: entry.status === 'posted' ? 'معتمد ومرحل' : entry.status === 'reversed' ? 'معكوس بالكامل' : 'مسودة مؤقتة' },
            { label: 'رقم المرجع', value: entry.reference || 'غير متوفر' }
          ]}
        />

        {/* Note section */}
        {entry.description && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 font-sans text-right" dir="rtl">
            <span className="text-[10px] font-black text-slate-400 block mb-1">البيان والملخص العام للقيد:</span>
            <p className="text-xs text-slate-800 whitespace-pre-line leading-relaxed">
              {entry.description}
            </p>
          </div>
        )}

        {/* Lines table */}
        <div className="mb-8 font-sans" dir="rtl">
          <span className="text-[10px] font-black text-slate-400 block mb-2">تفاصيل البنود والقيود المزدوجة المتوازنة:</span>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="py-2 px-3 border border-slate-200 font-black text-right w-8">#</th>
                <th className="py-2 px-3 border border-slate-200 font-black text-right">رمز وتسمية الحساب المحاسبي</th>
                <th className="py-2 px-3 border border-slate-200 font-black text-right">شرح البند التفصيلي</th>
                <th className="py-2 px-3 border border-slate-200 font-black text-center w-32">مدين (+)</th>
                <th className="py-2 px-3 border border-slate-200 font-black text-center w-32">دائن (-)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {entry.lines?.map((line, idx) => (
                <tr key={line.id || idx} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 border border-slate-200 text-slate-400 font-mono font-bold text-center">{idx + 1}</td>
                  <td className="py-2.5 px-3 border border-slate-200 text-right">
                    <span className="font-bold text-slate-900 block">{line.account?.name_ar}</span>
                    <span className="font-mono text-[10px] text-slate-400" dir="ltr">{line.account?.code}</span>
                  </td>
                  <td className="py-2.5 px-3 border border-slate-200 text-right text-slate-500 text-[11px]">
                    {line.description || <span className="text-slate-300">-</span>}
                  </td>
                  <td className="py-2.5 px-3 border border-slate-200 font-mono text-center font-bold text-slate-900">
                    {line.debit > 0 ? formatNumberWithLatinDigits(line.debit) : '-'}
                  </td>
                  <td className="py-2.5 px-3 border border-slate-200 font-mono text-center font-bold text-slate-900">
                    {line.credit > 0 ? formatNumberWithLatinDigits(line.credit) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-black text-slate-900 border-t-2 border-slate-300">
                <td colSpan={3} className="py-2.5 px-3 border border-slate-200 text-left">إجمالي الحركة المتوازنة (SAR):</td>
                <td className="py-2.5 px-3 border border-slate-200 text-center font-mono font-black">{formatNumberWithLatinDigits(totalDebit)}</td>
                <td className="py-2.5 px-3 border border-slate-200 text-center font-mono font-black">{formatNumberWithLatinDigits(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer actions and stamp zones */}
        <PrintFooter description="تم توليد هذا القيد تلقائياً من الأنظمة الفرعية أو يدوياً بمعرفة المدير المالي المعتمد للمنشأة." />

      </div>
    </div>
  );
};
