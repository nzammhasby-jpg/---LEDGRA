import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { masterDataService } from '../../lib/masterDataService';
import { accountingService } from '../../lib/accountingService';
import { Vendor, Account, VendorType } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { 
  formatNumberWithLatinDigits, 
  normalizeInputDigits,
  normalizeDecimalInput
} from '../../lib/formatters';
import { 
  Truck, 
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

export const VendorsPage: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  
  // Checking permissions
  const canManage = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin' || roleInCurrentOrg === 'accountant';
  
  // Data State
  const [vendors, setVendors] = useState<Vendor[]>([]);
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
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  
  // Form values
  const [code, setCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [vendorType, setVendorType] = useState<VendorType>('company');
  const [taxNumber, setTaxNumber] = useState<string>('');
  const [commercialRegistration, setCommercialRegistration] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [mobile, setMobile] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [openingBalance, setOpeningBalance] = useState<string>('0');
  const [openingBalanceType, setOpeningBalanceType] = useState<'debit' | 'credit'>('credit');
  const [payableAccountId, setPayableAccountId] = useState<string>('');
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
      const [allVendors, allAccounts, settings] = await Promise.all([
        masterDataService.getVendors(currentOrg!.id),
        accountingService.getAccounts(currentOrg!.id),
        accountingService.getAccountingSettings(currentOrg!.id).catch(() => null)
      ]);

      setVendors(allVendors);
      
      // Filter final active accounts from Liabilities
      const liabilitiesAccounts = allAccounts.filter(acc => 
        acc.classification === 'liabilities' && 
        acc.allow_direct_posting && 
        acc.is_active
      );
      setAccounts(liabilitiesAccounts);

      // Auto-set default payables account if configured
      if (settings?.default_payables_account_id) {
        const found = liabilitiesAccounts.some(acc => acc.id === settings.default_payables_account_id);
        if (found) {
          setPayableAccountId(settings.default_payables_account_id);
        }
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Open modal for Add
  const handleAddClick = () => {
    setEditingVendor(null);
    setFormError(null);
    
    // Auto-generate a logical vendor code based on current list length
    const nextNum = vendors.length + 1;
    const paddingStr = String(nextNum).padStart(4, '0');
    setCode(`VEND-${paddingStr}`);
    
    setName('');
    setDisplayName('');
    setVendorType('company');
    setTaxNumber('');
    setCommercialRegistration('');
    setEmail('');
    setPhone('');
    setMobile('');
    setCity('');
    setAddress('');
    setOpeningBalance('0');
    setOpeningBalanceType('credit');
    setNotes('');
    setIsActive(true);

    // Default to the first liabilities account or default settings account if available
    accountingService.getAccountingSettings(currentOrg!.id)
      .then(settings => {
        if (settings?.default_payables_account_id) {
          setPayableAccountId(settings.default_payables_account_id);
        } else if (accounts.length > 0) {
          setPayableAccountId(accounts[0].id);
        }
      })
      .catch(() => {
        if (accounts.length > 0) {
          setPayableAccountId(accounts[0].id);
        }
      });

    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleEditClick = (vend: Vendor) => {
    setEditingVendor(vend);
    setFormError(null);
    
    setCode(vend.code);
    setName(vend.name);
    setDisplayName(vend.display_name || '');
    setVendorType(vend.vendor_type);
    setTaxNumber(vend.tax_number || '');
    setCommercialRegistration(vend.commercial_registration || '');
    setEmail(vend.email || '');
    setPhone(vend.phone || '');
    setMobile(vend.mobile || '');
    setCity(vend.city || '');
    setAddress(vend.address || '');
    setOpeningBalance(String(vend.opening_balance));
    setOpeningBalanceType(vend.opening_balance_type || 'credit');
    setPayableAccountId(vend.payable_account_id);
    setNotes(vend.notes || '');
    setIsActive(vend.is_active);

    setIsModalOpen(true);
  };

  // Toggle active status directly
  const handleToggleActive = async (vend: Vendor) => {
    if (!canManage) return;
    try {
      setLoading(true);
      await masterDataService.updateVendor(currentOrg!.id, vend.id, {
        code: vend.code,
        name: vend.name,
        display_name: vend.display_name || undefined,
        vendor_type: vend.vendor_type,
        tax_number: vend.tax_number || undefined,
        commercial_registration: vend.commercial_registration || undefined,
        email: vend.email || undefined,
        phone: vend.phone || undefined,
        mobile: vend.mobile || undefined,
        city: vend.city || undefined,
        address: vend.address || undefined,
        opening_balance: vend.opening_balance,
        opening_balance_type: vend.opening_balance_type,
        payable_account_id: vend.payable_account_id,
        is_active: !vend.is_active,
        notes: vend.notes || undefined
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
      setFormError('كود المورد مطلوب بشكل إلزامي.');
      return;
    }
    if (!name.trim()) {
      setFormError('اسم المورد مطلوب.');
      return;
    }
    if (!payableAccountId) {
      setFormError('يجب ربط المورد بحساب الذمم الدائنة محاسبياً.');
      return;
    }

    setSaveLoading(true);
    try {
      const cleanOpeningBal = parseFloat(normalizeDecimalInput(openingBalance)) || 0.00;

      const inputPayload = {
        code: normalizeInputDigits(code.trim()).toUpperCase(),
        name: name.trim(),
        display_name: displayName.trim() || undefined,
        vendor_type: vendorType,
        tax_number: normalizeInputDigits(taxNumber.trim()) || undefined,
        commercial_registration: normalizeInputDigits(commercialRegistration.trim()) || undefined,
        email: email.trim() || undefined,
        phone: normalizeInputDigits(phone.trim()) || undefined,
        mobile: normalizeInputDigits(mobile.trim()) || undefined,
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        opening_balance: cleanOpeningBal,
        opening_balance_type: openingBalanceType,
        payable_account_id: payableAccountId,
        notes: notes.trim() || undefined,
      };

      if (editingVendor) {
        // Update
        await masterDataService.updateVendor(currentOrg.id, editingVendor.id, {
          ...inputPayload,
          is_active: isActive
        });
      } else {
        // Create
        await masterDataService.createVendor(currentOrg.id, inputPayload);
      }

      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaveLoading(false);
    }
  };

  // Filtered vendors list
  const filteredVendors = vendors.filter(vend => {
    const term = searchQuery.toLowerCase();
    const matchSearch = 
      vend.name.toLowerCase().includes(term) ||
      vend.code.toLowerCase().includes(term) ||
      (vend.tax_number && vend.tax_number.includes(term)) ||
      (vend.mobile && vend.mobile.includes(term)) ||
      (vend.display_name && vend.display_name.toLowerCase().includes(term));

    const matchStatus = 
      statusFilter === 'all' || 
      (statusFilter === 'active' && vend.is_active) || 
      (statusFilter === 'inactive' && !vend.is_active);

    const matchType = 
      typeFilter === 'all' || 
      vend.vendor_type === typeFilter;

    return matchSearch && matchStatus && matchType;
  });

  const getVendorTypeLabel = (type: VendorType) => {
    switch (type) {
      case 'individual': return 'فرد';
      case 'company': return 'شركة / مؤسسة';
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
              <Truck className="w-5 h-5" />
            </span>
            <h1 className="text-lg font-black text-slate-800 font-sans tracking-tight">إدارة قاعدة الموردين والمشتروات</h1>
          </div>
          <p className="text-xs text-slate-400">ملفات الموردين التجاريين والمقاولين وتفاصيل الحسابات الشجرية المرتبطة بهم للذمم الدائنة.</p>
        </div>

        {canManage ? (
          <button
            onClick={handleAddClick}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-brand-blue text-white rounded-xl text-xs font-bold hover:bg-brand-blue-dark transition duration-150 shadow-md shadow-brand-blue/10"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مورد جديد</span>
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
              placeholder="البحث باسم المورد، الكود، الرقم الضريبي، الجوال..."
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
              <option value="active">الموردون النشطون فقط</option>
              <option value="inactive">الموردون المعطلون</option>
            </select>
          </div>

          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 text-slate-700 outline-none"
            >
              <option value="all">كل فئات الموردين</option>
              <option value="company">مؤسسات وشركات</option>
              <option value="individual">أفراد ومقاولون مستقلون</option>
              <option value="other">أخرى</option>
            </select>
          </div>

        </div>
      </div>

      {/* Main Vendors Table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-24 text-center text-slate-400 flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 text-brand-blue animate-spin mb-3" />
            <span className="text-xs font-bold text-slate-500">جاري تحميل ملفات الموردين...</span>
          </div>
        ) : filteredVendors.length === 0 ? (
          <div className="py-24 text-center text-slate-300 flex flex-col items-center justify-center">
            <Truck className="w-16 h-16 text-slate-100 mb-4" />
            <span className="font-bold text-sm text-slate-550">لم نجد أي مورد مستجل</span>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">لا يوجد موردون يطابقون شروط التصفية الحالية.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-150 text-slate-500 font-bold">
                  <th className="px-5 py-3 w-28">الكود الإنجليزي</th>
                  <th className="px-5 py-3">اسم المورد والشركة</th>
                  <th className="px-5 py-3">التصنيف</th>
                  <th className="px-5 py-3">الجوال / الهاتف</th>
                  <th className="px-5 py-3">الرقم الضريبي</th>
                  <th className="px-5 py-3">الحساب الدفتري (ذمم دائنة)</th>
                  <th className="px-5 py-3 text-left">الرصيد الافتتاحي</th>
                  <th className="px-5 py-3 text-center">حالة الملف</th>
                  <th className="px-5 py-3 text-center w-28">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredVendors.map(vend => (
                  <tr key={vend.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-4 font-mono text-slate-500 tracking-wider">
                      {vend.code}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-800">{vend.name}</div>
                      {vend.display_name && vend.display_name !== vend.name && (
                        <div className="text-[10px] text-slate-400 mt-0.5">{vend.display_name}</div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <span className="px-2 py-1 bg-slate-50 border border-slate-100 rounded-md">
                        {getVendorTypeLabel(vend.vendor_type)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500 font-mono tracking-wide" dir="ltr">
                      {vend.mobile || vend.phone || <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-5 py-4 font-mono text-slate-500 tracking-wide" dir="ltr">
                      {vend.tax_number || <span className="text-slate-300">غير مسجل</span>}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <div className="flex items-center gap-1 text-[11px]">
                        <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold">{vend.payable_account?.code || '21'}</span>
                        <span className="truncate max-w-[120px]">{vend.payable_account?.name_ar || 'دمم دائنة'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-left font-mono tabular-nums font-bold text-slate-800" dir="ltr">
                      <span>{formatNumberWithLatinDigits(vend.opening_balance)}</span>
                      <span className={`text-[10px] mr-1 px-1 rounded ${
                        vend.opening_balance_type === 'credit' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {vend.opening_balance_type === 'credit' ? 'د' : 'م'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button 
                        onClick={() => handleToggleActive(vend)}
                        disabled={!canManage}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${
                          vend.is_active 
                            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100/70' 
                            : 'bg-rose-50 text-rose-500 hover:bg-rose-100/70'
                        } transition`}
                      >
                        <span className={`w-1 h-1 rounded-full ${vend.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                        <span>{vend.is_active ? 'نشط' : 'معطل'}</span>
                      </button>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleEditClick(vend)}
                          className="p-1 text-slate-400 hover:text-brand-blue hover:bg-slate-50 rounded transition"
                          title="تعديل بيانات المورد"
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

      {/* Slide-over/Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  {editingVendor ? `تعديل بيانات المورد: ${editingVendor.name}` : 'تسجيل ملف مورد تجاري جديد'}
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">ستحفظ معلومات المورد المحاسبية وحساب الذمم الدائنة بأمان لتسهيل الفوترة والمشتريات لاحقاً.</p>
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
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">الكود الإنجليزي للمورد (فريد)</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(normalizeInputDigits(e.target.value).toUpperCase())}
                    className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="مثال: VEND-0001"
                    required
                    dir="ltr"
                  />
                </div>

                {/* Vendor Type */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">تصنيف جهة المورد</label>
                  <select
                    value={vendorType}
                    onChange={(e) => setVendorType(e.target.value as VendorType)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                  >
                    <option value="company">شركة أو مؤسسة تجارية</option>
                    <option value="individual">أفراد ومقاولين</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>

                {/* Name */}
                <div className="md:col-span-2">
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">اسم المورد الرسمي</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!displayName) setDisplayName(e.target.value);
                    }}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none focus:border-brand-blue"
                    placeholder="الاسم الكامل للشركة الموردة أو الفرد المستقل"
                    required
                  />
                </div>

                {/* Display Name */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">اسم العرض (اختياري)</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="مثال: مصنع لِدجرا للمشتريات"
                  />
                </div>

                {/* Direct Posting Payable Account */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">حساب المطلوبات الدائنة المرتبط بالدليل</label>
                  <select
                    value={payableAccountId}
                    onChange={(e) => setPayableAccountId(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none"
                    required
                  >
                    <option value="">-- يرجى اختيار حساب الموردين والذمم الدائنة --</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name_ar} (التزامات)
                      </option>
                    ))}
                  </select>
                  <p className="text-[9px] text-slate-400 mt-1">يظهر هنا الحسابات الفرعية النشطة من تصنيف الالتزامات فقط.</p>
                </div>

                {/* Tax Number */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">الرقم الضريبي للمورد (15 رقماً إنجليزياً)</label>
                  <input
                    type="text"
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(normalizeInputDigits(e.target.value))}
                    maxLength={15}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="الرقم الضريبي للمورد"
                    dir="ltr"
                  />
                </div>

                {/* Commercial Registration */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">رقم السجل التجاري (إنجليزي)</label>
                  <input
                    type="text"
                    value={commercialRegistration}
                    onChange={(e) => setCommercialRegistration(normalizeInputDigits(e.target.value))}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="رقم السجل التجاري"
                    dir="ltr"
                  />
                </div>

                {/* Contact detail: Email */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">البريد الإلكتروني للطلبات</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="vendor@example.com"
                  />
                </div>

                {/* Mobile */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">رقم الجوال التجاري (رقم إنجليزي)</label>
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
                    placeholder="الرياض، الدمام..."
                  />
                </div>

                {/* Address */}
                <div className="md:col-span-2">
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">العنوان والمستودعات بالكامل</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="عنوان مقر المورد الرئيسي أو مستودعه لتوريد البضاعة"
                  />
                </div>

                {/* Opening Balance */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">الرصيد الافتتاحي المستحق للمورد (بيان دفتري)</label>
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
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">طبيعة رصيد المورد</label>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer">
                      <input
                        type="radio"
                        checked={openingBalanceType === 'credit'}
                        onChange={() => setOpeningBalanceType('credit')}
                        className="text-brand-blue focus:ring-brand-blue"
                      />
                      <span className="text-indigo-600">دائن (افتراضي للمطلوبات والموردين)</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer">
                      <input
                        type="radio"
                        checked={openingBalanceType === 'debit'}
                        onChange={() => setOpeningBalanceType('debit')}
                        className="text-brand-blue focus:ring-brand-blue"
                      />
                      <span className="text-slate-500">مدين</span>
                    </label>
                  </div>
                </div>

                {/* Notes */}
                <div className="md:col-span-2">
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">ملاحظات توريد وشروط دفع</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 outline-none focus:border-brand-blue"
                    placeholder="مثال: شروط الدفع السداد بعد 30 يوماً من استلام الفاتورة..."
                  />
                </div>

                {/* Active Toggle Status */}
                {editingVendor && (
                  <div className="md:col-span-2 border-t border-slate-100 pt-3 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">حالة ملف المورد الحالية</span>
                      <span className="text-[10px] text-slate-400">إذا تم التعطيل، فلن يظهر المورد في فواتير المشتريات وصرف النفقات الملحقة مستقبلاً.</span>
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
                        {isActive ? 'المورد نشط حالياً' : 'المورد معطل'}
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
                  <span>{editingVendor ? 'حفظ التعديلات' : 'تسجيل المورد'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
