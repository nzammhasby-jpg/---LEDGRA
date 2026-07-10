import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { salesService } from '../../lib/salesService';
import { generateZatcaQrBase64 } from '../../lib/zatcaQr';
import { SalesCreditNote } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { getCountryProfile } from '../../lib/countryProfiles';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintWatermark } from './PrintWatermark';
import { Loader2, AlertCircle } from 'lucide-react';

export const SalesCreditNotePrint: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useAuth();
  
  const [creditNote, setCreditNote] = useState<SalesCreditNote | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [qrBase64, setQrBase64] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id && id) {
      loadCreditNote();
    }
  }, [currentOrg?.id, id]);

  useEffect(() => {
    if (currentOrg?.id && creditNote?.id) {
      const profile = getCountryProfile(currentOrg?.country_code);
      const zatcaEnabled = profile.zatcaEnabled;

      if (!zatcaEnabled) {
        setQrBase64(null);
        return;
      }

      const loadQrData = async () => {
        try {
          // Standard safe dynamic QR generation for the credit note
          const isoTimestamp = `${creditNote.credit_note_date}T${creditNote.approved_at ? new Date(creditNote.approved_at).toISOString().split('T')[1].substring(0, 8) : '12:00:00'}Z`;
          const bkpQr = generateZatcaQrBase64({
            sellerName: currentOrg.name_ar || '',
            vatNumber: currentOrg.vat_number || '',
            timestamp: isoTimestamp,
            invoiceTotal: Number(creditNote.total_amount),
            vatTotal: Number(creditNote.tax_amount)
          });
          setQrBase64(bkpQr);
        } catch (e) {
          console.error("Error setting QR on credit note print:", e);
        }
      };

      loadQrData();
    }
  }, [currentOrg, creditNote]);

  const loadCreditNote = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await salesService.getCreditNote(currentOrg!.id, id!);
      if (data.organization_id !== currentOrg!.id) {
        throw new Error('غير مصرح لك بالوصول إلى هذه المنشأة أو المستند');
      }
      setCreditNote(data);
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
          <p className="text-xs text-slate-500 font-bold">جاري تحميل بيانات الإشعار الدائن...</p>
        </div>
      </div>
    );
  }

  if (error || !creditNote) {
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

  const customer = creditNote.customer;
  const listItems = creditNote.lines || [];
  const profile = getCountryProfile(currentOrg?.country_code);
  const isVat = currentOrg?.is_vat_registered !== false;
  const docTitle = isVat ? 'إشعار دائن ضريبي' : 'إشعار دائن';

  return (
    <div className="bg-slate-100 min-h-screen">
      <PrintActions customBackPath="/sales/credit-notes" />

      {/* Main A4 Printable Sheet Content Chassis */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden">
        
        {/* Dynamic Watermark for drafts/cancelled */}
        <PrintWatermark status={creditNote.status} />

        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle={docTitle}
          documentNumber={creditNote.credit_note_number}
          documentDate={creditNote.credit_note_date}
          extraMeta={[
            { label: 'الفاتورة المرجعية', value: creditNote.original_invoice?.invoice_number || 'غير محدد' },
            { label: 'حالة الإشعار', value: creditNote.status === 'approved' ? 'معتمد' : creditNote.status === 'cancelled' ? 'ملغى' : 'مسودة' },
            { label: 'سبب الارتجاع', value: creditNote.reason || 'غير محدد' }
          ]}
        />

        {/* Client details box */}
        <div className="grid grid-cols-2 gap-6 bg-slate-50 border border-slate-200 rounded-2xl p-4.5 mb-8 text-right font-sans" dir="rtl">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">العميل الموجه إليه:</span>
            <span className="text-xs font-black text-slate-800 block">{customer?.name || 'غير محدد'}</span>
            {customer?.display_name && (
              <span className="text-[11px] text-slate-500 block mt-0.5">{customer.display_name}</span>
            )}
            
            {customer?.phone && (
              <div className="text-[11px] text-slate-600 mt-2">
                <span className="font-bold text-slate-500">الجوال: </span>
                <span className="font-mono">{customer.phone}</span>
              </div>
            )}
            {customer?.email && (
              <div className="text-[11px] text-slate-600 mt-0.5">
                <span className="font-bold text-slate-500">البريد الإلكتروني: </span>
                <span className="font-mono text-slate-500">{customer.email}</span>
              </div>
            )}
          </div>

          <div className="border-r border-slate-200 pr-6 space-y-1 text-[11px] text-slate-600">
            <div>
              <span className="font-bold text-slate-500">{profile.vatLabel} للعميل: </span>
              <span className="font-mono text-slate-800 font-extrabold">{customer?.tax_number || 'غير متوفر'}</span>
            </div>
            {customer?.commercial_registration && (
              <div>
                <span className="font-bold text-slate-500">{profile.crLabel} للعميل: </span>
                <span className="font-mono text-slate-800 font-extrabold">{customer.commercial_registration}</span>
              </div>
            )}
            {(customer?.city || customer?.address) && (
              <div className="pt-1 select-none">
                <span className="font-bold text-slate-500">عنوان العميل: </span>
                <span>{[customer.city, customer.address].filter(Boolean).join(' - ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Credit Note lines list table */}
        <div className="mb-8 overflow-x-auto text-right font-sans" dir="rtl">
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
                    <span className="font-black text-slate-800 block">{line.item?.name || 'صنف غير محدد'}</span>
                    {line.description && (
                      <span className="text-[10px] text-slate-500 block mt-0.5">{line.description}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-black text-slate-900">{formatNumberWithLatinDigits(line.quantity, 0)}</td>
                  <td className="py-2.5 px-3 text-center font-mono font-black text-slate-900">{formatNumberWithLatinDigits(line.unit_price)}</td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="font-mono font-black text-slate-900">{formatNumberWithLatinDigits(line.tax_rate, 0)}%</div>
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
            {creditNote.notes && (
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
                <span className="text-[9px] font-black text-slate-400 block mb-1">ملاحظات إضافية:</span>
                <span className="text-xs text-slate-600 leading-relaxed block">{creditNote.notes}</span>
              </div>
            )}
          </div>

          <div className="col-span-5 bg-slate-50 border border-slate-200 rounded-3xl p-6 space-y-4">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
              <span>المجموع الفرعي (غير شامل للضريبة):</span>
              <span className="font-mono font-black text-slate-800">{formatNumberWithLatinDigits(creditNote.subtotal)} {creditNote.currency_code}</span>
            </div>

            {isVat && (
              <div className="flex justify-between items-center text-xs font-semibold text-slate-550 border-t border-dashed border-slate-200 pt-3">
                <span>مجموع ضريبة القيمة المضافة:</span>
                <span className="font-mono font-black text-slate-800">{formatNumberWithLatinDigits(creditNote.tax_amount)} {creditNote.currency_code}</span>
              </div>
            )}

            <div className="flex justify-between items-center text-sm font-bold text-slate-800 border-t border-slate-200 pt-3">
              <span>الإجمالي الصافي:</span>
              <span className="font-mono font-black text-slate-900 text-lg">{formatNumberWithLatinDigits(creditNote.total_amount)} {creditNote.currency_code}</span>
            </div>
          </div>
        </div>

        {/* QR code and footer */}
        <PrintFooter
          currentOrg={currentOrg}
          qrBase64={qrBase64}
        />
      </div>
    </div>
  );
};
