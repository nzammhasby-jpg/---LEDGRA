-- ==========================================================
-- LEDGRA ADMIN-1A: PLATFORM ADMIN CONSOLE & SUPPORT OVERSIGHT
-- ==========================================================

BEGIN;

-- 1. Create public.platform_admins table if it does not exist (precaution)
CREATE TABLE IF NOT EXISTS public.platform_admins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'platform_admin',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id),
    CONSTRAINT platform_admins_profile_id_key UNIQUE (profile_id)
);

-- Ensure correct role check constraint safely
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_schema = 'public' 
          AND table_name = 'platform_admins' 
          AND constraint_type = 'CHECK'
    LOOP
        EXECUTE 'ALTER TABLE public.platform_admins DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END;
$$;

-- Add updated role check constraint supporting: super_admin, platform_admin, support, support_admin, billing_admin
ALTER TABLE public.platform_admins 
    ADD CONSTRAINT platform_admins_role_check 
    CHECK (role IN ('super_admin', 'platform_admin', 'support', 'support_admin', 'billing_admin'));

-- Ensure RLS is enabled
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- 2. Create public.platform_admin_audit_logs table
CREATE TABLE IF NOT EXISTS public.platform_admin_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_profile_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action text NOT NULL,
    target_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
    target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    document_type text,
    document_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on audit logs
ALTER TABLE public.platform_admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Revoke write permissions to ensure logging only happens via SECURITY DEFINER functions
REVOKE ALL ON TABLE public.platform_admin_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_admin_audit_logs TO authenticated;

-- Policy: Only active platform admins can select from audit logs
CREATE POLICY select_platform_admin_audit_logs ON public.platform_admin_audit_logs
FOR SELECT TO authenticated USING (public.is_platform_admin());

-- 3. Core functions for Platform Admin detection
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.platform_admins
    WHERE profile_id = auth.uid() AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_platform_admin_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.platform_admins
  WHERE profile_id = auth.uid() AND is_active = true;
  
  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.get_platform_admin_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_admin_role() TO authenticated;

-- 4. Dashboard Stats RPC
CREATE OR REPLACE FUNCTION public.platform_get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_count integer;
  v_user_count integer;
  v_sales_invoice_count integer;
  v_purchase_bill_count integer;
  v_receipt_count integer;
  v_payment_count integer;
  v_deleted_count integer;
  v_recent_activities jsonb;
  v_unusual_orgs jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحيات إدارة المنصة.';
  END IF;

  -- 1. Counts
  SELECT COUNT(*)::integer INTO v_org_count FROM public.organizations;
  SELECT COUNT(*)::integer INTO v_user_count FROM public.profiles;
  SELECT COUNT(*)::integer INTO v_sales_invoice_count FROM public.sales_invoices WHERE deleted_at IS NULL;
  SELECT COUNT(*)::integer INTO v_purchase_bill_count FROM public.purchase_bills WHERE deleted_at IS NULL;
  SELECT COUNT(*)::integer INTO v_receipt_count FROM public.receipts WHERE deleted_at IS NULL;
  SELECT COUNT(*)::integer INTO v_payment_count FROM public.payments WHERE deleted_at IS NULL;

  -- Soft-deleted count
  SELECT (
    (SELECT COUNT(*) FROM public.sales_invoices WHERE deleted_at IS NOT NULL) +
    (SELECT COUNT(*) FROM public.purchase_bills WHERE deleted_at IS NOT NULL) +
    (SELECT COUNT(*) FROM public.receipts WHERE deleted_at IS NOT NULL) +
    (SELECT COUNT(*) FROM public.payments WHERE deleted_at IS NOT NULL) +
    (SELECT COUNT(*) FROM public.sales_credit_notes WHERE deleted_at IS NOT NULL) +
    (SELECT COUNT(*) FROM public.purchase_debit_notes WHERE deleted_at IS NOT NULL)
  )::integer INTO v_deleted_count;

  -- 2. Recent admin audit log activities
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_recent_activities
  FROM (
    SELECT 
      l.id,
      l.action,
      l.created_at,
      l.metadata,
      l.document_type,
      l.document_id,
      p.full_name AS admin_name,
      o.name_ar AS org_name
    FROM public.platform_admin_audit_logs l
    LEFT JOIN public.profiles p ON p.id = l.admin_profile_id
    LEFT JOIN public.organizations o ON o.id = l.target_organization_id
    ORDER BY l.created_at DESC
    LIMIT 10
  ) x;

  -- 3. Organizations with status changes, expired trial, suspended, etc.
  SELECT COALESCE(jsonb_agg(y), '[]'::jsonb) INTO v_unusual_orgs
  FROM (
    SELECT 
      o.id AS organization_id,
      o.name_ar AS organization_name,
      s.status AS subscription_status,
      pl.name_ar AS plan_name,
      s.ends_at,
      s.trial_ends_at
    FROM public.organizations o
    JOIN public.organization_subscriptions s ON s.organization_id = o.id
    LEFT JOIN public.subscription_plans pl ON pl.id = s.plan_id
    WHERE s.status IN ('suspended', 'past_due') 
       OR (s.status = 'trial' AND s.trial_ends_at < now())
    ORDER BY o.created_at DESC
    LIMIT 5
  ) y;

  RETURN jsonb_build_object(
    'orgs_count', v_org_count,
    'users_count', v_user_count,
    'sales_invoices_count', v_sales_invoice_count,
    'purchase_bills_count', v_purchase_bill_count,
    'receipts_count', v_receipt_count,
    'payments_count', v_payment_count,
    'deleted_documents_count', v_deleted_count,
    'recent_activities', v_recent_activities,
    'unusual_organizations', v_unusual_orgs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_dashboard_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_dashboard_stats() TO authenticated;

-- 5. List Users RPC
CREATE OR REPLACE FUNCTION public.platform_list_users()
RETURNS TABLE (
    profile_id uuid,
    full_name text,
    email text,
    phone text,
    created_at timestamptz,
    organizations_json jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحيات إدارة المنصة.';
    END IF;

    RETURN QUERY
    SELECT 
        p.id AS profile_id,
        p.full_name AS full_name,
        COALESCE(u.email, 'غير محدد')::text AS email,
        p.phone AS phone,
        p.created_at AS created_at,
        (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'org_id', om.organization_id,
                'org_name', COALESCE(o.name_ar, o.name_en),
                'role', om.role,
                'is_active', COALESCE(om.is_active, true)
            )), '[]'::jsonb)
            FROM public.organization_members om
            JOIN public.organizations o ON o.id = om.organization_id
            WHERE om.profile_id = p.id
        ) AS organizations_json
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    ORDER BY p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_users() TO authenticated;

-- 6. Get Organization Members RPC
CREATE OR REPLACE FUNCTION public.platform_get_org_members(p_org_id uuid)
RETURNS TABLE (
    profile_id uuid,
    full_name text,
    email text,
    phone text,
    role text,
    is_active boolean,
    joined_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحيات إدارة المنصة.';
    END IF;

    RETURN QUERY
    SELECT 
        p.id AS profile_id,
        p.full_name,
        COALESCE(u.email, 'غير محدد')::text AS email,
        p.phone,
        om.role::text,
        COALESCE(om.is_active, true),
        om.created_at AS joined_at
    FROM public.organization_members om
    JOIN public.profiles p ON p.id = om.profile_id
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE om.organization_id = p_org_id
    ORDER BY om.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_org_members(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_org_members(uuid) TO authenticated;

-- 7. Document Read-Only RPCs for Platform Admin Console
CREATE OR REPLACE FUNCTION public.platform_list_org_sales_invoices(p_org_id uuid)
RETURNS TABLE (
    id uuid,
    invoice_number text,
    invoice_date date,
    due_date date,
    status text,
    payment_status text,
    total numeric,
    balance_due numeric,
    currency text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح.';
    END IF;

    RETURN QUERY
    SELECT 
        si.id,
        si.invoice_number,
        si.invoice_date,
        si.due_date,
        si.status::text,
        si.payment_status::text,
        si.total::numeric,
        si.balance_due::numeric,
        si.currency::text,
        si.created_at
    FROM public.sales_invoices si
    WHERE si.organization_id = p_org_id AND si.deleted_at IS NULL
    ORDER BY si.invoice_date DESC, si.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_org_sales_invoices(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_org_sales_invoices(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_list_org_purchase_bills(p_org_id uuid)
RETURNS TABLE (
    id uuid,
    bill_number text,
    bill_date date,
    due_date date,
    status text,
    payment_status text,
    total numeric,
    balance_due numeric,
    currency text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح.';
    END IF;

    RETURN QUERY
    SELECT 
        pb.id,
        pb.bill_number,
        pb.bill_date,
        pb.due_date,
        pb.status::text,
        pb.payment_status::text,
        pb.total::numeric,
        pb.balance_due::numeric,
        pb.currency::text,
        pb.created_at
    FROM public.purchase_bills pb
    WHERE pb.organization_id = p_org_id AND pb.deleted_at IS NULL
    ORDER BY pb.bill_date DESC, pb.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_org_purchase_bills(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_org_purchase_bills(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_list_org_receipts(p_org_id uuid)
RETURNS TABLE (
    id uuid,
    receipt_number text,
    receipt_date date,
    amount numeric,
    payment_method text,
    status text,
    currency text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح.';
    END IF;

    RETURN QUERY
    SELECT 
        r.id,
        r.receipt_number,
        r.receipt_date,
        r.amount::numeric,
        r.payment_method::text,
        r.status::text,
        r.currency::text,
        r.created_at
    FROM public.receipts r
    WHERE r.organization_id = p_org_id AND r.deleted_at IS NULL
    ORDER BY r.receipt_date DESC, r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_org_receipts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_org_receipts(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_list_org_payments(p_org_id uuid)
RETURNS TABLE (
    id uuid,
    payment_number text,
    payment_date date,
    amount numeric,
    payment_method text,
    status text,
    currency text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح.';
    END IF;

    RETURN QUERY
    SELECT 
        pay.id,
        pay.payment_number,
        pay.payment_date,
        pay.amount::numeric,
        pay.payment_method::text,
        pay.status::text,
        pay.currency::text,
        pay.created_at
    FROM public.payments pay
    WHERE pay.organization_id = p_org_id AND pay.deleted_at IS NULL
    ORDER BY pay.payment_date DESC, pay.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_org_payments(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_org_payments(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_list_org_credit_notes(p_org_id uuid)
RETURNS TABLE (
    id uuid,
    note_number text,
    note_date date,
    status text,
    total numeric,
    currency text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح.';
    END IF;

    RETURN QUERY
    SELECT 
        scn.id,
        scn.note_number,
        scn.note_date,
        scn.status::text,
        scn.total::numeric,
        scn.currency::text,
        scn.created_at
    FROM public.sales_credit_notes scn
    WHERE scn.organization_id = p_org_id AND scn.deleted_at IS NULL
    ORDER BY scn.note_date DESC, scn.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_org_credit_notes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_org_credit_notes(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_list_org_debit_notes(p_org_id uuid)
RETURNS TABLE (
    id uuid,
    note_number text,
    note_date date,
    status text,
    total numeric,
    currency text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح.';
    END IF;

    RETURN QUERY
    SELECT 
        pdn.id,
        pdn.note_number,
        pdn.note_date,
        pdn.status::text,
        pdn.total::numeric,
        pdn.currency::text,
        pdn.created_at
    FROM public.purchase_debit_notes pdn
    WHERE pdn.organization_id = p_org_id AND pdn.deleted_at IS NULL
    ORDER BY pdn.note_date DESC, pdn.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_org_debit_notes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_org_debit_notes(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_list_org_journal_entries(p_org_id uuid)
RETURNS TABLE (
    id uuid,
    entry_number text,
    entry_date date,
    reference text,
    description text,
    source_type text,
    status text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح.';
    END IF;

    RETURN QUERY
    SELECT 
        je.id,
        je.entry_number,
        je.entry_date,
        je.reference,
        je.description,
        je.source_type::text,
        je.status::text,
        je.created_at
    FROM public.journal_entries je
    WHERE je.organization_id = p_org_id
    ORDER BY je.entry_date DESC, je.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_org_journal_entries(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_org_journal_entries(uuid) TO authenticated;

-- 8. Platform Deleted Documents Cross-Tenant Access RPC
CREATE OR REPLACE FUNCTION public.platform_list_deleted_documents()
RETURNS TABLE (
    document_id uuid,
    organization_id uuid,
    organization_name text,
    document_type text,
    document_number text,
    status text,
    amount numeric,
    currency text,
    deleted_by_name text,
    deleted_at timestamptz,
    delete_reason text,
    can_restore boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحيات إدارة المنصة.';
    END IF;

    RETURN QUERY
    -- 1. Sales Invoices
    SELECT 
        si.id AS document_id,
        si.organization_id,
        COALESCE(o.name_ar, o.name_en, 'منشأة غير مسماة')::text AS organization_name,
        'sales_invoice'::text AS document_type,
        si.invoice_number AS document_number,
        si.status::text,
        si.total::numeric AS amount,
        si.currency::text,
        COALESCE(p.full_name, 'غير محدد')::text AS deleted_by_name,
        si.deleted_at,
        si.delete_reason,
        (si.status = 'draft')::boolean AS can_restore
    FROM public.sales_invoices si
    JOIN public.organizations o ON o.id = si.organization_id
    LEFT JOIN public.profiles p ON p.id = si.deleted_by
    WHERE si.deleted_at IS NOT NULL

    UNION ALL

    -- 2. Purchase Bills
    SELECT 
        pb.id AS document_id,
        pb.organization_id,
        COALESCE(o.name_ar, o.name_en, 'منشأة غير مسماة')::text AS organization_name,
        'purchase_bill'::text AS document_type,
        pb.bill_number AS document_number,
        pb.status::text,
        pb.total::numeric AS amount,
        pb.currency::text,
        COALESCE(p.full_name, 'غير محدد')::text AS deleted_by_name,
        pb.deleted_at,
        pb.delete_reason,
        (pb.status = 'draft')::boolean AS can_restore
    FROM public.purchase_bills pb
    JOIN public.organizations o ON o.id = pb.organization_id
    LEFT JOIN public.profiles p ON p.id = pb.deleted_by
    WHERE pb.deleted_at IS NOT NULL

    UNION ALL

    -- 3. Receipts
    SELECT 
        r.id AS document_id,
        r.organization_id,
        COALESCE(o.name_ar, o.name_en, 'منشأة غير مسماة')::text AS organization_name,
        'receipt'::text AS document_type,
        r.receipt_number AS document_number,
        r.status::text,
        r.amount::numeric AS amount,
        r.currency::text,
        COALESCE(p.full_name, 'غير محدد')::text AS deleted_by_name,
        r.deleted_at,
        r.delete_reason,
        (r.status = 'draft')::boolean AS can_restore
    FROM public.receipts r
    JOIN public.organizations o ON o.id = r.organization_id
    LEFT JOIN public.profiles p ON p.id = r.deleted_by
    WHERE r.deleted_at IS NOT NULL

    UNION ALL

    -- 4. Payments
    SELECT 
        pay.id AS document_id,
        pay.organization_id,
        COALESCE(o.name_ar, o.name_en, 'منشأة غير مسماة')::text AS organization_name,
        'payment'::text AS document_type,
        pay.payment_number AS document_number,
        pay.status::text,
        pay.amount::numeric AS amount,
        pay.currency::text,
        COALESCE(p.full_name, 'غير محدد')::text AS deleted_by_name,
        pay.deleted_at,
        pay.delete_reason,
        (pay.status = 'draft')::boolean AS can_restore
    FROM public.payments pay
    JOIN public.organizations o ON o.id = pay.organization_id
    LEFT JOIN public.profiles p ON p.id = pay.deleted_by
    WHERE pay.deleted_at IS NOT NULL

    UNION ALL

    -- 5. Sales Credit Notes
    SELECT 
        scn.id AS document_id,
        scn.organization_id,
        COALESCE(o.name_ar, o.name_en, 'منشأة غير مسماة')::text AS organization_name,
        'sales_credit_note'::text AS document_type,
        scn.note_number AS document_number,
        scn.status::text,
        scn.total::numeric AS amount,
        scn.currency::text,
        COALESCE(p.full_name, 'غير محدد')::text AS deleted_by_name,
        scn.deleted_at,
        scn.delete_reason,
        (scn.status = 'draft')::boolean AS can_restore
    FROM public.sales_credit_notes scn
    JOIN public.organizations o ON o.id = scn.organization_id
    LEFT JOIN public.profiles p ON p.id = scn.deleted_by
    WHERE scn.deleted_at IS NOT NULL

    UNION ALL

    -- 6. Purchase Debit Notes
    SELECT 
        pdn.id AS document_id,
        pdn.organization_id,
        COALESCE(o.name_ar, o.name_en, 'منشأة غير مسماة')::text AS organization_name,
        'purchase_debit_note'::text AS document_type,
        pdn.note_number AS document_number,
        pdn.status::text,
        pdn.total::numeric AS amount,
        pdn.currency::text,
        COALESCE(p.full_name, 'غير محدد')::text AS deleted_by_name,
        pdn.deleted_at,
        pdn.delete_reason,
        (pdn.status = 'draft')::boolean AS can_restore
    FROM public.purchase_debit_notes pdn
    JOIN public.organizations o ON o.id = pdn.organization_id
    LEFT JOIN public.profiles p ON p.id = pdn.deleted_by
    WHERE pdn.deleted_at IS NOT NULL

    ORDER BY deleted_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_deleted_documents() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_deleted_documents() TO authenticated;

-- 9. Centralized Restore document RPC
CREATE OR REPLACE FUNCTION public.platform_restore_document(
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
        RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحيات إدارة المنصة.';
    END IF;

    -- Verify that the role is not 'support' (only platform_admin or super_admin can restore)
    SELECT role INTO v_role 
    FROM public.platform_admins 
    WHERE profile_id = auth.uid() AND is_active = true;

    IF v_role = 'support' THEN
        RAISE EXCEPTION 'غير مصرح: دور الدعم الفني لديه صلاحيات القراءة فقط ولا يمكنه استعادة المستندات.';
    END IF;

    -- 1. Get info and perform the restore based on document type
    IF p_document_type = 'sales_invoice' THEN
        SELECT organization_id, status, invoice_number INTO v_org_id, v_status, v_doc_num 
        FROM public.sales_invoices 
        WHERE id = p_document_id AND deleted_at IS NOT NULL;

        IF v_org_id IS NULL THEN RAISE EXCEPTION 'المستند غير موجود في المحذوفات.'; END IF;
        IF v_status <> 'draft' THEN RAISE EXCEPTION 'لا يمكن استعادة مستند معتمد أو غير مسودة.'; END IF;

        UPDATE public.sales_invoices
        SET deleted_at = null, deleted_by = null, delete_reason = null, restored_at = now(), restored_by = auth.uid()
        WHERE id = p_document_id;

    ELSIF p_document_type = 'purchase_bill' THEN
        SELECT organization_id, status, bill_number INTO v_org_id, v_status, v_doc_num 
        FROM public.purchase_bills 
        WHERE id = p_document_id AND deleted_at IS NOT NULL;

        IF v_org_id IS NULL THEN RAISE EXCEPTION 'المستند غير موجود في المحذوفات.'; END IF;
        IF v_status <> 'draft' THEN RAISE EXCEPTION 'لا يمكن استعادة مستند معتمد أو غير مسودة.'; END IF;

        UPDATE public.purchase_bills
        SET deleted_at = null, deleted_by = null, delete_reason = null, restored_at = now(), restored_by = auth.uid()
        WHERE id = p_document_id;

    ELSIF p_document_type = 'receipt' THEN
        SELECT organization_id, status, receipt_number INTO v_org_id, v_status, v_doc_num 
        FROM public.receipts 
        WHERE id = p_document_id AND deleted_at IS NOT NULL;

        IF v_org_id IS NULL THEN RAISE EXCEPTION 'المستند غير موجود في المحذوفات.'; END IF;
        IF v_status <> 'draft' THEN RAISE EXCEPTION 'لا يمكن استعادة مستند معتمد أو غير مسودة.'; END IF;

        UPDATE public.receipts
        SET deleted_at = null, deleted_by = null, delete_reason = null, restored_at = now(), restored_by = auth.uid()
        WHERE id = p_document_id;

    ELSIF p_document_type = 'payment' THEN
        SELECT organization_id, status, payment_number INTO v_org_id, v_status, v_doc_num 
        FROM public.payments 
        WHERE id = p_document_id AND deleted_at IS NOT NULL;

        IF v_org_id IS NULL THEN RAISE EXCEPTION 'المستند غير موجود في المحذوفات.'; END IF;
        IF v_status <> 'draft' THEN RAISE EXCEPTION 'لا يمكن استعادة مستند معتمد أو غير مسودة.'; END IF;

        UPDATE public.payments
        SET deleted_at = null, deleted_by = null, delete_reason = null, restored_at = now(), restored_by = auth.uid()
        WHERE id = p_document_id;

    ELSIF p_document_type = 'sales_credit_note' THEN
        SELECT organization_id, status, note_number INTO v_org_id, v_status, v_doc_num 
        FROM public.sales_credit_notes 
        WHERE id = p_document_id AND deleted_at IS NOT NULL;

        IF v_org_id IS NULL THEN RAISE EXCEPTION 'المستند غير موجود في المحذوفات.'; END IF;
        IF v_status <> 'draft' THEN RAISE EXCEPTION 'لا يمكن استعادة مستند معتمد أو غير مسودة.'; END IF;

        UPDATE public.sales_credit_notes
        SET deleted_at = null, deleted_by = null, delete_reason = null, restored_at = now(), restored_by = auth.uid()
        WHERE id = p_document_id;

    ELSIF p_document_type = 'purchase_debit_note' THEN
        SELECT organization_id, status, note_number INTO v_org_id, v_status, v_doc_num 
        FROM public.purchase_debit_notes 
        WHERE id = p_document_id AND deleted_at IS NOT NULL;

        IF v_org_id IS NULL THEN RAISE EXCEPTION 'المستند غير موجود في المحذوفات.'; END IF;
        IF v_status <> 'draft' THEN RAISE EXCEPTION 'لا يمكن استعادة مستند معتمد أو غير مسودة.'; END IF;

        UPDATE public.purchase_debit_notes
        SET deleted_at = null, deleted_by = null, delete_reason = null, restored_at = now(), restored_by = auth.uid()
        WHERE id = p_document_id;

    ELSE
        RAISE EXCEPTION 'نوع مستند غير صالح.';
    END IF;

    -- 2. Audit Log
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
END;
$$;

REVOKE ALL ON FUNCTION public.platform_restore_document(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_restore_document(text, uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
