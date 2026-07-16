import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { reportsService, VendorStatementResult } from '../../lib/reportsService';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { AlertCircle, Loader2 } from 'lucide-react';

export const VendorStatementPrint: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { currentOrg } = useAuth();

  const vendorId = searchParams.get('vendorId') || searchParams.get('id') || '';
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';

  const [statement, setStatement] = useState<VendorStatementResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id) {
      if (!vendorId || !dateFrom || !dateTo) {
        setLoading(false);
        setError('يرجى اختيار المورد وتحديد الفترة المحاسبية لتوليد كشف الحساب المعتمد.');
        return;
      }
      loadStatement();
    }
  }, [currentOrg?.id, vendorId, dateFrom, dateTo]);

  const loadStatement = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await reportsService.getVendorStatement(
        currentOrg!.id,
        vendorId,
        dateFrom,
        dateTo
      );
      setStatement(data);
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
          <p className="text-xs text-slate-500 font-bold">جاري موازنة وتوليد كشف حساب المورد...</p>
        </div>
      </div>
    );
  }

  if (error || !statement) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-6 text-center space-y-4 shadow-xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" strokeWidth={1.5} />
          <div>
            <h3 className="text-sm font-bold text-slate-800 font-sans">تعذر بناء كشف الحساب ممارسياً</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{error || 'المورد غير موجود أو المعطيات غير مكتملة'}</p>
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

  const movements = statement.movements || [];

  return (
    <div className="bg-slate-100 min-h-screen">
      <PrintActions customBackPath="/reports" />

      {/* Main A4 Printable Sheet Content Chassis */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden">
        
        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle="كشف حساب مورد (تفصيلي)"
          documentNumber={statement.vendor_code}
          documentDate={new Date().toISOString().split('T')[0]}
          extraMeta={[
            { label: 'الفترة من', value: dateFrom },
            { label: 'الفترة إلى', value: dateTo }
          ]}
        />

        {/* Vendor general info & balance boxes overview */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 mb-8 text-right font-sans select-none" dir="rtl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-3 mb-3">
            <div>
              <span className="text-[10px] font-black text-slate-400 block uppercase mb-0.5">اسم المورد / الشريك:</span>
              <h2 className="text-sm font-black text-slate-800">{statement.vendor_name}</h2>
            </div>
            <div className="text-xs text-slate-500 font-mono">
              رمز المورد: <span className="font-bold text-slate-800">{statement.vendor_code}</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2.5 text-center text-xs">
            <div className="bg-white border rounded-xl p-2.5">
              <span className="text-[9px] text-slate-400 block mb-1">الرصيد الافتتاحي:</span>
              <span className="font-mono font-black text-slate-800">{formatNumberWithLatinDigits(statement.opening_balance)}</span>
            </div>
            <div className="bg-white border border-emerald-100 rounded-xl p-2.5">
              <span className="text-[9px] text-slate-400 block mb-1">إجمالي المبالغ المدفوعة (المدين):</span>
              <span className="font-mono font-black text-emerald-600">{formatNumberWithLatinDigits(statement.total_debit)}</span>
            </div>
            <div className="bg-white border border-amber-105 rounded-xl p-2.5">
              <span className="text-[9px] text-slate-400 block mb-1">إجمالي الفواتير المستلمة (الدائن):</span>
              <span className="font-mono font-black text-slate-800">{formatNumberWithLatinDigits(statement.total_credit)}</span>
            </div>
            <div className={`border rounded-xl p-2.5 ${statement.closing_balance >= 0 ? 'bg-blue-50/10 border-blue-200 text-brand-blue' : 'bg-red-50/10 border-red-200 text-red-650'}`}>
              <span className="text-[9px] text-slate-400 block mb-1">الرصيد المستحق (الختامي):</span>
              <span className="font-mono font-black">{formatNumberWithLatinDigits(statement.closing_balance)}</span>
              <span className="text-[8px] block font-semibold mt-0.5">
                ({statement.closing_balance >= 0 ? 'مستحق للمورد من المنشأة' : 'له رصيد مدفوع مقدماً'})
              </span>
            </div>
          </div>
        </div>

        {/* Vendor movements logs table */}
        <div className="mb-8 overflow-x-auto text-right font-sans" dir="rtl">
          <table className="w-full border-collapse text-xs select-none">
            <thead>
              <tr className="bg-slate-900 text-white rounded-lg">
                <th className="py-2 px-2.5 border border-slate-900 font-extrabold w-24 text-right">التاريخ</th>
                <th className="py-2 px-2.5 border border-slate-900 font-extrabold w-28 text-center">المرجع / السند</th>
                <th className="py-2 px-2.5 border border-slate-900 font-extrabold text-right">البيان والشرح للتسوية</th>
                <th className="py-2 px-2.5 border border-slate-900 font-extrabold w-24 text-center">مدين (صرف)</th>
                <th className="py-2 px-2.5 border border-slate-900 font-extrabold w-24 text-center">دائن (شراء)</th>
                <th className="py-2 px-2.5 border border-slate-900 font-extrabold w-28 text-left">الرصيد المستحق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {/* Opening balance line first */}
              <tr className="bg-slate-50 italic text-slate-500">
                <td className="py-2 px-2.5 font-mono">{dateFrom}</td>
                <td className="py-2 px-2.5 text-center font-mono font-bold">-</td>
                <td className="py-2 px-2.5 font-sans">** رصيد مدور من حركات سابقة **</td>
                <td className="py-2 px-2.5 text-center font-mono font-medium">-</td>
                <td className="py-2 px-2.5 text-center font-mono font-medium">-</td>
                <td className="py-2 px-2.5 text-left font-mono font-extrabold text-slate-700">
                  {formatNumberWithLatinDigits(statement.opening_balance)}
                </td>
              </tr>

              {movements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 px-3 border border-slate-200 text-center text-slate-400">
                    لا توجد حركات تجارية مسجلة مع هذا المورد في كشوف المبيعات والمدفوعات خلال هذه الدورة.
                  </td>
                </tr>
              ) : (
                movements.map((move, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 border-b border-slate-200">
                    <td className="py-2.5 px-2.5 font-mono text-slate-500 text-right">{move.date}</td>
                    <td className="py-2.5 px-2.5 text-center font-mono">
                      <div className="font-bold text-slate-700">{move.journal_number}</div>
                      {move.reference && <div className="text-[10px] text-slate-450">م: {move.reference}</div>}
                    </td>
                    <td className="py-2.5 px-2.5 text-slate-700 text-right font-sans">{move.description}</td>
                    <td className="py-2.5 px-2.5 text-center font-mono font-black text-slate-900">
                      {move.debit > 0 ? formatNumberWithLatinDigits(move.debit) : '-'}
                    </td>
                    <td className="py-2.5 px-2.5 text-center font-mono font-black text-slate-900">
                      {move.credit > 0 ? formatNumberWithLatinDigits(move.credit) : '-'}
                    </td>
                    <td className="py-2.5 px-2.5 text-left font-mono font-black text-slate-800">
                      {formatNumberWithLatinDigits(move.running_balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Explanation Disclaimer */}
        <div className="bg-slate-50 border border-slate-205 rounded-xl p-3 mb-6 select-none leading-relaxed text-[11px]" dir="rtl">
          <span className="font-extrabold text-slate-800 block mb-0.5">تعليمات التسوية المالية:</span>
          <p className="text-slate-600">
            تعتبر البيانات والقيود الدفترية المذكورة أعلاه صحيحة ومعتمدة ومطابقة لدفاتر التوريد والذمم المستحقة. نرجو من قسم تدقيق الحسابات مطابقة الكشف مع الفواتير وسندات السداد المعمول بها.
          </p>
        </div>

        {/* Dynamic footer signature board */}
        <PrintFooter showSignatures={true} description="كشف حساب تفصيلي صادر آلياً من الدفاتر المحوسبة المعتمدة ومطابق لمعاملات السداد وفواتير المخازن المعتمدة." />

      </div>
    </div>
  );
};
