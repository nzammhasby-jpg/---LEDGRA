import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { reportsService, BalanceSheetResult } from '../../lib/reportsService';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';

export const BalanceSheetPrint: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { currentOrg } = useAuth();

  const asOfDate = searchParams.get('asOfDate') || '';

  const [report, setReport] = useState<BalanceSheetResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id) {
      if (!asOfDate) {
        setLoading(false);
        setError('يرجى تحديد تاريخ استحقاق المركز المالي لعرض الميزانية الرسمية.');
        return;
      }
      loadReport();
    }
  }, [currentOrg?.id, asOfDate]);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await reportsService.getBalanceSheet(
        currentOrg!.id,
        asOfDate
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
          <p className="text-xs text-slate-500 font-bold">جاري موازنة الحسابات وتحميل المركز المالي...</p>
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
            <h3 className="text-sm font-bold text-slate-800 font-sans">تعذر بناء المركز المالي</h3>
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

  const assetsAccounts = report.accounts_breakdown.filter(a => a.classification === 'assets');
  const liabilitiesAccounts = report.accounts_breakdown.filter(a => a.classification === 'liabilities');
  const equityAccounts = report.accounts_breakdown.filter(a => a.classification === 'equity');

  const hasDifference = Math.abs(report.check_difference) > 0.01;

  return (
    <div className="bg-slate-100 min-h-screen">
      <PrintActions customBackPath="/reports" />

      {/* Main A4 Printable Sheet Content Chassis */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden">
        
        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle="المركز المالي (الميزانية العمومية)"
          documentNumber="BAL-REP"
          documentDate={new Date().toISOString().split('T')[0]}
          extraMeta={[
            { label: 'كما هي في تاريخ', value: asOfDate }
          ]}
        />

        {/* Equation Discrepancy Error Alert if balanced check fails */}
        {hasDifference && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex items-start gap-3 text-right text-xs font-sans text-red-800" dir="rtl">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-extrabold block">تنبيه وملاحظة هامة: يوجد فرق في معادلة قيد المركز المالي!</span>
              <p className="mt-1 text-red-700">
                قيمة الفارق غير الموزونة تبلغ: <strong className="font-mono">{formatNumberWithLatinDigits(report.check_difference)} {currentOrg?.currency_code || ''}</strong>. 
                يرجى مراجعة ميزان المراجعة والقيود غير المرحلة لضمان موازنة أرصدة الأصول مع الخصوم وتثبيتها.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-8 text-right font-sans mb-12 select-none" dir="rtl">
          
          {/* RIGHT COLUMN: ASSETS */}
          <div className="space-y-4">
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-slate-900 text-white font-black text-xs px-4 py-2 flex justify-between items-center">
                <span>أولاً: الأصول وموارد المنشأة</span>
                <span className="font-mono text-[9px] text-slate-350">Assets</span>
              </div>
              
              <div className="divide-y divide-slate-100 px-4 text-[11px] max-h-[140mm] overflow-y-auto">
                {assetsAccounts.length === 0 ? (
                  <div className="py-3 text-slate-400 italic text-center text-xs">لا توجد أصول مدرجة في الدليل حالياً.</div>
                ) : (
                  assetsAccounts.map((acc, idx) => (
                    <div key={acc.account_id || idx} className="py-2 flex justify-between items-center text-slate-700">
                      <div>
                        <span className="font-bold text-slate-500 font-mono text-[9px] ml-1.5">[{acc.account_code}]</span>
                        <span className="font-extrabold">{acc.account_name_ar}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-900">{formatNumberWithLatinDigits(acc.amount)}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex justify-between items-center text-xs font-black text-slate-950">
                <span>إجمالي قيم الأصول:</span>
                <span className="font-mono text-brand-blue">{formatNumberWithLatinDigits(report.total_assets)} {currentOrg?.currency_code || ''}</span>
              </div>
            </div>
          </div>

          {/* LEFT COLUMN: LIABILITIES & EQUITY */}
          <div className="space-y-4">
            
            {/* LIABILITIES SECTION */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-slate-900 text-white font-black text-xs px-4 py-2 flex justify-between items-center">
                <span>ثانياً: الالتزامات والخصوم المتداولة</span>
                <span className="font-mono text-[9px] text-slate-350">Liabilities</span>
              </div>
              
              <div className="divide-y divide-slate-100 px-4 text-[11px]">
                {liabilitiesAccounts.length === 0 ? (
                  <div className="py-3 text-slate-400 italic text-center text-xs">لا توجد التزامات أو مستحقات للموردين.</div>
                ) : (
                  liabilitiesAccounts.map((acc, idx) => (
                    <div key={acc.account_id || idx} className="py-2 flex justify-between items-center text-slate-700">
                      <div>
                        <span className="font-bold text-slate-500 font-mono text-[9px] ml-1.5">[{acc.account_code}]</span>
                        <span className="font-extrabold">{acc.account_name_ar}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-900">{formatNumberWithLatinDigits(acc.amount)}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex justify-between items-center text-xs font-black text-slate-950">
                <span>إجمالي مبالغ الخصوم والذمم:</span>
                <span className="font-mono">{formatNumberWithLatinDigits(report.total_liabilities)} {currentOrg?.currency_code || ''}</span>
              </div>
            </div>

            {/* EQUITY SECTION */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-slate-900 text-white font-black text-xs px-4 py-2 flex justify-between items-center">
                <span>ثالثاً: حقوق الملكية ورأس المال</span>
                <span className="font-mono text-[9px] text-slate-350">Owner's Equity</span>
              </div>
              
              <div className="divide-y divide-slate-100 px-4 text-[11px]">
                {equityAccounts.map((acc, idx) => (
                  <div key={acc.account_id || idx} className="py-2 flex justify-between items-center text-slate-700">
                    <div>
                      <span className="font-bold text-slate-500 font-mono text-[9px] ml-1.5">[{acc.account_code}]</span>
                      <span className="font-extrabold">{acc.account_name_ar}</span>
                    </div>
                    <span className="font-mono font-bold text-slate-900">{formatNumberWithLatinDigits(acc.amount)}</span>
                  </div>
                ))}
                
                {/* Dynamically Inject current period Net Income */}
                <div className="py-2 flex justify-between items-center text-slate-700 border-t border-dashed">
                  <div>
                    <span className="font-bold text-slate-400 font-mono text-[9px] ml-1.5">[SYSTEM]</span>
                    <span className="font-extrabold text-blue-700">أرباح / خسائر السنة الجارية (قائمة الدخل)</span>
                  </div>
                  <span className="font-mono font-black text-blue-800">{formatNumberWithLatinDigits(report.current_year_net_income)}</span>
                </div>
              </div>

              <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex justify-between items-center text-xs font-black text-slate-950">
                <span>إجمالي حقوق الملكية والأرباح:</span>
                <span className="font-mono">{formatNumberWithLatinDigits(report.total_equity + report.current_year_net_income)} {currentOrg?.currency_code || ''}</span>
              </div>
            </div>

            {/* TOTAL COMPONENT SUM */}
            <div className="bg-slate-900 text-white rounded-xl px-4 py-3 flex justify-between items-center text-xs font-black select-none">
              <span>إجمالي الالتزامات وحقوق الملكية:</span>
              <span className="font-mono text-brand-turquoise">
                {formatNumberWithLatinDigits(report.total_liabilities + report.total_equity + report.current_year_net_income)} {currentOrg?.currency_code || ''}
              </span>
            </div>

          </div>

        </div>

        {/* Closing notes and stamps */}
        <PrintFooter showSignatures={true} description="مستند مالي معتمد يعبر عن توازن أصول وخصوم وحقوق ملاك المنشأة كما هي مخرجة من ميزات المراجعة واليومية العامة آلياً. يخضع لتدقيق مراجعي الحسابات المعتمدين والمساهمين." />

      </div>
    </div>
  );
};
