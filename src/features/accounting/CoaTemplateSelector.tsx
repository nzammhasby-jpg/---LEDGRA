import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  ShoppingBag, 
  Briefcase, 
  Home, 
  Hammer, 
  ShoppingCart, 
  Utensils, 
  Store, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Compass,
  Loader2,
  Lock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { accountingService } from '../../lib/accountingService';

interface CoaTemplateSelectorProps {
  onSuccess?: () => void;
  orgId: string;
  hasAccountsAlready?: boolean;
}

const EXAMPLE_ACCOUNTS: Record<string, string[]> = {
  general_trading: [
    'مخزون المستودع السلعي العام',
    'مبيعات منتجات وسلع المنشأة المعترف بها',
    'حساب تكلفة البضاعة والسلع المباعة',
    'حساب ضريبة مخرجات المبيعات المستلمة'
  ],
  services: [
    'إيرادات تقديم الخدمات الاستشارية والتشغيلية',
    'إيرادات استشارات وحلول مهنية',
    'مصروفات الرواتب والأجور الأساسية والمنافع',
    'حساب ضريبة مدخلات المشتريات المرفوعة'
  ],
  real_estate: [
    'إيرادات السعي والعمولات العقارية',
    'إيرادات إدارة أملاك عقارية وتأجير',
    'المصاريف التسويقية والإعلانية للترويج',
    'حساب البنك الجاري الرئيسي للمنشأة'
  ],
  contracting: [
    'إيرادات عقود مقاولات وإنشاءات معترف بها',
    'إيرادات مراحل مشاريع منجزة ومعتمدة',
    'تكاليف ومصاريف المواقع والمشروعات',
    'مقاولو الباطن والعمالة المؤقتة للموقع'
  ],
  ecommerce: [
    'مبيعات المتجر الإلكتروني المباشرة والطلبات',
    'إيرادات رسوم الشحن والتوصيل المحصلة من العملاء',
    'مخزون سلع المتجر الإلكتروني',
    'رسوم وعمولات التحصيل والمنصات الرقمية'
  ],
  restaurant: [
    'إيرادات مبيعات المطعم وصالة الطعام المحلية',
    'إيرادات مبيعات تطبيقات التوصيل',
    'مخزون المواد الغذائية والمشروبات والأولية',
    'مصروف الغاز والمياه والكهرباء للتشغيل'
  ],
  simple_establishment: [
    'أمين الصندوق (الخزينة العامة)',
    'إيرادات مبيعات وتجارة عامة مبسطة',
    'حساب تكاليف تشغيلية مباشرة ومشتريات النشاط',
    'مصروفات الرواتب والأجور الأساسية والمنافع'
  ]
};

const TEMPLATE_ICONS: Record<string, React.ComponentType<any>> = {
  general_trading: ShoppingBag,
  services: Briefcase,
  real_estate: Home,
  contracting: Hammer,
  ecommerce: ShoppingCart,
  restaurant: Utensils,
  simple_establishment: Store
};

export const CoaTemplateSelector: React.FC<CoaTemplateSelectorProps> = ({ 
  onSuccess, 
  orgId,
  hasAccountsAlready = false
}) => {
  const { roleInCurrentOrg } = useAuth();
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('general_trading');
  const [loading, setLoading] = useState<boolean>(false);
  const [seedingLoading, setSeedingLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isOwnerOrAdmin = roleInCurrentOrg === 'owner' || roleInCurrentOrg === 'admin';
  const isAccountant = roleInCurrentOrg === 'accountant';
  const isSales = roleInCurrentOrg === 'sales';

  useEffect(() => {
    let active = true;

    if (hasAccountsAlready) {
      setLoading(false);
      setError(null);
      return;
    }

    const fetchTemplates = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await accountingService.getAvailableCoaTemplates();
        if (active) {
          setTemplates(data || []);
          if (data && data.length > 0) {
            const hasGeneral = data.some(t => t.industry_type === 'general_trading');
            setSelectedTemplate(hasGeneral ? 'general_trading' : data[0].industry_type);
          }
        }
      } catch (err: any) {
        if (active && !hasAccountsAlready) {
          setError('فشل تحميل قوالب دليل الحسابات المتاحة.');
          console.error(err);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchTemplates();
    return () => {
      active = false;
    };
  }, [hasAccountsAlready]);

  const handleSeedCOA = async () => {
    if (!orgId) return;
    if (!isOwnerOrAdmin) {
      setError('غير مصرح: تهيئة دليل الحسابات متاحة للمالك والمدير فقط.');
      return;
    }

    setSeedingLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await accountingService.seedIndustryChartOfAccounts(orgId, selectedTemplate);
      
      if (res && (res.status === 'success' || res.status === 'created')) {
        const count = res.inserted_accounts || 0;
        const label = getTemplateLabel(selectedTemplate);
        setSuccess(`تم تأسيس الدليل المحاسبي لقطاع (${label}) بنجاح! تم إنشاء ${count} حساباً وتأمين الحسابات النظامية والضريبية.`);
        if (onSuccess) {
          setTimeout(() => {
            onSuccess();
          }, 1500);
        }
      } else if (res && res.status === 'already_initialized') {
        setSuccess('الدليل المحاسبي للمنشأة مهيأ مسبقاً بالفعل.');
        if (onSuccess) {
          setTimeout(() => {
            onSuccess();
          }, 1000);
        }
      } else {
        setError('فشلت عملية تأسيس شجرة الحسابات الخاصة بالقطاع.');
      }
    } catch (err: any) {
      console.error('Error seeding industry COA:', err);
      if (err.message && err.message.includes('غير مصرح')) {
        setError('غير مصرح: تهيئة دليل الحسابات متاحة للمالك والمدير فقط.');
      } else {
        setError(err.message || 'فشلت عملية تأسيس شجرة الحسابات الخاصة بالقطاع.');
      }
    } finally {
      setSeedingLoading(false);
    }
  };

  const getTemplateLabel = (type: string): string => {
    switch (type) {
      case 'general_trading': return 'التجارة العامة والتجزئة';
      case 'services': return 'الخدمات والحلول المهنية';
      case 'real_estate': return 'التسويق والتطوير العقاري';
      case 'contracting': return 'المقاولات والإنشاءات';
      case 'ecommerce': return 'التجارة الإلكترونية والمنصات';
      case 'restaurant': return 'المطاعم والأغذية والمقاهي';
      case 'simple_establishment': return 'المؤسسات والمنشآت البسيطة';
      default: return type;
    }
  };

  if (isSales) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 text-center max-w-2xl mx-auto space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600 mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-800">صلاحيات غير كافية</h3>
        <p className="text-xs text-slate-500 leading-relaxed font-sans">
          عذراً، لا تمتلك الصلاحية الكافية لعرض أو تهيئة الإعدادات المالية ودليل الحسابات الخاص بالمنشأة. هذه الصلاحية تقتصر على المالك والمدير المالي والمسؤول.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="w-8 h-8 text-brand-turquoise animate-spin" />
        <span className="text-xs text-slate-500 font-sans">جاري تحميل قوالب الهيكل المالي...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-right" dir="rtl">
      
      {/* Alert states */}
      {error && (
        <div className="bg-red-50 border-r-4 border-red-500 p-4 rounded-xl text-xs text-red-700 flex items-center gap-2.5 font-sans">
          <AlertCircle className="w-4.5 h-4.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border-r-4 border-emerald-500 p-4 rounded-xl text-xs text-emerald-800 flex items-center gap-2.5 font-sans">
          <CheckCircle2 className="w-4.5 h-4.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {hasAccountsAlready ? (
        <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-6 text-center space-y-4 max-w-xl mx-auto shadow-sm">
          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">الدليل المحاسبي مهيأ مسبقاً</h4>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed font-sans">
              لقد تم تأسيس وتثبيت دليل حسابات متكامل مسبقاً لهذه المنشأة. لا يتطلب منك اتخاذ أي إجراء إضافي. يمكنك المتابعة للخطوة التالية مباشرة.
            </p>
          </div>
          {onSuccess && (
            <button
              onClick={onSuccess}
              className="text-xs bg-slate-900 hover:bg-slate-850 text-white font-bold px-5 py-2.5 rounded-xl transition cursor-pointer font-sans"
            >
              متابعة الخطوات
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="text-right">
            <h4 className="text-sm font-bold text-slate-800">اختر قالب النشاط الملائم لنشاطك التجاري:</h4>
            <p className="text-xs text-slate-500 mt-1 font-sans">
              سيقوم لِدجرا ببناء دليل شجري سعودي متوافق مع النشاط وتأمين الحسابات النظامية والضريبية.
            </p>
          </div>

          {/* Cards Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((t) => {
              const IconComponent = TEMPLATE_ICONS[t.industry_type] || Compass;
              const isSelected = selectedTemplate === t.industry_type;
              const examples = EXAMPLE_ACCOUNTS[t.industry_type] || [];

              return (
                <div
                  key={t.industry_type}
                  onClick={() => {
                    if (isOwnerOrAdmin) {
                      setSelectedTemplate(t.industry_type);
                    }
                  }}
                  className={`border-2 rounded-2xl p-5 cursor-pointer text-right transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'border-brand-turquoise bg-slate-900 text-white shadow-lg'
                      : 'border-slate-200 hover:border-slate-300 bg-white text-slate-800 hover:bg-slate-50/50'
                  } ${!isOwnerOrAdmin ? 'opacity-80 cursor-default' : ''}`}
                >
                  <div className="space-y-3.5">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                          isSelected 
                            ? 'bg-white/10 border-white/20 text-brand-turquoise' 
                            : 'bg-slate-100 border-slate-200 text-slate-600'
                        }`}>
                          <IconComponent className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs font-bold block">{t.name_ar || getTemplateLabel(t.industry_type)}</span>
                          <span className={`text-[10px] block font-sans ${isSelected ? 'text-slate-400' : 'text-slate-500'}`}>
                            {t.accounts_count} حساباً بالدليل
                          </span>
                        </div>
                      </div>
                      
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        isSelected 
                          ? 'border-brand-turquoise bg-brand-turquoise text-slate-950' 
                          : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <span className="w-1.5 h-1.5 bg-slate-950 rounded-full" />}
                      </div>
                    </div>

                    {/* Description */}
                    <p className={`text-[11px] leading-relaxed font-sans ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                      {t.description || 'دليل محاسبي مهيأ خصيصاً للقطاع المختار.'}
                    </p>

                    {/* Bullet examples */}
                    {examples.length > 0 && (
                      <div className="pt-2.5 border-t border-dashed border-current/10">
                        <span className={`text-[9px] font-bold block mb-1 tracking-wide uppercase ${isSelected ? 'text-brand-turquoise' : 'text-slate-600'}`}>
                          أمثلة من الدليل:
                        </span>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                          {examples.map((ex, idx) => (
                            <span key={idx} className={`text-[10px] font-sans truncate ${isSelected ? 'text-slate-400' : 'text-slate-600'}`}>
                              • {ex}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Seeding Area */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 text-right">
            <div className="flex items-start gap-2.5 text-xs text-slate-600 leading-relaxed font-sans">
              <ShieldCheck className="w-5 h-5 text-brand-turquoise shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-800">سيتم إنشاء دليل حسابات مناسب لهذا النشاط وربط الإعدادات المحاسبية تلقائيًا.</strong>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  يتضمن ذلك تأسيس الحسابات الضرورية للامتثال لاحقاً لمعايير الفوترة الإلكترونية وضريبة القيمة المضافة وحساب مبيعات ومشتريات ونقدية النشاط.
                </p>
              </div>
            </div>

            {isAccountant ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-center gap-2 font-sans">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>يرجى العلم بأنك في وضع محاسب (Accountant)؛ يمتلك مالك المنشأة أو مديرها فقط الصلاحية لبدء وتأسيس الدليل المحاسبي.</span>
              </div>
            ) : (
              <button
                type="button"
                disabled={seedingLoading || !isOwnerOrAdmin}
                onClick={handleSeedCOA}
                className="w-full text-xs bg-brand-turquoise hover:bg-brand-turquoise/90 text-slate-950 font-extrabold py-3 rounded-xl transition shadow-lg shadow-brand-turquoise/15 cursor-pointer font-sans flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {seedingLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري تأسيس وبناء الهيكل المالي...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4.5 h-4.5" />
                    <span>تأسيس دليل الحسابات المعتمد لقطاع ({getTemplateLabel(selectedTemplate)})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
