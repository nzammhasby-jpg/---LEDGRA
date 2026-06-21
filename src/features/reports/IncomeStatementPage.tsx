import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { reportsService, IncomeStatementResult } from '../../lib/reportsService';
import { accountingService } from '../../lib/accountingService';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { getErrorMessage } from '../../lib/errors';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  RefreshCw, 
  AlertCircle,
  FileText,
  Printer,
  DollarSign as SarIcon
} from 'lucide-react';

export const IncomeStatementPage: React.FC = () => {
  const { currentOrg } = useAuth();
  
  // Date states
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  
  // States
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<IncomeStatementResult | null>(null);

  useEffect(() => {
    if (currentOrg) {
      initDateRange();
    }
  }, [currentOrg]);

  const initDateRange = async () => {
    try {
      setLoading(true);
      const years = await accountingService.getFiscalYears(currentOrg!.id);
      const activeYear = years.find(y => y.is_current) || years[0];
      if (activeYear) {
        setDateFrom(activeYear.start_date);
        setDateTo(activeYear.end_date);
        
        // Load report right after setting dates
        fetchReport(activeYear.start_date, activeYear.end_date);
      } else {
        // Fallback to current calendar year
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
      const data = await reportsService.getIncomeStatement(currentOrg.id, from, to);
      setReportData(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReport();
  };

  const revenueBreakdown = reportData?.accounts_breakdown.filter(a => a.classification === 'revenue') || [];
  const cogsBreakdown = reportData?.accounts_breakdown.filter(a => a.classification === 'expenses' && a.is_cogs) || [];
  const expensesBreakdown = reportData?.accounts_breakdown.filter(a => a.classification === 'expenses' && !a.is_cogs) || [];

  return (
    <div className="space-y-6" dir="rtl">
      
      {/* Date controls */}
      <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-wrap gap-4 items-end shadow-sm">
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

        <button
          type="submit"
          disabled={loading}
          className="bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold px-5 py-2.25 rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span>عرض التقرير</span>
        </button>

        {reportData && (
          <a
            href={`#/print/income-statement?dateFrom=${dateFrom}&dateTo=${dateTo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-5 py-2.25 rounded-xl transition flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-4.5 h-4.5" />
            <span>طباعة صك قائمة الدخل A4</span>
          </a>
        )}
      </form>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl flex items-center gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Overview stats */}
      {reportData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">إجمالي الإيرادات</span>
            <div className="flex items-center justify-between">
              <span className="text-lg font-extrabold text-emerald-600 font-sans" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(reportData.revenue)}
              </span>
              <span className="bg-emerald-500/10 text-emerald-600 text-[10px] px-2 py-0.5 rounded-full font-bold">SAR</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">تكلفة المبيعات (COGS)</span>
            <div className="flex items-center justify-between">
              <span className="text-lg font-extrabold text-amber-600 font-sans" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(reportData.cogs)}
              </span>
              <span className="bg-amber-500/10 text-amber-600 text-[10px] px-2 py-0.5 rounded-full font-bold">SAR</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">مجمل الربح (Gross Profit)</span>
            <div className="flex items-center justify-between">
              <span className="text-lg font-extrabold text-slate-800 font-sans" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(reportData.gross_profit)}
              </span>
              <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-bold">SAR</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">المصروفات التشغيلية</span>
            <div className="flex items-center justify-between">
              <span className="text-lg font-extrabold text-red-600 font-sans" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(reportData.expenses)}
              </span>
              <span className="bg-red-500/10 text-red-600 text-[10px] px-2 py-0.5 rounded-full font-bold">SAR</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1 relative overflow-hidden col-span-1 sm:col-span-2 lg:col-span-1">
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
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${reportData.net_income >= 0 ? 'bg-brand-blue/10 text-brand-blue' : 'bg-red-500/10 text-red-600'}`}>SAR</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Income Statement Table */}
      {reportData && (
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
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 bg-emerald-50/20 px-3 py-1.5 rounded-lg">
                <span className="text-sm font-extrabold text-slate-800">1. الإيرادات التشغيلية والمبيعات (Revenues)</span>
                <span className="text-sm font-extrabold text-emerald-600 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.revenue)}
                </span>
              </div>
              
              <div className="pr-4 space-y-2">
                {revenueBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">لا توجد إيرادات مسجلة خلال الفترة المحددة بقيمة مرحلة.</p>
                ) : (
                  revenueBreakdown.map((item) => (
                    <div key={item.account_id} className="flex items-center justify-between text-xs py-1 px-4 border-r-2 border-slate-100 hover:bg-slate-50 rounded-md">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-450 text-[11px] font-bold">[{item.account_code}]</span>
                        <span className="text-slate-600 font-bold">{item.account_name_ar}</span>
                      </div>
                      <span className="font-mono text-slate-600 font-semibold" style={{ direction: 'ltr' }}>
                        {formatNumberWithLatinDigits(item.amount)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 2. تكلفة المبيعات */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 bg-amber-50/20 px-3 py-1.5 rounded-lg">
                <span className="text-sm font-extrabold text-slate-800">2. تكلفة المبيعات (Cost of Goods Sold - COGS)</span>
                <span className="text-sm font-extrabold text-amber-600 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.cogs)}
                </span>
              </div>
              
              <div className="pr-4 space-y-2">
                {cogsBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">لا توجد تكاليف مبيعات مرحلة مسجلة خلال الفترة.</p>
                ) : (
                  cogsBreakdown.map((item) => (
                    <div key={item.account_id} className="flex items-center justify-between text-xs py-1 px-4 border-r-2 border-slate-100 hover:bg-slate-50 rounded-md">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-450 text-[11px] font-bold">[{item.account_code}]</span>
                        <span className="text-slate-600 font-bold">{item.account_name_ar}</span>
                      </div>
                      <span className="font-mono text-slate-600 font-semibold" style={{ direction: 'ltr' }}>
                        {formatNumberWithLatinDigits(item.amount)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 3. مجمل الربح */}
            <div className="bg-slate-50 p-4.5 rounded-2xl flex items-center justify-between font-extrabold border border-slate-200">
              <span className="text-sm text-slate-700">مجمل أرباح التشغيل (Gross Profit) = الإيرادات - تكلفة المبيعات</span>
              <span className="text-base text-slate-800 font-sans" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(reportData.gross_profit)}
              </span>
            </div>

            {/* 4. المصروفات التشغيلية */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 bg-red-50/20 px-3 py-1.5 rounded-lg">
                <span className="text-sm font-extrabold text-slate-800">3. المصروفات غير المصنفة كتكلفة مبيعات (Expenses)</span>
                <span className="text-sm font-extrabold text-red-600 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.expenses)}
                </span>
              </div>
              
              <div className="pr-4 space-y-2">
                {expensesBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">لا توجد مصروفات عمومية أو إدارية مرحلة ملحوظة.</p>
                ) : (
                  expensesBreakdown.map((item) => (
                    <div key={item.account_id} className="flex items-center justify-between text-xs py-1 px-4 border-r-2 border-slate-100 hover:bg-slate-50 rounded-md">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-450 text-[11px] font-bold">[{item.account_code}]</span>
                        <span className="text-slate-600 font-bold">{item.account_name_ar}</span>
                      </div>
                      <span className="font-mono text-slate-600 font-semibold" style={{ direction: 'ltr' }}>
                        {formatNumberWithLatinDigits(item.amount)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 5. المعادلة الختامية لصافي الدخل */}
            <div className={`p-5 rounded-2xl flex items-center justify-between border font-extrabold text-md shrink-0 select-none ${
              reportData.net_income >= 0 
                ? 'bg-brand-blue/5 border-brand-blue/20 text-brand-blue'
                : 'bg-red-50 border-red-200 text-red-600'
            }`}>
              <span>صافي الأرباح والخسائر الفترية النهائية (Net Income)</span>
              <span className="text-lg font-sans font-extrabold" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(reportData.net_income)}
              </span>
            </div>

          </div>

        </div>
      )}

    </div>
  );
};
