-- =========================================================================
-- LEDGRA ADMIN-1A Document viewing fix
-- Name: 20260721000001_admin_platform_documents_fix.sql
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.platform_list_organization_documents(
    p_org_id uuid,
    p_document_type text
)
RETURNS TABLE (
    document_type text,
    document_id uuid,
    document_number text,
    document_date date,
    status text,
    party_name text,
    amount numeric,
    currency_code text,
    created_at timestamptz,
    created_by uuid,
    can_open boolean,
    notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_table_name text;
BEGIN
    -- 1. Check if the caller is an active platform admin
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح لك باستعراض حركات منشآت العملاء';
    END IF;

    -- 2. Determine the corresponding table name to check for existence
    v_table_name := CASE p_document_type
        WHEN 'sales_invoice' THEN 'sales_invoices'
        WHEN 'purchase_bill' THEN 'purchase_bills'
        WHEN 'receipt' THEN 'receipts'
        WHEN 'payment' THEN 'payments'
        WHEN 'credit_note' THEN 'sales_credit_notes'
        WHEN 'debit_note' THEN 'purchase_debit_notes'
        WHEN 'journal_entry' THEN 'journal_entries'
        ELSE NULL
    END;

    IF v_table_name IS NULL THEN
        RAISE EXCEPTION 'نوع مستند غير صالح: %', p_document_type;
    END IF;

    -- 3. Check if the table exists in the schema to prevent "Relation does not exist" exceptions
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name = v_table_name
    ) THEN
        IF p_document_type = 'debit_note' THEN
            RAISE EXCEPTION 'جدول الإشعارات المدينة غير متاح أو لم يتم تشغيل Migration الخاص به.';
        ELSIF p_document_type = 'credit_note' THEN
            RAISE EXCEPTION 'جدول الإشعارات الدائنة غير متاح أو لم يتم تشغيل Migration الخاص به.';
        ELSE
            RAISE EXCEPTION 'جدول % غير متاح في قاعدة البيانات.', v_table_name;
        END IF;
    END IF;

    -- 4. Execute dynamic query based on document type
    IF p_document_type = 'sales_invoice' THEN
        RETURN QUERY EXECUTE '
            SELECT 
                ''sales_invoice''::text,
                si.id,
                si.invoice_number::text,
                si.invoice_date,
                si.status::text,
                c.name::text,
                si.total::numeric,
                COALESCE(si.currency, org.currency_code, ''SAR'')::text,
                si.created_at,
                si.created_by,
                true::boolean,
                si.notes::text
            FROM public.sales_invoices si
            JOIN public.organizations org ON org.id = si.organization_id
            LEFT JOIN public.customers c ON c.id = si.customer_id
            WHERE si.organization_id = $1 AND si.deleted_at IS NULL
            ORDER BY si.invoice_date DESC, si.created_at DESC
        ' USING p_org_id;

    ELSIF p_document_type = 'purchase_bill' THEN
        RETURN QUERY EXECUTE '
            SELECT 
                ''purchase_bill''::text,
                pb.id,
                pb.bill_number::text,
                pb.bill_date,
                pb.status::text,
                v.name::text,
                pb.total::numeric,
                COALESCE(pb.currency, org.currency_code, ''SAR'')::text,
                pb.created_at,
                pb.created_by,
                true::boolean,
                pb.notes::text
            FROM public.purchase_bills pb
            JOIN public.organizations org ON org.id = pb.organization_id
            LEFT JOIN public.vendors v ON v.id = pb.vendor_id
            WHERE pb.organization_id = $1 AND pb.deleted_at IS NULL
            ORDER BY pb.bill_date DESC, pb.created_at DESC
        ' USING p_org_id;

    ELSIF p_document_type = 'receipt' THEN
        RETURN QUERY EXECUTE '
            SELECT 
                ''receipt''::text,
                r.id,
                r.receipt_number::text,
                r.receipt_date,
                r.status::text,
                c.name::text,
                r.amount::numeric,
                org.currency_code::text,
                r.created_at,
                r.created_by,
                true::boolean,
                r.notes::text
            FROM public.receipts r
            JOIN public.organizations org ON org.id = r.organization_id
            LEFT JOIN public.customers c ON c.id = r.customer_id
            WHERE r.organization_id = $1 AND r.deleted_at IS NULL
            ORDER BY r.receipt_date DESC, r.created_at DESC
        ' USING p_org_id;

    ELSIF p_document_type = 'payment' THEN
        RETURN QUERY EXECUTE '
            SELECT 
                ''payment''::text,
                p.id,
                p.payment_number::text,
                p.payment_date,
                p.status::text,
                v.name::text,
                p.amount::numeric,
                org.currency_code::text,
                p.created_at,
                p.created_by,
                true::boolean,
                p.notes::text
            FROM public.payments p
            JOIN public.organizations org ON org.id = p.organization_id
            LEFT JOIN public.vendors v ON v.id = p.vendor_id
            WHERE p.organization_id = $1 AND p.deleted_at IS NULL
            ORDER BY p.payment_date DESC, p.created_at DESC
        ' USING p_org_id;

    ELSIF p_document_type = 'credit_note' THEN
        RETURN QUERY EXECUTE '
            SELECT 
                ''credit_note''::text,
                scn.id,
                scn.credit_note_number::text,
                scn.credit_note_date,
                scn.status::text,
                c.name::text,
                scn.total_amount::numeric,
                COALESCE(scn.currency_code, org.currency_code, ''SAR'')::text,
                scn.created_at,
                scn.created_by,
                true::boolean,
                scn.notes::text
            FROM public.sales_credit_notes scn
            JOIN public.organizations org ON org.id = scn.organization_id
            LEFT JOIN public.customers c ON c.id = scn.customer_id
            WHERE scn.organization_id = $1 AND scn.deleted_at IS NULL
            ORDER BY scn.credit_note_date DESC, scn.created_at DESC
        ' USING p_org_id;

    ELSIF p_document_type = 'debit_note' THEN
        RETURN QUERY EXECUTE '
            SELECT 
                ''debit_note''::text,
                pdn.id,
                pdn.debit_note_number::text,
                pdn.debit_note_date,
                pdn.status::text,
                v.name::text,
                pdn.total_amount::numeric,
                COALESCE(pdn.currency_code, org.currency_code, ''SAR'')::text,
                pdn.created_at,
                pdn.created_by,
                true::boolean,
                pdn.notes::text
            FROM public.purchase_debit_notes pdn
            JOIN public.organizations org ON org.id = pdn.organization_id
            LEFT JOIN public.vendors v ON v.id = pdn.vendor_id
            WHERE pdn.organization_id = $1 AND pdn.deleted_at IS NULL
            ORDER BY pdn.debit_note_date DESC, pdn.created_at DESC
        ' USING p_org_id;

    ELSIF p_document_type = 'journal_entry' THEN
        RETURN QUERY EXECUTE '
            SELECT 
                ''journal_entry''::text,
                je.id,
                je.entry_number::text,
                je.entry_date,
                je.status::text,
                NULL::text,
                (SELECT COALESCE(SUM(jel.debit), 0.00)::numeric FROM public.journal_entry_lines jel WHERE jel.journal_entry_id = je.id),
                org.currency_code::text,
                je.created_at,
                je.created_by,
                true::boolean,
                je.description::text
            FROM public.journal_entries je
            JOIN public.organizations org ON org.id = je.organization_id
            WHERE je.organization_id = $1
            ORDER BY je.entry_date DESC, je.created_at DESC
        ' USING p_org_id;

    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_organization_documents(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_organization_documents(uuid, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
