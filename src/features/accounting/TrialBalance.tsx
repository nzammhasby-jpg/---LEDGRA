import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { journalService } from '../../lib/journalService';
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
  AlertCircle
} from 'lucide-react';

interface TrialBalanceRow {
  id: string;
  code: string;
  name_ar: string;
  name_en: string | null;
  classification: string;
  nature: string;
  allow_direct_posting: boolean;
  debit: number;
  credit: number;
  net_balance: number;
}

export const TrialBalance: React.FC = () => {
  const { currentOrg } = useAuth();
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);

  // Filters
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Results
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
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
        
        // Directly fetch the trial balance for this year
        const results = await journalService.getTrialBalance(currentOrg!.id, {
          fiscalYearId: activeY.id
        });
        setRows(results);
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setBaselineLoading(false);
    }
  };

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;

    setLoading(true);
    setError(null);
    try {
      const results = await journalService.getTrialBalance(currentOrg.id, {
        fiscalYearId: selectedYearId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined
      });
      setRows(results);
    } catch (err: any) {
      setError(getErrorMessage(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    const activeY = fiscalYears.find(y => y.is_current) || fiscalYears[0];
    setSelectedYearId(activeY ? activeY.id : '');
    setStartDate('');
    setEndDate('');
    setError(null);
    
    setTimeout(() => {
      if (currentOrg) {
        setLoading(true);
        journalService.getTrialBalance(currentOrg.id, {
          fiscalYearId: activeY ? activeY.id : undefined
        }).then(res => {
          setRows(res);
        }).catch(err => {
          setError(getErrorMessage(err));
        }).finally(() => {
          setLoading(false);
        });
      }
    }, 50);
  };

  const getClassificationLabel = (classification: string): string => {
    switch (classification) {
      case 'assets': return 'الأصول (Assets)';
      case 'liabilities': return 'الخصوم / الالتزامات (Liabilities)';
      case 'equity': return 'حقوق الملكية (Equity)';
      case 'revenue': return 'الإيرادات (Revenue)';
      case 'expenses': return 'المصروفات (Expenses)';
      default: return classification;
    }
  };

  // Sum only leaf accounts (where allow_direct_posting is true) to prevent double counting parent nodes!
  const leafRows = rows.filter(r => r.allow_direct_posting);
  const totalDebitsSum = leafRows.reduce((sum, r) => sum + r.debit, 0);
  const totalCreditsSum = leafRows.reduce((sum, r) => sum + r.credit, 0);
  const isEquationBalanced = Math.abs(totalDebitsSum - totalCreditsSum) < 0.01;

  return (
    <div className="space-y-6 animate-fadeIn">
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
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <form onSubmit={handleGenerateReport} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Year select */}
          <div className="flex flex-col gap-1.5Col">
            <label className="text-[10px] font-bold text-slate-500 mb-1">تحديد السنة المالية</label>
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
                <label className="text-[10px] font-bold text-slate-500 mb-1">من تاريخ</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 mb-1">إلى تاريخ</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none font-mono"
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
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center">
          <div className="w-8 h-8 border-4 border-slate-100 border-t-brand-blue rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-400 mt-4">جاري جمع وحصر أرصدة الدليل الدفتري، وتصنيف الأصول والالتزامات للقيود المرحلة...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center text-slate-400 flex flex-col items-center justify-center">
          <FileCheck className="w-12 h-12 text-slate-200 mb-3" />
          <span className="font-bold text-sm text-slate-500">لا توجد بيانات حسابات مستخرجة لميزان المراجعة</span>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">تأكد ترحيل القيود اليومية الأولى لتتمكن من استخلاص المجاميع والتوازنات في هذا الجدول الكشفي.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Dashboard info overview card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-bold text-xs text-white">
            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800">
              <span className="text-slate-400 block font-semibold text-[10px]">إجمالي أرصدة الجانب المدين (Leaves)</span>
              <span className="text-base font-mono block mt-1.5 tabular-nums text-emerald-400">{formatNumberWithLatinDigits(totalDebitsSum)} ر.س</span>
            </div>
            
            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800">
              <span className="text-slate-400 block font-semibold text-[10px]">إجمالي أرصدة الجانب الدائن (Leaves)</span>
              <span className="text-base font-mono block mt-1.5 tabular-nums text-emerald-400">{formatNumberWithLatinDigits(totalCreditsSum)} ر.س</span>
            </div>

            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
              <span className="text-slate-400 block font-semibold text-[10px]">موازنة المعادلة المحاسبية للميزان</span>
              {isEquationBalanced ? (
                <div className="flex items-center gap-1.5 text-emerald-400 text-sm mt-1.5">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full inline-block animate-pulse"></span>
                  <span>المعادلة متوازنة تماماً (الفرق صفر)</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-rose-400 text-sm mt-1.5">
                  <span className="w-2.5 h-2.5 bg-rose-500 rounded-full inline-block animate-pulse"></span>
                  <span>فرق غير موازن: {formatNumberWithLatinDigits(Math.abs(totalDebitsSum - totalCreditsSum))} ر.س</span>
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
                    <th className="px-4 py-3.5">رمز الحساب</th>
                    <th className="px-4 py-3.5">اسم وتصنيف الحساب المحاسبي</th>
                    <th className="px-4 py-3.5">التصنيف الرئيسي</th>
                    <th className="px-4 py-3.5 text-center">طبيعة الحساب</th>
                    <th className="px-4 py-3.5 text-center">نوع الحساب</th>
                    <th className="px-4 py-3.5 text-center w-28">الحركة المدينة (+)</th>
                    <th className="px-4 py-3.5 text-center w-28">الحركة الدائنة (-)</th>
                    <th className="px-4 py-3.5 text-center w-36">صافي الرصيد الدفتري</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {rows.map((row) => (
                    <tr key={row.code} className={`hover:bg-slate-50/20 transition-colors ${!row.allow_direct_posting ? 'bg-slate-50/50 font-bold text-slate-900 select-none' : ''}`}>
                      {/* Code */}
                      <td className="px-4 py-3.5 font-mono select-all text-slate-900 text-[11px]" dir="ltr">
                        {row.code}
                      </td>
                      {/* Name with hierarchical indent if needed */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          {!row.allow_direct_posting && <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                          <span className={!row.allow_direct_posting ? 'font-black text-[12px]' : 'text-slate-800'}>
                            {row.name_ar}
                          </span>
                        </div>
                      </td>
                      {/* Classification */}
                      <td className="px-4 py-3.5 text-slate-500 text-[10px]">
                        {getClassificationLabel(row.classification)}
                      </td>
                      {/* Nature */}
                      <td className="px-4 py-3.5 text-center select-none">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          row.nature === 'debit' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                        }`}>
                          {row.nature === 'debit' ? 'مدين' : 'دائن'}
                        </span>
                      </td>
                      {/* Direct posting style */}
                      <td className="px-4 py-3.5 text-center select-none text-[10px] text-slate-400">
                        {row.allow_direct_posting ? 'حساب فرعي ترحيلي' : 'حساب رئيسي تجميعي'}
                      </td>
                      {/* Debits */}
                      <td className="px-4 py-3.5 font-mono text-center text-slate-900 tabular-nums text-left font-bold" dir="ltr font-bold">
                        {row.debit > 0 ? formatNumberWithLatinDigits(row.debit) : <span className="text-slate-300 font-normal">-</span>}
                      </td>
                      {/* Credits */}
                      <td className="px-4 py-3.5 font-mono text-center text-slate-900 tabular-nums text-left font-bold" dir="ltr font-bold">
                        {row.credit > 0 ? formatNumberWithLatinDigits(row.credit) : <span className="text-slate-300 font-normal">-</span>}
                      </td>
                      {/* Net balance */}
                      <td className="px-4 py-3.5 font-mono text-center tabular-nums text-slate-950 font-black text-left" dir="ltr">
                        <span className={row.net_balance < 0 ? 'text-rose-600' : 'text-emerald-700'}>
                          {formatNumberWithLatinDigits(Math.abs(row.net_balance))} {row.net_balance < 0 ? 'رصيد عكسي' : 'رصيد طبيعي'}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Balancing leaf accounts sum row */}
                  <tr className="bg-slate-900 text-white font-bold border-t-2 border-slate-950">
                    <td className="px-4 py-4" colSpan={5}>
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        <span>إجمالي توازن المفردات للدفاتر (فقط الحسابات الفرعية الترحيلية)</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-left text-emerald-400 text-sm tabular-nums" dir="ltr">
                      {formatNumberWithLatinDigits(totalDebitsSum)}
                    </td>
                    <td className="px-4 py-4 font-mono text-left text-emerald-400 text-sm tabular-nums" dir="ltr">
                      {formatNumberWithLatinDigits(totalCreditsSum)}
                    </td>
                    <td className="px-4 py-4 font-mono text-left text-emerald-405 text-sm tabular-nums" dir="ltr">
                      <span className={isEquationBalanced ? 'text-emerald-400' : 'text-red-400'}>
                        {isEquationBalanced ? 'متوازن 0.00' : formatNumberWithLatinDigits(Math.abs(totalDebitsSum - totalCreditsSum))}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
