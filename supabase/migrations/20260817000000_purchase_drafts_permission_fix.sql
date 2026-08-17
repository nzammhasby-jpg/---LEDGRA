-- ====================================================================
-- LEDGRA MIGRATION: PURCHASE DRAFTS PERMISSION FIX
-- Description: Creates the missing public.can_manage_purchase_drafts function
--              for secure role-based access to purchase bill drafts.
-- ====================================================================

BEGIN;

-- 1. Create or replace public.can_manage_purchase_drafts(uuid)
-- Allows 'owner', 'admin', and 'accountant' to create and manage purchase bill drafts.
-- Explicitly denies 'sales', 'viewer', inactive members, and unauthenticated users.
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

-- 2. Secure Permissions and Grants
REVOKE ALL ON FUNCTION public.can_manage_purchase_drafts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_purchase_drafts(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_purchase_drafts(uuid) TO authenticated;

-- 3. Hardening is_org_privileged_member to ensure consistent is_active check
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

COMMIT;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
