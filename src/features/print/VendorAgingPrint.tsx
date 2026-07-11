import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { reportsService, VendorAgingRow } from '../../lib/reportsService';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { AlertCircle, Loader2 } from 'lucide-react';

export const VendorAgingPrint: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { currentOrg } = useAuth();

  const asOfDate = searchParams.get('asOfDate') || new Date().toISOString().split('T')[0];

  const [reportData, setReportData] = useState<VendorAgingRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id) {
      loadReport();
    }
  }, [currentOrg?.id, asOfDate]);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await reportsService.getVendorAgingReport(currentOrg!.id, asOfDate);
      setReportData(data || []);
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
          <p className="text-xs text-slate-500 font-bold">جاري موازنة وتحليل تقرير أعمار الديون للموردين...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-6 text-center space-y-4 shadow-xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" strokeWidth={1.5} />
          <div>
            <h3 className="text-sm font-bold text-slate-800 font-sans">تعذر بناء تقرير أعمار ذمم الموردين</h3>
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

  const totalOutstanding = reportData.reduce((sum, row) => sum + Number(row.total_due), 0);
  const totalNotDue = reportData.reduce((sum, row) => sum + Number(row.not_due), 0);
  const total0_30 = reportData.reduce((sum, row) => sum + Number(row.bucket_0_30), 0);
  const total31_60 = reportData.reduce((sum, row) => sum + Number(row.bucket_31_60), 0);
  const total61_90 = reportData.reduce((sum, row) => sum + Number(row.bucket_61_90), 0);
  const totalOver90 = reportData.reduce((sum, row) => sum + Number(row.bucket_over_90), 0);
  const currency = currentOrg?.currency_code || 'SAR';

  return (
    <div className="bg-slate-100 min-h-screen">
      <PrintActions customBackPath="/reports" />

      {/* Main A4 Printable Sheet Content */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden">
        
        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle="تقرير أعمار ذمم الموردين (ميزان أعمار الديون للدائنين)"
          documentNumber=""
          documentDate={asOfDate}
          extraMeta={[
            { label: 'تاريخ الاستخراج', value: new Date().toISOString().split('T')[0] },
            { label: 'تاريخ التقرير', value: asOfDate }
          ]}
        />

        {/* Dynamic metrics cards */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 mb-8 text-right font-sans select-none" dir="rtl">
          <div className="grid grid-cols-4 gap-2.5 text-center text-xs">
            <div className="bg-white border rounded-xl p-2.5">
              <span className="text-[9px] text-slate-400 block mb-1">إجمالي المستحق للموردين:</span>
              <span className="font-mono font-black text-slate-800">{formatNumberWithLatinDigits(totalOutstanding)} {currency}</span>
            </div>
            <div className="bg-white border rounded-xl p-2.5">
              <span className="text-[9px] text-slate-400 block mb-1">غير مستحق (جاري):</span>
              <span className="font-mono font-black text-emerald-600">{formatNumberWithLatinDigits(totalNotDue)} {currency}</span>
            </div>
            <div className="bg-white border rounded-xl p-2.5">
              <span className="text-[9px] text-slate-400 block mb-1">المتأخرات (أقل من 90 يوم):</span>
              <span className="font-mono font-black text-amber-600">{formatNumberWithLatinDigits(total0_30 + total31_60 + total61_90)} {currency}</span>
            </div>
            <div className="bg-white border border-red-200 rounded-xl p-2.5 text-red-650 bg-red-50/10">
              <span className="text-[9px] text-red-400 block mb-1">المطالبات المتقادمة (&gt; 90 يوم):</span>
              <span className="font-mono font-black">{formatNumberWithLatinDigits(totalOver90)} {currency}</span>
            </div>
          </div>
        </div>

        {/* Report Records Table */}
        <div className="mb-8 overflow-x-auto text-right font-sans" dir="rtl">
          <table className="w-full border-collapse text-xs select-none">
            <thead>
              <tr className="bg-slate-900 text-white rounded-lg">
                <th className="py-2.5 px-3 border border-slate-900 font-extrabold text-right">المورد</th>
                <th className="py-2.5 px-3 border border-slate-900 font-extrabold w-24 text-center">غير مستحق</th>
                <th className="py-2.5 px-3 border border-slate-900 font-extrabold w-20 text-center">0-30 يوم</th>
                <th className="py-2.5 px-3 border border-slate-900 font-extrabold w-20 text-center">31-60 يوم</th>
                <th className="py-2.5 px-3 border border-slate-900 font-extrabold w-20 text-center">61-90 يوم</th>
                <th className="py-2.5 px-3 border border-slate-900 font-extrabold w-24 text-center">أكثر من 90</th>
                <th className="py-2.5 px-3 border border-slate-900 font-extrabold w-28 text-left">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {reportData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 px-3 border border-slate-200 text-center text-slate-400">
                    لا توجد أرصدة مستحقة لموردي المنشأة حتى تاريخ التقرير.
                  </td>
                </tr>
              ) : (
                reportData.map((row) => (
                  <tr key={row.vendor_id} className="hover:bg-slate-50 border-b border-slate-200">
                    <td className="py-2.5 px-3 text-right font-sans">
                      <div className="font-black text-slate-800">{row.vendor_name}</div>
                      {row.vendor_code && <div className="text-[10px] text-slate-400 mt-0.5">رمز المورد: {row.vendor_code}</div>}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-700">
                      {Number(row.not_due) > 0 ? formatNumberWithLatinDigits(row.not_due) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-700">
                      {Number(row.bucket_0_30) > 0 ? formatNumberWithLatinDigits(row.bucket_0_30) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-700">
                      {Number(row.bucket_31_60) > 0 ? formatNumberWithLatinDigits(row.bucket_31_60) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-700">
                      {Number(row.bucket_61_90) > 0 ? formatNumberWithLatinDigits(row.bucket_61_90) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-red-650 font-bold">
                      {Number(row.bucket_over_90) > 0 ? formatNumberWithLatinDigits(row.bucket_over_90) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-left font-mono font-black text-slate-900">
                      {formatNumberWithLatinDigits(row.total_due)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
              <tr>
                <td className="py-2.5 px-3 text-right">المجموع الكلي</td>
                <td className="py-2.5 px-3 text-center font-mono">
                  {formatNumberWithLatinDigits(totalNotDue)}
                </td>
                <td className="py-2.5 px-3 text-center font-mono">
                  {formatNumberWithLatinDigits(total0_30)}
                </td>
                <td className="py-2.5 px-3 text-center font-mono">
                  {formatNumberWithLatinDigits(total31_60)}
                </td>
                <td className="py-2.5 px-3 text-center font-mono">
                  {formatNumberWithLatinDigits(total61_90)}
                </td>
                <td className="py-2.5 px-3 text-center font-mono text-red-700">
                  {formatNumberWithLatinDigits(totalOver90)}
                </td>
                <td className="py-2.5 px-3 text-left font-mono text-brand-blue">
                  {formatNumberWithLatinDigits(totalOutstanding)} {currency}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Standard disclosures */}
        <div className="bg-blue-50/10 border border-blue-200 rounded-xl p-3 mb-6 select-none leading-relaxed text-[11px]" dir="rtl">
          <span className="font-black text-slate-850 block mb-0.5">تنويه التدقيق المحاسبي:</span>
          <p className="text-slate-600">
            يعتمد هذا التقرير على تواريخ استحقاق فواتير الشراء المعتمدة ومطابقة السندات المخصصة لها حتى تاريخ الاستحقاق. لا يشمل الفواتير المسودة أو الحركات الملغاة/المحذوفة.
          </p>
        </div>

        <PrintFooter showSignatures={true} description="تقرير أعمار الذمم الدائنة للموردين صادر آلياً من نظام لِدجرا السحابي المعتمد." />

      </div>
    </div>
  );
};
