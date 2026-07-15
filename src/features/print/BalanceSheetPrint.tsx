import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { reportsService, AdvancedBalanceSheetResult, AdvancedBalanceSheetBreakdown } from '../../lib/reportsService';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { useTranslation } from '../../i18n/translations';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';

const PRINT_DICT = {
  ar: {
    title: 'قائمة المركز المالي (الميزانية العمومية)',
    asOf: 'كما هي في تاريخ',
    comparisonDate: 'تاريخ المقارنة',
    assetsSec: 'أولاً: الأصول وموارد المنشأة',
    liabilitiesSec: 'ثانياً: الالتزامات والخصوم',
    equitySec: 'ثالثاً: حقوق الملكية ورأس المال',
    totalAssets: 'إجمالي قيم الأصول:',
    totalLiabilities: 'إجمالي مبالغ الخصوم والذمم:',
    totalEquity: 'إجمالي حقوق الملكية والأرباح:',
    totalLiabilitiesEquity: 'إجمالي الالتزامات وحقوق الملكية:',
    netIncome: 'صافي أرباح / خسائر السنة الجارية (قائمة الدخل)',
    unbalancedAlert: 'تنبيه وملاحظة هامة: يوجد فرق في معادلة قيد المركز المالي!',
    unbalancedDesc: 'قيمة الفارق غير الموزونة تبلغ: ',
    unbalancedHint: 'يرجى مراجعة ميزان المراجعة والقيود غير المرحلة لضمان موازنة أرصدة الأصول مع الخصوم وتثبيتها.',
    emptyAssets: 'لا توجد أصول مدرجة في الدليل حالياً.',
    emptyLiab: 'لا توجد التزامات أو مستحقات للموردين.',
    footerDesc: 'تقرير مالي داخلي يعبر عن توازن أصول وخصوم وحقوق ملكية المنشأة مستخرج آلياً من ميزان المراجعة واليومية العامة وفق الممارسات المحاسبية المتبعة.',
    prevAmt: 'السابق:',
    variance: 'التغير:',
    loadingMsg: 'جاري موازنة الحسابات وتحميل المركز المالي للطباعة...',
    errorTitle: 'تعذر بناء المركز المالي',
    backBtn: 'رجوع للخلف',
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
    asOf: 'As of Date',
    comparisonDate: 'Comparison Date',
    assetsSec: 'First: Assets & Resources',
    liabilitiesSec: 'Second: Liabilities',
    equitySec: 'Third: Owner\'s Equity',
    totalAssets: 'Total Assets:',
    totalLiabilities: 'Total Liabilities & Payables:',
    totalEquity: 'Total Equity & Retained Earnings:',
    totalLiabilitiesEquity: 'Total Liabilities & Equity:',
    netIncome: 'Current Year Net Income (YTD)',
    unbalancedAlert: 'Important Notice: Balance sheet equation mismatch!',
    unbalancedDesc: 'The unbalanced difference amount is: ',
    unbalancedHint: 'Please review the trial balance and unposted entries to ensure correct asset, liability, and equity alignment.',
    emptyAssets: 'No assets recorded as of this date.',
    emptyLiab: 'No liabilities or vendor payables recorded.',
    footerDesc: 'Internal financial report representing the balance of organization assets, liabilities, and equity automatically generated from ledger entries according to accounting practices.',
    prevAmt: 'Prev:',
    variance: 'Var:',
    loadingMsg: 'Balancing accounts and generating balance sheet printout...',
    errorTitle: 'Could not compile balance sheet',
    backBtn: 'Go Back',
    currentAssetSec: 'Current Assets',
    nonCurrentAssetSec: 'Non-Current Assets',
    unclassifiedAssetsSec: 'Unclassified Assets',
    currentLiabilitySec: 'Current Liabilities',
    nonCurrentLiabilitySec: 'Non-Current Liabilities',
    unclassifiedLiabilitiesSec: 'Unclassified Liabilities',
    subtotal: 'Subtotal'
  }
};

export const BalanceSheetPrint: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { currentOrg } = useAuth();
  const { currentLanguage } = useTranslation();
  const isAr = currentLanguage === 'ar';
  const l = isAr ? PRINT_DICT.ar : PRINT_DICT.en;

  const asOfDate = searchParams.get('asOfDate') || '';
  const comparisonMode = searchParams.get('comparisonMode') || 'none';
  const comparisonDate = searchParams.get('comparisonDate') || '';

  const [report, setReport] = useState<AdvancedBalanceSheetResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id) {
      if (!asOfDate) {
        setLoading(false);
        setError(isAr ? 'يرجى تحديد تاريخ استحقاق المركز المالي لعرض الميزانية الرسمية.' : 'Please select an as-of date to generate the statement.');
        return;
      }
      loadReport();
    }
  }, [currentOrg?.id, asOfDate, comparisonMode, comparisonDate]);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const targetCompDate = (comparisonMode !== 'none' && comparisonDate) ? comparisonDate : null;
      const data = await reportsService.getAdvancedBalanceSheet(
        currentOrg!.id,
        asOfDate,
        targetCompDate
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-bold">{l.loadingMsg}</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-6 text-center space-y-4 shadow-xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" strokeWidth={1.5} />
          <div>
            <h3 className="text-sm font-bold text-slate-800 font-sans">{l.errorTitle}</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{error}</p>
          </div>
          <button
            onClick={() => window.history.back()}
            className="w-full py-2.25 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            {l.backBtn}
          </button>
        </div>
      </div>
    );
  }

  // Filter accounts by classifications
  const accountsList = report.accounts || [];
  const assetsCurrent = accountsList.filter(a => a.classification === 'assets' && a.balance_sheet_section === 'current_asset');
  const assetsNonCurrent = accountsList.filter(a => a.classification === 'assets' && a.balance_sheet_section === 'non_current_asset');
  const assetsUnclassified = accountsList.filter(a => a.classification === 'assets' && a.balance_sheet_section === null);

  const liabilitiesCurrent = accountsList.filter(a => a.classification === 'liabilities' && a.balance_sheet_section === 'current_liability');
  const liabilitiesNonCurrent = accountsList.filter(a => a.classification === 'liabilities' && a.balance_sheet_section === 'non_current_liability');
  const liabilitiesUnclassified = accountsList.filter(a => a.classification === 'liabilities' && a.balance_sheet_section === null);

  const equityAccounts = accountsList.filter(a => a.classification === 'equity');

  // Equation balance check with strict tolerance of 0.01
  const hasDifference = Math.abs(report.main_period.check_difference) > 0.01;
  const hasComparison = comparisonMode !== 'none' && report.comparison_period;

  const renderAccountRow = (acc: AdvancedBalanceSheetBreakdown) => {
    if (!hasComparison) {
      return (
        <div key={acc.account_id} className="py-1.5 flex justify-between items-center text-slate-700">
          <div>
            <span className="font-bold text-slate-400 font-mono text-[9px] ml-1.5">[{acc.account_code}]</span>
            <span className="font-extrabold">{isAr ? acc.account_name_ar : (acc.account_name_en || acc.account_name_ar)}</span>
          </div>
          <span className="font-mono font-bold text-slate-900">{formatNumberWithLatinDigits(acc.amount)}</span>
        </div>
      );
    }

    const prevAmt = acc.comparison_amount;
    const diff = acc.amount - prevAmt;
    let percentChange: number | string = 0;
    if (prevAmt === 0) {
      percentChange = acc.amount === 0 ? 0 : '-';
    } else {
      percentChange = ((acc.amount - prevAmt) / Math.abs(prevAmt)) * 100;
    }

    const isPositive = diff > 0.005;
    const isNegative = diff < -0.005;
    const colorClass = isPositive ? 'text-emerald-700 font-bold' : isNegative ? 'text-rose-700 font-bold' : 'text-slate-500';
    const sign = isPositive ? '+' : '';

    return (
      <div key={acc.account_id} className="py-2 flex flex-col gap-0.5 text-slate-700 border-b border-slate-100 last:border-none">
        <div className="flex justify-between items-center">
          <div>
            <span className="font-bold text-slate-400 font-mono text-[9px] ml-1.5">[{acc.account_code}]</span>
            <span className="font-extrabold">{isAr ? acc.account_name_ar : (acc.account_name_en || acc.account_name_ar)}</span>
          </div>
          <span className="font-mono font-black text-slate-900">{formatNumberWithLatinDigits(acc.amount)}</span>
        </div>
        <div className="flex justify-between items-center text-[9px] text-slate-400 font-mono" style={{ direction: 'ltr' }}>
          <div className="flex gap-1.5">
            <span>{l.prevAmt} {formatNumberWithLatinDigits(prevAmt)}</span>
            <span className={colorClass}>
              ({l.variance} {sign}{formatNumberWithLatinDigits(diff)})
            </span>
          </div>
          <span className={`px-1 rounded-sm text-[8px] font-bold ${
            isPositive ? 'bg-emerald-50 text-emerald-800' : isNegative ? 'bg-rose-50 text-rose-800' : 'bg-slate-100 text-slate-600'
          }`}>
            {typeof percentChange === 'number' ? `${sign}${formatNumberWithLatinDigits(percentChange, 1)}%` : percentChange}
          </span>
        </div>
      </div>
    );
  };

  const renderComparisonFooterBlock = (currentVal: number, prevVal: number) => {
    if (!hasComparison) return null;
    const diff = currentVal - prevVal;
    let percentChange: number | string = 0;
    if (prevVal === 0) {
      percentChange = currentVal === 0 ? 0 : '-';
    } else {
      percentChange = ((currentVal - prevVal) / Math.abs(prevVal)) * 100;
    }

    const isPositive = diff > 0.005;
    const isNegative = diff < -0.005;
    const colorClass = isPositive ? 'text-emerald-700' : isNegative ? 'text-rose-700' : 'text-slate-500';
    const sign = isPositive ? '+' : '';

    return (
      <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono mt-1" style={{ direction: 'ltr' }}>
        <div className="flex gap-2">
          <span>{l.prevAmt} {formatNumberWithLatinDigits(prevVal)}</span>
          <span className={`${colorClass} font-bold`}>({sign}{formatNumberWithLatinDigits(diff)})</span>
        </div>
        <span className={`px-1 rounded-sm text-[8px] font-black ${
          isPositive ? 'bg-emerald-50 text-emerald-800' : isNegative ? 'bg-rose-50 text-rose-800' : 'bg-slate-100 text-slate-600'
        }`}>
          {typeof percentChange === 'number' ? `${sign}${formatNumberWithLatinDigits(percentChange, 1)}%` : percentChange}
        </span>
      </div>
    );
  };

  return (
    <div className="bg-slate-100 min-h-screen" dir={isAr ? 'rtl' : 'ltr'}>
      <PrintActions customBackPath="/reports" />

      {/* Main A4 Printable Sheet Content Chassis */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden text-right">
        
        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle={l.title}
          documentNumber="BAL-REP-ADV"
          documentDate={new Date().toISOString().split('T')[0]}
          extraMeta={[
            { label: l.asOf, value: asOfDate },
            ...(hasComparison ? [{ label: l.comparisonDate, value: comparisonDate }] : [])
          ]}
        />

        {/* Equation Discrepancy Error Alert if balanced check fails */}
        {hasDifference && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex items-start gap-3 text-right text-xs font-sans text-red-800">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-extrabold block">{l.unbalancedAlert}</span>
              <p className="mt-1 text-red-700 leading-relaxed">
                {l.unbalancedDesc} <strong className="font-mono">{formatNumberWithLatinDigits(report.main_period.check_difference)} {currentOrg?.currency_code || ''}</strong>. 
                {l.unbalancedHint}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-8 text-right font-sans mb-12 select-none">
          
          {/* RIGHT COLUMN: ASSETS */}
          <div className="space-y-4">
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col h-full bg-white text-[11px]">
              
              <div className="bg-slate-900 text-white font-black text-xs px-4 py-2.5 flex justify-between items-center">
                <span>{l.assetsSec}</span>
                <span className="font-mono text-[9px] text-slate-300">Assets</span>
              </div>
              
              <div className="px-4 py-3 flex-1 space-y-4">
                
                {/* Current Assets */}
                <div className="space-y-1">
                  <div className="bg-slate-50 px-2 py-1 rounded font-black text-[10px] text-slate-700 border-r-2 border-brand-blue flex justify-between items-center">
                    <span>{l.currentAssetSec}</span>
                    <span className="font-mono" style={{ direction: 'ltr' }}>{formatNumberWithLatinDigits(report.main_period.assets_current)}</span>
                  </div>
                  <div className="divide-y divide-slate-100 pl-1.5 pr-1.5">
                    {assetsCurrent.map((acc) => renderAccountRow(acc))}
                  </div>
                </div>

                {/* Non-Current Assets */}
                <div className="space-y-1">
                  <div className="bg-slate-50 px-2 py-1 rounded font-black text-[10px] text-slate-700 border-r-2 border-indigo-500 flex justify-between items-center">
                    <span>{l.nonCurrentAssetSec}</span>
                    <span className="font-mono" style={{ direction: 'ltr' }}>{formatNumberWithLatinDigits(report.main_period.assets_non_current)}</span>
                  </div>
                  <div className="divide-y divide-slate-100 pl-1.5 pr-1.5">
                    {assetsNonCurrent.map((acc) => renderAccountRow(acc))}
                  </div>
                </div>

                {/* Unclassified Assets */}
                {assetsUnclassified.length > 0 && (
                  <div className="space-y-1">
                    <div className="bg-amber-50 px-2 py-1 rounded font-black text-[10px] text-amber-800 border-r-2 border-amber-500 flex justify-between items-center">
                      <span>{l.unclassifiedAssetsSec}</span>
                      <span className="font-mono" style={{ direction: 'ltr' }}>{formatNumberWithLatinDigits(report.main_period.assets_unclassified)}</span>
                    </div>
                    <div className="divide-y divide-slate-100 pl-1.5 pr-1.5">
                      {assetsUnclassified.map((acc) => renderAccountRow(acc))}
                    </div>
                  </div>
                )}

              </div>

              <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 text-xs font-black text-slate-950 flex flex-col justify-end mt-auto">
                <div className="flex justify-between items-center">
                  <span>{l.totalAssets}</span>
                  <span className="font-mono text-brand-blue">{formatNumberWithLatinDigits(report.main_period.total_assets)} {currentOrg?.currency_code || ''}</span>
                </div>
                {hasComparison && renderComparisonFooterBlock(report.main_period.total_assets, report.comparison_period!.total_assets)}
              </div>
            </div>
          </div>

          {/* LEFT COLUMN: LIABILITIES & EQUITY */}
          <div className="space-y-4">
            
            {/* LIABILITIES SECTION */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white text-[11px]">
              <div className="bg-slate-900 text-white font-black text-xs px-4 py-2.5 flex justify-between items-center">
                <span>{l.liabilitiesSec}</span>
                <span className="font-mono text-[9px] text-slate-300">Liabilities</span>
              </div>
              
              <div className="px-4 py-3 space-y-4">
                
                {/* Current Liabilities */}
                <div className="space-y-1">
                  <div className="bg-slate-50 px-2 py-1 rounded font-black text-[10px] text-slate-700 border-r-2 border-red-500 flex justify-between items-center">
                    <span>{l.currentLiabilitySec}</span>
                    <span className="font-mono" style={{ direction: 'ltr' }}>{formatNumberWithLatinDigits(report.main_period.liabilities_current)}</span>
                  </div>
                  <div className="divide-y divide-slate-100 pl-1.5 pr-1.5">
                    {liabilitiesCurrent.map((acc) => renderAccountRow(acc))}
                  </div>
                </div>

                {/* Non-Current Liabilities */}
                <div className="space-y-1">
                  <div className="bg-slate-50 px-2 py-1 rounded font-black text-[10px] text-slate-700 border-r-2 border-rose-500 flex justify-between items-center">
                    <span>{l.nonCurrentLiabilitySec}</span>
                    <span className="font-mono" style={{ direction: 'ltr' }}>{formatNumberWithLatinDigits(report.main_period.liabilities_non_current)}</span>
                  </div>
                  <div className="divide-y divide-slate-100 pl-1.5 pr-1.5">
                    {liabilitiesNonCurrent.map((acc) => renderAccountRow(acc))}
                  </div>
                </div>

                {/* Unclassified Liabilities */}
                {liabilitiesUnclassified.length > 0 && (
                  <div className="space-y-1">
                    <div className="bg-amber-50 px-2 py-1 rounded font-black text-[10px] text-amber-800 border-r-2 border-amber-500 flex justify-between items-center">
                      <span>{l.unclassifiedLiabilitiesSec}</span>
                      <span className="font-mono" style={{ direction: 'ltr' }}>{formatNumberWithLatinDigits(report.main_period.liabilities_unclassified)}</span>
                    </div>
                    <div className="divide-y divide-slate-100 pl-1.5 pr-1.5">
                      {liabilitiesUnclassified.map((acc) => renderAccountRow(acc))}
                    </div>
                  </div>
                )}

              </div>

              <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 text-xs font-black text-slate-950 flex flex-col">
                <div className="flex justify-between items-center">
                  <span>{l.totalLiabilities}</span>
                  <span className="font-mono text-slate-900">{formatNumberWithLatinDigits(report.main_period.total_liabilities)} {currentOrg?.currency_code || ''}</span>
                </div>
                {hasComparison && renderComparisonFooterBlock(report.main_period.total_liabilities, report.comparison_period!.total_liabilities)}
              </div>
            </div>

            {/* EQUITY SECTION */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white text-[11px]">
              <div className="bg-slate-900 text-white font-black text-xs px-4 py-2.5 flex justify-between items-center">
                <span>{l.equitySec}</span>
                <span className="font-mono text-[9px] text-slate-300">Equity</span>
              </div>
              
              <div className="divide-y divide-slate-100 px-4 py-2">
                {equityAccounts.map((acc) => renderAccountRow(acc))}
                
                {/* Dynamically Inject current period Net Income */}
                {hasComparison ? (
                  <div className="py-2 flex flex-col gap-0.5 text-slate-700 border-t border-dashed">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-bold text-slate-400 font-mono text-[9px] ml-1.5">[SYSTEM]</span>
                        <span className="font-extrabold text-blue-700">{l.netIncome}</span>
                      </div>
                      <span className="font-mono font-black text-blue-800">{formatNumberWithLatinDigits(report.main_period.current_year_net_income)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[9px] text-slate-400 font-mono" style={{ direction: 'ltr' }}>
                      <div className="flex gap-1.5">
                        <span>{l.prevAmt} {formatNumberWithLatinDigits(report.comparison_period!.current_year_net_income)}</span>
                        <span className={report.main_period.current_year_net_income - report.comparison_period!.current_year_net_income > 0 ? 'text-emerald-700 font-bold' : report.main_period.current_year_net_income - report.comparison_period!.current_year_net_income < 0 ? 'text-rose-700 font-bold' : 'text-slate-500'}>
                          ({l.variance} {report.main_period.current_year_net_income - report.comparison_period!.current_year_net_income > 0 ? '+' : ''}{formatNumberWithLatinDigits(report.main_period.current_year_net_income - report.comparison_period!.current_year_net_income)})
                        </span>
                      </div>
                      <span className={`px-1 rounded-sm text-[8px] font-bold ${
                        report.main_period.current_year_net_income - report.comparison_period!.current_year_net_income > 0 ? 'bg-emerald-50 text-emerald-800' : report.main_period.current_year_net_income - report.comparison_period!.current_year_net_income < 0 ? 'bg-rose-50 text-rose-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {report.comparison_period!.current_year_net_income !== 0 ? `${report.main_period.current_year_net_income - report.comparison_period!.current_year_net_income > 0 ? '+' : ''}${formatNumberWithLatinDigits(((report.main_period.current_year_net_income - report.comparison_period!.current_year_net_income) / Math.abs(report.comparison_period!.current_year_net_income)) * 100, 1)}%` : '-'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="py-2 flex justify-between items-center text-slate-700 border-t border-dashed">
                    <div>
                      <span className="font-bold text-slate-400 font-mono text-[9px] ml-1.5">[SYSTEM]</span>
                      <span className="font-extrabold text-blue-700">{l.netIncome}</span>
                    </div>
                    <span className="font-mono font-black text-blue-800">{formatNumberWithLatinDigits(report.main_period.current_year_net_income)}</span>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 text-xs font-black text-slate-950 flex flex-col">
                <div className="flex justify-between items-center">
                  <span>{l.totalEquity}</span>
                  <span className="font-mono">{formatNumberWithLatinDigits(report.main_period.total_equity_and_income)} {currentOrg?.currency_code || ''}</span>
                </div>
                {hasComparison && renderComparisonFooterBlock(report.main_period.total_equity_and_income, report.comparison_period!.total_equity_and_income)}
              </div>
            </div>

            {/* TOTAL COMPONENT SUM (B) */}
            <div className="bg-slate-900 text-white rounded-xl px-4 py-3 flex flex-col justify-between text-xs font-black select-none">
              <div className="flex justify-between items-center">
                <span>{l.totalLiabilitiesEquity}</span>
                <span className="font-mono text-brand-turquoise">
                  {formatNumberWithLatinDigits(report.main_period.total_liabilities + report.main_period.total_equity_and_income)} {currentOrg?.currency_code || ''}
                </span>
              </div>
              {hasComparison && (
                <div className="flex justify-between items-center text-[9px] text-slate-300 font-mono mt-1" style={{ direction: 'ltr' }}>
                  <div className="flex gap-2">
                    <span>{l.prevAmt} {formatNumberWithLatinDigits(report.comparison_period!.total_liabilities + report.comparison_period!.total_equity_and_income)}</span>
                    <span className="text-brand-turquoise font-bold">
                      ({formatNumberWithLatinDigits((report.main_period.total_liabilities + report.main_period.total_equity_and_income) - (report.comparison_period!.total_liabilities + report.comparison_period!.total_equity_and_income))})
                    </span>
                  </div>
                  <span className="bg-slate-800 px-1 rounded-sm text-[8px] font-black text-brand-turquoise">
                    {report.comparison_period!.total_liabilities + report.comparison_period!.total_equity_and_income !== 0 ? `${formatNumberWithLatinDigits((((report.main_period.total_liabilities + report.main_period.total_equity_and_income) - (report.comparison_period!.total_liabilities + report.comparison_period!.total_equity_and_income)) / Math.abs(report.comparison_period!.total_liabilities + report.comparison_period!.total_equity_and_income)) * 100, 1)}%` : '-'}
                  </span>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Closing notes and stamps */}
        <PrintFooter showSignatures={true} description={l.footerDesc} />

      </div>
    </div>
  );
};
