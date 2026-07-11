import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { inventoryService } from '../../lib/inventoryService';
import { InventoryAdjustment } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { formatArabicDateWithLatinDigits, formatNumberWithLatinDigits } from '../../lib/formatters';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintWatermark } from './PrintWatermark';
import { AlertCircle, Loader2 } from 'lucide-react';

export const InventoryAdjustmentPrint: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useAuth();

  const [adjustment, setAdjustment] = useState<InventoryAdjustment | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id && id) {
      loadAdjustment();
    }
  }, [currentOrg?.id, id]);

  const loadAdjustment = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await inventoryService.getAdjustmentById(id!);
      if (data.organization_id !== currentOrg!.id) {
        throw new Error('غير مصرح لك بالوصول إلى هذه المنشأة أو المستند');
      }
      setAdjustment(data);
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
          <p className="text-xs text-slate-500 font-bold">جاري تحميل مستند تسوية المخزون للطباعة...</p>
        </div>
      </div>
    );
  }

  if (error || !adjustment) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-6 text-center space-y-4 shadow-xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">تعذر تحميل مستند التسوية</h3>
            <p className="text-xs text-slate-400 mt-1">{error || 'المستند غير موجود أو تم حذفه'}</p>
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

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'increase': return 'زيادة مخزون';
      case 'decrease': return 'نقص مخزون';
      case 'stock_count': return 'جرد فعلي وتصحيح';
      default: return type;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'مسودة مؤقتة';
      case 'approved': return 'معتمد ومرحل';
      case 'cancelled': return 'ملغاة وعكسية';
      default: return status;
    }
  };

  return (
    <div className="bg-slate-100 min-h-screen animate-fadeIn" dir="rtl">
      <PrintActions customBackPath="/inventory/adjustments" />

      {/* Main A4 Printable Sheet Content Chassis */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden">
        
        {/* Watermark of status */}
        <PrintWatermark status={adjustment.status === 'approved' ? 'posted' : adjustment.status === 'cancelled' ? 'cancelled' : 'draft'} />

        {/* Corporate Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle="سـند تـسـويـة وجـرد الـمـخـزون"
          documentNumber={adjustment.adjustment_number}
          documentDate={adjustment.adjustment_date}
          extraMeta={[
            { label: 'نوع التسوية', value: getTypeLabel(adjustment.adjustment_type) },
            { label: 'السبب الأساسي', value: adjustment.reason || 'فرق جرد' },
            { label: 'حالة المستند', value: getStatusLabel(adjustment.status) }
          ]}
        />

        {/* Notes and description section */}
        {adjustment.notes && (
          <div className="mt-8 border border-slate-150 rounded-2xl p-4 bg-slate-50/50">
            <h4 className="text-[11px] font-bold text-slate-400 mb-1">ملاحظات وبيان المستند</h4>
            <p className="text-xs text-slate-700 leading-relaxed font-sans">{adjustment.notes}</p>
          </div>
        )}

        {/* Lines Table of physical stocks adjustments */}
        <div className="mt-8 border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50/80 font-bold text-slate-700">
              <tr>
                <th scope="col" className="px-4 py-3 text-right">م</th>
                <th scope="col" className="px-4 py-3 text-right">الصنف والرمز</th>
                <th scope="col" className="px-4 py-3 text-center">الكمية النظامية</th>
                {adjustment.adjustment_type === 'stock_count' && (
                  <th scope="col" className="px-4 py-3 text-center">الكمية الفعلية</th>
                )}
                <th scope="col" className="px-4 py-3 text-center">كمية التسوية</th>
                <th scope="col" className="px-4 py-3 text-left">تكلفة الوحدة</th>
                <th scope="col" className="px-4 py-3 text-left">التكلفة الإجمالية</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-150 text-slate-700">
              {adjustment.lines?.map((line: any, idx: number) => (
                <tr key={line.id} className="hover:bg-slate-50/30">
                  <td className="px-4 py-3.5 font-bold font-mono text-slate-400">{idx + 1}</td>
                  <td className="px-4 py-3.5">
                    <div className="font-bold text-slate-900 font-sans">{line.item?.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{line.item?.code} {line.notes && `• ${line.notes}`}</div>
                  </td>
                  <td className="px-4 py-3.5 text-center font-mono">{formatNumberWithLatinDigits(line.system_quantity)}</td>
                  {adjustment.adjustment_type === 'stock_count' && (
                    <td className="px-4 py-3.5 text-center font-mono font-bold text-slate-900">{formatNumberWithLatinDigits(line.actual_quantity)}</td>
                  )}
                  <td className={`px-4 py-3.5 text-center font-mono font-bold ${Number(line.adjustment_quantity) > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {Number(line.adjustment_quantity) > 0 ? '+' : ''}{formatNumberWithLatinDigits(line.adjustment_quantity)}
                  </td>
                  <td className="px-4 py-3.5 text-left font-mono">{formatNumberWithLatinDigits(line.unit_cost)}</td>
                  <td className="px-4 py-3.5 text-left font-mono font-bold">{formatNumberWithLatinDigits(line.total_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sum details section */}
        <div className="mt-8 flex justify-end">
          <div className="w-72 bg-slate-50/50 border border-slate-150 rounded-2xl p-5 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-bold">عدد الأصناف المسواة:</span>
              <span className="font-bold font-mono text-slate-800">{adjustment.lines?.length || 0} أصناف</span>
            </div>
            
            <div className="border-t border-slate-150 pt-3 flex justify-between items-center">
              <span className="text-slate-800 font-bold text-sm">إجمالي التسوية:</span>
              <span className="text-sm font-bold font-mono text-slate-900">
                {formatNumberWithLatinDigits(adjustment.total_amount)} <span className="text-[10px] text-slate-400 font-sans font-normal">{adjustment.currency_code}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Approval sign boxes */}
        <div className="mt-16 grid grid-cols-3 gap-6 text-center text-[11px] text-slate-500 font-sans">
          <div className="space-y-12">
            <p className="font-bold text-slate-400 border-b border-slate-100 pb-2">الموظف المسؤول (أمين المستودع)</p>
            <div className="text-slate-700 font-semibold">{(adjustment as any).creator?.full_name || '............................'}</div>
          </div>
          <div className="space-y-12">
            <p className="font-bold text-slate-400 border-b border-slate-100 pb-2">المدير المحاسبي والتدقيق</p>
            <div className="text-slate-700 font-semibold">{(adjustment as any).approver?.full_name || '............................'}</div>
          </div>
          <div className="space-y-12">
            <p className="font-bold text-slate-400 border-b border-slate-100 pb-2">الاعتماد الإداري والمصادقة</p>
            <div className="text-slate-700 font-semibold">........................................</div>
          </div>
        </div>

        {/* Corporate Footer branding */}
        <PrintFooter currentOrg={currentOrg} />

      </div>
    </div>
  );
};
