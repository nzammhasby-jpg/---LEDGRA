-- LEDGRA - Database Synchronization, Ambiguity Resolution, and RPC Hardening
-- Migration: 20260710000001_database_sync_and_rpc_hardening.sql

BEGIN;

-- ==========================================================
-- 1. FIX COA_TEMPLATES TABLE & INSURE DATA EXISTENCE
-- ==========================================================

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

CREATE INDEX IF NOT EXISTS coa_templates_industry_code_idx ON public.coa_templates (industry_type, code);
CREATE INDEX IF NOT EXISTS coa_templates_industry_parent_idx ON public.coa_templates (industry_type, parent_code);

-- Enable RLS and establish Read-Only access for authenticated users
ALTER TABLE public.coa_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select coa_templates" ON public.coa_templates;
CREATE POLICY "Select coa_templates" ON public.coa_templates
    FOR SELECT TO authenticated USING (true);

-- Seed core templates safely (general_trading and services)
INSERT INTO public.coa_templates (industry_type, code, name_ar, name_en, classification, nature, parent_code, allow_direct_posting, is_system, sort_order) VALUES
-- GENERAL TRADING
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
('general_trading', '52', 'المصروفات التشغيلية والإدارية العامة', 'Operating Expenses', 'expenses', 'debit', '5', false, false, 520),
('general_trading', '521', 'المصروفات العمومية والرواتب والأجور', 'General G&A Expense', 'expenses', 'debit', '52', false, false, 521),
('general_trading', '5211', 'مصروفات الرواتب والأجور الأساسية والمنافع', 'Salaries Expense', 'expenses', 'debit', '521', true, false, 5211),

-- SERVICES
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
('services', '4112', 'مبيعات منتجات وسلع المنشأة المعترف بها', 'Product Sales Account', 'revenue', 'credit', '411', true, true, 4112),
('services', '4113', 'إيرادات الخدمات والاستشارات الفنية والمهنية', 'Service Sales Account', 'revenue', 'credit', '411', true, true, 4113),
('services', '5', 'المصروفات وتكلفة المبيعات', 'Expenses & COGS', 'expenses', 'debit', NULL, false, true, 500),
('services', '52', 'المصروفات التشغيلية والإدارية العامة', 'Operating Expenses', 'expenses', 'debit', '5', false, false, 520),
('services', '521', 'المصروفات العمومية والرواتب والأجور', 'General G&A Expense', 'expenses', 'debit', '52', false, false, 521),
('services', '5211', 'مصروفات الرواتب والأجور الأساسية والمنافع', 'Salaries Expense', 'expenses', 'debit', '521', true, false, 5211)
ON CONFLICT (industry_type, code) DO NOTHING;


-- ==========================================================
-- 2. CREATE / OVERWRITE SEED_INDUSTRY_CHART_OF_ACCOUNTS
-- ==========================================================

CREATE OR REPLACE FUNCTION public.seed_industry_chart_of_accounts(
    p_organization_id uuid,
    p_industry_type text DEFAULT 'general_trading'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec record;
    v_inserted_count integer := 0;
    v_new_id uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(p_organization_id::text));

    -- Verify templates exist
    IF NOT EXISTS (
        SELECT 1 FROM public.coa_templates 
        WHERE industry_type = p_industry_type
    ) THEN
        p_industry_type := 'general_trading';
    END IF;

    -- Insert accounts ordered by length(code) so parents are inserted before children
    FOR v_rec IN 
        SELECT code, name_ar, name_en, classification, nature, parent_code, allow_direct_posting, is_system, sort_order
        FROM public.coa_templates
        WHERE industry_type = p_industry_type
        ORDER BY length(code) ASC, code ASC
    LOOP
        DECLARE
            v_parent_id uuid := NULL;
        BEGIN
            IF v_rec.parent_code IS NOT NULL THEN
                SELECT id INTO v_parent_id 
                FROM public.accounts 
                WHERE organization_id = p_organization_id AND code = v_rec.parent_code;
            END IF;

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
                p_organization_id,
                v_rec.code,
                v_rec.name_ar,
                v_rec.name_en,
                v_rec.classification,
                v_rec.nature,
                v_parent_id,
                v_rec.allow_direct_posting,
                v_rec.is_system,
                'تم التأسيس التلقائي للنموذج: ' || p_industry_type
            ) ON CONFLICT (organization_id, code) DO NOTHING
            RETURNING id INTO v_new_id;

            IF v_new_id IS NOT NULL THEN
                v_inserted_count := v_inserted_count + 1;
            END IF;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'inserted_accounts', v_inserted_count,
        'industry_type', p_industry_type
    );
END;
$$;


-- ==========================================================
-- 3. ENSURE_DEFAULT_CHART_OF_ACCOUNTS HARDENING & FALLBACKS
-- ==========================================================

CREATE OR REPLACE FUNCTION public.ensure_default_chart_of_accounts(
    p_organization_id uuid,
    p_industry_type text DEFAULT 'general_trading'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_already_init boolean;
    v_is_accounts_exist boolean;
    v_inserted_count integer := 0;
    
    v_rec record;
    v_new_id uuid;
    
    -- Settings mapping variables
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
    
    v_templates_exist boolean := false;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(p_organization_id::text));

    -- Check if any accounts already exist
    SELECT EXISTS (
        SELECT 1 FROM public.accounts 
        WHERE organization_id = p_organization_id
    ) INTO v_is_accounts_exist;

    -- 1. Check if templates table exists and has rows for this industry
    IF to_regclass('public.coa_templates') IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.coa_templates 
            WHERE industry_type = p_industry_type
        ) INTO v_templates_exist;
    END IF;

    -- Fallback cleaner if p_industry_type is totally invalid
    IF NOT v_templates_exist AND to_regclass('public.coa_templates') IS NOT NULL THEN
        p_industry_type := 'general_trading';
        SELECT EXISTS (
            SELECT 1 FROM public.coa_templates 
            WHERE industry_type = p_industry_type
        ) INTO v_templates_exist;
    END IF;

    -- If we have templates, run the seeding loop
    IF v_templates_exist THEN
        v_sales_code := '4111';
        v_service_sales_code := NULL;
        v_inventory_code := NULL;
        v_cogs_code := NULL;

        IF p_industry_type = 'general_trading' THEN
            v_inventory_code := '1131';
            v_cogs_code := '5111';
        ELSIF p_industry_type = 'services' THEN
            v_sales_code := '4112';
            v_service_sales_code := '4113';
        ELSIF p_industry_type = 'ecommerce' THEN
            v_sales_code := '4111';
            v_service_sales_code := '4112';
            v_inventory_code := '1131';
            v_cogs_code := '5111';
        ELSIF p_industry_type = 'restaurant' THEN
            v_sales_code := '4111';
            v_service_sales_code := '4112';
            v_inventory_code := '1131';
            v_cogs_code := '5111';
        END IF;

        FOR v_rec IN 
            SELECT code, name_ar, name_en, classification, nature, parent_code, allow_direct_posting, is_system, sort_order
            FROM public.coa_templates
            WHERE industry_type = p_industry_type
            ORDER BY length(code) ASC, code ASC
        LOOP
            DECLARE
                v_parent_id uuid := NULL;
            BEGIN
                IF v_rec.parent_code IS NOT NULL THEN
                    SELECT id INTO v_parent_id 
                    FROM public.accounts 
                    WHERE organization_id = p_organization_id AND code = v_rec.parent_code;
                END IF;

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
                    p_organization_id,
                    v_rec.code,
                    v_rec.name_ar,
                    v_rec.name_en,
                    v_rec.classification,
                    v_rec.nature,
                    v_parent_id,
                    v_rec.allow_direct_posting,
                    v_rec.is_system,
                    'تم التأسيس تلقائيًا لضمان سلامة الهيكل المالي: ' || p_industry_type
                ) ON CONFLICT (organization_id, code) DO NOTHING
                RETURNING id INTO v_new_id;

                IF v_new_id IS NOT NULL THEN
                    v_inserted_count := v_inserted_count + 1;
                END IF;
            END;
        END LOOP;
    ELSE
        -- 2. Fallback to public.seed_default_chart_of_accounts if coa_templates is completely absent
        IF NOT v_is_accounts_exist THEN
            PERFORM public.seed_default_chart_of_accounts(p_organization_id);
            v_inserted_count := 1; -- Indicate we performed the fallback
        END IF;
    END IF;

    -- If no accounts were inserted and some accounts existed prior, it's already initialized
    IF v_inserted_count = 0 AND v_is_accounts_exist THEN
        RETURN jsonb_build_object(
            'status', 'already_initialized',
            'message', 'شجرة الحسابات موجودة بالفعل ولا تحتاج إلى إنشاء جديد.'
        );
    END IF;

    -- Resolve ID references for settings mapping
    SELECT id INTO v_cash_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_cash_code;
    SELECT id INTO v_bank_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_bank_code;
    SELECT id INTO v_receivables_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_receivables_code;
    SELECT id INTO v_payables_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_payables_code;
    SELECT id INTO v_tax_output_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_tax_output_code;
    SELECT id INTO v_tax_input_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_tax_input_code;
    SELECT id INTO v_retained_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_retained_code;
    
    IF v_sales_code IS NOT NULL THEN
        SELECT id INTO v_sales_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_sales_code;
    END IF;
    
    IF v_service_sales_code IS NOT NULL THEN
        SELECT id INTO v_service_sales_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_service_sales_code;
    END IF;
    
    IF v_inventory_code IS NOT NULL THEN
        SELECT id INTO v_inventory_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_inventory_code;
    END IF;
    
    IF v_cogs_code IS NOT NULL THEN
        SELECT id INTO v_cogs_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_cogs_code;
    END IF;

    -- Upsert accounting settings mapping safely without replacing user-configured fields
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
        p_organization_id,
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
        default_cash_account_id = COALESCE(accounting_settings.default_cash_account_id, EXCLUDED.default_cash_account_id),
        default_bank_account_id = COALESCE(accounting_settings.default_bank_account_id, EXCLUDED.default_bank_account_id),
        default_receivables_account_id = COALESCE(accounting_settings.default_receivables_account_id, EXCLUDED.default_receivables_account_id),
        default_inventory_account_id = COALESCE(accounting_settings.default_inventory_account_id, EXCLUDED.default_inventory_account_id),
        default_tax_input_account_id = COALESCE(accounting_settings.default_tax_input_account_id, EXCLUDED.default_tax_input_account_id),
        default_payables_account_id = COALESCE(accounting_settings.default_payables_account_id, EXCLUDED.default_payables_account_id),
        default_tax_output_account_id = COALESCE(accounting_settings.default_tax_output_account_id, EXCLUDED.default_tax_output_account_id),
        default_retained_earnings_account_id = COALESCE(accounting_settings.default_retained_earnings_account_id, EXCLUDED.default_retained_earnings_account_id),
        default_sales_account_id = COALESCE(accounting_settings.default_sales_account_id, EXCLUDED.default_sales_account_id),
        default_service_sales_account_id = COALESCE(accounting_settings.default_service_sales_account_id, EXCLUDED.default_service_sales_account_id),
        default_cogs_account_id = COALESCE(accounting_settings.default_cogs_account_id, EXCLUDED.default_cogs_account_id),
        coa_initialized_at = COALESCE(accounting_settings.coa_initialized_at, EXCLUDED.coa_initialized_at),
        updated_at = timezone('utc'::text, now());

    RETURN jsonb_build_object(
        'status', 'success',
        'inserted_accounts', v_inserted_count,
        'industry_type', p_industry_type
    );
END;
$$;


-- ==========================================================
-- 4. RESOLVE "IS_ACTIVE" AMBIGUITY IN LIST_CASH_BANK_ACCOUNTS
-- ==========================================================

CREATE OR REPLACE FUNCTION public.list_cash_bank_accounts(
    p_organization_id uuid
)
RETURNS TABLE (
    id uuid,
    type text,
    name text,
    bank_name text,
    iban text,
    account_number text,
    currency_code text,
    opening_balance numeric,
    current_balance numeric,
    is_default boolean,
    is_active boolean,
    notes text,
    account_id uuid,
    account_code text,
    account_name_ar text,
    account_name_en text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role text;
BEGIN
    -- Ensure user is logged in
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لإتمام العملية.';
    END IF;

    -- Verify active member role with table alias to prevent "is_active" ambiguity
    SELECT om.role INTO v_role
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.profile_id = auth.uid()
      AND COALESCE(om.is_active, true) = true;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'غير مصرح لك باستعراض الصناديق والحسابات البنكية الخاصة بهذه المنشأة.';
    END IF;

    IF v_role = 'sales' THEN
        RAISE EXCEPTION 'غير مصرح لك باستعراض الصناديق والحسابات البنكية.';
    END IF;

    IF v_role NOT IN ('owner', 'admin', 'accountant', 'viewer') THEN
        RAISE EXCEPTION 'غير مصرح لك باستعراض الصناديق والحسابات البنكية.';
    END IF;

    RETURN QUERY
    SELECT 
        cba.id,
        cba.type,
        cba.name,
        cba.bank_name,
        cba.iban,
        cba.account_number,
        cba.currency_code,
        cba.opening_balance::numeric,
        cba.current_balance::numeric,
        cba.is_default,
        cba.is_active,
        cba.notes,
        cba.account_id,
        acc.code::text AS account_code,
        acc.name_ar::text AS account_name_ar,
        acc.name_en::text AS account_name_en
    FROM public.cash_bank_accounts cba
    JOIN public.accounts acc ON cba.account_id = acc.id
    WHERE cba.organization_id = p_organization_id
    ORDER BY cba.type DESC, cba.is_default DESC, cba.name ASC;
END;
$$;


-- ==========================================================
-- 5. RESOLVE "IS_ACTIVE" AMBIGUITY IN LIST_CASH_BANK_TRANSFERS
-- ==========================================================

CREATE OR REPLACE FUNCTION public.list_cash_bank_transfers(
  p_organization_id uuid,
  p_status text DEFAULT NULL,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  transfer_number text,
  transfer_date date,
  from_cash_bank_account_id uuid,
  from_account_name text,
  from_account_type text,
  from_bank_name text,
  to_cash_bank_account_id uuid,
  to_account_name text,
  to_account_type text,
  to_bank_name text,
  amount numeric,
  currency_code text,
  description text,
  reference_number text,
  status text,
  journal_entry_id uuid,
  approved_by uuid,
  approved_at timestamp with time zone,
  cancelled_by uuid,
  cancelled_at timestamp with time zone,
  cancel_reason text,
  created_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Auth and Privilege check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Verify active member role with table alias to prevent ambiguity
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = p_organization_id
          AND om.profile_id = auth.uid()
          AND om.role IN ('owner', 'admin', 'accountant', 'viewer')
          AND COALESCE(om.is_active, true) = true
    ) THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية متاحة فقط للمالك، المدير، المحاسب، والمشاهد النشطين.';
    END IF;

    RETURN QUERY
    SELECT 
        t.id,
        t.transfer_number,
        t.transfer_date,
        t.from_cash_bank_account_id,
        f.name AS from_account_name,
        f.type AS from_account_type,
        f.bank_name AS from_bank_name,
        t.to_cash_bank_account_id,
        o.name AS to_account_name,
        o.type AS to_account_type,
        o.bank_name AS to_bank_name,
        t.amount,
        t.currency_code,
        t.description,
        t.reference_number,
        t.status,
        t.journal_entry_id,
        t.approved_by,
        t.approved_at,
        t.cancelled_by,
        t.cancelled_at,
        t.cancel_reason,
        t.created_by,
        t.created_at,
        t.updated_at
    FROM public.cash_bank_transfers t
    JOIN public.cash_bank_accounts f ON t.from_cash_bank_account_id = f.id
    JOIN public.cash_bank_accounts o ON t.to_cash_bank_account_id = o.id
    WHERE t.organization_id = p_organization_id
      AND (p_status IS NULL OR t.status = p_status)
      AND (p_from_date IS NULL OR t.transfer_date >= p_from_date)
      AND (p_to_date IS NULL OR t.transfer_date <= p_to_date)
    ORDER BY t.transfer_date DESC, t.created_at DESC;
END;
$$;


-- ==========================================================
-- 6. RESOLVE "EXPIRES_AT" AMBIGUITY IN CREATE_ORGANIZATION_INVITATION
-- ==========================================================

CREATE OR REPLACE FUNCTION public.create_organization_invitation(
  p_org_id uuid,
  p_email text,
  p_role text
)
RETURNS TABLE (
  invitation_id uuid,
  raw_token text,
  expires_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamp with time zone;
  v_invitation_id uuid;
  v_user_id uuid;
BEGIN
  -- Ensure user is logged in
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لتوجيه الدعوات';
  END IF;

  -- Check if owner/admin
  IF NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION 'غير مصرح لك بإصدار دعوات لهذه المنشأة';
  END IF;

  -- Validate role
  IF p_role NOT IN ('admin', 'accountant', 'sales', 'viewer') THEN
    RAISE EXCEPTION 'دور غير صالح للدعوة. الأدوار المتاحة: admin, accountant, sales, viewer';
  END IF;

  -- Validate email
  IF p_email IS NULL OR TRIM(p_email) = '' OR p_email NOT LIKE '%@%' THEN
    RAISE EXCEPTION 'الرجاء إدخال بريد إلكتروني صحيح';
  END IF;

  p_email := LOWER(TRIM(p_email));

  -- Update expired invitations with prefix "oi" to prevent ambiguity
  UPDATE public.organization_invitations oi
  SET status = 'expired', updated_at = now()
  WHERE oi.organization_id = p_org_id
    AND LOWER(oi.email) = p_email
    AND oi.status = 'pending'
    AND oi.expires_at <= now();

  -- Prevent duplicate pending with prefix "oi"
  IF EXISTS (
    SELECT 1 FROM public.organization_invitations oi
    WHERE oi.organization_id = p_org_id 
      AND LOWER(oi.email) = p_email 
      AND oi.status = 'pending'
      AND oi.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'هناك دعوة معلقة بالفعل لنفس البريد الإلكتروني في هذه المنشأة ولم تنته بعد';
  END IF;

  -- Check if already member
  IF EXISTS (
    SELECT 1
    FROM public.organization_members m
    JOIN auth.users u ON m.profile_id = u.id
    WHERE m.organization_id = p_org_id
      AND lower(u.email) = p_email
      AND COALESCE(m.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'هذا المستخدم عضو بالفعل في هذه المنشأة';
  END IF;

  -- Generate raw token and hash
  v_raw_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_token_hash := md5(v_raw_token);
  v_expires_at := now() + interval '7 days';

  -- Insert invitation
  INSERT INTO public.organization_invitations (
    organization_id,
    email,
    role,
    status,
    token_hash,
    invited_by,
    expires_at
  ) VALUES (
    p_org_id,
    p_email,
    p_role,
    'pending',
    v_token_hash,
    v_user_id,
    v_expires_at
  )
  RETURNING id INTO v_invitation_id;

  RETURN QUERY SELECT v_invitation_id, v_raw_token, v_expires_at;
END;
$$;


-- ==========================================================
-- 7. RESOLVE FINANCIAL REPORTS ROBUSTNESS & SECURITY
-- ==========================================================

CREATE OR REPLACE FUNCTION public.can_view_financial_reports(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members om
        WHERE om.organization_id = p_org_id
          AND om.profile_id = auth.uid()
          AND om.role IN ('owner', 'admin', 'accountant', 'viewer')
          AND COALESCE(om.is_active, true) = true
    );
$$;

CREATE OR REPLACE FUNCTION public.get_income_statement_advanced(
  p_org_id uuid,
  p_date_from date,
  p_date_to date,
  p_exclude_closing_entries boolean default true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_revenue numeric(15,2) := 0.00;
    v_cogs numeric(15,2) := 0.00;
    v_expenses numeric(15,2) := 0.00;
    v_gross_profit numeric(15,2) := 0.00;
    v_net_income numeric(15,2) := 0.00;
    v_revenue_array jsonb := '[]'::jsonb;
    v_cogs_array jsonb := '[]'::jsonb;
    v_expense_array jsonb := '[]'::jsonb;
BEGIN
    -- Auth role verification
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_view_financial_reports(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.';
    END IF;

    -- Aggregate revenues, COGS and general expenses
    -- Exclude closing entries if p_exclude_closing_entries is true
    WITH account_sums AS (
        SELECT 
            a.id,
            a.code,
            a.name_ar,
            a.name_en,
            a.classification,
            CASE 
                WHEN a.code LIKE '511%' 
                     OR a.id = (SELECT s.default_cogs_account_id FROM public.accounting_settings s WHERE s.organization_id = p_org_id LIMIT 1)
                     OR a.id IN (SELECT distinct i.cogs_account_id FROM public.items i WHERE i.organization_id = p_org_id AND i.cogs_account_id IS NOT NULL)
                THEN true 
                ELSE false 
            END AS is_cogs,
            COALESCE(SUM(l.debit), 0.00) AS total_debit,
            COALESCE(SUM(l.credit), 0.00) AS total_credit
        FROM public.accounts a
        JOIN public.journal_entry_lines l ON l.account_id = a.id AND l.organization_id = p_org_id
        JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
        WHERE a.organization_id = p_org_id
          AND a.classification IN ('revenue', 'expenses')
          AND je.status = 'posted'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
          AND (
              NOT p_exclude_closing_entries 
              OR je.reference IS NULL 
              OR NOT (je.reference LIKE 'YEAR-CLOSE%')
          )
        GROUP BY a.id, a.code, a.name_ar, a.name_en, a.classification
    ),
    calculated_amounts AS (
        SELECT 
            id,
            code,
            name_ar,
            name_en,
            classification,
            is_cogs,
            CASE 
                WHEN classification = 'revenue' THEN (total_credit - total_debit)
                ELSE (total_debit - total_credit)
            END AS net_amount
        FROM account_sums
    )
    SELECT
        COALESCE(SUM(CASE WHEN classification = 'revenue' THEN net_amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN classification = 'expenses' AND is_cogs = true THEN net_amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN classification = 'expenses' AND is_cogs = false THEN net_amount ELSE 0.00 END), 0.00)
    INTO v_revenue, v_cogs, v_expenses
    FROM calculated_amounts;

    v_gross_profit := v_revenue - v_cogs;
    v_net_income := v_gross_profit - v_expenses;

    -- 1. Build revenue accounts array
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'account_id', id,
        'code', code,
        'name_ar', name_ar,
        'name_en', name_en,
        'amount', net_amount
    ) ORDER BY code ASC), '[]'::jsonb)
    INTO v_revenue_array
    FROM (
        SELECT id, code, name_ar, name_en, 
               CASE WHEN classification = 'revenue' THEN (total_credit - total_debit) ELSE 0.00 END as net_amount
        FROM (
            SELECT 
                a.id,
                a.code,
                a.name_ar,
                a.name_en,
                a.classification,
                CASE 
                    WHEN a.code LIKE '511%' 
                         OR a.id = (SELECT s.default_cogs_account_id FROM public.accounting_settings s WHERE s.organization_id = p_org_id LIMIT 1)
                         OR a.id IN (SELECT distinct i.cogs_account_id FROM public.items i WHERE i.organization_id = p_org_id AND i.cogs_account_id IS NOT NULL)
                    THEN true 
                    ELSE false 
                END AS is_cogs,
                COALESCE(SUM(l.debit), 0.00) AS total_debit,
                COALESCE(SUM(l.credit), 0.00) AS total_credit
            FROM public.accounts a
            JOIN public.journal_entry_lines l ON l.account_id = a.id AND l.organization_id = p_org_id
            JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
            WHERE a.organization_id = p_org_id
              AND a.classification = 'revenue'
              AND je.status = 'posted'
              AND je.entry_date >= p_date_from
              AND je.entry_date <= p_date_to
              AND (
                  NOT p_exclude_closing_entries 
                  OR je.reference IS NULL 
                  OR NOT (je.reference LIKE 'YEAR-CLOSE%')
              )
            GROUP BY a.id, a.code, a.name_ar, a.name_en, a.classification
        ) x
        WHERE (total_credit - total_debit) <> 0.00
    ) sub;

    -- 2. Build COGS accounts array
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'account_id', id,
        'code', code,
        'name_ar', name_ar,
        'name_en', name_en,
        'amount', net_amount
    ) ORDER BY code ASC), '[]'::jsonb)
    INTO v_cogs_array
    FROM (
        SELECT id, code, name_ar, name_en, 
               (total_debit - total_credit) as net_amount
        FROM (
            SELECT 
                a.id,
                a.code,
                a.name_ar,
                a.name_en,
                a.classification,
                COALESCE(SUM(l.debit), 0.00) AS total_debit,
                COALESCE(SUM(l.credit), 0.00) AS total_credit
            FROM public.accounts a
            JOIN public.journal_entry_lines l ON l.account_id = a.id AND l.organization_id = p_org_id
            JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
            WHERE a.organization_id = p_org_id
              AND a.classification = 'expenses'
              AND (
                  a.code LIKE '511%' 
                  OR a.id = (SELECT s.default_cogs_account_id FROM public.accounting_settings s WHERE s.organization_id = p_org_id LIMIT 1)
                  OR a.id IN (SELECT distinct i.cogs_account_id FROM public.items i WHERE i.organization_id = p_org_id AND i.cogs_account_id IS NOT NULL)
              )
              AND je.status = 'posted'
              AND je.entry_date >= p_date_from
              AND je.entry_date <= p_date_to
              AND (
                  NOT p_exclude_closing_entries 
                  OR je.reference IS NULL 
                  OR NOT (je.reference LIKE 'YEAR-CLOSE%')
              )
            GROUP BY a.id, a.code, a.name_ar, a.name_en, a.classification
        ) x
        WHERE (total_debit - total_credit) <> 0.00
    ) sub;

    -- 3. Build general expense accounts array
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'account_id', id,
        'code', code,
        'name_ar', name_ar,
        'name_en', name_en,
        'amount', net_amount
    ) ORDER BY code ASC), '[]'::jsonb)
    INTO v_expense_array
    FROM (
        SELECT id, code, name_ar, name_en, 
               (total_debit - total_credit) as net_amount
        FROM (
            SELECT 
                a.id,
                a.code,
                a.name_ar,
                a.name_en,
                a.classification,
                COALESCE(SUM(l.debit), 0.00) AS total_debit,
                COALESCE(SUM(l.credit), 0.00) AS total_credit
            FROM public.accounts a
            JOIN public.journal_entry_lines l ON l.account_id = a.id AND l.organization_id = p_org_id
            JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
            WHERE a.organization_id = p_org_id
              AND a.classification = 'expenses'
              AND NOT (
                  a.code LIKE '511%' 
                  OR a.id = (SELECT s.default_cogs_account_id FROM public.accounting_settings s WHERE s.organization_id = p_org_id LIMIT 1)
                  OR a.id IN (SELECT distinct i.cogs_account_id FROM public.items i WHERE i.organization_id = p_org_id AND i.cogs_account_id IS NOT NULL)
              )
              AND je.status = 'posted'
              AND je.entry_date >= p_date_from
              AND je.entry_date <= p_date_to
              AND (
                  NOT p_exclude_closing_entries 
                  OR je.reference IS NULL 
                  OR NOT (je.reference LIKE 'YEAR-CLOSE%')
              )
            GROUP BY a.id, a.code, a.name_ar, a.name_en, a.classification
        ) x
        WHERE (total_debit - total_credit) <> 0.00
    ) sub;

    RETURN jsonb_build_object(
        'date_from', p_date_from,
        'date_to', p_date_to,
        'exclude_closing_entries', p_exclude_closing_entries,
        'total_revenue', v_revenue,
        'total_cogs', v_cogs,
        'gross_profit', v_gross_profit,
        'total_operating_expenses', v_expenses,
        'total_expenses', v_cogs + v_expenses,
        'net_income', v_net_income,
        'revenue_accounts', v_revenue_array,
        'cogs_accounts', v_cogs_array,
        'expense_accounts', v_expense_array
    );
END;
$$;


-- ==========================================================
-- 8. GRANT PRIVILEGES & RELOAD SCHEMA
-- ==========================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coa_templates TO authenticated;

GRANT EXECUTE ON FUNCTION public.seed_industry_chart_of_accounts(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_default_chart_of_accounts(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_cash_bank_accounts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_cash_bank_transfers(uuid, text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_invitation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_financial_reports(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_income_statement_advanced(uuid, date, date, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
