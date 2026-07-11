import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { reportsService, CustomerAgingRow } from '../../lib/reportsService';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { getErrorMessage } from '../../lib/errors';
import { 
  Users, 
  Calendar, 
  RefreshCw, 
  AlertCircle,
  FileSpreadsheet,
  Printer,
  Search,
  TrendingUp,
  Coins,
  ArrowUpRight,
  Info,
  Download
} from 'lucide-react';

export const CustomerAgingPage: React.FC = () => {
  const { currentOrg } = useAuth();
  
  const [asOfDate, setAsOfDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<CustomerAgingRow[]>([]);

  useEffect(() => {
    if (currentOrg) {
      // Set default as-of date to today
      const today = new Date().toISOString().split('T')[0];
      setAsOfDate(today);
      fetchReport(today);
    }
  }, [currentOrg]);

  const fetchReport = async (date = asOfDate) => {
    if (!currentOrg || !date) return;
    setLoading(true);
    setError(null);
    try {
      const data = await reportsService.getCustomerAgingReport(currentOrg.id, date);
      setReportData(data || []);
    } catch (err) {
      setError(getErrorMessage(err));
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReport();
  };

  // Filter report data based on search term (name or code)
  const filteredData = reportData.filter(row => {
    const nameMatch = row.customer_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const codeMatch = row.customer_code?.toLowerCase().includes(searchTerm.toLowerCase());
    return nameMatch || codeMatch;
  });

  // Calculate high-level summary metrics
  const totalOutstanding = filteredData.reduce((sum, row) => sum + Number(row.total_due), 0);
  const totalOverdue = filteredData.reduce((sum, row) => sum + Number(row.bucket_0_30) + Number(row.bucket_31_60) + Number(row.bucket_61_90) + Number(row.bucket_over_90), 0);
  
  let topDebtorName = '---';
  let topDebtorAmount = 0;
  if (filteredData.length > 0) {
    const top = [...filteredData].sort((a, b) => Number(b.total_due) - Number(a.total_due))[0];
    if (top && Number(top.total_due) > 0) {
      topDebtorName = top.customer_name;
      topDebtorAmount = Number(top.total_due);
    }
  }
  const debtorsCount = filteredData.filter(row => Number(row.total_due) > 0).length;

  const exportToCSV = () => {
    if (filteredData.length === 0) return;
    
    const headers = [
      'العميل',
      'كود العميل',
      'غير مستحق',
      '0-30 يوم',
      '31-60 يوم',
      '61-90 يوم',
      'أكثر من 90 يوم',
      'إجمالي المستحق',
      'آخر فاتورة',
      'آخر سداد',
      'العملة'
    ];
    
    const rows = filteredData.map(r => [
      r.customer_name,
      r.customer_code || '',
      r.not_due,
      r.bucket_0_30,
      r.bucket_31_60,
      r.bucket_61_90,
      r.bucket_over_90,
      r.total_due,
      r.last_invoice_date ? `${r.last_invoice_date} (${r.last_invoice_number})` : '',
      r.last_receipt_date ? `${r.last_receipt_date} (${r.last_receipt_number})` : '',
      r.currency_code
    ]);
    
    const csvContent = "\uFEFF" + [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `تقرير_أعمار_ذمم_العملاء_${asOfDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currency = currentOrg?.currency_code || 'SAR';

  return (
    <div className="space-y-6" dir="rtl">
      
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
          <label className="text-xs font-bold text-slate-500 block">بحث باسم العميل أو الرمز</label>
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

        {/* Submit/Refresh Button */}
        <button
          type="submit"
          disabled={loading}
          className="bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold px-5 py-2.25 rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span>تحديث التقرير</span>
        </button>

        {/* Print Button */}
        {reportData.length > 0 && (
          <a
            href={`#/print/customer-aging?asOfDate=${asOfDate}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-5 py-2.25 rounded-xl transition flex items-center gap-2 cursor-pointer animate-fade-in"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة A4</span>
          </a>
        )}

        {/* CSV Export Button */}
        {filteredData.length > 0 && (
          <button
            type="button"
            onClick={exportToCSV}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-5 py-2.25 rounded-xl transition flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>تصدير CSV</span>
          </button>
        )}
      </form>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl flex items-center gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary Cards */}
      {!loading && reportData.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Total Outstanding */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">إجمالي الذمم المستحقة</span>
            <div className="flex items-center justify-between">
              <span className="text-lg font-extrabold text-slate-800 font-sans" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(totalOutstanding)}
              </span>
              <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded-full">{currency}</span>
            </div>
          </div>

          {/* Card 2: Total Overdue */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">إجمالي المتأخرات</span>
            <div className="flex items-center justify-between">
              <span className="text-lg font-extrabold text-amber-600 font-sans" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(totalOverdue)}
              </span>
              <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full">{currency}</span>
            </div>
          </div>

          {/* Card 3: Top Debtor */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">أكبر عميل مستحق رصيداً</span>
            <div className="flex items-center justify-between gap-2 overflow-hidden">
              <span className="text-xs font-bold text-slate-700 truncate block max-w-[140px]">{topDebtorName}</span>
              <span className="text-xs font-black text-brand-blue font-sans shrink-0" style={{ direction: 'ltr' }}>
                {topDebtorAmount > 0 ? formatNumberWithLatinDigits(topDebtorAmount) : '---'}
              </span>
            </div>
          </div>

          {/* Card 4: Count of Debtors */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">عدد العملاء ذوي المديونيات</span>
            <div className="flex items-center justify-between">
              <span className="text-lg font-extrabold text-emerald-600 font-sans">
                {formatNumberWithLatinDigits(debtorsCount, 0)}
              </span>
              <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">عميل نشط</span>
            </div>
          </div>

        </div>
      )}

      {/* Main Table View */}
      {loading ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center space-y-3 shadow-sm">
          <RefreshCw className="w-8 h-8 text-brand-blue animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-bold">جاري حساب وتحليل أعمار الديون لعملاء المنشأة...</p>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center space-y-3 shadow-sm">
          <Info className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-xs text-slate-500 font-bold">لا توجد أرصدة مستحقة حتى تاريخ التقرير.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-brand-navy" />
              <h3 className="text-sm font-extrabold text-slate-800">تفاصيل أعمار الذمم المدينة للعملاء</h3>
            </div>
            <span className="font-sans text-[10px] text-slate-500 font-bold bg-slate-100 px-2 py-0.75 rounded-full">
              تاريخ التقرير: {asOfDate}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-900 text-white select-none">
                  <th className="py-2.5 px-3 border border-slate-900 text-right font-extrabold">العميل</th>
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
                  <tr key={row.customer_id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3 px-3">
                      <div className="font-extrabold text-slate-800">{row.customer_name}</div>
                      {row.customer_code && (
                        <div className="font-mono text-[9px] text-slate-400 mt-0.5">كود: {row.customer_code}</div>
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
                      {row.last_invoice_date ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span>فاتورة: {row.last_invoice_number} ({row.last_invoice_date})</span>
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                        </div>
                      ) : (
                        <div className="text-slate-350">لا يوجد فواتير</div>
                      )}
                      {row.last_receipt_date ? (
                        <div className="flex items-center justify-end gap-1.5 mt-1">
                          <span>سداد: {row.last_receipt_number} ({row.last_receipt_date})</span>
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
      )}

    </div>
  );
};
