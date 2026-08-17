import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { reportsService, TaxReportResult } from '../../lib/reportsService';
import { accountingService } from '../../lib/accountingService';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { getErrorMessage } from '../../lib/errors';
import { getCountryProfile } from '../../lib/countryProfiles';
import { FiscalYear } from '../../types';
import { 
  Percent,
  Calendar, 
  RefreshCw, 
  AlertCircle,
  FileText,
  Info,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { ReportHeader } from './components/ReportHeader';
import { ReportActions } from './components/ReportActions';
import { ReportSignatures } from './components/ReportSignatures';
import { generateCSV, downloadCSV, generateReportFilename } from '../../lib/exportUtils';

export const TaxReportPage: React.FC = () => {
  const { currentOrg } = useAuth();
  
  // Date states
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  
  // States
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<TaxReportResult | null>(null);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);

  const handleExportCSV = () => {
    if (!reportData) return;
    
    const currency = currentOrg?.currency_code || '';
    const csvRows: any[][] = [
      ['منشأة', currentOrg?.name_ar || currentOrg?.name_en || ''],
      ['التقرير', 'التقرير الضريبي لضريبة القيمة المضافة'],
      ['الفترة من', dateFrom],
      ['الفترة إلى', dateTo],
      ['العملة', currency],
      [],
      ['ملخص ضريبة القيمة المضافة'],
      ['نوع الضريبة', `القيمة (${currency})`],
      ['إجمالي ضريبة المخرجات (المبيعات)', reportData.total_output_tax],
      ['إجمالي ضريبة المدخلات (المشتريات)', reportData.total_input_tax],
      ['صافي الضريبة مستحقة / (مستردة)', reportData.net_tax_due],
      [],
      ['تفاصيل حركات ضريبة المخرجات (المبيعات)'],
      ['التاريخ', 'المرجع', 'الوصف', 'مدين', 'دائن'],
      ...reportData.output_tax_movements.map(m => [m.date, m.reference || '', m.description || '', m.debit, m.credit]),
      [],
      ['تفاصيل حركات ضريبة المدخلات (المشتريات)'],
      ['التاريخ', 'المرجع', 'الوصف', 'مدين', 'دائن'],
      ...reportData.input_tax_movements.map(m => [m.date, m.reference || '', m.description || '', m.debit, m.credit])
    ];

    const headers = ['مفتاح التقرير الضريبي', 'القيمة'];
    const csvContent = generateCSV(headers, csvRows);
    const filename = generateReportFilename('التقرير_الضريبي', dateFrom, dateTo);
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
      // Refresh years to get correct status
      const years = await accountingService.getFiscalYears(currentOrg.id);
      setFiscalYears(years);

      const data = await reportsService.getTaxReport(currentOrg.id, from, to);
      setReportData(data);

      // Verify if tax accounts are not configured
      if (!data.output_tax_account_id && !data.input_tax_account_id) {
        setError('تنبيه: لم يتم ضبط الحسابات الافتراضية للضرائب في إعدادات المنشأة المحاسبية.');
      }
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
    <div className="space-y-6 text-right font-sans" dir="rtl">
      
      {/* Filters bar */}
      <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-wrap gap-4 items-end shadow-sm print:hidden">
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
          <span>عرض التقرير الضريبي</span>
        </button>

        {matchedYear && (
          <div className="mr-auto self-center">
            {getYearStatusBadge(matchedYear.status)}
          </div>
        )}
      </form>

      {/* Action buttons row for report */}
      {reportData && !loading && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 print:hidden">
          <span className="text-xs font-bold text-slate-500">خيارات تصدير وطباعة الإقرار الضريبي:</span>
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

      {/* Loading overlay for data changes */}
      {loading && !reportData && (
        <div className="bg-white p-12 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-3 text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin text-brand-blue" />
          <span className="text-xs font-bold">جاري تجميع حركات الضرائب الفترية ومطابقة الحسابات...</span>
        </div>
      )}

      {/* Overview financial totals cards */}
      {reportData && !loading && (
        <>
          <ReportHeader
            reportName="التقرير الضريبي لضريبة القيمة المضافة"
            dateFrom={dateFrom}
            dateTo={dateTo}
            yearStatus={matchedYear?.status}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Output Tax (Collected) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">إجمالي ضريبة المخرجات (المبيعات)</span>
              <div className="flex items-center justify-between">
                <span className="text-xl font-extrabold text-red-600 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.total_output_tax)}
                </span>
                <span className="bg-red-500/10 text-red-600 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">{currentOrg?.currency_code || ''}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">الضريبة المحصلة من عملائك على المبيعات المصدرة.</p>
            </div>

            {/* Input Tax (Paid) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">إجمالي ضريبة المدخلات (المشتريات)</span>
              <div className="flex items-center justify-between">
                <span className="text-xl font-extrabold text-emerald-600 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.total_input_tax)}
                </span>
                <span className="bg-emerald-500/10 text-emerald-600 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">{currentOrg?.currency_code || ''}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">الضريبة المدفوعة لمورديك على المشتريات والمصروفات المؤهلة.</p>
            </div>

            {/* Net Tax Due Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">صافي الضريبة للإقرار الفتري</span>
                <div className="flex items-center justify-between mt-1">
                  <span className={`text-xl font-extrabold font-sans ${reportData.net_tax_due >= 0 ? 'text-brand-blue' : 'text-emerald-600'}`} style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(Math.abs(reportData.net_tax_due))}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${reportData.net_tax_due >= 0 ? 'bg-brand-blue/10 text-brand-blue' : 'bg-emerald-500/10 text-emerald-600'} uppercase`}>
                    {reportData.net_tax_due >= 0 ? 'مستحقة للدفع' : 'مستردة للشركة'}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-50 pt-2.5 mt-2.5 flex items-center gap-1.5 text-xs">
                {reportData.net_tax_due >= 0 ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-slate-600 font-bold">
                      {getCountryProfile(currentOrg?.country_code).code === 'YE'
                        ? 'ضريبة مستحقة لمصلحة الضرائب اليمنية'
                        : 'ضريبة مستحقة للهيئة العامة للزكاة والضريبة والجمارك'
                      } ({currentOrg?.currency_code || ''})
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-emerald-700 font-bold">ضريبة قابلة للاسترداد / خصم من الإقرارات القادمة ({currentOrg?.currency_code || ''})</span>
                  </>
                )}
              </div>
            </div>

          </div>
        </>
      )}

      {/* Details of Input & Output Tax Movements */}
      {reportData && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Output Tax Breakdown (Sales) */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-red-600" />
                <h3 className="text-xs font-extrabold text-slate-800">حركات ضريبة المخرجات (Output Tax)</h3>
              </div>
              <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">
                {reportData.output_tax_movements.length} حركة
              </span>
            </div>

            <div className="p-4 flex-1 overflow-x-auto max-h-[400px]">
              {reportData.output_tax_movements.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 italic">
                  لا توجد حركات مسجلة على حساب ضريبة المخرجات خلال هذه الفترة.
                </div>
              ) : (
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold">
                      <th className="pb-2">التاريخ</th>
                      <th className="pb-2">المرجع</th>
                      <th className="pb-2">الوصف / الحساب المقابل</th>
                      <th className="pb-2 text-left">مدين (دفع)</th>
                      <th className="pb-2 text-left">دائن (تحصيل)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.output_tax_movements.map((move, idx) => (
                      <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 font-mono text-slate-500 whitespace-nowrap">{move.date}</td>
                        <td className="py-2.5 font-bold text-slate-800">{move.reference || '-'}</td>
                        <td className="py-2.5 text-slate-600 max-w-xs truncate" title={move.description}>{move.description}</td>
                        <td className="py-2.5 font-mono text-left text-slate-400">{move.debit > 0 ? formatNumberWithLatinDigits(move.debit) : '-'}</td>
                        <td className="py-2.5 font-mono text-left text-red-600 font-semibold">{move.credit > 0 ? formatNumberWithLatinDigits(move.credit) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Input Tax Breakdown (Purchases) */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-extrabold text-slate-800">حركات ضريبة المدخلات (Input Tax)</h3>
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
                {reportData.input_tax_movements.length} حركة
              </span>
            </div>

            <div className="p-4 flex-1 overflow-x-auto max-h-[400px]">
              {reportData.input_tax_movements.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 italic">
                  لا توجد حركات مسجلة على حساب ضريبة المدخلات خلال هذه الفترة.
                </div>
              ) : (
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold">
                      <th className="pb-2">التاريخ</th>
                      <th className="pb-2">المرجع</th>
                      <th className="pb-2">الوصف / الحساب المقابل</th>
                      <th className="pb-2 text-left">مدين (مدفوع)</th>
                      <th className="pb-2 text-left">دائن (استرداد)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.input_tax_movements.map((move, idx) => (
                      <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 font-mono text-slate-500 whitespace-nowrap">{move.date}</td>
                        <td className="py-2.5 font-bold text-slate-800">{move.reference || '-'}</td>
                        <td className="py-2.5 text-slate-600 max-w-xs truncate" title={move.description}>{move.description}</td>
                        <td className="py-2.5 font-mono text-left text-emerald-600 font-semibold">{move.debit > 0 ? formatNumberWithLatinDigits(move.debit) : '-'}</td>
                        <td className="py-2.5 font-mono text-left text-slate-400">{move.credit > 0 ? formatNumberWithLatinDigits(move.credit) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>
      )}

      {reportData && !loading && (
        <ReportSignatures />
      )}

    </div>
  );
};
