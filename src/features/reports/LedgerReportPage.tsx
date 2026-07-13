import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { reportsService, LedgerReportResult, LedgerEntryRow } from '../../lib/reportsService';
import { accountingService } from '../../lib/accountingService';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { getErrorMessage } from '../../lib/errors';
import { FiscalYear, Account } from '../../types';
import { 
  Calendar, 
  RefreshCw, 
  AlertCircle,
  FileText,
  Bookmark,
  TrendingUp,
  Tag,
  ArrowRightLeft,
  RotateCcw
} from 'lucide-react';
import { ReportHeader } from './components/ReportHeader';
import { ReportActions } from './components/ReportActions';
import { ReportSignatures } from './components/ReportSignatures';
import { generateCSV, downloadCSV, generateReportFilename } from '../../lib/exportUtils';

export const LedgerReportPage: React.FC = () => {
  const { currentOrg } = useAuth();
  const [searchParams] = useSearchParams();
  
  // Date and filter states
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [excludeClosingEntries, setExcludeClosingEntries] = useState<boolean>(false);
  
  // Data lists
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);

  // States
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<LedgerReportResult | null>(null);

  const handleExportCSV = () => {
    if (!reportData) return;
    
    const currency = currentOrg?.currency_code || '';
    const csvRows: any[][] = [
      ['منشأة', currentOrg?.name_ar || currentOrg?.name || ''],
      ['التقرير', 'دفتر الأستاذ التفصيلي'],
      ['الحساب المالي', `${reportData.account.code} - ${reportData.account.name_ar}`],
      ['الفترة من', dateFrom],
      ['الفترة إلى', dateTo],
      ['العملة', currency],
      ['الرصيد الافتتاحي الفتري', reportData.opening_balance],
      ['الرصيد الختامي للفترة', reportData.closing_balance],
      ['إجمالي حركات مدين', reportData.total_debit],
      ['إجمالي حركات دائن', reportData.total_credit],
      ['استبعاد قيود الإقفال', excludeClosingEntries ? 'نعم' : 'لا'],
      [],
      ['التاريخ', 'رقم القيد', 'المرجع', 'الوصف', 'مدين', 'دائن', 'الرصيد الجاري'],
      ...reportData.entries.map(e => [
        e.date,
        e.entry_number || '',
        e.reference || '',
        e.description || '',
        e.debit,
        e.credit,
        e.running_balance
      ])
    ];

    const headers = ['دفتر الأستاذ المطور', 'التفاصيل'];
    const csvContent = generateCSV(headers, csvRows);
    const filename = generateReportFilename(`دفتر_الأستاذ_${reportData.account.code}`, dateFrom, dateTo);
    downloadCSV(csvContent, filename);
  };

  useEffect(() => {
    if (currentOrg) {
      initSetup();
    }
  }, [currentOrg, searchParams]);

  const initSetup = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 1. Fetch postable accounts
      const allAccounts = await accountingService.getAccounts(currentOrg!.id);
      const postable = allAccounts.filter(a => a.allow_direct_posting);
      setAccounts(postable);
      
      const paramAccountId = searchParams.get('accountId') || searchParams.get('account_id');
      const paramDateFrom = searchParams.get('dateFrom') || searchParams.get('date_from');
      const paramDateTo = searchParams.get('dateTo') || searchParams.get('date_to');

      let initialAccountId = '';
      if (paramAccountId && postable.some(a => a.id === paramAccountId)) {
        initialAccountId = paramAccountId;
        setSelectedAccountId(paramAccountId);
      } else if (postable.length > 0) {
        initialAccountId = postable[0].id;
        setSelectedAccountId(postable[0].id);
      }

      // 2. Fetch fiscal years
      const years = await accountingService.getFiscalYears(currentOrg!.id);
      setFiscalYears(years);
      
      let initialDateFrom = '';
      let initialDateTo = '';

      if (paramDateFrom && paramDateTo) {
        initialDateFrom = paramDateFrom;
        initialDateTo = paramDateTo;
        setDateFrom(paramDateFrom);
        setDateTo(paramDateTo);
      } else {
        const activeYear = years.find(y => y.is_current) || years[0];
        if (activeYear) {
          initialDateFrom = activeYear.start_date;
          initialDateTo = activeYear.end_date;
          setDateFrom(activeYear.start_date);
          setDateTo(activeYear.end_date);
        } else {
          const cy = new Date().getFullYear();
          initialDateFrom = `${cy}-01-01`;
          initialDateTo = `${cy}-12-31`;
          setDateFrom(initialDateFrom);
          setDateTo(initialDateTo);
        }
      }

      if (initialAccountId && initialDateFrom && initialDateTo) {
        fetchReport(initialAccountId, initialDateFrom, initialDateTo);
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  const fetchReport = async (accId = selectedAccountId, from = dateFrom, to = dateTo) => {
    if (!currentOrg || !accId || !from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const data = await reportsService.getLedgerReportAdvanced(
        currentOrg.id,
        accId,
        from,
        to,
        excludeClosingEntries
      );
      setReportData(data);
    } catch (err) {
      const errMsg = getErrorMessage(err);
      if (errMsg.includes('permission') || errMsg.includes('غير مصرح')) {
        setError('ليس لديك صلاحية لعرض دفتر الأستاذ المحاسبي.');
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReport();
  };

  const handleResetFilters = async () => {
    setExcludeClosingEntries(false);
    if (accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    }
    // Re-initialize dates
    await initSetup();
  };

  const getClassificationLabel = (classification?: string) => {
    if (!classification) return '';
    switch (classification) {
      case 'assets': return 'أصول';
      case 'liabilities': return 'التزامات';
      case 'equity': return 'حقوق ملكية';
      case 'revenue': return 'إيرادات';
      case 'expenses': return 'مصروفات';
      default: return classification;
    }
  };

  const getNatureLabel = (nature?: 'debit' | 'credit') => {
    if (!nature) return '';
    return nature === 'debit' ? 'مدين بطبيعته' : 'دائن بطبيعته';
  };

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl" id="ledger-report-page">
      
      {/* Filters form */}
      <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 print:hidden">
        <div className="flex flex-wrap gap-4 items-end">
          
          {/* Account Selector */}
          <div className="space-y-1.5 shrink-0 w-full sm:w-64">
            <label className="text-xs font-bold text-slate-500 block">اختر الحساب القابل للترحيل</label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 outline-none focus:border-brand-blue"
              required
              id="ledger-account-select"
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} - {acc.name_ar}
                </option>
              ))}
            </select>
          </div>

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

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold px-5 py-2.25 rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              id="btn-refresh-ledger"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>استعراض كشف الأستاذ</span>
            </button>

            <button
              type="button"
              onClick={handleResetFilters}
              disabled={loading}
              className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold px-4 py-2.25 rounded-xl transition flex items-center gap-2 cursor-pointer"
              title="إعادة ضبط الفلاتر لقيمها الافتراضية"
            >
              <RotateCcw className="w-4 h-4" />
              <span>إعادة ضبط</span>
            </button>
          </div>
        </div>

        {/* Closing entries exclusion filter */}
        <div className="pt-2 border-t border-slate-50 flex flex-wrap gap-6 text-xs text-slate-600">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={excludeClosingEntries} 
              onChange={(e) => setExcludeClosingEntries(e.target.checked)}
              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue h-3.5 w-3.5"
            />
            <span className="font-semibold">استبعاد حركات الإقفال السنوية (YEAR-CLOSE) من كشف الحساب</span>
          </label>
        </div>
      </form>

      {/* Action buttons row for report */}
      {reportData && !loading && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 print:hidden">
          <span className="text-xs font-bold text-slate-500">خيارات تصدير وطباعة كشف الأستاذ:</span>
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

      {loading && !reportData && (
        <div className="bg-white p-12 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-3 text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin text-brand-blue" />
          <span className="text-xs font-bold">جاري تحميل حركات دفتر الأستاذ التراكمية وحساب الرصيد الجاري...</span>
        </div>
      )}

      {reportData && !loading && (
        <>
          <ReportHeader
            reportName={`دفتر الأستاذ للحساب: ${reportData.account.code} - ${reportData.account.name_ar}`}
            dateFrom={dateFrom}
            dateTo={dateTo}
            excludeClosingEntries={excludeClosingEntries}
            yearStatus={fiscalYears.find(y => y.start_date === dateFrom && y.end_date === dateTo)?.status}
          />

          {/* Account Details & Balances Banner */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
            
            {/* Account meta */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-50 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-blue/10 rounded-xl flex items-center justify-center text-brand-blue">
                  <Bookmark className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-sm font-black text-slate-800">
                    {reportData.account.code} - {reportData.account.name_ar}
                  </h3>
                  {reportData.account.name_en && (
                    <p className="text-[11px] text-slate-400 font-medium">{reportData.account.name_en}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2.5 py-1 rounded-full">
                  التصنيف: {getClassificationLabel(reportData.account.classification)}
                </span>
                <span className="bg-brand-blue/10 text-brand-blue text-[10px] font-bold px-2.5 py-1 rounded-full">
                  {getNatureLabel(reportData.account.nature)}
                </span>
              </div>
            </div>

            {/* Financial summaries */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-1">
              
              {/* Opening Balance */}
              <div className="bg-slate-50/55 p-3.5 rounded-xl border border-slate-100 space-y-1">
                <span className="text-[9px] text-slate-400 font-bold block uppercase">رصيد افتتاحي (قبل {reportData.date_from})</span>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-slate-700 font-sans" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.opening_balance)}
                  </span>
                  <span className="bg-slate-200 text-slate-600 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">
                    {reportData.account.nature === 'debit' ? 'مدين' : 'دائن'}
                  </span>
                </div>
              </div>

              {/* Total Debit Movement */}
              <div className="bg-slate-50/55 p-3.5 rounded-xl border border-slate-100 space-y-1">
                <span className="text-[9px] text-slate-400 font-bold block uppercase">إجمالي حركات مديونية الفترة</span>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-emerald-600 font-sans" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.total_debit)}
                  </span>
                  <span className="bg-emerald-500/10 text-emerald-600 text-[9px] px-1.5 py-0.5 rounded font-bold">مدين (+)</span>
                </div>
              </div>

              {/* Total Credit Movement */}
              <div className="bg-slate-50/55 p-3.5 rounded-xl border border-slate-100 space-y-1">
                <span className="text-[9px] text-slate-400 font-bold block uppercase">إجمالي حركات دائنية الفترة</span>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-red-600 font-sans" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.total_credit)}
                  </span>
                  <span className="bg-red-500/10 text-red-600 text-[9px] px-1.5 py-0.5 rounded font-bold">دائن (-)</span>
                </div>
              </div>

              {/* Closing Balance */}
              <div className="bg-brand-blue/5 p-3.5 rounded-xl border border-brand-blue/10 space-y-1">
                <span className="text-[9px] text-brand-blue font-bold block uppercase">الرصيد الختامي الحالي</span>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-brand-blue font-sans" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(reportData.closing_balance)}
                  </span>
                  <span className="bg-brand-blue text-white text-[9px] px-1.5 py-0.5 rounded font-black uppercase">
                    {reportData.closing_balance >= 0 ? 'موجب' : 'مكشوف'}
                  </span>
                </div>
              </div>

            </div>

          </div>

          {/* Detailed Entries List */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden" id="ledger-table-container">
            <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-brand-blue" />
                <h3 className="text-xs font-extrabold text-slate-800">حركات الحساب التفصيلية والرصيد الجاري المستمر</h3>
              </div>
              <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2.5 py-0.5 rounded-full">
                {reportData.entries.length} حركة مسجلة
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/30 text-slate-500 font-bold">
                    <th className="py-3 px-4 w-28">التاريخ</th>
                    <th className="py-3 px-4 w-32">رقم المرجع / القيد</th>
                    <th className="py-3 px-4">الوصف والبيان التفصيلي</th>
                    <th className="py-3 px-4 w-28 text-left">مدين (Debited)</th>
                    <th className="py-3 px-4 w-28 text-left">دائن (Credited)</th>
                    <th className="py-3 px-4 w-32 text-left bg-blue-50/30 text-slate-700 font-black">الرصيد الجاري (Running)</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-xs text-slate-400 italic">
                        لم يتم رصد أي حركات منسوبة لهذا الحساب خلال الفترة المحددة.
                      </td>
                    </tr>
                  ) : (
                    reportData.entries.map((entry, idx) => (
                      <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors">
                        {/* Date */}
                        <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                          {entry.entry_date}
                        </td>

                        {/* Reference & Closing Entry Badge */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className="font-bold text-slate-800">{entry.reference}</span>
                            {entry.is_closing_entry && (
                              <span className="bg-amber-100 text-amber-800 text-[8px] font-bold px-1.5 py-0.25 rounded-full inline-block self-start">
                                قيد إقفال
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Description */}
                        <td className="py-3 px-4 text-slate-600 max-w-sm truncate" title={entry.description}>
                          {entry.description}
                        </td>

                        {/* Debit */}
                        <td className="py-3 px-4 text-left font-mono text-emerald-600 font-bold" style={{ direction: 'ltr' }}>
                          {entry.debit > 0 ? formatNumberWithLatinDigits(entry.debit) : '-'}
                        </td>

                        {/* Credit */}
                        <td className="py-3 px-4 text-left font-mono text-red-600 font-bold" style={{ direction: 'ltr' }}>
                          {entry.credit > 0 ? formatNumberWithLatinDigits(entry.credit) : '-'}
                        </td>

                        {/* Running Balance */}
                        <td className="py-3 px-4 text-left font-mono font-black text-slate-900 bg-blue-50/20" style={{ direction: 'ltr' }}>
                          {formatNumberWithLatinDigits(entry.running_balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <ReportSignatures />
        </>
      )}

    </div>
  );
};
