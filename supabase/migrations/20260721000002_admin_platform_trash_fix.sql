-- =========================================================================
-- LEDGRA ADMIN-1B Soft Delete Trash Center fixes and robustness
-- Name: 20260721000002_admin_platform_trash_fix.sql
-- =========================================================================

BEGIN;

-- 1. Create table public.platform_admin_audit_logs if it does not exist
CREATE TABLE IF NOT EXISTS public.platform_admin_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_profile_id uuid REFERENCES public.profiles(id),
    action text NOT NULL,
    target_organization_id uuid NULL,
    target_user_id uuid NULL,
    document_type text NULL,
    document_id uuid NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Ensure RLS and permissions on platform_admin_audit_logs
ALTER TABLE public.platform_admin_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_platform_admin_audit_logs ON public.platform_admin_audit_logs;
CREATE POLICY select_platform_admin_audit_logs ON public.platform_admin_audit_logs
    FOR SELECT TO authenticated USING (public.is_platform_admin());

REVOKE ALL ON TABLE public.platform_admin_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_admin_audit_logs TO authenticated;

-- 2. Safely add soft-delete columns to existing tables
DO $$
BEGIN
    -- sales_invoices
    IF to_regclass('public.sales_invoices') IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_invoices' AND column_name='deleted_at') THEN
            ALTER TABLE public.sales_invoices ADD COLUMN deleted_at timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_invoices' AND column_name='deleted_by') THEN
            ALTER TABLE public.sales_invoices ADD COLUMN deleted_by uuid REFERENCES public.profiles(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_invoices' AND column_name='delete_reason') THEN
            ALTER TABLE public.sales_invoices ADD COLUMN delete_reason text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_invoices' AND column_name='restored_at') THEN
            ALTER TABLE public.sales_invoices ADD COLUMN restored_at timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_invoices' AND column_name='restored_by') THEN
            ALTER TABLE public.sales_invoices ADD COLUMN restored_by uuid REFERENCES public.profiles(id);
        END IF;
    END IF;

    -- purchase_bills
    IF to_regclass('public.purchase_bills') IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_bills' AND column_name='deleted_at') THEN
            ALTER TABLE public.purchase_bills ADD COLUMN deleted_at timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_bills' AND column_name='deleted_by') THEN
            ALTER TABLE public.purchase_bills ADD COLUMN deleted_by uuid REFERENCES public.profiles(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_bills' AND column_name='delete_reason') THEN
            ALTER TABLE public.purchase_bills ADD COLUMN delete_reason text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_bills' AND column_name='restored_at') THEN
            ALTER TABLE public.purchase_bills ADD COLUMN restored_at timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_bills' AND column_name='restored_by') THEN
            ALTER TABLE public.purchase_bills ADD COLUMN restored_by uuid REFERENCES public.profiles(id);
        END IF;
    END IF;

    -- receipts
    IF to_regclass('public.receipts') IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='deleted_at') THEN
            ALTER TABLE public.receipts ADD COLUMN deleted_at timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='deleted_by') THEN
            ALTER TABLE public.receipts ADD COLUMN deleted_by uuid REFERENCES public.profiles(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='delete_reason') THEN
            ALTER TABLE public.receipts ADD COLUMN delete_reason text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='restored_at') THEN
            ALTER TABLE public.receipts ADD COLUMN restored_at timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='restored_by') THEN
            ALTER TABLE public.receipts ADD COLUMN restored_by uuid REFERENCES public.profiles(id);
        END IF;
    END IF;

    -- payments
    IF to_regclass('public.payments') IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='deleted_at') THEN
            ALTER TABLE public.payments ADD COLUMN deleted_at timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='deleted_by') THEN
            ALTER TABLE public.payments ADD COLUMN deleted_by uuid REFERENCES public.profiles(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='delete_reason') THEN
            ALTER TABLE public.payments ADD COLUMN delete_reason text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='restored_at') THEN
            ALTER TABLE public.payments ADD COLUMN restored_at timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='restored_by') THEN
            ALTER TABLE public.payments ADD COLUMN restored_by uuid REFERENCES public.profiles(id);
        END IF;
    END IF;

    -- sales_credit_notes
    IF to_regclass('public.sales_credit_notes') IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_credit_notes' AND column_name='deleted_at') THEN
            ALTER TABLE public.sales_credit_notes ADD COLUMN deleted_at timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_credit_notes' AND column_name='deleted_by') THEN
            ALTER TABLE public.sales_credit_notes ADD COLUMN deleted_by uuid REFERENCES public.profiles(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_credit_notes' AND column_name='delete_reason') THEN
            ALTER TABLE public.sales_credit_notes ADD COLUMN delete_reason text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_credit_notes' AND column_name='restored_at') THEN
            ALTER TABLE public.sales_credit_notes ADD COLUMN restored_at timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_credit_notes' AND column_name='restored_by') THEN
            ALTER TABLE public.sales_credit_notes ADD COLUMN restored_by uuid REFERENCES public.profiles(id);
        END IF;
    END IF;

    -- purchase_debit_notes
    IF to_regclass('public.purchase_debit_notes') IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_debit_notes' AND column_name='deleted_at') THEN
            ALTER TABLE public.purchase_debit_notes ADD COLUMN deleted_at timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_debit_notes' AND column_name='deleted_by') THEN
            ALTER TABLE public.purchase_debit_notes ADD COLUMN deleted_by uuid REFERENCES public.profiles(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_debit_notes' AND column_name='delete_reason') THEN
            ALTER TABLE public.purchase_debit_notes ADD COLUMN delete_reason text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_debit_notes' AND column_name='restored_at') THEN
            ALTER TABLE public.purchase_debit_notes ADD COLUMN restored_at timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_debit_notes' AND column_name='restored_by') THEN
            ALTER TABLE public.purchase_debit_notes ADD COLUMN restored_by uuid REFERENCES public.profiles(id);
        END IF;
    END IF;
END $$;

-- 3. Redefine platform_list_deleted_documents using PL/pgSQL with dynamic table checks
DROP FUNCTION IF EXISTS public.platform_list_deleted_documents();

CREATE OR REPLACE FUNCTION public.platform_list_deleted_documents()
RETURNS TABLE (
    document_type text,
    document_id uuid,
    organization_id uuid,
    organization_name text,
    document_number text,
    document_status text,
    amount numeric,
    currency_code text,
    deleted_at timestamptz,
    deleted_by uuid,
    deleted_by_name text,
    delete_reason text,
    can_restore boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Auth check
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح لك باستعراض حركات منشآت العملاء';
    END IF;

    -- Create temporary table for sorting across all dynamically selected tables
    CREATE TEMP TABLE IF NOT EXISTS temp_deleted_documents (
        document_type text,
        document_id uuid,
        organization_id uuid,
        organization_name text,
        document_number text,
        document_status text,
        amount numeric,
        currency_code text,
        deleted_at timestamptz,
        deleted_by uuid,
        deleted_by_name text,
        delete_reason text,
        can_restore boolean
    ) ON COMMIT DROP;

    TRUNCATE temp_deleted_documents;

    -- A. Sales Invoices
    IF to_regclass('public.sales_invoices') IS NOT NULL THEN
        INSERT INTO temp_deleted_documents
        SELECT 
            'sales_invoice'::text,
            si.id,
            si.organization_id,
            COALESCE(o.name_ar, o.name_en, 'منشأة غير مسماة')::text,
            si.invoice_number::text,
            si.status::text,
            si.total::numeric,
            COALESCE(si.currency, o.currency_code, 'SAR')::text,
            si.deleted_at,
            si.deleted_by,
            COALESCE(p.full_name, 'غير محدد')::text,
            si.delete_reason::text,
            (si.status = 'draft')::boolean
        FROM public.sales_invoices si
        JOIN public.organizations o ON o.id = si.organization_id
        LEFT JOIN public.profiles p ON p.id = si.deleted_by
        WHERE si.deleted_at IS NOT NULL;
    END IF;

    -- B. Purchase Bills
    IF to_regclass('public.purchase_bills') IS NOT NULL THEN
        INSERT INTO temp_deleted_documents
        SELECT 
            'purchase_bill'::text,
            pb.id,
            pb.organization_id,
            COALESCE(o.name_ar, o.name_en, 'منشأة غير مسماة')::text,
            pb.bill_number::text,
            pb.status::text,
            pb.total::numeric,
            COALESCE(pb.currency, o.currency_code, 'SAR')::text,
            pb.deleted_at,
            pb.deleted_by,
            COALESCE(p.full_name, 'غير محدد')::text,
            pb.delete_reason::text,
            (pb.status = 'draft')::boolean
        FROM public.purchase_bills pb
        JOIN public.organizations o ON o.id = pb.organization_id
        LEFT JOIN public.profiles p ON p.id = pb.deleted_by
        WHERE pb.deleted_at IS NOT NULL;
    END IF;

    -- C. Receipts
    IF to_regclass('public.receipts') IS NOT NULL THEN
        INSERT INTO temp_deleted_documents
        SELECT 
            'receipt'::text,
            r.id,
            r.organization_id,
            COALESCE(o.name_ar, o.name_en, 'منشأة غير مسماة')::text,
            r.receipt_number::text,
            r.status::text,
            r.amount::numeric,
            COALESCE(o.currency_code, 'SAR')::text,
            r.deleted_at,
            r.deleted_by,
            COALESCE(p.full_name, 'غير محدد')::text,
            r.delete_reason::text,
            (r.status = 'draft')::boolean
        FROM public.receipts r
        JOIN public.organizations o ON o.id = r.organization_id
        LEFT JOIN public.profiles p ON p.id = r.deleted_by
        WHERE r.deleted_at IS NOT NULL;
    END IF;

    -- D. Payments
    IF to_regclass('public.payments') IS NOT NULL THEN
        INSERT INTO temp_deleted_documents
        SELECT 
            'payment'::text,
            pay.id,
            pay.organization_id,
            COALESCE(o.name_ar, o.name_en, 'منشأة غير مسماة')::text,
            pay.payment_number::text,
            pay.status::text,
            pay.amount::numeric,
            COALESCE(o.currency_code, 'SAR')::text,
            pay.deleted_at,
            pay.deleted_by,
            COALESCE(p.full_name, 'غير محدد')::text,
            pay.delete_reason::text,
            (pay.status = 'draft')::boolean
        FROM public.payments pay
        JOIN public.organizations o ON o.id = pay.organization_id
        LEFT JOIN public.profiles p ON p.id = pay.deleted_by
        WHERE pay.deleted_at IS NOT NULL;
    END IF;

    -- E. Sales Credit Notes
    IF to_regclass('public.sales_credit_notes') IS NOT NULL THEN
        DECLARE
            v_amt_col text := '0';
            v_curr_col text := 'NULL';
            v_num_col text := 'NULL';
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_credit_notes' AND column_name='total_amount') THEN
                v_amt_col := 'scn.total_amount';
            ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_credit_notes' AND column_name='total') THEN
                v_amt_col := 'scn.total';
            ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_credit_notes' AND column_name='amount') THEN
                v_amt_col := 'scn.amount';
            END IF;

            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_credit_notes' AND column_name='currency_code') THEN
                v_curr_col := 'scn.currency_code';
            ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_credit_notes' AND column_name='currency') THEN
                v_curr_col := 'scn.currency';
            END IF;

            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_credit_notes' AND column_name='credit_note_number') THEN
                v_num_col := 'scn.credit_note_number';
            ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_credit_notes' AND column_name='note_number') THEN
                v_num_col := 'scn.note_number';
            END IF;

            EXECUTE '
                INSERT INTO temp_deleted_documents
                SELECT 
                    ''sales_credit_note''::text,
                    scn.id,
                    scn.organization_id,
                    COALESCE(o.name_ar, o.name_en, ''منشأة غير مسماة'')::text,
                    (' || v_num_col || ')::text,
                    scn.status::text,
                    (' || v_amt_col || ')::numeric,
                    COALESCE(' || v_curr_col || ', o.currency_code, ''SAR'')::text,
                    scn.deleted_at,
                    scn.deleted_by,
                    COALESCE(p.full_name, ''غير محدد'')::text,
                    scn.delete_reason::text,
                    (scn.status = ''draft'')::boolean
                FROM public.sales_credit_notes scn
                JOIN public.organizations o ON o.id = scn.organization_id
                LEFT JOIN public.profiles p ON p.id = scn.deleted_by
                WHERE scn.deleted_at IS NOT NULL
            ';
        END;
    END IF;

    -- F. Purchase Debit Notes
    IF to_regclass('public.purchase_debit_notes') IS NOT NULL THEN
        DECLARE
            v_amt_col text := '0';
            v_curr_col text := 'NULL';
            v_num_col text := 'NULL';
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_debit_notes' AND column_name='total_amount') THEN
                v_amt_col := 'pdn.total_amount';
            ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_debit_notes' AND column_name='total') THEN
                v_amt_col := 'pdn.total';
            ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_debit_notes' AND column_name='amount') THEN
                v_amt_col := 'pdn.amount';
            END IF;

            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_debit_notes' AND column_name='currency_code') THEN
                v_curr_col := 'pdn.currency_code';
            ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_debit_notes' AND column_name='currency') THEN
                v_curr_col := 'pdn.currency';
            END IF;

            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_debit_notes' AND column_name='debit_note_number') THEN
                v_num_col := 'pdn.debit_note_number';
            ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_debit_notes' AND column_name='note_number') THEN
                v_num_col := 'pdn.note_number';
            END IF;

            EXECUTE '
                INSERT INTO temp_deleted_documents
                SELECT 
                    ''purchase_debit_note''::text,
                    pdn.id,
                    pdn.organization_id,
                    COALESCE(o.name_ar, o.name_en, ''منشأة غير مسماة'')::text,
                    (' || v_num_col || ')::text,
                    pdn.status::text,
                    (' || v_amt_col || ')::numeric,
                    COALESCE(' || v_curr_col || ', o.currency_code, ''SAR'')::text,
                    pdn.deleted_at,
                    pdn.deleted_by,
                    COALESCE(p.full_name, ''غير محدد'')::text,
                    pdn.delete_reason::text,
                    (pdn.status = ''draft'')::boolean
                FROM public.purchase_debit_notes pdn
                JOIN public.organizations o ON o.id = pdn.organization_id
                LEFT JOIN public.profiles p ON p.id = pdn.deleted_by
                WHERE pdn.deleted_at IS NOT NULL
            ';
        END;
    END IF;

    RETURN QUERY
    SELECT * FROM temp_deleted_documents
    ORDER BY deleted_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_list_deleted_documents() TO authenticated;


-- 4. Redefine platform_restore_deleted_document utilizing underlying restore services
DROP FUNCTION IF EXISTS public.platform_restore_deleted_document(text, uuid);
DROP FUNCTION IF EXISTS public.platform_restore_document(text, uuid);

CREATE OR REPLACE FUNCTION public.platform_restore_deleted_document(
    p_document_type text,
    p_document_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_status text;
    v_doc_num text;
    v_role text;
BEGIN
    -- Verify platform admin
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح لك باستعراض حركات منشآت العملاء';
    END IF;

    -- Verify that the role is not 'support'
    SELECT role INTO v_role 
    FROM public.platform_admins 
    WHERE profile_id = auth.uid() AND is_active = true;

    IF v_role = 'support' THEN
        RAISE EXCEPTION 'غير مصرح: دور الدعم الفني لديه صلاحيات القراءة فقط ولا يمكنه استعادة المستندات.';
    END IF;

    -- 1. Sales Invoice
    IF p_document_type = 'sales_invoice' THEN
        SELECT organization_id, status, invoice_number INTO v_org_id, v_status, v_doc_num 
        FROM public.sales_invoices 
        WHERE id = p_document_id AND deleted_at IS NOT NULL;

        IF v_org_id IS NULL THEN RAISE EXCEPTION 'المستند غير موجود في المحذوفات.'; END IF;
        IF v_status <> 'draft' THEN RAISE EXCEPTION 'لا يمكن استعادة مستند معتمد أو غير مسودة.'; END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_proc 
            JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid 
            WHERE pg_namespace.nspname = 'public' AND pg_proc.proname = 'restore_sales_invoice'
        ) THEN
            RAISE EXCEPTION 'دالة الاستعادة لهذا النوع من المستندات غير متاحة. تحقق من تشغيل Migration سلة المحذوفات.';
        END IF;

        PERFORM public.restore_sales_invoice(p_document_id);

    -- 2. Purchase Bill
    ELSIF p_document_type = 'purchase_bill' THEN
        SELECT organization_id, status, bill_number INTO v_org_id, v_status, v_doc_num 
        FROM public.purchase_bills 
        WHERE id = p_document_id AND deleted_at IS NOT NULL;

        IF v_org_id IS NULL THEN RAISE EXCEPTION 'المستند غير موجود في المحذوفات.'; END IF;
        IF v_status <> 'draft' THEN RAISE EXCEPTION 'لا يمكن استعادة مستند معتمد أو غير مسودة.'; END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_proc 
            JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid 
            WHERE pg_namespace.nspname = 'public' AND pg_proc.proname = 'restore_purchase_bill'
        ) THEN
            RAISE EXCEPTION 'دالة الاستعادة لهذا النوع من المستندات غير متاحة. تحقق من تشغيل Migration سلة المحذوفات.';
        END IF;

        PERFORM public.restore_purchase_bill(p_document_id);

    -- 3. Receipt
    ELSIF p_document_type = 'receipt' THEN
        SELECT organization_id, status, receipt_number INTO v_org_id, v_status, v_doc_num 
        FROM public.receipts 
        WHERE id = p_document_id AND deleted_at IS NOT NULL;

        IF v_org_id IS NULL THEN RAISE EXCEPTION 'المستند غير موجود في المحذوفات.'; END IF;
        IF v_status <> 'draft' THEN RAISE EXCEPTION 'لا يمكن استعادة مستند معتمد أو غير مسودة.'; END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_proc 
            JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid 
            WHERE pg_namespace.nspname = 'public' AND pg_proc.proname = 'restore_receipt'
        ) THEN
            RAISE EXCEPTION 'دالة الاستعادة لهذا النوع من المستندات غير متاحة. تحقق من تشغيل Migration سلة المحذوفات.';
        END IF;

        PERFORM public.restore_receipt(p_document_id);

    -- 4. Payment
    ELSIF p_document_type = 'payment' THEN
        SELECT organization_id, status, payment_number INTO v_org_id, v_status, v_doc_num 
        FROM public.payments 
        WHERE id = p_document_id AND deleted_at IS NOT NULL;

        IF v_org_id IS NULL THEN RAISE EXCEPTION 'المستند غير موجود في المحذوفات.'; END IF;
        IF v_status <> 'draft' THEN RAISE EXCEPTION 'لا يمكن استعادة مستند معتمد أو غير مسودة.'; END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_proc 
            JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid 
            WHERE pg_namespace.nspname = 'public' AND pg_proc.proname = 'restore_payment'
        ) THEN
            RAISE EXCEPTION 'دالة الاستعادة لهذا النوع من المستندات غير متاحة. تحقق من تشغيل Migration سلة المحذوفات.';
        END IF;

        PERFORM public.restore_payment(p_document_id);

    -- 5. Sales Credit Note
    ELSIF p_document_type = 'sales_credit_note' OR p_document_type = 'credit_note' THEN
        IF to_regclass('public.sales_credit_notes') IS NOT NULL THEN
            DECLARE
                v_num_col text := 'note_number';
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_credit_notes' AND column_name='credit_note_number') THEN
                    v_num_col := 'credit_note_number';
                END IF;

                EXECUTE 'SELECT organization_id, status, ' || v_num_col || ' FROM public.sales_credit_notes WHERE id = $1 AND deleted_at IS NOT NULL'
                INTO v_org_id, v_status, v_doc_num
                USING p_document_id;
            END;
        END IF;

        IF v_org_id IS NULL THEN RAISE EXCEPTION 'المستند غير موجود في المحذوفات.'; END IF;
        IF v_status <> 'draft' THEN RAISE EXCEPTION 'لا يمكن استعادة مستند معتمد أو غير مسودة.'; END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_proc 
            JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid 
            WHERE pg_namespace.nspname = 'public' AND pg_proc.proname = 'restore_sales_credit_note'
        ) THEN
            RAISE EXCEPTION 'دالة الاستعادة لهذا النوع من المستندات غير متاحة. تحقق من تشغيل Migration سلة المحذوفات.';
        END IF;

        PERFORM public.restore_sales_credit_note(p_document_id);

    -- 6. Purchase Debit Note
    ELSIF p_document_type = 'purchase_debit_note' OR p_document_type = 'debit_note' THEN
        IF to_regclass('public.purchase_debit_notes') IS NOT NULL THEN
            DECLARE
                v_num_col text := 'note_number';
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_debit_notes' AND column_name='debit_note_number') THEN
                    v_num_col := 'debit_note_number';
                END IF;

                EXECUTE 'SELECT organization_id, status, ' || v_num_col || ' FROM public.purchase_debit_notes WHERE id = $1 AND deleted_at IS NOT NULL'
                INTO v_org_id, v_status, v_doc_num
                USING p_document_id;
            END;
        END IF;

        IF v_org_id IS NULL THEN RAISE EXCEPTION 'المستند غير موجود في المحذوفات.'; END IF;
        IF v_status <> 'draft' THEN RAISE EXCEPTION 'لا يمكن استعادة مستند معتمد أو غير مسودة.'; END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_proc 
            JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid 
            WHERE pg_namespace.nspname = 'public' AND pg_proc.proname = 'restore_purchase_debit_note'
        ) THEN
            RAISE EXCEPTION 'دالة الاستعادة لهذا النوع من المستندات غير متاحة. تحقق من تشغيل Migration سلة المحذوفات.';
        END IF;

        PERFORM public.restore_purchase_debit_note(p_document_id);

    ELSE
        RAISE EXCEPTION 'نوع مستند غير صالح.';
    END IF;

    -- Audit Log
    IF to_regclass('public.platform_admin_audit_logs') IS NOT NULL THEN
        INSERT INTO public.platform_admin_audit_logs (
            admin_profile_id,
            action,
            target_organization_id,
            document_type,
            document_id,
            metadata
        ) VALUES (
            auth.uid(),
            'restore_document',
            v_org_id,
            p_document_type,
            p_document_id,
            jsonb_build_object(
                'document_number', v_doc_num,
                'restored_at', now()
            )
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_restore_deleted_document(text, uuid) TO authenticated;

-- Keep platform_restore_document as wrapper for legacy frontend calls
CREATE OR REPLACE FUNCTION public.platform_restore_document(
    p_document_type text,
    p_document_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM public.platform_restore_deleted_document(p_document_type, p_document_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_restore_document(text, uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
