import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { inventoryService } from '../../lib/inventoryService';
import { InventoryBalance } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits, formatArabicDateWithLatinDigits } from '../../lib/formatters';
import { 
  Search, 
  Loader2, 
  AlertCircle, 
  TrendingUp, 
  Package, 
  Layers, 
  ShieldCheck, 
  History,
  Info
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const InventoryBalancesPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  
  // Checking permissions
  const isSales = roleInCurrentOrg === 'sales';
  
  // Data State
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyInStock, setOnlyInStock] = useState<boolean>(false);

  useEffect(() => {
    if (currentOrg?.id) {
      loadBalances();
    }
  }, [currentOrg?.id]);

  const loadBalances = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await inventoryService.getBalances(currentOrg!.id);
      setBalances(data);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Filter Logic
  const filteredBalances = balances.filter(inv => {
    const item = inv.item;
    if (!item) return false;

    // Search query matches code or name
    const matchesSearch = 
      item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(searchQuery.toLowerCase()));

    // Stock level checks
    const matchesStock = !onlyInStock || inv.quantity_on_hand > 0;

    return matchesSearch && matchesStock;
  });

  // KPI Calculations
  const totalItems = balances.length;
  const inStockItemsCount = balances.filter(b => b.quantity_on_hand > 0).length;
  const totalValuation = balances.reduce((sum, inv) => sum + (Number(inv.inventory_value) || 0), 0);
  const totalQuantities = balances.reduce((sum, inv) => sum + (Number(inv.quantity_on_hand) || 0), 0);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <span className="mr-3 text-gray-500 font-sans">جري تحميل أرصدة المخزون...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-sans tracking-tight">رصيد المخزون</h1>
          <p className="mt-1 text-sm text-gray-500 font-sans">أرصدة الأصناف المخزنية الحالية ومتوسطات دورتها وبطاقتها التكاليفية.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Link
            to="/inventory/movements"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
          >
            <History className="ml-2 h-4 w-4 text-gray-500" />
            حركة الصنف
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

      {/* KPI Cards dashboard section */}
      {!isSales && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative overflow-hidden rounded-xl bg-white p-5 shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-gray-400 font-sans">إجمالي القيمة التقديرية</span>
              <div className="text-xl font-bold font-mono text-gray-900 tracking-tight">
                {formatNumberWithLatinDigits(totalValuation)} <span className="text-xs font-sans text-gray-400">{currentOrg?.currency_code || ''}</span>
              </div>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl bg-white p-5 shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-gray-400 font-sans">إجمالي قطع البضائع</span>
              <div className="text-xl font-bold font-mono text-gray-900 tracking-tight">
                {formatNumberWithLatinDigits(totalQuantities, 0)}
              </div>
            </div>
            <div className="rounded-lg bg-blue-50 p-3">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl bg-white p-5 shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-gray-400 font-sans">أصناف متوفرة في المخزن</span>
              <div className="text-xl font-bold font-mono text-gray-900 tracking-tight">
                {inStockItemsCount} <span className="text-xs text-gray-400 font-sans">من {totalItems}</span>
              </div>
            </div>
            <div className="rounded-lg bg-indigo-50 p-3">
              <Layers className="h-5 w-5 text-indigo-600" />
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl bg-white p-5 shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-gray-400 font-sans">نظام الصرف المعتمد</span>
              <div className="text-sm font-bold font-sans text-emerald-700 tracking-tight flex items-center gap-1">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                متوسط التكلفة المرجح (WAC)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar Section */}
      <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm border border-gray-100 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-sm placeholder-gray-400 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans LTR text-right"
            placeholder="البحث باسم الصنف أو الكود..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={onlyInStock}
              onChange={(e) => setOnlyInStock(e.target.checked)}
            />
            <div className="relative w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            <span className="ms-3 text-sm font-medium text-gray-700 font-sans">الأصناف المتوفرة فقط</span>
          </label>
        </div>
      </div>

      {/* Main Table section */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
        {filteredBalances.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Package className="h-12 w-12 text-gray-300 mb-3" />
            <span className="text-gray-500 font-sans text-sm">لم يعثر على أي أرصدة مخزنية تطابق الفلترة الحالية.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider font-sans">
                  <th className="px-6 py-4">كود الصنف</th>
                  <th className="px-6 py-4">اسم المنتج وثيقة التخزين</th>
                  <th className="px-6 py-4">الكمية المتاحة</th>
                  <th className="px-6 py-4">وحدة القياس</th>
                  {!isSales && (
                    <>
                      <th className="px-6 py-4 text-left">متوسط التكلفة وحدة (WAC)</th>
                      <th className="px-6 py-4 text-left">إجمالي القيمة المخزنية</th>
                    </>
                  )}
                  <th className="px-6 py-4">آخر حركة مخزن</th>
                  {!isSales && <th className="px-6 py-4">الحسابات المربوطة</th>}
                  <th className="px-6 py-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-700 font-sans">
                {filteredBalances.map((inv) => {
                  const item = inv.item;
                  if (!item) return null;
                  
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4 font-mono font-medium text-gray-900">{item.code}</td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{item.name}</div>
                        {item.sku && <div className="text-xs font-mono text-gray-400 mt-0.5">SKU: {item.sku}</div>}
                      </td>
                      <td className="px-6 py-4 font-mono font-semibold text-emerald-700">
                        {formatNumberWithLatinDigits(inv.quantity_on_hand, 2)}
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-xs">{item.unit || 'حبة'}</td>
                      {!isSales && (
                        <>
                          <td className="px-6 py-4 font-mono text-left text-gray-900">
                            {formatNumberWithLatinDigits(inv.average_cost, 2)} {currentOrg?.currency_code || ''}
                          </td>
                          <td className="px-6 py-4 font-mono text-left font-semibold text-gray-900 bg-gray-50/20">
                            {formatNumberWithLatinDigits(inv.inventory_value, 2)} {currentOrg?.currency_code || ''}
                          </td>
                        </>
                      )}
                      <td className="px-6 py-4 text-xs text-gray-400 font-mono">
                        {formatArabicDateWithLatinDigits(inv.last_movement_at, {
                          year: 'numeric',
                          month: 'short',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      {!isSales && (
                        <td className="px-6 py-4 text-xs text-gray-500">
                          <div className="flex flex-col gap-1">
                            {item.inventory_account_id ? (
                              <span className="flex items-center gap-1" title="حساب المخازن">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                مخزن: {item.inventory_account?.name_ar || item.inventory_account_id.substring(0, 8)}
                              </span>
                            ) : (
                              <span className="text-amber-600 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" />
                                مخزن: يدوي/تلقائي الإعدادات
                              </span>
                            )}
                            {item.cogs_account_id ? (
                              <span className="flex items-center gap-1" title="حساب تكلفة المبيعات">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                تكلفة: {item.cogs_account?.name_ar || item.cogs_account_id.substring(0, 8)}
                              </span>
                            ) : (
                              <span className="text-amber-600 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" />
                                تكلفة: يدوي/تلقائي الإعدادات
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          item.is_active 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                            : 'bg-red-50 text-red-700 border border-red-100'
                        }`}>
                          {item.is_active ? 'نشط' : 'موقف'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Warning Alert footer bar */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 flex gap-3">
        <Info className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
        <p className="text-xs text-gray-600 font-sans leading-relaxed">
          <strong>إدارة الصرف الآلي:</strong> يتم حساب حركة التوريد والصرف ديناميكياً فور اعتماد المستندات المالية والتحقق التلقائي يضمن الحجب المطلق لعمليات الصرف بالسالب حمايةً وتأكيداً لصحة دليل الحسابات اليومية والميزانية العمومية.
        </p>
      </div>
    </div>
  );
};
