-- ==========================================================
-- LEDGRA PHASE 6: PURCHASE BILLS AND PAYMENTS SCHEMA & API
-- ==========================================================

BEGIN;

-- Composite unique constraint on items table for consistent multi-tenant validation FK
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'items_id_org_unique'
          AND conrelid = 'public.items'::regclass
    ) THEN
        ALTER TABLE public.items
        ADD CONSTRAINT items_id_org_unique
        UNIQUE (id, organization_id);
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'sales_invoice_lines'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'sales_invoice_lines_item_org_fk'
          AND conrelid = 'public.sales_invoice_lines'::regclass
    ) THEN
        ALTER TABLE public.sales_invoice_lines
        ADD CONSTRAINT sales_invoice_lines_item_org_fk
        FOREIGN KEY (item_id, organization_id)
        REFERENCES public.items (id, organization_id)
        ON DELETE RESTRICT;
    END IF;
END $$;


-- 1. CREATE TABLE: purchase_bills
CREATE TABLE IF NOT EXISTS public.purchase_bills (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    vendor_id uuid REFERENCES public.vendors(id) ON DELETE RESTRICT NOT NULL,
    bill_number text NOT NULL,
    vendor_invoice_number text,
    bill_date date NOT NULL,
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

    CONSTRAINT purchase_bills_num_org_unique UNIQUE (organization_id, bill_number),
    CONSTRAINT purchase_bills_id_org_unique UNIQUE (id, organization_id)
);


-- 2. CREATE TABLE: purchase_bill_lines
CREATE TABLE IF NOT EXISTS public.purchase_bill_lines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_bill_id uuid NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    item_id uuid,
    line_number integer NOT NULL,
    description text,
    quantity numeric(15,2) NOT NULL CHECK (quantity > 0),
    unit_cost numeric(15,2) NOT NULL CHECK (unit_cost >= 0),
    discount_amount numeric(15,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    tax_rate numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (tax_rate >= 0),
    tax_amount numeric(15,2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    line_total numeric(15,2) NOT NULL DEFAULT 0.00 CHECK (line_total >= 0),
    expense_account_id uuid,
    inventory_account_id uuid,
    tax_account_id uuid,
    created_at timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT purchase_bill_lines_bill_org_fk FOREIGN KEY (purchase_bill_id, organization_id) REFERENCES public.purchase_bills (id, organization_id) ON DELETE CASCADE,
    CONSTRAINT purchase_bill_lines_item_org_fk FOREIGN KEY (item_id, organization_id) REFERENCES public.items (id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT purchase_bill_lines_exp_account_fk FOREIGN KEY (expense_account_id, organization_id) REFERENCES public.accounts(id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT purchase_bill_lines_inv_account_fk FOREIGN KEY (inventory_account_id, organization_id) REFERENCES public.accounts(id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT purchase_bill_lines_tax_account_fk FOREIGN KEY (tax_account_id, organization_id) REFERENCES public.accounts(id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT purchase_bill_line_discount_check CHECK (discount_amount <= (quantity * unit_cost))
);


-- 3. CREATE TABLE: payments
CREATE TABLE IF NOT EXISTS public.payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    vendor_id uuid REFERENCES public.vendors(id) ON DELETE RESTRICT NOT NULL,
    payment_number text NOT NULL,
    payment_date date NOT NULL,
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
    approved_at timestamptz,
    approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    cancelled_at timestamptz,
    cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

    CONSTRAINT payments_num_org_unique UNIQUE (organization_id, payment_number),
    CONSTRAINT payments_id_org_unique UNIQUE (id, organization_id),
    CONSTRAINT payments_cash_account_fk FOREIGN KEY (cash_account_id, organization_id) REFERENCES public.accounts(id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT payments_bank_account_fk FOREIGN KEY (bank_account_id, organization_id) REFERENCES public.accounts(id, organization_id) ON DELETE RESTRICT
);


-- 4. CREATE TABLE: payment_allocations
CREATE TABLE IF NOT EXISTS public.payment_allocations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    payment_id uuid NOT NULL,
    purchase_bill_id uuid NOT NULL,
    allocated_amount numeric(15,2) NOT NULL CHECK (allocated_amount > 0),
    created_at timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT payment_allocations_pay_org_fk FOREIGN KEY (payment_id, organization_id) REFERENCES public.payments (id, organization_id) ON DELETE CASCADE,
    CONSTRAINT payment_allocations_bill_org_fk FOREIGN KEY (purchase_bill_id, organization_id) REFERENCES public.purchase_bills (id, organization_id) ON DELETE RESTRICT
);


-- Performance Indexes
CREATE INDEX IF NOT EXISTS purchase_bills_org_idx ON public.purchase_bills (organization_id);
CREATE INDEX IF NOT EXISTS purchase_bills_vendor_idx ON public.purchase_bills (organization_id, vendor_id);
CREATE INDEX IF NOT EXISTS purchase_bill_lines_bill_idx ON public.purchase_bill_lines (purchase_bill_id);
CREATE INDEX IF NOT EXISTS payments_org_idx ON public.payments (organization_id);
CREATE INDEX IF NOT EXISTS payments_vendor_idx ON public.payments (organization_id, vendor_id);
CREATE INDEX IF NOT EXISTS payment_allocations_pay_idx ON public.payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS payment_allocations_bill_idx ON public.payment_allocations (purchase_bill_id);


-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select purchase_bills" ON public.purchase_bills;
CREATE POLICY "Select purchase_bills" ON public.purchase_bills 
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Select purchase_bill_lines" ON public.purchase_bill_lines;
CREATE POLICY "Select purchase_bill_lines" ON public.purchase_bill_lines 
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Select payments" ON public.payments;
CREATE POLICY "Select payments" ON public.payments 
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Select payment_allocations" ON public.payment_allocations;
CREATE POLICY "Select payment_allocations" ON public.payment_allocations 
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


-- Restrict Direct Writes
REVOKE ALL ON TABLE public.purchase_bills FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.purchase_bill_lines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payment_allocations FROM PUBLIC, anon, authenticated;

-- Grant Selects to active logged-in tenants
GRANT SELECT ON TABLE public.purchase_bills TO authenticated;
GRANT SELECT ON TABLE public.purchase_bill_lines TO authenticated;
GRANT SELECT ON TABLE public.payments TO authenticated;
GRANT SELECT ON TABLE public.payment_allocations TO authenticated;


-- ==========================================================
-- AUTOMATIC SEQUENTIAL NUMBERING GENERATORS ON INSERT
-- ==========================================================

CREATE OR REPLACE FUNCTION public.generate_purchase_bill_number()
RETURNS trigger AS $$
DECLARE
    v_year_str text;
    v_next_num integer;
    v_seq_lock_label text;
BEGIN
    v_year_str := to_char(NEW.bill_date, 'YYYY');
    v_seq_lock_label := NEW.organization_id::text || ':purchase_bill:' || v_year_str;
    
    -- Take an advisory transaction lock specifically for sequential numbering
    PERFORM pg_advisory_xact_lock(hashtext(v_seq_lock_label));
    
    SELECT COALESCE(
        MAX(
            NULLIF(
                regexp_replace(bill_number, '^PB-' || v_year_str || '-', ''),
                bill_number
            )::integer
        ), 0
    ) + 1
    INTO v_next_num
    FROM public.purchase_bills
    WHERE organization_id = NEW.organization_id
      AND bill_number LIKE 'PB-' || v_year_str || '-%';

    NEW.bill_number := 'PB-' || v_year_str || '-' || lpad(v_next_num::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_generate_purchase_bill_number ON public.purchase_bills;
CREATE TRIGGER trg_generate_purchase_bill_number
    BEFORE INSERT ON public.purchase_bills
    FOR EACH ROW
    WHEN (NEW.bill_number IS NULL OR NEW.bill_number = '')
    EXECUTE FUNCTION public.generate_purchase_bill_number();


CREATE OR REPLACE FUNCTION public.generate_payment_number()
RETURNS trigger AS $$
DECLARE
    v_year_str text;
    v_next_num integer;
    v_seq_lock_label text;
BEGIN
    v_year_str := to_char(NEW.payment_date, 'YYYY');
    v_seq_lock_label := NEW.organization_id::text || ':payment:' || v_year_str;
    
    -- Take an advisory transaction lock specifically for sequential numbering
    PERFORM pg_advisory_xact_lock(hashtext(v_seq_lock_label));
    
    SELECT COALESCE(
        MAX(
            NULLIF(
                regexp_replace(payment_number, '^PAY-' || v_year_str || '-', ''),
                payment_number
            )::integer
        ), 0
    ) + 1
    INTO v_next_num
    FROM public.payments
    WHERE organization_id = NEW.organization_id
      AND payment_number LIKE 'PAY-' || v_year_str || '-%';

    NEW.payment_number := 'PAY-' || v_year_str || '-' || lpad(v_next_num::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_generate_payment_number ON public.payments;
CREATE TRIGGER trg_generate_payment_number
    BEFORE INSERT ON public.payments
    FOR EACH ROW
    WHEN (NEW.payment_number IS NULL OR NEW.payment_number = '')
    EXECUTE FUNCTION public.generate_payment_number();


-- Timestamptz updated_at hooks
DROP TRIGGER IF EXISTS trg_set_updated_at_purchase_bills ON public.purchase_bills;
CREATE TRIGGER trg_set_updated_at_purchase_bills
    BEFORE UPDATE ON public.purchase_bills
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_payments ON public.payments;
CREATE TRIGGER trg_set_updated_at_payments
    BEFORE UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();


-- ==========================================================
-- SECURE TRANSACTIONAL API (PL/PGSQL RPC FUNCTIONS)
-- ==========================================================

-- A. create_purchase_bill
CREATE OR REPLACE FUNCTION public.create_purchase_bill(
    p_org_id uuid,
    p_vendor_id uuid,
    p_vendor_invoice_number text,
    p_bill_date date,
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
    v_bill_id uuid;
    v_line jsonb;
    v_line_number integer := 1;
    v_item_id uuid;
    v_description text;
    v_quantity numeric(15,2);
    v_unit_cost numeric(15,2);
    v_discount_amount numeric(15,2);
    v_tax_rate numeric(5,2);
    v_tax_amount numeric(15,2);
    v_line_total numeric(15,2);
    v_expense_account_id uuid;
    v_inventory_account_id uuid;
    v_tax_account_id uuid;
    
    v_subtotal numeric(15,2) := 0.00;
    v_discount_total numeric(15,2) := 0.00;
    v_tax_total numeric(15,2) := 0.00;
    v_total numeric(15,2) := 0.00;
    v_default_tax_input_account_id uuid;
    v_default_item_account_id uuid;
    v_is_stockable boolean;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;
    
    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إدارة فواتير المشتريات متاحة للمالك والمدير والمحاسب فقط.';
    END IF;

    -- Verify vendor belongs to organization
    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_vendor_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'المورد المحدد غير موجود أو غير نشط في هذه المنشأة.';
    END IF;

    -- Verify lines is an array and not empty
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'الفاتورة يجب أن تحتوي على بند واحد على الأقل.';
    END IF;

    -- Fetch default input tax account from organization settings
    SELECT default_tax_input_account_id
    INTO v_default_tax_input_account_id
    FROM public.accounting_settings
    WHERE organization_id = p_org_id;

    -- Protect sequential numbering from concurrency race conditions using advisory lock
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':purchase_bill:' || to_char(p_bill_date, 'YYYY'))
    );

    -- Insert Draft Bill Header (Trigger generates bill_number)
    INSERT INTO public.purchase_bills (
        organization_id, vendor_id, bill_number, vendor_invoice_number, bill_date, due_date, 
        status, payment_status, subtotal, discount_total, tax_total, total, 
        paid_amount, balance_due, currency, notes, created_by
    ) VALUES (
        p_org_id, p_vendor_id, '', trim(p_vendor_invoice_number), p_bill_date, p_due_date, 
        'draft', 'unpaid', 0, 0, 0, 0, 
        0, 0, 'SAR', trim(p_notes), auth.uid()
    ) RETURNING id INTO v_bill_id;

    -- Loop through lines to validate and insert
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_item_id := null;
        IF v_line->>'item_id' IS NOT NULL AND trim(v_line->>'item_id') <> '' THEN
            v_item_id := (v_line->>'item_id')::uuid;
        END IF;
        
        IF v_line->>'quantity' IS NULL OR trim(v_line->>'quantity') = '' THEN
            RAISE EXCEPTION 'الكمية مطلوبة في السطر %.', v_line_number;
        END IF;
        
        IF v_line->>'unit_cost' IS NULL OR trim(v_line->>'unit_cost') = '' THEN
            RAISE EXCEPTION 'تكلفة الوحدة مطلوبة في السطر %.', v_line_number;
        END IF;

        v_description := trim(COALESCE(v_line->>'description', ''));
        v_quantity := (v_line->>'quantity')::numeric;
        v_unit_cost := (v_line->>'unit_cost')::numeric;

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

        IF v_unit_cost < 0 THEN
            RAISE EXCEPTION 'تكلفة الوحدة في السطر % لا يمكن أن تكون سالبة.', v_line_number;
        END IF;

        IF v_discount_amount < 0 THEN
            RAISE EXCEPTION 'الخصم في السطر % لا يمكن أن يكون سالباً.', v_line_number;
        END IF;

        IF v_discount_amount > (v_quantity * v_unit_cost) THEN
            RAISE EXCEPTION 'الخصم في السطر % لا يمكن أن يتجاوز إجمالي السطر قبل الخصم.', v_line_number;
        END IF;

        -- Extract custom accounts
        v_expense_account_id := null;
        IF v_line->>'expense_account_id' IS NOT NULL AND trim(v_line->>'expense_account_id') <> '' THEN
            v_expense_account_id := (v_line->>'expense_account_id')::uuid;
        END IF;

        v_inventory_account_id := null;
        IF v_line->>'inventory_account_id' IS NOT NULL AND trim(v_line->>'inventory_account_id') <> '' THEN
            v_inventory_account_id := (v_line->>'inventory_account_id')::uuid;
        END IF;

        -- Item resolution fallbacks
        IF v_item_id IS NOT NULL THEN
            SELECT 
                CASE WHEN is_stockable THEN inventory_account_id ELSE expense_account_id END,
                is_stockable
            INTO v_default_item_account_id, v_is_stockable
            FROM public.items
            WHERE id = v_item_id AND organization_id = p_org_id AND is_active = true;

            IF v_expense_account_id IS NULL AND v_inventory_account_id IS NULL THEN
                IF v_is_stockable THEN
                    v_inventory_account_id := v_default_item_account_id;
                ELSE
                    v_expense_account_id := v_default_item_account_id;
                END IF;
            END IF;
        END IF;

        -- Validate accounts
        IF v_expense_account_id IS NOT NULL THEN
            PERFORM public.validate_master_data_account(v_expense_account_id, p_org_id, 'expenses', 'حساب المصروف السطر ' || v_line_number);
        ELSIF v_inventory_account_id IS NOT NULL THEN
            PERFORM public.validate_master_data_account(v_inventory_account_id, p_org_id, 'assets', 'حساب المخزون السطر ' || v_line_number);
        ELSE
            RAISE EXCEPTION 'يجب تحديد حساب مصروف أو حساب مخزون للسطر %.', v_line_number;
        END IF;

        -- Calculate tax and total for this line
        v_tax_amount := round(((v_quantity * v_unit_cost - v_discount_amount) * (v_tax_rate / 100.00)), 2);
        v_line_total := (v_quantity * v_unit_cost) - v_discount_amount + v_tax_amount;

        -- Map tax account if tax applies
        IF v_tax_rate > 0 THEN
            v_tax_account_id := v_default_tax_input_account_id;
            IF v_tax_account_id IS NULL THEN
                RAISE EXCEPTION 'نسبة الضريبة مطبقة في السطر % ولكن لم يتم تهيئة حساب ضريبة المدخلات في الإعدادات المحاسبية.', v_line_number;
            END IF;
            PERFORM public.validate_master_data_account(v_tax_account_id, p_org_id, 'assets', 'حساب ضريبة المدخلات');
        ELSE
            v_tax_account_id := null;
        END IF;

        -- Insert line item
        INSERT INTO public.purchase_bill_lines (
            purchase_bill_id, organization_id, item_id, line_number, description, 
            quantity, unit_cost, discount_amount, tax_rate, tax_amount, line_total, 
            expense_account_id, inventory_account_id, tax_account_id
        ) VALUES (
            v_bill_id, p_org_id, v_item_id, v_line_number, v_description, 
            v_quantity, v_unit_cost, v_discount_amount, v_tax_rate, v_tax_amount, v_line_total, 
            v_expense_account_id, v_inventory_account_id, v_tax_account_id
        );

        -- Accumulate totals
        v_subtotal := v_subtotal + (v_quantity * v_unit_cost);
        v_discount_total := v_discount_total + v_discount_amount;
        v_tax_total := v_tax_total + v_tax_amount;
        v_total := v_total + v_line_total;

        v_line_number := v_line_number + 1;
    END LOOP;

    -- Update final sums in Header table
    UPDATE public.purchase_bills SET
        subtotal = v_subtotal,
        discount_total = v_discount_total,
        tax_total = v_tax_total,
        total = v_total,
        balance_due = v_total
    WHERE id = v_bill_id;

    -- Log to Audit Trail
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'CREATE_PURCHASE_BILL', jsonb_build_object('bill_id', v_bill_id, 'total', v_total));

    RETURN v_bill_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_bill(uuid, uuid, text, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_bill(uuid, uuid, text, date, date, text, jsonb) TO authenticated;


-- B. update_purchase_bill
CREATE OR REPLACE FUNCTION public.update_purchase_bill(
    p_org_id uuid,
    p_bill_id uuid,
    p_vendor_id uuid,
    p_vendor_invoice_number text,
    p_bill_date date,
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
    v_unit_cost numeric(15,2);
    v_discount_amount numeric(15,2);
    v_tax_rate numeric(5,2);
    v_tax_amount numeric(15,2);
    v_line_total numeric(15,2);
    v_expense_account_id uuid;
    v_inventory_account_id uuid;
    v_tax_account_id uuid;
    
    v_subtotal numeric(15,2) := 0.00;
    v_discount_total numeric(15,2) := 0.00;
    v_tax_total numeric(15,2) := 0.00;
    v_total numeric(15,2) := 0.00;
    v_default_tax_input_account_id uuid;
    v_default_item_account_id uuid;
    v_is_stockable boolean;
    v_paid_amount numeric(15,2);
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;
    
    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إدارة فواتير المشتريات متاحة للمالك والمدير والمحاسب فقط.';
    END IF;

    -- Get status and lock
    SELECT status, paid_amount INTO v_status, v_paid_amount
    FROM public.purchase_bills
    WHERE id = p_bill_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'الفاتورة غير موجودة أو لا تنتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن تعديل فاتورة مشتريات معتمدة أو ملغاة.';
    END IF;

    -- Verify vendor belongs to organization
    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_vendor_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'المورد المحدد غير موجود أو غير نشط في هذه المنشأة.';
    END IF;

    -- Verify lines is an array and not empty
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'الفاتورة يجب أن تحتوي على بند واحد على الأقل.';
    END IF;

    -- Fetch default input tax account from organization settings
    SELECT default_tax_input_account_id
    INTO v_default_tax_input_account_id
    FROM public.accounting_settings
    WHERE organization_id = p_org_id;

    -- Update header
    UPDATE public.purchase_bills SET
        vendor_id = p_vendor_id,
        vendor_invoice_number = trim(p_vendor_invoice_number),
        bill_date = p_bill_date,
        due_date = p_due_date,
        notes = trim(p_notes)
    WHERE id = p_bill_id;

    -- Delete old lines
    DELETE FROM public.purchase_bill_lines WHERE purchase_bill_id = p_bill_id;

    -- Loop through lines to validate and insert
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_item_id := null;
        IF v_line->>'item_id' IS NOT NULL AND trim(v_line->>'item_id') <> '' THEN
            v_item_id := (v_line->>'item_id')::uuid;
        END IF;
        
        IF v_line->>'quantity' IS NULL OR trim(v_line->>'quantity') = '' THEN
            RAISE EXCEPTION 'الكمية مطلوبة في السطر %.', v_line_number;
        END IF;
        
        IF v_line->>'unit_cost' IS NULL OR trim(v_line->>'unit_cost') = '' THEN
            RAISE EXCEPTION 'تكلفة الوحدة مطلوبة في السطر %.', v_line_number;
        END IF;

        v_description := trim(COALESCE(v_line->>'description', ''));
        v_quantity := (v_line->>'quantity')::numeric;
        v_unit_cost := (v_line->>'unit_cost')::numeric;

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

        IF v_unit_cost < 0 THEN
            RAISE EXCEPTION 'تكلفة الوحدة في السطر % لا يمكن أن تكون سالبة.', v_line_number;
        END IF;

        IF v_discount_amount < 0 THEN
            RAISE EXCEPTION 'الخصم في السطر % لا يمكن أن يكون سالباً.', v_line_number;
        END IF;

        IF v_discount_amount > (v_quantity * v_unit_cost) THEN
            RAISE EXCEPTION 'الخصم في السطر % لا يمكن أن يتجاوز إجمالي السطر قبل الخصم.', v_line_number;
        END IF;

        -- Extract custom accounts
        v_expense_account_id := null;
        IF v_line->>'expense_account_id' IS NOT NULL AND trim(v_line->>'expense_account_id') <> '' THEN
            v_expense_account_id := (v_line->>'expense_account_id')::uuid;
        END IF;

        v_inventory_account_id := null;
        IF v_line->>'inventory_account_id' IS NOT NULL AND trim(v_line->>'inventory_account_id') <> '' THEN
            v_inventory_account_id := (v_line->>'inventory_account_id')::uuid;
        END IF;

        -- Item resolution fallbacks
        IF v_item_id IS NOT NULL THEN
            SELECT 
                CASE WHEN is_stockable THEN inventory_account_id ELSE expense_account_id END,
                is_stockable
            INTO v_default_item_account_id, v_is_stockable
            FROM public.items
            WHERE id = v_item_id AND organization_id = p_org_id AND is_active = true;

            IF v_expense_account_id IS NULL AND v_inventory_account_id IS NULL THEN
                IF v_is_stockable THEN
                    v_inventory_account_id := v_default_item_account_id;
                ELSE
                    v_expense_account_id := v_default_item_account_id;
                END IF;
            END IF;
        END IF;

        -- Validate accounts
        IF v_expense_account_id IS NOT NULL THEN
            PERFORM public.validate_master_data_account(v_expense_account_id, p_org_id, 'expenses', 'حساب المصروف السطر ' || v_line_number);
        ELSIF v_inventory_account_id IS NOT NULL THEN
            PERFORM public.validate_master_data_account(v_inventory_account_id, p_org_id, 'assets', 'حساب المخزون السطر ' || v_line_number);
        ELSE
            RAISE EXCEPTION 'يجب تحديد حساب مصروف أو حساب مخزون للسطر %.', v_line_number;
        END IF;

        -- Calculate tax and total for this line
        v_tax_amount := round(((v_quantity * v_unit_cost - v_discount_amount) * (v_tax_rate / 100.00)), 2);
        v_line_total := (v_quantity * v_unit_cost) - v_discount_amount + v_tax_amount;

        -- Map tax account if tax applies
        IF v_tax_rate > 0 THEN
            v_tax_account_id := v_default_tax_input_account_id;
            IF v_tax_account_id IS NULL THEN
                RAISE EXCEPTION 'نسبة الضريبة مطبقة في السطر % ولكن لم يتم تهيئة حساب ضريبة المدخلات في الإعدادات المحاسبية.', v_line_number;
            END IF;
            PERFORM public.validate_master_data_account(v_tax_account_id, p_org_id, 'assets', 'حساب ضريبة المدخلات');
        ELSE
            v_tax_account_id := null;
        END IF;

        -- Insert line item
        INSERT INTO public.purchase_bill_lines (
            purchase_bill_id, organization_id, item_id, line_number, description, 
            quantity, unit_cost, discount_amount, tax_rate, tax_amount, line_total, 
            expense_account_id, inventory_account_id, tax_account_id
        ) VALUES (
            p_bill_id, p_org_id, v_item_id, v_line_number, v_description, 
            v_quantity, v_unit_cost, v_discount_amount, v_tax_rate, v_tax_amount, v_line_total, 
            v_expense_account_id, v_inventory_account_id, v_tax_account_id
        );

        -- Accumulate totals
        v_subtotal := v_subtotal + (v_quantity * v_unit_cost);
        v_discount_total := v_discount_total + v_discount_amount;
        v_tax_total := v_tax_total + v_tax_amount;
        v_total := v_total + v_line_total;

        v_line_number := v_line_number + 1;
    END LOOP;

    -- Update final sums in Header table
    UPDATE public.purchase_bills SET
        subtotal = v_subtotal,
        discount_total = v_discount_total,
        tax_total = v_tax_total,
        total = v_total,
        balance_due = v_total - v_paid_amount,
        payment_status = CASE 
            WHEN v_paid_amount = 0 THEN 'unpaid'::text
            WHEN v_paid_amount >= v_total THEN 'paid'::text
            ELSE 'partially_paid'::text
        END
    WHERE id = p_bill_id;

    -- Log to Audit Trail
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'UPDATE_PURCHASE_BILL', jsonb_build_object('bill_id', p_bill_id, 'total', v_total));
END;
$$;

REVOKE ALL ON FUNCTION public.update_purchase_bill(uuid, uuid, uuid, text, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_purchase_bill(uuid, uuid, uuid, text, date, date, text, jsonb) TO authenticated;


-- C. approve_purchase_bill
CREATE OR REPLACE FUNCTION public.approve_purchase_bill(
    p_org_id uuid,
    p_bill_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_bill_number text;
    v_vendor_id uuid;
    v_vendor_name text;
    v_bill_date date;
    v_total numeric(15,2);
    v_tax_total numeric(15,2);
    v_status text;
    v_payable_account_id uuid;
    v_default_tax_input_account_id uuid;
    
    v_journal_lines jsonb := '[]'::jsonb;
    v_line_item record;
    v_journal_entry_id uuid;
    v_desc text;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;
    
    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: الاعتماد متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Get bill header and vendor payable account
    SELECT b.bill_number, b.vendor_id, b.bill_date, b.total, b.tax_total, b.status, v.name, v.payable_account_id
    INTO v_bill_number, v_vendor_id, v_bill_date, v_total, v_tax_total, v_status, v_vendor_name, v_payable_account_id
    FROM public.purchase_bills b
    JOIN public.vendors v ON b.vendor_id = v.id
    WHERE b.id = p_bill_id AND b.organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'فاتورة الشراء غير موجودة أو لا تنتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'الفاتورة معتمدة بالفعل أو ملغاة ولا يمكن اعتمادها مجدداً.';
    END IF;

    IF v_payable_account_id IS NULL THEN
        RAISE EXCEPTION 'المورد المحدد يفتقد لحساب الذمم الدائنة المربوط.';
    END IF;

    -- Validate Payable account
    PERFORM public.validate_master_data_account(v_payable_account_id, p_org_id, 'liabilities', 'حساب ذمم الموردين');

    -- Build Description
    v_desc := 'قيد تلقائي لفاتورة مشتريات رقم: ' || v_bill_number || ' - المورد: ' || v_vendor_name;

    -- Construct journal lines
    -- 1. Debit lines: Expenses or Inventory accounts from the lines
    FOR v_line_item IN 
        SELECT COALESCE(expense_account_id, inventory_account_id) as line_account_id, 
               SUM((quantity * unit_cost) - discount_amount) as net_amount,
               CASE WHEN expense_account_id IS NOT NULL THEN 'expenses' ELSE 'assets' END as class_type
        FROM public.purchase_bill_lines
        WHERE purchase_bill_id = p_bill_id
        GROUP BY COALESCE(expense_account_id, inventory_account_id), CASE WHEN expense_account_id IS NOT NULL THEN 'expenses' ELSE 'assets' END
    LOOP
        IF v_line_item.net_amount > 0 THEN
            -- validate line account
            PERFORM public.validate_master_data_account(v_line_item.line_account_id, p_org_id, v_line_item.class_type, 'حساب البند');

            v_journal_lines := v_journal_lines || jsonb_build_object(
                'account_id', v_line_item.line_account_id,
                'description', v_desc || CASE WHEN v_line_item.class_type = 'expenses' THEN ' (مصروف)' ELSE ' (مخزون وبضاعة)' END,
                'debit', v_line_item.net_amount,
                'credit', 0.00
            );
        END IF;
    END LOOP;

    -- 2. Debit input VAT if tax_total > 0
    IF v_tax_total > 0 THEN
        SELECT default_tax_input_account_id
        INTO v_default_tax_input_account_id
        FROM public.accounting_settings
        WHERE organization_id = p_org_id;

        IF v_default_tax_input_account_id IS NULL THEN
            RAISE EXCEPTION 'توجد ضريبة على الفاتورة ولكن لم يتم تهيئة حساب ضريبة المدخلات في الإعدادات المحاسبية.';
        END IF;

        PERFORM public.validate_master_data_account(v_default_tax_input_account_id, p_org_id, 'assets', 'حساب ضريبة المدخلات');

        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_id', v_default_tax_input_account_id,
            'description', v_desc || ' (ضريبة مدخلات %15)',
            'debit', v_tax_total,
            'credit', 0.00
        );
    END IF;

    -- 3. Credit line: full amount into Vendor Payable Account
    v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_payable_account_id,
        'description', v_desc,
        'debit', 0.00,
        'credit', v_total
    );

    -- Post the journal entries
    v_journal_entry_id := public.create_journal_entry(
        p_org_id,
        v_bill_date,
        v_bill_number,
        v_desc,
        v_journal_lines
    );

    UPDATE public.journal_entries
    SET source_type = 'system'
    WHERE id = v_journal_entry_id
      AND organization_id = p_org_id;

    PERFORM public.post_journal_entry(p_org_id, v_journal_entry_id);

    -- Update Header status & journal_entry_id
    UPDATE public.purchase_bills SET
        status = 'approved',
        journal_entry_id = v_journal_entry_id,
        approved_at = now(),
        approved_by = auth.uid()
    WHERE id = p_bill_id AND organization_id = p_org_id;

    -- Audit log
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'APPROVE_PURCHASE_BILL', jsonb_build_object('bill_id', p_bill_id, 'journal_entry_id', v_journal_entry_id, 'bill_number', v_bill_number));

    RETURN v_journal_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_purchase_bill(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_bill(uuid, uuid) TO authenticated;


-- D. cancel_purchase_bill
CREATE OR REPLACE FUNCTION public.cancel_purchase_bill(
    p_org_id uuid,
    p_bill_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
    v_journal_entry_id uuid;
    v_rev_entry_id uuid := null;
    v_bill_number text;
BEGIN
    -- Auth & Privilege check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: الإلغاء متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Get status & journal_entry
    SELECT status, journal_entry_id, bill_number
    INTO v_status, v_journal_entry_id, v_bill_number
    FROM public.purchase_bills
    WHERE id = p_bill_id AND organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'فاتورة الشراء غير موجودة أو لا تنتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'approved' THEN
        RAISE EXCEPTION 'يمكن إلغاء الفواتير المعتمدة فقط.';
    END IF;

    -- Block if there are approved payments
    IF EXISTS (
        SELECT 1 
        FROM public.payment_allocations a
        JOIN public.payments p ON a.payment_id = p.id
        WHERE a.purchase_bill_id = p_bill_id AND p.status = 'approved'
    ) THEN
        RAISE EXCEPTION 'لا يمكن إلغاء فاتورة عليها سندات صرف معتمدة ربطاً بالمورد.';
    END IF;

    -- Reverse Journal Entry
    IF v_journal_entry_id IS NOT NULL THEN
        v_rev_entry_id := public.reverse_journal_entry(p_org_id, v_journal_entry_id);
    END IF;

    -- Update Purchase Bill status
    UPDATE public.purchase_bills SET
        status = 'cancelled',
        cancelled_journal_entry_id = v_rev_entry_id,
        cancelled_at = now(),
        cancelled_by = auth.uid()
    WHERE id = p_bill_id;

    -- Log transaction
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'CANCEL_PURCHASE_BILL', jsonb_build_object('bill_id', p_bill_id, 'cancelled_journal_entry_id', v_rev_entry_id, 'bill_number', v_bill_number));

    RETURN v_rev_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_purchase_bill(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_bill(uuid, uuid) TO authenticated;


-- E. delete_draft_purchase_bill
CREATE OR REPLACE FUNCTION public.delete_draft_purchase_bill(
    p_org_id uuid,
    p_bill_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
BEGIN
    -- Auth & Privilege check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: الحذف متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Get status
    SELECT status INTO v_status
    FROM public.purchase_bills
    WHERE id = p_bill_id AND organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'الفاتورة غير موجودة أو لا تنتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن حذف سوى فواتير المشتريات المسودة (draft).';
    END IF;

    -- Delete lines
    DELETE FROM public.purchase_bill_lines WHERE purchase_bill_id = p_bill_id;
    DELETE FROM public.purchase_bills WHERE id = p_bill_id;

    -- Audit trail
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'DELETE_PURCHASE_BILL', jsonb_build_object('bill_id', p_bill_id));
END;
$$;

REVOKE ALL ON FUNCTION public.delete_draft_purchase_bill(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_draft_purchase_bill(uuid, uuid) TO authenticated;


-- F. create_payment
CREATE OR REPLACE FUNCTION public.create_payment(
    p_org_id uuid,
    p_vendor_id uuid,
    p_payment_date date,
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
    v_payment_id uuid;
    v_alloc jsonb;
    v_bill_id uuid;
    v_alloc_amt numeric(15,2);
    v_vendor_check uuid;
    v_balance_due numeric(15,2);
    v_allocated_sum numeric(15,2) := 0.00;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;
    
    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إدارة سندات الصرف متاحة للمالك والمدير والمحاسب فقط.';
    END IF;

    -- Vendor check
    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_vendor_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'المورد المحدد غير موجود أو غير نشط.';
    END IF;

    -- Amount check
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'المبلغ الإجمالي للسند يجب أن يكون أكبر من الصفر.';
    END IF;

    -- Allocations check
    IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
        RAISE EXCEPTION 'يجب تخصيص سند الصرف على فاتورة شراء معتمدة واحدة على الأقل في هذه المرحلة.';
    END IF;

    -- Method specific validations
    IF p_payment_method = 'cash' THEN
        IF p_cash_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى اختيار حساب الصندوق/الخزينة لطريقة الصرف النقدي.';
        END IF;
        PERFORM public.validate_master_data_account(p_cash_account_id, p_org_id, 'assets', 'حساب الصندوق/الخزينة');
    ELSIF p_payment_method IN ('bank_transfer', 'card') THEN
        IF p_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى اختيار حساب البنك لطرق الصرف البنكية.';
        END IF;
        PERFORM public.validate_master_data_account(p_bank_account_id, p_org_id, 'assets', 'حساب البنك');
    END IF;

    -- Protect sequential numbering
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':payment:' || to_char(p_payment_date, 'YYYY'))
    );

    -- Create Payment Header
    INSERT INTO public.payments (
        organization_id, vendor_id, payment_number, payment_date, amount,
        payment_method, cash_account_id, bank_account_id, reference, notes,
        status, created_by
    ) VALUES (
        p_org_id, p_vendor_id, '', p_payment_date, p_amount,
        p_payment_method, p_cash_account_id, p_bank_account_id, trim(p_reference), trim(p_notes),
        'draft', auth.uid()
    ) RETURNING id INTO v_payment_id;

    -- Handle Allocations
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        IF v_alloc->>'purchase_bill_id' IS NULL OR trim(v_alloc->>'purchase_bill_id') = '' THEN
            RAISE EXCEPTION 'رقم الفاتورة (purchase_bill_id) مطلوب في التخصيص.';
        END IF;

        IF v_alloc->>'allocated_amount' IS NULL OR trim(v_alloc->>'allocated_amount') = '' THEN
            RAISE EXCEPTION 'القيمة المخصصة (allocated_amount) مطلوبة في التخصيص.';
        END IF;

        v_bill_id := (v_alloc->>'purchase_bill_id')::uuid;
        v_alloc_amt := (v_alloc->>'allocated_amount')::numeric;

        IF v_alloc_amt <= 0 THEN
            RAISE EXCEPTION 'المبلغ المخصص في التوزيع يجب أن يكون أكبر من الصفر.';
        END IF;

        -- Verify bill belongs to same vendor/org and is approved
        SELECT vendor_id, balance_due INTO v_vendor_check, v_balance_due
        FROM public.purchase_bills
        WHERE id = v_bill_id AND organization_id = p_org_id AND status = 'approved';

        IF v_vendor_check IS NULL THEN
            RAISE EXCEPTION 'إحدى الفواتير المختارة للتخصيص غير موجودة أو ليست في حالة معتمد (approved).';
        END IF;

        IF v_vendor_check <> p_vendor_id THEN
            RAISE EXCEPTION 'لا يمكن تخصيص سند الصرف لمورد آخر غير المورد المحدد في الفاتورة.';
        END IF;

        IF v_alloc_amt > v_balance_due THEN
            RAISE EXCEPTION 'المبلغ المخصص (%) يتجاوز الرصيد المتبقي المستحق على الفاتورة (%).', v_alloc_amt, v_balance_due;
        END IF;

        v_allocated_sum := v_allocated_sum + v_alloc_amt;

        -- Insert allocation
        INSERT INTO public.payment_allocations (
            organization_id, payment_id, purchase_bill_id, allocated_amount
        ) VALUES (
            p_org_id, v_payment_id, v_bill_id, v_alloc_amt
        );
    END LOOP;

    -- Total allocated sum must equal payment amount check
    IF round(v_allocated_sum, 2) <> round(p_amount, 2) THEN
        RAISE EXCEPTION
          'يجب أن يساوي مجموع المبالغ المخصصة (%) القيمة الإجمالية لسند الصرف (%).',
          v_allocated_sum,
          p_amount;
    END IF;

    -- Log action
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'CREATE_PAYMENT', jsonb_build_object('payment_id', v_payment_id, 'amount', p_amount));

    RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb) TO authenticated;


-- G. update_payment
CREATE OR REPLACE FUNCTION public.update_payment(
    p_org_id uuid,
    p_payment_id uuid,
    p_vendor_id uuid,
    p_payment_date date,
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
    v_bill_id uuid;
    v_alloc_amt numeric(15,2);
    v_vendor_check uuid;
    v_balance_due numeric(15,2);
    v_allocated_sum numeric(15,2) := 0.00;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;
    
    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إدارة سندات الصرف متاحة للمالك والمدير والمحاسب فقط.';
    END IF;

    -- Get status and lock
    SELECT status INTO v_status
    FROM public.payments
    WHERE id = p_payment_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'سند الصرف غير موجود أو لا ينتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن تعديل سند صرف معتمد أو ملغى.';
    END IF;

    -- Vendor check
    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_vendor_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'المورد المحدد غير موجود أو غير نشط.';
    END IF;

    -- Amount check
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'المبلغ الإجمالي للسند يجب أن يكون أكبر من الصفر.';
    END IF;

    -- Allocations check
    IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
        RAISE EXCEPTION 'يجب تخصيص سند الصرف على فاتورة شراء معتمدة واحدة على الأقل في هذه المرحلة.';
    END IF;

    -- Method specific validations
    IF p_payment_method = 'cash' THEN
        IF p_cash_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى اختيار حساب الصندوق/الخزينة لطريقة الصرف النقدي.';
        END IF;
        PERFORM public.validate_master_data_account(p_cash_account_id, p_org_id, 'assets', 'حساب الصندوق/الخزينة');
    ELSIF p_payment_method IN ('bank_transfer', 'card') THEN
        IF p_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى اختيار حساب البنك لطرق الصرف البنكية.';
        END IF;
        PERFORM public.validate_master_data_account(p_bank_account_id, p_org_id, 'assets', 'حساب البنك');
    END IF;

    -- Update Payment Header
    UPDATE public.payments SET
        vendor_id = p_vendor_id,
        payment_date = p_payment_date,
        amount = p_amount,
        payment_method = p_payment_method,
        cash_account_id = p_cash_account_id,
        bank_account_id = p_bank_account_id,
        reference = trim(p_reference),
        notes = trim(p_notes)
    WHERE id = p_payment_id;

    -- Delete old allocations
    DELETE FROM public.payment_allocations WHERE payment_id = p_payment_id;

    -- Handle Allocations
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        IF v_alloc->>'purchase_bill_id' IS NULL OR trim(v_alloc->>'purchase_bill_id') = '' THEN
            RAISE EXCEPTION 'رقم الفاتورة (purchase_bill_id) مطلوب في التخصيص.';
        END IF;

        IF v_alloc->>'allocated_amount' IS NULL OR trim(v_alloc->>'allocated_amount') = '' THEN
            RAISE EXCEPTION 'القيمة المخصصة (allocated_amount) مطلوبة في التخصيص.';
        END IF;

        v_bill_id := (v_alloc->>'purchase_bill_id')::uuid;
        v_alloc_amt := (v_alloc->>'allocated_amount')::numeric;

        IF v_alloc_amt <= 0 THEN
            RAISE EXCEPTION 'المبلغ المخصص في التوزيع يجب أن يكون أكبر من الصفر.';
        END IF;

        -- Verify bill belongs to same vendor/org and is approved
        SELECT vendor_id, balance_due INTO v_vendor_check, v_balance_due
        FROM public.purchase_bills
        WHERE id = v_bill_id AND organization_id = p_org_id AND status = 'approved';

        IF v_vendor_check IS NULL THEN
            RAISE EXCEPTION 'إحدى الفواتير المختارة للتخصيص غير موجودة أو ليست في حالة معتمد (approved).';
        END IF;

        IF v_vendor_check <> p_vendor_id THEN
            RAISE EXCEPTION 'لا يمكن تخصيص سند الصرف لمورد آخر غير المورد المحدد في الفاتورة.';
        END IF;

        IF v_alloc_amt > v_balance_due THEN
            RAISE EXCEPTION 'المبلغ المخصص (%) يتجاوز الرصيد المتبقي المستحق على الفاتورة (%).', v_alloc_amt, v_balance_due;
        END IF;

        v_allocated_sum := v_allocated_sum + v_alloc_amt;

        -- Insert allocation
        INSERT INTO public.payment_allocations (
            organization_id, payment_id, purchase_bill_id, allocated_amount
        ) VALUES (
            p_org_id, p_payment_id, v_bill_id, v_alloc_amt
        );
    END LOOP;

    -- Total allocated sum must equal payment amount check
    IF round(v_allocated_sum, 2) <> round(p_amount, 2) THEN
        RAISE EXCEPTION
          'يجب أن يساوي مجموع المبالغ المخصصة (%) القيمة الإجمالية لسند الصرف (%).',
          v_allocated_sum,
          p_amount;
    END IF;

    -- Log action
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'UPDATE_PAYMENT', jsonb_build_object('payment_id', p_payment_id, 'amount', p_amount));
END;
$$;

REVOKE ALL ON FUNCTION public.update_payment(uuid, uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_payment(uuid, uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb) TO authenticated;


-- H. approve_payment
CREATE OR REPLACE FUNCTION public.approve_payment(
    p_org_id uuid,
    p_payment_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_payment_number text;
    v_vendor_id uuid;
    v_vendor_name text;
    v_payment_date date;
    v_amount numeric(15,2);
    v_payment_method text;
    v_cash_account_id uuid;
    v_bank_account_id uuid;
    v_status text;
    v_payable_account_id uuid;
    v_credit_account_id uuid;
    
    v_journal_lines jsonb := '[]'::jsonb;
    v_journal_entry_id uuid;
    v_desc text;
    
    v_alloc record;
    v_alloc_sum numeric(15,2);
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;
    
    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: الاعتماد متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Get payment details
    SELECT p.payment_number, p.vendor_id, p.payment_date, p.amount, p.payment_method, 
           p.cash_account_id, p.bank_account_id, p.status, v.name, v.payable_account_id
    INTO v_payment_number, v_vendor_id, v_payment_date, v_amount, v_payment_method,
         v_cash_account_id, v_bank_account_id, v_status, v_vendor_name, v_payable_account_id
    FROM public.payments p
    JOIN public.vendors v ON p.vendor_id = v.id
    WHERE p.id = p_payment_id AND p.organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'سند الصرف غير موجود أو لا تنتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'السند معتمد بالفعل أو ملغى ولا يمكن اعتماده مجدداً.';
    END IF;

    -- Validate that total allocated sum matches the payment amount
    SELECT COALESCE(SUM(allocated_amount), 0)
    INTO v_alloc_sum
    FROM public.payment_allocations
    WHERE payment_id = p_payment_id
      AND organization_id = p_org_id;

    IF round(v_alloc_sum, 2) <> round(v_amount, 2) THEN
        RAISE EXCEPTION
          'لا يمكن اعتماد سند صرف لا تساوي تخصيصاته (%) قيمة السند (%).',
          v_alloc_sum,
          v_amount;
    END IF;

    IF v_payable_account_id IS NULL THEN
        RAISE EXCEPTION 'المورد يفتقد لحساب الذمم الدائنة المربوط.';
    END IF;

    -- Validate Payable account
    PERFORM public.validate_master_data_account(v_payable_account_id, p_org_id, 'liabilities', 'حساب ذمم الموردين');

    -- Determine Credit Account (Cash or Bank)
    IF v_payment_method = 'cash' THEN
        v_credit_account_id := v_cash_account_id;
        IF v_credit_account_id IS NULL THEN
            RAISE EXCEPTION 'حساب الصندوق غير محدد في السند.';
        END IF;
        PERFORM public.validate_master_data_account(v_credit_account_id, p_org_id, 'assets', 'حساب الخزينة/الصندوق');
    ELSE
        v_credit_account_id := v_bank_account_id;
        IF v_credit_account_id IS NULL THEN
            RAISE EXCEPTION 'حساب البنك غير محدد في السند.';
        END IF;
        PERFORM public.validate_master_data_account(v_credit_account_id, p_org_id, 'assets', 'حساب البنك');
    END IF;

    -- Build Description
    v_desc := 'قيد صرف تلقائي رقم: ' || v_payment_number || ' - المورد: ' || v_vendor_name;

    -- Double entry compilation
    -- 1. Debit: Vendor AP Account
    v_journal_lines := jsonb_build_array(
        jsonb_build_object(
            'account_id', v_payable_account_id,
            'description', v_desc,
            'debit', v_amount,
            'credit', 0.00
        )
    );

    -- 2. Credit: Cash or Bank Account
    v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_credit_account_id,
        'description', v_desc,
        'debit', 0.00,
        'credit', v_amount
    );

    -- Post double entry
    v_journal_entry_id := public.create_journal_entry(
        p_org_id,
        v_payment_date,
        v_payment_number,
        v_desc,
        v_journal_lines
    );

    UPDATE public.journal_entries
    SET source_type = 'system'
    WHERE id = v_journal_entry_id
      AND organization_id = p_org_id;

    PERFORM public.post_journal_entry(p_org_id, v_journal_entry_id);

    -- Update Allocations and Bills payment stats
    FOR v_alloc IN 
        SELECT id, purchase_bill_id, allocated_amount 
        FROM public.payment_allocations 
        WHERE payment_id = p_payment_id
    LOOP
        -- Lock bill for update
        PERFORM 1 
        FROM public.purchase_bills 
        WHERE id = v_alloc.purchase_bill_id AND organization_id = p_org_id
        FOR UPDATE;

        -- Process bill update
        UPDATE public.purchase_bills SET
            paid_amount = paid_amount + v_alloc.allocated_amount,
            balance_due = total - (paid_amount + v_alloc.allocated_amount),
            payment_status = CASE 
                WHEN (paid_amount + v_alloc.allocated_amount) >= total THEN 'paid'::text
                WHEN (paid_amount + v_alloc.allocated_amount) > 0 THEN 'partially_paid'::text
                ELSE 'unpaid'::text
            END
        WHERE id = v_alloc.purchase_bill_id AND organization_id = p_org_id;
    END LOOP;

    -- Update Payment Header status & journal_entry_id
    UPDATE public.payments SET
        status = 'approved',
        journal_entry_id = v_journal_entry_id,
        approved_at = now(),
        approved_by = auth.uid()
    WHERE id = p_payment_id AND organization_id = p_org_id;

    -- Log transaction
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'APPROVE_PAYMENT', jsonb_build_object('payment_id', p_payment_id, 'journal_entry_id', v_journal_entry_id, 'payment_number', v_payment_number));

    RETURN v_journal_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_payment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_payment(uuid, uuid) TO authenticated;


-- I. cancel_payment
CREATE OR REPLACE FUNCTION public.cancel_payment(
    p_org_id uuid,
    p_payment_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
    v_journal_entry_id uuid;
    v_payment_number text;
    v_rev_entry_id uuid := null;
    v_alloc record;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: الحظر والإلغاء متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Fetch payment details
    SELECT status, journal_entry_id, payment_number
    INTO v_status, v_journal_entry_id, v_payment_number
    FROM public.payments
    WHERE id = p_payment_id AND organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'سند الصرف غير موجود أو لا تنتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'approved' THEN
        RAISE EXCEPTION 'يمكن إلغاء السندات المعتمدة فقط.';
    END IF;

    -- Reverse Journal Entry
    IF v_journal_entry_id IS NOT NULL THEN
        v_rev_entry_id := public.reverse_journal_entry(p_org_id, v_journal_entry_id);
    END IF;

    -- Subtract Allocations from Bills
    FOR v_alloc IN 
        SELECT id, purchase_bill_id, allocated_amount 
        FROM public.payment_allocations 
        WHERE payment_id = p_payment_id
    LOOP
        UPDATE public.purchase_bills SET
            paid_amount = GREATEST(0.00, paid_amount - v_alloc.allocated_amount),
            balance_due = total - GREATEST(0.00, paid_amount - v_alloc.allocated_amount),
            payment_status = CASE 
                WHEN GREATEST(0.00, paid_amount - v_alloc.allocated_amount) >= total THEN 'paid'::text
                WHEN GREATEST(0.00, paid_amount - v_alloc.allocated_amount) > 0 THEN 'partially_paid'::text
                ELSE 'unpaid'::text
            END
        WHERE id = v_alloc.purchase_bill_id;
    END LOOP;

    -- Mark Payment Cancelled
    UPDATE public.payments SET
        status = 'cancelled',
        cancelled_journal_entry_id = v_rev_entry_id,
        cancelled_at = now(),
        cancelled_by = auth.uid()
    WHERE id = p_payment_id;

    -- Audit trail
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'CANCEL_PAYMENT', jsonb_build_object('payment_id', p_payment_id, 'cancelled_journal_entry_id', v_rev_entry_id, 'payment_number', v_payment_number));

    RETURN v_rev_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_payment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_payment(uuid, uuid) TO authenticated;


-- J. delete_draft_payment
CREATE OR REPLACE FUNCTION public.delete_draft_payment(
    p_org_id uuid,
    p_payment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: الحذف متاح للمالك والمدير والمحاسب فقط.';
    END IF;

    -- Fetch status
    SELECT status INTO v_status
    FROM public.payments
    WHERE id = p_payment_id AND organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'سند الصرف غير موجود أو لا تنتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن حذف سوى سندات الصرف المسودة (draft).';
    END IF;

    -- Delete allocations and header
    DELETE FROM public.payment_allocations WHERE payment_id = p_payment_id;
    DELETE FROM public.payments WHERE id = p_payment_id;

    -- Audit trail
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'DELETE_PAYMENT', jsonb_build_object('payment_id', p_payment_id));
END;
$$;

REVOKE ALL ON FUNCTION public.delete_draft_payment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_draft_payment(uuid, uuid) TO authenticated;


COMMIT;
