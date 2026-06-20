import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { reportsService, BalanceSheetResult } from '../../lib/reportsService';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { getErrorMessage } from '../../lib/errors';
import { 
  Building, 
  BarChart, 
  ShieldCheck, 
  AlertTriangle, 
  Calendar, 
  RefreshCw, 
  AlertCircle,
  FolderLock
} from 'lucide-react';

export const BalanceSheetPage: React.FC = () => {
  const { currentOrg } = useAuth();
  
  // Date state (As of Date)
  const [asOfDate, setAsOfDate] = useState<string>('');
  
  // States
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<BalanceSheetResult | null>(null);

  useEffect(() => {
    if (currentOrg) {
      const todayString = new Date().toISOString().split('T')[0];
      setAsOfDate(todayString);
      fetchReport(todayString);
    }
  }, [currentOrg]);

  const fetchReport = async (date = asOfDate) => {
    if (!currentOrg || !date) return;
    setLoading(true);
    setError(null);
    try {
      const data = await reportsService.getBalanceSheet(currentOrg.id, date);
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

  const assetsList = reportData?.accounts_breakdown.filter(a => a.classification === 'assets') || [];
  const liabilitiesList = reportData?.accounts_breakdown.filter(a => a.classification === 'liabilities') || [];
  const equityList = reportData?.accounts_breakdown.filter(a => a.classification === 'equity') || [];

  // Equation balance check
  const equationBalanced = reportData ? Math.abs(reportData.check_difference) < 0.02 : true;

  return (
    <div className="space-y-6" dir="rtl">
      
      {/* Filters Form */}
      <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-wrap gap-4 items-end shadow-sm">
        <div className="space-y-1.5 shrink-0">
          <label className="text-xs font-bold text-slate-500 block">عرض الموقف المالي حتى تاريخ</label>
          <div className="relative">
            <input 
              type="date" 
              value={asOfDate} 
              onChange={(e) => setAsOfDate(e.target.value)}
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
          <span>عرض المركز المالي</span>
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl flex items-center gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* equation banner */}
      {reportData && (
        <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-xs ${
          equationBalanced 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-850' 
            : 'bg-amber-50 border-amber-200 text-amber-850'
        }`}>
          <div className="flex items-center gap-3">
            {equationBalanced ? (
              <div className="bg-emerald-500/15 p-2 rounded-xl text-emerald-600">
                <ShieldCheck className="w-5 h-5" />
              </div>
            ) : (
              <div className="bg-amber-500/15 p-2 rounded-xl text-amber-600">
                <AlertTriangle className="w-5 h-5 text-amber-500 hover:scale-105 transition" />
              </div>
            )}
            <div className="space-y-0.5">
              <h5 className="text-xs font-extrabold">
                {equationBalanced 
                  ? 'معادلة القيد المزدوج متوازنة ومؤمنة تماماً' 
                  : 'معادلة المركز غير متوازنة (يوجد فروق أو حركات غير معلمة)'}
              </h5>
              <p className="text-[10px] text-slate-500">
                الأصول = الالتزامات + حقوق الملكية + صافي الأرباح الاسترشادية للفترة الحالية
              </p>
            </div>
          </div>
          <div className="font-sans text-xs font-bold" style={{ direction: 'ltr' }}>
            الفرق الدفتري: {formatNumberWithLatinDigits(reportData.check_difference)} SAR
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {reportData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">1. إجمالي الأصول (Assets)</span>
            <div className="flex items-center justify-between">
              <span className="text-lg font-extrabold text-brand-blue font-sans" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(reportData.assets)}
              </span>
              <span className="bg-brand-blue/10 text-brand-blue text-[10px] px-2 py-0.5 rounded-full font-bold">SAR</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">2. إجمالي الخصوم والالتزامات</span>
            <div className="flex items-center justify-between">
              <span className="text-lg font-extrabold text-red-600 font-sans" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(reportData.liabilities)}
              </span>
              <span className="bg-red-500/10 text-red-600 text-[10px] px-2 py-0.5 rounded-full font-bold">SAR</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">3. صافي الفتروي YTD لربحية العام</span>
            <div className="flex items-center justify-between">
              <span className="text-lg font-extrabold text-emerald-600 font-sans" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(reportData.current_year_net_income)}
              </span>
              <span className="bg-emerald-500/10 text-emerald-500 text-[10px] px-2 py-0.5 rounded-full font-bold">SAR</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">الخصوم + رأس المال + أرباح العام</span>
            <div className="flex items-center justify-between">
              <span className="text-lg font-extrabold text-slate-800 font-sans" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(reportData.liabilities + reportData.equity + reportData.current_year_net_income)}
              </span>
              <span className="bg-slate-100 text-slate-650 text-[10px] px-2 py-0.5 rounded-full font-bold">SAR</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Breakdown of Balance Sheet */}
      {reportData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Side A: Assets */}
          <div className="bg-white rounded-2xl border border-slate-105 shadow-sm overflow-hidden flex flex-col">
            <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
                <Building className="w-4 h-4 text-brand-blue" />
                <span>الجانب الأيمن: الأصول والممتلكات (Assets)</span>
              </span>
              <span className="text-xs font-mono font-bold text-brand-blue" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(reportData.assets)}
              </span>
            </div>
            
            <div className="p-5 flex-1 space-y-4">
              {assetsList.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-8">لا توجد أرصدة أصول مسجلة حتى تاريخه.</p>
              ) : (
                assetsList.map((item) => (
                  <div key={item.account_id} className="flex items-center justify-between text-xs py-1.5 px-3 border-r-2 border-brand-blue/30 hover:bg-slate-50 rounded-md">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-400 text-[11px] font-bold">[{item.account_code}]</span>
                      <span className="text-slate-700 font-bold">{item.account_name_ar}</span>
                    </div>
                    <span className="font-mono text-slate-700 font-bold" style={{ direction: 'ltr' }}>
                      {formatNumberWithLatinDigits(item.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-slate-100 bg-slate-50/20 px-5 py-4 flex justify-between items-center text-xs font-extrabold select-none">
              <span>مجموع أصول المنشأة الحالية (A)</span>
              <span className="font-sans text-brand-blue text-sm" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(reportData.assets)} SAR
              </span>
            </div>
          </div>

          {/* Side B: Liabilities & Owner's Equity */}
          <div className="bg-white rounded-2xl border border-slate-105 shadow-sm overflow-hidden flex flex-col">
            <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between border-red-100">
              <span className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
                <FolderLock className="w-4 h-4 text-red-500" />
                <span>الجانب الأيسر: الخصوم الالتزامية وحقوق الملكية (Liabilities & Equity)</span>
              </span>
              <span className="text-xs font-mono font-bold text-slate-800" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(reportData.liabilities + reportData.equity + reportData.current_year_net_income)}
              </span>
            </div>

            <div className="p-5 flex-1 space-y-6">
              
              {/* Liabilities Subsection */}
              <div className="space-y-3">
                <div className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wide border-b border-slate-100 pb-1.5 flex justify-between">
                  <span>الالتزامات والخصوم (Liabilities)</span>
                  <span className="text-red-600 font-sans tracking-tight" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.liabilities)}
                  </span>
                </div>
                
                <div className="space-y-2 pr-1.5">
                  {liabilitiesList.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">لا توجد مطلوبات أو خصوم تجارية حتى تاريخه.</p>
                  ) : (
                    liabilitiesList.map((item) => (
                      <div key={item.account_id} className="flex items-center justify-between text-xs py-1.5 px-3 border-r-2 border-red-300 hover:bg-slate-50 rounded-md">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-400 text-[11px] font-bold">[{item.account_code}]</span>
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

              {/* Equity Subsection */}
              <div className="space-y-3">
                <div className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wide border-b border-slate-100 pb-1.5 flex justify-between">
                  <span>رأس المال والأرصدة الرأسمالية (Capital & Equity)</span>
                  <span className="text-slate-700 font-sans tracking-tight" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.equity)}
                  </span>
                </div>

                <div className="space-y-2 pr-1.5">
                  {equityList.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">لا يوجد رأس مال مسجل في دفاتر حقوق الملكية.</p>
                  ) : (
                    equityList.map((item) => (
                      <div key={item.account_id} className="flex items-center justify-between text-xs py-1.5 px-3 border-r-2 border-amber-300 hover:bg-slate-50 rounded-md">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-400 text-[11px] font-bold">[{item.account_code}]</span>
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

              {/* Current YTD Income item */}
              <div className="space-y-3">
                <div className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wide border-b border-slate-100 pb-1.5 flex justify-between">
                  <span>صافي أرباح العام المترتبة الدفترية (Current Income YTD)</span>
                  <span className="text-emerald-600 font-sans tracking-tight font-extrabold" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.current_year_net_income)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-xs py-2 px-3 border-r-2 border-emerald-400 bg-emerald-50/10 rounded-md">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-700 font-extrabold">صافي أرباح السنة المالية الحالية (تقدير استرشادي)</span>
                  </div>
                  <span className="font-mono text-emerald-600 font-extrabold" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.current_year_net_income)}
                  </span>
                </div>
              </div>

            </div>

            <div className="border-t border-slate-100 bg-slate-50/20 px-5 py-4 flex justify-between items-center text-xs font-extrabold select-none">
              <span>مجموع الخصوم وحقوق ملكيتك المجمعة (B)</span>
              <span className="font-sans text-slate-800 text-sm" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(reportData.liabilities + reportData.equity + reportData.current_year_net_income)} SAR
              </span>
            </div>

          </div>

        </div>
      )}

    </div>
  );
};
