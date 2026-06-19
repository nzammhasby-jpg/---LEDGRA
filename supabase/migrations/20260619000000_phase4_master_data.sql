-- LEDGRA | لِدجرا للمحاسبة السحابية (المرحلة الرابعة - مرحلة البيانات الأساسية المحاسبية) 🚀
-- File: supabase/migrations/20260619000000_phase4_master_data.sql

BEGIN;

-- 1. CREATE TABLE: customers
CREATE TABLE IF NOT EXISTS public.customers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    display_name text,
    customer_type text NOT NULL CHECK (customer_type IN ('individual', 'company', 'government', 'other')),
    tax_number text,
    commercial_registration text,
    email text,
    phone text,
    mobile text,
    city text,
    address text,
    opening_balance numeric(15,2) NOT NULL DEFAULT 0.00,
    opening_balance_type text NOT NULL CHECK (opening_balance_type IN ('debit', 'credit')),
    receivable_account_id uuid NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    created_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT customers_code_org_unique UNIQUE (organization_id, code),
    CONSTRAINT customers_receivable_account_fk FOREIGN KEY (receivable_account_id, organization_id) REFERENCES public.accounts(id, organization_id) ON DELETE RESTRICT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS customers_org_idx ON public.customers (organization_id);
CREATE INDEX IF NOT EXISTS customers_code_idx ON public.customers (organization_id, code);
CREATE INDEX IF NOT EXISTS customers_name_idx ON public.customers (organization_id, name);


-- 2. CREATE TABLE: vendors
CREATE TABLE IF NOT EXISTS public.vendors (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    display_name text,
    vendor_type text NOT NULL CHECK (vendor_type IN ('individual', 'company', 'other')),
    tax_number text,
    commercial_registration text,
    email text,
    phone text,
    mobile text,
    city text,
    address text,
    opening_balance numeric(15,2) NOT NULL DEFAULT 0.00,
    opening_balance_type text NOT NULL CHECK (opening_balance_type IN ('debit', 'credit')),
    payable_account_id uuid NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    created_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT vendors_code_org_unique UNIQUE (organization_id, code),
    CONSTRAINT vendors_payable_account_fk FOREIGN KEY (payable_account_id, organization_id) REFERENCES public.accounts(id, organization_id) ON DELETE RESTRICT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS vendors_org_idx ON public.vendors (organization_id);
CREATE INDEX IF NOT EXISTS vendors_code_idx ON public.vendors (organization_id, code);
CREATE INDEX IF NOT EXISTS vendors_name_idx ON public.vendors (organization_id, name);


-- 3. CREATE TABLE: items (Unified Products & Services)
CREATE TABLE IF NOT EXISTS public.items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    item_type text NOT NULL CHECK (item_type IN ('product', 'service')),
    code text NOT NULL,
    name text NOT NULL,
    description text,
    unit text,
    sku text,
    barcode text,
    selling_price numeric(15,2) NOT NULL DEFAULT 0.00,
    purchase_price numeric(15,2) NOT NULL DEFAULT 0.00,
    tax_rate numeric(5,2) NOT NULL DEFAULT 0.00,
    sales_account_id uuid, -- For products: sales of goods. For service: can be service revenue
    service_revenue_account_id uuid, -- Specifically for service revenue
    inventory_account_id uuid, -- Asset account for stockable products
    cogs_account_id uuid, -- Expense account for cost of goods sold
    expense_account_id uuid, -- For non-stockable products/expenses directly
    is_stockable boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT items_code_org_unique UNIQUE (organization_id, code),
    CONSTRAINT items_sales_account_fk FOREIGN KEY (sales_account_id, organization_id) REFERENCES public.accounts(id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT items_service_revenue_account_fk FOREIGN KEY (service_revenue_account_id, organization_id) REFERENCES public.accounts(id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT items_inventory_account_fk FOREIGN KEY (inventory_account_id, organization_id) REFERENCES public.accounts(id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT items_cogs_account_fk FOREIGN KEY (cogs_account_id, organization_id) REFERENCES public.accounts(id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT items_expense_account_fk FOREIGN KEY (expense_account_id, organization_id) REFERENCES public.accounts(id, organization_id) ON DELETE RESTRICT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS items_org_idx ON public.items (organization_id);
CREATE INDEX IF NOT EXISTS items_code_idx ON public.items (organization_id, code);
CREATE INDEX IF NOT EXISTS items_type_idx ON public.items (organization_id, item_type);


-- 4. TRIGGERS for updated_at tracking
CREATE OR REPLACE FUNCTION public.set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_customers ON public.customers;
CREATE TRIGGER trg_set_updated_at_customers
    BEFORE UPDATE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_vendors ON public.vendors;
CREATE TRIGGER trg_set_updated_at_vendors
    BEFORE UPDATE ON public.vendors
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_items ON public.items;
CREATE TRIGGER trg_set_updated_at_items
    BEFORE UPDATE ON public.items
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_column();


-- 5. RLS AND PROTECTED ACCESS POLICIES
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select customers" ON public.customers;
CREATE POLICY "Select customers" ON public.customers 
    FOR SELECT TO authenticated 
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Select vendors" ON public.vendors;
CREATE POLICY "Select vendors" ON public.vendors 
    FOR SELECT TO authenticated 
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Select items" ON public.items;
CREATE POLICY "Select items" ON public.items 
    FOR SELECT TO authenticated 
    USING (public.is_org_member(organization_id));

-- Restrict general table direct writes (safety first: all modifications secured through RPC functions)
REVOKE ALL ON TABLE public.customers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.vendors FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.items FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.customers TO authenticated;
GRANT SELECT ON TABLE public.vendors TO authenticated;
GRANT SELECT ON TABLE public.items TO authenticated;


-- ==========================================================
-- 6. SECURE BUSINESS LOGIC & VALIDATED API (RPC API)
-- ==========================================================

-- HELPER: Validate single account function
CREATE OR REPLACE FUNCTION public.validate_master_data_account(
    p_account_id uuid,
    p_org_id uuid,
    p_expected_class text,
    p_field_lbl_ar text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_classification text;
    v_allow_posting boolean;
    v_is_active boolean;
BEGIN
    IF p_account_id IS NULL THEN
        RETURN;
    END IF;

    SELECT classification, allow_direct_posting, is_active
    INTO v_classification, v_allow_posting, v_is_active
    FROM public.accounts
    WHERE id = p_account_id AND organization_id = p_org_id;

    IF v_classification IS NULL THEN
        RAISE EXCEPTION 'الحساب المحدد لـ (%) غير موجود أو لا ينتمي لهذه المنشأة.', p_field_lbl_ar;
    END IF;

    IF p_expected_class IS NOT NULL AND v_classification <> p_expected_class THEN
        RAISE EXCEPTION 'الحساب المحدد لـ (%) نوعه غير مطابق. المطلوب حساب من نوع (% %)', p_field_lbl_ar, p_expected_class, p_field_lbl_ar;
    END IF;

    IF v_allow_posting = FALSE THEN
        RAISE EXCEPTION 'الحساب المحدد لـ (%) هو حساب أب محاسبي/تجميعي. يجب اختيار حساب ترحيل فرعي ونهائي.', p_field_lbl_ar;
    END IF;

    IF v_is_active = FALSE THEN
        RAISE EXCEPTION 'الحساب المحدد لـ (%) غير نشط حالياً. يرجى تفعيله أولاً.', p_field_lbl_ar;
    END IF;
END;
$$;


-- A. Customers Core API
CREATE OR REPLACE FUNCTION public.create_customer(
    p_org_id uuid,
    p_code text,
    p_name text,
    p_display_name text,
    p_customer_type text,
    p_tax_number text,
    p_commercial_registration text,
    p_email text,
    p_phone text,
    p_mobile text,
    p_city text,
    p_address text,
    p_opening_balance numeric,
    p_opening_balance_type text,
    p_receivable_account_id uuid,
    p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_customer_id uuid;
    v_cleaned_code text;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليست لديك صلاحية تعديل أو إضافة البيانات الأساسية في هذه المنشأة.';
    END IF;

    v_cleaned_code := trim(p_code);
    IF v_cleaned_code = '' THEN
        RAISE EXCEPTION 'كود العميل لا يمكن أن يكون فارغاً.';
    END IF;

    -- Validate Account
    PERFORM public.validate_master_data_account(p_receivable_account_id, p_org_id, 'assets', 'حساب العملاء / الذمم المدينة');

    -- Insert
    INSERT INTO public.customers (
        organization_id, code, name, display_name, customer_type, tax_number, 
        commercial_registration, email, phone, mobile, city, address, 
        opening_balance, opening_balance_type, receivable_account_id, is_active, notes, created_by
    )
    VALUES (
        p_org_id, v_cleaned_code, trim(p_name), COALESCE(trim(p_display_name), trim(p_name)),
        p_customer_type, trim(p_tax_number), trim(p_commercial_registration), trim(p_email),
        trim(p_phone), trim(p_mobile), trim(p_city), trim(p_address),
        COALESCE(p_opening_balance, 0.00), COALESCE(p_opening_balance_type, 'debit'),
        p_receivable_account_id, true, trim(p_notes), auth.uid()
    )
    RETURNING id INTO v_customer_id;

    -- Audit log
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'CREATE_CUSTOMER', jsonb_build_object('customer_id', v_customer_id, 'code', v_cleaned_code, 'name', p_name));

    RETURN v_customer_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.update_customer(
    p_org_id uuid,
    p_customer_id uuid,
    p_code text,
    p_name text,
    p_display_name text,
    p_customer_type text,
    p_tax_number text,
    p_commercial_registration text,
    p_email text,
    p_phone text,
    p_mobile text,
    p_city text,
    p_address text,
    p_opening_balance numeric,
    p_opening_balance_type text,
    p_receivable_account_id uuid,
    p_is_active boolean,
    p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cleaned_code text;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليست لديك صلاحية تعديل أو إضافة البيانات الأساسية في هذه المنشأة.';
    END IF;

    v_cleaned_code := trim(p_code);
    IF v_cleaned_code = '' THEN
        RAISE EXCEPTION 'كود العميل لا يمكن أن يكون فارغاً.';
    END IF;

    -- Validate Account
    PERFORM public.validate_master_data_account(p_receivable_account_id, p_org_id, 'assets', 'حساب العملاء / الذمم المدينة');

    -- Update
    UPDATE public.customers
    SET code = v_cleaned_code,
        name = trim(p_name),
        display_name = COALESCE(trim(p_display_name), trim(p_name)),
        customer_type = p_customer_type,
        tax_number = trim(p_tax_number),
        commercial_registration = trim(p_commercial_registration),
        email = trim(p_email),
        phone = trim(p_phone),
        mobile = trim(p_mobile),
        city = trim(p_city),
        address = trim(p_address),
        opening_balance = COALESCE(p_opening_balance, 0.00),
        opening_balance_type = COALESCE(p_opening_balance_type, 'debit'),
        receivable_account_id = p_receivable_account_id,
        is_active = COALESCE(p_is_active, true),
        notes = trim(p_notes)
    WHERE id = p_customer_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'لم يتم العثور على العميل لتحديث بياناته.';
    END IF;

    -- Audit log
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'UPDATE_CUSTOMER', jsonb_build_object('customer_id', p_customer_id, 'code', v_cleaned_code));
END;
$$;


-- B. Vendors Core API
CREATE OR REPLACE FUNCTION public.create_vendor(
    p_org_id uuid,
    p_code text,
    p_name text,
    p_display_name text,
    p_vendor_type text,
    p_tax_number text,
    p_commercial_registration text,
    p_email text,
    p_phone text,
    p_mobile text,
    p_city text,
    p_address text,
    p_opening_balance numeric,
    p_opening_balance_type text,
    p_payable_account_id uuid,
    p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_vendor_id uuid;
    v_cleaned_code text;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليست لديك صلاحية تعديل أو إضافة البيانات الأساسية في هذه المنشأة.';
    END IF;

    v_cleaned_code := trim(p_code);
    IF v_cleaned_code = '' THEN
        RAISE EXCEPTION 'كود المورد لا يمكن أن يكون فارغاً.';
    END IF;

    -- Validate Account
    PERFORM public.validate_master_data_account(p_payable_account_id, p_org_id, 'liabilities', 'حساب الموردين / الذمم الدائنة');

    -- Insert
    INSERT INTO public.vendors (
        organization_id, code, name, display_name, vendor_type, tax_number, 
        commercial_registration, email, phone, mobile, city, address, 
        opening_balance, opening_balance_type, payable_account_id, is_active, notes, created_by
    )
    VALUES (
        p_org_id, v_cleaned_code, trim(p_name), COALESCE(trim(p_display_name), trim(p_name)),
        p_vendor_type, trim(p_tax_number), trim(p_commercial_registration), trim(p_email),
        trim(p_phone), trim(p_mobile), trim(p_city), trim(p_address),
        COALESCE(p_opening_balance, 0.00), COALESCE(p_opening_balance_type, 'credit'),
        p_payable_account_id, true, trim(p_notes), auth.uid()
    )
    RETURNING id INTO v_vendor_id;

    -- Audit log
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'CREATE_VENDOR', jsonb_build_object('vendor_id', v_vendor_id, 'code', v_cleaned_code, 'name', p_name));

    RETURN v_vendor_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.update_vendor(
    p_org_id uuid,
    p_vendor_id uuid,
    p_code text,
    p_name text,
    p_display_name text,
    p_vendor_type text,
    p_tax_number text,
    p_commercial_registration text,
    p_email text,
    p_phone text,
    p_mobile text,
    p_city text,
    p_address text,
    p_opening_balance numeric,
    p_opening_balance_type text,
    p_payable_account_id uuid,
    p_is_active boolean,
    p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cleaned_code text;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليست لديك صلاحية تعديل أو إضافة البيانات الأساسية في هذه المنشأة.';
    END IF;

    v_cleaned_code := trim(p_code);
    IF v_cleaned_code = '' THEN
        RAISE EXCEPTION 'كود المورد لا يمكن أن يكون فارغاً.';
    END IF;

    -- Validate Account
    PERFORM public.validate_master_data_account(p_payable_account_id, p_org_id, 'liabilities', 'حساب الموردين / الذمم الدائنة');

    -- Update
    UPDATE public.vendors
    SET code = v_cleaned_code,
        name = trim(p_name),
        display_name = COALESCE(trim(p_display_name), trim(p_name)),
        vendor_type = p_vendor_type,
        tax_number = trim(p_tax_number),
        commercial_registration = trim(p_commercial_registration),
        email = trim(p_email),
        phone = trim(p_phone),
        mobile = trim(p_mobile),
        city = trim(p_city),
        address = trim(p_address),
        opening_balance = COALESCE(p_opening_balance, 0.00),
        opening_balance_type = COALESCE(p_opening_balance_type, 'credit'),
        payable_account_id = p_payable_account_id,
        is_active = COALESCE(p_is_active, true),
        notes = trim(p_notes)
    WHERE id = p_vendor_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'لم يتم العثور على المورد لتحديث بياناته.';
    END IF;

    -- Audit log
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'UPDATE_VENDOR', jsonb_build_object('vendor_id', p_vendor_id, 'code', v_cleaned_code));
END;
$$;


-- C. Products & Services Core API
CREATE OR REPLACE FUNCTION public.create_item(
    p_org_id uuid,
    p_item_type text,
    p_code text,
    p_name text,
    p_description text,
    p_unit text,
    p_sku text,
    p_barcode text,
    p_selling_price numeric,
    p_purchase_price numeric,
    p_tax_rate numeric,
    p_sales_account_id uuid,
    p_service_revenue_account_id uuid,
    p_inventory_account_id uuid,
    p_cogs_account_id uuid,
    p_expense_account_id uuid,
    p_is_stockable boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item_id uuid;
    v_cleaned_code text;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليست لديك صلاحية تعديل أو إضافة البيانات الأساسية في هذه المنشأة.';
    END IF;

    v_cleaned_code := trim(p_code);
    IF v_cleaned_code = '' THEN
        RAISE EXCEPTION 'كود الصنف لا يمكن أن يكون فارغاً.';
    END IF;

    -- Items Rules validations based on types
    IF p_item_type = 'service' THEN
        IF p_service_revenue_account_id IS NULL THEN
            RAISE EXCEPTION 'الخدمة يجب أن ترتبط بحساب إيرادات خدمات نشط ونهائي.';
        END IF;
        IF p_is_stockable = true THEN
            RAISE EXCEPTION 'لا يمكن للخدمة أن تكون صنفاً مخزنياً وقابلاً للتخزين.';
        END IF;
        IF p_inventory_account_id IS NOT NULL OR p_cogs_account_id IS NOT NULL THEN
            RAISE EXCEPTION 'الخدمات لا تحتاج لحسابات مخزون أو تكلفة مبيعات (COGS).';
        END IF;
    ELSIF p_item_type = 'product' THEN
        IF p_sales_account_id IS NULL THEN
            RAISE EXCEPTION 'المنتج يجب أن يرتبط بحساب مبيعات سلع نشط ونهائي.';
        END IF;
        IF p_is_stockable = true THEN
            IF p_inventory_account_id IS NULL THEN
                RAISE EXCEPTION 'المنتج القابل للمخزون يطلب ربطاً إلزامياً حساب مخزون (أصول متداولة).';
            END IF;
            IF p_cogs_account_id IS NULL THEN
                RAISE EXCEPTION 'المنتج القابل للمخزون يطلب ربطاً إلزامياً حساب تكلفة المبيعات (مصروفات).';
            END IF;
        END IF;
    END IF;

    -- Validate Accounts Classifications
    PERFORM public.validate_master_data_account(p_sales_account_id, p_org_id, 'revenue', 'حساب مبيعات السلع');
    PERFORM public.validate_master_data_account(p_service_revenue_account_id, p_org_id, 'revenue', 'حساب إيرادات الخدمات');
    PERFORM public.validate_master_data_account(p_inventory_account_id, p_org_id, 'assets', 'حساب المخزون الفعلي');
    PERFORM public.validate_master_data_account(p_cogs_account_id, p_org_id, 'expenses', 'حساب تكلفة المبيعات / بضاعة مُباعة');
    PERFORM public.validate_master_data_account(p_expense_account_id, p_org_id, 'expenses', 'حساب المصروفات المباشرة');

    -- Insert
    INSERT INTO public.items (
        organization_id, item_type, code, name, description, unit, sku, barcode, 
        selling_price, purchase_price, tax_rate, sales_account_id, 
        service_revenue_account_id, inventory_account_id, cogs_account_id, 
        expense_account_id, is_stockable, is_active, created_by
    )
    VALUES (
        p_org_id, p_item_type, v_cleaned_code, trim(p_name), trim(p_description), trim(p_unit), 
        trim(p_sku), trim(p_barcode), COALESCE(p_selling_price, 0.00), COALESCE(p_purchase_price, 0.00), 
        COALESCE(p_tax_rate, 0.0), p_sales_account_id, p_service_revenue_account_id, 
        p_inventory_account_id, p_cogs_account_id, p_expense_account_id, 
        COALESCE(p_is_stockable, false), true, auth.uid()
    )
    RETURNING id INTO v_item_id;

    -- Audit log
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'CREATE_ITEM', jsonb_build_object('item_id', v_item_id, 'code', v_cleaned_code, 'name', p_name, 'type', p_item_type));

    RETURN v_item_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.update_item(
    p_org_id uuid,
    p_item_id uuid,
    p_item_type text,
    p_code text,
    p_name text,
    p_description text,
    p_unit text,
    p_sku text,
    p_barcode text,
    p_selling_price numeric,
    p_purchase_price numeric,
    p_tax_rate numeric,
    p_sales_account_id uuid,
    p_service_revenue_account_id uuid,
    p_inventory_account_id uuid,
    p_cogs_account_id uuid,
    p_expense_account_id uuid,
    p_is_stockable boolean,
    p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cleaned_code text;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليست لديك صلاحية تعديل أو إضافة البيانات الأساسية في هذه المنشأة.';
    END IF;

    v_cleaned_code := trim(p_code);
    IF v_cleaned_code = '' THEN
        RAISE EXCEPTION 'كود الصنف لا يمكن أن يكون فارغاً.';
    END IF;

    -- Items Rules validations based on types
    IF p_item_type = 'service' THEN
        IF p_service_revenue_account_id IS NULL THEN
            RAISE EXCEPTION 'الخدمة يجب أن ترتبط بحساب إيرادات خدمات نشط ونهائي.';
        END IF;
        IF p_is_stockable = true THEN
            RAISE EXCEPTION 'لا يمكن للخدمة أن تكون صنفاً مخزنياً وقابلاً للتخزين.';
        END IF;
        IF p_inventory_account_id IS NOT NULL OR p_cogs_account_id IS NOT NULL THEN
            RAISE EXCEPTION 'الخدمات لا تحتاج لحسابات مخزون أو تكلفة مبيعات (COGS).';
        END IF;
    ELSIF p_item_type = 'product' THEN
        IF p_sales_account_id IS NULL THEN
            RAISE EXCEPTION 'المنتج يجب أن يرتبط بحساب مبيعات سلع نشط ونهائي.';
        END IF;
        IF p_is_stockable = true THEN
            IF p_inventory_account_id IS NULL THEN
                RAISE EXCEPTION 'المنتج القابل للمخزون يطلب ربطاً إلزامياً حساب مخزون (أصول متداولة).';
            END IF;
            IF p_cogs_account_id IS NULL THEN
                RAISE EXCEPTION 'المنتج القابل للمخزون يطلب ربطاً إلزامياً حساب تكلفة المبيعات (مصروفات).';
            END IF;
        END IF;
    END IF;

    -- Validate Accounts Classifications
    PERFORM public.validate_master_data_account(p_sales_account_id, p_org_id, 'revenue', 'حساب مبيعات السلع');
    PERFORM public.validate_master_data_account(p_service_revenue_account_id, p_org_id, 'revenue', 'حساب إيرادات الخدمات');
    PERFORM public.validate_master_data_account(p_inventory_account_id, p_org_id, 'assets', 'حساب المخزون الفعلي');
    PERFORM public.validate_master_data_account(p_cogs_account_id, p_org_id, 'expenses', 'حساب تكلفة المبيعات / بضاعة مُباعة');
    PERFORM public.validate_master_data_account(p_expense_account_id, p_org_id, 'expenses', 'حساب المصروفات المباشرة');

    -- Update
    UPDATE public.items
    SET item_type = p_item_type,
        code = v_cleaned_code,
        name = trim(p_name),
        description = trim(p_description),
        unit = trim(p_unit),
        sku = trim(p_sku),
        barcode = trim(p_barcode),
        selling_price = COALESCE(p_selling_price, 0.00),
        purchase_price = COALESCE(p_purchase_price, 0.00),
        tax_rate = COALESCE(p_tax_rate, 0.0),
        sales_account_id = p_sales_account_id,
        service_revenue_account_id = p_service_revenue_account_id,
        inventory_account_id = p_inventory_account_id,
        cogs_account_id = p_cogs_account_id,
        expense_account_id = p_expense_account_id,
        is_stockable = COALESCE(p_is_stockable, false),
        is_active = COALESCE(p_is_active, true)
    WHERE id = p_item_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'لم يتم العثور على الصنف لتحديث بياناته.';
    END IF;

    -- Audit log
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'UPDATE_ITEM', jsonb_build_object('item_id', p_item_id, 'code', v_cleaned_code, 'type', p_item_type));
END;
$$;


-- 7. SECURITY REVOKE ON PUBLIC AND anon FOR PHASE 4 FUNCTIONS
REVOKE ALL ON FUNCTION public.validate_master_data_account(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_customer(uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_customer(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, text, uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_vendor(uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_vendor(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, text, uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_item(uuid, text, text, text, text, text, text, text, numeric, numeric, numeric, uuid, uuid, uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_item(uuid, uuid, text, text, text, text, text, text, text, numeric, numeric, numeric, uuid, uuid, uuid, uuid, uuid, boolean, boolean) FROM PUBLIC, anon;

-- 8. RE-GRANT RPC EXECUTION FOR CONFORMITY TO authenticated ONLY
GRANT EXECUTE ON FUNCTION public.create_customer(uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, text, uuid, boolean, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_vendor(uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_vendor(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, numeric, text, uuid, boolean, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_item(uuid, text, text, text, text, text, text, text, numeric, numeric, numeric, uuid, uuid, uuid, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_item(uuid, uuid, text, text, text, text, text, text, text, numeric, numeric, numeric, uuid, uuid, uuid, uuid, uuid, boolean, boolean) TO authenticated;

COMMIT;
