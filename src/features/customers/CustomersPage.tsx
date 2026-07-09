import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { masterDataService } from '../../lib/masterDataService';
import { accountingService } from '../../lib/accountingService';
import { Customer, Account, CustomerType } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { getCountryProfile } from '../../lib/countryProfiles';
import { 
  formatNumberWithLatinDigits, 
  normalizeInputDigits,
  normalizeDecimalInput
} from '../../lib/formatters';
import { 
  Users, 
  Search, 
  Plus, 
  X, 
  Edit, 
  CheckCircle, 
  XCircle, 
  Phone, 
  Building2, 
  Hash, 
  FileSpreadsheet, 
  AlertCircle,
  Loader2,
  Lock
} from 'lucide-react';

export const CustomersPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Checking permissions
  const canManage = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant';
  
  // Data State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Search & Filters state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Form Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  // Form values
  const [code, setCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [customerType, setCustomerType] = useState<CustomerType>('company');
  const [taxNumber, setTaxNumber] = useState<string>('');
  const [commercialRegistration, setCommercialRegistration] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [mobile, setMobile] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [openingBalance, setOpeningBalance] = useState<string>('0');
  const [openingBalanceType, setOpeningBalanceType] = useState<'debit' | 'credit'>('debit');
  const [receivableAccountId, setReceivableAccountId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  useEffect(() => {
    if (currentOrg?.id) {
      loadData();
    }
  }, [currentOrg?.id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [allCustomers, allAccounts, settings] = await Promise.all([
        masterDataService.getCustomers(currentOrg!.id),
        accountingService.getAccounts(currentOrg!.id),
        accountingService.getAccountingSettings(currentOrg!.id).catch(() => null)
      ]);

      setCustomers(allCustomers);
      
      // Filter final active accounts from Assets
      const assetsAccounts = allAccounts.filter(acc => 
        acc.classification === 'assets' && 
        acc.allow_direct_posting && 
        acc.is_active
      );
      setAccounts(assetsAccounts);

      // Auto-set default receivables account if configured
      if (settings?.default_receivables_account_id) {
        const found = assetsAccounts.some(acc => acc.id === settings.default_receivables_account_id);
        if (found) {
          setReceivableAccountId(settings.default_receivables_account_id);
        }
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Open modal for Add
  const handleAddClick = useCallback(() => {
    setEditingCustomer(null);
    setFormError(null);
    
    // Auto-generate a logical customer code based on current list length
    const nextNum = customers.length + 1;
    const paddingStr = String(nextNum).padStart(4, '0');
    setCode(`CUST-${paddingStr}`);
    
    setName('');
    setDisplayName('');
    setCustomerType('company');
    setTaxNumber('');
    setCommercialRegistration('');
    setEmail('');
    setPhone('');
    setMobile('');
    setCity('');
    setAddress('');
    setOpeningBalance('0');
    setOpeningBalanceType('debit');
    setNotes('');
    setIsActive(true);

    // Default to the first assets account or default settings account if available
    accountingService.getAccountingSettings(currentOrg!.id)
      .then(settings => {
        if (settings?.default_receivables_account_id) {
          setReceivableAccountId(settings.default_receivables_account_id);
        } else if (accounts.length > 0) {
          setReceivableAccountId(accounts[0].id);
        }
      })
      .catch(() => {
        if (accounts.length > 0) {
          setReceivableAccountId(accounts[0].id);
        }
      });

    setIsModalOpen(true);
  }, [customers, accounts, currentOrg]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);

    if (params.get('action') === 'new') {
      handleAddClick();
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, navigate, handleAddClick]);

  // Open modal for Edit
  const handleEditClick = (cust: Customer) => {
    setEditingCustomer(cust);
    setFormError(null);
    
    setCode(cust.code);
    setName(cust.name);
    setDisplayName(cust.display_name || '');
    setCustomerType(cust.customer_type);
    setTaxNumber(cust.tax_number || '');
    setCommercialRegistration(cust.commercial_registration || '');
    setEmail(cust.email || '');
    setPhone(cust.phone || '');
    setMobile(cust.mobile || '');
    setCity(cust.city || '');
    setAddress(cust.address || '');
    setOpeningBalance(String(cust.opening_balance));
    setOpeningBalanceType(cust.opening_balance_type || 'debit');
    setReceivableAccountId(cust.receivable_account_id);
    setNotes(cust.notes || '');
    setIsActive(cust.is_active);

    setIsModalOpen(true);
  };

  // Toggle active status directly
  const handleToggleActive = async (cust: Customer) => {
    if (!canManage) return;
    try {
      setLoading(true);
      await masterDataService.updateCustomer(currentOrg!.id, cust.id, {
        code: cust.code,
        name: cust.name,
        display_name: cust.display_name || undefined,
        customer_type: cust.customer_type,
        tax_number: cust.tax_number || undefined,
        commercial_registration: cust.commercial_registration || undefined,
        email: cust.email || undefined,
        phone: cust.phone || undefined,
        mobile: cust.mobile || undefined,
        city: cust.city || undefined,
        address: cust.address || undefined,
        opening_balance: cust.opening_balance,
        opening_balance_type: cust.opening_balance_type,
        receivable_account_id: cust.receivable_account_id,
        is_active: !cust.is_active,
        notes: cust.notes || undefined
      });
      await loadData();
    } catch (err: any) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    if (!currentOrg) return;

    setFormError(null);
    
    // Validations
    if (!code.trim()) {
      setFormError('كود العميل مطلوب بشكل إلزامي.');
      return;
    }
    if (!name.trim()) {
      setFormError('اسم العميل مطلوب.');
      return;
    }
    if (!receivableAccountId) {
      setFormError('يجب ربط العميل بحساب الذمم المدينة محاسبياً.');
      return;
    }

    setSaveLoading(true);
    try {
      const cleanOpeningBal = parseFloat(normalizeDecimalInput(openingBalance)) || 0.00;

      const inputPayload = {
        code: normalizeInputDigits(code.trim()).toUpperCase(),
        name: name.trim(),
        display_name: displayName.trim() || undefined,
        customer_type: customerType,
        tax_number: normalizeInputDigits(taxNumber.trim()) || undefined,
        commercial_registration: normalizeInputDigits(commercialRegistration.trim()) || undefined,
        email: email.trim() || undefined,
        phone: normalizeInputDigits(phone.trim()) || undefined,
        mobile: normalizeInputDigits(mobile.trim()) || undefined,
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        opening_balance: cleanOpeningBal,
        opening_balance_type: openingBalanceType,
        receivable_account_id: receivableAccountId,
        notes: notes.trim() || undefined,
      };

      if (editingCustomer) {
        // Update
        await masterDataService.updateCustomer(currentOrg.id, editingCustomer.id, {
          ...inputPayload,
          is_active: isActive
        });
      } else {
        // Create
        await masterDataService.createCustomer(currentOrg.id, inputPayload);
      }

      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaveLoading(false);
    }
  };

  // Filtered customers list
  const filteredCustomers = customers.filter(cust => {
    const term = searchQuery.toLowerCase();
    const matchSearch = 
      cust.name.toLowerCase().includes(term) ||
      cust.code.toLowerCase().includes(term) ||
      (cust.tax_number && cust.tax_number.includes(term)) ||
      (cust.mobile && cust.mobile.includes(term)) ||
      (cust.display_name && cust.display_name.toLowerCase().includes(term));

    const matchStatus = 
      statusFilter === 'all' || 
      (statusFilter === 'active' && cust.is_active) || 
      (statusFilter === 'inactive' && !cust.is_active);

    const matchType = 
      typeFilter === 'all' || 
      cust.customer_type === typeFilter;

    return matchSearch && matchStatus && matchType;
  });

  const getCustomerTypeLabel = (type: CustomerType) => {
    switch (type) {
      case 'individual': return 'فرد';
      case 'company': return 'شركة';
      case 'government': return 'جهة حكومية';
      default: return 'أخرى';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 bg-brand-blue/10 rounded-lg text-brand-blue">
              <Users className="w-5 h-5" />
            </span>
            <h1 className="text-lg font-black text-slate-800 font-sans tracking-tight">إدارة قاعدة العملاء</h1>
          </div>
          <p className="text-xs text-slate-400">ملفات العملاء المعتمدين والمؤسسات الحكومية وتفاصيل الحسابات الشجرية المرتبطة بهم.</p>
        </div>

        {canManage ? (
          <button
            onClick={handleAddClick}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-brand-blue text-white rounded-xl text-xs font-bold hover:bg-brand-blue-dark transition duration-150 shadow-md shadow-brand-blue/10"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة عميل جديد</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>غير مصرح بإجراء تعديلات</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl flex items-start gap-2 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Section */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          
          <div className="md:col-span-2 relative">
            <input
              type="text"
              placeholder={`البحث بالاسم، الكود، ${getCountryProfile(currentOrg?.country_code).vatLabel}، الجوال...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-9 py-2.5 text-slate-800 outline-none focus:border-brand-blue"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 text-slate-700 outline-none"
            >
              <option value="all">كل الحالات الإلكترونية</option>
              <option value="active">العملاء النشطون فقط</option>
              <option value="inactive">العملاء المعطلون</option>
            </select>
          </div>

          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 text-slate-700 outline-none"
            >
              <option value="all">كل فئات العملاء</option>
              <option value="company">شركات ومؤسسات</option>
              <option value="individual">أفراد مستقلين</option>
              <option value="government">جهات حكومية</option>
              <option value="other">أخرى</option>
            </select>
          </div>

        </div>
      </div>

      {/* Main Customers Table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-24 text-center text-slate-400 flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 text-brand-blue animate-spin mb-3" />
            <span className="text-xs font-bold text-slate-500">جاري تحميل بيانات العملاء...</span>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="py-24 text-center text-slate-300 flex flex-col items-center justify-center">
            <Users className="w-16 h-16 text-slate-100 mb-4" />
            <span className="font-bold text-sm text-slate-550">لم نجد أي عملاء</span>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">لا يوجد عملاء يطابقون فلاتر البحث الحالية، أو أنك لم تقم بتهيئة أي عميل حتى الآن.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-150 text-slate-500 font-bold">
                  <th className="px-5 py-3 w-28">الكود الإنجليزي</th>
                  <th className="px-5 py-3">الاسم التجاري والبيان</th>
                  <th className="px-5 py-3">الفئة</th>
                  <th className="px-5 py-3">الجوال / الهاتف</th>
                  <th className="px-5 py-3">{getCountryProfile(currentOrg?.country_code).vatLabel}</th>
                  <th className="px-5 py-3">الحساب الدفتري المرتبط</th>
                  <th className="px-5 py-3 text-left">الرصيد الافتتاحي</th>
                  <th className="px-5 py-3 text-center">حالة الحساب</th>
                  <th className="px-5 py-3 text-center w-28">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredCustomers.map(cust => (
                  <tr key={cust.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-4 font-mono text-slate-500 tracking-wider">
                      {cust.code}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-800">{cust.name}</div>
                      {cust.display_name && cust.display_name !== cust.name && (
                        <div className="text-[10px] text-slate-400 mt-0.5">{cust.display_name}</div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <span className="px-2 py-1 bg-slate-50 border border-slate-100 rounded-md">
                        {getCustomerTypeLabel(cust.customer_type)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500 font-mono tracking-wide" dir="ltr">
                      {cust.mobile || cust.phone || <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-5 py-4 font-mono text-slate-500 tracking-wide" dir="ltr">
                      {cust.tax_number || <span className="text-slate-300">غير مسجل</span>}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <div className="flex items-center gap-1 text-[11px]">
                        <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold">{cust.receivable_account?.code || '11'}</span>
                        <span className="truncate max-w-[120px]">{cust.receivable_account?.name_ar || 'ذمم مدينة'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-left font-mono tabular-nums font-bold text-slate-800" dir="ltr">
                      <span>{formatNumberWithLatinDigits(cust.opening_balance)}</span>
                      <span className={`text-[10px] mr-1 px-1 rounded ${
                        cust.opening_balance_type === 'debit' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {cust.opening_balance_type === 'debit' ? 'م' : 'د'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button 
                        onClick={() => handleToggleActive(cust)}
                        disabled={!canManage}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${
                          cust.is_active 
                            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100/70' 
                            : 'bg-rose-50 text-rose-500 hover:bg-rose-100/70'
                        } transition`}
                      >
                        <span className={`w-1 h-1 rounded-full ${cust.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                        <span>{cust.is_active ? 'نشط' : 'معطل'}</span>
                      </button>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleEditClick(cust)}
                          className="p-1 text-slate-400 hover:text-brand-blue hover:bg-slate-50 rounded transition"
                          title="تعديل بيانات العميل"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Side Slide-over/Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/45 dark:bg-slate-950/65 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  {editingCustomer ? `تعديل بيانات العميل: ${editingCustomer.name}` : 'تسجيل ملف عميل جديد في السحابة'}
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">ستحفظ معلومات العميل المحاسبية والتفاصيل الضريبية بأمان.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-150 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form Content */}
            <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4 flex-1">
              {formError && (
                <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl flex items-start gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* ID/Code */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">الكود الإنجليزي (فريد)</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(normalizeInputDigits(e.target.value).toUpperCase())}
                    className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="مثال: CUST-0001"
                    required
                    dir="ltr"
                  />
                </div>

                {/* Customer Type */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">تصنيف جهة العميل</label>
                  <select
                    value={customerType}
                    onChange={(e) => setCustomerType(e.target.value as CustomerType)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                  >
                    <option value="company">شركة أو مؤسسة</option>
                    <option value="individual">أفراد مستقلين</option>
                    <option value="government">جهة حكومية أو شبه حكومية</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>

                {/* Name */}
                <div className="md:col-span-2">
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">اسم العميل الرسمي</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!displayName) setDisplayName(e.target.value);
                    }}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-brand-blue"
                    placeholder="الاسم الكامل للعميل أو اسم الشركة الرسمي"
                    required
                  />
                </div>

                {/* Display Name */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">اسم العرض على الفاتورة (اختياري)</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="مثال: شركة لِدجرا المحدودة"
                  />
                </div>

                {/* Direct Posting Receivable Account */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">الحساب المساعد المرتبط بدليل الحسابات</label>
                  <select
                    value={receivableAccountId}
                    onChange={(e) => setReceivableAccountId(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                    required
                  >
                    <option value="">-- يرجى اختيار حساب الذمم المدينة من الأصول --</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name_ar} (أصول)
                      </option>
                    ))}
                  </select>
                  <p className="text-[9px] text-slate-400 mt-1">يظهر هنا الحسابات الفرعية المفتوحة للترحيل من تصنيف الأصول فقط.</p>
                </div>

                {/* Tax Number */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    {getCountryProfile(currentOrg?.country_code).vatLabel}
                  </label>
                  <input
                    type="text"
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(normalizeInputDigits(e.target.value))}
                    maxLength={getCountryProfile(currentOrg?.country_code).code === 'SA' ? 15 : undefined}
                    inputMode={getCountryProfile(currentOrg?.country_code).code === 'SA' ? 'numeric' : 'text'}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder={getCountryProfile(currentOrg?.country_code).code === 'SA' ? "الرقم الضريبي المكون من 15 خانة" : "الرقم الضريبي / رقم المكلّف"}
                    dir="ltr"
                  />
                </div>

                {/* Commercial Registration */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    {getCountryProfile(currentOrg?.country_code).crLabel}
                  </label>
                  <input
                    type="text"
                    value={commercialRegistration}
                    onChange={(e) => setCommercialRegistration(normalizeInputDigits(e.target.value))}
                    inputMode={getCountryProfile(currentOrg?.country_code).code === 'SA' ? 'numeric' : 'text'}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder={getCountryProfile(currentOrg?.country_code).code === 'SA' ? "رقم السجل الرقمي" : "رقم السجل / الترخيص"}
                    dir="ltr"
                  />
                </div>

                {/* Contact detail: Email */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="customer@example.com"
                  />
                </div>

                {/* Mobile */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">رقم الجوال (رقم إنجليزي)</label>
                  <input
                    type="text"
                    value={mobile}
                    onChange={(e) => setMobile(normalizeInputDigits(e.target.value))}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="05xxxxxxx"
                    dir="ltr"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">الهاتف الثابت (رقم إنجليزي)</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(normalizeInputDigits(e.target.value))}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="011xxxxxxx"
                    dir="ltr"
                  />
                </div>

                {/* City */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">المدينة</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="الرياض، جدة..."
                  />
                </div>

                {/* Address */}
                <div className="md:col-span-2">
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">العنوان الوطني / العنوان بالكامل</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="اسم الشارع، الرمز البريدي، الحي..."
                  />
                </div>

                {/* Opening Balance */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">الرصيد الافتتاحي (بيانات فقط)</label>
                  <input
                    type="text"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(normalizeDecimalInput(e.target.value))}
                    className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-brand-blue text-left"
                    placeholder="0.00"
                    dir="ltr"
                  />
                </div>

                {/* Opening Balance Type */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">طبيعة الرصيد الافتتاحي</label>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer">
                      <input
                        type="radio"
                        checked={openingBalanceType === 'debit'}
                        onChange={() => setOpeningBalanceType('debit')}
                        className="text-brand-blue focus:ring-brand-blue"
                      />
                      <span className="text-emerald-600">مدين (افتراضي للأصول)</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer">
                      <input
                        type="radio"
                        checked={openingBalanceType === 'credit'}
                        onChange={() => setOpeningBalanceType('credit')}
                        className="text-brand-blue focus:ring-brand-blue"
                      />
                      <span className="text-slate-500">دائن</span>
                    </label>
                  </div>
                </div>

                {/* Notes */}
                <div className="md:col-span-2">
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">ملاحظات إضافية (داخلية)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="تسجيل شروط دفع مخصصة، ساعات العمل وغيرها..."
                  />
                </div>

                {/* Active/Inactive Status Toggle */}
                {editingCustomer && (
                  <div className="md:col-span-2 border-t border-slate-100 pt-3 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">حالة العميل الحالية</span>
                      <span className="text-[10px] text-slate-400">إذا تم التعطيل، فلن يظهر العميل في حقول الاختيار للفواتير المستقبلية.</span>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => setIsActive(!isActive)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold ${
                          isActive 
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' 
                            : 'bg-rose-50 text-rose-500 border border-rose-200'
                        }`}
                      >
                        {isActive ? 'العميل نشط حالياً' : 'العميل معطل'}
                      </button>
                    </div>
                  </div>
                )}

              </div>

              {/* Form Footer */}
              <div className="border-t border-slate-100 pt-4 flex items-center justify-end gap-2 bg-slate-50/50 -mx-5 -mb-5 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition duration-150"
                >
                  إلغاء التراجع
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="flex items-center gap-1.5 px-5 py-2 bg-brand-blue text-white rounded-xl text-xs font-bold hover:bg-brand-blue-dark transition duration-150 disabled:opacity-50"
                >
                  {saveLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingCustomer ? 'حفظ التعديلات' : 'تسجيل العميل'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
