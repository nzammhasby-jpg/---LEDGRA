import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { inventoryService } from '../../lib/inventoryService';
import { masterDataService } from '../../lib/masterDataService';
import { 
  InventoryAdjustment, 
  InventoryAdjustmentLine, 
  Item, 
  InventoryAdjustmentType,
  InventoryAdjustmentStatus
} from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits, formatArabicDateWithLatinDigits } from '../../lib/formatters';
import { 
  Search, 
  Loader2, 
  AlertCircle, 
  Plus, 
  SlidersHorizontal, 
  FileText, 
  Calendar, 
  Trash2, 
  Printer, 
  CheckCircle, 
  XCircle, 
  ArrowLeft,
  Info,
  Package,
  ChevronLeft,
  ShoppingBag,
  Layers,
  Sparkles,
  HelpCircle
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export const InventoryAdjustmentsPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const navigate = useNavigate();

  // Permissions check
  const isSales = roleInCurrentOrg === 'sales';
  const isViewer = roleInCurrentOrg === 'viewer';
  const canEdit = !isSales && !isViewer;

  // View States: 'list' | 'create' | 'detail'
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedAdjId, setSelectedAdjId] = useState<string | null>(null);

  // Lists Data
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [stockableItems, setStockableItems] = useState<Item[]>([]);
  const [itemBalances, setItemBalances] = useState<{ [itemId: string]: { qty: number; cost: number } }>({});

  // Loading & Error States
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Create Form State
  const [formData, setFormData] = useState({
    adjustment_date: new Date().toISOString().split('T')[0],
    adjustment_type: 'increase' as InventoryAdjustmentType,
    reason: 'فرق جرد',
    notes: ''
  });

  // Current Active Adjustment (Detail view)
  const [activeAdj, setActiveAdj] = useState<InventoryAdjustment | null>(null);

  // Line editing temporary State
  const [lineItemId, setLineItemId] = useState<string>('');
  const [lineActualQty, setLineActualQty] = useState<string>('');
  const [lineAdjQty, setLineAdjQty] = useState<string>('');
  const [lineUnitCost, setLineUnitCost] = useState<string>('');
  const [lineNotes, setLineNotes] = useState<string>('');

  // Cancel Reason State
  const [cancelReason, setCancelReason] = useState<string>('');
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);

  useEffect(() => {
    if (currentOrg?.id) {
      loadInitialData();
    }
  }, [currentOrg?.id, view]);

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (view === 'list') {
        const adjs = await inventoryService.getAdjustments(currentOrg!.id);
        setAdjustments(adjs);
      } else if (view === 'create' || view === 'detail') {
        // Load items for the select dropdown
        const items = await masterDataService.getItems(currentOrg!.id);
        const stockable = items.filter(i => i.is_stockable);
        setStockableItems(stockable);

        // Load inventory balances to know exact current WAC and Qty
        const balances = await inventoryService.getBalances(currentOrg!.id);
        const balanceMap: { [itemId: string]: { qty: number; cost: number } } = {};
        balances.forEach(b => {
          balanceMap[b.item_id] = {
            qty: Number(b.quantity_on_hand || 0),
            cost: Number(b.average_cost || 0)
          };
        });
        setItemBalances(balanceMap);

        if (view === 'detail' && selectedAdjId) {
          await loadActiveAdjustment(selectedAdjId);
        }
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const loadActiveAdjustment = async (id: string) => {
    setActionError(null);
    try {
      const adj = await inventoryService.getAdjustmentById(id);
      setActiveAdj(adj);
    } catch (err: any) {
      setActionError(getErrorMessage(err));
    }
  };

  // Create draft adjustment
  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const newAdjId = await inventoryService.createAdjustment(
        currentOrg!.id,
        formData.adjustment_date,
        formData.adjustment_type,
        formData.reason,
        formData.notes
      );
      setSelectedAdjId(newAdjId);
      setView('detail');
    } catch (err: any) {
      setActionError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Add Item Line
  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdjId || !lineItemId || !canEdit) return;

    setSubmitting(true);
    setActionError(null);
    try {
      const actualQty = lineActualQty !== '' ? Number(lineActualQty) : null;
      const adjQty = lineAdjQty !== '' ? Number(lineAdjQty) : null;
      const unitCost = lineUnitCost !== '' ? Number(lineUnitCost) : null;

      await inventoryService.addAdjustmentLine(
        selectedAdjId,
        lineItemId,
        actualQty,
        adjQty,
        unitCost,
        lineNotes || null
      );

      // Reset line states
      setLineItemId('');
      setLineActualQty('');
      setLineAdjQty('');
      setLineUnitCost('');
      setLineNotes('');

      // Reload
      await loadActiveAdjustment(selectedAdjId);
    } catch (err: any) {
      setActionError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Line
  const handleDeleteLine = async (lineId: string) => {
    if (!selectedAdjId || !canEdit) return;
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا البند من التسوية؟')) return;

    setSubmitting(true);
    setActionError(null);
    try {
      await inventoryService.deleteAdjustmentLine(lineId, selectedAdjId);
      await loadActiveAdjustment(selectedAdjId);
    } catch (err: any) {
      setActionError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Draft adjustment completely
  const handleDeleteAdjustment = async (id: string) => {
    if (!canEdit) return;
    if (!confirm('هل أنت متأكد من حذف هذه التسوية بالكامل؟ لا يمكن التراجع عن هذا الإجراء.')) return;

    setSubmitting(true);
    setError(null);
    try {
      await inventoryService.deleteAdjustment(id);
      setView('list');
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Approve adjustment
  const handleApproveAdjustment = async () => {
    if (!selectedAdjId || !canEdit) return;
    if (!confirm('هل أنت متأكد من اعتماد وترحيل هذه التسوية؟ سيتم تحديث الكميات في المستودع وقيد الحركة محاسبياً.')) return;

    setSubmitting(true);
    setActionError(null);
    try {
      await inventoryService.approveAdjustment(selectedAdjId);
      await loadActiveAdjustment(selectedAdjId);
    } catch (err: any) {
      setActionError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel adjustment
  const handleCancelAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdjId || !canEdit || !cancelReason.trim()) return;

    setSubmitting(true);
    setActionError(null);
    try {
      await inventoryService.cancelAdjustment(selectedAdjId, cancelReason);
      setShowCancelModal(false);
      setCancelReason('');
      await loadActiveAdjustment(selectedAdjId);
    } catch (err: any) {
      setActionError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Helper values for current selected item in form
  const currentItemBalance = lineItemId ? itemBalances[lineItemId] || { qty: 0, cost: 0 } : { qty: 0, cost: 0 };

  // Computed fields as user types in item line form
  const computedAdjQty = () => {
    if (activeAdj?.adjustment_type === 'stock_count') {
      if (lineActualQty === '') return 0;
      return Number(lineActualQty) - currentItemBalance.qty;
    }
    if (activeAdj?.adjustment_type === 'increase') {
      return lineAdjQty !== '' ? Number(lineAdjQty) : 0;
    }
    if (activeAdj?.adjustment_type === 'decrease') {
      return lineAdjQty !== '' ? -Math.abs(Number(lineAdjQty)) : 0;
    }
    return 0;
  };

  const computedTotalCost = () => {
    const qty = Math.abs(computedAdjQty());
    const cost = lineUnitCost !== '' ? Number(lineUnitCost) : currentItemBalance.cost;
    return qty * cost;
  };

  const isFinalQtyNegative = () => {
    const resulting = currentItemBalance.qty + computedAdjQty();
    return resulting < 0;
  };

  // Filtering Adjustments
  const filteredAdjustments = adjustments.filter(adj => {
    const matchesSearch = 
      adj.adjustment_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (adj.reason && adj.reason.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (adj.notes && adj.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || adj.status === statusFilter;
    const matchesType = typeFilter === 'all' || adj.adjustment_type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const getStatusBadge = (status: InventoryAdjustmentStatus) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 border border-amber-100 font-sans">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            مسودة مؤقتة
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 border border-emerald-100 font-sans">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            معتمدة ومرحلة
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 border border-red-100 font-sans">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
            ملغاة وعكسية
          </span>
        );
    }
  };

  const getTypeLabel = (type: InventoryAdjustmentType) => {
    switch (type) {
      case 'increase': return 'زيادة مخزون';
      case 'decrease': return 'نقص مخزون';
      case 'stock_count': return 'جرد فعلي وتصحيح';
    }
  };

  const getTypeBadgeColor = (type: InventoryAdjustmentType) => {
    switch (type) {
      case 'increase': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'decrease': return 'bg-rose-50 text-rose-700 border-rose-100';
      case 'stock_count': return 'bg-blue-50 text-blue-700 border-blue-100';
    }
  };

  if (loading && view === 'list') {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <span className="mr-3 text-gray-500 font-sans">جري تحميل سجل تسويات وجرد المخزون...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      
      {/* ERROR ALERTS */}
      {error && (
        <div className="rounded-2xl bg-rose-50 p-4 border border-rose-200 shadow-sm animate-fadeIn">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-rose-500 ml-3 shrink-0 mt-0.5" />
            <div className="text-sm font-semibold text-rose-800 font-sans">{error}</div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 1. LIST VIEW PANEL */}
      {/* ==================================================== */}
      {view === 'list' && (
        <>
          {/* Header section */}
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 font-sans tracking-tight">تسويات وجرد المخزون</h1>
              <p className="mt-1 text-sm text-gray-500 font-sans">إدارة جرد البضائع الفعلي وتصحيح الفروقات، والتسويات المخزنية المرتبطة بالقيود التلقائية المباشرة.</p>
            </div>
            
            {canEdit && (
              <button
                onClick={() => {
                  setFormData({
                    adjustment_date: new Date().toISOString().split('T')[0],
                    adjustment_type: 'increase',
                    reason: 'فرق جرد',
                    notes: ''
                  });
                  setView('create');
                }}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:shadow-lg transition-all font-sans"
              >
                <Plus className="ml-2 h-4.5 w-4.5" />
                إنشاء تسوية مخزون
              </button>
            )}
          </div>

          {/* Filter Bar */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3.5 top-3 h-4.5 w-4.5 text-gray-400" />
              <input
                type="text"
                placeholder="بحث برقم التسوية، السبب، الملاحظات..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-2.25 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-gray-50/50 font-sans"
              />
            </div>
            
            <div className="flex flex-wrap gap-3">
              <div className="min-w-[140px]">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full px-3.5 py-2.25 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-sans cursor-pointer text-gray-700"
                >
                  <option value="all">كل الأنواع</option>
                  <option value="increase">زيادة مخزون</option>
                  <option value="decrease">نقص مخزون</option>
                  <option value="stock_count">جرد فعلي</option>
                </select>
              </div>

              <div className="min-w-[140px]">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3.5 py-2.25 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-sans cursor-pointer text-gray-700"
                >
                  <option value="all">كل الحالات</option>
                  <option value="draft">مسودة مؤقتة</option>
                  <option value="approved">معتمدة ومرحلة</option>
                  <option value="cancelled">ملغاة وعكسية</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table list */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              {filteredAdjustments.length === 0 ? (
                <div className="p-12 text-center">
                  <Package className="mx-auto h-12 w-12 text-gray-300 stroke-[1.5]" />
                  <h3 className="mt-4 text-sm font-semibold text-gray-900 font-sans">لا توجد تسويات مخزون</h3>
                  <p className="mt-1 text-xs text-gray-500 font-sans">لم يتم تسجيل أي عمليات تسوية أو جرد مطابقة للفلاتر النشطة حالياً.</p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-55/60">
                    <tr>
                      <th className="px-6 py-4.5 text-right text-xs font-semibold text-gray-500 tracking-wider font-sans">رقم التسوية</th>
                      <th className="px-6 py-4.5 text-right text-xs font-semibold text-gray-500 tracking-wider font-sans">تاريخ التسوية</th>
                      <th className="px-6 py-4.5 text-right text-xs font-semibold text-gray-500 tracking-wider font-sans">نوع التسوية</th>
                      <th className="px-6 py-4.5 text-right text-xs font-semibold text-gray-500 tracking-wider font-sans">سبب التسوية</th>
                      <th className="px-6 py-4.5 text-right text-xs font-semibold text-gray-500 tracking-wider font-sans">الحالة</th>
                      <th className="px-6 py-4.5 text-left text-xs font-semibold text-gray-500 tracking-wider font-sans">إجمالي القيمة</th>
                      <th className="px-6 py-4.5 text-center text-xs font-semibold text-gray-500 tracking-wider font-sans">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filteredAdjustments.map((adj) => (
                      <tr key={adj.id} className="hover:bg-gray-50/70 transition-all">
                        <td className="px-6 py-4 text-sm font-bold text-gray-900 font-mono tracking-tight">{adj.adjustment_number}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 font-sans">{formatArabicDateWithLatinDigits(adj.adjustment_date)}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold border ${getTypeBadgeColor(adj.adjustment_type)} font-sans`}>
                            {getTypeLabel(adj.adjustment_type)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 font-sans max-w-xs truncate" title={adj.reason}>{adj.reason}</td>
                        <td className="px-6 py-4 text-sm">{getStatusBadge(adj.status)}</td>
                        <td className="px-6 py-4 text-sm font-bold text-left font-mono">
                          {formatNumberWithLatinDigits(adj.total_amount)} <span className="text-xs font-sans font-medium text-gray-400">{adj.currency_code}</span>
                        </td>
                        <td className="px-6 py-4 text-center text-sm font-medium space-x-reverse space-x-2">
                          <button
                            onClick={() => {
                              setSelectedAdjId(adj.id);
                              setView('detail');
                            }}
                            className="text-emerald-600 hover:text-emerald-700 font-sans font-semibold text-xs py-1.5 px-3 rounded-lg hover:bg-emerald-50 transition"
                          >
                            تفاصيل البنود
                          </button>
                          
                          {adj.status === 'draft' && canEdit && (
                            <button
                              onClick={() => handleDeleteAdjustment(adj.id)}
                              className="text-rose-600 hover:text-rose-700 font-sans font-semibold text-xs py-1.5 px-3 rounded-lg hover:bg-rose-50 transition"
                            >
                              حذف المسودة
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* ==================================================== */}
      {/* 2. CREATE (HEADER) FORM VIEW */}
      {/* ==================================================== */}
      {view === 'create' && (
        <div className="max-w-2xl mx-auto bg-white border border-gray-100 rounded-3xl p-8 shadow-xl animate-scaleIn">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 font-sans">إنشاء تسوية مخزن جديدة</h2>
            <button
              onClick={() => setView('list')}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleCreateAdjustment} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 font-sans">تاريخ التسوية</label>
                <div className="relative">
                  <Calendar className="absolute right-3 top-3 h-4.5 w-4.5 text-gray-400" />
                  <input
                    type="date"
                    required
                    value={formData.adjustment_date}
                    onChange={(e) => setFormData({ ...formData, adjustment_date: e.target.value })}
                    className="w-full pr-10 pl-4 py-2.25 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white font-sans text-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 font-sans">نوع التسوية</label>
                <select
                  required
                  value={formData.adjustment_type}
                  onChange={(e) => setFormData({ ...formData, adjustment_type: e.target.value as InventoryAdjustmentType })}
                  className="w-full px-3.5 py-2.25 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-sans cursor-pointer text-gray-800"
                >
                  <option value="increase">زيادة مخزون (مثال: عثور على بضاعة زائدة)</option>
                  <option value="decrease">نقص مخزون (مثال: عجز أو بضاعة تالفة)</option>
                  <option value="stock_count">جرد فعلي (تحديث الكميات بناءً على العد الفعلي)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2 font-sans">السبب الأساسي</label>
              <select
                required
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="w-full px-3.5 py-2.25 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-sans cursor-pointer text-gray-800"
              >
                <option value="فرق جرد">فرق جرد (مطابقة مستودعية)</option>
                <option value="تلف">بضاعة تالفة / تالف</option>
                <option value="فقد">بضاعة مفقودة / ضياع</option>
                <option value="تصحيح إدخال">تصحيح خطأ إدخال سابق</option>
                <option value="أخرى">أسباب أخرى (اذكر في الملاحظات)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2 font-sans">ملاحظات توضيحية إضافية</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                placeholder="تفاصيل إضافية للمرجعية والتدقيق..."
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white font-sans text-gray-800"
              />
            </div>

            {actionError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 font-sans font-semibold">
                {actionError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:shadow-lg transition disabled:opacity-50 font-sans"
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin ml-2 h-4 w-4" />
                    جاري الحفظ والإنشاء...
                  </>
                ) : (
                  'تأكيد وإنشاء مسودة التسوية'
                )}
              </button>
              
              <button
                type="button"
                onClick={() => setView('list')}
                className="px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition font-sans"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================================================== */}
      {/* 3. DETAIL VIEW & ITEMS MANAGEMENT PANEL */}
      {/* ==================================================== */}
      {view === 'detail' && activeAdj && (
        <div className="space-y-6">
          {/* Header Action Row */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setView('list')}
                className="p-2 text-gray-500 hover:text-gray-700 rounded-xl bg-white border border-gray-100 shadow-sm transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-gray-900 font-mono tracking-tight">{activeAdj.adjustment_number}</h1>
                  {getStatusBadge(activeAdj.status)}
                </div>
                <p className="text-xs text-gray-500 font-sans mt-0.5">
                  نوع التسوية: <strong className="text-gray-700">{getTypeLabel(activeAdj.adjustment_type)}</strong> • التاريخ: <strong className="text-gray-700">{formatArabicDateWithLatinDigits(activeAdj.adjustment_date)}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(`/print/inventory-adjustment/${activeAdj.id}`)}
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none transition font-sans"
              >
                <Printer className="ml-1.5 h-4 w-4 text-gray-500" />
                طباعة المستند
              </button>

              {activeAdj.status === 'draft' && canEdit && (
                <button
                  onClick={handleApproveAdjustment}
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-emerald-700 hover:shadow-lg focus:outline-none transition disabled:opacity-50 font-sans"
                >
                  <CheckCircle className="ml-1.5 h-4 w-4" />
                  اعتماد وترحيل التسوية
                </button>
              )}

              {activeAdj.status === 'approved' && canEdit && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-red-700 hover:shadow-lg focus:outline-none transition font-sans"
                >
                  <XCircle className="ml-1.5 h-4 w-4" />
                  إلغاء وعكس التسوية
                </button>
              )}
            </div>
          </div>

          {/* Action and General Errors */}
          {actionError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 font-sans font-semibold">
              {actionError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Metadata Card Info */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-gray-900 border-b border-gray-50 pb-2.5 font-sans">معلومات عامة</h3>
                
                <div className="space-y-3.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-sans">السبب:</span>
                    <span className="font-semibold text-gray-800 font-sans">{activeAdj.reason}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-400 font-sans">منشئ الطلب:</span>
                    <span className="font-semibold text-gray-800 font-sans">{(activeAdj as any).creator?.full_name || 'مستخدم النظام'}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-400 font-sans">العملة النشطة:</span>
                    <span className="font-semibold text-gray-800 font-mono">{activeAdj.currency_code}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-400 font-sans">تاريخ التسجيل:</span>
                    <span className="font-semibold text-gray-800 font-mono">{formatArabicDateWithLatinDigits(activeAdj.created_at)}</span>
                  </div>

                  {activeAdj.approved_at && (
                    <>
                      <div className="border-t border-dashed border-gray-100 pt-3 flex justify-between">
                        <span className="text-gray-400 font-sans">معتمد بواسطة:</span>
                        <span className="font-semibold text-emerald-700 font-sans">{(activeAdj as any).approver?.full_name || 'مستخدم النظام'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 font-sans">تاريخ الاعتماد:</span>
                        <span className="font-semibold text-emerald-700 font-mono">{formatArabicDateWithLatinDigits(activeAdj.approved_at)}</span>
                      </div>
                    </>
                  )}

                  {activeAdj.cancelled_at && (
                    <>
                      <div className="border-t border-dashed border-gray-100 pt-3 flex justify-between">
                        <span className="text-gray-400 font-sans">ملغى بواسطة:</span>
                        <span className="font-semibold text-rose-700 font-sans">{(activeAdj as any).canceller?.full_name || 'مستخدم النظام'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 font-sans">تاريخ الإلغاء:</span>
                        <span className="font-semibold text-rose-700 font-mono">{formatArabicDateWithLatinDigits(activeAdj.cancelled_at)}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-gray-400 font-sans">سبب الإلغاء العكسي:</span>
                        <span className="p-2 bg-rose-50 rounded-lg text-rose-800 font-sans text-[11px] leading-relaxed break-words">{activeAdj.cancel_reason}</span>
                      </div>
                    </>
                  )}

                  {activeAdj.notes && (
                    <div className="border-t border-dashed border-gray-100 pt-3 flex flex-col gap-1">
                      <span className="text-gray-400 font-sans">ملاحظات المستند:</span>
                      <p className="text-gray-700 leading-relaxed font-sans text-[11px] bg-gray-50 p-2.5 rounded-lg">{activeAdj.notes}</p>
                    </div>
                  )}

                  {activeAdj.journal_entry_id && (
                    <div className="border-t border-dashed border-gray-100 pt-3">
                      <Link
                        to={`/print/journal-entry/${activeAdj.journal_entry_id}`}
                        className="w-full inline-flex items-center justify-center py-2 px-3 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl hover:bg-emerald-100 transition text-[11px] font-bold font-sans"
                      >
                        <FileText className="ml-1.5 h-3.5 w-3.5" />
                        عرض القيد التلقائي المرتبط بالعملية
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Lines List & Dynamic Input Form Table */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Draft Input form */}
              {activeAdj.status === 'draft' && canEdit && (
                <div className="bg-emerald-50/20 border border-emerald-100/40 rounded-3xl p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-4 font-sans">
                    <Plus className="h-4.5 w-4.5 text-emerald-600" />
                    إدراج بند جديد في ورقة التسوية
                  </h3>
                  
                  <form onSubmit={handleAddLine} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1.5 font-sans">المنتج / الصنف المخزني</label>
                        <select
                          required
                          value={lineItemId}
                          onChange={(e) => {
                            setLineItemId(e.target.value);
                            setLineActualQty('');
                            setLineAdjQty('');
                            setLineUnitCost('');
                          }}
                          className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-sans cursor-pointer text-gray-800"
                        >
                          <option value="">اختر صنف مخزني...</option>
                          {stockableItems.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.code} - {item.name} ({item.unit || 'حبة'})
                            </option>
                          ))}
                        </select>
                      </div>

                      {lineItemId && (
                        <div className="bg-white/80 p-2.5 rounded-xl border border-gray-100 text-xs flex justify-around items-center">
                          <div className="text-center">
                            <span className="block text-[10px] text-gray-400 font-sans">الرصيد النظامي الحالي</span>
                            <span className="font-bold text-gray-800 font-mono text-xs">{formatNumberWithLatinDigits(currentItemBalance.qty)}</span>
                          </div>
                          <div className="h-8 w-px bg-gray-100"></div>
                          <div className="text-center">
                            <span className="block text-[10px] text-gray-400 font-sans">متوسط التكلفة الحالي</span>
                            <span className="font-bold text-gray-800 font-mono text-xs">
                              {formatNumberWithLatinDigits(currentItemBalance.cost)} <span className="text-[10px] text-gray-400 font-sans">{activeAdj.currency_code}</span>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {lineItemId && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fadeIn">
                        {activeAdj.adjustment_type === 'stock_count' ? (
                          <div>
                            <label className="block text-[11px] font-bold text-gray-700 mb-1.5 font-sans">الكمية الفعلية (العد الملموس)</label>
                            <input
                              type="number"
                              required
                              step="0.0001"
                              value={lineActualQty}
                              onChange={(e) => setLineActualQty(e.target.value)}
                              className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
                              placeholder="0.00"
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="block text-[11px] font-bold text-gray-700 mb-1.5 font-sans">
                              {activeAdj.adjustment_type === 'increase' ? 'كمية الزيادة' : 'كمية النقص (العجز)'}
                            </label>
                            <input
                              type="number"
                              required
                              min="0.0001"
                              step="0.0001"
                              value={lineAdjQty}
                              onChange={(e) => setLineAdjQty(e.target.value)}
                              className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
                              placeholder="أدخل قيمة موجبة"
                            />
                          </div>
                        )}

                        <div>
                          <label className="block text-[11px] font-bold text-gray-700 mb-1.5 font-sans">
                            تكلفة الوحدة {activeAdj.adjustment_type === 'decrease' && '(تلقائية WAC)'}
                          </label>
                          <input
                            type="number"
                            disabled={activeAdj.adjustment_type === 'decrease'}
                            step="0.0001"
                            value={activeAdj.adjustment_type === 'decrease' ? formatNumberWithLatinDigits(currentItemBalance.cost) : lineUnitCost}
                            onChange={(e) => setLineUnitCost(e.target.value)}
                            className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono bg-white disabled:bg-gray-50 text-gray-800"
                            placeholder={currentItemBalance.cost > 0 ? String(currentItemBalance.cost) : '0.00'}
                          />
                        </div>

                        <div className="bg-white p-2.5 rounded-xl border border-gray-100 flex flex-col justify-center">
                          <span className="block text-[10px] text-gray-400 font-sans">الفرق الناتج والتكلفة الإجمالية للسطر</span>
                          <span className="font-bold font-mono text-xs text-gray-800 mt-1">
                            {computedAdjQty() > 0 ? '+' : ''}{formatNumberWithLatinDigits(computedAdjQty())} {currentItemBalance.qty ? `(إلى: ${currentItemBalance.qty + computedAdjQty()})` : ''}
                            <span className="block text-[11px] text-emerald-600 mt-0.5">
                              القيمة: {formatNumberWithLatinDigits(computedTotalCost())} <span className="text-[10px] text-gray-400 font-sans">{activeAdj.currency_code}</span>
                            </span>
                          </span>
                        </div>
                      </div>
                    )}

                    {lineItemId && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fadeIn">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-bold text-gray-700 mb-1.5 font-sans">ملاحظات على السطر (تلف، عجز، تدقيق... إلخ)</label>
                          <input
                            type="text"
                            value={lineNotes}
                            onChange={(e) => setLineNotes(e.target.value)}
                            className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-sans"
                            placeholder="مثال: كسر في العبوة أثناء الاستلام أو النقل..."
                          />
                        </div>

                        <div className="flex items-end">
                          <button
                            type="submit"
                            disabled={submitting || isFinalQtyNegative() || computedAdjQty() === 0}
                            className="w-full inline-flex items-center justify-center rounded-xl bg-emerald-600 py-2.25 px-4 text-xs font-semibold text-white shadow hover:bg-emerald-700 transition disabled:opacity-50 font-sans"
                          >
                            {isFinalQtyNegative() ? 'عجز يتجاوز الرصيد!' : 'حفظ البند في التسوية'}
                          </button>
                        </div>
                      </div>
                    )}
                  </form>
                </div>
              )}

              {/* Lines table view */}
              <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
                <div className="px-6 py-4.5 border-b border-gray-50 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 font-sans">بنود وورقة جرد التسوية</h3>
                  <span className="text-xs font-bold text-gray-400 font-mono">
                    إجمالي الورقة: <span className="text-sm text-gray-800 font-bold">{formatNumberWithLatinDigits(activeAdj.total_amount)}</span> {activeAdj.currency_code}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  {!activeAdj.lines || activeAdj.lines.length === 0 ? (
                    <div className="p-12 text-center text-gray-400 font-sans text-xs">
                      لا توجد بنود مدرجة حالياً في التسوية المخزنية. يرجى اختيار صنف وإدخال الكميات بالأعلى.
                    </div>
                  ) : (
                    <table className="min-w-full divide-y divide-gray-100">
                      <thead className="bg-gray-50/50">
                        <tr>
                          <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 font-sans">الصنف</th>
                          <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 font-sans">الكمية الدفترية</th>
                          {activeAdj.adjustment_type === 'stock_count' && (
                            <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 font-sans">الكمية الفعلية</th>
                          )}
                          <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 font-sans">الكمية المعدلة</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 font-sans">تكلفة الوحدة</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 font-sans">القيمة الكلية</th>
                          {activeAdj.status === 'draft' && canEdit && (
                            <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 font-sans">إجراء</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {activeAdj.lines.map((line: any) => (
                          <tr key={line.id} className="hover:bg-gray-50/40 text-xs">
                            <td className="px-6 py-4">
                              <div className="font-bold text-gray-900 font-sans">{line.item?.name}</div>
                              <div className="text-[10px] text-gray-400 font-mono mt-0.5">{line.item?.code} {line.notes && `• ${line.notes}`}</div>
                            </td>
                            <td className="px-6 py-4 text-center font-mono">{formatNumberWithLatinDigits(line.system_quantity)}</td>
                            {activeAdj.adjustment_type === 'stock_count' && (
                              <td className="px-6 py-4 text-center font-mono text-blue-600 font-bold">{formatNumberWithLatinDigits(line.actual_quantity)}</td>
                            )}
                            <td className={`px-6 py-4 text-center font-mono font-bold ${Number(line.adjustment_quantity) > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {Number(line.adjustment_quantity) > 0 ? '+' : ''}{formatNumberWithLatinDigits(line.adjustment_quantity)}
                            </td>
                            <td className="px-6 py-4 text-left font-mono">{formatNumberWithLatinDigits(line.unit_cost)}</td>
                            <td className="px-6 py-4 text-left font-mono font-bold">{formatNumberWithLatinDigits(line.total_cost)}</td>
                            {activeAdj.status === 'draft' && canEdit && (
                              <td className="px-6 py-4 text-center">
                                <button
                                  onClick={() => handleDeleteLine(line.id)}
                                  className="p-1 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                                  title="حذف هذا البند"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 4. CANCEL MODAL POPUP */}
      {/* ==================================================== */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl border border-gray-100 p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600 border-b border-gray-50 pb-3">
              <XCircle className="h-6 w-6" />
              <h3 className="text-base font-bold font-sans">تأكيد الإلغاء العكسي للتسوية</h3>
            </div>
            
            <form onSubmit={handleCancelAdjustment} className="space-y-4">
              <div>
                <p className="text-xs text-gray-500 font-sans leading-relaxed">
                  عند إلغاء تسوية مخزنية معتمدة، سيقوم النظام تلقائياً بعكس القيود المحاسبية بالكامل، وإرجاع الكميات المخزنية المسواة وتحديث WAC بطريقة محاسبية عكسية صحيحة تضمن توازن الدفاتر.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 font-sans">سبب الإلغاء العكسي (مطلوب)</label>
                <textarea
                  required
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="مثال: تم إدخال الجرد بالخطأ أو تكرار العملية..."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 bg-white font-sans text-gray-800"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting || !cancelReason.trim()}
                  className="flex-1 inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-700 transition disabled:opacity-50 font-sans"
                >
                  {submitting ? 'جاري العكس...' : 'تأكيد الإلغاء والتراجع'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelModal(false);
                    setCancelReason('');
                  }}
                  className="px-4 py-2.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition font-sans"
                >
                  تراجع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
