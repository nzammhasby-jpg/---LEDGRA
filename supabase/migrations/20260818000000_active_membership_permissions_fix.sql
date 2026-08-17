-- ====================================================================
-- LEDGRA MIGRATION: ACTIVE MEMBERSHIP PERMISSIONS HARDENING FIX
-- Description: Hardens and ensures all organization role helper functions
--              strictly require active membership (is_active = true)
--              preventing deactivated members from retaining privileges.
-- ====================================================================

BEGIN;

-- 1. can_manage_sales_drafts(p_organization_id uuid)
-- Allowed: owner, admin, accountant, sales
-- Denied: viewer, inactive members (is_active = false), non-members
CREATE OR REPLACE FUNCTION public.can_manage_sales_drafts(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_organization_id
          AND profile_id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant', 'sales')
          AND COALESCE(is_active, true) = true
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_sales_drafts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_sales_drafts(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_sales_drafts(uuid) TO authenticated;


-- 2. can_manage_purchase_drafts(p_organization_id uuid)
-- Allowed: owner, admin, accountant
-- Denied: sales, viewer, inactive members (is_active = false), non-members
CREATE OR REPLACE FUNCTION public.can_manage_purchase_drafts(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_organization_id
          AND profile_id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant')
          AND COALESCE(is_active, true) = true
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_purchase_drafts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_purchase_drafts(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_purchase_drafts(uuid) TO authenticated;


-- 3. is_org_privileged_member(p_organization_id uuid)
-- Allowed: owner, admin, accountant
-- Denied: sales, viewer, inactive members (is_active = false), non-members
CREATE OR REPLACE FUNCTION public.is_org_privileged_member(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_organization_id
          AND profile_id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant')
          AND COALESCE(is_active, true) = true
    );
$$;

REVOKE ALL ON FUNCTION public.is_org_privileged_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_privileged_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_org_privileged_member(uuid) TO authenticated;


-- 4. is_org_member(p_organization_id uuid)
-- Allowed: any role belonging to org with active membership
-- Denied: inactive members (is_active = false), non-members
CREATE OR REPLACE FUNCTION public.is_org_member(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_organization_id
          AND profile_id = auth.uid()
          AND COALESCE(is_active, true) = true
    );
$$;

REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;


-- 5. is_org_admin(p_organization_id uuid)
-- Allowed: owner, admin with active membership
-- Denied: accountant, sales, viewer, inactive members (is_active = false), non-members
CREATE OR REPLACE FUNCTION public.is_org_admin(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_organization_id
          AND profile_id = auth.uid()
          AND role IN ('owner', 'admin')
          AND COALESCE(is_active, true) = true
    );
$$;

REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;


-- 6. can_view_inventory_movements(p_organization_id uuid)
-- Allowed: owner, admin, accountant, viewer with active membership
-- Denied: sales, inactive members (is_active = false), non-members
CREATE OR REPLACE FUNCTION public.can_view_inventory_movements(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_organization_id
          AND profile_id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant', 'viewer')
          AND COALESCE(is_active, true) = true
    );
$$;

REVOKE ALL ON FUNCTION public.can_view_inventory_movements(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_inventory_movements(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_inventory_movements(uuid) TO authenticated;


-- 7. can_view_financial_reports(p_org_id uuid)
-- Allowed: owner, admin, accountant, viewer with active membership
-- Denied: sales, inactive members (is_active = false), non-members
CREATE OR REPLACE FUNCTION public.can_view_financial_reports(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_org_id
          AND profile_id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant', 'viewer')
          AND COALESCE(is_active, true) = true
    );
$$;

REVOKE ALL ON FUNCTION public.can_view_financial_reports(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_financial_reports(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_financial_reports(uuid) TO authenticated;

COMMIT;

-- 8. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
