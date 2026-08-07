import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  quotationService, 
  CreateQuotationInput 
} from '../../lib/quotationService';
import { salesService } from '../../lib/salesService';
import { masterDataService } from '../../lib/masterDataService';
import { accountingService } from '../../lib/accountingService';
import { bankingService } from '../../lib/bankingService';
import { auditService } from '../../lib/auditService';
import { 
  SalesQuotation, 
  Customer, 
  Item, 
  Account, 
  InvoicePaymentMethod, 
  PaymentDetails,
  CashBankAccount
} from '../../types';
import { PaymentMethodSection } from '../../components/payment/PaymentMethodSection';
import { validatePaymentSplit } from '../../lib/paymentMethodUtils';
import { calculateTaxLine } from '../../lib/taxCalculation';
import { normalizeDecimalInput, toEnglishDigits } from '../../lib/formatters';
import { 
  Plus, 
  Search, 
  FileText, 
  Calendar, 
  User, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  ArrowRight, 
  RefreshCw, 
  Eye, 
  Edit, 
  Send, 
  ArrowRightLeft,
  AlertCircle,
  FileCheck,
  Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface LineFormState {
  uuid: string;
  item_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  tax_rate: number | string;
  revenue_account_id: string;
}

export const QuotationsPage: React.FC = () => {
  const { currentOrg, profile } = useAuth();
  const navigate = useNavigate();

  // Primary Data
  const [quotations, setQuotations] = useState<SalesQuotation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cashBankAccounts, setCashBankAccounts] = useState<CashBankAccount[]>([]);

  // State Management
  const [viewState, setViewState] = useState<'list' | 'add' | 'detail'>('list');
  const [loading, setLoading] = useState<boolean>(true);
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Active/Selected Quotation
  const [editingQuotation, setEditingQuotation] = useState<SalesQuotation | null>(null);
  const [selectedQuotation, setSelectedQuotation] = useState<SalesQuotation | null>(null);

  // Form Fields
  const [customerId, setCustomerId] = useState<string>('');
  const [quotationDate, setQuotationDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState<string>('');
  const [pricesIncludeTax, setPricesIncludeTax] = useState<boolean>(false);
  
  // Payment Method Fields
  const [paymentMethod, setPaymentMethod] = useState<InvoicePaymentMethod>('credit');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>({});

  // Form Lines State
  const [lines, setLines] = useState<LineFormState[]>([]);

  const orgDefaultTaxRate = currentOrg?.default_tax_rate ?? 15;

  // Load initial data
  const loadData = useCallback(async () => {
    if (!currentOrg?.id) return;
    setLoading(true);
    setError(null);

    try {
      const [quotesData, custsData, itemsData, accsData, cashData] = await Promise.all([
        quotationService.getSalesQuotations(currentOrg.id),
        masterDataService.getCustomers(currentOrg.id),
        masterDataService.getItems(currentOrg.id),
        accountingService.getAccounts(currentOrg.id),
        bankingService.listCashBankAccounts(currentOrg.id)
      ]);

      setQuotations(quotesData || []);
      setCustomers(custsData || []);
      setItems(itemsData || []);
      setAccounts(accsData || []);
      setCashBankAccounts(cashData || []);
    } catch (err: any) {
      console.error(err);
      setError('حدث خطأ أثناء تحميل بيانات عروض الأسعار.');
    } finally {
      setLoading(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute Totals
  const { subtotal, discountTotal, taxTotal, total } = useMemo(() => {
    let sub = 0;
    let disc = 0;
    let tax = 0;

    lines.forEach(line => {
      const lineRes = calculateTaxLine(
        {
          quantity: line.quantity,
          enteredUnitPrice: line.unit_price,
          discountAmount: line.discount_amount,
          taxRate: line.tax_rate
        },
        pricesIncludeTax
      );

      sub += lineRes.grossBeforeTax;
      disc += lineRes.discountBeforeTax;
      tax += lineRes.taxAmount;
    });

    const grandTotal = (sub - disc) + tax;
    return {
      subtotal: sub,
      discountTotal: disc,
      taxTotal: tax,
      total: grandTotal
    };
  }, [lines, pricesIncludeTax]);

  // Line operations
  const addLineRow = () => {
    const defaultRevenueAcc = accounts.find(a => a.classification === 'revenue' && a.allow_direct_posting)?.id || '';
    setLines([
      ...lines,
      {
        uuid: Math.random().toString(),
        item_id: '',
        description: '',
        quantity: '1',
        unit_price: '0',
        discount_amount: '0',
        tax_rate: orgDefaultTaxRate,
        revenue_account_id: defaultRevenueAcc
      }
    ]);
  };

  const removeLineRow = (index: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const updateLineField = (index: number, field: keyof LineFormState, value: any) => {
    const newLines = [...lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setLines(newLines);
  };

  const handleLineItemChange = (index: number, itemId: string) => {
    const matchedItem = items.find(i => i.id === itemId);
    const defaultRevenueAcc = accounts.find(a => a.classification === 'revenue' && a.allow_direct_posting)?.id || '';

    const newLines = [...lines];
    newLines[index] = {
      ...newLines[index],
      item_id: itemId,
      description: matchedItem ? matchedItem.name : newLines[index].description,
      unit_price: matchedItem ? String(matchedItem.selling_price || 0) : newLines[index].unit_price,
      tax_rate: matchedItem?.tax_rate ?? orgDefaultTaxRate,
      revenue_account_id: matchedItem?.sales_account_id || matchedItem?.service_revenue_account_id || defaultRevenueAcc
    };
    setLines(newLines);
  };

  // Add / Edit handlers
  const handleAddNewQuotation = () => {
    setEditingQuotation(null);
    setCustomerId('');
    setQuotationDate(new Date().toISOString().split('T')[0]);
    const d = new Date();
    d.setDate(d.getDate() + 15);
    setValidUntil(d.toISOString().split('T')[0]);
    setNotes('');
    setPricesIncludeTax(false);
    setPaymentMethod('credit');
    setPaymentReference('');
    setPaymentNotes('');
    setPaymentDetails({});

    const defaultRevenueAcc = accounts.find(a => a.classification === 'revenue' && a.allow_direct_posting)?.id || '';
    setLines([
      {
        uuid: Math.random().toString(),
        item_id: '',
        description: '',
        quantity: '1',
        unit_price: '0',
        discount_amount: '0',
        tax_rate: orgDefaultTaxRate,
        revenue_account_id: defaultRevenueAcc
      }
    ]);
    setFormError(null);
    setViewState('add');
  };

  const handleStartEditQuotation = useCallback(async (quote: SalesQuotation) => {
    if (!currentOrg?.id || !quote.id) return;

    setActionLoading(`edit-${quote.id}`);
    setFormError(null);

    try {
      const fullQuote = await quotationService.getSalesQuotation(currentOrg.id, quote.id);
      if (!fullQuote) throw new Error('عرض السعر غير موجود');

      setEditingQuotation(fullQuote);
      setCustomerId(fullQuote.customer_id);
      setQuotationDate(fullQuote.quotation_date);
      setValidUntil(fullQuote.valid_until);
      setNotes(fullQuote.notes || '');
      setPricesIncludeTax(fullQuote.prices_include_tax ?? false);
      setPaymentMethod(fullQuote.payment_method || 'credit');
      setPaymentReference(fullQuote.payment_reference || '');
      setPaymentNotes(fullQuote.payment_notes || '');
      setPaymentDetails(fullQuote.payment_details || {});

      const defaultRevenueAcc = accounts.find(a => a.classification === 'revenue' && a.allow_direct_posting)?.id || '';
      setLines((fullQuote.lines || []).map(l => ({
        uuid: Math.random().toString(),
        item_id: l.item_id || '',
        description: l.description || '',
        quantity: String(l.quantity ?? 1),
        unit_price: String(l.entered_unit_price ?? l.unit_price ?? 0),
        discount_amount: String(l.discount_amount || 0),
        tax_rate: l.tax_rate ?? orgDefaultTaxRate,
        revenue_account_id: l.revenue_account_id || defaultRevenueAcc
      })));

      setViewState('add');
    } catch (err: any) {
      console.error(err);
      setError('تعذر تحميل تفاصيل عرض السعر.');
    } finally {
      setActionLoading(null);
    }
  }, [currentOrg, accounts, orgDefaultTaxRate]);

  // Save Quotation
  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!customerId) {
      setFormError('يرجى اختيار العميل.');
      return;
    }
    if (!quotationDate) {
      setFormError('تاريخ عرض السعر مطلوب.');
      return;
    }
    if (!validUntil) {
      setFormError('تاريخ انتهاء صلاحية العرض مطلوب.');
      return;
    }

    const processedLines: CreateQuotationInput['lines'] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const qty = Number(line.quantity) || 0;
      const price = Number(line.unit_price) || 0;
      const discount = Number(line.discount_amount) || 0;

      if (qty <= 0) {
        setFormError(`الكمية في البند رقم ${i + 1} يجب أن تكون أكبر من الصفر.`);
        return;
      }
      if (price < 0) {
        setFormError(`السعر في البند رقم ${i + 1} لا يمكن أن يكون سالباً.`);
        return;
      }
      if (discount < 0) {
        setFormError(`الخصم في البند رقم ${i + 1} لا يمكن أن يكون سالباً.`);
        return;
      }
      if (discount > (qty * price)) {
        setFormError(`خصم البند رقم ${i + 1} يتخطى الإجمالي الفرعي للبند.`);
        return;
      }

      const taxRate = Number(line.tax_rate);
      if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
        setFormError(`نسبة الضريبة في البند رقم ${i + 1} يجب أن تكون بين 0 و100.`);
        return;
      }

      processedLines.push({
        item_id: line.item_id || undefined,
        description: line.description || undefined,
        quantity: qty,
        unit_price: price,
        discount_amount: discount,
        tax_rate: taxRate,
        revenue_account_id: line.revenue_account_id || undefined
      });
    }

    // Validate payment split if applicable
    const splitValidation = validatePaymentSplit(paymentMethod, total, paymentDetails);
    if (!splitValidation.isValid) {
      setFormError(splitValidation.errorMsg || 'مجموع مبالغ طرق السداد يجب أن يساوي إجمالي عرض السعر.');
      return;
    }

    setSaveLoading(true);
    try {
      const input = {
        customer_id: customerId,
        quotation_date: quotationDate,
        valid_until: validUntil,
        notes: notes || undefined,
        prices_include_tax: pricesIncludeTax,
        payment_method: paymentMethod,
        payment_reference: paymentReference || undefined,
        payment_notes: paymentNotes || undefined,
        payment_details: paymentDetails,
        lines: processedLines
      };

      if (editingQuotation) {
        await quotationService.updateSalesQuotation(currentOrg!.id, editingQuotation.id, input);
        await auditService.logAction(currentOrg!.id, profile?.id || null, 'quotation_updated', {
          quotation_id: editingQuotation.id,
          quotation_number: editingQuotation.quotation_number
        });
      } else {
        await quotationService.createSalesQuotation(currentOrg!.id, input);
      }

      setViewState('list');
      setEditingQuotation(null);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'حدث خطأ أثناء حفظ عرض السعر.');
    } finally {
      setSaveLoading(false);
    }
  };

  // Update Status Action
  const handleUpdateStatus = async (quoteId: string, status: SalesQuotation['status']) => {
    if (!currentOrg?.id) return;
    setActionLoading(`status-${quoteId}-${status}`);
    try {
      await quotationService.updateQuotationStatus(currentOrg.id, quoteId, status);
      await auditService.logAction(currentOrg.id, profile?.id || null, 'quotation_status_changed', {
        quotation_id: quoteId,
        new_status: status
      });
      loadData();
      if (selectedQuotation && selectedQuotation.id === quoteId) {
        setSelectedQuotation({ ...selectedQuotation, status });
      }
    } catch (err: any) {
      alert(err.message || 'تعذر تحديث حالة عرض السعر.');
    } finally {
      setActionLoading(null);
    }
  };

  // Convert to Invoice Action
  const handleConvertToInvoice = async (quote: SalesQuotation) => {
    if (!currentOrg?.id || !quote.id) return;
    if (!window.confirm(`هل أنت متأكد من تحويل عرض السعر (${quote.quotation_number}) إلى فاتورة مبيعات مباشرة؟`)) {
      return;
    }

    setActionLoading(`convert-${quote.id}`);
    try {
      const invoiceId = await quotationService.convertQuotationToInvoice(currentOrg.id, quote.id);
      await auditService.logAction(currentOrg.id, profile?.id || null, 'quotation_converted_to_invoice', {
        quotation_id: quote.id,
        quotation_number: quote.quotation_number,
        invoice_id: invoiceId
      });
      alert('تم تحويل عرض السعر إلى فاتورة مبيعات بنجاح.');
      navigate('/sales/invoices');
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تحويل عرض السعر إلى فاتورة مبيعات.');
    } finally {
      setActionLoading(null);
    }
  };

  // Filtered list
  const filteredQuotations = useMemo(() => {
    return quotations.filter(q => {
      const matchesSearch = 
        q.quotation_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.notes?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'all' || q.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [quotations, searchTerm, statusFilter]);

  const getStatusBadge = (status: SalesQuotation['status']) => {
    switch (status) {
      case 'draft':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">مسودة</span>;
      case 'sent':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">تم الإرسال</span>;
      case 'accepted':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">مقبول</span>;
      case 'rejected':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">مرفوض</span>;
      case 'converted':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">محول لفاتورة</span>;
      case 'expired':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">منتهي الصلاحية</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">{status}</span>;
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto font-sans" dir="rtl">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-brand-blue/10 text-brand-blue rounded-2xl shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">عروض الأسعار للعملاء</h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              إصدار وإدارة عروض الأسعار التجارية وتحديد شروط وطرق السداد وتحويلها آلياً إلى فواتير مبيعات.
            </p>
          </div>
        </div>

        {viewState === 'list' && (
          <button
            onClick={handleAddNewQuotation}
            className="flex items-center justify-center gap-2 bg-brand-blue hover:bg-brand-blue/90 text-white font-bold text-xs px-5 py-3 rounded-2xl transition shadow-lg shadow-brand-blue/20 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>عرض سعر جديد</span>
          </button>
        )}

        {viewState !== 'list' && (
          <button
            onClick={() => setViewState('list')}
            className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-2xl transition cursor-pointer shrink-0"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة لقائمة عروض الأسعار</span>
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-2xl text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ==================== LIST VIEW ==================== */}
      {viewState === 'list' && (
        <div className="space-y-4">
          
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="ابحث برقم العرض، اسم العميل..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-9 pl-4 py-2.5 border border-slate-200 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
              />
            </div>

            {/* Status Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl overflow-x-auto w-full md:w-auto">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'draft', label: 'مسودة' },
                { id: 'sent', label: 'مرسل' },
                { id: 'accepted', label: 'مقبول' },
                { id: 'rejected', label: 'مرفوض' },
                { id: 'converted', label: 'محول لفاتورة' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quotations Table */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400 text-xs font-bold flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-brand-blue" />
                <span>جاري تحميل عروض الأسعار...</span>
              </div>
            ) : filteredQuotations.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs font-bold flex flex-col items-center gap-2">
                <FileText className="w-8 h-8 text-slate-300" />
                <span>لا توجد عروض أسعار مطابقة للبحث.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                      <th className="p-4">رقم العرض</th>
                      <th className="p-4">العميل</th>
                      <th className="p-4">تاريخ العرض</th>
                      <th className="p-4">صالح لغاية</th>
                      <th className="p-4">الإجمالي</th>
                      <th className="p-4">الحالة</th>
                      <th className="p-4 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredQuotations.map(quote => (
                      <tr key={quote.id} className="hover:bg-slate-50/60 transition">
                        <td className="p-4 font-mono font-bold text-slate-900">{quote.quotation_number}</td>
                        <td className="p-4 text-slate-800 font-bold">{quote.customer?.name || '—'}</td>
                        <td className="p-4 text-slate-600 font-mono">{quote.quotation_date}</td>
                        <td className="p-4 text-slate-600 font-mono">{quote.valid_until}</td>
                        <td className="p-4 font-bold font-mono text-slate-900">
                          {quote.total.toFixed(2)} {currentOrg?.currency_code || ''}
                        </td>
                        <td className="p-4">{getStatusBadge(quote.status)}</td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-1.5">
                            
                            {/* Detail View */}
                            <button
                              onClick={() => {
                                setSelectedQuotation(quote);
                                setViewState('detail');
                              }}
                              className="p-1.5 text-slate-500 hover:text-brand-blue hover:bg-slate-100 rounded-lg transition cursor-pointer"
                              title="عرض التفاصيل"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Edit (if draft or sent) */}
                            {(quote.status === 'draft' || quote.status === 'sent') && (
                              <button
                                onClick={() => handleStartEditQuotation(quote)}
                                disabled={actionLoading === `edit-${quote.id}`}
                                className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                                title="تعديل العرض"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            )}

                            {/* Convert to Invoice (if accepted or sent) */}
                            {quote.status !== 'converted' && quote.status !== 'rejected' && (
                              <button
                                onClick={() => handleConvertToInvoice(quote)}
                                disabled={actionLoading === `convert-${quote.id}`}
                                className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-[11px] rounded-lg transition flex items-center gap-1 cursor-pointer"
                                title="تحويل مباشرة إلى فاتورة مبيعات"
                              >
                                {actionLoading === `convert-${quote.id}` ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <ArrowRightLeft className="w-3.5 h-3.5" />
                                )}
                                <span>تحويل لفاتورة</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== CREATE / EDIT FORM ==================== */}
      {viewState === 'add' && (
        <form onSubmit={handleSaveQuotation} className="space-y-6">
          
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-2xl text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Customer & Header Info Card */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3">بيانات عرض السعر والعميل</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Customer Select */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">العميل *</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 bg-white"
                >
                  <option value="">— اختر العميل —</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Quotation Date */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">تاريخ عرض السعر *</label>
                <input
                  type="date"
                  value={quotationDate}
                  onChange={(e) => setQuotationDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 font-mono"
                />
              </div>

              {/* Valid Until */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">صالح لغاية *</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Line Items Card */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            
            {/* Tax Inclusive Toggle */}
            <label className="flex items-center gap-3 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 cursor-pointer hover:bg-slate-100/50 transition">
              <input
                type="checkbox"
                checked={pricesIncludeTax}
                onChange={(e) => setPricesIncludeTax(e.target.checked)}
                className="w-4 h-4 rounded text-brand-blue border-slate-300 focus:ring-brand-blue cursor-pointer"
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800 select-none">
                  السعر شامل الضريبة
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  {pricesIncludeTax 
                    ? 'السعر المدخل للوحدة شاملاً ضريبة القيمة المضافة، وسيقوم النظام باستخراج صافي السعر والضريبة آلياً.'
                    : 'السعر المدخل للوحدة قبل الضريبة، وسيقوم النظام بإضافة الضريبة بناءً على النسبة المحددة.'}
                </span>
              </div>
            </label>

            <div className="p-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">بنود عرض السعر</span>
              <button
                type="button"
                onClick={addLineRow}
                className="flex items-center gap-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-slate-500" /> إضافة بند
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                    <th className="p-3 w-1/4">الصنف / الخدمة</th>
                    <th className="p-3">الوصف</th>
                    <th className="p-3 w-20 text-center">الكمية</th>
                    <th className="p-3 w-28 text-center">{pricesIncludeTax ? 'السعر (شامل الضريبة)' : 'السعر (دون ضريبة)'}</th>
                    <th className="p-3 w-24 text-center">الخصم ({currentOrg?.currency_code || ''})</th>
                    <th className="p-3 w-20 text-center">نسبة الضريبة (%)</th>
                    <th className="p-3 w-1/4">حساب الإيراد</th>
                    <th className="p-3 text-left pl-6">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {lines.map((line, idx) => {
                    const lineRes = calculateTaxLine(
                      {
                        quantity: line.quantity,
                        enteredUnitPrice: line.unit_price,
                        discountAmount: line.discount_amount,
                        taxRate: line.tax_rate
                      },
                      pricesIncludeTax
                    );

                    return (
                      <tr key={line.uuid} className="hover:bg-slate-50/40">
                        
                        {/* Item Select */}
                        <td className="p-3">
                          <select
                            value={line.item_id}
                            onChange={(e) => handleLineItemChange(idx, e.target.value)}
                            className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white"
                          >
                            <option value="">— اختر صنفاً —</option>
                            {items.map(i => (
                              <option key={i.id} value={i.id}>{i.name}</option>
                            ))}
                          </select>
                        </td>

                        {/* Description */}
                        <td className="p-3">
                          <input
                            type="text"
                            placeholder="وصف تفصيلي"
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

                        {/* Unit Price */}
                        <td className="p-3 text-center">
                          <input
                            type="text"
                            value={line.unit_price}
                            onChange={(e) => updateLineField(idx, 'unit_price', e.target.value)}
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

                        {/* Tax Rate (Always Visible) */}
                        <td className="p-3 text-center font-mono font-bold text-slate-500">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={line.tax_rate}
                            onChange={(e) => {
                              const normalized = normalizeDecimalInput(toEnglishDigits(e.target.value));
                              if (normalized === '') {
                                updateLineField(idx, 'tax_rate', '');
                                return;
                              }
                              const parsed = Number(normalized);
                              if (Number.isFinite(parsed)) {
                                updateLineField(idx, 'tax_rate', String(Math.min(100, Math.max(0, parsed))));
                              }
                            }}
                            onBlur={() => {
                              if ((line.tax_rate as any) === '' || line.tax_rate === undefined) {
                                updateLineField(idx, 'tax_rate', String(orgDefaultTaxRate));
                              }
                            }}
                            className="w-20 p-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 text-center font-sans"
                            dir="ltr"
                          />
                        </td>

                        {/* Revenue Account */}
                        <td className="p-3">
                          <select
                            value={line.revenue_account_id}
                            onChange={(e) => updateLineField(idx, 'revenue_account_id', e.target.value)}
                            className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white"
                          >
                            <option value="">— اختر حساب الإيراد —</option>
                            {accounts.filter(a => a.classification === 'revenue' && a.allow_direct_posting).map(a => (
                              <option key={a.id} value={a.id}>{a.code} - {a.name_ar}</option>
                            ))}
                          </select>
                        </td>

                        {/* Subtotal */}
                        <td className="p-3 text-left font-mono font-bold text-slate-900 pl-4">
                          {lineRes.lineTotal.toFixed(2)}
                        </td>

                        {/* Remove Row */}
                        <td className="p-3 text-center">
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

          {/* Payment Terms & Method Section */}
          <PaymentMethodSection
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            paymentReference={paymentReference}
            setPaymentReference={setPaymentReference}
            paymentNotes={paymentNotes}
            setPaymentNotes={setPaymentNotes}
            paymentDetails={paymentDetails}
            setPaymentDetails={setPaymentDetails}
            totalAmount={total}
            cashBankAccounts={cashBankAccounts}
            isQuotation={true}
          />

          {/* Notes & Totals Layout */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Notes Field */}
            <div className="col-span-1 md:col-span-2 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
              <span className="text-xs font-bold text-slate-500 block">شروط وأحكام عرض السعر وملاحظاته</span>
              <textarea
                placeholder="أضف شروط التوريد، مدة الضمان، أو أحكام الدفع..."
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
              />
            </div>

            {/* Totals Summary */}
            <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-sm space-y-4 font-mono select-none">
              <span className="text-[10px] font-bold text-slate-400 block pb-2 border-b border-white/10 uppercase tracking-wider font-sans">
                ملخص عرض السعر
              </span>

              <div className="flex justify-between text-xs">
                <span className="font-sans text-slate-400">الإجمالي الفرعي:</span>
                <span className="font-bold">{subtotal.toFixed(2)} {currentOrg?.currency_code || ''}</span>
              </div>

              <div className="flex justify-between text-xs text-red-400">
                <span className="font-sans">إجمالي الخصومات:</span>
                <span className="font-bold">-{discountTotal.toFixed(2)} {currentOrg?.currency_code || ''}</span>
              </div>

              <div className="flex justify-between text-xs text-brand-turquoise">
                <span className="font-sans text-slate-400">ضريبة القيمة المضافة ({orgDefaultTaxRate}%):</span>
                <span className="font-bold">+{taxTotal.toFixed(2)} {currentOrg?.currency_code || ''}</span>
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-between text-base font-black text-white">
                <span className="font-sans">الإجمالي الكلي:</span>
                <span className="text-brand-turquoise">{total.toFixed(2)} {currentOrg?.currency_code || ''}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setViewState('list')}
              className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saveLoading}
              className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-brand-blue hover:bg-brand-blue/90 text-white font-bold text-xs shadow-lg shadow-brand-blue/20 transition cursor-pointer"
            >
              {saveLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              <span>{editingQuotation ? 'تحديث عرض السعر' : 'حفظ عرض السعر'}</span>
            </button>
          </div>
        </form>
      )}

      {/* ==================== DETAIL VIEW ==================== */}
      {viewState === 'detail' && selectedQuotation && (
        <div className="space-y-6">
          
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
            
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold text-slate-400 block">تفاصيل عرض السعر</span>
                <h2 className="text-lg font-black text-slate-900 font-mono mt-0.5">{selectedQuotation.quotation_number}</h2>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                
                {/* Status Badges & Quick Change */}
                {selectedQuotation.status !== 'converted' && (
                  <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl">
                    <button
                      onClick={() => handleUpdateStatus(selectedQuotation.id, 'sent')}
                      className="px-3 py-1 rounded-xl text-xs font-bold bg-white text-blue-700 shadow-sm cursor-pointer"
                    >
                      تعيين كـ "تم الإرسال"
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedQuotation.id, 'accepted')}
                      className="px-3 py-1 rounded-xl text-xs font-bold bg-white text-emerald-700 shadow-sm cursor-pointer"
                    >
                      قبول العرض
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedQuotation.id, 'rejected')}
                      className="px-3 py-1 rounded-xl text-xs font-bold bg-white text-red-700 shadow-sm cursor-pointer"
                    >
                      رفض العرض
                    </button>
                  </div>
                )}

                {/* Convert to Invoice Button */}
                {selectedQuotation.status !== 'converted' && (
                  <button
                    onClick={() => handleConvertToInvoice(selectedQuotation)}
                    disabled={actionLoading === `convert-${selectedQuotation.id}`}
                    className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-2xl shadow-md transition cursor-pointer"
                  >
                    {actionLoading === `convert-${selectedQuotation.id}` ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowRightLeft className="w-4 h-4" />
                    )}
                    <span>تحويل إلى فاتورة مبيعات</span>
                  </button>
                )}
              </div>
            </div>

            {/* Info Summary Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs">
              <div>
                <span className="text-slate-400 block font-semibold mb-1">العميل:</span>
                <span className="font-bold text-slate-800">{selectedQuotation.customer?.name || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold mb-1">تاريخ العرض:</span>
                <span className="font-bold font-mono text-slate-800">{selectedQuotation.quotation_date}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold mb-1">صالح لغاية:</span>
                <span className="font-bold font-mono text-slate-800">{selectedQuotation.valid_until}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold mb-1">الحالة:</span>
                <div>{getStatusBadge(selectedQuotation.status)}</div>
              </div>
            </div>

            {/* Lines Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                    <th className="p-3">الوصف / الصنف</th>
                    <th className="p-3 text-center">الكمية</th>
                    <th className="p-3 text-center">سعر الوحدة</th>
                    <th className="p-3 text-center">الخصم</th>
                    <th className="p-3 text-center">الضريبة</th>
                    <th className="p-3 text-left pl-6">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selectedQuotation.lines || []).map((l, i) => (
                    <tr key={l.id || i}>
                      <td className="p-3 font-semibold text-slate-800">{l.description || l.item?.name || '—'}</td>
                      <td className="p-3 text-center font-mono">{l.quantity}</td>
                      <td className="p-3 text-center font-mono">{l.unit_price.toFixed(2)}</td>
                      <td className="p-3 text-center font-mono text-red-500">{l.discount_amount.toFixed(2)}</td>
                      <td className="p-3 text-center font-mono">{l.tax_amount.toFixed(2)} ({l.tax_rate}%)</td>
                      <td className="p-3 text-left font-mono font-bold text-slate-900 pl-6">{l.line_total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals & Notes */}
            <div className="flex flex-col md:flex-row justify-between gap-6 pt-4 border-t border-slate-100">
              <div className="space-y-2 text-xs text-slate-600 max-w-md">
                {selectedQuotation.notes && (
                  <div>
                    <span className="font-bold block text-slate-800 mb-1">شروط وملاحظات العرض:</span>
                    <p className="bg-slate-50 p-3 rounded-xl border border-slate-100 whitespace-pre-wrap">{selectedQuotation.notes}</p>
                  </div>
                )}
                {selectedQuotation.payment_method && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="font-bold text-slate-800 block mb-1">طريقة السداد المقترحة:</span>
                    <span className="font-semibold text-brand-blue">
                      {selectedQuotation.payment_method === 'cash' && 'نقداً (كاش)'}
                      {selectedQuotation.payment_method === 'credit' && 'آجل (على الحساب)'}
                      {selectedQuotation.payment_method === 'card' && 'بطاقة مدى / ائتمان'}
                      {selectedQuotation.payment_method === 'cheque' && 'شيك بنكي'}
                      {selectedQuotation.payment_method === 'bank_transfer' && 'تحويل بنكي'}
                      {selectedQuotation.payment_method === 'cash_and_card' && 'مزدوج (نقداً + بطاقة)'}
                      {selectedQuotation.payment_method === 'bank_transfer_and_cash' && 'مزدوج (تحويل + نقداً)'}
                    </span>
                  </div>
                )}
              </div>

              <div className="w-full md:w-72 bg-slate-900 text-white p-5 rounded-2xl space-y-3 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">المبلغ الخاضع للضريبة:</span>
                  <span className="font-bold">{selectedQuotation.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-400">
                  <span>الخصم:</span>
                  <span className="font-bold">-{selectedQuotation.discount_total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-brand-turquoise">
                  <span>الضريبة:</span>
                  <span className="font-bold">+{selectedQuotation.tax_total.toFixed(2)}</span>
                </div>
                <div className="pt-2 border-t border-white/10 flex justify-between font-black text-sm text-white">
                  <span>الإجمالي:</span>
                  <span className="text-brand-turquoise">{selectedQuotation.total.toFixed(2)} {currentOrg?.currency_code || ''}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
