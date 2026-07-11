-- ==========================================================
-- LEDGRA ARAP-1A: AGING REPORTS FOR CUSTOMERS & VENDORS
-- ==========================================================

BEGIN;

-- 1. DROP EXISTING FUNCTIONS IF ANY
DROP FUNCTION IF EXISTS public.get_customer_aging_report(uuid, date);
DROP FUNCTION IF EXISTS public.get_vendor_aging_report(uuid, date);

-- 2. CREATE FUNCTION: get_customer_aging_report
CREATE OR REPLACE FUNCTION public.get_customer_aging_report(
    p_organization_id uuid,
    p_as_of_date date default current_date
)
RETURNS TABLE (
    customer_id uuid,
    customer_name text,
    customer_code text,
    total_due numeric,
    not_due numeric,
    bucket_0_30 numeric,
    bucket_31_60 numeric,
    bucket_61_90 numeric,
    bucket_over_90 numeric,
    last_invoice_number text,
    last_invoice_date date,
    last_receipt_number text,
    last_receipt_date date,
    currency_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- A. Authentication Check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- B. Authorization Check (Only owner, admin, accountant, viewer. Deny sales role)
    IF NOT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_organization_id
          AND profile_id = auth.uid()
          AND COALESCE(is_active, true) = true
          AND role IN ('owner', 'admin', 'accountant', 'viewer')
    ) THEN
        RAISE EXCEPTION 'غير مصرح: ليس لديك الصلاحية لعرض تقرير أعمار ذمم العملاء.';
    END IF;

    RETURN QUERY
    WITH invoice_balances AS (
        SELECT 
            si.id AS invoice_id,
            si.customer_id,
            si.invoice_number,
            si.invoice_date,
            si.due_date,
            si.total AS orig_total,
            -- Calculate payments allocated on or before p_as_of_date
            COALESCE((
                SELECT SUM(ra.allocated_amount)
                FROM public.receipt_allocations ra
                JOIN public.receipts r ON ra.receipt_id = r.id
                WHERE ra.sales_invoice_id = si.id
                  AND r.status = 'approved'
                  AND r.receipt_date <= p_as_of_date
                  AND r.deleted_at IS NULL
            ), 0) AS total_paid,
            -- Calculate credit notes approved on or before p_as_of_date
            COALESCE((
                SELECT SUM(scn.total_amount)
                FROM public.sales_credit_notes scn
                WHERE scn.original_invoice_id = si.id
                  AND scn.status = 'approved'
                  AND scn.credit_note_date <= p_as_of_date
                  AND scn.deleted_at IS NULL
            ), 0) AS total_credit
        FROM public.sales_invoices si
        WHERE si.organization_id = p_organization_id
          AND si.status = 'approved'
          AND si.invoice_date <= p_as_of_date
          AND si.deleted_at IS NULL
    ),
    invoice_outstanding AS (
        SELECT 
            ib.customer_id,
            ib.invoice_id,
            ib.invoice_number,
            ib.invoice_date,
            ib.due_date,
            (ib.orig_total - ib.total_paid - ib.total_credit) AS balance_due,
            (p_as_of_date - COALESCE(ib.due_date, ib.invoice_date)) AS age_days
        FROM invoice_balances ib
        WHERE (ib.orig_total - ib.total_paid - ib.total_credit) > 0
    ),
    customer_last_invoice AS (
        SELECT DISTINCT ON (si.customer_id)
            si.customer_id,
            si.invoice_number,
            si.invoice_date
        FROM public.sales_invoices si
        WHERE si.organization_id = p_organization_id
          AND si.status = 'approved'
          AND si.invoice_date <= p_as_of_date
          AND si.deleted_at IS NULL
        ORDER BY si.customer_id, si.invoice_date DESC, si.created_at DESC
    ),
    customer_last_receipt AS (
        SELECT DISTINCT ON (r.customer_id)
            r.customer_id,
            r.receipt_number,
            r.receipt_date
        FROM public.receipts r
        WHERE r.organization_id = p_organization_id
          AND r.status = 'approved'
          AND r.receipt_date <= p_as_of_date
          AND r.deleted_at IS NULL
        ORDER BY r.customer_id, r.receipt_date DESC, r.created_at DESC
    ),
    org_currency AS (
        SELECT currency_code 
        FROM public.organizations 
        WHERE id = p_organization_id
        LIMIT 1
    )
    SELECT 
        c.id AS customer_id,
        c.name AS customer_name,
        c.code AS customer_code,
        COALESCE(SUM(io.balance_due), 0)::numeric AS total_due,
        COALESCE(SUM(CASE WHEN io.age_days < 0 THEN io.balance_due ELSE 0 END), 0)::numeric AS not_due,
        COALESCE(SUM(CASE WHEN io.age_days BETWEEN 0 AND 30 THEN io.balance_due ELSE 0 END), 0)::numeric AS bucket_0_30,
        COALESCE(SUM(CASE WHEN io.age_days BETWEEN 31 AND 60 THEN io.balance_due ELSE 0 END), 0)::numeric AS bucket_31_60,
        COALESCE(SUM(CASE WHEN io.age_days BETWEEN 61 AND 90 THEN io.balance_due ELSE 0 END), 0)::numeric AS bucket_61_90,
        COALESCE(SUM(CASE WHEN io.age_days > 90 THEN io.balance_due ELSE 0 END), 0)::numeric AS bucket_over_90,
        cli.invoice_number AS last_invoice_number,
        cli.invoice_date AS last_invoice_date,
        clr.receipt_number AS last_receipt_number,
        clr.receipt_date AS last_receipt_date,
        COALESCE(oc.currency_code, 'SAR') AS currency_code
    FROM public.customers c
    LEFT JOIN invoice_outstanding io ON c.id = io.customer_id
    LEFT JOIN customer_last_invoice cli ON c.id = cli.customer_id
    LEFT JOIN customer_last_receipt clr ON c.id = clr.customer_id
    CROSS JOIN org_currency oc
    WHERE c.organization_id = p_organization_id
      AND c.is_active = true
    GROUP BY c.id, c.name, c.code, cli.invoice_number, cli.invoice_date, clr.receipt_number, clr.receipt_date, oc.currency_code
    HAVING COALESCE(SUM(io.balance_due), 0) > 0
    ORDER BY c.name ASC;
END;
$$;

-- 3. CREATE FUNCTION: get_vendor_aging_report
CREATE OR REPLACE FUNCTION public.get_vendor_aging_report(
    p_organization_id uuid,
    p_as_of_date date default current_date
)
RETURNS TABLE (
    vendor_id uuid,
    vendor_name text,
    vendor_code text,
    total_due numeric,
    not_due numeric,
    bucket_0_30 numeric,
    bucket_31_60 numeric,
    bucket_61_90 numeric,
    bucket_over_90 numeric,
    last_bill_number text,
    last_bill_date date,
    last_payment_number text,
    last_payment_date date,
    currency_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- A. Authentication Check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- B. Authorization Check (Only owner, admin, accountant, viewer. Deny sales role)
    IF NOT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_organization_id
          AND profile_id = auth.uid()
          AND COALESCE(is_active, true) = true
          AND role IN ('owner', 'admin', 'accountant', 'viewer')
    ) THEN
        RAISE EXCEPTION 'غير مصرح: ليس لديك الصلاحية لعرض تقرير أعمار ذمم الموردين.';
    END IF;

    RETURN QUERY
    WITH bill_balances AS (
        SELECT 
            pb.id AS bill_id,
            pb.vendor_id,
            pb.bill_number,
            pb.bill_date,
            pb.due_date,
            pb.total AS orig_total,
            -- Calculate payments allocated on or before p_as_of_date
            COALESCE((
                SELECT SUM(pa.allocated_amount)
                FROM public.payment_allocations pa
                JOIN public.payments p ON pa.payment_id = p.id
                WHERE pa.purchase_bill_id = pb.id
                  AND p.status = 'approved'
                  AND p.payment_date <= p_as_of_date
                  AND p.deleted_at IS NULL
            ), 0) AS total_paid,
            -- Calculate debit notes approved on or before p_as_of_date
            COALESCE((
                SELECT SUM(pdn.total_amount)
                FROM public.purchase_debit_notes pdn
                WHERE pdn.original_bill_id = pb.id
                  AND pdn.status = 'approved'
                  AND pdn.debit_note_date <= p_as_of_date
                  AND pdn.deleted_at IS NULL
            ), 0) AS total_debit
        FROM public.purchase_bills pb
        WHERE pb.organization_id = p_organization_id
          AND pb.status = 'approved'
          AND pb.bill_date <= p_as_of_date
          AND pb.deleted_at IS NULL
    ),
    bill_outstanding AS (
        SELECT 
            bb.vendor_id,
            bb.bill_id,
            bb.bill_number,
            bb.bill_date,
            bb.due_date,
            (bb.orig_total - bb.total_paid - bb.total_debit) AS balance_due,
            (p_as_of_date - COALESCE(bb.due_date, bb.bill_date)) AS age_days
        FROM bill_balances bb
        WHERE (bb.orig_total - bb.total_paid - bb.total_debit) > 0
    ),
    vendor_last_bill AS (
        SELECT DISTINCT ON (pb.vendor_id)
            pb.vendor_id,
            pb.bill_number,
            pb.bill_date
        FROM public.purchase_bills pb
        WHERE pb.organization_id = p_organization_id
          AND pb.status = 'approved'
          AND pb.bill_date <= p_as_of_date
          AND pb.deleted_at IS NULL
        ORDER BY pb.vendor_id, pb.bill_date DESC, pb.created_at DESC
    ),
    vendor_last_payment AS (
        SELECT DISTINCT ON (p.vendor_id)
            p.vendor_id,
            p.payment_number,
            p.payment_date
        FROM public.payments p
        WHERE p.organization_id = p_organization_id
          AND p.status = 'approved'
          AND p.payment_date <= p_as_of_date
          AND p.deleted_at IS NULL
        ORDER BY p.vendor_id, p.payment_date DESC, p.created_at DESC
    ),
    org_currency AS (
        SELECT currency_code 
        FROM public.organizations 
        WHERE id = p_organization_id
        LIMIT 1
    )
    SELECT 
        v.id AS vendor_id,
        v.name AS vendor_name,
        v.code AS vendor_code,
        COALESCE(SUM(bo.balance_due), 0)::numeric AS total_due,
        COALESCE(SUM(CASE WHEN bo.age_days < 0 THEN bo.balance_due ELSE 0 END), 0)::numeric AS not_due,
        COALESCE(SUM(CASE WHEN bo.age_days BETWEEN 0 AND 30 THEN bo.balance_due ELSE 0 END), 0)::numeric AS bucket_0_30,
        COALESCE(SUM(CASE WHEN bo.age_days BETWEEN 31 AND 60 THEN bo.balance_due ELSE 0 END), 0)::numeric AS bucket_31_60,
        COALESCE(SUM(CASE WHEN bo.age_days BETWEEN 61 AND 90 THEN bo.balance_due ELSE 0 END), 0)::numeric AS bucket_61_90,
        COALESCE(SUM(CASE WHEN bo.age_days > 90 THEN bo.balance_due ELSE 0 END), 0)::numeric AS bucket_over_90,
        vlb.bill_number AS last_bill_number,
        vlb.bill_date AS last_bill_date,
        vlp.payment_number AS last_payment_number,
        vlp.payment_date AS last_payment_date,
        COALESCE(oc.currency_code, 'SAR') AS currency_code
    FROM public.vendors v
    LEFT JOIN bill_outstanding bo ON v.id = bo.vendor_id
    LEFT JOIN vendor_last_bill vlb ON v.id = vlb.vendor_id
    LEFT JOIN vendor_last_payment vlp ON v.id = vlp.vendor_id
    CROSS JOIN org_currency oc
    WHERE v.organization_id = p_organization_id
      AND v.is_active = true
    GROUP BY v.id, v.name, v.code, vlb.bill_number, vlb.bill_date, vlp.payment_number, vlp.payment_date, oc.currency_code
    HAVING COALESCE(SUM(bo.balance_due), 0) > 0
    ORDER BY v.name ASC;
END;
$$;

-- 4. REVOKE AND GRANT PRIVILEGES
REVOKE ALL ON FUNCTION public.get_customer_aging_report(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_vendor_aging_report(uuid, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_customer_aging_report(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_aging_report(uuid, date) TO authenticated;

-- 5. RELOAD SCHEMA NOTIFICATION
NOTIFY pgrst, 'reload schema';

COMMIT;
