import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { purchaseService } from '../../lib/purchaseService';
import { PurchaseDebitNote } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { getCountryProfile } from '../../lib/countryProfiles';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintWatermark } from './PrintWatermark';
import { Loader2, AlertCircle } from 'lucide-react';

export const PurchaseDebitNotePrint: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useAuth();
  
  const [debitNote, setDebitNote] = useState<PurchaseDebitNote | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id && id) {
      loadDebitNote();
    }
  }, [currentOrg?.id, id]);

  const loadDebitNote = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await purchaseService.getPurchaseDebitNote(currentOrg!.id, id!);
      if (data.organization_id !== currentOrg!.id) {
        throw new Error('غير مصرح لك بالوصول إلى هذه المنشأة أو المستند');
      }
      setDebitNote(data);
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
          <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-bold">جاري تحميل بيانات الإشعار المدين...</p>
        </div>
      </div>
    );
  }

  if (error || !debitNote) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-6 text-center space-y-4 shadow-xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">تعذر تحميل مستند الطباعة</h3>
            <p className="text-xs text-slate-400 mt-1">{error || 'الإشعار غير موجود أو تم حذفه'}</p>
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

  const vendor = debitNote.vendor;
  const listItems = debitNote.lines || [];
  const profile = getCountryProfile(currentOrg?.country_code);
  const isVat = currentOrg?.is_vat_registered !== false;
  const docTitle = isVat ? 'إشعار مدين ضريبي للمورد' : 'إشعار مدين للمورد';

  return (
    <div className="bg-slate-100 min-h-screen">
      <PrintActions customBackPath="/purchases/debit-notes" />

      {/* Main A4 Printable Sheet Content Chassis */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden">
        
        {/* Dynamic Watermark for drafts/cancelled */}
        <PrintWatermark status={debitNote.status} />

        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle={docTitle}
          documentNumber={debitNote.debit_note_number}
          documentDate={debitNote.debit_note_date}
          extraMeta={[
            { label: 'الفاتورة المرجعية', value: debitNote.original_bill?.bill_number || 'غير محدد' },
            { label: 'حالة الإشعار', value: debitNote.status === 'approved' ? 'معتمد' : debitNote.status === 'cancelled' ? 'ملغى' : 'مسودة' },
            { label: 'سبب المرتجع', value: debitNote.reason || 'غير محدد' }
          ]}
        />

        {/* Vendor details box */}
        <div className="grid grid-cols-2 gap-6 bg-slate-50 border border-slate-200 rounded-2xl p-4.5 print:p-3 mb-8 print:mb-4 text-right font-sans" dir="rtl">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">المورد الموجه إليه:</span>
            <span className="text-xs font-black text-slate-800 block">{vendor?.name || 'غير محدد'}</span>
            {vendor?.display_name && (
              <span className="text-[11px] text-slate-500 block mt-0.5">{vendor.display_name}</span>
            )}
            
            {vendor?.phone && (
              <div className="text-[11px] text-slate-600 mt-2">
                <span className="font-bold text-slate-500">الجوال: </span>
                <span className="font-mono">{vendor.phone}</span>
              </div>
            )}
            {vendor?.email && (
              <div className="text-[11px] text-slate-600 mt-0.5">
                <span className="font-bold text-slate-500">البريد الإلكتروني: </span>
                <span className="font-mono text-slate-500">{vendor.email}</span>
              </div>
            )}
          </div>

          <div className="border-r border-slate-200 pr-6 space-y-1 text-[11px] text-slate-600">
            <div>
              <span className="font-bold text-slate-500">{profile.vatLabel} للمورد: </span>
              <span className="font-mono text-slate-800 font-extrabold">{vendor?.tax_number || 'غير متوفر'}</span>
            </div>
            {vendor?.commercial_registration && (
              <div>
                <span className="font-bold text-slate-500">{profile.crLabel} للمورد: </span>
                <span className="font-mono text-slate-800 font-extrabold">{vendor.commercial_registration}</span>
              </div>
            )}
            {(vendor?.city || vendor?.address) && (
              <div className="pt-1 select-none">
                <span className="font-bold text-slate-500">عنوان المورد: </span>
                <span>{[vendor.city, vendor.address].filter(Boolean).join(' - ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Debit Note lines list table */}
        <div className="mb-8 print:mb-4 overflow-x-auto text-right font-sans" dir="rtl">
          <table className="w-full border-collapse text-xs select-none">
            <thead>
              <tr className="bg-slate-900 text-white rounded-lg">
                <th className="py-2.5 px-3 text-center border border-slate-900 font-extrabold w-8">#</th>
                <th className="py-2.5 px-3 border border-slate-900 font-extrabold text-right">الصنف / الوصف</th>
                <th className="py-2.5 px-3 text-center border border-slate-900 font-extrabold w-16">الكمية المرتجعة</th>
                <th className="py-2.5 px-3 text-center border border-slate-900 font-extrabold w-28">سعر الوحدة</th>
                <th className="py-2.5 px-3 text-center border border-slate-900 font-extrabold w-16">الضريبة</th>
                <th className="py-2.5 px-3 text-left border border-slate-900 font-extrabold w-32">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {listItems.map((line, idx) => (
                <tr key={line.id || idx} className="hover:bg-slate-50 border-b border-slate-200 font-sans">
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-500">{idx + 1}</td>
                  <td className="py-2.5 px-3">
                    <span className="font-black text-slate-800 block">{line.item?.name || 'صنف/خدمة غير مخزنية'}</span>
                    {line.description && (
                      <span className="text-[10px] text-slate-500 block mt-0.5">{line.description}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-black text-slate-900">{formatNumberWithLatinDigits(line.quantity)}</td>
                  <td className="py-2.5 px-3 text-center font-mono font-black text-slate-900">{formatNumberWithLatinDigits(line.unit_price)}</td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="font-mono font-black text-slate-900">{formatNumberWithLatinDigits(line.tax_rate)}%</div>
                    <div className="text-[9px] text-slate-500 font-mono">({formatNumberWithLatinDigits(line.tax_amount)})</div>
                  </td>
                  <td className="py-2.5 px-3 text-left font-mono font-black text-slate-900">{formatNumberWithLatinDigits(line.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Calculation summary block */}
        <div className="grid grid-cols-12 gap-6 select-none" dir="rtl">
          <div className="col-span-7 space-y-3 pr-2 text-right">
            {debitNote.notes && (
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
                <span className="text-[9px] font-black text-slate-400 block mb-1">ملاحظات إضافية:</span>
                <span className="text-xs text-slate-600 leading-relaxed block">{debitNote.notes}</span>
              </div>
            )}
          </div>

          <div className="col-span-5 bg-slate-50 border border-slate-200 rounded-3xl p-6 print:p-4 space-y-4 print:space-y-2 font-sans">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
              <span>المجموع الفرعي (غير شامل للضريبة):</span>
              <span className="font-mono font-black text-slate-800">{formatNumberWithLatinDigits(debitNote.subtotal)} {debitNote.currency_code}</span>
            </div>

            {isVat && (
              <div className="flex justify-between items-center text-xs font-semibold text-slate-550 border-t border-dashed border-slate-200 pt-3">
                <span>مجموع ضريبة القيمة المضافة ({profile.vatLabel}):</span>
                <span className="font-mono font-black text-slate-800">{formatNumberWithLatinDigits(debitNote.tax_amount)} {debitNote.currency_code}</span>
              </div>
            )}

            <div className="flex justify-between items-center text-sm font-bold text-slate-800 border-t border-slate-200 pt-3 font-sans">
              <span>الإجمالي الصافي:</span>
              <span className="font-mono font-black text-slate-900 text-lg">{formatNumberWithLatinDigits(debitNote.total_amount)} {debitNote.currency_code}</span>
            </div>
          </div>
        </div>

        {/* Footer info (Purchase debit notes don't require outbound B2C/B2B ZATCA QR codes) */}
        <PrintFooter
          description="مستند مالي داخلي يثبت استرجاع السلع أو الخدمات المفوترة من المورد المدرج أعلاه."
        />
      </div>
    </div>
  );
};
