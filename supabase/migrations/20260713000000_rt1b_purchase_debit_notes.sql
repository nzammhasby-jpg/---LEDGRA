-- ==========================================================
-- LEDGRA RT-1B: PURCHASE RETURNS & DEBIT NOTES (إشعارات المشتريات المدينة)
-- ==========================================================

BEGIN;

-- 1. CREATE TABLE: purchase_debit_notes
CREATE TABLE IF NOT EXISTS public.purchase_debit_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    original_bill_id uuid NOT NULL REFERENCES public.purchase_bills(id),
    vendor_id uuid NOT NULL REFERENCES public.vendors(id),
    debit_note_number text NOT NULL,
    debit_note_date date NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'cancelled')),
    subtotal numeric(15,2) NOT NULL DEFAULT 0,
    tax_amount numeric(15,2) NOT NULL DEFAULT 0,
    total_amount numeric(15,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    currency_code text NOT NULL,
    reason text,
    notes text,
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at timestamptz,
    cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    cancelled_at timestamptz,
    cancel_reason text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT purchase_debit_notes_num_org_unique UNIQUE (organization_id, debit_note_number),
    CONSTRAINT purchase_debit_notes_id_org_unique UNIQUE (id, organization_id)
);

-- 2. CREATE TABLE: purchase_debit_note_lines
CREATE TABLE IF NOT EXISTS public.purchase_debit_note_lines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    debit_note_id uuid NOT NULL REFERENCES public.purchase_debit_notes(id) ON DELETE CASCADE,
    original_bill_line_id uuid NOT NULL REFERENCES public.purchase_bill_lines(id),
    item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
    description text NOT NULL,
    quantity numeric(15,4) NOT NULL CHECK (quantity > 0),
    unit_price numeric(15,2) NOT NULL CHECK (unit_price >= 0),
    tax_rate numeric(15,4) NOT NULL DEFAULT 0,
    subtotal numeric(15,2) NOT NULL DEFAULT 0,
    tax_amount numeric(15,2) NOT NULL DEFAULT 0,
    total_amount numeric(15,2) NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT purchase_debit_note_lines_bill_line_unique UNIQUE (debit_note_id, original_bill_line_id)
);

-- Enable RLS
ALTER TABLE public.purchase_debit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_debit_note_lines ENABLE ROW LEVEL SECURITY;

-- Select policies
DROP POLICY IF EXISTS "Select purchase_debit_notes" ON public.purchase_debit_notes;
CREATE POLICY "Select purchase_debit_notes" ON public.purchase_debit_notes 
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Select purchase_debit_note_lines" ON public.purchase_debit_note_lines;
CREATE POLICY "Select purchase_debit_note_lines" ON public.purchase_debit_note_lines 
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- Restrict Direct Writes (all mutations handled via RPC functions for accounting and inventory integrity)
REVOKE ALL ON TABLE public.purchase_debit_notes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.purchase_debit_note_lines FROM PUBLIC, anon, authenticated;

-- Grant Selects
GRANT SELECT ON TABLE public.purchase_debit_notes TO authenticated;
GRANT SELECT ON TABLE public.purchase_debit_note_lines TO authenticated;


-- ==========================================================
-- 3. AUTOMATIC SEQUENTIAL NUMBERING TRIGGER
-- ==========================================================

CREATE OR REPLACE FUNCTION public.generate_purchase_debit_note_number()
RETURNS trigger AS $$
DECLARE
    v_year_str text;
    v_next_num integer;
BEGIN
    v_year_str := to_char(NEW.debit_note_date, 'YYYY');
    
    SELECT COALESCE(
        MAX(
            NULLIF(
                regexp_replace(debit_note_number, '^PDN-' || v_year_str || '-', ''),
                debit_note_number
            )::integer
        ), 0
    ) + 1
    INTO v_next_num
    FROM public.purchase_debit_notes
    WHERE organization_id = NEW.organization_id
      AND debit_note_number LIKE 'PDN-' || v_year_str || '-%';

    NEW.debit_note_number := 'PDN-' || v_year_str || '-' || lpad(v_next_num::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_generate_purchase_debit_note_number ON public.purchase_debit_notes;
CREATE TRIGGER trg_generate_purchase_debit_note_number
    BEFORE INSERT ON public.purchase_debit_notes
    FOR EACH ROW
    WHEN (NEW.debit_note_number IS NULL OR NEW.debit_note_number = '')
    EXECUTE FUNCTION public.generate_purchase_debit_note_number();


-- ==========================================================
-- 4. SECURE RPC FUNCTIONS
-- ==========================================================

-- A) create_purchase_debit_note
CREATE OR REPLACE FUNCTION public.create_purchase_debit_note(
  p_organization_id uuid,
  p_original_bill_id uuid,
  p_debit_note_date date default current_date,
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
    v_vendor_id uuid;
    v_currency text;
    v_status text;
    v_debit_note_id uuid;
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

    IF v_user_role IN ('viewer', 'sales') THEN
        RAISE EXCEPTION 'غير مصرح: لا يمكن لمسؤولي المبيعات أو مستخدمي العرض فقط إنشاء إشعارات مدينة.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_organization_id::text));

    -- Get original purchase bill details
    SELECT vendor_id, currency, status
    INTO v_vendor_id, v_currency, v_status
    FROM public.purchase_bills
    WHERE id = p_original_bill_id AND organization_id = p_organization_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'فاتورة الشراء الأصلية غير موجودة أو لا تنتمي لهذه المنشأة.';
    END IF;

    IF v_status IN ('draft', 'cancelled') THEN
        RAISE EXCEPTION 'لا يمكن عمل مرتجع لفاتورة شراء في حالة مسودة أو ملغاة.';
    END IF;

    -- Insert draft debit note
    INSERT INTO public.purchase_debit_notes (
        organization_id,
        original_bill_id,
        vendor_id,
        debit_note_number,
        debit_note_date,
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
        p_original_bill_id,
        v_vendor_id,
        '', -- Will be set by trigger
        p_debit_note_date,
        'draft',
        0,
        0,
        0,
        COALESCE(v_currency, 'SAR'),
        p_reason,
        p_notes,
        auth.uid()
    )
    RETURNING id INTO v_debit_note_id;

    RETURN v_debit_note_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_debit_note(uuid, uuid, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_debit_note(uuid, uuid, date, text, text) TO authenticated;


-- B) add_purchase_debit_note_line
CREATE OR REPLACE FUNCTION public.add_purchase_debit_note_line(
  p_debit_note_id uuid,
  p_original_bill_line_id uuid,
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
    v_original_bill_id uuid;
    
    -- Original line fields
    v_orig_bill_id uuid;
    v_item_id uuid;
    v_description text;
    v_orig_quantity numeric(15,4);
    v_unit_cost numeric(15,2);
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

    -- Get debit note details
    SELECT organization_id, status, original_bill_id
    INTO v_org_id, v_status, v_original_bill_id
    FROM public.purchase_debit_notes
    WHERE id = p_debit_note_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'الإشعار المدين غير موجود.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن تعديل بنود الإشعار المدين إلا إذا كان في حالة مسودة (draft).';
    END IF;

    -- Check membership/privileges
    IF NOT public.is_org_member(v_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: يجب أن تكون عضواً في المنشأة.';
    END IF;

    -- Get original line details
    SELECT purchase_bill_id, item_id, description, quantity, unit_cost, tax_rate
    INTO v_orig_bill_id, v_item_id, v_description, v_orig_quantity, v_unit_cost, v_tax_rate
    FROM public.purchase_bill_lines
    WHERE id = p_original_bill_line_id;

    IF v_orig_bill_id IS NULL THEN
        RAISE EXCEPTION 'بند فاتورة الشراء الأصلية غير موجود.';
    END IF;

    IF v_orig_bill_id <> v_original_bill_id THEN
        RAISE EXCEPTION 'بند الفاتورة لا يطابق فاتورة الشراء الأصلية المرتبطة بالإشعار المدين.';
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'الكمية المرتجعة يجب أن تكون أكبر من الصفر.';
    END IF;

    -- Calculate already returned quantity for this line across APPROVED debit notes
    SELECT COALESCE(SUM(l.quantity), 0)
    INTO v_returned_quantity
    FROM public.purchase_debit_note_lines l
    JOIN public.purchase_debit_notes dn ON l.debit_note_id = dn.id
    WHERE l.original_bill_line_id = p_original_bill_line_id
      AND dn.status = 'approved';

    v_available_quantity := v_orig_quantity - v_returned_quantity;

    IF p_quantity > v_available_quantity THEN
        RAISE EXCEPTION 'الكمية المطلوبة (%) تتجاوز الكمية المتاحة للإرجاع (%). تم إرجاع (%) سابقاً من أصل (%).',
            p_quantity, v_available_quantity, v_returned_quantity, v_orig_quantity;
    END IF;

    -- Calculate values
    v_subtotal := round(p_quantity * v_unit_cost, 2);
    v_tax_amount := round(v_subtotal * (v_tax_rate / 100.0), 2);
    v_total_amount := v_subtotal + v_tax_amount;

    -- Insert or update line
    INSERT INTO public.purchase_debit_note_lines (
        organization_id,
        debit_note_id,
        original_bill_line_id,
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
        p_debit_note_id,
        p_original_bill_line_id,
        v_item_id,
        v_description,
        p_quantity,
        v_unit_cost,
        v_tax_rate,
        v_subtotal,
        v_tax_amount,
        v_total_amount
    )
    ON CONFLICT (debit_note_id, original_bill_line_id) 
    DO UPDATE SET
        quantity = EXCLUDED.quantity,
        subtotal = EXCLUDED.subtotal,
        tax_amount = EXCLUDED.tax_amount,
        total_amount = EXCLUDED.total_amount
    RETURNING id INTO v_line_id;

    -- Re-calculate debit note totals
    UPDATE public.purchase_debit_notes SET
        subtotal = COALESCE((SELECT SUM(subtotal) FROM public.purchase_debit_note_lines WHERE debit_note_id = p_debit_note_id), 0),
        tax_amount = COALESCE((SELECT SUM(tax_amount) FROM public.purchase_debit_note_lines WHERE debit_note_id = p_debit_note_id), 0),
        total_amount = COALESCE((SELECT SUM(total_amount) FROM public.purchase_debit_note_lines WHERE debit_note_id = p_debit_note_id), 0),
        updated_at = now()
    WHERE id = p_debit_note_id;

    RETURN v_line_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_purchase_debit_note_line(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_purchase_debit_note_line(uuid, uuid, numeric) TO authenticated;


-- C) approve_purchase_debit_note
CREATE OR REPLACE FUNCTION public.approve_purchase_debit_note(
  p_debit_note_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_status text;
    v_debit_note_number text;
    v_debit_note_date date;
    v_original_bill_id uuid;
    v_original_bill_number text;
    v_vendor_id uuid;
    v_vendor_name text;
    v_payable_account_id uuid;
    v_currency_code text;
    v_subtotal numeric(15,2);
    v_tax_amount numeric(15,2);
    v_total_amount numeric(15,2);

    -- Accounts
    v_default_tax_input_account_id uuid;
    v_desc text;

    -- Journal Lines array & Entry IDs
    v_journal_lines jsonb := '[]'::jsonb;
    v_journal_entry_id uuid;

    -- Inventory loop variables
    v_line record;
    v_qty_on_hand numeric(15,4);
    v_avg_cost numeric(15,4);
    v_new_qty numeric(15,4);
    v_old_value numeric(15,4);
    v_new_value numeric(15,4);
    v_new_avg_cost numeric(15,4);

    -- Validations
    v_returned_quantity numeric(15,4);
    v_available_quantity numeric(15,4);
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Get debit note details
    SELECT organization_id, status, debit_note_number, debit_note_date, original_bill_id, vendor_id, currency_code, subtotal, tax_amount, total_amount
    INTO v_org_id, v_status, v_debit_note_number, v_debit_note_date, v_original_bill_id, v_vendor_id, v_currency_code, v_subtotal, v_tax_amount, v_total_amount
    FROM public.purchase_debit_notes
    WHERE id = p_debit_note_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'الإشعار المدين غير موجود.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'يمكن فقط اعتماد الإشعارات المدينة التي في حالة مسودة (draft).';
    END IF;

    -- Privilege check
    IF NOT public.is_org_privileged_member(v_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: الاعتماد متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(v_org_id::text));

    -- Get vendor and original bill details
    SELECT v.name, v.payable_account_id, b.bill_number
    INTO v_vendor_name, v_payable_account_id, v_original_bill_number
    FROM public.vendors v
    JOIN public.purchase_bills b ON b.vendor_id = v.id
    WHERE b.id = v_original_bill_id AND v.id = v_vendor_id;

    IF v_payable_account_id IS NULL THEN
        RAISE EXCEPTION 'المورد المحدد يفتقد لحساب الذمم الدائنة المربوط.';
    END IF;
    PERFORM public.validate_master_data_account(v_payable_account_id, v_org_id, 'liabilities', 'حساب ذمم الموردين');

    -- Get general settings for tax input
    SELECT default_tax_input_account_id
    INTO v_default_tax_input_account_id
    FROM public.accounting_settings
    WHERE organization_id = v_org_id;

    -- Verify that debit note actually has lines
    IF NOT EXISTS (SELECT 1 FROM public.purchase_debit_note_lines WHERE debit_note_id = p_debit_note_id) THEN
        RAISE EXCEPTION 'لا يمكن اعتماد إشعار مدين فارغ بدون أي بنود.';
    END IF;

    -- 1. Double check quantities and check stock for stockable items
    FOR v_line IN 
        SELECT l.id, l.original_bill_line_id, l.quantity, l.description, l.unit_price, l.tax_rate, l.subtotal, l.tax_amount, l.total_amount, l.item_id, i.is_stockable, i.name as item_name, i.inventory_account_id, bl.expense_account_id
        FROM public.purchase_debit_note_lines l
        JOIN public.purchase_bill_lines bl ON l.original_bill_line_id = bl.id
        LEFT JOIN public.items i ON l.item_id = i.id
        WHERE l.debit_note_id = p_debit_note_id
    LOOP
        -- Calculate already returned quantity for this line across approved debit notes
        SELECT COALESCE(SUM(dn_l.quantity), 0)
        INTO v_returned_quantity
        FROM public.purchase_debit_note_lines dn_l
        JOIN public.purchase_debit_notes dn ON dn_l.debit_note_id = dn.id
        WHERE dn_l.original_bill_line_id = v_line.original_bill_line_id
          AND dn.status = 'approved'
          AND dn.id <> p_debit_note_id;

        -- Total original quantity
        SELECT quantity INTO v_available_quantity
        FROM public.purchase_bill_lines
        WHERE id = v_line.original_bill_line_id;

        v_available_quantity := v_available_quantity - v_returned_quantity;

        IF v_line.quantity > v_available_quantity THEN
            RAISE EXCEPTION 'لا يمكن الاعتماد: الكمية في البند (%) تتجاوز الكمية المتاحة للإرجاع (%). المتاح: (%).',
                v_line.description, v_available_quantity, v_available_quantity;
        END IF;

        -- Check stock balance if stockable
        IF v_line.is_stockable = true THEN
            SELECT quantity_on_hand INTO v_qty_on_hand
            FROM public.inventory_balances
            WHERE organization_id = v_org_id AND item_id = v_line.item_id;

            IF v_qty_on_hand IS NULL OR v_qty_on_hand < v_line.quantity THEN
                RAISE EXCEPTION 'لا يمكن الاعتماد: رصيد المخزن الحالي للصنف (%) هو (%) وهو غير كافٍ لإرجاع كمية قدرها (%).',
                    v_line.item_name, COALESCE(v_qty_on_hand, 0), v_line.quantity;
            END IF;
        END IF;
    END LOOP;

    -- 2. Process inventory returns (Deducting from inventory)
    FOR v_line IN 
        SELECT l.original_bill_line_id, l.quantity, l.item_id, l.unit_price, i.is_stockable, i.name as item_name
        FROM public.purchase_debit_note_lines l
        JOIN public.items i ON l.item_id = i.id
        WHERE l.debit_note_id = p_debit_note_id
    LOOP
        IF v_line.is_stockable = true THEN
            -- Lock inventory balance
            SELECT quantity_on_hand, average_cost
            INTO v_qty_on_hand, v_avg_cost
            FROM public.inventory_balances
            WHERE organization_id = v_org_id AND item_id = v_line.item_id
            FOR UPDATE;

            -- Deduct stock
            v_old_value := v_qty_on_hand * v_avg_cost;
            v_new_qty := v_qty_on_hand - v_line.quantity;
            v_new_value := v_old_value - (v_line.quantity * v_line.unit_price);

            IF v_new_value < 0 THEN
                v_new_value := 0;
            END IF;

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
            WHERE organization_id = v_org_id AND item_id = v_line.item_id;

            -- Insert Movement log
            INSERT INTO public.inventory_movements (
                organization_id, item_id, movement_type, movement_date,
                source_type, source_id, quantity_in, quantity_out,
                unit_cost, total_cost, quantity_after, average_cost_after, notes
            ) VALUES (
                v_org_id, v_line.item_id, 'purchase_cancel', v_debit_note_date,
                'purchase_debit_note', p_debit_note_id, 0.0000, v_line.quantity,
                v_line.unit_price, (v_line.quantity * v_line.unit_price), v_new_qty, v_new_avg_cost,
                'حركة صادرة لمرتجع مشتريات إشعار مدين رقم: ' || v_debit_note_number
            );
        END IF;
    END LOOP;

    -- 3. Construct Journal Entry Description
    v_desc := 'قيد تلقائي لإشعار مدين رقم: ' || v_debit_note_number || ' - مرتجع لفاتورة شراء: ' || v_original_bill_number || ' - المورد: ' || v_vendor_name;

    -- 4. Debit Side: Accounts Payable / Accounts (ذمم الموردين)
    v_journal_lines := jsonb_build_array(
        jsonb_build_object(
            'account_id', v_payable_account_id,
            'description', v_desc || ' (عكس ذمم دائنة للمورد)',
            'debit', v_total_amount,
            'credit', 0.00
        )
    );

    -- 5. Credit Side: Expenses or Inventory accounts from original lines
    FOR v_line IN
        SELECT COALESCE(bl.expense_account_id, bl.inventory_account_id) as line_account_id, 
               SUM(l.subtotal) as net_subtotal,
               CASE WHEN bl.expense_account_id IS NOT NULL THEN 'expenses' ELSE 'assets' END as class_type
        FROM public.purchase_debit_note_lines l
        JOIN public.purchase_bill_lines bl ON l.original_bill_line_id = bl.id
        WHERE l.debit_note_id = p_debit_note_id
        GROUP BY COALESCE(bl.expense_account_id, bl.inventory_account_id), CASE WHEN bl.expense_account_id IS NOT NULL THEN 'expenses' ELSE 'assets' END
    LOOP
        IF v_line.net_subtotal > 0 THEN
            PERFORM public.validate_master_data_account(v_line.line_account_id, v_org_id, v_line.class_type, 'حساب البند');

            v_journal_lines := v_journal_lines || jsonb_build_object(
                'account_id', v_line.line_account_id,
                'description', v_desc || CASE WHEN v_line.class_type = 'expenses' THEN ' (عكس مصروف المشتريات)' ELSE ' (عكس قيمة المخزون)' END,
                'debit', 0.00,
                'credit', v_line.net_subtotal
            );
        END IF;
    END LOOP;

    -- 6. Credit Side: Input VAT Account (ضريبة المدخلات)
    IF v_tax_amount > 0 THEN
        IF v_default_tax_input_account_id IS NULL THEN
            RAISE EXCEPTION 'يوجد ضريبة مدخلات على المرتجع ولكن لم يتم تهيئة حساب ضريبة المدخلات في الإعدادات المحاسبية.';
        END IF;
        PERFORM public.validate_master_data_account(v_default_tax_input_account_id, v_org_id, 'assets', 'حساب ضريبة المدخلات');

        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_id', v_default_tax_input_account_id,
            'description', v_desc || ' (عكس ضريبة المدخلات المستردة)',
            'debit', 0.00,
            'credit', v_tax_amount
        );
    END IF;

    -- 7. Create and Post journal entry
    v_journal_entry_id := public.create_journal_entry(
        v_org_id,
        v_debit_note_date,
        v_debit_note_number,
        v_desc,
        v_journal_lines
    );

    UPDATE public.journal_entries 
    SET source_type = 'system' 
    WHERE id = v_journal_entry_id AND organization_id = v_org_id;

    PERFORM public.post_journal_entry(v_org_id, v_journal_entry_id);

    -- 8. Update Debit Note Header
    UPDATE public.purchase_debit_notes SET
        status = 'approved',
        journal_entry_id = v_journal_entry_id,
        approved_at = now(),
        approved_by = auth.uid(),
        updated_at = now()
    WHERE id = p_debit_note_id AND organization_id = v_org_id;

    -- Log action in Audit Logs
    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        v_org_id, auth.uid(), 'approve_purchase_debit_note',
        jsonb_build_object(
            'purchase_debit_note_id', p_debit_note_id,
            'journal_entry_id', v_journal_entry_id,
            'status_from', 'draft',
            'status_to', 'approved'
        )
    );

    RETURN v_journal_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_purchase_debit_note(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_debit_note(uuid) TO authenticated;


-- D) cancel_purchase_debit_note
CREATE OR REPLACE FUNCTION public.cancel_purchase_debit_note(
  p_debit_note_id uuid,
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
    v_debit_note_number text;
    v_journal_entry_id uuid;
    v_rev_entry_id uuid := null;

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

    -- Get debit note details
    SELECT organization_id, status, debit_note_number, journal_entry_id
    INTO v_org_id, v_status, v_debit_note_number, v_journal_entry_id
    FROM public.purchase_debit_notes
    WHERE id = p_debit_note_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'الإشعار المدين غير موجود.';
    END IF;

    IF v_status = 'cancelled' THEN
        RAISE EXCEPTION 'الإشعار المدين ملغى بالفعل.';
    END IF;

    -- Privilege check
    IF NOT public.is_org_privileged_member(v_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إلغاء الإشعار المدين متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(v_org_id::text));

    IF v_status = 'approved' THEN
        -- Re-add the inventory quantities we deducted
        FOR v_movement IN 
            SELECT item_id, quantity_out, unit_cost, total_cost
            FROM public.inventory_movements
            WHERE organization_id = v_org_id
              AND source_id = p_debit_note_id
              AND source_type = 'purchase_debit_note'
              AND movement_type = 'purchase_cancel'
        LOOP
            -- Lock inventory balance
            SELECT quantity_on_hand, average_cost
            INTO v_qty_on_hand, v_avg_cost
            FROM public.inventory_balances
            WHERE organization_id = v_org_id AND item_id = v_movement.item_id
            FOR UPDATE;

            IF FOUND THEN
                -- Re-add returned items to stock
                v_old_value := v_qty_on_hand * v_avg_cost;
                v_new_qty := v_qty_on_hand + v_movement.quantity_out;
                v_new_value := v_old_value + v_movement.total_cost;

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
                    v_org_id, v_movement.item_id, 'purchase', now()::date,
                    'purchase_debit_note', p_debit_note_id, v_movement.quantity_out, 0.0000,
                    v_movement.unit_cost, v_movement.total_cost, v_new_qty, v_new_avg_cost,
                    'إلغاء مرتجع مشتريات إشعار مدين رقم: ' || v_debit_note_number
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
    END IF;

    -- Update status
    UPDATE public.purchase_debit_notes SET
        status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = auth.uid(),
        cancel_reason = p_reason,
        updated_at = now()
    WHERE id = p_debit_note_id AND organization_id = v_org_id;

    -- Log action in Audit Logs
    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        v_org_id, auth.uid(), 'cancel_purchase_debit_note',
        jsonb_build_object(
            'purchase_debit_note_id', p_debit_note_id,
            'status_from', v_status,
            'status_to', 'cancelled',
            'reason', p_reason
        )
    );

    RETURN v_rev_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_purchase_debit_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_debit_note(uuid, text) TO authenticated;


NOTIFY pgrst, 'reload schema';

COMMIT;
