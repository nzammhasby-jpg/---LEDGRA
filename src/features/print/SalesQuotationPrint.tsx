import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { quotationService } from '../../lib/quotationService';
import { SalesQuotation } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits, formatArabicDateWithLatinDigits } from '../../lib/formatters';
import { getCountryProfile, getOrgDefaultTaxRate } from '../../lib/countryProfiles';
import { formatPaymentDetailsSummary } from '../../lib/paymentMethodUtils';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintWatermark } from './PrintWatermark';
import { FileText, AlertCircle, Loader2 } from 'lucide-react';

export const SalesQuotationPrint: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useAuth();

  const [quotation, setQuotation] = useState<SalesQuotation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id && id) {
      loadQuotation();
    }
  }, [currentOrg?.id, id]);

  const loadQuotation = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await quotationService.getSalesQuotation(currentOrg!.id, id!);
      if (data.organization_id !== currentOrg!.id) {
        throw new Error('غير مصرح لك بالوصول إلى هذه المنشأة أو المستند');
      }
      setQuotation(data);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
          <p className="text-sm font-bold text-slate-300">جاري تحميل عرض السعر للطباعة...</p>
        </div>
      </div>
    );
  }

  if (error || !quotation) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white" dir="rtl">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-lg font-bold text-slate-100">تعذر عرض مستند عرض السعر</h2>
          <p className="text-xs text-slate-400 leading-relaxed">{error || 'المستند غير موجود أو تم حذفه.'}</p>
          <Link
            to="/sales/quotations"
            className="inline-block px-5 py-2.5 bg-brand-blue text-white rounded-xl text-xs font-bold hover:bg-blue-600 transition"
          >
            العودة لقائمة عروض الأسعار
          </Link>
        </div>
      </div>
    );
  }

  const profile = getCountryProfile(currentOrg?.country_code);
  const isVat = currentOrg?.is_vat_registered ?? true;
  const listItems = quotation.lines || [];
  const customer = quotation.customer;

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white text-slate-800 p-4 md:p-8 print:p-0 font-sans" dir="rtl">
      
      {/* Top Floating Action Controls */}
      <PrintActions customBackPath="/sales/quotations" />

      {/* Main Print Container A4 */}
      <div className="max-w-4xl mx-auto bg-white border border-slate-200 print:border-none shadow-xl print:shadow-none p-8 print:p-6 rounded-2xl print:rounded-none relative overflow-hidden my-6 print:my-0">
        
        {/* Subtle Background Watermark */}
        <PrintWatermark status={quotation.status} />

        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle="عرض سعر"
          documentNumber={quotation.quotation_number}
          documentDate={quotation.quotation_date}
          extraMeta={[
            { label: 'صالح حتى', value: quotation.valid_until ? formatArabicDateWithLatinDigits(quotation.valid_until) : 'غير محدد' },
            { label: 'حالة العرض', value: quotation.status === 'draft' ? 'مسودة' : quotation.status === 'sent' ? 'مرسل' : quotation.status === 'accepted' ? 'مقبول' : quotation.status === 'converted' ? 'تحول لفاتورة' : 'ملغى' }
          ]}
        />

        {/* Notice Disclaimer Banner */}
        <div className="mb-6 bg-amber-50 border-2 border-amber-200 rounded-xl p-3 text-center print:bg-amber-50">
          <p className="text-xs font-black text-amber-900 tracking-wide">
            هذا المستند عرض سعر ولا يُعد فاتورة ضريبية.
          </p>
        </div>

        {/* Info Grid: Customer Info & Quotation Validity */}
        <div className="grid grid-cols-2 gap-6 mb-6 print:gap-4 text-xs select-none bg-slate-50 border border-slate-200/80 p-4 rounded-xl">
          
          {/* Customer Column */}
          <div className="space-y-1.5 text-right">
            <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider">موجّه إلى العميل:</span>
            <div className="font-extrabold text-sm text-slate-900">{customer?.name || 'عميل غير محدد'}</div>
            {customer?.tax_number && (
              <div className="text-slate-600">
                <span className="font-bold text-slate-500">{profile.vatLabel}: </span>
                <span className="font-mono font-bold text-slate-800">{customer.tax_number}</span>
              </div>
            )}
            {customer?.phone && (
              <div className="text-slate-600">
                <span className="font-bold text-slate-500">الهاتف: </span>
                <span className="font-mono">{customer.phone}</span>
              </div>
            )}
            {(customer?.city || customer?.address) && (
              <div className="text-slate-600">
                <span className="font-bold text-slate-500">العنوان: </span>
                <span>{[customer.city, customer.address].filter(Boolean).join(' - ')}</span>
              </div>
            )}
          </div>

          {/* Quotation Validity & Proposed Payment Column */}
          <div className="space-y-1.5 text-right border-r border-slate-200 pr-6">
            <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider">تفاصيل وصلاحية العرض:</span>
            
            <div className="flex justify-between items-center py-0.5">
              <span className="font-bold text-slate-500">حالة العرض:</span>
              <span className="font-extrabold text-slate-800">
                {quotation.status === 'draft' ? 'مسودة' :
                 quotation.status === 'sent' ? 'مرسل' :
                 quotation.status === 'accepted' ? 'مقبول' :
                 quotation.status === 'rejected' ? 'مرفوض' :
                 quotation.status === 'converted' ? 'تحول إلى فاتورة' :
                 quotation.status === 'expired' ? 'منتهي الصلاحية' : 'ملغى'}
              </span>
            </div>

            {quotation.valid_until && (
              <div className="flex justify-between items-center py-0.5">
                <span className="font-bold text-slate-500">صالح حتى تاريخ:</span>
                <span className="font-mono font-extrabold text-slate-800">
                  {formatArabicDateWithLatinDigits(quotation.valid_until)}
                </span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200 mt-2">
              <span className="font-bold text-slate-500 block mb-0.5">طريقة السداد المقترحة:</span>
              <span className="font-extrabold text-brand-blue text-xs block">
                {formatPaymentDetailsSummary(
                  quotation.payment_method || 'credit',
                  quotation.payment_reference,
                  quotation.payment_details
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Tax Calculation Banner */}
        {isVat && (
          <div className="mb-3 text-[11px] font-bold text-slate-600 flex items-center justify-between bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <span>احتساب الضريبة:</span>
            <span className={quotation.prices_include_tax ? "text-emerald-700 font-extrabold" : "text-slate-700"}>
              {quotation.prices_include_tax ? 'الأسعار الشاملة لضريبة القيمة المضافة' : 'الأسعار غير شاملة ضريبة القيمة المضافة'}
            </span>
          </div>
        )}

        {/* Lines Table */}
        <div className="mb-6 overflow-x-auto text-right font-sans" dir="rtl">
          <table className="w-full border-collapse text-xs select-none">
            <thead>
              <tr className="bg-slate-900 text-white rounded-lg">
                <th className="py-2.5 px-3 text-center border border-slate-900 font-extrabold w-8">#</th>
                <th className="py-2.5 px-3 border border-slate-900 font-extrabold text-right">الصنف / الوصف</th>
                <th className="py-2.5 px-3 text-center border border-slate-900 font-extrabold w-16">الكمية</th>
                <th className="py-2.5 px-3 text-center border border-slate-900 font-extrabold w-28">سعر الوحدة الصافي</th>
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
                  <td className="py-2.5 px-3 text-center font-mono font-black text-slate-900">
                    <div>{formatNumberWithLatinDigits(line.unit_price)}</div>
                    {quotation.prices_include_tax && line.entered_unit_price && (
                      <div className="text-[9px] text-slate-400 font-normal">
                        (شامل: {formatNumberWithLatinDigits(line.entered_unit_price)})
                      </div>
                    )}
                  </td>
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

        {/* Totals Section */}
        <div className="flex justify-end mb-6 font-sans" dir="rtl">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs select-none w-full md:w-80 shrink-0">
            <div className="flex justify-between font-bold text-slate-600">
              <span>الإجمالي قبل الخصم:</span>
              <span className="font-mono text-slate-900">{formatNumberWithLatinDigits(quotation.subtotal)}</span>
            </div>

            <div className="flex justify-between font-bold text-red-600">
              <span>إجمالي الخصم:</span>
              <span className="font-mono">-{formatNumberWithLatinDigits(quotation.discount_total)}</span>
            </div>

            <div className="flex justify-between font-bold text-slate-600 border-b border-slate-200 pb-2">
              <span>الوعاء الضريبي (الخاضع للضريبة):</span>
              <span className="font-mono text-slate-900">{formatNumberWithLatinDigits(quotation.subtotal - quotation.discount_total)}</span>
            </div>

            {!(profile.code === 'YE' && currentOrg?.is_vat_registered === false && quotation.tax_total === 0) && (
              <div className="flex justify-between font-bold text-slate-600 border-b border-slate-200 pb-2">
                <span>إجمالي {profile.vatLabel} ({formatNumberWithLatinDigits(getOrgDefaultTaxRate(currentOrg), 0)}%):</span>
                <span className="font-mono text-slate-900">{formatNumberWithLatinDigits(quotation.tax_total)}</span>
              </div>
            )}

            <div className="flex justify-between font-black text-slate-900 text-sm pt-1">
              <span>صافي القيمة الإجمالية للعرض:</span>
              <span className="font-mono text-brand-blue font-black">{formatNumberWithLatinDigits(quotation.total)} {quotation.currency || currentOrg?.currency_code || ''}</span>
            </div>
          </div>
        </div>

        {/* Terms & Conditions & Notes */}
        {(quotation.terms_and_conditions || quotation.notes) && (
          <div className="space-y-3 mb-6 select-none" dir="rtl">
            {quotation.terms_and_conditions && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] font-black text-slate-400 block mb-1 uppercase">الشروط والأحكام:</span>
                <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed text-right">
                  {quotation.terms_and_conditions}
                </p>
              </div>
            )}

            {quotation.notes && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] font-black text-slate-400 block mb-1 uppercase">ملاحظات إضافية:</span>
                <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed text-right">
                  {quotation.notes}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Corporate Footer */}
        <PrintFooter description="هذا المستند عبارة عن عرض سعر رسمي مقدم من المنشأة. يسري هذا العرض حتى تاريخ الصلاحية الموضح أعلاه." />

      </div>
    </div>
  );
};
