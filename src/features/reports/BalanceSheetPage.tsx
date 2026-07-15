import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { reportsService, AdvancedBalanceSheetResult, AdvancedBalanceSheetBreakdown } from '../../lib/reportsService';
import { accountingService } from '../../lib/accountingService';
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
  FolderLock,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Sliders,
  Settings
} from 'lucide-react';
import { ReportHeader } from './components/ReportHeader';
import { ReportActions } from './components/ReportActions';
import { ReportSignatures } from './components/ReportSignatures';
import { generateCSV, downloadCSV, generateReportFilename } from '../../lib/exportUtils';
import { FiscalYear } from '../../types';

const DICT = {
  ar: {
    title: 'قائمة المركز المالي (الميزانية العمومية)',
    subtitle: 'استعرض أرصدة أصول المنشأة والتزاماتها وحقوق الملكية الجارية للتحقق من توازن الميزانية ودقة أرصدتك الدفترية وفق المعايير المالية.',
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
    assetsSide: 'الأصول وموارد المنشأة (Assets)',
    liabilitiesSide: 'الالتزامات وحقوق الملكية (Liabilities & Equity)',
    liabilitiesSec: 'الالتزامات والخصوم (Liabilities)',
    equitySec: 'رأس المال والأرصدة الرأسمالية (Capital & Equity)',
    currentIncomeSec: 'صافي أرباح العام المترتبة الدفترية (Current Income YTD)',
    currentIncomeDesc: 'صافي أرباح السنة المالية الحالية',
    totalAssets: 'إجمالي الأصول (A)',
    totalLiabilities: 'إجمالي الخصوم والالتزامات',
    totalEquity: 'إجمالي حقوق الملكية ورأس المال',
    totalLiabilitiesEquity: 'إجمالي الالتزامات وحقوق الملكية (B)',
    assetsCard: '1. إجمالي الأصول',
    liabilitiesCard: '2. إجمالي الالتزامات',
    netIncomeCard: '3. صافي ربحية العام',
    liabEquityCard: 'الالتزامات + حقوق الملكية',
    collapseAll: 'طي الأقسام',
    expandAll: 'توسيع الأقسام',
    exportOptions: 'خيارات تصدير وطباعة المركز المالي:',
    loadingMsg: 'جاري تجميع أرصدة الميزانية العمومية والتحقق من التوازن الحركي...',
    emptyAssets: 'لا توجد أرصدة أصول مسجلة حتى تاريخه.',
    emptyLiab: 'لا توجد مطلوبات أو خصوم تجارية حتى تاريخه.',
    emptyEquity: 'لا يوجد رأس مال مسجل في دفاتر حقوق الملكية.',
    errorHeader: 'تعذر بناء المركز المالي',
    backBtn: 'رجوع للخلف',
    drilldownTooltip: 'اضغط لعرض تفاصيل الحركة لهذا الحساب في دفتر الأستاذ وتعديل تصنيفه',
    
    currentAssetSec: 'الأصول المتداولة',
    nonCurrentAssetSec: 'الأصول غير المتداولة',
    unclassifiedAssetsSec: 'أصول غير مصنفة',
    currentLiabilitySec: 'الالتزامات المتداولة',
    nonCurrentLiabilitySec: 'الالتزامات غير المتداولة',
    unclassifiedLiabilitiesSec: 'التزامات غير مصنفة',
    subtotal: 'إجمالي فرعي'
  },
  en: {
    title: 'Statement of Financial Position (Balance Sheet)',
    subtitle: 'Review asset, liability, and equity balances to verify the accounting equation and ensure ledger accuracy according to financial standards.',
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
    assetsSide: 'Assets & Resources',
    liabilitiesSide: 'Liabilities & Equity',
    liabilitiesSec: 'Liabilities',
    equitySec: 'Capital & Owner\'s Equity',
    currentIncomeSec: 'Current Period Net Income (Income Statement)',
    currentIncomeDesc: 'Current fiscal year net income',
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
    emptyLiab: 'No liabilities or payables recorded.',
    emptyEquity: 'No equity capital recorded.',
    errorHeader: 'Failed to generate Balance Sheet',
    backBtn: 'Go Back',
    drilldownTooltip: 'Click to view general ledger statement details and modify its classification',
    
    currentAssetSec: 'Current Assets',
    nonCurrentAssetSec: 'Non-Current Assets',
    unclassifiedAssetsSec: 'Unclassified Assets',
    currentLiabilitySec: 'Current Liabilities',
    nonCurrentLiabilitySec: 'Non-Current Liabilities',
    unclassifiedLiabilitiesSec: 'Unclassified Liabilities',
    subtotal: 'Subtotal'
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

  // Fiscal Years cache
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);

  // Section collapse states
  const [assetsExpanded, setAssetsExpanded] = useState<boolean>(true);
  const [liabilitiesExpanded, setLiabilitiesExpanded] = useState<boolean>(true);
  const [equityExpanded, setEquityExpanded] = useState<boolean>(true);

  // Data states
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<AdvancedBalanceSheetResult | null>(null);

  // Interactive Popup / Dropdown State for manual classification
  const [selectedAccount, setSelectedAccount] = useState<AdvancedBalanceSheetBreakdown | null>(null);

  // Sync comparison date automatically using fiscal year dates from database
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
        setComparisonDate(getPreviousFiscalYearEnd(asOfDate));
      } else if (comparisonMode === 'none') {
        setComparisonDate('');
      } else if (comparisonMode === 'custom' && !comparisonDate) {
        setComparisonDate(getPreviousFiscalYearEnd(asOfDate));
      }
    } catch (e) {
      console.error(e);
    }
  }, [asOfDate, comparisonMode, fiscalYears]);

  // Load fiscal years on mount or organization change
  useEffect(() => {
    if (currentOrg) {
      accountingService.getFiscalYears(currentOrg.id)
        .then(setFiscalYears)
        .catch(err => console.error('Error fetching fiscal years:', err));
    }
  }, [currentOrg]);

  // Initial load
  useEffect(() => {
    if (currentOrg) {
      const todayString = new Date().toISOString().split('T')[0];
      setAsOfDate(todayString);
      fetchReport(todayString, '', 'none');
    }
  }, [currentOrg]);

  // Determine standard fiscal year end registered in DB
  const getPreviousFiscalYearEnd = (dateStr: string) => {
    if (!dateStr || fiscalYears.length === 0) {
      const year = parseInt(dateStr.split('-')[0], 10);
      return `${year - 1}-12-31`;
    }
    
    // Find containing year
    const currentYear = fiscalYears.find(y => dateStr >= y.start_date && dateStr <= y.end_date);
    if (currentYear) {
      // Find the closest previous registered year
      const prevYear = fiscalYears
        .filter(y => y.end_date < currentYear.start_date)
        .sort((a, b) => b.end_date.localeCompare(a.end_date))[0];
      if (prevYear) {
        return prevYear.end_date;
      }
    } else {
      const prevYear = fiscalYears
        .filter(y => y.end_date < dateStr)
        .sort((a, b) => b.end_date.localeCompare(a.end_date))[0];
      if (prevYear) {
        return prevYear.end_date;
      }
    }

    const year = parseInt(dateStr.split('-')[0], 10);
    return `${year - 1}-12-31`;
  };

  // Determine standard fiscal year start registered in DB
  const getFiscalYearStart = (dateStr: string) => {
    if (!dateStr || fiscalYears.length === 0) {
      const year = dateStr.split('-')[0];
      return `${year}-01-01`;
    }
    const currentYear = fiscalYears.find(y => dateStr >= y.start_date && dateStr <= y.end_date);
    return currentYear ? currentYear.start_date : `${dateStr.split('-')[0]}-01-01`;
  };

  const fetchReport = async (date = asOfDate, compDate = comparisonDate, mode = comparisonMode) => {
    if (!currentOrg || !date) return;
    setLoading(true);
    setError(null);
    try {
      const targetCompDate = (mode !== 'none' && compDate) ? compDate : null;
      const data = await reportsService.getAdvancedBalanceSheet(currentOrg.id, date, targetCompDate);
      setReportData(data);
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

  // Safe navigation drill-down with dynamic fiscal year starting dates
  const handleDrilldown = (accountId: string) => {
    if (!asOfDate) return;
    const dateFrom = getFiscalYearStart(asOfDate);
    window.location.hash = `#/reports?tab=ledger_report&accountId=${accountId}&dateFrom=${dateFrom}&dateTo=${asOfDate}`;
  };

  // Update classification directly from the page
  const handleUpdateClassification = async (accountId: string, section: 'current_asset' | 'non_current_asset' | 'current_liability' | 'non_current_liability' | 'equity' | null) => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      await accountingService.updateAccountBalanceSheetSection(currentOrg.id, accountId, section);
      await fetchReport(asOfDate, comparisonDate, comparisonMode);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Group accounts
  const accountsList = reportData?.accounts || [];
  const assetsCurrent = accountsList.filter(a => a.classification === 'assets' && a.balance_sheet_section === 'current_asset');
  const assetsNonCurrent = accountsList.filter(a => a.classification === 'assets' && a.balance_sheet_section === 'non_current_asset');
  const assetsUnclassified = accountsList.filter(a => a.classification === 'assets' && a.balance_sheet_section === null);

  const liabilitiesCurrent = accountsList.filter(a => a.classification === 'liabilities' && a.balance_sheet_section === 'current_liability');
  const liabilitiesNonCurrent = accountsList.filter(a => a.classification === 'liabilities' && a.balance_sheet_section === 'non_current_liability');
  const liabilitiesUnclassified = accountsList.filter(a => a.classification === 'liabilities' && a.balance_sheet_section === null);

  const equityList = accountsList.filter(a => a.classification === 'equity');

  // Equation balance check with strict tolerance of 0.01
  const equationBalanced = reportData ? Math.abs(reportData.main_period.check_difference) <= 0.01 : true;
  const hasComparison = comparisonMode !== 'none' && reportData?.comparison_period;

  const handleExportCSV = () => {
    if (!reportData) return;
    
    const currency = currentOrg?.currency_code || '';
    const compData = reportData.comparison_period;

    const csvRows: any[][] = [
      ['Organization', currentOrg?.name_ar || currentOrg?.name_en || ''],
      ['Report', l.title],
      [l.asOf, asOfDate],
      ...(compData ? [[l.compDateLabel, comparisonDate]] : []),
      ['Currency', currency],
      [l.discrepancy, reportData.main_period.check_difference],
      [],
      [`1. ${l.assetsSide}`],
      compData 
        ? ['Code', 'Name', 'Section', 'Current Balance', 'Comparison Balance', 'Variance', 'Variance %']
        : ['Code', 'Name', 'Section', 'Balance'],
      ...assetsCurrent.map(a => [a.account_code, isAr ? a.account_name_ar : (a.account_name_en || a.account_name_ar), l.currentAssetSec, a.amount, ...(compData ? [a.comparison_amount, a.amount - a.comparison_amount, a.comparison_amount !== 0 ? (((a.amount - a.comparison_amount) / Math.abs(a.comparison_amount)) * 100).toFixed(2) + '%' : '-'] : [])]),
      ...assetsNonCurrent.map(a => [a.account_code, isAr ? a.account_name_ar : (a.account_name_en || a.account_name_ar), l.nonCurrentAssetSec, a.amount, ...(compData ? [a.comparison_amount, a.amount - a.comparison_amount, a.comparison_amount !== 0 ? (((a.amount - a.comparison_amount) / Math.abs(a.comparison_amount)) * 100).toFixed(2) + '%' : '-'] : [])]),
      ...assetsUnclassified.map(a => [a.account_code, isAr ? a.account_name_ar : (a.account_name_en || a.account_name_ar), l.unclassifiedAssetsSec, a.amount, ...(compData ? [a.comparison_amount, a.amount - a.comparison_amount, a.comparison_amount !== 0 ? (((a.amount - a.comparison_amount) / Math.abs(a.comparison_amount)) * 100).toFixed(2) + '%' : '-'] : [])]),
      compData
        ? [l.totalAssets, '', '', reportData.main_period.total_assets, compData.total_assets, reportData.main_period.total_assets - compData.total_assets, compData.total_assets !== 0 ? (((reportData.main_period.total_assets - compData.total_assets) / Math.abs(compData.total_assets)) * 100).toFixed(2) + '%' : '-']
        : [l.totalAssets, '', '', reportData.main_period.total_assets],
      [],
      [`2. ${l.liabilitiesSec}`],
      compData
        ? ['Code', 'Name', 'Section', 'Current Balance', 'Comparison Balance', 'Variance', 'Variance %']
        : ['Code', 'Name', 'Section', 'Balance'],
      ...liabilitiesCurrent.map(a => [a.account_code, isAr ? a.account_name_ar : (a.account_name_en || a.account_name_ar), l.currentLiabilitySec, a.amount, ...(compData ? [a.comparison_amount, a.amount - a.comparison_amount, a.comparison_amount !== 0 ? (((a.amount - a.comparison_amount) / Math.abs(a.comparison_amount)) * 100).toFixed(2) + '%' : '-'] : [])]),
      ...liabilitiesNonCurrent.map(a => [a.account_code, isAr ? a.account_name_ar : (a.account_name_en || a.account_name_ar), l.nonCurrentLiabilitySec, a.amount, ...(compData ? [a.comparison_amount, a.amount - a.comparison_amount, a.comparison_amount !== 0 ? (((a.amount - a.comparison_amount) / Math.abs(a.comparison_amount)) * 100).toFixed(2) + '%' : '-'] : [])]),
      ...liabilitiesUnclassified.map(a => [a.account_code, isAr ? a.account_name_ar : (a.account_name_en || a.account_name_ar), l.unclassifiedLiabilitiesSec, a.amount, ...(compData ? [a.comparison_amount, a.amount - a.comparison_amount, a.comparison_amount !== 0 ? (((a.amount - a.comparison_amount) / Math.abs(a.comparison_amount)) * 100).toFixed(2) + '%' : '-'] : [])]),
      compData
        ? [l.totalLiabilities, '', '', reportData.main_period.total_liabilities, compData.total_liabilities, reportData.main_period.total_liabilities - compData.total_liabilities, compData.total_liabilities !== 0 ? (((reportData.main_period.total_liabilities - compData.total_liabilities) / Math.abs(compData.total_liabilities)) * 100).toFixed(2) + '%' : '-']
        : [l.totalLiabilities, '', '', reportData.main_period.total_liabilities],
      [],
      [`3. ${l.equitySec}`],
      compData
        ? ['Code', 'Name', 'Section', 'Current Balance', 'Comparison Balance', 'Variance', 'Variance %']
        : ['Code', 'Name', 'Section', 'Balance'],
      ...equityList.map(a => [a.account_code, isAr ? a.account_name_ar : (a.account_name_en || a.account_name_ar), l.equitySec, a.amount, ...(compData ? [a.comparison_amount, a.amount - a.comparison_amount, a.comparison_amount !== 0 ? (((a.amount - a.comparison_amount) / Math.abs(a.comparison_amount)) * 100).toFixed(2) + '%' : '-'] : [])]),
      [ '[SYSTEM]', l.currentIncomeSec, l.equitySec, reportData.main_period.current_year_net_income, ...(compData ? [compData.current_year_net_income, reportData.main_period.current_year_net_income - compData.current_year_net_income, compData.current_year_net_income !== 0 ? (((reportData.main_period.current_year_net_income - compData.current_year_net_income) / Math.abs(compData.current_year_net_income)) * 100).toFixed(2) + '%' : '-'] : []) ],
      compData
        ? [l.totalEquity, '', '', reportData.main_period.total_equity_and_income, compData.total_equity_and_income, reportData.main_period.total_equity_and_income - compData.total_equity_and_income, compData.total_equity_and_income !== 0 ? (((reportData.main_period.total_equity_and_income - compData.total_equity_and_income) / Math.abs(compData.total_equity_and_income)) * 100).toFixed(2) + '%' : '-']
        : [l.totalEquity, '', '', reportData.main_period.total_equity_and_income],
      [],
      [
        l.totalLiabilitiesEquity, 
        '', 
        '',
        reportData.main_period.total_liabilities + reportData.main_period.total_equity_and_income,
        ...(compData ? [
          compData.total_liabilities + compData.total_equity_and_income,
          (reportData.main_period.total_liabilities + reportData.main_period.total_equity_and_income) - (compData.total_liabilities + compData.total_equity_and_income),
          (compData.total_liabilities + compData.total_equity_and_income) !== 0 ? ((( (reportData.main_period.total_liabilities + reportData.main_period.total_equity_and_income) - (compData.total_liabilities + compData.total_equity_and_income) ) / Math.abs(compData.total_liabilities + compData.total_equity_and_income)) * 100).toFixed(2) + '%' : '-'
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

  const renderComparisonCell = (currentVal: number, prevVal: number) => {
    if (comparisonMode === 'none' || !reportData?.comparison_period) return null;

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

      {/* Unclassified Accounts Warning Notification */}
      {reportData && !loading && reportData.unclassified_accounts_count > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-start gap-3 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h6 className="font-bold">
              {isAr ? 'تنبيه: يوجد حسابات غير مصنفة' : 'Notice: Unclassified Accounts Detected'}
            </h6>
            <p className="text-[11px] text-slate-650 leading-relaxed">
              {isAr 
                ? `تم رصد عدد ${reportData.unclassified_accounts_count} من الحسابات النشطة بدون تصنيف للمركز المالي (متداول/غير متداول). يرجى تصنيفها لضمان دقة التقارير المالية. يمكنك تصنيفها مباشرة بالضغط على الحساب أدناه لتصحيحه دون مغادرة التقرير.`
                : `We detected ${reportData.unclassified_accounts_count} active accounts without Balance Sheet classification (Current vs. Non-Current). Please classify them for accurate reporting. You can classify them directly by clicking on any account below without leaving the page.`}
            </p>
          </div>
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
            {l.discrepancy} {formatNumberWithLatinDigits(reportData.main_period.check_difference)} {currentOrg?.currency_code || ''}
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
                  {formatNumberWithLatinDigits(reportData.main_period.total_assets)}
                </span>
                <span className="bg-brand-blue/10 text-brand-blue text-[10px] px-2 py-0.5 rounded-full font-bold">{currentOrg?.currency_code || ''}</span>
              </div>
            </div>

            {/* KPI 2: Liabilities */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">{l.liabilitiesCard}</span>
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold text-red-600 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.main_period.total_liabilities)}
                </span>
                <span className="bg-red-500/10 text-red-600 text-[10px] px-2 py-0.5 rounded-full font-bold">{currentOrg?.currency_code || ''}</span>
              </div>
            </div>

            {/* KPI 3: Current net income */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">{l.netIncomeCard}</span>
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold text-emerald-600 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.main_period.current_year_net_income)}
                </span>
                <span className="bg-emerald-500/10 text-emerald-500 text-[10px] px-2 py-0.5 rounded-full font-bold">{currentOrg?.currency_code || ''}</span>
              </div>
            </div>

            {/* KPI 4: Liab + Equity */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">{l.liabEquityCard}</span>
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold text-slate-800 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.main_period.total_liabilities + reportData.main_period.total_equity_and_income)}
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
                    {formatNumberWithLatinDigits(reportData.main_period.total_assets)}
                  </span>
                  {hasComparison && (
                    <span className="text-[10px] font-mono font-bold text-slate-400" style={{ direction: 'ltr' }}>
                      (Prev: {formatNumberWithLatinDigits(reportData.comparison_period!.total_assets)})
                    </span>
                  )}
                </div>
              </div>

              {/* Assets Body */}
              {assetsExpanded && (
                <div className="p-5 flex-1 space-y-4">
                  
                  {/* Table headers */}
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-black text-slate-400 border-b border-slate-100 pb-2 select-none uppercase">
                    <div className="col-span-6 flex gap-2">
                      <span className="w-16 shrink-0">{l.colCode}</span>
                      <span>{l.colAccount}</span>
                    </div>
                    <div className="col-span-6 flex justify-end gap-6">
                      <span className="text-left font-sans">{l.colCurrent}</span>
                      {hasComparison && (
                        <div className="flex gap-6 justify-end w-36 shrink-0">
                          <span className="w-14 text-left">{l.colCompare}</span>
                          <span className="w-16 text-left">{l.colChange}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {reportData.accounts.filter(a => a.classification === 'assets').length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-8">{l.emptyAssets}</p>
                  ) : (
                    <div className="space-y-4">
                      
                      {/* Current Assets Sub-Section */}
                      <div className="space-y-2">
                        <div className="bg-slate-50 px-3 py-1.5 rounded-lg flex justify-between items-center text-xs font-extrabold text-slate-700 border-r-4 border-brand-blue">
                          <span>{l.currentAssetSec}</span>
                          <span className="font-mono" style={{ direction: 'ltr' }}>
                            {formatNumberWithLatinDigits(reportData.main_period.assets_current)}
                          </span>
                        </div>
                        {assetsCurrent.map((item) => (
                          <div 
                            key={item.account_id} 
                            onClick={() => setSelectedAccount(item)}
                            title={l.drilldownTooltip}
                            className="grid grid-cols-12 gap-2 items-center text-xs py-2 px-3 border-r border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer group transition"
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
                              {hasComparison && (
                                <div className="w-36 shrink-0 flex justify-end">
                                  {renderComparisonCell(item.amount, item.comparison_amount)}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Non-Current Assets Sub-Section */}
                      <div className="space-y-2">
                        <div className="bg-slate-50 px-3 py-1.5 rounded-lg flex justify-between items-center text-xs font-extrabold text-slate-700 border-r-4 border-indigo-500">
                          <span>{l.nonCurrentAssetSec}</span>
                          <span className="font-mono" style={{ direction: 'ltr' }}>
                            {formatNumberWithLatinDigits(reportData.main_period.assets_non_current)}
                          </span>
                        </div>
                        {assetsNonCurrent.map((item) => (
                          <div 
                            key={item.account_id} 
                            onClick={() => setSelectedAccount(item)}
                            title={l.drilldownTooltip}
                            className="grid grid-cols-12 gap-2 items-center text-xs py-2 px-3 border-r border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer group transition"
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
                              {hasComparison && (
                                <div className="w-36 shrink-0 flex justify-end">
                                  {renderComparisonCell(item.amount, item.comparison_amount)}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Unclassified Assets Sub-Section (Shown only if unclassified assets exist) */}
                      {assetsUnclassified.length > 0 && (
                        <div className="space-y-2">
                          <div className="bg-amber-50/55 px-3 py-1.5 rounded-lg flex justify-between items-center text-xs font-extrabold text-amber-800 border-r-4 border-amber-500">
                            <span className="flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {l.unclassifiedAssetsSec}
                            </span>
                            <span className="font-mono" style={{ direction: 'ltr' }}>
                              {formatNumberWithLatinDigits(reportData.main_period.assets_unclassified)}
                            </span>
                          </div>
                          {assetsUnclassified.map((item) => (
                            <div 
                              key={item.account_id} 
                              onClick={() => setSelectedAccount(item)}
                              title={l.drilldownTooltip}
                              className="grid grid-cols-12 gap-2 items-center text-xs py-2 px-3 border-r border-amber-200 hover:bg-amber-50/30 rounded-md cursor-pointer group transition bg-amber-50/10"
                            >
                              <div className="col-span-6 flex gap-2 items-center min-w-0">
                                <span className="font-mono text-amber-600 font-bold w-16 shrink-0">[{item.account_code}]</span>
                                <span className="text-slate-700 font-bold truncate group-hover:text-brand-blue">
                                  {isAr ? item.account_name_ar : (item.account_name_en || item.account_name_ar)}
                                </span>
                              </div>
                              <div className="col-span-6 flex justify-end items-center gap-6">
                                <span className="font-mono text-slate-800 font-bold" style={{ direction: 'ltr' }}>
                                  {formatNumberWithLatinDigits(item.amount)}
                                </span>
                                {hasComparison && (
                                  <div className="w-36 shrink-0 flex justify-end">
                                    {renderComparisonCell(item.amount, item.comparison_amount)}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                    </div>
                  )}
                </div>
              )}

              {/* Assets Total Footer */}
              <div className="border-t border-slate-100 bg-slate-50/30 px-5 py-4 flex justify-between items-center text-xs font-black select-none">
                <span>{l.totalAssets}</span>
                <div className="flex flex-col items-end">
                  <span className="font-sans text-brand-blue text-sm" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.main_period.total_assets)} {currentOrg?.currency_code || ''}
                  </span>
                  {hasComparison && (
                    <div className="flex items-center gap-2 mt-1">
                      {renderComparisonCell(reportData.main_period.total_assets, reportData.comparison_period!.total_assets)}
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
                      {formatNumberWithLatinDigits(reportData.main_period.total_liabilities)}
                    </span>
                    {hasComparison && (
                      <span className="text-[10px] font-mono font-bold text-slate-400" style={{ direction: 'ltr' }}>
                        (Prev: {formatNumberWithLatinDigits(reportData.comparison_period!.total_liabilities)})
                      </span>
                    )}
                  </div>
                </div>

                {/* Liabilities Body */}
                {liabilitiesExpanded && (
                  <div className="p-5 flex-1 space-y-4">
                    
                    {/* Table headers */}
                    <div className="grid grid-cols-12 gap-2 text-[10px] font-black text-slate-400 border-b border-slate-100 pb-2 select-none uppercase">
                      <div className="col-span-6 flex gap-2">
                        <span className="w-16 shrink-0">{l.colCode}</span>
                        <span>{l.colAccount}</span>
                      </div>
                      <div className="col-span-6 flex justify-end gap-6">
                        <span className="text-left font-sans">{l.colCurrent}</span>
                        {hasComparison && (
                          <div className="flex gap-6 justify-end w-36 shrink-0">
                            <span className="w-14 text-left">{l.colCompare}</span>
                            <span className="w-16 text-left">{l.colChange}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {reportData.accounts.filter(a => a.classification === 'liabilities').length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-6">{l.emptyLiab}</p>
                    ) : (
                      <div className="space-y-4">

                        {/* Current Liabilities Sub-Section */}
                        <div className="space-y-2">
                          <div className="bg-slate-50 px-3 py-1.5 rounded-lg flex justify-between items-center text-xs font-extrabold text-slate-700 border-r-4 border-red-500">
                            <span>{l.currentLiabilitySec}</span>
                            <span className="font-mono" style={{ direction: 'ltr' }}>
                              {formatNumberWithLatinDigits(reportData.main_period.liabilities_current)}
                            </span>
                          </div>
                          {liabilitiesCurrent.map((item) => (
                            <div 
                              key={item.account_id} 
                              onClick={() => setSelectedAccount(item)}
                              title={l.drilldownTooltip}
                              className="grid grid-cols-12 gap-2 items-center text-xs py-2 px-3 border-r border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer group transition"
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
                                {hasComparison && (
                                  <div className="w-36 shrink-0 flex justify-end">
                                    {renderComparisonCell(item.amount, item.comparison_amount)}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Non-Current Liabilities Sub-Section */}
                        <div className="space-y-2">
                          <div className="bg-slate-50 px-3 py-1.5 rounded-lg flex justify-between items-center text-xs font-extrabold text-slate-700 border-r-4 border-rose-500">
                            <span>{l.nonCurrentLiabilitySec}</span>
                            <span className="font-mono" style={{ direction: 'ltr' }}>
                              {formatNumberWithLatinDigits(reportData.main_period.liabilities_non_current)}
                            </span>
                          </div>
                          {liabilitiesNonCurrent.map((item) => (
                            <div 
                              key={item.account_id} 
                              onClick={() => setSelectedAccount(item)}
                              title={l.drilldownTooltip}
                              className="grid grid-cols-12 gap-2 items-center text-xs py-2 px-3 border-r border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer group transition"
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
                                {hasComparison && (
                                  <div className="w-36 shrink-0 flex justify-end">
                                    {renderComparisonCell(item.amount, item.comparison_amount)}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Unclassified Liabilities Sub-Section (Shown only if unclassified liabilities exist) */}
                        {liabilitiesUnclassified.length > 0 && (
                          <div className="space-y-2">
                            <div className="bg-amber-50/55 px-3 py-1.5 rounded-lg flex justify-between items-center text-xs font-extrabold text-amber-800 border-r-4 border-amber-500">
                              <span className="flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {l.unclassifiedLiabilitiesSec}
                              </span>
                              <span className="font-mono" style={{ direction: 'ltr' }}>
                                {formatNumberWithLatinDigits(reportData.main_period.liabilities_unclassified)}
                              </span>
                            </div>
                            {liabilitiesUnclassified.map((item) => (
                              <div 
                                key={item.account_id} 
                                onClick={() => setSelectedAccount(item)}
                                title={l.drilldownTooltip}
                                className="grid grid-cols-12 gap-2 items-center text-xs py-2 px-3 border-r border-amber-200 hover:bg-amber-50/30 rounded-md cursor-pointer group transition bg-amber-50/10"
                              >
                                <div className="col-span-6 flex gap-2 items-center min-w-0">
                                  <span className="font-mono text-amber-600 font-bold w-16 shrink-0">[{item.account_code}]</span>
                                  <span className="text-slate-700 font-bold truncate group-hover:text-brand-blue">
                                    {isAr ? item.account_name_ar : (item.account_name_en || item.account_name_ar)}
                                  </span>
                                </div>
                                <div className="col-span-6 flex justify-end items-center gap-6">
                                  <span className="font-mono text-slate-800 font-bold" style={{ direction: 'ltr' }}>
                                    {formatNumberWithLatinDigits(item.amount)}
                                  </span>
                                  {hasComparison && (
                                    <div className="w-36 shrink-0 flex justify-end">
                                      {renderComparisonCell(item.amount, item.comparison_amount)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                )}

                {/* Liabilities Total Footer */}
                <div className="border-t border-slate-100 bg-slate-50/30 px-5 py-4 flex justify-between items-center text-xs font-black select-none">
                  <span>{l.totalLiabilities}</span>
                  <div className="flex flex-col items-end">
                    <span className="font-sans text-red-600 text-sm" style={{ direction: 'ltr' }}>
                      {formatNumberWithLatinDigits(reportData.main_period.total_liabilities)} {currentOrg?.currency_code || ''}
                    </span>
                    {hasComparison && (
                      <div className="flex items-center gap-2 mt-1">
                        {renderComparisonCell(reportData.main_period.total_liabilities, reportData.comparison_period!.total_liabilities)}
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
                      {formatNumberWithLatinDigits(reportData.main_period.total_equity_and_income)}
                    </span>
                    {hasComparison && (
                      <span className="text-[10px] font-mono font-bold text-slate-400" style={{ direction: 'ltr' }}>
                        (Prev: {formatNumberWithLatinDigits(reportData.comparison_period!.total_equity_and_income)})
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
                        {hasComparison && (
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
                      equityList.map((item) => (
                        <div 
                          key={item.account_id} 
                          onClick={() => setSelectedAccount(item)}
                          title={l.drilldownTooltip}
                          className="grid grid-cols-12 gap-2 items-center text-xs py-2 px-3 border-r border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer group transition"
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
                            {hasComparison && (
                              <div className="w-36 shrink-0 flex justify-end">
                                {renderComparisonCell(item.amount, item.comparison_amount)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
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
                          {formatNumberWithLatinDigits(reportData.main_period.current_year_net_income)}
                        </span>
                        {hasComparison && (
                          <div className="w-36 shrink-0 flex justify-end">
                            {renderComparisonCell(reportData.main_period.current_year_net_income, reportData.comparison_period!.current_year_net_income)}
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
                      {formatNumberWithLatinDigits(reportData.main_period.total_equity_and_income)} {currentOrg?.currency_code || ''}
                    </span>
                    {hasComparison && (
                      <div className="flex items-center gap-2 mt-1">
                        {renderComparisonCell(reportData.main_period.total_equity_and_income, reportData.comparison_period!.total_equity_and_income)}
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
                    {formatNumberWithLatinDigits(reportData.main_period.total_liabilities + reportData.main_period.total_equity_and_income)} {currentOrg?.currency_code || ''}
                  </span>
                  {hasComparison && (
                    <div className="flex items-center gap-2 mt-1 select-none font-mono">
                      {renderComparisonCell(
                        reportData.main_period.total_liabilities + reportData.main_period.total_equity_and_income,
                        reportData.comparison_period!.total_liabilities + reportData.comparison_period!.total_equity_and_income
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

      {/* Interactive Manual Classification and Options Modal Dialog */}
      {selectedAccount && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in" 
          onClick={() => setSelectedAccount(null)}
        >
          <div 
            className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-md w-full p-6 space-y-4 text-right transform transition scale-100" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <button 
                onClick={() => setSelectedAccount(null)} 
                className="text-slate-400 hover:text-slate-600 font-extrabold text-xl p-1 outline-none cursor-pointer transition"
              >
                &times;
              </button>
              <h4 className="text-sm font-black text-slate-800">
                {isAr ? 'خيارات الحساب ومراجعته' : 'Account Options & Classification'}
              </h4>
            </div>
            
            <div className="space-y-1 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{isAr ? 'الحساب المالي' : 'Account'}</div>
              <div className="text-xs font-black text-slate-800">[{selectedAccount.account_code}] {isAr ? selectedAccount.account_name_ar : (selectedAccount.account_name_en || selectedAccount.account_name_ar)}</div>
              <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/50 mt-1.5">
                {isAr ? `الرصيد الجاري: ` : `Current Balance: `} 
                <span className="font-mono font-black text-slate-800">{formatNumberWithLatinDigits(selectedAccount.amount)} {currentOrg?.currency_code || ''}</span>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              
              {/* Drilldown action */}
              <button
                onClick={() => {
                  handleDrilldown(selectedAccount.account_id);
                  setSelectedAccount(null);
                }}
                className="w-full bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition shadow-xs"
              >
                <BarChart className="w-4 h-4" />
                <span>{isAr ? 'عرض كشف دفتر الأستاذ التفصيلي' : 'View General Ledger Statement'}</span>
              </button>

              {/* Classification settings block */}
              <div className="space-y-1.5 border-t border-slate-100 pt-3">
                <label className="text-[11px] font-black text-slate-500 flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span>{isAr ? 'تعديل تصنيف الميزانية مباشرة:' : 'Edit Balance Sheet Classification:'}</span>
                </label>
                
                <div className="relative">
                  <select
                    value={selectedAccount.balance_sheet_section || ''}
                    onChange={async (e) => {
                      const val = e.target.value ? (e.target.value as any) : null;
                      await handleUpdateClassification(selectedAccount.account_id, val);
                      setSelectedAccount(null);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl py-2.5 pl-3 pr-8 outline-none focus:border-brand-blue appearance-none font-bold"
                  >
                    <option value="">{isAr ? 'غير مصنف' : 'Unclassified'}</option>
                    {selectedAccount.classification === 'assets' && (
                      <>
                        <option value="current_asset">{isAr ? 'أصول متداولة' : 'Current Assets'}</option>
                        <option value="non_current_asset">{isAr ? 'أصول غير متداولة' : 'Non-Current Assets'}</option>
                      </>
                    )}
                    {selectedAccount.classification === 'liabilities' && (
                      <>
                        <option value="current_liability">{isAr ? 'التزامات متداولة' : 'Current Liabilities'}</option>
                        <option value="non_current_liability">{isAr ? 'التزامات غير متداولة' : 'Non-Current Liabilities'}</option>
                      </>
                    )}
                    {selectedAccount.classification === 'equity' && (
                      <option value="equity">{isAr ? 'حقوق ملكية' : 'Equity'}</option>
                    )}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>
                
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  {isAr 
                    ? '* سينعكس التغيير مباشرة على هيكل التقرير والجميع دون الحاجة لمغادرة هذه الشاشة.' 
                    : '* This updates the master chart of accounts immediately, reflecting in this report and all calculations.'}
                </p>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};
