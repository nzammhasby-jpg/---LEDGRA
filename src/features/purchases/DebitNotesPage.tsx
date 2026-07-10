import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { purchaseService } from '../../lib/purchaseService';
import { masterDataService } from '../../lib/masterDataService';
import { PurchaseDebitNote, PurchaseBill, PurchaseBillLine, Vendor } from '../../types';
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

export const DebitNotesPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Role permissions
  const canApproveOrCancel = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant';
  const isViewer = roleInCurrentOrg === 'viewer';
  const isSales = roleInCurrentOrg === 'sales';

  // Redirect if sales role attempts access
  useEffect(() => {
    if (isSales) {
      navigate('/');
    }
  }, [isSales, navigate]);

  // Core lists
  const [debitNotes, setDebitNotes] = useState<PurchaseDebitNote[]>([]);
  const [approvedBills, setApprovedBills] = useState<PurchaseBill[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // View States: 'list' | 'add' | 'view'
  const [viewState, setViewState] = useState<'list' | 'add' | 'view'>('list');
  const [selectedNote, setSelectedNote] = useState<PurchaseDebitNote | null>(null);

  // Form State for creating PDN
  const [selectedBill, setSelectedBill] = useState<PurchaseBill | null>(null);
  const [debitNoteDate, setDebitNoteDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [linesToReturn, setLinesToReturn] = useState<Array<{
    originalLine: PurchaseBillLine;
    quantityToReturn: number;
    availableQuantity: number;
    selected: boolean;
  }>>([]);

  // Search/Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Loading triggers
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Load basic data
  useEffect(() => {
    if (currentOrg?.id && !isSales) {
      loadData();
    }
  }, [currentOrg?.id, isSales]);

  // Check query params if navigated from a purchase bill
  useEffect(() => {
    const billIdParam = searchParams.get('billId');
    if (billIdParam && approvedBills.length > 0) {
      const bill = approvedBills.find(b => b.id === billIdParam);
      if (bill) {
        handleStartReturnForBill(bill);
      }
    }
  }, [searchParams, approvedBills]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [notesData, billsData] = await Promise.all([
        purchaseService.getPurchaseDebitNotes(currentOrg!.id),
        purchaseService.getPurchaseBills(currentOrg!.id)
      ]);
      setDebitNotes(notesData);
      // Only approved bills that are not cancelled are eligible for return
      setApprovedBills(billsData.filter(bill => bill.status === 'approved' || bill.payment_status === 'paid' || bill.payment_status === 'partially_paid'));
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleStartReturnForBill = async (bill: PurchaseBill) => {
    setError(null);
    setSaveLoading(true);
    try {
      // Fetch full bill detail with lines
      const fullBill = await purchaseService.getPurchaseBill(currentOrg!.id, bill.id);
      setSelectedBill(fullBill);
      
      // Calculate remaining quantities available to return for each line
      const linesWithAvailable = await Promise.all((fullBill.lines || []).map(async (line) => {
        // Find total quantity already returned in APPROVED debit notes
        let returnedQty = 0;
        debitNotes.forEach(dn => {
          if (dn.status === 'approved' && dn.original_bill_id === bill.id) {
            dn.lines?.forEach(dn_l => {
              if (dn_l.original_bill_line_id === line.id) {
                returnedQty += Number(dn_l.quantity);
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

  const handleCreateDebitNote = async (approveImmediately: boolean) => {
    if (!selectedBill) return;

    setError(null);
    const selectedLines = linesToReturn.filter(l => l.selected && l.quantityToReturn > 0);
    if (selectedLines.length === 0) {
      setError('يرجى تحديد بند واحد على الأقل مع تحديد كمية أكبر من الصفر للإرجاع.');
      return;
    }

    // Verify quantity bounds
    for (const line of selectedLines) {
      if (line.quantityToReturn > line.availableQuantity) {
        setError(`الكمية المحددة للبند (${line.originalLine.description || 'صنف'}) تتجاوز الكمية المتاحة للإرجاع (${line.availableQuantity}).`);
        return;
      }
    }

    setSaveLoading(true);
    try {
      // 1. Create Debit Note Header
      const debitNoteId = await purchaseService.createPurchaseDebitNote(currentOrg!.id, {
        original_bill_id: selectedBill.id,
        debit_note_date: debitNoteDate,
        reason: reason,
        notes: notes
      });

      // 2. Add lines sequentially
      for (const line of selectedLines) {
        await purchaseService.addPurchaseDebitNoteLine(
          debitNoteId,
          line.originalLine.id,
          line.quantityToReturn
        );
      }

      // 3. Optional Immediate approval
      if (approveImmediately) {
        await purchaseService.approvePurchaseDebitNote(debitNoteId);
      }

      // Reload
      await loadData();
      setViewState('list');
      setSelectedBill(null);
      setReason('');
      setNotes('');
      setLinesToReturn([]);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleViewDetails = async (note: PurchaseDebitNote) => {
    setLoading(true);
    setError(null);
    try {
      const fullNote = await purchaseService.getPurchaseDebitNote(currentOrg!.id, note.id);
      setSelectedNote(fullNote);
      setViewState('view');
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleApproveNote = async (noteId: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في اعتماد مرتجع المشتريات / الإشعار المدين هذا؟ سيتم إخراج الكميات من المخزون وإنشاء قيد محاسبي تلقائي متوازن.')) return;
    setActionLoading('approve');
    setError(null);
    try {
      await purchaseService.approvePurchaseDebitNote(noteId);
      await loadData();
      // Reload details if viewed
      if (selectedNote && selectedNote.id === noteId) {
        const updatedNote = await purchaseService.getPurchaseDebitNote(currentOrg!.id, noteId);
        setSelectedNote(updatedNote);
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelNote = async (noteId: string) => {
    const reasonPrompt = window.prompt('يرجى كتابة سبب إلغاء إشعار المشتريات المدين هذا لتوثيقه محاسبياً:');
    if (reasonPrompt === null) return; // cancelled
    if (!reasonPrompt.trim()) {
      alert('يجب كتابة سبب الإلغاء محاسبياً.');
      return;
    }

    setActionLoading('cancel');
    setError(null);
    try {
      await purchaseService.cancelPurchaseDebitNote(noteId, reasonPrompt);
      await loadData();
      if (selectedNote && selectedNote.id === noteId) {
        const updatedNote = await purchaseService.getPurchaseDebitNote(currentOrg!.id, noteId);
        setSelectedNote(updatedNote);
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // Filter and search notes
  const filteredNotes = debitNotes.filter(note => {
    const matchesSearch = 
      note.debit_note_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (note.vendor?.name_ar || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (note.reason || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || note.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 font-sans select-none" dir="rtl">
      
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-6 bg-red-500 rounded-full inline-block" />
            <span>مرتجع المشتريات والإشعارات المدينة للموردين</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">تتبع مرتجعات المشتريات، وتسجيل الإشعارات المدينة، ومطابقة القيود والمخازن آلياً</p>
        </div>

        {viewState === 'list' && !isViewer && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={loadData}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition cursor-pointer"
              title="تحديث البيانات"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            
            {/* Simple selection dropdown to start return from approved bills */}
            <select
              onChange={(e) => {
                const bill = approvedBills.find(b => b.id === e.target.value);
                if (bill) {
                  handleStartReturnForBill(bill);
                }
                e.target.value = '';
              }}
              className="px-4 py-2.5 bg-brand-navy hover:bg-brand-navy/95 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer outline-none shadow-sm"
              defaultValue=""
            >
              <option value="" disabled>+ إنشاء إشعار مدين جديد</option>
              {approvedBills.map(bill => (
                <option key={bill.id} value={bill.id}>
                  {bill.bill_number} - {bill.vendor?.name_ar} ({bill.total} {bill.currency})
                </option>
              ))}
            </select>
          </div>
        )}

        {viewState !== 'list' && (
          <button
            onClick={() => {
              setViewState('list');
              setSelectedBill(null);
              setSelectedNote(null);
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 ml-1" />
            <span>العودة للقائمة</span>
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-start gap-3 text-red-700 text-xs animate-shake">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">تنبيه محاسبي / فني:</p>
            <p className="leading-relaxed font-mono">{error}</p>
          </div>
        </div>
      )}

      {/* VIEW STATE: LIST */}
      {viewState === 'list' && (
        <>
          {/* Filters Bar */}
          <div className="bg-white border border-slate-100 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث برقم الإشعار، المورد، السبب..."
                className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none focus:border-slate-300 transition"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
              <span className="text-[11px] text-slate-400 font-bold shrink-0">حالة المستند:</span>
              {['all', 'draft', 'approved', 'cancelled'].map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition cursor-pointer ${
                    statusFilter === status 
                      ? 'bg-slate-800 text-white shadow-sm' 
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {status === 'all' && 'الكل'}
                  {status === 'draft' && 'مسودة'}
                  {status === 'approved' && 'معتمد'}
                  {status === 'cancelled' && 'ملغى'}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex justify-center items-center py-20 bg-white border border-slate-100 rounded-3xl">
              <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-3xl p-16 text-center text-slate-400 space-y-4 shadow-sm">
              <FileText className="w-16 h-16 text-slate-200 mx-auto" />
              <div className="space-y-1">
                <p className="font-bold text-slate-600 text-sm">لا توجد إشعارات مدينة حالياً</p>
                <p className="text-xs">اختر فاتورة شراء معتمدة من الأعلى لبدء عملية الإرجاع.</p>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                    <th className="p-4">رقم الإشعار</th>
                    <th className="p-4">التاريخ</th>
                    <th className="p-4">المورد</th>
                    <th className="p-4">الفاتورة الأصلية</th>
                    <th className="p-4">المبلغ الخاضع للضريبة</th>
                    <th className="p-4">الضريبة</th>
                    <th className="p-4">الإجمالي</th>
                    <th className="p-4">الحالة</th>
                    <th className="p-4 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {filteredNotes.map(note => (
                    <tr key={note.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-4 font-bold font-mono text-slate-900">{note.debit_note_number}</td>
                      <td className="p-4 text-slate-500">{note.debit_note_date}</td>
                      <td className="p-4 font-bold text-slate-800">{note.vendor?.name_ar || note.vendor?.name_en}</td>
                      <td className="p-4 font-mono text-[11px] text-slate-500">
                        {note.original_bill?.bill_number}
                      </td>
                      <td className="p-4 font-bold">{formatNumberWithLatinDigits(note.subtotal)} {note.currency_code}</td>
                      <td className="p-4 text-slate-500">{formatNumberWithLatinDigits(note.tax_amount)} {note.currency_code}</td>
                      <td className="p-4 font-bold text-slate-900 text-sm">{formatNumberWithLatinDigits(note.total_amount)} {note.currency_code}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          note.status === 'approved' 
                            ? 'bg-green-100 text-green-800' 
                            : note.status === 'cancelled'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {note.status === 'approved' && 'معتمد'}
                          {note.status === 'cancelled' && 'ملغى'}
                          {note.status === 'draft' && 'مسودة'}
                        </span>
                      </td>
                      <td className="p-4 text-center flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleViewDetails(note)}
                          className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          title="عرض التفاصيل"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        
                        {note.status === 'draft' && canApproveOrCancel && (
                          <button
                            onClick={() => handleApproveNote(note.id)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition cursor-pointer"
                            title="اعتماد الإشعار"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}

                        {note.status === 'approved' && canApproveOrCancel && (
                          <button
                            onClick={() => handleCancelNote(note.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                            title="إلغاء وعكس الإشعار"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        
                        <button
                          onClick={() => navigate(`/print/purchase-debit-note/${note.id}`)}
                          className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          title="طباعة A4"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* VIEW STATE: ADD FORM */}
      {viewState === 'add' && selectedBill && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 md:p-8 space-y-6 shadow-sm">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-sm font-bold text-slate-800">تجهيز مرتجع مشتريات للفاتورة الأصلية: {selectedBill.bill_number}</h3>
            <p className="text-xs text-slate-400 mt-1 font-mono">تاريخ الفاتورة: {selectedBill.bill_date} l المورد: {selectedBill.vendor?.name_ar} l العملة: {selectedBill.currency}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500">تاريخ إشعار المرتجع</label>
              <input
                type="date"
                value={debitNoteDate}
                onChange={(e) => setDebitNoteDate(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none focus:border-slate-300 font-mono"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500">سبب الإرجاع</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: بضاعة تالفة، عدم مطابقة للمواصفات..."
                className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none focus:border-slate-300"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500">ملاحظات إضافية</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أية تفاصيل إضافية للتوثيق..."
                className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none focus:border-slate-300"
              />
            </div>
          </div>

          {/* Lines Table */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700">بنود الفاتورة المتاحة للإرجاع:</h4>
            <div className="border border-slate-100 rounded-2xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                    <th className="p-3 w-12 text-center">إرجاع؟</th>
                    <th className="p-3">الصنف / الوصف</th>
                    <th className="p-3 text-center">الكمية الأصلية</th>
                    <th className="p-3 text-center">المتاح للإرجاع</th>
                    <th className="p-3 text-center">كمية المرتجع الحالي</th>
                    <th className="p-3">سعر الشراء</th>
                    <th className="p-3">الضريبة</th>
                    <th className="p-3">الإجمالي الحالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {linesToReturn.map((line, idx) => {
                    const currentLineSubtotal = roundPrice(line.quantityToReturn * Number(line.originalLine.unit_cost));
                    const currentLineTax = roundPrice(currentLineSubtotal * (Number(line.originalLine.tax_rate) / 100));
                    const currentLineTotal = roundPrice(currentLineSubtotal + currentLineTax);

                    return (
                      <tr key={line.originalLine.id} className={`hover:bg-slate-50/50 transition ${line.selected ? 'bg-amber-50/20' : ''}`}>
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={line.selected}
                            disabled={line.availableQuantity <= 0}
                            onChange={(e) => {
                              const updated = [...linesToReturn];
                              updated[idx].selected = e.target.checked;
                              setLinesToReturn(updated);
                            }}
                            className="w-4 h-4 accent-amber-500"
                          />
                        </td>
                        <td className="p-3">
                          <p className="font-bold text-slate-800">{line.originalLine.item?.name || 'بند شراء غير مخزني'}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{line.originalLine.description}</p>
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-500">{Number(line.originalLine.quantity)}</td>
                        <td className="p-3 text-center font-mono font-bold text-green-700">{line.availableQuantity}</td>
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            min="0.0001"
                            step="any"
                            value={line.quantityToReturn}
                            disabled={!line.selected}
                            onChange={(e) => {
                              const updated = [...linesToReturn];
                              updated[idx].quantityToReturn = Number(e.target.value);
                              setLinesToReturn(updated);
                            }}
                            className="w-24 text-center px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-amber-500 font-mono font-bold disabled:bg-slate-50 disabled:text-slate-400"
                          />
                        </td>
                        <td className="p-3 font-mono">{formatNumberWithLatinDigits(line.originalLine.unit_cost)} {selectedBill.currency}</td>
                        <td className="p-3 text-slate-400 font-mono">{line.originalLine.tax_rate}%</td>
                        <td className="p-3 font-bold font-mono text-slate-800">
                          {line.selected ? `${formatNumberWithLatinDigits(currentLineTotal)} ${selectedBill.currency}` : '0.00'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer controls */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-t border-slate-100 pt-5">
            <div className="text-right space-y-1">
              <span className="text-xs text-slate-400 font-bold">الملخص الإجمالي المقدر للمرتجع:</span>
              <p className="text-lg font-black text-slate-900">
                {formatNumberWithLatinDigits(
                  linesToReturn.reduce((sum, line) => {
                    if (!line.selected) return sum;
                    const sub = line.quantityToReturn * Number(line.originalLine.unit_cost);
                    const tax = sub * (Number(line.originalLine.tax_rate) / 100);
                    return sum + sub + tax;
                  }, 0)
                )} {selectedBill.currency}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
              <button
                type="button"
                onClick={() => handleCreateDebitNote(false)}
                disabled={saveLoading}
                className="flex-1 md:flex-none px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {saveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>حفظ كمسودة (Draft)</span>
              </button>

              {canApproveOrCancel && (
                <button
                  type="button"
                  onClick={() => handleCreateDebitNote(true)}
                  disabled={saveLoading}
                  className="flex-1 md:flex-none px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {saveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  <span>اعتماد وإغلاق فوري</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW STATE: DETAILS VIEW */}
      {viewState === 'view' && selectedNote && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 md:p-8 space-y-6 shadow-sm">
          
          {/* Header Info Banner */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400">إشعار مدين للمورد</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                  selectedNote.status === 'approved' 
                    ? 'bg-green-100 text-green-800' 
                    : selectedNote.status === 'cancelled'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {selectedNote.status === 'approved' && 'معتمد ومرحّل'}
                  {selectedNote.status === 'cancelled' && 'ملغى'}
                  {selectedNote.status === 'draft' && 'مسودة'}
                </span>
              </div>
              <h2 className="text-xl font-black text-slate-800 mt-1">{selectedNote.debit_note_number}</h2>
              <p className="text-xs text-slate-400 mt-0.5">مرتبط بفاتورة الشراء الأصلية: {selectedNote.original_bill?.bill_number}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate(`/print/purchase-debit-note/${selectedNote.id}`)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة A4</span>
              </button>

              {selectedNote.status === 'draft' && canApproveOrCancel && (
                <button
                  onClick={() => handleApproveNote(selectedNote.id)}
                  disabled={actionLoading !== null}
                  className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  {actionLoading === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  <span>اعتماد المرتجع</span>
                </button>
              )}

              {selectedNote.status === 'approved' && canApproveOrCancel && (
                <button
                  onClick={() => handleCancelNote(selectedNote.id)}
                  disabled={actionLoading !== null}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  {actionLoading === 'cancel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  <span>إلغاء الإشعار وعكسه</span>
                </button>
              )}
            </div>
          </div>

          {/* Summary Fields Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50/55 p-4 rounded-2xl border border-slate-100/60">
            <div>
              <span className="text-[11px] text-slate-400">تاريخ الإشعار</span>
              <p className="text-xs font-black text-slate-800 font-mono mt-0.5">{selectedNote.debit_note_date}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate-400">المورد الشريك</span>
              <p className="text-xs font-black text-slate-800 mt-0.5">{selectedNote.vendor?.name_ar || selectedNote.vendor?.name_en}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate-400">سبب الإرجاع</span>
              <p className="text-xs font-black text-slate-800 mt-0.5">{selectedNote.reason || 'غير محدد'}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate-400">الرقم المحاسبي التلقائي للقيد (JV)</span>
              <p className="text-xs font-black text-blue-600 font-mono mt-0.5">
                {selectedNote.journal_entry_id ? `#${selectedNote.journal_entry_id.substring(0,8)}` : 'غير مرحّل بعد'}
              </p>
            </div>
          </div>

          {/* Items Detail Lines */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700">البنود المرتجعة المشمولة بالإشعار:</h4>
            <div className="border border-slate-100 rounded-2xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                    <th className="p-3">الصنف / البند</th>
                    <th className="p-3 text-center">الكمية المرتجعة</th>
                    <th className="p-3">سعر الوحدة</th>
                    <th className="p-3">نسبة الضريبة</th>
                    <th className="p-3">المبلغ الخاضع</th>
                    <th className="p-3">الضريبة</th>
                    <th className="p-3">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selectedNote.lines || []).map(line => (
                    <tr key={line.id} className="hover:bg-slate-50/20">
                      <td className="p-3">
                        <p className="font-bold text-slate-800">{line.item?.name || 'بند شراء غير مخزني'}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{line.description}</p>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-slate-900">{Number(line.quantity)}</td>
                      <td className="p-3 font-mono">{formatNumberWithLatinDigits(line.unit_price)} {selectedNote.currency_code}</td>
                      <td className="p-3 text-slate-400 font-mono">{Number(line.tax_rate)}%</td>
                      <td className="p-3 font-mono">{formatNumberWithLatinDigits(line.subtotal)} {selectedNote.currency_code}</td>
                      <td className="p-3 font-mono text-slate-400">{formatNumberWithLatinDigits(line.tax_amount)} {selectedNote.currency_code}</td>
                      <td className="p-3 font-black font-mono text-slate-900">{formatNumberWithLatinDigits(line.total_amount)} {selectedNote.currency_code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes and financial summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-100 pt-5">
            <div className="space-y-2">
              <span className="text-[11px] text-slate-400 font-bold">ملاحظات وشروط المستند:</span>
              <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl min-h-[50px] leading-relaxed">
                {selectedNote.notes || 'لا توجد ملاحظات إضافية مسجلة على هذا المرتجع.'}
              </p>

              {selectedNote.status === 'cancelled' && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-800 text-xs rounded-xl space-y-1">
                  <span className="font-bold">سبب الإلغاء وعكس الحركة محاسبياً:</span>
                  <p className="font-mono leading-relaxed">{selectedNote.cancel_reason}</p>
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl space-y-3 font-mono border border-slate-100/60 max-w-sm mr-auto w-full">
              <div className="flex justify-between text-xs text-slate-500">
                <span>المجموع الخاضع للضريبة:</span>
                <span className="font-bold">{formatNumberWithLatinDigits(selectedNote.subtotal)} {selectedNote.currency_code}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>إجمالي قيمة الضريبة:</span>
                <span className="font-bold">{formatNumberWithLatinDigits(selectedNote.tax_amount)} {selectedNote.currency_code}</span>
              </div>
              <hr className="border-slate-200" />
              <div className="flex justify-between text-sm text-slate-800">
                <span className="font-bold">الإجمالي النهائي للمستند:</span>
                <span className="text-base font-black text-slate-900">{formatNumberWithLatinDigits(selectedNote.total_amount)} {selectedNote.currency_code}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Simple utility rounding functions
function roundPrice(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}
