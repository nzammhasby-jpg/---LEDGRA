import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { accountingService } from '../../lib/accountingService';
import { FiscalYear, FiscalPeriod } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { formatArabicDateWithLatinDigits } from '../../lib/formatters';
import { 
  Calendar, 
  Plus, 
  CheckCircle, 
  Lock, 
  Unlock, 
  AlertTriangle, 
  X, 
  FolderOpen, 
  ArrowRight,
  User,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertOctagon,
  CheckCircle2
} from 'lucide-react';

export const FiscalYears: React.FC = () => {
  const { currentOrg, profile, roleInCurrentOrg } = useAuth();
  const [years, setYears] = useState<FiscalYear[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<{ [yearId: string]: FiscalPeriod[] }>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Expanded cards index map
  const [expandedYears, setExpandedYears] = useState<{ [id: string]: boolean }>({});
  const [profilesMap, setProfilesMap] = useState<{ [id: string]: string }>({});

  // Form State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [formName, setFormName] = useState<string>('');
  const [formStartDate, setFormStartDate] = useState<string>('');
  const [formEndDate, setFormEndDate] = useState<string>('');
  const [formIsCurrent, setFormIsCurrent] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isPrivileged = ['owner', 'admin', 'accountant'].includes(roleInCurrentOrg || '');

  // Load Years list
  const loadYearsData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const data = await accountingService.getFiscalYears(currentOrg.id);
      setYears(data);
      
      // Auto expand the first year if exists
      if (data.length > 0) {
        setExpandedYears(prev => ({ ...prev, [data[0].id]: true }));
        loadPeriodsForYear(data[0].id);
      }
      
      const map: { [id: string]: string } = {};
      if (profile?.id) {
        map[profile.id] = profile.full_name || 'المستخدم الحالي';
      }
      setProfilesMap(map);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadYearsData();
  }, [currentOrg]);

  // Load Periods for a specific year on demand
  const loadPeriodsForYear = async (yearId: string) => {
    try {
      const periods = await accountingService.getFiscalPeriods(yearId);
      setSelectedPeriods(prev => ({ ...prev, [yearId]: periods }));
    } catch (err) {
      console.error('Error loading periods:', err);
    }
  };

  // Toggle year view expansion and load periods
  const handleToggleExpandYear = (yearId: string) => {
    const isNowExpanded = !expandedYears[yearId];
    setExpandedYears(prev => ({ ...prev, [yearId]: isNowExpanded }));
    
    if (isNowExpanded && !selectedPeriods[yearId]) {
      loadPeriodsForYear(yearId);
    }
  };

  // Switch year status to Current Active
  const handleSetCurrentYear = async (year: FiscalYear) => {
    if (!currentOrg || !isPrivileged) return;
    if (year.is_current) return;

    if (!window.confirm(`هل ترغب فعلاً بتعيين "${year.name}" كالسنة المالية الحالية والنشطة للنظام؟ سيتم إلغاء التنشيط تلقائياً عن السنوات الأخرى.`)) {
      return;
    }

    setLoading(true);
    try {
      await accountingService.setCurrentFiscalYear(currentOrg.id, year.id);
      setSuccess('تم تعيين السنة المالية الحالية بنجاح.');
      await loadYearsData();
    } catch (err) {
      console.error(err);
      alert(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Open modal with smart date suggestions
  const handleOpenAddModal = () => {
    if (!isPrivileged) return;
    setFormError(null);
    
    // Suggest year start date
    let proposedStart = '';
    let proposedEnd = '';
    
    if (years.length > 0) {
      // Find latest year based on end dates logic
      const latestYear = [...years].sort((a, b) => b.end_date.localeCompare(a.end_date))[0];
      const nextDay = new Date(latestYear.end_date);
      nextDay.setDate(nextDay.getDate() + 1);
      
      const pad = (n: number) => n.toString().padStart(2, '0');
      proposedStart = `${nextDay.getFullYear()}-${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}`;
      
      const futureEnd = new Date(nextDay);
      futureEnd.setFullYear(futureEnd.getFullYear() + 1);
      futureEnd.setDate(futureEnd.getDate() - 1);
      proposedEnd = `${futureEnd.getFullYear()}-${pad(futureEnd.getMonth() + 1)}-${pad(futureEnd.getDate())}`;

      // Set suggested year name
      setFormName(`سنة ${nextDay.getFullYear()}`);
    } else {
      // Clean fallback using current system year
      const now = new Date();
      proposedStart = `${now.getFullYear()}-01-01`;
      proposedEnd = `${now.getFullYear()}-12-31`;
      setFormName(`سنة ${now.getFullYear()}`);
    }
    
    setFormStartDate(proposedStart);
    setFormEndDate(proposedEnd);
    setFormIsCurrent(years.length === 0); // Active by default if it's the very first year
    setShowAddModal(true);
  };

  // Submit and create new year + auto-periods
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || submitting) return;

    if (!formName || !formStartDate || !formEndDate) {
      setFormError('يرجى تعبئة جميع حقول النموذج المطلوبة وتحديد تواريخ موحدة.');
      return;
    }

    const start = new Date(formStartDate);
    const end = new Date(formEndDate);
    if (start >= end) {
      setFormError('تاريخ بداية السنة المالية يجب أن يكون أسبق زمنياً من تاريخ نهايتها.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await accountingService.createFiscalYear(currentOrg.id, {
        name: formName,
        start_date: formStartDate,
        end_date: formEndDate,
        is_current: formIsCurrent
      });

      setSuccess(`تم بنجاح إشهار السنة المالية الجديدة "${formName}" وتهيئة الفترات الـ 12 شهراً التابعة لها تلقائياً.`);
      setShowAddModal(false);
      await loadYearsData();
    } catch (err) {
      console.error(err);
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Notifications Panels */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-800 text-xs font-bold flex items-start gap-2.5 text-right font-sans">
          <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
          <div>{error}</div>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-800 text-xs font-bold flex items-start gap-2.5 text-right font-sans">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
          <div className="flex-1">{success}</div>
          <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700 font-extrabold cursor-pointer">إغلاق</button>
        </div>
      )}

      {/* Intro Bar with Create Actions */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 font-sans text-right">
        <div>
          <h3 className="text-sm font-extrabold text-slate-800">الحفاظ على الفترات والسنوات المالية</h3>
          <p className="text-[11px] text-slate-400 mt-1">أنشئ السنوات المالية وفتراتها الشهرية وحدد السنة التشغيلية الحالية. سيتم تفعيل الإقفال والترحيل بعد بناء محرك القيود اليومية.</p>
        </div>
        
        {isPrivileged && (
          <button
            onClick={handleOpenAddModal}
            className="text-xs bg-brand-blue hover:bg-brand-blue-deep text-white font-extrabold px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-brand-blue/15"
          >
            <Plus className="w-4.5 h-4.5" />
            <span>فتح سنة مالية جديدة</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-slate-100 flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-400 font-sans">جاري تحميل الفترات وترتيب المخططات الدورية...</p>
        </div>
      ) : years.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center space-y-4 max-w-lg mx-auto font-sans">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-slate-800">لا توجد سنوات مالية مسجلة</h4>
            <p className="text-xs text-slate-400">لم تقم بتسجيل أي دورات مالية معتمدة لمنشأتك حتى الآن. يرجى إنشاء السنة الحالية لتتبع الأرصدة.</p>
          </div>
          {isPrivileged && (
            <button 
              onClick={handleOpenAddModal}
              className="text-xs bg-brand-blue hover:bg-brand-blue-deep text-white font-extrabold px-5 py-3 rounded-xl transition cursor-pointer"
            >
              فتح أول سنة مالية للمنشأة
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4 max-w-5xl mx-auto">
          {years.map(year => {
            const isExpanded = expandedYears[year.id];
            const periods = selectedPeriods[year.id] || [];
            const creatorName = year.created_by === profile?.id
              ? (profile?.full_name || 'المستخدم الحالي')
              : 'مستخدم مخول';

            return (
              <div 
                key={year.id} 
                className={`bg-white border rounded-3xl overflow-hidden transition shadow-sm ${
                  year.is_current 
                    ? 'border-brand-blue/35 ring-1 ring-brand-blue/5' 
                    : 'border-slate-200'
                }`}
              >
                {/* Year Header Grid row */}
                <div 
                  className={`p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 cursor-pointer font-sans select-none hover:bg-slate-50/40 transition-colors ${
                    year.is_current ? 'bg-brand-blue/[0.015]' : ''
                  }`}
                  onClick={() => handleToggleExpandYear(year.id)}
                >
                  <div className="flex items-center gap-4 text-right">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                      year.is_current 
                        ? 'bg-brand-blue/10 text-brand-blue border border-brand-blue/20' 
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                      <Calendar className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-extrabold text-slate-800">{year.name}</span>
                        
                        {year.is_current && (
                          <span className="bg-brand-blue text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                            <CheckCircle className="w-3 h-3" />
                            <span>السنة الحالية النشطة</span>
                          </span>
                        )}

                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                          year.status === 'open' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                            : year.status === 'closed'
                            ? 'bg-red-50 text-red-700 border-red-100'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                          {year.status === 'open' ? 'دورة محاسبية مفتوحة' : year.status === 'closed' ? 'مغلقة كلياً' : 'مسودة'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[10.5px] text-slate-500 font-mono">
                        <span className="flex items-center gap-1">
                          <span>البداية:</span>
                          <strong className="text-slate-600">{formatArabicDateWithLatinDigits(year.start_date)}</strong>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <span>النهاية:</span>
                          <strong className="text-slate-600">{formatArabicDateWithLatinDigits(year.end_date)}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Creator and current trigger */}
                  <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end border-t border-slate-100 pt-3 md:border-none md:pt-0">
                    <div className="flex flex-col text-right text-[10px] text-slate-400">
                      <span className="flex items-center gap-1 justify-end leading-none">
                        <User className="w-3 h-3 text-slate-400" />
                        <span>منشئ: {creatorName}</span>
                      </span>
                      <span className="flex items-center gap-1 justify-end leading-none mt-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>في: {formatArabicDateWithLatinDigits(year.created_at, { year: 'numeric', month: 'numeric', day: 'numeric' })}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {!year.is_current && isPrivileged && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetCurrentYear(year);
                          }}
                          className="text-[10px] bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-700 font-extrabold px-3 py-2 rounded-xl transition cursor-pointer"
                        >
                          تفعيل كالسنة التشغيلية
                        </button>
                      )}
                      
                      <div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded view showing 12 associated periods */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/20 p-5 space-y-4">
                    <div className="flex items-center gap-1.5 text-slate-500 font-bold text-xs select-none">
                      <FolderOpen className="w-4 h-4 text-slate-500" />
                      <span>الأقسام والفترات المعتمدة داخل هذه الدورة المحددة</span>
                    </div>

                    {periods.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs">جاري تهيئة قراءة الحصص الشهرية...</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        {periods.map(period => {
                          const isOpen = period.status === 'open';
                          return (
                            <div 
                              key={period.id}
                              className={`p-3.5 rounded-2xl border bg-white transition flex items-center justify-between gap-3 text-right ${
                                isOpen 
                                  ? 'border-slate-100 shadow-xs' 
                                  : 'border-slate-200 bg-slate-50/50'
                              }`}
                            >
                              <div className="truncate space-y-1 shrink min-w-0">
                                <span className={`text-[11px] font-extrabold block truncate ${isOpen ? 'text-slate-700' : 'text-slate-400 line-through'}`}>
                                  {period.name}
                                </span>
                                <div className="text-[9.5px] font-mono text-slate-400">
                                  <span>{formatArabicDateWithLatinDigits(period.start_date)}</span>
                                  <span className="mx-1 font-bold">إلى</span>
                                  <span>{formatArabicDateWithLatinDigits(period.end_date)}</span>
                                </div>
                              </div>

                              {/* Toggle active / toggle closed - Grayed out & disabled for upcoming Phase 3 */}
                              <button
                                disabled={true}
                                className="p-2 rounded-xl border shrink-0 bg-slate-50 text-slate-400 border-slate-100 opacity-55 cursor-not-allowed transition"
                                title="سيتم تمكين فتح وإغلاق الفترات مع تفعيل محرك اليومية العامة."
                              >
                                {isOpen ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          );
                        })}
                        
                        {/* Explanatory roadmap banner block */}
                        <div className="col-span-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-right flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-slate-500">
                          <div className="flex items-center gap-2.5">
                            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                            <span className="text-[10.5px] font-semibold text-slate-500">
                              سيتم تفعيل ميزة إقفال وفتح الفترات الدورية الفرعية يدوياً فور إطلاق محرك قيود اليومية العامة في التحديث القادم لضمان سلامة العمليات المحاسبية وسجلات الترحيل.
                            </span>
                          </div>
                          <span className="text-[9px] font-bold bg-amber-500/10 text-amber-600 px-2.5 py-1 rounded-md shrink-0">
                            مجدول للمرحلة التالية
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}


      {/* Modal Dialog: CREATE FISCAL YEAR */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 text-right space-y-6 font-sans">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-sm font-extrabold text-slate-800">تأسيس سنة مالية وفترات دورية</h3>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-800 text-[11px] font-bold">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">اسم السنة المالية</label>
                <input 
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="مثال: سنة 2026"
                  className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">تاريخ البداية (English digits)</label>
                  <input 
                    type="date"
                    required
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full text-xs font-semibold font-mono text-left bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">تاريخ النهاية</label>
                  <input 
                    type="date"
                    required
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    className="w-full text-xs font-semibold font-mono text-left bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 outline-none"
                  />
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-amber-800 text-[10px] leading-relaxed flex gap-2">
                <AlertTriangle className="w-4.5 h-4.5 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <strong>ميزة التأسيس التلقائي النشط من لِدجرا:</strong>
                  <p className="mt-0.5">عند الضغط على حفظ، سيقوم النظام تلقائياً بإنشاء 12 فترة محاسبية شهرية دورية تتبع هذه لتمكين ضبط القيود بشكل ربع سنوي وسنوي معقد.</p>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox"
                    checked={formIsCurrent}
                    onChange={(e) => setFormIsCurrent(e.target.checked)}
                    className="rounded border-slate-300 text-brand-blue"
                  />
                  <span className="text-[11px] font-extrabold text-slate-600">تعيين هذه السنة كالسنة المالية التشغيلية الحالية للمنشأة</span>
                </label>
              </div>

              <div className="flex justify-start gap-3 border-t border-slate-100 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="text-xs bg-brand-blue hover:bg-brand-blue-deep text-white font-extrabold px-5 py-2.5 rounded-xl transition cursor-pointer"
                >
                  {submitting ? 'جاري تهيئة الفترات...' : 'حفظ وتثبيت السنة'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2.5 rounded-xl cursor-pointer"
                >
                  إلغاء الأمر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
