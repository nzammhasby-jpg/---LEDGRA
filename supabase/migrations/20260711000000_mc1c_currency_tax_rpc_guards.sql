-- Migration: MC-1C Country-Aware Tax, Currency & Compliance Guards
-- Created: 2026-07-11

-- 1. A. create_sales_invoice
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
    v_org_currency text;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;
    
    IF NOT public.can_manage_sales_drafts(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لإدارة فواتير المبيعات المسودات في هذه المنشأة.';
    END IF;

    -- Fetch organization currency
    SELECT currency_code INTO v_org_currency
    FROM public.organizations
    WHERE id = p_org_id;

    IF v_org_currency IS NULL OR v_org_currency = '' THEN
        RAISE EXCEPTION 'خطأ: لم يتم تحديد العملة الأساسية لهذه المنشأة.';
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
        0, 0, v_org_currency, trim(p_notes), auth.uid()
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


-- 2. B. create_purchase_bill
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
    v_org_currency text;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;
    
    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إدارة فواتير المشتريات متاحة للمالك والمدير والمحاسب فقط.';
    END IF;

    -- Fetch organization currency
    SELECT currency_code INTO v_org_currency
    FROM public.organizations
    WHERE id = p_org_id;

    IF v_org_currency IS NULL OR v_org_currency = '' THEN
        RAISE EXCEPTION 'خطأ: لم يتم تحديد العملة الأساسية لهذه المنشأة.';
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
        0, 0, v_org_currency, trim(p_notes), auth.uid()
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


-- 3. Grants and Schema Reload Notification
REVOKE ALL ON FUNCTION public.create_sales_invoice(uuid, uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_invoice(uuid, uuid, date, date, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.create_purchase_bill(uuid, uuid, text, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_bill(uuid, uuid, text, date, date, text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
