BEGIN;

-- ==========================================================
-- LEDGRA: INVENTORY ADJUSTMENTS & STOCK COUNT (INV-ADJ-1A)
-- ==========================================================

-- 1. CREATE TABLE: inventory_adjustments
CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    adjustment_number text NOT NULL,
    adjustment_date date NOT NULL,
    adjustment_type text NOT NULL,
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    total_amount numeric(15,4) NOT NULL DEFAULT 0.0000,
    currency_code text NOT NULL,
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

    CONSTRAINT inventory_adjustments_number_org_unique UNIQUE (organization_id, adjustment_number),
    CONSTRAINT inventory_adjustments_total_amount_check CHECK (total_amount >= 0),
    CONSTRAINT inventory_adjustments_type_check CHECK (adjustment_type IN ('increase', 'decrease', 'stock_count')),
    CONSTRAINT inventory_adjustments_status_check CHECK (status IN ('draft', 'approved', 'cancelled'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS inventory_adjustments_org_idx ON public.inventory_adjustments (organization_id);

-- 2. CREATE TABLE: inventory_adjustment_lines
CREATE TABLE IF NOT EXISTS public.inventory_adjustment_lines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    adjustment_id uuid REFERENCES public.inventory_adjustments(id) ON DELETE CASCADE NOT NULL,
    item_id uuid REFERENCES public.items(id) ON DELETE RESTRICT NOT NULL,
    system_quantity numeric(15,4) NOT NULL DEFAULT 0.0000,
    actual_quantity numeric(15,4),
    adjustment_quantity numeric(15,4) NOT NULL,
    unit_cost numeric(15,4) NOT NULL DEFAULT 0.0000,
    total_cost numeric(15,4) NOT NULL DEFAULT 0.0000,
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT inventory_adjustment_lines_qty_check CHECK (adjustment_quantity <> 0),
    CONSTRAINT inventory_adjustment_lines_unit_cost_check CHECK (unit_cost >= 0),
    CONSTRAINT inventory_adjustment_lines_total_cost_check CHECK (total_cost >= 0)
);

CREATE INDEX IF NOT EXISTS inventory_adjustment_lines_adj_idx ON public.inventory_adjustment_lines (adjustment_id);

-- 3. RLS AND PROTECTED ACCESS POLICIES
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_adjustment_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select inventory_adjustments" ON public.inventory_adjustments;
CREATE POLICY "Select inventory_adjustments" ON public.inventory_adjustments
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Insert/Update/Delete inventory_adjustments" ON public.inventory_adjustments;
CREATE POLICY "Insert/Update/Delete inventory_adjustments" ON public.inventory_adjustments
    FOR ALL TO authenticated
    USING (public.is_org_privileged_member(organization_id))
    WITH CHECK (public.is_org_privileged_member(organization_id));

DROP POLICY IF EXISTS "Select inventory_adjustment_lines" ON public.inventory_adjustment_lines;
CREATE POLICY "Select inventory_adjustment_lines" ON public.inventory_adjustment_lines
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.inventory_adjustments a
        WHERE a.id = adjustment_id AND public.is_org_member(a.organization_id)
    ));

DROP POLICY IF EXISTS "Insert/Update/Delete inventory_adjustment_lines" ON public.inventory_adjustment_lines;
CREATE POLICY "Insert/Update/Delete inventory_adjustment_lines" ON public.inventory_adjustment_lines
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.inventory_adjustments a
        WHERE a.id = adjustment_id AND public.is_org_privileged_member(a.organization_id)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.inventory_adjustments a
        WHERE a.id = adjustment_id AND public.is_org_privileged_member(a.organization_id)
    ));

-- GRANTS
REVOKE ALL ON TABLE public.inventory_adjustments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.inventory_adjustment_lines FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_adjustments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_adjustment_lines TO authenticated;

-- TRIGGERS for updated_at tracking
DROP TRIGGER IF EXISTS trg_set_updated_at_inventory_adjustments ON public.inventory_adjustments;
CREATE TRIGGER trg_set_updated_at_inventory_adjustments
    BEFORE UPDATE ON public.inventory_adjustments
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_column();


-- ==========================================================
-- 4. UTILITY: get_or_create_adjustment_account
-- ==========================================================
CREATE OR REPLACE FUNCTION public.get_or_create_adjustment_account(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_acc_id uuid;
    v_parent_id uuid;
BEGIN
    -- Check if an account named "فروقات وتسويات المخزون" already exists
    SELECT id INTO v_acc_id
    FROM public.accounts
    WHERE organization_id = p_org_id
      AND classification = 'expenses'
      AND (name_ar = 'فروقات وتسويات المخزون' OR code = '5216')
    LIMIT 1;

    IF v_acc_id IS NOT NULL THEN
        RETURN v_acc_id;
    END IF;

    -- We need to find parent account 52 (Operating Expenses)
    SELECT id INTO v_parent_id
    FROM public.accounts
    WHERE organization_id = p_org_id
      AND code = '52'
    LIMIT 1;

    -- If not found, fall back to level 1 '5'
    IF v_parent_id IS NULL THEN
        SELECT id INTO v_parent_id
        FROM public.accounts
        WHERE organization_id = p_org_id
          AND code = '5'
        LIMIT 1;
    END IF;

    -- Create account
    INSERT INTO public.accounts (
        organization_id,
        code,
        name_ar,
        name_en,
        classification,
        nature,
        level,
        allow_direct_posting,
        is_system,
        parent_id
    ) VALUES (
        p_org_id,
        '5216',
        'فروقات وتسويات المخزون',
        'Inventory Adjustments & Variances',
        'expenses',
        'debit',
        4,
        true,
        true,
        v_parent_id
    ) RETURNING id INTO v_acc_id;

    RETURN v_acc_id;
END;
$$;


-- ==========================================================
-- 5. RPC: create_inventory_adjustment
-- ==========================================================
CREATE OR REPLACE FUNCTION public.create_inventory_adjustment(
  p_organization_id uuid,
  p_adjustment_date date,
  p_adjustment_type text,
  p_reason text,
  p_notes text DEFAULT null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_adj_id uuid;
    v_adj_number text;
    v_currency text;
    v_year text;
    v_count integer;
BEGIN
    -- Auth & Privilege check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_organization_id) THEN
        RAISE EXCEPTION 'غير مصرح: إنشاء تسوية المخزون متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Get organization currency
    SELECT currency_code INTO v_currency
    FROM public.organizations
    WHERE id = p_organization_id;

    IF v_currency IS NULL THEN
        RAISE EXCEPTION 'فشل العثور على العملة الخاصة بالمنشأة.';
    END IF;

    -- Validate type
    IF p_adjustment_type NOT IN ('increase', 'decrease', 'stock_count') THEN
        RAISE EXCEPTION 'نوع التسوية غير صالح. المسموح به: increase, decrease, stock_count';
    END IF;

    -- Generate adjustment number: ADJ-YYYY-000001
    v_year := to_char(p_adjustment_date, 'YYYY');
    
    SELECT COALESCE(COUNT(*), 0) + 1 INTO v_count
    FROM public.inventory_adjustments
    WHERE organization_id = p_organization_id
      AND to_char(adjustment_date, 'YYYY') = v_year;

    v_adj_number := 'ADJ-' || v_year || '-' || lpad(v_count::text, 6, '0');

    -- Insert draft adjustment
    INSERT INTO public.inventory_adjustments (
        organization_id,
        adjustment_number,
        adjustment_date,
        adjustment_type,
        reason,
        status,
        total_amount,
        currency_code,
        notes,
        created_by
    ) VALUES (
        p_organization_id,
        v_adj_number,
        p_adjustment_date,
        p_adjustment_type,
        p_reason,
        'draft',
        0.0000,
        v_currency,
        p_notes,
        auth.uid()
    ) RETURNING id INTO v_adj_id;

    RETURN v_adj_id;
END;
$$;


-- ==========================================================
-- 6. RPC: add_inventory_adjustment_line
-- ==========================================================
CREATE OR REPLACE FUNCTION public.add_inventory_adjustment_line(
  p_adjustment_id uuid,
  p_item_id uuid,
  p_actual_quantity numeric DEFAULT null,
  p_adjustment_quantity numeric DEFAULT null,
  p_unit_cost numeric DEFAULT null,
  p_notes text DEFAULT null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_line_id uuid;
    v_org_id uuid;
    v_status text;
    v_type text;
    v_sys_qty numeric(15,4);
    v_avg_cost numeric(15,4);
    v_adj_qty numeric(15,4);
    v_unit_cost numeric(15,4);
    v_total_cost numeric(15,4);
    v_is_stockable boolean;
    v_item_name text;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Get adjustment details
    SELECT organization_id, status, adjustment_type
    INTO v_org_id, v_status, v_type
    FROM public.inventory_adjustments
    WHERE id = p_adjustment_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'التسوية غير موجودة.';
    END IF;

    IF NOT public.is_org_privileged_member(v_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: تعديل تسوية المخزون متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن تعديل بنود تسوية غير مسودة.';
    END IF;

    -- Get item details
    SELECT is_stockable, name INTO v_is_stockable, v_item_name
    FROM public.items
    WHERE id = p_item_id AND organization_id = v_org_id;

    IF v_is_stockable IS NULL THEN
        RAISE EXCEPTION 'المنتج غير موجود أو لا ينتمي لهذه المنشأة.';
    END IF;

    IF NOT v_is_stockable THEN
        RAISE EXCEPTION 'لا يمكن إجراء تسوية مخزنية لمنتج غير مخزني (%).', v_item_name;
    END IF;

    -- Get current system quantity and average cost
    SELECT quantity_on_hand, average_cost
    INTO v_sys_qty, v_avg_cost
    FROM public.inventory_balances
    WHERE organization_id = v_org_id AND item_id = p_item_id;

    IF NOT FOUND THEN
        v_sys_qty := 0.0000;
        v_avg_cost := 0.0000;
    END IF;

    -- Compute adjustment_quantity based on type
    IF v_type = 'stock_count' THEN
        IF p_actual_quantity IS NULL THEN
            RAISE EXCEPTION 'الكمية الفعلية مطلوبة لنوع جرد فعلي.';
        END IF;
        v_adj_qty := p_actual_quantity - v_sys_qty;
    ELSIF v_type = 'increase' THEN
        IF p_adjustment_quantity IS NULL OR p_adjustment_quantity <= 0 THEN
            RAISE EXCEPTION 'كمية التسوية يجب أن تكون أكبر من الصفر لنوع زيادة مخزون.';
        END IF;
        v_adj_qty := p_adjustment_quantity;
    ELSIF v_type = 'decrease' THEN
        IF p_adjustment_quantity IS NULL OR p_adjustment_quantity <= 0 THEN
            RAISE EXCEPTION 'كمية التسوية يجب أن تكون أكبر من الصفر لنوع نقص مخزون.';
        END IF;
        v_adj_qty := -abs(p_adjustment_quantity);
    ELSE
        RAISE EXCEPTION 'نوع تسوية غير معروف.';
    END IF;

    -- Check if adjustment is 0
    IF v_adj_qty = 0 THEN
        RAISE EXCEPTION 'لا يوجد فرق في الكمية لإجراء التسوية.';
    END IF;

    -- Check if final quantity is negative
    IF (v_sys_qty + v_adj_qty) < 0 THEN
        RAISE EXCEPTION 'الكمية الناتجة بعد التسوية سالبة صنف (%) غير مسموح بها. الرصيد الحالي: (%)، التعديل: (%).',
                        v_item_name, v_sys_qty, v_adj_qty;
    END IF;

    -- Cost calculation
    IF v_adj_qty > 0 THEN
        -- Increase: use provided cost, else WAC (or 0 if WAC is 0)
        v_unit_cost := COALESCE(p_unit_cost, v_avg_cost);
    ELSE
        -- Decrease: strictly use WAC
        v_unit_cost := v_avg_cost;
    END IF;

    v_total_cost := round(abs(v_adj_qty) * v_unit_cost, 4);

    -- Check if already exists in lines
    DELETE FROM public.inventory_adjustment_lines
    WHERE adjustment_id = p_adjustment_id AND item_id = p_item_id;

    -- Insert line
    INSERT INTO public.inventory_adjustment_lines (
        adjustment_id,
        item_id,
        system_quantity,
        actual_quantity,
        adjustment_quantity,
        unit_cost,
        total_cost,
        notes
    ) VALUES (
        p_adjustment_id,
        p_item_id,
        v_sys_qty,
        p_actual_quantity,
        v_adj_qty,
        v_unit_cost,
        v_total_cost,
        p_notes
    ) RETURNING id INTO v_line_id;

    -- Update adjustment total_amount
    UPDATE public.inventory_adjustments SET
        total_amount = (
            SELECT COALESCE(SUM(total_cost), 0)
            FROM public.inventory_adjustment_lines
            WHERE adjustment_id = p_adjustment_id
        ),
        updated_at = now()
    WHERE id = p_adjustment_id;

    RETURN v_line_id;
END;
$$;


-- ==========================================================
-- 7. RPC: approve_inventory_adjustment
-- ==========================================================
CREATE OR REPLACE FUNCTION public.approve_inventory_adjustment(
  p_adjustment_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_status text;
    v_adj_number text;
    v_adj_date date;
    v_reason text;
    
    v_qty_on_hand numeric(15,4);
    v_avg_cost numeric(15,4);
    v_new_qty numeric(15,4);
    v_new_avg_cost numeric(15,4);
    v_inv_value numeric(15,4);
    v_net_line_cost numeric(15,4);
    
    v_default_inventory_account_id uuid;
    v_inv_account_id uuid;
    v_adj_account_id uuid;
    
    v_journal_entry_id uuid;
    v_journal_lines jsonb := '[]'::jsonb;
    v_line record;
    v_count_lines integer;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Get adjustment details
    SELECT organization_id, status, adjustment_number, adjustment_date, reason
    INTO v_org_id, v_status, v_adj_number, v_adj_date, v_reason
    FROM public.inventory_adjustments
    WHERE id = p_adjustment_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'التسوية غير موجودة.';
    END IF;

    IF NOT public.is_org_privileged_member(v_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: اعتماد تسوية المخزون متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'يمكن فقط اعتماد التسويات غير المعتمدة والمسودات.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(v_org_id::text));

    -- Verify lines exist
    SELECT COUNT(*) INTO v_count_lines
    FROM public.inventory_adjustment_lines
    WHERE adjustment_id = p_adjustment_id;

    IF v_count_lines = 0 THEN
        RAISE EXCEPTION 'لا يمكن اعتماد تسوية مخزنية فارغة بدون بنود.';
    END IF;

    -- Get default inventory account from settings
    SELECT default_inventory_account_id
    INTO v_default_inventory_account_id
    FROM public.accounting_settings
    WHERE organization_id = v_org_id;

    -- Resolve variance account
    v_adj_account_id := public.get_or_create_adjustment_account(v_org_id);

    -- Create temp table for JEs compiling
    CREATE TEMP TABLE temp_adj_compiled (
        account_id uuid,
        is_debit boolean,
        amount numeric(15,2),
        desc_text text
    ) ON COMMIT DROP;

    -- Process each line
    FOR v_line IN
        SELECT l.*, i.name, i.inventory_account_id
        FROM public.inventory_adjustment_lines l
        JOIN public.items i ON l.item_id = i.id
        WHERE l.adjustment_id = p_adjustment_id
    LOOP
        -- Fetch and lock stock balance row
        SELECT quantity_on_hand, average_cost
        INTO v_qty_on_hand, v_avg_cost
        FROM public.inventory_balances
        WHERE organization_id = v_org_id AND item_id = v_line.item_id
        FOR UPDATE;

        IF NOT FOUND THEN
            v_qty_on_hand := 0.0000;
            v_avg_cost := 0.0000;
            
            -- Insert default balance
            INSERT INTO public.inventory_balances (
                organization_id, item_id, quantity_on_hand, average_cost, inventory_value, last_movement_at
            ) VALUES (
                v_org_id, v_line.item_id, 0.0000, 0.0000, 0.0000, now()
            );
        END IF;

        -- Verify quantity isn't negative
        v_new_qty := v_qty_on_hand + v_line.adjustment_quantity;
        IF v_new_qty < 0 THEN
            RAISE EXCEPTION 'فشل الاعتماد: تسوية الصنف (%) تسبب في كمية سالبة غير مسموح بها. المتاح: (%) والمطلوب للتسوية: (%).',
                            v_line.name, v_qty_on_hand, v_line.adjustment_quantity;
        END IF;

        -- Recalculate WAC if increase, else WAC stays same
        IF v_line.adjustment_quantity > 0 THEN
            -- Increase
            IF v_qty_on_hand <= 0 THEN
                v_new_avg_cost := v_line.unit_cost;
            ELSE
                v_new_avg_cost := round(((v_qty_on_hand * v_avg_cost) + (v_line.adjustment_quantity * v_line.unit_cost)) / v_new_qty, 4);
            END IF;
        ELSE
            -- Decrease
            v_new_avg_cost := v_avg_cost;
        END IF;

        v_inv_value := v_new_qty * v_new_avg_cost;

        -- Update Balance
        UPDATE public.inventory_balances SET
            quantity_on_hand = v_new_qty,
            average_cost = v_new_avg_cost,
            inventory_value = v_inv_value,
            last_movement_at = now(),
            updated_at = now()
        WHERE organization_id = v_org_id AND item_id = v_line.item_id;

        -- Log Inventory Movement
        INSERT INTO public.inventory_movements (
            organization_id, item_id, movement_type, movement_date,
            source_type, source_id, quantity_in, quantity_out,
            unit_cost, total_cost, quantity_after, average_cost_after, notes
        ) VALUES (
            v_org_id, v_line.item_id, 'adjustment', v_adj_date,
            'manual_adjustment', p_adjustment_id,
            CASE WHEN v_line.adjustment_quantity > 0 THEN v_line.adjustment_quantity ELSE 0.0000 END,
            CASE WHEN v_line.adjustment_quantity < 0 THEN abs(v_line.adjustment_quantity) ELSE 0.0000 END,
            v_line.unit_cost, v_line.total_cost, v_new_qty, v_new_avg_cost,
            'تسوية مخزنية رقم ' || v_adj_number || ' - سبب: ' || v_reason
        );

        -- Compile Accounting entries
        v_inv_account_id := COALESCE(v_line.inventory_account_id, v_default_inventory_account_id);
        IF v_inv_account_id IS NULL THEN
            RAISE EXCEPTION 'فشل الترحيل: يرجى ربط حساب المخزون في بطاقة الصنف (%) أو الإعدادات المحاسبية أولاً.', v_line.name;
        END IF;

        IF v_line.adjustment_quantity > 0 THEN
            -- Gain: Debit Inventory, Credit Adjustment
            INSERT INTO temp_adj_compiled (account_id, is_debit, amount, desc_text)
            VALUES (v_inv_account_id, true, round(v_line.total_cost, 2), 'زيادة مخزون - صنف: ' || v_line.name);
            
            INSERT INTO temp_adj_compiled (account_id, is_debit, amount, desc_text)
            VALUES (v_adj_account_id, false, round(v_line.total_cost, 2), 'زيادة مخزون - صنف: ' || v_line.name);
        ELSE
            -- Loss: Debit Adjustment, Credit Inventory
            INSERT INTO temp_adj_compiled (account_id, is_debit, amount, desc_text)
            VALUES (v_adj_account_id, true, round(v_line.total_cost, 2), 'عجز مخزون - صنف: ' || v_line.name);
            
            INSERT INTO temp_adj_compiled (account_id, is_debit, amount, desc_text)
            VALUES (v_inv_account_id, false, round(v_line.total_cost, 2), 'عجز مخزون - صنف: ' || v_line.name);
        END IF;
    END LOOP;

    -- Build balanced journal entry lines JSON
    SELECT jsonb_agg(
        jsonb_build_object(
            'account_id', account_id,
            'description', desc_text,
            'debit', CASE WHEN is_debit THEN amount ELSE 0.00 END,
            'credit', CASE WHEN is_debit THEN 0.00 ELSE amount END
        )
    ) INTO v_journal_lines
    FROM (
        SELECT account_id, is_debit, SUM(amount) as amount, string_agg(desc_text, ' | ') as desc_text
        FROM temp_adj_compiled
        GROUP BY account_id, is_debit
    ) t;

    -- Create and Post the Automatic Journal Entry
    v_journal_entry_id := public.create_journal_entry(
        v_org_id,
        v_adj_date,
        v_adj_number,
        'قيد تسوية وجرد مخزن تلقائي رقم: ' || v_adj_number || ' - السبب: ' || v_reason,
        v_journal_lines
    );

    UPDATE public.journal_entries
    SET source_type = 'system'
    WHERE id = v_journal_entry_id AND organization_id = v_org_id;

    PERFORM public.post_journal_entry(v_org_id, v_journal_entry_id);

    -- Update Adjustment Header
    UPDATE public.inventory_adjustments SET
        status = 'approved',
        journal_entry_id = v_journal_entry_id,
        approved_by = auth.uid(),
        approved_at = now(),
        updated_at = now()
    WHERE id = p_adjustment_id;

    -- Log Audit Log
    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        v_org_id, auth.uid(), 'approve_inventory_adjustment',
        jsonb_build_object(
            'adjustment_id', p_adjustment_id,
            'journal_entry_id', v_journal_entry_id,
            'adjustment_number', v_adj_number,
            'status_from', 'draft',
            'status_to', 'approved'
        )
    );

    RETURN v_journal_entry_id;
END;
$$;


-- ==========================================================
-- 8. RPC: cancel_inventory_adjustment
-- ==========================================================
CREATE OR REPLACE FUNCTION public.cancel_inventory_adjustment(
  p_adjustment_id uuid,
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
    v_adj_number text;
    v_journal_entry_id uuid;
    v_rev_entry_id uuid := null;
    
    v_qty_on_hand numeric(15,4);
    v_avg_cost numeric(15,4);
    v_new_qty numeric(15,4);
    v_new_avg_cost numeric(15,4);
    v_inv_value numeric(15,4);
    v_net_line_cost numeric(15,4);
    
    v_line record;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Get adjustment details
    SELECT organization_id, status, adjustment_number, journal_entry_id
    INTO v_org_id, v_status, v_adj_number, v_journal_entry_id
    FROM public.inventory_adjustments
    WHERE id = p_adjustment_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'التسوية غير موجودة.';
    END IF;

    IF NOT public.is_org_privileged_member(v_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إلغاء تسوية المخزون متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    IF v_status = 'cancelled' THEN
        RAISE EXCEPTION 'التسوية ملغاة بالفعل.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(v_org_id::text));

    IF v_status = 'draft' THEN
        -- Just mark cancelled
        UPDATE public.inventory_adjustments SET
            status = 'cancelled',
            cancelled_by = auth.uid(),
            cancelled_at = now(),
            cancel_reason = p_reason,
            updated_at = now()
        WHERE id = p_adjustment_id;
        
        RETURN null;
    END IF;

    -- If approved: reverse inventory balances, movements, and JEs
    FOR v_line IN
        SELECT l.*, i.name
        FROM public.inventory_adjustment_lines l
        JOIN public.items i ON l.item_id = i.id
        WHERE l.adjustment_id = p_adjustment_id
    LOOP
        -- Fetch and lock stock balance row
        SELECT quantity_on_hand, average_cost
        INTO v_qty_on_hand, v_avg_cost
        FROM public.inventory_balances
        WHERE organization_id = v_org_id AND item_id = v_line.item_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'فشل الإلغاء: تعذر العثور على رصيد المخزون الحالي للصنف (%).', v_line.name;
        END IF;

        -- Reversing quantity (subtracting previous adjustment_quantity)
        v_new_qty := v_qty_on_hand - v_line.adjustment_quantity;
        IF v_new_qty < 0 THEN
            RAISE EXCEPTION 'فشل الإلغاء: التراجع عن تسوية الصنف (%) سيؤدي إلى كمية سالبة غير مسموح بها. الرصيد الحالي: (%) والمطلوب إرجاعه: (%).',
                            v_line.name, v_qty_on_hand, v_line.adjustment_quantity;
        END IF;

        -- Recalculate average cost on reverse
        IF v_line.adjustment_quantity > 0 THEN
            -- Previous gain, now reducing stock. WAC remains unchanged.
            v_new_avg_cost := v_avg_cost;
        ELSE
            -- Previous loss, now adding back stock. Recalculate WAC.
            v_net_line_cost := abs(v_line.adjustment_quantity) * v_line.unit_cost;
            IF v_qty_on_hand <= 0 THEN
                v_new_avg_cost := v_line.unit_cost;
            ELSE
                v_new_avg_cost := round(((v_qty_on_hand * v_avg_cost) + v_net_line_cost) / v_new_qty, 4);
            END IF;
        END IF;

        v_inv_value := v_new_qty * v_new_avg_cost;

        -- Update Balances
        UPDATE public.inventory_balances SET
            quantity_on_hand = v_new_qty,
            average_cost = v_new_avg_cost,
            inventory_value = v_inv_value,
            last_movement_at = now(),
            updated_at = now()
        WHERE organization_id = v_org_id AND item_id = v_line.item_id;

        -- Log reverse inventory movement
        INSERT INTO public.inventory_movements (
            organization_id, item_id, movement_type, movement_date,
            source_type, source_id, quantity_in, quantity_out,
            unit_cost, total_cost, quantity_after, average_cost_after, notes
        ) VALUES (
            v_org_id, v_line.item_id, 'adjustment', now()::date,
            'manual_adjustment', p_adjustment_id,
            CASE WHEN v_line.adjustment_quantity < 0 THEN abs(v_line.adjustment_quantity) ELSE 0.0000 END,
            CASE WHEN v_line.adjustment_quantity > 0 THEN v_line.adjustment_quantity ELSE 0.0000 END,
            v_line.unit_cost, v_line.total_cost, v_new_qty, v_new_avg_cost,
            'إلغاء وعكس التسوية المخزنية رقم ' || v_adj_number
        );
    END LOOP;

    -- Reverse Accounting entry if exists
    IF v_journal_entry_id IS NOT NULL THEN
        v_rev_entry_id := public.reverse_journal_entry(v_org_id, v_journal_entry_id);
    END IF;

    -- Update Adjustment Header
    UPDATE public.inventory_adjustments SET
        status = 'cancelled',
        cancelled_by = auth.uid(),
        cancelled_at = now(),
        cancel_reason = p_reason,
        updated_at = now()
    WHERE id = p_adjustment_id;

    -- Log Audit Log
    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        v_org_id, auth.uid(), 'cancel_inventory_adjustment',
        jsonb_build_object(
            'adjustment_id', p_adjustment_id,
            'reverse_journal_entry_id', v_rev_entry_id,
            'adjustment_number', v_adj_number,
            'status_from', 'approved',
            'status_to', 'cancelled'
        )
    );

    RETURN v_rev_entry_id;
END;
$$;


-- ==========================================================
-- 9. GRANTS FOR EXECUTIONS
-- ==========================================================
REVOKE ALL ON FUNCTION public.create_inventory_adjustment(uuid, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_inventory_adjustment(uuid, date, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.add_inventory_adjustment_line(uuid, uuid, numeric, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_inventory_adjustment_line(uuid, uuid, numeric, numeric, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_inventory_adjustment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_inventory_adjustment(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_inventory_adjustment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_inventory_adjustment(uuid, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
