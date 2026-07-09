import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { bankingService } from '../../lib/bankingService';
import { CashBankAccount, CashBankTransfer, CashBankTransferStatus } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { 
  Landmark, 
  Wallet, 
  Search, 
  Plus, 
  X, 
  ArrowRightLeft,
  ArrowRight,
  Eye,
  CheckCircle2, 
  XCircle, 
  FileText, 
  AlertCircle,
  Loader2,
  Lock,
  Calendar,
  Sparkles,
  Info,
  ChevronLeft
} from 'lucide-react';

export const CashBankTransfersPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  
  // Permissions
  const isSales = roleInCurrentOrg === 'sales';
  const isReadOnly = roleInCurrentOrg === 'viewer';
  const canManage = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant';

  // State
  const [transfers, setTransfers] = useState<CashBankTransfer[]>([]);
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [selectedTransferForCancel, setSelectedTransferForCancel] = useState<CashBankTransfer | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  // View Details Modal state
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState<boolean>(false);
  const [selectedTransferDetails, setSelectedTransferDetails] = useState<CashBankTransfer | null>(null);

  // Create Form State
  const [transferDate, setTransferDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [fromAccountId, setFromAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id && !isSales) {
      loadData();
    }
  }, [currentOrg?.id, isSales, statusFilter, fromDate, toDate]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [allTransfers, allAccounts] = await Promise.all([
        bankingService.listCashBankTransfers(
          currentOrg!.id,
          statusFilter === 'all' ? null : statusFilter,
          fromDate || null,
          toDate || null
        ),
        bankingService.listCashBankAccounts(currentOrg!.id)
      ]);

      setTransfers(allTransfers);
      setAccounts(allAccounts);

      // Pre-populate creation form default accounts if active
      const activeAccounts = allAccounts.filter(a => a.is_active);
      if (activeAccounts.length >= 2) {
        setFromAccountId(activeAccounts[0].id);
        setToAccountId(activeAccounts[1].id);
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setFormError(null);
    setTransferDate(new Date().toISOString().split('T')[0]);
    setDescription('');
    setReferenceNumber('');
    setAmount('');
    
    const activeAccounts = accounts.filter(a => a.is_active);
    if (activeAccounts.length >= 2) {
      setFromAccountId(activeAccounts[0].id);
      setToAccountId(activeAccounts[1].id);
    } else {
      setFromAccountId('');
      setToAccountId('');
    }
    
    setIsCreateModalOpen(true);
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) {
      setFormError('غير مصرح: لا تملك صلاحيات كافية لإنشاء تحويلات.');
      return;
    }

    if (!transferDate) {
      setFormError('يرجى اختيار تاريخ التحويل.');
      return;
    }

    if (!fromAccountId) {
      setFormError('يرجى تحديد الحساب المحول منه.');
      return;
    }

    if (!toAccountId) {
      setFormError('يرجى تحديد الحساب المحول إليه.');
      return;
    }

    if (fromAccountId === toAccountId) {
      setFormError('لا يمكن التحويل من الحساب إلى نفسه. يرجى تحديد حسابين مختلفين.');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('مبلغ التحويل يجب أن يكون أكبر من الصفر.');
      return;
    }

    setActionLoading(true);
    setFormError(null);

    try {
      await bankingService.createCashBankTransfer({
        organization_id: currentOrg!.id,
        transfer_date: transferDate,
        from_cash_bank_account_id: fromAccountId,
        to_cash_bank_account_id: toAccountId,
        amount: numAmount,
        description: description.trim() || null,
        reference_number: referenceNumber.trim() || null
      });

      setIsCreateModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFormError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveTransfer = async (transfer: CashBankTransfer) => {
    if (!canManage) return;
    if (!window.confirm(`هل أنت متأكد من اعتماد مستند التحويل رقم ${transfer.transfer_number}؟ سيتم ترحيل قيد محاسبي فوري وتحديث أرصدة الحسابات المحول منها وإليها.`)) {
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      await bankingService.approveCashBankTransfer(transfer.id);
      await loadData();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenCancelModal = (transfer: CashBankTransfer) => {
    setSelectedTransferForCancel(transfer);
    setCancelReason('');
    setCancelError(null);
    setIsCancelModalOpen(true);
  };

  const handleCancelTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !selectedTransferForCancel) return;

    if (!cancelReason.trim()) {
      setCancelError('يرجى كتابة سبب الإلغاء للمتابعة.');
      return;
    }

    setActionLoading(true);
    setCancelError(null);

    try {
      await bankingService.cancelCashBankTransfer(selectedTransferForCancel.id, cancelReason.trim());
      setIsCancelModalOpen(false);
      setSelectedTransferForCancel(null);
      await loadData();
    } catch (err: any) {
      setCancelError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewDetails = (transfer: CashBankTransfer) => {
    setSelectedTransferDetails(transfer);
    setIsDetailsModalOpen(true);
  };

  // Safe checks for Sales access
  if (isSales) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-right p-6 font-sans bg-white border border-slate-150 rounded-xl" dir="rtl">
        <Lock className="w-16 h-16 text-red-500 mb-4 animate-bounce" />
        <h3 className="text-xl font-black text-slate-800 mb-2">غير مصرح بدخول الصفحة</h3>
        <p className="text-sm text-slate-500 max-w-md text-center leading-relaxed">
          عذراً، صفحة التحويلات الداخلية بين الصناديق والبنوك غير متاحة لذوي صلاحية المبيعات (Sales). يرجى مراجعة إدارة النظام لتعديل الصلاحيات.
        </p>
      </div>
    );
  }

  // Active accounts only
  const activeAccounts = accounts.filter(a => a.is_active);

  // Filter transfers by search query
  const filteredTransfers = transfers.filter(t => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchNum = t.transfer_number.toLowerCase().includes(q);
    const matchRef = t.reference_number?.toLowerCase().includes(q) || false;
    const matchDesc = t.description?.toLowerCase().includes(q) || false;
    const matchFrom = t.from_account_name.toLowerCase().includes(q);
    const matchTo = t.to_account_name.toLowerCase().includes(q);
    return matchNum || matchRef || matchDesc || matchFrom || matchTo;
  });

  // Calculate statistics (Approved, Draft, Cancelled, and total amounts)
  const approvedTransfers = transfers.filter(t => t.status === 'approved');
  const draftTransfers = transfers.filter(t => t.status === 'draft');
  const cancelledTransfers = transfers.filter(t => t.status === 'cancelled');

  const totalApprovedAmount = approvedTransfers.reduce((sum, t) => sum + Number(t.amount), 0);
  const displayCurrency = currentOrg?.currency_code || '';

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl" id="cash-bank-transfers-page">
      {/* Header section */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">التحويلات النقدية الداخلية (Internal Money Transfers)</h2>
            <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>أمان عالي وقيد تلقائي</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            تنفيذ تحويلات النقدية والسيولة بين الصناديق النقدية والحسابات البنكية داخل نفس المنشأة بسلامة محاسبية تامة.
          </p>
        </div>

        {canManage && (
          <button
            onClick={handleOpenCreateModal}
            className="cursor-pointer bg-brand-blue hover:bg-brand-blue-dark text-white px-5 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-sm shrink-0"
            id="create-transfer-btn"
          >
            <Plus className="w-4 h-4" />
            <span>تحويل داخلي جديد</span>
          </button>
        )}
      </div>

      {/* Statistics Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {/* Total Approved Amount */}
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-500 block">إجمالي التحويلات المعتمدة</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900">
                {totalApprovedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] font-bold text-slate-400">{displayCurrency}</span>
            </div>
          </div>
          <div className="p-3 bg-brand-blue/10 rounded-xl text-brand-blue">
            <ArrowRightLeft className="w-6 h-6" />
          </div>
        </div>

        {/* Approved Transfers Count */}
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-500 block">التحويلات المعتمدة</span>
            <span className="text-xl font-black text-slate-900">{approvedTransfers.length}</span>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Draft Transfers Count */}
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-500 block">المسودات الحالية</span>
            <span className="text-xl font-black text-amber-600">{draftTransfers.length}</span>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <Info className="w-6 h-6" />
          </div>
        </div>

        {/* Cancelled Transfers Count */}
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-500 block">التحويلات الملغاة</span>
            <span className="text-xl font-black text-rose-600">{cancelledTransfers.length}</span>
          </div>
          <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
            <XCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Filter Section */}
      <div className="bg-white border border-slate-100 rounded-xl p-4 space-y-4 shadow-xs">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search Query */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            <input
              type="text"
              placeholder="البحث برقم التحويل، الحساب المصدر، الحساب الوجهة أو الوصف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pr-9 pl-4 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right text-slate-800"
            />
          </div>

          {/* Status Filter */}
          <div className="w-full sm:w-44">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right text-slate-800"
            >
              <option value="all">كل الحالات</option>
              <option value="draft">مسودة (Draft)</option>
              <option value="approved">معتمد (Approved)</option>
              <option value="cancelled">ملغى (Cancelled)</option>
            </select>
          </div>

          {/* Date from */}
          <div className="w-full sm:w-44 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap shrink-0">من:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-transparent text-xs outline-none text-right"
            />
          </div>

          {/* Date to */}
          <div className="w-full sm:w-44 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap shrink-0">إلى:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-transparent text-xs outline-none text-right"
            />
          </div>
        </div>
      </div>

      {/* System Status/Error Alerts */}
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-start gap-3 border border-red-100 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div className="space-y-1">
            <p className="font-bold">حدث خطأ أثناء المعالجة:</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Main List Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] bg-white border border-slate-100 rounded-xl">
          <Loader2 className="w-10 h-10 text-brand-blue animate-spin mb-2" />
          <span className="text-xs text-slate-500">جاري تحميل سجلات التحويلات الداخلية...</span>
        </div>
      ) : filteredTransfers.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] bg-white border border-slate-100 rounded-xl p-8">
          <Info className="w-12 h-12 text-slate-300 mb-2" />
          <h4 className="text-sm font-bold text-slate-700">لا توجد عمليات تحويل متوفرة</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm text-center leading-relaxed">
            {searchQuery || statusFilter !== 'all' || fromDate || toDate
              ? 'لا توجد نتائج تطابق معايير الفرز والبحث المحددة حالياً.'
              : 'لم يتم تسجيل أي عمليات تحويل نقدية داخلية في هذا الحساب حتى الآن.'}
          </p>
          {!searchQuery && canManage && (
            <button
              onClick={handleOpenCreateModal}
              className="mt-4 cursor-pointer bg-brand-blue hover:bg-brand-blue-dark text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء أول تحويل</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-100 font-extrabold">
                <tr>
                  <th className="p-4">رقم التحويل</th>
                  <th className="p-4">تاريخ المستند</th>
                  <th className="p-4">من حساب (المنبع)</th>
                  <th className="p-4">إلى حساب (المصب)</th>
                  <th className="p-4 text-left">المبلغ</th>
                  <th className="p-4 text-center">الحالة</th>
                  <th className="p-4">القيد المحاسبي</th>
                  <th className="p-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredTransfers.map((transfer) => {
                  return (
                    <tr key={transfer.id} className="hover:bg-slate-50/50 transition duration-150">
                      {/* Number */}
                      <td className="p-4 font-bold text-slate-900 whitespace-nowrap">
                        {transfer.transfer_number}
                      </td>
                      {/* Date */}
                      <td className="p-4 whitespace-nowrap text-slate-500">
                        {transfer.transfer_date}
                      </td>
                      {/* From */}
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          {transfer.from_account_type === 'cash' ? (
                            <Wallet className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          ) : (
                            <Landmark className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          )}
                          <span className="font-medium">{transfer.from_account_name}</span>
                        </div>
                      </td>
                      {/* To */}
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          {transfer.to_account_type === 'cash' ? (
                            <Wallet className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          ) : (
                            <Landmark className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          )}
                          <span className="font-medium">{transfer.to_account_name}</span>
                        </div>
                      </td>
                      {/* Amount */}
                      <td className="p-4 font-black text-slate-900 text-left whitespace-nowrap">
                        {Number(transfer.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {transfer.currency_code}
                      </td>
                      {/* Status */}
                      <td className="p-4 text-center whitespace-nowrap">
                        {transfer.status === 'draft' && (
                          <span className="bg-amber-50 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-100">
                            مسودة
                          </span>
                        )}
                        {transfer.status === 'approved' && (
                          <span className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-100">
                            معتمد
                          </span>
                        )}
                        {transfer.status === 'cancelled' && (
                          <span className="bg-rose-50 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-100">
                            ملغى
                          </span>
                        )}
                      </td>
                      {/* Journal Entry Link */}
                      <td className="p-4 whitespace-nowrap">
                        {transfer.journal_entry_id ? (
                          <span className="text-emerald-700 font-bold text-[11px] bg-emerald-50 px-2 py-1 rounded">
                            قيد تلقائي معتمد
                          </span>
                        ) : (
                          <span className="text-slate-400">قيد مسودة معلق</span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="p-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          {/* View details */}
                          <button
                            onClick={() => handleViewDetails(transfer)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                            title="عرض تفاصيل المستند"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Approval (Only draft) */}
                          {transfer.status === 'draft' && canManage && (
                            <button
                              onClick={() => handleApproveTransfer(transfer)}
                              disabled={actionLoading}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-lg text-[10px] shadow-xs flex items-center gap-1 transition cursor-pointer"
                            >
                              <span>اعتماد</span>
                            </button>
                          )}

                          {/* Cancel (Only approved) */}
                          {transfer.status === 'approved' && canManage && (
                            <button
                              onClick={() => handleOpenCancelModal(transfer)}
                              disabled={actionLoading}
                              className="bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1 transition cursor-pointer"
                            >
                              <span>إلغاء</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE TRANSFER MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 font-sans" dir="rtl">
          <div className="bg-white w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-4.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-brand-blue" />
                <h3 className="text-sm font-black text-slate-800">إنشاء مستند تحويل نقدي داخلي</h3>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <form onSubmit={handleCreateTransfer} className="p-6 space-y-4 overflow-y-auto flex-1">
              {activeAccounts.length < 2 ? (
                <div className="bg-amber-50 text-amber-800 p-4.5 rounded-xl flex items-start gap-3 border border-amber-150 text-xs">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <div>
                    <p className="font-bold">تعذر إجراء تحويل داخلي:</p>
                    <p className="mt-1 leading-relaxed">
                      يجب وجود صندوقين/حسابين نشطين على الأقل لإجراء تحويل داخلي. يرجى تنشيط الحسابات أو تأسيس حسابات نقدية جديدة من قسم الحسابات البنكية والصناديق أولاً.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {formError && (
                    <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-start gap-2 border border-red-100 text-xs">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Transfer Date */}
                    <div className="space-y-1.5">
                      <label className="text-slate-500 font-bold text-[11px] block">تاريخ التحويل</label>
                      <input
                        type="date"
                        required
                        value={transferDate}
                        onChange={(e) => setTransferDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right"
                      />
                    </div>

                    {/* Amount */}
                    <div className="space-y-1.5">
                      <label className="text-slate-500 font-bold text-[11px] block">مبلغ التحويل ({displayCurrency})</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        min="0.01"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* From Account */}
                    <div className="space-y-1.5">
                      <label className="text-slate-500 font-bold text-[11px] block">من حساب (المنبع / صرف)</label>
                      <select
                        required
                        value={fromAccountId}
                        onChange={(e) => setFromAccountId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right text-slate-800"
                      >
                        <option value="">— اختر حساب المنبع —</option>
                        {activeAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} ({acc.current_balance?.toLocaleString('en-US', { minimumFractionDigits: 2 })} {acc.currency_code})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* To Account */}
                    <div className="space-y-1.5">
                      <label className="text-slate-500 font-bold text-[11px] block">إلى حساب (المصب / استلام)</label>
                      <select
                        required
                        value={toAccountId}
                        onChange={(e) => setToAccountId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right text-slate-800"
                      >
                        <option value="">— اختر حساب المصب —</option>
                        {activeAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} ({acc.current_balance?.toLocaleString('en-US', { minimumFractionDigits: 2 })} {acc.currency_code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Reference Number */}
                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-bold text-[11px] block">رقم مرجعي / رقم الشيك (اختياري)</label>
                    <input
                      type="text"
                      placeholder="رقم مرجعي للحوالة، رقم إيصال، شيك إلخ..."
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right"
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-bold text-[11px] block">البيان / تفاصيل التحويل</label>
                    <textarea
                      placeholder="اكتب الغرض من التحويل الداخلي..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right"
                    />
                  </div>
                </>
              )}

              {/* Footer Buttons */}
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  إلغاء
                </button>
                {activeAccounts.length >= 2 && (
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="bg-brand-blue hover:bg-brand-blue-dark text-white px-5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>حفظ كمسودة</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL TRANSFER MODAL */}
      {isCancelModalOpen && selectedTransferForCancel && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 font-sans" dir="rtl">
          <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col">
            <div className="p-4.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-black text-slate-800">إلغاء مستند التحويل {selectedTransferForCancel.transfer_number}</h3>
              </div>
              <button onClick={() => setIsCancelModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCancelTransferSubmit} className="p-6 space-y-4">
              <div className="bg-rose-50 text-rose-800 p-4 rounded-xl flex items-start gap-3 border border-rose-100 text-xs">
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
                <div>
                  <p className="font-bold">تحذير محاسبي هام:</p>
                  <p className="mt-1 leading-relaxed">
                    إلغاء هذا التحويل سيؤدي لإنشاء قيد عكسي تلقائي لفك الأثر المالي، وسيتم إرجاع المبالغ المحمولة لحالة ما قبل الترحيل. لا يمكن حذف المستند نهائياً للحفاظ على سلامة القيود ودفاتر اليومية.
                  </p>
                </div>
              </div>

              {cancelError && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg flex items-start gap-2 border border-red-100 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{cancelError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-slate-500 font-bold text-[11px] block">سبب الإلغاء المحاسبي</label>
                <textarea
                  required
                  placeholder="يرجى كتابة سبب الإلغاء بالتفصيل..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right text-slate-800"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  إغلاق
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>تأكيد الإلغاء المحاسبي</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {isDetailsModalOpen && selectedTransferDetails && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 font-sans" dir="rtl">
          <div className="bg-white w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col">
            {/* Header */}
            <div className="p-4.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-blue" />
                <h3 className="text-sm font-black text-slate-800">مستند تحويل داخلي رقم: {selectedTransferDetails.transfer_number}</h3>
              </div>
              <button onClick={() => setIsDetailsModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Details Content */}
            <div className="p-6 space-y-5 text-slate-700">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold block">تاريخ التحويل</span>
                  <span className="text-xs font-bold text-slate-800">{selectedTransferDetails.transfer_date}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold block">مبلغ التحويل</span>
                  <span className="text-sm font-black text-slate-900">
                    {Number(selectedTransferDetails.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {selectedTransferDetails.currency_code}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold block">حالة المستند</span>
                  <span>
                    {selectedTransferDetails.status === 'draft' && (
                      <span className="bg-amber-50 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-100">
                        مسودة
                      </span>
                    )}
                    {selectedTransferDetails.status === 'approved' && (
                      <span className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-100">
                        معتمد
                      </span>
                    )}
                    {selectedTransferDetails.status === 'cancelled' && (
                      <span className="bg-rose-50 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-100">
                        ملغى
                      </span>
                    )}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold block">رقم مرجعي</span>
                  <span className="text-xs font-semibold text-slate-800">{selectedTransferDetails.reference_number || '— لا يوجد —'}</span>
                </div>
              </div>

              {/* Accounts flow visual */}
              <div className="flex items-center justify-between border border-slate-100 p-4 rounded-xl bg-slate-50/50">
                <div className="flex-1 text-center space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold block">الحساب المصدر (المنبع)</span>
                  <span className="text-xs font-bold text-slate-800 block truncate">{selectedTransferDetails.from_account_name}</span>
                  <span className="text-[10px] text-slate-400">({selectedTransferDetails.from_account_type === 'cash' ? 'صندوق نقدية' : 'حساب بنكي'})</span>
                </div>
                <div className="px-4 shrink-0">
                  <ArrowRight className="w-5 h-5 text-slate-400 animate-pulse" />
                </div>
                <div className="flex-1 text-center space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold block">الحساب الوجهة (المصب)</span>
                  <span className="text-xs font-bold text-slate-800 block truncate">{selectedTransferDetails.to_account_name}</span>
                  <span className="text-[10px] text-slate-400">({selectedTransferDetails.to_account_type === 'cash' ? 'صندوق نقدية' : 'حساب بنكي'})</span>
                </div>
              </div>

              {/* Descriptions & Reasons */}
              <div className="space-y-3">
                <div className="space-y-1 text-xs">
                  <span className="text-[10px] text-slate-400 font-bold block">وصف أو بيان العملية</span>
                  <p className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed text-slate-600">
                    {selectedTransferDetails.description || '— لا يوجد بيان إضافي لهذه العملية —'}
                  </p>
                </div>

                {selectedTransferDetails.status === 'cancelled' && (
                  <div className="space-y-1 text-xs">
                    <span className="text-[10px] text-rose-500 font-bold block">سبب الإلغاء المحاسبي</span>
                    <p className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-100 leading-relaxed text-rose-700 font-medium">
                      {selectedTransferDetails.cancel_reason || '— لم يحدد سبب —'}
                    </p>
                  </div>
                )}
              </div>

              {/* Log actions if exists */}
              <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-4 text-[10px] text-slate-400">
                <div>
                  <span>تاريخ الإنشاء: </span>
                  <span className="font-bold">{new Date(selectedTransferDetails.created_at).toLocaleString('ar-EG')}</span>
                </div>
                {selectedTransferDetails.approved_at && (
                  <div>
                    <span>تاريخ الاعتماد: </span>
                    <span className="font-bold">{new Date(selectedTransferDetails.approved_at).toLocaleString('ar-EG')}</span>
                  </div>
                )}
                {selectedTransferDetails.cancelled_at && (
                  <div>
                    <span>تاريخ الإلغاء: </span>
                    <span className="font-bold text-rose-500">{new Date(selectedTransferDetails.cancelled_at).toLocaleString('ar-EG')}</span>
                  </div>
                )}
              </div>

              {/* Close footer */}
              <div className="pt-4 flex justify-end border-t border-slate-100">
                <button
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer"
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
