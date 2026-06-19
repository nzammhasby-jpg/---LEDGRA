import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { journalService } from '../../lib/journalService';
import { accountingService } from '../../lib/accountingService';
import { Account, FiscalYear } from '../../types';
import { formatArabicDateWithLatinDigits, formatNumberWithLatinDigits } from '../../lib/formatters';
import { getErrorMessage } from '../../lib/errors';
import { 
  BookOpen, 
  Search, 
  Calendar, 
  X, 
  FileSpreadsheet, 
  AlertCircle,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft
} from 'lucide-react';

interface LedgerRecord {
  entry_number: string;
  entry_date: string;
  entry_description: string;
  line_description: string | null;
  debit: number;
  credit: number;
  running_balance: number;
}

export const LedgerReport: React.FC = () => {
  const { currentOrg } = useAuth();
  
  // Baseline static databases
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);

  // Filtering form values
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Loaded report data
  const [reportAccount, setReportAccount] = useState<any | null>(null);
  const [records, setRecords] = useState<LedgerRecord[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [baselineLoading, setBaselineLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg) {
      loadBaselineOptions();
    }
  }, [currentOrg]);

  const loadBaselineOptions = async () => {
    setBaselineLoading(true);
    setError(null);
    try {
      const [accountsData, yearsData] = await Promise.all([
        accountingService.getAccounts(currentOrg!.id),
        accountingService.getFiscalYears(currentOrg!.id)
      ]);

      setAccounts(accountsData);
      setFiscalYears(yearsData);

      // Set default selected financial year to active one
      const activeY = yearsData.find(y => y.is_current) || yearsData[0];
      if (activeY) {
        setSelectedYearId(activeY.id);
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setBaselineLoading(false);
    }
  };

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    if (!selectedAccountId) {
      setError('يرجى تحديد حساب فرعي ترحيلي لاستخراج كشف دفتر الأستاذ الخاص به.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const report = await journalService.getLedgerReport(currentOrg.id, selectedAccountId, {
        fiscalYearId: selectedYearId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined
      });

      setReportAccount(report.account);
      setRecords(report.records);
    } catch (err: any) {
      setError(getErrorMessage(err));
      setReportAccount(null);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setSelectedAccountId('');
    const activeY = fiscalYears.find(y => y.is_current) || fiscalYears[0];
    setSelectedYearId(activeY ? activeY.id : '');
    setStartDate('');
    setEndDate('');
    setRecords([]);
    setReportAccount(null);
    setError(null);
  };

  // Only direct leaf accounts allow posting and ledger records
  const leafAccounts = accounts.filter(a => a.allow_direct_posting && a.is_active);

  // Compute sums
  const totalDebit = records.reduce((sum, r) => sum + r.debit, 0);
  const totalCredit = records.reduce((sum, r) => sum + r.credit, 0);
  const finalBalance = records.length > 0 ? records[records.length - 1].running_balance : 0;

  return (
    <div className="space-y-6">
      {/* Page simple Header */}
      <div className="border-b border-slate-100 pb-5">
        <h2 className="text-xl font-bold text-slate-800 font-sans">كشف دفتر الأستاذ العام (General Ledger)</h2>
        <p className="text-xs text-slate-500 mt-1">تتبع حركة الحسابات التفصيلية المتوازنة والمرحلة مع عرض الأرصدة المتحركة وتوزيع المدين والدائن في أي فترة زمنية.</p>
      </div>

      {/* Messaging systems */}
      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-2xl p-4 text-xs font-semibold text-red-800 animate-fadeIn">
          <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Filter Sidebar & Form */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <form onSubmit={handleGenerateReport} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
            {/* Account dropdown */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-500">الحساب المحاسبي المطلوب *</label>
              <select
                required
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none"
              >
                <option value="">-- اختر الحساب المطلوب تفصيله --</option>
                {leafAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name_ar} {acc.name_en ? `(${acc.name_en})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Fiscal Year dropdown */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500">السنة المالية</label>
              <select
                value={selectedYearId}
                onChange={(e) => setSelectedYearId(e.target.value)}
                className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none"
              >
                <option value="">كل السنوات</option>
                {fiscalYears.map(fy => (
                  <option key={fy.id} value={fy.id}>{fy.name} {fy.is_current ? '(الحالية)' : ''}</option>
                ))}
              </select>
            </div>

            {/* From & To Date ranges */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500">من تاريخ</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-800 outline-none font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500">إلى تاريخ</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-800 outline-none font-mono"
                />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 border-t border-slate-50 pt-3">
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer"
            >
              إعادة تهيئة
            </button>
            <button
              type="submit"
              disabled={loading || baselineLoading}
              className="bg-brand-blue text-white font-bold text-xs rounded-xl px-5 py-2 cursor-pointer hover:bg-opacity-95 text-center min-w-[120px] transition-colors"
            >
              {loading ? 'جاري الاستخراج...' : 'توليد الكشف'}
            </button>
          </div>
        </form>
      </div>

      {/* Main ledger visualization board */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center">
          <div className="w-8 h-8 border-4 border-slate-100 border-t-brand-blue rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-400 mt-4">جاري تجميع وترتيب قيود الحساب واستخلاص الرصيد المتحرك...</p>
        </div>
      ) : !reportAccount ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center text-slate-400 flex flex-col items-center justify-center">
          <BookOpen className="w-12 h-12 text-slate-200 mb-3" />
          <span className="font-bold text-sm text-slate-500">الرجاء اختيار الحساب واستخراج دفتر الأستاذ</span>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">قم بتحديد اسم الحساب تلو الأخر وضوابط التصفية من لوحة التحكم العلوية للحصول على الأرصدة والعمليات الكاملة.</p>
        </div>
      ) : (
        <div className="space-y-6 animate-fadeIn">
          {/* Quick Metrics of chosen ledger account */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 relative">
              <span className="text-[10px] text-slate-400 font-bold block">رمز الحساب واسمه</span>
              <span className="text-base font-bold text-slate-900 block mt-1.5">{reportAccount.name_ar}</span>
              <span className="font-mono text-xs text-brand-blue block mt-1 select-all" dir="ltr">{reportAccount.code}</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 relative">
              <span className="text-[10px] text-slate-400 font-bold block">إجمالي الحركة المدينة (+)</span>
              <span className="text-xl font-bold text-emerald-600 block mt-1.5 font-mono tabular-nums leading-none">
                {formatNumberWithLatinDigits(totalDebit)}
              </span>
              <div className="text-[10px] text-slate-400 font-bold mt-1 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                <span>عمليات مدينة مرحلة وصافية</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 relative">
              <span className="text-[10px] text-slate-400 font-bold block">إجمالي الحركة الدائنة (-)</span>
              <span className="text-xl font-bold text-red-500 block mt-1.5 font-mono tabular-nums leading-none">
                {formatNumberWithLatinDigits(totalCredit)}
              </span>
              <div className="text-[10px] text-slate-400 font-bold mt-1 flex items-center gap-1">
                <ArrowDownLeft className="w-3.5 h-3.5 text-red-500" />
                <span>عمليات دائنة مرحلة وصافية</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 relative">
              <span className="text-[10px] text-slate-400 font-bold block">الرصيد المالي النهائي (بالريال)</span>
              <span className="text-xl font-bold text-slate-950 block mt-1.5 font-mono tabular-nums leading-none">
                {formatNumberWithLatinDigits(Math.abs(finalBalance))}
              </span>
              <div className="text-[10px] text-slate-400 font-bold mt-1 block">
                طبيعة الحساب: <span className="text-slate-800 font-extrabold">{reportAccount.nature === 'debit' ? 'مدين' : 'دائن'}</span>
                {finalBalance !== 0 && (
                  <span className={`mr-1 px-1.5 py-0.5 rounded-md font-bold text-[9px] ${
                    finalBalance > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                  }`}>
                    {finalBalance > 0 ? 'رصيد طبيعي' : 'رصيد عكسي'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Ledger Table List of entries */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">بيانات كشف الحركة المفصلة</span>
              <span className="text-[10px] text-slate-400 font-bold">عدد القيود: <span className="font-mono text-slate-600 font-black">{records.length}</span></span>
            </div>

            {records.length === 0 ? (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center">
                <TrendingUp className="w-10 h-10 text-slate-200 mb-3" />
                <span className="font-bold text-xs text-slate-600">لا يوجد حركات قيود مرحلة على هذا الحساب</span>
                <p className="text-[10px] text-slate-400 mt-1 max-w-sm">لم تسجل أي قيود يومية مرحلة ومؤثرة مالياً على هذا الحساب ضمن الفترة المالية المحددة.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 tracking-wider">
                      <th className="px-4 py-3">تاريخ القيد</th>
                      <th className="px-4 py-3">رقم القيد اليومي</th>
                      <th className="px-4 py-3">البيان والملخص العام</th>
                      <th className="px-4 py-3">شرح البند التفصيلي</th>
                      <th className="px-4 py-3 text-center w-28">مدين (+)</th>
                      <th className="px-4 py-3 text-center w-28">دائن (-)</th>
                      <th className="px-4 py-3 text-center w-32">الرصيد المتحرك</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {records.map((rec, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3.5 font-mono text-slate-500">
                          {formatArabicDateWithLatinDigits(rec.entry_date)}
                        </td>
                        <td className="px-4 py-3.5 font-bold font-mono text-slate-900 select-all" dir="ltr">
                          {rec.entry_number}
                        </td>
                        <td className="px-4 py-3.5 max-w-xs truncate text-[11px] text-slate-800 font-bold">
                          {rec.entry_description}
                        </td>
                        <td className="px-4 py-3.5 max-w-xs truncate text-[11px] text-slate-500">
                          {rec.line_description || <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-4 py-3.5 font-bold font-mono text-center text-slate-900 tabular-nums text-left" dir="ltr">
                          {rec.debit > 0 ? formatNumberWithLatinDigits(rec.debit) : <span className="text-slate-300 font-normal">-</span>}
                        </td>
                        <td className="px-4 py-3.5 font-bold font-mono text-center text-slate-900 tabular-nums text-left" dir="ltr">
                          {rec.credit > 0 ? formatNumberWithLatinDigits(rec.credit) : <span className="text-slate-300 font-normal">-</span>}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-center tabular-nums text-slate-950 font-black text-left" dir="ltr">
                          <span className={rec.running_balance < 0 ? 'text-red-650' : 'text-emerald-700'}>
                            {formatNumberWithLatinDigits(Math.abs(rec.running_balance))} {rec.running_balance < 0 ? 'دائن' : 'مدين'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
