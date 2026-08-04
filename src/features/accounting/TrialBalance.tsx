import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { reportsService, TrialBalanceResult, TrialBalanceAccount } from '../../lib/reportsService';
import { accountingService } from '../../lib/accountingService';
import { FiscalYear } from '../../types';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { getErrorMessage } from '../../lib/errors';
import { 
  FileCheck, 
  Search, 
  Calendar, 
  X,
  TrendingDown,
  Info,
  SlidersHorizontal,
  ChevronRight,
  Activity,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  FolderTree,
  Eye,
  RotateCcw
} from 'lucide-react';

interface TrialBalanceProps {
  onViewLedger?: (accountId: string, fiscalYearId: string, dateFrom: string, dateTo: string) => void;
}

export const TrialBalance: React.FC<TrialBalanceProps> = ({ onViewLedger }) => {
  const { currentOrg } = useAuth();
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);

  // Filters
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [includeZeroAccounts, setIncludeZeroAccounts] = useState<boolean>(false);
  const [includeParentAccounts, setIncludeParentAccounts] = useState<boolean>(true);
  const [excludeClosingEntries, setExcludeClosingEntries] = useState<boolean>(true);

  // Results
  const [reportData, setReportData] = useState<TrialBalanceResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [baselineLoading, setBaselineLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg) {
      loadBaseline();
    }
  }, [currentOrg]);

  const loadBaseline = async () => {
    setBaselineLoading(true);
    setError(null);
    try {
      const yearsData = await accountingService.getFiscalYears(currentOrg!.id);
      setFiscalYears(yearsData);

      const activeY = yearsData.find(y => y.is_current) || yearsData[0];
      if (activeY) {
        setSelectedYearId(activeY.id);
        setStartDate(activeY.start_date);
        setEndDate(activeY.end_date);
        
        const results = await reportsService.getTrialBalanceAdvanced(
          currentOrg!.id,
          activeY.start_date,
          activeY.end_date,
          includeZeroAccounts,
          includeParentAccounts,
          excludeClosingEntries,
          activeY.id
        );
        setReportData(results);
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setBaselineLoading(false);
    }
  };

  useEffect(() => {
    if (selectedYearId && fiscalYears.length > 0) {
      const fy = fiscalYears.find(y => y.id === selectedYearId);
      if (fy) {
        setStartDate(fy.start_date);
        setEndDate(fy.end_date);
      }
    }
  }, [selectedYearId, fiscalYears]);

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      setError("تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const results = await reportsService.getTrialBalanceAdvanced(
        currentOrg.id,
        startDate,
        endDate,
        includeZeroAccounts,
        includeParentAccounts,
        excludeClosingEntries,
        selectedYearId
      );
      setReportData(results);
    } catch (err: any) {
      setError(getErrorMessage(err));
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    const activeY = fiscalYears.find(y => y.is_current) || fiscalYears[0];
    setSelectedYearId(activeY ? activeY.id : '');
    setStartDate(activeY ? activeY.start_date : '');
    setEndDate(activeY ? activeY.end_date : '');
    setIncludeZeroAccounts(false);
    setIncludeParentAccounts(true);
    setExcludeClosingEntries(true);
    setError(null);
    
    if (currentOrg && activeY) {
      setLoading(true);
      reportsService.getTrialBalanceAdvanced(
        currentOrg.id,
        activeY.start_date,
        activeY.end_date,
        false,
        true,
        true,
        activeY.id
      ).then(res => {
        setReportData(res);
      }).catch(err => {
        setError(getErrorMessage(err));
      }).finally(() => {
        setLoading(false);
      });
    }
  };

  const getClassificationLabel = (classification: string): string => {
    switch (classification) {
      case 'assets': return 'الأصول';
      case 'liabilities': return 'الالتزامات';
      case 'equity': return 'حقوق الملكية';
      case 'revenue': return 'الإيرادات';
      case 'expenses': return 'المصروفات';
      default: return classification;
    }
  };

  const getIndentStyle = (level?: number): string => {
    if (!level) return '';
    if (level === 2) return 'mr-4 border-r-2 border-slate-100 pr-2';
    if (level === 3) return 'mr-8 border-r-2 border-slate-100 pr-2';
    if (level >= 4) return 'mr-12 border-r-2 border-slate-100 pr-2 text-slate-500';
    return '';
  };

  return (
    <div className="space-y-6 animate-fadeIn text-right" dir="rtl">
      {/* Header section */}
      <div className="border-b border-slate-100 pb-5">
        <h2 className="text-xl font-bold text-slate-800">ميزان المراجعة الأولي (Trial Balance)</h2>
        <p className="text-xs text-slate-500 mt-1">عرض أرصدة وحركات دليل الحسابات للمنشأة والتأكد التام من موازنة المعادلة المحاسبية للأطراف المدينة والدائنة في دفاتر القيد.</p>
      </div>

      {/* error alerts */}
      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-2xl p-4 text-xs font-semibold text-red-800">
          <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Filter panel */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
        <form onSubmit={handleGenerateReport} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Year select */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-500">تحديد السنة المالية</label>
            <select
              value={selectedYearId}
              onChange={(e) => setSelectedYearId(e.target.value)}
              className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none hover:border-slate-300 transition-all font-sans"
            >
              <option value="">كل السنوات</option>
              {fiscalYears.map(fy => (
                <option key={fy.id} value={fy.id}>{fy.name} {fy.is_current ? '(الحالية)' : ''}</option>
              ))}
            </select>
          </div>

          {/* Date boundaries */}
          <div className="flex flex-col gap-1.5 col-span-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500">من تاريخ</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none font-mono"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500">إلى تاريخ</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none font-mono"
                  required
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer transition-all"
            >
              إعادة تهيئة
            </button>
            <button
              type="submit"
              disabled={loading || baselineLoading}
              className="bg-brand-blue text-white font-bold text-xs rounded-xl px-6 py-2.5 cursor-pointer hover:bg-opacity-95 transition-all text-center min-w-[130px]"
            >
              {loading ? 'جاري الاستدعاء...' : 'توليد الميزان'}
            </button>
          </div>
        </form>

        {/* Checkbox Options */}
        <div className="pt-2 border-t border-slate-50 flex flex-wrap gap-6 text-[11px] text-slate-600">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={includeZeroAccounts} 
              onChange={(e) => setIncludeZeroAccounts(e.target.checked)}
              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue h-3.5 w-3.5"
            />
            <span className="font-semibold">تضمين الحسابات ذات الأرصدة الصفرية</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={includeParentAccounts} 
              onChange={(e) => setIncludeParentAccounts(e.target.checked)}
              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue h-3.5 w-3.5"
            />
            <span className="font-semibold">عرض الحسابات الرئيسية التجميعية</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={excludeClosingEntries} 
              onChange={(e) => setExcludeClosingEntries(e.target.checked)}
              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue h-3.5 w-3.5"
            />
            <span className="font-semibold">استبعاد حركات الإقفال السنوية (YEAR-CLOSE)</span>
          </label>
        </div>
      </div>

      {/* Action buttons row for report */}
      {reportData && !loading && !baselineLoading && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 print:hidden">
          <span className="text-xs font-bold text-slate-500 font-sans">خيارات تصدير وطباعة ميزان المراجعة الحسابي:</span>
          <button
            type="button"
            onClick={() => {
              window.open(`/#/print/trial-balance?startDate=${startDate}&endDate=${endDate}&includeZeroAccounts=${includeZeroAccounts}&includeParentAccounts=${includeParentAccounts}&excludeClosingEntries=${excludeClosingEntries}`, '_blank');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition cursor-pointer font-sans"
          >
            <span>طباعة ميزان المراجعة (A4)</span>
          </button>
        </div>
      )}

      {loading || baselineLoading ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center">
          <div className="w-8 h-8 border-4 border-slate-100 border-t-brand-blue rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-400 mt-4">جاري جمع وحصر أرصدة الدليل الدفتري، وتصنيف الأصول والالتزامات للقيود المرحلة...</p>
        </div>
      ) : !reportData ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center text-slate-400 flex flex-col items-center justify-center">
          <FileCheck className="w-12 h-12 text-slate-200 mb-3" />
          <span className="font-bold text-sm text-slate-500">لا توجد بيانات حسابات مستخرجة لميزان المراجعة</span>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">تأكد ترحيل القيود اليومية الأولى لتتمكن من استخلاص المجاميع والتوازنات في هذا الجدول الكشفي.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Dashboard info overview card */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Opening Balances */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 relative">
              <span className="text-[10px] text-slate-400 font-bold block">إجمالي الرصيد الافتتاحي</span>
              <div className="grid grid-cols-2 gap-2 text-left mt-1.5 font-sans" style={{ direction: 'ltr' }}>
                <div>
                  <span className="text-[9px] text-slate-400 block font-semibold text-right">مدين</span>
                  <span className="text-sm font-extrabold text-slate-800 font-sans block text-right">
                    {formatNumberWithLatinDigits(reportData.totals.opening_debit)}
                  </span>
                </div>
                <div className="border-l border-slate-100 pl-2">
                  <span className="text-[9px] text-slate-400 block font-semibold text-right">دائن</span>
                  <span className="text-sm font-extrabold text-slate-800 font-sans block text-right">
                    {formatNumberWithLatinDigits(reportData.totals.opening_credit)}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Period Movements */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 relative">
              <span className="text-[10px] text-slate-400 font-bold block">إجمالي حركات الفترة</span>
              <div className="grid grid-cols-2 gap-2 text-left mt-1.5 font-sans" style={{ direction: 'ltr' }}>
                <div>
                  <span className="text-[9px] text-slate-400 block font-semibold text-right">مدين</span>
                  <span className="text-sm font-extrabold text-brand-blue font-sans block text-right">
                    {formatNumberWithLatinDigits(reportData.totals.period_debit)}
                  </span>
                </div>
                <div className="border-l border-slate-100 pl-2">
                  <span className="text-[9px] text-slate-400 block font-semibold text-right">دائن</span>
                  <span className="text-sm font-extrabold text-brand-blue font-sans block text-right">
                    {formatNumberWithLatinDigits(reportData.totals.period_credit)}
                  </span>
                </div>
              </div>
            </div>

            {/* Closing Balances */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 relative">
              <span className="text-[10px] text-slate-400 font-bold block">إجمالي الرصيد الختامي</span>
              <div className="grid grid-cols-2 gap-2 text-left mt-1.5 font-sans" style={{ direction: 'ltr' }}>
                <div>
                  <span className="text-[9px] text-slate-400 block font-semibold text-right">مدين</span>
                  <span className="text-sm font-extrabold text-slate-900 font-sans block text-right">
                    {formatNumberWithLatinDigits(reportData.totals.closing_debit)}
                  </span>
                </div>
                <div className="border-l border-slate-100 pl-2">
                  <span className="text-[9px] text-slate-400 block font-semibold text-right">دائن</span>
                  <span className="text-sm font-extrabold text-slate-900 font-sans block text-right">
                    {formatNumberWithLatinDigits(reportData.totals.closing_credit)}
                  </span>
                </div>
              </div>
            </div>

            {/* Balance status */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 flex flex-col justify-between" id="card-balance-status-acct">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block">حالة توازن ميزان المراجعة</span>
                <div className="flex items-center gap-1.5 mt-1">
                  {reportData.totals.is_balanced ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                      <span className="text-xs font-black text-emerald-700">الميزان متوازن ومطابق</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                      <span className="text-xs font-black text-rose-600">غير متوازن (فارق مطروح)</span>
                    </>
                  )}
                </div>
              </div>

              {!reportData.totals.is_balanced && (
                <div className="text-[10px] text-rose-500 font-extrabold mt-2 flex items-center justify-between border-t border-rose-50 pt-1.5 font-sans" style={{ direction: 'ltr' }}>
                  <span>DIFF: {formatNumberWithLatinDigits(reportData.totals.difference)} {currentOrg?.currency_code || ''}</span>
                </div>
              )}
            </div>
          </div>

          {/* Table display */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 tracking-wider">
                    <th className="px-4 py-3.5">كود الحساب</th>
                    <th className="px-4 py-3.5">اسم وتصنيف الحساب</th>
                    <th className="px-4 py-3.5">التصنيف</th>
                    <th className="px-4 py-3.5 text-left">افتتاحي مدين</th>
                    <th className="px-4 py-3.5 text-left">افتتاحي دائن</th>
                    <th className="px-4 py-3.5 text-left">حركة مدين</th>
                    <th className="px-4 py-3.5 text-left">حركة دائن</th>
                    <th className="px-4 py-3.5 text-left">ختامي مدين</th>
                    <th className="px-4 py-3.5 text-left">ختامي دائن</th>
                    {onViewLedger && <th className="px-4 py-3.5 text-center">الإجراءات</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {reportData.accounts.map((row) => {
                    const isParent = !row.allow_direct_posting;
                    return (
                      <tr 
                        key={row.code} 
                        className={`transition-colors ${
                          isParent 
                            ? 'bg-slate-50/80 font-extrabold text-slate-900 border-r-3 border-slate-300' 
                            : 'hover:bg-slate-50/40 text-slate-600'
                        }`}
                      >
                        {/* Code */}
                        <td className="px-4 py-3.5 font-mono select-all text-slate-900 text-[11px]" dir="ltr">
                          {row.code}
                        </td>
                        {/* Name */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-block ${getIndentStyle(row.level)}`}>
                            {row.name_ar}
                            {row.name_en && (
                              <span className="text-[10px] text-slate-400 mr-1.5 font-normal">
                                ({row.name_en})
                              </span>
                            )}
                          </span>
                        </td>
                        {/* Classification */}
                        <td className="px-4 py-3.5 text-slate-500 text-[10px]">
                          {getClassificationLabel(row.classification)}
                        </td>
                        
                        {/* Opening Debit */}
                        <td className={`px-4 py-3.5 text-left font-mono ${isParent ? 'font-bold text-slate-800' : 'text-slate-500'}`} style={{ direction: 'ltr' }}>
                          {row.opening_debit > 0 ? formatNumberWithLatinDigits(row.opening_debit) : '-'}
                        </td>

                        {/* Opening Credit */}
                        <td className={`px-4 py-3.5 text-left font-mono ${isParent ? 'font-bold text-slate-800' : 'text-slate-500'}`} style={{ direction: 'ltr' }}>
                          {row.opening_credit > 0 ? formatNumberWithLatinDigits(row.opening_credit) : '-'}
                        </td>

                        {/* Movement Debit */}
                        <td className="px-4 py-3.5 text-left font-mono text-brand-blue font-bold" style={{ direction: 'ltr' }}>
                          {row.period_debit > 0 ? formatNumberWithLatinDigits(row.period_debit) : '-'}
                        </td>

                        {/* Movement Credit */}
                        <td className="px-4 py-3.5 text-left font-mono text-brand-blue font-bold" style={{ direction: 'ltr' }}>
                          {row.period_credit > 0 ? formatNumberWithLatinDigits(row.period_credit) : '-'}
                        </td>

                        {/* Closing Debit */}
                        <td className="px-4 py-3.5 text-left font-mono text-slate-900 font-extrabold" style={{ direction: 'ltr' }}>
                          {row.closing_debit > 0 ? formatNumberWithLatinDigits(row.closing_debit) : '-'}
                        </td>

                        {/* Closing Credit */}
                        <td className="px-4 py-3.5 text-left font-mono text-slate-900 font-extrabold" style={{ direction: 'ltr' }}>
                          {row.closing_credit > 0 ? formatNumberWithLatinDigits(row.closing_credit) : '-'}
                        </td>

                        {/* Actions for Leaf Accounts */}
                        {onViewLedger && (
                          <td className="px-4 py-3.5 text-center">
                            {!isParent && (
                              <button
                                type="button"
                                onClick={() => onViewLedger(row.account_id, selectedYearId, startDate, endDate)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.25 bg-brand-blue/5 hover:bg-brand-blue/15 text-brand-blue rounded-lg text-[10px] font-black transition cursor-pointer"
                                title="عرض كشف دفتر الأستاذ التفصيلي"
                              >
                                <Eye className="w-3 h-3" />
                                <span>دفتر الأستاذ</span>
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
