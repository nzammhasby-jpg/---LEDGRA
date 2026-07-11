import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { bankReconciliationService } from '../../lib/bankReconciliationService';
import { bankingService } from '../../lib/bankingService';
import { BankReconciliation, BankReconciliationLine, CashBankAccount } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Plus, 
  Search, 
  Calendar, 
  FileText, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Printer, 
  ChevronRight, 
  Info,
  CheckCircle,
  Clock,
  ArrowRightLeft,
  X
} from 'lucide-react';

export const BankReconciliationsPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  
  // Permissions
  const isSales = roleInCurrentOrg === 'sales';
  const isReadOnly = roleInCurrentOrg === 'viewer';
  const canManage = !isReadOnly && !isSales && (roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant');

  // State
  const [reconciliations, setReconciliations] = useState<BankReconciliation[]>([]);
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active Session Detail View State
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedRecId, setSelectedRecId] = useState<string | null>(null);
  const [activeRec, setActiveRec] = useState<BankReconciliation | null>(null);
  const [recLines, setRecLines] = useState<BankReconciliationLine[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'inflow' | 'outflow'>('all');
  const [lineSearch, setLineSearch] = useState<string>('');

  // Modals / Actions state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Create Form State
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [reconciliationDate, setReconciliationDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [statementBalance, setStatementBalance] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Number Formatter (Latin Digits)
  const formatNumber = (num: number | undefined | null) => {
    if (num === undefined || num === null) return '0.00';
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  useEffect(() => {
    if (currentOrg?.id && !isSales) {
      loadInitialData();
    }
  }, [currentOrg?.id, isSales]);

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [recs, allAccounts] = await Promise.all([
        bankReconciliationService.listBankReconciliations(currentOrg!.id),
        bankingService.listCashBankAccounts(currentOrg!.id)
      ]);
      setReconciliations(recs);
      setAccounts(allAccounts.filter(a => a.is_active));
      if (allAccounts.length > 0) {
        setSelectedAccountId(allAccounts[0].id);
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetail = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const [recData, linesData] = await Promise.all([
        bankReconciliationService.getBankReconciliation(id),
        bankReconciliationService.listBankReconciliationLines(id)
      ]);
      setActiveRec(recData);
      setRecLines(linesData);
      setSelectedRecId(id);
      setView('detail');
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    if (!selectedAccountId) {
      setActionError('يرجى اختيار الحساب البنكي أو الصندوق.');
      return;
    }
    if (!reconciliationDate) {
      setActionError('يرجى تحديد تاريخ المطابقة.');
      return;
    }
    if (statementBalance === '' || isNaN(Number(statementBalance))) {
      setActionError('يرجى إدخال الرصيد الفعلي بشكل صحيح.');
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      const newRecId = await bankReconciliationService.createBankReconciliation({
        organization_id: currentOrg!.id,
        cash_bank_account_id: selectedAccountId,
        reconciliation_date: reconciliationDate,
        statement_balance: Number(statementBalance),
        notes: notes || null
      });

      setIsCreateModalOpen(false);
      // Reset creation states
      setStatementBalance('');
      setNotes('');
      
      // Load details for the new reconciliation session
      await handleOpenDetail(newRecId);
      // Also refresh master list in background
      bankReconciliationService.listBankReconciliations(currentOrg!.id).then(setReconciliations).catch(console.error);
    } catch (err: any) {
      setActionError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleLine = async (lineId: string, currentMatched: boolean) => {
    if (!canManage || activeRec?.status !== 'draft') return;

    // Optimistic UI updates
    const updatedLines = recLines.map(l => {
      if (l.id === lineId) {
        return { ...l, is_matched: !currentMatched };
      }
      return l;
    });
    setRecLines(updatedLines);

    // Calculate metrics and update header card locally
    const matchedSum = updatedLines
      .filter(l => l.is_matched)
      .reduce((sum, l) => sum + Number(l.amount), 0);

    // Reconciled opening balance = total book balance - total lines amount
    // Let's call RPC dynamically to get actual server-authoritative numbers to prevent drift
    try {
      await bankReconciliationService.toggleReconciliationLine(lineId, !currentMatched);
      // Refresh only active session details to ensure complete correctness
      const recData = await bankReconciliationService.getBankReconciliation(activeRec.id);
      setActiveRec(recData);
    } catch (err: any) {
      // Revert optimistic update
      setRecLines(recLines);
      setError(getErrorMessage(err));
    }
  };

  const handleCompleteReconciliation = async () => {
    if (!canManage || !activeRec) return;
    if (activeRec.difference !== 0) {
      setError('لا يمكن إكمال المطابقة البنكية حتى يصبح الفرق صفراً.');
      return;
    }

    setActionLoading(true);
    try {
      await bankReconciliationService.completeBankReconciliation(activeRec.id);
      const recData = await bankReconciliationService.getBankReconciliation(activeRec.id);
      setActiveRec(recData);
      // Refresh lists
      const recs = await bankReconciliationService.listBankReconciliations(currentOrg!.id);
      setReconciliations(recs);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !activeRec) return;
    if (!cancelReason.trim()) {
      setActionError('يرجى تحديد سبب الإلغاء.');
      return;
    }

    setActionLoading(true);
    setActionError(null);
    try {
      await bankReconciliationService.cancelBankReconciliation(activeRec.id, cancelReason);
      setIsCancelModalOpen(false);
      setCancelReason('');
      
      const recData = await bankReconciliationService.getBankReconciliation(activeRec.id);
      setActiveRec(recData);
      
      // Refresh lists
      const recs = await bankReconciliationService.listBankReconciliations(currentOrg!.id);
      setReconciliations(recs);
    } catch (err: any) {
      setActionError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleBackToList = () => {
    setView('list');
    setActiveRec(null);
    setRecLines([]);
    setSelectedRecId(null);
    // Refresh lists
    loadInitialData();
  };

  // Filters for lines
  const filteredLines = recLines.filter(line => {
    const matchesTab = 
      activeTab === 'all' ? true :
      activeTab === 'inflow' ? Number(line.debit_amount) > 0 :
      Number(line.credit_amount) > 0;

    const matchesSearch = lineSearch === '' ? true :
      line.description.toLowerCase().includes(lineSearch.toLowerCase()) ||
      line.source_type.toLowerCase().includes(lineSearch.toLowerCase());

    return matchesTab && matchesSearch;
  });

  if (isSales) {
    return (
      <div className="p-6 text-center space-y-4" dir="rtl">
        <div className="bg-red-50 text-red-700 p-4 rounded-2xl max-w-md mx-auto border border-red-100 shadow-sm">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 text-red-500" />
          <h2 className="text-lg font-bold">غير مصرح لك بالوصول</h2>
          <p className="text-sm mt-1">لا يملك مندوبو المبيعات صلاحية الوصول إلى إدارة مطابقة الحسابات البنكية.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto select-none" dir="rtl">
      
      {/* Alert Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-800 p-4 rounded-2xl flex items-start gap-3 shadow-sm animate-fadeIn">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-bold">تنبيه:</span> {error}
          </div>
          <button onClick={() => setError(null)} className="mr-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* VIEW 1: RECONCILIATIONS LIST */}
      {view === 'list' && (
        <div className="space-y-6">
          
          {/* List Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">مطابقة الحسابات البنكية والصناديق</h1>
              <p className="text-xs text-slate-500 mt-1">تأكيد ومطابقة القيود الدفترية مع كشوفات الحساب البنكية الفعلية لضبط الفروقات المالية.</p>
            </div>
            
            {canManage && (
              <button
                onClick={() => {
                  setActionError(null);
                  setIsCreateModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-navy hover:bg-brand-navy/90 text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>مطابقة جديدة</span>
              </button>
            )}
          </div>

          {/* Table List Card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-navy mb-3" />
                <span className="text-xs">جاري تحميل جلسات المطابقة...</span>
              </div>
            ) : reconciliations.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Info className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-700">لا توجد جلسات مطابقة بنكية</h4>
                <p className="text-xs text-slate-400 mt-1">ابدأ بإنشاء مطابقة جديدة للحساب البنكي أو الصندوق.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-bold">
                    <tr>
                      <th className="p-4">الحساب المالي</th>
                      <th className="p-4 text-center">تاريخ المطابقة</th>
                      <th className="p-4 text-left">الرصيد الدفتري</th>
                      <th className="p-4 text-left">الرصيد الفعلي</th>
                      <th className="p-4 text-left">الفرق المعلق</th>
                      <th className="p-4 text-center">الحركات (مطابقة / متبقية)</th>
                      <th className="p-4 text-center">الحالة</th>
                      <th className="p-4 text-center">العمليات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-slate-700">
                    {reconciliations.map((rec) => {
                      const hasDiscrepancy = Number(rec.difference) !== 0;
                      return (
                        <tr key={rec.id} className="hover:bg-slate-50/50 transition">
                          <td className="p-4 font-bold text-slate-900">
                            <div>{rec.account_name}</div>
                            <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                              {rec.account_type === 'bank' ? 'حساب بنكي' : 'صندوق كاش'}
                            </div>
                          </td>
                          <td className="p-4 text-center font-mono">{rec.reconciliation_date}</td>
                          <td className="p-4 text-left font-mono font-medium">{formatNumber(rec.book_balance)}</td>
                          <td className="p-4 text-left font-mono font-medium">{formatNumber(rec.statement_balance)}</td>
                          <td className={`p-4 text-left font-mono font-bold ${
                            rec.status === 'completed' ? 'text-green-600' :
                            rec.status === 'cancelled' ? 'text-slate-400' :
                            hasDiscrepancy ? 'text-red-500' : 'text-green-600'
                          }`}>
                            {rec.status === 'completed' ? '0.00' : formatNumber(rec.difference)}
                          </td>
                          <td className="p-4 text-center font-mono">
                            <span className="text-green-600 font-bold">{rec.matched_count}</span>
                            <span className="text-slate-300 mx-1">/</span>
                            <span className="text-amber-500 font-bold">{rec.unmatched_count}</span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              rec.status === 'completed' ? 'bg-green-50 text-green-700' :
                              rec.status === 'cancelled' ? 'bg-red-50 text-red-600' :
                              'bg-amber-50 text-amber-700'
                            }`}>
                              {rec.status === 'completed' ? <CheckCircle2 className="w-3 h-3" /> :
                               rec.status === 'cancelled' ? <XCircle className="w-3 h-3" /> :
                               <Clock className="w-3 h-3" />}
                              {rec.status === 'completed' ? 'مكتملة' :
                               rec.status === 'cancelled' ? 'ملغاة' : 'مسودة'}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => handleOpenDetail(rec.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition cursor-pointer"
                            >
                              <span>استعراض ومطابقة</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: RECONCILIATION SESSION DETAILS & MATCHING */}
      {view === 'detail' && activeRec && (
        <div className="space-y-6">
          
          {/* Detail Breadcrumb Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="space-y-1">
              <button
                onClick={handleBackToList}
                className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 transition cursor-pointer text-xs font-semibold"
              >
                <ChevronRight className="w-4 h-4" />
                <span>العودة لجلسات المطابقة</span>
              </button>
              
              <div className="flex items-center gap-2 mt-1">
                <h1 className="text-xl font-bold text-slate-900">{activeRec.account_name}</h1>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                  activeRec.status === 'completed' ? 'bg-green-50 text-green-700' :
                  activeRec.status === 'cancelled' ? 'bg-red-50 text-red-600' :
                  'bg-amber-50 text-amber-700'
                }`}>
                  {activeRec.status === 'completed' ? 'مكتملة' :
                   activeRec.status === 'cancelled' ? 'ملغاة' : 'مسودة'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">تاريخ الجرد: {activeRec.reconciliation_date}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              <a
                href={`#/print/bank-reconciliation/${activeRec.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة التقرير</span>
              </a>

              {canManage && activeRec.status === 'draft' && (
                <>
                  <button
                    onClick={() => {
                      setActionError(null);
                      setIsCancelModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>حذف / إلغاء</span>
                  </button>

                  <button
                    onClick={handleCompleteReconciliation}
                    disabled={activeRec.difference !== 0 || actionLoading}
                    className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
                      activeRec.difference === 0 && !actionLoading
                        ? 'bg-green-600 hover:bg-green-700 text-white cursor-pointer'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    <span>اعتماد المطابقة</span>
                  </button>
                </>
              )}

              {canManage && activeRec.status === 'completed' && (roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin') && (
                <button
                  onClick={() => {
                    setActionError(null);
                    setIsCancelModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  <span>إلغاء واعتماد الفروقات</span>
                </button>
              )}
            </div>
          </div>

          {/* Session Summary Statistics Cards (Bento style) */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* 1. Book Balance */}
            <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-medium">الرصيد الدفتري الحالي</span>
                <div className="bg-slate-100 p-1.5 rounded-lg text-slate-500">
                  <FileText className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-lg font-mono font-bold text-slate-800">{formatNumber(activeRec.book_balance)}</h3>
                <span className="text-[10px] text-slate-400">إجمالي الحركات المسجلة في النظام حتى تاريخه</span>
              </div>
            </div>

            {/* 2. Statement Balance */}
            <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-medium">رصيد كشف البنك الفعلي</span>
                <div className="bg-blue-50 p-1.5 rounded-lg text-blue-600">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-lg font-mono font-bold text-slate-800">{formatNumber(activeRec.statement_balance)}</h3>
                <span className="text-[10px] text-slate-400">الرصيد الفعلي المدخل من واقع كشف الحساب</span>
              </div>
            </div>

            {/* 3. Reconciled Book Balance */}
            <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-medium">الرصيد الدفتري المطابق</span>
                <div className="bg-green-50 p-1.5 rounded-lg text-green-600">
                  <CheckCircle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-lg font-mono font-bold text-slate-800">
                  {formatNumber(Number(activeRec.statement_balance) + Number(activeRec.difference))}
                </h3>
                <span className="text-[10px] text-slate-400">الرصيد الافتتاحي + إجمالي الحركات المطابقة</span>
              </div>
            </div>

            {/* 4. Difference (The core match goal) */}
            <div className={`p-5 rounded-2xl shadow-sm border flex flex-col justify-between ${
              activeRec.status === 'completed' ? 'bg-green-50/50 border-green-100 text-green-800' :
              activeRec.status === 'cancelled' ? 'bg-slate-50 border-slate-100 text-slate-500' :
              activeRec.difference === 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">الفرق غير المطابق</span>
                <div className={`p-1.5 rounded-lg ${
                  activeRec.status === 'completed' || activeRec.difference === 0 ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/10 text-amber-600'
                }`}>
                  <AlertCircle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-lg font-mono font-bold">
                  {activeRec.status === 'completed' ? '0.00' : formatNumber(activeRec.difference)}
                </h3>
                <span className="text-[10px] opacity-80">
                  {activeRec.status === 'completed' ? 'تمت مطابقة وإغلاق الجلسة بنجاح' :
                   activeRec.status === 'cancelled' ? 'تم إلغاء هذه الجلسة' :
                   activeRec.difference === 0 ? 'الفرق صفر، المطابقة متطابقة وجاهزة للاعتماد!' : 'قم بمطابقة الحركات أدناه لتصفير الفرق'}
                </span>
              </div>
            </div>

          </div>

          {/* Historical Log details if Cancelled */}
          {activeRec.status === 'cancelled' && (
            <div className="bg-red-50/60 border border-red-100 p-4 rounded-2xl flex items-start gap-3 text-red-800 text-xs">
              <Info className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">تفاصيل الإلغاء:</span> تم إلغاء هذه الجلسة بواسطة <strong>{activeRec.cancelled_by_name || 'مسؤول'}</strong> بتاريخ <strong>{activeRec.cancelled_at?.split('T')[0]}</strong>.
                {activeRec.cancel_reason && <p className="mt-1">السبب: {activeRec.cancel_reason}</p>}
              </div>
            </div>
          )}

          {/* Historical Log details if Completed */}
          {activeRec.status === 'completed' && (
            <div className="bg-green-50/40 border border-green-100 p-4 rounded-2xl flex items-start gap-3 text-green-800 text-xs">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">إغلاق الجلسة:</span> تم إكمال ومطابقة الجلسة بنجاح بواسطة <strong>{activeRec.completed_by_name || 'المحاسب'}</strong> بتاريخ <strong>{activeRec.completed_at?.split('T')[0]}</strong>.
              </div>
            </div>
          )}

          {/* Matching workspace / lines ledger */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            
            {/* Table Navigation and Filters */}
            <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              
              {/* Category tabs */}
              <div className="flex border-b border-slate-100 self-start">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-4 py-2 text-xs font-bold transition border-b-2 cursor-pointer ${
                    activeTab === 'all' ? 'border-brand-navy text-brand-navy' : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  الحركات الشاملة ({recLines.length})
                </button>
                <button
                  onClick={() => setActiveTab('inflow')}
                  className={`px-4 py-2 text-xs font-bold transition border-b-2 cursor-pointer ${
                    activeTab === 'inflow' ? 'border-green-600 text-green-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  المدفوعات الداخلة ({recLines.filter(l => Number(l.debit_amount) > 0).length})
                </button>
                <button
                  onClick={() => setActiveTab('outflow')}
                  className={`px-4 py-2 text-xs font-bold transition border-b-2 cursor-pointer ${
                    activeTab === 'outflow' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  المدفوعات الخارجة ({recLines.filter(l => Number(l.credit_amount) > 0).length})
                </button>
              </div>

              {/* Search input inside table */}
              <div className="relative w-full md:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="البحث في الحركات..."
                  value={lineSearch}
                  onChange={(e) => setLineSearch(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-slate-300 transition"
                />
              </div>

            </div>

            {/* Lines Table */}
            {filteredLines.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Info className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <span className="text-xs">لا توجد حركات مطابقة في هذا الفرز.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50/50 text-slate-500 uppercase font-bold border-b border-slate-100">
                    <tr>
                      {activeRec.status === 'draft' && canManage && (
                        <th className="p-4 w-12 text-center">مطابقة؟</th>
                      )}
                      <th className="p-4">تاريخ الحركة</th>
                      <th className="p-4">النوع</th>
                      <th className="p-4">الوصف والبيانات المرتبطة</th>
                      <th className="p-4 text-left">وارد / مدين</th>
                      <th className="p-4 text-left">صادر / دائن</th>
                      <th className="p-4 text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-slate-700">
                    {filteredLines.map((line) => {
                      const isMatched = line.is_matched;
                      return (
                        <tr 
                          key={line.id} 
                          onClick={() => activeRec.status === 'draft' && canManage && handleToggleLine(line.id, isMatched)}
                          className={`hover:bg-slate-50/50 transition cursor-pointer ${
                            isMatched ? 'bg-green-50/20' : ''
                          }`}
                        >
                          {activeRec.status === 'draft' && canManage && (
                            <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isMatched}
                                onChange={() => handleToggleLine(line.id, isMatched)}
                                className="w-4.5 h-4.5 text-brand-blue border-slate-200 rounded focus:ring-brand-blue cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="p-4 font-mono">{line.transaction_date}</td>
                          <td className="p-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                              line.source_type === 'receipt' ? 'bg-green-50 text-green-700' :
                              line.source_type === 'payment' ? 'bg-amber-50 text-amber-700' :
                              line.source_type === 'transfer' ? 'bg-blue-50 text-blue-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {line.source_type === 'receipt' ? 'سند قبض' :
                               line.source_type === 'payment' ? 'سند صرف' :
                               line.source_type === 'transfer' ? 'تحويل بنكي' : 'قيد يدوي'}
                            </span>
                          </td>
                          <td className="p-4 max-w-sm truncate text-slate-600" title={line.description}>
                            {line.description}
                          </td>
                          <td className="p-4 text-left font-mono font-medium text-green-600">
                            {Number(line.debit_amount) > 0 ? formatNumber(line.debit_amount) : '—'}
                          </td>
                          <td className="p-4 text-left font-mono font-medium text-amber-600">
                            {Number(line.credit_amount) > 0 ? formatNumber(line.credit_amount) : '—'}
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.75 rounded-full text-[10px] font-bold ${
                              isMatched ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-400'
                            }`}>
                              {isMatched ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                              {isMatched ? 'مطابق ومسوى' : 'غير مطابق'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* MODAL 1: CREATE NEW RECONCILIATION */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-100 shadow-2xl overflow-hidden p-6 space-y-5">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800">إنشاء جلسة مطابقة حساب جديدة</h3>
              <button 
                onClick={() => setIsCreateModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="bg-red-50 border border-red-100 text-red-700 p-3 rounded-xl flex items-start gap-2 text-xs">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleCreateReconciliation} className="space-y-4 text-xs text-right">
              
              {/* Account Selection */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">الحساب البنكي أو الصندوق للتسوية</label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-slate-300 transition"
                >
                  <option value="" disabled>اختر حساباً مالياً...</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.type === 'bank' ? 'بنكي' : 'كاش'} - {acc.currency_code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date selection */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">تاريخ المطابقة / الجرد الفعلي</label>
                <input
                  type="date"
                  value={reconciliationDate}
                  onChange={(e) => setReconciliationDate(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-slate-300 transition"
                />
              </div>

              {/* Statement Balance */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">الرصيد الفعلي حسب كشف البنك</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={statementBalance}
                    onChange={(e) => setStatementBalance(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-slate-300 transition pl-12 text-left"
                    style={{ direction: 'ltr' }}
                  />
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                    {currentOrg?.currency_code}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">ملاحظات تسوية الحساب (اختياري)</label>
                <textarea
                  rows={3}
                  placeholder="ملاحظات توثيقية إضافية للجلسة..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-slate-300 transition resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-50">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-brand-navy hover:bg-brand-navy/95 text-white rounded-xl font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>إنشاء وبدء المطابقة</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CANCEL RECONCILIATION */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-100 shadow-2xl overflow-hidden p-6 space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-red-600">تأكيد إلغاء / حذف جلسة المطابقة</h3>
              <button 
                onClick={() => setIsCancelModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed text-right">
              سيؤدي هذا الإجراء إلى إلغاء وحذف جلسة مطابقة الحساب بالكامل وتحرير كافة القيود والحركات والتحويلات المترتبة عليها لتصبح قابلة للمطابقة في جلسات أخرى مستقلة.
            </p>

            {actionError && (
              <div className="bg-red-50 border border-red-100 text-red-700 p-2.5 rounded-xl text-[11px] text-right">
                {actionError}
              </div>
            )}

            <form onSubmit={handleCancelReconciliation} className="space-y-4 text-right">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">سبب الإلغاء والحذف</label>
                <textarea
                  rows={2}
                  required
                  placeholder="يرجى كتابة سبب الإلغاء للتسجيل والتدقيق المالي..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-slate-300 transition resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-slate-50">
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  التراجع
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>تأكيد الإلغاء النهائي</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
