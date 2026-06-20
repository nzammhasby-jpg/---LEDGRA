BEGIN;

-- ==========================================================
-- LEDGRA PHASE 7: BASIC INVENTORY & COST OF GOODS SOLD (COGS)
-- ==========================================================

-- 1. CREATE TABLE: inventory_balances
CREATE TABLE IF NOT EXISTS public.inventory_balances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    item_id uuid REFERENCES public.items(id) ON DELETE RESTRICT NOT NULL,
    quantity_on_hand numeric(15,4) NOT NULL DEFAULT 0.0000 CHECK (quantity_on_hand >= 0),
    average_cost numeric(15,4) NOT NULL DEFAULT 0.0000 CHECK (average_cost >= 0),
    inventory_value numeric(15,4) NOT NULL DEFAULT 0.0000 CHECK (inventory_value >= 0),
    last_movement_at timestamptz DEFAULT now() NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT inventory_balances_item_org_unique UNIQUE (organization_id, item_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS inventory_balances_org_idx ON public.inventory_balances (organization_id);
CREATE INDEX IF NOT EXISTS inventory_balances_item_idx ON public.inventory_balances (organization_id, item_id);


-- 2. CREATE TABLE: inventory_movements
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    item_id uuid REFERENCES public.items(id) ON DELETE RESTRICT NOT NULL,
    movement_type text NOT NULL CHECK (movement_type IN ('purchase', 'sale', 'purchase_cancel', 'sale_cancel', 'adjustment')),
    movement_date date NOT NULL,
    source_type text NOT NULL CHECK (source_type IN ('purchase_bill', 'sales_invoice', 'manual_adjustment')),
    source_id uuid NOT NULL,
    quantity_in numeric(15,4) NOT NULL DEFAULT 0.0000 CHECK (quantity_in >= 0),
    quantity_out numeric(15,4) NOT NULL DEFAULT 0.0000 CHECK (quantity_out >= 0),
    unit_cost numeric(15,4) NOT NULL DEFAULT 0.0000 CHECK (unit_cost >= 0),
    total_cost numeric(15,4) NOT NULL DEFAULT 0.0000 CHECK (total_cost >= 0),
    quantity_after numeric(15,4) NOT NULL CHECK (quantity_after >= 0),
    average_cost_after numeric(15,4) NOT NULL CHECK (average_cost_after >= 0),
    notes text,
    created_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT inventory_movements_qty_exclusivity CHECK (
        (quantity_in > 0 AND quantity_out = 0) OR
        (quantity_in = 0 AND quantity_out > 0)
    )
);

CREATE INDEX IF NOT EXISTS inventory_movements_org_idx ON public.inventory_movements (organization_id);
CREATE INDEX IF NOT EXISTS inventory_movements_item_idx ON public.inventory_movements (organization_id, item_id);


-- 3. ALTER MASTER TABLES to trace COGS and inventory impacts
ALTER TABLE public.sales_invoices 
    ADD COLUMN IF NOT EXISTS cogs_journal_entry_id uuid REFERENCES public.journal_entries(id),
    ADD COLUMN IF NOT EXISTS cancelled_cogs_journal_entry_id uuid REFERENCES public.journal_entries(id);


-- 4. UTILITY HELPER FOR ROLE ACCESS
CREATE OR REPLACE FUNCTION public.can_view_inventory_movements(p_organization_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role::text INTO v_role
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND profile_id = auth.uid();
    
    RETURN v_role IS NOT NULL AND v_role IN ('owner', 'admin', 'accountant', 'viewer');
END;
$$;


-- 5. RLS AND PROTECTED ACCESS POLICIES
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select inventory_balances" ON public.inventory_balances;
CREATE POLICY "Select inventory_balances" ON public.inventory_balances 
    FOR SELECT TO authenticated 
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Select inventory_movements" ON public.inventory_movements;
CREATE POLICY "Select inventory_movements" ON public.inventory_movements
    FOR SELECT TO authenticated 
    USING (public.can_view_inventory_movements(organization_id));

REVOKE ALL ON TABLE public.inventory_balances FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.inventory_movements FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.inventory_balances TO authenticated;
GRANT SELECT ON TABLE public.inventory_movements TO authenticated;


-- 6. TRIGGERS for updated_at tracking
DROP TRIGGER IF EXISTS trg_set_updated_at_inventory_balances ON public.inventory_balances;
CREATE TRIGGER trg_set_updated_at_inventory_balances
    BEFORE UPDATE ON public.inventory_balances
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_column();


-- ==========================================================
-- 7. RE-DEF: approve_sales_invoice (With basic Inventory & COGS)
-- ==========================================================
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
    v_inv_line record;
    v_journal_entry_id uuid;
    v_desc text;

    -- Inventory Integration fields
    v_is_stockable boolean;
    v_qty_on_hand numeric(15,4);
    v_avg_cost numeric(15,4);
    v_new_qty numeric(15,4);
    v_inv_value numeric(15,4);
    v_item_name text;
    v_line_cogs numeric(15,2);
    v_total_cogs_amount numeric(15,2);
    
    -- COGS parameters
    v_default_cogs_account_id uuid;
    v_default_inventory_account_id uuid;
    v_cogs_acc uuid;
    v_inv_acc uuid;
    v_cogs_lines jsonb := '[]'::jsonb;
    v_cogs_journal_id uuid := null;
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

    -- Get general settings for cogs & inventory fallback account
    SELECT default_cogs_account_id, default_inventory_account_id, default_tax_output_account_id
    INTO v_default_cogs_account_id, v_default_inventory_account_id, v_default_tax_output_account_id
    FROM public.accounting_settings
    WHERE organization_id = p_org_id;

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

    -- Create temporary table for tracking COGS lines to compile journal entries
    CREATE TEMP TABLE temp_cogs_compiled (
        cogs_account uuid,
        inventory_account uuid,
        amount numeric(15,2)
    ) ON COMMIT DROP;

    -- INTERVENT: Process Inventory Balances & Movements
    FOR v_inv_line IN
        SELECT l.id as line_id, l.item_id, l.quantity, i.is_stockable, i.name, i.cogs_account_id, i.inventory_account_id
        FROM public.sales_invoice_lines l
        JOIN public.items i ON l.item_id = i.id
        WHERE l.sales_invoice_id = p_invoice_id
    LOOP
        IF v_inv_line.is_stockable = true THEN
            -- Check stock balances with FOR UPDATE
            SELECT quantity_on_hand, average_cost
            INTO v_qty_on_hand, v_avg_cost
            FROM public.inventory_balances
            WHERE organization_id = p_org_id AND item_id = v_inv_line.item_id
            FOR UPDATE;

            IF NOT FOUND THEN
                v_qty_on_hand := 0.0000;
                v_avg_cost := 0.0000;
            END IF;

            -- Prevent negative balances
            IF v_qty_on_hand < v_inv_line.quantity THEN
                RAISE EXCEPTION 'الكمية غير متوفرة في المخزون للصنف (%). المتاح: (%) والمطلوب: (%).', 
                                v_inv_line.name, v_qty_on_hand, v_inv_line.quantity;
            END IF;

            -- Accounts resolution
            v_cogs_acc := COALESCE(v_inv_line.cogs_account_id, v_default_cogs_account_id);
            v_inv_acc := COALESCE(v_inv_line.inventory_account_id, v_default_inventory_account_id);

            IF v_cogs_acc IS NULL THEN
                RAISE EXCEPTION 'برجاء ربط حساب تكلفة المبيعات في بطاقة الصنف (%) أو الإعدادات المحاسبية أولاً.', v_inv_line.name;
            END IF;

            IF v_inv_acc IS NULL THEN
                RAISE EXCEPTION 'برجاء ربط حساب المخزون في بطاقة الصنف (%) أو الإعدادات المحاسبية أولاً.', v_inv_line.name;
            END IF;

            -- Calculate COGS
            v_line_cogs := round((v_inv_line.quantity * v_avg_cost), 2);
            v_new_qty := v_qty_on_hand - v_inv_line.quantity;

            -- Update Balance
            UPDATE public.inventory_balances SET
                quantity_on_hand = v_new_qty,
                inventory_value = v_new_qty * v_avg_cost,
                last_movement_at = now(),
                updated_at = now()
            WHERE organization_id = p_org_id AND item_id = v_inv_line.item_id;

            -- Insert Movement log
            INSERT INTO public.inventory_movements (
                organization_id, item_id, movement_type, movement_date,
                source_type, source_id, quantity_in, quantity_out,
                unit_cost, total_cost, quantity_after, average_cost_after, notes
            ) VALUES (
                p_org_id, v_inv_line.item_id, 'sale', v_invoice_date,
                'sales_invoice', p_invoice_id, 0.0000, v_inv_line.quantity,
                v_avg_cost, v_line_cogs, v_new_qty, v_avg_cost,
                'حركة منصرفة مبيعات للفاتورة: ' || v_invoice_number
            );

            -- Store under compiled temp table for COGS entry compiling
            IF v_line_cogs > 0 THEN
                INSERT INTO temp_cogs_compiled (cogs_account, inventory_account, amount)
                VALUES (v_cogs_acc, v_inv_acc, v_line_cogs);
            END IF;
        END IF;
    END LOOP;

    -- Build description for Sales Invoice entry
    v_desc := 'قيد تلقائي لفاتورة مبيعات رقم: ' || v_invoice_number || ' - العميل: ' || v_customer_name;

    -- Construct Debit line for standard Invoice Entry (Accounts Receivable)
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

    -- Create and Post the Automatic Invoice Journal Entry
    v_journal_entry_id := public.create_journal_entry(
        p_org_id,
        v_invoice_date,
        v_invoice_number,
        v_desc,
        v_journal_lines
    );

    -- Mark Journal Entry as System Type & Post it
    UPDATE public.journal_entries 
    SET source_type = 'system' 
    WHERE id = v_journal_entry_id AND organization_id = p_org_id;

    PERFORM public.post_journal_entry(p_org_id, v_journal_entry_id);

    -- COMPILE COGS JOURNAL ENTRY
    SELECT COALESCE(SUM(amount), 0) INTO v_total_cogs_amount FROM temp_cogs_compiled;

    IF v_total_cogs_amount > 0 THEN
        -- Build the json list of lines for COGS (Debit COGS Account, Credit Inventory Account)
        FOR v_inv_line IN
            SELECT cogs_account, inventory_account, SUM(amount) as net_cogs
            FROM temp_cogs_compiled
            GROUP BY cogs_account, inventory_account
        LOOP
            -- Validate Accounts
            PERFORM public.validate_master_data_account(v_inv_line.cogs_account, p_org_id, 'expenses', 'حساب مصروف تكلفة المبيعات');
            PERFORM public.validate_master_data_account(v_inv_line.inventory_account, p_org_id, 'assets', 'حساب أصل المخزون');

            v_cogs_lines := v_cogs_lines || jsonb_build_object(
                'account_id', v_inv_line.cogs_account,
                'description', 'تكلفة بضاعة مباعة للفاتورة: ' || v_invoice_number,
                'debit', v_inv_line.net_cogs,
                'credit', 0.00
            ) || jsonb_build_object(
                'account_id', v_inv_line.inventory_account,
                'description', 'تكلفة مخزون منصرف للفاتورة: ' || v_invoice_number,
                'debit', 0.00,
                'credit', v_inv_line.net_cogs
            );
        END LOOP;

        v_cogs_journal_id := public.create_journal_entry(
            p_org_id,
            v_invoice_date,
            v_invoice_number,
            'قيد تكلفة مبيعات تلقائي للفاتورة: ' || v_invoice_number,
            v_cogs_lines
        );

        UPDATE public.journal_entries 
        SET source_type = 'system' 
        WHERE id = v_cogs_journal_id AND organization_id = p_org_id;

        PERFORM public.post_journal_entry(p_org_id, v_cogs_journal_id);
    END IF;

    -- Update Invoice Header with both journal IDs
    UPDATE public.sales_invoices SET
        status = 'approved',
        journal_entry_id = v_journal_entry_id,
        cogs_journal_entry_id = v_cogs_journal_id,
        approved_at = now(),
        approved_by = auth.uid(),
        updated_at = now()
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    -- Log action in Audit Logs
    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        p_org_id, auth.uid(), 'approve_sales_invoice',
        jsonb_build_object(
            'sales_invoice_id', p_invoice_id,
            'journal_entry_id', v_journal_entry_id,
            'cogs_journal_entry_id', v_cogs_journal_id,
            'total_cogs', v_total_cogs_amount,
            'status_from', 'draft',
            'status_to', 'approved'
        )
    );

    RETURN v_journal_entry_id;
END;
$$;


-- ==========================================================
-- 8. RE-DEF: cancel_sales_invoice (With Basic Inventory reversal)
-- ==========================================================
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
    v_cogs_journal_entry_id uuid;
    v_status text;
    v_invoice_number text;
    v_paid_amount numeric(15,2);
    v_rev_entry_id uuid := null;
    v_rev_cogs_id uuid := null;
    
    -- Inventory Reversal logic
    v_inv_line record;
    v_qty_on_hand numeric(15,4);
    v_avg_cost numeric(15,4);
    v_new_qty numeric(15,4);

    -- Phase 7 additions
    v_is_stockable boolean;
    v_old_value numeric(15,4);
    v_new_value numeric(15,4);
    v_new_avg_cost numeric(15,4);
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
    SELECT status, invoice_number, journal_entry_id, cogs_journal_entry_id, paid_amount 
    INTO v_status, v_invoice_number, v_journal_entry_id, v_cogs_journal_entry_id, v_paid_amount
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

    -- Check if there are any stockable lines in the invoice
    SELECT EXISTS (
        SELECT 1
        FROM public.sales_invoice_lines l
        JOIN public.items i ON l.item_id = i.id
        WHERE l.sales_invoice_id = p_invoice_id AND i.is_stockable = true
    ) INTO v_is_stockable;

    -- Prevent cancellation if original movement is missing for stockable invoices
    IF v_is_stockable THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.inventory_movements
            WHERE organization_id = p_org_id
              AND source_id = p_invoice_id
              AND source_type = 'sales_invoice'
              AND movement_type = 'sale'
        ) THEN
            RAISE EXCEPTION 'لا يمكن إلغاء الفاتورة المخزنية لأن حركة المخزون الأصلية غير موجودة.';
        END IF;
    END IF;

    -- Inventory Reversal: Return Items to Stock using original sale movements
    FOR v_inv_line IN
        SELECT m.item_id, m.quantity_out AS quantity, m.unit_cost AS original_unit_cost, m.total_cost AS original_total_cost, i.name
        FROM public.inventory_movements m
        JOIN public.items i ON m.item_id = i.id
        WHERE m.organization_id = p_org_id
          AND m.source_id = p_invoice_id
          AND m.source_type = 'sales_invoice'
          AND m.movement_type = 'sale'
    LOOP
        -- Lock inventory balance
        SELECT quantity_on_hand, average_cost
        INTO v_qty_on_hand, v_avg_cost
        FROM public.inventory_balances
        WHERE organization_id = p_org_id AND item_id = v_inv_line.item_id
        FOR UPDATE;

        IF NOT FOUND THEN
            v_qty_on_hand := 0.0000;
            v_avg_cost := 0.0000;
            
            -- Create entry if it was missing 
            INSERT INTO public.inventory_balances(
                organization_id, item_id, quantity_on_hand, average_cost, inventory_value, last_movement_at
            ) VALUES (
                p_org_id, v_inv_line.item_id, 0.0000, 0.0000, 0.0000, now()
            );
        END IF;

        v_old_value := v_qty_on_hand * v_avg_cost;
        v_new_qty := v_qty_on_hand + v_inv_line.quantity;
        v_new_value := v_old_value + v_inv_line.original_total_cost;

        IF v_new_qty > 0 THEN
            v_new_avg_cost := round(v_new_value / v_new_qty, 4);
        ELSE
            v_new_avg_cost := 0;
            v_new_value := 0;
        END IF;

        -- Update Balance (re-added stock)
        UPDATE public.inventory_balances SET
            quantity_on_hand = v_new_qty,
            average_cost = v_new_avg_cost,
            inventory_value = v_new_value,
            last_movement_at = now(),
            updated_at = now()
        WHERE organization_id = p_org_id AND item_id = v_inv_line.item_id;

        -- Add a movement to reflect return
        INSERT INTO public.inventory_movements (
            organization_id, item_id, movement_type, movement_date,
            source_type, source_id, quantity_in, quantity_out,
            unit_cost, total_cost, quantity_after, average_cost_after, notes
        ) VALUES (
            p_org_id, v_inv_line.item_id, 'sale_cancel', now()::date,
            'sales_invoice', p_invoice_id, v_inv_line.quantity, 0.0000,
            v_inv_line.original_unit_cost, v_inv_line.original_total_cost, v_new_qty, v_new_avg_cost,
            'إلغاء وعكس مبيعات للفاتورة: ' || v_invoice_number
        );
    END LOOP;

    -- Reverse journal entry for Sales Invoice
    IF v_journal_entry_id IS NOT NULL THEN
        v_rev_entry_id := public.reverse_journal_entry(p_org_id, v_journal_entry_id);
        
        UPDATE public.journal_entries 
        SET source_type = 'system' 
        WHERE id = v_rev_entry_id AND organization_id = p_org_id;
    END IF;

    -- Reverse journal entry for Cost of Goods sold (COGS)
    IF v_cogs_journal_entry_id IS NOT NULL THEN
        v_rev_cogs_id := public.reverse_journal_entry(p_org_id, v_cogs_journal_entry_id);
        
        UPDATE public.journal_entries 
        SET source_type = 'system' 
        WHERE id = v_rev_cogs_id AND organization_id = p_org_id;
    END IF;

    -- Update invoice to cancelled
    UPDATE public.sales_invoices SET
        status = 'cancelled',
        cancelled_journal_entry_id = v_rev_entry_id,
        cancelled_cogs_journal_entry_id = v_rev_cogs_id,
        cancelled_at = now(),
        cancelled_by = auth.uid(),
        balance_due = 0.00,
        updated_at = now()
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    -- Log audit trail
    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        p_org_id, auth.uid(), 'cancel_sales_invoice',
        jsonb_build_object(
            'sales_invoice_id', p_invoice_id,
            'status_from', 'approved',
            'status_to', 'cancelled',
            'cancelled_journal_entry_id', v_rev_entry_id,
            'cancelled_cogs_journal_entry_id', v_rev_cogs_id
        )
    );

    RETURN v_rev_entry_id;
END;
$$;


-- ==========================================================
-- 9. RE-DEF: approve_purchase_bill (With Basic Inventory additions)
-- ==========================================================
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
    v_inv_line record;
    v_journal_entry_id uuid;
    v_desc text;

    -- Inventory Integration variables
    v_qty_on_hand numeric(15,4);
    v_avg_cost numeric(15,4);
    v_new_qty numeric(15,4);
    v_new_avg_cost numeric(15,4);
    v_inv_value numeric(15,4);

    -- Phase 7 Net Cost Calculations
    v_net_line_cost numeric(15,4);
    v_net_unit_cost numeric(15,4);
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

    -- INTERVENT: Process Inventory Balances & Movements for stockable bills
    FOR v_inv_line IN
        SELECT l.item_id, l.quantity, l.unit_cost, l.discount_amount, i.is_stockable, i.name
        FROM public.purchase_bill_lines l
        JOIN public.items i ON l.item_id = i.id
        WHERE l.purchase_bill_id = p_bill_id
    LOOP
        IF v_inv_line.is_stockable = true THEN
            -- Fetch and lock stock balance row
            SELECT quantity_on_hand, average_cost
            INTO v_qty_on_hand, v_avg_cost
            FROM public.inventory_balances
            WHERE organization_id = p_org_id AND item_id = v_inv_line.item_id
            FOR UPDATE;

            IF NOT FOUND THEN
                v_qty_on_hand := 0.0000;
                v_avg_cost := 0.0000;
                
                -- Create default entry
                INSERT INTO public.inventory_balances (
                    organization_id, item_id, quantity_on_hand, average_cost, inventory_value, last_movement_at
                ) VALUES (
                    p_org_id, v_inv_line.item_id, 0.0000, 0.0000, 0.0000, now()
                );
            END IF;

            -- Calculate net cost considering discount
            v_net_line_cost := (v_inv_line.quantity * v_inv_line.unit_cost) - v_inv_line.discount_amount;
            IF v_inv_line.quantity > 0 THEN
                v_net_unit_cost := round(v_net_line_cost / v_inv_line.quantity, 4);
            ELSE
                v_net_unit_cost := 0.0000;
            END IF;

            -- Calculate Weighted Average Cost (WAC)
            v_new_qty := v_qty_on_hand + v_inv_line.quantity;
            
            IF v_qty_on_hand <= 0 THEN
                v_new_avg_cost := v_net_unit_cost;
            ELSE
                v_new_avg_cost := round(((v_qty_on_hand * v_avg_cost) + v_net_line_cost) / v_new_qty, 4);
            END IF;
            
            v_inv_value := v_new_qty * v_new_avg_cost;

            -- Update Balances
            UPDATE public.inventory_balances SET
                quantity_on_hand = v_new_qty,
                average_cost = v_new_avg_cost,
                inventory_value = v_inv_value,
                last_movement_at = now(),
                updated_at = now()
            WHERE organization_id = p_org_id AND item_id = v_inv_line.item_id;

            -- Log Inventory Movement
            INSERT INTO public.inventory_movements (
                organization_id, item_id, movement_type, movement_date,
                source_type, source_id, quantity_in, quantity_out,
                unit_cost, total_cost, quantity_after, average_cost_after, notes
            ) VALUES (
                p_org_id, v_inv_line.item_id, 'purchase', v_bill_date,
                'purchase_bill', p_bill_id, v_inv_line.quantity, 0.0000,
                v_net_unit_cost, v_net_line_cost, v_new_qty, v_new_avg_cost,
                'حركة واردة من فاتورة شراء رقم: ' || v_bill_number
            );
        END IF;
    END LOOP;

    -- Build Description for Journal Entry
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


-- ==========================================================
-- 10. RE-DEF: cancel_purchase_bill (With Basic Inventory reversal checks)
-- ==========================================================
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

    -- Inventory Reversal logic
    v_inv_line record;
    v_qty_on_hand numeric(15,4);
    v_avg_cost numeric(15,4);
    v_new_qty numeric(15,4);

    -- Phase 7 additions
    v_is_stockable boolean;
    v_old_value numeric(15,4);
    v_new_value numeric(15,4);
    v_new_avg_cost numeric(15,4);
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

    -- Check if there are any stockable lines in the bill
    SELECT EXISTS (
        SELECT 1
        FROM public.purchase_bill_lines l
        JOIN public.items i ON l.item_id = i.id
        WHERE l.purchase_bill_id = p_bill_id AND i.is_stockable = true
    ) INTO v_is_stockable;

    -- Prevent cancellation if original movement is missing for stockable bills
    IF v_is_stockable THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.inventory_movements
            WHERE organization_id = p_org_id
              AND source_id = p_bill_id
              AND source_type = 'purchase_bill'
              AND movement_type = 'purchase'
        ) THEN
            RAISE EXCEPTION 'لا يمكن إلغاء الفاتورة المخزنية لأن حركة المخزون الأصلية غير موجودة.';
        END IF;
    END IF;

    -- INTERVENT: Perform conservative Inventory reversal using original purchase movements
    FOR v_inv_line IN
        SELECT m.item_id, m.quantity_in AS quantity, m.unit_cost AS original_unit_cost, m.total_cost AS original_total_cost, i.name
        FROM public.inventory_movements m
        JOIN public.items i ON m.item_id = i.id
        WHERE m.organization_id = p_org_id
          AND m.source_id = p_bill_id
          AND m.source_type = 'purchase_bill'
          AND m.movement_type = 'purchase'
    LOOP
        -- Check stock level and lock FOR UPDATE
        SELECT quantity_on_hand, average_cost
        INTO v_qty_on_hand, v_avg_cost
        FROM public.inventory_balances
        WHERE organization_id = p_org_id AND item_id = v_inv_line.item_id
        FOR UPDATE;

        IF NOT FOUND OR v_qty_on_hand < v_inv_line.quantity THEN
            RAISE EXCEPTION 'لا يمكن إلغاء فاتورة الشراء بسبب عدم كفاية كمية المخزون المتاحة للصنف (%) لعكس عملية الشراء بنجاح.', v_inv_line.name;
        END IF;

        v_new_qty := v_qty_on_hand - v_inv_line.quantity;
        v_old_value := v_qty_on_hand * v_avg_cost;
        v_new_value := v_old_value - v_inv_line.original_total_cost;

        IF v_new_qty > 0 THEN
            v_new_avg_cost := round(v_new_value / v_new_qty, 4);
            IF v_new_avg_cost < 0 THEN
                v_new_avg_cost := 0;
            END IF;
        ELSE
            v_new_avg_cost := 0;
            v_new_value := 0;
        END IF;

        -- Deduct stock
        UPDATE public.inventory_balances SET
            quantity_on_hand = v_new_qty,
            average_cost = v_new_avg_cost,
            inventory_value = v_new_value,
            last_movement_at = now(),
            updated_at = now()
        WHERE organization_id = p_org_id AND item_id = v_inv_line.item_id;

        -- Log return/adjustment movement
        INSERT INTO public.inventory_movements (
            organization_id, item_id, movement_type, movement_date,
            source_type, source_id, quantity_in, quantity_out,
            unit_cost, total_cost, quantity_after, average_cost_after, notes
        ) VALUES (
            p_org_id, v_inv_line.item_id, 'purchase_cancel', now()::date,
            'purchase_bill', p_bill_id, 0.0000, v_inv_line.quantity,
            v_inv_line.original_unit_cost, v_inv_line.original_total_cost, v_new_qty, v_new_avg_cost,
            'إلغاء وعكس فاتورة مشتريات رقم: ' || v_bill_number
        );
    END LOOP;

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
    WHERE id = p_bill_id AND organization_id = p_org_id;

    -- Log transaction
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'CANCEL_PURCHASE_BILL', jsonb_build_object('bill_id', p_bill_id, 'cancelled_journal_entry_id', v_rev_entry_id, 'bill_number', v_bill_number));

    RETURN v_rev_entry_id;
END;
$$;


-- ==========================================================
-- 11. GRANT SECURE PRIVILEGES
-- ==========================================================
REVOKE ALL ON FUNCTION public.approve_sales_invoice(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_sales_invoice(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_sales_invoice(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_sales_invoice(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_purchase_bill(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_bill(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_purchase_bill(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_bill(uuid, uuid) TO authenticated;

COMMIT;
