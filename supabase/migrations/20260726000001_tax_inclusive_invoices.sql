-- Migration: Tax-Inclusive Invoices Support (Sales Invoices & Purchase Bills)
-- Created: 2026-07-26

BEGIN;

-- 1. Database Schema Alterations
ALTER TABLE public.sales_invoices
ADD COLUMN IF NOT EXISTS prices_include_tax boolean NOT NULL DEFAULT false;

ALTER TABLE public.purchase_bills
ADD COLUMN IF NOT EXISTS prices_include_tax boolean NOT NULL DEFAULT false;

ALTER TABLE public.sales_invoice_lines
ADD COLUMN IF NOT EXISTS entered_unit_price numeric(15,4);

ALTER TABLE public.purchase_bill_lines
ADD COLUMN IF NOT EXISTS entered_unit_cost numeric(15,4);


-- 2. Drop Old Function Signatures to avoid ambiguity
DROP FUNCTION IF EXISTS public.create_sales_invoice(uuid, uuid, date, date, text, jsonb);
DROP FUNCTION IF EXISTS public.update_sales_invoice(uuid, uuid, uuid, date, date, text, jsonb);
DROP FUNCTION IF EXISTS public.create_purchase_bill(uuid, uuid, text, date, date, text, jsonb);
DROP FUNCTION IF EXISTS public.update_purchase_bill(uuid, uuid, uuid, text, date, date, text, jsonb);


-- 3. A. create_sales_invoice
CREATE OR REPLACE FUNCTION public.create_sales_invoice(
    p_org_id uuid,
    p_customer_id uuid,
    p_invoice_date date,
    p_due_date date,
    p_notes text,
    p_lines jsonb,
    p_prices_include_tax boolean DEFAULT false
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
    v_entered_unit_price numeric(15,4);
    v_unit_price_before_tax numeric(15,4);
    v_discount_amount numeric(15,2);
    v_discount_before_tax numeric(15,2);
    v_gross_inclusive numeric(15,2);
    v_gross_before_tax numeric(15,2);
    v_net_inclusive numeric(15,2);
    v_net_before_tax numeric(15,2);
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
    v_prices_include_tax boolean;
BEGIN
    v_prices_include_tax := COALESCE(p_prices_include_tax, false);

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

    -- Advisory lock for sequential numbering
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':sales_invoice:' || to_char(p_invoice_date, 'YYYY'))
    );

    -- Insert Header
    INSERT INTO public.sales_invoices (
        organization_id, customer_id, invoice_number, invoice_date, due_date, 
        status, payment_status, subtotal, discount_total, tax_total, total, 
        paid_amount, balance_due, currency, notes, created_by, prices_include_tax
    ) VALUES (
        p_org_id, p_customer_id, '', p_invoice_date, p_due_date, 
        'draft', 'unpaid', 0, 0, 0, 0, 
        0, 0, v_org_currency, trim(p_notes), auth.uid(), v_prices_include_tax
    ) RETURNING id INTO v_invoice_id;

    -- Loop through lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
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
        v_entered_unit_price := (v_line->>'unit_price')::numeric;

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

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'الكمية في السطر % يجب أن تكون أكبر من الصفر.', v_line_number;
        END IF;

        IF v_entered_unit_price < 0 THEN
            RAISE EXCEPTION 'سعر الوحدة في السطر % لا يمكن أن يكون سالباً.', v_line_number;
        END IF;

        IF v_discount_amount < 0 THEN
            RAISE EXCEPTION 'الخصم في السطر % لا يمكن أن يكون سالباً.', v_line_number;
        END IF;

        IF v_discount_amount > (v_quantity * v_entered_unit_price) THEN
            RAISE EXCEPTION 'الخصم في السطر % لا يمكن أن يتجاوز إجمالي السطر قبل الخصم.', v_line_number;
        END IF;

        -- Extract revenue account
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

        IF v_line->>'revenue_account_id' IS NOT NULL AND trim(v_line->>'revenue_account_id') <> '' THEN
            v_revenue_account_id := (v_line->>'revenue_account_id')::uuid;
        END IF;

        PERFORM public.validate_master_data_account(v_revenue_account_id, p_org_id, 'revenue', 'حساب إيراد الصنف السطر ' || v_line_number);

        -- Tax calculations (Inclusive vs Exclusive)
        IF v_prices_include_tax THEN
            v_gross_inclusive := round(v_quantity * v_entered_unit_price, 2);
            v_net_inclusive := round(v_gross_inclusive - v_discount_amount, 2);

            IF v_tax_rate > 0 THEN
                v_unit_price_before_tax := round(v_entered_unit_price / (1.00 + (v_tax_rate / 100.00)), 4);
                v_gross_before_tax := round(v_gross_inclusive / (1.00 + (v_tax_rate / 100.00)), 2);
                v_net_before_tax := round(v_net_inclusive / (1.00 + (v_tax_rate / 100.00)), 2);
                v_tax_amount := round(v_net_inclusive - v_net_before_tax, 2);
                v_line_total := v_net_inclusive;
                v_discount_before_tax := round(v_gross_before_tax - v_net_before_tax, 2);
            ELSE
                v_unit_price_before_tax := v_entered_unit_price;
                v_gross_before_tax := v_gross_inclusive;
                v_net_before_tax := v_net_inclusive;
                v_tax_amount := 0.00;
                v_line_total := v_net_inclusive;
                v_discount_before_tax := v_discount_amount;
            END IF;

            v_unit_price := round(v_unit_price_before_tax, 2);
        ELSE
            v_gross_before_tax := round(v_quantity * v_entered_unit_price, 2);
            v_net_before_tax := round(v_gross_before_tax - v_discount_amount, 2);
            v_discount_before_tax := v_discount_amount;
            v_tax_amount := round(v_net_before_tax * (v_tax_rate / 100.00), 2);
            v_line_total := v_net_before_tax + v_tax_amount;
            v_unit_price := round(v_entered_unit_price, 2);
        END IF;

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

        v_subtotal := v_subtotal + v_gross_before_tax;
        v_discount_total := v_discount_total + v_discount_before_tax;
        v_tax_total := v_tax_total + v_tax_amount;
        v_total := v_total + v_line_total;

        INSERT INTO public.sales_invoice_lines (
            sales_invoice_id, organization_id, item_id, line_number, description,
            quantity, unit_price, discount_amount, tax_rate, tax_amount, line_total,
            revenue_account_id, tax_account_id, entered_unit_price
        ) VALUES (
            v_invoice_id, p_org_id, v_item_id, v_line_number, v_description,
            v_quantity, v_unit_price, v_discount_before_tax, v_tax_rate, v_tax_amount, v_line_total,
            v_revenue_account_id, v_tax_account_id, v_entered_unit_price
        );

        v_line_number := v_line_number + 1;
    END LOOP;

    UPDATE public.sales_invoices SET
        subtotal = v_subtotal,
        discount_total = v_discount_total,
        tax_total = v_tax_total,
        total = v_total,
        balance_due = v_total
    WHERE id = v_invoice_id;

    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        p_org_id, auth.uid(), 'create_sales_invoice',
        jsonb_build_object(
            'sales_invoice_id', v_invoice_id,
            'customer_id', p_customer_id,
            'invoice_date', p_invoice_date,
            'prices_include_tax', v_prices_include_tax,
            'total', v_total
        )
    );

    RETURN v_invoice_id;
END;
$$;


-- 3. B. update_sales_invoice
CREATE OR REPLACE FUNCTION public.update_sales_invoice(
    p_org_id uuid,
    p_invoice_id uuid,
    p_customer_id uuid,
    p_invoice_date date,
    p_due_date date,
    p_notes text,
    p_lines jsonb,
    p_prices_include_tax boolean DEFAULT false
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
    v_unit_price numeric(15,2);
    v_entered_unit_price numeric(15,4);
    v_unit_price_before_tax numeric(15,4);
    v_discount_amount numeric(15,2);
    v_discount_before_tax numeric(15,2);
    v_gross_inclusive numeric(15,2);
    v_gross_before_tax numeric(15,2);
    v_net_inclusive numeric(15,2);
    v_net_before_tax numeric(15,2);
    v_tax_rate numeric(5,2);
    v_tax_amount numeric(15,2);
    v_line_total numeric(15,2);
    v_revenue_account_id uuid;
    v_tax_account_id uuid;
    
    v_subtotal numeric(15,2) := 0.00;
    v_discount_total numeric(15,2) := 0.00;
    v_tax_total numeric(15,2) := 0.00;
    v_total numeric(15,2) := 0.00;
    v_paid_amount numeric(15,2) := 0.00;
    v_default_tax_output_account_id uuid;
    v_prices_include_tax boolean;
BEGIN
    v_prices_include_tax := COALESCE(p_prices_include_tax, false);

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;
    
    IF NOT public.can_manage_sales_drafts(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لإدارة فواتير المبيعات المسودات في هذه المنشأة.';
    END IF;

    SELECT status, paid_amount INTO v_status, v_paid_amount 
    FROM public.sales_invoices 
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'الفاتورة المطلوبة غير موجودة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن تعديل فاتورة تم اعتمادها أو إلغاؤها.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'العميل المحدد غير موجود أو غير نشط في هذه المنشأة.';
    END IF;

    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'الفاتورة يجب أن تحتوي على بند واحد على الأقل.';
    END IF;

    SELECT default_tax_output_account_id
    INTO v_default_tax_output_account_id
    FROM public.accounting_settings
    WHERE organization_id = p_org_id;

    DELETE FROM public.sales_invoice_lines WHERE sales_invoice_id = p_invoice_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
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
        v_entered_unit_price := (v_line->>'unit_price')::numeric;

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

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'الكمية في السطر % يجب أن تكون أكبر من الصفر.', v_line_number;
        END IF;

        IF v_entered_unit_price < 0 THEN
            RAISE EXCEPTION 'سعر الوحدة في السطر % لا يمكن أن يكون سالباً.', v_line_number;
        END IF;

        IF v_discount_amount < 0 THEN
            RAISE EXCEPTION 'الخصم في السطر % لا يمكن أن يكون سالباً.', v_line_number;
        END IF;

        IF v_discount_amount > (v_quantity * v_entered_unit_price) THEN
            RAISE EXCEPTION 'الخصم في السطر % لا يمكن أن يتجاوز إجمالي السطر قبل الخصم.', v_line_number;
        END IF;

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

        IF v_line->>'revenue_account_id' IS NOT NULL AND trim(v_line->>'revenue_account_id') <> '' THEN
            v_revenue_account_id := (v_line->>'revenue_account_id')::uuid;
        END IF;

        PERFORM public.validate_master_data_account(v_revenue_account_id, p_org_id, 'revenue', 'حساب إيراد الصنف السطر ' || v_line_number);

        IF v_prices_include_tax THEN
            v_gross_inclusive := round(v_quantity * v_entered_unit_price, 2);
            v_net_inclusive := round(v_gross_inclusive - v_discount_amount, 2);

            IF v_tax_rate > 0 THEN
                v_unit_price_before_tax := round(v_entered_unit_price / (1.00 + (v_tax_rate / 100.00)), 4);
                v_gross_before_tax := round(v_gross_inclusive / (1.00 + (v_tax_rate / 100.00)), 2);
                v_net_before_tax := round(v_net_inclusive / (1.00 + (v_tax_rate / 100.00)), 2);
                v_tax_amount := round(v_net_inclusive - v_net_before_tax, 2);
                v_line_total := v_net_inclusive;
                v_discount_before_tax := round(v_gross_before_tax - v_net_before_tax, 2);
            ELSE
                v_unit_price_before_tax := v_entered_unit_price;
                v_gross_before_tax := v_gross_inclusive;
                v_net_before_tax := v_net_inclusive;
                v_tax_amount := 0.00;
                v_line_total := v_net_inclusive;
                v_discount_before_tax := v_discount_amount;
            END IF;

            v_unit_price := round(v_unit_price_before_tax, 2);
        ELSE
            v_gross_before_tax := round(v_quantity * v_entered_unit_price, 2);
            v_net_before_tax := round(v_gross_before_tax - v_discount_amount, 2);
            v_discount_before_tax := v_discount_amount;
            v_tax_amount := round(v_net_before_tax * (v_tax_rate / 100.00), 2);
            v_line_total := v_net_before_tax + v_tax_amount;
            v_unit_price := round(v_entered_unit_price, 2);
        END IF;

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

        v_subtotal := v_subtotal + v_gross_before_tax;
        v_discount_total := v_discount_total + v_discount_before_tax;
        v_tax_total := v_tax_total + v_tax_amount;
        v_total := v_total + v_line_total;

        INSERT INTO public.sales_invoice_lines (
            sales_invoice_id, organization_id, item_id, line_number, description,
            quantity, unit_price, discount_amount, tax_rate, tax_amount, line_total,
            revenue_account_id, tax_account_id, entered_unit_price
        ) VALUES (
            p_invoice_id, p_org_id, v_item_id, v_line_number, v_description,
            v_quantity, v_unit_price, v_discount_before_tax, v_tax_rate, v_tax_amount, v_line_total,
            v_revenue_account_id, v_tax_account_id, v_entered_unit_price
        );

        v_line_number := v_line_number + 1;
    END LOOP;

    UPDATE public.sales_invoices SET
        customer_id = p_customer_id,
        invoice_date = p_invoice_date,
        due_date = p_due_date,
        notes = trim(p_notes),
        subtotal = v_subtotal,
        discount_total = v_discount_total,
        tax_total = v_tax_total,
        total = v_total,
        balance_due = v_total - v_paid_amount,
        prices_include_tax = v_prices_include_tax,
        updated_at = now()
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        p_org_id, auth.uid(), 'update_sales_invoice',
        jsonb_build_object(
            'sales_invoice_id', p_invoice_id,
            'customer_id', p_customer_id,
            'prices_include_tax', v_prices_include_tax,
            'total', v_total
        )
    );
END;
$$;


-- 3. C. create_purchase_bill
CREATE OR REPLACE FUNCTION public.create_purchase_bill(
    p_org_id uuid,
    p_vendor_id uuid,
    p_vendor_invoice_number text,
    p_bill_date date,
    p_due_date date,
    p_notes text,
    p_lines jsonb,
    p_prices_include_tax boolean DEFAULT false
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
    v_entered_unit_cost numeric(15,4);
    v_unit_cost_before_tax numeric(15,4);
    v_discount_amount numeric(15,2);
    v_discount_before_tax numeric(15,2);
    v_gross_inclusive numeric(15,2);
    v_gross_before_tax numeric(15,2);
    v_net_inclusive numeric(15,2);
    v_net_before_tax numeric(15,2);
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
    v_prices_include_tax boolean;
BEGIN
    v_prices_include_tax := COALESCE(p_prices_include_tax, false);

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;
    
    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إدارة فواتير المشتريات متاحة للمالك والمدير والمحاسب فقط.';
    END IF;

    SELECT currency_code INTO v_org_currency
    FROM public.organizations
    WHERE id = p_org_id;

    IF v_org_currency IS NULL OR v_org_currency = '' THEN
        RAISE EXCEPTION 'خطأ: لم يتم تحديد العملة الأساسية لهذه المنشأة.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_vendor_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'المورد المحدد غير موجود أو غير نشط في هذه المنشأة.';
    END IF;

    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'الفاتورة يجب أن تحتوي على بند واحد على الأقل.';
    END IF;

    SELECT default_tax_input_account_id
    INTO v_default_tax_input_account_id
    FROM public.accounting_settings
    WHERE organization_id = p_org_id;

    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':purchase_bill:' || to_char(p_bill_date, 'YYYY'))
    );

    INSERT INTO public.purchase_bills (
        organization_id, vendor_id, bill_number, vendor_invoice_number, bill_date, due_date, 
        status, payment_status, subtotal, discount_total, tax_total, total, 
        paid_amount, balance_due, currency, notes, created_by, prices_include_tax
    ) VALUES (
        p_org_id, p_vendor_id, '', trim(p_vendor_invoice_number), p_bill_date, p_due_date, 
        'draft', 'unpaid', 0, 0, 0, 0, 
        0, 0, v_org_currency, trim(p_notes), auth.uid(), v_prices_include_tax
    ) RETURNING id INTO v_bill_id;

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
        v_entered_unit_cost := (v_line->>'unit_cost')::numeric;

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

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'الكمية في السطر % يجب أن تكون أكبر من الصفر.', v_line_number;
        END IF;

        IF v_entered_unit_cost < 0 THEN
            RAISE EXCEPTION 'تكلفة الوحدة في السطر % لا يمكن أن تكون سالبة.', v_line_number;
        END IF;

        IF v_discount_amount < 0 THEN
            RAISE EXCEPTION 'الخصم في السطر % لا يمكن أن يكون سالباً.', v_line_number;
        END IF;

        IF v_discount_amount > (v_quantity * v_entered_unit_cost) THEN
            RAISE EXCEPTION 'الخصم في السطر % لا يمكن أن يتجاوز إجمالي السطر قبل الخصم.', v_line_number;
        END IF;

        v_expense_account_id := null;
        IF v_line->>'expense_account_id' IS NOT NULL AND trim(v_line->>'expense_account_id') <> '' THEN
            v_expense_account_id := (v_line->>'expense_account_id')::uuid;
        END IF;

        v_inventory_account_id := null;
        IF v_line->>'inventory_account_id' IS NOT NULL AND trim(v_line->>'inventory_account_id') <> '' THEN
            v_inventory_account_id := (v_line->>'inventory_account_id')::uuid;
        END IF;

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

        IF v_expense_account_id IS NOT NULL THEN
            PERFORM public.validate_master_data_account(v_expense_account_id, p_org_id, 'expenses', 'حساب المصروف السطر ' || v_line_number);
        ELSIF v_inventory_account_id IS NOT NULL THEN
            PERFORM public.validate_master_data_account(v_inventory_account_id, p_org_id, 'assets', 'حساب المخزون السطر ' || v_line_number);
        ELSE
            RAISE EXCEPTION 'يجب تحديد حساب مصروف أو حساب مخزون للسطر %.', v_line_number;
        END IF;

        IF v_prices_include_tax THEN
            v_gross_inclusive := round(v_quantity * v_entered_unit_cost, 2);
            v_net_inclusive := round(v_gross_inclusive - v_discount_amount, 2);

            IF v_tax_rate > 0 THEN
                v_unit_cost_before_tax := round(v_entered_unit_cost / (1.00 + (v_tax_rate / 100.00)), 4);
                v_gross_before_tax := round(v_gross_inclusive / (1.00 + (v_tax_rate / 100.00)), 2);
                v_net_before_tax := round(v_net_inclusive / (1.00 + (v_tax_rate / 100.00)), 2);
                v_tax_amount := round(v_net_inclusive - v_net_before_tax, 2);
                v_line_total := v_net_inclusive;
                v_discount_before_tax := round(v_gross_before_tax - v_net_before_tax, 2);
            ELSE
                v_unit_cost_before_tax := v_entered_unit_cost;
                v_gross_before_tax := v_gross_inclusive;
                v_net_before_tax := v_net_inclusive;
                v_tax_amount := 0.00;
                v_line_total := v_net_inclusive;
                v_discount_before_tax := v_discount_amount;
            END IF;

            v_unit_cost := round(v_unit_cost_before_tax, 2);
        ELSE
            v_gross_before_tax := round(v_quantity * v_entered_unit_cost, 2);
            v_net_before_tax := round(v_gross_before_tax - v_discount_amount, 2);
            v_discount_before_tax := v_discount_amount;
            v_tax_amount := round(v_net_before_tax * (v_tax_rate / 100.00), 2);
            v_line_total := v_net_before_tax + v_tax_amount;
            v_unit_cost := round(v_entered_unit_cost, 2);
        END IF;

        IF v_tax_rate > 0 THEN
            v_tax_account_id := v_default_tax_input_account_id;
            IF v_tax_account_id IS NULL THEN
                RAISE EXCEPTION 'نسبة الضريبة مطبقة في السطر % ولكن لم يتم تهيئة حساب ضريبة المدخلات في الإعدادات المحاسبية.', v_line_number;
            END IF;
            PERFORM public.validate_master_data_account(v_tax_account_id, p_org_id, 'assets', 'حساب ضريبة المدخلات');
        ELSE
            v_tax_account_id := null;
        END IF;

        INSERT INTO public.purchase_bill_lines (
            purchase_bill_id, organization_id, item_id, line_number, description, 
            quantity, unit_cost, discount_amount, tax_rate, tax_amount, line_total, 
            expense_account_id, inventory_account_id, tax_account_id, entered_unit_cost
        ) VALUES (
            v_bill_id, p_org_id, v_item_id, v_line_number, v_description, 
            v_quantity, v_unit_cost, v_discount_before_tax, v_tax_rate, v_tax_amount, v_line_total, 
            v_expense_account_id, v_inventory_account_id, v_tax_account_id, v_entered_unit_cost
        );

        v_subtotal := v_subtotal + v_gross_before_tax;
        v_discount_total := v_discount_total + v_discount_before_tax;
        v_tax_total := v_tax_total + v_tax_amount;
        v_total := v_total + v_line_total;

        v_line_number := v_line_number + 1;
    END LOOP;

    UPDATE public.purchase_bills SET
        subtotal = v_subtotal,
        discount_total = v_discount_total,
        tax_total = v_tax_total,
        total = v_total,
        balance_due = v_total
    WHERE id = v_bill_id;

    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'CREATE_PURCHASE_BILL', jsonb_build_object('bill_id', v_bill_id, 'prices_include_tax', v_prices_include_tax, 'total', v_total));

    RETURN v_bill_id;
END;
$$;


-- 3. D. update_purchase_bill
CREATE OR REPLACE FUNCTION public.update_purchase_bill(
    p_org_id uuid,
    p_bill_id uuid,
    p_vendor_id uuid,
    p_vendor_invoice_number text,
    p_bill_date date,
    p_due_date date,
    p_notes text,
    p_lines jsonb,
    p_prices_include_tax boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
    v_paid_amount numeric(15,2) := 0.00;
    v_line jsonb;
    v_line_number integer := 1;
    v_item_id uuid;
    v_description text;
    v_quantity numeric(15,2);
    v_unit_cost numeric(15,2);
    v_entered_unit_cost numeric(15,4);
    v_unit_cost_before_tax numeric(15,4);
    v_discount_amount numeric(15,2);
    v_discount_before_tax numeric(15,2);
    v_gross_inclusive numeric(15,2);
    v_gross_before_tax numeric(15,2);
    v_net_inclusive numeric(15,2);
    v_net_before_tax numeric(15,2);
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
    v_prices_include_tax boolean;
BEGIN
    v_prices_include_tax := COALESCE(p_prices_include_tax, false);

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;
    
    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إدارة فواتير المشتريات متاحة للمالك والمدير والمحاسب فقط.';
    END IF;

    SELECT status, paid_amount INTO v_status, v_paid_amount
    FROM public.purchase_bills 
    WHERE id = p_bill_id AND organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'الفاتورة المطلوبة غير موجودة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن تعديل فاتورة تم اعتمادها أو إلغاؤها.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_vendor_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'المورد المحدد غير موجود أو غير نشط في هذه المنشأة.';
    END IF;

    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'الفاتورة يجب أن تحتوي على بند واحد على الأقل.';
    END IF;

    SELECT default_tax_input_account_id
    INTO v_default_tax_input_account_id
    FROM public.accounting_settings
    WHERE organization_id = p_org_id;

    DELETE FROM public.purchase_bill_lines WHERE purchase_bill_id = p_bill_id;

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
        v_entered_unit_cost := (v_line->>'unit_cost')::numeric;

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

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'الكمية في السطر % يجب أن تكون أكبر من الصفر.', v_line_number;
        END IF;

        IF v_entered_unit_cost < 0 THEN
            RAISE EXCEPTION 'تكلفة الوحدة في السطر % لا يمكن أن تكون سالبة.', v_line_number;
        END IF;

        IF v_discount_amount < 0 THEN
            RAISE EXCEPTION 'الخصم في السطر % لا يمكن أن يكون سالباً.', v_line_number;
        END IF;

        IF v_discount_amount > (v_quantity * v_entered_unit_cost) THEN
            RAISE EXCEPTION 'الخصم في السطر % لا يمكن أن يتجاوز إجمالي السطر قبل الخصم.', v_line_number;
        END IF;

        v_expense_account_id := null;
        IF v_line->>'expense_account_id' IS NOT NULL AND trim(v_line->>'expense_account_id') <> '' THEN
            v_expense_account_id := (v_line->>'expense_account_id')::uuid;
        END IF;

        v_inventory_account_id := null;
        IF v_line->>'inventory_account_id' IS NOT NULL AND trim(v_line->>'inventory_account_id') <> '' THEN
            v_inventory_account_id := (v_line->>'inventory_account_id')::uuid;
        END IF;

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

        IF v_expense_account_id IS NOT NULL THEN
            PERFORM public.validate_master_data_account(v_expense_account_id, p_org_id, 'expenses', 'حساب المصروف السطر ' || v_line_number);
        ELSIF v_inventory_account_id IS NOT NULL THEN
            PERFORM public.validate_master_data_account(v_inventory_account_id, p_org_id, 'assets', 'حساب المخزون السطر ' || v_line_number);
        ELSE
            RAISE EXCEPTION 'يجب تحديد حساب مصروف أو حساب مخزون للسطر %.', v_line_number;
        END IF;

        IF v_prices_include_tax THEN
            v_gross_inclusive := round(v_quantity * v_entered_unit_cost, 2);
            v_net_inclusive := round(v_gross_inclusive - v_discount_amount, 2);

            IF v_tax_rate > 0 THEN
                v_unit_cost_before_tax := round(v_entered_unit_cost / (1.00 + (v_tax_rate / 100.00)), 4);
                v_gross_before_tax := round(v_gross_inclusive / (1.00 + (v_tax_rate / 100.00)), 2);
                v_net_before_tax := round(v_net_inclusive / (1.00 + (v_tax_rate / 100.00)), 2);
                v_tax_amount := round(v_net_inclusive - v_net_before_tax, 2);
                v_line_total := v_net_inclusive;
                v_discount_before_tax := round(v_gross_before_tax - v_net_before_tax, 2);
            ELSE
                v_unit_cost_before_tax := v_entered_unit_cost;
                v_gross_before_tax := v_gross_inclusive;
                v_net_before_tax := v_net_inclusive;
                v_tax_amount := 0.00;
                v_line_total := v_net_inclusive;
                v_discount_before_tax := v_discount_amount;
            END IF;

            v_unit_cost := round(v_unit_cost_before_tax, 2);
        ELSE
            v_gross_before_tax := round(v_quantity * v_entered_unit_cost, 2);
            v_net_before_tax := round(v_gross_before_tax - v_discount_amount, 2);
            v_discount_before_tax := v_discount_amount;
            v_tax_amount := round(v_net_before_tax * (v_tax_rate / 100.00), 2);
            v_line_total := v_net_before_tax + v_tax_amount;
            v_unit_cost := round(v_entered_unit_cost, 2);
        END IF;

        IF v_tax_rate > 0 THEN
            v_tax_account_id := v_default_tax_input_account_id;
            IF v_tax_account_id IS NULL THEN
                RAISE EXCEPTION 'نسبة الضريبة مطبقة في السطر % ولكن لم يتم تهيئة حساب ضريبة المدخلات في الإعدادات المحاسبية.', v_line_number;
            END IF;
            PERFORM public.validate_master_data_account(v_tax_account_id, p_org_id, 'assets', 'حساب ضريبة المدخلات');
        ELSE
            v_tax_account_id := null;
        END IF;

        INSERT INTO public.purchase_bill_lines (
            purchase_bill_id, organization_id, item_id, line_number, description, 
            quantity, unit_cost, discount_amount, tax_rate, tax_amount, line_total, 
            expense_account_id, inventory_account_id, tax_account_id, entered_unit_cost
        ) VALUES (
            p_bill_id, p_org_id, v_item_id, v_line_number, v_description, 
            v_quantity, v_unit_cost, v_discount_before_tax, v_tax_rate, v_tax_amount, v_line_total, 
            v_expense_account_id, v_inventory_account_id, v_tax_account_id, v_entered_unit_cost
        );

        v_subtotal := v_subtotal + v_gross_before_tax;
        v_discount_total := v_discount_total + v_discount_before_tax;
        v_tax_total := v_tax_total + v_tax_amount;
        v_total := v_total + v_line_total;

        v_line_number := v_line_number + 1;
    END LOOP;

    UPDATE public.purchase_bills SET
        vendor_id = p_vendor_id,
        vendor_invoice_number = trim(p_vendor_invoice_number),
        bill_date = p_bill_date,
        due_date = p_due_date,
        notes = trim(p_notes),
        subtotal = v_subtotal,
        discount_total = v_discount_total,
        tax_total = v_tax_total,
        total = v_total,
        balance_due = v_total - v_paid_amount,
        prices_include_tax = v_prices_include_tax,
        updated_at = now()
    WHERE id = p_bill_id AND organization_id = p_org_id;

    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'UPDATE_PURCHASE_BILL', jsonb_build_object('bill_id', p_bill_id, 'prices_include_tax', v_prices_include_tax, 'total', v_total));
END;
$$;


-- 4. Grants and Schema Reload Notification
REVOKE ALL ON FUNCTION public.create_sales_invoice(uuid, uuid, date, date, text, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_invoice(uuid, uuid, date, date, text, jsonb, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.update_sales_invoice(uuid, uuid, uuid, date, date, text, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_sales_invoice(uuid, uuid, uuid, date, date, text, jsonb, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.create_purchase_bill(uuid, uuid, text, date, date, text, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_bill(uuid, uuid, text, date, date, text, jsonb, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.update_purchase_bill(uuid, uuid, uuid, text, date, date, text, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_purchase_bill(uuid, uuid, uuid, text, date, date, text, jsonb, boolean) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
