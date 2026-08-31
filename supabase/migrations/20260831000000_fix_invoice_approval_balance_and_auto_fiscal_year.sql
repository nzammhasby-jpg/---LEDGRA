-- Migration: Fix invoice & bill approval journal balancing and ensure auto fiscal year initialization
-- Created: 2026-08-31

BEGIN;

-- 1. Create Helper Function to ensure a Fiscal Year exists for any given date
CREATE OR REPLACE FUNCTION public.ensure_fiscal_year_for_date(
    p_org_id uuid,
    p_target_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_year_id uuid;
    v_period_id uuid;
    v_year_start date;
    v_year_end date;
    v_year_name text;
    v_org_start date;
    v_has_current boolean;
    v_curr_start date;
    v_curr_end date;
    v_period_count integer;
BEGIN
    -- Check if fiscal year already exists covering target date
    SELECT id INTO v_year_id
    FROM public.fiscal_years
    WHERE organization_id = p_org_id
      AND p_target_date >= start_date AND p_target_date <= end_date
    LIMIT 1;

    IF v_year_id IS NOT NULL THEN
        -- Also ensure periods exist and at least one is open
        SELECT id INTO v_period_id
        FROM public.fiscal_periods
        WHERE organization_id = p_org_id
          AND fiscal_year_id = v_year_id
          AND p_target_date >= start_date AND p_target_date <= end_date
        LIMIT 1;

        IF v_period_id IS NOT NULL THEN
            RETURN v_year_id;
        END IF;
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text || ':fiscal_year_init'));

    -- Re-check after lock
    SELECT id INTO v_year_id
    FROM public.fiscal_years
    WHERE organization_id = p_org_id
      AND p_target_date >= start_date AND p_target_date <= end_date
    LIMIT 1;

    IF v_year_id IS NOT NULL THEN
        RETURN v_year_id;
    END IF;

    -- Determine fiscal year start month from organization settings/fiscal_year_start or calendar year
    SELECT fiscal_year_start INTO v_org_start
    FROM public.organizations
    WHERE id = p_org_id;

    IF v_org_start IS NOT NULL THEN
        -- Align target year with org start month
        v_year_start := make_date(
            EXTRACT(YEAR FROM p_target_date)::int,
            EXTRACT(MONTH FROM v_org_start)::int,
            1
        );
        IF v_year_start > p_target_date THEN
            v_year_start := v_year_start - interval '1 year';
        END IF;
    ELSE
        -- Default to January 1st of target date year
        v_year_start := date_trunc('year', p_target_date)::date;
    END IF;

    v_year_end := (v_year_start + interval '12 months' - interval '1 day')::date;
    v_year_name := 'السنة المالية ' || to_char(v_year_start, 'YYYY');

    -- If name already exists for another range, append suffix
    IF EXISTS (SELECT 1 FROM public.fiscal_years WHERE organization_id = p_org_id AND name = v_year_name) THEN
        v_year_name := v_year_name || ' (' || to_char(v_year_start, 'YYYY-MM') || ')';
    END IF;

    -- Check if any current fiscal year exists
    SELECT EXISTS (SELECT 1 FROM public.fiscal_years WHERE organization_id = p_org_id AND is_current = true)
    INTO v_has_current;

    -- Insert Fiscal Year
    INSERT INTO public.fiscal_years (
        organization_id,
        name,
        start_date,
        end_date,
        status,
        is_current,
        created_by
    ) VALUES (
        p_org_id,
        v_year_name,
        v_year_start,
        v_year_end,
        'draft',
        NOT v_has_current,
        auth.uid()
    ) RETURNING id INTO v_year_id;

    -- Generate 12 Fiscal Periods
    FOR i IN 1..12 LOOP
        v_curr_start := (v_year_start + ((i - 1) || ' months')::interval)::date;
        v_curr_end := (v_year_start + (i || ' months')::interval - interval '1 day')::date;

        INSERT INTO public.fiscal_periods (
            fiscal_year_id,
            organization_id,
            period_num,
            name,
            start_date,
            end_date,
            status
        ) VALUES (
            v_year_id,
            p_org_id,
            i,
            'F' || TO_CHAR(i, 'FM00'),
            v_curr_start,
            v_curr_end,
            'open'
        ) ON CONFLICT DO NOTHING;
    END LOOP;

    RETURN v_year_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_fiscal_year_for_date(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_fiscal_year_for_date(uuid, date) TO authenticated;


-- 2. Update create_journal_entry to auto-provision fiscal year and period seamlessly
CREATE OR REPLACE FUNCTION public.create_journal_entry(
    p_org_id uuid,
    p_entry_date date,
    p_reference text,
    p_description text,
    p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_entry_id uuid;
    v_year_id uuid;
    v_period_id uuid;
    v_line jsonb;
    v_line_number integer := 1;
    v_account_id uuid;
    v_line_desc text;
    v_debit numeric(15,2);
    v_credit numeric(15,2);
    v_allow_posting boolean;
    v_is_active boolean;
    v_has_children boolean;
    v_total_debit numeric(15,2) := 0;
    v_total_credit numeric(15,2) := 0;
BEGIN
    -- Authorization check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليس لديك الصلاحية الكافية لإنشاء قيود اليومية.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Resolve fiscal year first
    SELECT id INTO v_year_id 
    FROM public.fiscal_years
    WHERE organization_id = p_org_id
      AND p_entry_date >= start_date AND p_entry_date <= end_date
    LIMIT 1;

    -- Auto-provision fiscal year if not found
    IF v_year_id IS NULL THEN
        v_year_id := public.ensure_fiscal_year_for_date(p_org_id, p_entry_date);
    END IF;

    -- Resolve fiscal period and ensure it is open
    SELECT id INTO v_period_id 
    FROM public.fiscal_periods
    WHERE organization_id = p_org_id
      AND fiscal_year_id = v_year_id
      AND p_entry_date >= start_date AND p_entry_date <= end_date
      AND status = 'open'
    LIMIT 1;

    -- If period doesn't exist or is not open, check if we need to auto-create or open it
    IF v_period_id IS NULL THEN
        SELECT id INTO v_period_id 
        FROM public.fiscal_periods
        WHERE organization_id = p_org_id
          AND fiscal_year_id = v_year_id
          AND p_entry_date >= start_date AND p_entry_date <= end_date
        LIMIT 1;

        IF v_period_id IS NOT NULL THEN
            UPDATE public.fiscal_periods SET status = 'open' WHERE id = v_period_id;
        ELSE
            RAISE EXCEPTION 'فشل العثور على فترة مالية تغطي التاريخ المحدد %. تأكد من فتح الفترة المالية.', p_entry_date;
        END IF;
    END IF;

    -- Basic check on lines count and json format
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
        RAISE EXCEPTION 'بنود القيد يجب أن تكون قائمة صحيحة (Array).';
    END IF;

    IF jsonb_array_length(p_lines) < 2 THEN
        RAISE EXCEPTION 'يجب أن يحتوي القيد على بندين على الأقل.';
    END IF;

    -- Create journal entry header
    INSERT INTO public.journal_entries (
        organization_id,
        fiscal_year_id,
        fiscal_period_id,
        entry_number,
        entry_date,
        reference,
        description,
        source_type,
        status,
        created_by
    ) VALUES (
        p_org_id,
        v_year_id,
        v_period_id,
        '',
        p_entry_date,
        p_reference,
        p_description,
        'manual',
        'draft',
        auth.uid()
    ) RETURNING id INTO v_entry_id;

    -- Process lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_account_id := (v_line->>'account_id')::uuid;
        v_line_desc := v_line->>'description';
        
        -- Safely extract debit with numeric check
        BEGIN
            v_debit := CASE 
                WHEN v_line->>'debit' IS NULL OR trim(v_line->>'debit') = '' THEN 0.00
                ELSE (v_line->>'debit')::numeric
            END;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'قيمة المدين غير صالحة في السطر %: %', v_line_number, v_line->>'debit';
        END;

        -- Safely extract credit with numeric check
        BEGIN
            v_credit := CASE 
                WHEN v_line->>'credit' IS NULL OR trim(v_line->>'credit') = '' THEN 0.00
                ELSE (v_line->>'credit')::numeric
            END;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'قيمة الدائن غير صالحة في السطر %: %', v_line_number, v_line->>'credit';
        END;

        IF v_account_id IS NULL THEN
            RAISE EXCEPTION 'الحساب المحاسبي (account_id) مطلوب في السطر %.', v_line_number;
        END IF;

        IF v_debit < 0 OR v_credit < 0 THEN
            RAISE EXCEPTION 'قيم المدين والدائن لا يمكن أن تكون سالبة في السطر %.', v_line_number;
        END IF;

        IF (v_debit = 0 AND v_credit = 0) OR (v_debit > 0 AND v_credit > 0) THEN
            RAISE EXCEPTION 'يجب إدخال إما قيمة مدين أو قيمة دائن فقط في السطر %.', v_line_number;
        END IF;

        -- Account checks
        SELECT allow_posting, is_active INTO v_allow_posting, v_is_active
        FROM public.accounts
        WHERE id = v_account_id AND organization_id = p_org_id;

        IF v_allow_posting IS NULL THEN
            RAISE EXCEPTION 'الحساب المحدد في السطر % غير موجود في هذه المنشأة.', v_line_number;
        END IF;

        IF NOT v_is_active THEN
            RAISE EXCEPTION 'الحساب المحدد في السطر % غير نشط ولا يمكن الترحيل عليه.', v_line_number;
        END IF;

        IF NOT v_allow_posting THEN
            RAISE EXCEPTION 'الحساب المحدد في السطر % هو حساب رئيسي تجميعي ولا يسمح بالترحيل المباشر عليه.', v_line_number;
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM public.accounts 
            WHERE parent_id = v_account_id AND organization_id = p_org_id
        ) INTO v_has_children;

        IF v_has_children THEN
            RAISE EXCEPTION 'الحساب المحدد في السطر % لديه حسابات فرعية، لذلك لا يمكن الترحيل عليه مباشرة.', v_line_number;
        END IF;

        -- Accumulate totals
        v_total_debit := v_total_debit + v_debit;
        v_total_credit := v_total_credit + v_credit;

        -- Insert line
        INSERT INTO public.journal_entry_lines (
            journal_entry_id,
            organization_id,
            account_id,
            line_number,
            description,
            debit,
            credit
        ) VALUES (
            v_entry_id,
            p_org_id,
            v_account_id,
            v_line_number,
            v_line_desc,
            v_debit,
            v_credit
        );

        v_line_number := v_line_number + 1;
    END LOOP;

    -- Verify balance (rounded to 2 decimals)
    IF round(v_total_debit, 2) <> round(v_total_credit, 2) THEN
        RAISE EXCEPTION 'القيد غير متوازن! مجموع المدين (%) لا يساوي مجموع الدائن (%).', v_total_debit, v_total_credit;
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
        'create_journal_entry',
        jsonb_build_object(
            'journal_entry_id', v_entry_id,
            'entry_date', p_entry_date,
            'reference', p_reference,
            'total_debit', v_total_debit,
            'total_credit', v_total_credit,
            'lines_count', v_line_number - 1
        )
    );

    RETURN v_entry_id;
END;
$$;


-- 3. Update approve_sales_invoice with mathematically balanced revenue lines calculation
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

    -- Process Inventory Balances & Movements
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
    -- Uses (line_total - tax_amount) to ensure exact cent-level balance with v_total and v_tax_total
    FOR v_line_item IN 
        SELECT revenue_account_id, SUM(line_total - tax_amount) as net_amount
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
            'description', v_desc || ' (ضريبة مخرجات)',
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


-- 4. Update approve_purchase_bill with mathematically balanced expense/inventory lines calculation
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
    v_due_date date;
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

    -- Inventory Integration
    v_is_stockable boolean;
    v_qty_on_hand numeric(15,4);
    v_old_avg_cost numeric(15,4);
    v_new_qty numeric(15,4);
    v_new_avg_cost numeric(15,4);
    v_inv_value numeric(15,4);
    v_item_name text;
    v_net_unit_cost numeric(15,4);
    v_net_line_cost numeric(15,2);
    v_default_inventory_account_id uuid;
BEGIN
    -- Auth & Privilege check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: الاعتماد متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Get general fallback inventory account
    SELECT default_inventory_account_id
    INTO v_default_inventory_account_id
    FROM public.accounting_settings
    WHERE organization_id = p_org_id;

    -- Get Bill details
    SELECT b.bill_number, b.vendor_id, b.bill_date, b.due_date, b.total, b.tax_total, b.status, v.name, v.payable_account_id
    INTO v_bill_number, v_vendor_id, v_bill_date, v_due_date, v_total, v_tax_total, v_status, v_vendor_name, v_payable_account_id
    FROM public.purchase_bills b
    JOIN public.vendors v ON b.vendor_id = v.id
    WHERE b.id = p_bill_id AND b.organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'فاتورة المشتريات غير موجودة أو لا تنتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'فاتورة المشتريات معتمدة بالفعل أو ملغاة ولا يمكن اعتمادها مجدداً.';
    END IF;
    
    -- Verify vendor and payable account
    IF v_payable_account_id IS NULL THEN
        RAISE EXCEPTION 'المورد المحدد يفتقد لحساب الذمم الدائنة المربوط.';
    END IF;
    PERFORM public.validate_master_data_account(v_payable_account_id, p_org_id, 'liabilities', 'حساب ذمم الموردين');

    -- Process Inventory Balances for incoming stock
    FOR v_inv_line IN
        SELECT l.id as line_id, l.item_id, l.quantity, (l.line_total - l.tax_amount) as net_subtotal,
               i.is_stockable, i.name, i.inventory_account_id
        FROM public.purchase_bill_lines l
        JOIN public.items i ON l.item_id = i.id
        WHERE l.purchase_bill_id = p_bill_id
    LOOP
        IF v_inv_line.is_stockable = true THEN
            -- Check stock balances with FOR UPDATE
            SELECT quantity_on_hand, average_cost
            INTO v_qty_on_hand, v_old_avg_cost
            FROM public.inventory_balances
            WHERE organization_id = p_org_id AND item_id = v_inv_line.item_id
            FOR UPDATE;

            IF NOT FOUND THEN
                v_qty_on_hand := 0.0000;
                v_old_avg_cost := 0.0000;
                
                -- Ensure balance record exists
                INSERT INTO public.inventory_balances (
                    organization_id, item_id, quantity_on_hand, average_cost, inventory_value, last_movement_at
                ) VALUES (
                    p_org_id, v_inv_line.item_id, 0.0000, 0.0000, 0.0000, now()
                ) ON CONFLICT DO NOTHING;
            END IF;

            -- Calculate Moving Average Cost based on Net Cost Before Tax
            v_net_line_cost := v_inv_line.net_subtotal;
            v_net_unit_cost := CASE 
                WHEN v_inv_line.quantity > 0 THEN v_net_line_cost / v_inv_line.quantity 
                ELSE 0 
            END;

            v_new_qty := v_qty_on_hand + v_inv_line.quantity;
            
            IF v_new_qty > 0 THEN
                v_new_avg_cost := round(((v_qty_on_hand * v_old_avg_cost) + v_net_line_cost) / v_new_qty, 4);
            ELSE
                v_new_avg_cost := v_old_avg_cost;
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
    -- Uses (line_total - tax_amount) to guarantee exact balance
    FOR v_line_item IN 
        SELECT COALESCE(expense_account_id, inventory_account_id) as line_account_id, 
               SUM(line_total - tax_amount) as net_amount,
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
            'description', v_desc || ' (ضريبة مدخلات)',
            'debit', v_tax_total,
            'credit', 0.00
        );
    END IF;

    -- 3. Credit Accounts Payable (v_total)
    v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_payable_account_id,
        'description', v_desc,
        'debit', 0.00,
        'credit', v_total
    );

    -- Create and Post the Automatic Purchase Bill Journal Entry
    v_journal_entry_id := public.create_journal_entry(
        p_org_id,
        v_bill_date,
        v_bill_number,
        v_desc,
        v_journal_lines
    );

    -- Mark Journal Entry as System Type & Post it
    UPDATE public.journal_entries 
    SET source_type = 'system' 
    WHERE id = v_journal_entry_id AND organization_id = p_org_id;

    PERFORM public.post_journal_entry(p_org_id, v_journal_entry_id);

    -- Update Bill Header with journal ID
    UPDATE public.purchase_bills SET
        status = 'approved',
        journal_entry_id = v_journal_entry_id,
        approved_at = now(),
        approved_by = auth.uid(),
        updated_at = now()
    WHERE id = p_bill_id AND organization_id = p_org_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        p_org_id, auth.uid(), 'approve_purchase_bill',
        jsonb_build_object(
            'purchase_bill_id', p_bill_id,
            'journal_entry_id', v_journal_entry_id,
            'status_from', 'draft',
            'status_to', 'approved'
        )
    );

    RETURN v_journal_entry_id;
END;
$$;


-- 5. Update create_organization_with_owner to automatically initialize chart of accounts and default fiscal year
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
    p_name_ar text,
    p_name_en text,
    p_activity_type text,
    p_country_code text,
    p_city text,
    p_phone text,
    p_email text,
    p_legal_type text,
    p_cr_number text,
    p_vat_number text,
    p_is_vat_registered boolean,
    p_fiscal_year_start date,
    p_system_start_date date,
    p_accounting_mode text,
    p_starting_balances_later boolean,
    p_onboarding_completed boolean,
    p_onboarding_step integer,
    p_currency_code text DEFAULT NULL,
    p_default_tax_rate numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_org_id uuid;
    v_country_code text;
    v_currency_code text;
    v_default_tax_rate numeric;
    v_cp record;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول لإنشاء منشأة جديدة.';
    END IF;

    v_country_code := UPPER(TRIM(COALESCE(p_country_code, 'SA')));

    SELECT * INTO v_cp FROM public.country_profiles WHERE country_code = v_country_code;

    IF FOUND THEN
        v_currency_code := COALESCE(NULLIF(TRIM(p_currency_code), ''), v_cp.default_currency_code, 'SAR');
        v_default_tax_rate := COALESCE(p_default_tax_rate, v_cp.default_tax_rate, 15.00);
    ELSE
        v_currency_code := COALESCE(NULLIF(TRIM(p_currency_code), ''), 'SAR');
        v_default_tax_rate := COALESCE(p_default_tax_rate, 15.00);
    END IF;

    INSERT INTO public.organizations (
        name_ar,
        name_en,
        activity_type,
        country_code,
        city,
        phone,
        email,
        legal_type,
        cr_number,
        vat_number,
        is_vat_registered,
        fiscal_year_start,
        currency_code,
        default_language,
        onboarding_completed,
        onboarding_completed_at,
        onboarding_step,
        created_by,
        system_start_date,
        accounting_mode,
        starting_balances_later,
        default_tax_rate
    ) VALUES (
        p_name_ar,
        COALESCE(p_name_en, ''),
        p_activity_type,
        v_country_code,
        p_city,
        p_phone,
        p_email,
        p_legal_type,
        NULLIF(p_cr_number, ''),
        NULLIF(p_vat_number, ''),
        p_is_vat_registered,
        p_fiscal_year_start,
        v_currency_code,
        'ar',
        p_onboarding_completed,
        CASE WHEN p_onboarding_completed = true THEN now() ELSE NULL END,
        COALESCE(p_onboarding_step, 3),
        v_user_id,
        p_system_start_date,
        p_accounting_mode,
        p_starting_balances_later,
        v_default_tax_rate
    )
    RETURNING id INTO v_org_id;

    -- Link User as 'owner'
    INSERT INTO public.organization_members (
        organization_id,
        profile_id,
        role,
        is_active
    ) VALUES (
        v_org_id,
        v_user_id,
        'owner',
        true
    );

    -- Create settings row
    INSERT INTO public.organization_settings (
        organization_id
    ) VALUES (
        v_org_id
    );

    -- Create default main branch
    INSERT INTO public.branches (
        organization_id,
        name_ar,
        name_en,
        code,
        is_main
    ) VALUES (
        v_org_id,
        'الفرع الرئيسي',
        'Main Branch',
        '001',
        true
    );

    -- Auto-seed Chart of Accounts & Auto-initialize default fiscal year out of the box
    PERFORM public.ensure_default_chart_of_accounts(v_org_id);
    PERFORM public.ensure_fiscal_year_for_date(v_org_id, COALESCE(p_system_start_date, p_fiscal_year_start, CURRENT_DATE));

    -- Write initial log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        v_user_id,
        'create_organization',
        jsonb_build_object(
            'name_ar', p_name_ar,
            'country_code', v_country_code,
            'currency_code', v_currency_code,
            'default_tax_rate', v_default_tax_rate
        )
    );

    RETURN v_org_id;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
