import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { salesService } from '../../lib/salesService';
import { Receipt } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { getCountryProfile } from '../../lib/countryProfiles';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintWatermark } from './PrintWatermark';
import { AlertCircle, Loader2 } from 'lucide-react';

export const ReceiptPrint: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useAuth();

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id && id) {
      loadReceipt();
    }
  }, [currentOrg?.id, id]);

  const loadReceipt = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await salesService.getReceipt(currentOrg!.id, id!);
      if (data.organization_id !== currentOrg!.id) {
        throw new Error('غير مصرح لك بالوصول إلى هذه المنشأة أو المستند');
      }
      setReceipt(data);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const translateMethod = (method: string) => {
    switch (method) {
      case 'cash': return 'نقدي / صندوق';
      case 'bank_transfer': return 'تحويل بنكي / حساب جاري';
      case 'card': return 'بطاقة ائتمانية / عُهدة';
      default: return 'طرق دفع أخرى';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto animate-pulse" />
          <p className="text-xs text-slate-500 font-bold">جاري تحميل سند القبض الرسمي...</p>
        </div>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-6 text-center space-y-4 shadow-xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">تعذر تحميل مستند القبض للطباعة</h3>
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

  const customer = receipt.customer;
  const allocations = receipt.allocations || [];
  const profile = getCountryProfile(currentOrg?.country_code);

  return (
    <div className="bg-slate-100 min-h-screen">
      <PrintActions customBackPath="/sales/receipts" />

      {/* Main A4 Printable Sheet Content Chassis */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden">
        
        {/* Watermark of status */}
        <PrintWatermark status={receipt.status} />

        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle="ســند قـبـض رســمي"
          documentNumber={receipt.receipt_number}
          documentDate={receipt.receipt_date}
          extraMeta={[
            { label: 'حالة السند', value: receipt.status === 'approved' ? 'معتمد ومرحل' : receipt.status === 'cancelled' ? 'ملغى' : 'مسودة' },
            { label: 'المرجع البنكي', value: receipt.reference || 'غير مت وفر' }
          ]}
        />

        {/* Highlight Amount Block */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 mb-8 flex justify-between items-center text-right font-sans select-none" dir="rtl">
          <div>
            <span className="text-[10px] text-slate-400 font-extrabold uppercase block mb-1">المبلغ المقبوض:</span>
            <span className="text-2xl font-black tracking-tight">
              {formatNumberWithLatinDigits(receipt.amount)} <span className="text-sm text-slate-300 font-normal">{currentOrg?.currency_code || ''}</span>
            </span>
          </div>
          <div className="text-left font-sans text-xs space-y-1 text-slate-300" style={{ direction: 'rtl' }}>
            <div><span className="text-slate-450 font-bold ml-1.5">طريقة القبض:</span> {translateMethod(receipt.payment_method)}</div>
            {receipt.cash_bank_account && (
              <div><span className="text-slate-450 font-bold ml-1.5">الحساب المستلم:</span> {receipt.cash_bank_account.name}</div>
            )}
            {receipt.reference && (
              <div><span className="text-slate-450 font-bold ml-1.5">رقم المرجع:</span> <span className="font-mono">{receipt.reference}</span></div>
            )}
          </div>
        </div>

        {/* Customer details info */}
        <div className="border border-slate-200 rounded-2xl p-4.5 mb-8 text-right font-sans" dir="rtl">
          <span className="text-[10px] font-black text-slate-400 block mb-1.5">استلمنا من السيد / السادة:</span>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-black text-slate-800">{customer?.name || 'غير محدد'}</h3>
              {customer?.display_name && (
                <p className="text-xs text-slate-500 mt-0.5">{customer.display_name}</p>
              )}
            </div>
            <div className="text-xs text-slate-600 pl-4 space-y-0.5 leading-relaxed font-mono">
              {customer?.tax_number && (
                <div><span className="font-bold text-slate-500 font-sans">{profile.vatLabel} للعميل: </span> {customer.tax_number}</div>
              )}
              {customer?.phone && (
                <div><span className="font-bold text-slate-500 font-sans">الجوال: </span> {customer.phone}</div>
              )}
            </div>
          </div>
        </div>

        {/* Allocations information */}
        {allocations.length > 0 ? (
          <div className="mb-8 font-sans" dir="rtl">
            <span className="text-[10px] font-black text-slate-400 block mb-2">تخصيص السند وتسوية الفواتير الضريبية:</span>
            <table className="w-full border-collapse text-xs select-none/100">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="py-2 px-3 border border-slate-200 font-black text-right w-8">#</th>
                  <th className="py-2 px-3 border border-slate-200 font-black text-right">عنوان الفاتورة وتاريخها</th>
                  <th className="py-2 px-3 border border-slate-200 font-black text-center w-36">إجمالي الفاتورة</th>
                  <th className="py-2 px-3 border border-slate-200 font-black text-left w-36">المبلغ المستقطع (المخصص)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {allocations.map((alloc, idx) => (
                  <tr key={alloc.id || idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 border border-slate-200 text-slate-400 font-mono font-bold text-center">{idx + 1}</td>
                    <td className="py-2.5 px-3 border border-slate-200 text-right">
                      {alloc.sales_invoice ? (
                        <div>
                          <span className="font-black text-slate-800">فاتورة رقم: </span>
                          <span className="font-mono font-bold text-slate-900">{alloc.sales_invoice.invoice_number}</span>
                          <span className="text-slate-400 text-[10px] mr-2">({alloc.sales_invoice.invoice_date})</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[10px]">فاتورة سابقة تم حذفها</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 border border-slate-200 font-mono text-center text-slate-500">
                      {alloc.sales_invoice ? formatNumberWithLatinDigits(alloc.sales_invoice.total) : '0.00'}
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
            لم يتم ترحيل أو تخصيص هذا السند تجاه فواتير مبيعات سابقة. تم إيداعه دفعة تحت الحساب (أرصدة دائنة للعميل).
          </div>
        )}

        {/* Note section */}
        {(receipt.notes || currentOrg?.default_receipt_note) && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-6 font-sans select-none" dir="rtl">
            <span className="text-[10px] font-black text-slate-400 block mb-1">البيان وملاحظات السند:</span>
            <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed text-right">
              {receipt.notes || currentOrg?.default_receipt_note}
            </p>
          </div>
        )}

        {/* Footer actions and stamp zones */}
        <PrintFooter description="يعتبر هذا السند إيصالاً رسمياً بالمبالغ المحصلة المذكورة أعلاه. لا يعتد بأي حركات دفع عادية دون الحصول على ختم رسمي أو إشعار ترحيل معتمد." />

      </div>
    </div>
  );
};
