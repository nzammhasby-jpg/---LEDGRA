import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { reportsService, TrialBalanceResult, TrialBalanceAccount } from '../../lib/reportsService';
import { accountingService } from '../../lib/accountingService';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { getErrorMessage } from '../../lib/errors';
import { FiscalYear } from '../../types';
import { 
  Calendar, 
  RefreshCw, 
  AlertCircle,
  FileText,
  CheckCircle,
  AlertTriangle,
  FolderTree,
  Eye,
  EyeOff,
  RotateCcw
} from 'lucide-react';
import { ReportHeader } from './components/ReportHeader';
import { ReportActions } from './components/ReportActions';
import { ReportSignatures } from './components/ReportSignatures';
import { generateCSV, downloadCSV, generateReportFilename } from '../../lib/exportUtils';

export const TrialBalancePage: React.FC = () => {
  const { currentOrg } = useAuth();
  
  // Date and filter states
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [includeZeroAccounts, setIncludeZeroAccounts] = useState<boolean>(false);
  const [includeParentAccounts, setIncludeParentAccounts] = useState<boolean>(true);
  const [excludeClosingEntries, setExcludeClosingEntries] = useState<boolean>(true);
  
  // States
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<TrialBalanceResult | null>(null);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);

  const handleExportCSV = () => {
    if (!reportData) return;
    
    const currency = currentOrg?.currency_code || '';
    const csvRows: any[][] = [
      ['منشأة', currentOrg?.name_ar || currentOrg?.name_en || ''],
      ['التقرير', 'تقرير ميزان المراجعة المطور'],
      ['الفترة من', dateFrom],
      ['الفترة إلى', dateTo],
      ['العملة', currency],
      ['استبعاد قيود الإقفال', excludeClosingEntries ? 'نعم' : 'لا'],
      ['حالة الميزان', reportData.totals.is_balanced ? 'متوازن' : `غير متوازن - فرق: ${reportData.totals.difference}`],
      [],
      ['رمز الحساب', 'اسم الحساب', 'مدين افتتاحي', 'دائن افتتاحي', 'حركة مدين', 'حركة دائن', 'مدين ختامي', 'دائن ختامي', 'نوع الحساب'],
      ...reportData.accounts.map(acc => [
        acc.code,
        acc.name_ar,
        acc.opening_debit,
        acc.opening_credit,
        acc.period_debit,
        acc.period_credit,
        acc.closing_debit,
        acc.closing_credit,
        !acc.allow_direct_posting ? 'حساب رئيسي' : 'حساب فرعي'
      ]),
      [],
      [
        'إجمالي مجاميع ميزان المراجعة',
        '',
        reportData.totals.opening_debit,
        reportData.totals.opening_credit,
        reportData.totals.period_debit,
        reportData.totals.period_credit,
        reportData.totals.closing_debit,
        reportData.totals.closing_credit,
        ''
      ]
    ];

    const headers = ['ميزان المراجعة المطور', 'التفاصيل'];
    const csvContent = generateCSV(headers, csvRows);
    const filename = generateReportFilename('ميزان_المراجعة', dateFrom, dateTo);
    downloadCSV(csvContent, filename);
  };

  useEffect(() => {
    if (currentOrg) {
      initDateRange();
    }
  }, [currentOrg]);

  const initDateRange = async () => {
    try {
      setLoading(true);
      setError(null);
      const years = await accountingService.getFiscalYears(currentOrg!.id);
      setFiscalYears(years);
      
      const activeYear = years.find(y => y.is_current) || years[0];
      if (activeYear) {
        setDateFrom(activeYear.start_date);
        setDateTo(activeYear.end_date);
        fetchReport(activeYear.start_date, activeYear.end_date);
      } else {
        const cy = new Date().getFullYear();
        const start = `${cy}-01-01`;
        const end = `${cy}-12-31`;
        setDateFrom(start);
        setDateTo(end);
        fetchReport(start, end);
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  const fetchReport = async (from = dateFrom, to = dateTo) => {
    if (!currentOrg || !from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const data = await reportsService.getTrialBalanceAdvanced(
        currentOrg.id,
        from,
        to,
        includeZeroAccounts,
        includeParentAccounts,
        excludeClosingEntries
      );
      setReportData(data);
    } catch (err) {
      const errMsg = getErrorMessage(err);
      if (errMsg.includes('permission') || errMsg.includes('غير مصرح')) {
        setError('ليس لديك صلاحية لعرض هذا التقرير المالي الحساس.');
      } else {
        setError('تعذر تحميل ميزان المراجعة المطور. الرجاء التحقق من الصلاحيات.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReport();
  };

  const handleResetFilters = async () => {
    setIncludeZeroAccounts(false);
    setIncludeParentAccounts(true);
    setExcludeClosingEntries(true);
    await initDateRange();
  };

  const getClassificationLabel = (classification: string) => {
    switch (classification) {
      case 'assets': return 'أصول';
      case 'liabilities': return 'التزامات';
      case 'equity': return 'حقوق ملكية';
      case 'revenue': return 'إيرادات';
      case 'expenses': return 'مصروفات';
      default: return classification;
    }
  };

  const getIndentStyle = (level: number) => {
    // Return padding right corresponding to depth level
    switch (level) {
      case 1: return 'pr-2 font-black border-r-3 border-brand-blue';
      case 2: return 'pr-5 font-bold';
      case 3: return 'pr-8 font-medium text-slate-700';
      case 4: return 'pr-11 text-slate-600';
      default: return 'pr-14 text-slate-600';
    }
  };

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl" id="trial-balance-page">
      
      {/* Filters form */}
      <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 print:hidden">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1.5 shrink-0">
            <label className="text-xs font-bold text-slate-500 block">تاريخ البدء</label>
            <div className="relative">
              <input 
                type="date" 
                value={dateFrom} 
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 pr-9 outline-none focus:border-brand-blue"
                required
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            </div>
          </div>

          <div className="space-y-1.5 shrink-0">
            <label className="text-xs font-bold text-slate-500 block">تاريخ الانتهاء</label>
            <div className="relative">
              <input 
                type="date" 
                value={dateTo} 
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 pr-9 outline-none focus:border-brand-blue"
                required
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold px-5 py-2.25 rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              id="btn-refresh-trial-balance"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>تحديث التقرير</span>
            </button>

            <button
              type="button"
              onClick={handleResetFilters}
              disabled={loading}
              className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold px-4 py-2.25 rounded-xl transition flex items-center gap-2 cursor-pointer"
              title="إعادة ضبط الفلاتر لقيمها الافتراضية"
            >
              <RotateCcw className="w-4 h-4" />
              <span>إعادة ضبط</span>
            </button>
          </div>
        </div>

        {/* Filter switches/options */}
        <div className="pt-2 border-t border-slate-50 flex flex-wrap gap-6 text-xs text-slate-600">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={includeZeroAccounts} 
              onChange={(e) => setIncludeZeroAccounts(e.target.checked)}
              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue h-3.5 w-3.5"
            />
            <span className="font-semibold">إظهار الحسابات الصفرية الخاملة</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={includeParentAccounts} 
              onChange={(e) => setIncludeParentAccounts(e.target.checked)}
              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue h-3.5 w-3.5"
            />
            <span className="font-semibold">تجميع وتوطين أرصدة الأبناء (Parent Rollup)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={excludeClosingEntries} 
              onChange={(e) => setExcludeClosingEntries(e.target.checked)}
              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue h-3.5 w-3.5"
            />
            <span className="font-semibold">استبعاد قيود الإقفال السنوية (YEAR-CLOSE)</span>
          </label>
        </div>
      </form>

      {/* Action buttons row for report */}
      {reportData && !loading && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 print:hidden">
          <span className="text-xs font-bold text-slate-500">خيارات تصدير وطباعة ميزان المراجعة:</span>
          <ReportActions
            onPrint={() => window.print()}
            onExportCSV={handleExportCSV}
            onRefresh={() => fetchReport()}
            loading={loading}
          />
        </div>
      )}

      {error && (
        <div className="bg-amber-50 border border-amber-100 text-amber-800 p-4 rounded-xl flex items-start gap-2.5 text-xs">
          <AlertCircle className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" />
          <span className="font-bold leading-relaxed">{error}</span>
        </div>
      )}

      {loading && !reportData && (
        <div className="bg-white p-12 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-3 text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin text-brand-blue" />
          <span className="text-xs font-bold">جاري توليد ميزان المراجعة وتجميع شجرة الحسابات...</span>
        </div>
      )}

      {reportData && !loading && (
        <>
          <ReportHeader
            reportName="تقرير ميزان المراجعة المحاسبي"
            dateFrom={dateFrom}
            dateTo={dateTo}
            excludeClosingEntries={excludeClosingEntries}
            yearStatus={fiscalYears.find(y => y.start_date === dateFrom && y.end_date === dateTo)?.status}
          />

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Opening Balances */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-1.5" id="card-opening-total">
              <span className="text-[10px] font-bold text-slate-400 block">إجمالي الرصيد الافتتاحي الفتري</span>
              <div className="grid grid-cols-2 gap-2 text-left">
                <div>
                  <span className="text-[9px] text-slate-400 block font-semibold">مدين</span>
                  <span className="text-sm font-extrabold text-slate-800 font-sans block" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.totals.opening_debit)}
                  </span>
                </div>
                <div className="border-r border-slate-100 pr-2">
                  <span className="text-[9px] text-slate-400 block font-semibold">دائن</span>
                  <span className="text-sm font-extrabold text-slate-800 font-sans block" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.totals.opening_credit)}
                  </span>
                </div>
              </div>
            </div>

            {/* Period Movements */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-1.5" id="card-period-total">
              <span className="text-[10px] font-bold text-slate-400 block">إجمالي حركات الفترة الحالية</span>
              <div className="grid grid-cols-2 gap-2 text-left">
                <div>
                  <span className="text-[9px] text-slate-400 block font-semibold">مدين</span>
                  <span className="text-sm font-extrabold text-blue-600 font-sans block" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.totals.period_debit)}
                  </span>
                </div>
                <div className="border-r border-slate-100 pr-2">
                  <span className="text-[9px] text-slate-400 block font-semibold">دائن</span>
                  <span className="text-sm font-extrabold text-blue-600 font-sans block" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.totals.period_credit)}
                  </span>
                </div>
              </div>
            </div>

            {/* Closing Balances */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-1.5" id="card-closing-total">
              <span className="text-[10px] font-bold text-slate-400 block">إجمالي الرصيد الختامي للفترة</span>
              <div className="grid grid-cols-2 gap-2 text-left">
                <div>
                  <span className="text-[9px] text-slate-400 block font-semibold">مدين</span>
                  <span className="text-sm font-extrabold text-slate-800 font-sans block" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.totals.closing_debit)}
                  </span>
                </div>
                <div className="border-r border-slate-100 pr-2">
                  <span className="text-[9px] text-slate-400 block font-semibold">دائن</span>
                  <span className="text-sm font-extrabold text-slate-800 font-sans block" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.totals.closing_credit)}
                  </span>
                </div>
              </div>
            </div>

            {/* Balance status */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between" id="card-balance-status">
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

          {/* Trial Balance Detail Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden" id="trial-balance-table-container">
            <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-brand-blue" />
                <h3 className="text-xs font-extrabold text-slate-800">تفاصيل بنود الحسابات ومجاميع ميزان المراجعة</h3>
              </div>
              <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2.5 py-0.5 rounded-full">
                {reportData.accounts.length} حساب مالي نشط
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/30 text-slate-500 font-bold">
                    <th className="py-3 px-4 w-28">الكود</th>
                    <th className="py-3 px-4">اسم الحساب</th>
                    <th className="py-3 px-4 w-20">التصنيف</th>
                    <th className="py-3 px-4 w-28 text-left">افتتاحي مدين</th>
                    <th className="py-3 px-4 w-28 text-left">افتتاحي دائن</th>
                    <th className="py-3 px-4 w-28 text-left">حركة مدين</th>
                    <th className="py-3 px-4 w-28 text-left">حركة دائن</th>
                    <th className="py-3 px-4 w-28 text-left">ختامي مدين</th>
                    <th className="py-3 px-4 w-28 text-left">ختامي دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.accounts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-xs text-slate-400 italic">
                        لا توجد حسابات تنطبق عليها معايير التصفية المختارة.
                      </td>
                    </tr>
                  ) : (
                    reportData.accounts.map((account) => {
                      const isParent = !account.allow_direct_posting;
                      return (
                        <tr 
                          key={account.account_id} 
                          className={`border-b border-slate-50 transition-colors ${
                            isParent 
                              ? 'bg-slate-50/80 font-extrabold text-slate-900 border-r-3 border-slate-300' 
                              : 'hover:bg-slate-50/40 text-slate-600'
                          }`}
                        >
                          {/* Code */}
                          <td className="py-3 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                            {account.code}
                          </td>
                          
                          {/* Name with hierarchical indent */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`inline-block ${getIndentStyle(account.level)}`}>
                              {account.name_ar}
                              {account.name_en && (
                                <span className="text-[10px] text-slate-400 mr-1.5 font-normal">
                                  ({account.name_en})
                                </span>
                              )}
                            </span>
                          </td>

                          {/* Classification */}
                          <td className="py-3 px-4 whitespace-nowrap text-slate-400 font-semibold">
                            {getClassificationLabel(account.classification)}
                          </td>

                          {/* Opening Debit */}
                          <td className={`py-3 px-4 text-left font-mono ${isParent ? 'font-bold text-slate-800' : 'text-slate-500'}`} style={{ direction: 'ltr' }}>
                            {account.opening_debit > 0 ? formatNumberWithLatinDigits(account.opening_debit) : '-'}
                          </td>

                          {/* Opening Credit */}
                          <td className={`py-3 px-4 text-left font-mono ${isParent ? 'font-bold text-slate-800' : 'text-slate-500'}`} style={{ direction: 'ltr' }}>
                            {account.opening_credit > 0 ? formatNumberWithLatinDigits(account.opening_credit) : '-'}
                          </td>

                          {/* Movement Debit */}
                          <td className="py-3 px-4 text-left font-mono text-blue-600 font-bold" style={{ direction: 'ltr' }}>
                            {account.period_debit > 0 ? formatNumberWithLatinDigits(account.period_debit) : '-'}
                          </td>

                          {/* Movement Credit */}
                          <td className="py-3 px-4 text-left font-mono text-blue-600 font-bold" style={{ direction: 'ltr' }}>
                            {account.period_credit > 0 ? formatNumberWithLatinDigits(account.period_credit) : '-'}
                          </td>

                          {/* Closing Debit */}
                          <td className="py-3 px-4 text-left font-mono text-slate-900 font-extrabold" style={{ direction: 'ltr' }}>
                            {account.closing_debit > 0 ? formatNumberWithLatinDigits(account.closing_debit) : '-'}
                          </td>

                          {/* Closing Credit */}
                          <td className="py-3 px-4 text-left font-mono text-slate-900 font-extrabold" style={{ direction: 'ltr' }}>
                            {account.closing_credit > 0 ? formatNumberWithLatinDigits(account.closing_credit) : '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <ReportSignatures />
        </>
      )}

    </div>
  );
};
