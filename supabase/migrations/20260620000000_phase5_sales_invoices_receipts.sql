-- ==========================================================
-- LEDGRA PHASE 5: SALES INVOICES AND RECEIPTS SCHEMA & API
-- ==========================================================

BEGIN;

-- 0. NEW ROLE MANAGEMENT HELPER FUNCTION
CREATE OR REPLACE FUNCTION public.can_manage_sales_drafts(p_organization_id uuid)
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
          AND role IN ('owner', 'admin', 'accountant', 'sales')
    );
$$;

-- Secure execution grants
REVOKE ALL ON FUNCTION public.can_manage_sales_drafts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_sales_drafts(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_sales_drafts(uuid) TO authenticated;


-- Add composite unique on items table if not present for multi-tenant fk links
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_id_org_unique CASCADE;
ALTER TABLE public.items ADD CONSTRAINT items_id_org_unique UNIQUE (id, organization_id);


-- 1. CREATE TABLE: sales_invoices
CREATE TABLE IF NOT EXISTS public.sales_invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT NOT NULL,
    invoice_number text NOT NULL,
    invoice_date date NOT NULL,
    due_date date NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'cancelled')),
    payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid')),
    subtotal numeric(15,2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    discount_total numeric(15,2) NOT NULL DEFAULT 0.00 CHECK (discount_total >= 0),
    tax_total numeric(15,2) NOT NULL DEFAULT 0.00 CHECK (tax_total >= 0),
    total numeric(15,2) NOT NULL DEFAULT 0.00 CHECK (total >= 0),
    paid_amount numeric(15,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    balance_due numeric(15,2) NOT NULL DEFAULT 0.00 CHECK (balance_due >= 0),
    currency text NOT NULL DEFAULT 'SAR',
    notes text,
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    cancelled_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    approved_at timestamptz,
    approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    cancelled_at timestamptz,
    cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT sales_invoices_num_org_unique UNIQUE (organization_id, invoice_number),
    CONSTRAINT sales_invoices_id_org_unique UNIQUE (id, organization_id)
);

-- 2. CREATE TABLE: sales_invoice_lines
CREATE TABLE IF NOT EXISTS public.sales_invoice_lines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sales_invoice_id uuid NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    item_id uuid NOT NULL,
    line_number integer NOT NULL,
    description text,
    quantity numeric(15,2) NOT NULL CHECK (quantity > 0),
    unit_price numeric(15,2) NOT NULL CHECK (unit_price >= 0),
    discount_amount numeric(15,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    tax_rate numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (tax_rate >= 0),
    tax_amount numeric(15,2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    line_total numeric(15,2) NOT NULL DEFAULT 0.00 CHECK (line_total >= 0),
    revenue_account_id uuid NOT NULL,
    tax_account_id uuid,
    created_at timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT sales_invoice_lines_invoice_org_fk FOREIGN KEY (sales_invoice_id, organization_id) REFERENCES public.sales_invoices (id, organization_id) ON DELETE CASCADE,
    CONSTRAINT sales_invoice_lines_item_org_fk FOREIGN KEY (item_id, organization_id) REFERENCES public.items (id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT sales_invoice_lines_rev_account_fk FOREIGN KEY (revenue_account_id, organization_id) REFERENCES public.accounts(id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT sales_invoice_lines_tax_account_fk FOREIGN KEY (tax_account_id, organization_id) REFERENCES public.accounts(id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT line_discount_check CHECK (discount_amount <= (quantity * unit_price))
);

-- 3. CREATE TABLE: receipts
CREATE TABLE IF NOT EXISTS public.receipts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT NOT NULL,
    receipt_number text NOT NULL,
    receipt_date date NOT NULL,
    amount numeric(15,2) NOT NULL CHECK (amount > 0),
    payment_method text NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'card', 'other')),
    cash_account_id uuid,
    bank_account_id uuid,
    reference text,
    notes text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'cancelled')),
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    cancelled_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    approved_at timestamptz,
    approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    cancelled_at timestamptz,
    cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

    CONSTRAINT receipts_num_org_unique UNIQUE (organization_id, receipt_number),
    CONSTRAINT receipts_id_org_unique UNIQUE (id, organization_id),
    CONSTRAINT receipts_cash_account_fk FOREIGN KEY (cash_account_id, organization_id) REFERENCES public.accounts(id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT receipts_bank_account_fk FOREIGN KEY (bank_account_id, organization_id) REFERENCES public.accounts(id, organization_id) ON DELETE RESTRICT
);

-- 4. CREATE TABLE: receipt_allocations
CREATE TABLE IF NOT EXISTS public.receipt_allocations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    receipt_id uuid NOT NULL,
    sales_invoice_id uuid NOT NULL,
    allocated_amount numeric(15,2) NOT NULL CHECK (allocated_amount > 0),
    created_at timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT receipt_allocations_inv_receipt_unique UNIQUE (receipt_id, sales_invoice_id),
    CONSTRAINT receipt_allocations_receipt_org_fk FOREIGN KEY (receipt_id, organization_id) REFERENCES public.receipts (id, organization_id) ON DELETE CASCADE,
    CONSTRAINT receipt_allocations_invoice_org_fk FOREIGN KEY (sales_invoice_id, organization_id) REFERENCES public.sales_invoices (id, organization_id) ON DELETE RESTRICT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS sales_invoices_org_idx ON public.sales_invoices (organization_id);
CREATE INDEX IF NOT EXISTS sales_invoices_customer_idx ON public.sales_invoices (organization_id, customer_id);
CREATE INDEX IF NOT EXISTS sales_invoice_lines_invoice_idx ON public.sales_invoice_lines (sales_invoice_id);
CREATE INDEX IF NOT EXISTS receipts_org_idx ON public.receipts (organization_id);
CREATE INDEX IF NOT EXISTS receipts_customer_idx ON public.receipts (organization_id, customer_id);
CREATE INDEX IF NOT EXISTS receipt_allocations_receipt_idx ON public.receipt_allocations (receipt_id);
CREATE INDEX IF NOT EXISTS receipt_allocations_invoice_idx ON public.receipt_allocations (sales_invoice_id);


-- ==========================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================================
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select sales_invoices" ON public.sales_invoices;
CREATE POLICY "Select sales_invoices" ON public.sales_invoices 
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Select sales_invoice_lines" ON public.sales_invoice_lines;
CREATE POLICY "Select sales_invoice_lines" ON public.sales_invoice_lines 
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Select receipts" ON public.receipts;
CREATE POLICY "Select receipts" ON public.receipts 
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Select receipt_allocations" ON public.receipt_allocations;
CREATE POLICY "Select receipt_allocations" ON public.receipt_allocations 
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- Restrict Direct Writes (all writes strictly secured through RPC functions)
REVOKE ALL ON TABLE public.sales_invoices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sales_invoice_lines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.receipts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.receipt_allocations FROM PUBLIC, anon, authenticated;

-- Grant Selects to active logged-in members (RLS handled)
GRANT SELECT ON TABLE public.sales_invoices TO authenticated;
GRANT SELECT ON TABLE public.sales_invoice_lines TO authenticated;
GRANT SELECT ON TABLE public.receipts TO authenticated;
GRANT SELECT ON TABLE public.receipt_allocations TO authenticated;


-- ==========================================================
-- AUTOMATIC SEQUENTIAL NUMBERING GENERATORS ON INSERT
-- ==========================================================

CREATE OR REPLACE FUNCTION public.generate_sales_invoice_number()
RETURNS trigger AS $$
DECLARE
    v_year_str text;
    v_next_num integer;
BEGIN
    v_year_str := to_char(NEW.invoice_date, 'YYYY');
    
    SELECT COALESCE(
        MAX(
            NULLIF(
                regexp_replace(invoice_number, '^INV-' || v_year_str || '-', ''),
                invoice_number
            )::integer
        ), 0
    ) + 1
    INTO v_next_num
    FROM public.sales_invoices
    WHERE organization_id = NEW.organization_id
      AND invoice_number LIKE 'INV-' || v_year_str || '-%';

    NEW.invoice_number := 'INV-' || v_year_str || '-' || lpad(v_next_num::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_generate_sales_invoice_number ON public.sales_invoices;
CREATE TRIGGER trg_generate_sales_invoice_number
    BEFORE INSERT ON public.sales_invoices
    FOR EACH ROW
    WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
    EXECUTE FUNCTION public.generate_sales_invoice_number();


CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS trigger AS $$
DECLARE
    v_year_str text;
    v_next_num integer;
BEGIN
    v_year_str := to_char(NEW.receipt_date, 'YYYY');
    
    SELECT COALESCE(
        MAX(
            NULLIF(
                regexp_replace(receipt_number, '^REC-' || v_year_str || '-', ''),
                receipt_number
            )::integer
        ), 0
    ) + 1
    INTO v_next_num
    FROM public.receipts
    WHERE organization_id = NEW.organization_id
      AND receipt_number LIKE 'REC-' || v_year_str || '-%';

    NEW.receipt_number := 'REC-' || v_year_str || '-' || lpad(v_next_num::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_generate_receipt_number ON public.receipts;
CREATE TRIGGER trg_generate_receipt_number
    BEFORE INSERT ON public.receipts
    FOR EACH ROW
    WHEN (NEW.receipt_number IS NULL OR NEW.receipt_number = '')
    EXECUTE FUNCTION public.generate_receipt_number();


-- ==========================================================
-- SECURE TRANSACTIONAL API (RPC WRAPPERS)
-- ==========================================================

-- A. create_sales_invoice
CREATE OR REPLACE FUNCTION public.create_sales_invoice(
    p_org_id uuid,
    p_customer_id uuid,
    p_invoice_date date,
    p_due_date date,
    p_notes text,
    p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_invoice_id uuid;
    v_line jsonb;
    v_line_number integer := 1;
    v_item_id uuid;
    v_description text;
    v_quantity numeric(15,2);
    v_unit_price numeric(15,2);
    v_discount_amount numeric(15,2);
    v_tax_rate numeric(5,2);
    v_tax_amount numeric(15,2);
    v_line_total numeric(15,2);
    v_revenue_account_id uuid;
    v_tax_account_id uuid;
    
    v_subtotal numeric(15,2) := 0.00;
    v_discount_total numeric(15,2) := 0.00;
    v_tax_total numeric(15,2) := 0.00;
    v_total numeric(15,2) := 0.00;
    v_default_tax_output_account_id uuid;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;
    
    IF NOT public.can_manage_sales_drafts(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لإدارة فواتير المبيعات المسودات في هذه المنشأة.';
    END IF;

    -- Verify customer belongs to organization
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'العميل المحدد غير موجود أو غير نشط في هذه المنشأة.';
    END IF;

    -- Verify lines is an array and not empty
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'الفاتورة يجب أن تحتوي على بند واحد على الأقل.';
    END IF;

    -- Fetch default output tax account from organization settings
    SELECT default_tax_output_account_id
    INTO v_default_tax_output_account_id
    FROM public.accounting_settings
    WHERE organization_id = p_org_id;

    -- Protect sequential numbering from concurrency race conditions using advisory lock
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':sales_invoice:' || to_char(p_invoice_date, 'YYYY'))
    );

    -- Insert Draft Invoice Header (Trigger generates invoice_number)
    INSERT INTO public.sales_invoices (
        organization_id, customer_id, invoice_number, invoice_date, due_date, 
        status, payment_status, subtotal, discount_total, tax_total, total, 
        paid_amount, balance_due, currency, notes, created_by
    ) VALUES (
        p_org_id, p_customer_id, '', p_invoice_date, p_due_date, 
        'draft', 'unpaid', 0, 0, 0, 0, 
        0, 0, 'SAR', trim(p_notes), auth.uid()
    ) RETURNING id INTO v_invoice_id;

    -- Loop through lines to validate and insert
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        -- Safe extraction and validation of JSON properties
        IF v_line->>'item_id' IS NULL OR trim(v_line->>'item_id') = '' THEN
            RAISE EXCEPTION 'الصنف (item_id) مطلوب في السطر %.', v_line_number;
        END IF;
        
        IF v_line->>'quantity' IS NULL OR trim(v_line->>'quantity') = '' THEN
            RAISE EXCEPTION 'الكمية مطلوبة في السطر %.', v_line_number;
        END IF;
        
        IF v_line->>'unit_price' IS NULL OR trim(v_line->>'unit_price') = '' THEN
            RAISE EXCEPTION 'سعر الوحدة مطلوب في السطر %.', v_line_number;
        END IF;

        v_item_id := (v_line->>'item_id')::uuid;
        v_description := trim(COALESCE(v_line->>'description', ''));
        v_quantity := (v_line->>'quantity')::numeric;
        v_unit_price := (v_line->>'unit_price')::numeric;

        -- Safe extraction of optional properties
        IF v_line->>'discount_amount' IS NOT NULL AND trim(v_line->>'discount_amount') <> '' THEN
            v_discount_amount := (v_line->>'discount_amount')::numeric;
        ELSE
            v_discount_amount := 0.00;
        END IF;

        IF v_line->>'tax_rate' IS NOT NULL AND trim(v_line->>'tax_rate') <> '' THEN
            v_tax_rate := (v_line->>'tax_rate')::numeric;
        ELSE
            v_tax_rate := 0.00;
        END IF;

        -- Validation checks
        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'الكمية في السطر % يجب أن تكون أكبر من الصفر.', v_line_number;
        END IF;

        IF v_unit_price < 0 THEN
            RAISE EXCEPTION 'سعر الوحدة في السطر % لا يمكن أن يكون سالباً.', v_line_number;
        END IF;

        IF v_discount_amount < 0 THEN
            RAISE EXCEPTION 'الخصم في السطر % لا يمكن أن يكون سالباً.', v_line_number;
        END IF;

        IF v_discount_amount > (v_quantity * v_unit_price) THEN
            RAISE EXCEPTION 'الخصم في السطر % لا يمكن أن يتجاوز إجمالي السطر قبل الخصم.', v_line_number;
        END IF;

        -- Check item existence in organization & extract accounts/tax
        SELECT 
            CASE 
                WHEN item_type = 'product' THEN sales_account_id
                ELSE service_revenue_account_id
            END
        INTO v_revenue_account_id
        FROM public.items
        WHERE id = v_item_id AND organization_id = p_org_id AND is_active = true;

        IF v_revenue_account_id IS NULL THEN
            RAISE EXCEPTION 'الصنف المحدد في السطر % غير موجود أو غير نشط أو يفتقد حساب الإيراد المربوط.', v_line_number;
        END IF;

        -- Overwrite with revenue_account_id if specified in line and allowed
        IF v_line->>'revenue_account_id' IS NOT NULL AND trim(v_line->>'revenue_account_id') <> '' THEN
            v_revenue_account_id := (v_line->>'revenue_account_id')::uuid;
        END IF;

        -- Validate revenue account
        PERFORM public.validate_master_data_account(v_revenue_account_id, p_org_id, 'revenue', 'حساب إيراد الصنف السطر ' || v_line_number);

        -- Calculate tax and total for this line
        v_tax_amount := round(((v_quantity * v_unit_price - v_discount_amount) * (v_tax_rate / 100.00)), 2);
        v_line_total := (v_quantity * v_unit_price) - v_discount_amount + v_tax_amount;

        -- Map tax account if tax applies
        IF v_tax_rate > 0 THEN
            v_tax_account_id := v_default_tax_output_account_id;
            IF v_tax_account_id IS NULL THEN
                RAISE EXCEPTION 'نسبة الضريبة مطبقة في السطر % ولكن لم يتم تهيئة حساب ضريبة المخرجات في الإعدادات المحاسبية.', v_line_number;
            END IF;
            PERFORM public.validate_master_data_account(v_tax_account_id, p_org_id, 'liabilities', 'حساب ضريبة المخرجات');
        ELSE
            v_tax_account_id := NULL;
            v_tax_amount := 0.00;
        END IF;

        -- Accumulate header totals
        v_subtotal := v_subtotal + (v_quantity * v_unit_price);
        v_discount_total := v_discount_total + v_discount_amount;
        v_tax_total := v_tax_total + v_tax_amount;
        v_total := v_total + v_line_total;

        -- Insert Line
        INSERT INTO public.sales_invoice_lines (
            sales_invoice_id, organization_id, item_id, line_number, description,
            quantity, unit_price, discount_amount, tax_rate, tax_amount, line_total,
            revenue_account_id, tax_account_id
        ) VALUES (
            v_invoice_id, p_org_id, v_item_id, v_line_number, v_description,
            v_quantity, v_unit_price, v_discount_amount, v_tax_rate, v_tax_amount, v_line_total,
            v_revenue_account_id, v_tax_account_id
        );

        v_line_number := v_line_number + 1;
    END LOOP;

    -- Update Draft Invoice Header Totals
    UPDATE public.sales_invoices SET
        subtotal = v_subtotal,
        discount_total = v_discount_total,
        tax_total = v_tax_total,
        total = v_total,
        balance_due = v_total
    WHERE id = v_invoice_id;

    -- Log action in Audit Logs
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'create_sales_invoice',
        jsonb_build_object(
            'sales_invoice_id', v_invoice_id,
            'customer_id', p_customer_id,
            'invoice_date', p_invoice_date,
            'total', v_total
        )
    );

    RETURN v_invoice_id;
END;
$$;


-- B. update_sales_invoice
CREATE OR REPLACE FUNCTION public.update_sales_invoice(
    p_org_id uuid,
    p_invoice_id uuid,
    p_customer_id uuid,
    p_invoice_date date,
    p_due_date date,
    p_notes text,
    p_lines jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
    v_line jsonb;
    v_line_number integer := 1;
    v_item_id uuid;
    v_description text;
    v_quantity numeric(15,2);
    v_unit_price numeric(15,2);
    v_discount_amount numeric(15,2);
    v_tax_rate numeric(5,2);
    v_tax_amount numeric(15,2);
    v_line_total numeric(15,2);
    v_revenue_account_id uuid;
    v_tax_account_id uuid;
    
    v_subtotal numeric(15,2) := 0.00;
    v_discount_total numeric(15,2) := 0.00;
    v_tax_total numeric(15,2) := 0.00;
    v_total numeric(15,2) := 0.00;
    v_default_tax_output_account_id uuid;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;
    
    IF NOT public.can_manage_sales_drafts(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لإدارة فواتير المبيعات المسودات في هذه المنشأة.';
    END IF;

    -- Get status
    SELECT status INTO v_status FROM public.sales_invoices WHERE id = p_invoice_id AND organization_id = p_org_id;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'الفاتورة المطلوبة غير موجودة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن تعديل فاتورة تم اعتمادها أو إلغاؤها.';
    END IF;

    -- Verify customer belongs to organization
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'العميل المحدد غير موجود أو غير نشط في هذه المنشأة.';
    END IF;

    -- Verify lines is an array and not empty
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'الفاتورة يجب أن تحتوي على بند واحد على الأقل.';
    END IF;

    -- Fetch default output tax account from organization settings
    SELECT default_tax_output_account_id
    INTO v_default_tax_output_account_id
    FROM public.accounting_settings
    WHERE organization_id = p_org_id;

    -- Delete existing lines
    DELETE FROM public.sales_invoice_lines WHERE sales_invoice_id = p_invoice_id;

    -- Loop to insert new/updated lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        -- Safe extraction and validation of JSON properties
        IF v_line->>'item_id' IS NULL OR trim(v_line->>'item_id') = '' THEN
            RAISE EXCEPTION 'الصنف (item_id) مطلوب في السطر %.', v_line_number;
        END IF;
        
        IF v_line->>'quantity' IS NULL OR trim(v_line->>'quantity') = '' THEN
            RAISE EXCEPTION 'الكمية مطلوبة في السطر %.', v_line_number;
        END IF;
        
        IF v_line->>'unit_price' IS NULL OR trim(v_line->>'unit_price') = '' THEN
            RAISE EXCEPTION 'سعر الوحدة مطلوب في السطر %.', v_line_number;
        END IF;

        v_item_id := (v_line->>'item_id')::uuid;
        v_description := trim(COALESCE(v_line->>'description', ''));
        v_quantity := (v_line->>'quantity')::numeric;
        v_unit_price := (v_line->>'unit_price')::numeric;

        -- Safe extraction of optional properties
        IF v_line->>'discount_amount' IS NOT NULL AND trim(v_line->>'discount_amount') <> '' THEN
            v_discount_amount := (v_line->>'discount_amount')::numeric;
        ELSE
            v_discount_amount := 0.00;
        END IF;

        IF v_line->>'tax_rate' IS NOT NULL AND trim(v_line->>'tax_rate') <> '' THEN
            v_tax_rate := (v_line->>'tax_rate')::numeric;
        ELSE
            v_tax_rate := 0.00;
        END IF;

        -- Validation checks
        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'الكمية في السطر % يجب أن تكون أكبر من الصفر.', v_line_number;
        END IF;

        IF v_unit_price < 0 THEN
            RAISE EXCEPTION 'سعر الوحدة في السطر % لا يمكن أن يكون سالباً.', v_line_number;
        END IF;

        IF v_discount_amount < 0 THEN
            RAISE EXCEPTION 'الخصم في السطر % لا يمكن أن يكون سالباً.', v_line_number;
        END IF;

        IF v_discount_amount > (v_quantity * v_unit_price) THEN
            RAISE EXCEPTION 'الخصم في السطر % لا يمكن أن يتجاوز إجمالي السطر قبل الخصم.', v_line_number;
        END IF;

        -- Check item existence in organization & extract accounts/tax
        SELECT 
            CASE 
                WHEN item_type = 'product' THEN sales_account_id
                ELSE service_revenue_account_id
            END
        INTO v_revenue_account_id
        FROM public.items
        WHERE id = v_item_id AND organization_id = p_org_id AND is_active = true;

        IF v_revenue_account_id IS NULL THEN
            RAISE EXCEPTION 'الصنف المحدد في السطر % غير موجود أو غير نشط أو يفتقد حساب الإيراد المربوط.', v_line_number;
        END IF;

        -- Overwrite with revenue_account_id if specified in line and allowed
        IF v_line->>'revenue_account_id' IS NOT NULL AND trim(v_line->>'revenue_account_id') <> '' THEN
            v_revenue_account_id := (v_line->>'revenue_account_id')::uuid;
        END IF;

        -- Validate revenue account
        PERFORM public.validate_master_data_account(v_revenue_account_id, p_org_id, 'revenue', 'حساب إيراد الصنف السطر ' || v_line_number);

        -- Calculate tax and total for this line
        v_tax_amount := round(((v_quantity * v_unit_price - v_discount_amount) * (v_tax_rate / 100.00)), 2);
        v_line_total := (v_quantity * v_unit_price) - v_discount_amount + v_tax_amount;

        -- Map tax account if tax applies
        IF v_tax_rate > 0 THEN
            v_tax_account_id := v_default_tax_output_account_id;
            IF v_tax_account_id IS NULL THEN
                RAISE EXCEPTION 'نسبة الضريبة مطبقة في السطر % ولكن لم يتم تهيئة حساب ضريبة المخرجات في الإعدادات المحاسبية.', v_line_number;
            END IF;
            PERFORM public.validate_master_data_account(v_tax_account_id, p_org_id, 'liabilities', 'حساب ضريبة المخرجات');
        ELSE
            v_tax_account_id := NULL;
            v_tax_amount := 0.00;
        END IF;

        -- Accumulate header totals
        v_subtotal := v_subtotal + (v_quantity * v_unit_price);
        v_discount_total := v_discount_total + v_discount_amount;
        v_tax_total := v_tax_total + v_tax_amount;
        v_total := v_total + v_line_total;

        -- Insert Line
        INSERT INTO public.sales_invoice_lines (
            sales_invoice_id, organization_id, item_id, line_number, description,
            quantity, unit_price, discount_amount, tax_rate, tax_amount, line_total,
            revenue_account_id, tax_account_id
        ) VALUES (
            p_invoice_id, p_org_id, v_item_id, v_line_number, v_description,
            v_quantity, v_unit_price, v_discount_amount, v_tax_rate, v_tax_amount, v_line_total,
            v_revenue_account_id, v_tax_account_id
        );

        v_line_number := v_line_number + 1;
    END LOOP;

    -- Update Invoice Header
    UPDATE public.sales_invoices SET
        customer_id = p_customer_id,
        invoice_date = p_invoice_date,
        due_date = p_due_date,
        notes = trim(p_notes),
        subtotal = v_subtotal,
        discount_total = v_discount_total,
        tax_total = v_tax_total,
        total = v_total,
        balance_due = v_total - paid_amount,
        updated_at = now()
    WHERE id = p_invoice_id;

    -- Log action in Audit Logs
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'update_sales_invoice',
        jsonb_build_object(
            'sales_invoice_id', p_invoice_id,
            'customer_id', p_customer_id,
            'invoice_date', p_invoice_date,
            'total', v_total
        )
    );
END;
$$;


-- C. delete_draft_sales_invoice
CREATE OR REPLACE FUNCTION public.delete_draft_sales_invoice(
    p_org_id uuid,
    p_invoice_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_manage_sales_drafts(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لإدارة فواتير المبيعات المسودات في هذه المنشأة.';
    END IF;

    SELECT status INTO v_status FROM public.sales_invoices WHERE id = p_invoice_id AND organization_id = p_org_id;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'الفاتورة غير موجودة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن حذف فاتورة ليست مسودة (draft).';
    END IF;

    DELETE FROM public.sales_invoice_lines WHERE sales_invoice_id = p_invoice_id;
    DELETE FROM public.sales_invoices WHERE id = p_invoice_id;

    -- Log action in Audit Logs
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'delete_sales_invoice',
        jsonb_build_object(
            'sales_invoice_id', p_invoice_id
        )
    );
END;
$$;


-- D. approve_sales_invoice
CREATE OR REPLACE FUNCTION public.approve_sales_invoice(
    p_org_id uuid,
    p_invoice_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_invoice_number text;
    v_customer_id uuid;
    v_customer_name text;
    v_invoice_date date;
    v_due_date date;
    v_total numeric(15,2);
    v_tax_total numeric(15,2);
    v_status text;
    v_receivable_account_id uuid;
    v_default_tax_output_account_id uuid;
    
    v_journal_lines jsonb := '[]'::jsonb;
    v_line_item record;
    v_journal_entry_id uuid;
    v_desc text;
BEGIN
    -- Auth & Privilege check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: الاعتماد متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Get invoice details
    SELECT i.invoice_number, i.customer_id, i.invoice_date, i.due_date, i.total, i.tax_total, i.status, c.name, c.receivable_account_id
    INTO v_invoice_number, v_customer_id, v_invoice_date, v_due_date, v_total, v_tax_total, v_status, v_customer_name, v_receivable_account_id
    FROM public.sales_invoices i
    JOIN public.customers c ON i.customer_id = c.id
    WHERE i.id = p_invoice_id AND i.organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'الفاتورة غير موجودة أو لا تنتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'الفاتورة معتمدة بالفعل أو ملغاة ولا يمكن اعتمادها مجدداً.';
    END IF;
    
    -- Verify customer and receivable account
    IF v_receivable_account_id IS NULL THEN
        RAISE EXCEPTION 'العميل المحدد يفتقد لحساب الذمم المدينة المربوط.';
    END IF;
    PERFORM public.validate_master_data_account(v_receivable_account_id, p_org_id, 'assets', 'حساب ذمم العملاء');

    -- Build description
    v_desc := 'قيد تلقائي لفاتورة مبيعات رقم: ' || v_invoice_number || ' - العميل: ' || v_customer_name;

    -- Construct Debit line (Accounts Receivable)
    v_journal_lines := jsonb_build_array(
        jsonb_build_object(
            'account_id', v_receivable_account_id,
            'description', v_desc,
            'debit', v_total,
            'credit', 0.00
        )
    );

    -- Loop through invoice lines grouped by revenue account to compile Credit lines
    FOR v_line_item IN 
        SELECT revenue_account_id, SUM((quantity * unit_price) - discount_amount) as net_amount
        FROM public.sales_invoice_lines
        WHERE sales_invoice_id = p_invoice_id
        GROUP BY revenue_account_id
    LOOP
        IF v_line_item.net_amount > 0 THEN
            v_journal_lines := v_journal_lines || jsonb_build_object(
                'account_id', v_line_item.revenue_account_id,
                'description', v_desc || ' (إيراد المبيعات)',
                'debit', 0.00,
                'credit', v_line_item.net_amount
            );
        END IF;
    END LOOP;

    -- Credit tax line if tax is greater than 0
    IF v_tax_total > 0 THEN
        SELECT default_tax_output_account_id
        INTO v_default_tax_output_account_id
        FROM public.accounting_settings
        WHERE organization_id = p_org_id;

        IF v_default_tax_output_account_id IS NULL THEN
            RAISE EXCEPTION 'توجد ضريبة على الفاتورة ولكن لم يتم تهيئة حساب ضريبة المخرجات في الإعدادات المحاسبية.';
        END IF;
        
        PERFORM public.validate_master_data_account(v_default_tax_output_account_id, p_org_id, 'liabilities', 'حساب ضريبة المخرجات');

        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_id', v_default_tax_output_account_id,
            'description', v_desc || ' (ضريبة مخرجات %15)',
            'debit', 0.00,
            'credit', v_tax_total
        );
    END IF;

    -- Create and Post the Automatic Journal Entry
    v_journal_entry_id := public.create_journal_entry(
        p_org_id,
        v_invoice_date,
        v_invoice_number,
        v_desc,
        v_journal_lines
    );

    -- Mark Journal Entry as System Type
    UPDATE public.journal_entries 
    SET source_type = 'system' 
    WHERE id = v_journal_entry_id;

    -- Post the journal entry immediately
    PERFORM public.post_journal_entry(p_org_id, v_journal_entry_id);

    -- Update Invoice Header
    UPDATE public.sales_invoices SET
        status = 'approved',
        journal_entry_id = v_journal_entry_id,
        approved_at = now(),
        approved_by = auth.uid(),
        updated_at = now()
    WHERE id = p_invoice_id;

    -- Log action in Audit Logs
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'approve_sales_invoice',
        jsonb_build_object(
            'sales_invoice_id', p_invoice_id,
            'journal_entry_id', v_journal_entry_id,
            'status_from', 'draft',
            'status_to', 'approved'
        )
    );

    RETURN v_journal_entry_id;
END;
$$;


-- E. cancel_sales_invoice
CREATE OR REPLACE FUNCTION public.cancel_sales_invoice(
    p_org_id uuid,
    p_invoice_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_journal_entry_id uuid;
    v_status text;
    v_paid_amount numeric(15,2);
    v_rev_entry_id uuid;
BEGIN
    -- Auth & Privilege check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إلغاء الفاتورة متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Get invoice info
    SELECT status, journal_entry_id, paid_amount 
    INTO v_status, v_journal_entry_id, v_paid_amount
    FROM public.sales_invoices
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'الفاتورة غير موجودة أو لا تنتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'approved' THEN
        RAISE EXCEPTION 'يمكن فقط إلغاء الفواتير التي في حالة معتمد (approved).';
    END IF;

    -- Verify no receipts exist
    IF v_paid_amount > 0 OR EXISTS (
        SELECT 1 
        FROM public.receipt_allocations ra
        JOIN public.receipts r ON ra.receipt_id = r.id
        WHERE ra.sales_invoice_id = p_invoice_id 
          AND r.status = 'approved'
    ) THEN
        RAISE EXCEPTION 'لا يمكن إلغاء فاتورة مبيعات مسجل عليها دفعات قبض أو تحصيلات بالفعل. يرجى إلغاء سندات القبض المرتبطة أولاً.';
    END IF;

    -- Reverse journal entry
    IF v_journal_entry_id IS NOT NULL THEN
        v_rev_entry_id := public.reverse_journal_entry(p_org_id, v_journal_entry_id);
    END IF;

    -- Update invoice to cancelled
    UPDATE public.sales_invoices SET
        status = 'cancelled',
        cancelled_journal_entry_id = v_rev_entry_id,
        cancelled_at = now(),
        cancelled_by = auth.uid(),
        balance_due = 0.00,
        updated_at = now()
    WHERE id = p_invoice_id;

    -- Update journal entry source_type to system as well
    IF v_rev_entry_id IS NOT NULL THEN
        UPDATE public.journal_entries 
        SET source_type = 'system' 
        WHERE id = v_rev_entry_id;
    END IF;

    -- Log audit trail
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'cancel_sales_invoice',
        jsonb_build_object(
            'sales_invoice_id', p_invoice_id,
            'status_from', 'approved',
            'status_to', 'cancelled',
            'cancelled_journal_entry_id', v_rev_entry_id
        )
    );

    RETURN v_rev_entry_id;
END;
$$;


-- F. create_receipt
CREATE OR REPLACE FUNCTION public.create_receipt(
    p_org_id uuid,
    p_customer_id uuid,
    p_receipt_date date,
    p_amount numeric(15,2),
    p_payment_method text,
    p_cash_account_id uuid,
    p_bank_account_id uuid,
    p_reference text,
    p_notes text,
    p_allocations jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_receipt_id uuid;
    v_alloc jsonb;
    v_allocated_sum numeric(15,2) := 0.00;
    v_invoice_id uuid;
    v_alloc_amt numeric(15,2);
    v_balance_due numeric(15,2);
    v_customer_check uuid;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إدارة سندات القبض متاحة فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Amount check
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'مبلغ السند يجب أن يكون أكبر من الصفر.';
    END IF;

    -- Customer check
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'العميل المحدد غير موجود أو غير نشط.';
    END IF;

    -- Revalidation: check that allocations is an array and not empty
    IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
        RAISE EXCEPTION 'يجب تخصيص سند القبض على فاتورة معتمدة واحدة على الأقل في هذه المرحلة.';
    END IF;

    -- Method specific validations
    IF p_payment_method = 'cash' THEN
        IF p_cash_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى اختيار حساب الصندوق/الخزينة لطريقة الدفع النقدي.';
        END IF;
        PERFORM public.validate_master_data_account(p_cash_account_id, p_org_id, 'assets', 'حساب الصندوق/الخزينة');
    ELSIF p_payment_method IN ('bank_transfer', 'card') THEN
        IF p_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى اختيار حساب البنك لطرق الدفع البنكية.';
        END IF;
        PERFORM public.validate_master_data_account(p_bank_account_id, p_org_id, 'assets', 'حساب البنك');
    END IF;

    -- Protect sequential numbering from concurrency race conditions
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':receipt:' || to_char(p_receipt_date, 'YYYY'))
    );

    -- Create Receipt Header
    INSERT INTO public.receipts (
        organization_id, customer_id, receipt_number, receipt_date, amount,
        payment_method, cash_account_id, bank_account_id, reference, notes,
        status, created_by
    ) VALUES (
        p_org_id, p_customer_id, '', p_receipt_date, p_amount,
        p_payment_method, p_cash_account_id, p_bank_account_id, trim(p_reference), trim(p_notes),
        'draft', auth.uid()
    ) RETURNING id INTO v_receipt_id;

    -- Handle Allocations
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        -- Safe extraction and validation of JSON properties
        IF v_alloc->>'sales_invoice_id' IS NULL OR trim(v_alloc->>'sales_invoice_id') = '' THEN
            RAISE EXCEPTION 'رقم الفاتورة (sales_invoice_id) مطلوب في التخصيص.';
        END IF;

        IF v_alloc->>'allocated_amount' IS NULL OR trim(v_alloc->>'allocated_amount') = '' THEN
            RAISE EXCEPTION 'القيمة المخصصة (allocated_amount) مطلوبة في التخصيص.';
        END IF;

        v_invoice_id := (v_alloc->>'sales_invoice_id')::uuid;
        v_alloc_amt := (v_alloc->>'allocated_amount')::numeric;

        IF v_alloc_amt <= 0 THEN
            RAISE EXCEPTION 'المبلغ المخصص في التوزيع يجب أن يكون أكبر من الصفر.';
        END IF;

        -- Verify invoice belongs to same customer/org and is approved
        SELECT customer_id, balance_due INTO v_customer_check, v_balance_due
        FROM public.sales_invoices
        WHERE id = v_invoice_id AND organization_id = p_org_id AND status = 'approved';

        IF v_customer_check IS NULL THEN
            RAISE EXCEPTION 'إحدى الفواتير المختارة للتخصيص غير موجودة أو ليست في حالة معتمد (approved).';
        END IF;

        IF v_customer_check <> p_customer_id THEN
            RAISE EXCEPTION 'لا يمكن تخصيص سند قبض لعميل آخر غير العميل المحدد في الفاتورة.';
        END IF;

        IF v_alloc_amt > v_balance_due THEN
            RAISE EXCEPTION
                'المبلغ المخصص (%) يتجاوز الرصيد المتبقي المستحق على الفاتورة (%).',
                v_alloc_amt,
                v_balance_due;
        END IF;

        v_allocated_sum := v_allocated_sum + v_alloc_amt;

        -- Insert allocation
        INSERT INTO public.receipt_allocations (
            organization_id, receipt_id, sales_invoice_id, allocated_amount
        ) VALUES (
            p_org_id, v_receipt_id, v_invoice_id, v_alloc_amt
        );
    END LOOP;

    IF v_allocated_sum > p_amount THEN
        RAISE EXCEPTION
            'مجموع المبالغ المخصصة للفواتير (%) يتجاوز القيمة الإجمالية لسند القبض (%).',
            v_allocated_sum,
            p_amount;
    END IF;

    -- Log action in Audit Logs
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'create_receipt',
        jsonb_build_object(
            'receipt_id', v_receipt_id,
            'customer_id', p_customer_id,
            'receipt_date', p_receipt_date,
            'amount', p_amount
        )
    );

    RETURN v_receipt_id;
END;
$$;


-- G. update_receipt
CREATE OR REPLACE FUNCTION public.update_receipt(
    p_org_id uuid,
    p_receipt_id uuid,
    p_customer_id uuid,
    p_receipt_date date,
    p_amount numeric(15,2),
    p_payment_method text,
    p_cash_account_id uuid,
    p_bank_account_id uuid,
    p_reference text,
    p_notes text,
    p_allocations jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
    v_alloc jsonb;
    v_allocated_sum numeric(15,2) := 0.00;
    v_invoice_id uuid;
    v_alloc_amt numeric(15,2);
    v_balance_due numeric(15,2);
    v_customer_check uuid;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إدارة سندات القبض متاحة فقط للمالك، المدير، والمحاسب.';
    END IF;

    SELECT status INTO v_status FROM public.receipts WHERE id = p_receipt_id AND organization_id = p_org_id;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'سند القبض غير موجود.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن تعديل سند قبض معتمد أو ملغى.';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'مبلغ السند يجب أن يكون أكبر من الصفر.';
    END IF;

    -- Customer check
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'العميل المحدد غير موجود أو غير نشط.';
    END IF;

    -- Revalidation: check that allocations is an array and not empty
    IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
        RAISE EXCEPTION 'يجب تخصيص سند القبض على فاتورة معتمدة واحدة على الأقل في هذه المرحلة.';
    END IF;

    -- Method specific validations
    IF p_payment_method = 'cash' THEN
        IF p_cash_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى اختيار حساب الصندوق/الخزينة لطريقة الدفع النقدي.';
        END IF;
        PERFORM public.validate_master_data_account(p_cash_account_id, p_org_id, 'assets', 'حساب الصندوق/الخزينة');
    ELSIF p_payment_method IN ('bank_transfer', 'card') THEN
        IF p_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى اختيار حساب البنك لطرق الدفع البنكية.';
        END IF;
        PERFORM public.validate_master_data_account(p_bank_account_id, p_org_id, 'assets', 'حساب البنك');
    END IF;

    -- Reset previous allocations
    DELETE FROM public.receipt_allocations WHERE receipt_id = p_receipt_id;

    -- Handle Allocations
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        -- Safe extraction and validation of JSON properties
        IF v_alloc->>'sales_invoice_id' IS NULL OR trim(v_alloc->>'sales_invoice_id') = '' THEN
            RAISE EXCEPTION 'رقم الفاتورة (sales_invoice_id) مطلوب في التخصيص.';
        END IF;

        IF v_alloc->>'allocated_amount' IS NULL OR trim(v_alloc->>'allocated_amount') = '' THEN
            RAISE EXCEPTION 'القيمة المخصصة (allocated_amount) مطلوبة في التخصيص.';
        END IF;

        v_invoice_id := (v_alloc->>'sales_invoice_id')::uuid;
        v_alloc_amt := (v_alloc->>'allocated_amount')::numeric;

        IF v_alloc_amt <= 0 THEN
            RAISE EXCEPTION 'المبلغ المخصص في التوزيع يجب أن يكون أكبر من الصفر.';
        END IF;

        -- Verify invoice belongs to same customer/org and is approved
        SELECT customer_id, balance_due INTO v_customer_check, v_balance_due
        FROM public.sales_invoices
        WHERE id = v_invoice_id AND organization_id = p_org_id AND status = 'approved';

        IF v_customer_check IS NULL THEN
            RAISE EXCEPTION 'إحدى الفواتير المختارة للتخصيص غير موجودة أو ليست في حالة معتمد (approved).';
        END IF;

        IF v_customer_check <> p_customer_id THEN
            RAISE EXCEPTION 'لا يمكن تخصيص سند قبض لعميل آخر غير العميل المحدد في الفاتورة.';
        END IF;

        IF v_alloc_amt > v_balance_due THEN
            RAISE EXCEPTION
                'المبلغ المخصص (%) يتجاوز الرصيد المتبقي المستحق على الفاتورة (%).',
                v_alloc_amt,
                v_balance_due;
        END IF;

        v_allocated_sum := v_allocated_sum + v_alloc_amt;

        -- Insert allocation
        INSERT INTO public.receipt_allocations (
            organization_id, receipt_id, sales_invoice_id, allocated_amount
        ) VALUES (
            p_org_id, p_receipt_id, v_invoice_id, v_alloc_amt
        );
    END LOOP;

    IF v_allocated_sum > p_amount THEN
        RAISE EXCEPTION
            'مجموع المبالغ المخصصة للفواتير (%) يتجاوز القيمة الإجمالية لسند القبض (%).',
            v_allocated_sum,
            p_amount;
    END IF;

    -- Update Receipt Header
    UPDATE public.receipts SET
        customer_id = p_customer_id,
        receipt_date = p_receipt_date,
        amount = p_amount,
        payment_method = p_payment_method,
        cash_account_id = p_cash_account_id,
        bank_account_id = p_bank_account_id,
        reference = trim(p_reference),
        notes = trim(p_notes),
        updated_at = now()
    WHERE id = p_receipt_id;

    -- Log action in Audit Logs
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'update_receipt',
        jsonb_build_object(
            'receipt_id', p_receipt_id,
            'customer_id', p_customer_id,
            'receipt_date', p_receipt_date,
            'amount', p_amount
        )
    );
END;
$$;


-- H. delete_draft_receipt
CREATE OR REPLACE FUNCTION public.delete_draft_receipt(
    p_org_id uuid,
    p_receipt_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إدارة سندات القبض متاحة فقط للمالك، المدير، والمحاسب.';
    END IF;

    SELECT status INTO v_status FROM public.receipts WHERE id = p_receipt_id AND organization_id = p_org_id;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'سند القبض غير موجود.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن حذف سند قبض إلا إذا كان مسودة (draft).';
    END IF;

    DELETE FROM public.receipt_allocations WHERE receipt_id = p_receipt_id;
    DELETE FROM public.receipts WHERE id = p_receipt_id;

    -- Log action in Audit Logs
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'delete_receipt',
        jsonb_build_object(
            'receipt_id', p_receipt_id
        )
    );
END;
$$;


-- I. approve_receipt
CREATE OR REPLACE FUNCTION public.approve_receipt(
    p_org_id uuid,
    p_receipt_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_receipt_number text;
    v_customer_id uuid;
    v_customer_name text;
    v_receivable_account_id uuid;
    v_receipt_date date;
    v_amount numeric(15,2);
    v_payment_method text;
    v_cash_account_id uuid;
    v_bank_account_id uuid;
    v_status text;
    v_reference text;
    
    v_debit_account_id uuid;
    v_journal_lines jsonb := '[]'::jsonb;
    v_journal_entry_id uuid;
    v_desc text;
    
    v_alloc record;
    v_invoice_num text;
    v_invoice_total numeric(15,2);
    v_invoice_paid numeric(15,2);
    v_invoice_bal numeric(15,2);
    v_new_paid numeric(15,2);
    v_new_bal numeric(15,2);
    v_pay_status text;
    v_alloc_sum numeric(15,2) := 0.00;
BEGIN
    -- Auth & Privilege check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: اعتماد السندات متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Get Receipt Header details
    SELECT r.receipt_number, r.customer_id, r.receipt_date, r.amount, r.payment_method, r.cash_account_id, r.bank_account_id, r.status, r.reference, c.name, c.receivable_account_id
    INTO v_receipt_number, v_customer_id, v_receipt_date, v_amount, v_payment_method, v_cash_account_id, v_bank_account_id, v_status, v_reference, v_customer_name, v_receivable_account_id
    FROM public.receipts r
    JOIN public.customers c ON r.customer_id = c.id
    WHERE r.id = p_receipt_id AND r.organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'سند القبض غير موجود أو لا ينتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'السند معتمد بالفعل أو ملغى ولا يمكن اعتماده مجدداً.';
    END IF;

    -- Validate Debit account
    IF v_payment_method = 'cash' THEN
        v_debit_account_id := v_cash_account_id;
        IF v_debit_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى ربط حساب الصندوق/الخزينة النقدية بالسند.';
        END IF;
        PERFORM public.validate_master_data_account(v_debit_account_id, p_org_id, 'assets', 'حساب الخزينة/الصندوق');
    ELSE
        v_debit_account_id := v_bank_account_id;
        IF v_debit_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى ربط حساب البنك بالسند.';
        END IF;
        PERFORM public.validate_master_data_account(v_debit_account_id, p_org_id, 'assets', 'حساب البنك');
    END IF;

    -- Validate Receivable account
    IF v_receivable_account_id IS NULL THEN
        RAISE EXCEPTION 'العميل يفتقد لحساب الذمم المدينة المربوط.';
    END IF;
    PERFORM public.validate_master_data_account(v_receivable_account_id, p_org_id, 'assets', 'حساب ذمم العملاء');

    -- Build Description
    v_desc := 'قيد تلقائي لسند قبض رقم: ' || v_receipt_number || ' - العميل: ' || v_customer_name;
    IF v_reference IS NOT NULL AND v_reference <> '' THEN
        v_desc := v_desc || ' (مرجع: ' || v_reference || ')';
    END IF;

    -- Build Journal Entry lines JSON (Debit Bank/Cash, Credit Accounts Receivable)
    v_journal_lines := jsonb_build_array(
        jsonb_build_object(
            'account_id', v_debit_account_id,
            'description', v_desc || ' (استلام نقدية)',
            'debit', v_amount,
            'credit', 0.00
        ),
        jsonb_build_object(
            'account_id', v_receivable_account_id,
            'description', v_desc || ' (سداد العميل)',
            'debit', 0.00,
            'credit', v_amount
        )
    );

    -- Create and Post Journal entry
    v_journal_entry_id := public.create_journal_entry(
        p_org_id,
        v_receipt_date,
        v_receipt_number,
        v_desc,
        v_journal_lines
    );

    -- Update Entry source_type to system
    UPDATE public.journal_entries 
    SET source_type = 'system' 
    WHERE id = v_journal_entry_id;

    -- Post the entry
    PERFORM public.post_journal_entry(p_org_id, v_journal_entry_id);

    -- Process Allocations and update Invoice states
    FOR v_alloc IN 
        SELECT id, sales_invoice_id, allocated_amount 
        FROM public.receipt_allocations
        WHERE receipt_id = p_receipt_id AND organization_id = p_org_id
    LOOP
        -- Revalidate each invoice balance inside loop
        SELECT invoice_number, total, paid_amount, balance_due 
        INTO v_invoice_num, v_invoice_total, v_invoice_paid, v_invoice_bal
        FROM public.sales_invoices
        WHERE id = v_alloc.sales_invoice_id AND organization_id = p_org_id AND status = 'approved';

        IF v_invoice_num IS NULL THEN
            RAISE EXCEPTION 'إحدى الفواتير المخصصة غير صالحة أو غير معتمدة.';
        END IF;

        IF v_alloc.allocated_amount > v_invoice_bal THEN
            RAISE EXCEPTION
                'القيمة المخصصة للتحصيل (%) تتجاوز القيمة المستحقة المتبقية للفاتورة % (%).',
                v_alloc.allocated_amount,
                v_invoice_num,
                v_invoice_bal;
        END IF;

        v_alloc_sum := v_alloc_sum + v_alloc.allocated_amount;

        -- Calculations
        v_new_paid := v_invoice_paid + v_alloc.allocated_amount;
        v_new_bal := v_invoice_total - v_new_paid;

        IF v_new_bal <= 0 THEN
            v_pay_status := 'paid';
            v_new_bal := 0.00;
        ELSIF v_new_paid > 0 THEN
            v_pay_status := 'partially_paid';
        ELSE
            v_pay_status := 'unpaid';
        END IF;

        -- Update invoice totals and status
        UPDATE public.sales_invoices SET
            paid_amount = v_new_paid,
            balance_due = v_new_bal,
            payment_status = v_pay_status,
            updated_at = now()
        WHERE id = v_alloc.sales_invoice_id;
    END LOOP;

    IF v_alloc_sum > v_amount THEN
        RAISE EXCEPTION
            'مجموع التخصيصات الفعلي (%) تجاوز قيمة سند القبض (%).',
            v_alloc_sum,
            v_amount;
    END IF;

    -- Mark Receipt as Approved
    UPDATE public.receipts SET
        status = 'approved',
        journal_entry_id = v_journal_entry_id,
        approved_at = now(),
        approved_by = auth.uid(),
        updated_at = now()
    WHERE id = p_receipt_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'approve_receipt',
        jsonb_build_object(
            'receipt_id', p_receipt_id,
            'journal_entry_id', v_journal_entry_id,
            'status_from', 'draft',
            'status_to', 'approved'
        )
    );

    RETURN v_journal_entry_id;
END;
$$;


-- J. cancel_receipt
CREATE OR REPLACE FUNCTION public.cancel_receipt(
    p_org_id uuid,
    p_receipt_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
    v_journal_entry_id uuid;
    v_rev_entry_id uuid;
    v_alloc record;
    
    v_invoice_total numeric(15,2);
    v_invoice_paid numeric(15,2);
    v_new_paid numeric(15,2);
    v_new_bal numeric(15,2);
    v_pay_status text;
BEGIN
    -- Auth & Privilege check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إلغاء السندات متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Lock org_id
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Get Receipt info
    SELECT status, journal_entry_id 
    INTO v_status, v_journal_entry_id
    FROM public.receipts
    WHERE id = p_receipt_id AND organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'سند القبض غير موجود.';
    END IF;

    IF v_status <> 'approved' THEN
        RAISE EXCEPTION 'يمكن فقط إلغاء السندات المعتمدة (approved).';
    END IF;

    -- 1. Reverse allocation effects on invoices
    FOR v_alloc IN 
        SELECT sales_invoice_id, allocated_amount 
        FROM public.receipt_allocations
        WHERE receipt_id = p_receipt_id AND organization_id = p_org_id
    LOOP
        SELECT total, paid_amount INTO v_invoice_total, v_invoice_paid
        FROM public.sales_invoices
        WHERE id = v_alloc.sales_invoice_id AND organization_id = p_org_id;

        IF v_invoice_total IS NOT NULL THEN
            v_new_paid := v_invoice_paid - v_alloc.allocated_amount;
            IF v_new_paid < 0 THEN
                v_new_paid := 0.00;
            END IF;
            
            v_new_bal := v_invoice_total - v_new_paid;

            IF v_new_bal <= 0 THEN
                v_pay_status := 'paid';
            ELSIF v_new_paid > 0 THEN
                v_pay_status := 'partially_paid';
            ELSE
                v_pay_status := 'unpaid';
            END IF;

            UPDATE public.sales_invoices SET
                paid_amount = v_new_paid,
                balance_due = v_new_bal,
                payment_status = v_pay_status,
                updated_at = now()
            WHERE id = v_alloc.sales_invoice_id;
        END IF;
    END LOOP;

    -- 2. Reverse journal entry
    IF v_journal_entry_id IS NOT NULL THEN
        v_rev_entry_id := public.reverse_journal_entry(p_org_id, v_journal_entry_id);
    END IF;

    -- 3. Update receipt status to cancelled
    UPDATE public.receipts SET
        status = 'cancelled',
        cancelled_journal_entry_id = v_rev_entry_id,
        cancelled_at = now(),
        cancelled_by = auth.uid(),
        updated_at = now()
    WHERE id = p_receipt_id;

    IF v_rev_entry_id IS NOT NULL THEN
        UPDATE public.journal_entries 
        SET source_type = 'system' 
        WHERE id = v_rev_entry_id;
    END IF;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'cancel_receipt',
        jsonb_build_object(
            'receipt_id', p_receipt_id,
            'status_from', 'approved',
            'status_to', 'cancelled',
            'cancelled_journal_entry_id', v_rev_entry_id
        )
    );

    RETURN v_rev_entry_id;
END;
$$;


-- ==========================================================
-- GRANT EXECUTION ACCESS TO SECURE RPC WORKFLOWS
-- ==========================================================
REVOKE ALL ON FUNCTION public.create_sales_invoice(uuid, uuid, date, date, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_sales_invoice(uuid, uuid, uuid, date, date, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_draft_sales_invoice(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_sales_invoice(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_sales_invoice(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_sales_invoice(uuid, uuid, date, date, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_sales_invoice(uuid, uuid, uuid, date, date, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_draft_sales_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_sales_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_sales_invoice(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_receipt(uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_receipt(uuid, uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_draft_receipt(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_receipt(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_receipt(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_receipt(uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_receipt(uuid, uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_draft_receipt(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_receipt(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_receipt(uuid, uuid) TO authenticated;

COMMIT;
