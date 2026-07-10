-- ==========================================================
-- LEDGRA RT-1A: SALES RETURNS & CREDIT NOTES (إشعارات المبيعات الدائنة)
-- ==========================================================

BEGIN;

-- 1. CREATE TABLE: sales_credit_notes
CREATE TABLE IF NOT EXISTS public.sales_credit_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    original_invoice_id uuid NOT NULL REFERENCES public.sales_invoices(id),
    customer_id uuid NOT NULL REFERENCES public.customers(id),
    credit_note_number text NOT NULL,
    credit_note_date date NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'cancelled')),
    subtotal numeric(15,2) NOT NULL DEFAULT 0,
    tax_amount numeric(15,2) NOT NULL DEFAULT 0,
    total_amount numeric(15,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    currency_code text NOT NULL,
    reason text,
    notes text,
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    cogs_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at timestamptz,
    cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    cancelled_at timestamptz,
    cancel_reason text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT sales_credit_notes_num_org_unique UNIQUE (organization_id, credit_note_number),
    CONSTRAINT sales_credit_notes_id_org_unique UNIQUE (id, organization_id)
);

-- 2. CREATE TABLE: sales_credit_note_lines
CREATE TABLE IF NOT EXISTS public.sales_credit_note_lines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    credit_note_id uuid NOT NULL REFERENCES public.sales_credit_notes(id) ON DELETE CASCADE,
    original_invoice_line_id uuid NOT NULL REFERENCES public.sales_invoice_lines(id),
    item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
    description text NOT NULL,
    quantity numeric(15,4) NOT NULL CHECK (quantity > 0),
    unit_price numeric(15,2) NOT NULL CHECK (unit_price >= 0),
    tax_rate numeric(15,4) NOT NULL DEFAULT 0,
    subtotal numeric(15,2) NOT NULL DEFAULT 0,
    tax_amount numeric(15,2) NOT NULL DEFAULT 0,
    total_amount numeric(15,2) NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT sales_credit_note_lines_invoice_line_unique UNIQUE (credit_note_id, original_invoice_line_id)
);

-- Enable RLS
ALTER TABLE public.sales_credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_credit_note_lines ENABLE ROW LEVEL SECURITY;

-- Select policies
DROP POLICY IF EXISTS "Select sales_credit_notes" ON public.sales_credit_notes;
CREATE POLICY "Select sales_credit_notes" ON public.sales_credit_notes 
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Select sales_credit_note_lines" ON public.sales_credit_note_lines;
CREATE POLICY "Select sales_credit_note_lines" ON public.sales_credit_note_lines 
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- Restrict Direct Writes
REVOKE ALL ON TABLE public.sales_credit_notes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sales_credit_note_lines FROM PUBLIC, anon, authenticated;

-- Grant Selects
GRANT SELECT ON TABLE public.sales_credit_notes TO authenticated;
GRANT SELECT ON TABLE public.sales_credit_note_lines TO authenticated;


-- ==========================================================
-- 3. AUTOMATIC SEQUENTIAL NUMBERING TRIGGER
-- ==========================================================

CREATE OR REPLACE FUNCTION public.generate_sales_credit_note_number()
RETURNS trigger AS $$
DECLARE
    v_year_str text;
    v_next_num integer;
BEGIN
    v_year_str := to_char(NEW.credit_note_date, 'YYYY');
    
    SELECT COALESCE(
        MAX(
            NULLIF(
                regexp_replace(credit_note_number, '^SCN-' || v_year_str || '-', ''),
                credit_note_number
            )::integer
        ), 0
    ) + 1
    INTO v_next_num
    FROM public.sales_credit_notes
    WHERE organization_id = NEW.organization_id
      AND credit_note_number LIKE 'SCN-' || v_year_str || '-%';

    NEW.credit_note_number := 'SCN-' || v_year_str || '-' || lpad(v_next_num::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_generate_sales_credit_note_number ON public.sales_credit_notes;
CREATE TRIGGER trg_generate_sales_credit_note_number
    BEFORE INSERT ON public.sales_credit_notes
    FOR EACH ROW
    WHEN (NEW.credit_note_number IS NULL OR NEW.credit_note_number = '')
    EXECUTE FUNCTION public.generate_sales_credit_note_number();


-- ==========================================================
-- 4. SECURE RPC FUNCTIONS
-- ==========================================================

-- A) create_sales_credit_note
CREATE OR REPLACE FUNCTION public.create_sales_credit_note(
  p_organization_id uuid,
  p_original_invoice_id uuid,
  p_credit_note_date date default current_date,
  p_reason text default null,
  p_notes text default null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_role text;
    v_customer_id uuid;
    v_currency text;
    v_status text;
    v_credit_note_id uuid;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Role check
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND profile_id = auth.uid()
      AND COALESCE(is_active, true) = true;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب أن تكون عضواً في المنشأة.';
    END IF;

    IF v_user_role = 'viewer' THEN
        RAISE EXCEPTION 'غير مصرح: لا يمكن لمستخدم العرض فقط إنشاء إشعارات دائنة.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_organization_id::text));

    -- Get original invoice details
    SELECT customer_id, currency, status
    INTO v_customer_id, v_currency, v_status
    FROM public.sales_invoices
    WHERE id = p_original_invoice_id AND organization_id = p_organization_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'الفاتورة الأصلية غير موجودة أو لا تنتمي لهذه المنشأة.';
    END IF;

    IF v_status IN ('draft', 'cancelled') THEN
        RAISE EXCEPTION 'لا يمكن عمل مرتجع لفاتورة في حالة مسودة أو ملغاة.';
    END IF;

    -- Insert draft credit note
    INSERT INTO public.sales_credit_notes (
        organization_id,
        original_invoice_id,
        customer_id,
        credit_note_number,
        credit_note_date,
        status,
        subtotal,
        tax_amount,
        total_amount,
        currency_code,
        reason,
        notes,
        created_by
    ) VALUES (
        p_organization_id,
        p_original_invoice_id,
        v_customer_id,
        '', -- Will be set by trigger
        p_credit_note_date,
        'draft',
        0,
        0,
        0,
        v_currency,
        p_reason,
        p_notes,
        auth.uid()
    )
    RETURNING id INTO v_credit_note_id;

    RETURN v_credit_note_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_credit_note(uuid, uuid, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_credit_note(uuid, uuid, date, text, text) TO authenticated;


-- B) add_sales_credit_note_line
CREATE OR REPLACE FUNCTION public.add_sales_credit_note_line(
  p_credit_note_id uuid,
  p_original_invoice_line_id uuid,
  p_quantity numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_status text;
    v_original_invoice_id uuid;
    
    -- Original line fields
    v_orig_invoice_id uuid;
    v_item_id uuid;
    v_description text;
    v_orig_quantity numeric(15,4);
    v_unit_price numeric(15,2);
    v_tax_rate numeric(15,4);
    
    -- Quantity validations
    v_returned_quantity numeric(15,4);
    v_available_quantity numeric(15,4);
    
    -- Calculated line values
    v_subtotal numeric(15,2);
    v_tax_amount numeric(15,2);
    v_total_amount numeric(15,2);
    v_line_id uuid;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Get credit note details
    SELECT organization_id, status, original_invoice_id
    INTO v_org_id, v_status, v_original_invoice_id
    FROM public.sales_credit_notes
    WHERE id = p_credit_note_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'الإشعار الدائن غير موجود.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن تعديل بنود الإشعار الدائن إلا إذا كان في حالة مسودة (draft).';
    END IF;

    -- Check membership/privileges
    IF NOT public.is_org_member(v_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: يجب أن تكون عضواً في المنشأة.';
    END IF;

    -- Get original line details
    SELECT sales_invoice_id, item_id, description, quantity, unit_price, tax_rate
    INTO v_orig_invoice_id, v_item_id, v_description, v_orig_quantity, v_unit_price, v_tax_rate
    FROM public.sales_invoice_lines
    WHERE id = p_original_invoice_line_id;

    IF v_orig_invoice_id IS NULL THEN
        RAISE EXCEPTION 'بند الفاتورة الأصلية غير موجود.';
    END IF;

    IF v_orig_invoice_id <> v_original_invoice_id THEN
        RAISE EXCEPTION 'بند الفاتورة لا يطابق الفاتورة الأصلية المرتبطة بالإشعار الدائن.';
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'الكمية المرتجعة يجب أن تكون أكبر من الصفر.';
    END IF;

    -- Calculate already returned quantity for this line across APPROVED credit notes
    SELECT COALESCE(SUM(l.quantity), 0)
    INTO v_returned_quantity
    FROM public.sales_credit_note_lines l
    JOIN public.sales_credit_notes cn ON l.credit_note_id = cn.id
    WHERE l.original_invoice_line_id = p_original_invoice_line_id
      AND cn.status = 'approved';

    v_available_quantity := v_orig_quantity - v_returned_quantity;

    IF p_quantity > v_available_quantity THEN
        RAISE EXCEPTION 'الكمية المطلوبة (%) تتجاوز الكمية المتاحة للإرجاع (%). تم إرجاع (%) سابقاً من أصل (%).',
            p_quantity, v_available_quantity, v_returned_quantity, v_orig_quantity;
    END IF;

    -- Calculate values
    v_subtotal := round(p_quantity * v_unit_price, 2);
    v_tax_amount := round(v_subtotal * (v_tax_rate / 100.0), 2);
    v_total_amount := v_subtotal + v_tax_amount;

    -- Insert or update line
    INSERT INTO public.sales_credit_note_lines (
        organization_id,
        credit_note_id,
        original_invoice_line_id,
        item_id,
        description,
        quantity,
        unit_price,
        tax_rate,
        subtotal,
        tax_amount,
        total_amount
    ) VALUES (
        v_org_id,
        p_credit_note_id,
        p_original_invoice_line_id,
        v_item_id,
        v_description,
        p_quantity,
        v_unit_price,
        v_tax_rate,
        v_subtotal,
        v_tax_amount,
        v_total_amount
    )
    ON CONFLICT (credit_note_id, original_invoice_line_id) 
    DO UPDATE SET
        quantity = EXCLUDED.quantity,
        subtotal = EXCLUDED.subtotal,
        tax_amount = EXCLUDED.tax_amount,
        total_amount = EXCLUDED.total_amount
    RETURNING id INTO v_line_id;

    -- Re-calculate credit note totals
    UPDATE public.sales_credit_notes SET
        subtotal = COALESCE((SELECT SUM(subtotal) FROM public.sales_credit_note_lines WHERE credit_note_id = p_credit_note_id), 0),
        tax_amount = COALESCE((SELECT SUM(tax_amount) FROM public.sales_credit_note_lines WHERE credit_note_id = p_credit_note_id), 0),
        total_amount = COALESCE((SELECT SUM(total_amount) FROM public.sales_credit_note_lines WHERE credit_note_id = p_credit_note_id), 0),
        updated_at = now()
    WHERE id = p_credit_note_id;

    RETURN v_line_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_sales_credit_note_line(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_sales_credit_note_line(uuid, uuid, numeric) TO authenticated;


-- C) approve_sales_credit_note
CREATE OR REPLACE FUNCTION public.approve_sales_credit_note(
  p_credit_note_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_status text;
    v_credit_note_number text;
    v_credit_note_date date;
    v_original_invoice_id uuid;
    v_original_invoice_number text;
    v_customer_id uuid;
    v_customer_name text;
    v_receivable_account_id uuid;
    v_currency_code text;
    v_subtotal numeric(15,2);
    v_tax_amount numeric(15,2);
    v_total_amount numeric(15,2);

    -- Accounts & COGS Fallback
    v_default_tax_output_account_id uuid;
    v_default_cogs_account_id uuid;
    v_default_inventory_account_id uuid;
    v_sales_return_acc uuid;

    -- Journal Lines array & Entry IDs
    v_journal_lines jsonb := '[]'::jsonb;
    v_journal_entry_id uuid;
    v_cogs_journal_id uuid := null;
    v_desc text;

    -- Inventory loop variables
    v_line record;
    v_qty_on_hand numeric(15,4);
    v_avg_cost numeric(15,4);
    v_new_qty numeric(15,4);
    v_old_value numeric(15,4);
    v_new_value numeric(15,4);
    v_new_avg_cost numeric(15,4);
    v_orig_unit_cost numeric(15,4);
    v_line_cogs numeric(15,2);
    v_total_cogs_amount numeric(15,2) := 0;
    v_cogs_lines jsonb := '[]'::jsonb;
    v_cogs_acc uuid;
    v_inv_acc uuid;

    -- Validations
    v_returned_quantity numeric(15,4);
    v_available_quantity numeric(15,4);
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Get credit note details
    SELECT organization_id, status, credit_note_number, credit_note_date, original_invoice_id, customer_id, currency_code, subtotal, tax_amount, total_amount
    INTO v_org_id, v_status, v_credit_note_number, v_credit_note_date, v_original_invoice_id, v_customer_id, v_currency_code, v_subtotal, v_tax_amount, v_total_amount
    FROM public.sales_credit_notes
    WHERE id = p_credit_note_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'الإشعار الدائن غير موجود.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'يمكن فقط اعتماد الإشعارات الدائنة التي في حالة مسودة (draft).';
    END IF;

    -- Privilege check
    IF NOT public.is_org_privileged_member(v_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: الاعتماد متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(v_org_id::text));

    -- Get customer and original invoice details
    SELECT c.name, c.receivable_account_id, i.invoice_number
    INTO v_customer_name, v_receivable_account_id, v_original_invoice_number
    FROM public.customers c
    JOIN public.sales_invoices i ON i.customer_id = c.id
    WHERE i.id = v_original_invoice_id AND c.id = v_customer_id;

    IF v_receivable_account_id IS NULL THEN
        RAISE EXCEPTION 'العميل المحدد يفتقد لحساب الذمم المدينة المربوط.';
    END IF;
    PERFORM public.validate_master_data_account(v_receivable_account_id, v_org_id, 'assets', 'حساب ذمم العملاء');

    -- Get general settings
    SELECT default_cogs_account_id, default_inventory_account_id, default_tax_output_account_id
    INTO v_default_cogs_account_id, v_default_inventory_account_id, v_default_tax_output_account_id
    FROM public.accounting_settings
    WHERE organization_id = v_org_id;

    -- Verify that credit note actually has lines
    IF NOT EXISTS (SELECT 1 FROM public.sales_credit_note_lines WHERE credit_note_id = p_credit_note_id) THEN
        RAISE EXCEPTION 'لا يمكن اعتماد إشعار دائن فارغ بدون أي بنود.';
    END IF;

    -- 1. Double check and validate quantities for all lines
    FOR v_line IN 
        SELECT l.id, l.original_invoice_line_id, l.quantity, l.description, l.unit_price, l.tax_rate, l.subtotal, l.tax_amount, l.total_amount, l.item_id, i.is_stockable, i.name as item_name, i.cogs_account_id, i.inventory_account_id, il.revenue_account_id
        FROM public.sales_credit_note_lines l
        JOIN public.sales_invoice_lines il ON l.original_invoice_line_id = il.id
        LEFT JOIN public.items i ON l.item_id = i.id
        WHERE l.credit_note_id = p_credit_note_id
    LOOP
        -- Calculate already returned quantity for this line across approved credit notes
        SELECT COALESCE(SUM(cnl.quantity), 0)
        INTO v_returned_quantity
        FROM public.sales_credit_note_lines cnl
        JOIN public.sales_credit_notes cn ON cnl.credit_note_id = cn.id
        WHERE cnl.original_invoice_line_id = v_line.original_invoice_line_id
          AND cn.status = 'approved'
          AND cn.id <> p_credit_note_id;

        -- Total original quantity
        SELECT quantity INTO v_available_quantity
        FROM public.sales_invoice_lines
        WHERE id = v_line.original_invoice_line_id;

        v_available_quantity := v_available_quantity - v_returned_quantity;

        IF v_line.quantity > v_available_quantity THEN
            RAISE EXCEPTION 'لا يمكن الاعتماد: الكمية في البند (%) تتجاوز الكمية المتاحة للإرجاع (%). المتاح: (%).',
                v_line.description, v_available_quantity, v_available_quantity;
        END IF;
    END LOOP;

    -- 2. Create COGS Temp Table
    CREATE TEMP TABLE temp_credit_cogs_compiled (
        cogs_account uuid,
        inventory_account uuid,
        amount numeric(15,2)
    ) ON COMMIT DROP;

    -- 3. Process inventory returns for stockable items
    FOR v_line IN 
        SELECT l.original_invoice_line_id, l.quantity, l.item_id, i.is_stockable, i.name as item_name, i.cogs_account_id, i.inventory_account_id
        FROM public.sales_credit_note_lines l
        JOIN public.items i ON l.item_id = i.id
        WHERE l.credit_note_id = p_credit_note_id
    LOOP
        IF v_line.is_stockable = true THEN
            -- Get original sale movement unit cost to reverse at exact same cost
            SELECT unit_cost INTO v_orig_unit_cost
            FROM public.inventory_movements
            WHERE organization_id = v_org_id
              AND source_id = v_original_invoice_id
              AND source_type = 'sales_invoice'
              AND item_id = v_line.item_id
              AND movement_type = 'sale'
            ORDER BY created_at DESC
            LIMIT 1;

            IF NOT FOUND THEN
                -- Fallback to current average cost
                SELECT average_cost INTO v_orig_unit_cost
                FROM public.inventory_balances
                WHERE organization_id = v_org_id AND item_id = v_line.item_id;
            END IF;

            IF v_orig_unit_cost IS NULL THEN
                v_orig_unit_cost := 0.0000;
            END IF;

            -- Lock inventory balance
            SELECT quantity_on_hand, average_cost
            INTO v_qty_on_hand, v_avg_cost
            FROM public.inventory_balances
            WHERE organization_id = v_org_id AND item_id = v_line.item_id
            FOR UPDATE;

            IF NOT FOUND THEN
                v_qty_on_hand := 0.0000;
                v_avg_cost := 0.0000;
                INSERT INTO public.inventory_balances(
                    organization_id, item_id, quantity_on_hand, average_cost, inventory_value, last_movement_at
                ) VALUES (
                    v_org_id, v_line.item_id, 0.0000, 0.0000, 0.0000, now()
                );
            END IF;

            -- Calculate new balances
            v_old_value := v_qty_on_hand * v_avg_cost;
            v_new_qty := v_qty_on_hand + v_line.quantity;
            v_new_value := v_old_value + (v_line.quantity * v_orig_unit_cost);

            IF v_new_qty > 0 THEN
                v_new_avg_cost := round(v_new_value / v_new_qty, 4);
            ELSE
                v_new_avg_cost := 0;
                v_new_value := 0;
            END IF;

            -- Update Balance
            UPDATE public.inventory_balances SET
                quantity_on_hand = v_new_qty,
                average_cost = v_new_avg_cost,
                inventory_value = v_new_value,
                last_movement_at = now(),
                updated_at = now()
            WHERE organization_id = v_org_id AND item_id = v_line.item_id;

            -- Insert Movement log
            INSERT INTO public.inventory_movements (
                organization_id, item_id, movement_type, movement_date,
                source_type, source_id, quantity_in, quantity_out,
                unit_cost, total_cost, quantity_after, average_cost_after, notes
            ) VALUES (
                v_org_id, v_line.item_id, 'sale_cancel', v_credit_note_date,
                'sales_credit_note', p_credit_note_id, v_line.quantity, 0.0000,
                v_orig_unit_cost, (v_line.quantity * v_orig_unit_cost), v_new_qty, v_new_avg_cost,
                'مرتجع مبيعات إشعار دائن رقم: ' || v_credit_note_number
            );

            -- Compile COGS reversal lines
            v_cogs_acc := COALESCE(v_line.cogs_account_id, v_default_cogs_account_id);
            v_inv_acc := COALESCE(v_line.inventory_account_id, v_default_inventory_account_id);

            IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL THEN
                v_line_cogs := round(v_line.quantity * v_orig_unit_cost, 2);
                IF v_line_cogs > 0 THEN
                    INSERT INTO temp_credit_cogs_compiled (cogs_account, inventory_account, amount)
                    VALUES (v_cogs_acc, v_inv_acc, v_line_cogs);
                END IF;
            END IF;
        END IF;
    END LOOP;

    -- 4. Construct Journal Entry Description
    v_desc := 'قيد تلقائي لإشعار دائن رقم: ' || v_credit_note_number || ' - مرتجع للفاتورة: ' || v_original_invoice_number || ' - العميل: ' || v_customer_name;

    -- 5. Debit Side: Sales Return Account or Original Revenue Accounts
    -- Look up sales return account '5113'
    SELECT id INTO v_sales_return_acc
    FROM public.accounts
    WHERE organization_id = v_org_id AND code = '5113' AND is_active = true;

    IF v_sales_return_acc IS NOT NULL THEN
        -- Debit the Sales Return Account directly for the entire subtotal
        v_journal_lines := jsonb_build_array(
            jsonb_build_object(
                'account_id', v_sales_return_acc,
                'description', v_desc || ' (مردودات مبيعات)',
                'debit', v_subtotal,
                'credit', 0.00
            )
        );
    ELSE
        -- Debit the original revenue accounts grouped by account
        FOR v_line IN
            SELECT il.revenue_account_id, SUM(l.subtotal) as net_subtotal
            FROM public.sales_credit_note_lines l
            JOIN public.sales_invoice_lines il ON l.original_invoice_line_id = il.id
            WHERE l.credit_note_id = p_credit_note_id
            GROUP BY il.revenue_account_id
        LOOP
            IF v_line.net_subtotal > 0 THEN
                v_journal_lines := v_journal_lines || jsonb_build_object(
                    'account_id', v_line.revenue_account_id,
                    'description', v_desc || ' (عكس إيراد مبيعات)',
                    'debit', v_line.net_subtotal,
                    'credit', 0.00
                );
            END IF;
        END LOOP;
    END IF;

    -- 6. Debit Side: Tax Output Account
    IF v_tax_amount > 0 THEN
        IF v_default_tax_output_account_id IS NULL THEN
            RAISE EXCEPTION 'يوجد ضريبة على المرتجع ولكن لم يتم تهيئة حساب ضريبة المخرجات في الإعدادات المحاسبية.';
        END IF;
        PERFORM public.validate_master_data_account(v_default_tax_output_account_id, v_org_id, 'liabilities', 'حساب ضريبة المخرجات');

        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_id', v_default_tax_output_account_id,
            'description', v_desc || ' (عكس ضريبة المخرجات)',
            'debit', v_tax_amount,
            'credit', 0.00
        );
    END IF;

    -- 7. Credit Side: Accounts Receivable (ذمم العملاء)
    v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_receivable_account_id,
        'description', v_desc,
        'debit', 0.00,
        'credit', v_total_amount
    );

    -- 8. Create and Post credit note journal entry
    v_journal_entry_id := public.create_journal_entry(
        v_org_id,
        v_credit_note_date,
        v_credit_note_number,
        v_desc,
        v_journal_lines
    );

    UPDATE public.journal_entries 
    SET source_type = 'system' 
    WHERE id = v_journal_entry_id AND organization_id = v_org_id;

    PERFORM public.post_journal_entry(v_org_id, v_journal_entry_id);

    -- 9. Create and Post COGS Reversal Journal Entry
    SELECT COALESCE(SUM(amount), 0) INTO v_total_cogs_amount FROM temp_credit_cogs_compiled;

    IF v_total_cogs_amount > 0 THEN
        FOR v_line IN
            SELECT cogs_account, inventory_account, SUM(amount) as net_cogs
            FROM temp_credit_cogs_compiled
            GROUP BY cogs_account, inventory_account
        LOOP
            PERFORM public.validate_master_data_account(v_line.cogs_account, v_org_id, 'expenses', 'حساب مصروف تكلفة المبيعات');
            PERFORM public.validate_master_data_account(v_line.inventory_account, v_org_id, 'assets', 'حساب أصل المخزون');

            v_cogs_lines := v_cogs_lines || jsonb_build_object(
                'account_id', v_line.inventory_account,
                'description', 'إرجاع مخزون للإشعار رقم: ' || v_credit_note_number,
                'debit', v_line.net_cogs,
                'credit', 0.00
            ) || jsonb_build_object(
                'account_id', v_line.cogs_account,
                'description', 'عكس تكلفة بضاعة مباعة للإشعار رقم: ' || v_credit_note_number,
                'debit', 0.00,
                'credit', v_line.net_cogs
            );
        END LOOP;

        v_cogs_journal_id := public.create_journal_entry(
            v_org_id,
            v_credit_note_date,
            v_credit_note_number,
            'قيد عكس تكلفة مبيعات تلقائي للإشعار رقم: ' || v_credit_note_number,
            v_cogs_lines
        );

        UPDATE public.journal_entries 
        SET source_type = 'system' 
        WHERE id = v_cogs_journal_id AND organization_id = v_org_id;

        PERFORM public.post_journal_entry(v_org_id, v_cogs_journal_id);
    END IF;

    -- 10. Update Credit Note Header
    UPDATE public.sales_credit_notes SET
        status = 'approved',
        journal_entry_id = v_journal_entry_id,
        cogs_journal_entry_id = v_cogs_journal_id,
        approved_at = now(),
        approved_by = auth.uid(),
        updated_at = now()
    WHERE id = p_credit_note_id AND organization_id = v_org_id;

    -- Log action in Audit Logs
    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        v_org_id, auth.uid(), 'approve_sales_credit_note',
        jsonb_build_object(
            'sales_credit_note_id', p_credit_note_id,
            'journal_entry_id', v_journal_entry_id,
            'cogs_journal_entry_id', v_cogs_journal_id,
            'status_from', 'draft',
            'status_to', 'approved'
        )
    );

    RETURN v_journal_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_sales_credit_note(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_sales_credit_note(uuid) TO authenticated;


-- D) cancel_sales_credit_note
CREATE OR REPLACE FUNCTION public.cancel_sales_credit_note(
  p_credit_note_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_status text;
    v_credit_note_number text;
    v_journal_entry_id uuid;
    v_cogs_journal_entry_id uuid;

    v_rev_entry_id uuid := null;
    v_rev_cogs_id uuid := null;

    -- Re-lock inventory and reverse
    v_movement record;
    v_qty_on_hand numeric(15,4);
    v_avg_cost numeric(15,4);
    v_new_qty numeric(15,4);
    v_old_value numeric(15,4);
    v_new_value numeric(15,4);
    v_new_avg_cost numeric(15,4);
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Get credit note details
    SELECT organization_id, status, credit_note_number, journal_entry_id, cogs_journal_entry_id
    INTO v_org_id, v_status, v_credit_note_number, v_journal_entry_id, v_cogs_journal_entry_id
    FROM public.sales_credit_notes
    WHERE id = p_credit_note_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'الإشعار الدائن غير موجود.';
    END IF;

    IF v_status = 'cancelled' THEN
        RAISE EXCEPTION 'الإشعار الدائن ملغى بالفعل.';
    END IF;

    -- Privilege check
    IF NOT public.is_org_privileged_member(v_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إلغاء الإشعار الدائن متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(v_org_id::text));

    IF v_status = 'approved' THEN
        -- Re-reverse any inventory movements we added
        FOR v_movement IN 
            SELECT item_id, quantity_in, unit_cost, total_cost
            FROM public.inventory_movements
            WHERE organization_id = v_org_id
              AND source_id = p_credit_note_id
              AND source_type = 'sales_credit_note'
              AND movement_type = 'sale_cancel'
        LOOP
            -- Lock inventory balance
            SELECT quantity_on_hand, average_cost
            INTO v_qty_on_hand, v_avg_cost
            FROM public.inventory_balances
            WHERE organization_id = v_org_id AND item_id = v_movement.item_id
            FOR UPDATE;

            IF FOUND THEN
                -- Since we are canceling the return, we deduct the returned items from stock
                v_old_value := v_qty_on_hand * v_avg_cost;
                v_new_qty := v_qty_on_hand - v_movement.quantity_in;
                
                -- Prevent negative stock
                IF v_new_qty < 0 THEN
                    RAISE EXCEPTION 'لا يمكن إلغاء الإشعار لأن الكمية المنصرفة من الصنف غير متوفرة حالياً في المخزون.';
                END IF;

                v_new_value := v_old_value - v_movement.total_cost;

                IF v_new_qty > 0 THEN
                    v_new_avg_cost := round(v_new_value / v_new_qty, 4);
                ELSE
                    v_new_avg_cost := 0;
                    v_new_value := 0;
                END IF;

                UPDATE public.inventory_balances SET
                    quantity_on_hand = v_new_qty,
                    average_cost = v_new_avg_cost,
                    inventory_value = v_new_value,
                    last_movement_at = now(),
                    updated_at = now()
                WHERE organization_id = v_org_id AND item_id = v_movement.item_id;

                -- Insert reversing movement
                INSERT INTO public.inventory_movements (
                    organization_id, item_id, movement_type, movement_date,
                    source_type, source_id, quantity_in, quantity_out,
                    unit_cost, total_cost, quantity_after, average_cost_after, notes
                ) VALUES (
                    v_org_id, v_movement.item_id, 'sale', now()::date,
                    'sales_credit_note', p_credit_note_id, 0.0000, v_movement.quantity_in,
                    v_movement.unit_cost, v_movement.total_cost, v_new_qty, v_new_avg_cost,
                    'إلغاء مرتجع مبيعات إشعار دائن رقم: ' || v_credit_note_number
                );
            END IF;
        END LOOP;

        -- Reverse principal Journal Entry
        IF v_journal_entry_id IS NOT NULL THEN
            v_rev_entry_id := public.reverse_journal_entry(v_org_id, v_journal_entry_id);
            
            UPDATE public.journal_entries 
            SET source_type = 'system' 
            WHERE id = v_rev_entry_id AND organization_id = v_org_id;
        END IF;

        -- Reverse COGS Journal Entry
        IF v_cogs_journal_entry_id IS NOT NULL THEN
            v_rev_cogs_id := public.reverse_journal_entry(v_org_id, v_cogs_journal_entry_id);
            
            UPDATE public.journal_entries 
            SET source_type = 'system' 
            WHERE id = v_rev_cogs_id AND organization_id = v_org_id;
        END IF;
    END IF;

    -- Update status
    UPDATE public.sales_credit_notes SET
        status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = auth.uid(),
        cancel_reason = p_reason,
        updated_at = now()
    WHERE id = p_credit_note_id AND organization_id = v_org_id;

    -- Log action in Audit Logs
    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        v_org_id, auth.uid(), 'cancel_sales_credit_note',
        jsonb_build_object(
            'sales_credit_note_id', p_credit_note_id,
            'status_from', v_status,
            'status_to', 'cancelled',
            'reason', p_reason
        )
    );

    RETURN v_rev_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_sales_credit_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_sales_credit_note(uuid, text) TO authenticated;


NOTIFY pgrst, 'reload schema';

COMMIT;
