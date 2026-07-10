import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { salesService } from '../../lib/salesService';
import { masterDataService } from '../../lib/masterDataService';
import { SalesCreditNote, SalesInvoice, SalesInvoiceLine, Customer } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { formatNumberWithLatinDigits } from '../../lib/formatters';
import { 
  Plus, 
  Search, 
  Eye, 
  Printer, 
  X, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  AlertCircle, 
  ArrowLeft,
  RefreshCw,
  Trash2,
  FileText
} from 'lucide-react';

export const CreditNotesPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Role permissions
  const canApproveOrCancel = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant';
  const isViewer = roleInCurrentOrg === 'viewer';

  // Core lists
  const [creditNotes, setCreditNotes] = useState<SalesCreditNote[]>([]);
  const [approvedInvoices, setApprovedInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // View States: 'list' | 'add' | 'view'
  const [viewState, setViewState] = useState<'list' | 'add' | 'view'>('list');
  const [selectedNote, setSelectedNote] = useState<SalesCreditNote | null>(null);

  // Form State for creating SCN
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [creditNoteDate, setCreditNoteDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [linesToReturn, setLinesToReturn] = useState<Array<{
    originalLine: SalesInvoiceLine;
    quantityToReturn: number;
    availableQuantity: number;
    selected: boolean;
  }>>([]);

  // Search/Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showDeleted, setShowDeleted] = useState<boolean>(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('');

  // Loading triggers
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Load basic data
  useEffect(() => {
    if (currentOrg?.id) {
      loadData();
    }
  }, [currentOrg?.id, showDeleted]);

  // Check query params if navigated from an invoice
  useEffect(() => {
    const invoiceIdParam = searchParams.get('invoiceId');
    if (invoiceIdParam && approvedInvoices.length > 0) {
      const inv = approvedInvoices.find(i => i.id === invoiceIdParam);
      if (inv) {
        handleStartReturnForInvoice(inv);
      }
    }
  }, [searchParams, approvedInvoices]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [notesData, invoicesData] = await Promise.all([
        salesService.getCreditNotes(currentOrg!.id, { showDeleted }),
        salesService.getSalesInvoices(currentOrg!.id)
      ]);
      setCreditNotes(notesData);
      // Only approved/paid invoices that are not cancelled are eligible for return
      setApprovedInvoices(invoicesData.filter(inv => inv.status === 'approved' || inv.payment_status === 'paid' || inv.payment_status === 'partially_paid'));
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleStartReturnForInvoice = async (invoice: SalesInvoice) => {
    setError(null);
    setSaveLoading(true);
    try {
      // Fetch full invoice detail with lines
      const fullInvoice = await salesService.getSalesInvoice(currentOrg!.id, invoice.id);
      setSelectedInvoice(fullInvoice);
      
      // Calculate remaining quantities available to return for each line
      const linesWithAvailable = await Promise.all((fullInvoice.lines || []).map(async (line) => {
        // Find total quantity already returned in APPROVED credit notes
        let returnedQty = 0;
        creditNotes.forEach(cn => {
          if (cn.status === 'approved' && cn.original_invoice_id === invoice.id) {
            cn.lines?.forEach(cnl => {
              if (cnl.original_invoice_line_id === line.id) {
                returnedQty += Number(cnl.quantity);
              }
            });
          }
        });

        const available = Number(line.quantity) - returnedQty;
        return {
          originalLine: line,
          quantityToReturn: available > 0 ? available : 0,
          availableQuantity: available,
          selected: available > 0
        };
      }));

      setLinesToReturn(linesWithAvailable);
      setViewState('add');
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCreateCreditNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    const selectedLines = linesToReturn.filter(l => l.selected && l.quantityToReturn > 0);
    if (selectedLines.length === 0) {
      setError('يرجى تحديد بند واحد على الأقل مع تحديد كمية أكبر من الصفر للإرجاع.');
      return;
    }

    // Verify quantity bounds
    for (const line of selectedLines) {
      if (line.quantityToReturn > line.availableQuantity) {
        setError(`الكمية المراد إرجاعها للبند (${line.originalLine.description || line.originalLine.item?.name}) تتجاوز المتاح للارتجاع (${line.availableQuantity}).`);
        return;
      }
    }

    setSaveLoading(true);
    setError(null);

    try {
      // 1. Create SCN draft header
      const creditNoteId = await salesService.createCreditNote(
        currentOrg!.id,
        selectedInvoice.id,
        creditNoteDate,
        reason,
        notes
      );

      // 2. Add SCN lines
      for (const line of selectedLines) {
        await salesService.addCreditNoteLine(
          creditNoteId,
          line.originalLine.id,
          line.quantityToReturn
        );
      }

      // 3. Load full details of newly created SCN and view it
      const detailedNote = await salesService.getCreditNote(currentOrg!.id, creditNoteId);
      setSelectedNote(detailedNote);
      setViewState('view');
      
      // Refresh list
      loadData();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleApprove = async (cnId: string) => {
    if (!window.confirm('هل أنت متأكد من اعتماد هذا الإشعار الدائن؟ سيتم ترحيل القيد تلقائياً وتحديث كميات المخزون.')) return;
    setActionLoading('approve');
    setError(null);
    try {
      await salesService.approveCreditNote(cnId);
      // Reload and refresh
      const refreshed = await salesService.getCreditNote(currentOrg!.id, cnId);
      setSelectedNote(refreshed);
      loadData();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (cnId: string) => {
    const cancelReason = window.prompt('يرجى إدخال سبب إلغاء هذا الإشعار الدائن:');
    if (cancelReason === null) return;
    if (!cancelReason.trim()) {
      alert('يجب إدخال سبب للإلغاء.');
      return;
    }

    setActionLoading('cancel');
    setError(null);
    try {
      await salesService.cancelCreditNote(cnId, cancelReason);
      // Reload and refresh
      const refreshed = await salesService.getCreditNote(currentOrg!.id, cnId);
      setSelectedNote(refreshed);
      loadData();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteDraftCreditNote = (id: string) => {
    setDeletingId(id);
    setDeleteReason('');
    setDeleteConfirmOpen(true);
  };

  const handleConfirmSoftDelete = async () => {
    if (!deletingId) return;
    if (!deleteReason.trim()) {
      alert('يرجى إدخال سبب الحذف نظامياً.');
      return;
    }
    setActionLoading('delete');
    setError(null);
    try {
      await salesService.softDeleteSalesCreditNote(deletingId, deleteReason);
      
      if (selectedNote && selectedNote.id === deletingId) {
        setSelectedNote(null);
        setViewState('list');
      }

      loadData();
      setDeleteConfirmOpen(false);
      setDeletingId(null);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleSelectInvoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const invId = e.target.value;
    const inv = approvedInvoices.find(i => i.id === invId);
    if (inv) {
      handleStartReturnForInvoice(inv);
    } else {
      setSelectedInvoice(null);
      setLinesToReturn([]);
    }
  };

  const filteredNotes = creditNotes.filter(cn => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      cn.credit_note_number.toLowerCase().includes(query) ||
      cn.customer?.name.toLowerCase().includes(query) ||
      (cn.original_invoice?.invoice_number && cn.original_invoice.invoice_number.toLowerCase().includes(query));
    
    const matchesStatus = statusFilter === 'all' || cn.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* Alert Error Box */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-xs font-semibold p-4 rounded-2xl flex items-start gap-3 shadow-sm">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <span className="font-bold">خطأ في التنفيذ: </span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold text-sm">×</button>
        </div>
      )}

      {/* VIEW 1: LIST VIEW */}
      {viewState === 'list' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-800 font-sans tracking-tight">إشعارات مرتجعات المبيعات / الإشعارات الدائنة</h2>
              <p className="text-xs text-slate-400 mt-1 font-sans">إنشاء وإدارة المرتجعات المالية ومردودات المبيعات آلياً بشكل محاسبي ومخزني دقيق.</p>
            </div>
            {!isViewer && (
              <button
                onClick={() => {
                  setSelectedInvoice(null);
                  setLinesToReturn([]);
                  setReason('');
                  setNotes('');
                  setViewState('add');
                }}
                className="py-2.5 px-4.5 bg-brand-blue hover:bg-opacity-95 text-white font-bold rounded-2xl text-xs flex items-center gap-2 shadow-lg transition"
                style={{ backgroundColor: '#1E293B' }}
              >
                <Plus className="w-4 h-4" />
                إنشاء إشعار دائن
              </button>
            )}
          </div>

          {/* Filters Row */}
          <div className="bg-white border border-slate-200 rounded-3xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm">
            <div className="relative w-full md:w-96">
              <span className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none">
                <Search className="h-4 h-4 text-slate-400" />
              </span>
              <input
                type="text"
                placeholder="البحث برقم الإشعار، العميل، أو الفاتورة المرجعية..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-4 pr-11 py-2.25 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            <div className="flex flex-wrap gap-3 w-full md:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-sans focus:outline-none"
              >
                <option value="all">كل الحالات</option>
                <option value="draft">مسودة</option>
                <option value="approved">معتمد</option>
                <option value="cancelled">ملغى</option>
              </select>

              {/* Show Deleted filter toggle for Owner/Admin/Accountant */}
              {(roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant') && (
                <label className="flex items-center gap-1.5 shrink-0 text-xs font-semibold text-slate-750 cursor-pointer select-none bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
                  <input
                    type="checkbox"
                    checked={showDeleted}
                    onChange={(e) => setShowDeleted(e.target.checked)}
                    className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>إظهار المحذوفة</span>
                </label>
              )}
            </div>
          </div>

          {/* Notes List Table */}
          {loading ? (
            <div className="flex items-center justify-center p-12 bg-white border border-slate-200 rounded-3xl">
              <div className="text-center space-y-3">
                <Loader2 className="w-8 h-8 text-slate-800 animate-spin mx-auto" />
                <p className="text-xs text-slate-400 font-bold">جاري تحميل الإشعارات الدائنة...</p>
              </div>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center space-y-4">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-400">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-700">لا توجد إشعارات دائنة</h3>
                <p className="text-xs text-slate-400 mt-1">لم يتم إنشاء أي إشعار دائن يلائم شروط البحث الحالية.</p>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold select-none">
                    <tr>
                      <th className="py-3 px-4">رقم الإشعار</th>
                      <th className="py-3 px-4">تاريخ الإشعار</th>
                      <th className="py-3 px-4">العميل</th>
                      <th className="py-3 px-4">الفاتورة المرجعية</th>
                      <th className="py-3 px-4">السبب</th>
                      <th className="py-3 px-4">مبلغ الإرجاع</th>
                      <th className="py-3 px-4 text-center">الحالة</th>
                      <th className="py-3 px-4 text-left">التحكم</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-sans">
                    {filteredNotes.map((cn) => (
                      <tr key={cn.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-800">{cn.credit_note_number}</td>
                        <td className="py-3.5 px-4 text-slate-600">{cn.credit_note_date}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-800">{cn.customer?.name}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-500">{cn.original_invoice?.invoice_number}</td>
                        <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">{cn.reason || '-'}</td>
                        <td className="py-3.5 px-4 font-mono font-black text-slate-900">
                          {formatNumberWithLatinDigits(cn.total_amount)} {cn.currency_code}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {cn.status === 'approved' ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-green-50 text-green-700 border border-green-200 gap-1 select-none">
                              <CheckCircle className="w-3 h-3" /> معتمد
                            </span>
                          ) : cn.status === 'cancelled' ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-red-50 text-red-700 border border-red-200 gap-1 select-none">
                              <XCircle className="w-3 h-3" /> ملغى
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 gap-1 select-none font-bold">
                              مسودة
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-left">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedNote(cn);
                                setViewState('view');
                              }}
                              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                              title="عرض التفاصيل"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => navigate(`/print/sales-credit-note/${cn.id}`)}
                              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                              title="طباعة مستند A4"
                            >
                              <Printer className="w-4 h-4" />
                            </button>

                            {cn.status === 'draft' && (
                              <button
                                onClick={() => handleDeleteDraftCreditNote(cn.id)}
                                className="p-1 px-2 text-red-600 hover:bg-red-50 rounded transition text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                title="نقل إلى سلة المحذوفات"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>حذف</span>
                              </button>
                            )}
                          </div>
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

      {/* VIEW 2: CREATE / ADD VIEW */}
      {viewState === 'add' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6 shadow-sm">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setViewState('list')}
                className="p-2 hover:bg-slate-100 rounded-full transition"
              >
                <ArrowLeft className="w-5 h-5 text-slate-500" />
              </button>
              <div>
                <h2 className="text-lg font-black text-slate-800">إنشاء إشعار دائن (مرتجع مبيعات)</h2>
                <p className="text-xs text-slate-400 mt-1">اختر الفاتورة الأصلية وحدد الكميات المراد إرجاعها لإصدار الإشعار آلياً.</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleCreateCreditNote} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Select Invoice */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 block">الفاتورة المرجعية الأصلية <span className="text-red-500">*</span></label>
                <select
                  required
                  value={selectedInvoice?.id || ''}
                  onChange={handleSelectInvoiceChange}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:outline-none focus:ring-1 focus:ring-slate-400"
                >
                  <option value="">-- اختر فاتورة مبيعات معتمدة --</option>
                  {approvedInvoices.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number} ({inv.customer?.name}) - تاريخ: {inv.invoice_date} - إجمالي: {inv.total} {inv.currency}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 block">تاريخ الإشعار <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  required
                  value={creditNoteDate}
                  onChange={(e) => setCreditNoteDate(e.target.value)}
                  className="w-full px-4 py-2.25 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              {/* Reason */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 block">سبب الارتجاع / التعديل</label>
                <input
                  type="text"
                  placeholder="مثال: تلف المنتجات، خطأ في الحسابات..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-4 py-2.25 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>
            </div>

            {/* Selected Invoice Lines Section */}
            {selectedInvoice && (
              <div className="space-y-4 border-t border-slate-100 pt-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-700">تحديد المنتجات والكميات المرتجعة</h3>
                  <p className="text-xs text-slate-400 mt-0.5">البنود غير المحددة أو ذات الكميات الصفرية لن يتم إدراجها في الإشعار.</p>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-550 bg-slate-900 text-white font-bold select-none">
                      <tr>
                        <th className="py-2.5 px-3 text-center w-12">اختر</th>
                        <th className="py-2.5 px-3">الوصف الأصلي</th>
                        <th className="py-2.5 px-3 text-center w-24">الكمية بالفاتورة</th>
                        <th className="py-2.5 px-3 text-center w-28">المتاح للإرجاع</th>
                        <th className="py-2.5 px-3 text-center w-36">الكمية المرتجعة الآن</th>
                        <th className="py-2.5 px-3 text-center w-28">سعر الوحدة</th>
                        <th className="py-2.5 px-3 text-center w-20">الضريبة</th>
                        <th className="py-2.5 px-3 text-left w-32">الإجمالي التقديري</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-sans">
                      {linesToReturn.map((line, idx) => {
                        const estSubtotal = line.quantityToReturn * Number(line.originalLine.unit_price);
                        const estTax = estSubtotal * (Number(line.originalLine.tax_rate) / 100);
                        const estTotal = estSubtotal + estTax;

                        return (
                          <tr key={line.originalLine.id} className={`hover:bg-slate-50 ${line.selected ? 'bg-slate-50/50' : 'opacity-60'}`}>
                            <td className="py-3 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={line.selected}
                                disabled={line.availableQuantity <= 0}
                                onChange={(e) => {
                                  const updated = [...linesToReturn];
                                  updated[idx].selected = e.target.checked;
                                  setLinesToReturn(updated);
                                }}
                                className="w-4 h-4 text-slate-800 rounded border-slate-300 focus:ring-slate-500"
                              />
                            </td>
                            <td className="py-3 px-3 font-bold text-slate-800">
                              {line.originalLine.item?.name || 'صنف غير محدد'}
                              {line.originalLine.description && (
                                <span className="text-[10px] text-slate-400 block mt-0.5">{line.originalLine.description}</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-semibold text-slate-500">{line.originalLine.quantity}</td>
                            <td className="py-3 px-3 text-center font-mono font-bold text-slate-800 bg-emerald-50/40 text-emerald-700">{line.availableQuantity}</td>
                            <td className="py-3 px-3 text-center">
                              <input
                                type="number"
                                min="0.0001"
                                max={line.availableQuantity}
                                step="any"
                                value={line.quantityToReturn}
                                disabled={!line.selected}
                                onChange={(e) => {
                                  const updated = [...linesToReturn];
                                  updated[idx].quantityToReturn = parseFloat(e.target.value) || 0;
                                  setLinesToReturn(updated);
                                }}
                                className="w-24 text-center px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold focus:ring-slate-400"
                              />
                            </td>
                            <td className="py-3 px-3 text-center font-mono">{line.originalLine.unit_price}</td>
                            <td className="py-3 px-3 text-center font-mono text-slate-500">{line.originalLine.tax_rate}%</td>
                            <td className="py-3 px-3 text-left font-mono font-bold text-slate-900">
                              {line.selected ? formatNumberWithLatinDigits(estTotal) : '0.00'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-700 block">ملاحظات داخلية / إضافية</label>
              <textarea
                rows={3}
                placeholder="أضف ملاحظات اختيارية هنا تظهر في المستند المطبوع..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setViewState('list')}
                className="py-2.5 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition"
              >
                إلغاء التراجع
              </button>
              <button
                type="submit"
                disabled={saveLoading || !selectedInvoice}
                className="py-2.5 px-8 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-xs font-bold transition flex items-center gap-2 shadow-md"
                style={{ backgroundColor: '#1E293B' }}
              >
                {saveLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                حفظ الإشعار كمسودة
              </button>
            </div>
          </form>
        </div>
      )}

      {/* VIEW 3: DETAILS / VIEW VIEW */}
      {viewState === 'view' && selectedNote && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setViewState('list')}
                className="p-2 hover:bg-slate-100 rounded-full transition"
              >
                <ArrowLeft className="w-5 h-5 text-slate-500" />
              </button>
              <div>
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  تفاصيل الإشعار الدائن: <span className="font-mono text-slate-600">{selectedNote.credit_note_number}</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">عرض حالة الإشعار الدائن، البنود المرتجعة، القيود المحاسبية، ومتابعة الأذونات والاعتماد.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={() => navigate(`/print/sales-credit-note/${selectedNote.id}`)}
                className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Printer className="w-4 h-4" /> طباعة المستند
              </button>

              {selectedNote.status === 'draft' && !isViewer && (
                <>
                  {canApproveOrCancel ? (
                    <button
                      disabled={actionLoading !== null}
                      onClick={() => handleApprove(selectedNote.id)}
                      className="py-2 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition"
                    >
                      {actionLoading === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      اعتماد الإشعار
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-bold bg-slate-50 px-3 py-2 rounded-xl">بانتظار الاعتماد من محاسب / مدير</span>
                  )}
                </>
              )}

              {selectedNote.status === 'approved' && canApproveOrCancel && (
                <button
                  disabled={actionLoading !== null}
                  onClick={() => handleCancel(selectedNote.id)}
                  className="py-2 px-4 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                >
                  {actionLoading === 'cancel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  إلغاء الإشعار الدائن
                </button>
              )}
            </div>
          </div>

          {/* Overview Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-slate-50 border border-slate-150 rounded-2xl p-5">
            <div>
              <span className="text-[10px] text-slate-400 font-extrabold uppercase block mb-1">العميل</span>
              <span className="text-xs font-bold text-slate-800 block">{selectedNote.customer?.name}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-extrabold uppercase block mb-1">تاريخ الإشعار</span>
              <span className="text-xs font-bold text-slate-800 block">{selectedNote.credit_note_date}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-extrabold uppercase block mb-1">الفاتورة المرجعية</span>
              <span className="text-xs font-bold text-slate-800 block font-mono">{selectedNote.original_invoice?.invoice_number}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-extrabold uppercase block mb-1">حالة المستند</span>
              <span className="block mt-0.5">
                {selectedNote.status === 'approved' ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black bg-green-50 text-green-700 border border-green-200 gap-1 select-none">
                    معتمد
                  </span>
                ) : selectedNote.status === 'cancelled' ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-50 text-red-700 border border-red-200 gap-1 select-none">
                    ملغى
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 gap-1 select-none font-bold">
                    مسودة
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Lines */}
          <div className="space-y-3">
            <h3 className="text-xs font-black text-slate-700">البنود المشمولة بالإشعار</h3>
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold select-none">
                  <tr>
                    <th className="py-2.5 px-3 w-8 text-center">#</th>
                    <th className="py-2.5 px-3">الوصف الأصلي</th>
                    <th className="py-2.5 px-3 text-center w-24">الكمية المرتجعة</th>
                    <th className="py-2.5 px-3 text-center w-28">سعر الوحدة</th>
                    <th className="py-2.5 px-3 text-center w-24">الضريبة</th>
                    <th className="py-2.5 px-3 text-left w-32">المجموع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-sans">
                  {selectedNote.lines?.map((line, idx) => (
                    <tr key={line.id}>
                      <td className="py-3 px-3 text-center text-slate-400 font-mono font-bold">{idx + 1}</td>
                      <td className="py-3 px-3 font-bold text-slate-800">
                        {line.item?.name || 'صنف غير محدد'}
                        {line.description && (
                          <span className="text-[10px] text-slate-400 block mt-0.5">{line.description}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">{line.quantity}</td>
                      <td className="py-3 px-3 text-center font-mono">{line.unit_price}</td>
                      <td className="py-3 px-3 text-center">
                        <span className="font-mono text-slate-500">{line.tax_rate}%</span>
                        <span className="text-[10px] text-slate-400 font-mono block">({line.tax_amount})</span>
                      </td>
                      <td className="py-3 px-3 text-left font-mono font-black text-slate-900">{formatNumberWithLatinDigits(line.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Subtotals and reasons */}
          <div className="grid grid-cols-12 gap-6 pt-4 border-t border-slate-100 select-none">
            <div className="col-span-7 space-y-4 pr-1">
              {selectedNote.reason && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <span className="text-[9px] font-black text-slate-400 block mb-1">سبب الارتجاع والطلب:</span>
                  <p className="text-xs text-slate-600 font-sans">{selectedNote.reason}</p>
                </div>
              )}
              {selectedNote.notes && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <span className="text-[9px] font-black text-slate-400 block mb-1">ملاحظات إضافية للمستند المطبوع:</span>
                  <p className="text-xs text-slate-600 font-sans">{selectedNote.notes}</p>
                </div>
              )}
            </div>

            <div className="col-span-5 bg-slate-50 border border-slate-150 rounded-3xl p-6 space-y-4">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
                <span>مجموع فرعي (غير شامل للضريبة):</span>
                <span className="font-mono font-bold text-slate-800">{formatNumberWithLatinDigits(selectedNote.subtotal)} {selectedNote.currency_code}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-semibold text-slate-500 border-t border-dashed border-slate-200 pt-3">
                <span>مجموع ضريبة القيمة المضافة:</span>
                <span className="font-mono font-bold text-slate-800">{formatNumberWithLatinDigits(selectedNote.tax_amount)} {selectedNote.currency_code}</span>
              </div>
              <div className="flex justify-between items-center text-sm font-bold text-slate-800 border-t border-slate-200 pt-3">
                <span>الإجمالي الصافي:</span>
                <span className="font-mono font-black text-slate-900 text-lg">{formatNumberWithLatinDigits(selectedNote.total_amount)} {selectedNote.currency_code}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Soft Delete Reason Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4" id="soft-delete-modal-credit-notes">
          <div className="w-full max-w-md bg-white border border-slate-100 p-6 rounded-3xl shadow-2xl space-y-5 animate-fade-in text-right" style={{ direction: 'rtl' }}>
            <div className="flex items-start gap-3">
              <div className="bg-amber-50 p-2.5 rounded-2xl text-amber-600 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">نقل المستند المالي إلى سلة المحذوفات</h3>
                <p className="text-xs text-slate-400">
                  سيتم تعليق هذا المستند المالي ونقله إلى سلة المحذوفات بشكل آمن لضمان سلامة المحاسبة والقيود.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500">سبب الحذف أو الاستبعاد *</label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="يرجى كتابة سبب تفصيلي واضح لنقل هذا المستند إلى المحذوفات..."
                rows={3}
                className="w-full p-3 bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-blue rounded-xl text-xs font-semibold text-slate-700 font-sans"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleConfirmSoftDelete}
                disabled={actionLoading !== null || !deleteReason.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-extrabold rounded-xl text-xs flex items-center gap-1 cursor-pointer transition shadow-md"
              >
                {actionLoading !== null ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>نقل للمحذوفات</span>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeletingId(null);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition border border-slate-200"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
