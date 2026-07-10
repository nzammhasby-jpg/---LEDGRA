-- ==========================================================
-- LEDGRA DS-1A: SOFT DELETE & RESTORE FOR FINANCIAL DOCUMENTS
-- ==========================================================

BEGIN;

-- 1. ADD SOFT DELETE COLUMNS TO TARGET TABLES
ALTER TABLE public.sales_invoices 
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS delete_reason text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS restored_at timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS restored_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;

ALTER TABLE public.purchase_bills 
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS delete_reason text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS restored_at timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS restored_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;

ALTER TABLE public.receipts 
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS delete_reason text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS restored_at timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS restored_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;

ALTER TABLE public.payments 
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS delete_reason text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS restored_at timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS restored_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;

ALTER TABLE public.sales_credit_notes 
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS delete_reason text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS restored_at timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS restored_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;

ALTER TABLE public.purchase_debit_notes 
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS delete_reason text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS restored_at timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS restored_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;

-- 2. CREATE INDEXES FOR DELETED_AT AND ORGANIZATION_ID / STATUS
CREATE INDEX IF NOT EXISTS sales_invoices_deleted_idx ON public.sales_invoices (organization_id, deleted_at);
CREATE INDEX IF NOT EXISTS purchase_bills_deleted_idx ON public.purchase_bills (organization_id, deleted_at);
CREATE INDEX IF NOT EXISTS receipts_deleted_idx ON public.receipts (organization_id, deleted_at);
CREATE INDEX IF NOT EXISTS payments_deleted_idx ON public.payments (organization_id, deleted_at);
CREATE INDEX IF NOT EXISTS sales_credit_notes_deleted_idx ON public.sales_credit_notes (organization_id, deleted_at);
CREATE INDEX IF NOT EXISTS purchase_debit_notes_deleted_idx ON public.purchase_debit_notes (organization_id, deleted_at);

-- 3. CREATE RPC FUNCTIONS FOR SOFT DELETE AND RESTORE

-- ==========================================================
-- A. SALES INVOICE SOFT DELETE & RESTORE
-- ==========================================================

CREATE OR REPLACE FUNCTION public.soft_delete_sales_invoice(
    p_invoice_id uuid,
    p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_status text;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    SELECT organization_id, status INTO v_org_id, v_status 
    FROM public.sales_invoices 
    WHERE id = p_invoice_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'الفاتورة غير موجودة.';
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

    -- Permissions
    IF v_user_role = 'viewer' THEN
        RAISE EXCEPTION 'غير مصرح: مستخدم العرض فقط لا يمكنه حذف المستندات.';
    END IF;

    IF v_user_role = 'sales' AND v_status <> 'draft' THEN
        RAISE EXCEPTION 'غير مصرح: مسؤولو المبيعات يمكنهم فقط حذف الفواتير المسودة.';
    END IF;

    -- Approved status guards
    IF v_status IN ('approved', 'paid', 'partially_paid') THEN
        RAISE EXCEPTION 'لا يمكن حذف مستند معتمد. استخدم الإلغاء أو المرتجع للحفاظ على سلامة الحسابات.';
    END IF;

    -- Perform Soft Delete
    UPDATE public.sales_invoices
    SET deleted_at = now(),
        deleted_by = auth.uid(),
        delete_reason = p_reason,
        restored_at = null,
        restored_by = null
    WHERE id = p_invoice_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'soft_delete_sales_invoice',
        jsonb_build_object(
            'document_type', 'sales_invoice',
            'document_id', p_invoice_id,
            'reason', p_reason
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_sales_invoice(
    p_invoice_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_status text;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    SELECT organization_id, status INTO v_org_id, v_status 
    FROM public.sales_invoices 
    WHERE id = p_invoice_id AND deleted_at IS NOT NULL;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'الفاتورة غير موجودة في المحذوفات أو لا تنتمي لهذه المنشأة.';
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

    IF v_user_role = 'viewer' THEN
        RAISE EXCEPTION 'غير مصرح: مستخدم العرض فقط لا يمكنه استعادة المستندات.';
    END IF;

    IF v_user_role = 'sales' AND v_status <> 'draft' THEN
        RAISE EXCEPTION 'غير مصرح: مسؤولو المبيعات يمكنهم فقط استعادة الفواتير المسودة.';
    END IF;

    -- Perform Restore
    UPDATE public.sales_invoices
    SET deleted_at = null,
        deleted_by = null,
        delete_reason = null,
        restored_at = now(),
        restored_by = auth.uid()
    WHERE id = p_invoice_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'restore_sales_invoice',
        jsonb_build_object(
            'document_type', 'sales_invoice',
            'document_id', p_invoice_id
        )
    );
END;
$$;


-- ==========================================================
-- B. PURCHASE BILL SOFT DELETE & RESTORE
-- ==========================================================

CREATE OR REPLACE FUNCTION public.soft_delete_purchase_bill(
    p_bill_id uuid,
    p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_status text;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    SELECT organization_id, status INTO v_org_id, v_status 
    FROM public.purchase_bills 
    WHERE id = p_bill_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'الفاتورة غير موجودة.';
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

    -- Only Owner, Admin, Accountant are allowed to manage purchases
    IF v_user_role IN ('viewer', 'sales') THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لإدارة مشتريات هذه المنشأة.';
    END IF;

    -- Approved status guards
    IF v_status IN ('approved', 'paid', 'partially_paid') THEN
        RAISE EXCEPTION 'لا يمكن حذف مستند معتمد. استخدم الإلغاء أو المرتجع للحفاظ على سلامة الحسابات.';
    END IF;

    -- Perform Soft Delete
    UPDATE public.purchase_bills
    SET deleted_at = now(),
        deleted_by = auth.uid(),
        delete_reason = p_reason,
        restored_at = null,
        restored_by = null
    WHERE id = p_bill_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'soft_delete_purchase_bill',
        jsonb_build_object(
            'document_type', 'purchase_bill',
            'document_id', p_bill_id,
            'reason', p_reason
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_purchase_bill(
    p_bill_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    SELECT organization_id INTO v_org_id 
    FROM public.purchase_bills 
    WHERE id = p_bill_id AND deleted_at IS NOT NULL;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'الفاتورة غير موجودة في المحذوفات أو لا تنتمي لهذه المنشأة.';
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

    IF v_user_role IN ('viewer', 'sales') THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لاستعادة هذا المستند.';
    END IF;

    -- Perform Restore
    UPDATE public.purchase_bills
    SET deleted_at = null,
        deleted_by = null,
        delete_reason = null,
        restored_at = now(),
        restored_by = auth.uid()
    WHERE id = p_bill_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'restore_purchase_bill',
        jsonb_build_object(
            'document_type', 'purchase_bill',
            'document_id', p_bill_id
        )
    );
END;
$$;


-- ==========================================================
-- C. RECEIPT SOFT DELETE & RESTORE
-- ==========================================================

CREATE OR REPLACE FUNCTION public.soft_delete_receipt(
    p_receipt_id uuid,
    p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_status text;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    SELECT organization_id, status INTO v_org_id, v_status 
    FROM public.receipts 
    WHERE id = p_receipt_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'السند غير موجود.';
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

    -- Only Owner, Admin, Accountant can delete financial documents like receipts
    IF v_user_role IN ('viewer', 'sales') THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لإدارة سندات القبض المباشرة في هذه المنشأة.';
    END IF;

    -- Approved status guards
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن حذف مستند معتمد. استخدم الإلغاء للحفاظ على سلامة الحسابات.';
    END IF;

    -- Perform Soft Delete
    UPDATE public.receipts
    SET deleted_at = now(),
        deleted_by = auth.uid(),
        delete_reason = p_reason,
        restored_at = null,
        restored_by = null
    WHERE id = p_receipt_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'soft_delete_receipt',
        jsonb_build_object(
            'document_type', 'receipt',
            'document_id', p_receipt_id,
            'reason', p_reason
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_receipt(
    p_receipt_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    SELECT organization_id INTO v_org_id 
    FROM public.receipts 
    WHERE id = p_receipt_id AND deleted_at IS NOT NULL;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'السند غير موجود في المحذوفات أو لا ينتمي لهذه المنشأة.';
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

    IF v_user_role IN ('viewer', 'sales') THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لاستعادة هذا المستند.';
    END IF;

    -- Perform Restore
    UPDATE public.receipts
    SET deleted_at = null,
        deleted_by = null,
        delete_reason = null,
        restored_at = now(),
        restored_by = auth.uid()
    WHERE id = p_receipt_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'restore_receipt',
        jsonb_build_object(
            'document_type', 'receipt',
            'document_id', p_receipt_id
        )
    );
END;
$$;


-- ==========================================================
-- D. PAYMENT SOFT DELETE & RESTORE
-- ==========================================================

CREATE OR REPLACE FUNCTION public.soft_delete_payment(
    p_payment_id uuid,
    p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_status text;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    SELECT organization_id, status INTO v_org_id, v_status 
    FROM public.payments 
    WHERE id = p_payment_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'السند غير موجود.';
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

    -- Only Owner, Admin, Accountant can delete payments
    IF v_user_role IN ('viewer', 'sales') THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لإدارة سندات الصرف في هذه المنشأة.';
    END IF;

    -- Approved status guards
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن حذف مستند معتمد. استخدم الإلغاء للحفاظ على سلامة الحسابات.';
    END IF;

    -- Perform Soft Delete
    UPDATE public.payments
    SET deleted_at = now(),
        deleted_by = auth.uid(),
        delete_reason = p_reason,
        restored_at = null,
        restored_by = null
    WHERE id = p_payment_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'soft_delete_payment',
        jsonb_build_object(
            'document_type', 'payment',
            'document_id', p_payment_id,
            'reason', p_reason
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_payment(
    p_payment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    SELECT organization_id INTO v_org_id 
    FROM public.payments 
    WHERE id = p_payment_id AND deleted_at IS NOT NULL;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'السند غير موجود في المحذوفات أو لا تنتمي لهذه المنشأة.';
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

    IF v_user_role IN ('viewer', 'sales') THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لاستعادة هذا المستند.';
    END IF;

    -- Perform Restore
    UPDATE public.payments
    SET deleted_at = null,
        deleted_by = null,
        delete_reason = null,
        restored_at = now(),
        restored_by = auth.uid()
    WHERE id = p_payment_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'restore_payment',
        jsonb_build_object(
            'document_type', 'payment',
            'document_id', p_payment_id
        )
    );
END;
$$;


-- ==========================================================
-- E. SALES CREDIT NOTE SOFT DELETE & RESTORE
-- ==========================================================

CREATE OR REPLACE FUNCTION public.soft_delete_sales_credit_note(
    p_credit_note_id uuid,
    p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_status text;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    SELECT organization_id, status INTO v_org_id, v_status 
    FROM public.sales_credit_notes 
    WHERE id = p_credit_note_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'الإشعار الدائن غير موجود.';
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

    -- Only Owner, Admin, Accountant can delete credit notes
    IF v_user_role IN ('viewer', 'sales') THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لإدارة الإشعارات الدائنة في هذه المنشأة.';
    END IF;

    -- Approved status guards
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن حذف مستند معتمد. استخدم الإلغاء للحفاظ على سلامة الحسابات.';
    END IF;

    -- Perform Soft Delete
    UPDATE public.sales_credit_notes
    SET deleted_at = now(),
        deleted_by = auth.uid(),
        delete_reason = p_reason,
        restored_at = null,
        restored_by = null
    WHERE id = p_credit_note_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'soft_delete_sales_credit_note',
        jsonb_build_object(
            'document_type', 'sales_credit_note',
            'document_id', p_credit_note_id,
            'reason', p_reason
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_sales_credit_note(
    p_credit_note_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    SELECT organization_id INTO v_org_id 
    FROM public.sales_credit_notes 
    WHERE id = p_credit_note_id AND deleted_at IS NOT NULL;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'الإشعار الدائن غير موجود في المحذوفات أو لا تنتمي لهذه المنشأة.';
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

    IF v_user_role IN ('viewer', 'sales') THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لاستعادة هذا المستند.';
    END IF;

    -- Perform Restore
    UPDATE public.sales_credit_notes
    SET deleted_at = null,
        deleted_by = null,
        delete_reason = null,
        restored_at = now(),
        restored_by = auth.uid()
    WHERE id = p_credit_note_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'restore_sales_credit_note',
        jsonb_build_object(
            'document_type', 'sales_credit_note',
            'document_id', p_credit_note_id
        )
    );
END;
$$;


-- ==========================================================
-- F. PURCHASE DEBIT NOTE SOFT DELETE & RESTORE
-- ==========================================================

CREATE OR REPLACE FUNCTION public.soft_delete_purchase_debit_note(
    p_debit_note_id uuid,
    p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_status text;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    SELECT organization_id, status INTO v_org_id, v_status 
    FROM public.purchase_debit_notes 
    WHERE id = p_debit_note_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'الإشعار المدين غير موجود.';
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

    -- Only Owner, Admin, Accountant can delete debit notes
    IF v_user_role IN ('viewer', 'sales') THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لإدارة الإشعارات المدينة في هذه المنشأة.';
    END IF;

    -- Approved status guards
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن حذف مستند معتمد. استخدم الإلغاء للحفاظ على سلامة الحسابات.';
    END IF;

    -- Perform Soft Delete
    UPDATE public.purchase_debit_notes
    SET deleted_at = now(),
        deleted_by = auth.uid(),
        delete_reason = p_reason,
        restored_at = null,
        restored_by = null
    WHERE id = p_debit_note_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'soft_delete_purchase_debit_note',
        jsonb_build_object(
            'document_type', 'purchase_debit_note',
            'document_id', p_debit_note_id,
            'reason', p_reason
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_purchase_debit_note(
    p_debit_note_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    SELECT organization_id INTO v_org_id 
    FROM public.purchase_debit_notes 
    WHERE id = p_debit_note_id AND deleted_at IS NOT NULL;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'الإشعار المدين غير موجود في المحذوفات أو لا تنتمي لهذه المنشأة.';
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

    IF v_user_role IN ('viewer', 'sales') THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحية لاستعادة هذا المستند.';
    END IF;

    -- Perform Restore
    UPDATE public.purchase_debit_notes
    SET deleted_at = null,
        deleted_by = null,
        delete_reason = null,
        restored_at = now(),
        restored_by = auth.uid()
    WHERE id = p_debit_note_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        auth.uid(),
        'restore_purchase_debit_note',
        jsonb_build_object(
            'document_type', 'purchase_debit_note',
            'document_id', p_debit_note_id
        )
    );
END;
$$;


-- ==========================================================
-- G. GRANT EXECUTE TO AUTHENTICATED ROLE
-- ==========================================================

REVOKE ALL ON FUNCTION public.soft_delete_sales_invoice(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_sales_invoice(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.soft_delete_purchase_bill(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_purchase_bill(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.soft_delete_receipt(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_receipt(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.soft_delete_payment(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_payment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.soft_delete_sales_credit_note(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_sales_credit_note(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.soft_delete_purchase_debit_note(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_purchase_debit_note(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.soft_delete_sales_invoice(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_sales_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_purchase_bill(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_purchase_bill(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_receipt(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_receipt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_payment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_sales_credit_note(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_sales_credit_note(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_purchase_debit_note(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_purchase_debit_note(uuid) TO authenticated;


COMMIT;

NOTIFY pgrst, 'reload schema';
