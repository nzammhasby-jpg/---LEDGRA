-- migration: 20260617_fix_rls_infinite_recursion.sql
-- Fix Infinite Recursion in Supabase RLS Policies for organization_members and profiles

-- Drop old policies on organization_members
DROP POLICY IF EXISTS "Members can view other members in their organization" ON public.organization_members;
DROP POLICY IF EXISTS "Owners can manage members" ON public.organization_members;
DROP POLICY IF EXISTS "Allow members self-inserts (owner bootstrapping on creation)" ON public.organization_members;
DROP POLICY IF EXISTS "Secure organization_members select policy" ON public.organization_members;
DROP POLICY IF EXISTS "Secure organization_members mutate policy" ON public.organization_members;
DROP POLICY IF EXISTS "organization_members_select_policy" ON public.organization_members;
DROP POLICY IF EXISTS "organization_members_modify_policy" ON public.organization_members;

-- Drop old policies on profiles
DROP POLICY IF EXISTS "Users can view any profile" ON public.profiles;
DROP POLICY IF EXISTS "Secure profile read policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;

-- Re-create secure functions with SECURITY DEFINER and search_path set (to prevent RLS bypass vulnerabilities)
CREATE OR REPLACE FUNCTION public.is_member_of(
  p_organization_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.profile_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_owner_of(
  p_organization_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.profile_id = p_user_id
      AND om.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.shares_organization_with(
  p_other_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members mine
    JOIN public.organization_members other_member
      ON mine.organization_id = other_member.organization_id
    WHERE mine.profile_id = auth.uid()
      AND other_member.profile_id = p_other_profile_id
  );
$$;

-- Secure execution privileges
REVOKE ALL ON FUNCTION public.is_member_of(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_member_of(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_member_of(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin_or_owner_of(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin_or_owner_of(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin_or_owner_of(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.shares_organization_with(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shares_organization_with(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.shares_organization_with(uuid) TO authenticated;

-- Table RLS initialization
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Recreate organization_members policies with split clean definitions (no FOR ALL)
CREATE POLICY organization_members_select_policy
ON public.organization_members
FOR SELECT
TO authenticated
USING (
  public.is_member_of(organization_id, auth.uid())
);

CREATE POLICY organization_members_insert_policy
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_or_owner_of(organization_id, auth.uid())
);

CREATE POLICY organization_members_update_policy
ON public.organization_members
FOR UPDATE
TO authenticated
USING (
  public.is_admin_or_owner_of(organization_id, auth.uid())
)
WITH CHECK (
  public.is_admin_or_owner_of(organization_id, auth.uid())
);

CREATE POLICY organization_members_delete_policy
ON public.organization_members
FOR DELETE
TO authenticated
USING (
  public.is_admin_or_owner_of(organization_id, auth.uid())
);

-- Recreate profile policies securely
CREATE POLICY profiles_select_policy
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.shares_organization_with(id)
);

CREATE POLICY profiles_insert_policy
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  id = auth.uid()
);

CREATE POLICY profiles_update_policy
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  id = auth.uid()
)
WITH CHECK (
  id = auth.uid()
);

-- Recreate dependent policies on other tables just in case they used old inline recursive definitions
DROP POLICY IF EXISTS "Secure organizations select policy" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select_policy" ON public.organizations;
CREATE POLICY "organizations_select_policy" ON public.organizations
    FOR SELECT TO authenticated USING (public.is_member_of(id, auth.uid()));

DROP POLICY IF EXISTS "Secure organizations update policy" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update_policy" ON public.organizations;
CREATE POLICY "organizations_update_policy" ON public.organizations
    FOR UPDATE TO authenticated USING (public.is_admin_or_owner_of(id, auth.uid()));

DROP POLICY IF EXISTS "Secure organization_settings select and manage policy" ON public.organization_settings;
DROP POLICY IF EXISTS "organization_settings_select_policy" ON public.organization_settings;
CREATE POLICY "organization_settings_select_policy" ON public.organization_settings
    FOR SELECT TO authenticated USING (public.is_member_of(organization_id, auth.uid()));

DROP POLICY IF EXISTS "organization_settings_modify_policy" ON public.organization_settings;
CREATE POLICY "organization_settings_modify_policy" ON public.organization_settings
    FOR ALL TO authenticated USING (public.is_admin_or_owner_of(organization_id, auth.uid()));

DROP POLICY IF EXISTS "branches_select_policy" ON public.branches;
CREATE POLICY "branches_select_policy" ON public.branches
    FOR SELECT TO authenticated USING (public.is_member_of(organization_id, auth.uid()));

DROP POLICY IF EXISTS "branches_modify_policy" ON public.branches;
CREATE POLICY "branches_modify_policy" ON public.branches
    FOR ALL TO authenticated USING (public.is_admin_or_owner_of(organization_id, auth.uid()));
