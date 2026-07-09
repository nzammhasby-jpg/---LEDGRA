import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { bankingService } from '../../lib/bankingService';
import { accountingService } from '../../lib/accountingService';
import { CashBankAccount, Account, CashBankAccountType } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { 
  Landmark, 
  Wallet, 
  Search, 
  Plus, 
  X, 
  Edit2, 
  Eye,
  CheckCircle2, 
  XCircle, 
  FileText, 
  AlertCircle,
  Loader2,
  Lock,
  Building2,
  Sparkles,
  Info,
  ArrowRightLeft
} from 'lucide-react';

export const BankingPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const navigate = useNavigate();
  
  // Permissions
  const isSales = roleInCurrentOrg === 'sales';
  const canManage = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin';
  const isReadOnly = !canManage;

  // State
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Tabs and Filters
  const [activeTab, setActiveTab] = useState<CashBankAccountType | 'all'>('cash');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingAccount, setEditingAccount] = useState<CashBankAccount | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create');

  // Form State
  const [accountId, setAccountId] = useState<string>('');
  const [type, setType] = useState<CashBankAccountType>('cash');
  const [name, setName] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');
  const [iban, setIban] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [isDefault, setIsDefault] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  useEffect(() => {
    if (currentOrg?.id && !isSales) {
      loadData();
    }
  }, [currentOrg?.id, isSales]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [bankAccounts, allLedgerAccounts] = await Promise.all([
        bankingService.listCashBankAccounts(currentOrg!.id),
        accountingService.getAccounts(currentOrg!.id)
      ]);

      setAccounts(bankAccounts);

      // Filter Chart of Accounts: Assets classification, active, and allow_direct_posting
      const validAssets = allLedgerAccounts.filter(
        acc => acc.classification === 'assets' && acc.allow_direct_posting && acc.is_active
      );
      setLedgerAccounts(validAssets);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Safe checks for Sales access
  if (isSales) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-right p-6 font-sans bg-white border border-slate-150 rounded-xl" dir="rtl">
        <Lock className="w-16 h-16 text-red-500 mb-4 animate-bounce" />
        <h3 className="text-xl font-black text-slate-800 mb-2">غير مصرح بدخول الصفحة</h3>
        <p className="text-sm text-slate-500 max-w-md text-center leading-relaxed">
          عذراً، صفحة إدارة الحسابات البنكية والصناديق غير متاحة لذوي صلاحية المبيعات (Sales). يرجى مراجعة إدارة النظام لتعديل الصلاحيات أو الانتقال لقسم آخر.
        </p>
      </div>
    );
  }

  // Handle Add Click
  const handleAddClick = () => {
    if (!canManage) return;
    setEditingAccount(null);
    setModalMode('create');
    setFormError(null);

    // Default form states
    setAccountId(ledgerAccounts.length > 0 ? ledgerAccounts[0].id : '');
    setType(activeTab === 'all' ? 'cash' : activeTab); // match current tab
    setName('');
    setBankName('');
    setIban('');
    setAccountNumber('');
    setOpeningBalance(0);
    setIsDefault(false);
    setNotes('');
    setIsActive(true);

    setIsModalOpen(true);
  };

  // Handle Edit/View Click
  const handleViewOrEditClick = (account: CashBankAccount, mode: 'edit' | 'view') => {
    setEditingAccount(account);
    setModalMode(mode);
    setFormError(null);

    setAccountId(account.account_id);
    setType(account.type);
    setName(account.name);
    setBankName(account.bank_name || '');
    setIban(account.iban || '');
    setAccountNumber(account.account_number || '');
    setOpeningBalance(account.opening_balance);
    setIsDefault(account.is_default);
    setNotes(account.notes || '');
    setIsActive(account.is_active);

    setIsModalOpen(true);
  };

  // Toggle default directly (Only owner/admin)
  const handleSetDefaultDirectly = async (account: CashBankAccount) => {
    if (!canManage) return;
    setLoading(true);
    try {
      await bankingService.updateCashBankAccount({
        id: account.id,
        name: account.name,
        bank_name: account.bank_name,
        iban: account.iban,
        account_number: account.account_number,
        is_default: true, // set as default
        notes: account.notes,
        is_active: account.is_active
      });
      await loadData();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Toggle active status directly (Only owner/admin)
  const handleToggleActiveDirectly = async (account: CashBankAccount) => {
    if (!canManage) return;
    setLoading(true);
    try {
      await bankingService.updateCashBankAccount({
        id: account.id,
        name: account.name,
        bank_name: account.bank_name,
        iban: account.iban,
        account_number: account.account_number,
        is_default: account.is_default,
        notes: account.notes,
        is_active: !account.is_active
      });
      await loadData();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Form Submit Handler
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalMode === 'view') {
      setIsModalOpen(false);
      return;
    }

    if (!canManage) {
      setFormError('غير مصرح: ليس لديك الصلاحيات الكافية لحفظ التعديلات.');
      return;
    }

    if (!name.trim()) {
      setFormError('يرجى إدخال اسم الحساب/الصندوق بالكامل.');
      return;
    }

    if (modalMode === 'create' && !accountId) {
      setFormError('يرجى اختيار الحساب المرتبط من دليل الحسابات.');
      return;
    }

    if (type === 'bank') {
      if (!bankName.trim()) {
        setFormError('يرجى إدخال اسم البنك.');
        return;
      }
      if (!accountNumber.trim()) {
        setFormError('يرجى إدخال رقم الحساب البنكي.');
        return;
      }
    }

    setSaveLoading(true);
    setFormError(null);

    try {
      if (modalMode === 'create') {
        await bankingService.createCashBankAccount({
          organization_id: currentOrg!.id,
          account_id: accountId,
          type,
          name,
          bank_name: type === 'bank' ? bankName : null,
          iban: type === 'bank' ? iban : null,
          account_number: type === 'bank' ? accountNumber : null,
          opening_balance: openingBalance,
          is_default: isDefault,
          notes: notes || null
        });
      } else if (modalMode === 'edit' && editingAccount) {
        await bankingService.updateCashBankAccount({
          id: editingAccount.id,
          name,
          bank_name: type === 'bank' ? bankName : null,
          iban: type === 'bank' ? iban : null,
          account_number: type === 'bank' ? accountNumber : null,
          is_default: isDefault,
          notes: notes || null,
          is_active: isActive
        });
      }

      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaveLoading(false);
    }
  };

  // Filtering Accounts
  const filteredAccounts = accounts.filter(acc => {
    if (activeTab !== 'all' && acc.type !== activeTab) return false;

    // Status Filter
    if (statusFilter === 'active' && !acc.is_active) return false;
    if (statusFilter === 'inactive' && acc.is_active) return false;

    // Search Query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchName = acc.name.toLowerCase().includes(q);
      const matchBank = acc.bank_name?.toLowerCase().includes(q) || false;
      const matchIban = acc.iban?.toLowerCase().includes(q) || false;
      const matchNumber = acc.account_number?.toLowerCase().includes(q) || false;
      const matchCode = acc.account_code?.toLowerCase().includes(q) || false;
      const matchLedgerName = acc.account_name_ar?.toLowerCase().includes(q) || false;

      return matchName || matchBank || matchIban || matchNumber || matchCode || matchLedgerName;
    }

    return true;
  });

  // Calculate stats for current tab
  const totalBalance = filteredAccounts.reduce((sum, acc) => sum + acc.current_balance, 0);
  const activeCount = filteredAccounts.filter(acc => acc.is_active).length;
  const defaultAccount = filteredAccounts.find(acc => acc.is_default && acc.is_active);

  // Advanced stats for the "All" tab or global insights
  const activeCashAccounts = accounts.filter(acc => acc.type === 'cash' && acc.is_active);
  const activeBankAccounts = accounts.filter(acc => acc.type === 'bank' && acc.is_active);

  const totalCashBalance = accounts.filter(acc => acc.type === 'cash').reduce((sum, acc) => sum + acc.current_balance, 0);
  const totalBankBalance = accounts.filter(acc => acc.type === 'bank').reduce((sum, acc) => sum + acc.current_balance, 0);

  const activeCashCount = activeCashAccounts.length;
  const activeBankCount = activeBankAccounts.length;

  const displayCurrency = currentOrg?.currency_code || '';

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      {/* Header section */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">إدارة الحسابات البنكية والصناديق (Banking & Cash)</h2>
            <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>إدارة النقدية متوفرة</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            تأسيس الخزائن النقدية وحسابات البنوك مع ربطها التلقائي بميزانية الأصول داخل دليل الحسابات وتحديث الأرصدة أولاً بأول.
          </p>
        </div>

        {canManage && (
          <button
            onClick={handleAddClick}
            className="cursor-pointer bg-brand-blue hover:bg-brand-blue-dark text-white px-5 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-sm shrink-0"
            id="add-banking-account-btn"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة {activeTab === 'cash' ? 'صندوق جديد' : activeTab === 'bank' ? 'حساب بنكي جديد' : 'حساب/صندوق جديد'}</span>
          </button>
        )}
      </div>

      {/* System Error Message */}
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-start gap-3 border border-red-100 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div className="space-y-1">
            <p className="font-bold">خطأ في جلب البيانات:</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Summary Widget Panel */}
      {activeTab === 'all' ? (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {/* Total Cash Balance */}
          <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-xl flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-500 block">إجمالي رصيد الصناديق</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-black text-slate-900">
                  {totalCashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] font-bold text-slate-400">{displayCurrency}</span>
              </div>
            </div>
            <div className="p-3 bg-brand-blue/10 rounded-xl text-brand-blue">
              <Wallet className="w-6 h-6" />
            </div>
          </div>

          {/* Total Bank Balance */}
          <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-xl flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-500 block">إجمالي رصيد البنوك</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-black text-slate-900">
                  {totalBankBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] font-bold text-slate-400">{displayCurrency}</span>
              </div>
            </div>
            <div className="p-3 bg-brand-blue/10 rounded-xl text-brand-blue">
              <Landmark className="w-6 h-6" />
            </div>
          </div>

          {/* Active Cash count */}
          <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-xl flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-500 block">عدد الصناديق النشطة</span>
              <span className="text-xl font-black text-slate-900">{activeCashCount}</span>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          {/* Active Bank count */}
          <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-xl flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-500 block">عدد الحسابات البنكية النشطة</span>
              <span className="text-xl font-black text-slate-900">{activeBankCount}</span>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Total Assets Balance Card */}
          <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-xl flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-500 block">إجمالي رصيد {activeTab === 'cash' ? 'الصناديق' : 'البنوك'}</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-black text-slate-900">
                  {totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] font-bold text-slate-400">{displayCurrency}</span>
              </div>
            </div>
            <div className="p-3 bg-brand-blue/10 rounded-xl text-brand-blue">
              {activeTab === 'cash' ? <Wallet className="w-6 h-6" /> : <Landmark className="w-6 h-6" />}
            </div>
          </div>

          {/* Count Card */}
          <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-xl flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-500 block">عدد {activeTab === 'cash' ? 'الصناديق النشطة' : 'الحسابات النشطة'}</span>
              <span className="text-xl font-black text-slate-900">{activeCount}</span>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          {/* Default Account Card */}
          <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-xl flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-500 block">الحساب الافتراضي المعتمد</span>
              <span className="text-xs font-extrabold text-slate-800 block truncate max-w-[200px]">
                {defaultAccount ? defaultAccount.name : 'لا يوجد حساب افتراضي معتمد'}
              </span>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
              <Info className="w-6 h-6" />
            </div>
          </div>
        </div>
      )}

      {/* Tabs Selector & Search Filters */}
      <div className="bg-white border border-slate-100 rounded-xl p-4.5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          {/* Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-lg gap-1 max-w-sm self-start">
            <button
              onClick={() => {
                setActiveTab('cash');
                setSearchQuery('');
              }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md transition cursor-pointer select-none outline-none ${
                activeTab === 'cash'
                  ? 'bg-white text-brand-blue shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Wallet className="w-4 h-4" />
              <span>الصناديق (Cash)</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('bank');
                setSearchQuery('');
              }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md transition cursor-pointer select-none outline-none ${
                activeTab === 'bank'
                  ? 'bg-white text-brand-blue shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Landmark className="w-4 h-4" />
              <span>الحسابات البنكية (Banks)</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('all');
                setSearchQuery('');
              }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md transition cursor-pointer select-none outline-none ${
                activeTab === 'all'
                  ? 'bg-white text-brand-blue shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>الكل (All)</span>
            </button>
            <button
              onClick={() => navigate('/banking/transfers')}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md transition cursor-pointer select-none outline-none text-slate-500 hover:text-slate-850"
            >
              <ArrowRightLeft className="w-4 h-4 text-brand-blue" />
              <span>التحويلات الداخلية</span>
            </button>
          </div>

          {/* Info note about Accountant */}
          {isReadOnly && (
            <div className="bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-[11px] font-medium border border-slate-100">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>نمط العرض فقط: صلاحياتك كـ ({roleInCurrentOrg === 'accountant' ? 'محاسب' : 'مستعرض'}) لا تسمح بإنشاء أو تعديل الحسابات النقدية.</span>
            </div>
          )}
        </div>

        {/* Filters and search inputs */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            <input
              type="text"
              placeholder="البحث بالاسم، اسم البنك، الآيبان، رقم الحساب أو كود القيد..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pr-9 pl-4 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right"
            />
          </div>

          <div className="w-full sm:w-44">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right"
            >
              <option value="all">كل الحالات</option>
              <option value="active">النشط فقط</option>
              <option value="inactive">غير النشط فقط</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Grid List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[250px]">
          <Loader2 className="w-8 h-8 text-brand-blue animate-spin mb-2" />
          <span className="text-xs text-slate-500">جاري تحميل حسابات الصناديق والبنوك...</span>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[250px] bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6">
          <Info className="w-10 h-10 text-slate-400 mb-2" />
          <h4 className="text-sm font-bold text-slate-700">لا يوجد حسابات متوفرة حالياً</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">
            {searchQuery ? 'لم يتم العثور على أي نتائج تطابق بحثك المكتوب.' : `لم تقم بإضافة أي ${activeTab === 'cash' ? 'صناديق نقدية' : 'حسابات بنكية'} حتى الآن.`}
          </p>
          {!searchQuery && canManage && (
            <button
              onClick={handleAddClick}
              className="cursor-pointer text-xs font-bold text-brand-blue mt-4 bg-white border border-slate-200 px-4 py-2 rounded-lg hover:shadow-xs hover:border-brand-blue transition"
            >
              انقر هنا للبدء وإضافة أول حساب
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-[11px] font-bold">
                  <th className="px-5 py-3.5">الاسم / المسمى المالي</th>
                  {(activeTab === 'bank' || activeTab === 'all') && <th className="px-5 py-3.5">البنك والتفاصيل</th>}
                  <th className="px-5 py-3.5">الحساب المرتبط بالدليل</th>
                  <th className="px-5 py-3.5">الرصيد الافتتاحي</th>
                  <th className="px-5 py-3.5">الرصيد الحالي</th>
                  <th className="px-5 py-3.5 text-center">الحالة</th>
                  <th className="px-5 py-3.5 text-left">الخيارات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredAccounts.map((account) => (
                  <tr key={account.id} className="hover:bg-slate-50/50 transition">
                    {/* Name */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{account.name}</span>
                        {account.is_default && (
                          <span className="bg-amber-50 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-amber-200/50">
                            افتراضي
                          </span>
                        )}
                      </div>
                      {account.notes && (
                        <p className="text-[10px] text-slate-400 mt-1 truncate max-w-[200px]">{account.notes}</p>
                      )}
                    </td>

                    {/* Bank specific columns */}
                    {(activeTab === 'bank' || activeTab === 'all') && (
                      <td className="px-5 py-4">
                        {account.type === 'bank' ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-extrabold text-slate-800">{account.bank_name}</span>
                            </div>
                            {account.account_number && (
                              <p className="text-[10px] text-slate-500 font-mono">رقم الحساب: {account.account_number}</p>
                            )}
                            {account.iban && (
                              <p className="text-[10px] text-slate-400 font-mono">IBAN: {account.iban}</p>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <Wallet className="w-3.5 h-3.5 shrink-0 text-slate-350" />
                            <span>صندوق نقدي</span>
                          </div>
                        )}
                      </td>
                    )}

                    {/* Associated Ledger Account */}
                    <td className="px-5 py-4">
                      <div className="space-y-1">
                        <span className="font-mono text-[11px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                          {account.account_code}
                        </span>
                        <p className="text-[10px] text-slate-500">{account.account_name_ar}</p>
                      </div>
                    </td>

                    {/* Opening Balance */}
                    <td className="px-5 py-4 font-mono font-bold text-slate-500">
                      {account.opening_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {account.currency_code}
                    </td>

                    {/* Current Balance */}
                    <td className="px-5 py-4">
                      <span className={`font-mono font-black text-[13px] ${account.current_balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {account.current_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[9px] text-slate-400 font-bold mr-1">{account.currency_code}</span>
                    </td>

                    {/* Status Toggle Switch */}
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {canManage ? (
                          <button
                            onClick={() => handleToggleActiveDirectly(account)}
                            className={`cursor-pointer w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none ${
                              account.is_active ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                          >
                            <div
                              className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform ${
                                account.is_active ? '-translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 ${
                            account.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                          }`}>
                            {account.is_active ? 'نشط' : 'غير نشط'}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Options/Actions */}
                    <td className="px-5 py-4 text-left">
                      <div className="flex items-center justify-end gap-2">
                        {/* Direct set as default */}
                        {canManage && !account.is_default && account.is_active && (
                          <button
                            onClick={() => handleSetDefaultDirectly(account)}
                            className="cursor-pointer text-[10px] font-bold text-slate-500 hover:text-amber-600 hover:bg-amber-50 border border-slate-200 px-2 py-1 rounded transition"
                            title="تعيين كافتراضي للصرف والقبض"
                          >
                            جعل افتراضي
                          </button>
                        )}

                        {canManage ? (
                          <button
                            onClick={() => handleViewOrEditClick(account, 'edit')}
                            className="cursor-pointer p-1.5 text-slate-500 hover:text-brand-blue hover:bg-slate-100 rounded transition"
                            title="تعديل الحساب"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleViewOrEditClick(account, 'view')}
                            className="cursor-pointer p-1.5 text-slate-500 hover:text-brand-blue hover:bg-slate-100 rounded transition"
                            title="عرض التفاصيل"
                          >
                            <Eye className="w-3.5 h-3.5" />
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

      {/* Create / Edit / View Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs font-sans" dir="rtl">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100"
          >
            {/* Modal Header */}
            <div className="bg-slate-50 border-b border-slate-150 px-6 py-4.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900">
                {type === 'cash' ? <Wallet className="w-5 h-5 text-brand-blue" /> : <Landmark className="w-5 h-5 text-brand-blue" />}
                <h3 className="font-black text-sm">
                  {modalMode === 'create' 
                    ? `إضافة صندوق/حساب بنكي جديد` 
                    : modalMode === 'edit' 
                      ? `تعديل الحساب: ${editingAccount?.name}` 
                      : `تفاصيل الحساب: ${editingAccount?.name}`}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="cursor-pointer text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-100 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Type selector (Only during creation) */}
              {modalMode === 'create' && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 block">نوع الحساب المالي</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setType('cash')}
                      className={`cursor-pointer py-2 px-3 border rounded-lg text-xs font-extrabold text-center transition flex items-center justify-center gap-1.5 ${
                        type === 'cash'
                          ? 'border-brand-blue bg-brand-blue/5 text-brand-blue'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>صندوق (Cash)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setType('bank')}
                      className={`cursor-pointer py-2 px-3 border rounded-lg text-xs font-extrabold text-center transition flex items-center justify-center gap-1.5 ${
                        type === 'bank'
                          ? 'border-brand-blue bg-brand-blue/5 text-brand-blue'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <Landmark className="w-3.5 h-3.5" />
                      <span>حساب بنكي (Bank)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Account Name */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block">اسم الحساب / الصندوق (بالكامل)</label>
                <input
                  type="text"
                  placeholder={type === 'cash' ? 'مثال: صندوق المبيعات الرئيسي' : 'مثال: الحساب الجاري - مصرف الراجحي'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={modalMode === 'view'}
                  className="w-full bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right"
                  required
                />
              </div>

              {/* Associated Chart of Account */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block flex items-center justify-between">
                  <span>ربط بميزانية الدليل الشجري (Ledger Account)</span>
                  {modalMode !== 'create' && <span className="text-[10px] text-amber-600">لا يمكن تعديل الحساب المرتبط بعد الإنشاء</span>}
                </label>
                {modalMode === 'create' ? (
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right"
                    required
                  >
                    <option value="">-- اختر الحساب المرتبط بالأصول من دليل الحسابات --</option>
                    {ledgerAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name_ar} {acc.name_en ? `(${acc.name_en})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full bg-slate-100 border border-slate-200 text-slate-600 rounded-lg px-3 py-2 text-xs flex items-center justify-between font-bold">
                    <span>
                      {editingAccount?.account_code} - {editingAccount?.account_name_ar}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">أصول مبرهنة</span>
                  </div>
                )}
              </div>

              {/* Bank-only fields */}
              {type === 'bank' && (
                <div className="border border-slate-100 bg-slate-50/50 p-4 rounded-xl space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-500 block">اسم البنك</label>
                      <input
                        type="text"
                        placeholder="مثال: مصرف الراجحي"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        disabled={modalMode === 'view'}
                        className="w-full bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right"
                        required={type === 'bank'}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-500 block">رقم الحساب البنكي</label>
                      <input
                        type="text"
                        placeholder="رقم الحساب بدون آيبان"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        disabled={modalMode === 'view'}
                        className="w-full bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right font-mono"
                        required={type === 'bank'}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 block">رقم الآيبان (IBAN)</label>
                    <input
                      type="text"
                      placeholder="مثال: SA0380000..."
                      value={iban}
                      onChange={(e) => setIban(e.target.value)}
                      disabled={modalMode === 'view'}
                      className="w-full bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Balances and Default checkboxes */}
              <div className="grid grid-cols-2 gap-3">
                {/* Opening balance (Only editable during creation) */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 block">
                    الرصيد الافتتاحي
                  </label>
                  {modalMode === 'create' ? (
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={openingBalance || ''}
                        onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-left font-mono"
                      />
                      <span className="absolute right-3 top-2.5 text-[10px] text-slate-400 font-bold">
                        {displayCurrency}
                      </span>
                    </div>
                  ) : (
                    <div className="bg-slate-100 border border-slate-200 text-slate-600 rounded-lg px-3 py-2 text-xs font-mono font-bold text-left">
                      {editingAccount?.opening_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {displayCurrency}
                    </div>
                  )}
                </div>

                {/* Current Balance (Readonly for Edit/View) */}
                {modalMode !== 'create' && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 block">الرصيد الحالي بمحرك القيد</label>
                    <div className="bg-slate-100 border border-slate-200 text-slate-800 rounded-lg px-3 py-2 text-xs font-mono font-bold text-left">
                      {editingAccount?.current_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {displayCurrency}
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block">ملاحظات توضيحية</label>
                <textarea
                  placeholder="أي ملاحظات إدارية أو محاسبية تخص هذا الحساب..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={modalMode === 'view'}
                  rows={2}
                  className="w-full bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-brand-blue focus:bg-white text-right resize-none"
                />
              </div>

              {/* Checkboxes: is_default, is_active */}
              {modalMode !== 'view' && (
                <div className="space-y-3 pt-2">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isDefault}
                      onChange={(e) => setIsDefault(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-brand-blue focus:ring-brand-blue cursor-pointer"
                    />
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-800 block">تعيين كـ حساب افتراضي للصرف والقبض الفوري</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        عند تفعيل هذا الخيار، سيتم إلغاء تفعيل الافتراض لبقية الحسابات من نفس النوع في هذا النظام.
                      </span>
                    </div>
                  </label>

                  {modalMode === 'edit' && (
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-brand-blue focus:ring-brand-blue cursor-pointer"
                      />
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-800 block">تنشيط الحساب وحظر تجميده</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          تجميد الحساب يمنع إدراجه أو اختياره في سندات القبض والدفع والتحويل مستقبلاً.
                        </span>
                      </div>
                    </label>
                  )}
                </div>
              )}
            </form>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-150 px-6 py-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="cursor-pointer border border-slate-200 hover:bg-slate-100 text-slate-600 px-4 py-2 rounded-lg text-xs font-bold transition"
              >
                {modalMode === 'view' ? 'إغلاق نافذة العرض' : 'إلغاء الأمر'}
              </button>

              {modalMode !== 'view' && (
                <button
                  type="button"
                  onClick={handleFormSubmit}
                  disabled={saveLoading}
                  className="cursor-pointer bg-brand-blue hover:bg-brand-blue-dark text-white px-5 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2"
                >
                  {saveLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>حفظ البيانات</span>
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
