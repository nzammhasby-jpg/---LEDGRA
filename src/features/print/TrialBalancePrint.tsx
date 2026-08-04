import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { reportsService, TrialBalanceResult } from '../../lib/reportsService';
import { accountingService } from '../../lib/accountingService';
import { getErrorMessage } from '../../lib/errors';
import { formatArabicDateWithLatinDigits, formatNumberWithLatinDigits } from '../../lib/formatters';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { AlertCircle, Loader2 } from 'lucide-react';

export const TrialBalancePrint: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { currentOrg } = useAuth();

  const fiscalYearId = searchParams.get('fiscalYearId') || searchParams.get('fiscal_year_id') || '';
  const startDate = searchParams.get('startDate') || searchParams.get('dateFrom') || searchParams.get('date_from') || '';
  const endDate = searchParams.get('endDate') || searchParams.get('dateTo') || searchParams.get('date_to') || '';
  const includeZeroAccounts = searchParams.get('includeZeroAccounts') === 'true';
  const includeParentAccounts = searchParams.get('includeParentAccounts') !== 'false'; // default true
  const excludeClosingEntries = searchParams.get('excludeClosingEntries') !== 'false'; // default true

  const [reportData, setReportData] = useState<TrialBalanceResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id) {
      loadTrialBalance();
    }
  }, [currentOrg?.id, fiscalYearId, startDate, endDate, includeZeroAccounts, includeParentAccounts, excludeClosingEntries]);

  const loadTrialBalance = async () => {
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

      const data = await reportsService.getTrialBalanceAdvanced(
        currentOrg!.id,
        fromDate,
        toDate,
        includeZeroAccounts,
        includeParentAccounts,
        excludeClosingEntries,
        activeFyId
      );
      setReportData(data);
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
          <p className="text-xs text-slate-500 font-bold">جاري تحميل وتلخيص ميزان المراجعة المحاسبي...</p>
        </div>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-6 text-center space-y-4 shadow-xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">تعذر تحميل تقرير ميزان المراجعة للطباعة</h3>
            <p className="text-xs text-slate-400 mt-1">{error || 'حدث خطأ غير متوقع أثناء استرجاع الأرصدة.'}</p>
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

  const getIndentStyle = (level?: number): string => {
    if (!level) return '';
    if (level === 2) return 'mr-3 border-r border-slate-200 pr-1.5';
    if (level === 3) return 'mr-6 border-r border-slate-200 pr-1.5';
    if (level >= 4) return 'mr-9 border-r border-slate-200 pr-1.5 text-slate-500';
    return '';
  };

  const getClassificationLabel = (classification: string): string => {
    switch (classification) {
      case 'assets': return 'الأصول';
      case 'liabilities': return 'الالـتـزامـات';
      case 'equity': return 'حـقـوق الـملـكـية';
      case 'revenue': return 'الإيرادات';
      case 'expenses': return 'المصروفات';
      default: return classification;
    }
  };

  return (
    <div className="bg-slate-100 min-h-screen animate-fadeIn">
      <PrintActions customBackPath="/accounting" />

      {/* Main A4 Printable Sheet Content Chassis */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden">
        
        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle="مـيـزان الـمـراجـعـة الـعـام"
          documentNumber={`TB-${startDate.replace(/-/g, '')}`}
          documentDate={new Date().toISOString().split('T')[0]}
          extraMeta={[
            { label: 'تاريخ بداية الفترة', value: startDate || 'غير محدد' },
            { label: 'تاريخ نهاية الفترة', value: endDate || 'غير محدد' },
            { label: 'حالة الميزان', value: reportData.totals.is_balanced ? 'متوازن ومطابق' : 'غير متوازن' },
            { label: 'تضمين الأصفار', value: includeZeroAccounts ? 'نعم' : 'لا' }
          ]}
        />

        {/* Balance Status Card */}
        <div className="border border-slate-200 rounded-2xl p-4.5 mb-6 text-right font-sans" dir="rtl">
          <span className="text-[10px] font-black text-slate-400 block mb-1">ملخص موازنة ميزان المراجعة للفترة:</span>
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-black text-slate-800">
                {reportData.totals.is_balanced ? (
                  <span className="text-emerald-700">✓ ميزان المراجعة متوازن ومطابق للمعايير المحاسبية.</span>
                ) : (
                  <span className="text-rose-600">⚠ تنبيه: يوجد فارق مالي غير مطابق في ميزان المراجعة.</span>
                )}
              </h3>
              <p className="text-xs text-slate-500 mt-1">العملة المعتمدة: <span className="font-bold text-slate-800">{currentOrg?.currency_code || ''}</span></p>
            </div>
            <div className="text-left">
              <span className="text-[10px] text-slate-400 block mb-0.5">قيمة الفارق المتبقي</span>
              <span className={`text-base font-black font-mono ${reportData.totals.is_balanced ? 'text-emerald-700' : 'text-rose-600'}`}>
                {formatNumberWithLatinDigits(reportData.totals.difference)} <span className="text-[10px] font-normal text-slate-500">{currentOrg?.currency_code || ''}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Lines table */}
        <div className="mb-8 font-sans animate-fadeIn" dir="rtl">
          <table className="w-full border-collapse text-[9px] sm:text-[10px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="py-2 px-1.5 border border-slate-200 font-black text-right w-16">الكود</th>
                <th className="py-2 px-1.5 border border-slate-200 font-black text-right">اسم الحساب</th>
                <th className="py-2 px-1.5 border border-slate-200 font-black text-right w-14">التصنيف</th>
                <th className="py-2 px-1.5 border border-slate-200 font-black text-center w-14">افتتاحي مدين</th>
                <th className="py-2 px-1.5 border border-slate-200 font-black text-center w-14">افتتاحي دائن</th>
                <th className="py-2 px-1.5 border border-slate-200 font-black text-center w-14">حركة مدين</th>
                <th className="py-2 px-1.5 border border-slate-200 font-black text-center w-14">حركة دائن</th>
                <th className="py-2 px-1.5 border border-slate-200 font-black text-center w-14">ختامي مدين</th>
                <th className="py-2 px-1.5 border border-slate-200 font-black text-center w-14">ختامي دائن</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {reportData.accounts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 italic">
                    لا توجد حسابات مسجلة للفترة المحددة.
                  </td>
                </tr>
              ) : (
                reportData.accounts.map((acc, idx) => {
                  const isParent = !acc.allow_direct_posting;
                  return (
                    <tr 
                      key={idx} 
                      className={`hover:bg-slate-50 ${isParent ? 'bg-slate-50 font-extrabold text-slate-900' : 'text-slate-600'}`}
                    >
                      <td className="py-1.5 px-1.5 border border-slate-200 font-mono font-bold text-right">
                        {acc.code}
                      </td>
                      <td className="py-1.5 px-1.5 border border-slate-200 text-right whitespace-nowrap">
                        <span className={`inline-block ${getIndentStyle(acc.level)}`}>
                          {acc.name_ar} {acc.name_en ? `(${acc.name_en})` : ''}
                        </span>
                      </td>
                      <td className="py-1.5 px-1.5 border border-slate-200 text-right text-slate-400">
                        {getClassificationLabel(acc.classification)}
                      </td>
                      <td className="py-1.5 px-1.5 border border-slate-200 font-mono text-left" style={{ direction: 'ltr' }}>
                        {acc.opening_debit > 0 ? formatNumberWithLatinDigits(acc.opening_debit) : '-'}
                      </td>
                      <td className="py-1.5 px-1.5 border border-slate-200 font-mono text-left" style={{ direction: 'ltr' }}>
                        {acc.opening_credit > 0 ? formatNumberWithLatinDigits(acc.opening_credit) : '-'}
                      </td>
                      <td className="py-1.5 px-1.5 border border-slate-200 font-mono text-left text-brand-blue" style={{ direction: 'ltr' }}>
                        {acc.period_debit > 0 ? formatNumberWithLatinDigits(acc.period_debit) : '-'}
                      </td>
                      <td className="py-1.5 px-1.5 border border-slate-200 font-mono text-left text-brand-blue" style={{ direction: 'ltr' }}>
                        {acc.period_credit > 0 ? formatNumberWithLatinDigits(acc.period_credit) : '-'}
                      </td>
                      <td className="py-1.5 px-1.5 border border-slate-200 font-mono text-left text-slate-950 font-black" style={{ direction: 'ltr' }}>
                        {acc.closing_debit > 0 ? formatNumberWithLatinDigits(acc.closing_debit) : '-'}
                      </td>
                      <td className="py-1.5 px-1.5 border border-slate-200 font-mono text-left text-slate-950 font-black" style={{ direction: 'ltr' }}>
                        {acc.closing_credit > 0 ? formatNumberWithLatinDigits(acc.closing_credit) : '-'}
                      </td>
                    </tr>
                  );
                })
              )}

              {/* Totals leaf-accounts row */}
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                <td className="py-2.5 px-1.5 border border-slate-200 text-right" colSpan={3}>
                  إجمالي مجاميع ميزان المراجعة بالفترة (الأرصدة والحركات):
                </td>
                <td className="py-2.5 px-1.5 border border-slate-200 font-mono text-left text-slate-950" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.totals.opening_debit)}
                </td>
                <td className="py-2.5 px-1.5 border border-slate-200 font-mono text-left text-slate-950" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.totals.opening_credit)}
                </td>
                <td className="py-2.5 px-1.5 border border-slate-200 font-mono text-left text-brand-blue" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.totals.period_debit)}
                </td>
                <td className="py-2.5 px-1.5 border border-slate-200 font-mono text-left text-brand-blue" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.totals.period_credit)}
                </td>
                <td className="py-2.5 px-1.5 border border-slate-200 font-mono text-left text-slate-950 font-black" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.totals.closing_debit)}
                </td>
                <td className="py-2.5 px-1.5 border border-slate-200 font-mono text-left text-slate-950 font-black" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.totals.closing_credit)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Signature Box */}
        <div className="mt-12 pt-12 border-t border-slate-200">
          <div className="grid grid-cols-3 gap-6 text-center text-xs">
            <div className="space-y-6">
              <span className="font-extrabold text-slate-600 block">المحاسب المسؤول</span>
              <div className="border-b border-dashed border-slate-300 w-32 mx-auto h-6"></div>
              <span className="text-[10px] text-slate-400">التوقيع: ..........................</span>
            </div>
            <div className="space-y-6">
              <span className="font-extrabold text-slate-600 block">المدير المالي</span>
              <div className="border-b border-dashed border-slate-300 w-32 mx-auto h-6"></div>
              <span className="text-[10px] text-slate-400">التوقيع: ..........................</span>
            </div>
            <div className="space-y-6">
              <span className="font-extrabold text-slate-600 block">الاعتماد والختم</span>
              <div className="border-b border-dashed border-slate-300 w-32 mx-auto h-6"></div>
              <span className="text-[10px] text-slate-400">التوقيع: ..........................</span>
            </div>
          </div>
        </div>

        {/* Printable Footer */}
        <PrintFooter />
      </div>
    </div>
  );
};
