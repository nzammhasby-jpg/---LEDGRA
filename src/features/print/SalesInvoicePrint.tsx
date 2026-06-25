import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { salesService } from '../../lib/salesService';
import { zatcaService } from '../../lib/zatcaService';
import { generateZatcaQrBase64 } from '../../lib/zatcaQr';
import { QRCodeSVG } from 'qrcode.react';
import { SalesInvoice } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits, formatArabicDateWithLatinDigits } from '../../lib/formatters';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintWatermark } from './PrintWatermark';
import { FileText, AlertCircle, Loader2 } from 'lucide-react';

export const SalesInvoicePrint: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useAuth();
  
  const [invoice, setInvoice] = useState<SalesInvoice | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [zatcaSettings, setZatcaSettings] = useState<any>(null);
  const [artifact, setArtifact] = useState<any>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id && id) {
      loadInvoice();
    }
  }, [currentOrg?.id, id]);

  useEffect(() => {
    if (currentOrg?.id && invoice?.id) {
      const loadZatcaData = async () => {
        try {
          const settings = await zatcaService.getZatcaSettings(currentOrg.id);
          setZatcaSettings(settings);

          const art = await zatcaService.getEInvoiceArtifact(invoice.id);
          setArtifact(art);

          if (art && art.qr_tlv_base64) {
            setQrBase64(art.qr_tlv_base64);
          } else if (settings && settings.is_enabled) {
            // live dynamic calculations for fallback printing
            const isoTimestamp = `${invoice.invoice_date}T${invoice.approved_at ? new Date(invoice.approved_at).toISOString().split('T')[1].substring(0, 8) : '12:00:00'}Z`;
            const liveQr = generateZatcaQrBase64({
              sellerName: settings.seller_name || currentOrg.name_ar || '',
              vatNumber: settings.seller_vat_number || currentOrg.vat_number || '',
              timestamp: isoTimestamp,
              invoiceTotal: Number(invoice.total),
              vatTotal: Number(invoice.tax_total)
            });
            setQrBase64(liveQr);
          } else {
            // standard safe backup values even if disablement is toggle active
            const isoTimestamp = `${invoice.invoice_date}T12:00:00Z`;
            const bkpQr = generateZatcaQrBase64({
              sellerName: currentOrg.name_ar || '',
              vatNumber: currentOrg.vat_number || '',
              timestamp: isoTimestamp,
              invoiceTotal: Number(invoice.total),
              vatTotal: Number(invoice.tax_total)
            });
            setQrBase64(bkpQr);
          }
        } catch (e) {
          console.error("Error setting ZATCA QR on print page:", e);
        }
      };

      loadZatcaData();
    }
  }, [currentOrg, invoice]);

  const loadInvoice = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await salesService.getSalesInvoice(currentOrg!.id, id!);
      if (data.organization_id !== currentOrg!.id) {
        throw new Error('غير مصرح لك بالوصول إلى هذه المنشأة أو المستند');
      }
      setInvoice(data);
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
          <p className="text-xs text-slate-500 font-bold">جاري تحميل بيانات الفاتورة الرسمية...</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-6 text-center space-y-4 shadow-xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">تعذر تحميل مستند الطباعة</h3>
            <p className="text-xs text-slate-400 mt-1">{error || 'الفاتورة غير موجودة أو تم حذفها'}</p>
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

  const customer = invoice.customer;
  const listItems = invoice.lines || [];

  return (
    <div className="bg-slate-100 min-h-screen">
      <PrintActions customBackPath="/sales/invoices" />

      {/* Main A4 Printable Sheet Content Chassis */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden">
        
        {/* Dynamic Watermark for drafts/cancelled */}
        <PrintWatermark status={invoice.status} />

        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle="فاتورة مبيعات ضريبية"
          documentNumber={invoice.invoice_number}
          documentDate={invoice.invoice_date}
          extraMeta={[
            { label: 'تاريخ الاستحقاق', value: invoice.due_date },
            { label: 'حالة الفاتورة', value: invoice.status === 'approved' ? 'معتمدة' : invoice.status === 'cancelled' ? 'ملغاة' : 'مسودة' },
            { label: 'حالة السداد', value: invoice.payment_status === 'paid' ? 'مدفوعة بالكامل' : invoice.payment_status === 'partially_paid' ? 'مدفوعة جزئياً' : 'غير مدفوعة' }
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
              <span className="font-bold text-slate-500">الرقم الضريبي للعميل (VAT ID): </span>
              <span className="font-mono text-slate-800 font-extrabold">{customer?.tax_number || 'غير متوفر'}</span>
            </div>
            {customer?.commercial_registration && (
              <div>
                <span className="font-bold text-slate-500">السجل التجاري للعميل: </span>
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

        {/* Sales lines list table */}
        <div className="mb-8 overflow-x-auto text-right font-sans" dir="rtl">
          <table className="w-full border-collapse text-xs select-none">
            <thead>
              <tr className="bg-slate-900 text-white rounded-lg">
                <th className="py-2.5 px-3 text-center border border-slate-900 font-extrabold w-8">#</th>
                <th className="py-2.5 px-3 border border-slate-900 font-extrabold text-right">الصنف / الوصف</th>
                <th className="py-2.5 px-3 text-center border border-slate-900 font-extrabold w-16">الكمية</th>
                <th className="py-2.5 px-3 text-center border border-slate-900 font-extrabold w-28">سعر الوحدة</th>
                <th className="py-2.5 px-3 text-center border border-slate-900 font-extrabold w-20">الخصم</th>
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
                      <span className="text-[10px] text-slate-550 block mt-0.5">{line.description}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-black text-slate-900">{formatNumberWithLatinDigits(line.quantity, 0)}</td>
                  <td className="py-2.5 px-3 text-center font-mono font-black text-slate-900">{formatNumberWithLatinDigits(line.unit_price)}</td>
                  <td className="py-2.5 px-3 text-center font-mono text-red-600 font-bold">
                    {line.discount_amount > 0 ? `-${formatNumberWithLatinDigits(line.discount_amount)}` : '0.00'}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="font-mono font-black text-slate-900">{formatNumberWithLatinDigits(line.tax_rate, 0)}%</div>
                    <div className="text-[9px] text-slate-450 font-mono">({formatNumberWithLatinDigits(line.tax_amount)})</div>
                  </td>
                  <td className="py-2.5 px-3 text-left font-mono font-black text-slate-900">{formatNumberWithLatinDigits(line.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom dynamic totals and ZATCA QR block */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 font-sans items-end" dir="rtl">
          
          {/* ZATCA QR code container */}
          <div className="flex flex-col items-start gap-2 bg-slate-50 border border-slate-200/60 rounded-2xl p-4 w-fit md:w-auto">
            <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">رمز QR للفوترة الإلكترونية</span>
            <div className="flex items-center gap-4">
              {qrBase64 ? (
                <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm print:shadow-none shrink-0 border-solid">
                  <QRCodeSVG value={qrBase64} size={105} />
                </div>
              ) : (
                <div className="w-[105px] h-[105px] bg-slate-100 rounded-xl border border-slate-200 border-dashed flex items-center justify-center text-center text-[10px] text-slate-400 p-2 shrink-0">
                  جاري احتساب الرمز...
                </div>
              )}
              <div className="text-[10px] text-slate-500 leading-relaxed">
                <p className="font-extrabold text-slate-700">بيانات الفاتورة الضريبية</p>
                <p className="mt-1">صنف الفاتورة: {zatcaSettings?.invoice_type_default === 'standard' ? 'ضريبية قياسية (B2B)' : 'ضريبية مبسطة (B2C)'}</p>
                <p className="mt-0.5">البنية الرقمية: XML أولي محسّن للفحص الداخلي</p>
                {artifact?.id && (
                  <p className="mt-1 text-[9px] text-brand-blue font-semibold">مستند رقمي رقم: {artifact.id.substring(0, 8)}</p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column computations */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2 text-xs select-none">
            
            <div className="flex justify-between font-bold text-slate-600">
              <span>الإجمالي قبل الخصم:</span>
              <span className="font-mono text-slate-900">{formatNumberWithLatinDigits(invoice.subtotal)}</span>
            </div>
            
            <div className="flex justify-between font-bold text-red-600">
              <span>إجمالي الخصم:</span>
              <span className="font-mono">-{formatNumberWithLatinDigits(invoice.discount_total)}</span>
            </div>

            <div className="flex justify-between font-bold text-slate-600 border-b border-slate-200 pb-2">
              <span>الوعاء الضريبي (الخاضع للضريبة):</span>
              <span className="font-mono text-slate-900">{formatNumberWithLatinDigits(invoice.subtotal - invoice.discount_total)}</span>
            </div>

            <div className="flex justify-between font-bold text-slate-600 border-b border-slate-200 pb-2">
              <span>إجمالي ضريبة القيمة المضافة (15%):</span>
              <span className="font-mono text-slate-900">{formatNumberWithLatinDigits(invoice.tax_total)}</span>
            </div>

            <div className="flex justify-between font-black text-slate-900 text-sm border-b border-double border-slate-300 pb-2">
              <span>صافي قيمة الفاتورة النهائي:</span>
              <span className="font-mono text-brand-blue font-black">{formatNumberWithLatinDigits(invoice.total)} {invoice.currency || 'SAR'}</span>
            </div>

            <div className="flex justify-between font-bold text-emerald-600 pt-1">
              <span>المبلغ المدفوع (المحصل):</span>
              <span className="font-mono">{formatNumberWithLatinDigits(invoice.paid_amount)}</span>
            </div>

            <div className="flex justify-between font-extrabold text-slate-800">
              <span>المتبقي المستحق السداد:</span>
              <span className="font-mono font-bold text-slate-900">{formatNumberWithLatinDigits(invoice.balance_due)}</span>
            </div>

          </div>
        </div>

        {/* Invoice notes */}
        {(invoice.notes || currentOrg?.default_invoice_note) && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-6 select-none" dir="rtl">
            <span className="text-[10px] font-black text-slate-400 block mb-1">شروط وملاحظات:</span>
            <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed text-right">
              {invoice.notes || currentOrg?.default_invoice_note}
            </p>
          </div>
        )}

        {/* Corporate Stamp Area and Signatures */}
        <PrintFooter description="مستند مالي معتمد وصادر بشكل رسمي من خلال لِدجرا للمحاسبة والمصادقة الرقمية. نرجو سداد القيمة المطلوبة في تاريخ الاستحقاق لتلافي غرامات أو توقفات في التوريد." />

      </div>
    </div>
  );
};
