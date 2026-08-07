-- Migration: 20260806000000_return_notes_discount_tax_integrity.sql
-- Description: Ensures return credit/debit notes take into account original line discounts, tax amounts, and rounding integrity.

-- ============================================================================
-- 1. REDEFINE FUNCTION: public.add_sales_credit_note_line
-- ============================================================================
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
    v_orig_tax_amount numeric(15,2);
    v_orig_line_total numeric(15,2);
    v_orig_net_before_tax numeric(15,2);
    
    -- Quantity & cumulative return validations
    v_prev_returned_quantity numeric(15,4);
    v_prev_returned_subtotal numeric(15,2);
    v_prev_returned_tax numeric(15,2);
    v_prev_returned_total numeric(15,2);
    v_available_quantity numeric(15,4);
    v_return_ratio numeric(15,8);
    
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

    -- Get original line details with lock to prevent race conditions
    SELECT sales_invoice_id, item_id, description, quantity, unit_price, tax_rate, tax_amount, line_total
    INTO v_orig_invoice_id, v_item_id, v_description, v_orig_quantity, v_unit_price, v_tax_rate, v_orig_tax_amount, v_orig_line_total
    FROM public.sales_invoice_lines
    WHERE id = p_original_invoice_line_id
    FOR UPDATE;

    IF v_orig_invoice_id IS NULL THEN
        RAISE EXCEPTION 'بند الفاتورة الأصلية غير موجود.';
    END IF;

    IF v_orig_invoice_id <> v_original_invoice_id THEN
        RAISE EXCEPTION 'بند الفاتورة لا يطابق الفاتورة الأصلية المرتبطة بالإشعار الدائن.';
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'الكمية المرتجعة يجب أن تكون أكبر من الصفر.';
    END IF;

    -- Calculate original net before tax
    v_orig_net_before_tax := v_orig_line_total - v_orig_tax_amount;

    -- Calculate already returned amounts for this line across APPROVED credit notes (excluding current note line)
    SELECT 
        COALESCE(SUM(l.quantity), 0),
        COALESCE(SUM(l.subtotal), 0),
        COALESCE(SUM(l.tax_amount), 0),
        COALESCE(SUM(l.total_amount), 0)
    INTO 
        v_prev_returned_quantity,
        v_prev_returned_subtotal,
        v_prev_returned_tax,
        v_prev_returned_total
    FROM public.sales_credit_note_lines l
    JOIN public.sales_credit_notes cn ON l.credit_note_id = cn.id
    WHERE l.original_invoice_line_id = p_original_invoice_line_id
      AND cn.status = 'approved'
      AND cn.id <> p_credit_note_id;

    -- Check for historical over-returns
    IF v_prev_returned_quantity > v_orig_quantity OR v_prev_returned_total > v_orig_line_total THEN
        RAISE EXCEPTION 'تعارض في المرتجعات التاريخية المعتمدة لهذا البند. تم إرجاع (%) من أصل (%). يرجى المراجعة المحاسبية.',
            v_prev_returned_quantity, v_orig_quantity;
    END IF;

    v_available_quantity := v_orig_quantity - v_prev_returned_quantity;

    IF p_quantity > v_available_quantity THEN
        RAISE EXCEPTION 'الكمية المطلوبة (%) تتجاوز الكمية المتاحة للإرجاع (%). تم إرجاع (%) سابقاً من أصل (%).',
            p_quantity, v_available_quantity, v_prev_returned_quantity, v_orig_quantity;
    END IF;

    -- Return calculation considering original discount and tax
    v_return_ratio := p_quantity / v_orig_quantity;

    IF p_quantity = v_available_quantity AND v_prev_returned_quantity > 0 THEN
        -- Final remaining return: Use exact remaining financial balance to eliminate rounding discrepancies
        v_subtotal := GREATEST(0, v_orig_net_before_tax - v_prev_returned_subtotal);
        v_tax_amount := GREATEST(0, v_orig_tax_amount - v_prev_returned_tax);
        v_total_amount := GREATEST(0, v_orig_line_total - v_prev_returned_total);
    ELSE
        v_subtotal := GREATEST(0, round(v_orig_net_before_tax * v_return_ratio, 2));
        v_tax_amount := GREATEST(0, round(v_orig_tax_amount * v_return_ratio, 2));
        v_total_amount := round(v_subtotal + v_tax_amount, 2);
    END IF;

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

    -- Re-calculate credit note header totals
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


-- ============================================================================
-- 2. REDEFINE FUNCTION: public.add_purchase_debit_note_line
-- ============================================================================
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
    v_orig_tax_amount numeric(15,2);
    v_orig_line_total numeric(15,2);
    v_orig_net_before_tax numeric(15,2);
    
    -- Quantity & cumulative return validations
    v_prev_returned_quantity numeric(15,4);
    v_prev_returned_subtotal numeric(15,2);
    v_prev_returned_tax numeric(15,2);
    v_prev_returned_total numeric(15,2);
    v_available_quantity numeric(15,4);
    v_return_ratio numeric(15,8);
    
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

    -- Get original line details with lock to prevent race conditions
    SELECT purchase_bill_id, item_id, description, quantity, unit_cost, tax_rate, tax_amount, line_total
    INTO v_orig_bill_id, v_item_id, v_description, v_orig_quantity, v_unit_cost, v_tax_rate, v_orig_tax_amount, v_orig_line_total
    FROM public.purchase_bill_lines
    WHERE id = p_original_bill_line_id
    FOR UPDATE;

    IF v_orig_bill_id IS NULL THEN
        RAISE EXCEPTION 'بند فاتورة الشراء الأصلية غير موجود.';
    END IF;

    IF v_orig_bill_id <> v_original_bill_id THEN
        RAISE EXCEPTION 'بند الفاتورة لا يطابق فاتورة الشراء الأصلية المرتبطة بالإشعار المدين.';
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'الكمية المرتجعة يجب أن تكون أكبر من الصفر.';
    END IF;

    -- Calculate original net before tax
    v_orig_net_before_tax := v_orig_line_total - v_orig_tax_amount;

    -- Calculate already returned amounts for this line across APPROVED debit notes (excluding current note line)
    SELECT 
        COALESCE(SUM(l.quantity), 0),
        COALESCE(SUM(l.subtotal), 0),
        COALESCE(SUM(l.tax_amount), 0),
        COALESCE(SUM(l.total_amount), 0)
    INTO 
        v_prev_returned_quantity,
        v_prev_returned_subtotal,
        v_prev_returned_tax,
        v_prev_returned_total
    FROM public.purchase_debit_note_lines l
    JOIN public.purchase_debit_notes dn ON l.debit_note_id = dn.id
    WHERE l.original_bill_line_id = p_original_bill_line_id
      AND dn.status = 'approved'
      AND dn.id <> p_debit_note_id;

    -- Check for historical over-returns
    IF v_prev_returned_quantity > v_orig_quantity OR v_prev_returned_total > v_orig_line_total THEN
        RAISE EXCEPTION 'تعارض في المرتجعات التاريخية المعتمدة لهذا البند. تم إرجاع (%) من أصل (%). يرجى المراجعة المحاسبية.',
            v_prev_returned_quantity, v_orig_quantity;
    END IF;

    v_available_quantity := v_orig_quantity - v_prev_returned_quantity;

    IF p_quantity > v_available_quantity THEN
        RAISE EXCEPTION 'الكمية المطلوبة (%) تتجاوز الكمية المتاحة للإرجاع (%). تم إرجاع (%) سابقاً من أصل (%).',
            p_quantity, v_available_quantity, v_prev_returned_quantity, v_orig_quantity;
    END IF;

    -- Return calculation considering original discount and tax
    v_return_ratio := p_quantity / v_orig_quantity;

    IF p_quantity = v_available_quantity AND v_prev_returned_quantity > 0 THEN
        -- Final remaining return: Use exact remaining financial balance to eliminate rounding discrepancies
        v_subtotal := GREATEST(0, v_orig_net_before_tax - v_prev_returned_subtotal);
        v_tax_amount := GREATEST(0, v_orig_tax_amount - v_prev_returned_tax);
        v_total_amount := GREATEST(0, v_orig_line_total - v_prev_returned_total);
    ELSE
        v_subtotal := GREATEST(0, round(v_orig_net_before_tax * v_return_ratio, 2));
        v_tax_amount := GREATEST(0, round(v_orig_tax_amount * v_return_ratio, 2));
        v_total_amount := round(v_subtotal + v_tax_amount, 2);
    END IF;

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

    -- Re-calculate debit note header totals
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


-- ============================================================================
-- 3. REDEFINE FUNCTION: public.approve_sales_credit_note
-- ============================================================================
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

    -- Validations & line math variables
    v_orig_qty numeric(15,4);
    v_orig_tax numeric(15,2);
    v_orig_total numeric(15,2);
    v_orig_net numeric(15,2);
    v_prev_returned_quantity numeric(15,4);
    v_prev_returned_subtotal numeric(15,2);
    v_prev_returned_tax numeric(15,2);
    v_prev_returned_total numeric(15,2);
    v_available_quantity numeric(15,4);
    v_ratio numeric(15,8);
    v_calc_subtotal numeric(15,2);
    v_calc_tax numeric(15,2);
    v_calc_total numeric(15,2);
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Get credit note details
    SELECT organization_id, status, credit_note_number, credit_note_date, original_invoice_id, customer_id, currency_code
    INTO v_org_id, v_status, v_credit_note_number, v_credit_note_date, v_original_invoice_id, v_customer_id, v_currency_code
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

    -- 1. Double check and validate quantities and re-calculate line totals for precision
    FOR v_line IN 
        SELECT l.id, l.original_invoice_line_id, l.quantity, l.description, l.unit_price, l.tax_rate, l.item_id, i.is_stockable, i.name as item_name, i.cogs_account_id, i.inventory_account_id, il.revenue_account_id
        FROM public.sales_credit_note_lines l
        JOIN public.sales_invoice_lines il ON l.original_invoice_line_id = il.id
        LEFT JOIN public.items i ON l.item_id = i.id
        WHERE l.credit_note_id = p_credit_note_id
    LOOP
        -- Lock original line for update
        SELECT quantity, tax_amount, line_total
        INTO v_orig_qty, v_orig_tax, v_orig_total
        FROM public.sales_invoice_lines
        WHERE id = v_line.original_invoice_line_id
        FOR UPDATE;

        v_orig_net := v_orig_total - v_orig_tax;

        -- Calculate already returned quantities & financial amounts for this line across approved credit notes
        SELECT 
            COALESCE(SUM(cnl.quantity), 0),
            COALESCE(SUM(cnl.subtotal), 0),
            COALESCE(SUM(cnl.tax_amount), 0),
            COALESCE(SUM(cnl.total_amount), 0)
        INTO 
            v_prev_returned_quantity,
            v_prev_returned_subtotal,
            v_prev_returned_tax,
            v_prev_returned_total
        FROM public.sales_credit_note_lines cnl
        JOIN public.sales_credit_notes cn ON cnl.credit_note_id = cn.id
        WHERE cnl.original_invoice_line_id = v_line.original_invoice_line_id
          AND cn.status = 'approved'
          AND cn.id <> p_credit_note_id;

        -- Check historical over-returns
        IF v_prev_returned_quantity > v_orig_qty OR v_prev_returned_total > v_orig_total THEN
            RAISE EXCEPTION 'تعارض في المرتجعات التاريخية المعتمدة للبند (%). تم إرجاع (%) من أصل (%). يرجى المراجعة المحاسبية.',
                v_line.description, v_prev_returned_quantity, v_orig_qty;
        END IF;

        v_available_quantity := v_orig_qty - v_prev_returned_quantity;

        IF v_line.quantity > v_available_quantity THEN
            RAISE EXCEPTION 'لا يمكن الاعتماد: الكمية في البند (%) تتجاوز الكمية المتاحة للإرجاع (%). المتاح: (%).',
                v_line.description, v_available_quantity, v_available_quantity;
        END IF;

        -- Re-calculate exact line values
        v_ratio := v_line.quantity / v_orig_qty;
        IF v_line.quantity = v_available_quantity AND v_prev_returned_quantity > 0 THEN
            v_calc_subtotal := GREATEST(0, v_orig_net - v_prev_returned_subtotal);
            v_calc_tax := GREATEST(0, v_orig_tax - v_prev_returned_tax);
            v_calc_total := GREATEST(0, v_orig_total - v_prev_returned_total);
        ELSE
            v_calc_subtotal := GREATEST(0, round(v_orig_net * v_ratio, 2));
            v_calc_tax := GREATEST(0, round(v_orig_tax * v_ratio, 2));
            v_calc_total := round(v_calc_subtotal + v_calc_tax, 2);
        END IF;

        UPDATE public.sales_credit_note_lines SET
            subtotal = v_calc_subtotal,
            tax_amount = v_calc_tax,
            total_amount = v_calc_total
        WHERE id = v_line.id;
    END LOOP;

    -- Re-calculate note header totals from lines
    SELECT 
        COALESCE(SUM(subtotal), 0),
        COALESCE(SUM(tax_amount), 0),
        COALESCE(SUM(total_amount), 0)
    INTO v_subtotal, v_tax_amount, v_total_amount
    FROM public.sales_credit_note_lines
    WHERE credit_note_id = p_credit_note_id;

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
        subtotal = v_subtotal,
        tax_amount = v_tax_amount,
        total_amount = v_total_amount,
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


-- ============================================================================
-- 4. REDEFINE FUNCTION: public.approve_purchase_debit_note
-- ============================================================================
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

    -- Validations & line math variables
    v_orig_qty numeric(15,4);
    v_orig_tax numeric(15,2);
    v_orig_total numeric(15,2);
    v_orig_net numeric(15,2);
    v_prev_returned_quantity numeric(15,4);
    v_prev_returned_subtotal numeric(15,2);
    v_prev_returned_tax numeric(15,2);
    v_prev_returned_total numeric(15,2);
    v_available_quantity numeric(15,4);
    v_ratio numeric(15,8);
    v_calc_subtotal numeric(15,2);
    v_calc_tax numeric(15,2);
    v_calc_total numeric(15,2);
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Get debit note details
    SELECT organization_id, status, debit_note_number, debit_note_date, original_bill_id, vendor_id, currency_code
    INTO v_org_id, v_status, v_debit_note_number, v_debit_note_date, v_original_bill_id, v_vendor_id, v_currency_code
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

    -- 1. Double check quantities, re-calculate line values and check stock for stockable items
    FOR v_line IN 
        SELECT l.id, l.original_bill_line_id, l.quantity, l.description, l.unit_price, l.tax_rate, l.item_id, i.is_stockable, i.name as item_name, i.inventory_account_id, bl.expense_account_id
        FROM public.purchase_debit_note_lines l
        JOIN public.purchase_bill_lines bl ON l.original_bill_line_id = bl.id
        LEFT JOIN public.items i ON l.item_id = i.id
        WHERE l.debit_note_id = p_debit_note_id
    LOOP
        -- Lock original line
        SELECT quantity, tax_amount, line_total
        INTO v_orig_qty, v_orig_tax, v_orig_total
        FROM public.purchase_bill_lines
        WHERE id = v_line.original_bill_line_id
        FOR UPDATE;

        v_orig_net := v_orig_total - v_orig_tax;

        -- Calculate already returned quantities & financial amounts across approved debit notes
        SELECT 
            COALESCE(SUM(dn_l.quantity), 0),
            COALESCE(SUM(dn_l.subtotal), 0),
            COALESCE(SUM(dn_l.tax_amount), 0),
            COALESCE(SUM(dn_l.total_amount), 0)
        INTO 
            v_prev_returned_quantity,
            v_prev_returned_subtotal,
            v_prev_returned_tax,
            v_prev_returned_total
        FROM public.purchase_debit_note_lines dn_l
        JOIN public.purchase_debit_notes dn ON dn_l.debit_note_id = dn.id
        WHERE dn_l.original_bill_line_id = v_line.original_bill_line_id
          AND dn.status = 'approved'
          AND dn.id <> p_debit_note_id;

        -- Check historical over-returns
        IF v_prev_returned_quantity > v_orig_qty OR v_prev_returned_total > v_orig_total THEN
            RAISE EXCEPTION 'تعارض في المرتجعات التاريخية المعتمدة للبند (%). تم إرجاع (%) من أصل (%). يرجى المراجعة المحاسبية.',
                v_line.description, v_prev_returned_quantity, v_orig_qty;
        END IF;

        v_available_quantity := v_orig_qty - v_prev_returned_quantity;

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

        -- Re-calculate exact line values
        v_ratio := v_line.quantity / v_orig_qty;
        IF v_line.quantity = v_available_quantity AND v_prev_returned_quantity > 0 THEN
            v_calc_subtotal := GREATEST(0, v_orig_net - v_prev_returned_subtotal);
            v_calc_tax := GREATEST(0, v_orig_tax - v_prev_returned_tax);
            v_calc_total := GREATEST(0, v_orig_total - v_prev_returned_total);
        ELSE
            v_calc_subtotal := GREATEST(0, round(v_orig_net * v_ratio, 2));
            v_calc_tax := GREATEST(0, round(v_orig_tax * v_ratio, 2));
            v_calc_total := round(v_calc_subtotal + v_calc_tax, 2);
        END IF;

        UPDATE public.purchase_debit_note_lines SET
            subtotal = v_calc_subtotal,
            tax_amount = v_calc_tax,
            total_amount = v_calc_total
        WHERE id = v_line.id;
    END LOOP;

    -- Re-calculate note header totals from lines
    SELECT 
        COALESCE(SUM(subtotal), 0),
        COALESCE(SUM(tax_amount), 0),
        COALESCE(SUM(total_amount), 0)
    INTO v_subtotal, v_tax_amount, v_total_amount
    FROM public.purchase_debit_note_lines
    WHERE debit_note_id = p_debit_note_id;

    -- 2. Process inventory returns (Deducting from inventory)
    FOR v_line IN 
        SELECT l.original_bill_line_id, l.quantity, l.item_id, l.unit_price, l.subtotal, i.is_stockable, i.name as item_name
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

            -- Deduct stock using net subtotal (cost after discount)
            v_old_value := v_qty_on_hand * v_avg_cost;
            v_new_qty := v_qty_on_hand - v_line.quantity;
            v_new_value := v_old_value - v_line.subtotal;

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

            -- Insert Movement log using net subtotal
            INSERT INTO public.inventory_movements (
                organization_id, item_id, movement_type, movement_date,
                source_type, source_id, quantity_in, quantity_out,
                unit_cost, total_cost, quantity_after, average_cost_after, notes
            ) VALUES (
                v_org_id, v_line.item_id, 'purchase_cancel', v_debit_note_date,
                'purchase_debit_note', p_debit_note_id, 0.0000, v_line.quantity,
                CASE WHEN v_line.quantity > 0 THEN round(v_line.subtotal / v_line.quantity, 4) ELSE 0 END,
                v_line.subtotal, v_new_qty, v_new_avg_cost,
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
        subtotal = v_subtotal,
        tax_amount = v_tax_amount,
        total_amount = v_total_amount,
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


-- ============================================================================
-- 5. RECALCULATE EXISTING DRAFT CREDIT AND DEBIT NOTES
-- ============================================================================
DO $$
DECLARE
    v_draft_line record;
    v_orig_qty numeric(15,4);
    v_orig_tax numeric(15,2);
    v_orig_total numeric(15,2);
    v_orig_net numeric(15,2);
    v_prev_qty numeric(15,4);
    v_prev_subtotal numeric(15,2);
    v_prev_tax numeric(15,2);
    v_prev_total numeric(15,2);
    v_avail_qty numeric(15,4);
    v_ratio numeric(15,8);
    v_calc_subtotal numeric(15,2);
    v_calc_tax numeric(15,2);
    v_calc_total numeric(15,2);
BEGIN
    -- Recalculate existing draft sales credit note lines
    FOR v_draft_line IN
        SELECT l.id, l.credit_note_id, l.original_invoice_line_id, l.quantity, cn.credit_note_number
        FROM public.sales_credit_note_lines l
        JOIN public.sales_credit_notes cn ON l.credit_note_id = cn.id
        WHERE cn.status = 'draft'
    LOOP
        SELECT quantity, tax_amount, line_total
        INTO v_orig_qty, v_orig_tax, v_orig_total
        FROM public.sales_invoice_lines
        WHERE id = v_draft_line.original_invoice_line_id;

        IF v_orig_qty IS NOT NULL AND v_orig_qty > 0 THEN
            v_orig_net := v_orig_total - v_orig_tax;

            SELECT 
                COALESCE(SUM(l2.quantity), 0),
                COALESCE(SUM(l2.subtotal), 0),
                COALESCE(SUM(l2.tax_amount), 0),
                COALESCE(SUM(l2.total_amount), 0)
            INTO v_prev_qty, v_prev_subtotal, v_prev_tax, v_prev_total
            FROM public.sales_credit_note_lines l2
            JOIN public.sales_credit_notes cn2 ON l2.credit_note_id = cn2.id
            WHERE l2.original_invoice_line_id = v_draft_line.original_invoice_line_id
              AND cn2.status = 'approved'
              AND cn2.id <> v_draft_line.credit_note_id;

            v_avail_qty := v_orig_qty - v_prev_qty;

            IF v_draft_line.quantity > v_avail_qty THEN
                RAISE EXCEPTION 'المسودة (%) تحتوي على كمية مرتجعة (%) تتجاوز الكمية المتاحة (%).',
                    v_draft_line.credit_note_number, v_draft_line.quantity, v_avail_qty;
            END IF;

            v_ratio := v_draft_line.quantity / v_orig_qty;
            IF v_draft_line.quantity = v_avail_qty AND v_prev_qty > 0 THEN
                v_calc_subtotal := GREATEST(0, v_orig_net - v_prev_subtotal);
                v_calc_tax := GREATEST(0, v_orig_tax - v_prev_tax);
                v_calc_total := GREATEST(0, v_orig_total - v_prev_total);
            ELSE
                v_calc_subtotal := GREATEST(0, round(v_orig_net * v_ratio, 2));
                v_calc_tax := GREATEST(0, round(v_orig_tax * v_ratio, 2));
                v_calc_total := round(v_calc_subtotal + v_calc_tax, 2);
            END IF;

            UPDATE public.sales_credit_note_lines SET
                subtotal = v_calc_subtotal,
                tax_amount = v_calc_tax,
                total_amount = v_calc_total
            WHERE id = v_draft_line.id;
        END IF;
    END LOOP;

    -- Update draft sales credit note headers
    UPDATE public.sales_credit_notes cn SET
        subtotal = COALESCE((SELECT SUM(subtotal) FROM public.sales_credit_note_lines WHERE credit_note_id = cn.id), 0),
        tax_amount = COALESCE((SELECT SUM(tax_amount) FROM public.sales_credit_note_lines WHERE credit_note_id = cn.id), 0),
        total_amount = COALESCE((SELECT SUM(total_amount) FROM public.sales_credit_note_lines WHERE credit_note_id = cn.id), 0)
    WHERE cn.status = 'draft';

    -- Recalculate existing draft purchase debit note lines
    FOR v_draft_line IN
        SELECT l.id, l.debit_note_id, l.original_bill_line_id, l.quantity, dn.debit_note_number
        FROM public.purchase_debit_note_lines l
        JOIN public.purchase_debit_notes dn ON l.debit_note_id = dn.id
        WHERE dn.status = 'draft'
    LOOP
        SELECT quantity, tax_amount, line_total
        INTO v_orig_qty, v_orig_tax, v_orig_total
        FROM public.purchase_bill_lines
        WHERE id = v_draft_line.original_bill_line_id;

        IF v_orig_qty IS NOT NULL AND v_orig_qty > 0 THEN
            v_orig_net := v_orig_total - v_orig_tax;

            SELECT 
                COALESCE(SUM(l2.quantity), 0),
                COALESCE(SUM(l2.subtotal), 0),
                COALESCE(SUM(l2.tax_amount), 0),
                COALESCE(SUM(l2.total_amount), 0)
            INTO v_prev_qty, v_prev_subtotal, v_prev_tax, v_prev_total
            FROM public.purchase_debit_note_lines l2
            JOIN public.purchase_debit_notes dn2 ON l2.debit_note_id = dn2.id
            WHERE l2.original_bill_line_id = v_draft_line.original_bill_line_id
              AND dn2.status = 'approved'
              AND dn2.id <> v_draft_line.debit_note_id;

            v_avail_qty := v_orig_qty - v_prev_qty;

            IF v_draft_line.quantity > v_avail_qty THEN
                RAISE EXCEPTION 'المسودة (%) تحتوي على كمية مرتجعة (%) تتجاوز الكمية المتاحة (%).',
                    v_draft_line.debit_note_number, v_draft_line.quantity, v_avail_qty;
            END IF;

            v_ratio := v_draft_line.quantity / v_orig_qty;
            IF v_draft_line.quantity = v_avail_qty AND v_prev_qty > 0 THEN
                v_calc_subtotal := GREATEST(0, v_orig_net - v_prev_subtotal);
                v_calc_tax := GREATEST(0, v_orig_tax - v_prev_tax);
                v_calc_total := GREATEST(0, v_orig_total - v_prev_total);
            ELSE
                v_calc_subtotal := GREATEST(0, round(v_orig_net * v_ratio, 2));
                v_calc_tax := GREATEST(0, round(v_orig_tax * v_ratio, 2));
                v_calc_total := round(v_calc_subtotal + v_calc_tax, 2);
            END IF;

            UPDATE public.purchase_debit_note_lines SET
                subtotal = v_calc_subtotal,
                tax_amount = v_calc_tax,
                total_amount = v_calc_total
            WHERE id = v_draft_line.id;
        END IF;
    END LOOP;

    -- Update draft purchase debit note headers
    UPDATE public.purchase_debit_notes dn SET
        subtotal = COALESCE((SELECT SUM(subtotal) FROM public.purchase_debit_note_lines WHERE debit_note_id = dn.id), 0),
        tax_amount = COALESCE((SELECT SUM(tax_amount) FROM public.purchase_debit_note_lines WHERE debit_note_id = dn.id), 0),
        total_amount = COALESCE((SELECT SUM(total_amount) FROM public.purchase_debit_note_lines WHERE debit_note_id = dn.id), 0)
    WHERE dn.status = 'draft';
END;
$$;

NOTIFY pgrst, 'reload schema';
