import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { journalService } from '../../lib/journalService';
import { accountingService } from '../../lib/accountingService';
import { JournalEntry, JournalEntryLine, Account, FiscalYear, FiscalPeriod } from '../../types';
import { formatArabicDateWithLatinDigits, formatNumberWithLatinDigits, normalizeDecimalInput } from '../../lib/formatters';
import { getErrorMessage } from '../../lib/errors';
import { 
  FileText, 
  Plus, 
  Search, 
  Trash2, 
  Eye, 
  Edit3, 
  CheckCircle, 
  RotateCcw, 
  X, 
  Check, 
  AlertCircle, 
  Calendar,
  AlertTriangle,
  History,
  Info
} from 'lucide-react';

export const JournalEntries: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  
  // Filtering states
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('');
  const [filterPeriod, setFilterPeriod] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Active Modals: 'add' | 'edit' | 'detail' | null
  const [activeModal, setActiveModal] = useState<'add' | 'edit' | 'detail' | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [selectedEntryDetails, setSelectedEntryDetails] = useState<JournalEntry | null>(null);

  // Form states
  const [formDate, setFormDate] = useState<string>('');
  const [formReference, setFormReference] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formLines, setFormLines] = useState<Array<{
    account_id: string;
    description: string;
    debit: string;
    credit: string;
  }>>([
    { account_id: '', description: '', debit: '', credit: '' },
    { account_id: '', description: '', debit: '', credit: '' }
  ]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isPrivileged = ['owner', 'admin', 'accountant'].includes(roleInCurrentOrg || '');

  // Load baseline data on component mount/organization change
  useEffect(() => {
    if (currentOrg) {
      loadBaselineData();
    }
  }, [currentOrg]);

  // Load fiscal periods when the selected fiscal year changes in filter
  useEffect(() => {
    if (filterYear) {
      accountingService.getFiscalPeriods(filterYear)
        .then(setFiscalPeriods)
        .catch(err => console.error('Error fetching fiscal periods: ', err));
    } else {
      setFiscalPeriods([]);
      setFilterPeriod('');
    }
  }, [filterYear]);

  const loadBaselineData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const [yearsData, accountsData] = await Promise.all([
        accountingService.getFiscalYears(currentOrg.id),
        accountingService.getAccounts(currentOrg.id)
      ]);

      setFiscalYears(yearsData);
      
      // Set default selected financial year to the current active year
      const curYear = yearsData.find(y => y.is_current) || yearsData[0];
      if (curYear) {
        setFilterYear(curYear.id);
      }

      setAccounts(accountsData);
      
      // Load general items list
      await fetchJournalEntriesList();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchJournalEntriesList = async () => {
    if (!currentOrg) return;
    try {
      const records = await journalService.getJournalEntries(currentOrg.id, {
        status: filterStatus as any,
        fiscalYearId: filterYear || undefined,
        fiscalPeriodId: filterPeriod || undefined,
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
        search: searchQuery || undefined
      });
      setEntries(records);
    } catch (err: any) {
      setError(getErrorMessage(err));
    }
  };

  // Run filtering on search queries/filter selections change
  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    fetchJournalEntriesList();
  };

  const handleResetFilters = () => {
    setFilterStatus('all');
    const curYear = fiscalYears.find(y => y.is_current) || fiscalYears[0];
    setFilterYear(curYear ? curYear.id : '');
    setFilterPeriod('');
    setFilterStartDate('');
    setFilterEndDate('');
    setSearchQuery('');
    
    // Fetch directly after state resets
    setTimeout(() => {
      fetchJournalEntriesList();
    }, 50);
  };

  // Open the add entry modal
  const handleOpenAddModal = () => {
    setError(null);
    setSuccess(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormReference('');
    setFormDescription('');
    setFormLines([
      { account_id: '', description: '', debit: '', credit: '' },
      { account_id: '', description: '', debit: '', credit: '' }
    ]);
    setFormError(null);
    setActiveModal('add');
  };

  // Open the edit entry modal
  const handleOpenEditModal = async (entry: JournalEntry) => {
    setError(null);
    setSuccess(null);
    setFormError(null);
    try {
      setSubmitting(true);
      const fullEntry = await journalService.getJournalEntry(currentOrg!.id, entry.id);
      setSelectedEntry(fullEntry);
      
      setFormDate(fullEntry.entry_date);
      setFormReference(fullEntry.reference || '');
      setFormDescription(fullEntry.description || '');
      
      const lineItems = (fullEntry.lines || []).map((l: JournalEntryLine) => ({
        account_id: l.account_id,
        description: l.description || '',
        debit: l.debit > 0 ? l.debit.toString() : '',
        credit: l.credit > 0 ? l.credit.toString() : ''
      }));

      setFormLines(lineItems.length >= 2 ? lineItems : [
        { account_id: '', description: '', debit: '', credit: '' },
        { account_id: '', description: '', debit: '', credit: '' }
      ]);
      
      setActiveModal('edit');
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Open detail view modal
  const handleOpenDetailModal = async (entry: JournalEntry) => {
    setError(null);
    try {
      setLoading(true);
      const fullEntry = await journalService.getJournalEntry(currentOrg!.id, entry.id);
      setSelectedEntryDetails(fullEntry);
      setActiveModal('detail');
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Form managers
  const handleAddLine = () => {
    setFormLines([...formLines, { account_id: '', description: '', debit: '', credit: '' }]);
  };

  const handleRemoveLine = (index: number) => {
    if (formLines.length <= 2) {
      setFormError('يجب أن يحتوي القيد على بندين على الأقل.');
      return;
    }
    const updated = [...formLines];
    updated.splice(index, 1);
    setFormLines(updated);
  };

  const handleLineValueChange = (index: number, field: 'account_id' | 'description' | 'debit' | 'credit', value: string) => {
    const updated = [...formLines];
    let sanitizedVal = value;

    if (field === 'debit' || field === 'credit') {
      sanitizedVal = normalizeDecimalInput(value);
      
      // Prevent both debit and credit on the same line
      if (field === 'debit' && Number(sanitizedVal) > 0) {
        updated[index]['credit'] = '';
      } else if (field === 'credit' && Number(sanitizedVal) > 0) {
        updated[index]['debit'] = '';
      }
    }

    updated[index][field] = sanitizedVal;
    setFormLines(updated);
  };

  // Form Sums calculations
  const calculateTotals = () => {
    let debitSum = 0;
    let creditSum = 0;
    formLines.forEach(l => {
      debitSum += Number(l.debit || 0);
      creditSum += Number(l.credit || 0);
    });
    const difference = Math.abs(debitSum - creditSum);
    return {
      debitSum,
      creditSum,
      difference,
      isBalanced: debitSum > 0 && Math.abs(difference) < 0.001
    };
  };

  const { debitSum, creditSum, difference, isBalanced } = calculateTotals();

  // Create or Update form submission
  const handleFormSubmit = async (e: React.FormEvent, type: 'save_draft' | 'save_and_post') => {
    e.preventDefault();
    if (!currentOrg) return;
    setSubmitting(true);
    setFormError(null);

    // Validate entries
    if (formLines.length < 2) {
      setFormError('يجب أن يحتوي القيد على بندين على الأقل.');
      setSubmitting(false);
      return;
    }

    const cleanLines = formLines.map((l, idx) => {
      const db = Number(l.debit || 0);
      const cr = Number(l.credit || 0);
      return {
        account_id: l.account_id,
        description: l.description || null,
        debit: db,
        credit: cr,
        lineNum: idx + 1
      };
    });

    // Check account validity
    const invalidLine = cleanLines.find(l => !l.account_id);
    if (invalidLine) {
      setFormError(`البند رقم ${invalidLine.lineNum} يفتقر للاختيار الصحيح للحساب المحاسبي.`);
      setSubmitting(false);
      return;
    }

    const invalidValue = cleanLines.find(l => l.debit === 0 && l.credit === 0);
    if (invalidValue) {
      setFormError(`البند رقم ${invalidValue.lineNum} يجب أن يحتوي على قيمة مدين أو دائن أكبر من الصفر.`);
      setSubmitting(false);
      return;
    }

    // In double-entry, posted entries must be balanced!
    if (type === 'save_and_post') {
      if (!isBalanced) {
        setFormError('لا يمكن ترحيل قيد يومية غير متوازن محاسبياً (المدين لا يساوي الدائن).');
        setSubmitting(false);
        return;
      }
    }

    try {
      let entryId = '';
      const payload = {
        entry_date: formDate,
         reference: formReference || undefined,
        description: formDescription || undefined,
        lines: cleanLines.map(l => ({
          account_id: l.account_id,
          description: l.description || '',
          debit: l.debit,
          credit: l.credit
        }))
      };

      if (activeModal === 'add') {
        entryId = await journalService.createJournalEntry(currentOrg.id, payload);
      } else if (activeModal === 'edit' && selectedEntry) {
        entryId = selectedEntry.id;
        await journalService.updateJournalEntry(currentOrg.id, entryId, payload);
      }

      // If user requested live posting
      if (type === 'save_and_post' && entryId) {
        await journalService.postJournalEntry(currentOrg.id, entryId);
        setSuccess('تم حفظ وترحيل قيد اليومية بنجاح.');
      } else {
        setSuccess('تم حفظ مسودة القيد اليومي بنجاح.');
      }

      setActiveModal(null);
      await fetchJournalEntriesList();
    } catch (err: any) {
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Post draft journal entry
  const handlePostEntry = async (entry: JournalEntry) => {
    if (!currentOrg) return;
    if (!window.confirm(`هل أنت متأكد من ترحيل قيد اليومية ذو الرقم ${entry.entry_number}؟`)) return;

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await journalService.postJournalEntry(currentOrg.id, entry.id);
      setSuccess(`تم ترحيل قيد اليومية (${entry.entry_number}) بنجاح.`);
      
      // Close detail view if open
      if (activeModal === 'detail') setActiveModal(null);
      await fetchJournalEntriesList();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Reverse journal entry
  const handleReverseEntry = async (entry: JournalEntry) => {
    if (!currentOrg) return;
    if (!window.confirm(`هل أنت متأكد تماماً من رغبتك في عكس قيد اليومية المُرحّل رقم ${entry.entry_number}؟ سيتم إنشاء قيد عكسي مطابق وموازن تلقائياً.`)) return;

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const reversedId = await journalService.reverseJournalEntry(currentOrg.id, entry.id);
      setSuccess(`تم عكس القيد اليومي رقم ${entry.entry_number} بنجاح وقيد العكس هو قيد مالي مرحّل مباشر.`);
      
      if (activeModal === 'detail') setActiveModal(null);
      await fetchJournalEntriesList();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Delete draft entry
  const handleDeleteEntry = async (entry: JournalEntry) => {
    if (!currentOrg) return;
    if (!window.confirm(`هل أنت متأكد تماماً من رغبتك بحذف مسودة القيد رقم ${entry.entry_number || '(غير مسمى)'} نهائياً؟`)) return;

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await journalService.deleteDraftJournalEntry(currentOrg.id, entry.id);
      setSuccess('تم حذف مسودة القيد اليومي بنجاح.');
      
      if (activeModal === 'detail') setActiveModal(null);
      await fetchJournalEntriesList();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const leafAccounts = accounts.filter(a => a.allow_direct_posting && a.is_active);

  return (
    <div className="space-y-6">
      {/* Header and top action bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-800">القيود اليومية والقيود المزدوجة</h2>
          <p className="text-xs text-slate-500 mt-1">توليد وإدارة القيود المحاسبية للمنشأة، موازنة الحسابات، الترحيل والتدقيق المتكامل.</p>
        </div>

        {isPrivileged && (
          <button
            onClick={handleOpenAddModal}
            className="flex items-center justify-center gap-2 bg-brand-blue text-white rounded-xl px-4 py-2.5 text-xs font-bold shadow-md hover:bg-opacity-95 transition-all self-start md:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            إنشاء قيد محاسبي يدوي
          </button>
        )}
      </div>

      {/* Messaging banners */}
      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-2xl p-4 text-xs font-semibold text-red-800 animate-fadeIn">
          <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-xs font-semibold text-emerald-800 animate-fadeIn">
          <CheckCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
          <div className="flex-1">{success}</div>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Advanced Filter form */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <form onSubmit={handleApplyFilters} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
            {/* Search query */}
            <div className="flex flex-col gap-1.5 lg:col-span-2">
              <label className="text-[10px] font-bold text-slate-500">البحث في القيود</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="رقم القيد، المرجع، الوصف..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-8.5 py-2.5 text-slate-800 outline-none focus:border-brand-blue"
                />
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
            </div>

            {/* Status Filter */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500">حالة القيد</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 text-slate-800 outline-none"
              >
                <option value="all">الكل (مسودات ومُرحّل)</option>
                <option value="draft">مسودة (Draft)</option>
                <option value="posted">مُرحّل (Posted)</option>
                <option value="reversed">معكوس (Reversed)</option>
              </select>
            </div>

            {/* Fiscal Year Filter */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500">السنة المالية</label>
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 text-slate-800 outline-none"
              >
                <option value="">تصفية حسب السنة</option>
                {fiscalYears.map(fy => (
                  <option key={fy.id} value={fy.id}>{fy.name} {fy.is_current ? '(الحالية)' : ''}</option>
                ))}
              </select>
            </div>

            {/* Date limits */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500">من تاريخ</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-800 outline-none font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500">إلى تاريخ</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-800 outline-none font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-50 pt-3">
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer"
            >
              إعادة تهيئة
            </button>
            <button
              type="submit"
              className="bg-slate-900 text-white font-bold text-xs rounded-xl px-5 py-2 cursor-pointer hover:bg-slate-800"
            >
              تطبيق التصفية
            </button>
          </div>
        </form>
      </div>

      {/* Main Grid/List of journal entries */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-4 border-slate-100 border-t-brand-blue rounded-full animate-spin mx-auto pb-4"></div>
            <p className="text-xs text-slate-400 mt-4">جاري استرجاع قيود اليومية من السحابة المحمية...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center">
            <FileText className="w-12 h-12 text-slate-200 mb-3" />
            <span className="font-bold text-sm text-slate-500">لا يوجد قيود يومية مسجلة</span>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">لم نجد قيود يومية تطابق فلاتر البحث الحالية، أو أن المنشأة لم تقم بإنشاء أي قيود بعد.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100 text-[10px] font-bold text-slate-500 tracking-wider">
                  <th className="px-4 py-3.5">رقم القيد اليومي</th>
                  <th className="px-4 py-3.5">تاريخ القيد</th>
                  <th className="px-4 py-3.5">المرجع</th>
                  <th className="px-4 py-3.5">الوصف والملخص</th>
                  <th className="px-4 py-3.5 text-center">الحالة</th>
                  <th className="px-4 py-3.5">السنة المالية</th>
                  <th className="px-4 py-3.5 text-left">أدوات إدارية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-xs text-slate-700">
                {entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4 font-bold font-mono tracking-wide text-slate-900 select-all" dir="ltr">
                      {entry.entry_number || 'مسودة...'}
                    </td>
                    <td className="px-4 py-4 font-mono text-slate-500">
                      {formatArabicDateWithLatinDigits(entry.entry_date)}
                    </td>
                    <td className="px-4 py-4 text-slate-500">
                      {entry.reference || <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-4 py-4 max-w-xs truncate font-bold text-slate-800">
                      {entry.description || <span className="text-slate-300 font-normal">دون وصف</span>}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        entry.status === 'posted' ? 'bg-emerald-50 text-emerald-700' :
                        entry.status === 'reversed' ? 'bg-amber-50 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          entry.status === 'posted' ? 'bg-emerald-500' :
                          entry.status === 'reversed' ? 'bg-amber-500' :
                          'bg-slate-400'
                        }`}></span>
                        {entry.status === 'posted' ? 'مُرحّل' :
                         entry.status === 'reversed' ? 'معكوس' :
                         'مسودة'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-500">
                      {entry.fiscal_year_name} / {entry.fiscal_period_name}
                    </td>
                    <td className="px-4 py-4 text-left">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenDetailModal(entry)}
                          className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100"
                          title="عرض القيد بالكامل"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        
                        {entry.status === 'draft' && isPrivileged && (
                          <>
                            <button
                              onClick={() => handleOpenEditModal(entry)}
                              className="p-1.5 text-blue-500 hover:text-blue-800 rounded-lg hover:bg-blue-50"
                              title="تعديل القيد"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePostEntry(entry)}
                              className="p-1.5 text-emerald-500 hover:text-emerald-800 rounded-lg hover:bg-emerald-50"
                              title="ترحيل القيد"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(entry)}
                              className="p-1.5 text-red-400 hover:text-red-700 rounded-lg hover:bg-red-50"
                              title="حذف القيد"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}

                        {entry.status === 'posted' && isPrivileged && (
                          <button
                            onClick={() => handleReverseEntry(entry)}
                            className="p-1.5 text-amber-500 hover:text-amber-800 rounded-lg hover:bg-amber-50"
                            title="عكس قيد اليومية"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD / EDIT MODAL SCREEN */}
      {(activeModal === 'add' || activeModal === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs transition-opacity overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-5xl overflow-hidden max-h-[90vh] flex flex-col animate-scaleUp">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  {activeModal === 'add' ? 'إنشاء قيد محاسبي يدوي جديد' : `تعديل قيد مسودة: ${selectedEntry?.entry_number || ''}`}
                </h3>
                <p className="text-[10px] text-slate-400">أدخل البيانات الأساسية وبنود القيد اليدوي مع التحقق التلقائي من ميزان المزدوج المالي.</p>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal formulation */}
            <form onSubmit={(e) => handleFormSubmit(e, 'save_draft')} className="flex-1 overflow-y-auto p-5 space-y-4">
              {formError && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-105 rounded-xl p-3.5 text-xs font-semibold text-red-850">
                  <AlertTriangle className="w-4.5 h-4.5 mt-0.5 shrink-0 text-red-650" />
                  <div className="flex-1">{formError}</div>
                </div>
              )}

              {/* Baseline header info */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500">تاريخ القيد المالي *</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500">المرجع / المستند الثبوتي</label>
                  <input
                    type="text"
                    placeholder="رقم الفاتورة، العقد، الشيك..."
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-500">بيان / وصف القيد العام *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: إثبات الرواتب أو تحويل مبالغ..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none"
                  />
                </div>
              </div>

              {/* List of double entry lines */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-800">بنود وسطور القيد (الدليل المزدوج)</span>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="flex items-center gap-1.5 text-brand-blue hover:text-opacity-80 text-xs font-bold py-1 px-2.5 border border-brand-blue/30 rounded-lg bg-brand-blue/5 hover:bg-brand-blue/10 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    إضافة بند جديد
                  </button>
                </div>

                <div className="overflow-x-auto bg-slate-50/50 rounded-xl border border-slate-100 p-2">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-[10px] font-bold text-slate-500 text-right border-b border-slate-100">
                        <th className="pb-2 w-1/3">الحساب المحاسبي *</th>
                        <th className="pb-2 pl-2">الوصف التفصيلي للبند</th>
                        <th className="pb-2 w-1/6 pl-2 text-center">مدين *</th>
                        <th className="pb-2 w-1/6 pl-2 text-center">دائن *</th>
                        <th className="pb-2 w-12 text-center">حذف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formLines.map((line, index) => (
                        <tr key={index} className="align-middle">
                          <td className="py-2.5 pr-1">
                            <select
                              required
                              value={line.account_id}
                              onChange={(e) => handleLineValueChange(index, 'account_id', e.target.value)}
                              className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-slate-800 outline-none"
                            >
                              <option value="">-- اختر حساباً فرعياً --</option>
                              {leafAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.code} - {acc.name_ar} {acc.name_en ? `(${acc.name_en})` : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 pl-2">
                            <input
                              type="text"
                              placeholder="وصف البند اختياري..."
                              value={line.description}
                              onChange={(e) => handleLineValueChange(index, 'description', e.target.value)}
                              className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-slate-800 outline-none"
                            />
                          </td>
                          <td className="py-2.5 pl-2">
                            <input
                              type="text"
                              placeholder="0.00"
                              value={line.debit}
                              onChange={(e) => handleLineValueChange(index, 'debit', e.target.value)}
                              className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-slate-800 outline-none text-left tabular-nums"
                              dir="ltr"
                              inputMode="numeric"
                            />
                          </td>
                          <td className="py-2.5 pl-2">
                            <input
                              type="text"
                              placeholder="0.00"
                              value={line.credit}
                              onChange={(e) => handleLineValueChange(index, 'credit', e.target.value)}
                              className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-slate-800 outline-none text-left tabular-nums"
                              dir="ltr"
                              inputMode="numeric"
                            />
                          </td>
                          <td className="py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(index)}
                              className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 cursor-pointer"
                              title="حذف هذا البند"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom calculations & balance summary drawer */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900 text-white rounded-2xl p-4 font-bold text-xs">
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px]">إجمالي الطرف المدين</span>
                  <span className="text-base font-mono mt-1 block tabular-nums text-emerald-400">
                    {formatNumberWithLatinDigits(debitSum)} ر.س
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px]">إجمالي الطرف الدائن</span>
                  <span className="text-base font-mono mt-1 block tabular-nums text-emerald-400">
                    {formatNumberWithLatinDigits(creditSum)} ر.س
                  </span>
                </div>
                <div className="md:border-r border-slate-800 md:pr-4">
                  <span className="text-slate-400 font-semibold block text-[10px]">حالة توازن القيد اليومي</span>
                  {isBalanced ? (
                    <div className="flex items-center gap-1.5 text-emerald-400 text-sm mt-1">
                      <Check className="w-4 h-4" />
                      <span>قيد متوازن محاسبياً</span>
                    </div>
                  ) : (
                    <div className="text-amber-400 mt-1">
                      <div className="flex items-center gap-1.5 text-sm">
                        <AlertCircle className="w-4.5 h-4.5" />
                        <span>الفرق: {formatNumberWithLatinDigits(difference)} ر.س</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 bg-white">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء الأمر
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={(e) => handleFormSubmit(e, 'save_draft')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl px-5 py-2.5 cursor-pointer transition-colors disabled:opacity-50"
                >
                  حفظ كمسودة (Draft)
                </button>
                <button
                  type="button"
                  disabled={submitting || !isBalanced}
                  onClick={(e) => handleFormSubmit(e, 'save_and_post')}
                  className="bg-brand-blue hover:bg-opacity-90 text-white font-bold text-xs rounded-xl px-5 py-2.5 cursor-pointer transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                  {submitting ? 'جاري الحفظ والترحيل...' : 'حفظ القيد وترحيله فوراً (Post)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL DRAWER / FULL PRINT VIEW MODAL */}
      {activeModal === 'detail' && selectedEntryDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs transition-opacity overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-4xl overflow-hidden max-h-[90vh] flex flex-col animate-scaleUp">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
              <div>
                <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-bold inline-block mb-1 font-mono">
                  معاينة السند المحاسبي
                </span>
                <h3 className="text-sm font-bold text-slate-800">
                  قيد محاسبي رقم: {selectedEntryDetails.entry_number || 'مسودة غير مرقمة بعد'}
                </h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Print elements */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Top voucher header layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 rounded-2xl p-5 border border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">تاريخ القيد</span>
                  <span className="text-xs font-bold text-slate-800 font-mono mt-1 block">
                    {formatArabicDateWithLatinDigits(selectedEntryDetails.entry_date)}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">رقم المستند / المرجع</span>
                  <span className="text-xs font-bold text-slate-800 mt-1 block">
                    {selectedEntryDetails.reference || <span className="text-slate-300 font-normal">دون مرجع</span>}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">السنة والمستند المالي</span>
                  <span className="text-xs font-bold text-slate-800 mt-1 block">
                    {selectedEntryDetails.fiscal_year_name} - {selectedEntryDetails.fiscal_period_name}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">حالة القيد حالياً</span>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold mt-1 ${
                    selectedEntryDetails.status === 'posted' ? 'bg-emerald-50 text-emerald-700' :
                    selectedEntryDetails.status === 'reversed' ? 'bg-amber-50 text-amber-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {selectedEntryDetails.status === 'posted' ? 'مُرحّل محاسبياً' :
                     selectedEntryDetails.status === 'reversed' ? 'معكوس بالكامل' :
                     'مسودة مؤقتة'}
                  </span>
                </div>

                <div className="md:col-span-2 lg:col-span-4 border-t border-slate-200/60 pt-3 mt-1">
                  <span className="text-[10px] text-slate-400 font-bold block">البيان والملخص المالي العام</span>
                  <span className="text-xs font-bold text-slate-800 mt-1 block">
                    {selectedEntryDetails.description || 'دون ملخص'}
                  </span>
                </div>
              </div>

              {/* Table print lines */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800 block">بنود القيود (الحسابات المتقابلة)</span>
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500">
                        <th className="px-4 py-2.5">رمز وتسمية الحساب المحاسبي</th>
                        <th className="px-4 py-2.5">وصف البند</th>
                        <th className="px-4 py-2.5 text-center w-28">مدين (Deb.)</th>
                        <th className="px-4 py-2.5 text-center w-28">دائن (Cred.)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {selectedEntryDetails.lines?.map((line, idx) => (
                        <tr key={line.id || idx}>
                          <td className="px-4 py-3.5">
                            <span className="font-bold text-slate-900 block">
                              {line.account?.name_ar}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400 select-all" dir="ltr">
                              {line.account?.code}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-slate-500 text-[11px]">
                            {line.description || <span className="text-slate-300">-</span>}
                          </td>
                          <td className="px-4 py-3.5 font-bold font-mono text-center text-slate-900 tabular-nums text-left" dir="ltr">
                            {line.debit > 0 ? formatNumberWithLatinDigits(line.debit) : <span className="text-slate-300">-</span>}
                          </td>
                          <td className="px-4 py-3.5 font-bold font-mono text-center text-slate-900 tabular-nums text-left" dir="ltr">
                            {line.credit > 0 ? formatNumberWithLatinDigits(line.credit) : <span className="text-slate-300">-</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Ledger balances sum panel */}
                <div className="flex border border-slate-100 rounded-2xl bg-slate-50 p-4 font-bold text-xs">
                  <div className="flex-1"></div>
                  <div className="grid grid-cols-2 gap-x-8 text-slate-800 text-left min-w-[280px]" dir="ltr">
                    <span className="text-slate-400 font-bold block text-right">إجمالي المدين (Debit):</span>
                    <span className="font-mono text-slate-950 block text-left text-sm tabular-nums">
                      {formatNumberWithLatinDigits(
                        selectedEntryDetails.lines?.reduce((sum, l) => sum + Number(l.debit || 0), 0) || 0
                      )} ر.س
                    </span>
                    <span className="text-slate-400 font-bold block text-right">إجمالي الدائن (Credit):</span>
                    <span className="font-mono text-slate-950 block text-left text-sm tabular-nums">
                      {formatNumberWithLatinDigits(
                        selectedEntryDetails.lines?.reduce((sum, l) => sum + Number(l.credit || 0), 0) || 0
                      )} ر.س
                    </span>
                  </div>
                </div>
              </div>

              {/* Audit history track logs */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 text-[10px] text-slate-500 font-semibold">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <span className="block text-slate-400">تاريخ الإدخال الأساسي</span>
                    <span className="block text-slate-800 mt-0.5">{formatArabicDateWithLatinDigits(selectedEntryDetails.created_at, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                {selectedEntryDetails.posted_at && (
                  <div className="flex items-center gap-2 border-r border-slate-200/60 pr-4">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <span className="block text-slate-400">تاريخ وساعة الترحيل</span>
                      <span className="block text-slate-800 mt-0.5">{formatArabicDateWithLatinDigits(selectedEntryDetails.posted_at, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                )}

                {selectedEntryDetails.reversed_at && (
                  <div className="flex items-center gap-2 border-r border-slate-200/60 pr-4">
                    <RotateCcw className="w-4 h-4 text-amber-500 shrink-0" />
                    <div>
                      <span className="block text-slate-400">تاريخ ومجال العكس</span>
                      <span className="block text-slate-800 mt-0.5">{formatArabicDateWithLatinDigits(selectedEntryDetails.reversed_at, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer with action states for viewing */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 cursor-pointer"
              >
                إغلاق المعاينة
              </button>

              {selectedEntryDetails.status === 'draft' && isPrivileged && (
                <>
                  <button
                    onClick={() => {
                      setActiveModal(null);
                      handleOpenEditModal(selectedEntryDetails);
                    }}
                    className="flex items-center gap-1.5 bg-blue-100 text-blue-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-150 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    تعديل المسودة
                  </button>

                  <button
                    onClick={() => handlePostEntry(selectedEntryDetails)}
                    className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    ترحيل القيد الأن
                  </button>

                  <button
                    onClick={() => handleDeleteEntry(selectedEntryDetails)}
                    className="flex items-center gap-1.5 bg-red-50 text-red-650 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-100 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    حذف القيد اليدوي
                  </button>
                </>
              )}

              {selectedEntryDetails.status === 'posted' && isPrivileged && (
                <button
                  onClick={() => handleReverseEntry(selectedEntryDetails)}
                  className="flex items-center gap-1.5 bg-amber-500 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-amber-600 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  عكس القيد بالكامل (Reverse)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
