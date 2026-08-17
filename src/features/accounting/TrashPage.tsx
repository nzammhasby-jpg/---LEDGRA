import React, { useState, useEffect } from 'react';
import { salesService } from '../../lib/salesService';
import { purchaseService } from '../../lib/purchaseService';
import { accountingService } from '../../lib/accountingService';
import { useAuth } from '../../context/AuthContext';
import { 
  Trash2, 
  RotateCcw, 
  Search, 
  Loader2, 
  CheckCircle, 
  AlertTriangle,
  User,
  Calendar,
  DollarSign,
  FileText,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TrashDocument {
  id: string;
  type: 'sales_invoice' | 'purchase_bill' | 'receipt' | 'payment' | 'sales_credit_note' | 'purchase_debit_note';
  typeAr: string;
  number: string;
  partyName: string;
  date: string;
  amount: number;
  currency: string;
  reason: string;
  deleted_at: string;
  deleted_by: string;
  deletedByName?: string;
  status: string;
}

export const TrashPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const [documents, setDocuments] = useState<TrashDocument[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string }>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Permanent Delete States
  const [permanentDeleteConfirmOpen, setPermanentDeleteConfirmOpen] = useState<boolean>(false);
  const [deletingDoc, setDeletingDoc] = useState<TrashDocument | null>(null);
  const [confirmationText, setConfirmationText] = useState<string>('');

  const handleOpenPermanentDelete = (doc: TrashDocument) => {
    setDeletingDoc(doc);
    setConfirmationText('');
    setPermanentDeleteConfirmOpen(true);
  };

  const handleConfirmPermanentDelete = async () => {
    if (!deletingDoc) return;
    if (confirmationText !== 'حذف نهائي') {
      showNotification('error', 'يرجى كتابة النص التأكيدي الصحيح "حذف نهائي".');
      return;
    }

    setActionLoading(deletingDoc.id);
    try {
      switch (deletingDoc.type) {
        case 'sales_invoice':
          await salesService.permanentlyDeleteSalesInvoice(deletingDoc.id);
          break;
        case 'purchase_bill':
          await purchaseService.permanentlyDeletePurchaseBill(deletingDoc.id);
          break;
        case 'receipt':
          await salesService.permanentlyDeleteReceipt(deletingDoc.id);
          break;
        case 'payment':
          await purchaseService.permanentlyDeletePayment(deletingDoc.id);
          break;
        case 'sales_credit_note':
          await salesService.permanentlyDeleteSalesCreditNote(deletingDoc.id);
          break;
        case 'purchase_debit_note':
          await purchaseService.permanentlyDeletePurchaseDebitNote(deletingDoc.id);
          break;
      }

      showNotification('success', `تم حذف المستند ${deletingDoc.number} نهائياً من قاعدة البيانات ولا يمكن استعادته.`);
      setPermanentDeleteConfirmOpen(false);
      setDeletingDoc(null);
      fetchTrash();
    } catch (err: any) {
      console.error('Error permanently deleting document:', err);
      showNotification('error', err.message || 'حدث خطأ غير متوقع أثناء الحذف النهائي.');
    } finally {
      setActionLoading(null);
    }
  };

  const fetchTrash = async () => {
    if (!currentOrg?.id) return;
    setLoading(true);
    try {
      // Fetch deleted documents from all 6 services in parallel
      const [
        invoices,
        bills,
        receipts,
        payments,
        creditNotes,
        debitNotes
      ] = await Promise.all([
        salesService.getSalesInvoices(currentOrg.id, { onlyDeleted: true }).catch(() => []),
        purchaseService.getPurchaseBills(currentOrg.id, { onlyDeleted: true }).catch(() => []),
        salesService.getReceipts(currentOrg.id, { onlyDeleted: true }).catch(() => []),
        purchaseService.getPayments(currentOrg.id, { onlyDeleted: true }).catch(() => []),
        salesService.getCreditNotes(currentOrg.id, { onlyDeleted: true }).catch(() => []),
        purchaseService.getPurchaseDebitNotes(currentOrg.id, { onlyDeleted: true }).catch(() => [])
      ]);

      const combined: TrashDocument[] = [];

      // Map Sales Invoices
      invoices.forEach(inv => {
        combined.push({
          id: inv.id,
          type: 'sales_invoice',
          typeAr: 'فاتورة مبيعات',
          number: inv.invoice_number,
          partyName: inv.customer?.name || 'عميل غير معروف',
          date: inv.invoice_date,
          amount: inv.total,
          currency: inv.currency || 'SAR',
          reason: inv.delete_reason || 'غير محدد',
          deleted_at: inv.deleted_at || inv.created_at,
          deleted_by: inv.deleted_by || '',
          status: inv.status
        });
      });

      // Map Purchase Bills
      bills.forEach(bill => {
        combined.push({
          id: bill.id,
          type: 'purchase_bill',
          typeAr: 'فاتورة مشتريات',
          number: bill.bill_number,
          partyName: bill.vendor?.name || 'مورد غير معروف',
          date: bill.bill_date,
          amount: bill.total,
          currency: bill.currency || 'SAR',
          reason: bill.delete_reason || 'غير محدد',
          deleted_at: bill.deleted_at || bill.created_at,
          deleted_by: bill.deleted_by || '',
          status: bill.status
        });
      });

      // Map Receipts
      receipts.forEach(rec => {
        combined.push({
          id: rec.id,
          type: 'receipt',
          typeAr: 'سند قبض',
          number: rec.receipt_number,
          partyName: rec.customer?.name || 'عميل غير معروف',
          date: rec.receipt_date,
          amount: rec.amount,
          currency: 'SAR',
          reason: rec.delete_reason || 'غير محدد',
          deleted_at: rec.deleted_at || rec.created_at,
          deleted_by: rec.deleted_by || '',
          status: rec.status
        });
      });

      // Map Payments
      payments.forEach(pay => {
        combined.push({
          id: pay.id,
          type: 'payment',
          typeAr: 'سند صرف',
          number: pay.payment_number,
          partyName: pay.vendor?.name || 'مورد غير معروف',
          date: pay.payment_date,
          amount: pay.amount,
          currency: 'SAR',
          reason: pay.delete_reason || 'غير محدد',
          deleted_at: pay.deleted_at || pay.created_at,
          deleted_by: pay.deleted_by || '',
          status: pay.status
        });
      });

      // Map Sales Credit Notes
      creditNotes.forEach(cn => {
        combined.push({
          id: cn.id,
          type: 'sales_credit_note',
          typeAr: 'إشعار دائن',
          number: cn.credit_note_number,
          partyName: cn.customer?.name || 'عميل غير معروف',
          date: cn.credit_note_date,
          amount: cn.total_amount,
          currency: cn.currency_code || 'SAR',
          reason: cn.delete_reason || 'غير محدد',
          deleted_at: cn.deleted_at || cn.created_at,
          deleted_by: cn.deleted_by || '',
          status: cn.status
        });
      });

      // Map Purchase Debit Notes
      debitNotes.forEach(dn => {
        combined.push({
          id: dn.id,
          type: 'purchase_debit_note',
          typeAr: 'إشعار مدين',
          number: dn.debit_note_number,
          partyName: dn.vendor?.name || 'مورد غير معروف',
          date: dn.debit_note_date,
          amount: dn.total_amount,
          currency: dn.currency_code || 'SAR',
          reason: dn.delete_reason || 'غير محدد',
          deleted_at: dn.deleted_at || dn.created_at,
          deleted_by: dn.deleted_by || '',
          status: dn.status
        });
      });

      // Sort by deleted_at descending
      combined.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());
      setDocuments(combined);

      // Collect unique deleted_by UUIDs to fetch profile details securely for this organization
      const userIds = Array.from(new Set(combined.map(d => d.deleted_by).filter(Boolean)));
      if (userIds.length > 0) {
        const profileMap = await accountingService.getTrashUserProfiles(currentOrg.id, userIds);
        setProfiles(profileMap);
      }
    } catch (err: any) {
      console.error('Error fetching trash documents:', err);
      showNotification('error', 'فشل في تحميل المستندات المحذوفة من السحابة.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrash();
  }, [currentOrg?.id]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  const handleRestore = async (doc: TrashDocument) => {
    // Permission checks
    if (roleInCurrentOrg === 'viewer') {
      showNotification('error', 'غير مصرح: لا يملك مستخدم العرض فقط صلاحية الاستعادة.');
      return;
    }

    if (roleInCurrentOrg === 'sales' && doc.type !== 'sales_invoice') {
      showNotification('error', 'غير مصرح: صلاحيات المبيعات تقتصر على فواتير المبيعات فقط.');
      return;
    }

    if (roleInCurrentOrg === 'sales' && doc.status !== 'draft') {
      showNotification('error', 'غير مصرح: مسؤول المبيعات يمكنه فقط استعادة فواتير مبيعات مسودة.');
      return;
    }

    setActionLoading(doc.id);
    try {
      switch (doc.type) {
        case 'sales_invoice':
          await salesService.restoreSalesInvoice(doc.id);
          break;
        case 'purchase_bill':
          await purchaseService.restorePurchaseBill(doc.id);
          break;
        case 'receipt':
          await salesService.restoreReceipt(doc.id);
          break;
        case 'payment':
          await purchaseService.restorePayment(doc.id);
          break;
        case 'sales_credit_note':
          await salesService.restoreSalesCreditNote(doc.id);
          break;
        case 'purchase_debit_note':
          await purchaseService.restorePurchaseDebitNote(doc.id);
          break;
      }

      showNotification('success', `تم استعادة المستند ${doc.number} بنجاح إلى القائمة النشطة.`);
      // Refresh list
      fetchTrash();
    } catch (err: any) {
      console.error('Error restoring document:', err);
      showNotification('error', err.message || 'فشل في استعادة المستند.');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = 
      doc.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.partyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.reason.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = selectedType === 'all' || doc.type === selectedType;

    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 left-4 z-50 p-4 rounded-2xl shadow-xl flex items-center gap-3 border text-xs font-semibold ${
              notification.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
                : 'bg-rose-50 text-rose-800 border-rose-100'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
            )}
            <span>{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header and Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-slate-900">سلة المحذوفات الآمنة (Financial Trash bin)</h2>
            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف ناعم مفعل</span>
            </span>
          </div>
          <p className="text-xs text-slate-500">
            تأمين البيانات والحسابات: هنا تعرض كافة المستندات المالية والمسودات التي تم حذفها مؤقتاً لتجنب أخطاء الإدخال. 
            <strong className="block mt-1 text-slate-600 font-bold">يمكن استعادة أو حذف المسودات فقط. المستندات المعتمدة محمية محاسبيًا ولا يمكن حذفها نهائيًا.</strong>
          </p>
        </div>
      </div>

      {/* Filters & Actions bar */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="البحث برقم المستند، العميل/المورد، أو السبب..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs font-medium pr-10 pl-4 py-2.75 bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-brand-blue focus:bg-white rounded-xl transition outline-none"
            />
          </div>

          {/* Document Type selector */}
          <div className="relative">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full text-xs font-medium px-4 py-2.75 bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-brand-blue focus:bg-white rounded-xl transition outline-none appearance-none cursor-pointer"
            >
              <option value="all">كل أنواع المستندات المحذوفة</option>
              <option value="sales_invoice">فواتير مبيعات</option>
              <option value="purchase_bill">فواتير مشتريات</option>
              <option value="receipt">سندات قبض</option>
              <option value="payment">سندات صرف</option>
              <option value="sales_credit_note">إشعارات دائنة</option>
              <option value="purchase_debit_note">إشعارات مدينة</option>
            </select>
          </div>

          {/* User Warning Hint */}
          <div className="flex items-center gap-2 bg-amber-50/50 border border-amber-100/50 p-3 rounded-xl text-[11px] text-amber-800 leading-normal">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>يمكنك استعادة المستندات المسودة لاستئنافها، بينما تمنع الحسابات حذف القيود والمستندات المعتمدة نهائياً.</span>
          </div>

        </div>
      </div>

      {/* Documents List */}
      <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-8 h-8 text-brand-blue animate-spin" />
            <span className="text-xs text-slate-500">جاري قراءة سجلات المحذوفات...</span>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-24 space-y-3">
            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300">
              <Trash2 className="w-7 h-7" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">سلة المحذوفات فارغة</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              لم نجد أي مستندات مالية محذوفة ناعماً تطابق الفلتر الحالي في منشأتك.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-4 px-6">نوع المستند</th>
                  <th className="py-4 px-6">رقم المستند</th>
                  <th className="py-4 px-6">الطرف الثاني (العميل/المورد)</th>
                  <th className="py-4 px-6">تاريخ المستند</th>
                  <th className="py-4 px-6">المبلغ الإجمالي</th>
                  <th className="py-4 px-6">سبب الحذف</th>
                  <th className="py-4 px-6">حذف بواسطة</th>
                  <th className="py-4 px-6">تاريخ الحذف</th>
                  <th className="py-4 px-6 text-center">العمليات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredDocuments.map(doc => {
                  const deletedByUser = profiles[doc.deleted_by];
                  const deleterText = deletedByUser?.full_name?.trim() || 'مستخدم النظام';

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-4 px-6 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[10px] bg-slate-100 text-slate-800 border border-slate-200/50">
                          <FileText className="w-3 h-3 text-slate-500" />
                          <span>{doc.typeAr}</span>
                        </span>
                      </td>
                      <td className="py-4 px-6 whitespace-nowrap font-mono font-bold text-slate-900">
                        {doc.number}
                      </td>
                      <td className="py-4 px-6 font-medium text-slate-800">
                        {doc.partyName}
                      </td>
                      <td className="py-4 px-6 whitespace-nowrap font-mono text-slate-500">
                        {doc.date}
                      </td>
                      <td className="py-4 px-6 whitespace-nowrap font-mono font-extrabold text-slate-900">
                        {parseFloat(doc.amount.toString()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {doc.currency}
                      </td>
                      <td className="py-4 px-6 max-w-xs truncate text-slate-500" title={doc.reason}>
                        {doc.reason}
                      </td>
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-slate-600">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{deleterText}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 whitespace-nowrap font-mono text-slate-400" title={new Date(doc.deleted_at).toLocaleString('ar-SA')}>
                        {new Date(doc.deleted_at).toLocaleDateString('ar-SA')}
                      </td>
                      <td className="py-4 px-6 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleRestore(doc)}
                            disabled={actionLoading === doc.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-blue/10 hover:bg-brand-blue text-brand-blue hover:text-white rounded-lg text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
                          >
                            {actionLoading === doc.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                            <span>استعادة</span>
                          </button>

                          {(roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin') && doc.status === 'draft' && (
                            <button
                              onClick={() => handleOpenPermanentDelete(doc)}
                              disabled={actionLoading !== null}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-red-600 text-rose-700 hover:text-white rounded-lg text-[11px] font-bold transition cursor-pointer disabled:opacity-50 border border-rose-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف نهائي</span>
                            </button>
                          )}

                          {doc.status !== 'draft' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold border border-slate-200">
                              <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>محمي محاسبيًا</span>
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Permanent Delete Confirmation Modal */}
      {permanentDeleteConfirmOpen && deletingDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-100 p-6 rounded-3xl shadow-2xl space-y-5 animate-fade-in text-right" style={{ direction: 'rtl' }}>
            <div className="flex items-start gap-3">
              <div className="bg-rose-50 p-2.5 rounded-2xl text-rose-600 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">تأكيد الحذف النهائي والصارم</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  هذا الإجراء <strong className="text-rose-600">نهائي ولا يمكن التراجع عنه</strong> بأي شكل من الأشكال. سيتم مسح المستند <strong className="text-slate-950 font-semibold">{deletingDoc.number}</strong> بالكامل وتطهير سطوره وحركاته المرتبطة من قاعدة البيانات.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">نوع المستند:</span>
                <span className="font-bold text-slate-700">{deletingDoc.typeAr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">رقم المستند:</span>
                <span className="font-mono font-bold text-slate-800">{deletingDoc.number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">القيمة المالية:</span>
                <span className="font-mono font-bold text-slate-800">
                  {parseFloat(deletingDoc.amount.toString()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {deletingDoc.currency}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 block">
                لتأكيد الحذف التام والنهائي، يرجى كتابة عبارة <span className="text-rose-600 font-extrabold">حذف نهائي</span> في الحقل أدناه:
              </label>
              <input
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder="اكتب: حذف نهائي"
                className="w-full p-3 bg-slate-50 border border-slate-200 focus:outline-none focus:border-rose-500 focus:bg-white rounded-xl text-xs font-bold text-slate-800 font-sans text-center"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleConfirmPermanentDelete}
                disabled={actionLoading !== null || confirmationText !== 'حذف نهائي'}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition shadow-md"
              >
                {actionLoading === deletingDoc.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>حذف نهائي وتطهير</span>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setPermanentDeleteConfirmOpen(false);
                  setDeletingDoc(null);
                  setConfirmationText('');
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition border border-slate-200"
              >
                إلغاء الإجراء
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
