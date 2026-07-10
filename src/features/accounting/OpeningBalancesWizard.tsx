import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { openingBalancesService, OpeningBalancesWizardData, OpeningGLRecord, OpeningCustomerRecord, OpeningVendorRecord, OpeningBankRecord, OpeningInventoryRecord } from '../../lib/openingBalancesService';
import { accountingService } from '../../lib/accountingService';
import { masterDataService } from '../../lib/masterDataService';
import { bankingService } from '../../lib/bankingService';
import { Account, Customer, Vendor, Item, CashBankAccount } from '../../types';
import { 
  Sparkles, Calendar, FolderTree, Users, Truck, Wallet, Warehouse, CheckCircle2, 
  AlertTriangle, Save, Play, ChevronRight, ChevronLeft, Plus, Trash2, Eye, Info 
} from 'lucide-react';

export const OpeningBalancesWizard: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const isReadOnly = roleInCurrentOrg === 'viewer';

  // State for data from services
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [cashBankAccounts, setCashBankAccounts] = useState<CashBankAccount[]>([]);

  // Wizard state
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [hasTransactions, setHasTransactions] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Opening Balance Batch and lines state
  const [batchId, setBatchId] = useState<string>('');
  const [batchStatus, setBatchStatus] = useState<'draft' | 'posted'>('draft');
  const [openingDate, setOpeningDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [totalDebit, setTotalDebit] = useState<number>(0);
  const [totalCredit, setTotalCredit] = useState<number>(0);
  const [difference, setDifference] = useState<number>(0);

  // Line items state
  const [glLines, setGlLines] = useState<OpeningGLRecord[]>([]);
  const [customerLines, setCustomerLines] = useState<OpeningCustomerRecord[]>([]);
  const [vendorLines, setVendorLines] = useState<OpeningVendorRecord[]>([]);
  const [bankLines, setBankLines] = useState<OpeningBankRecord[]>([]);
  const [inventoryLines, setInventoryLines] = useState<OpeningInventoryRecord[]>([]);

  // Load wizard data
  const loadWizardData = async () => {
    if (!currentOrg?.id) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const orgId = currentOrg.id;

      // 1. Fetch metadata & checks
      const hasOps = await openingBalancesService.checkOrgHasTransactions(orgId);
      setHasTransactions(hasOps);

      // 2. Fetch master data
      const [accs, custs, vends, itms, cbAccs] = await Promise.all([
        accountingService.getAccounts(orgId),
        masterDataService.getCustomers(orgId),
        masterDataService.getVendors(orgId),
        masterDataService.getItems(orgId),
        bankingService.listCashBankAccounts(orgId)
      ]);

      setAccounts(accs);
      setCustomers(custs);
      setVendors(vends);
      setItems(itms.filter(i => i.is_stockable)); // only stockable items
      setCashBankAccounts(cbAccs);

      // 3. Fetch batch data (existing draft or posted)
      const wizardData = await openingBalancesService.getOpeningBalancesWizardData(orgId);
      const b = wizardData.batch;
      setBatchId(b.id);
      setBatchStatus(b.status);
      setOpeningDate(b.opening_date);
      setNotes(b.notes || '');
      setTotalDebit(b.total_debit);
      setTotalCredit(b.total_credit);
      setDifference(b.difference);

      // Load lines
      setGlLines(wizardData.gl_lines || []);
      setCustomerLines(wizardData.customer_lines || []);
      setVendorLines(wizardData.vendor_lines || []);
      setBankLines(wizardData.bank_lines || []);
      setInventoryLines(wizardData.inventory_lines || []);

    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'فشل تحميل بيانات معالج الأرصدة الافتتاحية.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWizardData();
  }, [currentOrg?.id]);

  // Recalculate totals dynamically on the client side
  useEffect(() => {
    let deb = 0;
    let cred = 0;

    // GL lines
    glLines.forEach(l => {
      deb += Number(l.debit) || 0;
      cred += Number(l.credit) || 0;
    });

    // Customer lines
    customerLines.forEach(l => {
      deb += Number(l.debit) || 0;
      cred += Number(l.credit) || 0;
    });

    // Vendor lines
    vendorLines.forEach(l => {
      deb += Number(l.debit) || 0;
      cred += Number(l.credit) || 0;
    });

    // Bank lines
    bankLines.forEach(l => {
      deb += Number(l.debit) || 0;
      cred += Number(l.credit) || 0;
    });

    // Inventory lines (Debits to inventory asset account)
    inventoryLines.forEach(l => {
      deb += Number(l.quantity) * Number(l.unit_cost) || 0;
    });

    setTotalDebit(deb);
    setTotalCredit(cred);
    setDifference(deb - cred);
  }, [glLines, customerLines, vendorLines, bankLines, inventoryLines]);

  // Save draft
  const handleSaveDraft = async () => {
    if (isReadOnly || batchStatus === 'posted' || !currentOrg?.id) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      // Standardize values
      const cleanGl = glLines.map(l => ({
        account_id: l.account_id,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        notes: l.notes || ''
      }));

      const cleanCustomers = customerLines.map(l => ({
        customer_id: l.customer_id,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        reference: l.reference || '',
        notes: l.notes || ''
      }));

      const cleanVendors = vendorLines.map(l => ({
        vendor_id: l.vendor_id,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        reference: l.reference || '',
        notes: l.notes || ''
      }));

      const cleanBanks = bankLines.map(l => ({
        cash_bank_account_id: l.cash_bank_account_id,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        notes: l.notes || ''
      }));

      const cleanInventory = inventoryLines.map(l => ({
        item_id: l.item_id,
        quantity: Number(l.quantity) || 0,
        unit_cost: Number(l.unit_cost) || 0
      }));

      await openingBalancesService.saveOpeningBalancesWizard(
        currentOrg.id,
        batchId,
        openingDate,
        notes,
        cleanGl,
        cleanCustomers,
        cleanVendors,
        cleanBanks,
        cleanInventory
      );

      setSuccessMessage('تم حفظ المسودة بنجاح.');
      // Reload to ensure db values are in sync
      await loadWizardData();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'حدث خطأ أثناء حفظ المسودة.');
    } finally {
      setIsSaving(false);
    }
  };

  // Post batch
  const handlePostBatch = async () => {
    if (isReadOnly || batchStatus === 'posted' || !currentOrg?.id) return;
    if (Math.abs(difference) > 0.01) {
      setErrorMessage('لا يمكن ترحيل أرصدة غير متوازنة. يجب أن يكون الفرق صفراً.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      // Save draft first to make sure database has latest entries
      const cleanGl = glLines.map(l => ({
        account_id: l.account_id,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        notes: l.notes || ''
      }));

      const cleanCustomers = customerLines.map(l => ({
        customer_id: l.customer_id,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        reference: l.reference || '',
        notes: l.notes || ''
      }));

      const cleanVendors = vendorLines.map(l => ({
        vendor_id: l.vendor_id,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        reference: l.reference || '',
        notes: l.notes || ''
      }));

      const cleanBanks = bankLines.map(l => ({
        cash_bank_account_id: l.cash_bank_account_id,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        notes: l.notes || ''
      }));

      const cleanInventory = inventoryLines.map(l => ({
        item_id: l.item_id,
        quantity: Number(l.quantity) || 0,
        unit_cost: Number(l.unit_cost) || 0
      }));

      await openingBalancesService.saveOpeningBalancesWizard(
        currentOrg.id,
        batchId,
        openingDate,
        notes,
        cleanGl,
        cleanCustomers,
        cleanVendors,
        cleanBanks,
        cleanInventory
      );

      // Now Post
      const jeId = await openingBalancesService.postOpeningBalancesWizard(currentOrg.id, batchId);
      setSuccessMessage('تم اعتماد وترحيل الأرصدة الافتتاحية بنجاح وإنشاء قيد اليومية المتوازن.');
      setBatchStatus('posted');
      await loadWizardData();
      setCurrentStep(7); // Jump to review screen
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'حدث خطأ أثناء اعتماد الأرصدة.');
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to add row to list
  const addGLRow = () => {
    if (batchStatus === 'posted' || isReadOnly) return;
    setGlLines([...glLines, { account_id: '', debit: 0, credit: 0, notes: '' }]);
  };

  const removeGLRow = (index: number) => {
    if (batchStatus === 'posted' || isReadOnly) return;
    setGlLines(glLines.filter((_, i) => i !== index));
  };

  const updateGLRow = (index: number, field: keyof OpeningGLRecord, value: any) => {
    const updated = [...glLines];
    updated[index] = { ...updated[index], [field]: value };
    setGlLines(updated);
  };

  const addCustomerRow = () => {
    if (batchStatus === 'posted' || isReadOnly) return;
    setCustomerLines([...customerLines, { customer_id: '', debit: 0, credit: 0, reference: '', notes: '' }]);
  };

  const removeCustomerRow = (index: number) => {
    if (batchStatus === 'posted' || isReadOnly) return;
    setCustomerLines(customerLines.filter((_, i) => i !== index));
  };

  const updateCustomerRow = (index: number, field: keyof OpeningCustomerRecord, value: any) => {
    const updated = [...customerLines];
    updated[index] = { ...updated[index], [field]: value };
    setCustomerLines(updated);
  };

  const addVendorRow = () => {
    if (batchStatus === 'posted' || isReadOnly) return;
    setVendorLines([...vendorLines, { vendor_id: '', debit: 0, credit: 0, reference: '', notes: '' }]);
  };

  const removeVendorRow = (index: number) => {
    if (batchStatus === 'posted' || isReadOnly) return;
    setVendorLines(vendorLines.filter((_, i) => i !== index));
  };

  const updateVendorRow = (index: number, field: keyof OpeningVendorRecord, value: any) => {
    const updated = [...vendorLines];
    updated[index] = { ...updated[index], [field]: value };
    setVendorLines(updated);
  };

  const addBankRow = () => {
    if (batchStatus === 'posted' || isReadOnly) return;
    setBankLines([...bankLines, { cash_bank_account_id: '', debit: 0, credit: 0, notes: '' }]);
  };

  const removeBankRow = (index: number) => {
    if (batchStatus === 'posted' || isReadOnly) return;
    setBankLines(bankLines.filter((_, i) => i !== index));
  };

  const updateBankRow = (index: number, field: keyof OpeningBankRecord, value: any) => {
    const updated = [...bankLines];
    updated[index] = { ...updated[index], [field]: value };
    setBankLines(updated);
  };

  const addInventoryRow = () => {
    if (batchStatus === 'posted' || isReadOnly) return;
    setInventoryLines([...inventoryLines, { item_id: '', quantity: 0, unit_cost: 0 }]);
  };

  const removeInventoryRow = (index: number) => {
    if (batchStatus === 'posted' || isReadOnly) return;
    setInventoryLines(inventoryLines.filter((_, i) => i !== index));
  };

  const updateInventoryRow = (index: number, field: keyof OpeningInventoryRecord, value: any) => {
    const updated = [...inventoryLines];
    updated[index] = { ...updated[index], [field]: value };
    setInventoryLines(updated);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-10 h-10 border-4 border-brand-blue border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-slate-500 font-sans">جاري تحميل بيانات معالج الأرصدة الافتتاحية...</p>
      </div>
    );
  }

  const stepsList = [
    { number: 1, title: 'التهيئة والتحقق', icon: Calendar },
    { number: 2, title: 'الحسابات العامة', icon: FolderTree },
    { number: 3, title: 'أرصدة العملاء', icon: Users },
    { number: 4, title: 'أرصدة الموردين', icon: Truck },
    { number: 5, title: 'الصناديق والبنوك', icon: Wallet },
    { number: 6, title: 'المخزون الافتتاحي', icon: Warehouse },
    { number: 7, title: 'المراجعة والترحيل', icon: CheckCircle2 }
  ];

  return (
    <div className="space-y-6 font-sans select-none" dir="rtl">
      
      {/* Wizard Header Status */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-brand-blue/10 p-3 rounded-2xl text-brand-blue">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              معالج الأرصدة الافتتاحية المالي الآمن
              {batchStatus === 'posted' ? (
                <span className="bg-emerald-50 text-emerald-600 text-[10px] px-2.5 py-1 rounded-full font-bold border border-emerald-100 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> معتمد ومرحل
                </span>
              ) : (
                <span className="bg-amber-50 text-amber-600 text-[10px] px-2.5 py-1 rounded-full font-bold border border-amber-100">
                  مسودة قيد التحضير
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              يساعدك هذا المعالج على إدخال أرصدة بداية النشاط لجميع الحسابات، الذمم، والمنتجات بشكل متزن ومحكم محاسبياً.
            </p>
          </div>
        </div>

        {/* Global Statistics */}
        <div className="flex items-center gap-6 border-r md:border-r-0 md:border-l border-slate-100 pr-0 md:pr-6 pl-0 md:pl-6">
          <div className="text-center">
            <span className="text-[10px] text-slate-400 block font-bold">إجمالي المدين</span>
            <span className="text-sm font-black text-slate-800 font-mono">
              {totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currentOrg?.currency_code}
            </span>
          </div>
          <div className="text-center">
            <span className="text-[10px] text-slate-400 block font-bold">إجمالي الدائن</span>
            <span className="text-sm font-black text-slate-800 font-mono">
              {totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currentOrg?.currency_code}
            </span>
          </div>
          <div className="text-center">
            <span className="text-[10px] text-slate-400 block font-bold">الفارق</span>
            <span className={`text-sm font-black font-mono px-2 py-0.5 rounded-lg ${Math.abs(difference) < 0.01 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50 animate-pulse'}`}>
              {difference.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currentOrg?.currency_code}
            </span>
          </div>
        </div>
      </div>

      {/* Progress Stepper */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm overflow-x-auto">
        <div className="flex items-center justify-between min-w-[800px] px-4">
          {stepsList.map((step, idx) => {
            const IconComponent = step.icon;
            const isCompleted = step.number < currentStep;
            const isActive = step.number === currentStep;

            return (
              <React.Fragment key={step.number}>
                <button
                  onClick={() => setCurrentStep(step.number)}
                  className={`flex flex-col items-center gap-2 cursor-pointer transition outline-none group`}
                >
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition border ${
                    isCompleted 
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                      : isActive
                      ? 'bg-brand-blue text-white border-brand-blue shadow-md'
                      : 'bg-slate-50 text-slate-400 border-slate-100 group-hover:bg-slate-100'
                  }`}>
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <span className={`text-[11px] font-bold ${isActive ? 'text-brand-blue font-black' : isCompleted ? 'text-slate-600' : 'text-slate-400'}`}>
                    {step.title}
                  </span>
                </button>
                {idx < stepsList.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 transition ${step.number < currentStep ? 'bg-emerald-200' : 'bg-slate-100'}`}></div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Alert Notices */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-100 text-rose-700 p-4 rounded-2xl flex items-start gap-3 text-xs leading-relaxed">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-500" />
          <p>{errorMessage}</p>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-4 rounded-2xl flex items-start gap-3 text-xs leading-relaxed">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
          <p>{successMessage}</p>
        </div>
      )}

      {/* STEP 1: Preparation */}
      {currentStep === 1 && (
        <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm space-y-6">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand-blue" />
            تحديد تاريخ الأرصدة الافتتاحية والتحقق الأمني
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 block">تاريخ بداية الأرصدة الافتتاحية (Opening Date)</label>
              <input 
                type="date"
                value={openingDate}
                disabled={batchStatus === 'posted' || isReadOnly}
                onChange={(e) => setOpeningDate(e.target.value)}
                className="w-full text-xs font-mono px-4 py-3 border border-slate-200 rounded-2xl focus:border-brand-blue outline-none transition disabled:bg-slate-50 text-slate-700"
              />
              <p className="text-[10px] text-slate-400 leading-relaxed">
                يجب أن يكون هذا التاريخ هو اليوم السابق مباشرة لبدء العمليات المالية الفعلية في نظام LEDGRA (مثل أول يوم في السنة المالية، أو تاريخ بدء استخدام النظام).
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 block">عملة المنشأة الافتراضية</label>
              <div className="w-full text-xs px-4 py-3 border border-slate-100 bg-slate-50 rounded-2xl text-slate-700 font-bold font-mono">
                {currentOrg?.currency_code || 'SAR'}
              </div>
              <p className="text-[10px] text-slate-400">
                يتم تحديد العملة تلقائياً بناءً على العملة الافتراضية المحددة في إعدادات منشأتك.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 block">وصف أو ملاحظات عامة للدفعة</label>
            <textarea
              rows={3}
              value={notes}
              disabled={batchStatus === 'posted' || isReadOnly}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: الأرصدة الافتتاحية لشركة ليدجرا للعام المالي الجديد..."
              className="w-full text-xs px-4 py-3 border border-slate-200 rounded-2xl focus:border-brand-blue outline-none transition disabled:bg-slate-50 text-slate-700"
            />
          </div>

          {/* Strong Warning Check */}
          {hasTransactions && (
            <div className="bg-amber-50 border border-amber-100 p-5 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-amber-800 font-black text-xs">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>تنبيـه وتحذيـر هـام جـداً:</span>
              </div>
              <p className="text-xs text-amber-700 leading-relaxed font-semibold">
                تم تسجيل عمليات مالية أو فواتير معتمدة لهذه المنشأة بالفعل. إدخال الأرصدة الافتتاحية بعد بدء العمليات قد يتسبب في تضارب التقارير المالية وميزان المراجعة.
              </p>
              <p className="text-[11px] text-amber-600 leading-relaxed">
                إذا قمت بالترحيل الآن، يرجى التأكد التام من القيم المدخلة وأنها تمثل الأرصدة الفعلية المقابلة لتاريخ التهيئة لمنع أي فوارق مالية.
              </p>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: General Ledger Accounts */}
      {currentStep === 2 && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-brand-blue" />
              أرصدة الحسابات العامة (دليل الحسابات)
            </h3>
            {batchStatus === 'draft' && !isReadOnly && (
              <button
                onClick={addGLRow}
                className="bg-brand-blue hover:bg-brand-blue-dark text-white text-xs px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" /> إضافة حساب
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-[11px] font-black text-right pb-3">
                  <th className="pb-3 w-1/3">الحساب المالي</th>
                  <th className="pb-3 w-1/6">مدين (Debit)</th>
                  <th className="pb-3 w-1/6">دائن (Credit)</th>
                  <th className="pb-3">ملاحظة</th>
                  {batchStatus === 'draft' && !isReadOnly && <th className="pb-3 w-10 text-center">حذف</th>}
                </tr>
              </thead>
              <tbody>
                {glLines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                      لا توجد حسابات مدخلة بعد. انقر فوق "إضافة حساب" لبدء الإدخال.
                    </td>
                  </tr>
                ) : (
                  glLines.map((line, idx) => (
                    <tr key={idx} className="border-b border-slate-50 last:border-0">
                      <td className="py-3">
                        <select
                          value={line.account_id}
                          disabled={batchStatus === 'posted' || isReadOnly}
                          onChange={(e) => updateGLRow(idx, 'account_id', e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none disabled:bg-slate-50"
                        >
                          <option value="">-- اختر الحساب المالي --</option>
                          {accounts
                            .filter(a => a.allow_direct_posting) // list only posting level accounts
                            .map(a => (
                              <option key={a.id} value={a.id}>
                                {a.code} - {a.name_ar} ({a.nature === 'debit' ? 'مدين' : 'دائن'})
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="py-3 pl-2">
                        <input
                          type="number"
                          placeholder="0.00"
                          disabled={batchStatus === 'posted' || isReadOnly}
                          value={line.debit || ''}
                          onChange={(e) => updateGLRow(idx, 'debit', parseFloat(e.target.value) || 0)}
                          className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none text-left"
                        />
                      </td>
                      <td className="py-3 pl-2">
                        <input
                          type="number"
                          placeholder="0.00"
                          disabled={batchStatus === 'posted' || isReadOnly}
                          value={line.credit || ''}
                          onChange={(e) => updateGLRow(idx, 'credit', parseFloat(e.target.value) || 0)}
                          className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none text-left"
                        />
                      </td>
                      <td className="py-3 pl-2">
                        <input
                          type="text"
                          placeholder="ملاحظات توضيحية للرصيد..."
                          disabled={batchStatus === 'posted' || isReadOnly}
                          value={line.notes || ''}
                          onChange={(e) => updateGLRow(idx, 'notes', e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none"
                        />
                      </td>
                      {batchStatus === 'draft' && !isReadOnly && (
                        <td className="py-3 text-center">
                          <button
                            onClick={() => removeGLRow(idx)}
                            className="text-slate-300 hover:text-rose-500 transition outline-none cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STEP 3: Customers */}
      {currentStep === 3 && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-blue" />
              أرصدة العملاء الافتتاحية (Accounts Receivable)
            </h3>
            {batchStatus === 'draft' && !isReadOnly && (
              <button
                onClick={addCustomerRow}
                className="bg-brand-blue hover:bg-brand-blue-dark text-white text-xs px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" /> إضافة عميل
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-[11px] font-black text-right pb-3">
                  <th className="pb-3 w-1/3">العميل</th>
                  <th className="pb-3 w-1/5">نوع الرصيد</th>
                  <th className="pb-3 w-1/5">الرصيد الافتتاحي</th>
                  <th className="pb-3">مرجع / ملاحظة</th>
                  {batchStatus === 'draft' && !isReadOnly && <th className="pb-3 w-10 text-center">حذف</th>}
                </tr>
              </thead>
              <tbody>
                {customerLines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                      لا توجد أرصدة عملاء مدخلة بعد. انقر فوق "إضافة عميل" لبدء الإدخال.
                    </td>
                  </tr>
                ) : (
                  customerLines.map((line, idx) => (
                    <tr key={idx} className="border-b border-slate-50 last:border-0">
                      <td className="py-3">
                        <select
                          value={line.customer_id}
                          disabled={batchStatus === 'posted' || isReadOnly}
                          onChange={(e) => updateCustomerRow(idx, 'customer_id', e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none disabled:bg-slate-50"
                        >
                          <option value="">-- اختر العميل --</option>
                          {customers.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.code} - {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pl-2">
                        <select
                          value={line.debit > 0 ? 'debit' : 'credit'}
                          disabled={batchStatus === 'posted' || isReadOnly}
                          onChange={(e) => {
                            const val = e.target.value;
                            const amt = Math.max(line.debit, line.credit);
                            if (val === 'debit') {
                              updateCustomerRow(idx, 'debit', amt);
                              updateCustomerRow(idx, 'credit', 0);
                            } else {
                              updateCustomerRow(idx, 'credit', amt);
                              updateCustomerRow(idx, 'debit', 0);
                            }
                          }}
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none disabled:bg-slate-50"
                        >
                          <option value="debit">مدين (عليه مستحقات)</option>
                          <option value="credit">دائن (له رصيد مسبق)</option>
                        </select>
                      </td>
                      <td className="py-3 pl-2">
                        <input
                          type="number"
                          placeholder="0.00"
                          disabled={batchStatus === 'posted' || isReadOnly}
                          value={line.debit > 0 ? line.debit : line.credit || ''}
                          onChange={(e) => {
                            const amt = parseFloat(e.target.value) || 0;
                            if (line.debit > 0 || (line.debit === 0 && line.credit === 0)) {
                              updateCustomerRow(idx, 'debit', amt);
                              updateCustomerRow(idx, 'credit', 0);
                            } else {
                              updateCustomerRow(idx, 'credit', amt);
                              updateCustomerRow(idx, 'debit', 0);
                            }
                          }}
                          className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none text-left"
                        />
                      </td>
                      <td className="py-3 pl-2">
                        <input
                          type="text"
                          placeholder="ملاحظات توضيحية أو رقم مرجع..."
                          disabled={batchStatus === 'posted' || isReadOnly}
                          value={line.notes || ''}
                          onChange={(e) => updateCustomerRow(idx, 'notes', e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none"
                        />
                      </td>
                      {batchStatus === 'draft' && !isReadOnly && (
                        <td className="py-3 text-center">
                          <button
                            onClick={() => removeCustomerRow(idx)}
                            className="text-slate-300 hover:text-rose-500 transition outline-none cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STEP 4: Vendors */}
      {currentStep === 4 && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Truck className="w-5 h-5 text-brand-blue" />
              أرصدة الموردين الافتتاحية (Accounts Payable)
            </h3>
            {batchStatus === 'draft' && !isReadOnly && (
              <button
                onClick={addVendorRow}
                className="bg-brand-blue hover:bg-brand-blue-dark text-white text-xs px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" /> إضافة مورد
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-[11px] font-black text-right pb-3">
                  <th className="pb-3 w-1/3">المورد</th>
                  <th className="pb-3 w-1/5">نوع الرصيد</th>
                  <th className="pb-3 w-1/5">الرصيد الافتتاحي</th>
                  <th className="pb-3">مرجع / ملاحظة</th>
                  {batchStatus === 'draft' && !isReadOnly && <th className="pb-3 w-10 text-center">حذف</th>}
                </tr>
              </thead>
              <tbody>
                {vendorLines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                      لا توجد أرصدة موردين مدخلة بعد. انقر فوق "إضافة مورد" لبدء الإدخال.
                    </td>
                  </tr>
                ) : (
                  vendorLines.map((line, idx) => (
                    <tr key={idx} className="border-b border-slate-50 last:border-0">
                      <td className="py-3">
                        <select
                          value={line.vendor_id}
                          disabled={batchStatus === 'posted' || isReadOnly}
                          onChange={(e) => updateVendorRow(idx, 'vendor_id', e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none disabled:bg-slate-50"
                        >
                          <option value="">-- اختر المورد --</option>
                          {vendors.map(v => (
                            <option key={v.id} value={v.id}>
                              {v.code} - {v.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pl-2">
                        <select
                          value={line.credit > 0 ? 'credit' : 'debit'}
                          disabled={batchStatus === 'posted' || isReadOnly}
                          onChange={(e) => {
                            const val = e.target.value;
                            const amt = Math.max(line.debit, line.credit);
                            if (val === 'credit') {
                              updateVendorRow(idx, 'credit', amt);
                              updateVendorRow(idx, 'debit', 0);
                            } else {
                              updateVendorRow(idx, 'debit', amt);
                              updateVendorRow(idx, 'credit', 0);
                            }
                          }}
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none disabled:bg-slate-50"
                        >
                          <option value="credit">دائن (له مستحقات علينا)</option>
                          <option value="debit">مدين (مدفوع مقدمًا)</option>
                        </select>
                      </td>
                      <td className="py-3 pl-2">
                        <input
                          type="number"
                          placeholder="0.00"
                          disabled={batchStatus === 'posted' || isReadOnly}
                          value={line.credit > 0 ? line.credit : line.debit || ''}
                          onChange={(e) => {
                            const amt = parseFloat(e.target.value) || 0;
                            if (line.credit > 0 || (line.debit === 0 && line.credit === 0)) {
                              updateVendorRow(idx, 'credit', amt);
                              updateVendorRow(idx, 'debit', 0);
                            } else {
                              updateVendorRow(idx, 'debit', amt);
                              updateVendorRow(idx, 'credit', 0);
                            }
                          }}
                          className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none text-left"
                        />
                      </td>
                      <td className="py-3 pl-2">
                        <input
                          type="text"
                          placeholder="ملاحظات توضيحية أو رقم مرجع..."
                          disabled={batchStatus === 'posted' || isReadOnly}
                          value={line.notes || ''}
                          onChange={(e) => updateVendorRow(idx, 'notes', e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none"
                        />
                      </td>
                      {batchStatus === 'draft' && !isReadOnly && (
                        <td className="py-3 text-center">
                          <button
                            onClick={() => removeVendorRow(idx)}
                            className="text-slate-300 hover:text-rose-500 transition outline-none cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STEP 5: Cash & Bank Accounts */}
      {currentStep === 5 && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-brand-blue" />
              أرصدة الصناديق والحسابات البنكية الافتتاحية
            </h3>
            {batchStatus === 'draft' && !isReadOnly && (
              <button
                onClick={addBankRow}
                className="bg-brand-blue hover:bg-brand-blue-dark text-white text-xs px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" /> إضافة رصيد نقدية/بنك
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-[11px] font-black text-right pb-3">
                  <th className="pb-3 w-1/3">الصندوق / البنك</th>
                  <th className="pb-3 w-1/6">مدين (رصيد إيجابي)</th>
                  <th className="pb-3 w-1/6">دائن (سحب على المكشوف)</th>
                  <th className="pb-3">ملاحظة</th>
                  {batchStatus === 'draft' && !isReadOnly && <th className="pb-3 w-10 text-center">حذف</th>}
                </tr>
              </thead>
              <tbody>
                {bankLines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                      لا توجد نقدية مدخلة بعد. انقر فوق "إضافة رصيد نقدية/بنك" لبدء الإدخال.
                    </td>
                  </tr>
                ) : (
                  bankLines.map((line, idx) => (
                    <tr key={idx} className="border-b border-slate-50 last:border-0">
                      <td className="py-3">
                        <select
                          value={line.cash_bank_account_id}
                          disabled={batchStatus === 'posted' || isReadOnly}
                          onChange={(e) => updateBankRow(idx, 'cash_bank_account_id', e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none disabled:bg-slate-50"
                        >
                          <option value="">-- اختر الصندوق أو البنك --</option>
                          {cashBankAccounts.map(b => (
                            <option key={b.id} value={b.id}>
                              {b.name} ({b.type === 'bank' ? 'حساب بنكي' : 'صندوق كاش'})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pl-2">
                        <input
                          type="number"
                          placeholder="0.00"
                          disabled={batchStatus === 'posted' || isReadOnly}
                          value={line.debit || ''}
                          onChange={(e) => updateBankRow(idx, 'debit', parseFloat(e.target.value) || 0)}
                          className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none text-left"
                        />
                      </td>
                      <td className="py-3 pl-2">
                        <input
                          type="number"
                          placeholder="0.00"
                          disabled={batchStatus === 'posted' || isReadOnly}
                          value={line.credit || ''}
                          onChange={(e) => updateBankRow(idx, 'credit', parseFloat(e.target.value) || 0)}
                          className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none text-left"
                        />
                      </td>
                      <td className="py-3 pl-2">
                        <input
                          type="text"
                          placeholder="ملاحظات..."
                          disabled={batchStatus === 'posted' || isReadOnly}
                          value={line.notes || ''}
                          onChange={(e) => updateBankRow(idx, 'notes', e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none"
                        />
                      </td>
                      {batchStatus === 'draft' && !isReadOnly && (
                        <td className="py-3 text-center">
                          <button
                            onClick={() => removeBankRow(idx)}
                            className="text-slate-300 hover:text-rose-500 transition outline-none cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STEP 6: Opening Inventory */}
      {currentStep === 6 && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Warehouse className="w-5 h-5 text-brand-blue" />
              أرصدة وكميات المخزون الافتتاحي (Inventory Assets)
            </h3>
            {batchStatus === 'draft' && !isReadOnly && (
              <button
                onClick={addInventoryRow}
                className="bg-brand-blue hover:bg-brand-blue-dark text-white text-xs px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" /> إضافة صنف للمخزون
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
            <Info className="w-4 h-4 text-brand-blue inline-block ml-1" />
            يجب إدخال كميات المواد وتكلفة الوحدة (متوسط التكلفة WAC). عند ترحيل هذه الدفعة، سيتم زيادة كميات الصنف وإثبات قيمة مخزون بضاعة أول المدة كمدين على حساب مخزون المواد.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-[11px] font-black text-right pb-3">
                  <th className="pb-3 w-1/3">الصنف / المنتج</th>
                  <th className="pb-3 w-1/5">الكمية الافتتاحية</th>
                  <th className="pb-3 w-1/5">تكلفة الوحدة (WAC)</th>
                  <th className="pb-3 w-1/5 text-left">إجمالي القيمة الافتتاحية</th>
                  {batchStatus === 'draft' && !isReadOnly && <th className="pb-3 w-10 text-center">حذف</th>}
                </tr>
              </thead>
              <tbody>
                {inventoryLines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                      لا يوجد مخزون مدخل بعد. انقر فوق "إضافة صنف" لبدء الإدخال.
                    </td>
                  </tr>
                ) : (
                  inventoryLines.map((line, idx) => (
                    <tr key={idx} className="border-b border-slate-50 last:border-0">
                      <td className="py-3">
                        <select
                          value={line.item_id}
                          disabled={batchStatus === 'posted' || isReadOnly}
                          onChange={(e) => updateInventoryRow(idx, 'item_id', e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none disabled:bg-slate-50"
                        >
                          <option value="">-- اختر الصنف المخزني --</option>
                          {items.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.code} - {item.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pl-2">
                        <input
                          type="number"
                          placeholder="0.0000"
                          disabled={batchStatus === 'posted' || isReadOnly}
                          value={line.quantity || ''}
                          onChange={(e) => updateInventoryRow(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none text-left"
                        />
                      </td>
                      <td className="py-3 pl-2">
                        <input
                          type="number"
                          placeholder="0.00"
                          disabled={batchStatus === 'posted' || isReadOnly}
                          value={line.unit_cost || ''}
                          onChange={(e) => updateInventoryRow(idx, 'unit_cost', parseFloat(e.target.value) || 0)}
                          className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-xl focus:border-brand-blue outline-none text-left"
                        />
                      </td>
                      <td className="py-3 pl-2 text-left text-xs font-mono font-bold text-slate-800">
                        {((line.quantity || 0) * (line.unit_cost || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })} {currentOrg?.currency_code}
                      </td>
                      {batchStatus === 'draft' && !isReadOnly && (
                        <td className="py-3 text-center">
                          <button
                            onClick={() => removeInventoryRow(idx)}
                            className="text-slate-300 hover:text-rose-500 transition outline-none cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STEP 7: Review and Post */}
      {currentStep === 7 && (
        <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm space-y-8">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            المراجعة النهائية لدفعة الأرصدة الافتتاحية والترحيل
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-50 p-5 rounded-2xl">
              <span className="text-[11px] text-slate-400 font-bold block">تاريخ القيد الافتتاحي</span>
              <span className="text-xs text-slate-700 font-black mt-1 block font-mono">{openingDate}</span>
            </div>
            <div className="bg-slate-50 p-5 rounded-2xl">
              <span className="text-[11px] text-slate-400 font-bold block">إجمالي قيم المدخلات (مدين)</span>
              <span className="text-xs text-slate-700 font-black mt-1 block font-mono">{totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currentOrg?.currency_code}</span>
            </div>
            <div className="bg-slate-50 p-5 rounded-2xl">
              <span className="text-[11px] text-slate-400 font-bold block">إجمالي قيم المدخلات (دائن)</span>
              <span className="text-xs text-slate-700 font-black mt-1 block font-mono">{totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currentOrg?.currency_code}</span>
            </div>
          </div>

          {/* Validation Status card */}
          {Math.abs(difference) < 0.01 ? (
            <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-6 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 font-black text-xs">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span>الأرصدة متوازنة ومستعدة للترحيل!</span>
              </div>
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                ممتاز، الفرق بين إجمالي المدين والدائن يساوي صفراً. هذا يعني أن القيد الافتتاحي متوازن محاسبياً وسليم 100%. يمكنك ترحيله بأمان.
              </p>
            </div>
          ) : (
            <div className="bg-rose-50 border border-rose-100 text-rose-800 p-6 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 font-black text-xs">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <span>غير متوازن! لا يمكن ترحيل الأرصدة حالياً</span>
              </div>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                الفرق الحالي هو <strong className="font-mono">{difference.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currentOrg?.currency_code}</strong>.
                وفقاً لمبادئ القيد المزدوج، يجب أن يتساوى المدين مع الدائن تماماً لضمان سلامة ميزانية المنشأة الاسترشادية والتقارير. يرجى تدارك الفارق في الحسابات العامة بالخطوة الثانية (مثال: حساب رأس المال).
              </p>
            </div>
          )}

          {/* Full review summary table */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-700">ملخص ومراجعة البنود المدخلة:</h4>
            <div className="border border-slate-100 rounded-2xl overflow-hidden text-xs">
              <div className="grid grid-cols-3 bg-slate-50 p-3 font-bold text-slate-500 border-b border-slate-100">
                <span>البيان / القسم</span>
                <span className="text-center">مدين (Debit)</span>
                <span className="text-left">دائن (Credit)</span>
              </div>
              
              {/* GL review */}
              <div className="grid grid-cols-3 p-3 border-b border-slate-50 hover:bg-slate-50">
                <span className="font-semibold text-slate-700">أرصدة الحسابات العامة (دليل الحسابات)</span>
                <span className="text-center font-mono">{glLines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                <span className="text-left font-mono">{glLines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              {/* Customers review */}
              <div className="grid grid-cols-3 p-3 border-b border-slate-50 hover:bg-slate-50">
                <span className="font-semibold text-slate-700">أرصدة العملاء (حسابات الذمم المدينة)</span>
                <span className="text-center font-mono">{customerLines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                <span className="text-left font-mono">{customerLines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              {/* Vendors review */}
              <div className="grid grid-cols-3 p-3 border-b border-slate-50 hover:bg-slate-50">
                <span className="font-semibold text-slate-700">أرصدة الموردين (حسابات الذمم الدائنة)</span>
                <span className="text-center font-mono">{vendorLines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                <span className="text-left font-mono">{vendorLines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              {/* Bank review */}
              <div className="grid grid-cols-3 p-3 border-b border-slate-50 hover:bg-slate-50">
                <span className="font-semibold text-slate-700">أرصدة الصناديق والحسابات البنكية</span>
                <span className="text-center font-mono">{bankLines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                <span className="text-left font-mono">{bankLines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              {/* Inventory review */}
              <div className="grid grid-cols-3 p-3 hover:bg-slate-50">
                <span className="font-semibold text-slate-700">أرصدة المخزون الافتتاحي للبضاعة</span>
                <span className="text-center font-mono">{inventoryLines.reduce((acc, l) => acc + (Number(l.quantity) * Number(l.unit_cost) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                <span className="text-left font-mono">0.00</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Controls */}
      <div className="flex items-center justify-between bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-3">
          {currentStep > 1 && (
            <button
              onClick={() => setCurrentStep(currentStep - 1)}
              className="px-5 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition flex items-center gap-1 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" /> الخطوة السابقة
            </button>
          )}

          {currentStep < 7 && (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1 cursor-pointer"
            >
              الخطوة التالية <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {batchStatus === 'draft' && !isReadOnly && (
            <>
              <button
                disabled={isSaving}
                onClick={handleSaveDraft}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Save className="w-4 h-4" /> {isSaving ? 'جاري الحفظ...' : 'حفظ المسودة'}
              </button>

              {currentStep === 7 && (
                <button
                  disabled={isSaving || Math.abs(difference) > 0.01}
                  onClick={handlePostBatch}
                  className="px-6 py-2.5 bg-brand-blue hover:bg-brand-blue-dark disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs font-extrabold rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Play className="w-4 h-4" /> {isSaving ? 'جاري الاعتماد...' : 'اعتماد وترحيل الأرصدة'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

    </div>
  );
};
