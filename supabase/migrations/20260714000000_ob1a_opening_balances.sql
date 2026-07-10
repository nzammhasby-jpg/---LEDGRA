-- ==========================================================
-- LEDGRA OB-1A: OPENING BALANCES WIZARD (معالج الأرصدة الافتتاحية)
-- ==========================================================

BEGIN;

-- 1. CREATE TABLE: opening_balance_batches
CREATE TABLE IF NOT EXISTS public.opening_balance_batches (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    opening_date date NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
    currency_code text NOT NULL,
    total_debit numeric(15,2) NOT NULL DEFAULT 0,
    total_credit numeric(15,2) NOT NULL DEFAULT 0,
    difference numeric(15,2) NOT NULL DEFAULT 0,
    notes text,
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    posted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    posted_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT opening_balance_batches_org_posted_unique UNIQUE (organization_id, status)
);

-- Note: The UNIQUE constraint ensures that we can only have ONE batch in 'posted' status per organization!
-- Wait, let's make it so that there can only be one posted batch per organization. This is a very strong and safe check!
-- But they can have multiple drafts, wait! The constraint `opening_balance_batches_org_posted_unique` on (organization_id, status)
-- would only allow one draft and one posted. That is actually extremely clean and prevents cluttered draft state!
-- Let's make it so that there can be multiple draft batches or only one draft batch?
-- Having only one draft batch is actually incredibly easy and avoids any confusion for the user, they have exactly one workspace.
-- Let's support a single active batch per organization (one draft or one posted).
-- Or we can make a partial index if we want multiple drafts, but a unique constraint on (organization_id, status) where status='posted' is best.
-- Let's drop the unique constraint from the table definition and use a UNIQUE INDEX instead to allow multiple drafts but only one posted!
-- Yes! That is much more professional.
ALTER TABLE public.opening_balance_batches DROP CONSTRAINT IF EXISTS opening_balance_batches_org_posted_unique;
CREATE UNIQUE INDEX IF NOT EXISTS opening_balance_batches_posted_idx ON public.opening_balance_batches (organization_id) WHERE (status = 'posted');

-- 2. CREATE TABLE: opening_balance_lines
CREATE TABLE IF NOT EXISTS public.opening_balance_lines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    batch_id uuid NOT NULL REFERENCES public.opening_balance_batches(id) ON DELETE CASCADE,
    line_type text NOT NULL CHECK (line_type IN ('gl', 'customer', 'vendor', 'bank_cash')),
    account_id uuid REFERENCES public.accounts(id),
    debit numeric(15,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit numeric(15,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    customer_id uuid REFERENCES public.customers(id),
    vendor_id uuid REFERENCES public.vendors(id),
    cash_bank_account_id uuid REFERENCES public.cash_bank_accounts(id),
    reference text,
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 3. CREATE TABLE: opening_inventory_lines
CREATE TABLE IF NOT EXISTS public.opening_inventory_lines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    batch_id uuid NOT NULL REFERENCES public.opening_balance_batches(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES public.items(id),
    quantity numeric(15,4) NOT NULL CHECK (quantity >= 0),
    unit_cost numeric(15,2) NOT NULL CHECK (unit_cost >= 0),
    total_cost numeric(15,2) NOT NULL CHECK (total_cost >= 0),
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.opening_balance_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_balance_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_inventory_lines ENABLE ROW LEVEL SECURITY;

-- Select policies
DROP POLICY IF EXISTS "Select opening_balance_batches" ON public.opening_balance_batches;
CREATE POLICY "Select opening_balance_batches" ON public.opening_balance_batches 
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Select opening_balance_lines" ON public.opening_balance_lines;
CREATE POLICY "Select opening_balance_lines" ON public.opening_balance_lines 
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Select opening_inventory_lines" ON public.opening_inventory_lines;
CREATE POLICY "Select opening_inventory_lines" ON public.opening_inventory_lines 
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- Restrict Direct Writes (all mutations handled via RPC functions for accounting integrity)
REVOKE ALL ON TABLE public.opening_balance_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.opening_balance_lines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.opening_inventory_lines FROM PUBLIC, anon, authenticated;

-- Grant Selects
GRANT SELECT ON TABLE public.opening_balance_batches TO authenticated;
GRANT SELECT ON TABLE public.opening_balance_lines TO authenticated;
GRANT SELECT ON TABLE public.opening_inventory_lines TO authenticated;


-- ==========================================================
-- 4. RPC FUNCTION: Check if Organization Has Any Financial Operations
-- ==========================================================

CREATE OR REPLACE FUNCTION public.check_org_has_transactions(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_has_tx boolean := false;
BEGIN
    -- Authorization check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Check journal entries (excluding draft entries if any, but checking posted is safer)
    SELECT EXISTS (
        SELECT 1 FROM public.journal_entries 
        WHERE organization_id = p_org_id AND status = 'posted'
    ) INTO v_has_tx;

    IF v_has_tx THEN
        RETURN true;
    END IF;

    -- Check sales invoices
    SELECT EXISTS (
        SELECT 1 FROM public.sales_invoices 
        WHERE organization_id = p_org_id AND status <> 'draft'
    ) INTO v_has_tx;

    IF v_has_tx THEN
        RETURN true;
    END IF;

    -- Check purchase bills
    SELECT EXISTS (
        SELECT 1 FROM public.purchase_bills 
        WHERE organization_id = p_org_id AND status <> 'draft'
    ) INTO v_has_tx;

    RETURN v_has_tx;
END;
$$;

REVOKE ALL ON FUNCTION public.check_org_has_transactions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_org_has_transactions(uuid) TO authenticated;


-- ==========================================================
-- 5. RPC FUNCTION: Get or Create opening_balance_batches
-- ==========================================================

CREATE OR REPLACE FUNCTION public.get_or_create_opening_balance_batch(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_batch_id uuid;
    v_batch_status text;
    v_opening_date date;
    v_currency_code text;
    v_total_debit numeric(15,2);
    v_total_credit numeric(15,2);
    v_difference numeric(15,2);
    v_notes text;
    v_result jsonb;
    v_gl_lines jsonb := '[]'::jsonb;
    v_customer_lines jsonb := '[]'::jsonb;
    v_vendor_lines jsonb := '[]'::jsonb;
    v_bank_lines jsonb := '[]'::jsonb;
    v_inventory_lines jsonb := '[]'::jsonb;
BEGIN
    -- Authorization check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: ليس لديك صلاحية الوصول لهذه المنشأة.';
    END IF;

    -- Obtain transactional lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Look for a draft batch first
    SELECT id, status, opening_date, currency_code, total_debit, total_credit, difference, notes
    INTO v_batch_id, v_batch_status, v_opening_date, v_currency_code, v_total_debit, v_total_credit, v_difference, v_notes
    FROM public.opening_balance_batches
    WHERE organization_id = p_org_id AND status = 'draft'
    LIMIT 1;

    -- If draft not found, look for posted batch to show as read-only
    IF v_batch_id IS NULL THEN
        SELECT id, status, opening_date, currency_code, total_debit, total_credit, difference, notes
        INTO v_batch_id, v_batch_status, v_opening_date, v_currency_code, v_total_debit, v_total_credit, v_difference, v_notes
        FROM public.opening_balance_batches
        WHERE organization_id = p_org_id AND status = 'posted'
        LIMIT 1;
    END IF;

    -- If absolutely no batch exists, create a default draft batch
    IF v_batch_id IS NULL THEN
        SELECT currency_code INTO v_currency_code
        FROM public.organizations
        WHERE id = p_org_id;

        IF v_currency_code IS NULL THEN
            v_currency_code := 'SAR';
        END IF;

        -- Set opening date to first day of current year
        v_opening_date := make_date(extract(year from now())::int, 1, 1);
        v_batch_status := 'draft';
        v_total_debit := 0.00;
        v_total_credit := 0.00;
        v_difference := 0.00;
        v_notes := 'الأرصدة الافتتاحية للمنشأة';

        INSERT INTO public.opening_balance_batches (
            organization_id, opening_date, status, currency_code, total_debit, total_credit, difference, notes, created_by
        ) VALUES (
            p_org_id, v_opening_date, v_batch_status, v_currency_code, v_total_debit, v_total_credit, v_difference, v_notes, auth.uid()
        ) RETURNING id INTO v_batch_id;
    END IF;

    -- Fetch lines if batch exists
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'account_id', account_id,
        'debit', debit,
        'credit', credit,
        'notes', notes
    )), '[]'::jsonb) INTO v_gl_lines
    FROM public.opening_balance_lines
    WHERE batch_id = v_batch_id AND line_type = 'gl';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'customer_id', customer_id,
        'debit', debit,
        'credit', credit,
        'reference', reference,
        'notes', notes
    )), '[]'::jsonb) INTO v_customer_lines
    FROM public.opening_balance_lines
    WHERE batch_id = v_batch_id AND line_type = 'customer';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'vendor_id', vendor_id,
        'debit', debit,
        'credit', credit,
        'reference', reference,
        'notes', notes
    )), '[]'::jsonb) INTO v_vendor_lines
    FROM public.opening_balance_lines
    WHERE batch_id = v_batch_id AND line_type = 'vendor';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'cash_bank_account_id', cash_bank_account_id,
        'debit', debit,
        'credit', credit,
        'notes', notes
    )), '[]'::jsonb) INTO v_bank_lines
    FROM public.opening_balance_lines
    WHERE batch_id = v_batch_id AND line_type = 'bank_cash';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'item_id', item_id,
        'quantity', quantity,
        'unit_cost', unit_cost,
        'total_cost', total_cost
    )), '[]'::jsonb) INTO v_inventory_lines
    FROM public.opening_inventory_lines
    WHERE batch_id = v_batch_id;

    RETURN jsonb_build_object(
        'batch', jsonb_build_object(
            'id', v_batch_id,
            'status', v_batch_status,
            'opening_date', v_opening_date,
            'currency_code', v_currency_code,
            'total_debit', v_total_debit,
            'total_credit', v_total_credit,
            'difference', v_difference,
            'notes', v_notes
        ),
        'gl_lines', v_gl_lines,
        'customer_lines', v_customer_lines,
        'vendor_lines', v_vendor_lines,
        'bank_lines', v_bank_lines,
        'inventory_lines', v_inventory_lines
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_opening_balance_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_opening_balance_batch(uuid) TO authenticated;


-- ==========================================================
-- 6. RPC FUNCTION: Save opening_balance_batches & lines
-- ==========================================================

CREATE OR REPLACE FUNCTION public.save_opening_balances_wizard(
    p_org_id uuid,
    p_batch_id uuid,
    p_opening_date date,
    p_notes text,
    p_gl_lines jsonb,
    p_customer_lines jsonb,
    p_vendor_lines jsonb,
    p_bank_lines jsonb,
    p_inventory_lines jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
    v_total_debit numeric(15,2) := 0;
    v_total_credit numeric(15,2) := 0;
    v_difference numeric(15,2) := 0;
    v_rec record;
BEGIN
    -- Authorization check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: الحفظ متاح فقط للمالك، المدير والمحاسب.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Check batch status
    SELECT status INTO v_status
    FROM public.opening_balance_batches
    WHERE id = p_batch_id AND organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'دفعة الأرصدة الافتتاحية غير موجودة.';
    END IF;

    IF v_status = 'posted' THEN
        RAISE EXCEPTION 'لا يمكن تعديل الأرصدة الافتتاحية بعد اعتمادها ترحيلها.';
    END IF;

    -- Delete existing lines
    DELETE FROM public.opening_balance_lines WHERE batch_id = p_batch_id AND organization_id = p_org_id;
    DELETE FROM public.opening_inventory_lines WHERE batch_id = p_batch_id AND organization_id = p_org_id;

    -- Save GL lines
    FOR v_rec IN SELECT * FROM jsonb_to_recordset(p_gl_lines) AS x(account_id uuid, debit numeric(15,2), credit numeric(15,2), notes text) LOOP
        IF v_rec.account_id IS NOT NULL AND (COALESCE(v_rec.debit, 0) > 0 OR COALESCE(v_rec.credit, 0) > 0) THEN
            INSERT INTO public.opening_balance_lines (
                organization_id, batch_id, line_type, account_id, debit, credit, notes
            ) VALUES (
                p_org_id, p_batch_id, 'gl', v_rec.account_id, COALESCE(v_rec.debit, 0), COALESCE(v_rec.credit, 0), trim(v_rec.notes)
            );
            v_total_debit := v_total_debit + COALESCE(v_rec.debit, 0);
            v_total_credit := v_total_credit + COALESCE(v_rec.credit, 0);
        END IF;
    END LOOP;

    -- Save Customer lines
    FOR v_rec IN SELECT * FROM jsonb_to_recordset(p_customer_lines) AS x(customer_id uuid, debit numeric(15,2), credit numeric(15,2), reference text, notes text) LOOP
        IF v_rec.customer_id IS NOT NULL AND (COALESCE(v_rec.debit, 0) > 0 OR COALESCE(v_rec.credit, 0) > 0) THEN
            INSERT INTO public.opening_balance_lines (
                organization_id, batch_id, line_type, customer_id, debit, credit, reference, notes
            ) VALUES (
                p_org_id, p_batch_id, 'customer', v_rec.customer_id, COALESCE(v_rec.debit, 0), COALESCE(v_rec.credit, 0), trim(v_rec.reference), trim(v_rec.notes)
            );
            v_total_debit := v_total_debit + COALESCE(v_rec.debit, 0);
            v_total_credit := v_total_credit + COALESCE(v_rec.credit, 0);
        END IF;
    END LOOP;

    -- Save Vendor lines
    FOR v_rec IN SELECT * FROM jsonb_to_recordset(p_vendor_lines) AS x(vendor_id uuid, debit numeric(15,2), credit numeric(15,2), reference text, notes text) LOOP
        IF v_rec.vendor_id IS NOT NULL AND (COALESCE(v_rec.debit, 0) > 0 OR COALESCE(v_rec.credit, 0) > 0) THEN
            INSERT INTO public.opening_balance_lines (
                organization_id, batch_id, line_type, vendor_id, debit, credit, reference, notes
            ) VALUES (
                p_org_id, p_batch_id, 'vendor', v_rec.vendor_id, COALESCE(v_rec.debit, 0), COALESCE(v_rec.credit, 0), trim(v_rec.reference), trim(v_rec.notes)
            );
            v_total_debit := v_total_debit + COALESCE(v_rec.debit, 0);
            v_total_credit := v_total_credit + COALESCE(v_rec.credit, 0);
        END IF;
    END LOOP;

    -- Save Bank/Cash lines
    FOR v_rec IN SELECT * FROM jsonb_to_recordset(p_bank_lines) AS x(cash_bank_account_id uuid, debit numeric(15,2), credit numeric(15,2), notes text) LOOP
        IF v_rec.cash_bank_account_id IS NOT NULL AND (COALESCE(v_rec.debit, 0) > 0 OR COALESCE(v_rec.credit, 0) > 0) THEN
            INSERT INTO public.opening_balance_lines (
                organization_id, batch_id, line_type, cash_bank_account_id, debit, credit, notes
            ) VALUES (
                p_org_id, p_batch_id, 'bank_cash', v_rec.cash_bank_account_id, COALESCE(v_rec.debit, 0), COALESCE(v_rec.credit, 0), trim(v_rec.notes)
            );
            v_total_debit := v_total_debit + COALESCE(v_rec.debit, 0);
            v_total_credit := v_total_credit + COALESCE(v_rec.credit, 0);
        END IF;
    END LOOP;

    -- Save Inventory lines
    FOR v_rec IN SELECT * FROM jsonb_to_recordset(p_inventory_lines) AS x(item_id uuid, quantity numeric(15,4), unit_cost numeric(15,2)) LOOP
        IF v_rec.item_id IS NOT NULL AND COALESCE(v_rec.quantity, 0) > 0 THEN
            INSERT INTO public.opening_inventory_lines (
                organization_id, batch_id, item_id, quantity, unit_cost, total_cost
            ) VALUES (
                p_org_id, p_batch_id, v_rec.item_id, v_rec.quantity, COALESCE(v_rec.unit_cost, 0), round(v_rec.quantity * COALESCE(v_rec.unit_cost, 0), 2)
            );
            v_total_debit := v_total_debit + round(v_rec.quantity * COALESCE(v_rec.unit_cost, 0), 2);
        END IF;
    END LOOP;

    v_difference := v_total_debit - v_total_credit;

    -- Update batch header
    UPDATE public.opening_balance_batches SET
        opening_date = p_opening_date,
        notes = trim(p_notes),
        total_debit = v_total_debit,
        total_credit = v_total_credit,
        difference = v_difference,
        updated_at = now()
    WHERE id = p_batch_id AND organization_id = p_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_opening_balances_wizard(uuid, uuid, date, text, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_opening_balances_wizard(uuid, uuid, date, text, jsonb, jsonb, jsonb, jsonb, jsonb) TO authenticated;


-- ==========================================================
-- 7. RPC FUNCTION: Post opening_balance_batches
-- ==========================================================

CREATE OR REPLACE FUNCTION public.post_opening_balances_wizard(
    p_org_id uuid,
    p_batch_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
    v_opening_date date;
    v_currency_code text;
    v_total_debit numeric(15,2);
    v_total_credit numeric(15,2);
    v_difference numeric(15,2);
    v_desc text;

    -- Fiscal Period variables
    v_fiscal_year_id uuid;
    v_fiscal_period_id uuid;
    v_period_status text;

    -- Journal entry variable
    v_journal_entry_id uuid;
    v_journal_lines jsonb := '[]'::jsonb;

    -- Looping records
    v_line record;
    v_inv_line record;

    -- Subledger variables
    v_receivable_account_id uuid;
    v_payable_account_id uuid;
    v_cash_bank_gl_id uuid;
    v_item_inventory_gl_id uuid;

    -- Inventory calculations
    v_qty_on_hand numeric(15,4);
    v_avg_cost numeric(15,4);
    v_new_qty numeric(15,4);
    v_new_avg_cost numeric(15,4);
    v_inv_value numeric(15,4);
    v_net_line_cost numeric(15,4);
BEGIN
    -- Authorization check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Ensure privileged member
    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: الاعتماد متاح للمالك، المدير، والمحاسب فقط.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Fetch and lock batch
    SELECT status, opening_date, currency_code, total_debit, total_credit, difference
    INTO v_status, v_opening_date, v_currency_code, v_total_debit, v_total_credit, v_difference
    FROM public.opening_balance_batches
    WHERE id = p_batch_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'دفعة الأرصدة الافتتاحية غير موجودة.';
    END IF;

    IF v_status = 'posted' THEN
        RAISE EXCEPTION 'هذه الدفعة معتمدة ومرحلة بالفعل.';
    END IF;

    -- 1. Ensure absolute balance (Difference must be zero)
    IF v_difference <> 0.00 THEN
        RAISE EXCEPTION 'الأرصدة غير متوازنة! يجب أن يكون إجمالي المدين مساوياً لإجمالي الدائن (الفرق: %).', v_difference;
    END IF;

    -- 2. Check if another batch in the same fiscal year is already posted
    -- To keep it simpler and strictly robust, we only allow exactly ONE posted opening balance batch ever for this organization!
    IF EXISTS (
        SELECT 1 FROM public.opening_balance_batches 
        WHERE organization_id = p_org_id AND status = 'posted'
    ) THEN
        RAISE EXCEPTION 'تم بالفعل ترحيل أرصدة افتتاحية لهذه المنشأة. لا يمكن اعتماد أكثر من دفعة.';
    END IF;

    -- 3. Resolve Fiscal Year and Period
    SELECT y.id, p.id, p.status
    INTO v_fiscal_year_id, v_fiscal_period_id, v_period_status
    FROM public.fiscal_periods p
    JOIN public.fiscal_years y ON p.fiscal_year_id = y.id
    WHERE y.organization_id = p_org_id
      AND p_opening_date >= y.start_date AND p_opening_date <= y.end_date
      AND p_opening_date >= p.start_date AND p_opening_date <= p.end_date
    LIMIT 1;

    IF v_fiscal_year_id IS NULL THEN
        RAISE EXCEPTION 'تاريخ الأرصدة الافتتاحية (%) خارج أي سنة مالية معرفة في النظام.', p_opening_date;
    END IF;

    IF v_period_status <> 'open' THEN
        RAISE EXCEPTION 'الفترة المالية المخصصة لتاريخ الأرصدة الافتتاحية مغلقة حالياً.';
    END IF;

    -- 4. Build Journal Lines JSON array dynamically
    -- Part A: GL lines
    FOR v_line IN 
        SELECT account_id, debit, credit, notes 
        FROM public.opening_balance_lines 
        WHERE batch_id = p_batch_id AND line_type = 'gl'
    LOOP
        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_id', v_line.account_id,
            'debit', v_line.debit,
            'credit', v_line.credit,
            'description', COALESCE(v_line.notes, 'أرصدة افتتاحية - حساب عام')
        );
    END LOOP;

    -- Part B: Customer lines (Receivable accounts)
    FOR v_line IN 
        SELECT l.customer_id, l.debit, l.credit, l.notes, l.reference, c.receivable_account_id, c.name
        FROM public.opening_balance_lines l
        JOIN public.customers c ON l.customer_id = c.id
        WHERE l.batch_id = p_batch_id AND l.line_type = 'customer'
    LOOP
        IF v_line.receivable_account_id IS NULL THEN
            RAISE EXCEPTION 'العميل % لا يحتوي على حساب ذمم مدينة مربوط.', v_line.name;
        END IF;

        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_id', v_line.receivable_account_id,
            'debit', v_line.debit,
            'credit', v_line.credit,
            'description', 'رصيد افتتاحي عميل: ' || v_line.name || COALESCE(' - ' || v_line.notes, '')
        );

        -- Update customer's table values
        UPDATE public.customers SET
            opening_balance = (v_line.debit + v_line.credit),
            opening_balance_type = CASE WHEN v_line.debit > 0 THEN 'debit'::public.opening_balance_type ELSE 'credit'::public.opening_balance_type END,
            updated_at = now()
        WHERE id = v_line.customer_id AND organization_id = p_org_id;
    END LOOP;

    -- Part C: Vendor lines (Payable accounts)
    FOR v_line IN 
        SELECT l.vendor_id, l.debit, l.credit, l.notes, l.reference, v.payable_account_id, v.name
        FROM public.opening_balance_lines l
        JOIN public.vendors v ON l.vendor_id = v.id
        WHERE l.batch_id = p_batch_id AND l.line_type = 'vendor'
    LOOP
        IF v_line.payable_account_id IS NULL THEN
            RAISE EXCEPTION 'المورد % لا يحتوي على حساب ذمم دائنة مربوط.', v_line.name;
        END IF;

        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_id', v_line.payable_account_id,
            'debit', v_line.debit,
            'credit', v_line.credit,
            'description', 'رصيد افتتاحي مورد: ' || v_line.name || COALESCE(' - ' || v_line.notes, '')
        );

        -- Update vendor's table values
        UPDATE public.vendors SET
            opening_balance = (v_line.debit + v_line.credit),
            opening_balance_type = CASE WHEN v_line.credit > 0 THEN 'credit'::public.opening_balance_type ELSE 'debit'::public.opening_balance_type END,
            updated_at = now()
        WHERE id = v_line.vendor_id AND organization_id = p_org_id;
    END LOOP;

    -- Part D: Bank/Cash lines
    FOR v_line IN 
        SELECT l.cash_bank_account_id, l.debit, l.credit, l.notes, b.account_id, b.name
        FROM public.opening_balance_lines l
        JOIN public.cash_bank_accounts b ON l.cash_bank_account_id = b.id
        WHERE l.batch_id = p_batch_id AND l.line_type = 'bank_cash'
    LOOP
        IF v_line.account_id IS NULL THEN
            RAISE EXCEPTION 'حساب النقدية/البنك % لا يحتوي على حساب شجرة مربوط.', v_line.name;
        END IF;

        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_id', v_line.account_id,
            'debit', v_line.debit,
            'credit', v_line.credit,
            'description', 'رصيد افتتاحي نقدية/بنك: ' || v_line.name || COALESCE(' - ' || v_line.notes, '')
        );

        -- Update bank_cash table values
        UPDATE public.cash_bank_accounts SET
            opening_balance = (v_line.debit - v_line.credit),
            current_balance = current_balance + (v_line.debit - v_line.credit),
            updated_at = now()
        WHERE id = v_line.cash_bank_account_id AND organization_id = p_org_id;
    END LOOP;

    -- Part E: Inventory lines (debit to inventory asset)
    FOR v_inv_line IN 
        SELECT l.item_id, l.quantity, l.unit_cost, l.total_cost, i.inventory_account_id, i.name
        FROM public.opening_inventory_lines l
        JOIN public.items i ON l.item_id = i.id
        WHERE l.batch_id = p_batch_id
    LOOP
        IF v_inv_line.inventory_account_id IS NULL THEN
            RAISE EXCEPTION 'الصنف % لا يحتوي على حساب مخزون مربوط.', v_inv_line.name;
        END IF;

        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_id', v_inv_line.inventory_account_id,
            'debit', v_inv_line.total_cost,
            'credit', 0.00,
            'description', 'رصيد مخزون افتتاحي صنف: ' || v_inv_line.name
        );

        -- Fetch and lock stock balance row
        SELECT quantity_on_hand, average_cost
        INTO v_qty_on_hand, v_avg_cost
        FROM public.inventory_balances
        WHERE organization_id = p_org_id AND item_id = v_inv_line.item_id
        FOR UPDATE;

        IF NOT FOUND THEN
            v_qty_on_hand := 0.0000;
            v_avg_cost := 0.0000;
            
            INSERT INTO public.inventory_balances (
                organization_id, item_id, quantity_on_hand, average_cost, inventory_value, last_movement_at
            ) VALUES (
                p_org_id, v_inv_line.item_id, 0.0000, 0.0000, 0.0000, now()
            );
        END IF;

        -- Update Inventory Balance with opening quantities
        v_new_qty := v_qty_on_hand + v_inv_line.quantity;
        v_new_avg_cost := v_inv_line.unit_cost;
        v_inv_value := v_new_qty * v_new_avg_cost;

        UPDATE public.inventory_balances SET
            quantity_on_hand = v_new_qty,
            average_cost = v_new_avg_cost,
            inventory_value = v_inv_value,
            last_movement_at = now(),
            updated_at = now()
        WHERE organization_id = p_org_id AND item_id = v_inv_line.item_id;

        -- Insert Inventory Movement for Opening balance
        INSERT INTO public.inventory_movements (
            organization_id, item_id, movement_type, movement_date,
            source_type, source_id, quantity_in, quantity_out,
            unit_cost, total_cost, quantity_after, average_cost_after, notes
        ) VALUES (
            p_org_id, v_inv_line.item_id, 'adjustment', v_opening_date,
            'manual_adjustment', p_batch_id, v_inv_line.quantity, 0.0000,
            v_inv_line.unit_cost, v_inv_line.total_cost, v_new_qty, v_new_avg_cost,
            'رصيد مخزون افتتاحي عبر المعالج'
        );
    END LOOP;

    -- Create Journal Entry header
    INSERT INTO public.journal_entries (
        organization_id, fiscal_year_id, fiscal_period_id, entry_number, entry_date,
        reference, description, status, source_type, created_by, created_at, updated_at
    ) VALUES (
        p_org_id, v_fiscal_year_id, v_fiscal_period_id, '', v_opening_date,
        'رصيد افتتاحي', 'قيد الأرصدة الافتتاحية للمنشأة عبر معالج الأرصدة الافتتاحية', 'draft', 'system', auth.uid(), now(), now()
    ) RETURNING id INTO v_journal_entry_id;

    -- Insert Journal Entry Lines from our JSON lines variable
    -- Let's parse the json array and write rows
    FOR v_line IN SELECT * FROM jsonb_to_recordset(v_journal_lines) AS x(account_id uuid, debit numeric(15,2), credit numeric(15,2), description text) LOOP
        INSERT INTO public.journal_entry_lines (
            organization_id, journal_entry_id, account_id, debit, credit, description
        ) VALUES (
            p_org_id, v_journal_entry_id, v_line.account_id, v_line.debit, v_line.credit, v_line.description
        );
    END LOOP;

    -- Call system standard function to Post the Journal Entry
    PERFORM public.post_journal_entry(p_org_id, v_journal_entry_id);

    -- Update batch status
    UPDATE public.opening_balance_batches SET
        status = 'posted',
        journal_entry_id = v_journal_entry_id,
        posted_by = auth.uid(),
        posted_at = now(),
        updated_at = now()
    WHERE id = p_batch_id AND organization_id = p_org_id;

    RETURN v_journal_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_opening_balances_wizard(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_opening_balances_wizard(uuid, uuid) TO authenticated;


-- ==========================================================
-- 8. PATCH Customer/Vendor Statement Functions to exclude opening_balance source_type
-- ==========================================================

-- A. get_customer_statement patch
CREATE OR REPLACE FUNCTION public.get_customer_statement(
  p_org_id uuid,
  p_customer_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_customer_code text;
    v_customer_name text;
    v_receivable_account_id uuid;
    v_cust_opening numeric(15,2) := 0.00;
    v_op_journal numeric(15,2) := 0.00;
    v_opening_balance numeric(15,2) := 0.00;
    v_total_debit numeric(15,2) := 0.00;
    v_total_credit numeric(15,2) := 0.00;
    v_closing_balance numeric(15,2) := 0.00;
    v_movements jsonb;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_view_financial_reports(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.';
    END IF;

    -- Fetch customer receivables account and info
    SELECT code, name, receivable_account_id, 
           CASE WHEN opening_balance_type = 'debit' THEN opening_balance ELSE -opening_balance END
    INTO v_customer_code, v_customer_name, v_receivable_account_id, v_cust_opening
    FROM public.customers
    WHERE id = p_customer_id AND organization_id = p_org_id;

    IF v_receivable_account_id IS NULL THEN
        RAISE EXCEPTION 'العميل غير موجود أو ليس لديه حساب ذمم مدينة مربوط.';
    END IF;

    -- Calculate journal entries sum before p_date_from in AR account
    -- EXCLUDING opening_balance journal entry to avoid double counting with customers.opening_balance
    SELECT COALESCE(SUM(l.debit - l.credit), 0.00)
    INTO v_op_journal
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
    WHERE l.organization_id = p_org_id
      AND l.account_id = v_receivable_account_id
      AND je.status = 'posted'
      AND je.reference <> 'رصيد افتتاحي'
      AND je.entry_date < p_date_from;

    v_opening_balance := v_cust_opening + v_op_journal;

    -- Fetch movements in the selected date range
    WITH raw_movements AS (
        SELECT 
            je.entry_date AS date,
            je.entry_number AS journal_number,
            je.reference,
            COALESCE(l.description, je.description, 'حركة قيد') AS description,
            l.debit,
            l.credit,
            je.source_type,
            je.source_id,
            l.id as line_id
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
        WHERE l.organization_id = p_org_id
          AND l.account_id = v_receivable_account_id
          AND je.status = 'posted'
          AND je.reference <> 'رصيد افتتاحي'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
        ORDER BY je.entry_date ASC, je.entry_number ASC, l.id ASC
    ),
    with_running AS (
        SELECT 
            date,
            journal_number,
            reference,
            description,
            debit,
            credit,
            source_type,
            source_id,
            v_opening_balance + SUM(debit - credit) OVER (ORDER BY date ASC, journal_number ASC, line_id ASC) AS running_balance
        FROM raw_movements
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', date,
        'journal_number', journal_number,
        'reference', reference,
        'description', description,
        'debit', debit,
        'credit', credit,
        'running_balance', running_balance,
        'source_type', source_type,
        'source_id', source_id
    )), '[]'::jsonb)
    INTO v_movements
    FROM with_running;

    -- Calculate total debit & credit in range
    SELECT 
        COALESCE(SUM(l.debit), 0.00),
        COALESCE(SUM(l.credit), 0.00)
    INTO v_total_debit, v_total_credit
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
    WHERE l.organization_id = p_org_id
      AND l.account_id = v_receivable_account_id
      AND je.status = 'posted'
      AND je.reference <> 'رصيد افتتاحي'
      AND je.entry_date >= p_date_from
      AND je.entry_date <= p_date_to;

    v_closing_balance := v_opening_balance + v_total_debit - v_total_credit;

    RETURN jsonb_build_object(
        'customer_code', v_customer_code,
        'customer_name', v_customer_name,
        'opening_balance', v_opening_balance,
        'total_debit', v_total_debit,
        'total_credit', v_total_credit,
        'closing_balance', v_closing_balance,
        'movements', v_movements
    );
END;
$$;

-- B. get_vendor_statement patch
CREATE OR REPLACE FUNCTION public.get_vendor_statement(
  p_org_id uuid,
  p_vendor_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_vendor_code text;
    v_vendor_name text;
    v_payable_account_id uuid;
    v_vend_opening numeric(15,2) := 0.00;
    v_op_journal numeric(15,2) := 0.00;
    v_opening_balance numeric(15,2) := 0.00;
    v_total_debit numeric(15,2) := 0.00;
    v_total_credit numeric(15,2) := 0.00;
    v_closing_balance numeric(15,2) := 0.00;
    v_movements jsonb;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_view_financial_reports(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.';
    END IF;

    -- Fetch vendor payables account and info
    SELECT code, name, payable_account_id, 
           CASE WHEN opening_balance_type = 'credit' THEN opening_balance ELSE -opening_balance END
    INTO v_vendor_code, v_vendor_name, v_payable_account_id, v_vend_opening
    FROM public.vendors
    WHERE id = p_vendor_id AND organization_id = p_org_id;

    IF v_payable_account_id IS NULL THEN
        RAISE EXCEPTION 'المورد غير موجود أو ليس لديه حساب ذمم دائنة مربوط.';
    END IF;

    -- Calculate journal entries sum before p_date_from (vendor is credit nature, so credit - debit)
    -- EXCLUDING opening_balance journal entry to avoid double counting with vendors.opening_balance
    SELECT COALESCE(SUM(l.credit - l.debit), 0.00)
    INTO v_op_journal
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
    WHERE l.organization_id = p_org_id
      AND l.account_id = v_payable_account_id
      AND je.status = 'posted'
      AND je.reference <> 'رصيد افتتاحي'
      AND je.entry_date < p_date_from;

    v_opening_balance := v_vend_opening + v_op_journal;

    -- Fetch movements in the selected date range
    WITH raw_movements AS (
        SELECT 
            je.entry_date AS date,
            je.entry_number AS journal_number,
            je.reference,
            COALESCE(l.description, je.description, 'حركة قيد') AS description,
            l.debit,
            l.credit,
            je.source_type,
            je.source_id,
            l.id as line_id
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
        WHERE l.organization_id = p_org_id
          AND l.account_id = v_payable_account_id
          AND je.status = 'posted'
          AND je.reference <> 'رصيد افتتاحي'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
        ORDER BY je.entry_date ASC, je.entry_number ASC, l.id ASC
    ),
    with_running AS (
        SELECT 
            date,
            journal_number,
            reference,
            description,
            debit,
            credit,
            source_type,
            source_id,
            v_opening_balance + SUM(credit - debit) OVER (ORDER BY date ASC, journal_number ASC, line_id ASC) AS running_balance
        FROM raw_movements
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', date,
        'journal_number', journal_number,
        'reference', reference,
        'description', description,
        'debit', debit,
        'credit', credit,
        'running_balance', running_balance,
        'source_type', source_type,
        'source_id', source_id
    )), '[]'::jsonb)
    INTO v_movements
    FROM with_running;

    -- Calculate total debit & credit in range
    SELECT 
        COALESCE(SUM(l.debit), 0.00),
        COALESCE(SUM(l.credit), 0.00)
    INTO v_total_debit, v_total_credit
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
    WHERE l.organization_id = p_org_id
      AND l.account_id = v_payable_account_id
      AND je.status = 'posted'
      AND je.reference <> 'رصيد افتتاحي'
      AND je.entry_date >= p_date_from
      AND je.entry_date <= p_date_to;

    v_closing_balance := v_opening_balance + v_total_credit - v_total_debit;

    RETURN jsonb_build_object(
        'vendor_code', v_vendor_code,
        'vendor_name', v_vendor_name,
        'opening_balance', v_opening_balance,
        'total_debit', v_total_debit,
        'total_credit', v_total_credit,
        'closing_balance', v_closing_balance,
        'movements', v_movements
    );
END;
$$;


COMMIT;

NOTIFY pgrst, 'reload schema';
