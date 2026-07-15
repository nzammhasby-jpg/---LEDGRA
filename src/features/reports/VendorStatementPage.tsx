import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { reportsService, VendorStatementResult } from '../../lib/reportsService';
import { masterDataService } from '../../lib/masterDataService';
import { Vendor } from '../../types';
import { formatNumberWithLatinDigits, formatDateWithEnglishDigits } from '../../lib/formatters';
import { getErrorMessage } from '../../lib/errors';
import { 
  Truck, 
  Calendar, 
  RefreshCw, 
  AlertCircle,
  FileSpreadsheet,
  Printer,
  Info,
  RotateCcw
} from 'lucide-react';
import { ReportHeader } from './components/ReportHeader';
import { ReportActions } from './components/ReportActions';
import { ReportSignatures } from './components/ReportSignatures';
import { generateCSV, downloadCSV, generateReportFilename } from '../../lib/exportUtils';

export const VendorStatementPage: React.FC = () => {
  const { currentOrg } = useAuth();
  
  // Lists
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  
  // Dates
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  
  // States
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [reportData, setReportData] = useState<VendorStatementResult | null>(null);

  useEffect(() => {
    if (currentOrg) {
      loadInitialData();
    }
  }, [currentOrg]);

  const loadInitialData = async () => {
    try {
      setLoadingList(true);
      const vendList = await masterDataService.getVendors(currentOrg!.id);
      setVendors(vendList || []);
      
      const cy = new Date().getFullYear();
      setDateFrom(`${cy}-01-01`);
      setDateTo(new Date().toISOString().split('T')[0]);
      
      if (vendList && vendList.length > 0) {
        setSelectedVendorId(vendList[0].id);
        fetchReport(vendList[0].id, `${cy}-01-01`, new Date().toISOString().split('T')[0]);
      }
    } catch (err) {
      setErrorCode(getErrorMessage(err));
    } finally {
      setLoadingList(false);
    }
  };

  const fetchReport = async (vendId = selectedVendorId, from = dateFrom, to = dateTo) => {
    if (!currentOrg) return;
    if (!vendId || !from || !to) {
      setErrorCode('الرجاء اختيار المورد وفترة التقرير كاملة.');
      return;
    }
    setLoadingReport(true);
    setErrorCode(null);
    try {
      const data = await reportsService.getVendorStatement(currentOrg.id, vendId, from, to);
      setReportData(data);
    } catch (err) {
      setErrorCode(getErrorMessage(err));
      setReportData(null);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleResetFilters = () => {
    const cy = new Date().getFullYear();
    setDateFrom(`${cy}-01-01`);
    setDateTo(new Date().toISOString().split('T')[0]);
    if (vendors.length > 0) {
      setSelectedVendorId(vendors[0].id);
      fetchReport(vendors[0].id, `${cy}-01-01`, new Date().toISOString().split('T')[0]);
    }
  };

  const handleExportCSV = () => {
    if (!reportData) return;
    const currency = currentOrg?.currency_code || '';
    const csvRows: any[][] = [
      ['منشأة', currentOrg?.name_ar || currentOrg?.name_en || ''],
      ['التقرير', `كشف حساب مورد: ${reportData.vendor_name}`],
      ['كود المورد', reportData.vendor_code || ''],
      ['الفترة من', dateFrom],
      ['الفترة إلى', dateTo],
      ['العملة', currency],
      [],
      ['الرصيد الافتتاحي', reportData.opening_balance],
      ['مجموع مدين (-)', reportData.total_debit],
      ['مجموع دائن (+)', reportData.total_credit],
      ['صافي الرصيد المستحق', reportData.closing_balance],
      [],
      ['التاريخ', 'المستند / القيد', 'المرجع', 'البيان', 'مدين', 'دائن', 'الرصيد التراكمي للالتزام'],
      ...reportData.movements.map(m => [
        m.date,
        m.journal_number,
        m.reference || '',
        m.description,
        m.debit,
        m.credit,
        m.running_balance
      ])
    ];

    const headers = ['كشف حساب مورد تفصيلي', 'التفاصيل'];
    const csvContent = generateCSV(headers, csvRows);
    const filename = generateReportFilename(`كشف_حساب_مورد_${reportData.vendor_name}`, dateFrom, dateTo);
    downloadCSV(csvContent, filename);
  };

  const handlePrint = () => {
    if (!selectedVendorId || !dateFrom || !dateTo) return;
    window.open(`#/print/vendor-statement?id=${selectedVendorId}&dateFrom=${dateFrom}&dateTo=${dateTo}`, '_blank');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReport();
  };

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      
      {/* Report Header Intro */}
      <div className="space-y-1">
        <h3 className="text-lg font-black text-slate-800">تقرير كشف حساب المورد بالتفصيل</h3>
        <p className="text-xs text-slate-500">
          استخرج كشفاً تفصيلياً بالحركات التجارية مع الموردين، المشتريات والمدفوعات والمستحقات التراكمية الخاصة بأي مورد محدد خلال الفترة المالية.
        </p>
      </div>

      {/* Controls Card */}
      <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-wrap gap-4 items-end shadow-sm">
        
        {/* Vendor select */}
        <div className="space-y-1.5 shrink-0 w-full sm:w-64">
          <label className="text-xs font-bold text-slate-500 block">اختر المورد</label>
          <div className="relative">
            <select
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2.5 pr-9 outline-none focus:border-brand-blue appearance-none font-bold"
              required
            >
              <option value="" disabled>--- إختر مورد ---</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.code ? `(${v.code})` : ''}
                </option>
              ))}
            </select>
            <Truck className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
          </div>
        </div>

        {/* Date From */}
        <div className="space-y-1.5 shrink-0">
          <label className="text-xs font-bold text-slate-500 block">بدءاً من تاريخ</label>
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

        {/* Date To */}
        <div className="space-y-1.5 shrink-0">
          <label className="text-xs font-bold text-slate-500 block">إلى تاريخ</label>
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
            disabled={loadingReport || loadingList}
            className="bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold px-5 py-2.25 rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loadingReport ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>عرض التقرير</span>
          </button>

          <button
            type="button"
            onClick={handleResetFilters}
            className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold px-4 py-2.25 rounded-xl transition flex items-center gap-2 cursor-pointer"
            title="إعادة ضبط الفلاتر لقيمها الافتراضية"
          >
            <RotateCcw className="w-4 h-4" />
            <span>إعادة ضبط</span>
          </button>
        </div>
      </form>

      {errorCode && (
        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl flex items-center gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span>{errorCode}</span>
        </div>
      )}

      {/* Action buttons row */}
      {reportData && !loadingReport && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 print:hidden">
          <span className="text-xs font-bold text-slate-500">خيارات تصدير وطباعة التقرير:</span>
          <ReportActions
            onPrint={handlePrint}
            onExportCSV={handleExportCSV}
            onRefresh={() => fetchReport()}
            loading={loadingReport}
          />
        </div>
      )}

      {/* Loading indicator */}
      {loadingReport && (
        <div className="bg-white p-12 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-3 text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin text-brand-blue" />
          <span className="text-xs font-bold">جاري تجميع حركات كشف حساب المورد والتحقق من الأرصدة...</span>
        </div>
      )}

      {/* Vendor Report Result Card */}
      {reportData && !loadingReport && (
        <div className="space-y-6">
          
          {/* Executive Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">الرصيد الافتتاحي المستحق للمورد (قبل الفترة)</span>
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold text-slate-800 font-sans" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.opening_balance)}
                </span>
                <span className="text-[10px] text-slate-450 font-bold bg-slate-100 px-2 py-0.5 rounded-full">{currentOrg?.currency_code || ''}</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">مشتريات والتزامات مضافة (دائن)</span>
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold text-red-650 font-sans" style={{ direction: 'ltr' }}>
                  + {formatNumberWithLatinDigits(reportData.total_credit)}
                </span>
                <span className="text-[10px] text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded-full">{currentOrg?.currency_code || ''}</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">سداد دفعات ومستندات صرف (مدين)</span>
              <div className="flex items-center justify-between">
                <span className="text-lg font-extrabold text-emerald-600 font-sans" style={{ direction: 'ltr' }}>
                  - {formatNumberWithLatinDigits(reportData.total_debit)}
                </span>
                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">{currentOrg?.currency_code || ''}</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">صافي الرصيد المستحق النهائي للمورد</span>
              <div className="flex items-center justify-between">
                <span className={`text-lg font-extrabold font-sans ${reportData.closing_balance >= 0 ? 'text-brand-blue' : 'text-emerald-650'}`} style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(reportData.closing_balance)}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${reportData.closing_balance >= 0 ? 'bg-brand-blue/10 text-brand-blue' : 'bg-emerald-500/10 text-emerald-650'}`}>
                  {reportData.closing_balance >= 0 ? 'مستحق للمورد' : 'له رصيد مدفوع مقدماً'}
                </span>
              </div>
            </div>

          </div>

          {/* Movements list table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            
            <div className="border-b border-slate-100 bg-slate-50/50 p-4 leading-normal flex items-center justify-between border-slate-150">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-brand-navy" />
                <h3 className="text-sm font-extrabold text-slate-800">
                  كشف حركات الحساب التفصيلي للمورد: <span className="text-brand-blue font-black">{reportData.vendor_name}</span>
                </h3>
              </div>
              <span className="font-mono text-[10px] text-slate-450 font-bold bg-slate-100 px-2.5 py-1 rounded-full">
                كود المورد: {reportData.vendor_code || '---'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                
                <thead>
                  <tr className="bg-slate-100/50 border-b border-slate-150 text-slate-500 select-none font-bold">
                    <th className="py-3 px-4 w-28">التاريخ</th>
                    <th className="py-3 px-4 w-32">المستند / القيد</th>
                    <th className="py-3 px-4 w-28">المرجع</th>
                    <th className="py-3 px-4">شرح حركة الحساب (البيان)</th>
                    <th className="py-3 px-4 text-left w-32">مدين (-)</th>
                    <th className="py-3 px-4 text-left w-32">دائن (+)</th>
                    <th className="py-3 px-4 text-left w-36 bg-slate-100/40">الرصيد التراكمي للالتزام</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 text-slate-700">
                  
                  {/* Opening line */}
                  <tr className="bg-slate-50/30 text-slate-500 font-bold">
                    <td className="py-2.5 px-4 font-mono">{formatDateWithEnglishDigits(dateFrom)}</td>
                    <td className="py-2.5 px-4">رصيد افتتاحي لها</td>
                    <td className="py-2.5 px-4">---</td>
                    <td className="py-2.5 px-4 italic text-[11px] text-slate-400 font-normal">رصيد بداية الفترة المدخل أو التراكمي المسبق</td>
                    <td className="py-2.5 px-4 text-left font-mono">---</td>
                    <td className="py-2.5 px-4 text-left font-mono">---</td>
                    <td className="py-2.5 px-4 text-left font-mono font-extrabold text-slate-755 bg-slate-50/50" style={{ direction: 'ltr' }}>
                      {formatNumberWithLatinDigits(reportData.opening_balance)}
                    </td>
                  </tr>

                  {/* Dynamic movements */}
                  {reportData.movements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-xs text-slate-400 italic">
                        لا توجد حركات تجارية أو قيود أستاذ مرحلة مع هذا المورد خلال الفترة المحددة.
                      </td>
                    </tr>
                  ) : (
                    reportData.movements.map((mov, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition duration-150">
                        <td className="py-2.5 px-4 font-mono text-slate-550">{formatDateWithEnglishDigits(mov.date)}</td>
                        <td className="py-2.5 px-4 font-mono text-brand-navy font-bold">
                          {mov.journal_number}
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 font-mono">{mov.reference || '---'}</td>
                        <td className="py-2.5 px-4 text-slate-600 font-bold">{mov.description}</td>
                        <td className="py-2.5 px-4 text-left font-mono text-emerald-650 font-bold font-sans" style={{ direction: 'ltr' }}>
                          {mov.debit > 0 ? formatNumberWithLatinDigits(mov.debit) : '0.00'}
                        </td>
                        <td className="py-2.5 px-4 text-left font-mono text-red-600 font-bold font-sans" style={{ direction: 'ltr' }}>
                          {mov.credit > 0 ? formatNumberWithLatinDigits(mov.credit) : '0.00'}
                        </td>
                        <td className="py-2.5 px-4 text-left font-mono font-bold text-slate-800 bg-slate-50/30 font-sans" style={{ direction: 'ltr' }}>
                          {formatNumberWithLatinDigits(mov.running_balance)}
                        </td>
                      </tr>
                    ))
                  )}

                  {/* Summary / Totals line */}
                  <tr className="bg-slate-100/30 border-t border-slate-200 font-extrabold text-slate-800">
                    <td colSpan={4} className="py-3 px-4 text-right">مجموع حركات الفترة الحالية فقط</td>
                    <td className="py-3 px-4 text-left font-sans text-emerald-650" style={{ direction: 'ltr' }}>
                      {formatNumberWithLatinDigits(reportData.total_debit)}
                    </td>
                    <td className="py-3 px-4 text-left font-sans text-red-600" style={{ direction: 'ltr' }}>
                      {formatNumberWithLatinDigits(reportData.total_credit)}
                    </td>
                    <td className="py-3 px-4 text-left font-sans text-slate-900 bg-slate-100/40" style={{ direction: 'ltr' }}>
                      {formatNumberWithLatinDigits(reportData.closing_balance)}
                    </td>
                  </tr>

                </tbody>

              </table>
            </div>

            <div className="p-4 bg-slate-50/50 border-t border-slate-100 text-[10px] text-slate-450 flex items-center gap-1.5 flex-wrap">
              <Info className="w-3.5 h-3.5 text-blue-500" />
              <span>ملاحظة: حركات الشراء وسندات الصرف غير المرحلة لا تؤثر في قيم كشف الحساب لضمان توازن الحساب المقابل.</span>
            </div>

          </div>

          <ReportSignatures />
        </div>
      )}

    </div>
  );
};
