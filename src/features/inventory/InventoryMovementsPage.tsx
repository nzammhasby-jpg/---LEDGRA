import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { inventoryService } from '../../lib/inventoryService';
import { InventoryMovement, InventoryMovementType } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits, formatArabicDateWithLatinDigits } from '../../lib/formatters';
import { 
  Search, 
  Loader2, 
  AlertCircle, 
  ArrowLeft, 
  History, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CornerUpLeft, 
  CornerDownRight, 
  SlidersHorizontal 
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const InventoryMovementsPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  
  // Checking permissions
  const isSales = roleInCurrentOrg === 'sales';
  
  // Data State
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    if (currentOrg?.id) {
      loadMovements();
    }
  }, [currentOrg?.id]);

  const loadMovements = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await inventoryService.getMovements(currentOrg!.id);
      setMovements(data);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Filter logic
  const filteredMovements = movements.filter(m => {
    const item = m.item;
    if (!item) return false;

    const matchesSearch = 
      item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.notes && m.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = typeFilter === 'all' || m.movement_type === typeFilter;

    return matchesSearch && matchesType;
  });

  // Render Movement details helper
  const getMovementTypeBadge = (type: InventoryMovementType) => {
    switch (type) {
      case 'purchase':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 border border-emerald-100">
            <ArrowDownLeft className="h-3.5 w-3.5" />
            شراء وارد
          </span>
        );
      case 'sale':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800 border border-blue-100">
            <ArrowUpRight className="h-3.5 w-3.5" />
            بيع منصرف
          </span>
        );
      case 'purchase_cancel':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-800 border border-red-100">
            <CornerUpLeft className="h-3.5 w-3.5" />
            إلغاء شراء
          </span>
        );
      case 'sale_cancel':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-800 border border-purple-100">
            <CornerDownRight className="h-3.5 w-3.5" />
            إلغاء بيع (مرتجع)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-800 border border-gray-100">
            تسوية
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <span className="mr-3 text-gray-500 font-sans">جري تحميل حركة الأصناف...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="mb-2 flex items-center gap-1 text-xs text-gray-500 font-sans">
            <Link to="/inventory/balances" className="hover:text-emerald-600">رصيد المخزون</Link>
            <span>&gt;</span>
            <span className="text-gray-900 font-semibold">حركة الصنف</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 font-sans tracking-tight">حركة الصنف</h1>
          <p className="mt-1 text-sm text-gray-500 font-sans">سجل حركات التوريد والصرف والضبط المخزني والعمليات المالية العكسية بالتاريخ.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Link
            to="/inventory/balances"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
          >
            <ArrowLeft className="ml-2 h-4 w-4 text-gray-500" />
            العودة للأرصدة
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 shadow-sm border border-red-200">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-500 ml-3 shrink-0" />
            <div className="text-sm font-medium text-red-800 font-sans">
              {error}
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search controls */}
      <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm border border-gray-100 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-sm placeholder-gray-400 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans text-right"
            placeholder="البحث بالرمز أو اسم الصنف أو الملاحظات..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-600 font-sans">نوع الحركة:</span>
          </div>
          <select
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">كل الحركات</option>
            <option value="purchase">شراء وارد</option>
            <option value="sale">بيع منصرف</option>
            <option value="purchase_cancel">إلغاء شراء</option>
            <option value="sale_cancel">إلغاء بيع (مرتجع)</option>
          </select>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
        {filteredMovements.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <History className="h-12 w-12 text-gray-300 mb-3" />
            <span className="text-gray-500 font-sans text-sm">لم يعثر على أي حركات مخازن تسابق الفلترة الحالية.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider font-sans">
                  <th className="px-6 py-4">التاريخ</th>
                  <th className="px-6 py-4">كود الصنف</th>
                  <th className="px-6 py-4">اسم المنتج</th>
                  <th className="px-6 py-4">نوع الحركة</th>
                  <th className="px-6 py-4">المصدر والمستند</th>
                  <th className="px-6 py-4 text-center">كمية واردة (+)</th>
                  <th className="px-6 py-4 text-center">كمية منصرفة (-)</th>
                  {!isSales && (
                    <>
                      <th className="px-6 py-4 text-left">التكلفة / الوحدة</th>
                      <th className="px-6 py-4 text-left">إجمالي تكلفة المبيعات / الحركة</th>
                    </>
                  )}
                  <th className="px-6 py-4 text-center bg-gray-50/50">الرصيد بعد الحركة</th>
                  {!isSales && <th className="px-6 py-4 text-left">متوسط التكلفة بعد</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-700 font-sans">
                {filteredMovements.map((move) => {
                  const item = move.item;
                  if (!item) return null;

                  return (
                    <tr key={move.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4 font-mono text-xs text-gray-500">
                        {formatArabicDateWithLatinDigits(move.movement_date, {
                          year: 'numeric',
                          month: 'numeric',
                          day: 'numeric'
                        })}
                      </td>
                      <td className="px-6 py-4 font-mono font-medium text-gray-900">{item.code}</td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{item.name}</div>
                        {item.sku && <div className="text-xs font-mono text-gray-400 mt-0.5">SKU: {item.sku}</div>}
                      </td>
                      <td className="px-6 py-4">{getMovementTypeBadge(move.movement_type)}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">
                          {move.source_type === 'purchase_bill' ? 'فاتورة مشتريات' : move.source_type === 'sales_invoice' ? 'فاتورة مبيعات' : 'ضبط مخزني'}
                        </div>
                        <div className="text-xs text-gray-400 font-mono mt-0.5" title={move.notes || undefined}>
                          {move.notes || `مستند: ${move.source_id.substring(0, 8)}`}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-emerald-700 font-semibold">
                        {move.quantity_in > 0 ? `+${formatNumberWithLatinDigits(move.quantity_in, 2)}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-red-600 font-semibold">
                        {move.quantity_out > 0 ? `-${formatNumberWithLatinDigits(move.quantity_out, 2)}` : '-'}
                      </td>
                      {!isSales && (
                        <>
                          <td className="px-6 py-4 font-mono text-left text-gray-500">
                            {formatNumberWithLatinDigits(move.unit_cost, 2)} ر.س
                          </td>
                          <td className="px-6 py-4 font-mono text-left font-semibold text-gray-900">
                            {formatNumberWithLatinDigits(move.total_cost, 2)} ر.س
                          </td>
                        </>
                      )}
                      <td className="px-6 py-4 text-center font-mono font-bold text-gray-900 bg-gray-50/20">
                        {formatNumberWithLatinDigits(move.quantity_after, 2)}
                      </td>
                      {!isSales && (
                        <td className="px-6 py-4 font-mono text-left text-emerald-800">
                          {formatNumberWithLatinDigits(move.average_cost_after, 2)} ر.س
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
