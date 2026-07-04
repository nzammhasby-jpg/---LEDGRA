-- LEDGRA COA Phase 2A - Industry COA Templates & Safe Seeding RPC
-- Sequential Migration

-- 1. CREATE TABLE: coa_templates
CREATE TABLE IF NOT EXISTS public.coa_templates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    industry_type text NOT NULL,
    code text NOT NULL CONSTRAINT coa_templates_code_digits_check CHECK (code ~ '^[0-9]+$'),
    name_ar text NOT NULL,
    name_en text,
    classification text NOT NULL CHECK (classification IN ('assets', 'liabilities', 'equity', 'revenue', 'expenses')),
    nature text NOT NULL CHECK (nature IN ('debit', 'credit')),
    parent_code text,
    allow_direct_posting boolean NOT NULL DEFAULT true,
    is_system boolean NOT NULL DEFAULT false,
    description text,
    sort_order integer,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT coa_templates_parent_self_check CHECK (parent_code <> code),
    CONSTRAINT coa_templates_nature_classification_check CHECK (
        (classification IN ('assets', 'expenses') AND nature = 'debit') OR
        (classification IN ('liabilities', 'equity', 'revenue') AND nature = 'credit')
    ),
    CONSTRAINT coa_templates_industry_code_unique UNIQUE (industry_type, code)
);

-- Indexes for performance and quick hierarchical queries
CREATE INDEX IF NOT EXISTS coa_templates_industry_code_idx ON public.coa_templates (industry_type, code);
CREATE INDEX IF NOT EXISTS coa_templates_industry_parent_idx ON public.coa_templates (industry_type, parent_code);

-- Enable RLS and establish Read-Only access for authenticated users
ALTER TABLE public.coa_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select coa_templates" ON public.coa_templates;
CREATE POLICY "Select coa_templates" ON public.coa_templates
    FOR SELECT TO authenticated USING (true);


-- 2. SEED REFERENCE DATA: 7 Industry Templates (general_trading, services, real_estate, contracting, ecommerce, restaurant, simple_establishment)
-- For each template, we define roots 1, 2, 3, 4, 5, standard parents, and industry-specific accounts.

INSERT INTO public.coa_templates (industry_type, code, name_ar, name_en, classification, nature, parent_code, allow_direct_posting, is_system, sort_order) VALUES
-- ==========================================
-- A. GENERAL TRADING (تجارة عامة)
-- ==========================================
('general_trading', '1', 'الأصول', 'Assets', 'assets', 'debit', NULL, false, true, 100),
('general_trading', '11', 'الأصول المتداولة', 'Current Assets', 'assets', 'debit', '1', false, true, 110),
('general_trading', '111', 'النقدية وما في حكمها', 'Cash and Cash Equivalents', 'assets', 'debit', '11', false, true, 111),
('general_trading', '1111', 'أمين الصندوق (الخزينة العامة)', 'Cash on Hand', 'assets', 'debit', '111', true, true, 1111),
('general_trading', '1112', 'حساب البنك الجاري الرئيسي', 'Bank Default Account', 'assets', 'debit', '111', true, true, 1112),
('general_trading', '112', 'العملاء والذمم المدينة', 'Accounts Receivable', 'assets', 'debit', '11', false, true, 112),
('general_trading', '1121', 'حساب ذمم العملاء التجاريين الموحد', 'Trade Accounts Receivable', 'assets', 'debit', '112', true, true, 1121),
('general_trading', '113', 'المخزون السلعي', 'Inventory', 'assets', 'debit', '11', false, true, 113),
('general_trading', '1131', 'مخزون المستودع السلعي العام', 'Finished Goods Inventory', 'assets', 'debit', '113', true, true, 1131),
('general_trading', '115', 'ضريبة القيمة المضافة - المدخلات', 'VAT Input Tax', 'assets', 'debit', '11', false, true, 115),
('general_trading', '1151', 'حساب ضريبة مدخلات المشتريات المرفوعة', 'VAT Input Tax Account', 'assets', 'debit', '115', true, true, 1151),
('general_trading', '2', 'الالتزامات', 'Liabilities', 'liabilities', 'credit', NULL, false, true, 200),
('general_trading', '21', 'الالتزامات المتداولة', 'Current Liabilities', 'liabilities', 'credit', '2', false, true, 210),
('general_trading', '211', 'الموردون والذمم الدائنة', 'Accounts Payable', 'liabilities', 'credit', '21', false, true, 211),
('general_trading', '2111', 'حساب ذمم الموردين التجاريين الموحد', 'Trade Accounts Payable', 'liabilities', 'credit', '211', true, true, 2111),
('general_trading', '212', 'ضريبة القيمة المضافة - المخرجات', 'VAT Output Tax', 'liabilities', 'credit', '21', false, true, 212),
('general_trading', '2121', 'حساب ضريبة مخرجات المبيعات المستلمة', 'VAT Output Tax Account', 'liabilities', 'credit', '212', true, true, 2121),
('general_trading', '3', 'حقوق الملكية', 'Equity', 'equity', 'credit', NULL, false, true, 300),
('general_trading', '31', 'رأس المال وحقوق المساهمين', 'Capital and Equity', 'equity', 'credit', '3', false, true, 310),
('general_trading', '311', 'رأس المال والشركاء', 'Share Capital', 'equity', 'credit', '31', false, true, 311),
('general_trading', '3111', 'رأس المال التأسيسي المدفوع والموثق', 'Paid-in Capital Account', 'equity', 'credit', '311', true, true, 3111),
('general_trading', '312', 'الأرباح المبقاة والمدورة', 'Retained Earnings', 'equity', 'credit', '31', false, true, 312),
('general_trading', '3121', 'حساب الأرباح المبقاة والخسائر المتراكمة المعتمد', 'Retained Earnings Account', 'equity', 'credit', '312', true, true, 3121),
('general_trading', '4', 'الإيرادات', 'Revenue', 'revenue', 'credit', NULL, false, true, 400),
('general_trading', '41', 'إيرادات النشاط والعمليات والمبيعات', 'Sales Revenues', 'revenue', 'credit', '4', false, true, 410),
('general_trading', '411', 'إيرادات مبيعات السلع البضائعية والمنتجات', 'Product Sales', 'revenue', 'credit', '41', false, true, 411),
('general_trading', '4111', 'مبيعات منتجات وسلع المنشأة المعترف بها', 'Product Sales Account', 'revenue', 'credit', '411', true, true, 4111),
('general_trading', '5', 'المصروفات وتكلفة المبيعات', 'Expenses & COGS', 'expenses', 'debit', NULL, false, true, 500),
('general_trading', '51', 'تكاليف الإنتاج والخدمات والنشاط', 'Cost of Revenue', 'expenses', 'debit', '5', false, true, 510),
('general_trading', '511', 'تكلفة البضاعة المباعة (التقييم المستمر)', 'Cost of Goods Sold', 'expenses', 'debit', '51', false, true, 511),
('general_trading', '5111', 'حساب تكلفة البضاعة والسلع المباعة', 'Cost of Goods Sold Account', 'expenses', 'debit', '511', true, true, 5111),
('general_trading', '5113', 'مردودات ومسترجعات المبيعات', 'Sales Returns', 'expenses', 'debit', '511', true, false, 5113),
('general_trading', '5114', 'خصومات ومسموحات المبيعات الممنوحة', 'Sales Discounts', 'expenses', 'debit', '511', true, false, 5114),
('general_trading', '52', 'المصروفات التشغيلية والإدارية العامة', 'Operating Expenses', 'expenses', 'debit', '5', false, false, 520),
('general_trading', '521', 'المصروفات العمومية والرواتب والأجور', 'General G&A Expense', 'expenses', 'debit', '52', false, false, 521),
('general_trading', '5211', 'مصروفات الرواتب والأجور الأساسية والمنافع', 'Salaries and Wages Expense', 'expenses', 'debit', '521', true, false, 5211),

-- ==========================================
-- B. SERVICES (خدمات)
-- ==========================================
('services', '1', 'الأصول', 'Assets', 'assets', 'debit', NULL, false, true, 100),
('services', '11', 'الأصول المتداولة', 'Current Assets', 'assets', 'debit', '1', false, true, 110),
('services', '111', 'النقدية وما في حكمها', 'Cash and Cash Equivalents', 'assets', 'debit', '11', false, true, 111),
('services', '1111', 'أمين الصندوق (الخزينة العامة)', 'Cash on Hand', 'assets', 'debit', '111', true, true, 1111),
('services', '1112', 'حساب البنك الجاري الرئيسي', 'Bank Default Account', 'assets', 'debit', '111', true, true, 1112),
('services', '112', 'العملاء والذمم المدينة', 'Accounts Receivable', 'assets', 'debit', '11', false, true, 112),
('services', '1121', 'حساب ذمم العملاء التجاريين الموحد', 'Trade Accounts Receivable', 'assets', 'debit', '112', true, true, 1121),
('services', '115', 'ضريبة القيمة المضافة - المدخلات', 'VAT Input Tax', 'assets', 'debit', '11', false, true, 115),
('services', '1151', 'حساب ضريبة مدخلات المشتريات المرفوعة', 'VAT Input Tax Account', 'assets', 'debit', '115', true, true, 1151),
('services', '2', 'الالتزامات', 'Liabilities', 'liabilities', 'credit', NULL, false, true, 200),
('services', '21', 'الالتزامات المتداولة', 'Current Liabilities', 'liabilities', 'credit', '2', false, true, 210),
('services', '211', 'الموردون والذمم الدائنة', 'Accounts Payable', 'liabilities', 'credit', '21', false, true, 211),
('services', '2111', 'حساب ذمم الموردين التجاريين الموحد', 'Trade Accounts Payable', 'liabilities', 'credit', '211', true, true, 2111),
('services', '212', 'ضريبة القيمة المضافة - المخرجات', 'VAT Output Tax', 'liabilities', 'credit', '21', false, true, 212),
('services', '2121', 'حساب ضريبة مخرجات المبيعات المستلمة', 'VAT Output Tax Account', 'liabilities', 'credit', '212', true, true, 2121),
('services', '3', 'حقوق الملكية', 'Equity', 'equity', 'credit', NULL, false, true, 300),
('services', '31', 'رأس المال وحقوق المساهمين', 'Capital and Equity', 'equity', 'credit', '3', false, true, 310),
('services', '311', 'رأس المال والشركاء', 'Share Capital', 'equity', 'credit', '31', false, true, 311),
('services', '3111', 'رأس المال التأسيسي المدفوع والموثق', 'Paid-in Capital Account', 'equity', 'credit', '311', true, true, 3111),
('services', '312', 'الأرباح المبقاة والمدورة', 'Retained Earnings', 'equity', 'credit', '31', false, true, 312),
('services', '3121', 'حساب الأرباح المبقاة والخسائر المتراكمة المعتمد', 'Retained Earnings Account', 'equity', 'credit', '312', true, true, 3121),
('services', '4', 'الإيرادات', 'Revenue', 'revenue', 'credit', NULL, false, true, 400),
('services', '41', 'إيرادات النشاط والعمليات والمبيعات', 'Sales Revenues', 'revenue', 'credit', '4', false, true, 410),
('services', '411', 'إيرادات مبيعات السلع البضائعية والمنتجات', 'Product Sales', 'revenue', 'credit', '41', false, true, 411),
('services', '4111', 'إيرادات مبيعات وتوريدات متنوعة', 'General Product Sales', 'revenue', 'credit', '411', true, true, 4111),
('services', '4112', 'إيرادات تقديم الخدمات الاستشارية والتشغيلية', 'Service Revenues', 'revenue', 'credit', '411', true, true, 4112),
('services', '4113', 'إيرادات استشارات وحلول مهنية', 'Consulting Revenues', 'revenue', 'credit', '411', true, false, 4113),
('services', '4114', 'إيرادات اشتراكات دورية وشهرية', 'Monthly Subscription Revenues', 'revenue', 'credit', '411', true, false, 4114),
('services', '5', 'المصروفات وتكلفة المبيعات', 'Expenses & COGS', 'expenses', 'debit', NULL, false, true, 500),
('services', '51', 'تكاليف الإنتاج والخدمات والنشاط', 'Cost of Revenue', 'expenses', 'debit', '5', false, true, 510),
('services', '511', 'مصاريف تشغيلية مباشرة للخدمات', 'Direct Service Expenses', 'expenses', 'debit', '51', false, true, 511),
('services', '5112', 'تكاليف تشغيلية واستشارية مباشرة للمشاريع', 'Direct Project & Advisory Costs', 'expenses', 'debit', '511', true, false, 5112),
('services', '52', 'المصروفات التشغيلية والإدارية العامة', 'Operating Expenses', 'expenses', 'debit', '5', false, false, 520),
('services', '521', 'المصروفات العمومية والرواتب والأجور', 'General G&A Expense', 'expenses', 'debit', '52', false, false, 521),
('services', '5211', 'مصروفات الرواتب والأجور الأساسية والمنافع', 'Salaries and Wages Expense', 'expenses', 'debit', '521', true, false, 5211),
('services', '5216', 'مصروفات برمجيات واشتراكات منصات وسحابة', 'Software & Cloud Subscriptions', 'expenses', 'debit', '521', true, false, 5216),
('services', '5217', 'مصروفات تسويق وحملات إعلانية', 'Marketing & Advertising', 'expenses', 'debit', '521', true, false, 5217),

-- ==========================================
-- C. REAL ESTATE (عقارات)
-- ==========================================
('real_estate', '1', 'الأصول', 'Assets', 'assets', 'debit', NULL, false, true, 100),
('real_estate', '11', 'الأصول المتداولة', 'Current Assets', 'assets', 'debit', '1', false, true, 110),
('real_estate', '111', 'النقدية وما في حكمها', 'Cash and Cash Equivalents', 'assets', 'debit', '11', false, true, 111),
('real_estate', '1111', 'أمين الصندوق (الخزينة العامة)', 'Cash on Hand', 'assets', 'debit', '111', true, true, 1111),
('real_estate', '1112', 'حساب البنك الجاري الرئيسي', 'Bank Default Account', 'assets', 'debit', '111', true, true, 1112),
('real_estate', '112', 'العملاء والذمم المدينة', 'Accounts Receivable', 'assets', 'debit', '11', false, true, 112),
('real_estate', '1121', 'حساب ذمم العملاء التجاريين الموحد', 'Trade Accounts Receivable', 'assets', 'debit', '112', true, true, 1121),
('real_estate', '115', 'ضريبة القيمة المضافة - المدخلات', 'VAT Input Tax', 'assets', 'debit', '11', false, true, 115),
('real_estate', '1151', 'حساب ضريبة مدخلات المشتريات المرفوعة', 'VAT Input Tax Account', 'assets', 'debit', '115', true, true, 1151),
('real_estate', '2', 'الالتزامات', 'Liabilities', 'liabilities', 'credit', NULL, false, true, 200),
('real_estate', '21', 'الالتزامات المتداولة', 'Current Liabilities', 'liabilities', 'credit', '2', false, true, 210),
('real_estate', '211', 'الموردون والذمم الدائنة', 'Accounts Payable', 'liabilities', 'credit', '21', false, true, 211),
('real_estate', '2111', 'حساب ذمم الموردين التجاريين الموحد', 'Trade Accounts Payable', 'liabilities', 'credit', '211', true, true, 2111),
('real_estate', '212', 'ضريبة القيمة المضافة - المخرجات', 'VAT Output Tax', 'liabilities', 'credit', '21', false, true, 212),
('real_estate', '2121', 'حساب ضريبة مخرجات المبيعات المستلمة', 'VAT Output Tax Account', 'liabilities', 'credit', '212', true, true, 2121),
('real_estate', '3', 'حقوق الملكية', 'Equity', 'equity', 'credit', NULL, false, true, 300),
('real_estate', '31', 'رأس المال وحقوق المساهمين', 'Capital and Equity', 'equity', 'credit', '3', false, true, 310),
('real_estate', '311', 'رأس المال والشركاء', 'Share Capital', 'equity', 'credit', '31', false, true, 311),
('real_estate', '3111', 'رأس المال التأسيسي المدفوع والموثق', 'Paid-in Capital Account', 'equity', 'credit', '311', true, true, 3111),
('real_estate', '312', 'الأرباح المبقاة والمدورة', 'Retained Earnings', 'equity', 'credit', '31', false, true, 312),
('real_estate', '3121', 'حساب الأرباح المبقاة والخسائر المتراكمة المعتمد', 'Retained Earnings Account', 'equity', 'credit', '312', true, true, 3121),
('real_estate', '4', 'الإيرادات', 'Revenue', 'revenue', 'credit', NULL, false, true, 400),
('real_estate', '41', 'إيرادات النشاط والعمليات والمبيعات', 'Sales Revenues', 'revenue', 'credit', '4', false, true, 410),
('real_estate', '411', 'إيرادات مبيعات السلع البضائعية والمنتجات', 'Product Sales', 'revenue', 'credit', '41', false, true, 411),
('real_estate', '4111', 'إيرادات مبيعات عقارية مباشرة', 'Direct Property Sales', 'revenue', 'credit', '411', true, true, 4111),
('real_estate', '4112', 'إيرادات السعي والعمولات العقارية', 'Real Estate Brokerage Revenues', 'revenue', 'credit', '411', true, true, 4112),
('real_estate', '4113', 'إيرادات إدارة أملاك عقارية وتأجير', 'Property Management Revenues', 'revenue', 'credit', '411', true, false, 4113),
('real_estate', '4114', 'إيرادات تسويق وترويج عقاري', 'Real Estate Marketing Revenues', 'revenue', 'credit', '411', true, false, 4114),
('real_estate', '4115', 'إيرادات استشارات ودراسات عقارية', 'Real Estate Consulting Revenues', 'revenue', 'credit', '411', true, false, 4115),
('real_estate', '5', 'المصروفات وتكلفة المبيعات', 'Expenses & COGS', 'expenses', 'debit', NULL, false, true, 500),
('real_estate', '51', 'تكاليف الإنتاج والخدمات والنشاط', 'Cost of Revenue', 'expenses', 'debit', '5', false, true, 510),
('real_estate', '511', 'مصاريف تشغيلية مباشرة وعمولات', 'Direct Operational Costs', 'expenses', 'debit', '51', false, true, 511),
('real_estate', '5112', 'عمولات مسوقين ووسطاء مبيعات وتأجير', 'Sales Commission Expenses', 'expenses', 'debit', '511', true, false, 5112),
('real_estate', '52', 'المصروفات التشغيلية والإدارية العامة', 'Operating Expenses', 'expenses', 'debit', '5', false, false, 520),
('real_estate', '521', 'المصروفات العمومية والرواتب والأجور', 'General G&A Expense', 'expenses', 'debit', '52', false, false, 521),
('real_estate', '5211', 'مصروفات الرواتب والأجور الأساسية والمنافع', 'Salaries and Wages Expense', 'expenses', 'debit', '521', true, false, 5211),
('real_estate', '5217', 'مصروفات إعلانات وتسويق ومنشورات عقارية', 'Real Estate Ads Expense', 'expenses', 'debit', '521', true, false, 5217),
('real_estate', '5218', 'مصروفات تصوير وتوثيق ومعاينة عقارات', 'Property Photography Expense', 'expenses', 'debit', '521', true, false, 5218),
('real_estate', '5219', 'مصروفات اشتراكات منصات عقارية (إيجار / سهل / إلخ)', 'Real Estate Platform Subscriptions', 'expenses', 'debit', '521', true, false, 5219),
('real_estate', '5220', 'مصروفات تنقل ومعاينة وتفقد عقارات للموظفين', 'Travel & Inspection Expense', 'expenses', 'debit', '521', true, false, 5220),

-- ==========================================
-- D. CONTRACTING (مقاولات)
-- ==========================================
('contracting', '1', 'الأصول', 'Assets', 'assets', 'debit', NULL, false, true, 100),
('contracting', '11', 'الأصول المتداولة', 'Current Assets', 'assets', 'debit', '1', false, true, 110),
('contracting', '111', 'النقدية وما في حكمها', 'Cash and Cash Equivalents', 'assets', 'debit', '11', false, true, 111),
('contracting', '1111', 'أمين الصندوق (الخزينة العامة)', 'Cash on Hand', 'assets', 'debit', '111', true, true, 1111),
('contracting', '1112', 'حساب البنك الجاري الرئيسي', 'Bank Default Account', 'assets', 'debit', '111', true, true, 1112),
('contracting', '112', 'العملاء والذمم المدينة', 'Accounts Receivable', 'assets', 'debit', '11', false, true, 112),
('contracting', '1121', 'حساب ذمم العملاء التجاريين الموحد', 'Trade Accounts Receivable', 'assets', 'debit', '112', true, true, 1121),
('contracting', '114', 'أرصدة مدينة ومصروفات مقدمة', 'Prepaid Expenses', 'assets', 'debit', '11', false, true, 114),
('contracting', '1142', 'دفعات مقدمة للموردين والمقاولين المنفذين', 'Vendor & Subcontractor Prepayments', 'assets', 'debit', '114', true, false, 1142),
('contracting', '115', 'ضريبة القيمة المضافة - المدخلات', 'VAT Input Tax', 'assets', 'debit', '11', false, true, 115),
('contracting', '1151', 'حساب ضريبة مدخلات المشتريات المرفوعة', 'VAT Input Tax Account', 'assets', 'debit', '115', true, true, 1151),
('contracting', '116', 'مشروعات تحت التنفيذ وأعمال غير مفوترة', 'Projects & Work in Progress', 'assets', 'debit', '11', false, false, 116),
('contracting', '1161', 'مشاريع إنشائية تحت التنفيذ (تكاليف متراكمة)', 'Work in Progress (WIP)', 'assets', 'debit', '116', true, false, 1161),
('contracting', '2', 'الالتزامات', 'Liabilities', 'liabilities', 'credit', NULL, false, true, 200),
('contracting', '21', 'الالتزامات المتداولة', 'Current Liabilities', 'liabilities', 'credit', '2', false, true, 210),
('contracting', '211', 'الموردون والذمم الدائنة', 'Accounts Payable', 'liabilities', 'credit', '21', false, true, 211),
('contracting', '2111', 'حساب ذمم الموردين التجاريين الموحد', 'Trade Accounts Payable', 'liabilities', 'credit', '211', true, true, 2111),
('contracting', '2112', 'مستحقات مقاولين باطن ومنفذين معلقة', 'Subcontractors Payable', 'liabilities', 'credit', '211', true, false, 2112),
('contracting', '212', 'ضريبة القيمة المضافة - المخرجات', 'VAT Output Tax', 'liabilities', 'credit', '21', false, true, 212),
('contracting', '2121', 'حساب ضريبة مخرجات المبيعات المستلمة', 'VAT Output Tax Account', 'liabilities', 'credit', '212', true, true, 2121),
('contracting', '214', 'دفعات مقدمة من العملاء والتزامات عقود', 'Customer Prepayments', 'liabilities', 'credit', '21', false, false, 214),
('contracting', '2141', 'دفعات مقدمة من عملاء المشاريع (مستلمة مقدمًا)', 'Customer Prepayments for Projects', 'liabilities', 'credit', '214', true, false, 2141),
('contracting', '3', 'حقوق الملكية', 'Equity', 'equity', 'credit', NULL, false, true, 300),
('contracting', '31', 'رأس المال وحقوق المساهمين', 'Capital and Equity', 'equity', 'credit', '3', false, true, 310),
('contracting', '311', 'رأس المال والشركاء', 'Share Capital', 'equity', 'credit', '31', false, true, 311),
('contracting', '3111', 'رأس المال التأسيسي المدفوع والموثق', 'Paid-in Capital Account', 'equity', 'credit', '311', true, true, 3111),
('contracting', '312', 'الأرباح المبقاة والمدورة', 'Retained Earnings', 'equity', 'credit', '31', false, true, 312),
('contracting', '3121', 'حساب الأرباح المبقاة والخسائر المتراكمة المعتمد', 'Retained Earnings Account', 'equity', 'credit', '312', true, true, 3121),
('contracting', '4', 'الإيرادات', 'Revenue', 'revenue', 'credit', NULL, false, true, 400),
('contracting', '41', 'إيرادات النشاط والعمليات والمبيعات', 'Sales Revenues', 'revenue', 'credit', '4', false, true, 410),
('contracting', '411', 'إيرادات مبيعات السلع البضائعية والمنتجات', 'Product Sales', 'revenue', 'credit', '41', false, true, 411),
('contracting', '4111', 'مبيعات وتوريدات مواد ومستلزمات عامة', 'Direct General Sales', 'revenue', 'credit', '411', true, true, 4111),
('contracting', '4112', 'إيرادات عقود مقاولات وإنشاءات معترف بها', 'Construction Contract Revenues', 'revenue', 'credit', '411', true, true, 4112),
('contracting', '4113', 'إيرادات مراحل مشاريع منجزة ومعتمدة', 'Completed Milestones Revenues', 'revenue', 'credit', '411', true, false, 4113),
('contracting', '5', 'المصروفات وتكلفة المبيعات', 'Expenses & COGS', 'expenses', 'debit', NULL, false, true, 500),
('contracting', '51', 'تكاليف الإنتاج والخدمات والنشاط', 'Cost of Revenue', 'expenses', 'debit', '5', false, true, 510),
('contracting', '512', 'تكاليف مشاريع ومقاولات مباشرة معتمدة', 'Direct Project Costs', 'expenses', 'debit', '51', false, false, 512),
('contracting', '5121', 'تكلفة مواد بناء ومستلزمات مواقع مباشرة', 'Direct Materials Cost', 'expenses', 'debit', '512', true, false, 5121),
('contracting', '5122', 'أجور رواتب عمالة تشغيلية مباشرة ومنافع', 'Direct Labour Cost', 'expenses', 'debit', '512', true, false, 5122),
('contracting', '5123', 'تكاليف مقاولين باطن ومنفذين فرعيين للموقع', 'Subcontractors Cost', 'expenses', 'debit', '512', true, false, 5123),
('contracting', '5124', 'تكاليف تأجير آليات ومعدات تشغيلية ميدانية', 'Equipment Lease & Rental', 'expenses', 'debit', '512', true, false, 5124),
('contracting', '5125', 'مصاريف مواقع وتأسيس مكاتب ميدانية وتراخيص', 'Site & Field Office Expenses', 'expenses', 'debit', '512', true, false, 5125),
('contracting', '52', 'المصروفات التشغيلية والإدارية العامة', 'Operating Expenses', 'expenses', 'debit', '5', false, false, 520),
('contracting', '521', 'المصروفات العمومية والرواتب والأجور', 'General G&A Expense', 'expenses', 'debit', '52', false, false, 521),
('contracting', '5211', 'مصروفات الرواتب والأجور الأساسية والمنافع', 'Salaries and Wages Expense', 'expenses', 'debit', '521', true, false, 5211),

-- ==========================================
-- E. ECOMMERCE (تجارة إلكترونية)
-- ==========================================
('ecommerce', '1', 'الأصول', 'Assets', 'assets', 'debit', NULL, false, true, 100),
('ecommerce', '11', 'الأصول المتداولة', 'Current Assets', 'assets', 'debit', '1', false, true, 110),
('ecommerce', '111', 'النقدية وما في حكمها', 'Cash and Cash Equivalents', 'assets', 'debit', '11', false, true, 111),
('ecommerce', '1111', 'أمين الصندوق (الخزينة العامة)', 'Cash on Hand', 'assets', 'debit', '111', true, true, 1111),
('ecommerce', '1112', 'حساب البنك الجاري الرئيسي', 'Bank Default Account', 'assets', 'debit', '111', true, true, 1112),
('ecommerce', '1113', 'أرصدة معلقة وتسويات لدى بوابات الدفع الإلكتروني', 'Payment Gateway Clearing', 'assets', 'debit', '111', true, false, 1113),
('ecommerce', '112', 'العملاء والذمم المدينة', 'Accounts Receivable', 'assets', 'debit', '11', false, true, 112),
('ecommerce', '1121', 'حساب ذمم العملاء التجاريين الموحد', 'Trade Accounts Receivable', 'assets', 'debit', '112', true, true, 1121),
('ecommerce', '1122', 'مبالغ معلقة وتحت التحصيل من شركات الشحن', 'Shipping Company Clearing', 'assets', 'debit', '112', true, false, 1122),
('ecommerce', '113', 'المخزون السلعي', 'Inventory', 'assets', 'debit', '11', false, true, 113),
('ecommerce', '1131', 'مخزون المستودع السلعي والطلبات المجهزة', 'Finished Goods Inventory', 'assets', 'debit', '113', true, true, 1131),
('ecommerce', '115', 'ضريبة القيمة المضافة - المدخلات', 'VAT Input Tax', 'assets', 'debit', '11', false, true, 115),
('ecommerce', '1151', 'حساب ضريبة مدخلات المشتريات المرفوعة', 'VAT Input Tax Account', 'assets', 'debit', '115', true, true, 1151),
('ecommerce', '2', 'الالتزامات', 'Liabilities', 'liabilities', 'credit', NULL, false, true, 200),
('ecommerce', '21', 'الالتزامات المتداولة', 'Current Liabilities', 'liabilities', 'credit', '2', false, true, 210),
('ecommerce', '211', 'الموردون والذمم الدائنة', 'Accounts Payable', 'liabilities', 'credit', '21', false, true, 211),
('ecommerce', '2111', 'حساب ذمم الموردين التجاريين الموحد', 'Trade Accounts Payable', 'liabilities', 'credit', '211', true, true, 2111),
('ecommerce', '212', 'ضريبة القيمة المضافة - المخرجات', 'VAT Output Tax', 'liabilities', 'credit', '21', false, true, 212),
('ecommerce', '2121', 'حساب ضريبة مخرجات المبيعات المستلمة', 'VAT Output Tax Account', 'liabilities', 'credit', '212', true, true, 2121),
('ecommerce', '3', 'حقوق الملكية', 'Equity', 'equity', 'credit', NULL, false, true, 300),
('ecommerce', '31', 'رأس المال وحقوق المساهمين', 'Capital and Equity', 'equity', 'credit', '3', false, true, 310),
('ecommerce', '311', 'رأس المال والشركاء', 'Share Capital', 'equity', 'credit', '31', false, true, 311),
('ecommerce', '3111', 'رأس المال التأسيسي المدفوع والموثق', 'Paid-in Capital Account', 'equity', 'credit', '311', true, true, 3111),
('ecommerce', '312', 'الأرباح المبقاة والمدورة', 'Retained Earnings', 'equity', 'credit', '31', false, true, 312),
('ecommerce', '3121', 'حساب الأرباح المبقاة والخسائر المتراكمة المعتمد', 'Retained Earnings Account', 'equity', 'credit', '312', true, true, 3121),
('ecommerce', '4', 'الإيرادات', 'Revenue', 'revenue', 'credit', NULL, false, true, 400),
('ecommerce', '41', 'إيرادات النشاط والعمليات والمبيعات', 'Sales Revenues', 'revenue', 'credit', '4', false, true, 410),
('ecommerce', '411', 'إيرادات مبيعات السلع البضائعية والمنتجات', 'Product Sales', 'revenue', 'credit', '41', false, true, 411),
('ecommerce', '4111', 'مبيعات المتجر الإلكتروني المباشرة والطلبات', 'E-commerce Sales', 'revenue', 'credit', '411', true, true, 4111),
('ecommerce', '4112', 'إيرادات رسوم الشحن والتوصيل المحصلة من العملاء', 'Shipping Revenues Collected', 'revenue', 'credit', '411', true, false, 4112),
('ecommerce', '5', 'المصروفات وتكلفة المبيعات', 'Expenses & COGS', 'expenses', 'debit', NULL, false, true, 500),
('ecommerce', '51', 'تكاليف الإنتاج والخدمات والنشاط', 'Cost of Revenue', 'expenses', 'debit', '5', false, true, 510),
('ecommerce', '511', 'تكلفة البضاعة المباعة والمصاريف التشغيلية للمتجر', 'Cost of Goods Sold & Shipping', 'expenses', 'debit', '51', false, true, 511),
('ecommerce', '5111', 'حساب تكلفة البضاعة والسلع المباعة', 'Cost of Goods Sold Account', 'expenses', 'debit', '511', true, true, 5111),
('ecommerce', '5112', 'مصاريف شحن وتوصيل الطلبات للعملاء (الناقلين)', 'Shipping & Delivery Expenses', 'expenses', 'debit', '511', true, false, 5112),
('ecommerce', '5113', 'مردودات ومسترجعات مبيعات المتجر الإلكتروني', 'Sales Returns', 'expenses', 'debit', '511', true, false, 5113),
('ecommerce', '5114', 'خصومات ومسموحات مبيعات المتجر الإلكتروني الممنوحة', 'Sales Discounts', 'expenses', 'debit', '511', true, false, 5114),
('ecommerce', '52', 'المصروفات التشغيلية والإدارية العامة', 'Operating Expenses', 'expenses', 'debit', '5', false, false, 520),
('ecommerce', '521', 'المصروفات العمومية والرواتب والأجور', 'General G&A Expense', 'expenses', 'debit', '52', false, false, 521),
('ecommerce', '5211', 'مصروفات الرواتب والأجور الأساسية والمنافع', 'Salaries and Wages Expense', 'expenses', 'debit', '521', true, false, 5211),
('ecommerce', '5214', 'مصروفات ورسوم بوابات الدفع الإلكتروني والتحويلات', 'Payment Gateway Fees', 'expenses', 'debit', '521', true, false, 5214),
('ecommerce', '5217', 'مصروفات عمولات واشتراكات منصات التجارة (سلة / زد / إلخ)', 'Platform Commissions Expense', 'expenses', 'debit', '521', true, false, 5217),

-- ==========================================
-- F. RESTAURANT (مطاعم ومقاهي)
-- ==========================================
('restaurant', '1', 'الأصول', 'Assets', 'assets', 'debit', NULL, false, true, 100),
('restaurant', '11', 'الأصول المتداولة', 'Current Assets', 'assets', 'debit', '1', false, true, 110),
('restaurant', '111', 'النقدية وما في حكمها', 'Cash and Cash Equivalents', 'assets', 'debit', '11', false, true, 111),
('restaurant', '1111', 'أمين الصندوق (خزينة المطعم والفروع)', 'Cash on Hand', 'assets', 'debit', '111', true, true, 1111),
('restaurant', '1112', 'حساب البنك الجاري الرئيسي والمبيعات الكاشفة', 'Bank Default Account', 'assets', 'debit', '111', true, true, 1112),
('restaurant', '112', 'العملاء والذمم المدينة', 'Accounts Receivable', 'assets', 'debit', '11', false, true, 112),
('restaurant', '1121', 'حساب ذمم العملاء والشركات الموحد', 'Trade Accounts Receivable', 'assets', 'debit', '112', true, true, 1121),
('restaurant', '113', 'المخزون السلعي والمواد الخام', 'Inventory & Raw Materials', 'assets', 'debit', '11', false, true, 113),
('restaurant', '1131', 'مخزون المواد الغذائية والمشروبات والسلع المستودعية', 'Food & Beverage Inventory', 'assets', 'debit', '113', true, true, 1131),
('restaurant', '115', 'ضريبة القيمة المضافة - المدخلات', 'VAT Input Tax', 'assets', 'debit', '11', false, true, 115),
('restaurant', '1151', 'حساب ضريبة مدخلات المشتريات المرفوعة', 'VAT Input Tax Account', 'assets', 'debit', '115', true, true, 1151),
('restaurant', '2', 'الالتزامات', 'Liabilities', 'liabilities', 'credit', NULL, false, true, 200),
('restaurant', '21', 'الالتزامات المتداولة', 'Current Liabilities', 'liabilities', 'credit', '2', false, true, 210),
('restaurant', '211', 'الموردون والذمم الدائنة', 'Accounts Payable', 'liabilities', 'credit', '21', false, true, 211),
('restaurant', '2111', 'حساب ذمم الموردين وموردي الأغذية الموحد', 'Trade Accounts Payable', 'liabilities', 'credit', '211', true, true, 2111),
('restaurant', '212', 'ضريبة القيمة المضافة - المخرجات', 'VAT Output Tax', 'liabilities', 'credit', '21', false, true, 212),
('restaurant', '2121', 'حساب ضريبة مخرجات المبيعات المستلمة', 'VAT Output Tax Account', 'liabilities', 'credit', '212', true, true, 2121),
('restaurant', '3', 'حقوق الملكية', 'Equity', 'equity', 'credit', NULL, false, true, 300),
('restaurant', '31', 'رأس المال وحقوق المساهمين', 'Capital and Equity', 'equity', 'credit', '3', false, true, 310),
('restaurant', '311', 'رأس المال والشركاء', 'Share Capital', 'equity', 'credit', '31', false, true, 311),
('restaurant', '3111', 'رأس المال التأسيسي المدفوع والموثق', 'Paid-in Capital Account', 'equity', 'credit', '311', true, true, 3111),
('restaurant', '312', 'الأرباح المبقاة والمدورة', 'Retained Earnings', 'equity', 'credit', '31', false, true, 312),
('restaurant', '3121', 'حساب الأرباح المبقاة والخسائر المتراكمة المعتمد', 'Retained Earnings Account', 'equity', 'credit', '312', true, true, 3121),
('restaurant', '4', 'الإيرادات', 'Revenue', 'revenue', 'credit', NULL, false, true, 400),
('restaurant', '41', 'إيرادات النشاط والعمليات والمبيعات', 'Sales Revenues', 'revenue', 'credit', '4', false, true, 410),
('restaurant', '411', 'إيرادات مبيعات السلع البضائعية والمنتجات', 'Product Sales', 'revenue', 'credit', '41', false, true, 411),
('restaurant', '4111', 'إيرادات مبيعات المطعم وصالة الطعام المحلية', 'Restaurant Dine-in Sales', 'revenue', 'credit', '411', true, true, 4111),
('restaurant', '4112', 'إيرادات مبيعات تطبيقات التوصيل (هنقرستيشن / جاهز / إلخ)', 'Delivery App Sales', 'revenue', 'credit', '411', true, false, 4112),
('restaurant', '4113', 'إيرادات مبيعات التوصيل الخاص بأسطول المطعم', 'Internal Delivery Sales', 'revenue', 'credit', '411', true, false, 4113),
('restaurant', '5', 'المصروفات وتكلفة المبيعات', 'Expenses & COGS', 'expenses', 'debit', NULL, false, true, 500),
('restaurant', '51', 'تكاليف الإنتاج والخدمات والنشاط', 'Cost of Revenue', 'expenses', 'debit', '5', false, true, 510),
('restaurant', '511', 'تكلفة المواد الغذائية والمكونات والتشغيل', 'Cost of Food & Beverage', 'expenses', 'debit', '51', false, true, 511),
('restaurant', '5111', 'حساب تكلفة المواد الغذائية والمكونات المستهلكة', 'Cost of Food & Beverage Account', 'expenses', 'debit', '511', true, true, 5111),
('restaurant', '5112', 'مصاريف تعبئة وتغليف وعلب سفري ومستهلكات', 'Packaging & Consumables', 'expenses', 'debit', '511', true, false, 5112),
('restaurant', '5113', 'أجور تشغيلية مباشرة ومكافآت الطهاة وعمال المطبخ', 'Operational Restaurant Staff Wages', 'expenses', 'debit', '511', true, false, 5113),
('restaurant', '52', 'المصروفات التشغيلية والإدارية العامة', 'Operating Expenses', 'expenses', 'debit', '5', false, false, 520),
('restaurant', '521', 'المصروفات العمومية والرواتب والأجور', 'General G&A Expense', 'expenses', 'debit', '52', false, false, 521),
('restaurant', '5211', 'مصروفات الرواتب والأجور الأساسية والمنافع والإداريين', 'Salaries and Wages Expense', 'expenses', 'debit', '521', true, false, 5211),
('restaurant', '5216', 'عمولات ورسوم تطبيقات التوصيل والمنصات الخارجية', 'Delivery App Commissions', 'expenses', 'debit', '521', true, false, 5216),
('restaurant', '5218', 'مصاريف مواد نظافة وتعقيم للمطبخ والصالة والالتزام الصحي', 'Cleaning & Hygiene Expenses', 'expenses', 'debit', '521', true, false, 5218),

-- ==========================================
-- G. SIMPLE ESTABLISHMENT (منشأة بسيطة)
-- ==========================================
('simple_establishment', '1', 'الأصول', 'Assets', 'assets', 'debit', NULL, false, true, 100),
('simple_establishment', '11', 'الأصول المتداولة', 'Current Assets', 'assets', 'debit', '1', false, true, 110),
('simple_establishment', '111', 'النقدية وما في حكمها', 'Cash and Cash Equivalents', 'assets', 'debit', '11', false, true, 111),
('simple_establishment', '1111', 'أمين الصندوق (الخزينة العامة)', 'Cash on Hand', 'assets', 'debit', '111', true, true, 1111),
('simple_establishment', '1112', 'حساب البنك الجاري الرئيسي', 'Bank Default Account', 'assets', 'debit', '111', true, true, 1112),
('simple_establishment', '112', 'العملاء والذمم المدينة', 'Accounts Receivable', 'assets', 'debit', '11', false, true, 112),
('simple_establishment', '1121', 'حساب ذمم العملاء التجاريين الموحد', 'Trade Accounts Receivable', 'assets', 'debit', '112', true, true, 1121),
('simple_establishment', '115', 'ضريبة القيمة المضافة - المدخلات', 'VAT Input Tax', 'assets', 'debit', '11', false, true, 115),
('simple_establishment', '1151', 'حساب ضريبة مدخلات المشتريات المرفوعة', 'VAT Input Tax Account', 'assets', 'debit', '115', true, true, 1151),
('simple_establishment', '2', 'الالتزامات', 'Liabilities', 'liabilities', 'credit', NULL, false, true, 200),
('simple_establishment', '21', 'الالتزامات المتداولة', 'Current Liabilities', 'liabilities', 'credit', '2', false, true, 210),
('simple_establishment', '211', 'الموردون والذمم الدائنة', 'Accounts Payable', 'liabilities', 'credit', '21', false, true, 211),
('simple_establishment', '2111', 'حساب ذمم الموردين التجاريين الموحد', 'Trade Accounts Payable', 'liabilities', 'credit', '211', true, true, 2111),
('simple_establishment', '212', 'ضريبة القيمة المضافة - المخرجات', 'VAT Output Tax', 'liabilities', 'credit', '21', false, true, 212),
('simple_establishment', '2121', 'حساب ضريبة مخرجات المبيعات المستلمة', 'VAT Output Tax Account', 'liabilities', 'credit', '212', true, true, 2121),
('simple_establishment', '3', 'حقوق الملكية', 'Equity', 'equity', 'credit', NULL, false, true, 300),
('simple_establishment', '31', 'رأس المال وحقوق المساهمين', 'Capital and Equity', 'equity', 'credit', '3', false, true, 310),
('simple_establishment', '311', 'رأس المال والشركاء', 'Share Capital', 'equity', 'credit', '31', false, true, 311),
('simple_establishment', '3111', 'رأس المال التأسيسي المدفوع والموثق', 'Paid-in Capital Account', 'equity', 'credit', '311', true, true, 3111),
('simple_establishment', '3112', 'مسحوبات شخصية وجارية للمالك', 'Personal Drawings', 'equity', 'credit', '311', true, false, 3112),
('simple_establishment', '312', 'الأرباح المبقاة والمدورة', 'Retained Earnings', 'equity', 'credit', '31', false, true, 312),
('simple_establishment', '3121', 'حساب الأرباح المبقاة والخسائر المتراكمة المعتمد', 'Retained Earnings Account', 'equity', 'credit', '312', true, true, 3121),
('simple_establishment', '4', 'الإيرادات', 'Revenue', 'revenue', 'credit', NULL, false, true, 400),
('simple_establishment', '41', 'إيرادات النشاط والعمليات والمبيعات', 'Sales Revenues', 'revenue', 'credit', '4', false, true, 410),
('simple_establishment', '411', 'إيرادات مبيعات السلع البضائعية والمنتجات', 'Product Sales', 'revenue', 'credit', '41', false, true, 411),
('simple_establishment', '4111', 'إيرادات مبيعات وخدمات رئيسية للمنشأة', 'Main Revenues', 'revenue', 'credit', '411', true, true, 4111),
('simple_establishment', '5', 'المصروفات وتكلفة المبيعات', 'Expenses & COGS', 'expenses', 'debit', NULL, false, true, 500),
('simple_establishment', '51', 'تكاليف الإنتاج والخدمات والنشاط', 'Cost of Revenue', 'expenses', 'debit', '5', false, true, 510),
('simple_establishment', '511', 'تكاليف ومشتريات ومصاريف تشغيلية مباشرة', 'Direct Operating Costs', 'expenses', 'debit', '51', false, true, 511),
('simple_establishment', '5111', 'حساب تكاليف تشغيلية مباشرة ومشتريات النشاط', 'Direct Operating Costs Account', 'expenses', 'debit', '511', true, true, 5111),
('simple_establishment', '52', 'المصروفات التشغيلية والإدارية العامة', 'Operating Expenses', 'expenses', 'debit', '5', false, false, 520),
('simple_establishment', '521', 'المصروفات العمومية والرواتب والأجور', 'General G&A Expense', 'expenses', 'debit', '52', false, false, 521),
('simple_establishment', '5211', 'مصروفات الرواتب والأجور الأساسية والمنافع', 'Salaries and Wages Expense', 'expenses', 'debit', '521', true, false, 5211)
ON CONFLICT (industry_type, code) DO UPDATE SET
    name_ar = EXCLUDED.name_ar,
    name_en = EXCLUDED.name_en,
    classification = EXCLUDED.classification,
    nature = EXCLUDED.nature,
    parent_code = EXCLUDED.parent_code,
    allow_direct_posting = EXCLUDED.allow_direct_posting,
    is_system = EXCLUDED.is_system,
    sort_order = EXCLUDED.sort_order;


-- 3. CREATE RPC: seed_industry_chart_of_accounts(p_org_id uuid, p_industry_type text)
CREATE OR REPLACE FUNCTION public.seed_industry_chart_of_accounts(
    p_org_id uuid,
    p_industry_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_is_already_init boolean;
    v_is_accounts_exist boolean;
    v_inserted_count integer := 0;
    
    -- Record variables for loop
    v_rec record;
    
    -- Variables to keep mapped ids
    v_cash_id uuid;
    v_bank_id uuid;
    v_receivables_id uuid;
    v_inventory_id uuid;
    v_tax_input_id uuid;
    v_payables_id uuid;
    v_tax_output_id uuid;
    v_retained_id uuid;
    v_sales_id uuid;
    v_service_sales_id uuid;
    v_cogs_id uuid;
    
    -- Mapping codes based on template types
    v_cash_code text := '1111';
    v_bank_code text := '1112';
    v_receivables_code text := '1121';
    v_payables_code text := '2111';
    v_tax_output_code text := '2121';
    v_tax_input_code text := '1151';
    v_retained_code text := '3121';
    
    v_sales_code text;
    v_service_sales_code text;
    v_inventory_code text;
    v_cogs_code text;
BEGIN
    -- 1. Authentication & Authorization checks
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Ensure the user is explicitly Owner or Admin and is active in the target organization
    IF NOT EXISTS (
        SELECT 1 
        FROM public.organization_members 
        WHERE organization_id = p_org_id 
          AND profile_id = v_user_id 
          AND role IN ('owner', 'admin')
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'غير مصرح: تهيئة دليل الحسابات متاحة للمالك والمدير فقط.';
    END IF;

    -- Obtain transactional advisory lock based on the organization_id to prevent double submissions/race conditions
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- 2. Idempotency Check (Safe Guards)
    SELECT EXISTS (
        SELECT 1 FROM public.accounting_settings 
        WHERE organization_id = p_org_id AND coa_initialized_at IS NOT NULL
    ) INTO v_is_already_init;

    SELECT EXISTS (
        SELECT 1 FROM public.accounts 
        WHERE organization_id = p_org_id
    ) INTO v_is_accounts_exist;

    IF v_is_already_init OR v_is_accounts_exist THEN
        RETURN jsonb_build_object('status', 'already_initialized');
    END IF;

    -- Verify that the requested template has actual data in the database
    IF NOT EXISTS (
        SELECT 1 FROM public.coa_templates 
        WHERE industry_type = p_industry_type
    ) THEN
        RAISE EXCEPTION 'قالب دليل الحسابات المحدد (%) غير متوفر حاليًا.', p_industry_type;
    END IF;

    -- Set default accounting settings codes based on the chosen industry template
    v_sales_code := '4111';
    v_service_sales_code := NULL;
    v_inventory_code := NULL;
    v_cogs_code := NULL;

    IF p_industry_type = 'general_trading' THEN
        v_inventory_code := '1131';
        v_cogs_code := '5111';
    ELSIF p_industry_type = 'services' THEN
        v_sales_code := '4112'; -- إيرادات تقديم الخدمات الاستشارية والتشغيلية
        v_service_sales_code := '4113'; -- إيرادات استشارات وحلول مهنية
    ELSIF p_industry_type = 'real_estate' THEN
        v_sales_code := '4112'; -- إيرادات السعي والعمولات العقارية
        v_service_sales_code := '4113'; -- إيرادات إدارة أملاك عقارية وتأجير
    ELSIF p_industry_type = 'contracting' THEN
        v_sales_code := '4112'; -- إيرادات عقود مقاولات وإنشاءات معترف بها
        v_service_sales_code := '4113'; -- إيرادات مراحل مشاريع منجزة ومعتمدة
    ELSIF p_industry_type = 'ecommerce' THEN
        v_sales_code := '4111'; -- مبيعات المتجر الإلكتروني المباشرة والطلبات
        v_service_sales_code := '4112'; -- إيرادات رسوم الشحن والتوصيل المحصلة من العملاء
        v_inventory_code := '1131';
        v_cogs_code := '5111';
    ELSIF p_industry_type = 'restaurant' THEN
        v_sales_code := '4111'; -- إيرادات مبيعات المطعم وصالة الطعام المحلية
        v_service_sales_code := '4112'; -- إيرادات مبيعات تطبيقات التوصيل
        v_inventory_code := '1131';
        v_cogs_code := '5111';
    END IF;

    -- 3. Inserting the accounts in correct order of length(code), code to ensure parents are created before child accounts
    FOR v_rec IN 
        SELECT code, name_ar, name_en, classification, nature, parent_code, allow_direct_posting, is_system, sort_order
        FROM public.coa_templates
        WHERE industry_type = p_industry_type
        ORDER BY length(code) ASC, code ASC
    LOOP
        DECLARE
            v_parent_id uuid := NULL;
        BEGIN
            -- Find the parent account's ID if parent_code is specified
            IF v_rec.parent_code IS NOT NULL THEN
                SELECT id INTO v_parent_id 
                FROM public.accounts 
                WHERE organization_id = p_org_id AND code = v_rec.parent_code;

                IF v_parent_id IS NULL THEN
                    RAISE EXCEPTION 'تكامل البيانات معطوب: لم يتم العثور على الحساب الأب ذو الرمز (%) للحساب (%)', v_rec.parent_code, v_rec.code;
                END IF;
            END IF;

            -- Insert the account. This will trigger 'validation_and_propagate_accounts' which calculates level and promotes parents automatically.
            INSERT INTO public.accounts (
                organization_id,
                code,
                name_ar,
                name_en,
                classification,
                nature,
                parent_id,
                allow_direct_posting,
                is_system,
                description
            ) VALUES (
                p_org_id,
                v_rec.code,
                v_rec.name_ar,
                v_rec.name_en,
                v_rec.classification,
                v_rec.nature,
                v_parent_id,
                v_rec.allow_direct_posting,
                v_rec.is_system,
                'تم إنشاؤه تلقائيًا من قالب النشاط: ' || p_industry_type
            );

            v_inserted_count := v_inserted_count + 1;
        END;
    END LOOP;

    -- 4. Map the newly created accounts to the default accounting settings
    SELECT id INTO v_cash_id FROM public.accounts WHERE organization_id = p_org_id AND code = v_cash_code;
    SELECT id INTO v_bank_id FROM public.accounts WHERE organization_id = p_org_id AND code = v_bank_code;
    SELECT id INTO v_receivables_id FROM public.accounts WHERE organization_id = p_org_id AND code = v_receivables_code;
    SELECT id INTO v_payables_id FROM public.accounts WHERE organization_id = p_org_id AND code = v_payables_code;
    SELECT id INTO v_tax_output_id FROM public.accounts WHERE organization_id = p_org_id AND code = v_tax_output_code;
    SELECT id INTO v_tax_input_id FROM public.accounts WHERE organization_id = p_org_id AND code = v_tax_input_code;
    SELECT id INTO v_retained_id FROM public.accounts WHERE organization_id = p_org_id AND code = v_retained_code;
    
    IF v_sales_code IS NOT NULL THEN
        SELECT id INTO v_sales_id FROM public.accounts WHERE organization_id = p_org_id AND code = v_sales_code;
    END IF;
    
    IF v_service_sales_code IS NOT NULL THEN
        SELECT id INTO v_service_sales_id FROM public.accounts WHERE organization_id = p_org_id AND code = v_service_sales_code;
    END IF;
    
    IF v_inventory_code IS NOT NULL THEN
        SELECT id INTO v_inventory_id FROM public.accounts WHERE organization_id = p_org_id AND code = v_inventory_code;
    END IF;
    
    IF v_cogs_code IS NOT NULL THEN
        SELECT id INTO v_cogs_id FROM public.accounts WHERE organization_id = p_org_id AND code = v_cogs_code;
    END IF;

    -- Upsert accounting settings
    INSERT INTO public.accounting_settings (
        organization_id,
        default_cash_account_id,
        default_bank_account_id,
        default_receivables_account_id,
        default_inventory_account_id,
        default_tax_input_account_id,
        default_payables_account_id,
        default_tax_output_account_id,
        default_retained_earnings_account_id,
        default_sales_account_id,
        default_service_sales_account_id,
        default_cogs_account_id,
        coa_initialized_at,
        updated_at
    ) VALUES (
        p_org_id,
        v_cash_id,
        v_bank_id,
        v_receivables_id,
        v_inventory_id,
        v_tax_input_id,
        v_payables_id,
        v_tax_output_id,
        v_retained_id,
        v_sales_id,
        v_service_sales_id,
        v_cogs_id,
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
    ) ON CONFLICT (organization_id) DO UPDATE SET
        default_cash_account_id = EXCLUDED.default_cash_account_id,
        default_bank_account_id = EXCLUDED.default_bank_account_id,
        default_receivables_account_id = EXCLUDED.default_receivables_account_id,
        default_inventory_account_id = EXCLUDED.default_inventory_account_id,
        default_tax_input_account_id = EXCLUDED.default_tax_input_account_id,
        default_payables_account_id = EXCLUDED.default_payables_account_id,
        default_tax_output_account_id = EXCLUDED.default_tax_output_account_id,
        default_retained_earnings_account_id = EXCLUDED.default_retained_earnings_account_id,
        default_sales_account_id = EXCLUDED.default_sales_account_id,
        default_service_sales_account_id = EXCLUDED.default_service_sales_account_id,
        default_cogs_account_id = EXCLUDED.default_cogs_account_id,
        coa_initialized_at = EXCLUDED.coa_initialized_at,
        updated_at = timezone('utc'::text, now());

    -- 5. Record activity in public.audit_logs
    BEGIN
        INSERT INTO public.audit_logs (
            organization_id,
            profile_id,
            action,
            details
        ) VALUES (
            p_org_id,
            v_user_id,
            'seed_industry_chart_of_accounts',
            jsonb_build_object(
                'industry_type', p_industry_type,
                'status', 'success',
                'accounts_count', v_inserted_count
            )
        );
    EXCEPTION WHEN OTHERS THEN
        -- Safely ignore audit log write failures to not break the transaction
        NULL;
    END;

    RETURN jsonb_build_object(
        'status', 'success',
        'inserted_accounts', v_inserted_count,
        'industry_type', p_industry_type
    );
END;
$$;

-- Grant execution to authenticated users
REVOKE ALL ON FUNCTION public.seed_industry_chart_of_accounts(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_industry_chart_of_accounts(uuid, text) TO authenticated;


-- 4. CREATE RPC: get_available_coa_templates()
CREATE OR REPLACE FUNCTION public.get_available_coa_templates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'industry_type', t.industry_type,
            'name_ar', CASE 
                WHEN t.industry_type = 'general_trading' THEN 'التجارة العامة والتجزئة'
                WHEN t.industry_type = 'services' THEN 'الخدمات والاستشارات'
                WHEN t.industry_type = 'real_estate' THEN 'العقارات والوساطة العقارية'
                WHEN t.industry_type = 'contracting' THEN 'المقاولات والإنشاءات'
                WHEN t.industry_type = 'ecommerce' THEN 'المتاجر الإلكترونية والتجارة الرقمية'
                WHEN t.industry_type = 'restaurant' THEN 'المطاعم والمقاهي والأغذية'
                WHEN t.industry_type = 'simple_establishment' THEN 'مؤسسة فردية مبسطة'
                ELSE t.industry_type
            END,
            'name_en', CASE 
                WHEN t.industry_type = 'general_trading' THEN 'General Trading & Retail'
                WHEN t.industry_type = 'services' THEN 'Services & Consulting'
                WHEN t.industry_type = 'real_estate' THEN 'Real Estate & Brokerage'
                WHEN t.industry_type = 'contracting' THEN 'Contracting & Construction'
                WHEN t.industry_type = 'ecommerce' THEN 'E-commerce & Digital Trade'
                WHEN t.industry_type = 'restaurant' THEN 'Restaurants, Cafes & Food'
                WHEN t.industry_type = 'simple_establishment' THEN 'Simple Sole Proprietorship'
                ELSE t.industry_type
            END,
            'description', CASE 
                WHEN t.industry_type = 'general_trading' THEN 'دليل حسابات مخصص لتجارة السلع والتجزئة والمستودعات مع تفعيل المخزون وتكلفة البضاعة.'
                WHEN t.industry_type = 'services' THEN 'دليل حسابات مهني لشركات تقديم الخدمات والاشتراكات والاستشارات بدون مخزون سلعي.'
                WHEN t.industry_type = 'real_estate' THEN 'دليل حسابات عقاري يدعم السعي، وعمولات الوسطاء، وإدارة الأملاك العقارية والمصاريف التسويقية.'
                WHEN t.industry_type = 'contracting' THEN 'دليل حسابات متكامل للمقاولين يدعم مشاريع تحت التنفيذ ومقاولي الباطن والدفعات المقدمة ومصاريف المواقع.'
                WHEN t.industry_type = 'ecommerce' THEN 'دليل حسابات متطور يدعم تسويات بوابات الدفع، شركات الشحن، مصاريف التوصيل وعمولات المنصات.'
                WHEN t.industry_type = 'restaurant' THEN 'دليل حسابات مخصص للأغذية والمطاعم والمقاهي مع مخزون المواد الغذائية وعمولات تطبيقات التوصيل.'
                WHEN t.industry_type = 'simple_establishment' THEN 'دليل حسابات مبسط جداً مصمم للمؤسسات والأنشطة الصغيرة مع حساب المسحوبات الشخصية.'
                ELSE ''
            END,
            'accounts_count', count_val
        )
    ) INTO v_result
    FROM (
        SELECT industry_type, count(*) as count_val
        FROM public.coa_templates
        GROUP BY industry_type
    ) t;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- Grant execution to authenticated users
REVOKE ALL ON FUNCTION public.get_available_coa_templates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_coa_templates() TO authenticated;
