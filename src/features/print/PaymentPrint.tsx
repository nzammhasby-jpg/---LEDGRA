import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { purchaseService } from '../../lib/purchaseService';
import { Payment } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { getCountryProfile } from '../../lib/countryProfiles';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintWatermark } from './PrintWatermark';
import { AlertCircle, Loader2 } from 'lucide-react';

export const PaymentPrint: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useAuth();

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id && id) {
      loadPayment();
    }
  }, [currentOrg?.id, id]);

  const loadPayment = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await purchaseService.getPayment(currentOrg!.id, id!);
      if (data.organization_id !== currentOrg!.id) {
        throw new Error('غير مصرح لك بالوصول إلى هذه المنشأة أو المستند');
      }
      setPayment(data);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } crystalline: {
      setLoading(false);
    }
  };

  const translateMethod = (method: string) => {
    switch (method) {
      case 'cash': return 'نقدي من الصندوق الرئيس';
      case 'bank_transfer': return 'تحويل بنكي / حساب جاري مرخص';
      case 'card': return 'بطاقة الخصم / عُهدة موظف';
      default: return 'طرق سداد أخرى';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto animate-pulse" />
          <p className="text-xs text-slate-500 font-bold">جاري تحميل سند الصرف...</p>
        </div>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-6 text-center space-y-4 shadow-xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">تعذر تحميل سند الصرف للطباعة</h3>
            <p className="text-xs text-slate-400 mt-1">{error || 'السند غير موجود أو تم حذفه'}</p>
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

  const vendor = payment.vendor;
  const allocations = payment.allocations || [];
  const profile = getCountryProfile(currentOrg?.country_code);

  return (
    <div className="bg-slate-100 min-h-screen">
      <PrintActions customBackPath="/purchases/payments" />

      {/* Main A4 Printable Sheet Container */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden">
        
        {/* Dynamic Watermark based on state */}
        <PrintWatermark status={payment.status} />

        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle="ســـند صـــرف نـقـدي"
          documentNumber={payment.payment_number}
          documentDate={payment.payment_date}
          extraMeta={[
            { label: 'حالة الصرف', value: payment.status === 'approved' ? 'معتمد ومثبت' : payment.status === 'cancelled' ? 'ملغى ومردود' : 'مسودة' },
            { label: 'رقم المرجع', value: payment.reference || 'غير متوفر' }
          ]}
        />

        {/* Highlight Payment Amount block */}
        <div className="bg-slate-950 text-white rounded-2xl p-5 mb-8 flex justify-between items-center text-right font-sans select-none" dir="rtl">
          <div>
            <span className="text-[10px] text-slate-400 font-extrabold block mb-1">صافي القيمة المصروفة:</span>
            <span className="text-2xl font-black tracking-tight">
              {formatNumberWithLatinDigits(payment.amount)} <span className="text-sm font-normal text-slate-300">{currentOrg?.currency_code || ''}</span>
            </span>
          </div>
          <div className="text-left font-sans text-xs space-y-1 text-slate-350" style={{ direction: 'rtl' }}>
            <div><span className="text-slate-450 font-bold ml-1.5">مستند الدفع:</span> {translateMethod(payment.payment_method)}</div>
            {payment.cash_bank_account && (
              <div><span className="text-slate-450 font-bold ml-1.5">الحساب المصدر:</span> {payment.cash_bank_account.name}</div>
            )}
            {payment.reference && (
              <div><span className="text-slate-450 font-bold ml-1.5">المرجع الحركي:</span> <span className="font-mono font-bold">{payment.reference}</span></div>
            )}
          </div>
        </div>

        {/* Supplier identification details */}
        <div className="border border-slate-200 rounded-2xl p-4.5 mb-8 text-right font-sans" dir="rtl">
          <span className="text-[10px] font-black text-slate-400 block mb-1.5 font-sans">صُرف للمستفيد أدناه:</span>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-black text-slate-800">{vendor?.name || 'غير محدد'}</h3>
              {vendor?.display_name && (
                <p className="text-xs text-slate-500 mt-0.5">{vendor.display_name}</p>
              )}
            </div>
            <div className="text-xs text-slate-650 pr-4 space-y-0.5 leading-relaxed font-mono">
              {vendor?.tax_number && (
                <div><span className="font-bold text-slate-500 font-sans">{profile.vatLabel} للمورد: </span> {vendor.tax_number}</div>
              )}
              {vendor?.phone && (
                <div><span className="font-bold text-slate-500 font-sans">الجوال/الهاتف: </span> {vendor.phone}</div>
              )}
            </div>
          </div>
        </div>

        {/* Table of allocations */}
        {allocations.length > 0 ? (
          <div className="mb-8 font-sans" dir="rtl">
            <span className="text-[10px] font-black text-slate-400 block mb-2">تخصيص سند الصرف وتسوية فواتير المشتريات:</span>
            <table className="w-full border-collapse text-xs select-none">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="py-2 px-3 border border-slate-200 font-black text-right w-8">#</th>
                  <th className="py-2 px-3 border border-slate-200 font-black text-right">رقم فاتورة الشراء وتاريخ الاستحقاق</th>
                  <th className="py-2 px-3 border border-slate-200 font-black text-center w-36">إجمالي الفاتورة</th>
                  <th className="py-2 px-3 border border-slate-200 font-black text-left w-36">المبلغ المسدد المخصم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {allocations.map((alloc, idx) => (
                  <tr key={alloc.id || idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 border border-slate-200 text-slate-400 font-mono font-bold text-center">{idx + 1}</td>
                    <td className="py-2.5 px-3 border border-slate-200 text-right">
                      {alloc.purchase_bill ? (
                        <div>
                          <span className="font-black text-slate-800">فاتورة مشتريات رقم: </span>
                          <span className="font-mono font-bold text-slate-900">{alloc.purchase_bill.bill_number}</span>
                          <span className="text-slate-400 text-[10px] mr-2">({alloc.purchase_bill.bill_date})</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[10px]">فاتورة مورد قديمة تم حذفها أو تعديلها</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 border border-slate-200 font-mono text-center text-slate-500">
                      {alloc.purchase_bill ? formatNumberWithLatinDigits(alloc.purchase_bill.total) : '0.00'}
                    </td>
                    <td className="py-2.5 px-3 border border-slate-200 font-mono text-left font-black text-brand-blue">
                      {formatNumberWithLatinDigits(alloc.allocated_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center text-xs text-slate-500 mb-8 font-sans">
            لم يتم ترحيل أو تخصيص هذا السند تجاه فواتير مشتريات عينية سابقة. صُرف كدفعة مقدمة تحت الحساب للمورد.
          </div>
        )}

        {/* Note block */}
        {(payment.notes || currentOrg?.default_payment_note) && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-6 font-sans select-none" dir="rtl">
            <span className="text-[10px] font-black text-slate-400 block mb-1">البيان والشرح التفصيلي للصرف:</span>
            <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed text-right">
              {payment.notes || currentOrg?.default_payment_note}
            </p>
          </div>
        )}

        {/* Corporate signatures */}
        <PrintFooter description="مستند مالي رسمي يثبت خروج المبالغ المدفوعة وتسليمها للمورد المستفيد. تم عمل التسويات المحاسبية وإقفال القيد الدائن وموازنة المخزون أو المصاريف المرتبطة تلقائياً." />

      </div>
    </div>
  );
};
