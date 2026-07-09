-- Migration: 20260707000000_bank_cash_accounts_integration.sql
-- Goal: BCM-1B — Link Receipts & Payments to Cash/Bank Accounts

BEGIN;

-- 1. Modify receipts and payments tables to add cash_bank_account_id column
ALTER TABLE public.receipts 
ADD COLUMN IF NOT EXISTS cash_bank_account_id uuid REFERENCES public.cash_bank_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS cash_bank_account_id uuid REFERENCES public.cash_bank_accounts(id) ON DELETE SET NULL;

-- 2. Add performance indexes for organization_id, cash_bank_account_id
CREATE INDEX IF NOT EXISTS receipts_cash_bank_account_idx ON public.receipts (organization_id, cash_bank_account_id);
CREATE INDEX IF NOT EXISTS payments_cash_bank_account_idx ON public.payments (organization_id, cash_bank_account_id);

-- 3. Create Trigger Function to validate cash_bank_account_id
CREATE OR REPLACE FUNCTION public.validate_receipt_payment_cash_bank_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_acc_org_id uuid;
    v_acc_is_active boolean;
    v_acc_currency text;
    v_org_currency text;
    v_role text;
BEGIN
    IF NEW.cash_bank_account_id IS NOT NULL THEN
        -- Get account details
        SELECT organization_id, is_active, currency_code 
        INTO v_acc_org_id, v_acc_is_active, v_acc_currency
        FROM public.cash_bank_accounts
        WHERE id = NEW.cash_bank_account_id;

        IF v_acc_org_id IS NULL THEN
            RAISE EXCEPTION 'حساب الصندوق/البنك المحدد غير موجود.';
        END IF;

        -- Must belong to the same organization
        IF v_acc_org_id <> NEW.organization_id THEN
            RAISE EXCEPTION 'حساب الصندوق/البنك المحدد لا ينتمي لهذه المنشأة.';
        END IF;

        -- Must be active
        IF NOT v_acc_is_active THEN
            RAISE EXCEPTION 'حساب الصندوق/البنك المحدد غير نشط.';
        END IF;

        -- Must match organization currency
        SELECT currency_code INTO v_org_currency
        FROM public.organizations
        WHERE id = NEW.organization_id;

        IF v_acc_currency <> v_org_currency THEN
            RAISE EXCEPTION 'عملة حساب الصندوق/البنك لا تطابق عملة المنشأة.';
        END IF;

        -- Ensure user role is not 'sales'
        IF auth.uid() IS NOT NULL THEN
            SELECT role INTO v_role
            FROM public.organization_members
            WHERE organization_id = NEW.organization_id
              AND profile_id = auth.uid()
              AND COALESCE(is_active, true) = true;

            IF v_role = 'sales' THEN
                RAISE EXCEPTION 'غير مصرح لمندوب المبيعات (Sales) باستخدام حسابات الصناديق والبنوك.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Bind triggers
DROP TRIGGER IF EXISTS trg_validate_receipt_cash_bank ON public.receipts;
CREATE TRIGGER trg_validate_receipt_cash_bank
BEFORE INSERT OR UPDATE ON public.receipts
FOR EACH ROW
EXECUTE FUNCTION public.validate_receipt_payment_cash_bank_account();

DROP TRIGGER IF EXISTS trg_validate_payment_cash_bank ON public.payments;
CREATE TRIGGER trg_validate_payment_cash_bank
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.validate_receipt_payment_cash_bank_account();

-- 4. Update Receipts RPC Workflow (create, update, approve, cancel)

-- F. create_receipt
DROP FUNCTION IF EXISTS public.create_receipt(uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.create_receipt(
    p_org_id uuid,
    p_customer_id uuid,
    p_receipt_date date,
    p_amount numeric(15,2),
    p_payment_method text,
    p_cash_account_id uuid,
    p_bank_account_id uuid,
    p_reference text,
    p_notes text,
    p_allocations jsonb,
    p_cash_bank_account_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_receipt_id uuid;
    v_alloc jsonb;
    v_allocated_sum numeric(15,2) := 0.00;
    v_invoice_id uuid;
    v_alloc_amt numeric(15,2);
    v_balance_due numeric(15,2);
    v_customer_check uuid;
    
    v_cba_type text;
    v_cba_account_id uuid;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إدارة سندات القبض متاحة فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Amount check
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'مبلغ السند يجب أن يكون أكبر من الصفر.';
    END IF;

    -- Customer check
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'العميل المحدد غير موجود أو غير نشط.';
    END IF;

    -- Revalidation: check that allocations is an array and not empty
    IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
        RAISE EXCEPTION 'يجب تخصيص سند القبض على فاتورة معتمدة واحدة على الأقل في هذه المرحلة.';
    END IF;

    -- Override general ledger accounts if cash_bank_account_id is specified
    IF p_cash_bank_account_id IS NOT NULL THEN
        SELECT type, account_id INTO v_cba_type, v_cba_account_id
        FROM public.cash_bank_accounts
        WHERE id = p_cash_bank_account_id AND organization_id = p_org_id;

        IF v_cba_type IS NULL THEN
            RAISE EXCEPTION 'حساب الصندوق/البنك المحدد غير موجود.';
        END IF;

        IF v_cba_type = 'cash' THEN
            p_cash_account_id := v_cba_account_id;
            p_bank_account_id := NULL;
        ELSE
            p_bank_account_id := v_cba_account_id;
            p_cash_account_id := NULL;
        END IF;
    END IF;

    -- Method specific validations
    IF p_payment_method = 'cash' THEN
        IF p_cash_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى اختيار حساب الصندوق/الخزينة لطريقة الدفع النقدي.';
        END IF;
        PERFORM public.validate_master_data_account(p_cash_account_id, p_org_id, 'assets', 'حساب الصندوق/الخزينة');
    ELSIF p_payment_method IN ('bank_transfer', 'card') THEN
        IF p_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى اختيار حساب البنك لطرق الدفع البنكية.';
        END IF;
        PERFORM public.validate_master_data_account(p_bank_account_id, p_org_id, 'assets', 'حساب البنك');
    END IF;

    -- Protect sequential numbering from concurrency race conditions
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':receipt:' || to_char(p_receipt_date, 'YYYY'))
    );

    -- Create Receipt Header
    INSERT INTO public.receipts (
        organization_id, customer_id, receipt_number, receipt_date, amount,
        payment_method, cash_account_id, bank_account_id, reference, notes,
        status, created_by, cash_bank_account_id
    ) VALUES (
        p_org_id, p_customer_id, '', p_receipt_date, p_amount,
        p_payment_method, p_cash_account_id, p_bank_account_id, trim(p_reference), trim(p_notes),
        'draft', auth.uid(), p_cash_bank_account_id
    ) RETURNING id INTO v_receipt_id;

    -- Handle Allocations
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        -- Safe extraction and validation of JSON properties
        IF v_alloc->>'sales_invoice_id' IS NULL OR trim(v_alloc->>'sales_invoice_id') = '' THEN
            RAISE EXCEPTION 'رقم الفاتورة (sales_invoice_id) مطلوب في التخصيص.';
        END IF;

        IF v_alloc->>'allocated_amount' IS NULL OR trim(v_alloc->>'allocated_amount') = '' THEN
            RAISE EXCEPTION 'القيمة المخصصة (allocated_amount) مطلوبة في التخصيص.';
        END IF;

        v_invoice_id := (v_alloc->>'sales_invoice_id')::uuid;
        v_alloc_amt := (v_alloc->>'allocated_amount')::numeric;

        IF v_alloc_amt <= 0 THEN
            RAISE EXCEPTION 'المبلغ المخصص في التوزيع يجب أن يكون أكبر من الصفر.';
        END IF;

        -- Verify invoice belongs to same customer/org and is approved
        SELECT customer_id, balance_due INTO v_customer_check, v_balance_due
        FROM public.sales_invoices
        WHERE id = v_invoice_id AND organization_id = p_org_id AND status = 'approved';

        IF v_customer_check IS NULL THEN
            RAISE EXCEPTION 'إحدى الفواتير المختارة للتخصيص غير موجودة أو ليست في حالة معتمد (approved).';
        END IF;

        IF v_customer_check <> p_customer_id THEN
            RAISE EXCEPTION 'لا يمكن تخصيص سند قبض لعميل آخر غير العميل المحدد في الفاتورة.';
        END IF;

        IF v_alloc_amt > v_balance_due THEN
            RAISE EXCEPTION
                'المبلغ المخصص (%) يتجاوز الرصيد المتبقي المستحق على الفاتورة (%).',
                v_alloc_amt,
                v_balance_due;
        END IF;

        v_allocated_sum := v_allocated_sum + v_alloc_amt;

        -- Insert allocation
        INSERT INTO public.receipt_allocations (
            organization_id, receipt_id, sales_invoice_id, allocated_amount
        ) VALUES (
            p_org_id, v_receipt_id, v_invoice_id, v_alloc_amt
        );
    END LOOP;

    IF v_allocated_sum > p_amount THEN
        RAISE EXCEPTION
            'مجموع المبالغ المخصصة للفواتير (%) يتجاوز القيمة الإجمالية لسند القبض (%).',
            v_allocated_sum,
            p_amount;
    END IF;

    -- Log action in Audit Logs
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'create_receipt',
        jsonb_build_object(
            'receipt_id', v_receipt_id,
            'customer_id', p_customer_id,
            'receipt_date', p_receipt_date,
            'amount', p_amount,
            'cash_bank_account_id', p_cash_bank_account_id
        )
    );

    RETURN v_receipt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_receipt(uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb, uuid) TO authenticated;


-- G. update_receipt
DROP FUNCTION IF EXISTS public.update_receipt(uuid, uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.update_receipt(
    p_org_id uuid,
    p_receipt_id uuid,
    p_customer_id uuid,
    p_receipt_date date,
    p_amount numeric(15,2),
    p_payment_method text,
    p_cash_account_id uuid,
    p_bank_account_id uuid,
    p_reference text,
    p_notes text,
    p_allocations jsonb,
    p_cash_bank_account_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
    v_alloc jsonb;
    v_allocated_sum numeric(15,2) := 0.00;
    v_invoice_id uuid;
    v_alloc_amt numeric(15,2);
    v_balance_due numeric(15,2);
    v_customer_check uuid;
    
    v_cba_type text;
    v_cba_account_id uuid;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إدارة سندات القبض متاحة فقط للمالك، المدير، والمحاسب.';
    END IF;

    SELECT status INTO v_status FROM public.receipts WHERE id = p_receipt_id AND organization_id = p_org_id;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'سند القبض غير موجود.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن تعديل سند قبض معتمد أو ملغى.';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'مبلغ السند يجب أن يكون أكبر من الصفر.';
    END IF;

    -- Customer check
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'العميل المحدد غير موجود أو غير نشط.';
    END IF;

    -- Revalidation: check that allocations is an array and not empty
    IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
        RAISE EXCEPTION 'يجب تخصيص سند القبض على فاتورة معتمدة واحدة على الأقل في هذه المرحلة.';
    END IF;

    -- Override general ledger accounts if cash_bank_account_id is specified
    IF p_cash_bank_account_id IS NOT NULL THEN
        SELECT type, account_id INTO v_cba_type, v_cba_account_id
        FROM public.cash_bank_accounts
        WHERE id = p_cash_bank_account_id AND organization_id = p_org_id;

        IF v_cba_type IS NULL THEN
            RAISE EXCEPTION 'حساب الصندوق/البنك المحدد غير موجود.';
        END IF;

        IF v_cba_type = 'cash' THEN
            p_cash_account_id := v_cba_account_id;
            p_bank_account_id := NULL;
        ELSE
            p_bank_account_id := v_cba_account_id;
            p_cash_account_id := NULL;
        END IF;
    END IF;

    -- Method specific validations
    IF p_payment_method = 'cash' THEN
        IF p_cash_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى اختيار حساب الصندوق/الخزينة لطريقة الدفع النقدي.';
        END IF;
        PERFORM public.validate_master_data_account(p_cash_account_id, p_org_id, 'assets', 'حساب الصندوق/الخزينة');
    ELSIF p_payment_method IN ('bank_transfer', 'card') THEN
        IF p_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى اختيار حساب البنك لطرق الدفع البنكية.';
        END IF;
        PERFORM public.validate_master_data_account(p_bank_account_id, p_org_id, 'assets', 'حساب البنك');
    END IF;

    -- Reset previous allocations
    DELETE FROM public.receipt_allocations WHERE receipt_id = p_receipt_id;

    -- Handle Allocations
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        -- Safe extraction and validation of JSON properties
        IF v_alloc->>'sales_invoice_id' IS NULL OR trim(v_alloc->>'sales_invoice_id') = '' THEN
            RAISE EXCEPTION 'رقم الفاتورة (sales_invoice_id) مطلوب في التخصيص.';
        END IF;

        IF v_alloc->>'allocated_amount' IS NULL OR trim(v_alloc->>'allocated_amount') = '' THEN
            RAISE EXCEPTION 'القيمة المخصصة (allocated_amount) مطلوبة في التخصيص.';
        END IF;

        v_invoice_id := (v_alloc->>'sales_invoice_id')::uuid;
        v_alloc_amt := (v_alloc->>'allocated_amount')::numeric;

        IF v_alloc_amt <= 0 THEN
            RAISE EXCEPTION 'المبلغ المخصص في التوزيع يجب أن يكون أكبر من الصفر.';
        END IF;

        -- Verify invoice belongs to same customer/org and is approved
        SELECT customer_id, balance_due INTO v_customer_check, v_balance_due
        FROM public.sales_invoices
        WHERE id = v_invoice_id AND organization_id = p_org_id AND status = 'approved';

        IF v_customer_check IS NULL THEN
            RAISE EXCEPTION 'إحدى الفواتير المختارة للتخصيص غير موجودة أو ليست في حالة معتمد (approved).';
        END IF;

        IF v_customer_check <> p_customer_id THEN
            RAISE EXCEPTION 'لا يمكن تخصيص سند قبض لعميل آخر غير العميل المحدد في الفاتورة.';
        END IF;

        IF v_alloc_amt > v_balance_due THEN
            RAISE EXCEPTION
                'المبلغ المخصص (%) يتجاوز الرصيد المتبقي المستحق على الفاتورة (%).',
                v_alloc_amt,
                v_balance_due;
        END IF;

        v_allocated_sum := v_allocated_sum + v_alloc_amt;

        -- Insert allocation
        INSERT INTO public.receipt_allocations (
            organization_id, receipt_id, sales_invoice_id, allocated_amount
        ) VALUES (
            p_org_id, p_receipt_id, v_invoice_id, v_alloc_amt
        );
    END LOOP;

    IF v_allocated_sum > p_amount THEN
        RAISE EXCEPTION
            'مجموع المبالغ المخصصة للفواتير (%) يتجاوز القيمة الإجمالية لسند القبض (%).',
            v_allocated_sum,
            p_amount;
    END IF;

    -- Update Receipt Header
    UPDATE public.receipts SET
        customer_id = p_customer_id,
        receipt_date = p_receipt_date,
        amount = p_amount,
        payment_method = p_payment_method,
        cash_account_id = p_cash_account_id,
        bank_account_id = p_bank_account_id,
        reference = trim(p_reference),
        notes = trim(p_notes),
        cash_bank_account_id = p_cash_bank_account_id,
        updated_at = now()
    WHERE id = p_receipt_id;

    -- Log action in Audit Logs
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'update_receipt',
        jsonb_build_object(
            'receipt_id', p_receipt_id,
            'customer_id', p_customer_id,
            'receipt_date', p_receipt_date,
            'amount', p_amount,
            'cash_bank_account_id', p_cash_bank_account_id
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_receipt(uuid, uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb, uuid) TO authenticated;


-- I. approve_receipt
CREATE OR REPLACE FUNCTION public.approve_receipt(
    p_org_id uuid,
    p_receipt_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_receipt_number text;
    v_customer_id uuid;
    v_customer_name text;
    v_receivable_account_id uuid;
    v_receipt_date date;
    v_amount numeric(15,2);
    v_payment_method text;
    v_cash_account_id uuid;
    v_bank_account_id uuid;
    v_status text;
    v_reference text;
    v_cash_bank_account_id uuid;
    
    v_debit_account_id uuid;
    v_journal_lines jsonb := '[]'::jsonb;
    v_journal_entry_id uuid;
    v_desc text;
    
    v_alloc record;
    v_invoice_num text;
    v_invoice_total numeric(15,2);
    v_invoice_paid numeric(15,2);
    v_invoice_bal numeric(15,2);
    v_new_paid numeric(15,2);
    v_new_bal numeric(15,2);
    v_pay_status text;
    v_alloc_sum numeric(15,2) := 0.00;
BEGIN
    -- Auth & Privilege check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: اعتماد السندات متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Get Receipt Header details
    SELECT r.receipt_number, r.customer_id, r.receipt_date, r.amount, r.payment_method, 
           r.cash_account_id, r.bank_account_id, r.status, r.reference, c.name, c.receivable_account_id, r.cash_bank_account_id
    INTO v_receipt_number, v_customer_id, v_receipt_date, v_amount, v_payment_method, 
         v_cash_account_id, v_bank_account_id, v_status, v_reference, v_customer_name, v_receivable_account_id, v_cash_bank_account_id
    FROM public.receipts r
    JOIN public.customers c ON r.customer_id = c.id
    WHERE r.id = p_receipt_id AND r.organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'سند القبض غير موجود أو لا ينتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'السند معتمد بالفعل أو ملغى ولا يمكن اعتماده مجدداً.';
    END IF;

    -- Validate Debit account
    IF v_payment_method = 'cash' THEN
        v_debit_account_id := v_cash_account_id;
        IF v_debit_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى ربط حساب الصندوق/الخزينة النقدية بالسند.';
        END IF;
        PERFORM public.validate_master_data_account(v_debit_account_id, p_org_id, 'assets', 'حساب الخزينة/الصندوق');
    ELSE
        v_debit_account_id := v_bank_account_id;
        IF v_debit_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى ربط حساب البنك بالسند.';
        END IF;
        PERFORM public.validate_master_data_account(v_debit_account_id, p_org_id, 'assets', 'حساب البنك');
    END IF;

    -- Validate Receivable account
    IF v_receivable_account_id IS NULL THEN
        RAISE EXCEPTION 'العميل يفتقد لحساب الذمم المدينة المربوط.';
    END IF;
    PERFORM public.validate_master_data_account(v_receivable_account_id, p_org_id, 'assets', 'حساب ذمم العملاء');

    -- Build Description
    v_desc := 'قيد تلقائي لسند قبض رقم: ' || v_receipt_number || ' - العميل: ' || v_customer_name;
    IF v_reference IS NOT NULL AND v_reference <> '' THEN
        v_desc := v_desc || ' (مرجع: ' || v_reference || ')';
    END IF;

    -- Build Journal Entry lines JSON (Debit Bank/Cash, Credit Accounts Receivable)
    v_journal_lines := jsonb_build_array(
        jsonb_build_object(
            'account_id', v_debit_account_id,
            'description', v_desc || ' (استلام نقدية)',
            'debit', v_amount,
            'credit', 0.00
        ),
        jsonb_build_object(
            'account_id', v_receivable_account_id,
            'description', v_desc || ' (سداد العميل)',
            'debit', 0.00,
            'credit', v_amount
        )
    );

    -- Create and Post Journal entry
    v_journal_entry_id := public.create_journal_entry(
        p_org_id,
        v_receipt_date,
        v_receipt_number,
        v_desc,
        v_journal_lines
    );

    -- Update Entry source_type to system
    UPDATE public.journal_entries 
    SET source_type = 'system' 
    WHERE id = v_journal_entry_id;

    -- Post the entry
    PERFORM public.post_journal_entry(p_org_id, v_journal_entry_id);

    -- Process Allocations and update Invoice states
    FOR v_alloc IN 
        SELECT id, sales_invoice_id, allocated_amount 
        FROM public.receipt_allocations
        WHERE receipt_id = p_receipt_id AND organization_id = p_org_id
    LOOP
        -- Revalidate each invoice balance inside loop
        SELECT invoice_number, total, paid_amount, balance_due 
        INTO v_invoice_num, v_invoice_total, v_invoice_paid, v_invoice_bal
        FROM public.sales_invoices
        WHERE id = v_alloc.sales_invoice_id AND organization_id = p_org_id AND status = 'approved';

        IF v_invoice_num IS NULL THEN
            RAISE EXCEPTION 'إحدى الفواتير المخصصة غير صالحة أو غير معتمدة.';
        END IF;

        IF v_alloc.allocated_amount > v_invoice_bal THEN
            RAISE EXCEPTION
                'القيمة المخصصة للتحصيل (%) يتجاوز القيمة المستحقة المتبقية للفاتورة % (%).',
                v_alloc.allocated_amount,
                v_invoice_num,
                v_invoice_bal;
        END IF;

        v_alloc_sum := v_alloc_sum + v_alloc.allocated_amount;

        -- Calculations
        v_new_paid := v_invoice_paid + v_alloc.allocated_amount;
        v_new_bal := v_invoice_total - v_new_paid;

        IF v_new_bal <= 0 THEN
            v_pay_status := 'paid';
            v_new_bal := 0.00;
        ELSIF v_new_paid > 0 THEN
            v_pay_status := 'partially_paid';
        ELSE
            v_pay_status := 'unpaid';
        END IF;

        -- Update invoice totals and status
        UPDATE public.sales_invoices SET
            paid_amount = v_new_paid,
            balance_due = v_new_bal,
            payment_status = v_pay_status,
            updated_at = now()
        WHERE id = v_alloc.sales_invoice_id;
    END LOOP;

    IF v_alloc_sum > v_amount THEN
        RAISE EXCEPTION
            'مجموع التخصيصات الفعلي (%) تجاوز قيمة سند القبض (%).',
            v_alloc_sum,
            v_amount;
    END IF;

    -- Mark Receipt as Approved
    UPDATE public.receipts SET
        status = 'approved',
        journal_entry_id = v_journal_entry_id,
        approved_at = now(),
        approved_by = auth.uid(),
        updated_at = now()
    WHERE id = p_receipt_id;

    -- Update cash_bank_accounts balance if cash_bank_account_id is provided
    IF v_cash_bank_account_id IS NOT NULL THEN
        UPDATE public.cash_bank_accounts SET
            current_balance = current_balance + v_amount,
            updated_at = now()
        WHERE id = v_cash_bank_account_id AND organization_id = p_org_id;
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
        'approve_receipt',
        jsonb_build_object(
            'receipt_id', p_receipt_id,
            'journal_entry_id', v_journal_entry_id,
            'status_from', 'draft',
            'status_to', 'approved',
            'cash_bank_account_id', v_cash_bank_account_id,
            'amount', v_amount
        )
    );

    RETURN v_journal_entry_id;
END;
$$;


-- J. cancel_receipt
CREATE OR REPLACE FUNCTION public.cancel_receipt(
    p_org_id uuid,
    p_receipt_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
    v_journal_entry_id uuid;
    v_rev_entry_id uuid;
    v_alloc record;
    v_cash_bank_account_id uuid;
    v_amount numeric(15,2);
    
    v_invoice_total numeric(15,2);
    v_invoice_paid numeric(15,2);
    v_new_paid numeric(15,2);
    v_new_bal numeric(15,2);
    v_pay_status text;
BEGIN
    -- Auth & Privilege check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إلغاء السندات متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Lock org_id
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Get Receipt info
    SELECT status, journal_entry_id, cash_bank_account_id, amount
    INTO v_status, v_journal_entry_id, v_cash_bank_account_id, v_amount
    FROM public.receipts
    WHERE id = p_receipt_id AND organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'سند القبض غير موجود.';
    END IF;

    IF v_status <> 'approved' THEN
        RAISE EXCEPTION 'يمكن فقط إلغاء السندات المعتمدة (approved).';
    END IF;

    -- 1. Reverse allocation effects on invoices
    FOR v_alloc IN 
        SELECT sales_invoice_id, allocated_amount 
        FROM public.receipt_allocations
        WHERE receipt_id = p_receipt_id AND organization_id = p_org_id
    LOOP
        SELECT total, paid_amount INTO v_invoice_total, v_invoice_paid
        FROM public.sales_invoices
        WHERE id = v_alloc.sales_invoice_id AND organization_id = p_org_id;

        IF v_invoice_total IS NOT NULL THEN
            v_new_paid := v_invoice_paid - v_alloc.allocated_amount;
            IF v_new_paid < 0 THEN
                v_new_paid := 0.00;
            END IF;
            
            v_new_bal := v_invoice_total - v_new_paid;

            IF v_new_bal <= 0 THEN
                v_pay_status := 'paid';
            ELSIF v_new_paid > 0 THEN
                v_pay_status := 'partially_paid';
            ELSE
                v_pay_status := 'unpaid';
            END IF;

            UPDATE public.sales_invoices SET
                paid_amount = v_new_paid,
                balance_due = v_new_bal,
                payment_status = v_pay_status,
                updated_at = now()
            WHERE id = v_alloc.sales_invoice_id;
        END IF;
    END LOOP;

    -- 2. Reverse journal entry
    IF v_journal_entry_id IS NOT NULL THEN
        v_rev_entry_id := public.reverse_journal_entry(p_org_id, v_journal_entry_id);
    END IF;

    -- 3. Update receipt status to cancelled
    UPDATE public.receipts SET
        status = 'cancelled',
        cancelled_journal_entry_id = v_rev_entry_id,
        cancelled_at = now(),
        cancelled_by = auth.uid(),
        updated_at = now()
    WHERE id = p_receipt_id;

    -- Reverse cash_bank_accounts balance if cash_bank_account_id is provided
    IF v_cash_bank_account_id IS NOT NULL THEN
        UPDATE public.cash_bank_accounts SET
            current_balance = current_balance - v_amount,
            updated_at = now()
        WHERE id = v_cash_bank_account_id AND organization_id = p_org_id;
    END IF;

    IF v_rev_entry_id IS NOT NULL THEN
        UPDATE public.journal_entries 
        SET source_type = 'system' 
        WHERE id = v_rev_entry_id;
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
        'cancel_receipt',
        jsonb_build_object(
            'receipt_id', p_receipt_id,
            'status_from', 'approved',
            'status_to', 'cancelled',
            'cancelled_journal_entry_id', v_rev_entry_id,
            'cash_bank_account_id', v_cash_bank_account_id,
            'amount', v_amount
        )
    );

    RETURN v_rev_entry_id;
END;
$$;


-- 5. Update Payments RPC Workflow (create, update, approve, cancel)

-- F. create_payment
DROP FUNCTION IF EXISTS public.create_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.create_payment(
    p_org_id uuid,
    p_vendor_id uuid,
    p_payment_date date,
    p_amount numeric(15,2),
    p_payment_method text,
    p_cash_account_id uuid,
    p_bank_account_id uuid,
    p_reference text,
    p_notes text,
    p_allocations jsonb,
    p_cash_bank_account_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_payment_id uuid;
    v_alloc jsonb;
    v_bill_id uuid;
    v_alloc_amt numeric(15,2);
    v_vendor_check uuid;
    v_balance_due numeric(15,2);
    v_allocated_sum numeric(15,2) := 0.00;
    
    v_cba_type text;
    v_cba_account_id uuid;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;
    
    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إدارة سندات الصرف متاحة للمالك والمدير والمحاسب فقط.';
    END IF;

    -- Vendor check
    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_vendor_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'المورد المحدد غير موجود أو غير نشط.';
    END IF;

    -- Amount check
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'المبلغ الإجمالي للسند يجب أن يكون أكبر من الصفر.';
    END IF;

    -- Allocations check
    IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
        RAISE EXCEPTION 'يجب تخصيص سند الصرف على فاتورة شراء معتمدة واحدة على الأقل في هذه المرحلة.';
    END IF;

    -- Override general ledger accounts if cash_bank_account_id is specified
    IF p_cash_bank_account_id IS NOT NULL THEN
        SELECT type, account_id INTO v_cba_type, v_cba_account_id
        FROM public.cash_bank_accounts
        WHERE id = p_cash_bank_account_id AND organization_id = p_org_id;

        IF v_cba_type IS NULL THEN
            RAISE EXCEPTION 'حساب الصندوق/البنك المحدد غير موجود.';
        END IF;

        IF v_cba_type = 'cash' THEN
            p_cash_account_id := v_cba_account_id;
            p_bank_account_id := NULL;
        ELSE
            p_bank_account_id := v_cba_account_id;
            p_cash_account_id := NULL;
        END IF;
    END IF;

    -- Method specific validations
    IF p_payment_method = 'cash' THEN
        IF p_cash_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى اختيار حساب الصندوق/الخزينة لطريقة الصرف النقدي.';
        END IF;
        PERFORM public.validate_master_data_account(p_cash_account_id, p_org_id, 'assets', 'حساب الصندوق/الخزينة');
    ELSIF p_payment_method IN ('bank_transfer', 'card') THEN
        IF p_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى اختيار حساب البنك لطرق الصرف البنكية.';
        END IF;
        PERFORM public.validate_master_data_account(p_bank_account_id, p_org_id, 'assets', 'حساب البنك');
    END IF;

    -- Protect sequential numbering
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':payment:' || to_char(p_payment_date, 'YYYY'))
    );

    -- Create Payment Header
    INSERT INTO public.payments (
        organization_id, vendor_id, payment_number, payment_date, amount,
        payment_method, cash_account_id, bank_account_id, reference, notes,
        status, created_by, cash_bank_account_id
    ) VALUES (
        p_org_id, p_vendor_id, '', p_payment_date, p_amount,
        p_payment_method, p_cash_account_id, p_bank_account_id, trim(p_reference), trim(p_notes),
        'draft', auth.uid(), p_cash_bank_account_id
    ) RETURNING id INTO v_payment_id;

    -- Handle Allocations
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        IF v_alloc->>'purchase_bill_id' IS NULL OR trim(v_alloc->>'purchase_bill_id') = '' THEN
            RAISE EXCEPTION 'رقم الفاتورة (purchase_bill_id) مطلوب في التخصيص.';
        END IF;

        IF v_alloc->>'allocated_amount' IS NULL OR trim(v_alloc->>'allocated_amount') = '' THEN
            RAISE EXCEPTION 'القيمة المخصصة (allocated_amount) مطلوبة في التخصيص.';
        END IF;

        v_bill_id := (v_alloc->>'purchase_bill_id')::uuid;
        v_alloc_amt := (v_alloc->>'allocated_amount')::numeric;

        IF v_alloc_amt <= 0 THEN
            RAISE EXCEPTION 'المبلغ المخصص في التوزيع يجب أن يكون أكبر من الصفر.';
        END IF;

        -- Verify bill belongs to same vendor/org and is approved
        SELECT vendor_id, balance_due INTO v_vendor_check, v_balance_due
        FROM public.purchase_bills
        WHERE id = v_bill_id AND organization_id = p_org_id AND status = 'approved';

        IF v_vendor_check IS NULL THEN
            RAISE EXCEPTION 'إحدى الفواتير المختارة للتخصيص غير موجودة أو ليست في حالة معتمد (approved).';
        END IF;

        IF v_vendor_check <> p_vendor_id THEN
            RAISE EXCEPTION 'لا يمكن تخصيص سند الصرف لمورد آخر غير المورد المحدد في الفاتورة.';
        END IF;

        IF v_alloc_amt > v_balance_due THEN
            RAISE EXCEPTION 'المبلغ المخصص (%) يتجاوز الرصيد المتبقي المستحق على الفاتورة (%).', v_alloc_amt, v_balance_due;
        END IF;

        v_allocated_sum := v_allocated_sum + v_alloc_amt;

        -- Insert allocation
        INSERT INTO public.payment_allocations (
            organization_id, payment_id, purchase_bill_id, allocated_amount
        ) VALUES (
            p_org_id, v_payment_id, v_bill_id, v_alloc_amt
        );
    END LOOP;

    -- Total allocated sum must equal payment amount check
    IF round(v_allocated_sum, 2) <> round(p_amount, 2) THEN
        RAISE EXCEPTION
          'يجب أن يساوي مجموع المبالغ المخصصة (%) القيمة الإجمالية لسند الصرف (%).',
          v_allocated_sum,
          p_amount;
    END IF;

    -- Log action
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'CREATE_PAYMENT', jsonb_build_object('payment_id', v_payment_id, 'amount', p_amount, 'cash_bank_account_id', p_cash_bank_account_id));

    RETURN v_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_payment(uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb, uuid) TO authenticated;


-- G. update_payment
DROP FUNCTION IF EXISTS public.update_payment(uuid, uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.update_payment(
    p_org_id uuid,
    p_payment_id uuid,
    p_vendor_id uuid,
    p_payment_date date,
    p_amount numeric(15,2),
    p_payment_method text,
    p_cash_account_id uuid,
    p_bank_account_id uuid,
    p_reference text,
    p_notes text,
    p_allocations jsonb,
    p_cash_bank_account_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
    v_alloc jsonb;
    v_bill_id uuid;
    v_alloc_amt numeric(15,2);
    v_vendor_check uuid;
    v_balance_due numeric(15,2);
    v_allocated_sum numeric(15,2) := 0.00;
    
    v_cba_type text;
    v_cba_account_id uuid;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;
    
    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: إدارة سندات الصرف متاحة للمالك والمدير والمحاسب فقط.';
    END IF;

    -- Get status and lock
    SELECT status INTO v_status
    FROM public.payments
    WHERE id = p_payment_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'سند الصرف غير موجود أو لا ينتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن تعديل سند صرف معتمد أو ملغى.';
    END IF;

    -- Vendor check
    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_vendor_id AND organization_id = p_org_id AND is_active = true) THEN
        RAISE EXCEPTION 'المورد المحدد غير موجود أو غير نشط.';
    END IF;

    -- Amount check
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'المبلغ الإجمالي للسند يجب أن يكون أكبر من الصفر.';
    END IF;

    -- Allocations check
    IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
        RAISE EXCEPTION 'يجب تخصيص سند الصرف على فاتورة شراء معتمدة واحدة على الأقل في هذه المرحلة.';
    END IF;

    -- Override general ledger accounts if cash_bank_account_id is specified
    IF p_cash_bank_account_id IS NOT NULL THEN
        SELECT type, account_id INTO v_cba_type, v_cba_account_id
        FROM public.cash_bank_accounts
        WHERE id = p_cash_bank_account_id AND organization_id = p_org_id;

        IF v_cba_type IS NULL THEN
            RAISE EXCEPTION 'حساب الصندوق/البنك المحدد غير موجود.';
        END IF;

        IF v_cba_type = 'cash' THEN
            p_cash_account_id := v_cba_account_id;
            p_bank_account_id := NULL;
        ELSE
            p_bank_account_id := v_cba_account_id;
            p_cash_account_id := NULL;
        END IF;
    END IF;

    -- Method specific validations
    IF p_payment_method = 'cash' THEN
        IF p_cash_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى اختيار حساب الصندوق/الخزينة لطريقة الصرف النقدي.';
        END IF;
        PERFORM public.validate_master_data_account(p_cash_account_id, p_org_id, 'assets', 'حساب الصندوق/الخزينة');
    ELSIF p_payment_method IN ('bank_transfer', 'card') THEN
        IF p_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'يرجى اختيار حساب البنك لطرق الصرف البنكية.';
        END IF;
        PERFORM public.validate_master_data_account(p_bank_account_id, p_org_id, 'assets', 'حساب البنك');
    END IF;

    -- Update Payment Header
    UPDATE public.payments SET
        vendor_id = p_vendor_id,
        payment_date = p_payment_date,
        amount = p_amount,
        payment_method = p_payment_method,
        cash_account_id = p_cash_account_id,
        bank_account_id = p_bank_account_id,
        reference = trim(p_reference),
        notes = trim(p_notes),
        cash_bank_account_id = p_cash_bank_account_id
    WHERE id = p_payment_id;

    -- Delete old allocations
    DELETE FROM public.payment_allocations WHERE payment_id = p_payment_id;

    -- Handle Allocations
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        IF v_alloc->>'purchase_bill_id' IS NULL OR trim(v_alloc->>'purchase_bill_id') = '' THEN
            RAISE EXCEPTION 'رقم الفاتورة (purchase_bill_id) مطلوب في التخصيص.';
        END IF;

        IF v_alloc->>'allocated_amount' IS NULL OR trim(v_alloc->>'allocated_amount') = '' THEN
            RAISE EXCEPTION 'القيمة المخصصة (allocated_amount) مطلوبة في التخصيص.';
        END IF;

        v_bill_id := (v_alloc->>'purchase_bill_id')::uuid;
        v_alloc_amt := (v_alloc->>'allocated_amount')::numeric;

        IF v_alloc_amt <= 0 THEN
            RAISE EXCEPTION 'المبلغ المخصص في التوزيع يجب أن يكون أكبر من الصفر.';
        END IF;

        -- Verify bill belongs to same vendor/org and is approved
        SELECT vendor_id, balance_due INTO v_vendor_check, v_balance_due
        FROM public.purchase_bills
        WHERE id = v_bill_id AND organization_id = p_org_id AND status = 'approved';

        IF v_vendor_check IS NULL THEN
            RAISE EXCEPTION 'إحدى الفواتير المختارة للتخصيص غير موجودة أو ليست في حالة معتمد (approved).';
        END IF;

        IF v_vendor_check <> p_vendor_id THEN
            RAISE EXCEPTION 'لا يمكن تخصيص سند الصرف لمورد آخر غير المورد المحدد في الفاتورة.';
        END IF;

        IF v_alloc_amt > v_balance_due THEN
            RAISE EXCEPTION 'المبلغ المخصص (%) يتجاوز الرصيد المتبقي المستحق على الفاتورة (%).', v_alloc_amt, v_balance_due;
        END IF;

        v_allocated_sum := v_allocated_sum + v_alloc_amt;

        -- Insert allocation
        INSERT INTO public.payment_allocations (
            organization_id, payment_id, purchase_bill_id, allocated_amount
        ) VALUES (
            p_org_id, p_payment_id, v_bill_id, v_alloc_amt
        );
    END LOOP;

    -- Total allocated sum must equal payment amount check
    IF round(v_allocated_sum, 2) <> round(p_amount, 2) THEN
        RAISE EXCEPTION
          'يجب أن يساوي مجموع المبالغ المخصصة (%) القيمة الإجمالية لسند الصرف (%).',
          v_allocated_sum,
          p_amount;
    END IF;

    -- Log action
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'UPDATE_PAYMENT', jsonb_build_object('payment_id', p_payment_id, 'amount', p_amount, 'cash_bank_account_id', p_cash_bank_account_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_payment(uuid, uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb, uuid) TO authenticated;


-- H. approve_payment
CREATE OR REPLACE FUNCTION public.approve_payment(
    p_org_id uuid,
    p_payment_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_payment_number text;
    v_vendor_id uuid;
    v_vendor_name text;
    v_payment_date date;
    v_amount numeric(15,2);
    v_payment_method text;
    v_cash_account_id uuid;
    v_bank_account_id uuid;
    v_status text;
    v_payable_account_id uuid;
    v_credit_account_id uuid;
    v_cash_bank_account_id uuid;
    
    v_journal_lines jsonb := '[]'::jsonb;
    v_journal_entry_id uuid;
    v_desc text;
    
    v_alloc record;
    v_alloc_sum numeric(15,2);
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;
    
    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: الاعتماد متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Get payment details
    SELECT p.payment_number, p.vendor_id, p.payment_date, p.amount, p.payment_method, 
           p.cash_account_id, p.bank_account_id, p.status, v.name, v.payable_account_id, p.cash_bank_account_id
    INTO v_payment_number, v_vendor_id, v_payment_date, v_amount, v_payment_method,
         v_cash_account_id, v_bank_account_id, v_status, v_vendor_name, v_payable_account_id, v_cash_bank_account_id
    FROM public.payments p
    JOIN public.vendors v ON p.vendor_id = v.id
    WHERE p.id = p_payment_id AND p.organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'سند الصرف غير موجود أو لا تنتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'السند معتمد بالفعل أو ملغى ولا يمكن اعتماده مجدداً.';
    END IF;

    -- Validate that total allocated sum matches the payment amount
    SELECT COALESCE(SUM(allocated_amount), 0)
    INTO v_alloc_sum
    FROM public.payment_allocations
    WHERE payment_id = p_payment_id
      AND organization_id = p_org_id;

    IF round(v_alloc_sum, 2) <> round(v_amount, 2) THEN
        RAISE EXCEPTION
          'لا يمكن اعتماد سند صرف لا تساوي تخصيصاته (%) قيمة السند (%).',
          v_alloc_sum,
          v_amount;
    END IF;

    IF v_payable_account_id IS NULL THEN
        RAISE EXCEPTION 'المورد يفتقد لحساب الذمم الدائنة المربوط.';
    END IF;

    -- Validate Payable account
    PERFORM public.validate_master_data_account(v_payable_account_id, p_org_id, 'liabilities', 'حساب ذمم الموردين');

    -- Determine Credit Account (Cash or Bank)
    IF v_payment_method = 'cash' THEN
        v_credit_account_id := v_cash_account_id;
        IF v_credit_account_id IS NULL THEN
            RAISE EXCEPTION 'حساب الصندوق غير محدد في السند.';
        END IF;
        PERFORM public.validate_master_data_account(v_credit_account_id, p_org_id, 'assets', 'حساب الخزينة/الصندوق');
    ELSE
        v_credit_account_id := v_bank_account_id;
        IF v_credit_account_id IS NULL THEN
            RAISE EXCEPTION 'حساب البنك غير محدد في السند.';
        END IF;
        PERFORM public.validate_master_data_account(v_credit_account_id, p_org_id, 'assets', 'حساب البنك');
    END IF;

    -- Build Description
    v_desc := 'قيد صرف تلقائي رقم: ' || v_payment_number || ' - المورد: ' || v_vendor_name;

    -- Double entry compilation
    -- 1. Debit: Vendor AP Account
    v_journal_lines := jsonb_build_array(
        jsonb_build_object(
            'account_id', v_payable_account_id,
            'description', v_desc,
            'debit', v_amount,
            'credit', 0.00
        )
    );

    -- 2. Credit: Cash or Bank Account
    v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_credit_account_id,
        'description', v_desc,
        'debit', 0.00,
        'credit', v_amount
    );

    -- Post double entry
    v_journal_entry_id := public.create_journal_entry(
        p_org_id,
        v_payment_date,
        v_payment_number,
        v_desc,
        v_journal_lines
    );

    UPDATE public.journal_entries
    SET source_type = 'system'
    WHERE id = v_journal_entry_id
      AND organization_id = p_org_id;

    PERFORM public.post_journal_entry(p_org_id, v_journal_entry_id);

    -- Update Allocations and Bills payment stats
    FOR v_alloc IN 
        SELECT id, purchase_bill_id, allocated_amount 
        FROM public.payment_allocations 
        WHERE payment_id = p_payment_id
          AND organization_id = p_org_id
    LOOP
        -- Lock bill for update
        PERFORM 1 
        FROM public.purchase_bills 
        WHERE id = v_alloc.purchase_bill_id AND organization_id = p_org_id
        FOR UPDATE;

        -- Process bill update
        UPDATE public.purchase_bills SET
            paid_amount = paid_amount + v_alloc.allocated_amount,
            balance_due = total - (paid_amount + v_alloc.allocated_amount),
            payment_status = CASE 
                WHEN (paid_amount + v_alloc.allocated_amount) >= total THEN 'paid'::text
                WHEN (paid_amount + v_alloc.allocated_amount) > 0 THEN 'partially_paid'::text
                ELSE 'unpaid'::text
            END
        WHERE id = v_alloc.purchase_bill_id AND organization_id = p_org_id;
    END LOOP;

    -- Update Payment Header status & journal_entry_id
    UPDATE public.payments SET
        status = 'approved',
        journal_entry_id = v_journal_entry_id,
        approved_at = now(),
        approved_by = auth.uid()
    WHERE id = p_payment_id AND organization_id = p_org_id;

    -- Update cash_bank_accounts balance if cash_bank_account_id is provided
    IF v_cash_bank_account_id IS NOT NULL THEN
        UPDATE public.cash_bank_accounts SET
            current_balance = current_balance - v_amount,
            updated_at = now()
        WHERE id = v_cash_bank_account_id AND organization_id = p_org_id;
    END IF;

    -- Log transaction
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'APPROVE_PAYMENT', jsonb_build_object('payment_id', p_payment_id, 'journal_entry_id', v_journal_entry_id, 'payment_number', v_payment_number, 'cash_bank_account_id', v_cash_bank_account_id, 'amount', v_amount));

    RETURN v_journal_entry_id;
END;
$$;


-- I. cancel_payment
CREATE OR REPLACE FUNCTION public.cancel_payment(
    p_org_id uuid,
    p_payment_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
    v_journal_entry_id uuid;
    v_payment_number text;
    v_rev_entry_id uuid := null;
    v_alloc record;
    v_cash_bank_account_id uuid;
    v_amount numeric(15,2);
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: الحظر والإلغاء متاح فقط للمالك، المدير، والمحاسب.';
    END IF;

    -- Advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Fetch payment details
    SELECT status, journal_entry_id, payment_number, cash_bank_account_id, amount
    INTO v_status, v_journal_entry_id, v_payment_number, v_cash_bank_account_id, v_amount
    FROM public.payments
    WHERE id = p_payment_id AND organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'سند الصرف غير موجود أو لا تنتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'approved' THEN
        RAISE EXCEPTION 'يمكن إلغاء السندات المعتمدة فقط.';
    END IF;

    -- Reverse Journal Entry
    IF v_journal_entry_id IS NOT NULL THEN
        v_rev_entry_id := public.reverse_journal_entry(p_org_id, v_journal_entry_id);
    END IF;

    -- Subtract Allocations from Bills
    FOR v_alloc IN 
        SELECT id, purchase_bill_id, allocated_amount 
        FROM public.payment_allocations 
        WHERE payment_id = p_payment_id
          AND organization_id = p_org_id
    LOOP
        UPDATE public.purchase_bills SET
            paid_amount = GREATEST(0.00, paid_amount - v_alloc.allocated_amount),
            balance_due = total - GREATEST(0.00, paid_amount - v_alloc.allocated_amount),
            payment_status = CASE 
                WHEN GREATEST(0.00, paid_amount - v_alloc.allocated_amount) >= total THEN 'paid'::text
                WHEN GREATEST(0.00, paid_amount - v_alloc.allocated_amount) > 0 THEN 'partially_paid'::text
                ELSE 'unpaid'::text
            END
        WHERE id = v_alloc.purchase_bill_id
          AND organization_id = p_org_id;
    END LOOP;

    -- Mark Payment Cancelled
    UPDATE public.payments SET
        status = 'cancelled',
        cancelled_journal_entry_id = v_rev_entry_id,
        cancelled_at = now(),
        cancelled_by = auth.uid()
    WHERE id = p_payment_id
      AND organization_id = p_org_id;

    -- Reverse cash_bank_accounts balance if cash_bank_account_id is provided
    IF v_cash_bank_account_id IS NOT NULL THEN
        UPDATE public.cash_bank_accounts SET
            current_balance = current_balance + v_amount,
            updated_at = now()
        WHERE id = v_cash_bank_account_id AND organization_id = p_org_id;
    END IF;

    -- Audit trail
    INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
    VALUES (p_org_id, auth.uid(), 'CANCEL_PAYMENT', jsonb_build_object('payment_id', p_payment_id, 'cancelled_journal_entry_id', v_rev_entry_id, 'payment_number', v_payment_number, 'cash_bank_account_id', v_cash_bank_account_id, 'amount', v_amount));

    RETURN v_rev_entry_id;
END;
$$;


COMMIT;
