import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { reportsService, InventoryReportRow } from '../../lib/reportsService';
import { formatNumberWithLatinDigits, formatDateWithEnglishDigits, formatArabicDateWithLatinDigits } from '../../lib/formatters';
import { getErrorMessage } from '../../lib/errors';
import { 
  Package, 
  RefreshCw, 
  AlertCircle,
  TrendingUp,
  Search,
  CheckCircle,
  FileText,
  Warehouse,
  Printer,
  Coins,
  RotateCcw,
  Info
} from 'lucide-react';
import { ReportHeader } from './components/ReportHeader';
import { ReportActions } from './components/ReportActions';
import { ReportSignatures } from './components/ReportSignatures';
import { generateCSV, downloadCSV, generateReportFilename } from '../../lib/exportUtils';

export const InventoryReportPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  
  // States
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reportRows, setReportRows] = useState<InventoryReportRow[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Identify if user is restricted (e.g. Sales has no financial viewing rights)
  const isSalesRestricted = roleInCurrentOrg === 'sales';

  useEffect(() => {
    if (currentOrg) {
      fetchReport();
    }
  }, [currentOrg]);

  const fetchReport = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await reportsService.getInventoryReport(currentOrg.id);
      setReportRows(rows || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    fetchReport();
  };

  const filteredRows = reportRows.filter(row => {
    const term = searchTerm.toLowerCase();
    return (
      row.item_code.toLowerCase().includes(term) ||
      row.item_name_ar.toLowerCase().includes(term) ||
      (row.item_name_en && row.item_name_en.toLowerCase().includes(term))
    );
  });

  // Calculate totals
  const totalProducts = reportRows.length;
  const totalQuantity = reportRows.reduce((sum, r) => sum + Number(r.quantity_on_hand), 0);
  const totalValuation = isSalesRestricted 
    ? 0 
    : reportRows.reduce((sum, r) => sum + Number(r.inventory_value), 0);

  const exportToCSV = () => {
    if (filteredRows.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    const csvRows: any[][] = [
      ['منشأة', currentOrg?.name_ar || currentOrg?.name_en || ''],
      ['التقرير', 'تقرير المخزون والتقييم التفصيلي للأصناف'],
      ['تاريخ التقرير', today],
      ['العملة', currentOrg?.currency_code || ''],
      [],
      [
        'كود الصنف',
        'اسم الصنف العربي',
        'اسم الصنف الإنجليزي',
        'الكمية المتوفرة',
        'متوسط التكلفة WAC',
        'إجمالي قيمة التقييم',
        'كود حساب المخزون',
        'اسم حساب المخزون',
        'كود حساب التكلفة',
        'اسم حساب التكلفة',
        'تاريخ آخر حركة'
      ],
      ...filteredRows.map(r => [
        r.item_code,
        r.item_name_ar,
        r.item_name_en || '',
        r.quantity_on_hand,
        isSalesRestricted ? '***' : r.average_cost,
        isSalesRestricted ? '***' : r.inventory_value,
        r.inventory_account_code || '',
        r.inventory_account_name || '',
        r.cogs_account_code || '',
        r.cogs_account_name || '',
        r.last_movement_at || ''
      ])
    ];

    const headers = ['بيان الأرصدة وتقييمات متوسط التكلفة WAC للأصناف مخزناً', 'التفاصيل'];
    const csvContent = generateCSV(headers, csvRows);
    const filename = generateReportFilename(`تقرير_المخزون`, today);
    downloadCSV(csvContent, filename);
  };

  const handlePrint = () => {
    window.open('#/print/inventory-report', '_blank');
  };

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      
      {/* Report Header Intro */}
      <div className="space-y-1">
        <h3 className="text-lg font-black text-slate-800">تقرير جرد المخزون والتقييم</h3>
        <p className="text-xs text-slate-500">
          راقب كميات الأصناف المتوفرة والمسجلة في مخازنك مع تدقيق حسابات متوسط التكلفة المرجح WAC وتقييم الأصول المتداولة والربط مع شجرة الحسابات.
        </p>
      </div>

      {/* Top action row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
        
        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="البحث بكود أو اسم الصنف المخزني..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl pl-3 pr-9 py-2 outline-none focus:border-brand-blue"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
        </div>

        <div className="flex gap-2">
          <button
            onClick={fetchReport}
            disabled={loading}
            className="bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold px-5 py-2.25 rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>عرض التحديث</span>
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
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl flex items-center gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Action buttons row */}
      {reportRows.length > 0 && !loading && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 print:hidden">
          <span className="text-xs font-bold text-slate-500">خيارات تصدير وطباعة التقرير:</span>
          <ReportActions
            onPrint={handlePrint}
            onExportCSV={exportToCSV}
            onRefresh={fetchReport}
            loading={loading}
          />
        </div>
      )}

      {/* Summary KPI Cards */}
      {!loading && reportRows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">عدد الأصناف المخزنية النشطة</span>
            <div className="flex items-center justify-between">
              <span className="text-xl font-extrabold text-slate-800 font-sans" style={{ direction: 'ltr' }}>
                {totalProducts}
              </span>
              <span className="bg-slate-100 text-slate-600 text-[10px] px-2.5 py-0.75 rounded-full font-bold">صنف مخزني</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">إجمالي الكميات المتوفرة (On Hand)</span>
            <div className="flex items-center justify-between">
              <span className="text-xl font-extrabold text-brand-blue font-sans" style={{ direction: 'ltr' }}>
                {formatNumberWithLatinDigits(totalQuantity, 4)}
              </span>
              <span className="bg-brand-blue/10 text-brand-blue text-[10px] px-2.5 py-0.75 rounded-full font-bold">وحدة</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">إجمالي قيمة تقييم المخزون الحالي</span>
            <div className="flex items-center justify-between">
              <span className="text-xl font-extrabold text-emerald-600 font-sans" style={{ direction: 'ltr' }}>
                {isSalesRestricted ? '***' : formatNumberWithLatinDigits(totalValuation)}
              </span>
              <span className="bg-emerald-500/10 text-emerald-600 text-[10px] px-2.5 py-0.75 rounded-full font-bold">{currentOrg?.currency_code || ''}</span>
            </div>
          </div>

        </div>
      )}

      {isSalesRestricted && (
        <div className="bg-amber-50 border border-amber-205/60 text-amber-800 p-4 rounded-xl flex items-center gap-2.5 text-xs">
          <AlertCircle className="w-4.5 h-4.5 text-amber-550 shrink-0" />
          <span>ملاحظة أمنية: تم إخفاء معلومات تكلفة الفترات المرجحة WAC والقيم النقدية للمخزون تلقائياً بسبب الصلاحيات التشغيلية (Sales Role).</span>
        </div>
      )}

      {/* Main Table view */}
      {loading ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center space-y-3 shadow-sm flex flex-col items-center justify-center">
          <RefreshCw className="w-8 h-8 text-brand-blue animate-spin" />
          <p className="text-xs text-slate-500 font-bold">جاري تحميل وتدقيق تقرير جرد المخزون الحالي...</p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center space-y-3 shadow-sm">
          <Info className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-xs text-slate-500 font-bold">لا توجد حركات مخزون رصيدية حتى الآن.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            
            <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-brand-navy" />
                <h3 className="text-sm font-extrabold text-slate-800">بيان الأرصدة وتقييمات متوسط التكلفة WAC للأصناف مخزناً</h3>
              </div>
              <span className="text-xs text-slate-405">تضمين التخصيص والربط الحسابي للقيد المزدوج</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                
                <thead>
                  <tr className="bg-slate-100/50 border-b border-slate-150 text-slate-500 font-bold select-none">
                    <th className="py-3 px-4 w-28">كود الصنف</th>
                    <th className="py-3 px-4 w-48">اسم الصنف</th>
                    <th className="py-3 px-4 text-left w-32">الكمية المتوفرة</th>
                    <th className="py-3 px-4 text-left w-32">متوسط التكلفة WAC</th>
                    <th className="py-3 px-4 text-left w-36">إجمالي قيمة التقييم</th>
                    <th className="py-3 px-4 w-36">حساب المخزون (أصول)</th>
                    <th className="py-3 px-4 w-36">حساب التكلفة (مصاريف)</th>
                    <th className="py-3 px-4 w-32">آخر حركة مخزنية</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredRows.map((row) => (
                    <tr key={row.item_id} className="hover:bg-slate-50/50 transition">
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-800">{row.item_code}</td>
                      <td className="py-2.5 px-4">
                        <div className="font-bold">{row.item_name_ar}</div>
                        {row.item_name_en && (
                          <div className="text-[10px] text-slate-400 font-mono tracking-tight">{row.item_name_en}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-left font-mono font-bold text-brand-blue" style={{ direction: 'ltr' }}>
                        {formatNumberWithLatinDigits(row.quantity_on_hand, 4)}
                      </td>
                      <td className="py-2.5 px-4 text-left font-mono text-slate-600 font-semibold" style={{ direction: 'ltr' }}>
                        {isSalesRestricted ? '***' : formatNumberWithLatinDigits(row.average_cost)}
                      </td>
                      <td className="py-2.5 px-4 text-left font-mono text-emerald-600 font-bold" style={{ direction: 'ltr' }}>
                        {isSalesRestricted ? '***' : formatNumberWithLatinDigits(row.inventory_value)}
                      </td>
                      <td className="py-2.5 px-4 select-none">
                        {row.inventory_account_code ? (
                          <div>
                            <div className="font-mono text-[10px] font-bold text-slate-400">[{row.inventory_account_code}]</div>
                            <div className="text-[10px] text-slate-550 truncate max-w-[130px]">{row.inventory_account_name}</div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-red-500 border border-red-200 bg-red-50 px-1.5 py-0.25 rounded">غير مهيأ</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 select-none">
                        {row.cogs_account_code ? (
                          <div>
                            <div className="font-mono text-[10px] font-bold text-slate-400">[{row.cogs_account_code}]</div>
                            <div className="text-[10px] text-slate-550 truncate max-w-[130px]">{row.cogs_account_name}</div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">---</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">
                        {row.last_movement_at ? formatDateWithEnglishDigits(row.last_movement_at) : '---'}
                      </td>
                    </tr>
                  ))}
                </tbody>

              </table>
            </div>

            <div className="p-4 bg-slate-50/50 border-t border-slate-100 text-[10px] text-slate-450 select-none flex items-center gap-1.5 flex-wrap">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span>مطابقة الأرصدة التلقائية: يتم تقييم تكاليف الـ COGS وتحديث الالتزام المقابل تلقائياً عند اعتماد فواتير البيع أو الشراء.</span>
            </div>

          </div>

          <ReportSignatures />
        </div>
      )}

    </div>
  );
};
