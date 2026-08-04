import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { purchaseService } from '../../lib/purchaseService';
import { PurchaseBill } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { getCountryProfile, getOrgDefaultTaxRate } from '../../lib/countryProfiles';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintWatermark } from './PrintWatermark';
import { AlertCircle, Loader2 } from 'lucide-react';

export const PurchaseBillPrint: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useAuth();

  const [bill, setBill] = useState<PurchaseBill | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id && id) {
      loadBill();
    }
  }, [currentOrg?.id, id]);

  const loadBill = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await purchaseService.getPurchaseBill(currentOrg!.id, id!);
      if (data.organization_id !== currentOrg!.id) {
        throw new Error('غير مصرح لك بالوصول إلى هذه المنشأة أو المستند');
      }
      setBill(data);
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
          <p className="text-xs text-slate-500 font-bold">جاري تحميل فاتورة الشراء...</p>
        </div>
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-6 text-center space-y-4 shadow-xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">تعذر تحميل مستند الفاتورة المشتراة ل طباعة</h3>
            <p className="text-xs text-slate-400 mt-1">{error || 'مستند الشراء غير موجود أو تم حذفه'}</p>
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

  const vendor = bill.vendor;
  const listItems = bill.lines || [];
  const profile = getCountryProfile(currentOrg?.country_code);
  const isVat = currentOrg?.is_vat_registered !== false;
  const docTitle = isVat ? 'فاتورة شراء ضريبية' : 'فاتورة شراء';

  return (
    <div className="bg-slate-100 min-h-screen">
      <PrintActions customBackPath="/purchases/bills" />

      {/* Main A4 Printable Sheet Container */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden">
        
        {/* Dynamic Watermark for drafts / cancelled */}
        <PrintWatermark status={bill.status} />

        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle={docTitle}
          documentNumber={bill.bill_number}
          documentDate={bill.bill_date}
          extraMeta={[
            { label: 'رقم فاتورة المورد', value: bill.vendor_invoice_number || 'غير محدد' },
            { label: 'تاريخ الاستحقاق', value: bill.due_date },
            { label: 'حالة القيد المشتري', value: bill.status === 'approved' ? 'معتمد ومرحل للمخازن' : bill.status === 'cancelled' ? 'ملغى' : 'مسودة قيد' },
            { label: 'حالة السداد للمورد', value: bill.payment_status === 'paid' ? 'مدفوعة بالكامل' : bill.payment_status === 'partially_paid' ? 'مدفوعة جزئياً' : 'غير مدفوعة' }
          ]}
        />

        {/* Supplier details box */}
        <div className="grid grid-cols-2 gap-6 print:gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-4.5 print:p-3 mb-8 print:mb-4 text-right font-sans" dir="rtl">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">المورد / البائع:</span>
            <span className="text-xs font-black text-slate-800 block">{vendor?.name || 'غير محدد'}</span>
            {vendor?.display_name && (
              <span className="text-[11px] text-slate-500 block mt-0.5">{vendor.display_name}</span>
            )}
            
            {vendor?.phone && (
              <div className="text-[11px] text-slate-600 mt-2">
                <span className="font-bold text-slate-500 font-sans">الجوال/الهاتف: </span>
                <span className="font-mono">{vendor.phone}</span>
              </div>
            )}
            {vendor?.email && (
              <div className="text-[11px] text-slate-600 mt-0.5">
                <span className="font-bold text-slate-500 font-sans">البريد الإلكتروني: </span>
                <span className="font-mono text-slate-550">{vendor.email}</span>
              </div>
            )}
          </div>

          <div className="border-r border-slate-200 pr-6 space-y-1 text-[11px] text-slate-600">
            <div>
              <span className="font-bold text-slate-500 font-sans">{profile.vatLabel} للمورد: </span>
              <span className="font-mono text-slate-800 font-extrabold">{vendor?.tax_number || 'غير متوفر'}</span>
            </div>
            {vendor?.commercial_registration && (
              <div>
                <span className="font-bold text-slate-500 font-sans">{profile.crLabel} للمورد: </span>
                <span className="font-mono text-slate-800 font-extrabold">{vendor.commercial_registration}</span>
              </div>
            )}
            {(vendor?.city || vendor?.address) && (
              <div className="pt-1">
                <span className="font-bold text-slate-500 font-sans">العنوان: </span>
                <span>{[vendor.city, vendor.address].filter(Boolean).join(' - ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tax calculation note banner */}
        {isVat && (
          <div className="mb-3 text-[11px] font-bold text-slate-600 flex items-center justify-between bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <span>احتساب الضريبة:</span>
            <span className={bill.prices_include_tax ? "text-emerald-700 font-extrabold" : "text-slate-700"}>
              {bill.prices_include_tax ? 'التكاليف المدخلة شاملة ضريبة القيمة المضافة' : 'التكاليف المدخلة غير شاملة ضريبة القيمة المضافة'}
            </span>
          </div>
        )}

        {/* Purchase billing lines */}
        <div className="mb-8 print:mb-4 overflow-x-auto text-right font-sans" dir="rtl">
          <table className="w-full border-collapse text-xs select-none">
            <thead>
              <tr className="bg-slate-900 text-white rounded-lg">
                <th className="py-2.5 px-3 text-center border border-slate-900 font-extrabold w-8">#</th>
                <th className="py-2.5 px-3 border border-slate-900 font-extrabold text-right">الصنف المقتنى / البيان</th>
                <th className="py-2.5 px-3 text-center border border-slate-900 font-extrabold w-16">الكمية</th>
                <th className="py-2.5 px-3 text-center border border-slate-900 font-extrabold w-28">تكلفة الوحدة الصافية</th>
                <th className="py-2.5 px-3 text-center border border-slate-900 font-extrabold w-20">الخصم</th>
                <th className="py-2.5 px-3 text-center border border-slate-900 font-extrabold w-16">الضريبة</th>
                <th className="py-2.5 px-3 text-left border border-slate-900 font-extrabold w-32">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {listItems.map((line, idx) => (
                <tr key={line.id || idx} className="hover:bg-slate-50 border-b border-slate-200">
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                  <td className="py-2.5 px-3">
                    <span className="font-black text-slate-800 block">{line.item?.name || 'صنف عيني/خدمة'}</span>
                    {line.description && (
                      <span className="text-[10px] text-slate-500 block mt-0.5">{line.description}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-black text-slate-900">{formatNumberWithLatinDigits(line.quantity, 0)}</td>
                  <td className="py-2.5 px-3 text-center font-mono font-black text-slate-900">
                    <div>{formatNumberWithLatinDigits(line.unit_cost)}</div>
                    {bill.prices_include_tax && line.entered_unit_cost && (
                      <div className="text-[9px] text-slate-400 font-normal">
                        (شامل: {formatNumberWithLatinDigits(line.entered_unit_cost)})
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono text-red-600 font-bold">
                    {line.discount_amount > 0 ? `-${formatNumberWithLatinDigits(line.discount_amount)}` : '0.00'}
                  </td>
                  <td className="py-2.5 px-3 text-center border-slate-200">
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
        <div className="flex justify-end mb-8 print:mb-4 font-sans" dir="rtl">
          <div className="w-80 bg-slate-50 border border-slate-200 rounded-2xl p-4 print:p-3 space-y-2 print:space-y-1 text-xs select-none">
            
            <div className="flex justify-between font-bold text-slate-600">
              <span>الإجمالي قبل الخصم والضريبة:</span>
              <span className="font-mono text-slate-900">{formatNumberWithLatinDigits(bill.subtotal)}</span>
            </div>
            
            <div className="flex justify-between font-bold text-red-600">
              <span>إجمالي الخصم الممنوح:</span>
              <span className="font-mono">-{formatNumberWithLatinDigits(bill.discount_total)}</span>
            </div>

            <div className="flex justify-between font-bold text-slate-600 border-b border-slate-200 pb-2">
              <span>الوعاء الخاضع ل{profile.vatLabel} المدخلات:</span>
              <span className="font-mono text-slate-900">{formatNumberWithLatinDigits(bill.subtotal - bill.discount_total)}</span>
            </div>

            {!(profile.code === 'YE' && currentOrg?.is_vat_registered === false && bill.tax_total === 0) && (
              <div className="flex justify-between font-bold text-slate-600 border-b border-slate-200 pb-2">
                <span>إجمالي {profile.vatLabel} لمدخلات السلع ({formatNumberWithLatinDigits(getOrgDefaultTaxRate(currentOrg), 0)}%):</span>
                <span className="font-mono text-slate-900">{formatNumberWithLatinDigits(bill.tax_total)}</span>
              </div>
            )}

            <div className="flex justify-between font-black text-slate-900 text-sm border-b border-double border-slate-300 pb-2">
              <span>صافي قيمة فاتورة المشتريات:</span>
              <span className="font-mono text-brand-blue font-black">{formatNumberWithLatinDigits(bill.total)} {bill.currency || currentOrg?.currency_code || ''}</span>
            </div>

            <div className="flex justify-between font-bold text-emerald-600 pt-1">
              <span>المبلغ الإجمالي المسدد للمورد:</span>
              <span className="font-mono">{formatNumberWithLatinDigits(bill.paid_amount)}</span>
            </div>

            <div className="flex justify-between font-extrabold text-slate-800">
              <span>المتبقي المطلوب تسويته للمستقبل:</span>
              <span className="font-mono font-bold text-slate-900">{formatNumberWithLatinDigits(bill.balance_due)}</span>
            </div>

          </div>
        </div>

        {/* Note block */}
        {bill.notes && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 print:p-2 mb-6 print:mb-3 font-sans select-none" dir="rtl">
            <span className="text-[10px] font-black text-slate-400 block mb-1">ملاحظات وبيان المشتريات:</span>
            <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed text-right">{bill.notes}</p>
          </div>
        )}

        {/* Corporate signatures */}
        <PrintFooter description={profile.code === 'YE' ? "مستند مالي داخلي يثبت استلام البضائع أو الخدمات المفوترة من المورد المدرج أعلاه. هذا المستند مُرحل لتقرير الضريبة ومطابق لشروط مصلحة الضرائب اليمنية." : "مستند مالي داخلي يثبت استلام البضائع أو الخدمات المفوترة من المورد المدرج أعلاه. هذا المستند مُرحل لتقرير القيمة المضافة (مدخلات) ومطابق لشروط هيئة الزكاة والضريبة والجمارك."} />

      </div>
    </div>
  );
};
