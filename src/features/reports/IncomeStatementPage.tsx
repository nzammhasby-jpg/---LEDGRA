import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { reportsService, AdvancedIncomeStatementResult } from '../../lib/reportsService';
import { accountingService } from '../../lib/accountingService';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { getErrorMessage } from '../../lib/errors';
import { FiscalYear } from '../../types';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  RefreshCw, 
  AlertCircle,
  FileText,
  Printer,
  Sparkles,
  Info
} from 'lucide-react';
import { ReportHeader } from './components/ReportHeader';
import { ReportActions } from './components/ReportActions';
import { generateCSV, downloadCSV, generateReportFilename } from '../../lib/exportUtils';

export const IncomeStatementPage: React.FC = () => {
  const { currentOrg } = useAuth();
  
  // Date and configuration states
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [excludeClosing, setExcludeClosing] = useState<boolean>(true);
  
  // Comparison states
  const [comparisonMode, setComparisonMode] = useState<'none' | 'previous_period' | 'previous_year'>('none');
  const [compData, setCompData] = useState<AdvancedIncomeStatementResult | null>(null);
  const [compDates, setCompDates] = useState<{ from: string, to: string } | null>(null);

  // States
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<AdvancedIncomeStatementResult | null>(null);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);

  // Period math calculations
  const calculatePreviousPeriod = (fromStr: string, toStr: string) => {
    const from = new Date(fromStr);
    const to = new Date(toStr);
    const diffTime = Math.abs(to.getTime() - from.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    const prevFrom = new Date(from);
    prevFrom.setDate(prevFrom.getDate() - diffDays);
    const prevTo = new Date(from);
    prevTo.setDate(prevTo.getDate() - 1);
    
    return {
      from: prevFrom.toISOString().split('T')[0],
      to: prevTo.toISOString().split('T')[0]
    };
  };

  const calculatePreviousYearPeriod = (fromStr: string, toStr: string) => {
    const from = new Date(fromStr);
    const to = new Date(toStr);
    
    const prevFrom = new Date(from);
    prevFrom.setFullYear(prevFrom.getFullYear() - 1);
    const prevTo = new Date(to);
    prevTo.setFullYear(prevTo.getFullYear() - 1);
    
    return {
      from: prevFrom.toISOString().split('T')[0],
      to: prevTo.toISOString().split('T')[0]
    };
  };

  const findPreviousAccountValue = (accountsList: any[], code: string) => {
    const matched = accountsList.find(a => a.code === code);
    return matched ? matched.amount : 0;
  };

  const renderValueComparison = (currentVal: number, prevVal: number) => {
    if (comparisonMode === 'none' || !compData) return null;
    
    const diff = currentVal - prevVal;
    const percentChange = prevVal !== 0 ? (diff / Math.abs(prevVal)) * 100 : (currentVal !== 0 ? 100 : 0);
    
    const isPositive = diff >= 0;
    const colorClass = isPositive ? 'text-emerald-600' : 'text-rose-600';
    const sign = isPositive ? '+' : '';
    
    return (
      <div className="flex items-center gap-2 font-mono text-[10px] sm:text-[11px] shrink-0" style={{ direction: 'ltr' }}>
        <span className="text-slate-400 font-medium" title="القيمة في فترة المقارنة">
          (Prev: {formatNumberWithLatinDigits(prevVal)})
        </span>
        <span className={`${colorClass} font-extrabold`} title="الفرق">
          {sign}{formatNumberWithLatinDigits(diff)}
        </span>
        <span className={`px-1 rounded text-[9px] font-black ${isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {sign}{formatNumberWithLatinDigits(percentChange, 1)}%
        </span>
      </div>
    );
  };

  const handleExportCSV = () => {
    if (!reportData) return;
    
    const currency = currentOrg?.currency_code || '';
    const csvRows: any[][] = [];
    
    csvRows.push(['منشأة', currentOrg?.name_ar || currentOrg?.name || '']);
    csvRows.push(['التقرير', 'قائمة الدخل المتقدمة']);
    csvRows.push(['الفترة من', dateFrom]);
    csvRows.push(['الفترة إلى', dateTo]);
    csvRows.push(['العملة', currency]);
    csvRows.push(['استبعاد قيود الإقفال', excludeClosing ? 'نعم' : 'لا']);
    
    if (comparisonMode !== 'none' && compDates) {
      csvRows.push(['نمط المقارنة', comparisonMode === 'previous_period' ? 'مقارنة بالفترة السابقة' : 'مقارنة بالسنة السابقة']);
      csvRows.push(['فترة المقارنة من', compDates.from]);
      csvRows.push(['فترة المقارنة إلى', compDates.to]);
    }
    csvRows.push([]);
    
    // Add Summary Row
    if (comparisonMode === 'none' || !compData) {
      csvRows.push(['البند', `القيمة الحالية (${currency})`]);
      csvRows.push(['إجمالي الإيرادات التشغيلية', reportData.total_revenue]);
      csvRows.push(['إجمالي تكلفة المبيعات', reportData.total_cogs]);
      csvRows.push(['مجمل الربح', reportData.gross_profit]);
      csvRows.push(['إجمالي المصروفات التشغيلية', reportData.total_operating_expenses]);
      csvRows.push(['صافي الدخل النهائي', reportData.net_income]);
    } else {
      csvRows.push(['البند', `القيمة الحالية (${currency})`, `القيمة السابقة (${currency})`, 'الفرق', 'نسبة التغير %']);
      
      const pushSummaryRow = (label: string, cur: number, prev: number) => {
        const diff = cur - prev;
        const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : (cur !== 0 ? 100 : 0);
        csvRows.push([label, cur, prev, diff, `${pct.toFixed(1)}%`]);
      };
      
      pushSummaryRow('إجمالي الإيرادات التشغيلية', reportData.total_revenue, compData.total_revenue);
      pushSummaryRow('إجمالي تكلفة المبيعات', reportData.total_cogs, compData.total_cogs);
      pushSummaryRow('مجمل الربح', reportData.gross_profit, compData.gross_profit);
      pushSummaryRow('إجمالي المصروفات التشغيلية', reportData.total_operating_expenses, compData.total_operating_expenses);
      pushSummaryRow('صافي الدخل النهائي', reportData.net_income, compData.net_income);
    }
    
    csvRows.push([]);
    csvRows.push(['تفاصيل بنود الحسابات']);
    
    if (comparisonMode === 'none' || !compData) {
      csvRows.push(['الكود', 'اسم الحساب', 'التصنيف', 'القيمة']);
      
      reportData.revenue_accounts.forEach(a => csvRows.push([a.code, a.name_ar, 'إيرادات', a.amount]));
      reportData.cogs_accounts.forEach(a => csvRows.push([a.code, a.name_ar, 'تكلفة مبيعات', a.amount]));
      reportData.expense_accounts.forEach(a => csvRows.push([a.code, a.name_ar, 'مصروفات', a.amount]));
    } else {
      csvRows.push(['الكود', 'اسم الحساب', 'التصنيف', 'القيمة الحالية', 'القيمة السابقة', 'الفرق', 'النسبة %']);
      
      const pushDetailRows = (accountsList: any[], compList: any[], label: string) => {
        accountsList.forEach(a => {
          const prev = findPreviousAccountValue(compList, a.code);
          const diff = a.amount - prev;
          const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : (a.amount !== 0 ? 100 : 0);
          csvRows.push([a.code, a.name_ar, label, a.amount, prev, diff, `${pct.toFixed(1)}%`]);
        });
      };
      
      pushDetailRows(reportData.revenue_accounts, compData.revenue_accounts, 'إيرادات');
      pushDetailRows(reportData.cogs_accounts, compData.cogs_accounts, 'تكلفة مبيعات');
      pushDetailRows(reportData.expense_accounts, compData.expense_accounts, 'مصروفات');
    }

    const headers = ['قائمة الدخل المتقدمة', 'التفاصيل المالية'];
    const csvContent = generateCSV(headers, csvRows);
    const filename = generateReportFilename('قائمة_الدخل', dateFrom, dateTo);
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
        
        // Load report right after setting dates
        fetchReport(activeYear.start_date, activeYear.end_date, true, 'none');
      } else {
        // Fallback to current calendar year
        const cy = new Date().getFullYear();
        const start = `${cy}-01-01`;
        const end = `${cy}-12-31`;
        setDateFrom(start);
        setDateTo(end);
        fetchReport(start, end, true, 'none');
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  const fetchReport = async (from = dateFrom, to = dateTo, excClosing = excludeClosing, mode = comparisonMode) => {
    if (!currentOrg || !from || !to) return;
    setLoading(true);
    setError(null);
    setCompData(null);
    setCompDates(null);
    try {
      // Load fiscal years list to keep statuses updated
      const years = await accountingService.getFiscalYears(currentOrg.id);
      setFiscalYears(years);

      const data = await reportsService.getIncomeStatementAdvanced(currentOrg.id, from, to, excClosing);
      setReportData(data);

      if (mode !== 'none') {
        const compRange = mode === 'previous_period' 
          ? calculatePreviousPeriod(from, to) 
          : calculatePreviousYearPeriod(from, to);
        setCompDates(compRange);
        
        const cData = await reportsService.getIncomeStatementAdvanced(currentOrg.id, compRange.from, compRange.to, excClosing);
        setCompData(cData);
      }
    } catch (err) {
      const errMsg = getErrorMessage(err);
      if (errMsg.includes('permission') || errMsg.includes('غير مصرح')) {
        setError('ليس لديك صلاحية لعرض هذا التقرير المالي الحساس.');
      } else {
        setError('تعذر تحميل تقرير قائمة الدخل المتقدم. الرجاء التحقق من المدخلات.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReport();
  };

  // Find if there is a matching fiscal year for the selected date range to show its status badge
  const matchedYear = fiscalYears.find(y => y.start_date === dateFrom && y.end_date === dateTo);

  const getYearStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return (
          <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-full">
            السنة مفتوحة
          </span>
        );
      case 'closed':
        return (
          <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full">
            السنة مغلقة (بانتظار الإقفال التام)
          </span>
        );
      case 'locked':
        return (
          <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-full">
            السنة مقفلة بالكامل
          </span>
        );
      case 'draft':
        return (
          <span className="bg-slate-100 text-slate-800 text-xs font-bold px-2.5 py-1 rounded-full">
            مسودة سنة مالية
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl" id="income-statement-page">
      
      {/* Date controls and switches */}
      <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-col gap-4 shadow-sm print:hidden">
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

          {/* Comparison Mode Selection */}
          <div className="space-y-1.5 shrink-0 w-full sm:w-48">
            <label className="text-xs font-bold text-slate-500 block">مقارنة التقرير</label>
            <select
              value={comparisonMode}
              onChange={(e) => {
                const val = e.target.value as 'none' | 'previous_period' | 'previous_year';
                setComparisonMode(val);
                fetchReport(dateFrom, dateTo, excludeClosing, val);
              }}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 outline-none focus:border-brand-blue"
            >
              <option value="none">بدون مقارنة</option>
              <option value="previous_period">مقارنة بالفترة السابقة</option>
              <option value="previous_year">مقارنة بالسنة السابقة</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold px-5 py-2.25 rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>عرض التقرير</span>
          </button>

          {matchedYear && (
            <div className="mr-auto self-center">
              {getYearStatusBadge(matchedYear.status)}
            </div>
          )}
        </div>

        {/* Closing entry exclusion toggle */}
        <div className="border-t border-slate-100 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 p-3 rounded-xl">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={excludeClosing}
              onChange={(e) => {
                setExcludeClosing(e.target.checked);
                fetchReport(dateFrom, dateTo, e.target.checked);
              }}
              className="w-4 h-4 text-brand-blue border-slate-300 rounded focus:ring-brand-blue cursor-pointer"
            />
            <span className="text-xs font-bold text-slate-700">استبعاد قيود إقفال السنة المالية (موصى به)</span>
          </label>
          <div className="flex items-start gap-1.5 text-[11px] text-slate-500 max-w-lg leading-relaxed">
            <Info className="w-4 h-4 text-amber-500 shrink-0" />
            <span>عند عرض سنة مالية مغلقة، يُستحسن استبعاد قيود الإقفال لعرض نتيجة النشاط المالي الفعلي للشركة قبل تصفير الحسابات الاسمية.</span>
          </div>
        </div>
      </form>

      {/* Action buttons row for report */}
      {reportData && !loading && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 print:hidden">
          <span className="text-xs font-bold text-slate-500">خيارات تصدير وطباعة قائمة الدخل المتقدمة:</span>
          <ReportActions
            onPrint={() => window.print()}
            onExportCSV={handleExportCSV}
            onRefresh={() => fetchReport()}
            loading={loading}
          />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl flex items-center gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state indicator */}
      {loading && !reportData && (
        <div className="bg-white p-12 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-3 text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin text-brand-blue" />
          <span className="text-xs font-bold">جاري تحميل وتحليل بنود الأرصدة التشغيلية...</span>
        </div>
      )}

      {/* Overview stats */}
      {reportData && !loading && (
        <>
          <ReportHeader
            reportName={comparisonMode === 'none' ? 'قائمة الدخل المتقدمة' : 'قائمة الدخل المتقدمة المقارنة'}
            dateFrom={dateFrom}
            dateTo={dateTo}
            excludeClosingEntries={excludeClosing}
            yearStatus={fiscalYears.find(y => y.start_date === dateFrom && y.end_date === dateTo)?.status}
          />

          {comparisonMode !== 'none' && compDates && (
            <div className="bg-amber-50/50 border border-amber-100 text-amber-900 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-4">
              <span>
                وضع المقارنة مفعّل: مقارنة بالفترة ({compDates.from} إلى {compDates.to})
              </span>
              <span className="bg-amber-100/70 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                {comparisonMode === 'previous_period' ? 'الفترة السابقة المماثلة' : 'السنة السابقة المماثلة'}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">إجمالي الإيرادات</span>
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold text-emerald-600 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.total_revenue)}
                </span>
                <span className="bg-emerald-500/10 text-emerald-600 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {currentOrg?.currency_code || ''}
                </span>
              </div>
              {renderValueComparison(reportData.total_revenue, compData?.total_revenue || 0)}
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">تكلفة المبيعات (COGS)</span>
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold text-amber-600 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.total_cogs)}
                </span>
                <span className="bg-amber-500/10 text-amber-600 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {currentOrg?.currency_code || ''}
                </span>
              </div>
              {renderValueComparison(reportData.total_cogs, compData?.total_cogs || 0)}
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">مجمل الربح (Gross Profit)</span>
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold text-slate-800 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.gross_profit)}
                </span>
                <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {currentOrg?.currency_code || ''}
                </span>
              </div>
              {renderValueComparison(reportData.gross_profit, compData?.gross_profit || 0)}
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">المصروفات التشغيلية</span>
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold text-red-600 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.total_operating_expenses)}
                </span>
                <span className="bg-red-500/10 text-red-600 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {currentOrg?.currency_code || ''}
                </span>
              </div>
              {renderValueComparison(reportData.total_operating_expenses, compData?.total_operating_expenses || 0)}
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2 relative overflow-hidden col-span-1 sm:col-span-2 lg:col-span-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider flex items-center gap-1">
                <span>صافي الدخل (Net Income)</span>
                {reportData.net_income >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                )}
              </span>
              <div className="flex items-center justify-between">
                <span className={`text-lg font-extrabold font-sans ${reportData.net_income >= 0 ? 'text-brand-blue' : 'text-red-600'}`} style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.net_income)}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${reportData.net_income >= 0 ? 'bg-brand-blue/10 text-brand-blue' : 'bg-red-500/10 text-red-600'}`}>
                  {currentOrg?.currency_code || ''}
                </span>
              </div>
              {renderValueComparison(reportData.net_income, compData?.net_income || 0)}
            </div>
          </div>
        </>
      )}

      {/* Main Income Statement Table */}
      {reportData && !loading && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          
          <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-navy" />
              <h3 className="text-sm font-extrabold text-slate-800">تفاصيل بنود شجرة الدخل والأرباح</h3>
            </div>
            <span className="text-xs text-slate-400">القيود المرحلة فقط</span>
          </div>

          <div className="p-6 space-y-6">
            
            {/* 1. الإيرادات */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 bg-emerald-50/20 px-3 py-1.5 rounded-lg flex-wrap gap-2">
                <span className="text-sm font-extrabold text-slate-800">1. الإيرادات التشغيلية والمبيعات (Revenues)</span>
                <div className="flex items-center gap-4">
                  {renderValueComparison(reportData.total_revenue, compData?.total_revenue || 0)}
                  <span className="text-sm font-extrabold text-emerald-600 font-sans" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.total_revenue)}
                  </span>
                </div>
              </div>
              
              <div className="pr-4 space-y-2">
                {reportData.revenue_accounts.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">لا توجد إيرادات مسجلة خلال الفترة المحددة بقيمة مرحلة.</p>
                ) : (
                  reportData.revenue_accounts.map((item) => (
                    <div key={item.account_id} className="flex items-center justify-between text-xs py-1 px-4 border-r-2 border-slate-100 hover:bg-slate-50 rounded-md flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-450 text-[11px] font-bold">[{item.code}]</span>
                        <span className="text-slate-600 font-bold">{item.name_ar}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        {renderValueComparison(item.amount, findPreviousAccountValue(compData?.revenue_accounts || [], item.code))}
                        <span className="font-mono text-slate-600 font-semibold" style={{ direction: 'ltr' }}>
                          {formatNumberWithLatinDigits(item.amount)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 2. تكلفة المبيعات */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 bg-amber-50/20 px-3 py-1.5 rounded-lg flex-wrap gap-2">
                <span className="text-sm font-extrabold text-slate-800">2. تكلفة المبيعات (Cost of Goods Sold - COGS)</span>
                <div className="flex items-center gap-4">
                  {renderValueComparison(reportData.total_cogs, compData?.total_cogs || 0)}
                  <span className="text-sm font-extrabold text-amber-600 font-sans" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.total_cogs)}
                  </span>
                </div>
              </div>
              
              <div className="pr-4 space-y-2">
                {reportData.cogs_accounts.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">لا توجد تكاليف مبيعات مرحلة مسجلة خلال الفترة.</p>
                ) : (
                  reportData.cogs_accounts.map((item) => (
                    <div key={item.account_id} className="flex items-center justify-between text-xs py-1 px-4 border-r-2 border-slate-100 hover:bg-slate-50 rounded-md flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-450 text-[11px] font-bold">[{item.code}]</span>
                        <span className="text-slate-600 font-bold">{item.name_ar}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        {renderValueComparison(item.amount, findPreviousAccountValue(compData?.cogs_accounts || [], item.code))}
                        <span className="font-mono text-slate-600 font-semibold" style={{ direction: 'ltr' }}>
                          {formatNumberWithLatinDigits(item.amount)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 3. مجمل الربح */}
            <div className="bg-slate-50 p-4.5 rounded-2xl flex items-center justify-between font-extrabold border border-slate-200 flex-wrap gap-2">
              <span className="text-sm text-slate-700">مجمل أرباح التشغيل (Gross Profit) = الإيرادات - تكلفة المبيعات</span>
              <div className="flex items-center gap-4">
                {renderValueComparison(reportData.gross_profit, compData?.gross_profit || 0)}
                <span className="text-base text-slate-800 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.gross_profit)}
                </span>
              </div>
            </div>

            {/* 4. المصروفات التشغيلية */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 bg-red-50/20 px-3 py-1.5 rounded-lg flex-wrap gap-2">
                <span className="text-sm font-extrabold text-slate-800">3. المصروفات غير المصنفة كتكلفة مبيعات (Expenses)</span>
                <div className="flex items-center gap-4">
                  {renderValueComparison(reportData.total_operating_expenses, compData?.total_operating_expenses || 0)}
                  <span className="text-sm font-extrabold text-red-600 font-sans" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.total_operating_expenses)}
                  </span>
                </div>
              </div>
              
              <div className="pr-4 space-y-2">
                {reportData.expense_accounts.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">لا توجد مصروفات عمومية أو إدارية مرحلة ملحوظة.</p>
                ) : (
                  reportData.expense_accounts.map((item) => (
                    <div key={item.account_id} className="flex items-center justify-between text-xs py-1 px-4 border-r-2 border-slate-100 hover:bg-slate-50 rounded-md flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-450 text-[11px] font-bold">[{item.code}]</span>
                        <span className="text-slate-600 font-bold">{item.name_ar}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        {renderValueComparison(item.amount, findPreviousAccountValue(compData?.expense_accounts || [], item.code))}
                        <span className="font-mono text-slate-600 font-semibold" style={{ direction: 'ltr' }}>
                          {formatNumberWithLatinDigits(item.amount)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 5. المعادلة الختامية لصافي الدخل */}
            <div className={`p-5 rounded-2xl flex items-center justify-between border font-extrabold text-md shrink-0 select-none flex-wrap gap-2 ${
              reportData.net_income >= 0 
                ? 'bg-brand-blue/5 border-brand-blue/20 text-brand-blue'
                : 'bg-red-50 border-red-200 text-red-600'
            }`}>
              <span>صافي الأرباح والخسائر الفترية النهائية (Net Income)</span>
              <div className="flex items-center gap-4">
                {renderValueComparison(reportData.net_income, compData?.net_income || 0)}
                <span className="text-lg font-sans font-extrabold" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.net_income)}
                </span>
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
};
