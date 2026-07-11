import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { reportsService, VendorAgingRow } from '../../lib/reportsService';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { getErrorMessage } from '../../lib/errors';
import { 
  Truck, 
  Calendar, 
  RefreshCw, 
  AlertCircle,
  FileSpreadsheet,
  Printer,
  Search,
  Download,
  Info,
  RotateCcw
} from 'lucide-react';
import { ReportHeader } from './components/ReportHeader';
import { ReportActions } from './components/ReportActions';
import { ReportSignatures } from './components/ReportSignatures';
import { generateCSV, downloadCSV, generateReportFilename } from '../../lib/exportUtils';

export const VendorAgingPage: React.FC = () => {
  const { currentOrg } = useAuth();
  
  const [asOfDate, setAsOfDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<VendorAgingRow[]>([]);

  useEffect(() => {
    if (currentOrg) {
      const today = new Date().toISOString().split('T')[0];
      setAsOfDate(today);
      fetchReport(today);
    }
  }, [currentOrg]);

  const fetchReport = async (date = asOfDate) => {
    if (!currentOrg) return;
    if (!date) {
      setError('يرجى تحديد تاريخ التقرير.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await reportsService.getVendorAgingReport(currentOrg.id, date);
      setReportData(data || []);
    } catch (err) {
      setError(getErrorMessage(err));
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    const today = new Date().toISOString().split('T')[0];
    setAsOfDate(today);
    setSearchTerm('');
    fetchReport(today);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReport();
  };

  // Filter report data based on search term (name or code)
  const filteredData = reportData.filter(row => {
    const nameMatch = row.vendor_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const codeMatch = row.vendor_code?.toLowerCase().includes(searchTerm.toLowerCase());
    return nameMatch || codeMatch;
  });

  // Calculate high-level summary metrics
  const totalOutstanding = filteredData.reduce((sum, row) => sum + Number(row.total_due), 0);
  const totalOverdue = filteredData.reduce((sum, row) => sum + Number(row.bucket_0_30) + Number(row.bucket_31_60) + Number(row.bucket_61_90) + Number(row.bucket_over_90), 0);
  
  let topVendorName = '---';
  let topVendorAmount = 0;
  if (filteredData.length > 0) {
    const top = [...filteredData].sort((a, b) => Number(b.total_due) - Number(a.total_due))[0];
    if (top && Number(top.total_due) > 0) {
      topVendorName = top.vendor_name;
      topVendorAmount = Number(top.total_due);
    }
  }
  const vendorsCount = filteredData.filter(row => Number(row.total_due) > 0).length;

  const exportToCSV = () => {
    if (filteredData.length === 0) return;
    
    const csvRows: any[][] = [
      ['منشأة', currentOrg?.name_ar || currentOrg?.name || ''],
      ['التقرير', `تقرير أعمار ذمم الموردين (ديون الموردين)`],
      ['تاريخ التقرير', asOfDate],
      ['العملة', currentOrg?.currency_code || ''],
      [],
      [
        'المورد',
        'كود المورد',
        'غير مستحق',
        '0-30 يوم',
        '31-60 يوم',
        '61-90 يوم',
        'أكثر من 90 يوم',
        'إجمالي المستحق',
        'آخر فاتورة شراء',
        'آخر سداد'
      ],
      ...filteredData.map(r => [
        r.vendor_name,
        r.vendor_code || '',
        r.not_due,
        r.bucket_0_30,
        r.bucket_31_60,
        r.bucket_61_90,
        r.bucket_over_90,
        r.total_due,
        r.last_bill_date ? `${r.last_bill_date} (${r.last_bill_number})` : '',
        r.last_payment_date ? `${r.last_payment_date} (${r.last_payment_number})` : ''
      ])
    ];
    
    const headers = ['أعمار ذمم الموردين التفصيلي', 'التفاصيل'];
    const csvContent = generateCSV(headers, csvRows);
    const filename = generateReportFilename(`اعمار_ذمم_الموردين`, asOfDate);
    downloadCSV(csvContent, filename);
  };

  const handlePrint = () => {
    if (!asOfDate) return;
    window.open(`#/print/vendor-aging?asOfDate=${asOfDate}`, '_blank');
  };

  const currency = currentOrg?.currency_code || 'SAR';

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      
      {/* Report Header Intro */}
      <div className="space-y-1">
        <h3 className="text-lg font-black text-slate-800">تقرير أعمار ذمم الموردين</h3>
        <p className="text-xs text-slate-500">
          راقب تواريخ استحقاق التزاماتك للموردين موزعة حسب الفترات الزمنية لتخطيط التدفقات النقدية الخارجة وتفادي غرامات التأخير.
        </p>
      </div>

      {/* Controls & Filters Form */}
      <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-wrap gap-4 items-end shadow-sm">
        
        {/* As Of Date */}
        <div className="space-y-1.5 shrink-0 w-full sm:w-48">
          <label className="text-xs font-bold text-slate-500 block">تاريخ التقرير (اعتباراً من)</label>
          <div className="relative">
            <input 
              type="date" 
              value={asOfDate} 
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 pr-9 outline-none focus:border-brand-blue"
              required
            />
            <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          </div>
        </div>

        {/* Search Input Filter */}
        <div className="space-y-1.5 shrink-0 w-full sm:w-64">
          <label className="text-xs font-bold text-slate-500 block">بحث باسم المورد أو الرمز</label>
          <div className="relative">
            <input 
              type="text" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث هنا..."
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 pr-9 outline-none focus:border-brand-blue"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          </div>
        </div>

        <div className="flex gap-2">
          {/* Submit/Refresh Button */}
          <button
            type="submit"
            disabled={loading}
            className="bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold px-5 py-2.25 rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
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

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl flex items-center gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Action buttons row */}
      {reportData.length > 0 && !loading && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 print:hidden">
          <span className="text-xs font-bold text-slate-500">خيارات تصدير وطباعة التقرير:</span>
          <ReportActions
            onPrint={handlePrint}
            onExportCSV={exportToCSV}
            onRefresh={() => fetchReport()}
            loading={loading}
          />
        </div>
      )}

      {/* Summary Cards */}
      {!loading && reportData.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Total Outstanding */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">إجمالي الذمم الدائنة لموردين</span>
            <div className="flex items-center justify-between">
              <span className="text-lg font-extrabold text-slate-800 font-sans" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(totalOutstanding)}
              </span>
              <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded-full">{currency}</span>
            </div>
          </div>

          {/* Card 2: Total Overdue */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">إجمالي المتأخرات للموردين</span>
            <div className="flex items-center justify-between">
              <span className="text-lg font-extrabold text-amber-600 font-sans" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(totalOverdue)}
              </span>
              <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full">{currency}</span>
            </div>
          </div>

          {/* Card 3: Top Vendor */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">أكبر مورد مستحق رصيداً</span>
            <div className="flex items-center justify-between gap-2 overflow-hidden">
              <span className="text-xs font-bold text-slate-700 truncate block max-w-[140px]">{topVendorName}</span>
              <span className="text-xs font-black text-brand-blue font-sans shrink-0" style={{ direction: 'ltr' }}>
                {topVendorAmount > 0 ? formatNumberWithLatinDigits(topVendorAmount) : '---'}
              </span>
            </div>
          </div>

          {/* Card 4: Count of Vendors */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">عدد الموردين المستحقين</span>
            <div className="flex items-center justify-between">
              <span className="text-lg font-extrabold text-emerald-600 font-sans">
                {formatNumberWithLatinDigits(vendorsCount, 0)}
              </span>
              <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">مورد نشط</span>
            </div>
          </div>

        </div>
      )}

      {/* Main Table View */}
      {loading ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center space-y-3 shadow-sm flex flex-col items-center justify-center">
          <RefreshCw className="w-8 h-8 text-brand-blue animate-spin" />
          <p className="text-xs text-slate-500 font-bold">جاري حساب وتحليل أعمار الديون لموردي المنشأة...</p>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center space-y-3 shadow-sm">
          <Info className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-xs text-slate-500 font-bold">لا توجد أرصدة مستحقة حتى تاريخ التقرير.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-brand-navy" />
                <h3 className="text-sm font-extrabold text-slate-800">تفاصيل أعمار الذمم الدائنة للموردين</h3>
              </div>
              <span className="font-sans text-[10px] text-slate-500 font-bold bg-slate-100 px-2 py-0.75 rounded-full">
                تاريخ التقرير: {asOfDate}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white select-none">
                    <th className="py-2.5 px-3 border border-slate-900 text-right font-extrabold">المورد</th>
                    <th className="py-2.5 px-3 border border-slate-900 text-center font-extrabold w-28">غير مستحق</th>
                    <th className="py-2.5 px-3 border border-slate-900 text-center font-extrabold w-24">0-30 يوم</th>
                    <th className="py-2.5 px-3 border border-slate-900 text-center font-extrabold w-24">31-60 يوم</th>
                    <th className="py-2.5 px-3 border border-slate-900 text-center font-extrabold w-24">61-90 يوم</th>
                    <th className="py-2.5 px-3 border border-slate-900 text-center font-extrabold w-24">أكثر من 90 يوم</th>
                    <th className="py-2.5 px-3 border border-slate-900 text-left font-extrabold w-32">الإجمالي المستحق</th>
                    <th className="py-2.5 px-3 border border-slate-900 text-right font-extrabold w-52">آخر حركة مالية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredData.map((row) => (
                    <tr key={row.vendor_id} className="hover:bg-slate-50/50 transition">
                      <td className="py-3 px-3">
                        <div className="font-extrabold text-slate-800">{row.vendor_name}</div>
                        {row.vendor_code && (
                          <div className="font-mono text-[9px] text-slate-400 mt-0.5">كود: {row.vendor_code}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-slate-600 font-medium">
                        {Number(row.not_due) > 0 ? formatNumberWithLatinDigits(row.not_due) : '-'}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-slate-800 font-medium">
                        {Number(row.bucket_0_30) > 0 ? formatNumberWithLatinDigits(row.bucket_0_30) : '-'}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-slate-800 font-medium">
                        {Number(row.bucket_31_60) > 0 ? formatNumberWithLatinDigits(row.bucket_31_60) : '-'}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-slate-800 font-medium">
                        {Number(row.bucket_61_90) > 0 ? formatNumberWithLatinDigits(row.bucket_61_90) : '-'}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-red-600 font-extrabold">
                        {Number(row.bucket_over_90) > 0 ? formatNumberWithLatinDigits(row.bucket_over_90) : '-'}
                      </td>
                      <td className="py-3 px-3 text-left font-mono font-black text-slate-900">
                        <span className="mr-1 text-[10px] font-bold text-slate-450">{row.currency_code}</span>
                        {formatNumberWithLatinDigits(row.total_due)}
                      </td>
                      <td className="py-3 px-3 text-right leading-normal text-[11px] text-slate-500">
                        {row.last_bill_date ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span>فاتورة شراء: {row.last_bill_number} ({row.last_bill_date})</span>
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                          </div>
                        ) : (
                          <div className="text-slate-350">لا يوجد فواتير</div>
                        )}
                        {row.last_payment_date ? (
                          <div className="flex items-center justify-end gap-1.5 mt-1">
                            <span>سداد: {row.last_payment_number} ({row.last_payment_date})</span>
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                          </div>
                        ) : (
                          <div className="text-slate-350 mt-1">لا يوجد سداد</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50/80 font-black text-slate-950 border-t border-slate-200">
                  <tr>
                    <td className="py-3 px-3 text-right">المجموع الكلي</td>
                    <td className="py-3 px-3 text-center font-mono">
                      {formatNumberWithLatinDigits(filteredData.reduce((sum, r) => sum + Number(r.not_due), 0))}
                    </td>
                    <td className="py-3 px-3 text-center font-mono">
                      {formatNumberWithLatinDigits(filteredData.reduce((sum, r) => sum + Number(r.bucket_0_30), 0))}
                    </td>
                    <td className="py-3 px-3 text-center font-mono">
                      {formatNumberWithLatinDigits(filteredData.reduce((sum, r) => sum + Number(r.bucket_31_60), 0))}
                    </td>
                    <td className="py-3 px-3 text-center font-mono">
                      {formatNumberWithLatinDigits(filteredData.reduce((sum, r) => sum + Number(r.bucket_61_90), 0))}
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-red-700">
                      {formatNumberWithLatinDigits(filteredData.reduce((sum, r) => sum + Number(r.bucket_over_90), 0))}
                    </td>
                    <td className="py-3 px-3 text-left font-mono text-brand-blue" colSpan={2}>
                      <span className="mr-1 text-[10px] font-bold text-slate-450">{currency}</span>
                      {formatNumberWithLatinDigits(totalOutstanding)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <ReportSignatures />
        </div>
      )}

    </div>
  );
};
