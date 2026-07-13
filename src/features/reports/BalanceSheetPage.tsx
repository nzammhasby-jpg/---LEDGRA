import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { reportsService, BalanceSheetResult } from '../../lib/reportsService';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { getErrorMessage } from '../../lib/errors';
import { useTranslation } from '../../i18n/translations';
import { 
  Building, 
  BarChart, 
  ShieldCheck, 
  AlertTriangle, 
  Calendar, 
  RefreshCw, 
  AlertCircle,
  Printer,
  FolderLock,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  FolderClosed,
  FolderOpen
} from 'lucide-react';
import { ReportHeader } from './components/ReportHeader';
import { ReportActions } from './components/ReportActions';
import { ReportSignatures } from './components/ReportSignatures';
import { generateCSV, downloadCSV, generateReportFilename } from '../../lib/exportUtils';

const DICT = {
  ar: {
    title: 'قائمة المركز المالي (الميزانية العمومية)',
    subtitle: 'استعرض أرصدة أصول المنشأة والتزاماتها وحقوق الملكية الجارية للتحقق من توازن الميزانية ودقة أرصدتك الدفترية.',
    asOf: 'عرض الموقف المالي حتى تاريخ',
    comparisonMode: 'خيارات المقارنة',
    noComp: 'بدون مقارنة',
    prevYear: 'نفس التاريخ من العام الماضي',
    prevFiscalEnd: 'نهاية السنة المالية السابقة',
    customDate: 'تاريخ مخصص',
    compDateLabel: 'تاريخ المقارنة',
    submitBtn: 'عرض المركز المالي',
    todayBtn: 'اليوم',
    balancedAlert: 'معادلة القيد المزدوج متوازنة ومؤمنة تماماً',
    unbalancedAlert: 'معادلة المركز غير متوازنة (يوجد فروق أو حركات غير معلمة)',
    equationDesc: 'الأصول = الالتزامات + حقوق الملكية + صافي الأرباح الجارية',
    discrepancy: 'الفرق الدفتري:',
    colAccount: 'الحساب المالي',
    colCode: 'الكود',
    colCurrent: 'رصيد الفترة الحالية',
    colCompare: 'رصيد فترة المقارنة',
    colChange: 'مقدار التغير',
    colChangePercent: 'نسبة التغير',
    assetsSide: 'الجانب الأيمن: الأصول وموارد المنشأة (Assets)',
    liabilitiesSide: 'الجانب الأيسر: الالتزامات وحقوق الملكية (Liabilities & Equity)',
    liabilitiesSec: 'الالتزامات والخصوم (Liabilities)',
    equitySec: 'رأس المال والأرصدة الرأسمالية (Capital & Equity)',
    currentIncomeSec: 'صافي أرباح العام المترتبة الدفترية (Current Income YTD)',
    currentIncomeDesc: 'صافي أرباح السنة المالية الحالية (تقدير استرشادي)',
    totalAssets: 'إجمالي الأصول (A)',
    totalLiabilities: 'إجمالي الخصوم والالتزامات',
    totalEquity: 'إجمالي حقوق الملكية ورأس المال',
    totalLiabilitiesEquity: 'إجمالي الجانب الأيسر (الخصوم + حقوق الملكية)',
    assetsCard: '1. إجمالي الأصول (Assets)',
    liabilitiesCard: '2. إجمالي الخصوم والالتزامات',
    netIncomeCard: '3. صافي ربحية العام (YTD)',
    liabEquityCard: 'الخصوم + حقوق الملكية',
    collapseAll: 'طي الأقسام',
    expandAll: 'توسيع الأقسام',
    exportOptions: 'خيارات تصدير وطباعة المركز المالي:',
    loadingMsg: 'جاري تجميع أرصدة الميزانية العمومية والتحقق من التوازن الحركي...',
    emptyAssets: 'لا توجد أرصدة أصول مسجلة حتى تاريخه.',
    emptyLiab: 'لا توجد مطلوبات أو خصوم تجارية حتى تاريخه.',
    emptyEquity: 'لا يوجد رأس مال مسجل في دفاتر حقوق الملكية.',
    errorHeader: 'تعذر بناء المركز المالي',
    backBtn: 'رجوع للخلف',
    drilldownTooltip: 'اضغط لعرض تفاصيل الحركة لهذا الحساب في دفتر الأستاذ'
  },
  en: {
    title: 'Statement of Financial Position (Balance Sheet)',
    subtitle: 'Review asset, liability, and equity balances to verify the accounting equation and ensure ledger accuracy.',
    asOf: 'As of Date',
    comparisonMode: 'Comparison Mode',
    noComp: 'No Comparison',
    prevYear: 'Same Date Previous Year',
    prevFiscalEnd: 'End of Previous Fiscal Year',
    customDate: 'Custom Date',
    compDateLabel: 'Comparison Date',
    submitBtn: 'Generate Report',
    todayBtn: 'Today',
    balancedAlert: 'Double-entry accounting equation is fully balanced',
    unbalancedAlert: 'Accounting equation is unbalanced (discrepancy detected)',
    equationDesc: 'Assets = Liabilities + Equity + Current Period Net Income',
    discrepancy: 'Book Discrepancy:',
    colAccount: 'Financial Account',
    colCode: 'Code',
    colCurrent: 'Current Balance',
    colCompare: 'Comparison Balance',
    colChange: 'Change',
    colChangePercent: 'Change %',
    assetsSide: 'Right Side: Assets & Resources',
    liabilitiesSide: 'Left Side: Liabilities & Equity',
    liabilitiesSec: 'Liabilities',
    equitySec: 'Capital & Owner\'s Equity',
    currentIncomeSec: 'Current Period Net Income (Income Statement)',
    currentIncomeDesc: 'Current fiscal year net income (YTD projection)',
    totalAssets: 'Total Assets (A)',
    totalLiabilities: 'Total Liabilities',
    totalEquity: 'Total Capital & Equity',
    totalLiabilitiesEquity: 'Total Liabilities & Equity (B)',
    assetsCard: '1. Total Assets',
    liabilitiesCard: '2. Total Liabilities',
    netIncomeCard: '3. Net Income (YTD)',
    liabEquityCard: 'Liabilities + Equity',
    collapseAll: 'Collapse Sections',
    expandAll: 'Expand Sections',
    exportOptions: 'Export & Print Options:',
    loadingMsg: 'Compiling balance sheet and checking double-entry equation...',
    emptyAssets: 'No assets recorded as of this date.',
    emptyLiab: 'No liabilities recorded as of this date.',
    emptyEquity: 'No equity capital recorded.',
    errorHeader: 'Failed to generate Balance Sheet',
    backBtn: 'Go Back',
    drilldownTooltip: 'Click to view general ledger statement details'
  }
};

export const BalanceSheetPage: React.FC = () => {
  const { currentOrg } = useAuth();
  const { currentLanguage } = useTranslation();
  const isAr = currentLanguage === 'ar';
  const l = isAr ? DICT.ar : DICT.en;

  // Date and configuration states
  const [asOfDate, setAsOfDate] = useState<string>('');
  const [comparisonMode, setComparisonMode] = useState<'none' | 'previous_year' | 'last_fiscal_year_end' | 'custom'>('none');
  const [comparisonDate, setComparisonDate] = useState<string>('');

  // Section collapse states
  const [assetsExpanded, setAssetsExpanded] = useState<boolean>(true);
  const [liabilitiesExpanded, setLiabilitiesExpanded] = useState<boolean>(true);
  const [equityExpanded, setEquityExpanded] = useState<boolean>(true);

  // Data states
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<BalanceSheetResult | null>(null);
  const [compReportData, setCompReportData] = useState<BalanceSheetResult | null>(null);

  // Sync comparison date automatically based on mode
  useEffect(() => {
    if (!asOfDate) return;
    try {
      const parts = asOfDate.split('-');
      const year = parseInt(parts[0], 10);
      if (isNaN(year)) return;

      if (comparisonMode === 'previous_year') {
        const prevYear = new Date(asOfDate);
        prevYear.setFullYear(prevYear.getFullYear() - 1);
        setComparisonDate(prevYear.toISOString().split('T')[0]);
      } else if (comparisonMode === 'last_fiscal_year_end') {
        setComparisonDate(`${year - 1}-12-31`);
      } else if (comparisonMode === 'none') {
        setComparisonDate('');
      } else if (comparisonMode === 'custom' && !comparisonDate) {
        setComparisonDate(`${year - 1}-12-31`);
      }
    } catch (e) {
      console.error(e);
    }
  }, [asOfDate, comparisonMode]);

  // Initial load
  useEffect(() => {
    if (currentOrg) {
      const todayString = new Date().toISOString().split('T')[0];
      setAsOfDate(todayString);
      fetchReport(todayString, '', 'none');
    }
  }, [currentOrg]);

  const fetchReport = async (date = asOfDate, compDate = comparisonDate, mode = comparisonMode) => {
    if (!currentOrg || !date) return;
    setLoading(true);
    setError(null);
    try {
      const data = await reportsService.getBalanceSheet(currentOrg.id, date);
      setReportData(data);

      if (mode !== 'none' && compDate) {
        const compData = await reportsService.getBalanceSheet(currentOrg.id, compDate);
        setCompReportData(compData);
      } else {
        setCompReportData(null);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    const todayString = new Date().toISOString().split('T')[0];
    setAsOfDate(todayString);
    setComparisonMode('none');
    setComparisonDate('');
    fetchReport(todayString, '', 'none');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReport(asOfDate, comparisonDate, comparisonMode);
  };

  const toggleAllSections = (expand: boolean) => {
    setAssetsExpanded(expand);
    setLiabilitiesExpanded(expand);
    setEquityExpanded(expand);
  };

  const assetsList = reportData?.accounts_breakdown.filter(a => a.classification === 'assets') || [];
  const liabilitiesList = reportData?.accounts_breakdown.filter(a => a.classification === 'liabilities') || [];
  const equityList = reportData?.accounts_breakdown.filter(a => a.classification === 'equity') || [];

  // Comparison matching helpers
  const findPreviousAmount = (code: string) => {
    if (!compReportData) return 0;
    const match = compReportData.accounts_breakdown.find(a => a.account_code === code);
    return match ? match.amount : 0;
  };

  // Equation balance check with safety margin of 0.01
  const equationBalanced = reportData ? Math.abs(reportData.check_difference) <= 0.015 : true;

  const handleExportCSV = () => {
    if (!reportData) return;
    
    const currency = currentOrg?.currency_code || '';
    const hasComparison = comparisonMode !== 'none' && compReportData;

    const csvRows: any[][] = [
      ['Organization', currentOrg?.name_ar || currentOrg?.name_en || ''],
      ['Report', l.title],
      [l.asOf, asOfDate],
      ...(hasComparison ? [[l.compDateLabel, comparisonDate]] : []),
      ['Currency', currency],
      [l.discrepancy, reportData.check_difference],
      [],
      [`1. ${l.assetsSide}`],
      hasComparison 
        ? ['Code', 'Name', 'Current Balance', 'Comparison Balance', 'Variance', 'Variance %']
        : ['Code', 'Name', 'Balance'],
      ...assetsList.map(a => {
        if (hasComparison) {
          const prevAmt = findPreviousAmount(a.account_code);
          const diff = a.amount - prevAmt;
          const pct = prevAmt !== 0 ? ((diff / Math.abs(prevAmt)) * 100).toFixed(2) + '%' : '-';
          return [a.account_code, isAr ? a.account_name_ar : (a.account_name_en || a.account_name_ar), a.amount, prevAmt, diff, pct];
        }
        return [a.account_code, isAr ? a.account_name_ar : (a.account_name_en || a.account_name_ar), a.amount];
      }),
      hasComparison
        ? [l.totalAssets, '', reportData.assets, compReportData.assets, reportData.assets - compReportData.assets, compReportData.assets !== 0 ? (((reportData.assets - compReportData.assets) / Math.abs(compReportData.assets)) * 100).toFixed(2) + '%' : '-']
        : [l.totalAssets, '', reportData.assets],
      [],
      [`2. ${l.liabilitiesSec}`],
      hasComparison
        ? ['Code', 'Name', 'Current Balance', 'Comparison Balance', 'Variance', 'Variance %']
        : ['Code', 'Name', 'Balance'],
      ...liabilitiesList.map(item => {
        if (hasComparison) {
          const prevAmt = findPreviousAmount(item.account_code);
          const diff = item.amount - prevAmt;
          const pct = prevAmt !== 0 ? ((diff / Math.abs(prevAmt)) * 100).toFixed(2) + '%' : '-';
          return [item.account_code, isAr ? item.account_name_ar : (item.account_name_en || item.account_name_ar), item.amount, prevAmt, diff, pct];
        }
        return [item.account_code, isAr ? item.account_name_ar : (item.account_name_en || item.account_name_ar), item.amount];
      }),
      hasComparison
        ? [l.totalLiabilities, '', reportData.liabilities, compReportData.liabilities, reportData.liabilities - compReportData.liabilities, compReportData.liabilities !== 0 ? (((reportData.liabilities - compReportData.liabilities) / Math.abs(compReportData.liabilities)) * 100).toFixed(2) + '%' : '-']
        : [l.totalLiabilities, '', reportData.liabilities],
      [],
      [`3. ${l.equitySec}`],
      hasComparison
        ? ['Code', 'Name', 'Current Balance', 'Comparison Balance', 'Variance', 'Variance %']
        : ['Code', 'Name', 'Balance'],
      ...equityList.map(item => {
        if (hasComparison) {
          const prevAmt = findPreviousAmount(item.account_code);
          const diff = item.amount - prevAmt;
          const pct = prevAmt !== 0 ? ((diff / Math.abs(prevAmt)) * 100).toFixed(2) + '%' : '-';
          return [item.account_code, isAr ? item.account_name_ar : (item.account_name_en || item.account_name_ar), item.amount, prevAmt, diff, pct];
        }
        return [item.account_code, isAr ? item.account_name_ar : (item.account_name_en || item.account_name_ar), item.amount];
      }),
      hasComparison
        ? [l.currentIncomeSec, '', reportData.current_year_net_income, compReportData.current_year_net_income, reportData.current_year_net_income - compReportData.current_year_net_income, compReportData.current_year_net_income !== 0 ? (((reportData.current_year_net_income - compReportData.current_year_net_income) / Math.abs(compReportData.current_year_net_income)) * 100).toFixed(2) + '%' : '-']
        : [l.currentIncomeSec, '', reportData.current_year_net_income],
      hasComparison
        ? [l.totalEquity, '', reportData.equity + reportData.current_year_net_income, compReportData.equity + compReportData.current_year_net_income, (reportData.equity + reportData.current_year_net_income) - (compReportData.equity + compReportData.current_year_net_income), (compReportData.equity + compReportData.current_year_net_income) !== 0 ? ((((reportData.equity + reportData.current_year_net_income) - (compReportData.equity + compReportData.current_year_net_income)) / Math.abs(compReportData.equity + compReportData.current_year_net_income)) * 100).toFixed(2) + '%' : '-']
        : [l.totalEquity, '', reportData.equity + reportData.current_year_net_income],
      [],
      [
        l.totalLiabilitiesEquity, 
        '', 
        reportData.liabilities + reportData.equity + reportData.current_year_net_income,
        ...(hasComparison ? [
          compReportData.liabilities + compReportData.equity + compReportData.current_year_net_income,
          (reportData.liabilities + reportData.equity + reportData.current_year_net_income) - (compReportData.liabilities + compReportData.equity + compReportData.current_year_net_income),
          (compReportData.liabilities + compReportData.equity + compReportData.current_year_net_income) !== 0 ? ((((reportData.liabilities + reportData.equity + reportData.current_year_net_income) - (compReportData.liabilities + compReportData.equity + compReportData.current_year_net_income)) / Math.abs(compReportData.liabilities + compReportData.equity + compReportData.current_year_net_income)) * 100).toFixed(2) + '%' : '-'
        ] : [])
      ]
    ];

    const headers = [isAr ? 'بيان الميزانية العمومية' : 'Balance Sheet Statement', isAr ? 'القيم' : 'Balances'];
    const csvContent = generateCSV(headers, csvRows);
    const filename = generateReportFilename(isAr ? 'المركز_المالي' : 'Balance_Sheet', asOfDate);
    downloadCSV(csvContent, filename);
  };

  const handlePrint = () => {
    const params = new URLSearchParams({
      asOfDate,
      comparisonMode,
      comparisonDate
    });
    window.open(`#/print/balance-sheet?${params.toString()}`, '_blank');
  };

  // Safe navigation drill-down with preserved context
  const handleDrilldown = (accountId: string) => {
    if (!asOfDate) return;
    const year = asOfDate.split('-')[0];
    const dateFrom = `${year}-01-01`;
    window.location.hash = `#/reports?tab=ledger_report&accountId=${accountId}&dateFrom=${dateFrom}&dateTo=${asOfDate}`;
  };

  const renderComparisonCell = (currentVal: number, prevVal: number) => {
    if (comparisonMode === 'none' || !compReportData) return null;

    const diff = currentVal - prevVal;
    let percentChange: number | string = 0;
    if (prevVal === 0) {
      percentChange = currentVal === 0 ? 0 : '-';
    } else {
      percentChange = ((currentVal - prevVal) / Math.abs(prevVal)) * 100;
    }

    const isPositive = diff > 0.005;
    const isNegative = diff < -0.005;
    const colorClass = isPositive ? 'text-emerald-600' : isNegative ? 'text-rose-600' : 'text-slate-500';
    const sign = isPositive ? '+' : '';

    return (
      <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-1.5 font-mono text-[11px]" style={{ direction: 'ltr' }}>
        <span className="text-slate-400 font-medium" title={l.colCompare}>
          {formatNumberWithLatinDigits(prevVal)}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`${colorClass} font-extrabold`}>
            {sign}{formatNumberWithLatinDigits(diff)}
          </span>
          <span className={`px-1 rounded text-[9px] font-black ${
            isPositive ? 'bg-emerald-50 text-emerald-700' : isNegative ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'
          }`}>
            {typeof percentChange === 'number' ? `${sign}${formatNumberWithLatinDigits(percentChange, 1)}%` : percentChange}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 text-right font-sans" dir={isAr ? 'rtl' : 'ltr'} id="balance-sheet-page">
      
      {/* Title block */}
      <div className="space-y-1">
        <h3 className="text-lg font-black text-slate-800">{l.title}</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          {l.subtitle}
        </p>
      </div>

      {/* Filters form */}
      <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-wrap gap-4 items-end shadow-sm print:hidden">
        
        {/* As of Date */}
        <div className="space-y-1.5 shrink-0 w-full sm:w-auto">
          <label className="text-xs font-bold text-slate-500 block">{l.asOf}</label>
          <div className="relative">
            <input 
              type="date" 
              value={asOfDate} 
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 pr-9 outline-none focus:border-brand-blue"
              required
            />
            <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
          </div>
        </div>

        {/* Comparison Mode selector */}
        <div className="space-y-1.5 shrink-0 w-full sm:w-60">
          <label className="text-xs font-bold text-slate-500 block">{l.comparisonMode}</label>
          <select
            value={comparisonMode}
            onChange={(e) => setComparisonMode(e.target.value as any)}
            className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 outline-none focus:border-brand-blue"
          >
            <option value="none">{l.noComp}</option>
            <option value="previous_year">{l.prevYear}</option>
            <option value="last_fiscal_year_end">{l.prevFiscalEnd}</option>
            <option value="custom">{l.customDate}</option>
          </select>
        </div>

        {/* Comparison Date (Conditional on Custom mode) */}
        {comparisonMode === 'custom' && (
          <div className="space-y-1.5 shrink-0 w-full sm:w-auto">
            <label className="text-xs font-bold text-slate-500 block">{l.compDateLabel}</label>
            <div className="relative">
              <input 
                type="date" 
                value={comparisonDate} 
                onChange={(e) => setComparisonDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 pr-9 outline-none focus:border-brand-blue"
                required
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Submit & Reset Buttons */}
        <div className="flex gap-2 w-full sm:w-auto sm:mt-0">
          <button
            type="submit"
            disabled={loading}
            className="bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold px-5 py-2.25 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 flex-1 sm:flex-none"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>{l.submitBtn}</span>
          </button>

          <button
            type="button"
            onClick={handleResetFilters}
            className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold px-4 py-2.25 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            title="Reset to today"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{l.todayBtn}</span>
          </button>
        </div>
      </form>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl flex items-center gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="bg-white p-12 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-3 text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin text-brand-blue" />
          <span className="text-xs font-bold">{l.loadingMsg}</span>
        </div>
      )}

      {/* Report Actions Row */}
      {reportData && !loading && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 print:hidden">
          <span className="text-xs font-bold text-slate-500">{l.exportOptions}</span>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => toggleAllSections(true)}
              className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <span>{l.expandAll}</span>
            </button>
            <button
              onClick={() => toggleAllSections(false)}
              className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <span>{l.collapseAll}</span>
            </button>
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <ReportActions
              onPrint={handlePrint}
              onExportCSV={handleExportCSV}
              onRefresh={() => fetchReport()}
              loading={loading}
            />
          </div>
        </div>
      )}

      {/* Equation banner */}
      {reportData && !loading && (
        <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
          equationBalanced 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-850' 
            : 'bg-amber-50 border-amber-200 text-amber-850'
        }`}>
          <div className="flex items-center gap-3">
            {equationBalanced ? (
              <div className="bg-emerald-500/15 p-2 rounded-xl text-emerald-600 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
            ) : (
              <div className="bg-amber-500/15 p-2 rounded-xl text-amber-600 shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
            )}
            <div className="space-y-0.5">
              <h5 className="text-xs font-extrabold">
                {equationBalanced ? l.balancedAlert : l.unbalancedAlert}
              </h5>
              <p className="text-[10px] text-slate-550 leading-relaxed">
                {l.equationDesc}
              </p>
            </div>
          </div>
          <div className="font-sans text-xs font-bold text-slate-700 bg-white/60 px-3 py-1 rounded-lg border border-black/5 shrink-0 self-start sm:self-auto" style={{ direction: 'ltr' }}>
            {l.discrepancy} {formatNumberWithLatinDigits(reportData.check_difference)} {currentOrg?.currency_code || ''}
          </div>
        </div>
      )}

      {/* Report Layout Core */}
      {reportData && !loading && (
        <div className="space-y-6">
          
          <ReportHeader
            reportName={l.title}
            dateFrom=""
            dateTo={asOfDate}
          />

          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* KPI 1: Assets */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">{l.assetsCard}</span>
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold text-brand-blue font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.assets)}
                </span>
                <span className="bg-brand-blue/10 text-brand-blue text-[10px] px-2 py-0.5 rounded-full font-bold">{currentOrg?.currency_code || ''}</span>
              </div>
            </div>

            {/* KPI 2: Liabilities */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">{l.liabilitiesCard}</span>
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold text-red-600 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.liabilities)}
                </span>
                <span className="bg-red-500/10 text-red-600 text-[10px] px-2 py-0.5 rounded-full font-bold">{currentOrg?.currency_code || ''}</span>
              </div>
            </div>

            {/* KPI 3: Current net income */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">{l.netIncomeCard}</span>
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold text-emerald-600 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.current_year_net_income)}
                </span>
                <span className="bg-emerald-500/10 text-emerald-500 text-[10px] px-2 py-0.5 rounded-full font-bold">{currentOrg?.currency_code || ''}</span>
              </div>
            </div>

            {/* KPI 4: Liab + Equity */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">{l.liabEquityCard}</span>
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold text-slate-800 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.liabilities + reportData.equity + reportData.current_year_net_income)}
                </span>
                <span className="bg-slate-100 text-slate-650 text-[10px] px-2 py-0.5 rounded-full font-bold">{currentOrg?.currency_code || ''}</span>
              </div>
            </div>
          </div>

          {/* Balance Sheet Columns Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* SIDE A: ASSETS SECTION */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
              
              {/* Header Bar */}
              <div 
                onClick={() => setAssetsExpanded(!assetsExpanded)}
                className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between cursor-pointer select-none"
              >
                <span className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
                  <Building className="w-4 h-4 text-brand-blue" />
                  <span>{l.assetsSide}</span>
                  {assetsExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold text-brand-blue" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.assets)}
                  </span>
                  {comparisonMode !== 'none' && compReportData && (
                    <span className="text-[10px] font-mono font-bold text-slate-400" style={{ direction: 'ltr' }}>
                      (Prev: {formatNumberWithLatinDigits(compReportData.assets)})
                    </span>
                  )}
                </div>
              </div>

              {/* Assets Body */}
              {assetsExpanded && (
                <div className="p-5 flex-1 space-y-3">
                  
                  {/* Table headers */}
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-black text-slate-400 border-b border-slate-100 pb-2 select-none uppercase">
                    <div className="col-span-6 flex gap-2">
                      <span className="w-16 shrink-0">{l.colCode}</span>
                      <span>{l.colAccount}</span>
                    </div>
                    <div className={`col-span-6 flex justify-end gap-6 ${comparisonMode !== 'none' ? 'w-full' : ''}`}>
                      <span className="text-left font-sans">{l.colCurrent}</span>
                      {comparisonMode !== 'none' && (
                        <div className="flex gap-6 justify-end w-36 shrink-0">
                          <span className="w-14 text-left">{l.colCompare}</span>
                          <span className="w-16 text-left">{l.colChange}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {assetsList.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-8">{l.emptyAssets}</p>
                  ) : (
                    assetsList.map((item) => {
                      const prevAmount = findPreviousAmount(item.account_code);
                      return (
                        <div 
                          key={item.account_id} 
                          onClick={() => handleDrilldown(item.account_id)}
                          title={l.drilldownTooltip}
                          className="grid grid-cols-12 gap-2 items-center text-xs py-2.25 px-3 border-r-2 border-brand-blue/30 hover:bg-slate-50 rounded-md cursor-pointer group transition"
                        >
                          <div className="col-span-6 flex gap-2 items-center min-w-0">
                            <span className="font-mono text-slate-400 font-bold w-16 shrink-0 group-hover:text-brand-blue">[{item.account_code}]</span>
                            <span className="text-slate-700 font-bold truncate group-hover:text-brand-blue">
                              {isAr ? item.account_name_ar : (item.account_name_en || item.account_name_ar)}
                            </span>
                          </div>
                          <div className="col-span-6 flex justify-end items-center gap-6">
                            <span className="font-mono text-slate-800 font-bold group-hover:text-brand-blue" style={{ direction: 'ltr' }}>
                              {formatNumberWithLatinDigits(item.amount)}
                            </span>
                            {comparisonMode !== 'none' && compReportData && (
                              <div className="w-36 shrink-0 flex justify-end">
                                {renderComparisonCell(item.amount, prevAmount)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Assets Total Footer */}
              <div className="border-t border-slate-100 bg-slate-50/30 px-5 py-4 flex justify-between items-center text-xs font-black select-none">
                <span>{l.totalAssets}</span>
                <div className="flex flex-col items-end">
                  <span className="font-sans text-brand-blue text-sm" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.assets)} {currentOrg?.currency_code || ''}
                  </span>
                  {comparisonMode !== 'none' && compReportData && (
                    <div className="flex items-center gap-2 mt-1">
                      {renderComparisonCell(reportData.assets, compReportData.assets)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SIDE B: LIABILITIES & OWNER'S EQUITY SECTION */}
            <div className="space-y-6">
              
              {/* LIABILITIES SECTION */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                
                {/* Header Bar */}
                <div 
                  onClick={() => setLiabilitiesExpanded(!liabilitiesExpanded)}
                  className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between cursor-pointer select-none"
                >
                  <span className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
                    <FolderLock className="w-4 h-4 text-red-500" />
                    <span>{l.liabilitiesSec}</span>
                    {liabilitiesExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-red-600" style={{ direction: 'ltr' }}>
                      {formatNumberWithLatinDigits(reportData.liabilities)}
                    </span>
                    {comparisonMode !== 'none' && compReportData && (
                      <span className="text-[10px] font-mono font-bold text-slate-400" style={{ direction: 'ltr' }}>
                        (Prev: {formatNumberWithLatinDigits(compReportData.liabilities)})
                      </span>
                    )}
                  </div>
                </div>

                {/* Liabilities Body */}
                {liabilitiesExpanded && (
                  <div className="p-5 flex-1 space-y-3">
                    
                    {/* Table headers */}
                    <div className="grid grid-cols-12 gap-2 text-[10px] font-black text-slate-400 border-b border-slate-100 pb-2 select-none uppercase">
                      <div className="col-span-6 flex gap-2">
                        <span className="w-16 shrink-0">{l.colCode}</span>
                        <span>{l.colAccount}</span>
                      </div>
                      <div className="col-span-6 flex justify-end gap-6">
                        <span className="text-left font-sans">{l.colCurrent}</span>
                        {comparisonMode !== 'none' && (
                          <div className="flex gap-6 justify-end w-36 shrink-0">
                            <span className="w-14 text-left">{l.colCompare}</span>
                            <span className="w-16 text-left">{l.colChange}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {liabilitiesList.length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-6">{l.emptyLiab}</p>
                    ) : (
                      liabilitiesList.map((item) => {
                        const prevAmount = findPreviousAmount(item.account_code);
                        return (
                          <div 
                            key={item.account_id} 
                            onClick={() => handleDrilldown(item.account_id)}
                            title={l.drilldownTooltip}
                            className="grid grid-cols-12 gap-2 items-center text-xs py-2.25 px-3 border-r-2 border-red-300 hover:bg-slate-50 rounded-md cursor-pointer group transition"
                          >
                            <div className="col-span-6 flex gap-2 items-center min-w-0">
                              <span className="font-mono text-slate-400 font-bold w-16 shrink-0 group-hover:text-brand-blue">[{item.account_code}]</span>
                              <span className="text-slate-700 font-bold truncate group-hover:text-brand-blue">
                                {isAr ? item.account_name_ar : (item.account_name_en || item.account_name_ar)}
                              </span>
                            </div>
                            <div className="col-span-6 flex justify-end items-center gap-6">
                              <span className="font-mono text-slate-800 font-bold group-hover:text-brand-blue" style={{ direction: 'ltr' }}>
                                {formatNumberWithLatinDigits(item.amount)}
                              </span>
                              {comparisonMode !== 'none' && compReportData && (
                                <div className="w-36 shrink-0 flex justify-end">
                                  {renderComparisonCell(item.amount, prevAmount)}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Liabilities Total Footer */}
                <div className="border-t border-slate-100 bg-slate-50/30 px-5 py-4 flex justify-between items-center text-xs font-black select-none">
                  <span>{l.totalLiabilities}</span>
                  <div className="flex flex-col items-end">
                    <span className="font-sans text-red-600 text-sm" style={{ direction: 'ltr' }}>
                      {formatNumberWithLatinDigits(reportData.liabilities)} {currentOrg?.currency_code || ''}
                    </span>
                    {comparisonMode !== 'none' && compReportData && (
                      <div className="flex items-center gap-2 mt-1">
                        {renderComparisonCell(reportData.liabilities, compReportData.liabilities)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* EQUITY SECTION */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                
                {/* Header Bar */}
                <div 
                  onClick={() => setEquityExpanded(!equityExpanded)}
                  className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between cursor-pointer select-none"
                >
                  <span className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
                    <Building className="w-4 h-4 text-emerald-600" />
                    <span>{l.equitySec}</span>
                    {equityExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-slate-800" style={{ direction: 'ltr' }}>
                      {formatNumberWithLatinDigits(reportData.equity + reportData.current_year_net_income)}
                    </span>
                    {comparisonMode !== 'none' && compReportData && (
                      <span className="text-[10px] font-mono font-bold text-slate-400" style={{ direction: 'ltr' }}>
                        (Prev: {formatNumberWithLatinDigits(compReportData.equity + compReportData.current_year_net_income)})
                      </span>
                    )}
                  </div>
                </div>

                {/* Equity Body */}
                {equityExpanded && (
                  <div className="p-5 flex-1 space-y-4">
                    
                    {/* Table headers */}
                    <div className="grid grid-cols-12 gap-2 text-[10px] font-black text-slate-400 border-b border-slate-100 pb-2 select-none uppercase">
                      <div className="col-span-6 flex gap-2">
                        <span className="w-16 shrink-0">{l.colCode}</span>
                        <span>{l.colAccount}</span>
                      </div>
                      <div className="col-span-6 flex justify-end gap-6">
                        <span className="text-left font-sans">{l.colCurrent}</span>
                        {comparisonMode !== 'none' && (
                          <div className="flex gap-6 justify-end w-36 shrink-0">
                            <span className="w-14 text-left">{l.colCompare}</span>
                            <span className="w-16 text-left">{l.colChange}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {equityList.length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-4">{l.emptyEquity}</p>
                    ) : (
                      equityList.map((item) => {
                        const prevAmount = findPreviousAmount(item.account_code);
                        return (
                          <div 
                            key={item.account_id} 
                            onClick={() => handleDrilldown(item.account_id)}
                            title={l.drilldownTooltip}
                            className="grid grid-cols-12 gap-2 items-center text-xs py-2.25 px-3 border-r-2 border-amber-300 hover:bg-slate-50 rounded-md cursor-pointer group transition"
                          >
                            <div className="col-span-6 flex gap-2 items-center min-w-0">
                              <span className="font-mono text-slate-400 font-bold w-16 shrink-0 group-hover:text-brand-blue">[{item.account_code}]</span>
                              <span className="text-slate-700 font-bold truncate group-hover:text-brand-blue">
                                {isAr ? item.account_name_ar : (item.account_name_en || item.account_name_ar)}
                              </span>
                            </div>
                            <div className="col-span-6 flex justify-end items-center gap-6">
                              <span className="font-mono text-slate-800 font-bold group-hover:text-brand-blue" style={{ direction: 'ltr' }}>
                                {formatNumberWithLatinDigits(item.amount)}
                              </span>
                              {comparisonMode !== 'none' && compReportData && (
                                <div className="w-36 shrink-0 flex justify-end">
                                  {renderComparisonCell(item.amount, prevAmount)}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}

                    {/* Dynamic Current YTD Income item */}
                    <div className="grid grid-cols-12 gap-2 items-center text-xs py-2.5 px-3 border-r-2 border-emerald-400 bg-emerald-50/15 rounded-md hover:bg-emerald-50/25 transition">
                      <div className="col-span-6 flex gap-2 items-center min-w-0">
                        <span className="font-mono text-slate-400 font-bold w-16 shrink-0">[SYSTEM]</span>
                        <span className="text-slate-700 font-extrabold truncate">
                          {l.currentIncomeSec}
                        </span>
                      </div>
                      <div className="col-span-6 flex justify-end items-center gap-6">
                        <span className="font-mono text-emerald-700 font-black" style={{ direction: 'ltr' }}>
                          {formatNumberWithLatinDigits(reportData.current_year_net_income)}
                        </span>
                        {comparisonMode !== 'none' && compReportData && (
                          <div className="w-36 shrink-0 flex justify-end">
                            {renderComparisonCell(reportData.current_year_net_income, compReportData.current_year_net_income)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Equity Total Footer */}
                <div className="border-t border-slate-100 bg-slate-50/30 px-5 py-4 flex justify-between items-center text-xs font-black select-none">
                  <span>{l.totalEquity}</span>
                  <div className="flex flex-col items-end">
                    <span className="font-sans text-slate-800 text-sm" style={{ direction: 'ltr' }}>
                      {formatNumberWithLatinDigits(reportData.equity + reportData.current_year_net_income)} {currentOrg?.currency_code || ''}
                    </span>
                    {comparisonMode !== 'none' && compReportData && (
                      <div className="flex items-center gap-2 mt-1">
                        {renderComparisonCell(reportData.equity + reportData.current_year_net_income, compReportData.equity + compReportData.current_year_net_income)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* TOTAL COMPONENT SUM (B) */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 flex justify-between items-center text-xs font-black select-none shadow-md">
                <span>{l.totalLiabilitiesEquity}</span>
                <div className="flex flex-col items-end">
                  <span className="font-mono text-brand-turquoise text-sm" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.liabilities + reportData.equity + reportData.current_year_net_income)} {currentOrg?.currency_code || ''}
                  </span>
                  {comparisonMode !== 'none' && compReportData && (
                    <div className="flex items-center gap-2 mt-1 select-none font-mono">
                      {renderComparisonCell(
                        reportData.liabilities + reportData.equity + reportData.current_year_net_income,
                        compReportData.liabilities + compReportData.equity + compReportData.current_year_net_income
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Standard Signatures component */}
          <ReportSignatures />
        </div>
      )}

    </div>
  );
};
