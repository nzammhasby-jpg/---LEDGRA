-- Migration: 20260806000002_invoice_payment_methods_and_quotations.sql
-- Description: Adds payment method and split details to sales invoices & purchase bills, and introduces the complete Sales Quotations module.

BEGIN;

-- 1. ALTER sales_invoices table
ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'credit',
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_notes text,
  ADD COLUMN IF NOT EXISTS payment_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_quotation_id uuid;

ALTER TABLE public.sales_invoices
  DROP CONSTRAINT IF EXISTS check_sales_invoices_payment_method;

ALTER TABLE public.sales_invoices
  ADD CONSTRAINT check_sales_invoices_payment_method
  CHECK (payment_method IN ('cash', 'credit', 'card', 'cheque', 'bank_transfer', 'cash_and_card', 'bank_transfer_and_cash'));

CREATE INDEX IF NOT EXISTS idx_sales_invoices_payment_method
  ON public.sales_invoices(organization_id, payment_method);


-- 2. ALTER purchase_bills table
ALTER TABLE public.purchase_bills
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'credit',
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_notes text,
  ADD COLUMN IF NOT EXISTS payment_details jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.purchase_bills
  DROP CONSTRAINT IF EXISTS check_purchase_bills_payment_method;

ALTER TABLE public.purchase_bills
  ADD CONSTRAINT check_purchase_bills_payment_method
  CHECK (payment_method IN ('cash', 'credit', 'card', 'cheque', 'bank_transfer', 'cash_and_card', 'bank_transfer_and_cash'));

CREATE INDEX IF NOT EXISTS idx_purchase_bills_payment_method
  ON public.purchase_bills(organization_id, payment_method);


-- 3. CREATE sales_quotations table
CREATE TABLE IF NOT EXISTS public.sales_quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quotation_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  quotation_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted', 'cancelled')),
  prices_include_tax boolean NOT NULL DEFAULT false,
  payment_method text DEFAULT 'credit' CHECK (payment_method IN ('cash', 'credit', 'card', 'cheque', 'bank_transfer', 'cash_and_card', 'bank_transfer_and_cash')),
  payment_reference text,
  payment_notes text,
  payment_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  subtotal numeric(15,2) NOT NULL DEFAULT 0.00,
  discount_total numeric(15,2) NOT NULL DEFAULT 0.00,
  tax_total numeric(15,2) NOT NULL DEFAULT 0.00,
  total numeric(15,2) NOT NULL DEFAULT 0.00,
  currency text NOT NULL DEFAULT 'SAR',
  notes text,
  terms_and_conditions text,
  converted_invoice_id uuid REFERENCES public.sales_invoices(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id),
  delete_reason text,
  restored_at timestamptz,
  restored_by uuid REFERENCES auth.users(id),
  CONSTRAINT unq_org_quotation_number UNIQUE (organization_id, quotation_number)
);

-- Add Foreign Key from sales_invoices to sales_quotations if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_sales_invoices_source_quotation'
  ) THEN
    ALTER TABLE public.sales_invoices
      ADD CONSTRAINT fk_sales_invoices_source_quotation
      FOREIGN KEY (source_quotation_id) REFERENCES public.sales_quotations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. CREATE sales_quotation_lines table
CREATE TABLE IF NOT EXISTS public.sales_quotation_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sales_quotation_id uuid NOT NULL REFERENCES public.sales_quotations(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  line_number integer NOT NULL,
  description text,
  quantity numeric(15,4) NOT NULL DEFAULT 1.0000,
  unit_price numeric(15,4) NOT NULL DEFAULT 0.0000,
  entered_unit_price numeric(15,4),
  discount_amount numeric(15,2) NOT NULL DEFAULT 0.00,
  tax_rate numeric(5,2) NOT NULL DEFAULT 15.00,
  tax_amount numeric(15,2) NOT NULL DEFAULT 0.00,
  line_total numeric(15,2) NOT NULL DEFAULT 0.00,
  revenue_account_id uuid REFERENCES public.accounts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for sales_quotations and lines
CREATE INDEX IF NOT EXISTS idx_sales_quotations_org_status ON public.sales_quotations(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_quotations_customer ON public.sales_quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_quotation_lines_quotation ON public.sales_quotation_lines(sales_quotation_id);

-- Enable RLS
ALTER TABLE public.sales_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_quotation_lines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sales_quotations
DROP POLICY IF EXISTS "Users can view sales_quotations of their org" ON public.sales_quotations;
CREATE POLICY "Users can view sales_quotations of their org"
  ON public.sales_quotations FOR SELECT
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can insert sales_quotations in their org" ON public.sales_quotations;
CREATE POLICY "Users can insert sales_quotations in their org"
  ON public.sales_quotations FOR INSERT
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can update sales_quotations in their org" ON public.sales_quotations;
CREATE POLICY "Users can update sales_quotations in their org"
  ON public.sales_quotations FOR UPDATE
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can delete sales_quotations in their org" ON public.sales_quotations;
CREATE POLICY "Users can delete sales_quotations in their org"
  ON public.sales_quotations FOR DELETE
  USING (public.is_org_member(organization_id));

-- RLS Policies for sales_quotation_lines
DROP POLICY IF EXISTS "Users can view sales_quotation_lines of their org" ON public.sales_quotation_lines;
CREATE POLICY "Users can view sales_quotation_lines of their org"
  ON public.sales_quotation_lines FOR SELECT
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can insert sales_quotation_lines in their org" ON public.sales_quotation_lines;
CREATE POLICY "Users can insert sales_quotation_lines in their org"
  ON public.sales_quotation_lines FOR INSERT
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can update sales_quotation_lines in their org" ON public.sales_quotation_lines;
CREATE POLICY "Users can update sales_quotation_lines in their org"
  ON public.sales_quotation_lines FOR UPDATE
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can delete sales_quotation_lines in their org" ON public.sales_quotation_lines;
CREATE POLICY "Users can delete sales_quotation_lines in their org"
  ON public.sales_quotation_lines FOR DELETE
  USING (public.is_org_member(organization_id));


-- 5. DROP existing RPC signatures to update parameters safely
DROP FUNCTION IF EXISTS public.create_sales_invoice(uuid, uuid, date, date, text, jsonb, boolean);
DROP FUNCTION IF EXISTS public.create_sales_invoice(uuid, uuid, date, date, text, jsonb, boolean, text, text, text, jsonb);

DROP FUNCTION IF EXISTS public.update_sales_invoice(uuid, uuid, uuid, date, date, text, jsonb, boolean);
DROP FUNCTION IF EXISTS public.update_sales_invoice(uuid, uuid, uuid, date, date, text, jsonb, boolean, text, text, text, jsonb);

DROP FUNCTION IF EXISTS public.create_purchase_bill(uuid, uuid, text, date, date, text, jsonb, boolean);
DROP FUNCTION IF EXISTS public.create_purchase_bill(uuid, uuid, text, date, date, text, jsonb, boolean, text, text, text, jsonb);

DROP FUNCTION IF EXISTS public.update_purchase_bill(uuid, uuid, uuid, text, date, date, text, jsonb, boolean);
DROP FUNCTION IF EXISTS public.update_purchase_bill(uuid, uuid, uuid, text, date, date, text, jsonb, boolean, text, text, text, jsonb);


-- 6. RPC: create_sales_invoice (With Payment Method, Reference, Notes, Details)
CREATE OR REPLACE FUNCTION public.create_sales_invoice(
    p_org_id uuid,
    p_customer_id uuid,
    p_invoice_date date,
    p_due_date date,
    p_notes text,
    p_lines jsonb,
    p_prices_include_tax boolean DEFAULT false,
    p_payment_method text DEFAULT 'credit',
    p_payment_reference text DEFAULT NULL,
    p_payment_notes text DEFAULT NULL,
    p_payment_details jsonb DEFAULT '{}'::jsonb
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
    v_quantity numeric(15,4);
    v_unit_price numeric(15,4);
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
    v_invoice_number text;
    v_seq integer;
    v_pay_method text;
BEGIN
    v_prices_include_tax := COALESCE(p_prices_include_tax, false);
    v_pay_method := COALESCE(p_payment_method, 'credit');

    IF v_pay_method NOT IN ('cash', 'credit', 'card', 'cheque', 'bank_transfer', 'cash_and_card', 'bank_transfer_and_cash') THEN
        RAISE EXCEPTION 'طريقة السداد غير صالحة: %', v_pay_method;
    END IF;

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

    -- Generate Invoice Number
    SELECT COALESCE(MAX(
        CASE 
            WHEN invoice_number ~ '^INV-[0-9]+$' THEN substring(invoice_number from 5)::integer
            ELSE 0
        END
    ), 0) + 1 INTO v_seq
    FROM public.sales_invoices
    WHERE organization_id = p_org_id;

    v_invoice_number := 'INV-' || lpad(v_seq::text, 5, '0');

    -- Insert Header
    INSERT INTO public.sales_invoices (
        organization_id, customer_id, invoice_number, invoice_date, due_date, 
        status, payment_status, subtotal, discount_total, tax_total, total, 
        paid_amount, balance_due, currency, notes, created_by, prices_include_tax,
        payment_method, payment_reference, payment_notes, payment_details
    ) VALUES (
        p_org_id, p_customer_id, v_invoice_number, p_invoice_date, p_due_date, 
        'draft', 'unpaid', 0, 0, 0, 0, 
        0, 0, v_org_currency, trim(p_notes), auth.uid(), v_prices_include_tax,
        v_pay_method, trim(p_payment_reference), trim(p_payment_notes), COALESCE(p_payment_details, '{}'::jsonb)
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
            v_tax_rate := 15.00;
        END IF;

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر في السطر %.', v_line_number;
        END IF;

        IF v_entered_unit_price < 0 THEN
            RAISE EXCEPTION 'سعر الوحدة لا يمكن أن يكون سالباً في السطر %.', v_line_number;
        END IF;

        IF v_discount_amount < 0 THEN
            RAISE EXCEPTION 'الخصم لا يمكن أن يكون سالباً في السطر %.', v_line_number;
        END IF;

        IF v_tax_rate < 0 THEN
            RAISE EXCEPTION 'نسبة الضريبة لا يمكن أن تكون سالبة في السطر %.', v_line_number;
        END IF;

        -- Account resolution
        IF v_line->>'revenue_account_id' IS NOT NULL AND trim(v_line->>'revenue_account_id') <> '' THEN
            v_revenue_account_id := (v_line->>'revenue_account_id')::uuid;
        ELSE
            SELECT sales_account_id INTO v_revenue_account_id
            FROM public.items
            WHERE id = v_item_id AND organization_id = p_org_id;

            IF v_revenue_account_id IS NULL THEN
                SELECT default_sales_account_id INTO v_revenue_account_id
                FROM public.accounting_settings
                WHERE organization_id = p_org_id;
            END IF;
        END IF;

        IF v_revenue_account_id IS NULL THEN
            RAISE EXCEPTION 'تعذر تحديد حساب الإيراد للصنف في السطر %.', v_line_number;
        END IF;

        PERFORM public.validate_master_data_account(v_revenue_account_id, p_org_id, 'revenue', 'حساب الإيرادات');

        v_tax_account_id := v_default_tax_output_account_id;

        -- Mathematical calculations
        IF v_prices_include_tax THEN
            v_gross_inclusive := round(v_quantity * v_entered_unit_price, 2);
            IF v_discount_amount > v_gross_inclusive THEN
                RAISE EXCEPTION 'الخصم لا يمكن أن يتجاوز إجمالي السطر الشامل للضريبة في السطر %.', v_line_number;
            END IF;

            v_net_inclusive := v_gross_inclusive - v_discount_amount;
            v_tax_amount := round(v_net_inclusive - (v_net_inclusive / (1.00 + (v_tax_rate / 100.00))), 2);
            v_net_before_tax := round(v_net_inclusive - v_tax_amount, 2);
            v_gross_before_tax := round(v_gross_inclusive / (1.00 + (v_tax_rate / 100.00)), 2);
            v_discount_before_tax := round(v_gross_before_tax - v_net_before_tax, 2);
            v_unit_price_before_tax := round(v_entered_unit_price / (1.00 + (v_tax_rate / 100.00)), 4);
            v_line_total := v_net_inclusive;
        ELSE
            v_unit_price_before_tax := v_entered_unit_price;
            v_gross_before_tax := round(v_quantity * v_unit_price_before_tax, 2);
            v_discount_before_tax := v_discount_amount;

            IF v_discount_before_tax > v_gross_before_tax THEN
                RAISE EXCEPTION 'الخصم لا يمكن أن يتجاوز إجمالي السطر قبل الضريبة في السطر %.', v_line_number;
            END IF;

            v_net_before_tax := v_gross_before_tax - v_discount_before_tax;
            v_tax_amount := round(v_net_before_tax * (v_tax_rate / 100.00), 2);
            v_line_total := round(v_net_before_tax + v_tax_amount, 2);
        END IF;

        INSERT INTO public.sales_invoice_lines (
            sales_invoice_id, organization_id, item_id, line_number,
            description, quantity, unit_price, entered_unit_price, discount_amount, tax_rate,
            tax_amount, line_total, revenue_account_id, tax_account_id
        ) VALUES (
            v_invoice_id, p_org_id, v_item_id, v_line_number,
            v_description, v_quantity, v_unit_price_before_tax, v_entered_unit_price,
            v_discount_before_tax, v_tax_rate, v_tax_amount, v_line_total,
            v_revenue_account_id, v_tax_account_id
        );

        v_subtotal := v_subtotal + v_gross_before_tax;
        v_discount_total := v_discount_total + v_discount_before_tax;
        v_tax_total := v_tax_total + v_tax_amount;
        v_total := v_total + v_line_total;

        v_line_number := v_line_number + 1;
    END LOOP;

    -- Update Invoice Header Totals
    UPDATE public.sales_invoices SET
        subtotal = v_subtotal,
        discount_total = v_discount_total,
        tax_total = v_tax_total,
        total = v_total,
        balance_due = v_total
    WHERE id = v_invoice_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        p_org_id, auth.uid(), 'create_sales_invoice',
        jsonb_build_object(
            'sales_invoice_id', v_invoice_id,
            'invoice_number', v_invoice_number,
            'total', v_total,
            'payment_method', v_pay_method
        )
    );

    RETURN v_invoice_id;
END;
$$;


-- 7. RPC: update_sales_invoice
CREATE OR REPLACE FUNCTION public.update_sales_invoice(
    p_org_id uuid,
    p_invoice_id uuid,
    p_customer_id uuid,
    p_invoice_date date,
    p_due_date date,
    p_notes text,
    p_lines jsonb,
    p_prices_include_tax boolean DEFAULT false,
    p_payment_method text DEFAULT 'credit',
    p_payment_reference text DEFAULT NULL,
    p_payment_notes text DEFAULT NULL,
    p_payment_details jsonb DEFAULT '{}'::jsonb
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
    v_quantity numeric(15,4);
    v_unit_price numeric(15,4);
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
    v_prices_include_tax boolean;
    v_pay_method text;
BEGIN
    v_prices_include_tax := COALESCE(p_prices_include_tax, false);
    v_pay_method := COALESCE(p_payment_method, 'credit');

    IF v_pay_method NOT IN ('cash', 'credit', 'card', 'cheque', 'bank_transfer', 'cash_and_card', 'bank_transfer_and_cash') THEN
        RAISE EXCEPTION 'طريقة السداد غير صالحة: %', v_pay_method;
    END IF;

    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_manage_sales_drafts(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لتعديل مسودات فواتير المبيعات في هذه المنشأة.';
    END IF;

    -- Verify invoice exists, belongs to org, and is draft
    SELECT status INTO v_status
    FROM public.sales_invoices
    WHERE id = p_invoice_id AND organization_id = p_org_id AND deleted_at IS NULL;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'الفاتورة غير موجودة أو تم حذفها.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'يمكن فقط تعديل الفواتير التي في حالة مسودة (draft).';
    END IF;

    -- Verify customer belongs to organization
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'العميل المحدد غير موجود أو غير نشط في هذه المنشأة.';
    END IF;

    -- Verify lines is an array and not empty
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'الفاتورة يجب أن تحتوي على بند واحد على الأقل.';
    END IF;

    SELECT default_tax_output_account_id
    INTO v_default_tax_output_account_id
    FROM public.accounting_settings
    WHERE organization_id = p_org_id;

    -- Delete old lines
    DELETE FROM public.sales_invoice_lines WHERE sales_invoice_id = p_invoice_id;

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
            v_tax_rate := 15.00;
        END IF;

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر في السطر %.', v_line_number;
        END IF;

        IF v_entered_unit_price < 0 THEN
            RAISE EXCEPTION 'سعر الوحدة لا يمكن أن يكون سالباً في السطر %.', v_line_number;
        END IF;

        IF v_discount_amount < 0 THEN
            RAISE EXCEPTION 'الخصم لا يمكن أن يكون سالباً في السطر %.', v_line_number;
        END IF;

        IF v_tax_rate < 0 THEN
            RAISE EXCEPTION 'نسبة الضريبة لا يمكن أن تكون سالبة في السطر %.', v_line_number;
        END IF;

        IF v_line->>'revenue_account_id' IS NOT NULL AND trim(v_line->>'revenue_account_id') <> '' THEN
            v_revenue_account_id := (v_line->>'revenue_account_id')::uuid;
        ELSE
            SELECT sales_account_id INTO v_revenue_account_id
            FROM public.items
            WHERE id = v_item_id AND organization_id = p_org_id;

            IF v_revenue_account_id IS NULL THEN
                SELECT default_sales_account_id INTO v_revenue_account_id
                FROM public.accounting_settings
                WHERE organization_id = p_org_id;
            END IF;
        END IF;

        IF v_revenue_account_id IS NULL THEN
            RAISE EXCEPTION 'تعذر تحديد حساب الإيراد للصنف في السطر %.', v_line_number;
        END IF;

        PERFORM public.validate_master_data_account(v_revenue_account_id, p_org_id, 'revenue', 'حساب الإيرادات');

        v_tax_account_id := v_default_tax_output_account_id;

        IF v_prices_include_tax THEN
            v_gross_inclusive := round(v_quantity * v_entered_unit_price, 2);
            IF v_discount_amount > v_gross_inclusive THEN
                RAISE EXCEPTION 'الخصم لا يمكن أن يتجاوز إجمالي السطر الشامل للضريبة في السطر %.', v_line_number;
            END IF;

            v_net_inclusive := v_gross_inclusive - v_discount_amount;
            v_tax_amount := round(v_net_inclusive - (v_net_inclusive / (1.00 + (v_tax_rate / 100.00))), 2);
            v_net_before_tax := round(v_net_inclusive - v_tax_amount, 2);
            v_gross_before_tax := round(v_gross_inclusive / (1.00 + (v_tax_rate / 100.00)), 2);
            v_discount_before_tax := round(v_gross_before_tax - v_net_before_tax, 2);
            v_unit_price_before_tax := round(v_entered_unit_price / (1.00 + (v_tax_rate / 100.00)), 4);
            v_line_total := v_net_inclusive;
        ELSE
            v_unit_price_before_tax := v_entered_unit_price;
            v_gross_before_tax := round(v_quantity * v_unit_price_before_tax, 2);
            v_discount_before_tax := v_discount_amount;

            IF v_discount_before_tax > v_gross_before_tax THEN
                RAISE EXCEPTION 'الخصم لا يمكن أن يتجاوز إجمالي السطر قبل الضريبة في السطر %.', v_line_number;
            END IF;

            v_net_before_tax := v_gross_before_tax - v_discount_before_tax;
            v_tax_amount := round(v_net_before_tax * (v_tax_rate / 100.00), 2);
            v_line_total := round(v_net_before_tax + v_tax_amount, 2);
        END IF;

        INSERT INTO public.sales_invoice_lines (
            sales_invoice_id, organization_id, item_id, line_number,
            description, quantity, unit_price, entered_unit_price, discount_amount, tax_rate,
            tax_amount, line_total, revenue_account_id, tax_account_id
        ) VALUES (
            p_invoice_id, p_org_id, v_item_id, v_line_number,
            v_description, v_quantity, v_unit_price_before_tax, v_entered_unit_price,
            v_discount_before_tax, v_tax_rate, v_tax_amount, v_line_total,
            v_revenue_account_id, v_tax_account_id
        );

        v_subtotal := v_subtotal + v_gross_before_tax;
        v_discount_total := v_discount_total + v_discount_before_tax;
        v_tax_total := v_tax_total + v_tax_amount;
        v_total := v_total + v_line_total;

        v_line_number := v_line_number + 1;
    END LOOP;

    -- Update Header
    UPDATE public.sales_invoices SET
        customer_id = p_customer_id,
        invoice_date = p_invoice_date,
        due_date = p_due_date,
        notes = trim(p_notes),
        prices_include_tax = v_prices_include_tax,
        payment_method = v_pay_method,
        payment_reference = trim(p_payment_reference),
        payment_notes = trim(p_payment_notes),
        payment_details = COALESCE(p_payment_details, '{}'::jsonb),
        subtotal = v_subtotal,
        discount_total = v_discount_total,
        tax_total = v_tax_total,
        total = v_total,
        balance_due = v_total - paid_amount,
        updated_at = now()
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        p_org_id, auth.uid(), 'update_sales_invoice',
        jsonb_build_object(
            'sales_invoice_id', p_invoice_id,
            'total', v_total,
            'payment_method', v_pay_method
        )
    );
END;
$$;


-- 8. RPC: create_purchase_bill
CREATE OR REPLACE FUNCTION public.create_purchase_bill(
    p_org_id uuid,
    p_vendor_id uuid,
    p_vendor_invoice_number text,
    p_bill_date date,
    p_due_date date,
    p_notes text,
    p_lines jsonb,
    p_prices_include_tax boolean DEFAULT false,
    p_payment_method text DEFAULT 'credit',
    p_payment_reference text DEFAULT NULL,
    p_payment_notes text DEFAULT NULL,
    p_payment_details jsonb DEFAULT '{}'::jsonb
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
    v_quantity numeric(15,4);
    v_unit_cost numeric(15,4);
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
    v_org_currency text;
    v_bill_number text;
    v_seq integer;
    v_prices_include_tax boolean;
    v_pay_method text;
BEGIN
    v_prices_include_tax := COALESCE(p_prices_include_tax, false);
    v_pay_method := COALESCE(p_payment_method, 'credit');

    IF v_pay_method NOT IN ('cash', 'credit', 'card', 'cheque', 'bank_transfer', 'cash_and_card', 'bank_transfer_and_cash') THEN
        RAISE EXCEPTION 'طريقة السداد غير صالحة: %', v_pay_method;
    END IF;

    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_manage_purchase_drafts(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لإدارة فواتير المشتريات المسودات في هذه المنشأة.';
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
        RAISE EXCEPTION 'فاتورة المشتريات يجب أن تحتوي على بند واحد على الأقل.';
    END IF;

    SELECT default_tax_input_account_id
    INTO v_default_tax_input_account_id
    FROM public.accounting_settings
    WHERE organization_id = p_org_id;

    -- Advisory lock for sequential numbering
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':purchase_bill:' || to_char(p_bill_date, 'YYYY'))
    );

    -- Generate Bill Number
    SELECT COALESCE(MAX(
        CASE 
            WHEN bill_number ~ '^BILL-[0-9]+$' THEN substring(bill_number from 6)::integer
            ELSE 0
        END
    ), 0) + 1 INTO v_seq
    FROM public.purchase_bills
    WHERE organization_id = p_org_id;

    v_bill_number := 'BILL-' || lpad(v_seq::text, 5, '0');

    -- Insert Header
    INSERT INTO public.purchase_bills (
        organization_id, vendor_id, bill_number, vendor_invoice_number,
        bill_date, due_date, status, payment_status, subtotal, discount_total,
        tax_total, total, paid_amount, balance_due, currency, notes, created_by, prices_include_tax,
        payment_method, payment_reference, payment_notes, payment_details
    ) VALUES (
        p_org_id, p_vendor_id, v_bill_number, trim(p_vendor_invoice_number),
        p_bill_date, p_due_date, 'draft', 'unpaid', 0, 0,
        0, 0, 0, 0, v_org_currency, trim(p_notes), auth.uid(), v_prices_include_tax,
        v_pay_method, trim(p_payment_reference), trim(p_payment_notes), COALESCE(p_payment_details, '{}'::jsonb)
    ) RETURNING id INTO v_bill_id;

    -- Loop through lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        IF v_line->>'quantity' IS NULL OR trim(v_line->>'quantity') = '' THEN
            RAISE EXCEPTION 'الكمية مطلوبة في السطر %.', v_line_number;
        END IF;
        
        IF v_line->>'unit_cost' IS NULL OR trim(v_line->>'unit_cost') = '' THEN
            RAISE EXCEPTION 'سعر الوحدة مطلوب في السطر %.', v_line_number;
        END IF;

        IF v_line->>'item_id' IS NOT NULL AND trim(v_line->>'item_id') <> '' THEN
            v_item_id := (v_line->>'item_id')::uuid;
        ELSE
            v_item_id := NULL;
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
            v_tax_rate := 15.00;
        END IF;

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر في السطر %.', v_line_number;
        END IF;

        IF v_entered_unit_cost < 0 THEN
            RAISE EXCEPTION 'تكلُفة الوحدة لا يمكن أن تكون سالبة في السطر %.', v_line_number;
        END IF;

        IF v_discount_amount < 0 THEN
            RAISE EXCEPTION 'الخصم لا يمكن أن يكون سالباً في السطر %.', v_line_number;
        END IF;

        IF v_tax_rate < 0 THEN
            RAISE EXCEPTION 'نسبة الضريبة لا يمكن أن تكون سالبة في السطر %.', v_line_number;
        END IF;

        -- Account resolution
        v_expense_account_id := NULL;
        v_inventory_account_id := NULL;

        IF v_item_id IS NOT NULL THEN
            SELECT expense_account_id, inventory_account_id INTO v_expense_account_id, v_inventory_account_id
            FROM public.items
            WHERE id = v_item_id AND organization_id = p_org_id;
        END IF;

        IF v_expense_account_id IS NULL AND v_inventory_account_id IS NULL THEN
            IF v_line->>'expense_account_id' IS NOT NULL AND trim(v_line->>'expense_account_id') <> '' THEN
                v_expense_account_id := (v_line->>'expense_account_id')::uuid;
            ELSIF v_line->>'inventory_account_id' IS NOT NULL AND trim(v_line->>'inventory_account_id') <> '' THEN
                v_inventory_account_id := (v_line->>'inventory_account_id')::uuid;
            END IF;
        END IF;

        IF v_expense_account_id IS NULL AND v_inventory_account_id IS NULL THEN
            SELECT default_cogs_account_id INTO v_expense_account_id
            FROM public.accounting_settings
            WHERE organization_id = p_org_id;
        END IF;

        IF v_expense_account_id IS NULL AND v_inventory_account_id IS NULL THEN
            RAISE EXCEPTION 'تعذر تحديد حساب المصروف أو المخزون للبند في السطر %.', v_line_number;
        END IF;

        v_tax_account_id := v_default_tax_input_account_id;

        IF v_prices_include_tax THEN
            v_gross_inclusive := round(v_quantity * v_entered_unit_cost, 2);
            IF v_discount_amount > v_gross_inclusive THEN
                RAISE EXCEPTION 'الخصم لا يمكن أن يتجاوز إجمالي السطر الشامل للضريبة في السطر %.', v_line_number;
            END IF;

            v_net_inclusive := v_gross_inclusive - v_discount_amount;
            v_tax_amount := round(v_net_inclusive - (v_net_inclusive / (1.00 + (v_tax_rate / 100.00))), 2);
            v_net_before_tax := round(v_net_inclusive - v_tax_amount, 2);
            v_gross_before_tax := round(v_gross_inclusive / (1.00 + (v_tax_rate / 100.00)), 2);
            v_discount_before_tax := round(v_gross_before_tax - v_net_before_tax, 2);
            v_unit_cost_before_tax := round(v_entered_unit_cost / (1.00 + (v_tax_rate / 100.00)), 4);
            v_line_total := v_net_inclusive;
        ELSE
            v_unit_cost_before_tax := v_entered_unit_cost;
            v_gross_before_tax := round(v_quantity * v_unit_cost_before_tax, 2);
            v_discount_before_tax := v_discount_amount;

            IF v_discount_before_tax > v_gross_before_tax THEN
                RAISE EXCEPTION 'الخصم لا يمكن أن يتجاوز إجمالي السطر قبل الضريبة في السطر %.', v_line_number;
            END IF;

            v_net_before_tax := v_gross_before_tax - v_discount_before_tax;
            v_tax_amount := round(v_net_before_tax * (v_tax_rate / 100.00), 2);
            v_line_total := round(v_net_before_tax + v_tax_amount, 2);
        END IF;

        INSERT INTO public.purchase_bill_lines (
            purchase_bill_id, organization_id, item_id, line_number,
            description, quantity, unit_cost, entered_unit_cost, discount_amount, tax_rate,
            tax_amount, line_total, expense_account_id, inventory_account_id, tax_account_id
        ) VALUES (
            v_bill_id, p_org_id, v_item_id, v_line_number,
            v_description, v_quantity, v_unit_cost_before_tax, v_entered_unit_cost,
            v_discount_before_tax, v_tax_rate, v_tax_amount, v_line_total,
            v_expense_account_id, v_inventory_account_id, v_tax_account_id
        );

        v_subtotal := v_subtotal + v_gross_before_tax;
        v_discount_total := v_discount_total + v_discount_before_tax;
        v_tax_total := v_tax_total + v_tax_amount;
        v_total := v_total + v_line_total;

        v_line_number := v_line_number + 1;
    END LOOP;

    -- Update Bill Header Totals
    UPDATE public.purchase_bills SET
        subtotal = v_subtotal,
        discount_total = v_discount_total,
        tax_total = v_tax_total,
        total = v_total,
        balance_due = v_total
    WHERE id = v_bill_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        p_org_id, auth.uid(), 'create_purchase_bill',
        jsonb_build_object(
            'purchase_bill_id', v_bill_id,
            'bill_number', v_bill_number,
            'total', v_total,
            'payment_method', v_pay_method
        )
    );

    RETURN v_bill_id;
END;
$$;


-- 9. RPC: update_purchase_bill
CREATE OR REPLACE FUNCTION public.update_purchase_bill(
    p_org_id uuid,
    p_bill_id uuid,
    p_vendor_id uuid,
    p_vendor_invoice_number text,
    p_bill_date date,
    p_due_date date,
    p_notes text,
    p_lines jsonb,
    p_prices_include_tax boolean DEFAULT false,
    p_payment_method text DEFAULT 'credit',
    p_payment_reference text DEFAULT NULL,
    p_payment_notes text DEFAULT NULL,
    p_payment_details jsonb DEFAULT '{}'::jsonb
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
    v_quantity numeric(15,4);
    v_unit_cost numeric(15,4);
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
    v_prices_include_tax boolean;
    v_pay_method text;
BEGIN
    v_prices_include_tax := COALESCE(p_prices_include_tax, false);
    v_pay_method := COALESCE(p_payment_method, 'credit');

    IF v_pay_method NOT IN ('cash', 'credit', 'card', 'cheque', 'bank_transfer', 'cash_and_card', 'bank_transfer_and_cash') THEN
        RAISE EXCEPTION 'طريقة السداد غير صالحة: %', v_pay_method;
    END IF;

    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_manage_purchase_drafts(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لتعديل مسودات فواتير المشتريات في هذه المنشأة.';
    END IF;

    -- Verify bill exists, belongs to org, and is draft
    SELECT status INTO v_status
    FROM public.purchase_bills
    WHERE id = p_bill_id AND organization_id = p_org_id AND deleted_at IS NULL;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'فاتورة المشتريات غير موجودة أو تم حذفها.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'يمكن فقط تعديل فواتير المشتريات التي في حالة مسودة (draft).';
    END IF;

    -- Verify vendor belongs to organization
    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_vendor_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'المورد المحدد غير موجود أو غير نشط في هذه المنشأة.';
    END IF;

    -- Verify lines is an array and not empty
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'فاتورة المشتريات يجب أن تحتوي على بند واحد على الأقل.';
    END IF;

    SELECT default_tax_input_account_id
    INTO v_default_tax_input_account_id
    FROM public.accounting_settings
    WHERE organization_id = p_org_id;

    -- Delete old lines
    DELETE FROM public.purchase_bill_lines WHERE purchase_bill_id = p_bill_id;

    -- Loop through lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        IF v_line->>'quantity' IS NULL OR trim(v_line->>'quantity') = '' THEN
            RAISE EXCEPTION 'الكمية مطلوبة في السطر %.', v_line_number;
        END IF;
        
        IF v_line->>'unit_cost' IS NULL OR trim(v_line->>'unit_cost') = '' THEN
            RAISE EXCEPTION 'سعر الوحدة مطلوب في السطر %.', v_line_number;
        END IF;

        IF v_line->>'item_id' IS NOT NULL AND trim(v_line->>'item_id') <> '' THEN
            v_item_id := (v_line->>'item_id')::uuid;
        ELSE
            v_item_id := NULL;
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
            v_tax_rate := 15.00;
        END IF;

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر في السطر %.', v_line_number;
        END IF;

        IF v_entered_unit_cost < 0 THEN
            RAISE EXCEPTION 'تكلُفة الوحدة لا يمكن أن تكون سالبة في السطر %.', v_line_number;
        END IF;

        IF v_discount_amount < 0 THEN
            RAISE EXCEPTION 'الخصم لا يمكن أن يكون سالباً في السطر %.', v_line_number;
        END IF;

        IF v_tax_rate < 0 THEN
            RAISE EXCEPTION 'نسبة الضريبة لا يمكن أن تكون سالبة في السطر %.', v_line_number;
        END IF;

        v_expense_account_id := NULL;
        v_inventory_account_id := NULL;

        IF v_item_id IS NOT NULL THEN
            SELECT expense_account_id, inventory_account_id INTO v_expense_account_id, v_inventory_account_id
            FROM public.items
            WHERE id = v_item_id AND organization_id = p_org_id;
        END IF;

        IF v_expense_account_id IS NULL AND v_inventory_account_id IS NULL THEN
            IF v_line->>'expense_account_id' IS NOT NULL AND trim(v_line->>'expense_account_id') <> '' THEN
                v_expense_account_id := (v_line->>'expense_account_id')::uuid;
            ELSIF v_line->>'inventory_account_id' IS NOT NULL AND trim(v_line->>'inventory_account_id') <> '' THEN
                v_inventory_account_id := (v_line->>'inventory_account_id')::uuid;
            END IF;
        END IF;

        IF v_expense_account_id IS NULL AND v_inventory_account_id IS NULL THEN
            SELECT default_cogs_account_id INTO v_expense_account_id
            FROM public.accounting_settings
            WHERE organization_id = p_org_id;
        END IF;

        IF v_expense_account_id IS NULL AND v_inventory_account_id IS NULL THEN
            RAISE EXCEPTION 'تعذر تحديد حساب المصروف أو المخزون للبند في السطر %.', v_line_number;
        END IF;

        v_tax_account_id := v_default_tax_input_account_id;

        IF v_prices_include_tax THEN
            v_gross_inclusive := round(v_quantity * v_entered_unit_cost, 2);
            IF v_discount_amount > v_gross_inclusive THEN
                RAISE EXCEPTION 'الخصم لا يمكن أن يتجاوز إجمالي السطر الشامل للضريبة في السطر %.', v_line_number;
            END IF;

            v_net_inclusive := v_gross_inclusive - v_discount_amount;
            v_tax_amount := round(v_net_inclusive - (v_net_inclusive / (1.00 + (v_tax_rate / 100.00))), 2);
            v_net_before_tax := round(v_net_inclusive - v_tax_amount, 2);
            v_gross_before_tax := round(v_gross_inclusive / (1.00 + (v_tax_rate / 100.00)), 2);
            v_discount_before_tax := round(v_gross_before_tax - v_net_before_tax, 2);
            v_unit_cost_before_tax := round(v_entered_unit_cost / (1.00 + (v_tax_rate / 100.00)), 4);
            v_line_total := v_net_inclusive;
        ELSE
            v_unit_cost_before_tax := v_entered_unit_cost;
            v_gross_before_tax := round(v_quantity * v_unit_cost_before_tax, 2);
            v_discount_before_tax := v_discount_amount;

            IF v_discount_before_tax > v_gross_before_tax THEN
                RAISE EXCEPTION 'الخصم لا يمكن أن يتجاوز إجمالي السطر قبل الضريبة في السطر %.', v_line_number;
            END IF;

            v_net_before_tax := v_gross_before_tax - v_discount_before_tax;
            v_tax_amount := round(v_net_before_tax * (v_tax_rate / 100.00), 2);
            v_line_total := round(v_net_before_tax + v_tax_amount, 2);
        END IF;

        INSERT INTO public.purchase_bill_lines (
            purchase_bill_id, organization_id, item_id, line_number,
            description, quantity, unit_cost, entered_unit_cost, discount_amount, tax_rate,
            tax_amount, line_total, expense_account_id, inventory_account_id, tax_account_id
        ) VALUES (
            p_bill_id, p_org_id, v_item_id, v_line_number,
            v_description, v_quantity, v_unit_cost_before_tax, v_entered_unit_cost,
            v_discount_before_tax, v_tax_rate, v_tax_amount, v_line_total,
            v_expense_account_id, v_inventory_account_id, v_tax_account_id
        );

        v_subtotal := v_subtotal + v_gross_before_tax;
        v_discount_total := v_discount_total + v_discount_before_tax;
        v_tax_total := v_tax_total + v_tax_amount;
        v_total := v_total + v_line_total;

        v_line_number := v_line_number + 1;
    END LOOP;

    -- Update Header
    UPDATE public.purchase_bills SET
        vendor_id = p_vendor_id,
        vendor_invoice_number = trim(p_vendor_invoice_number),
        bill_date = p_bill_date,
        due_date = p_due_date,
        notes = trim(p_notes),
        prices_include_tax = v_prices_include_tax,
        payment_method = v_pay_method,
        payment_reference = trim(p_payment_reference),
        payment_notes = trim(p_payment_notes),
        payment_details = COALESCE(p_payment_details, '{}'::jsonb),
        subtotal = v_subtotal,
        discount_total = v_discount_total,
        tax_total = v_tax_total,
        total = v_total,
        balance_due = v_total - paid_amount,
        updated_at = now()
    WHERE id = p_bill_id AND organization_id = p_org_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        p_org_id, auth.uid(), 'update_purchase_bill',
        jsonb_build_object(
            'purchase_bill_id', p_bill_id,
            'total', v_total,
            'payment_method', v_pay_method
        )
    );
END;
$$;


-- 10. RPC: create_sales_quotation
CREATE OR REPLACE FUNCTION public.create_sales_quotation(
    p_org_id uuid,
    p_customer_id uuid,
    p_quotation_date date,
    p_valid_until date,
    p_notes text,
    p_terms_and_conditions text,
    p_lines jsonb,
    p_prices_include_tax boolean DEFAULT false,
    p_payment_method text DEFAULT 'credit',
    p_payment_reference text DEFAULT NULL,
    p_payment_notes text DEFAULT NULL,
    p_payment_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_quotation_id uuid;
    v_line jsonb;
    v_line_number integer := 1;
    v_item_id uuid;
    v_description text;
    v_quantity numeric(15,4);
    v_unit_price numeric(15,4);
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
    
    v_subtotal numeric(15,2) := 0.00;
    v_discount_total numeric(15,2) := 0.00;
    v_tax_total numeric(15,2) := 0.00;
    v_total numeric(15,2) := 0.00;
    v_org_currency text;
    v_quotation_number text;
    v_seq integer;
    v_prices_include_tax boolean;
    v_pay_method text;
BEGIN
    v_prices_include_tax := COALESCE(p_prices_include_tax, false);
    v_pay_method := COALESCE(p_payment_method, 'credit');

    IF v_pay_method NOT IN ('cash', 'credit', 'card', 'cheque', 'bank_transfer', 'cash_and_card', 'bank_transfer_and_cash') THEN
        RAISE EXCEPTION 'طريقة السداد غير صالحة: %', v_pay_method;
    END IF;

    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية للوصول إلى عروض الأسعار في هذه المنشأة.';
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
        RAISE EXCEPTION 'عرض السعر يجب أن يحتوي على بند واحد على الأقل.';
    END IF;

    -- Advisory lock for sequential numbering
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':sales_quotation:' || to_char(p_quotation_date, 'YYYY'))
    );

    -- Generate Quotation Number
    SELECT COALESCE(MAX(
        CASE 
            WHEN quotation_number ~ '^QUO-[0-9]+$' THEN substring(quotation_number from 5)::integer
            ELSE 0
        END
    ), 0) + 1 INTO v_seq
    FROM public.sales_quotations
    WHERE organization_id = p_org_id;

    v_quotation_number := 'QUO-' || lpad(v_seq::text, 5, '0');

    -- Insert Header
    INSERT INTO public.sales_quotations (
        organization_id, customer_id, quotation_number, quotation_date, valid_until, 
        status, prices_include_tax, payment_method, payment_reference, payment_notes,
        payment_details, subtotal, discount_total, tax_total, total, currency,
        notes, terms_and_conditions, created_by
    ) VALUES (
        p_org_id, p_customer_id, v_quotation_number, p_quotation_date, p_valid_until, 
        'draft', v_prices_include_tax, v_pay_method, trim(p_payment_reference), trim(p_payment_notes),
        COALESCE(p_payment_details, '{}'::jsonb), 0, 0, 0, 0, v_org_currency,
        trim(p_notes), trim(p_terms_and_conditions), auth.uid()
    ) RETURNING id INTO v_quotation_id;

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
            v_tax_rate := 15.00;
        END IF;

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر في السطر %.', v_line_number;
        END IF;

        IF v_entered_unit_price < 0 THEN
            RAISE EXCEPTION 'سعر الوحدة لا يمكن أن يكون سالباً في السطر %.', v_line_number;
        END IF;

        IF v_discount_amount < 0 THEN
            RAISE EXCEPTION 'الخصم لا يمكن أن يكون سالباً في السطر %.', v_line_number;
        END IF;

        IF v_tax_rate < 0 THEN
            RAISE EXCEPTION 'نسبة الضريبة لا يمكن أن تكون سالبة في السطر %.', v_line_number;
        END IF;

        IF v_prices_include_tax THEN
            v_gross_inclusive := round(v_quantity * v_entered_unit_price, 2);
            IF v_discount_amount > v_gross_inclusive THEN
                RAISE EXCEPTION 'الخصم لا يمكن أن يتجاوز إجمالي السطر الشامل للضريبة في السطر %.', v_line_number;
            END IF;

            v_net_inclusive := v_gross_inclusive - v_discount_amount;
            v_tax_amount := round(v_net_inclusive - (v_net_inclusive / (1.00 + (v_tax_rate / 100.00))), 2);
            v_net_before_tax := round(v_net_inclusive - v_tax_amount, 2);
            v_gross_before_tax := round(v_gross_inclusive / (1.00 + (v_tax_rate / 100.00)), 2);
            v_discount_before_tax := round(v_gross_before_tax - v_net_before_tax, 2);
            v_unit_price_before_tax := round(v_entered_unit_price / (1.00 + (v_tax_rate / 100.00)), 4);
            v_line_total := v_net_inclusive;
        ELSE
            v_unit_price_before_tax := v_entered_unit_price;
            v_gross_before_tax := round(v_quantity * v_unit_price_before_tax, 2);
            v_discount_before_tax := v_discount_amount;

            IF v_discount_before_tax > v_gross_before_tax THEN
                RAISE EXCEPTION 'الخصم لا يمكن أن يتجاوز إجمالي السطر قبل الضريبة في السطر %.', v_line_number;
            END IF;

            v_net_before_tax := v_gross_before_tax - v_discount_before_tax;
            v_tax_amount := round(v_net_before_tax * (v_tax_rate / 100.00), 2);
            v_line_total := round(v_net_before_tax + v_tax_amount, 2);
        END IF;

        INSERT INTO public.sales_quotation_lines (
            sales_quotation_id, organization_id, item_id, line_number,
            description, quantity, unit_price, entered_unit_price, discount_amount, tax_rate,
            tax_amount, line_total
        ) VALUES (
            v_quotation_id, p_org_id, v_item_id, v_line_number,
            v_description, v_quantity, v_unit_price_before_tax, v_entered_unit_price,
            v_discount_before_tax, v_tax_rate, v_tax_amount, v_line_total
        );

        v_subtotal := v_subtotal + v_gross_before_tax;
        v_discount_total := v_discount_total + v_discount_before_tax;
        v_tax_total := v_tax_total + v_tax_amount;
        v_total := v_total + v_line_total;

        v_line_number := v_line_number + 1;
    END LOOP;

    -- Update Quotation Header Totals
    UPDATE public.sales_quotations SET
        subtotal = v_subtotal,
        discount_total = v_discount_total,
        tax_total = v_tax_total,
        total = v_total
    WHERE id = v_quotation_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        p_org_id, auth.uid(), 'create_sales_quotation',
        jsonb_build_object(
            'sales_quotation_id', v_quotation_id,
            'quotation_number', v_quotation_number,
            'total', v_total
        )
    );

    RETURN v_quotation_id;
END;
$$;


-- 11. RPC: update_sales_quotation
CREATE OR REPLACE FUNCTION public.update_sales_quotation(
    p_org_id uuid,
    p_quotation_id uuid,
    p_customer_id uuid,
    p_quotation_date date,
    p_valid_until date,
    p_notes text,
    p_terms_and_conditions text,
    p_lines jsonb,
    p_prices_include_tax boolean DEFAULT false,
    p_payment_method text DEFAULT 'credit',
    p_payment_reference text DEFAULT NULL,
    p_payment_notes text DEFAULT NULL,
    p_payment_details jsonb DEFAULT '{}'::jsonb
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
    v_quantity numeric(15,4);
    v_unit_price numeric(15,4);
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
    
    v_subtotal numeric(15,2) := 0.00;
    v_discount_total numeric(15,2) := 0.00;
    v_tax_total numeric(15,2) := 0.00;
    v_total numeric(15,2) := 0.00;
    v_prices_include_tax boolean;
    v_pay_method text;
BEGIN
    v_prices_include_tax := COALESCE(p_prices_include_tax, false);
    v_pay_method := COALESCE(p_payment_method, 'credit');

    IF v_pay_method NOT IN ('cash', 'credit', 'card', 'cheque', 'bank_transfer', 'cash_and_card', 'bank_transfer_and_cash') THEN
        RAISE EXCEPTION 'طريقة السداد غير صالحة: %', v_pay_method;
    END IF;

    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لتعديل عرض السعر في هذه المنشأة.';
    END IF;

    SELECT status INTO v_status
    FROM public.sales_quotations
    WHERE id = p_quotation_id AND organization_id = p_org_id AND deleted_at IS NULL;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'عرض السعر غير موجود أو تم حذفه.';
    END IF;

    IF v_status IN ('converted', 'cancelled') THEN
        RAISE EXCEPTION 'لا يمكن تعديل عرض سعر محول إلى فاتورة أو ملغى.';
    END IF;

    -- Verify customer belongs to organization
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'العميل المحدد غير موجود أو غير نشط في هذه المنشأة.';
    END IF;

    -- Verify lines is an array and not empty
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'عرض السعر يجب أن يحتوي على بند واحد على الأقل.';
    END IF;

    -- Delete old lines
    DELETE FROM public.sales_quotation_lines WHERE sales_quotation_id = p_quotation_id;

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
            v_tax_rate := 15.00;
        END IF;

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر في السطر %.', v_line_number;
        END IF;

        IF v_entered_unit_price < 0 THEN
            RAISE EXCEPTION 'سعر الوحدة لا يمكن أن يكون سالباً في السطر %.', v_line_number;
        END IF;

        IF v_discount_amount < 0 THEN
            RAISE EXCEPTION 'الخصم لا يمكن أن يكون سالباً في السطر %.', v_line_number;
        END IF;

        IF v_tax_rate < 0 THEN
            RAISE EXCEPTION 'نسبة الضريبة لا يمكن أن تكون سالبة في السطر %.', v_line_number;
        END IF;

        IF v_prices_include_tax THEN
            v_gross_inclusive := round(v_quantity * v_entered_unit_price, 2);
            IF v_discount_amount > v_gross_inclusive THEN
                RAISE EXCEPTION 'الخصم لا يمكن أن يتجاوز إجمالي السطر الشامل للضريبة في السطر %.', v_line_number;
            END IF;

            v_net_inclusive := v_gross_inclusive - v_discount_amount;
            v_tax_amount := round(v_net_inclusive - (v_net_inclusive / (1.00 + (v_tax_rate / 100.00))), 2);
            v_net_before_tax := round(v_net_inclusive - v_tax_amount, 2);
            v_gross_before_tax := round(v_gross_inclusive / (1.00 + (v_tax_rate / 100.00)), 2);
            v_discount_before_tax := round(v_gross_before_tax - v_net_before_tax, 2);
            v_unit_price_before_tax := round(v_entered_unit_price / (1.00 + (v_tax_rate / 100.00)), 4);
            v_line_total := v_net_inclusive;
        ELSE
            v_unit_price_before_tax := v_entered_unit_price;
            v_gross_before_tax := round(v_quantity * v_unit_price_before_tax, 2);
            v_discount_before_tax := v_discount_amount;

            IF v_discount_before_tax > v_gross_before_tax THEN
                RAISE EXCEPTION 'الخصم لا يمكن أن يتجاوز إجمالي السطر قبل الضريبة في السطر %.', v_line_number;
            END IF;

            v_net_before_tax := v_gross_before_tax - v_discount_before_tax;
            v_tax_amount := round(v_net_before_tax * (v_tax_rate / 100.00), 2);
            v_line_total := round(v_net_before_tax + v_tax_amount, 2);
        END IF;

        INSERT INTO public.sales_quotation_lines (
            sales_quotation_id, organization_id, item_id, line_number,
            description, quantity, unit_price, entered_unit_price, discount_amount, tax_rate,
            tax_amount, line_total
        ) VALUES (
            p_quotation_id, p_org_id, v_item_id, v_line_number,
            v_description, v_quantity, v_unit_price_before_tax, v_entered_unit_price,
            v_discount_before_tax, v_tax_rate, v_tax_amount, v_line_total
        );

        v_subtotal := v_subtotal + v_gross_before_tax;
        v_discount_total := v_discount_total + v_discount_before_tax;
        v_tax_total := v_tax_total + v_tax_amount;
        v_total := v_total + v_line_total;

        v_line_number := v_line_number + 1;
    END LOOP;

    -- Update Header
    UPDATE public.sales_quotations SET
        customer_id = p_customer_id,
        quotation_date = p_quotation_date,
        valid_until = p_valid_until,
        notes = trim(p_notes),
        terms_and_conditions = trim(p_terms_and_conditions),
        prices_include_tax = v_prices_include_tax,
        payment_method = v_pay_method,
        payment_reference = trim(p_payment_reference),
        payment_notes = trim(p_payment_notes),
        payment_details = COALESCE(p_payment_details, '{}'::jsonb),
        subtotal = v_subtotal,
        discount_total = v_discount_total,
        tax_total = v_tax_total,
        total = v_total,
        updated_at = now()
    WHERE id = p_quotation_id AND organization_id = p_org_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        p_org_id, auth.uid(), 'update_sales_quotation',
        jsonb_build_object(
            'sales_quotation_id', p_quotation_id,
            'total', v_total
        )
    );
END;
$$;


-- 12. RPC: convert_quotation_to_invoice
CREATE OR REPLACE FUNCTION public.convert_quotation_to_invoice(
    p_org_id uuid,
    p_quotation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_quo record;
    v_lines_json jsonb := '[]'::jsonb;
    v_line record;
    v_invoice_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_manage_sales_drafts(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لإنشاء فواتير المبيعات في هذه المنشأة.';
    END IF;

    -- Get quotation details
    SELECT * INTO v_quo
    FROM public.sales_quotations
    WHERE id = p_quotation_id AND organization_id = p_org_id AND deleted_at IS NULL;

    IF v_quo IS NULL THEN
        RAISE EXCEPTION 'عرض السعر غير موجود أو تم حذفه.';
    END IF;

    IF v_quo.status = 'converted' OR v_quo.converted_invoice_id IS NOT NULL THEN
        RAISE EXCEPTION 'عرض السعر تم تحويله بالفعل إلى فاتورة مبيعات رقم %.',
            (SELECT invoice_number FROM public.sales_invoices WHERE id = v_quo.converted_invoice_id);
    END IF;

    IF v_quo.status = 'cancelled' THEN
        RAISE EXCEPTION 'لا يمكن تحويل عرض سعر ملغى.';
    END IF;

    -- Build lines JSON from quotation lines
    FOR v_line IN 
        SELECT item_id, description, quantity, entered_unit_price, unit_price, discount_amount, tax_rate, revenue_account_id
        FROM public.sales_quotation_lines
        WHERE sales_quotation_id = p_quotation_id
        ORDER BY line_number ASC
    LOOP
        v_lines_json := v_lines_json || jsonb_build_object(
            'item_id', v_line.item_id,
            'description', v_line.description,
            'quantity', v_line.quantity,
            'unit_price', COALESCE(v_line.entered_unit_price, v_line.unit_price),
            'discount_amount', v_line.discount_amount,
            'tax_rate', v_line.tax_rate,
            'revenue_account_id', v_line.revenue_account_id
        );
    END LOOP;

    -- Create draft sales invoice
    v_invoice_id := public.create_sales_invoice(
        p_org_id,
        v_quo.customer_id,
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '30 days',
        'محولة من عرض السعر رقم: ' || v_quo.quotation_number || COALESCE(E'\n' || v_quo.notes, ''),
        v_lines_json,
        v_quo.prices_include_tax,
        v_quo.payment_method,
        v_quo.payment_reference,
        v_quo.payment_notes,
        v_quo.payment_details
    );

    -- Link sales invoice back to quotation
    UPDATE public.sales_invoices
    SET source_quotation_id = p_quotation_id
    WHERE id = v_invoice_id AND organization_id = p_org_id;

    -- Mark quotation as converted
    UPDATE public.sales_quotations
    SET status = 'converted',
        converted_invoice_id = v_invoice_id,
        updated_at = now()
    WHERE id = p_quotation_id AND organization_id = p_org_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id, profile_id, action, details
    ) VALUES (
        p_org_id, auth.uid(), 'convert_quotation_to_invoice',
        jsonb_build_object(
            'quotation_id', p_quotation_id,
            'invoice_id', v_invoice_id
        )
    );

    RETURN v_invoice_id;
END;
$$;


-- 13. Grants & Revokes
REVOKE ALL ON FUNCTION public.create_sales_invoice(uuid, uuid, date, date, text, jsonb, boolean, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_invoice(uuid, uuid, date, date, text, jsonb, boolean, text, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.update_sales_invoice(uuid, uuid, uuid, date, date, text, jsonb, boolean, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_sales_invoice(uuid, uuid, uuid, date, date, text, jsonb, boolean, text, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.create_purchase_bill(uuid, uuid, text, date, date, text, jsonb, boolean, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_bill(uuid, uuid, text, date, date, text, jsonb, boolean, text, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.update_purchase_bill(uuid, uuid, uuid, text, date, date, text, jsonb, boolean, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_purchase_bill(uuid, uuid, uuid, text, date, date, text, jsonb, boolean, text, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.create_sales_quotation(uuid, uuid, date, date, text, text, jsonb, boolean, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_quotation(uuid, uuid, date, date, text, text, jsonb, boolean, text, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.update_sales_quotation(uuid, uuid, uuid, date, date, text, text, jsonb, boolean, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_sales_quotation(uuid, uuid, uuid, date, date, text, text, jsonb, boolean, text, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.convert_quotation_to_invoice(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_invoice(uuid, uuid) TO authenticated;

COMMIT;
