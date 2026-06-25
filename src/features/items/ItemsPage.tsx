import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { masterDataService } from '../../lib/masterDataService';
import { accountingService } from '../../lib/accountingService';
import { Item, Account, ItemType } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { 
  formatNumberWithLatinDigits, 
  normalizeInputDigits,
  normalizeDecimalInput
} from '../../lib/formatters';
import { 
  FileText, 
  Search, 
  Plus, 
  X, 
  Edit, 
  Layers, 
  Activity, 
  DollarSign, 
  Barcode, 
  AlertCircle,
  Loader2,
  Lock,
  ShoppingBag,
  Briefcase
} from 'lucide-react';

export const ItemsPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Checking permissions
  const canManage = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant';
  
  // Data State
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<string>('all');

  // Form Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  // Form values
  const [itemType, setItemType] = useState<ItemType>('product');
  const [code, setCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [unit, setUnit] = useState<string>(' حبة');
  const [sku, setSku] = useState<string>('');
  const [barcode, setBarcode] = useState<string>('');
  const [sellingPrice, setSellingPrice] = useState<string>('0');
  const [purchasePrice, setPurchasePrice] = useState<string>('0');
  const [taxRate, setTaxRate] = useState<number>(15.00); // Default Saudi VAT 15.00%
  const [salesAccountId, setSalesAccountId] = useState<string>('');
  const [serviceRevenueAccountId, setServiceRevenueAccountId] = useState<string>('');
  const [inventoryAccountId, setInventoryAccountId] = useState<string>('');
  const [cogsAccountId, setCogsAccountId] = useState<string>('');
  const [expenseAccountId, setExpenseAccountId] = useState<string>('');
  const [isStockable, setIsStockable] = useState<boolean>(false);
  const [isActive, setIsActive] = useState<boolean>(true);

  useEffect(() => {
    if (currentOrg?.id) {
      loadData();
    }
  }, [currentOrg?.id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [allItems, allAccounts, settings] = await Promise.all([
        masterDataService.getItems(currentOrg!.id),
        accountingService.getAccounts(currentOrg!.id),
        accountingService.getAccountingSettings(currentOrg!.id).catch(() => null)
      ]);

      setItems(allItems);
      setAccounts(allAccounts.filter(acc => acc.allow_direct_posting && acc.is_active));

      // Auto-set defaults based on Settings
      if (settings) {
        if (settings.default_sales_account_id) setSalesAccountId(settings.default_sales_account_id);
        if (settings.default_service_sales_account_id) setServiceRevenueAccountId(settings.default_service_sales_account_id);
        if (settings.default_inventory_account_id) setInventoryAccountId(settings.default_inventory_account_id);
        if (settings.default_cogs_account_id) setCogsAccountId(settings.default_cogs_account_id);
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Safe Filter list segments helpers
  const getFilteredAccounts = (classification: 'assets' | 'liabilities' | 'equity' | 'revenue' | 'expenses') => {
    return accounts.filter(acc => acc.classification === classification);
  };

  // Open modal as Add
  const handleAddClick = useCallback(() => {
    setEditingItem(null);
    setFormError(null);
    
    // Auto-generate items code logically
    const nextNum = items.length + 1;
    const paddingStr = String(nextNum).padStart(4, '0');
    setCode(`ITEM-${paddingStr}`);

    setItemType('product');
    setName('');
    setDescription('');
    setUnit('حبة');
    setSku('');
    setBarcode('');
    setSellingPrice('0');
    setPurchasePrice('0');
    setTaxRate(15.00);
    setIsStockable(false);
    setIsActive(true);

    // Load defaults from database state
    accountingService.getAccountingSettings(currentOrg!.id)
      .then(settings => {
        if (settings) {
          setSalesAccountId(settings.default_sales_account_id || '');
          setServiceRevenueAccountId(settings.default_service_sales_account_id || '');
          setInventoryAccountId(settings.default_inventory_account_id || '');
          setCogsAccountId(settings.default_cogs_account_id || '');
        }
      })
      .catch(() => null);

    setIsModalOpen(true);
  }, [items, currentOrg]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);

    if (params.get('action') === 'new') {
      handleAddClick();

      if (params.get('type') === 'stockable') {
        setIsStockable(true);
        setItemType('product');
      }

      navigate(location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, navigate, handleAddClick]);

  // Open modal as Edit
  const handleEditClick = (it: Item) => {
    setEditingItem(it);
    setFormError(null);

    setItemType(it.item_type);
    setCode(it.code);
    setName(it.name);
    setDescription(it.description || '');
    setUnit(it.unit || 'حبة');
    setSku(it.sku || '');
    setBarcode(it.barcode || '');
    setSellingPrice(String(it.selling_price));
    setPurchasePrice(String(it.purchase_price));
    setTaxRate(it.tax_rate);
    setSalesAccountId(it.sales_account_id || '');
    setServiceRevenueAccountId(it.service_revenue_account_id || '');
    setInventoryAccountId(it.inventory_account_id || '');
    setCogsAccountId(it.cogs_account_id || '');
    setExpenseAccountId(it.expense_account_id || '');
    setIsStockable(it.is_stockable);
    setIsActive(it.is_active);

    setIsModalOpen(true);
  };

  // Toggle active status directly
  const handleToggleActive = async (it: Item) => {
    if (!canManage) return;
    try {
      setLoading(true);
      await masterDataService.updateItem(currentOrg!.id, it.id, {
        item_type: it.item_type,
        code: it.code,
        name: it.name,
        description: it.description || undefined,
        unit: it.unit || undefined,
        sku: it.sku || undefined,
        barcode: it.barcode || undefined,
        selling_price: it.selling_price,
        purchase_price: it.purchase_price,
        tax_rate: it.tax_rate,
        sales_account_id: it.sales_account_id || undefined,
        service_revenue_account_id: it.service_revenue_account_id || undefined,
        inventory_account_id: it.inventory_account_id || undefined,
        cogs_account_id: it.cogs_account_id || undefined,
        expense_account_id: it.expense_account_id || undefined,
        is_stockable: it.is_stockable,
        is_active: !it.is_active
      });
      await loadData();
    } catch (err: any) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    if (!currentOrg) return;

    setFormError(null);

    // Validations
    if (!code.trim()) {
      setFormError('كود الصنف مطلوب.');
      return;
    }
    if (!name.trim()) {
      setFormError('اسم المنتج أو الخدمة مطلوب.');
      return;
    }

    // Rules verification based on type
    if (itemType === 'service') {
      if (isStockable) {
        setFormError('لا يمكن فرز الخدمات كأصناف قابلة للتخزين.');
        return;
      }
      if (!serviceRevenueAccountId) {
        setFormError('الخدمة يجب أن ترتبط بحساب إيرادات خدمات نشط ونهائي.');
        return;
      }
    }

    if (itemType === 'product') {
      if (!salesAccountId) {
        setFormError('المنتج يجب أن يرتبط بحساب مبيعات سلع نشط ونهائي.');
        return;
      }
      if (isStockable) {
        if (!inventoryAccountId) {
          setFormError('المنتج القابل للمخزون يطلب ربطاً إلزامياً حساب مخزون (أصول متداولة).');
          return;
        }
        if (!cogsAccountId) {
          setFormError('المنتج القابل للمخزون يطلب ربطاً إلزامياً حساب تكلفة المبيعات (مصروفات).');
          return;
        }
      }
    }

    setSaveLoading(true);
    try {
      const cleanSelling = parseFloat(normalizeDecimalInput(sellingPrice)) || 0.00;
      const cleanPurchase = parseFloat(normalizeDecimalInput(purchasePrice)) || 0.00;

      const inputPayload = {
        item_type: itemType,
        code: normalizeInputDigits(code.trim()).toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
        unit: unit.trim() || undefined,
        sku: normalizeInputDigits(sku.trim()).toUpperCase() || undefined,
        barcode: normalizeInputDigits(barcode.trim()) || undefined,
        selling_price: cleanSelling,
        purchase_price: cleanPurchase,
        tax_rate: taxRate,
        sales_account_id: (itemType === 'product' && salesAccountId) ? salesAccountId : undefined,
        service_revenue_account_id: (itemType === 'service' && serviceRevenueAccountId) ? serviceRevenueAccountId : undefined,
        inventory_account_id: (itemType === 'product' && isStockable && inventoryAccountId) ? inventoryAccountId : undefined,
        cogs_account_id: (itemType === 'product' && isStockable && cogsAccountId) ? cogsAccountId : undefined,
        expense_account_id: (itemType === 'product' && !isStockable && expenseAccountId) ? expenseAccountId : undefined,
        is_stockable: itemType === 'product' ? isStockable : false,
      };

      if (editingItem) {
        // Update
        await masterDataService.updateItem(currentOrg.id, editingItem.id, {
          ...inputPayload,
          is_active: isActive
        });
      } else {
        // Create
        await masterDataService.createItem(currentOrg.id, inputPayload);
      }

      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaveLoading(false);
    }
  };

  // Filter list
  const filteredItems = items.filter(it => {
    const term = searchQuery.toLowerCase();
    const matchSearch = 
      it.name.toLowerCase().includes(term) ||
      it.code.toLowerCase().includes(term) ||
      (it.sku && it.sku.toLowerCase().includes(term)) ||
      (it.barcode && it.barcode.includes(term));

    const matchType = 
      typeFilter === 'all' || 
      it.item_type === typeFilter;

    const matchStock = 
      stockFilter === 'all' ||
      (stockFilter === 'stockable' && it.is_stockable) ||
      (stockFilter === 'non_stockable' && !it.is_stockable);

    return matchSearch && matchType && matchStock;
  });

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 bg-brand-blue/10 rounded-lg text-brand-blue">
              <Layers className="w-5 h-5" />
            </span>
            <h1 className="text-lg font-black text-slate-800 font-sans tracking-tight">إدارة دليل المنتجات والخدمات</h1>
          </div>
          <p className="text-xs text-slate-400">قائمة السلع والخدمات وضبط الأثر المالي الدفتري المرتبط بحركات البيع والمشتريات والمخزن والـ VAT.</p>
        </div>

        {canManage ? (
          <button
            onClick={handleAddClick}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-brand-blue text-white rounded-xl text-xs font-bold hover:bg-brand-blue-dark transition duration-150 shadow-md shadow-brand-blue/10"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة صنف جديد</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>غير مصرح بإجراء تعديلات</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl flex items-start gap-2 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Options */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          
          <div className="md:col-span-2 relative">
            <input
              type="text"
              placeholder="البحث باسم الصنف، الكود الإنجليزي، الـ SKU، الباركود..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-9 py-2.5 text-slate-800 outline-none focus:border-brand-blue"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          </div>

          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 text-slate-700 outline-none"
            >
              <option value="all">كل أنواع الأصناف</option>
              <option value="product">منتجات مادية سلع وعينات</option>
              <option value="service">خدمات واستشارات</option>
            </select>
          </div>

          <div>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 text-slate-700 outline-none"
            >
              <option value="all">كل معايير التخزين</option>
              <option value="stockable">أصناف مخزنية قابلة للعد</option>
              <option value="non_stockable">أصناف غير مخزنية</option>
            </select>
          </div>

        </div>
      </div>

      {/* Grid display */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-24 text-center text-slate-400 flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 text-brand-blue animate-spin mb-3" />
            <span className="text-xs font-bold text-slate-500">جاري تحميل دليل السلع والخدمات...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-24 text-center text-slate-300 flex flex-col items-center justify-center">
            <FileText className="w-16 h-16 text-slate-100 mb-4" />
            <span className="font-bold text-sm text-slate-550">دليل المنتجات فارغ</span>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">تطابق شروط التصفية فارغة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-150 text-slate-500 font-bold">
                  <th className="px-5 py-3 w-28">الكود الإنجليزي</th>
                  <th className="px-5 py-3">الاسم والبيان</th>
                  <th className="px-5 py-3">النوع</th>
                  <th className="px-5 py-3 text-center">الوحدة</th>
                  <th className="px-5 py-3">الترميز (SKU)</th>
                  <th className="px-5 py-3 text-left">سعر البيع</th>
                  <th className="px-5 py-3 text-left">سعر الشراء</th>
                  <th className="px-5 py-3 text-center">ضريبة الـ VAT</th>
                  <th className="px-5 py-3 text-center">المخزن ومراقبة البضاعة</th>
                  <th className="px-5 py-3 text-center w-28">الحالة</th>
                  <th className="px-5 py-3 text-center w-24">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredItems.map(it => (
                  <tr key={it.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-4 font-mono text-slate-500 tracking-wider">
                      {it.code}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-800">{it.name}</div>
                      {it.description && (
                        <div className="text-[10px] text-slate-400 truncate max-w-[200px] mt-0.5">{it.description}</div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <div className="flex items-center gap-1">
                        {it.item_type === 'product' ? (
                          <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg"><ShoppingBag className="w-3.5 h-3.5" /></span>
                        ) : (
                          <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg"><Briefcase className="w-3.5 h-3.5" /></span>
                        )}
                        <span>{it.item_type === 'product' ? 'منتج مادي' : 'خدمة محاسبية'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center text-slate-500 font-bold">
                      {it.unit || '-'}
                    </td>
                    <td className="px-5 py-4 text-slate-500 font-mono tracking-wider">
                      {it.sku || <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-5 py-4 text-left font-mono font-bold text-slate-800" dir="ltr">
                      {formatNumberWithLatinDigits(it.selling_price)}
                    </td>
                    <td className="px-5 py-4 text-left font-mono font-bold text-slate-500" dir="ltr">
                      {formatNumberWithLatinDigits(it.purchase_price)}
                    </td>
                    <td className="px-5 py-4 text-center font-mono text-slate-500">
                      %{formatNumberWithLatinDigits(it.tax_rate, 0)}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        it.is_stockable 
                          ? 'bg-blue-50 text-blue-600 border border-blue-150' 
                          : 'bg-slate-50 text-slate-500 border border-slate-100'
                      }`}>
                        {it.is_stockable ? 'مراقب مخزنياً' : 'بلا جرد'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button 
                        onClick={() => handleToggleActive(it)}
                        disabled={!canManage}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${
                          it.is_active 
                            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100/70' 
                            : 'bg-rose-50 text-rose-500 hover:bg-rose-100/70'
                        } transition`}
                      >
                        <span className={`w-1 h-1 rounded-full ${it.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                        <span>{it.is_active ? 'نشط' : 'معطل'}</span>
                      </button>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        onClick={() => handleEditClick(it)}
                        className="p-1 text-slate-400 hover:text-brand-blue hover:bg-slate-50 rounded transition"
                        title="تعديل بيانات الصنف"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-over/Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  {editingItem ? `تعديل الصنف: ${editingItem.name}` : 'تسجيل صنف/خدمة جديدة في الدليل'}
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">ستقوم بربط هذا الصنف بالحسابات الشجرية المناسبة في المنشأة لتقييد الإيرادات والمصروفات بدقة.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-150 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form Content */}
            <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4 flex-1">
              {formError && (
                <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl flex items-start gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Item Type Toggle */}
                <div className="md:col-span-2">
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">نوع الكيان الأساسي لدليل الأصناف</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-xs font-bold cursor-pointer bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl flex-1 justify-center hover:bg-slate-100">
                      <input
                        type="radio"
                        name="itemType"
                        value="product"
                        checked={itemType === 'product'}
                        onChange={() => {
                          setItemType('product');
                          setIsStockable(false);
                          setFormError(null);
                        }}
                        className="text-brand-blue"
                      />
                      <span>صنف مادي (منتج ملموس)</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-bold cursor-pointer bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl flex-1 justify-center hover:bg-slate-100">
                      <input
                        type="radio"
                        name="itemType"
                        value="service"
                        checked={itemType === 'service'}
                        onChange={() => {
                          setItemType('service');
                          setIsStockable(false);
                          setFormError(null);
                        }}
                        className="text-brand-blue"
                      />
                      <span>استشارات / خدمة غير مادية</span>
                    </label>
                  </div>
                </div>

                {/* Code */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">الكود الإنجليزي للصنف (فريد)</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(normalizeInputDigits(e.target.value).toUpperCase())}
                    className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="ITEM-0001"
                    required
                    dir="ltr"
                  />
                </div>

                {/* SKU Code */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">رمز SKU (الترميز التخزيني)</label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(normalizeInputDigits(e.target.value).toUpperCase())}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="SKU-XXXX"
                    dir="ltr"
                  />
                </div>

                {/* Name */}
                <div className="md:col-span-2">
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">اسم الصنف أو الخدمة</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-brand-blue"
                    placeholder="اسم المنتج بحدين ماديين أو الخدمة المقدمة للعميل"
                    required
                  />
                </div>

                {/* Barcode */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">الباركود (Barcode)</label>
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(normalizeInputDigits(e.target.value))}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="سيريال نمبر الباركود"
                    dir="ltr"
                  />
                </div>

                {/* Unit */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">وحدة القياس / التعبئة</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                    placeholder="حبة، متر، كرتون، خدمات..."
                  />
                </div>

                {/* Selling Price */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">سعر البيع الافتراضي (ريال سعودي)</label>
                  <input
                    type="text"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(normalizeDecimalInput(e.target.value))}
                    className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none text-left"
                    placeholder="0.00"
                    dir="ltr"
                  />
                </div>

                {/* Purchase Price */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">تكلفة الشراء الافتراضية (ريال سعودي)</label>
                  <input
                    type="text"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(normalizeDecimalInput(e.target.value))}
                    className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none text-left"
                    placeholder="0.00"
                    dir="ltr"
                  />
                </div>

                {/* Tax Rate (VAT Options) */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">معدل ضريبة الـ VAT</label>
                  <select
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value))}
                    className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                  >
                    <option value="15.00">الضريبة القياسية في المملكة (15%)</option>
                    <option value="0.00">الضريبة الصفرية (0%)</option>
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">وصف الصنف التفصيلي</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                    placeholder="مواصفات تظهر على عروض السعر والفواتير"
                  />
                </div>

                {/* Is stockable checkbox toggler for product only */}
                {itemType === 'product' && (
                  <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-150 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800">مراقبة الكميات والمخزون</span>
                      <p className="text-[10px] text-slate-400 mt-1">إذا قمت بتفعيل المخزن التخزيني، سيُطلب محاسبياً ربط حساب المخزون للأصل وحساب تكلفة بضاعة مباعة.</p>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsStockable(!isStockable);
                          setFormError(null);
                        }}
                        className={`inline-flex px-4 py-2 text-xs font-bold rounded-xl ${
                          isStockable 
                            ? 'bg-blue-50 text-blue-600 border border-blue-250 animate-pulse' 
                            : 'bg-white text-slate-500 border border-slate-200'
                        }`}
                      >
                        {isStockable ? 'مراقب كمياً ومخزنياً' : 'بدون جرد ومخزون'}
                      </button>
                    </div>
                  </div>
                )}


                {/* ACCOUNTING SECTION */}
                <div className="md:col-span-2 border-t border-slate-100 pt-4">
                  <h4 className="text-xs font-bold text-slate-800 mb-3">الربط المحاسبي بدليل شجرة الحسابات</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* For products: Sales / Revenue account */}
                    {itemType === 'product' && (
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 block mb-1">حساب مبيعات السلع والمنتجات</label>
                        <select
                          value={salesAccountId}
                          onChange={(e) => setSalesAccountId(e.target.value)}
                          className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                          required={itemType === 'product'}
                        >
                          <option value="">-- يرجى اختيار حساب المبيعات من الإيرادات --</option>
                          {getFilteredAccounts('revenue').map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.code} - {acc.name_ar}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* For services: Service Revenue Account */}
                    {itemType === 'service' && (
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 block mb-1">حساب مبيعات وإيراد الخدمات</label>
                        <select
                          value={serviceRevenueAccountId}
                          onChange={(e) => setServiceRevenueAccountId(e.target.value)}
                          className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                          required={itemType === 'service'}
                        >
                          <option value="">-- يرجى اختيار حساب إيراد خدمات من الإيرادات --</option>
                          {getFilteredAccounts('revenue').map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.code} - {acc.name_ar}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Inventory account check */}
                    {itemType === 'product' && isStockable && (
                      <>
                        <div>
                          <label className="text-[11px] font-bold text-slate-500 block mb-1">حساب المخزن الفعلي (أصول متداولة)</label>
                          <select
                            value={inventoryAccountId}
                            onChange={(e) => setInventoryAccountId(e.target.value)}
                            className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                            required
                          >
                            <option value="">-- حساب المخزون السلعي (أصول) --</option>
                            {getFilteredAccounts('assets').map(acc => (
                              <option key={acc.id} value={acc.id}>{acc.code} - {acc.name_ar}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-500 block mb-1">حساب تكلفة المبيعات بضاعة مُباعة (مصروفات)</label>
                          <select
                            value={cogsAccountId}
                            onChange={(e) => setCogsAccountId(e.target.value)}
                            className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                            required
                          >
                            <option value="">-- حساب تكلفة المبيعات (مصروفات) --</option>
                            {getFilteredAccounts('expenses').map(acc => (
                              <option key={acc.id} value={acc.id}>{acc.code} - {acc.name_ar}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}

                    {/* Direct expense account for non-stockable products */}
                    {itemType === 'product' && !isStockable && (
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 block mb-1">حساب مصروف الصنف عند الشراء المباشر (مصروفات)</label>
                        <select
                          value={expenseAccountId}
                          onChange={(e) => setExpenseAccountId(e.target.value)}
                          className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                        >
                          <option value="">-- اختيار حساب مصروف مباشر (اختياري) --</option>
                          {getFilteredAccounts('expenses').map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.code} - {acc.name_ar}</option>
                          ))}
                        </select>
                      </div>
                    )}

                  </div>
                </div>

                {/* Active/Inactive status toggle inside footer */}
                {editingItem && (
                  <div className="md:col-span-2 border-t border-slate-100 pt-3 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">حالة الصنف بدليل الأصناف</span>
                      <span className="text-[10px] text-slate-400">إذا تم التعطيل، فلن يظهر الصنف في مستندات البيع أو فواتير الشراء الجديدة.</span>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => setIsActive(!isActive)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold ${
                          isActive 
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' 
                            : 'bg-rose-50 text-rose-500 border border-rose-200'
                        }`}
                      >
                        {isActive ? 'صنف نشط في الفواتير' : 'الصنف معطل'}
                      </button>
                    </div>
                  </div>
                )}

              </div>

              {/* Form Footer */}
              <div className="border-t border-slate-100 pt-4 flex items-center justify-end gap-2 bg-slate-50/50 -mx-5 -mb-5 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition duration-150"
                >
                  إلغاء التراجع
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="flex items-center gap-1.5 px-5 py-2 bg-brand-blue text-white rounded-xl text-xs font-bold hover:bg-brand-blue-dark transition duration-150 disabled:opacity-50"
                >
                  {saveLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingItem ? 'حفظ التعديلات' : 'تسجيل الصنف'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
