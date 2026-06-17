-- ==========================================================
-- LEDGRA PHASE 2: ATOMIC & SECURE ACCOUNTING MIGRATION
-- ==========================================================

BEGIN;

-- 1. EXTEND PRIVILEGED MEMBERS VIEW FUNCTION
CREATE OR REPLACE FUNCTION public.is_org_privileged_member(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_organization_id
          AND profile_id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant')
    );
$$;

-- Secure execution grants
REVOKE ALL ON FUNCTION public.is_org_privileged_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_privileged_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_org_privileged_member(uuid) TO authenticated;


-- 2. CREATE TABLE: fiscal_years
CREATE TABLE IF NOT EXISTS public.fiscal_years (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status text NOT NULL CHECK (status IN ('draft', 'open', 'closed')) DEFAULT 'draft',
    is_current boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT fiscal_years_dates_check CHECK (start_date < end_date)
);

-- Ensure year names are unique per organization
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_years_org_name_unique_idx ON public.fiscal_years (organization_id, name);

-- Enforce at most ONE current fiscal year per organization using a partial index
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_years_one_current_idx ON public.fiscal_years (organization_id) WHERE (is_current = true);


-- 3. CREATE TABLE: fiscal_periods
CREATE TABLE IF NOT EXISTS public.fiscal_periods (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    fiscal_year_id uuid REFERENCES public.fiscal_years(id) ON DELETE CASCADE NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    period_num integer NOT NULL,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status text NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fiscal_periods_dates_check CHECK (start_date <= end_date),
    CONSTRAINT fiscal_periods_num_check CHECK (period_num >= 1 AND period_num <= 15)
);

-- Ensure period index is unique within a fiscal year
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_periods_year_num_unique_idx ON public.fiscal_periods (fiscal_year_id, period_num);


-- 4. CREATE TABLE: accounts
CREATE TABLE IF NOT EXISTS public.accounts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    code text NOT NULL,
    name_ar text NOT NULL,
    name_en text,
    classification text NOT NULL CHECK (classification IN ('assets', 'liabilities', 'equity', 'revenue', 'expenses')),
    parent_id uuid REFERENCES public.accounts(id) ON DELETE RESTRICT,
    level integer NOT NULL DEFAULT 1,
    nature text NOT NULL CHECK (nature IN ('debit', 'credit')),
    allow_direct_posting boolean NOT NULL DEFAULT true,
    is_active boolean NOT NULL DEFAULT true,
    is_system boolean NOT NULL DEFAULT false,
    description text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT accounts_parent_self_check CHECK (parent_id <> id)
);

-- Ensure account code is unique per organization
CREATE UNIQUE INDEX IF NOT EXISTS accounts_code_org_unique_idx ON public.accounts (organization_id, code);


-- 5. CREATE TABLE: accounting_settings
CREATE TABLE IF NOT EXISTS public.accounting_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE NOT NULL,
    default_receivables_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_payables_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_cash_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_bank_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_sales_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_service_sales_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_tax_output_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_tax_input_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_cogs_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_inventory_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_retained_earnings_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ==========================================================
-- 6. SYSTEM PROTECTIONS, RECURSIVE TREE TRIGGERS & VALIDATIONS
-- ==========================================================

-- Trigger to prevent deleting system accounts
CREATE OR REPLACE FUNCTION public.prevent_delete_system_account()
RETURNS trigger AS $$
BEGIN
    IF OLD.is_system THEN
        RAISE EXCEPTION 'لا يمكن حذف الحسابات النظامية المحمية بنظام لِدجرا لدواعي الامتثال المحاسبي.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_delete_system_account ON public.accounts;
CREATE TRIGGER trg_prevent_delete_system_account
    BEFORE DELETE ON public.accounts
    FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_system_account();


-- Core Account Tree validation and auto parent-to-summary promotion trigger
CREATE OR REPLACE FUNCTION public.validation_and_propagate_accounts()
RETURNS trigger AS $$
DECLARE
    v_parent_org uuid;
    v_parent_class text;
    v_parent_nature text;
    v_parent_level integer;
BEGIN
    -- 1. If parent_id is specified, apply validation rules
    IF NEW.parent_id IS NOT NULL THEN
        -- Verify parent account exists and retrieve attributes
        SELECT organization_id, classification, nature, level 
        INTO v_parent_org, v_parent_class, v_parent_nature, v_parent_level
        FROM public.accounts 
        WHERE id = NEW.parent_id;

        IF v_parent_org IS NULL THEN
            RAISE EXCEPTION 'الحساب الأب المحدد غير موجود.';
        END IF;

        IF v_parent_org <> NEW.organization_id THEN
            RAISE EXCEPTION 'لا يمكن ربط حساب أب ينتمي لمنشأة مختلفة.';
        END IF;

        IF v_parent_class <> NEW.classification THEN
            RAISE EXCEPTION 'يجب أن يتطابق تصنيف الحساب الفرعي مع تصنيف الحساب الأب (% <> %).', NEW.classification, v_parent_class;
        END IF;

        IF v_parent_nature <> NEW.nature THEN
            RAISE EXCEPTION 'يجب أن تتطابق طبيعة الحساب الفرعي مع طبيعة الحساب الأب (% <> %).', NEW.nature, v_parent_nature;
        END IF;

        -- niveau calculator: level = parent_level + 1
        NEW.level := v_parent_level + 1;

        -- Auto promote parent to a summary/aggregate account (allow_direct_posting = false)
        UPDATE public.accounts
        SET allow_direct_posting = false
        WHERE id = NEW.parent_id AND allow_direct_posting = true;

    ELSE
        NEW.level := 1;
    END IF;

    -- 2. Prevent circular relationship in tree hierarchy during updates
    IF TG_OP = 'UPDATE' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
        IF NEW.id = NEW.parent_id THEN
            RAISE EXCEPTION 'لا يمكن أن يكون الحساب أبًا لنفسه.';
        END IF;
        
        DECLARE
            v_curr_parent uuid := NEW.parent_id;
        BEGIN
            WHILE v_curr_parent IS NOT NULL LOOP
                IF v_curr_parent = NEW.id THEN
                    RAISE EXCEPTION 'تم اكتشاف علاقة دائرية غير مسموح بها في شجرة الحسابات.';
                END IF;
                SELECT parent_id INTO v_curr_parent FROM public.accounts WHERE id = v_curr_parent;
            END LOOP;
        END;
    END IF;

    -- 3. Prevent turning a summary account (with children) back to a postable account
    IF TG_OP = 'UPDATE' AND NEW.allow_direct_posting = true THEN
        IF EXISTS (SELECT 1 FROM public.accounts WHERE parent_id = NEW.id) THEN
            RAISE EXCEPTION 'لا يمكن تفعيل الترحيل المباشر لحساب تجميعي لديه حسابات فرعية بنظام لِدجرا.';
        END IF;
    END IF;

    -- 4. Rigorous system accounts lock down inside the DB
    IF TG_OP = 'UPDATE' AND OLD.is_system THEN
        IF NEW.is_system = false THEN
            RAISE EXCEPTION 'يُمنع تحويل الحسابات النظامية المحمية إلى حسابات عادية.';
        END IF;

        IF NEW.code IS DISTINCT FROM OLD.code OR
           NEW.classification IS DISTINCT FROM OLD.classification OR
           NEW.nature IS DISTINCT FROM OLD.nature THEN
            RAISE EXCEPTION 'يُمنع تعديل الرمز أو التصنيف أو الطبيعة المحاسبية للحسابات النظامية لضمان سلامة العمليات المالية.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validation_and_propagate_accounts ON public.accounts;
CREATE TRIGGER trg_validation_and_propagate_accounts
    BEFORE INSERT OR UPDATE ON public.accounts
    FOR EACH ROW EXECUTE FUNCTION public.validation_and_propagate_accounts();


-- Trigger to handle updated_at column automatic updates
DROP TRIGGER IF EXISTS update_accounts_updated_at ON public.accounts;
CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON public.accounts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_accounting_settings_updated_at ON public.accounting_settings;
CREATE TRIGGER update_accounting_settings_updated_at
    BEFORE UPDATE ON public.accounting_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ==========================================================
-- 7. ATOMIC CORE SQL FUNCTIONS FOR FINANCIAL OPERATIONS
-- ==========================================================

-- A. ATOMIC FUNCTION: Atomic Fiscal Year Creation + Month-by-month Periods Generation
CREATE OR REPLACE FUNCTION public.create_fiscal_year(
    p_org_id uuid,
    p_name text,
    p_start_date date,
    p_end_date date,
    p_is_current boolean,
    p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_year_id uuid;
    v_curr_start date;
    v_curr_end date;
    v_period_num integer;
BEGIN
    -- 1. Privilege & Authenticated check
    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليس لديك الصلاحية الكافية لإنشاء السنوات المالية للمنشأة.';
    END IF;

    -- 2. Validation Checks
    IF p_start_date >= p_end_date THEN
        RAISE EXCEPTION 'تاريخ بداية السنة المالية يجب أن يكون قبل تاريخ نهايتها.';
    END IF;

    -- Check overlap with any existing fiscal years
    IF EXISTS (
        SELECT 1 FROM public.fiscal_years
        WHERE organization_id = p_org_id
          AND NOT (end_date < p_start_date OR start_date > p_end_date)
    ) THEN
        RAISE EXCEPTION 'تواريخ هذه السنة المالية تتداخل مع فترة أو سنة مالية مسجلة أخرى بالمنشأة.';
    END IF;

    -- Verify Year name uniqueness within organization
    IF EXISTS (
        SELECT 1 FROM public.fiscal_years
        WHERE organization_id = p_org_id AND name = p_name
    ) THEN
        RAISE EXCEPTION 'السنة المالية بهذا الاسم مسجلة بالفعل بالمنشأة.';
    END IF;

    -- 3. Insert Fiscal Year
    INSERT INTO public.fiscal_years (
        organization_id,
        name,
        start_date,
        end_date,
        status,
        is_current,
        created_by
    ) VALUES (
        p_org_id,
        p_name,
        p_start_date,
        p_end_date,
        'draft',
        false, -- start as false, if p_is_current is true we promote atomically below
        p_user_id
    ) RETURNING id INTO v_year_id;

    -- 4. Dynamic Period Generator Context
    v_curr_start := p_start_date;
    v_period_num := 1;

    WHILE v_curr_start <= p_end_date AND v_period_num <= 15 LOOP
        -- Calculate end of the calendar month
        v_curr_end := (date_trunc('month', v_curr_start) + interval '1 month' - interval '1 day')::date;
        
        -- Cap to end_date of Year
        IF v_curr_end >= p_end_date THEN
            v_curr_end := p_end_date;
        END IF;

        -- Insert Period
        INSERT INTO public.fiscal_periods (
            fiscal_year_id,
            organization_id,
            period_num,
            name,
            start_date,
            end_date,
            status
        ) VALUES (
            v_year_id,
            p_org_id,
            v_period_num,
            'F' || TO_CHAR(v_period_num, 'FM00'),
            v_curr_start,
            v_curr_end,
            'open'
        );

        EXIT WHEN v_curr_end = p_end_date;
        v_curr_start := v_curr_end + 1;
        v_period_num := v_period_num + 1;
    END LOOP;

    -- 5. Handle Is Current atomic operation inside the database
    IF p_is_current THEN
        -- Reset previous current years
        UPDATE public.fiscal_years
        SET is_current = false
        WHERE organization_id = p_org_id AND is_current = true;

        -- Set new one as current, promote status to open automatically
        UPDATE public.fiscal_years
        SET is_current = true, status = 'open'
        WHERE id = v_year_id;
    END IF;

    RETURN v_year_id;
END;
$$;


-- B. ATOMIC FUNCTION: Set Current Fiscal Year Atomic Switcher
CREATE OR REPLACE FUNCTION public.set_current_fiscal_year(
    p_org_id uuid,
    p_year_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Privilege check
    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليس لديك الصلاحية الكافية لتبديل السنة المالية النشطة.';
    END IF;

    -- 2. Year exists in this org check
    IF NOT EXISTS (
        SELECT 1 FROM public.fiscal_years 
        WHERE id = p_year_id AND organization_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'السنة المالية المحددة غير موجودة في سجلات هذه المنشأة.';
    END IF;

    -- 3. Atomic atomic switcher transaction
    UPDATE public.fiscal_years
    SET is_current = false
    WHERE organization_id = p_org_id AND is_current = true;

    UPDATE public.fiscal_years
    SET is_current = true, status = 'open'
    WHERE id = p_year_id;
END;
$$;


-- C. ATOMIC FUNCTION: Seed Default Saudi SME Compliant Chart of Accounts with Settings Matched
CREATE OR REPLACE FUNCTION public.seed_default_chart_of_accounts(
    p_org_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_c_count integer;
    
    -- Level 1 ids
    v_id_1 uuid; -- Assets
    v_id_2 uuid; -- Liabilities
    v_id_3 uuid; -- Equity
    v_id_4 uuid; -- Revenue
    v_id_5 uuid; -- Expenses
    
    -- Level 2 ids
    v_id_11 uuid; -- Current Assets
    v_id_12 uuid; -- Non-Current Assets
    
    v_id_21 uuid; -- Current Liabilities
    v_id_22 uuid; -- Non-Current Liabilities
    
    v_id_31 uuid; -- Owner Equity
    
    v_id_41 uuid; -- Direct Revenue
    
    v_id_51 uuid; -- Direct Expense
    v_id_52 uuid; -- General Expenses
    
    -- Level 3 ids
    v_id_111 uuid; -- Cash and equivs
    v_id_112 uuid; -- Receivables
    v_id_113 uuid; -- Inventory
    v_id_114 uuid; -- Prepaid expenses
    v_id_115 uuid; -- VAT Input
    
    v_id_121 uuid; -- Fixed Assets
    
    v_id_211 uuid; -- Payables
    v_id_212 uuid; -- VAT Output
    v_id_213 uuid; -- Accrued Expenses
    
    v_id_311 uuid; -- Capital
    v_id_312 uuid; -- Retained Earnings
    
    v_id_411 uuid; -- Product Sales
    v_id_412 uuid; -- Service Revenues
    
    v_id_511 uuid; -- COGS
    
    -- Level 4 ids
    v_id_1111 uuid; -- Cash on Hand
    v_id_1112 uuid; -- Bank Default
    v_id_1121 uuid; -- Unified Cust
    v_id_1131 uuid; -- Warehouse Inv
    v_id_1141 uuid; -- Prepaid Rent
    v_id_1151 uuid; -- VAT Input Account
    
    v_id_1211 uuid; -- Machinery and Machinery
    v_id_1212 uuid; -- Furniture
    
    v_id_2111 uuid; -- Unified Vend
    v_id_2121 uuid; -- VAT Output Account
    v_id_2131 uuid; -- Accrued salaries
    
    v_id_3111 uuid; -- Paid-in capital
    v_id_3211 uuid; -- Retained earnings accum
    
    v_id_4111 uuid; -- Product Sales Leaf
    v_id_4121 uuid; -- Service Revenue Leaf
    
    v_id_5111 uuid; -- COGS Leaf
    v_id_5211 uuid; -- Salaries Expense
    v_id_5212 uuid; -- Rent Expense
    v_id_5213 uuid; -- Utilities Expense
    v_id_5214 uuid; -- Bank Fees
    v_id_5215 uuid; -- General G&A
    
BEGIN
    -- Idempotency check: "تمنع التكرار حتى لو تم الضغط مرتين أو فتح النظام من أكثر من تبويب"
    SELECT COUNT(*) INTO v_c_count FROM public.accounts WHERE organization_id = p_org_id;
    IF v_c_count > 0 THEN
        RETURN;
    END IF;

    -- Level 1
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1', 'الأصول', 'Assets', 'assets', 'debit', 1, false, true, null) RETURNING id INTO v_id_1;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '2', 'الالتزامات', 'Liabilities', 'liabilities', 'credit', 1, false, true, null) RETURNING id INTO v_id_2;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '3', 'حقوق الملكية', 'Equity', 'equity', 'credit', 1, false, true, null) RETURNING id INTO v_id_3;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '4', 'الإيرادات', 'Revenue', 'revenue', 'credit', 1, false, true, null) RETURNING id INTO v_id_4;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '5', 'المصروفات', 'Expenses', 'expenses', 'debit', 1, false, true, null) RETURNING id INTO v_id_5;

    -- Level 2 under 1 (Assets)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '11', 'الأصول المتداولة', 'Current Assets', 'assets', 'debit', 2, false, true, v_id_1) RETURNING id INTO v_id_11;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '12', 'الأصول غير المتداولة', 'Non-Current Assets', 'assets', 'debit', 2, false, true, v_id_1) RETURNING id INTO v_id_12;

    -- Level 3 under 11 (Current Assets)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '111', 'النقدية وما في حكمها', 'Cash and Cash Equivalents', 'assets', 'debit', 3, false, true, v_id_11) RETURNING id INTO v_id_111;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '112', 'العملاء', 'Accounts Receivable', 'assets', 'debit', 3, false, true, v_id_11) RETURNING id INTO v_id_112;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '113', 'المخزون السلعي', 'Inventory', 'assets', 'debit', 3, false, true, v_id_11) RETURNING id INTO v_id_113;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '114', 'مصروفات مقدمة وأرصدة مدينة', 'Prepaid Expenses', 'assets', 'debit', 3, false, false, v_id_11) RETURNING id INTO v_id_114;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '115', 'ضريبة القيمة المضافة - المدخلات', 'VAT Input Tax', 'assets', 'debit', 3, false, true, v_id_11) RETURNING id INTO v_id_115;

    -- Level 4 under 111 (Cash and Equivalents)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1111', 'أمين الصندوق (الخزينة العامة)', 'Cash on Hand', 'assets', 'debit', 4, true, true, v_id_111) RETURNING id INTO v_id_1111;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1112', 'حساب البنك الجاري الرئيسي', 'Bank Default Account', 'assets', 'debit', 4, true, true, v_id_111) RETURNING id INTO v_id_1112;

    -- Level 4 under 112 (Receivables)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1121', 'حساب ذمم العملاء التجاريين الموحد', 'Trade Accounts Receivable', 'assets', 'debit', 4, true, true, v_id_112) RETURNING id INTO v_id_1121;

    -- Level 4 under 113 (Inventory)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1131', 'مخزون المستودع السلعي العام', 'Finished Goods Inventory', 'assets', 'debit', 4, true, true, v_id_113) RETURNING id INTO v_id_1131;

    -- Level 4 under 114 (Prepaids)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1141', 'مصروفات إيجار مدفوعة مقدماً', 'Prepaid Rent', 'assets', 'debit', 4, true, false, v_id_114) RETURNING id INTO v_id_1141;

    -- Level 4 under 115 (VAT Input)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1151', 'حساب ضريبة مدخلات المشتريات المرفوعة', 'VAT Input Tax Account', 'assets', 'debit', 4, true, true, v_id_115) RETURNING id INTO v_id_1151;

    -- Level 3 under 12 (Non-Current Assets)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '121', 'الأصول الثابتة ملموسة وغير ملموسة', 'Fixed Assets', 'assets', 'debit', 3, false, false, v_id_12) RETURNING id INTO v_id_121;

    -- Level 4 under 121 (Fixed Assets)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1211', 'الآلات والمعدات العينية للأعمال', 'Machinery and Equipment', 'assets', 'debit', 4, true, false, v_id_121) RETURNING id INTO v_id_1211;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1212', 'الأثاث والتجهيزات المكتبية والديكور', 'Furniture and Fixtures', 'assets', 'debit', 4, true, false, v_id_121) RETURNING id INTO v_id_1212;

    -- Level 2 under 2 (Liabilities)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '21', 'الالتزامات المتداولة', 'Current Liabilities', 'liabilities', 'credit', 2, false, true, v_id_2) RETURNING id INTO v_id_21;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '22', 'الالتزامات غير المتداولة (طويلة الأجل)', 'Non-Current Liabilities', 'liabilities', 'credit', 2, false, true, v_id_2) RETURNING id INTO v_id_22;

    -- Level 3 under 21 (Current Liabilities)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '211', 'الموردون والمطالبات', 'Accounts Payable', 'liabilities', 'credit', 3, false, true, v_id_21) RETURNING id INTO v_id_211;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '212', 'ضريبة القيمة المضافة - المخرجات', 'VAT Output Tax', 'liabilities', 'credit', 3, false, true, v_id_21) RETURNING id INTO v_id_212;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '213', 'مصروفات مستحقة ومخصصات قصيرة الأجل', 'Accrued Expenses', 'liabilities', 'credit', 3, false, false, v_id_21) RETURNING id INTO v_id_213;

    -- Level 4 under 211 (Payables)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '2111', 'حساب ذمم الموردين التجاريين الموحد', 'Trade Accounts Payable', 'liabilities', 'credit', 4, true, true, v_id_211) RETURNING id INTO v_id_2111;

    -- Level 4 under 212 (VAT Output)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '2121', 'حساب ضريبة مخرجات المبيعات المستلمة', 'VAT Output Tax Account', 'liabilities', 'credit', 4, true, true, v_id_212) RETURNING id INTO v_id_2121;

    -- Level 4 under 213 (Accrued Expenses)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '2131', 'مصروف الرواتب والأجور المستحقة للموظفين', 'Accrued Salaries', 'liabilities', 'credit', 4, true, false, v_id_213) RETURNING id INTO v_id_2131;

    -- Level 2 under 3 (Equity)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '31', 'رأس المال وحقوق الملكية للمستثمرين', 'Paid-in Capital', 'equity', 'credit', 2, false, true, v_id_3) RETURNING id INTO v_id_31;

    -- Level 3 under 31 (Capital)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '311', 'رأس المال المساهم به والشركاء', 'Share Capital', 'equity', 'credit', 3, false, true, v_id_31) RETURNING id INTO v_id_311;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '312', 'الأرباح المبقاة والمدورة من فترات سابقة', 'Retained Earnings', 'equity', 'credit', 3, false, true, v_id_31) RETURNING id INTO v_id_312;

    -- Level 4 under 311 (Capital)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '3111', 'رأس المال التأسيسي المدفوع والموثق', 'Paid-in Capital Account', 'equity', 'credit', 4, true, true, v_id_311) RETURNING id INTO v_id_3111;

    -- Level 4 under 312 (Retained Earnings)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '3211', 'حساب الأرباح المبقاة والخسائر المتراكمة المعتمد', 'Retained Earnings Account', 'equity', 'credit', 4, true, true, v_id_312) RETURNING id INTO v_id_3211;

    -- Level 2 under 4 (Revenue)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '41', 'إيرادات النشاط والعمليات والمبيعات', 'Sales Revenues', 'revenue', 'credit', 2, false, true, v_id_4) RETURNING id INTO v_id_41;

    -- Level 3 under 41 (Revenues)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '411', 'إيرادات مبيعات السلع البضائعية والمنتجات', 'Product Sales', 'revenue', 'credit', 3, false, true, v_id_41) RETURNING id INTO v_id_411;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '412', 'إيرادات تقديم الخدمات الاستشارية والتشغيلية', 'Service Revenues', 'revenue', 'credit', 3, false, true, v_id_41) RETURNING id INTO v_id_412;

    -- Level 4 under 411 (Product sales leaf)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '4111', 'مبيعات منتجات وسلع المنشأة المعترف بها', 'Product Sales Account', 'revenue', 'credit', 4, true, true, v_id_411) RETURNING id INTO v_id_4111;

    -- Level 4 under 412 (Service revenue leaf)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '4121', 'إيرادات عقود تقديم الخدمات والتشغيل الفني', 'Service Revenue Account', 'revenue', 'credit', 4, true, true, v_id_412) RETURNING id INTO v_id_4121;

    -- Level 2 under 5 (Expenses)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '51', 'تكاليف الإنتاج والخدمات والنشاط', 'Cost of Revenue', 'expenses', 'debit', 2, false, true, v_id_5) RETURNING id INTO v_id_51;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '52', 'المصروفات التشغيلية والإدارية العامة', 'Operating Expenses', 'expenses', 'debit', 2, false, false, v_id_5) RETURNING id INTO v_id_52;

    -- Level 3 under 51 (Revenue costs)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '511', 'تكلفة البضاعة المباعة (التقييم المستمر)', 'Cost of Goods Sold', 'expenses', 'debit', 3, false, true, v_id_51) RETURNING id INTO v_id_511;

    -- Level 4 under 511 (COGS Leaf)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '5111', 'حساب تكلفة البضاعة والسلع المباعة', 'Cost of Goods Sold Account', 'expenses', 'debit', 4, true, true, v_id_511) RETURNING id INTO v_id_5111;

    -- Level 4 under 52 (Operating/General expenses)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '5211', 'مصروفات الرواتب والأجور الأساسية والمنافع', 'Salaries and Wages Expense', 'expenses', 'debit', 4, true, false, v_id_52) RETURNING id INTO v_id_5211;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '5212', 'مصروفات إيجار المقرات والفروع والمعارض', 'Rent Expense', 'expenses', 'debit', 4, true, false, v_id_52) RETURNING id INTO v_id_5212;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '5213', 'مصروفات المرافق والخدمات (كهرباء ومياه وإنترنت)', 'Utilities Expense', 'expenses', 'debit', 4, true, false, v_id_52) RETURNING id INTO v_id_5213;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '5214', 'المصروفات والعمولات البنكية وأجهزة نقاط البيع', 'Bank Fees & Commissions', 'expenses', 'debit', 4, true, false, v_id_52) RETURNING id INTO v_id_5214;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '5215', 'المصروفات الإدارية والمكتبية المتنوعة للشركة', 'General G&A Expense', 'expenses', 'debit', 4, true, false, v_id_52) RETURNING id INTO v_id_5215;

    -- Now seed the default accounting settings mapped perfectly to these leaf accounts
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
        default_cogs_account_id
    ) VALUES (
        p_org_id,
        v_id_1111, -- cash default
        v_id_1112, -- bank default
        v_id_1121, -- receivable default
        v_id_1131, -- inventory default
        v_id_1151, -- tax input default
        v_id_2111, -- payable default
        v_id_2121, -- tax output default
        v_id_3211, -- retained default
        v_id_4111, -- sales default
        v_id_4121, -- service default
        v_id_5111  -- cogs default
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
        updated_at = timezone('utc'::text, now());
END;
$$;


-- ==========================================================
-- 8. ACCOUNTING SETTINGS DATABASE-LEVEL CONSTRAINT VERIFICATION
-- ==========================================================

CREATE OR REPLACE FUNCTION public.validate_accounting_setting_account(
    p_org_id uuid, 
    p_account_id uuid, 
    p_field_name text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_org uuid;
    v_active boolean;
    v_direct boolean;
BEGIN
    IF p_account_id IS NULL THEN
        RETURN;
    END IF;
    
    SELECT organization_id, is_active, allow_direct_posting 
    INTO v_org, v_active, v_direct 
    FROM public.accounts 
    WHERE id = p_account_id;
    
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'الحساب المحدد في % غير موجود.', p_field_name;
    END IF;
    IF v_org <> p_org_id THEN
        RAISE EXCEPTION 'الحساب المحدد في % لا ينتمي لهذه المنشأة.', p_field_name;
    END IF;
    IF NOT v_active THEN
        RAISE EXCEPTION 'الحساب المحدد في % معطل وغير نشط ولا يمكن استخدامه.', p_field_name;
    END IF;
    IF NOT v_direct THEN
        RAISE EXCEPTION 'الحساب المحدد في % غير متاح للترحيل المباشر (حساب رتبة تجميعية).', p_field_name;
    END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.validation_accounting_settings()
RETURNS trigger AS $$
BEGIN
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_receivables_account_id, 'حساب العملاء والذمم المدينة');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_payables_account_id, 'حساب الموردين والذمم الدائنة');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_cash_account_id, 'الخزينة النقدية الافتراضية');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_bank_account_id, 'الحساب البنكي الافتراضي');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_sales_account_id, 'حساب مبيعات المنتجات');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_service_sales_account_id, 'حساب مبيعات الخدمات');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_tax_output_account_id, 'حساب الضريبة المخرجة');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_tax_input_account_id, 'حساب الضريبة المدخلة');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_cogs_account_id, 'حساب تكلفة البضاعة المباعة');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_inventory_account_id, 'حساب المخزون السلعي');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_retained_earnings_account_id, 'حساب الأرباح المبقاة');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validation_accounting_settings ON public.accounting_settings;
CREATE TRIGGER trg_validation_accounting_settings
    BEFORE INSERT OR UPDATE ON public.accounting_settings
    FOR EACH ROW EXECUTE FUNCTION public.validation_accounting_settings();


-- ==========================================================
-- 9. DEFINE RLS POLICIES FOR ALL FOUR TABLES
-- ==========================================================

-- A. fiscal_years Policies
DROP POLICY IF EXISTS "Users can view fiscal years of their organization" ON public.fiscal_years;
DROP POLICY IF EXISTS "Privileged users can manage fiscal years of their organization" ON public.fiscal_years;

DROP POLICY IF EXISTS "Select fiscal_years" ON public.fiscal_years;
DROP POLICY IF EXISTS "Insert fiscal_years" ON public.fiscal_years;
DROP POLICY IF EXISTS "Update fiscal_years" ON public.fiscal_years;
DROP POLICY IF EXISTS "Delete fiscal_years" ON public.fiscal_years;

CREATE POLICY "Select fiscal_years" ON public.fiscal_years FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "Insert fiscal_years" ON public.fiscal_years FOR INSERT TO authenticated WITH CHECK (public.is_org_privileged_member(organization_id));
CREATE POLICY "Update fiscal_years" ON public.fiscal_years FOR UPDATE TO authenticated USING (public.is_org_privileged_member(organization_id));
CREATE POLICY "Delete fiscal_years" ON public.fiscal_years FOR DELETE TO authenticated USING (public.is_org_privileged_member(organization_id));


-- B. fiscal_periods Policies
DROP POLICY IF EXISTS "Users can view fiscal periods of their organization" ON public.fiscal_periods;
DROP POLICY IF EXISTS "Privileged users can manage fiscal periods of their organization" ON public.fiscal_periods;

DROP POLICY IF EXISTS "Select fiscal_periods" ON public.fiscal_periods;
DROP POLICY IF EXISTS "Insert fiscal_periods" ON public.fiscal_periods;
DROP POLICY IF EXISTS "Update fiscal_periods" ON public.fiscal_periods;
DROP POLICY IF EXISTS "Delete fiscal_periods" ON public.fiscal_periods;

CREATE POLICY "Select fiscal_periods" ON public.fiscal_periods FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "Insert fiscal_periods" ON public.fiscal_periods FOR INSERT TO authenticated WITH CHECK (public.is_org_privileged_member(organization_id));
CREATE POLICY "Update fiscal_periods" ON public.fiscal_periods FOR UPDATE TO authenticated USING (public.is_org_privileged_member(organization_id));
CREATE POLICY "Delete fiscal_periods" ON public.fiscal_periods FOR DELETE TO authenticated USING (public.is_org_privileged_member(organization_id));


-- C. accounts Policies
DROP POLICY IF EXISTS "Users can view accounts of their organization" ON public.accounts;
DROP POLICY IF EXISTS "Privileged users can manage accounts of their organization" ON public.accounts;

DROP POLICY IF EXISTS "Select accounts" ON public.accounts;
DROP POLICY IF EXISTS "Insert accounts" ON public.accounts;
DROP POLICY IF EXISTS "Update accounts" ON public.accounts;
DROP POLICY IF EXISTS "Delete accounts" ON public.accounts;

CREATE POLICY "Select accounts" ON public.accounts FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "Insert accounts" ON public.accounts FOR INSERT TO authenticated WITH CHECK (public.is_org_privileged_member(organization_id));
CREATE POLICY "Update accounts" ON public.accounts FOR UPDATE TO authenticated USING (public.is_org_privileged_member(organization_id));
CREATE POLICY "Delete accounts" ON public.accounts FOR DELETE TO authenticated USING (public.is_org_privileged_member(organization_id));


-- D. accounting_settings Policies
DROP POLICY IF EXISTS "Users can view accounting settings of their organization" ON public.accounting_settings;
DROP POLICY IF EXISTS "Privileged users can manage accounting settings of their organization" ON public.accounting_settings;

DROP POLICY IF EXISTS "Select accounting_settings" ON public.accounting_settings;
DROP POLICY IF EXISTS "Insert accounting_settings" ON public.accounting_settings;
DROP POLICY IF EXISTS "Update accounting_settings" ON public.accounting_settings;
DROP POLICY IF EXISTS "Delete accounting_settings" ON public.accounting_settings;

CREATE POLICY "Select accounting_settings" ON public.accounting_settings FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "Insert accounting_settings" ON public.accounting_settings FOR INSERT TO authenticated WITH CHECK (public.is_org_privileged_member(organization_id));
CREATE POLICY "Update accounting_settings" ON public.accounting_settings FOR UPDATE TO authenticated USING (public.is_org_privileged_member(organization_id));
CREATE POLICY "Delete accounting_settings" ON public.accounting_settings FOR DELETE TO authenticated USING (public.is_org_privileged_member(organization_id));


-- 10. RE-RESTRUCTURING ACCESS PERMISSIONS Narrowest
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fiscal_years TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fiscal_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounting_settings TO authenticated;

COMMIT;
