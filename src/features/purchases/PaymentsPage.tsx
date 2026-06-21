import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { purchaseService, CreatePaymentInput } from '../../lib/purchaseService';
import { masterDataService } from '../../lib/masterDataService';
import { accountingService } from '../../lib/accountingService';
import { 
  Payment, 
  Vendor, 
  Account, 
  AccountingSettings,
  PurchaseBill,
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
  ArrowRight,
  Calculator,
  FileText
} from 'lucide-react';

export const PaymentsPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Checking permissions: Owner, admin, accountant can approve/cancel.
  const canApproveOrCancel = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant';

  // Data State
  const [payments, setPayments] = useState<Payment[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<AccountingSettings | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // View state: 'list' | 'add' | 'view'
  const [viewState, setViewState] = useState<'list' | 'add' | 'view'>('list');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // all, draft, approved, cancelled

  // Form State
  const [vendorId, setVendorId] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');
  const [cashAccountId, setCashAccountId] = useState<string>('');
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Form Allocations (which bills are being paid)
  // { purchase_bill_id: allocated_amount }
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  // Load lists on mount
  useEffect(() => {
    if (currentOrg?.id) {
      loadData();
    }
  }, [currentOrg?.id]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'new') {
      setViewState('add');
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, navigate]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [allPayments, allVendors, allBills, allAccounts, taxSettings] = await Promise.all([
        purchaseService.getPayments(currentOrg!.id),
        masterDataService.getVendors(currentOrg!.id),
        purchaseService.getPurchaseBills(currentOrg!.id),
        accountingService.getAccounts(currentOrg!.id),
        accountingService.getAccountingSettings(currentOrg!.id).catch(() => null)
      ]);

      setPayments(allPayments);
      setVendors(allVendors.filter(v => v.is_active));
      setBills(allBills);
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

  // Get active unpaid/partially paid bills for currently selected vendor in form
  const getVendorUnpaidBills = () => {
    if (!vendorId) return [];
    return bills.filter(bill => 
      bill.vendor_id === vendorId && 
      bill.status === 'approved' && 
      bill.balance_due > 0
    );
  };

  const vendorUnpaidBills = getVendorUnpaidBills();

  // Handle switching vendor -> resets allocations map
  const handleVendorChange = (id: string) => {
    setVendorId(id);
    setAllocations({});
    setAmount('0');
  };

  // Auto allocate amount across the unpaid bills starting from the oldest
  const handleAutoAllocate = () => {
    const parsedAmount = parseFloat(toEnglishDigits(amount));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('يرجى تحديد إجمالي قيمة السند أولاً!');
      return;
    }

    let remaining = parsedAmount;
    const newAllocations: Record<string, string> = {};

    // Sort vendor bills: oldest first
    const sortedBills = [...vendorUnpaidBills].sort((a, b) => 
      new Date(a.bill_date).getTime() - new Date(b.bill_date).getTime()
    );

    for (const b of sortedBills) {
      if (remaining <= 0) break;
      const pays = Math.min(remaining, b.balance_due);
      newAllocations[b.id] = pays.toFixed(2);
      remaining -= pays;
    }

    setAllocations(newAllocations);
  };

  const handleUpdateAllocation = (billId: string, val: string) => {
    setAllocations(prev => ({
      ...prev,
      [billId]: normalizeDecimalInput(val)
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

  const handleAddNewPayment = () => {
    setVendorId('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setAmount('0');
    setPaymentMethod('bank_transfer');
    setReference('');
    setNotes('');
    setAllocations({});
    setFormError(null);
    setViewState('add');

    if (settings?.default_cash_account_id) {
      setCashAccountId(settings.default_cash_account_id);
    }
    if (settings?.default_bank_account_id) {
      setBankAccountId(settings.default_bank_account_id);
    }
  };

  // Handle save payment receipt draft form
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!vendorId) {
      setFormError('يرجى اختيار المورد.');
      return;
    }

    const parsedAmount = parseFloat(toEnglishDigits(amount));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('قيمة السند يجب أن تكون أكبر من الصفر.');
      return;
    }

    if (paymentMethod === 'cash' && !cashAccountId) {
      setFormError('يرجى اختيار الصندوق أو الخزينة النقدية للصرف.');
      return;
    }
    if (paymentMethod === 'bank_transfer' && !bankAccountId) {
      setFormError('يرجى اختيار الحساب البنكي للصرف.');
      return;
    }

    // Process and validate allocations
    const processedAllocations = [];
    let allocatedSum = 0;

    for (const bill of vendorUnpaidBills) {
      const allocStr = allocations[bill.id] || '';
      if (!allocStr) continue;

      const accAmt = parseFloat(allocStr);
      if (isNaN(accAmt) || accAmt <= 0) continue;

      if (accAmt > bill.balance_due) {
        setFormError(`المبلغ المراد تخصيصه للفاتورة ${bill.bill_number} يتعدى الرصيد المستحق لها (${bill.balance_due} ر.س).`);
        return;
      }

      allocatedSum += accAmt;
      processedAllocations.push({
        purchase_bill_id: bill.id,
        allocated_amount: accAmt
      });
    }

    if (processedAllocations.length === 0) {
      setFormError('يرجى تخصيص مبلغ السند على فاتورة واحدة على الأقل.');
      return;
    }

    // Exact allocation matching constraint
    if (Math.abs(allocatedSum - parsedAmount) > 0.01) {
      setFormError(`مجموع التخصيصات (${allocatedSum.toFixed(2)} ر.س) يجب أن يتطابق تماماً مع إجمالي السند (${parsedAmount.toFixed(2)} ر.س).`);
      return;
    }

    setSaveLoading(true);
    try {
      const input: CreatePaymentInput = {
        vendor_id: vendorId,
        payment_date: paymentDate,
        amount: parsedAmount,
        payment_method: paymentMethod,
        cash_account_id: paymentMethod === 'cash' ? cashAccountId : undefined,
        bank_account_id: (paymentMethod === 'bank_transfer' || paymentMethod === 'card') ? bankAccountId : undefined,
        reference: reference || undefined,
        notes: notes || undefined,
        allocations: processedAllocations
      };

      await purchaseService.createPayment(currentOrg!.id, input);
      setViewState('list');
      loadData();
    } catch (err: any) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaveLoading(false);
    }
  };

  // Secure Action: Approve Payment
  const handleApprovePayment = async (payId: string) => {
    if (!window.confirm('هل تريد بالتأكيد اعتماد سند الصرف؟ سيتم تحديث ذمم المورد وتوليد القيد الدائن والمدين فوراً.')) return;
    setActionLoading(payId);
    setError(null);
    try {
      await purchaseService.approvePayment(currentOrg!.id, payId);
      loadData();
      if (selectedPayment && selectedPayment.id === payId) {
        const refreshed = await purchaseService.getPayment(currentOrg!.id, payId);
        setSelectedPayment(refreshed);
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // Secure Action: Cancel Payment
  const handleCancelPayment = async (payId: string) => {
    if (!window.confirm('بعد إلغاء السند لا يمكن استعادته، وسيتم إعادة مبالغ فواتير الشراء المرتبطة كديون مستحقة، بالإضافة لتوليد قيد لتصفية رصيد الحساب. هل ترغب بالمتابعة؟')) return;
    setActionLoading(payId);
    setError(null);
    try {
      await purchaseService.cancelPayment(currentOrg!.id, payId);
      loadData();
      if (selectedPayment && selectedPayment.id === payId) {
        const refreshed = await purchaseService.getPayment(currentOrg!.id, payId);
        setSelectedPayment(refreshed);
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // Secure Action: Delete Draft Payment
  const handleDeletePayment = async (payId: string) => {
    if (!window.confirm('هل ترغب في مسح مسودة سند الصرف بشكل كامل؟')) return;
    setActionLoading(payId);
    setError(null);
    try {
      await purchaseService.deleteDraftPayment(currentOrg!.id, payId);
      setViewState('list');
      setSelectedPayment(null);
      loadData();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // View Payment specific record
  const handleViewPayment = async (p: Payment) => {
    setLoading(true);
    setError(null);
    try {
      const full = await purchaseService.getPayment(currentOrg!.id, p.id);
      setSelectedPayment(full);
      setViewState('view');
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Badges helpers
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <CheckCircle className="w-3.5 h-3.5" /> معتمد ومسدد
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

  const getMethodText = (method: string) => {
    switch (method) {
      case 'bank_transfer': return 'تحويل بنكي';
      case 'cash': return 'نقد سيولة';
      case 'card': return 'بطاقة مدى/ائتمان';
      default: return 'طرق سداد أخرى';
    }
  };

  // Filters payments
  const filteredPayments = payments.filter(p => {
    const venName = p.vendor?.name?.toLowerCase() || '';
    const pNum = p.payment_number?.toLowerCase() || '';
    const q = searchQuery.toLowerCase();

    const matchesSearch = venName.includes(q) || pNum.includes(q);
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;

    return matchesSearch && matchesStatus;
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
          VIEW 1: LISTING PAYMENTS
          ========================================================== */}
      {viewState === 'list' && (
        <div className="space-y-6">
          
          {/* Header row layout */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <CreditCard className="w-6 h-6 text-brand-navy" />
                <span>سندات الصرف للموردين</span>
              </h1>
              <p className="text-xs text-slate-500 mt-1">تسجيل المدفوعات من الصناديق والبنوك، وإطفاء ديون فواتير الشراء، وإصدار قيود التسوية المالية.</p>
            </div>

            <button
              onClick={handleAddNewPayment}
              className="flex items-center gap-1.5 px-4 py-2.25 bg-brand-navy hover:bg-brand-navy/95 text-white text-xs font-bold rounded-xl transition shadow shadow-brand-navy/10 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إصدار سند صرف مالي</span>
            </button>
          </div>

          {/* Filtering parameters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/50">
            <div className="col-span-1 md:col-span-2 relative">
              <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="بحث برقم السند، اسم المورد..."
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
                <option value="draft">سندات معلقة (مسودة)</option>
                <option value="approved">معتمدة ومرحلة</option>
                <option value="cancelled">ملغاة وعكسية</option>
              </select>
            </div>
          </div>

          {/* Data List table */}
          {loading ? (
            <div className="bg-white p-16 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-center items-center gap-3">
              <Loader2 className="w-8 h-8 text-brand-navy animate-spin" />
              <span className="text-xs text-slate-500">جاري تحميل دفتريات الصرف المالي...</span>
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="bg-white p-16 rounded-3xl border border-slate-200/80 shadow-sm text-center">
              <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-sm font-bold text-slate-700">لا توجد سندات صرف</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto font-sans">لم تسجل أي سندات سداد مالي أو صرف منشأة للموردين في الفترات المالية النشطة.</p>
              <button
                onClick={handleAddNewPayment}
                className="mt-4 inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer"
              >
                اصرف أول دفعة الآن
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                      <th className="p-4">رقم السند</th>
                      <th className="p-4">المورد المستلم</th>
                      <th className="p-4">تاريخ الصرف</th>
                      <th className="p-4">طريقة السداد</th>
                      <th className="p-4">القيمة المصروفة</th>
                      <th className="p-4">حالة السند</th>
                      <th className="p-4 text-left">خيارات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-4 font-bold text-slate-900 font-mono tracking-wider">
                          {p.payment_number}
                        </td>
                        <td className="p-4 font-semibold text-slate-700">
                          {p.vendor?.name}
                        </td>
                        <td className="p-4 text-slate-500 font-mono">
                          {formatArabicDateWithLatinDigits(p.payment_date)}
                        </td>
                        <td className="p-4 text-slate-600">
                          {getMethodText(p.payment_method)}
                        </td>
                        <td className="p-4 font-bold text-slate-900 font-mono tracking-tight text-left pl-6" style={{ direction: 'ltr' }}>
                          {formatNumberWithLatinDigits(p.amount)} ر.س
                        </td>
                        <td className="p-4">
                          {getStatusBadge(p.status)}
                        </td>
                        <td className="p-4 text-left space-x-1 space-x-reverse">
                          <button
                            onClick={() => handleViewPayment(p)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-2 rounded-lg transition tooltip cursor-pointer"
                            title="عرض السند والقيود"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <a
                            href={`#/print/payment/${p.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 p-2 rounded-lg transition cursor-pointer"
                            title="طباعة سند الصرف A4"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </a>

                          {p.status === 'draft' && (
                            <>
                              {canApproveOrCancel && (
                                <button
                                  onClick={() => handleApprovePayment(p.id)}
                                  disabled={actionLoading === p.id}
                                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 p-2 rounded-lg transition disabled:opacity-50 cursor-pointer"
                                  title="اعتماد السند وتثبيته"
                                >
                                  {actionLoading === p.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <ClipboardCheck className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                              <button
                                onClick={() => handleDeletePayment(p.id)}
                                disabled={actionLoading === p.id}
                                className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-lg transition disabled:opacity-50 cursor-pointer"
                                title="إلغاء تماماً"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {p.status === 'approved' && canApproveOrCancel && (
                            <button
                              onClick={() => handleCancelPayment(p.id)}
                              disabled={actionLoading === p.id}
                              className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-lg transition disabled:opacity-50 cursor-pointer"
                              title="إلغاء سند وعكس القيد"
                            >
                              {actionLoading === p.id ? (
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
          VIEW 2: FORM FOR ISSUING VENDOR PAYMENTS
          ========================================================== */}
      {viewState === 'add' && (
        <form onSubmit={handleSavePayment} className="space-y-6">
          
          {/* Header card page */}
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
                <h1 className="text-base font-bold text-slate-800 font-sans">إصدار سند صرف مالي جديد لمورد</h1>
                <p className="text-[11px] text-slate-400 mt-0.5">صرف دفعات نقدية أو بنكية، وتوزيعها وإطفاؤها على فواتير الشراء المسجلة.</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setViewState('list')}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="submit"
                disabled={saveLoading}
                className="flex items-center gap-1.5 px-5 py-2 bg-brand-navy hover:bg-brand-navy/95 text-white text-xs font-bold rounded-xl transition shadow disabled:opacity-50 cursor-pointer"
              >
                {saveLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>حفظ سند مسودة</span>
              </button>
            </div>
          </div>

          {/* Form validation alert banner */}
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs p-4 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
              <div className="leading-relaxed font-semibold">{formError}</div>
            </div>
          )}

          {/* Core Master Form blocks */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Vendor select selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">اسم المورد المستلم *</label>
                <select
                  value={vendorId}
                  onChange={(e) => handleVendorChange(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-blue bg-slate-50/50"
                >
                  <option value="">— اختر مورد الفاتورة —</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>

              {/* Payment Receipt date */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">تاريخ إصدار السند *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                    <Calendar className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    required
                    className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-blue font-mono"
                  />
                </div>
              </div>

              {/* Total payout amount */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">المبلغ الإجمالي للسند (SAR) *</label>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(normalizeDecimalInput(toEnglishDigits(e.target.value)))}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 font-mono text-center focus:outline-none focus:ring-1 focus:ring-brand-blue bg-amber-50/10"
                  style={{ direction: 'ltr' }}
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">طريقة الدفع والصرف *</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-brand-blue"
                >
                  <option value="bank_transfer">تحويل بنكي سحابي</option>
                  <option value="cash">نقد / كاش من الخزينة</option>
                  <option value="card">بطاقة مدى / ائتمان منشأة</option>
                  <option value="other">شيك أو ذمم أخرى</option>
                </select>
              </div>

              {/* Cash account conditional Selector */}
              {paymentMethod === 'cash' ? (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">رقم حساب الصندوق النقدى *</label>
                  <select
                    value={cashAccountId}
                    onChange={(e) => setCashAccountId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white"
                  >
                    <option value="">— اختر حساب الصندوق —</option>
                    {accounts.filter(a => a.classification === 'assets' && a.code.startsWith('1101')).map(a => (
                      <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                /* Bank Account conditional selector */
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">رقم حساب البنوك والأموال *</label>
                  <select
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white"
                  >
                    <option value="">— اختر حساب البنك —</option>
                    {accounts.filter(a => a.classification === 'assets' && a.code.startsWith('1102')).map(a => (
                      <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Reference */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">رقم المرجع / الحوالة البنكية</label>
                <input
                  type="text"
                  placeholder="رقم العملية، الشيك أو الحوالة"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
                />
              </div>

            </div>
          </div>

          {/* Allocation table block container */}
          {vendorId && (
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden space-y-4">
              
              <div className="p-4 bg-slate-50 border-b border-slate-150 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-700">فواتير الشراء غير المسددة للمورد</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">ستقوم بتحديد مقدار التخصيص لكل فاتورة لمطابقة قيمة الصرف الكلية.</p>
                </div>

                <button
                  type="button"
                  onClick={handleAutoAllocate}
                  className="flex items-center gap-1.5 bg-brand-navy hover:bg-brand-navy/95 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition"
                >
                  <Calculator className="w-3.5 h-3.5" /> توزيع السند تلقائياً
                </button>
              </div>

              {vendorUnpaidBills.length === 0 ? (
                <div className="p-10 text-center text-slate-400 text-xs">
                  <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <span>لا توجد فواتير مشتريات معلقة أو مستحقة لهذا المورد المختار.</span>
                </div>
              ) : (
                <div className="overflow-x-auto p-4">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                        <th className="p-3">رقم الفاتورة</th>
                        <th className="p-3">تاريخ الفاتورة</th>
                        <th className="p-3">الإجمالي الأصلي</th>
                        <th className="p-3 text-red-500 font-bold">الرصيد المستحق (الدين)</th>
                        <th className="p-3 w-48 text-left pl-6">المبلغ المراد تخصيصه وسداده</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {vendorUnpaidBills.map((bill) => (
                        <tr key={bill.id} className="hover:bg-slate-50/20">
                          <td className="p-3 font-mono font-bold text-slate-900">{bill.bill_number}</td>
                          <td className="p-3 font-mono text-slate-500">{formatArabicDateWithLatinDigits(bill.bill_date)}</td>
                          <td className="p-3 font-mono text-slate-600">{formatNumberWithLatinDigits(bill.total)} ر.س</td>
                          <td className="p-3 font-mono font-bold text-red-600">{formatNumberWithLatinDigits(bill.balance_due)} ر.س</td>
                          <td className="p-3 text-left pl-6">
                            <input
                              type="text"
                              value={allocations[bill.id] || ''}
                              onChange={(e) => handleUpdateAllocation(bill.id, e.target.value)}
                              placeholder="0.00"
                              className="w-40 p-2 border border-slate-200 rounded-lg text-xs font-mono font-bold text-center bg-slate-50/50"
                              style={{ direction: 'ltr' }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Grand allocations balance indicator footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between font-bold text-xs">
                <span className="text-slate-500">إجمالي التخصيصات الموزعة:</span>
                <span className={`font-mono text-sm ${Math.abs(totalAllocated - parseFloat(toEnglishDigits(amount))) < 0.01 ? 'text-emerald-600' : 'text-red-500 animate-pulse'}`}>
                  {totalAllocated.toFixed(2)} ر.س / {parseFloat(toEnglishDigits(amount)).toFixed(2)} ر.س
                </span>
              </div>

            </div>
          )}

          {/* Optional Notes block */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            <span className="text-xs font-bold text-slate-500 block">شروح وملاحظات الحاشية</span>
            <textarea
              placeholder="وصف إضافي أو شروحات ترحيل لدفاتر مراجعة الحسابات..."
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-2xl text-xs font-medium"
            />
          </div>

        </form>
      )}

      {/* ==========================================================
          VIEW 3: DETAILED PAYMENT SLIP AND DOUBLE ENTRY LEDGERS
          ========================================================== */}
      {viewState === 'view' && selectedPayment && (
        <div className="space-y-6">
          
          {/* Header row */}
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
                  <h1 className="text-base font-bold text-slate-900">{selectedPayment.payment_number}</h1>
                  {getStatusBadge(selectedPayment.status)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">المستلم: {selectedPayment.vendor?.name} | تاريخ السند: {formatArabicDateWithLatinDigits(selectedPayment.payment_date)}</p>
              </div>
            </div>

            <div className="flex gap-2 self-stretch md:self-auto">
              <a
                href={`#/print/payment/${selectedPayment.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                <Printer className="w-4 h-4 text-slate-500" />
                <span>تحضير وطباعة السند A4</span>
              </a>

              {selectedPayment.status === 'draft' && canApproveOrCancel && (
                <button
                  onClick={() => handleApprovePayment(selectedPayment.id)}
                  disabled={actionLoading === selectedPayment.id}
                  className="flex items-center justify-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading === selectedPayment.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ClipboardCheck className="w-3.5 h-3.5" />
                  )}
                  <span>اعتماد وصرف السند</span>
                </button>
              )}

              {selectedPayment.status === 'approved' && canApproveOrCancel && (
                <button
                  onClick={() => handleCancelPayment(selectedPayment.id)}
                  disabled={actionLoading === selectedPayment.id}
                  className="flex items-center justify-center gap-1.5 px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition shadow disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading === selectedPayment.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Ban className="w-3.5 h-3.5" />
                  )}
                  <span>إلغاء سند الصرف وعكس القيود</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <div className="col-span-1 md:col-span-2 space-y-6">
              
              {/* Detailed specification lists */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm grid grid-cols-2 md:grid-cols-4 gap-6 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">المستلم (المورد)</span>
                  <span className="font-bold text-slate-800">{selectedPayment.vendor?.name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">طريقة الصرف</span>
                  <span className="font-bold text-slate-800">{getMethodText(selectedPayment.payment_method)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">الرقم المرجعي / الحوالة</span>
                  <span className="font-mono text-slate-800 font-bold">{selectedPayment.reference || 'لا يوجد'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">تاريخ العملية</span>
                  <span className="font-mono text-slate-800">{formatArabicDateWithLatinDigits(selectedPayment.payment_date)}</span>
                </div>
              </div>

              {/* Allocations information list */}
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 text-xs">تسويات فواتير الشراء المرتبطة</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50/50 text-slate-500 font-semibold border-b border-slate-100">
                        <th className="p-3">رقم فاتورة الشراء المطفأة</th>
                        <th className="p-3">تاريخها المالي</th>
                        <th className="p-3">رقم فاتورة مورد مأخوذة</th>
                        <th className="p-3 text-left pl-6">المبلغ المستقطع والمسوى من السند</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {selectedPayment.allocations?.map((alloc) => (
                        <tr key={alloc.id} className="hover:bg-slate-50/20 font-medium">
                          <td className="p-3 text-slate-800 font-mono font-bold">{alloc.purchase_bill?.bill_number}</td>
                          <td className="p-3 text-slate-500 font-mono">{formatArabicDateWithLatinDigits(alloc.purchase_bill?.bill_date || '')}</td>
                          <td className="p-3 text-slate-400 font-mono">{alloc.purchase_bill?.vendor_invoice_number || '—'}</td>
                          <td className="p-3 text-left pl-6 font-mono font-bold text-slate-900" style={{ direction: 'ltr' }}>
                            {formatNumberWithLatinDigits(alloc.allocated_amount)} ر.س
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Journal double entries Representation */}
              {selectedPayment.status !== 'draft' && (
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-brand-navy" />
                      <span>قيد يومية تسوية إطفاء مديونية المورد (طريقة مزدوجة)</span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-full">
                      ID: {selectedPayment.journal_entry_id}
                    </span>
                  </div>

                  {/* Ledger lines grids */}
                  <div className="bg-slate-50 border border-slate-150 rounded-2xl overflow-hidden font-mono text-[11px]">
                    <div className="grid grid-cols-3 md:grid-cols-4 bg-slate-100 p-2.5 font-bold text-slate-600 text-center text-xs">
                      <div className="text-right pr-2">الحساب الدفتري</div>
                      <div className="hidden md:block">الوصف الجانبي</div>
                      <div className="text-left">المدين (Dr)</div>
                      <div className="text-left pl-4">الدائن (Cr)</div>
                    </div>
                    
                    <div className="divide-y divide-slate-100">
                      {/* Debit line: Accounts payable */}
                      <div className="grid grid-cols-3 md:grid-cols-4 p-2.5 text-center items-center">
                        <div className="text-right pr-2 font-bold">
                          <span className="text-brand-blue font-bold">[2101]</span> ذمم الموردين الدائنة ({selectedPayment.vendor?.name})
                        </div>
                        <div className="hidden md:block text-slate-500 font-sans">تسوية ديون سند صرف {selectedPayment.payment_number}</div>
                        <div className="text-left font-bold text-emerald-600">{selectedPayment.amount.toFixed(2)} ر.س</div>
                        <div className="text-left pl-4 text-slate-400">0.00 ر.س</div>
                      </div>

                      {/* Credit line: Cash or Bank */}
                      <div className="grid grid-cols-3 md:grid-cols-4 p-2.5 text-center items-center bg-brand-navy/5">
                        <div className="text-right pr-2 font-bold">
                          {selectedPayment.payment_method === 'cash' ? (
                            <span><span className="text-brand-blue">[1101]</span> حساب الصندوق النقدي المعتمد</span>
                          ) : (
                            <span><span className="text-brand-blue">[1102]</span> حساب البنك العام للمنشأة</span>
                          )}
                        </div>
                        <div className="hidden md:block text-slate-500 font-sans">صرف سيولة مالية مسداة للمورد</div>
                        <div className="text-left text-slate-400 font-normal">0.00 ر.س</div>
                        <div className="text-left pl-4 font-bold text-red-600">{selectedPayment.amount.toFixed(2)} ر.س</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Side totals info card */}
            <div className="space-y-6">
              
              <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-sm space-y-4 font-mono select-none">
                <span className="text-[10px] font-bold text-slate-400 block pb-2 border-b border-white/10 uppercase tracking-wider font-sans">معلومات مالية السند</span>
                
                <div className="border-t border-white/10 pt-4 flex justify-between items-baseline">
                  <span className="font-sans text-xs font-bold text-slate-400">القيمة الإجمالية المدفوعة:</span>
                  <span className="text-lg font-bold text-brand-turquoise">{formatNumberWithLatinDigits(selectedPayment.amount)} ر.س</span>
                </div>

                <div className="border-t border-white/10 pt-4 space-y-2 font-sans text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">تم تخصيص وسداد:</span>
                    <span className="text-emerald-400 font-bold">{formatNumberWithLatinDigits(selectedPayment.amount)} ر.س</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">حساب الخزينة/البنك:</span>
                    <span className="font-mono text-slate-300 font-semibold">
                      {selectedPayment.payment_method === 'cash' ? 'صندوق نقدية' : 'المحفظة البنكية'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Log details */}
              <div className="bg-slate-50 border border-slate-200/60 p-6 rounded-3xl space-y-4 text-xs font-medium text-slate-600 leading-relaxed leading-7">
                <span className="text-[10px] font-bold text-slate-400 block pb-2 border-b border-slate-200/60 uppercase tracking-wider">سجل الحركة والتدقيق</span>
                
                <div>
                  <span className="text-slate-400 block text-[10px]">تاريخ الإنشاء</span>
                  <span>{formatArabicDateWithLatinDigits(selectedPayment.created_at)}</span>
                </div>

                {selectedPayment.approved_at && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">تاريخ الاعتماد والصرف</span>
                    <span>{formatArabicDateWithLatinDigits(selectedPayment.approved_at)}</span>
                  </div>
                )}

                {selectedPayment.cancelled_at && (
                  <div className="text-red-600">
                    <span className="text-slate-400 block text-[10px]">تاريخ الإلغاء</span>
                    <span>{formatArabicDateWithLatinDigits(selectedPayment.cancelled_at)}</span>
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
