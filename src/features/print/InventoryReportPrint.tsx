import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { reportsService, InventoryReportRow } from '../../lib/reportsService';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits, formatDateWithEnglishDigits } from '../../lib/formatters';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { AlertCircle, Loader2 } from 'lucide-react';

export const InventoryReportPrint: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  
  // Sales representative cannot view financial metrics like average cost or inventory total value
  const isSalesRepresentative = roleInCurrentOrg === 'sales';

  const [items, setItems] = useState<InventoryReportRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id) {
      loadReport();
    }
  }, [currentOrg?.id]);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await reportsService.getInventoryReport(currentOrg!.id);
      setItems(data);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Calculate sum totals if authorized
  const totalQuantity = items.reduce((acc, val) => acc + (val.quantity_on_hand || 0), 0);
  const totalValue = items.reduce((acc, val) => acc + (val.inventory_value || 0), 0);

  return (
    <div className="bg-slate-100 min-h-screen">
      <PrintActions customBackPath="/inventory/balances" />

      {/* Main A4 Printable Sheet Content Chassis */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden">
        
        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle="تقرير جرد وقيمة المخزون"
          documentNumber="INV-VAL"
          documentDate={new Date().toISOString().split('T')[0]}
          extraMeta={[
            { label: 'الصفة التنظيمية', value: isSalesRepresentative ? 'صلاحية مبيعات (كمية فقط)' : 'صلاحية كاملة (شام ل التكاليف)' }
          ]}
        />

        {/* Inventory Items table */}
        <div className="mb-8 overflow-x-auto text-right font-sans" dir="rtl">
          <table className="w-full border-collapse text-xs select-none">
            <thead>
              <tr className="bg-slate-900 text-white rounded-lg">
                <th className="py-2 px-2 border border-slate-900 font-extrabold w-8 text-center">#</th>
                <th className="py-2 px-2 border border-slate-900 font-extrabold w-28 text-right">كود المادة</th>
                <th className="py-2 px-2 border border-slate-900 font-extrabold text-right">اسم ومسمى الصنف</th>
                <th className="py-2 px-2 border border-slate-900 font-extrabold w-24 text-center">الكمية المتوفرة</th>
                {!isSalesRepresentative && (
                  <>
                    <th className="py-2 px-2 border border-slate-900 font-extrabold w-28 text-center">متوسط التكلفة WAC</th>
                    <th className="py-2 px-2 border border-slate-900 font-extrabold w-32 text-left">قيمة المخزون الدفترية</th>
                  </>
                )}
                <th className="py-2 px-2 border border-slate-900 font-extrabold w-28 text-center">تاريخ آخر حركة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={isSalesRepresentative ? 5 : 7} className="py-8 px-3 border border-slate-200 text-center text-slate-400">
                    لا توجد منتجات أو مخزون مسجل حالياً في دفاتر المنشأة.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr key={item.item_id || idx} className="hover:bg-slate-50 border-b border-slate-200 font-sans">
                    <td className="py-2.5 px-2 text-slate-400 text-center font-mono font-bold">{idx + 1}</td>
                    <td className="py-2.5 px-2 font-mono text-slate-700 font-bold text-right">{item.item_code}</td>
                    <td className="py-2.5 px-2">
                      <span className="font-black text-slate-800 block">{item.item_name_ar}</span>
                      {item.item_name_en && (
                        <span className="text-[10px] text-slate-400 font-mono block mt-0.5">{item.item_name_en}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 font-mono font-black text-slate-900 text-center">
                      {formatNumberWithLatinDigits(item.quantity_on_hand, 0)}
                    </td>
                    {!isSalesRepresentative && (
                      <>
                        <td className="py-2.5 px-2 font-mono font-black text-slate-905 text-center">
                          {formatNumberWithLatinDigits(item.average_cost)}
                        </td>
                        <td className="py-2.5 px-2 font-mono font-black text-brand-blue text-left">
                          {formatNumberWithLatinDigits(item.inventory_value)}
                        </td>
                      </>
                    )}
                    <td className="py-2.5 px-2 font-mono text-slate-450 text-center">
                      {item.last_movement_at ? item.last_movement_at.split('T')[0] : 'بلا حركة'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Global valuation totals block under the list */}
        <div className="flex justify-end mb-8 font-sans" dir="rtl">
          <div className="w-96 bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs select-none">
            <div className="flex justify-between font-bold text-slate-600">
              <span>إجمالي بنود الأصناف المسجلة:</span>
              <span className="font-mono text-slate-900">{items.length} أصناف</span>
            </div>
            
            <div className="flex justify-between font-bold text-slate-600 border-b border-slate-150 pb-2">
              <span>إجمالي الكميات المتوفرة (أون-هاند):</span>
              <span className="font-mono text-slate-900">{formatNumberWithLatinDigits(totalQuantity, 0)} وحدات</span>
            </div>

            {!isSalesRepresentative ? (
              <div className="flex justify-between font-black text-slate-900 text-sm">
                <span>القيمة الشرائية الكلية للمخازن (الرصيد الدفتري):</span>
                <span className="font-mono text-brand-blue font-black">{formatNumberWithLatinDigits(totalValue)} SAR</span>
              </div>
            ) : (
              <div className="text-[10px] text-slate-400 text-center italic pt-1">
                تم حجب ميزانيات متوسط التكاليف والقيم المحتسبة لمستوى صلاحية مقتصرة على المبيعات.
              </div>
            )}
          </div>
        </div>

        {/* Standard signatures drawer link layout */}
        <PrintFooter showSignatures={true} description="يعتبر جرد وإثبات كميات المخزون المذكورة أعلاه مطابقاً للحالة الفعلية في المستودعات لغاية وقت وتاريخ طباعة المستند. يخضع لمصادقة أمناء المستودعات ومدراء التخطيط والتوريد." />

      </div>
    </div>
  );
};
