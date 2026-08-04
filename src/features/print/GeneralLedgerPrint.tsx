import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { reportsService, LedgerReportResult } from '../../lib/reportsService';
import { accountingService } from '../../lib/accountingService';
import { getErrorMessage } from '../../lib/errors';
import { formatArabicDateWithLatinDigits, formatNumberWithLatinDigits } from '../../lib/formatters';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { AlertCircle, Loader2 } from 'lucide-react';

export const GeneralLedgerPrint: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { currentOrg } = useAuth();

  const accountId = searchParams.get('accountId') || '';
  const fiscalYearId = searchParams.get('fiscalYearId') || searchParams.get('fiscal_year_id') || '';
  const startDate = searchParams.get('startDate') || searchParams.get('dateFrom') || searchParams.get('date_from') || '';
  const endDate = searchParams.get('endDate') || searchParams.get('dateTo') || searchParams.get('date_to') || '';

  const [reportResult, setReportResult] = useState<LedgerReportResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id) {
      if (!accountId) {
        setLoading(false);
        setError('يرجى تحديد حساب محاسبي صالح لعرض كشف الحركة التفصيلي.');
        return;
      }
      loadLedger();
    }
  }, [currentOrg?.id, accountId, fiscalYearId, startDate, endDate]);

  const loadLedger = async () => {
    setLoading(true);
    setError(null);
    try {
      let activeFyId = fiscalYearId;
      let fromDate = startDate;
      let toDate = endDate;

      if (!activeFyId || !fromDate || !toDate) {
        const years = await accountingService.getFiscalYears(currentOrg!.id);
        const selectedYear = (activeFyId ? years.find(y => y.id === activeFyId) : null) || years.find(y => y.is_current) || years[0];
        if (!selectedYear) {
          throw new Error('لم يتم العثور على سنة مالية معتمدة لهذه المنشأة.');
        }
        activeFyId = selectedYear.id;
        fromDate = fromDate || selectedYear.start_date;
        toDate = toDate || selectedYear.end_date;
      }

      if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
        throw new Error("تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية.");
      }

      const report = await reportsService.getLedgerReportAdvanced(
        currentOrg!.id,
        accountId,
        fromDate,
        toDate,
        false,
        activeFyId
      );
      setReportResult(report);
    } catch (err: unknown) {
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
          <p className="text-xs text-slate-500 font-bold">جاري تحميل وتلخيص كشف دفتر الأستاذ...</p>
        </div>
      </div>
    );
  }

  if (error || !reportResult) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-6 text-center space-y-4 shadow-xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">تعذر تحميل كشف دفتر الأستاذ للطباعة</h3>
            <p className="text-xs text-slate-400 mt-1">{error || 'الحساب غير موجود أو تم حذفه'}</p>
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

  const reportAccount = reportResult.account;
  const records = reportResult.entries;
  const finalBalance = reportResult.closing_balance;
  const totalDebit = records.reduce((sum, r) => sum + Number(r.debit || 0), 0);
  const totalCredit = records.reduce((sum, r) => sum + Number(r.credit || 0), 0);

  return (
    <div className="bg-slate-100 min-h-screen animate-fadeIn">
      <PrintActions customBackPath="/accounting" />

      {/* Main A4 Printable Sheet Content Chassis */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden">
        
        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle="كـشـف دفـتـر الأسـتـاذ الـعـام"
          documentNumber={`GL-${reportAccount.code}`}
          documentDate={new Date().toISOString().split('T')[0]}
          extraMeta={[
            { label: 'رقم الحساب', value: reportAccount.code },
            { label: 'طبيعة الحساب', value: reportAccount.nature === 'debit' ? 'مدين' : 'دائن' },
            { label: 'تاريخ بداية الفترة', value: reportResult.date_from },
            { label: 'تاريخ نهاية الفترة', value: reportResult.date_to }
          ]}
        />

        {/* Account Title Details Card */}
        <div className="border border-slate-200 rounded-2xl p-4.5 mb-8 text-right font-sans" dir="rtl">
          <span className="text-[10px] font-black text-slate-400 block mb-1">تفاصيل الحساب المستعلم عنه:</span>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-black text-slate-800">{reportAccount.name_ar} {reportAccount.name_en ? `(${reportAccount.name_en})` : ''}</h3>
              <p className="text-xs text-slate-500 mt-1">رمز الدليل: <span className="font-mono font-bold text-slate-800">{reportAccount.code}</span></p>
            </div>
            <div className="text-left">
              <span className="text-[10px] text-slate-400 block mb-0.5">الرصيد النهائي بالفترة</span>
              <span className="text-base font-black text-brand-blue font-mono">
                {formatNumberWithLatinDigits(Math.abs(finalBalance))} <span className="text-[10px] font-normal text-slate-500">{currentOrg?.currency_code || ''} ({finalBalance < 0 ? 'دائن' : 'مدين'})</span>
              </span>
            </div>
          </div>
        </div>

        {/* Lines table */}
        <div className="mb-8 font-sans animate-fadeIn" dir="rtl">
          <table className="w-full border-collapse text-[10px] sm:text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="py-2 px-2.5 border border-slate-200 font-black text-right w-16">التاريخ</th>
                <th className="py-2 px-2.5 border border-slate-200 font-black text-right w-20">رقم القيد</th>
                <th className="py-2 px-2.5 border border-slate-200 font-black text-right">البيان والملخص المالي</th>
                <th className="py-2 px-2.5 border border-slate-200 font-black text-center w-20">مدين (+)</th>
                <th className="py-2 px-2.5 border border-slate-200 font-black text-center w-20">دائن (-)</th>
                <th className="py-2 px-2.5 border border-slate-200 font-black text-center w-24">الرصيد المتحرك</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    لا توجد حركات قيود مرحلة على هذا الحساب خلال الفترة المحددة.
                  </td>
                </tr>
              ) : (
                records.map((rec, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2 px-2.5 border border-slate-200 text-slate-500 font-mono text-right">{formatArabicDateWithLatinDigits(rec.entry_date)}</td>
                    <td className="py-2 px-2.5 border border-slate-200 text-slate-900 font-bold font-mono text-right">{rec.entry_number}</td>
                    <td className="py-2 px-2.5 border border-slate-200 text-slate-800 text-right">
                      <span className="block font-bold">{rec.description}</span>
                    </td>
                    <td className="py-2 px-2.5 border border-slate-200 font-mono text-center">
                      {rec.debit > 0 ? formatNumberWithLatinDigits(rec.debit) : '-'}
                    </td>
                    <td className="py-2 px-2.5 border border-slate-200 font-mono text-center">
                      {rec.credit > 0 ? formatNumberWithLatinDigits(rec.credit) : '-'}
                    </td>
                    <td className="py-2 px-2.5 border border-slate-200 font-mono text-center font-bold">
                      <span className={rec.running_balance < 0 ? 'text-red-700' : 'text-emerald-700'}>
                        {formatNumberWithLatinDigits(Math.abs(rec.running_balance))} {rec.running_balance < 0 ? 'دائن' : 'مدين'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {records.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-black text-slate-900 border-t-2 border-slate-300">
                  <td colSpan={3} className="py-2 px-2.5 border border-slate-200 text-left">إجمالي الحركة الحالية والرصيد الموازن بالفترة:</td>
                  <td className="py-2 px-2.5 border border-slate-200 text-center font-mono">{formatNumberWithLatinDigits(totalDebit)}</td>
                  <td className="py-2 px-2.5 border border-slate-200 text-center font-mono">{formatNumberWithLatinDigits(totalCredit)}</td>
                  <td className="py-2 px-2.5 border border-slate-200 text-center font-mono font-black">
                    <span className={finalBalance < 0 ? 'text-red-700' : 'text-emerald-700'}>
                      {formatNumberWithLatinDigits(Math.abs(finalBalance))} {finalBalance < 0 ? 'دائن' : 'مدين'}
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Footer actions and stamp zones */}
        <PrintFooter description="تم توليد وتلخيص هذا الكشف تلقائياً وبشكل حصري من سجل القيود العامة المعتمدة لدفتر الأستاذ." />

      </div>
    </div>
  );
};
