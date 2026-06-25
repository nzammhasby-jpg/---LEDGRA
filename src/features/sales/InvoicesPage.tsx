import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { salesService, CreateInvoiceInput } from '../../lib/salesService';
import { masterDataService } from '../../lib/masterDataService';
import { accountingService } from '../../lib/accountingService';
import { zatcaService } from '../../lib/zatcaService';
import { 
  SalesInvoice, 
  Customer, 
  Item, 
  Account, 
  AccountingSettings 
} from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { 
  formatNumberWithLatinDigits, 
  formatArabicDateWithLatinDigits,
  toEnglishDigits,
  normalizeDecimalInput
} from '../../lib/formatters';
import { 
  Tag, 
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
  DollarSign,
  Briefcase,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

export const InvoicesPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Checking permissions: Owner, admin, accountant can approve/cancel; Sales can only create drafts.
  const canApproveOrCancel = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant';

  // Data State
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
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
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);

  // ZATCA state variables
  const [zatcaSettings, setZatcaSettings] = useState<any>(null);
  const [eInvoiceArtifact, setEInvoiceArtifact] = useState<any>(null);
  const [artifactLoading, setArtifactLoading] = useState<boolean>(false);
  const [generatingArtifact, setGeneratingArtifact] = useState<boolean>(false);
  const [showXmlModal, setShowXmlModal] = useState<boolean>(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // all, draft, approved, cancelled
  const [paymentFilter, setPaymentFilter] = useState<string>('all'); // all, unpaid, partially_paid, paid

  // Form State
  const [customerId, setCustomerId] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('');

  // Invoice Lines Form State
  const [lines, setLines] = useState<Array<{
    uuid: string; // client-side key
    item_id: string;
    description: string;
    quantity: number | string;
    unit_price: number | string;
    discount_amount: number | string;
    tax_rate: number;
    revenue_account_id: string;
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
      const [allInvoices, allCustomers, allItems, allAccounts, taxSettings] = await Promise.all([
        salesService.getSalesInvoices(currentOrg!.id),
        masterDataService.getCustomers(currentOrg!.id),
        masterDataService.getItems(currentOrg!.id),
        accountingService.getAccounts(currentOrg!.id),
        accountingService.getAccountingSettings(currentOrg!.id).catch(() => null)
      ]);

      setInvoices(allInvoices);
      setCustomers(allCustomers.filter(c => c.is_active));
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
      const gPrice = Number(line.unit_price) || 0;
      const gDisc = Number(line.discount_amount) || 0;
      
      const lineSubtotal = gQty * gPrice;
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

  // Selected customer helper
  const selectedCustomerInfo = customers.find(c => c.id === customerId);

  // Initialize a new draft invoice form
  const handleAddNewInvoice = useCallback(() => {
    setCustomerId('');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
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
        unit_price: '0',
        discount_amount: '0',
        tax_rate: 15.00, // standard default
        revenue_account_id: ''
      }
    ]);
    setFormError(null);
    setViewState('add');
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);

    if (params.get('action') === 'new') {
      handleAddNewInvoice();
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, navigate, handleAddNewInvoice]);

  // Handle item change in row to auto-populate descriptions, selling prices, tax rates, and suitable revenue accounts
  const handleLineItemChange = (index: number, itemId: string) => {
    const updated = [...lines];
    const item = items.find(i => i.id === itemId);

    if (item) {
      updated[index].item_id = itemId;
      updated[index].description = item.description || item.name || '';
      updated[index].unit_price = String(item.selling_price || 0);
      updated[index].tax_rate = item.tax_rate !== undefined ? item.tax_rate : 15.00;

      // Determine correct revenue account
      let revId = '';
      if (item.item_type === 'product') {
        revId = item.sales_account_id || settings?.default_sales_account_id || '';
      } else {
        revId = item.service_revenue_account_id || settings?.default_service_sales_account_id || '';
      }
      updated[index].revenue_account_id = revId;
    } else {
      updated[index].item_id = '';
      updated[index].description = '';
      updated[index].unit_price = '0';
      updated[index].tax_rate = 15.00;
      updated[index].revenue_account_id = '';
    }

    setLines(updated);
  };

  const handleUpdateLineField = (index: number, field: string, val: any) => {
    const updated = [...lines];
    updated[index] = {
      ...updated[index],
      [field]: val
    };
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
        unit_price: '0',
        discount_amount: '0',
        tax_rate: 15.00,
        revenue_account_id: ''
      }
    ]);
  };

  const removeLineRow = (index: number) => {
    if (lines.length <= 1) {
      setFormError('يجب أن تحتوي الفاتورة على بند واحد على الأقل.');
      return;
    }
    const updated = lines.filter((_, i) => i !== index);
    setLines(updated);
  };

  // Submit invoice code
  const handleSubmitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaveLoading(true);

    // Validation
    if (!customerId) {
      setFormError('يرجى اختيار عميل.');
      setSaveLoading(false);
      return;
    }

    if (lines.some(l => !l.item_id)) {
      setFormError('يرجى اختيار منتج/خدمة لكل البنود.');
      setSaveLoading(false);
      return;
    }

    if (lines.some(l => Number(l.quantity) <= 0 || Number(l.unit_price) < 0)) {
      setFormError('الكميات يجب أن تكون أكبر من صفر والأسعار موجبة.');
      setSaveLoading(false);
      return;
    }

    if (lines.some(l => !l.revenue_account_id)) {
      setFormError('يرجى تحديد حساب إيرادات لكل البنود.');
      setSaveLoading(false);
      return;
    }

    try {
      const invoicePayload: CreateInvoiceInput = {
        customer_id: customerId,
        invoice_date: invoiceDate,
        due_date: dueDate,
        notes: notes || undefined,
        lines: lines.map(l => ({
          item_id: l.item_id,
          description: l.description || undefined,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          discount_amount: Number(l.discount_amount),
          tax_rate: Number(l.tax_rate),
          revenue_account_id: l.revenue_account_id
        }))
      };

      const newId = await salesService.createSalesInvoice(currentOrg!.id, invoicePayload);
      
      // Reload invoices
      const updatedList = await salesService.getSalesInvoices(currentOrg!.id);
      setInvoices(updatedList);

      // Select newly created invoice and open viewer
      const fullInv = await salesService.getSalesInvoice(currentOrg!.id, newId);
      setSelectedInvoice(fullInv);
      setViewState('view');
    } catch (err: any) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaveLoading(false);
    }
  };

  // Action: Approve Invoice
  const handleApproveInvoice = async (invoiceId: string) => {
    if (!confirm('هل أنت متأكد من اعتماد هذه الفاتورة؟ بعد الاعتماد، سيتم توليد القيد اليومي التلقائي وإغلاق التعديل عليها.')) return;
    setActionLoading('approve');
    setError(null);
    try {
      await salesService.approveSalesInvoice(currentOrg!.id, invoiceId);
      
      // Refresh current invoice if in details view
      if (selectedInvoice && selectedInvoice.id === invoiceId) {
        const refreshed = await salesService.getSalesInvoice(currentOrg!.id, invoiceId);
        setSelectedInvoice(refreshed);
      }
      
      // Reload lists
      const updatedList = await salesService.getSalesInvoices(currentOrg!.id);
      setInvoices(updatedList);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // Action: Generate ZATCA XML and QR Artifact
  const handleGenerateEInvoiceData = async () => {
    if (!currentOrg || !selectedInvoice) return;
    setGeneratingArtifact(true);
    setError(null);
    try {
      // Fetch latest settings if not loaded
      let settingsObj = zatcaSettings;
      if (!settingsObj) {
        settingsObj = await zatcaService.getZatcaSettings(currentOrg.id);
        setZatcaSettings(settingsObj);
      }

      if (!settingsObj) {
        throw new Error('لم يتم العثور على إعدادات الفوترة الإلكترونية (ZATCA) في النظام للمنشأة. يرجى تهيئتها أولًا من لوحة الإعدادات.');
      }

      const res = await zatcaService.generateAndSaveArtifact(currentOrg.id, selectedInvoice, settingsObj);
      setEInvoiceArtifact(res.artifact);
      
      if (!res.success) {
        setError(`لم تنجح معايير الفحص الأولي للفوترة: ${res.errors.join(' | ')}`);
      }
    } catch (err: any) {
      console.error('Error generating ZATCA artifact:', err);
      setError(err.message || 'فشل توليد مستندات الفوترة الإلكترونية الضريبية.');
    } finally {
      setGeneratingArtifact(false);
    }
  };

  // Helper: Download generated XML file
  const handleDownloadXml = (xmlContent: string, invoiceNumber: string) => {
    const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoice-${invoiceNumber}-zatca.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Action: Cancel Invoice
  const handleCancelInvoice = async (invoiceId: string) => {
    if (!confirm('هل أنت متأكد من إلغاء هذه الفاتورة؟ سيتم إلغاء سريانها وعكس قيد اليومية بقيد عكسي تلقائي نظامي.')) return;
    setActionLoading('cancel');
    setError(null);
    try {
      await salesService.cancelSalesInvoice(currentOrg!.id, invoiceId);
      
      if (selectedInvoice && selectedInvoice.id === invoiceId) {
        const refreshed = await salesService.getSalesInvoice(currentOrg!.id, invoiceId);
        setSelectedInvoice(refreshed);
      }

      const updatedList = await salesService.getSalesInvoices(currentOrg!.id);
      setInvoices(updatedList);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // Action: Delete Invoice draft
  const handleDeleteDraft = async (invoiceId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه الفاتورة المسودة نهائياً؟')) return;
    setActionLoading('delete');
    setError(null);
    try {
      await salesService.deleteDraftSalesInvoice(currentOrg!.id, invoiceId);
      
      if (selectedInvoice && selectedInvoice.id === invoiceId) {
        setSelectedInvoice(null);
        setViewState('list');
      }

      const updatedList = await salesService.getSalesInvoices(currentOrg!.id);
      setInvoices(updatedList);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // View Details
  const handleShowDetails = async (invoice: SalesInvoice) => {
    setActionLoading('fetch');
    setZatcaSettings(null);
    setEInvoiceArtifact(null);
    try {
      const full = await salesService.getSalesInvoice(currentOrg!.id, invoice.id);
      setSelectedInvoice(full);
      setViewState('view');

      if (full && full.status === 'approved') {
        setArtifactLoading(true);
        try {
          const settings = await zatcaService.getZatcaSettings(currentOrg!.id);
          setZatcaSettings(settings);
          
          const art = await zatcaService.getEInvoiceArtifact(full.id);
          setEInvoiceArtifact(art);
        } catch (ae) {
          console.error('Error loading ZATCA settings/artifacts:', ae);
        } finally {
          setArtifactLoading(false);
        }
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // Filters calculation
  const filteredInvoices = invoices.filter(inv => {
    const term = searchQuery.toLowerCase().trim();
    const customerName = inv.customer?.name.toLowerCase() || '';
    const number = inv.invoice_number.toLowerCase();
    
    const matchesSearch = customerName.includes(term) || number.includes(term);
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    const matchesPayment = paymentFilter === 'all' || inv.payment_status === paymentFilter;

    return matchesSearch && matchesStatus && matchesPayment;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[500px]">
        <Loader2 className="w-8 h-8 text-brand-blue animate-spin mb-4" />
        <span className="text-sm text-slate-500 font-sans">جاري تحميل الفواتير ومطابقة السجلات...</span>
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

      {/* VIEW: INVOICES LIST */}
      {viewState === 'list' && (
        <div className="space-y-5 animate-fade-in">
          
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                <Tag className="w-5.5 h-5.5 text-brand-blue" />
                <span>فواتير المبيعات الآجلة والنقدية</span>
              </h1>
              <p className="text-xs text-slate-500">
                تسجيل، اعتماد ومتابعة فواتير مبيعات العملاء وتوليد قيود القيد المزدوج التلقائية.
              </p>
            </div>
            
            <button
              id="btn-add-invoice"
              onClick={handleAddNewInvoice}
              className="px-5 py-2.5 bg-brand-blue hover:bg-brand-blue/90 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 transition shadow-lg cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء فاتورة بيع جديدة</span>
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-100 p-4.5 rounded-2xl flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">إجمالي الفواتير الصادرة</span>
                <span className="text-sm font-bold text-slate-800 font-mono">
                  {formatNumberWithLatinDigits(invoices.reduce((acc, current) => acc + (current.status === 'approved' ? current.total : 0), 0))} <span className="text-[10px] font-sans">SAR</span>
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-100 p-4.5 rounded-2xl flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">إجمالي المبالغ المحصلة</span>
                <span className="text-sm font-bold text-slate-800 font-mono">
                  {formatNumberWithLatinDigits(invoices.reduce((acc, current) => acc + (current.status === 'approved' ? current.paid_amount : 0), 0))} <span className="text-[10px] font-sans">SAR</span>
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-100 p-4.5 rounded-2xl flex items-center gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">المستحقات غير المحصلة</span>
                <span className="text-sm font-bold text-rose-600 font-mono">
                  {formatNumberWithLatinDigits(invoices.reduce((acc, current) => acc + (current.status === 'approved' ? current.balance_due : 0), 0))} <span className="text-[10px] font-sans font-bold">SAR</span>
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-100 p-4.5 rounded-2xl flex items-center gap-4">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">مسودات معلقة</span>
                <span className="text-sm font-semibold text-purple-600 font-mono flex items-center gap-1.5">
                  {invoices.filter(i => i.status === 'draft').length} مسودات
                </span>
              </div>
            </div>
          </div>

          {/* Filters Section */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:max-w-md">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بواسطة اسم العميل، رقم الفاتورة..."
                className="w-full pl-3 pr-10 py-2 bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue rounded-xl text-xs font-medium text-slate-700 transition"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-2.75" />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-1.5 shrink-0 text-xs">
                <span className="text-slate-400">حالة الفاتورة:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 focus:outline-none text-[11px]"
                >
                  <option value="all">كل الحالات</option>
                  <option value="draft">مسودة</option>
                  <option value="approved">معتمدة</option>
                  <option value="cancelled">ملغاة</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 text-xs">
                <span className="text-slate-400">حالة الدفع:</span>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 focus:outline-none text-[11px]"
                >
                  <option value="all">كل حالات السداد</option>
                  <option value="unpaid">غير مدفوعة</option>
                  <option value="partially_paid">مدفوعة جزئياً</option>
                  <option value="paid">مدفوعة بالكامل</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3.5">تاريخ الفاتورة</th>
                    <th className="px-5 py-3.5">الرقم المرجعي</th>
                    <th className="px-5 py-3.5">العميل</th>
                    <th className="px-5 py-3.5 text-left">قيمة الفاتورة</th>
                    <th className="px-5 py-3.5 text-left">المسدد</th>
                    <th className="px-5 py-3.5 text-left">المتبقي</th>
                    <th className="px-5 py-3.5 text-center">حالة الصلاحية</th>
                    <th className="px-5 py-3.5 text-center">حالة السداد</th>
                    <th className="px-5 py-3.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-10 text-slate-400">
                        لا توجد فواتير مطابقة للبحث حالياً.
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/50 transition">
                        <td className="px-5 py-3 text-slate-500 font-medium font-sans">
                          {formatArabicDateWithLatinDigits(inv.invoice_date)}
                        </td>
                        <td className="px-5 py-3 font-semibold text-brand-blue font-sans">
                          {inv.invoice_number}
                        </td>
                        <td className="px-5 py-3 text-slate-700 font-bold">
                          {inv.customer?.name}
                        </td>
                        <td className="px-5 py-3 text-left font-bold font-mono" style={{ direction: 'ltr' }}>
                          {formatNumberWithLatinDigits(inv.total)}
                        </td>
                        <td className="px-5 py-3 text-left font-semibold text-emerald-600 font-mono" style={{ direction: 'ltr' }}>
                          {formatNumberWithLatinDigits(inv.paid_amount)}
                        </td>
                        <td className="px-5 py-3 text-left font-bold text-slate-700 font-mono" style={{ direction: 'ltr' }}>
                          {formatNumberWithLatinDigits(inv.balance_due)}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {inv.status === 'draft' ? (
                            <span className="inline-flex px-2 py-1 rounded-lg bg-purple-50 text-purple-700 text-[10px] font-bold">مسودة</span>
                          ) : inv.status === 'approved' ? (
                            <span className="inline-flex px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-bold">معتمدة سحابياً</span>
                          ) : (
                            <span className="inline-flex px-2 py-1 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold">ملغاة وعكسية</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {inv.status === 'cancelled' ? (
                            <span className="text-slate-400">—</span>
                          ) : inv.payment_status === 'unpaid' ? (
                            <span className="inline-flex px-2 py-1 rounded-lg bg-rose-50 text-rose-700 text-[10px] font-bold">غير مدفوعة</span>
                          ) : inv.payment_status === 'partially_paid' ? (
                            <span className="inline-flex px-2 py-1 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-bold">مدفوعة جزئياً</span>
                          ) : (
                            <span className="inline-flex px-1.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-bold">مدفوعة بالكامل</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleShowDetails(inv)}
                              className="p-1 px-1.5 text-slate-600 hover:bg-slate-100 rounded transition flex items-center gap-1 text-[10px] font-semibold cursor-pointer"
                              title="عرض التفاصيل"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>التفاصيل</span>
                            </button>

                            <a
                              href={`#/print/sales-invoice/${inv.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 px-1.5 text-slate-600 hover:bg-slate-100 rounded transition flex items-center gap-1 text-[10px] font-semibold cursor-pointer"
                              title="طباعة الفاتورة الضريبية"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>طباعة A4</span>
                            </a>

                            {/* Approve option if draft */}
                            {inv.status === 'draft' && canApproveOrCancel && (
                              <button
                                onClick={() => handleApproveInvoice(inv.id)}
                                disabled={actionLoading !== null}
                                className="p-1 px-1.5 bg-brand-blue/10 hover:bg-brand-blue/20 text-brand-blue rounded transition flex items-center gap-1 text-[10px] font-semibold cursor-pointer"
                                title="اعتماد الفاتورة المحاسبية"
                              >
                                <ClipboardCheck className="w-3.5 h-3.5" />
                                <span>اعتماد</span>
                              </button>
                            )}

                            {/* Cancel option if approved & unpaid */}
                            {inv.status === 'approved' && inv.paid_amount === 0 && canApproveOrCancel && (
                              <button
                                onClick={() => handleCancelInvoice(inv.id)}
                                disabled={actionLoading !== null}
                                className="p-1 px-1.5 text-red-600 hover:bg-red-50 rounded transition flex items-center gap-1 text-[10px] font-semibold cursor-pointer"
                                title="إلغاء وعكس قيد اليومية"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>إلغاء القيد</span>
                              </button>
                            )}

                            {/* Delete Option if draft */}
                            {inv.status === 'draft' && (
                              <button
                                onClick={() => handleDeleteDraft(inv.id)}
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

      {/* VIEW: ADD INVOICE DIRECT FORM */}
      {viewState === 'add' && (
        <form onSubmit={handleSubmitInvoice} className="space-y-6 animate-fade-in">
          
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
                <h1 className="text-md font-bold text-slate-800">إنشاء فاتورة مبيعات جديدة (مسودة)</h1>
                <p className="text-[10px] text-slate-400">قم بتسجيل تفاصيل الفاتورة لتوليد القيد المحاسبي بعد الاعتماد.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewState('list')}
                className="px-4 py-2 border border-slate-200 text-slate-500 text-xs font-semibold rounded-xl hover:bg-slate-50 cursor-pointer transition"
              >
                إلغاء التغييرات
              </button>
              <button
                type="submit"
                disabled={saveLoading}
                className="px-5 py-22 bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold rounded-xl shadow-lg cursor-pointer transition flex items-center justify-center gap-2"
              >
                {saveLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>حفظ مسودة الفاتورة</span>
              </button>
            </div>
          </div>

          {formError && (
            <div className="bg-amber-50 text-amber-800 p-4 rounded-xl flex items-start gap-3 border border-amber-100 text-xs font-semibold leading-relaxed">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
              <div>{formError}</div>
            </div>
          )}

          {/* Form Layout: 2 Cols */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Main Form Fields */}
            <div className="lg:col-span-2 space-y-6">
              
              <div className="bg-white border border-slate-100 p-5 rounded-2xl space-y-4">
                <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider border-b border-slate-50 pb-2">التفاصيل الأساسية للأطراف والمواعيد</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Customer selection */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400">العميل المستفيد *</label>
                    <select
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-blue rounded-xl text-xs font-semibold text-slate-700"
                    >
                      <option value="">-- اختر العميل --</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.code} - {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Invoice Date */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400">تاريخ الإصدار *</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(toEnglishDigits(e.target.value))}
                        required
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-blue rounded-xl text-xs font-semibold text-slate-700 font-sans"
                      />
                      <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                    </div>
                  </div>

                  {/* Due Date */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400">تاريخ الاستحقاق *</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(toEnglishDigits(e.target.value))}
                        required
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-blue rounded-xl text-xs font-semibold text-slate-700 font-sans"
                      />
                      <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400">ملاحظات وشروط البيع</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="سيتم إدراج الملاحظات كشروط دفع أو تفاصيل سداد في صك الفاتورة المعتمد..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-blue focus:border-brand-blue rounded-xl text-xs font-medium text-slate-700"
                  />
                </div>
              </div>

              {/* Invoice Lines Grid */}
              <div className="bg-white border border-slate-100 p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                  <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">الأصناف المبيعة والخدمات</h3>
                  <button
                    type="button"
                    onClick={addLineRow}
                    className="p-1 px-2.5 text-brand-blue hover:bg-brand-blue/5 rounded-xl border border-brand-blue/15 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة بند جديد</span>
                  </button>
                </div>

                {/* Lines Rows */}
                <div className="space-y-3.5">
                  {lines.map((line, index) => (
                    <div key={line.uuid} className="bg-slate-50/50 p-4.5 rounded-xl border border-slate-100 space-y-3">
                      
                      {/* Row Inputs Panel */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        {/* Selected Item */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400">الصنف / الخدمة *</label>
                          <select
                            value={line.item_id}
                            onChange={(e) => handleLineItemChange(index, e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:outline-none focus:border-brand-blue rounded-lg text-xs font-semibold text-slate-700"
                          >
                            <option value="">-- اختر الصنف --</option>
                            {items.map(it => (
                              <option key={it.id} value={it.id}>
                                [{it.item_type === 'product' ? 'منتج' : 'خدمة'}] {it.code} - {it.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Description */}
                        <div className="col-span-1 md:col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400">الوصف التفصيلي للبند</label>
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) => handleUpdateLineField(index, 'description', e.target.value)}
                            placeholder="وصف البند في الفاتورة..."
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:outline-none focus:border-brand-blue rounded-lg text-xs font-medium text-slate-700"
                          />
                        </div>

                        {/* Revenue Account selection */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400">حساب الإيرادات المباشر *</label>
                          <select
                            value={line.revenue_account_id}
                            onChange={(e) => handleUpdateLineField(index, 'revenue_account_id', e.target.value)}
                            required
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:outline-none focus:border-brand-blue rounded-lg text-xs font-semibold text-slate-700"
                          >
                            <option value="">-- اختر الحساب --</option>
                            {accounts.filter(a => a.classification === 'revenue').map(acc => (
                              <option key={acc.id} value={acc.id}>
                                {acc.code} - {acc.name_ar}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Calculations Panel */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-1 border-t border-slate-100/60 items-end">
                        {/* Quantity */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400">الكمية *</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={line.quantity}
                            onChange={(e) => handleUpdateLineField(index, 'quantity', normalizeDecimalInput(e.target.value))}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:outline-none focus:border-brand-blue rounded-lg text-xs font-bold text-slate-700 text-left font-sans"
                          />
                        </div>

                        {/* Unit price */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400">سعر الوحدة *</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={line.unit_price}
                            onChange={(e) => handleUpdateLineField(index, 'unit_price', normalizeDecimalInput(e.target.value))}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:outline-none focus:border-brand-blue rounded-lg text-xs font-bold text-slate-700 text-left font-sans"
                          />
                        </div>

                        {/* Discount */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400">قيمة الخصم</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={line.discount_amount}
                            onChange={(e) => handleUpdateLineField(index, 'discount_amount', normalizeDecimalInput(e.target.value))}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:outline-none focus:border-brand-blue rounded-lg text-xs font-bold text-slate-700 text-left font-sans"
                          />
                        </div>

                        {/* Tax rate */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400">نسبة الضريبة (%)</label>
                          <select
                            value={line.tax_rate}
                            onChange={(e) => handleUpdateLineField(index, 'tax_rate', Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:outline-none focus:border-brand-blue rounded-lg text-xs font-bold text-slate-750"
                          >
                            <option value="15">15% ضريبة شاملة</option>
                            <option value="5">5% ضريبة صغرى</option>
                            <option value="0">0% معفى</option>
                          </select>
                        </div>

                        {/* Actions & total */}
                        <div className="flex items-center justify-between gap-3 bg-white/70 px-2 py-1.5 rounded-lg border border-slate-150 h-8.5">
                          <div className="text-left">
                            <span className="text-[9px] text-slate-400 block font-normal leading-none mb-0.5">الصافي شامل</span>
                            <span className="text-xs font-extrabold text-slate-700 font-mono tracking-tight" style={{ direction: 'ltr' }}>
                              {formatNumberWithLatinDigits(
                                Math.max(0, (line.quantity * line.unit_price) - line.discount_amount) * (1 + line.tax_rate / 100)
                              )}
                            </span>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => removeLineRow(index)}
                            className="p-1 hover:bg-red-50 text-red-500 hover:text-red-700 rounded-md transition cursor-pointer"
                            title="إزالة هذا البند"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                      </div>
                    </div>
                  ))}
                </div>

              </div>

            </div>

            {/* Right Panel: Customer Financial status summary and calculations */}
            <div className="space-y-6">
              
              {/* Customer Status Summary CARD */}
              <div className="bg-white border border-slate-100 p-5 rounded-2xl space-y-4">
                <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider border-b border-slate-50 pb-2 flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-slate-400" />
                  <span>الوضعية المالية للعميل المختار</span>
                </h3>

                {selectedCustomerInfo ? (
                  <div className="space-y-3.5 leading-relaxed">
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">كود العميل:</span>
                        <span className="font-bold text-slate-800 font-sans">{selectedCustomerInfo.code}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">الاسم الكامل:</span>
                        <span className="font-bold text-slate-800 text-right">{selectedCustomerInfo.name}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">الرقم الضريبي العميل:</span>
                        <span className="font-bold text-slate-800 font-mono text-[11px]">{selectedCustomerInfo.tax_number || 'غير متوفر'}</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-slate-400">حساب الذمة المدين:</span>
                        <span className="text-brand-blue font-bold text-[11px]">
                          {selectedCustomerInfo.receivable_account?.code} - {selectedCustomerInfo.receivable_account?.name_ar}
                        </span>
                      </div>
                      <div className="flex items-center justify-between font-medium border-t border-slate-50 pt-2">
                        <span className="text-slate-400">الرصيد الافتتاحي:</span>
                        <span className="font-bold text-slate-800 font-mono text-[11px]" style={{ direction: 'ltr' }}>
                          {formatNumberWithLatinDigits(selectedCustomerInfo.opening_balance)} {selectedCustomerInfo.opening_balance_type === 'debit' ? 'مدين' : 'دائن'}
                        </span>
                      </div>
                      
                      <div className="bg-rose-50/40 p-3 rounded-xl border border-rose-100/60 mt-1">
                        <span className="text-[10px] text-rose-500 font-bold block mb-1">الرتبة والسياسة الائتمانية:</span>
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                          هذا المستفيد مصنف تحت بند {selectedCustomerInfo.customer_type === 'company' ? 'الشركات التجارية' : 'الأفراد ودرجة التجزئة'}. يحظر الحفظ إن كان الحساب المحاسبي غير قادر على استقبال قيود محاسبية أو معطل.
                        </p>
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                    <AlertCircle className="w-5 h-5 text-slate-300" />
                    <span>قم باختيار عميل من اليمين لمشاهدة الموقف المالي وحساب الذمم ذو العلاقة.</span>
                  </div>
                )}
              </div>

              {/* Real-time calculated Invoice Invoice subtotal and sums */}
              <div className="bg-slate-900 text-white p-5 rounded-2xl relative overflow-hidden shadow-xl space-y-4">
                {/* Glow decor */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-turquoise/10 rounded-full blur-2xl" />

                <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider border-b border-white/10 pb-2">ملخص واحتساب الفاتورة الإجمالي</h3>
                
                <div className="space-y-2.5 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>مجموع البنود الإجمالي:</span>
                    <span className="font-mono font-semibold" style={{ direction: 'ltr' }}>{formatNumberWithLatinDigits(subtotal)} SAR</span>
                  </div>
                  <div className="flex items-center justify-between text-rose-400">
                    <span>إجمالي الخصومات المدرجة:</span>
                    <span className="font-mono font-semibold" style={{ direction: 'ltr' }}>- {formatNumberWithLatinDigits(discountTotal)} SAR</span>
                  </div>
                  <div className="flex items-center justify-between text-brand-turquoise">
                    <span>الوعاء الضريبي المطبق:</span>
                    <span className="font-mono font-semibold" style={{ direction: 'ltr' }}>{formatNumberWithLatinDigits(subtotal - discountTotal)} SAR</span>
                  </div>
                  <div className="flex items-center justify-between text-amber-400">
                    <span>مجموع الضريبة المضافة (15%):</span>
                    <span className="font-mono font-semibold" style={{ direction: 'ltr' }}>+ {formatNumberWithLatinDigits(taxTotal)} SAR</span>
                  </div>
                  
                  <div className="border-t border-white/10 pt-3.5 mt-2 flex items-center justify-between text-sm font-extrabold text-white">
                    <span>الصافي النهائي المستحق:</span>
                    <span className="text-lg font-mono font-extrabold text-brand-turquoise" style={{ direction: 'ltr' }}>
                      {formatNumberWithLatinDigits(total)} SAR
                    </span>
                  </div>
                </div>

                <div className="bg-white/5 rounded-xl p-3 text-[10px] leading-relaxed text-slate-300 space-y-1">
                  <span className="font-bold text-white block">حسابات الترحيل عند الاعتماد:</span>
                  <p>• القيد: مدين ذمم عملاء ({formatNumberWithLatinDigits(total)})</p>
                  <p>• القيد: دائن المبيعات والخدمات ({formatNumberWithLatinDigits(subtotal - discountTotal)})</p>
                  <p>• القيد: دائن حساب مصلحة الضرائب والمستحقات ({formatNumberWithLatinDigits(taxTotal)})</p>
                </div>
              </div>

            </div>

          </div>

        </form>
      )}

      {/* VIEW: SHOW DETAILED INVOICE & PRINT PREVIEW */}
      {viewState === 'view' && selectedInvoice && (
        <div className="space-y-5 animate-fade-in">
          
          {/* Header Actions bar for Viewer */}
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
                  <span>تفاصيل الفاتورة المحاسبية: {selectedInvoice.invoice_number}</span>
                  {selectedInvoice.status === 'draft' ? (
                    <span className="px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700 text-[10px] font-semibold">مسودة معلقة</span>
                  ) : selectedInvoice.status === 'approved' ? (
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-semibold">معتمدة ومرحلة للقيد اليومي</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-600 text-[10px] font-semibold">ملغاة ومعكوسة</span>
                  )}
                </h1>
                <p className="text-[10px] text-slate-400">تاريخ الإصدار: {formatArabicDateWithLatinDigits(selectedInvoice.invoice_date)} | مستحق بحلول: {formatArabicDateWithLatinDigits(selectedInvoice.due_date)}</p>
              </div>
            </div>

            {/* Quick action buttons inside viewer */}
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`#/print/sales-invoice/${selectedInvoice.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition"
              >
                <Printer className="w-4 h-4" />
                <span>تحضير وطباعة الفاتورة الضريبية A4</span>
              </a>

              {/* Show entry link if approved */}
              {selectedInvoice.journal_entry_id && (
                <div className="text-[11px] bg-slate-100 text-slate-700 font-bold p-2 rounded-xl border border-slate-150 font-sans">
                  قيد اليومية الصادر: #{selectedInvoice.journal_entry_id.substring(0, 8)}
                </div>
              )}

              {/* Approved/Reversed Status messages inside header */}
              {selectedInvoice.status === 'draft' && canApproveOrCancel && (
                <button
                  onClick={() => handleApproveInvoice(selectedInvoice.id)}
                  disabled={actionLoading !== null}
                  className="px-5 py-2 bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition flex items-center gap-1.5"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  <span>اعتماد وترحيل القيد</span>
                </button>
              )}

              {selectedInvoice.status === 'approved' && selectedInvoice.paid_amount === 0 && canApproveOrCancel && (
                <button
                  onClick={() => handleCancelInvoice(selectedInvoice.id)}
                  disabled={actionLoading !== null}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer transition flex items-center gap-1.5"
                >
                  <Ban className="w-4 h-4" />
                  <span>إلغاء واعتماد القيد العكسي</span>
                </button>
              )}

              {selectedInvoice.status === 'draft' && (
                <button
                  onClick={() => handleDeleteDraft(selectedInvoice.id)}
                  className="p-2 text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl cursor-pointer"
                  title="حذف المسودة"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Phase 12 - ZATCA Electronic Compliance HUB */}
          {selectedInvoice.status === 'approved' && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-5 max-w-4xl mx-auto mb-6 space-y-4 shadow-sm print:hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-150 pb-3 gap-3">
                <div className="flex items-center gap-2">
                  <div className="bg-brand-blue/10 text-brand-blue p-1.5 rounded-xl">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-slate-900">جاهزية الفوترة الإلكترونية ومستندات ZATCA</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">جاهزية أولية (QR / Base64 / UBL XML 2.1) - بدون تكامل مباشر</p>
                  </div>
                </div>
                
                {/* Status Badging */}
                <div>
                  {artifactLoading ? (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري جلب حالة الفاتورة رقمياً...</span>
                    </div>
                  ) : !zatcaSettings ? (
                    <span className="px-2.5 py-1 text-[10px] font-bold text-amber-700 bg-amber-50 rounded-lg border border-amber-100">
                      ⚠️ إعدادت ZATCA غير مهيأة
                    </span>
                  ) : !eInvoiceArtifact ? (
                    <span className="px-2.5 py-1 text-[10px] font-bold text-slate-500 bg-slate-100 rounded-lg border border-slate-200">
                      لم يتم توليد المستند الرقمي بعد
                    </span>
                  ) : eInvoiceArtifact.generation_status === 'xml_generated' ? (
                    <span className="px-2.5 py-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-150 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>مستند الفوترة الرقمي مكتمل</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 text-[10px] font-bold text-red-600 bg-red-50 rounded-lg border border-red-100 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>فشل جاهزية المطابقة</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Status Details / Warnings / Trigger Buttons */}
              {!zatcaSettings ? (
                <div className="text-xs text-slate-600 bg-amber-50/40 p-3 rounded-2xl border border-amber-100/50 leading-relaxed">
                  الفوترة الإلكترونية لهيئة الزكاة والدخل معطلة أو لم يتم تعبئتها بعد لهذه المنشأة. يرجى الذهاب إلى 
                  <strong className="text-brand-blue cursor-pointer" onClick={() => setViewState('list')}> صفحة الإعدادات </strong> 
                  لتفعيلها وتعبئة الرقم الضريبي، السجل التجاري وعنوان المنشأة.
                </div>
              ) : (
                <div className="space-y-3">
                  
                  {/* Successfully Generated Artifact Details */}
                  {eInvoiceArtifact?.generation_status === 'xml_generated' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="bg-white border border-slate-150 p-3.5 rounded-2xl space-y-2">
                        <span className="font-bold text-slate-500 block mb-1">بيانات الرصيد الرقمي للزكاة:</span>
                        <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600">
                          <div>
                            <span className="text-slate-400">تحليل الفاتورة:</span>
                            <p className="font-semibold text-slate-800">
                              {eInvoiceArtifact.invoice_type === 'standard' ? 'فاتورة ضريبية قياسية (B2B)' : 'فاتورة ضريبية مبسطة (B2C)'}
                            </p>
                          </div>
                          <div>
                            <span className="text-slate-400">حالة التكوين:</span>
                            <p className="font-semibold text-emerald-600">UBL 2.1 Compliant</p>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400 block">بصمة التشفير (XML SHA-256 Hash):</span>
                            <p className="font-mono text-[9px] text-slate-500 bg-slate-50 p-1 rounded-md overflow-x-auto select-all">
                              {eInvoiceArtifact.xml_hash}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400">معرف المعاملة الفرعي (UUID):</span>
                            <p className="font-mono text-[9px] text-slate-500 select-all">{selectedInvoice.id}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 justify-center">
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          تم بناء هذا المستند وتضمين مصفوفة الـ TLV الـ Base64 التلقائية داخل رمز الـ QR بصفحة الطباعة الرسمية أدناه. المستند جاهز للأرشفة والمصادقة الداخلية.
                        </p>
                        
                        <div className="flex flex-wrap gap-2 pt-1 font-sans">
                          {eInvoiceArtifact.xml_content && (roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant') && (
                            <>
                              <button
                                onClick={() => handleDownloadXml(eInvoiceArtifact.xml_content, selectedInvoice.invoice_number)}
                                className="px-3.5 py-1.75 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-[10px] flex items-center gap-1 cursor-pointer transition shrink-0"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>تحميل ملف XML المعتمد</span>
                              </button>

                              <button
                                onClick={() => setShowXmlModal(true)}
                                className="px-3.5 py-1.75 bg-slate-100 hover:bg-slate-200 border border-slate-250 text-slate-700 font-bold rounded-xl text-[10px] flex items-center gap-1 cursor-pointer transition shrink-0"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>معاينة كود الـ XML</span>
                              </button>
                            </>
                          )}

                          {(roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant') && (
                            <button
                              disabled={generatingArtifact}
                              onClick={handleGenerateEInvoiceData}
                              className="px-3.5 py-1.75 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-[10px] flex items-center gap-1 cursor-pointer transition shrink-0"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${generatingArtifact ? 'animate-spin' : ''}`} />
                              <span>إعادة توليد وتحديث</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : eInvoiceArtifact?.generation_status === 'invalid' ? (
                    <div className="bg-red-50/50 border border-red-100 rounded-2xl p-4 space-y-3">
                      <div className="flex items-start gap-2 text-xs text-red-900 leading-normal font-sans">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-extrabold block mb-1">فشل فحص الجاهزية الإلكترونية:</strong>
                          <ul className="list-disc pr-4 space-y-1 text-red-800 text-[11px]">
                            {eInvoiceArtifact.validation_errors && eInvoiceArtifact.validation_errors.map((msg: string, i: number) => (
                              <li key={i}>{msg}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      
                      {(roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant') && (
                        <div className="flex justify-end border-t border-red-100/50 pt-2.5">
                          <button
                            disabled={generatingArtifact}
                            onClick={handleGenerateEInvoiceData}
                            className="bg-brand-blue text-white px-4 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
                          >
                            {generatingArtifact ? (
                              <Loader2 className="w-3 h-3 animate-spin text-white" />
                            ) : (
                              <RefreshCw className="w-3" />
                            )}
                            <span>تحديث وإعادة الفحص والمطابقة</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white border border-slate-150 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                      <p className="text-slate-500 leading-relaxed text-[11px] max-w-[500px]">
                        لم يتم توليد سجل الأرشفة الإلكتروني (XML / QR) من قواعد لِدجرا لهذه الفاتورة بعد. سنقوم بفحص الحقول وتوليد بنية الفوترة الضريبية وحفظها في محفظة البيانات بمجرد النقر على الزر.
                      </p>
                      
                      {(roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant') ? (
                        <button
                          disabled={generatingArtifact}
                          onClick={handleGenerateEInvoiceData}
                          className="bg-brand-blue hover:brightness-95 text-white font-bold text-[10.5px] px-4 py-2 rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer transition shadow-md shadow-brand-blue/10"
                        >
                          {generatingArtifact ? (
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                          ) : (
                            <ShieldCheck className="w-4 h-4" />
                          )}
                          <span>توليد بيانات الفوترة الإلكترونية</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
                          يرجى التواصل مع مسؤول النظام لتوليد الفوترة الإلكترونية.
                        </span>
                      )}
                    </div>
                  )}

                </div>
              )}

            </div>
          )}

          {/* Full print invoice card template */}
          <div className="bg-white border border-slate-250 p-8 rounded-3xl max-w-4xl mx-auto shadow-sm space-y-6 print:m-0 print:border-0 print:p-0">
            
            {/* INVOICE BANNER */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-200">
              <div className="space-y-1">
                <span className="text-brand-blue font-black tracking-widest uppercase text-xl font-sans block">LEDGRA | لِدجرا</span>
                <span className="text-slate-400 text-xs block">أنظمة المحاسبة والمالية لإدارة المشاريع SaaS</span>
                <span className="text-[11px] text-slate-500 block">رقم السجل التجاري: {currentOrg?.cr_number || 'منشأة مسجلة'}</span>
                <span className="text-[11px] text-slate-500 block">الرقم الضريبي للمنشأة: {currentOrg?.vat_number || 'غير مسجل ضريبياً'}</span>
              </div>

              <div className="text-right sm:text-left mt-4 sm:mt-0 space-y-1">
                <h2 className="text-md font-extrabold text-slate-800">فاتورة مبيعات بيع ضريبية</h2>
                <span className="text-xs bg-slate-100 px-3 py-1 font-bold rounded-md font-mono text-slate-700 block mt-1 select-all">
                  {selectedInvoice.invoice_number}
                </span>
                <span className="text-[10px] text-slate-400 block pt-1">الرصيد المتبقي: </span>
                <span className="text-sm font-extrabold text-rose-600 font-mono" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(selectedInvoice.balance_due)} SAR
                </span>
              </div>
            </div>

            {/* ADRESSES INFO */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-100">
              <div className="space-y-1 text-xs">
                <span className="font-bold text-slate-400 block border-b border-slate-50 pb-1 mb-1">بيانات المورد (المنشأة المصدرة):</span>
                <p className="font-extrabold text-slate-800">{currentOrg?.name_ar}</p>
                <p className="text-slate-500">{currentOrg?.city || 'المملكة العربية السعودية'}</p>
                <p className="text-slate-500">جوال المنشأة: {currentOrg?.phone || 'مؤمن سحابياً'}</p>
                <p className="text-slate-500">البريد الإلكتروني: {currentOrg?.email || 'sales@ledgra.sa'}</p>
              </div>

              <div className="space-y-1 text-xs text-right sm:text-right">
                <span className="font-bold text-slate-400 block border-b border-slate-50 pb-1 mb-1 text-right">بيانات العميل المستفيد:</span>
                <p className="font-extrabold text-slate-800">{selectedInvoice.customer?.name}</p>
                <p className="text-slate-500">رقم العميل: {selectedInvoice.customer?.code}</p>
                <p className="text-slate-500">العنوان: {selectedInvoice.customer?.city || 'غير متوفر'}, {selectedInvoice.customer?.address || 'غير متوفر'}</p>
                <p className="text-slate-500">الهاتف والجوال: {selectedInvoice.customer?.phone || selectedInvoice.customer?.mobile || 'غير متوفر'}</p>
                <p className="text-slate-500">الرقم الضريبي المستفيد: {selectedInvoice.customer?.tax_number || 'لا يوجد'}</p>
              </div>
            </div>

            {/* METRICS OF ISSUANCE */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4.5 bg-slate-50 rounded-2xl">
              <div>
                <span className="text-[10px] text-slate-400 block">تاريخ الفاتورة:</span>
                <span className="text-xs font-bold text-slate-800 font-mono">{formatArabicDateWithLatinDigits(selectedInvoice.invoice_date)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">تاريخ الاستحقاق:</span>
                <span className="text-xs font-bold text-slate-800 font-mono">{formatArabicDateWithLatinDigits(selectedInvoice.due_date)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">حالة السداد الحالية:</span>
                <span className="text-xs font-bold text-brand-blue">
                  {selectedInvoice.payment_status === 'unpaid' ? 'غير مسددة' : selectedInvoice.payment_status === 'partially_paid' ? 'مسددة جزئياً' : 'مسددة بالكامل'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">إجمالي الفاتورة شامل الضريبة:</span>
                <span className="text-xs font-black text-slate-900 font-mono" style={{ direction: 'ltr' }}>
                  {formatNumberWithLatinDigits(selectedInvoice.total)} SAR
                </span>
              </div>
            </div>

            {/* LINES LIST */}
            <div className="space-y-4">
              <span className="text-xs font-bold text-slate-400 block border-b border-slate-50 pb-1">البنود والخدمات في الفاتورة</span>
              <div className="overflow-x-auto">
                <table className="w-full text-right divide-y divide-slate-100 text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100 text-[10px] font-bold">
                      <th className="px-3 py-2 w-10">#</th>
                      <th className="px-3 py-2">الصنف / الوصف</th>
                      <th className="px-3 py-2 text-center w-16">الكمية</th>
                      <th className="px-3 py-2 text-left w-24">سعر الوحدة</th>
                      <th className="px-3 py-2 text-left w-20">الخصم</th>
                      <th className="px-3 py-2 text-center w-20">الضريبة (%)</th>
                      <th className="px-3 py-2 text-left w-28">الصافي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedInvoice.lines?.map((ln, idx) => (
                      <tr key={ln.id} className="text-slate-705">
                        <td className="px-3 py-2.5 text-slate-400 font-sans">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800">
                          {ln.description || ln.item?.name}
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold font-mono">{ln.quantity}</td>
                        <td className="px-3 py-2.5 text-left font-mono" style={{ direction: 'ltr' }}>{formatNumberWithLatinDigits(ln.unit_price)}</td>
                        <td className="px-3 py-2.5 text-left font-semibold text-red-500 font-mono" style={{ direction: 'ltr' }}>
                          {ln.discount_amount > 0 ? `-${formatNumberWithLatinDigits(ln.discount_amount)}` : '0.00'}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono">{ln.tax_rate}%</td>
                        <td className="px-3 py-2.5 text-left font-bold text-slate-800 font-mono" style={{ direction: 'ltr' }}>
                          {formatNumberWithLatinDigits(ln.line_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PRINT FOOTER / CALCULATIONS TOTAL */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5 border-t border-slate-200">
              
              {/* Left Column note details */}
              <div className="text-xs text-slate-500 space-y-2">
                <span className="font-bold text-slate-600 block">شروط وأحكام:</span>
                <p className="leading-relaxed">
                  {selectedInvoice.notes || 'لا توجد شروط خاصة على هذه المبيعات. يرجى السداد في غضون الفترة المحددة المتفق عليها لتفادي الغرامات المالية.'}
                </p>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 mt-2 text-[10px] leading-relaxed text-slate-400">
                  تم توليد هذا الصك بطريقة نظامية مشفرة بـ LEDGRA l لِدجرا. القيود الناتجة والترسانة الحسابية خاضعة لقواعد حماية البيانات الرقابية.
                </div>
              </div>

              {/* Right Column computations */}
              <div className="text-xs space-y-2 text-slate-600">
                <div className="flex justify-between">
                  <span>المجموع الفرعي للبضائع:</span>
                  <span className="font-mono font-semibold" style={{ direction: 'ltr' }}>{formatNumberWithLatinDigits(selectedInvoice.subtotal)} SAR</span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>الخصم المسموح به:</span>
                  <span className="font-mono font-semibold" style={{ direction: 'ltr' }}>- {formatNumberWithLatinDigits(selectedInvoice.discount_total)} SAR</span>
                </div>
                <div className="flex justify-between font-bold text-slate-800 border-t border-slate-50 pt-1">
                  <span>الوعاء الخاضع للضريبة:</span>
                  <span className="font-mono" style={{ direction: 'ltr' }}>{formatNumberWithLatinDigits(selectedInvoice.subtotal - selectedInvoice.discount_total)} SAR</span>
                </div>
                <div className="flex justify-between">
                  <span>الضريبة المضافة المطبقة (15%):</span>
                  <span className="font-mono font-semibold" style={{ direction: 'ltr' }}>+ {formatNumberWithLatinDigits(selectedInvoice.tax_total)} SAR</span>
                </div>
                
                <div className="flex justify-between font-extrabold border-t border-slate-200 pt-3 text-sm text-slate-900 leading-none">
                  <span>الصافي المطلوب (شامل المضافة):</span>
                  <span className="font-mono text-base text-brand-blue" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(selectedInvoice.total)} SAR
                  </span>
                </div>

                <div className="flex justify-between pt-1 border-t border-slate-50 text-xs font-semibold text-emerald-600">
                  <span>المسدد كلياً حتى الآن:</span>
                  <span className="font-mono" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(selectedInvoice.paid_amount)} SAR
                  </span>
                </div>

                <div className="flex justify-between font-black text-rose-500 pt-1 border-t border-slate-100">
                  <span>الرصيد المتبقي مستحق السداد:</span>
                  <span className="font-mono" style={{ direction: 'ltr' }}>
                    {formatNumberWithLatinDigits(selectedInvoice.balance_due)} SAR
                  </span>
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* ZATCA XML Preview Modal overlay Dialog */}
      {showXmlModal && eInvoiceArtifact?.xml_content && (roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant') && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" dir="rtl">
          <div className="bg-white rounded-3xl w-full max-w-4xl p-6 space-y-4 shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="bg-brand-blue/10 text-brand-blue p-1.5 rounded-xl">
                  <ShieldCheck className="w-5 h-5 text-brand-blue" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800">معاينة مستند XML الفاتورة الإلكترونية المعتمدة (UBL 2.1)</h3>
                  <p className="text-[10px] text-slate-400">بصمة المستند SHA-256 الخاضعة لمراجعة مطابقة هيئة الزكاة والدخل</p>
                </div>
              </div>
              <button 
                onClick={() => setShowXmlModal(false)}
                className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl">
              تنبيه: هذا الكود يعبر عن صيغة البيانات الضريبية المعتمدة لـ XML UBL 2.1 للمملكة العربية السعودية، والمدمجة داخلياً كقيمة فحص أولي (ZATCA Base Layer).
            </p>

            <div className="flex-1 overflow-auto rounded-2xl bg-slate-950 p-4 border border-slate-900 text-left" style={{ direction: 'ltr' }}>
              <pre className="font-mono text-[10px] text-emerald-400 whitespace-pre overflow-x-auto select-all">
                {eInvoiceArtifact.xml_content}
              </pre>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <span className="text-[10px] text-slate-400 font-mono">حجم الملف الرقمي: ~{(eInvoiceArtifact.xml_content.length / 1024).toFixed(2)} KB</span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDownloadXml(eInvoiceArtifact.xml_content, selectedInvoice.invoice_number)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer transition shadow-md shadow-emerald-600/10"
                >
                  <FileText className="w-4 h-4" />
                  <span>تحميل ملف الـ XML</span>
                </button>
                <button
                  onClick={() => setShowXmlModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition border border-slate-200"
                >
                  إغلاق النافذة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
