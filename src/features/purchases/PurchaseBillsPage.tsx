import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { purchaseService, CreatePurchaseBillInput } from '../../lib/purchaseService';
import { masterDataService } from '../../lib/masterDataService';
import { accountingService } from '../../lib/accountingService';
import { auditService } from '../../lib/auditService';
import { 
  PurchaseBill, 
  Vendor, 
  Item, 
  Account, 
  AccountingSettings 
} from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { getOrgDefaultTaxRate } from '../../lib/countryProfiles';
import { 
  formatNumberWithLatinDigits, 
  formatArabicDateWithLatinDigits, 
  toEnglishDigits,
  normalizeDecimalInput
} from '../../lib/formatters';
import { 
  ShoppingCart, 
  Search, 
  Plus, 
  X, 
  Trash2, 
  ClipboardCheck, 
  Ban, 
  Eye, 
  Printer, 
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  AlertCircle,
  Loader2,
  Calendar,
  AlertTriangle,
  ArrowRight,
  Edit,
  RefreshCw
} from 'lucide-react';

export const PurchaseBillsPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg, profile } = useAuth();
  
  // Checking permissions: Owner, admin, accountant can approve/cancel; viewers cannot edit.
  const canApproveOrCancel = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant';

  const [editingBill, setEditingBill] = useState<PurchaseBill | null>(null);

  // Data State
  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<AccountingSettings | null>(null);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // View state: 'list' | 'add' | 'view'
  const [viewState, setViewState] = useState<'list' | 'add' | 'view'>('list');
  const [selectedBill, setSelectedBill] = useState<PurchaseBill | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // all, draft, approved, cancelled
  const [paymentFilter, setPaymentFilter] = useState<string>('all'); // all, unpaid, partially_paid, paid

  // Form State
  const [vendorId, setVendorId] = useState<string>('');
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState<string>('');
  const [billDate, setBillDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('');

  // Bill Lines Form State
  const [lines, setLines] = useState<Array<{
    uuid: string; // client-side key
    item_id: string;
    description: string;
    quantity: number | string;
    unit_cost: number | string;
    discount_amount: number | string;
    tax_rate: number;
    expense_account_id: string;
    inventory_account_id: string;
  }>>([]);

  // Load basic lists on mount / org change
  useEffect(() => {
    if (currentOrg?.id) {
      loadData();
    }
  }, [currentOrg?.id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [allBills, allVendors, allItems, allAccounts, taxSettings] = await Promise.all([
        purchaseService.getPurchaseBills(currentOrg!.id),
        masterDataService.getVendors(currentOrg!.id),
        masterDataService.getItems(currentOrg!.id),
        accountingService.getAccounts(currentOrg!.id),
        accountingService.getAccountingSettings(currentOrg!.id).catch(() => null)
      ]);

      setBills(allBills);
      setVendors(allVendors.filter(v => v.is_active));
      setItems(allItems.filter(i => i.is_active));
      setAccounts(allAccounts.filter(a => a.is_active));
      setSettings(taxSettings);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Pre-calculate line totals in real time
  const getCalculatedTotals = () => {
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;

    lines.forEach(line => {
      const gQty = Number(line.quantity) || 0;
      const gCost = Number(line.unit_cost) || 0;
      const gDisc = Number(line.discount_amount) || 0;
      
      const lineSubtotal = gQty * gCost;
      const lineNet = Math.max(0, lineSubtotal - gDisc);
      const lineTax = lineNet * (line.tax_rate / 100);

      subtotal += lineSubtotal;
      discountTotal += gDisc;
      taxTotal += lineTax;
    });

    const total = subtotal - discountTotal + taxTotal;

    return {
      subtotal,
      discountTotal,
      taxTotal,
      total
    };
  };

  const { subtotal, discountTotal, taxTotal, total } = getCalculatedTotals();

  // Selected vendor helper
  const selectedVendorInfo = vendors.find(v => v.id === vendorId);

  // Initialize a new draft bill form
  const handleAddNewBill = () => {
    setEditingBill(null);
    setVendorId('');
    setVendorInvoiceNumber('');
    setBillDate(new Date().toISOString().split('T')[0]);
    // default due date: today + 30 days
    const defaultDue = new Date();
    defaultDue.setDate(defaultDue.getDate() + 30);
    setDueDate(defaultDue.toISOString().split('T')[0]);
    setNotes('');
    setLines([
      {
        uuid: Math.random().toString(),
        item_id: '',
        description: '',
        quantity: '1',
        unit_cost: '0',
        discount_amount: '0',
        tax_rate: getOrgDefaultTaxRate(currentOrg),
        expense_account_id: '',
        inventory_account_id: ''
      }
    ]);
    setFormError(null);
    setViewState('add');
  };

  const handleStartEditBill = useCallback((bill: PurchaseBill) => {
    setEditingBill(bill);
    setVendorId(bill.vendor_id);
    setVendorInvoiceNumber(bill.vendor_invoice_number || '');
    setBillDate(bill.bill_date);
    setDueDate(bill.due_date);
    setNotes(bill.notes || '');
    setLines((bill.lines || []).map(l => ({
      uuid: Math.random().toString(),
      item_id: l.item_id,
      description: l.description || '',
      quantity: String(l.quantity),
      unit_cost: String(l.unit_cost),
      discount_amount: String(l.discount_amount),
      tax_rate: l.tax_rate,
      expense_account_id: l.expense_account_id || '',
      inventory_account_id: l.inventory_account_id || ''
    })));
    setFormError(null);
    setViewState('add');
  }, []);

  const handleCreateCorrectionCopy = useCallback(async (oldBill: PurchaseBill) => {
    if (!confirm(`هل أنت متأكد من إنشاء نسخة تصحيحية من الفاتورة رقم ${oldBill.bill_number}؟`)) return;
    setSaveLoading(true);
    setFormError(null);
    try {
      const copyPayload: CreatePurchaseBillInput = {
        vendor_id: oldBill.vendor_id,
        vendor_invoice_number: oldBill.vendor_invoice_number ? `${oldBill.vendor_invoice_number}-CORR` : undefined,
        bill_date: new Date().toISOString().split('T')[0],
        due_date: new Date().toISOString().split('T')[0],
        notes: `نسخة تصحيحية من الفاتورة: ${oldBill.bill_number}` + (oldBill.notes ? `\n\n${oldBill.notes}` : ''),
        lines: (oldBill.lines || []).map(l => ({
          item_id: l.item_id,
          description: l.description || undefined,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          discount_amount: l.discount_amount,
          tax_rate: l.tax_rate,
          expense_account_id: l.expense_account_id || undefined,
          inventory_account_id: l.inventory_account_id || undefined
        }))
      };

      const newId = await purchaseService.createPurchaseBill(currentOrg!.id, copyPayload);
      
      await auditService.logAction(currentOrg!.id, profile?.id || null, 'correction_copy_created', {
        source_type: 'purchase_bill',
        original_id: oldBill.id,
        original_number: oldBill.bill_number,
        new_draft_id: newId
      });

      // Reload bills
      const updatedList = await purchaseService.getPurchaseBills(currentOrg!.id);
      setBills(updatedList);

      // Open in edit mode immediately
      const newBill = updatedList.find(b => b.id === newId) || await purchaseService.getPurchaseBill(currentOrg!.id, newId);
      handleStartEditBill(newBill);
    } catch (err: any) {
      setFormError(getErrorMessage(err));
      alert(`فشل إنشاء النسخة التصحيحية: ${getErrorMessage(err)}`);
    } finally {
      setSaveLoading(false);
    }
  }, [currentOrg, profile, handleStartEditBill]);

  // Handle item change in row to auto-populate description, cost, tax rate, and accounts
  const handleLineItemChange = (index: number, itemId: string) => {
    const updated = [...lines];
    const item = items.find(i => i.id === itemId);

    if (item) {
      updated[index].item_id = itemId;
      updated[index].description = item.description || item.name || '';
      updated[index].unit_cost = String(item.cost_price || 0);
      
      if (currentOrg?.is_vat_registered === false) {
        updated[index].tax_rate = 0;
      } else {
        updated[index].tax_rate = item.tax_rate ?? getOrgDefaultTaxRate(currentOrg);
      }

      if (item.is_stockable) {
        updated[index].inventory_account_id = item.inventory_account_id || settings?.default_inventory_account_id || '';
        updated[index].expense_account_id = '';
      } else {
        updated[index].expense_account_id = item.expense_account_id || settings?.default_expense_account_id || '';
        updated[index].inventory_account_id = '';
      }
    } else {
      updated[index].item_id = '';
      updated[index].description = '';
      updated[index].unit_cost = '0';
      updated[index].tax_rate = currentOrg?.is_vat_registered === false ? 0 : getOrgDefaultTaxRate(currentOrg);
      updated[index].expense_account_id = '';
      updated[index].inventory_account_id = '';
    }
    setLines(updated);
  };

  const updateLineField = (index: number, field: string, value: string) => {
    const updated = [...lines];
    const englishValue = toEnglishDigits(value);
    
    if (field === 'quantity') {
      updated[index].quantity = normalizeDecimalInput(englishValue);
    } else if (field === 'unit_cost') {
      updated[index].unit_cost = normalizeDecimalInput(englishValue);
    } else if (field === 'discount_amount') {
      updated[index].discount_amount = normalizeDecimalInput(englishValue);
    } else {
      (updated[index] as any)[field] = value;
    }
    setLines(updated);
  };

  const addLineRow = () => {
    setLines([
      ...lines,
      {
        uuid: Math.random().toString(),
        item_id: '',
        description: '',
        quantity: '1',
        unit_cost: '0',
        discount_amount: '0',
        tax_rate: getOrgDefaultTaxRate(currentOrg),
        expense_account_id: '',
        inventory_account_id: ''
      }
    ]);
  };

  const removeLineRow = (index: number) => {
    if (lines.length === 1) return; // Must have at least one line
    setLines(lines.filter((_, i) => i !== index));
  };

  // Submit new / updated bill
  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!vendorId) {
      setFormError('يرجى اختيار المورد.');
      return;
    }
    if (!billDate) {
      setFormError('تاريخ فاتورة الشراء مطلوب.');
      return;
    }

    // Process and validate lines
    const processedLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const qty = Number(line.quantity) || 0;
      const cost = Number(line.unit_cost) || 0;
      const discount = Number(line.discount_amount) || 0;

      if (qty <= 0) {
        setFormError(`الكمية في البند رقم ${i + 1} يجب أن تكون أكبر من الصفر.`);
        return;
      }
      if (cost < 0) {
        setFormError(`التكلفة في البند رقم ${i + 1} لا يمكن أن تكون سالبة.`);
        return;
      }
      if (discount < 0) {
        setFormError(`مبلغ الخصم في البند رقم ${i + 1} لا يمكن أن يكون سالباً.`);
        return;
      }
      if (discount > (qty * cost)) {
        setFormError(`خصم البند رقم ${i + 1} يتخطى الإجمالي الفرعي قبل الخصم.`);
        return;
      }
      if (!line.expense_account_id && !line.inventory_account_id) {
        setFormError(`يرجى تحديد حساب محاسبي للبند رقم ${i + 1} (مصروف أو مخزون).`);
        return;
      }

      processedLines.push({
        item_id: line.item_id || null,
        description: line.description || null,
        quantity: qty,
        unit_cost: cost,
        discount_amount: discount,
        tax_rate: line.tax_rate,
        expense_account_id: line.expense_account_id || null,
        inventory_account_id: line.inventory_account_id || null
      });
    }

    setSaveLoading(true);
    try {
      const input: CreatePurchaseBillInput = {
        vendor_id: vendorId,
        vendor_invoice_number: vendorInvoiceNumber || undefined,
        bill_date: billDate,
        due_date: dueDate,
        notes: notes || undefined,
        lines: processedLines
      };

      if (editingBill) {
        await purchaseService.updatePurchaseBill(currentOrg!.id, editingBill.id, input);
        
        await auditService.logAction(currentOrg!.id, profile?.id || null, 'draft_updated', {
          source_type: 'purchase_bill',
          bill_id: editingBill.id,
          bill_number: editingBill.bill_number
        });
      } else {
        await purchaseService.createPurchaseBill(currentOrg!.id, input);
      }
      
      setViewState('list');
      setEditingBill(null);
      loadData();
    } catch (err: any) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaveLoading(false);
    }
  };

  // Secure Action: Approve Purchase Bill
  const handleApproveBill = async (billId: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في اعتماد فاتورة الشراء وتوليد القيد المحاسبي المزدوج تلقائياً؟')) return;
    setActionLoading(billId);
    setError(null);
    try {
      await purchaseService.approvePurchaseBill(currentOrg!.id, billId);
      loadData();
      if (selectedBill && selectedBill.id === billId) {
        const refreshed = await purchaseService.getPurchaseBill(currentOrg!.id, billId);
        setSelectedBill(refreshed);
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // Secure Action: Cancel Purchase Bill
  const handleCancelBill = async (billId: string) => {
    if (!window.confirm('هل أنت متأكد من إلغاء الفاتورة؟ سيتم إنشاء قيد محاسبي عكسي تلقائي لجميع البنود مع تصفير المديونية.')) return;
    setActionLoading(billId);
    setError(null);
    try {
      await purchaseService.cancelPurchaseBill(currentOrg!.id, billId);
      loadData();
      if (selectedBill && selectedBill.id === billId) {
        const refreshed = await purchaseService.getPurchaseBill(currentOrg!.id, billId);
        setSelectedBill(refreshed);
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // Secure Action: Delete Draft Bill
  const handleDeleteBill = async (billId: string) => {
    if (!window.confirm('هل تريد حذف مسودة الفاتورة نهائياً؟')) return;
    setActionLoading(billId);
    setError(null);
    try {
      await purchaseService.deleteDraftPurchaseBill(currentOrg!.id, billId);
      setViewState('list');
      setSelectedBill(null);
      loadData();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // View specific bill full details
  const handleViewBill = async (bill: PurchaseBill) => {
    setLoading(true);
    setError(null);
    try {
      const full = await purchaseService.getPurchaseBill(currentOrg!.id, bill.id);
      setSelectedBill(full);
      setViewState('view');
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Text status badges
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <CheckCircle className="w-3.5 h-3.5" /> معتمد ومرحل
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-full border border-red-200">
            <XCircle className="w-3.5 h-3.5" /> ملغى وعكسي
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
            <Clock className="w-3.5 h-3.5 animate-pulse" /> مسودة معلقة
          </span>
        );
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center text-[10px] font-medium text-emerald-700 bg-emerald-50/70 border border-emerald-100 px-2 py-0.5 rounded-md">
            مدفوع بالكامل
          </span>
        );
      case 'partially_paid':
        return (
          <span className="inline-flex items-center text-[10px] font-medium text-indigo-700 bg-indigo-50/70 border border-indigo-100 px-2 py-0.5 rounded-md">
            مدفوع جزئياً
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">
            غير مدفوع
          </span>
        );
    }
  };

  // Filter bills
  const filteredBills = bills.filter(b => {
    const venName = b.vendor?.name?.toLowerCase() || '';
    const bNum = b.bill_number?.toLowerCase() || '';
    const vInvoice = b.vendor_invoice_number?.toLowerCase() || '';
    const q = searchQuery.toLowerCase();

    const matchesSearch = venName.includes(q) || bNum.includes(q) || vInvoice.includes(q);
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    const matchesPayment = paymentFilter === 'all' || b.payment_status === paymentFilter;

    return matchesSearch && matchesStatus && matchesPayment;
  });

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 font-sans text-right" dir="rtl">
      
      {/* Alert Error Box */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-4 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
          <div className="leading-relaxed">{error}</div>
        </div>
      )}

      {/* ==========================================================
          VIEW 1: LISTING BILLS
          ========================================================== */}
      {viewState === 'list' && (
        <div className="space-y-6">
          
          {/* Header block with search & create bill */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <ShoppingCart className="w-6 h-6 text-brand-navy" />
                <span>فواتير مشتريات الخدمات والمستلزمات</span>
              </h1>
              <p className="text-xs text-slate-500 mt-1">سجل المشتريات من الموردين، وإثبات قيود التكاليف وإشعارات القيد المزدوج التلقائي.</p>
            </div>

            <button
              onClick={handleAddNewBill}
              className="flex items-center gap-1.5 px-4 py-2.25 bg-brand-navy hover:bg-brand-navy/95 text-white text-xs font-bold rounded-xl transition shadow shadow-brand-navy/10 cursor-pointer md:self-center"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة فاتورة مشتريات</span>
            </button>
          </div>

          {/* Filtering row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/50">
            <div className="col-span-1 md:col-span-2 relative">
              <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="بحث برقم الفاتورة، اسم المورد..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-9 pl-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-blue"
              />
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-blue"
              >
                <option value="all">كل حالات الاعتماد</option>
                <option value="draft">معلقة (مسودة)</option>
                <option value="approved">معتمدة ومرحلة</option>
                <option value="cancelled">ملغاة وعكسية</option>
              </select>
            </div>

            <div>
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-blue"
              >
                <option value="all">كل حالات السداد</option>
                <option value="unpaid">غير مدفوعة</option>
                <option value="partially_paid">مدفوعة جزئياً</option>
                <option value="paid">مدفوعة بالكامل</option>
              </select>
            </div>
          </div>

          {/* Table Container */}
          {loading ? (
            <div className="bg-white p-16 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-center items-center gap-3">
              <Loader2 className="w-8 h-8 text-brand-navy animate-spin" />
              <span className="text-xs text-slate-500">جاري تحميل فواتير المشتريات والمدفوعات...</span>
            </div>
          ) : filteredBills.length === 0 ? (
            <div className="bg-white p-16 rounded-3xl border border-slate-200/80 shadow-sm text-center">
              <ShoppingCart className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-sm font-bold text-slate-700">لا توجد فواتير مشتريات</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">لم تسجل أي فاتورة مشتريات تطابق البحث في الدورة المالية الحالية.</p>
              <button
                onClick={handleAddNewBill}
                className="mt-4 inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer"
              >
                أنشئ أول فاتورة الآن
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                      <th className="p-4">رقم الفاتورة</th>
                      <th className="p-4">المورد</th>
                      <th className="p-4">رقم فاتورة المورد</th>
                      <th className="p-4">التاريخ</th>
                      <th className="p-4">رصيد الفاتورة</th>
                      <th className="p-4">الحالة المعتمدة</th>
                      <th className="p-4">حالة السداد</th>
                      <th className="p-4 text-left">خيارات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredBills.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-4 font-bold text-slate-900 font-mono tracking-wider">
                          {b.bill_number}
                        </td>
                        <td className="p-4 font-medium text-slate-700">
                          {b.vendor?.name}
                        </td>
                        <td className="p-4 text-slate-500 font-mono">
                          {b.vendor_invoice_number || '—'}
                        </td>
                        <td className="p-4 text-slate-500 font-mono">
                          {formatArabicDateWithLatinDigits(b.bill_date)}
                        </td>
                        <td className="p-4 font-bold text-slate-900 font-mono tracking-tight text-left pl-6" style={{ direction: 'ltr' }}>
                          {formatNumberWithLatinDigits(b.total)} {currentOrg?.currency_code || ''}
                        </td>
                        <td className="p-4">
                          {getStatusBadge(b.status)}
                        </td>
                        <td className="p-4">
                          {getPaymentStatusBadge(b.payment_status)}
                        </td>
                        <td className="p-4 text-left space-x-1 space-x-reverse">
                          <button
                            onClick={() => handleViewBill(b)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-2 rounded-lg transition tooltip cursor-pointer"
                            title="عرض التفاصيل والقيود"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <a
                            href={`#/print/purchase-bill/${b.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 p-2 rounded-lg transition cursor-pointer"
                            title="طباعة الفاتورة الضريبية A4"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </a>
                          
                          {/* Edit option if draft */}
                          {b.status === 'draft' && (
                            <button
                              onClick={() => handleStartEditBill(b)}
                              className="bg-purple-50 hover:bg-purple-100 text-purple-600 p-2 rounded-lg transition cursor-pointer"
                              title="تعديل الفاتورة المسودة"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Correction copy option if approved */}
                          {b.status === 'approved' && (
                            <button
                              onClick={() => handleCreateCorrectionCopy(b)}
                              className="bg-amber-50 hover:bg-amber-100 text-amber-600 p-2 rounded-lg transition cursor-pointer"
                              title="إنشاء نسخة تصحيحية من هذه الفاتورة المعتمدة"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {b.status === 'draft' && (
                            <>
                              {canApproveOrCancel && (
                                <button
                                  onClick={() => handleApproveBill(b.id)}
                                  disabled={actionLoading === b.id}
                                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 p-2 rounded-lg transition disabled:opacity-50 cursor-pointer"
                                  title="اعتماد وترحيل"
                                >
                                  {actionLoading === b.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <ClipboardCheck className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteBill(b.id)}
                                disabled={actionLoading === b.id}
                                className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-lg transition disabled:opacity-50 cursor-pointer"
                                title="حذف المسودة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {b.status === 'approved' && b.payment_status === 'unpaid' && canApproveOrCancel && (
                            <button
                              onClick={() => handleCancelBill(b.id)}
                              disabled={actionLoading === b.id}
                              className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-lg transition disabled:opacity-50 cursor-pointer"
                              title="إلغاء الفاتورة وعكس القيود"
                            >
                              {actionLoading === b.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Ban className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==========================================================
          VIEW 2: CREATING NEW PURCHASE BILL
          ========================================================== */}
      {viewState === 'add' && (
        <form onSubmit={handleSaveBill} className="space-y-6">
          
          {editingBill && editingBill.status !== 'draft' && (
            <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-sans">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <span className="text-xs font-bold leading-relaxed">
                  لا يمكن تعديل عملية معتمدة أو مرحّلة مباشرة. استخدم إنشاء نسخة تصحيحية أو إلغاء للحفاظ على سلامة الدفاتر.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBill(editingBill);
                    setViewState('view');
                  }}
                  className="px-3 py-1.5 bg-white border border-slate-250 text-slate-700 text-[10px] font-bold rounded-lg hover:bg-slate-50 transition cursor-pointer"
                >
                  عرض العملية
                </button>
                <a
                  href={`#/print/purchase-bill/${editingBill.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-white border border-slate-250 text-slate-700 text-[10px] font-bold rounded-lg hover:bg-slate-50 transition cursor-pointer"
                >
                  طباعة
                </a>
                <button
                  type="button"
                  onClick={() => handleCreateCorrectionCopy(editingBill)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-lg transition cursor-pointer"
                >
                  إنشاء نسخة تصحيحية
                </button>
              </div>
            </div>
          )}

          {/* Header page block */}
          <div className="flex items-center justify-between bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setViewState('list')}
                className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <div>
                <h1 className="text-base font-bold text-slate-800">
                  {editingBill ? `تعديل فاتورة مشتريات مسودة: ${editingBill.bill_number}` : 'فاتورة مشتريات جديدة (مسودة)'}
                </h1>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {editingBill ? 'تعديل وتحديث بيانات الفاتورة المعلقة قبل الاعتماد المحاسبي والترحيل.' : 'ستقوم بحفظ الفاتورة كمسودة، ثم مراجعتها تمهيداً لاعتمادها ترحيلياً.'}
                </p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setViewState('list')}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saveLoading || (editingBill !== null && editingBill.status !== 'draft')}
                className="flex items-center gap-1.5 px-5 py-2 bg-brand-navy hover:bg-brand-navy/95 text-white text-xs font-bold rounded-xl transition shadow disabled:opacity-50 cursor-pointer"
              >
                {saveLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>حفظ كمسودة</span>
              </button>
            </div>
          </div>

          {/* Form alert message */}
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs p-4 rounded-2xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
              <div className="leading-relaxed font-semibold">{formError}</div>
            </div>
          )}

          {/* Header Data card */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              
              {/* Vendor select */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">أختر المورد المعني *</label>
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-blue bg-slate-50/50"
                >
                  <option value="">— اختر مورد الفاتورة —</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name} (ذمم: {v.payable_account?.code || 'لا يوجد'})</option>
                  ))}
                </select>
                {selectedVendorInfo && (
                  <span className="text-[10px] text-brand-blue mt-1.5 block font-medium">
                    الرصيد الافتتاحي: {selectedVendorInfo.opening_balance} {currentOrg?.currency_code || ''} | حساب الذمم: {selectedVendorInfo.payable_account?.name || '—'}
                  </span>
                )}
              </div>

              {/* Vendor original Invoice number */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">رقم فاتورة المورد (اختياري)</label>
                <input
                  type="text"
                  placeholder="الفاتورة الأصلية للمورد للمطابقة"
                  value={vendorInvoiceNumber}
                  onChange={(e) => setVendorInvoiceNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-blue"
                />
              </div>

              {/* Bill Date */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">تاريخ الفاتورة *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                    <Calendar className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="date"
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    required
                    className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-blue font-mono"
                  />
                </div>
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">تاريخ الاستحقاق دائنياً *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                    <Calendar className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                    className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-blue font-mono"
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Line items editor card */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">بنود التكاليف والمشتريات</span>
              <button
                type="button"
                onClick={addLineRow}
                className="flex items-center gap-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-bold px-3 py-1.5 rounded-lg transition"
              >
                <Plus className="w-3.5 h-3.5 text-slate-500" /> إضافة بند
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                    <th className="p-3 w-1/4">المنتج / الخدمة</th>
                    <th className="p-3">الوصف</th>
                    <th className="p-3 w-20 text-center">الكمية</th>
                    <th className="p-3 w-28 text-center">التكلفة (دون ضريبة)</th>
                    <th className="p-3 w-24 text-center">الخصم ({currentOrg?.currency_code || ''})</th>
                    <th className="p-3 w-16 text-center">الضريبة</th>
                    <th className="p-3 w-1/4">الحساب المحاسبي للبند</th>
                    <th className="p-3 text-left pl-6">الإجمالي الفرعي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {lines.map((line, idx) => {
                    const gQty = Number(line.quantity) || 0;
                    const gCost = Number(line.unit_cost) || 0;
                    const gDisc = Number(line.discount_amount) || 0;
                    const lineSubtotal = gQty * gCost;
                    const lineNet = Math.max(0, lineSubtotal - gDisc);
                    const lineTax = lineNet * (line.tax_rate / 100);
                    const lineFinal = lineNet + lineTax;

                    // Filter accounts based on expense vs assets nature if product stockable
                    const matchedItem = items.find(i => i.id === line.item_id);
                    const isTypeStockable = matchedItem?.is_stockable;
                    const filteredLineAccounts = accounts.filter(a => {
                      if (isTypeStockable) {
                        return a.classification === 'assets' && a.allow_direct_posting;
                      }
                      return (a.classification === 'expenses' || a.classification === 'assets') && a.allow_direct_posting;
                    });

                    return (
                      <tr key={line.uuid} className="hover:bg-slate-50/40">
                        {/* Item selector */}
                        <td className="p-3">
                          <select
                            value={line.item_id}
                            onChange={(e) => handleLineItemChange(idx, e.target.value)}
                            className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white"
                          >
                            <option value="">— اختر صنفاً لمحاكاته —</option>
                            {items.map(i => (
                              <option key={i.id} value={i.id}>
                                {i.name} ({i.item_type === 'product' ? 'منتج' : 'خدمة'})
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Description */}
                        <td className="p-3">
                          <input
                            type="text"
                            placeholder="وصف البند التفصيلي"
                            value={line.description}
                            onChange={(e) => updateLineField(idx, 'description', e.target.value)}
                            className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                          />
                        </td>

                        {/* Quantity */}
                        <td className="p-3 text-center">
                          <input
                            type="text"
                            value={line.quantity}
                            onChange={(e) => updateLineField(idx, 'quantity', e.target.value)}
                            className="w-20 p-2 border border-slate-200 rounded-lg text-xs text-center font-mono font-bold"
                            style={{ direction: 'ltr' }}
                          />
                        </td>

                        {/* Unit Cost */}
                        <td className="p-3 text-center">
                          <input
                            type="text"
                            value={line.unit_cost}
                            onChange={(e) => updateLineField(idx, 'unit_cost', e.target.value)}
                            className="w-28 p-2 border border-slate-200 rounded-lg text-xs text-center font-mono font-bold"
                            style={{ direction: 'ltr' }}
                          />
                        </td>

                        {/* Discount */}
                        <td className="p-3 text-center">
                          <input
                            type="text"
                            value={line.discount_amount}
                            onChange={(e) => updateLineField(idx, 'discount_amount', e.target.value)}
                            className="w-24 p-2 border border-slate-200 rounded-lg text-xs text-center font-mono"
                            style={{ direction: 'ltr' }}
                          />
                        </td>

                        {/* Tax rate badge */}
                        <td className="p-3 text-center font-mono font-bold text-slate-500">
                          {line.tax_rate}%
                        </td>

                        {/* Account Selector */}
                        <td className="p-3">
                          <select
                            value={isTypeStockable ? line.inventory_account_id : line.expense_account_id}
                            onChange={(e) => {
                              const selectedVal = e.target.value;
                              if (isTypeStockable) {
                                updateLineField(idx, 'inventory_account_id', selectedVal);
                              } else {
                                // inspect selected account classification to dispatch correctly
                                const acc = accounts.find(a => a.id === selectedVal);
                                if (acc?.classification === 'assets') {
                                  updateLineField(idx, 'inventory_account_id', selectedVal);
                                  updateLineField(idx, 'expense_account_id', '');
                                } else {
                                  updateLineField(idx, 'expense_account_id', selectedVal);
                                  updateLineField(idx, 'inventory_account_id', '');
                                }
                              }
                            }}
                            className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white"
                          >
                            <option value="">— اختر حساب الدورة للبند —</option>
                            {filteredLineAccounts.map(a => (
                              <option key={a.id} value={a.id}>
                                [{a.code}] {a.name} ({a.classification === 'assets' ? 'أصل' : 'مصروف'})
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Subtotal & Delete */}
                        <td className="p-3 text-left pl-6 font-mono font-bold text-slate-900 flex items-center justify-between gap-1" style={{ direction: 'ltr' }}>
                          <span>{lineFinal.toFixed(2)}</span>
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLineRow(idx)}
                              className="text-red-400 hover:text-red-600 p-1 rounded transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes and financial summaries layout */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Notes column */}
            <div className="col-span-1 md:col-span-2 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
              <span className="text-xs font-bold text-slate-500 block">شروحات وملاحظات الفاتورة</span>
              <textarea
                placeholder="تفاصيل إضافية عن شحن أو شروط السداد والفوترة..."
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-2xl text-xs font-medium"
              />
            </div>

            {/* Totals panel */}
            <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-sm space-y-4 font-mono select-none">
              <span className="text-[10px] font-bold text-slate-400 block pb-2 border-b border-white/10 uppercase tracking-wider font-sans">ملخص مالية تفتيش المشتريات</span>
              
              <div className="flex justify-between text-xs">
                <span className="font-sans text-slate-400">الإجمالي غير المخصوم:</span>
                <span className="font-bold">{subtotal.toFixed(2)} {currentOrg?.currency_code || ''}</span>
              </div>

              <div className="flex justify-between text-xs text-red-400">
                <span className="font-sans">إجمالي الخصومات:</span>
                <span className="font-bold">-{discountTotal.toFixed(2)} {currentOrg?.currency_code || ''}</span>
              </div>

              <div className="flex justify-between text-xs text-brand-turquoise">
                <span className="font-sans text-slate-400">ضريبة المدخلات ({getOrgDefaultTaxRate(currentOrg)}%):</span>
                <span className="font-bold">+{taxTotal.toFixed(2)} {currentOrg?.currency_code || ''}</span>
              </div>

              <div className="border-t border-white/10 pt-4 flex justify-between items-baseline">
                <span className="font-sans text-xs text-white font-bold">الصافي المطلوب ({currentOrg?.currency_code || ''}):</span>
                <span className="text-lg font-bold text-brand-turquoise">{total.toFixed(2)} {currentOrg?.currency_code || ''}</span>
              </div>
            </div>

          </div>

        </form>
      )}

      {/* ==========================================================
          VIEW 3: DETAILED BILL & AUTOMATIC LEDGER ENTRIES
          ========================================================== */}
      {viewState === 'view' && selectedBill && (
        <div className="space-y-6">
          
          {/* Header page block */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setViewState('list')}
                className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-bold text-slate-900">{selectedBill.bill_number}</h1>
                  {getStatusBadge(selectedBill.status)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">المورد: {selectedBill.vendor?.name} | تاريخ الفاتورة: {formatArabicDateWithLatinDigits(selectedBill.bill_date)}</p>
              </div>
            </div>

            <div className="flex gap-2 self-stretch md:self-auto">
              <a
                href={`#/print/purchase-bill/${selectedBill.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                <Printer className="w-4 h-4 text-slate-500" />
                <span>تحضير وطباعة الفاتورة A4</span>
              </a>

              {/* Edit option if draft */}
              {selectedBill.status === 'draft' && (
                <button
                  onClick={() => handleStartEditBill(selectedBill)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  <Edit className="w-4 h-4" />
                  <span>تعديل الفاتورة</span>
                </button>
              )}

              {/* Correction copy option if approved */}
              {selectedBill.status === 'approved' && (
                <button
                  onClick={() => handleCreateCorrectionCopy(selectedBill)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>نسخة تصحيحية</span>
                </button>
              )}
              
              {selectedBill.status === 'draft' && canApproveOrCancel && (
                <button
                  onClick={() => handleApproveBill(selectedBill.id)}
                  disabled={actionLoading === selectedBill.id}
                  className="flex items-center justify-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading === selectedBill.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ClipboardCheck className="w-3.5 h-3.5" />
                  )}
                  <span>اعتماد الفاتورة للمورد</span>
                </button>
              )}

              {selectedBill.status === 'approved' && selectedBill.payment_status === 'unpaid' && canApproveOrCancel && (
                <button
                  onClick={() => handleCancelBill(selectedBill.id)}
                  disabled={actionLoading === selectedBill.id}
                  className="flex items-center justify-center gap-1.5 px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition shadow disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading === selectedBill.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Ban className="w-3.5 h-3.5" />
                  )}
                  <span>إلغاء وعكس القيود</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Bill Info and Lines */}
            <div className="col-span-1 md:col-span-2 space-y-6">
              
              {/* Detailed information lists */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm grid grid-cols-2 md:grid-cols-4 gap-6 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">المورد</span>
                  <span className="font-bold text-slate-800">{selectedBill.vendor?.name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">الرقم الضريبي للمورد</span>
                  <span className="font-mono font-bold text-slate-800">{selectedBill.vendor?.vat_number || 'غير مسجل ضريبياً'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">تاريخ الفاتورة</span>
                  <span className="font-mono text-slate-800">{formatArabicDateWithLatinDigits(selectedBill.bill_date)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">تاريخ الاستحقاق</span>
                  <span className="font-mono text-slate-800">{formatArabicDateWithLatinDigits(selectedBill.due_date)}</span>
                </div>
              </div>

              {/* Items listing table */}
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 text-xs">بنود وتكاليف الفاتورة الأصلية</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50/50 text-slate-500 font-semibold border-b border-slate-100">
                        <th className="p-3">البند</th>
                        <th className="p-3">الوصف</th>
                        <th className="p-3 text-center">الكمية</th>
                        <th className="p-3 text-center">التكلفة</th>
                        <th className="p-3 text-center">الخصوم</th>
                        <th className="p-3 text-center">الضريبة</th>
                        <th className="p-3 text-left pl-6">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {selectedBill.lines?.map((line) => (
                        <tr key={line.id} className="hover:bg-slate-50/20 font-medium">
                          <td className="p-3 text-slate-800">{line.item?.name || 'مشتريات/بضاعة'}</td>
                          <td className="p-3 text-slate-500 font-normal">{line.description || '—'}</td>
                          <td className="p-3 text-center font-mono">{line.quantity}</td>
                          <td className="p-3 text-center font-mono">{formatNumberWithLatinDigits(line.unit_cost)} {currentOrg?.currency_code || ''}</td>
                          <td className="p-3 text-center font-mono text-red-500">{formatNumberWithLatinDigits(line.discount_amount)} {currentOrg?.currency_code || ''}</td>
                          <td className="p-3 text-center font-mono">{line.tax_rate}%</td>
                          <td className="p-3 text-left pl-6 font-mono font-bold text-slate-900" style={{ direction: 'ltr' }}>
                            {formatNumberWithLatinDigits(line.line_total)} {currentOrg?.currency_code || ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Automatic journal entries displayed clearly if approved or cancelled */}
              {selectedBill.status !== 'draft' && (
                <div className="bg-white p-6 rounded-3xl border border-slate-250/80 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-brand-navy" />
                      <span>قيد اليومية التلقائي المولد بنظام المزدوج</span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-full">
                      ID: {selectedBill.journal_entry_id}
                    </span>
                  </div>

                  {/* Standard Double Entry Ledger representation */}
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden font-mono text-[11px]">
                    <div className="grid grid-cols-3 md:grid-cols-4 bg-slate-100 p-2.5 font-bold text-slate-600 text-center text-xs">
                      <div className="text-right pr-2">الحساب الدفتري</div>
                      <div className="hidden md:block">الوصف الجانبي</div>
                      <div className="text-left">المدين (Dr)</div>
                      <div className="text-left pl-4">الدائن (Cr)</div>
                    </div>
                    {/* Render the double entry journal lines, mock or select */}
                    <div className="divide-y divide-slate-100">
                      {/* Debit and Credit listing representation depending on lines */}
                      {selectedBill.lines?.map((line, idx) => {
                        const lineAccountCode = line.item?.is_stockable ? '1201' : '5101';
                        const lineAccountName = line.item?.is_stockable ? 'حساب بضاعة بالطريق / مخزن' : 'حساب مصروفات التشغيل والخدمات';
                        return (
                          <div key={idx} className="grid grid-cols-3 md:grid-cols-4 p-2.5 text-center items-center">
                            <div className="text-right pr-2 font-semibold">
                              <span className="text-brand-blue font-bold">[{lineAccountCode}]</span> {lineAccountName}
                            </div>
                            <div className="hidden md:block text-slate-500 font-sans">تثبيت تكلفة بند: {line.item?.name}</div>
                            <div className="text-left font-bold text-emerald-600">{(line.line_total - line.tax_amount).toFixed(2)} {currentOrg?.currency_code || ''}</div>
                            <div className="text-left pl-4 text-slate-400">0.00 {currentOrg?.currency_code || ''}</div>
                          </div>
                        );
                      })}
                      {selectedBill.tax_total > 0 && (
                        <div className="grid grid-cols-3 md:grid-cols-4 p-2.5 text-center items-center">
                          <div className="text-right pr-2 font-semibold">
                            <span className="text-brand-blue font-bold">[1204]</span> ضريبة القيمة المضافة لمدخلات المنشأة
                          </div>
                          <div className="hidden md:block text-slate-500 font-sans">ضريبة المدخلات مفرزة بنسبة {selectedBill.lines && selectedBill.lines.length > 0 ? selectedBill.lines[0].tax_rate : getOrgDefaultTaxRate(currentOrg)}%</div>
                          <div className="text-left font-bold text-emerald-600">{selectedBill.tax_total.toFixed(2)} {currentOrg?.currency_code || ''}</div>
                          <div className="text-left pl-4 text-slate-400">0.00 {currentOrg?.currency_code || ''}</div>
                        </div>
                      )}
                      <div className="grid grid-cols-3 md:grid-cols-4 p-2.5 text-center items-center bg-brand-navy/5">
                        <div className="text-right pr-2 font-bold">
                          <span className="text-brand-blue">[2101]</span> ذمم الموردين الدائنة ({selectedBill.vendor?.name})
                        </div>
                        <div className="hidden md:block text-slate-500 font-sans">تثبيت مديونية الفاتورة {selectedBill.bill_number}</div>
                        <div className="text-left text-slate-400 font-bold">0.00 {currentOrg?.currency_code || ''}</div>
                        <div className="text-left pl-4 font-bold text-red-600">{selectedBill.total.toFixed(2)} {currentOrg?.currency_code || ''}</div>
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <span>تنبيه نظام معايير: تم تثبيت القيد المحاسبي بالترحيل المباشر، ولا يمكن تعديل أو حذف القيد يدوياً منعاً لفساد القيد المزدوج.</span>
                  </div>
                </div>
              )}

            </div>

            {/* Bill Summary Right column */}
            <div className="space-y-6">
              
              {/* Financial panel */}
              <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-sm space-y-4 font-mono select-none">
                <span className="text-[10px] font-bold text-slate-400 block pb-2 border-b border-white/10 uppercase tracking-wider font-sans">بطاقة مالية الفاتورة</span>
                
                <div className="flex justify-between text-xs">
                  <span className="font-sans text-slate-400">المجموع قبل الخصم:</span>
                  <span>{formatNumberWithLatinDigits(selectedBill.subtotal)} {currentOrg?.currency_code || ''}</span>
                </div>

                <div className="flex justify-between text-xs text-red-400">
                  <span className="font-sans text-slate-400">إجمالي الخصومات:</span>
                  <span>-{formatNumberWithLatinDigits(selectedBill.discount_total)} {currentOrg?.currency_code || ''}</span>
                </div>

                <div className="flex justify-between text-xs text-brand-turquoise">
                  <span className="font-sans text-slate-400">ضريبة المدخلات:</span>
                  <span>+{formatNumberWithLatinDigits(selectedBill.tax_total)} {currentOrg?.currency_code || ''}</span>
                </div>

                <div className="border-t border-white/10 pt-4 flex justify-between items-baseline">
                  <span className="font-sans text-xs font-bold">الصافي المطلوب:</span>
                  <span className="text-lg font-bold text-brand-turquoise">{formatNumberWithLatinDigits(selectedBill.total)} {currentOrg?.currency_code || ''}</span>
                </div>

                <div className="border-t border-white/10 pt-4 space-y-2 font-sans text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">المبلغ المدفوع:</span>
                    <span className="text-emerald-400 font-bold">{formatNumberWithLatinDigits(selectedBill.paid_amount)} {currentOrg?.currency_code || ''}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">المبلغ الدائن المتبقي:</span>
                    <span className="text-amber-400 font-bold">{formatNumberWithLatinDigits(selectedBill.balance_due)} {currentOrg?.currency_code || ''}</span>
                  </div>
                </div>
              </div>

              {/* Status information panel */}
              <div className="bg-slate-50 border border-slate-200/60 p-6 rounded-3xl space-y-4 text-xs font-medium text-slate-600 leading-relaxed leading-7">
                <span className="text-[10px] font-bold text-slate-400 block pb-2 border-b border-slate-200/60 uppercase tracking-wider">سجل الحركة والتدقيق</span>
                
                <div>
                  <span className="text-slate-400 block text-[10px]">تاريخ الإنشاء</span>
                  <span>{formatArabicDateWithLatinDigits(selectedBill.created_at)}</span>
                </div>

                {selectedBill.approved_at && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">تاريخ الاعتماد</span>
                    <span>{formatArabicDateWithLatinDigits(selectedBill.approved_at)}</span>
                  </div>
                )}

                {selectedBill.cancelled_at && (
                  <div className="text-red-600">
                    <span className="text-slate-400 block text-[10px]">تاريخ الإلغاء</span>
                    <span>{formatArabicDateWithLatinDigits(selectedBill.cancelled_at)}</span>
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>
      )}

    </div>
  );
};
