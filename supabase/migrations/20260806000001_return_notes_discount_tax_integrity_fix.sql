-- Migration: 20260806000001_return_notes_discount_tax_integrity_fix.sql
-- Description: Ensures approve_purchase_debit_note uses net subtotal (cost after discount) for inventory value reversal instead of unit_price.

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

    -- 2. Process inventory returns (Deducting from inventory using subtotal)
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
            RAISE EXCEPTION 'يوجد ضريبة على المرتجع ولكن لم يتم تهيئة حساب ضريبة المدخلات في الإعدادات المحاسبية.';
        END IF;
        PERFORM public.validate_master_data_account(v_default_tax_input_account_id, v_org_id, 'assets', 'حساب ضريبة المدخلات');

        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_id', v_default_tax_input_account_id,
            'description', v_desc || ' (عكس ضريبة المدخلات)',
            'debit', 0.00,
            'credit', v_tax_amount
        );
    END IF;

    -- 7. Create and Post debit note journal entry
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
