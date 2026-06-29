import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { salesService, CreateReceiptInput } from '../../lib/salesService';
import { masterDataService } from '../../lib/masterDataService';
import { accountingService } from '../../lib/accountingService';
import { auditService } from '../../lib/auditService';
import { 
  Receipt, 
  Customer, 
  Account, 
  AccountingSettings,
  SalesInvoice,
  PaymentMethod
} from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { 
  formatNumberWithLatinDigits, 
  formatArabicDateWithLatinDigits,
  toEnglishDigits,
  normalizeDecimalInput
} from '../../lib/formatters';
import { 
  CreditCard, 
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
  AlertCircle,
  Loader2,
  Calendar,
  DollarSign,
  ArrowRight,
  TrendingDown,
  Percent,
  CheckCircle2,
  Edit,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

export const ReceiptsPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg, profile } = useAuth();
  
  // Checking permissions: Owner, admin, accountant can approve/cancel; Sales can only create drafts.
  const canApproveOrCancel = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant';

  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);

  // Data State
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<AccountingSettings | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // View state: 'list' | 'add' | 'view'
  const [viewState, setViewState] = useState<'list' | 'add' | 'view'>('list');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // all, draft, approved, cancelled

  // Form State
  const [customerId, setCustomerId] = useState<string>('');
  const [receiptDate, setReceiptDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');
  const [cashAccountId, setCashAccountId] = useState<string>('');
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Form Allocations (which invoices are being paid)
  // { invoice_id: amount }
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  // Load lists on mount
  useEffect(() => {
    if (currentOrg?.id) {
      loadData();
    }
  }, [currentOrg?.id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [allReceipts, allCustomers, allInvoices, allAccounts, taxSettings] = await Promise.all([
        salesService.getReceipts(currentOrg!.id),
        masterDataService.getCustomers(currentOrg!.id),
        salesService.getSalesInvoices(currentOrg!.id),
        accountingService.getAccounts(currentOrg!.id),
        accountingService.getAccountingSettings(currentOrg!.id).catch(() => null)
      ]);

      setReceipts(allReceipts);
      setCustomers(allCustomers.filter(c => c.is_active));
      setInvoices(allInvoices);
      setAccounts(allAccounts.filter(a => a.is_active));
      setSettings(taxSettings);

      // Pre-select default assets accounts from settings
      if (taxSettings?.default_cash_account_id) {
        setCashAccountId(taxSettings.default_cash_account_id);
      }
      if (taxSettings?.default_bank_account_id) {
        setBankAccountId(taxSettings.default_bank_account_id);
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Get active unpaid invoices for currently selected customer in form
  const getCustomerUnpaidInvoices = () => {
    if (!customerId) return [];
    return invoices.filter(inv => 
      inv.customer_id === customerId && 
      inv.status === 'approved' && 
      inv.balance_due > 0
    );
  };

  const customerUnpaidInvoices = getCustomerUnpaidInvoices();

  // Handle switching customer -> resets allocations map
  const handleCustomerChange = (id: string) => {
    setCustomerId(id);
    setAllocations({});
    setAmount('0');
  };

  // Auto allocate amount across the unpaid invoices starting from the oldest
  const handleAutoAllocate = () => {
    const parsedAmount = parseFloat(toEnglishDigits(amount));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('يرجى كتابة مبلغ المقبوضات الإجمالي أولاً!');
      return;
    }

    let remaining = parsedAmount;
    const newAllocations: Record<string, string> = {};

    // Sort customer invoices: oldest first (fiscal sequence)
    const sortedInvs = [...customerUnpaidInvoices].sort((a, b) => 
      new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime()
    );

    for (const inv of sortedInvs) {
      if (remaining <= 0) break;
      const pays = Math.min(remaining, inv.balance_due);
      newAllocations[inv.id] = pays.toFixed(2);
      remaining -= pays;
    }

    setAllocations(newAllocations);
  };

  const handleUpdateAllocation = (invId: string, val: string) => {
    setAllocations(prev => ({
      ...prev,
      [invId]: normalizeDecimalInput(val)
    }));
  };

  // Get total allocated amount to display
  const getTotalAllocated = (): number => {
    return (Object.values(allocations) as string[]).reduce((sum: number, item: string) => {
      const parsed = parseFloat(item);
      return sum + (isNaN(parsed) ? 0 : parsed);
    }, 0);
  };

  const totalAllocated = getTotalAllocated();

  const handleAddNewReceipt = () => {
    setEditingReceipt(null);
    setCustomerId('');
    setReceiptDate(new Date().toISOString().split('T')[0]);
    setAmount('0');
    setPaymentMethod('bank_transfer');
    if (settings?.default_cash_account_id) {
      setCashAccountId(settings.default_cash_account_id);
    }
    if (settings?.default_bank_account_id) {
      setBankAccountId(settings.default_bank_account_id);
    }
    setReference('');
    setNotes('');
    setAllocations({});
    setFormError(null);
    setViewState('add');
  };

  const handleStartEditReceipt = useCallback((receipt: Receipt) => {
    setEditingReceipt(receipt);
    setCustomerId(receipt.customer_id);
    setReceiptDate(receipt.receipt_date);
    setAmount(String(receipt.amount));
    setPaymentMethod(receipt.payment_method);
    setCashAccountId(receipt.cash_account_id || '');
    setBankAccountId(receipt.bank_account_id || '');
    setReference(receipt.reference || '');
    setNotes(receipt.notes || '');
    const allocMap: Record<string, string> = {};
    (receipt.allocations || []).forEach(al => {
      allocMap[al.sales_invoice_id] = String(al.allocated_amount);
    });
    setAllocations(allocMap);
    setFormError(null);
    setViewState('add');
  }, []);

  const handleCreateCorrectionCopy = useCallback(async (oldReceipt: Receipt) => {
    if (!confirm(`هل أنت متأكد من إنشاء نسخة تصحيحية من السند رقم ${oldReceipt.receipt_number}؟`)) return;
    setSaveLoading(true);
    setFormError(null);
    try {
      const copyPayload: CreateReceiptInput = {
        customer_id: oldReceipt.customer_id,
        receipt_date: new Date().toISOString().split('T')[0],
        amount: oldReceipt.amount,
        payment_method: oldReceipt.payment_method,
        cash_account_id: oldReceipt.cash_account_id || undefined,
        bank_account_id: oldReceipt.bank_account_id || undefined,
        reference: oldReceipt.reference || undefined,
        notes: `نسخة تصحيحية من السند: ${oldReceipt.receipt_number}` + (oldReceipt.notes ? `\n\n${oldReceipt.notes}` : ''),
        allocations: (oldReceipt.allocations || []).map(al => ({
          sales_invoice_id: al.sales_invoice_id,
          allocated_amount: al.allocated_amount
        }))
      };

      const newId = await salesService.createReceipt(currentOrg!.id, copyPayload);
      
      await auditService.logAction(currentOrg!.id, profile?.id || null, 'correction_copy_created', {
        source_type: 'receipt',
        original_id: oldReceipt.id,
        original_number: oldReceipt.receipt_number,
        new_draft_id: newId
      });

      // Reload lists
      const updatedList = await salesService.getReceipts(currentOrg!.id);
      setReceipts(updatedList);

      // Open in edit mode immediately
      const newReceipt = updatedList.find(r => r.id === newId) || await salesService.getReceipt(currentOrg!.id, newId);
      handleStartEditReceipt(newReceipt);
    } catch (err: any) {
      setFormError(getErrorMessage(err));
      alert(`فشل إنشاء النسخة التصحيحية: ${getErrorMessage(err)}`);
    } finally {
      setSaveLoading(false);
    }
  }, [currentOrg, profile, handleStartEditReceipt]);

  // Submit Receipt draft
  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaveLoading(true);

    const parsedAmount = parseFloat(toEnglishDigits(amount));
    if (!customerId) {
      setFormError('يرجى اختيار عميل.');
      setSaveLoading(false);
      return;
    }

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('يرجى تحديد مبلغ سند القبض بشكل صحيح.');
      setSaveLoading(false);
      return;
    }

    // Allocation validations
    const allocationPayload = (Object.entries(allocations) as [string, string][])
      .map(([invoiceId, allocAmt]) => ({
        sales_invoice_id: invoiceId,
        allocated_amount: parseFloat(allocAmt)
      }))
      .filter(item => !isNaN(item.allocated_amount) && item.allocated_amount > 0);

    if (allocationPayload.length === 0) {
      setFormError('يجب تخصيص/توزيع مبلغ السند على الأقل على فاتورة واحدة مبيعات معلقة.');
      setSaveLoading(false);
      return;
    }

    const totalAllocatedSum = allocationPayload.reduce((sum, item) => sum + item.allocated_amount, 0);
    // Tolerance buffer for JavaScript float arithmetic decimals precision
    if (Math.abs(totalAllocatedSum - parsedAmount) > 0.05) {
      setFormError(`مجموع المبالغ الموزعة (${formatNumberWithLatinDigits(totalAllocatedSum)}) يسبر أن يطابق مبلغ السند المكتوب (${formatNumberWithLatinDigits(parsedAmount)}).`);
      setSaveLoading(false);
      return;
    }

    // Account validations based on payment method
    if (paymentMethod === 'cash' && !cashAccountId) {
      setFormError('حساب الصندوق/النقد بالصندوق مطلوب للمدفوعات النقدية.');
      setSaveLoading(false);
      return;
    }

    if ((paymentMethod === 'bank_transfer' || paymentMethod === 'card') && !bankAccountId) {
      setFormError('حساب البنك/المدفوعات الإلكترونية مطلوب للمعاملات البنكية.');
      setSaveLoading(false);
      return;
    }

    try {
      const receiptPayload: CreateReceiptInput = {
        customer_id: customerId,
        receipt_date: receiptDate,
        amount: parsedAmount,
        payment_method: paymentMethod,
        cash_account_id: paymentMethod === 'cash' ? cashAccountId : undefined,
        bank_account_id: (paymentMethod === 'bank_transfer' || paymentMethod === 'card') ? bankAccountId : undefined,
        reference: reference || undefined,
        notes: notes || undefined,
        allocations: allocationPayload
      };

      let activeId = '';
      if (editingReceipt) {
        await salesService.updateReceipt(currentOrg!.id, editingReceipt.id, receiptPayload);
        activeId = editingReceipt.id;
        
        await auditService.logAction(currentOrg!.id, profile?.id || null, 'draft_updated', {
          source_type: 'receipt',
          receipt_id: editingReceipt.id,
          receipt_number: editingReceipt.receipt_number
        });
      } else {
        const newId = await salesService.createReceipt(currentOrg!.id, receiptPayload);
        activeId = newId;
      }

      // Reload lists
      const updatedList = await salesService.getReceipts(currentOrg!.id);
      setReceipts(updatedList);

      // Fetch newly saved details and open details view
      const fullDetails = await salesService.getReceipt(currentOrg!.id, activeId);
      setSelectedReceipt(fullDetails);
      setEditingReceipt(null);
      setViewState('view');
    } catch (err: any) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaveLoading(false);
    }
  };

  // Action: Approve receipt
  const handleApproveReceipt = async (receiptId: string) => {
    if (!confirm('هل أنت متأكد من اعتماد سند القبض هذا؟ بعد الاعتماد، سيتم تخفيض ذمم العميل المفتوحة، وتعديل المتبقي بفواتيره وتوزيع المستحقات نظامياً.')) return;
    setActionLoading('approve');
    setError(null);
    try {
      await salesService.approveReceipt(currentOrg!.id, receiptId);
      
      // Refresh current details
      if (selectedReceipt && selectedReceipt.id === receiptId) {
        const refreshed = await salesService.getReceipt(currentOrg!.id, receiptId);
        setSelectedReceipt(refreshed);
      }

      // Reload list and caches
      const updatedList = await salesService.getReceipts(currentOrg!.id);
      setReceipts(updatedList);
      
      // reload invoices in cash so unpaid totals are accurate in lists
      const updatedInvoices = await salesService.getSalesInvoices(currentOrg!.id);
      setInvoices(updatedInvoices);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // Action: Cancel receipt
  const handleCancelReceipt = async (receiptId: string) => {
    if (!confirm('هل أنت متأكد من إلغاء سند القبض؟ سيتم عكس ترحيل الأموال وإلغاء تخفيض الفواتير مع إنشاء قيد عكسي لقيد المقبوضات التلقائي.')) return;
    setActionLoading('cancel');
    setError(null);
    try {
      await salesService.cancelReceipt(currentOrg!.id, receiptId);
      
      if (selectedReceipt && selectedReceipt.id === receiptId) {
        const refreshed = await salesService.getReceipt(currentOrg!.id, receiptId);
        setSelectedReceipt(refreshed);
      }

      const updatedList = await salesService.getReceipts(currentOrg!.id);
      setReceipts(updatedList);

      const updatedInvoices = await salesService.getSalesInvoices(currentOrg!.id);
      setInvoices(updatedInvoices);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // Action: Delete draft receipt
  const handleDeleteDraftReceipt = async (receiptId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا السند المسودة نهائياً؟')) return;
    setActionLoading('delete');
    setError(null);
    try {
      await salesService.deleteDraftReceipt(currentOrg!.id, receiptId);
      
      if (selectedReceipt && selectedReceipt.id === receiptId) {
        setSelectedReceipt(null);
        setViewState('list');
      }

      const updatedList = await salesService.getReceipts(currentOrg!.id);
      setReceipts(updatedList);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleShowDetails = async (receipt: Receipt) => {
    setActionLoading('fetch');
    try {
      const full = await salesService.getReceipt(currentOrg!.id, receipt.id);
      setSelectedReceipt(full);
      setViewState('view');
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const filteredReceipts = receipts.filter(rc => {
    const term = searchQuery.toLowerCase().trim();
    const customerName = rc.customer?.name.toLowerCase() || '';
    const num = rc.receipt_number.toLowerCase();
    
    const matchesSearch = customerName.includes(term) || num.includes(term);
    const matchesStatus = statusFilter === 'all' || rc.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[500px]">
        <Loader2 className="w-8 h-8 text-brand-blue animate-spin mb-4" />
        <span className="text-sm text-slate-500 font-sans">جاري تحميل سجلات الخزينة والمقبوضات...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans select-none" dir="rtl">
      
      {/* Messages */}
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-2xl flex items-start gap-3 border border-red-100 max-w-3xl">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
          <div className="text-xs font-semibold leading-relaxed">{error}</div>
        </div>
      )}

      {/* VIEW: RECEIPTS LIST */}
      {viewState === 'list' && (
        <div className="space-y-5 animate-fade-in">
          
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                <CreditCard className="w-5.5 h-5.5 text-brand-blue" />
                <span>سندات القبض والمتحصلات المالية</span>
              </h1>
              <p className="text-xs text-slate-500">
                إدارة سندات قبض السيولة من العملاء، توزيعها على فواتير المبيعات المطلوبة وتسوية الذمم المدينة.
              </p>
            </div>
            
            <button
              id="btn-add-receipt"
              onClick={handleAddNewReceipt}
              className="px-5 py-2.5 bg-brand-blue hover:bg-brand-blue/90 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 transition shadow-lg cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>تسجيل سند قبض جديد</span>
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-100 p-4.5 rounded-2xl flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">إجمالي المقبوضات المعتمدة</span>
                <span className="text-sm font-black text-slate-800 font-mono">
                  {formatNumberWithLatinDigits(receipts.reduce((acc, r) => acc + (r.status === 'approved' ? r.amount : 0), 0))} <span className="text-[10px] font-sans">SAR</span>
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-100 p-4.5 rounded-2xl flex items-center gap-4">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">سندات قيد الانتظار (مسودة)</span>
                <span className="text-sm font-semibold text-purple-600 font-sans">
                  {receipts.filter(r => r.status === 'draft').length} سندات معلقة
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-100 p-4.5 rounded-2xl flex items-center gap-4">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">سندات ملغاة وعكسية</span>
                <span className="text-sm font-semibold text-slate-400 font-mono">
                  {receipts.filter(r => r.status === 'cancelled').length} سندات ملغاة
                </span>
              </div>
            </div>
          </div>

          {/* Search bar & filter */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:max-w-md">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بواسطة رقم السند، اسم العميل..."
                className="w-full pl-3 pr-10 py-2 bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue rounded-xl text-xs font-medium text-slate-700 transition"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-2.75" />
            </div>

            <div className="flex items-center gap-1.5 shrink-0 text-xs">
              <span className="text-slate-400">تصفية السندات:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 focus:outline-none text-[11px]"
              >
                <option value="all">كل السندات</option>
                <option value="draft">مسودات</option>
                <option value="approved">معتمدة ومرحلة</option>
                <option value="cancelled">ملغاة وعكسية</option>
              </select>
            </div>
          </div>

          {/* TABLE DISPLAY */}
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3.5">تاريخ القبض</th>
                    <th className="px-5 py-3.5">رقم السند</th>
                    <th className="px-5 py-3.5">العميل المقبوض منه</th>
                    <th className="px-5 py-3.5 text-center">طريقة الدفع</th>
                    <th className="px-5 py-3.5 text-left">قيمة المقبوضات</th>
                    <th className="px-5 py-3.5 text-center">المرجع</th>
                    <th className="px-5 py-3.5 text-center">حالة الصلاحية</th>
                    <th className="px-5 py-3.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-slate-400">
                        لا توجد سندات قبض مسجلة ومطابقة للبحث حالياً.
                      </td>
                    </tr>
                  ) : (
                    filteredReceipts.map((rc) => (
                      <tr key={rc.id} className="hover:bg-slate-50/50 transition">
                        <td className="px-5 py-3 text-slate-500 font-semibold font-sans">
                          {formatArabicDateWithLatinDigits(rc.receipt_date)}
                        </td>
                        <td className="px-5 py-3 font-bold text-brand-blue font-sans">
                          {rc.receipt_number}
                        </td>
                        <td className="px-5 py-3 text-slate-705 font-bold">
                          {rc.customer?.name}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {rc.payment_method === 'cash' ? (
                            <span className="font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md text-[10px]">نقداً بالصندوق</span>
                          ) : rc.payment_method === 'bank_transfer' ? (
                            <span className="font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md text-[10px]">تحويل بنكي</span>
                          ) : rc.payment_method === 'card' ? (
                            <span className="font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md text-[10px]">بطاقة مدى/إلكتروني</span>
                          ) : (
                            <span className="font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md text-[10px]">طرق أخرى</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-left font-bold text-slate-800 font-mono" style={{ direction: 'ltr' }}>
                          {formatNumberWithLatinDigits(rc.amount)}
                        </td>
                        <td className="px-5 py-3 text-center text-slate-550 font-sans">
                          {rc.reference || '—'}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {rc.status === 'draft' ? (
                            <span className="inline-flex px-2 py-1 rounded-lg bg-purple-50 text-purple-700 text-[10px] font-bold">مسودة</span>
                          ) : rc.status === 'approved' ? (
                            <span className="inline-flex px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-bold">معتمد سحابياً</span>
                          ) : (
                            <span className="inline-flex px-2 py-1 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold">ملغى وعكسي</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleShowDetails(rc)}
                              className="p-1 px-1.5 text-slate-600 hover:bg-slate-100 rounded transition flex items-center gap-1 text-[10px] font-semibold cursor-pointer"
                              title="عرض التفاصيل والأقساط"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>التفاصيل</span>
                            </button>

                            <a
                              href={`#/print/receipt/${rc.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 px-1.5 text-slate-600 hover:bg-slate-100 rounded transition flex items-center gap-1 text-[10px] font-semibold cursor-pointer"
                              title="طباعة سند القبض الضابط"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>طباعة A4</span>
                            </a>

                            {/* Edit option if draft */}
                            {rc.status === 'draft' && (
                              <button
                                onClick={() => handleStartEditReceipt(rc)}
                                className="p-1 px-1.5 text-purple-600 hover:bg-purple-50 rounded transition flex items-center gap-1 text-[10px] font-semibold cursor-pointer"
                                title="تعديل السند المسودة"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                <span>تعديل</span>
                              </button>
                            )}

                            {/* Correction copy option if approved */}
                            {rc.status === 'approved' && (
                              <button
                                onClick={() => handleCreateCorrectionCopy(rc)}
                                className="p-1 px-1.5 text-amber-600 hover:bg-amber-50 rounded transition flex items-center gap-1 text-[10px] font-semibold cursor-pointer"
                                title="إنشاء نسخة تصحيحية من هذا السند المعتمد"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>نسخة تصحيحية</span>
                              </button>
                            )}

                            {/* Approve option if draft */}
                            {rc.status === 'draft' && canApproveOrCancel && (
                              <button
                                onClick={() => handleApproveReceipt(rc.id)}
                                disabled={actionLoading !== null}
                                className="p-1 px-1.5 bg-brand-blue/10 hover:bg-brand-blue/20 text-brand-blue rounded transition flex items-center gap-1 text-[10px] font-semibold cursor-pointer"
                                title="اعتماد كشف المقبوضات والترحيل"
                              >
                                <ClipboardCheck className="w-3.5 h-3.5" />
                                <span>اعتماد</span>
                              </button>
                            )}

                            {/* Cancel option if approved */}
                            {rc.status === 'approved' && canApproveOrCancel && (
                              <button
                                onClick={() => handleCancelReceipt(rc.id)}
                                disabled={actionLoading !== null}
                                className="p-1 px-1.5 text-red-600 hover:bg-red-50 rounded transition flex items-center gap-1 text-[10px] font-semibold cursor-pointer"
                                title="إلغاء قسيمة المقبوض وعكس القيد"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>إلغاء السند</span>
                              </button>
                            )}

                            {/* Delete Option if draft */}
                            {rc.status === 'draft' && (
                              <button
                                onClick={() => handleDeleteDraftReceipt(rc.id)}
                                disabled={actionLoading !== null}
                                className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                                title="حذف المسودة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: REGISTER NEW RECEIPT (WITH ALLOCATIONS) TABLE */}
      {viewState === 'add' && (
        <form onSubmit={handleSubmitReceipt} className="space-y-6 animate-fade-in">
          
          {editingReceipt && editingReceipt.status !== 'draft' && (
            <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-sans">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <span className="text-xs font-bold leading-relaxed">
                  لا يمكن تعديل عملية معتمدة أو مرحّلة مباشرة. استخدم إنشاء نسخة تصحيحية أو عكس القيد للحفاظ على سلامة الدفاتر.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedReceipt(editingReceipt);
                    setViewState('view');
                  }}
                  className="px-3 py-1.5 bg-white border border-slate-250 text-slate-700 text-[10px] font-bold rounded-lg hover:bg-slate-50 transition cursor-pointer"
                >
                  عرض العملية
                </button>
                <a
                  href={`#/print/receipt/${editingReceipt.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-white border border-slate-250 text-slate-700 text-[10px] font-bold rounded-lg hover:bg-slate-50 transition cursor-pointer"
                >
                  طباعة
                </a>
                <button
                  type="button"
                  onClick={() => handleCreateCorrectionCopy(editingReceipt)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-lg transition cursor-pointer"
                >
                  إنشاء نسخة تصحيحية
                </button>
              </div>
            </div>
          )}

          {/* Header Action bar */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewState('list')}
                className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-500 cursor-pointer"
              >
                <ArrowRight className="w-4.5 h-4.5" />
              </button>
              <div>
                <h1 className="text-md font-bold text-slate-800">
                  {editingReceipt ? `تعديل سند قبض مسودة: ${editingReceipt.receipt_number}` : 'تسجيل سند كشف قبض وتوزيع (مسودة)'}
                </h1>
                <p className="text-[10px] text-slate-400">
                  {editingReceipt ? 'تعديل وتحديث بيانات سند القبض المعلق قبل الاعتماد المحاسبي.' : 'تسجيل مدفوعات العملاء نقداً أو بالبنك، وتخصيصها لتخفيض الصافي لفواتير المبيعات المطلوبة.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewState('list')}
                className="px-4 py-2 border border-slate-200 text-slate-500 text-xs font-semibold rounded-xl hover:bg-slate-50 cursor-pointer transition"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saveLoading || (editingReceipt !== null && editingReceipt.status !== 'draft')}
                className="px-5 py-2.25 bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold rounded-xl shadow-lg cursor-pointer transition flex items-center justify-center gap-2"
              >
                {saveLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>حفظ سند القبض</span>
              </button>
            </div>
          </div>

          {formError && (
            <div className="bg-amber-50 text-amber-800 p-4 rounded-xl flex items-start gap-3 border border-amber-100 text-xs font-semibold leading-relaxed">
              <AlertCircle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
              <div>{formError}</div>
            </div>
          )}

          {/* Form Content layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Main receipts settings */}
            <div className="lg:col-span-2 space-y-6">
              
              <div className="bg-white border border-slate-100 p-5 rounded-2xl space-y-4">
                <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider border-b border-slate-50 pb-2">تفاصيل سند التوريد والقبض النقد المالي</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  
                  {/* Select customer */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400">العميل المُسدِّد *</label>
                    <select
                      value={customerId}
                      onChange={(e) => handleCustomerChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-blue rounded-xl text-xs font-semibold text-slate-705"
                    >
                      <option value="">-- اختر العميل --</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.code} - {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400">تاريخ سند الاستلام *</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={receiptDate}
                        onChange={(e) => setReceiptDate(toEnglishDigits(e.target.value))}
                        required
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-blue rounded-xl text-xs font-semibold text-slate-700 font-sans"
                      />
                      <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                    </div>
                  </div>

                  {/* Receipt amount write */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400">المبلغ المقبوض الإجمالي (SAR) *</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(normalizeDecimalInput(e.target.value))}
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-blue rounded-xl text-xs font-bold text-slate-700 font-sans text-left"
                    />
                  </div>

                  {/* Payment method */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400">طريقة استلام النقد *</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-blue rounded-xl text-xs font-semibold text-slate-700"
                    >
                      <option value="bank_transfer">تحويل حساب بنكي</option>
                      <option value="cash">نقداً باليد (الصندوق)</option>
                      <option value="card">معالجة مدى/عبر بطاقة</option>
                      <option value="other">طرق دفع تسوية أخرى</option>
                    </select>
                  </div>

                  {/* Ledger Accounts options mapping */}
                  {paymentMethod === 'cash' ? (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-400 font-bold text-brand-blue">حساب صندوق التحصيل *</label>
                      <select
                        value={cashAccountId}
                        onChange={(e) => setCashAccountId(e.target.value)}
                        required
                        className="w-full px-3 py-2 bg-white border border-brand-blue/30 focus:outline-none focus:border-brand-blue rounded-xl text-xs font-semibold text-slate-700"
                      >
                        <option value="">-- اختر حساب النقد --</option>
                        {accounts.filter(a => a.classification === 'assets').map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.code} - {acc.name_ar}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-blue-500 font-bold">حساب البنك المستلم *</label>
                      <select
                        value={bankAccountId}
                        onChange={(e) => setBankAccountId(e.target.value)}
                        required
                        className="w-full px-3 py-2 bg-white border border-blue-300 focus:outline-none focus:border-brand-blue rounded-xl text-xs font-semibold text-slate-700"
                      >
                        <option value="">-- اختر حساب البنك --</option>
                        {accounts.filter(a => a.classification === 'assets').map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.code} - {acc.name_ar}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Reference */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400">رقم الإسناد / رقم الحوالة</label>
                    <input
                      type="text"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="رقم العملية، الشيك..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-blue rounded-xl text-xs font-medium text-slate-700 font-sans"
                    />
                  </div>

                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400">شرح السند وملاحظات</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="سيظهر هذا الشرح كمرجع تفسيري في بيان قيد المحاسبة التلقائي المولد..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-blue rounded-xl text-xs font-medium text-slate-750"
                  />
                </div>
              </div>

              {/* ALLOCATION TO INVOICES BLOCK */}
              <div className="bg-white border border-slate-100 p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">تخصيص السند على فواتير المبيعات المعلقة</h3>
                    <p className="text-[10px] text-slate-400">يجب ترحيل مبالغ الفواتير بدقة. اضغط زر التخصيص التلقائي إن رغبت بتوزيع السداد تتابعياً من الأقدم للأحدث.</p>
                  </div>
                  
                  {customerId && customerUnpaidInvoices.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAutoAllocate}
                      className="px-3.5 py-1.5 bg-brand-blue/10 hover:bg-brand-blue/20 text-brand-blue text-[10px] font-bold rounded-xl transition cursor-pointer"
                    >
                      تخصيص المبالغ تلقائياً
                    </button>
                  )}
                </div>

                {/* Invoices List allocation */}
                {!customerId ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    يرجى اختيار العميل أولاً لمقاطعة حساب الذمة وجلب فواتيره غير المحصلة.
                  </div>
                ) : customerUnpaidInvoices.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    لا تتوفر فواتير مبيعات سارية معلقة وغير مدفوعة لهذا العميل للخصم منها.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right divide-y divide-slate-100 text-xs">
                      <thead>
                        <tr className="text-slate-400 text-[10px] font-bold">
                          <th className="px-3 py-2">رقم الفاتورة المعتمدة</th>
                          <th className="px-3 py-2 font-sans">تاريخ الإصدار</th>
                          <th className="px-3 py-2 text-left">قيمة الفاتورة</th>
                          <th className="px-3 py-2 text-left">المسدد سابقاً</th>
                          <th className="px-3 py-2 text-left text-rose-500 font-extrabold">المتبقي المطلوب</th>
                          <th className="px-3 py-2 text-left w-36">المخصص الحركي في هذا السند (SAR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {customerUnpaidInvoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2.5 font-bold text-slate-700 font-sans">{inv.invoice_number}</td>
                            <td className="px-3 py-2.5 text-slate-500 font-semibold font-sans">{formatArabicDateWithLatinDigits(inv.invoice_date)}</td>
                            <td className="px-3 py-2.5 text-left font-mono" style={{ direction: 'ltr' }}>{formatNumberWithLatinDigits(inv.total)}</td>
                            <td className="px-3 py-2.5 text-left font-semibold text-emerald-600 font-mono" style={{ direction: 'ltr' }}>{formatNumberWithLatinDigits(inv.paid_amount)}</td>
                            <td className="px-3 py-2.5 text-left font-extrabold text-rose-600 font-mono" style={{ direction: 'ltr' }}>{formatNumberWithLatinDigits(inv.balance_due)}</td>
                            
                            <td className="px-3 py-2.5 text-left">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={allocations[inv.id] || ''}
                                onChange={(e) => handleUpdateAllocation(inv.id, e.target.value)}
                                placeholder="0.00"
                                className="w-full max-w-[120px] px-2 py-1 bg-white border border-slate-205 focus:outline-none focus:border-brand-blue rounded-lg text-xs font-bold text-slate-800 text-left font-sans"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>

            {/* Right details box */}
            <div className="space-y-6">
              
              {/* Allocations totals tracker */}
              <div className="bg-slate-900 text-white p-5 rounded-2xl relative overflow-hidden shadow-xl space-y-4">
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-turquoise/10 rounded-full blur-2xl pointer-events-none" />

                <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider border-b border-white/10 pb-2">تفاصيل موازنة سند التوزيع</h3>
                
                <div className="space-y-3 text-xs leading-relaxed text-slate-300">
                  <div className="flex justify-between">
                    <span>مبلغ السند المطلوب:</span>
                    <span className="font-mono font-bold text-white text-sm" style={{ direction: 'ltr' }}>
                      {formatNumberWithLatinDigits(amount)} SAR
                    </span>
                  </div>

                  <div className="flex justify-between text-brand-turquoise font-bold">
                    <span>إجمالي المبالغ الموزعة:</span>
                    <span className="font-mono font-bold text-sm" style={{ direction: 'ltr' }}>
                      {formatNumberWithLatinDigits(totalAllocated)} SAR
                    </span>
                  </div>

                  <div className="border-t border-white/10 pt-3 mt-2 flex justify-between font-semibold items-center">
                    <span>الفرق / معلق التوزيع:</span>
                    {Math.abs(totalAllocated - parseFloat(toEnglishDigits(amount) || '0')) < 0.05 ? (
                      <span className="font-medium text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        موزع بالكامل
                      </span>
                    ) : (
                      <span className="font-mono text-xs font-medium text-amber-400" style={{ direction: 'ltr' }}>
                        {formatNumberWithLatinDigits(parseFloat(toEnglishDigits(amount) || '0') - totalAllocated)} SAR
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-white/5 rounded-xl p-3 text-[10px] leading-relaxed text-slate-350 space-y-1">
                  <span className="font-bold text-white block">حسابات الترحيل والتسوية:</span>
                  <p>• مدين: {paymentMethod === 'cash' ? 'حساب الصندوق النقد' : 'حساب البنك / المدى'}</p>
                  <p>• دائن: حساب ذمم مدين العميل ({formatNumberWithLatinDigits(amount)})</p>
                  <span className="text-[8px] text-amber-400 block pt-1 leading-normal">
                    * يتم معالجة القيود آلياً عند الاعتماد، وتقفيل جزئيات فواتير المبيعات الملحقة.
                  </span>
                </div>
              </div>

            </div>

          </div>

        </form>
      )}

      {/* VIEW: SHOW DETAILED RECEIPT AND ALLOCATIONS PRINT */}
      {viewState === 'view' && selectedReceipt && (
        <div className="space-y-5 animate-fade-in">
          
          {/* Header Action inside viewer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewState('list')}
                className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-500 cursor-pointer"
              >
                <ArrowRight className="w-4.5 h-4.5" />
              </button>
              <div>
                <h1 className="text-md font-bold text-slate-800 flex items-center gap-2">
                  <span>صك سند القبض: {selectedReceipt.receipt_number}</span>
                  {selectedReceipt.status === 'draft' ? (
                    <span className="px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700 text-[10px] font-semibold">مسودة تود ترحيلها</span>
                  ) : selectedReceipt.status === 'approved' ? (
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-semibold">مرحل ومطابق للقيود</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-500 text-[10px] font-semibold">ملغى ومعكوس</span>
                  )}
                </h1>
                <p className="text-[10px] text-slate-400">تاريخ السند: {formatArabicDateWithLatinDigits(selectedReceipt.receipt_date)} | وسيط الدفع: {selectedReceipt.payment_method}</p>
              </div>
            </div>

            {/* Right Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`#/print/receipt/${selectedReceipt.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition"
              >
                <Printer className="w-4 h-4" />
                <span>تحضير وطباعة السند A4</span>
              </a>

              {/* Journal Link */}
              {selectedReceipt.journal_entry_id && (
                <div className="text-[11px] bg-slate-100 text-slate-700 font-bold p-2 rounded-xl border border-slate-150 font-sans">
                  قيد المقبوضات: #{selectedReceipt.journal_entry_id.substring(0, 8)}
                </div>
              )}

              {/* Edit option if draft */}
              {selectedReceipt.status === 'draft' && (
                <button
                  onClick={() => handleStartEditReceipt(selectedReceipt)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl cursor-pointer transition flex items-center gap-1.5"
                >
                  <Edit className="w-4 h-4" />
                  <span>تعديل المسودة</span>
                </button>
              )}

              {/* Correction Copy option if approved */}
              {selectedReceipt.status === 'approved' && (
                <button
                  onClick={() => handleCreateCorrectionCopy(selectedReceipt)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl cursor-pointer transition flex items-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>إنشاء نسخة تصحيحية</span>
                </button>
              )}

              {selectedReceipt.status === 'draft' && canApproveOrCancel && (
                <button
                  onClick={() => handleApproveReceipt(selectedReceipt.id)}
                  disabled={actionLoading !== null}
                  className="px-5 py-2 bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition flex items-center gap-1.5"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  <span>اعتماد السند والتسوية</span>
                </button>
              )}

              {selectedReceipt.status === 'approved' && canApproveOrCancel && (
                <button
                  onClick={() => handleCancelReceipt(selectedReceipt.id)}
                  disabled={actionLoading !== null}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer transition flex items-center gap-1.5"
                >
                  <Ban className="w-4 h-4" />
                  <span>إلغاء السند وعكس القيد عشوائيا</span>
                </button>
              )}

              {selectedReceipt.status === 'draft' && (
                <button
                  onClick={() => handleDeleteDraftReceipt(selectedReceipt.id)}
                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl cursor-pointer"
                  title="حذف المسودة"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Printable visual voucher */}
          <div className="bg-white border border-slate-250 p-8 rounded-3xl max-w-4xl mx-auto shadow-sm space-y-6 print:m-0 print:border-0 print:p-0">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-200">
              <div className="space-y-1">
                <span className="text-brand-blue font-black tracking-widest uppercase text-xl font-sans block">LEDGRA | لِدجرا</span>
                <span className="text-slate-400 text-xs block">شركة سحابية محاسبية مرخصة لإدارة الشؤون المحاسبية</span>
                <span className="text-[10px] text-slate-500 block">منشأة رقم: {currentOrg?.name_ar}</span>
              </div>

              <div className="text-right sm:text-left mt-4 sm:mt-0 space-y-1">
                <h2 className="text-md font-extrabold text-slate-800">سند قبض واستلام نقدية</h2>
                <span className="text-xs bg-slate-100 px-3 py-1 font-bold rounded-md font-mono text-slate-700 block mt-1 select-all">
                  {selectedReceipt.receipt_number}
                </span>
                <span className="text-[10px] text-slate-400 block pt-1">رقم المقبوض الموزع:</span>
                <span className="text-sm font-black text-slate-800 font-mono" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(selectedReceipt.amount)} SAR
                </span>
              </div>
            </div>

            {/* ADRESS CONTAINER */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-100 text-xs">
              <div className="space-y-1">
                <span className="font-bold text-slate-400 block">بيانات الاستلام وخزينة الدفع:</span>
                <p className="font-extrabold text-slate-800">طريقة الاستلام: {selectedReceipt.payment_method === 'cash' ? 'صندوق النقد اليدوي' : 'حساب بنكي / بطاقة مدى إلكتروني'}</p>
                <p className="text-slate-500">تاريخ تحرير السند: {formatArabicDateWithLatinDigits(selectedReceipt.receipt_date)}</p>
                {selectedReceipt.reference && <p className="text-slate-500 font-sans">رقم العملية الشريحة: {selectedReceipt.reference}</p>}
              </div>

              <div className="space-y-1 text-right">
                <span className="font-bold text-slate-400 block pb-1 text-right">العميل المُسدِّد:</span>
                <p className="font-extrabold text-slate-800">{selectedReceipt.customer?.name}</p>
                <p className="text-slate-500">رقم الكود: {selectedReceipt.customer?.code}</p>
                <p className="text-slate-500">الرقم الضريبي المستفيد: {selectedReceipt.customer?.tax_number || 'غير متوفر'}</p>
              </div>
            </div>

            {/* DESCRIPTION LINE DETAILS */}
            <div className="space-y-3.5">
              <span className="text-xs font-bold text-slate-400 block border-b border-slate-50 pb-1">توزيع وتخصيص السند على فواتير المبيعات الصادرة</span>
              
              <div className="overflow-x-auto">
                <table className="w-full text-right divide-y divide-slate-100 text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100 text-[10px] font-bold">
                      <th className="px-3 py-2 w-10">#</th>
                      <th className="px-3 py-2">رقم فاتورة المبيعات</th>
                      <th className="px-3 py-2 font-sans">تاريخ فاتورة البيع</th>
                      <th className="px-3 py-2 text-left">قيمة الفاتورة الإجمالية</th>
                      <th className="px-3 py-2 text-left text-brand-blue">القسط المخصص سداده في هذا السند</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedReceipt.allocations?.map((al, idx) => (
                      <tr key={al.id} className="text-slate-700">
                        <td className="px-3 py-2.5 text-slate-400 font-sans">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-bold text-brand-blue font-sans">
                          {al.sales_invoice?.invoice_number}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 font-semibold font-sans">
                          {formatArabicDateWithLatinDigits(al.sales_invoice?.invoice_date)}
                        </td>
                        <td className="px-3 py-2.5 text-left font-mono" style={{ direction: 'ltr' }}>
                          {formatNumberWithLatinDigits(al.sales_invoice?.total)} SAR
                        </td>
                        <td className="px-3 py-2.5 text-left font-bold text-emerald-600 font-mono" style={{ direction: 'ltr' }}>
                          {formatNumberWithLatinDigits(al.allocated_amount)} SAR
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* DESCRIPTION FOOTER NOTE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5 border-t border-slate-100 text-xs text-slate-500">
              <div className="space-y-1">
                <span className="font-bold text-slate-600 block">شرح وتفاصيل السند:</span>
                <p className="leading-relaxed">
                  {selectedReceipt.notes || 'استلام مقبوضات مبيعات الذمم الآجلة للعميل وتصفير جزئيات من فواتير مبيعات مسجلة ومطابقة.'}
                </p>
              </div>

              <div className="text-right flex flex-col justify-end space-y-1 text-slate-700 font-semibold">
                <div className="flex justify-between border-b border-slate-200 pb-1.5 font-sans">
                  <span>إجمالي المبلغ المستلم والمقيد:</span>
                  <span className="font-bold text-base font-mono text-emerald-600" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(selectedReceipt.amount)} SAR
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 pt-1 leading-normal text-right">
                  القيود المحاسبية والأرصدة محدثة ومطابقة لنظام القيد المزدوج. تفضل بقبول فائق التقدير من لِدجرا.
                </p>
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
};
