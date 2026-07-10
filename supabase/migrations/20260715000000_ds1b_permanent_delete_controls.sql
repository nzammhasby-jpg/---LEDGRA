-- ==========================================================
-- LEDGRA DS-1B: PROFESSIONAL TRASH GOVERNANCE & PERMANENT DELETE CONTROLS
-- ==========================================================

BEGIN;

-- ==========================================================
-- 1. PERMANENTLY DELETE SALES INVOICE
-- ==========================================================
CREATE OR REPLACE FUNCTION public.permanently_delete_sales_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_invoice_number text;
    v_status text;
    v_journal_entry_id uuid;
    v_approved_at timestamptz;
    v_deleted_at timestamptz;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Fetch invoice details
    SELECT organization_id, invoice_number, status, journal_entry_id, approved_at, deleted_at 
    INTO v_org_id, v_invoice_number, v_status, v_journal_entry_id, v_approved_at, v_deleted_at
    FROM public.sales_invoices 
    WHERE id = p_invoice_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'المستند غير موجود.';
    END IF;

    -- Fetch user role
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE organization_id = v_org_id
      AND profile_id = auth.uid()
      AND COALESCE(is_active, true) = true;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب أن تكون عضواً في المنشأة.';
    END IF;

    -- Roles check: only owner, admin are allowed
    IF v_user_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'غير مصرح: الحذف النهائي متاح فقط للمالك والمدير (owner/admin).';
    END IF;

    -- Security & Accounting guards
    IF v_deleted_at IS NULL THEN
        RAISE EXCEPTION 'يجب نقل المستند إلى سلة المحذوفات أولاً قبل حذفه نهائياً.';
    END IF;

    IF v_status <> 'draft' 
       OR v_journal_entry_id IS NOT NULL 
       OR v_approved_at IS NOT NULL 
       OR v_status IN ('approved', 'paid', 'partially_paid', 'cancelled') 
    THEN
        RAISE EXCEPTION 'لا يمكن حذف مستند معتمد أو مرتبط بقيود نهائيًا. استخدم الإلغاء أو القيد العكسي للحفاظ على سلامة الحسابات.';
    END IF;

    -- Log Audit before deleting
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'permanent_delete_sales_invoice',
        jsonb_build_object(
            'document_type', 'sales_invoice',
            'document_id', p_invoice_id,
            'document_number', v_invoice_number,
            'deleted_at', v_deleted_at
        )
    );

    -- Delete lines first (although ON DELETE CASCADE is there, this ensures explicit safety)
    DELETE FROM public.sales_invoice_lines WHERE sales_invoice_id = p_invoice_id;
    DELETE FROM public.receipt_allocations WHERE sales_invoice_id = p_invoice_id;

    -- Delete primary record
    DELETE FROM public.sales_invoices WHERE id = p_invoice_id;
END;
$$;


-- ==========================================================
-- 2. PERMANENTLY DELETE PURCHASE BILL
-- ==========================================================
CREATE OR REPLACE FUNCTION public.permanently_delete_purchase_bill(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_bill_number text;
    v_status text;
    v_journal_entry_id uuid;
    v_approved_at timestamptz;
    v_deleted_at timestamptz;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Fetch bill details
    SELECT organization_id, bill_number, status, journal_entry_id, approved_at, deleted_at 
    INTO v_org_id, v_bill_number, v_status, v_journal_entry_id, v_approved_at, v_deleted_at
    FROM public.purchase_bills 
    WHERE id = p_bill_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'المستند غير موجود.';
    END IF;

    -- Fetch user role
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE organization_id = v_org_id
      AND profile_id = auth.uid()
      AND COALESCE(is_active, true) = true;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب أن تكون عضواً في المنشأة.';
    END IF;

    -- Roles check
    IF v_user_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'غير مصرح: الحذف النهائي متاح فقط للمالك والمدير (owner/admin).';
    END IF;

    -- Security & Accounting guards
    IF v_deleted_at IS NULL THEN
        RAISE EXCEPTION 'يجب نقل المستند إلى سلة المحذوفات أولاً قبل حذفه نهائياً.';
    END IF;

    IF v_status <> 'draft' 
       OR v_journal_entry_id IS NOT NULL 
       OR v_approved_at IS NOT NULL 
       OR v_status IN ('approved', 'paid', 'partially_paid', 'cancelled') 
    THEN
        RAISE EXCEPTION 'لا يمكن حذف مستند معتمد أو مرتبط بقيود نهائيًا. استخدم الإلغاء أو القيد العكسي للحفاظ على سلامة الحسابات.';
    END IF;

    -- Log Audit
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'permanent_delete_purchase_bill',
        jsonb_build_object(
            'document_type', 'purchase_bill',
            'document_id', p_bill_id,
            'document_number', v_bill_number,
            'deleted_at', v_deleted_at
        )
    );

    -- Delete lines and allocations
    DELETE FROM public.purchase_bill_lines WHERE purchase_bill_id = p_bill_id;
    DELETE FROM public.payment_allocations WHERE purchase_bill_id = p_bill_id;

    -- Delete primary record
    DELETE FROM public.purchase_bills WHERE id = p_bill_id;
END;
$$;


-- ==========================================================
-- 3. PERMANENTLY DELETE RECEIPT
-- ==========================================================
CREATE OR REPLACE FUNCTION public.permanently_delete_receipt(p_receipt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_receipt_number text;
    v_status text;
    v_journal_entry_id uuid;
    v_approved_at timestamptz;
    v_deleted_at timestamptz;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Fetch receipt details
    SELECT organization_id, receipt_number, status, journal_entry_id, approved_at, deleted_at 
    INTO v_org_id, v_receipt_number, v_status, v_journal_entry_id, v_approved_at, v_deleted_at
    FROM public.receipts 
    WHERE id = p_receipt_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'المستند غير موجود.';
    END IF;

    -- Fetch user role
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE organization_id = v_org_id
      AND profile_id = auth.uid()
      AND COALESCE(is_active, true) = true;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب أن تكون عضواً في المنشأة.';
    END IF;

    -- Roles check
    IF v_user_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'غير مصرح: الحذف النهائي متاح فقط للمالك والمدير (owner/admin).';
    END IF;

    -- Security & Accounting guards
    IF v_deleted_at IS NULL THEN
        RAISE EXCEPTION 'يجب نقل المستند إلى سلة المحذوفات أولاً قبل حذفه نهائياً.';
    END IF;

    IF v_status <> 'draft' 
       OR v_journal_entry_id IS NOT NULL 
       OR v_approved_at IS NOT NULL 
       OR v_status IN ('approved', 'cancelled') 
    THEN
        RAISE EXCEPTION 'لا يمكن حذف مستند معتمد أو مرتبط بقيود نهائيًا. استخدم الإلغاء أو القيد العكسي للحفاظ على سلامة الحسابات.';
    END IF;

    -- Log Audit
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'permanent_delete_receipt',
        jsonb_build_object(
            'document_type', 'receipt',
            'document_id', p_receipt_id,
            'document_number', v_receipt_number,
            'deleted_at', v_deleted_at
        )
    );

    -- Delete receipt allocations
    DELETE FROM public.receipt_allocations WHERE receipt_id = p_receipt_id;

    -- Delete primary record
    DELETE FROM public.receipts WHERE id = p_receipt_id;
END;
$$;


-- ==========================================================
-- 4. PERMANENTLY DELETE PAYMENT
-- ==========================================================
CREATE OR REPLACE FUNCTION public.permanently_delete_payment(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_payment_number text;
    v_status text;
    v_journal_entry_id uuid;
    v_approved_at timestamptz;
    v_deleted_at timestamptz;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Fetch payment details
    SELECT organization_id, payment_number, status, journal_entry_id, approved_at, deleted_at 
    INTO v_org_id, v_payment_number, v_status, v_journal_entry_id, v_approved_at, v_deleted_at
    FROM public.payments 
    WHERE id = p_payment_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'المستند غير موجود.';
    END IF;

    -- Fetch user role
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE organization_id = v_org_id
      AND profile_id = auth.uid()
      AND COALESCE(is_active, true) = true;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب أن تكون عضواً في المنشأة.';
    END IF;

    -- Roles check
    IF v_user_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'غير مصرح: الحذف النهائي متاح فقط للمالك والمدير (owner/admin).';
    END IF;

    -- Security & Accounting guards
    IF v_deleted_at IS NULL THEN
        RAISE EXCEPTION 'يجب نقل المستند إلى سلة المحذوفات أولاً قبل حذفه نهائياً.';
    END IF;

    IF v_status <> 'draft' 
       OR v_journal_entry_id IS NOT NULL 
       OR v_approved_at IS NOT NULL 
       OR v_status IN ('approved', 'cancelled') 
    THEN
        RAISE EXCEPTION 'لا يمكن حذف مستند معتمد أو مرتبط بقيود نهائيًا. استخدم الإلغاء أو القيد العكسي للحفاظ على سلامة الحسابات.';
    END IF;

    -- Log Audit
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'permanent_delete_payment',
        jsonb_build_object(
            'document_type', 'payment',
            'document_id', p_payment_id,
            'document_number', v_payment_number,
            'deleted_at', v_deleted_at
        )
    );

    -- Delete allocations
    DELETE FROM public.payment_allocations WHERE payment_id = p_payment_id;

    -- Delete primary record
    DELETE FROM public.payments WHERE id = p_payment_id;
END;
$$;


-- ==========================================================
-- 5. PERMANENTLY DELETE SALES CREDIT NOTE
-- ==========================================================
CREATE OR REPLACE FUNCTION public.permanently_delete_sales_credit_note(p_credit_note_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_credit_note_number text;
    v_status text;
    v_journal_entry_id uuid;
    v_approved_at timestamptz;
    v_deleted_at timestamptz;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Fetch credit note details
    SELECT organization_id, credit_note_number, status, journal_entry_id, approved_at, deleted_at 
    INTO v_org_id, v_credit_note_number, v_status, v_journal_entry_id, v_approved_at, v_deleted_at
    FROM public.sales_credit_notes 
    WHERE id = p_credit_note_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'المستند غير موجود.';
    END IF;

    -- Fetch user role
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE organization_id = v_org_id
      AND profile_id = auth.uid()
      AND COALESCE(is_active, true) = true;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب أن تكون عضواً في المنشأة.';
    END IF;

    -- Roles check
    IF v_user_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'غير مصرح: الحذف النهائي متاح فقط للمالك والمدير (owner/admin).';
    END IF;

    -- Security & Accounting guards
    IF v_deleted_at IS NULL THEN
        RAISE EXCEPTION 'يجب نقل المستند إلى سلة المحذوفات أولاً قبل حذفه نهائياً.';
    END IF;

    IF v_status <> 'draft' 
       OR v_journal_entry_id IS NOT NULL 
       OR v_approved_at IS NOT NULL 
       OR v_status IN ('approved', 'cancelled') 
    THEN
        RAISE EXCEPTION 'لا يمكن حذف مستند معتمد أو مرتبط بقيود نهائيًا. استخدم الإلغاء أو القيد العكسي للحفاظ على سلامة الحسابات.';
    END IF;

    -- Log Audit
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'permanent_delete_sales_credit_note',
        jsonb_build_object(
            'document_type', 'sales_credit_note',
            'document_id', p_credit_note_id,
            'document_number', v_credit_note_number,
            'deleted_at', v_deleted_at
        )
    );

    -- Delete lines
    DELETE FROM public.sales_credit_note_lines WHERE credit_note_id = p_credit_note_id;

    -- Delete primary record
    DELETE FROM public.sales_credit_notes WHERE id = p_credit_note_id;
END;
$$;


-- ==========================================================
-- 6. PERMANENTLY DELETE PURCHASE DEBIT NOTE
-- ==========================================================
CREATE OR REPLACE FUNCTION public.permanently_delete_purchase_debit_note(p_debit_note_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_debit_note_number text;
    v_status text;
    v_journal_entry_id uuid;
    v_approved_at timestamptz;
    v_deleted_at timestamptz;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Fetch debit note details
    SELECT organization_id, debit_note_number, status, journal_entry_id, approved_at, deleted_at 
    INTO v_org_id, v_debit_note_number, v_status, v_journal_entry_id, v_approved_at, v_deleted_at
    FROM public.purchase_debit_notes 
    WHERE id = p_debit_note_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'المستند غير موجود.';
    END IF;

    -- Fetch user role
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE organization_id = v_org_id
      AND profile_id = auth.uid()
      AND COALESCE(is_active, true) = true;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب أن تكون عضواً في المنشأة.';
    END IF;

    -- Roles check
    IF v_user_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'غير مصرح: الحذف النهائي متاح فقط للمالك والمدير (owner/admin).';
    END IF;

    -- Security & Accounting guards
    IF v_deleted_at IS NULL THEN
        RAISE EXCEPTION 'يجب نقل المستند إلى سلة المحذوفات أولاً قبل حذفه نهائياً.';
    END IF;

    IF v_status <> 'draft' 
       OR v_journal_entry_id IS NOT NULL 
       OR v_approved_at IS NOT NULL 
       OR v_status IN ('approved', 'cancelled') 
    THEN
        RAISE EXCEPTION 'لا يمكن حذف مستند معتمد أو مرتبط بقيود نهائيًا. استخدم الإلغاء أو القيد العكسي للحفاظ على سلامة الحسابات.';
    END IF;

    -- Log Audit
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'permanent_delete_purchase_debit_note',
        jsonb_build_object(
            'document_type', 'purchase_debit_note',
            'document_id', p_debit_note_id,
            'document_number', v_debit_note_number,
            'deleted_at', v_deleted_at
        )
    );

    -- Delete lines
    DELETE FROM public.purchase_debit_note_lines WHERE debit_note_id = p_debit_note_id;

    -- Delete primary record
    DELETE FROM public.purchase_debit_notes WHERE id = p_debit_note_id;
END;
$$;


-- ==========================================================
-- 7. GRANT EXECUTE PRIVILEGES
-- ==========================================================
REVOKE ALL ON FUNCTION public.permanently_delete_sales_invoice(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.permanently_delete_purchase_bill(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.permanently_delete_receipt(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.permanently_delete_payment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.permanently_delete_sales_credit_note(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.permanently_delete_purchase_debit_note(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.permanently_delete_sales_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanently_delete_purchase_bill(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanently_delete_receipt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanently_delete_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanently_delete_sales_credit_note(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanently_delete_purchase_debit_note(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
