-- =========================================================================
-- LEDGRA: Secure Multi-Tenant Trash User Profiles RPC
-- Name: 20260820000000_secure_trash_user_profiles_rpc.sql
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_organization_trash_user_profiles(
    p_organization_id uuid,
    p_user_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    full_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- 1. Verify that the authenticated caller is an active member of the requested organization
    IF NOT public.is_org_member(p_organization_id) THEN
        RAISE EXCEPTION 'غير مصرح: ليس لديك صلاحية الوصول لبيانات هذه المنشأة.';
    END IF;

    -- 2. If an empty array of user IDs is passed, return immediately
    IF p_user_ids IS NOT NULL AND cardinality(p_user_ids) = 0 THEN
        RETURN;
    END IF;

    -- 3. Return ONLY profiles associated with this organization
    --    (either active/past members or users referenced in financial documents of this org)
    RETURN QUERY
    SELECT DISTINCT
        p.id,
        COALESCE(NULLIF(TRIM(p.full_name), ''), 'مستخدم النظام') AS full_name
    FROM public.profiles p
    WHERE (
        -- User is/was an organization member in this organization
        EXISTS (
            SELECT 1 
            FROM public.organization_members m 
            WHERE m.organization_id = p_organization_id 
              AND m.profile_id = p.id
        )
        -- Or user is referenced as deleted_by on documents in this organization
        OR EXISTS (
            SELECT 1 FROM public.sales_invoices d 
            WHERE d.organization_id = p_organization_id AND d.deleted_by = p.id
        )
        OR EXISTS (
            SELECT 1 FROM public.purchase_bills d 
            WHERE d.organization_id = p_organization_id AND d.deleted_by = p.id
        )
        OR EXISTS (
            SELECT 1 FROM public.receipts d 
            WHERE d.organization_id = p_organization_id AND d.deleted_by = p.id
        )
        OR EXISTS (
            SELECT 1 FROM public.payments d 
            WHERE d.organization_id = p_organization_id AND d.deleted_by = p.id
        )
        OR EXISTS (
            SELECT 1 FROM public.sales_credit_notes d 
            WHERE d.organization_id = p_organization_id AND d.deleted_by = p.id
        )
        OR EXISTS (
            SELECT 1 FROM public.purchase_debit_notes d 
            WHERE d.organization_id = p_organization_id AND d.deleted_by = p.id
        )
    )
    AND (
        p_user_ids IS NULL 
        OR p.id = ANY(p_user_ids)
    );
END;
$$;

-- Security hardening: limit execution permissions
REVOKE ALL ON FUNCTION public.get_organization_trash_user_profiles(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_organization_trash_user_profiles(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_organization_trash_user_profiles(uuid, uuid[]) TO authenticated;
