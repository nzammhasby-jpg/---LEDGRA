import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { reportsService, IncomeStatementResult } from '../../lib/reportsService';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { AlertCircle, Loader2 } from 'lucide-react';

export const IncomeStatementPrint: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { currentOrg } = useAuth();

  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';

  const [report, setReport] = useState<IncomeStatementResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id) {
      if (!dateFrom || !dateTo) {
        setLoading(false);
        setError('يرجى تحديد فترة تاريخ البداية وتاريخ النهاية لعرض تقرير قائمة الدخل المعتمد.');
        return;
      }
      loadReport();
    }
  }, [currentOrg?.id, dateFrom, dateTo]);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await reportsService.getIncomeStatement(
        currentOrg!.id,
        dateFrom,
        dateTo
      );
      setReport(data);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto animate-pulse" />
          <p className="text-xs text-slate-500 font-bold">جاري تجميع حركات الحسابات وتوليد قائمة الدخل...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-6 text-center space-y-4 shadow-xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" strokeWidth={1.5} />
          <div>
            <h3 className="text-sm font-bold text-slate-800 font-sans">تعذر بناء قائمة الدخل</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{error}</p>
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

  // Filter accounts breakdown based on categorization
  const revenueAccounts = report.accounts_breakdown.filter(a => a.classification === 'revenue');
  const cogsAccounts = report.accounts_breakdown.filter(a => a.is_cogs);
  const expenseAccounts = report.accounts_breakdown.filter(a => a.classification === 'expenses' && !a.is_cogs);

  return (
    <div className="bg-slate-100 min-h-screen">
      <PrintActions customBackPath="/reports" />

      {/* Main A4 Printable Sheet Content Chassis */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden">
        
        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle="قائمة الدخل التقديرية"
          documentNumber="INC-REP"
          documentDate={new Date().toISOString().split('T')[0]}
          extraMeta={[
            { label: 'البداية من', value: dateFrom },
            { label: 'النهاية إلى', value: dateTo }
          ]}
        />

        {/* Structured Financial Rows representation */}
        <div className="space-y-6 text-right font-sans mb-12" dir="rtl">
          
          {/* 1. REVENUE SECTION */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-slate-900 text-white font-black text-xs px-4 py-2.5 flex justify-between items-center">
              <span>أولاً: الإيرادات التشغيلية</span>
              <span className="font-mono text-[10px] text-slate-300">Revenues</span>
            </div>
            
            <div className="divide-y divide-slate-100 px-4 text-xs">
              {revenueAccounts.length === 0 ? (
                <div className="py-3 text-slate-400 italic text-center">لا توجد مبيعات أو إيرادات مستحقة في هذه الفترة.</div>
              ) : (
                revenueAccounts.map((acc, idx) => (
                  <div key={acc.account_id || idx} className="py-2.5 flex justify-between items-center text-slate-700">
                    <div>
                      <span className="font-bold text-slate-500 font-mono text-[10px] ml-2">[{acc.account_code}]</span>
                      <span className="font-black">{acc.account_name_ar}</span>
                    </div>
                    <span className="font-mono font-black text-slate-900">{formatNumberWithLatinDigits(acc.amount)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex justify-between items-center text-xs font-black text-slate-900">
              <span>إجمالي الإيرادات (أ):</span>
              <span className="font-mono">{formatNumberWithLatinDigits(report.revenue)} {currentOrg?.currency_code || ''}</span>
            </div>
          </div>

          {/* 2. COGS SECTION */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-slate-900 text-white font-black text-xs px-4 py-2.5 flex justify-between items-center">
              <span>ثانياً: تكلفة المبيعات (المخزون المباع)</span>
              <span className="font-mono text-[10px] text-slate-300">Cost of Goods Sold (COGS)</span>
            </div>
            
            <div className="divide-y divide-slate-100 px-4 text-xs">
              {cogsAccounts.length === 0 ? (
                <div className="py-3 text-slate-400 italic text-center">لا توجد تكاليف بضائع أو تسويات مخزنية مرحلة.</div>
              ) : (
                cogsAccounts.map((acc, idx) => (
                  <div key={acc.account_id || idx} className="py-2.5 flex justify-between items-center text-slate-700">
                    <div>
                      <span className="font-bold text-slate-500 font-mono text-[10px] ml-2">[{acc.account_code}]</span>
                      <span className="font-black">{acc.account_name_ar}</span>
                    </div>
                    <span className="font-mono font-black text-slate-900">{formatNumberWithLatinDigits(acc.amount)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex justify-between items-center text-xs font-black text-slate-900">
              <span>إجمالي تكلفة المبيعات (ب):</span>
              <span className="font-mono">{formatNumberWithLatinDigits(report.cogs)} {currentOrg?.currency_code || ''}</span>
            </div>
          </div>

          {/* 3. GROSS PROFIT INTERMEDIARY ROW */}
          <div className="bg-slate-100 border border-slate-250 rounded-2xl px-6 py-3.5 flex justify-between items-center text-xs font-extrabold text-slate-900 select-none">
            <span className="text-sm font-black">مــجــمــل الــربــح / الــخــســارة (أ - ب):</span>
            <span className="font-mono text-base font-black text-brand-blue">
              {formatNumberWithLatinDigits(report.gross_profit)} {currentOrg?.currency_code || ''}
            </span>
          </div>

          {/* 4. EXPENSES SECTION */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-slate-900 text-white font-black text-xs px-4 py-2.5 flex justify-between items-center">
              <span>ثالثاً: المصروفات العمومية والتشغيلية والإدارية</span>
              <span className="font-mono text-[10px] text-slate-300">Expenses</span>
            </div>
            
            <div className="divide-y divide-slate-100 px-4 text-xs">
              {expenseAccounts.length === 0 ? (
                <div className="py-3 text-slate-400 italic text-center">لا توجد مصاريف عمومية أو إدارية في هذه الدورة.</div>
              ) : (
                expenseAccounts.map((acc, idx) => (
                  <div key={acc.account_id || idx} className="py-2.5 flex justify-between items-center text-slate-700">
                    <div>
                      <span className="font-bold text-slate-500 font-mono text-[10px] ml-2">[{acc.account_code}]</span>
                      <span className="font-black">{acc.account_name_ar}</span>
                    </div>
                    <span className="font-mono font-black text-slate-900">{formatNumberWithLatinDigits(acc.amount)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex justify-between items-center text-xs font-black text-slate-900">
              <span>إجمالي المصروفات (ج):</span>
              <span className="font-mono">{formatNumberWithLatinDigits(report.expenses)} {currentOrg?.currency_code || ''}</span>
            </div>
          </div>

          {/* 5. NET INCOME SCORECARD */}
          <div className={`border-2 rounded-2xl px-6 py-4 flex justify-between items-center font-black ${
            report.net_income >= 0 
              ? 'bg-emerald-50/20 border-emerald-500 text-emerald-800' 
              : 'bg-red-50/20 border-red-500 text-red-800'
          }`}>
            <span className="text-sm font-black">صــافــي الــربــح / الــخــســارة لـلـفـتـرة الـمـالـيـة:</span>
            <span className="font-mono text-xl font-black">
              {formatNumberWithLatinDigits(report.net_income)} {currentOrg?.currency_code || ''}
            </span>
          </div>

        </div>

        {/* Closing corporate notes & signatures */}
        <PrintFooter showSignatures={true} description="تعتبر قائمة الدخل هذه مستنداً داخلياً معتمداً صادراً بناءً على أرصدة ميزان المراجعة الحركي بعد احتساب تكلفة المبيعات والتسويات المخزنية والاهتلاكات وفقاً للمعايير الدولية لإعداد التقارير المالية IFRS." />

      </div>
    </div>
  );
};
