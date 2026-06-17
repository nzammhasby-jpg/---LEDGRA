-- LEDGRA Database Schema Initialization (Phase 1)
-- Path: /supabase/initial_schema.sql

BEGIN;

-- Enable clean extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================================
-- 1. TABLES DEFINITION (Atomic & Secure)
-- ==========================================================

-- Profile of Users
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name text,
    phone text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name_ar text NOT NULL,
    name_en text,
    activity_type text,
    country_code text DEFAULT 'SA' NOT NULL,
    city text,
    phone text,
    email text,
    logo_url text,
    legal_type text,
    cr_number text,
    vat_number text,
    is_vat_registered boolean DEFAULT false NOT NULL,
    fiscal_year_start date,
    currency_code text DEFAULT 'SAR' NOT NULL,
    primary_language text DEFAULT 'ar' NOT NULL,
    onboarding_completed boolean DEFAULT false NOT NULL,
    onboarding_step integer DEFAULT 1,
    setup_completed_at timestamp with time zone,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    system_start_date date,
    accounting_mode text DEFAULT 'pro',
    starting_balances_later boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

    -- Checks Constraints
    CONSTRAINT onboarding_step_check CHECK (onboarding_step BETWEEN 1 AND 3),
    CONSTRAINT accounting_mode_check CHECK (accounting_mode IN ('simple', 'pro')),
    CONSTRAINT cr_check CHECK (cr_number IS NULL OR cr_number ~ '^[0-9]{10}$'),
    CONSTRAINT vat_check CHECK (
        is_vat_registered = false OR 
        (is_vat_registered = true AND vat_number IS NOT NULL AND vat_number ~ '^3[0-9]{13}3$')
    ),
    CONSTRAINT legal_type_check CHECK (legal_type IS NULL OR legal_type IN ('individual', 'llc', 'joint', 'branch')),
    CONSTRAINT country_code_check CHECK (country_code = 'SA'),
    CONSTRAINT currency_code_check CHECK (currency_code = 'SAR'),
    CONSTRAINT primary_language_check CHECK (primary_language IN ('ar', 'en'))
);

-- Organization Memberships (No redundant Roles tables, using text attribute roles)
CREATE TABLE IF NOT EXISTS public.organization_members (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

    -- Constraints
    CONSTRAINT member_role_check CHECK (role IN ('owner', 'admin', 'accountant', 'sales', 'viewer')),
    CONSTRAINT org_profile_unique UNIQUE (organization_id, profile_id)
);

-- Organization Settings
CREATE TABLE IF NOT EXISTS public.organization_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE NOT NULL,
    logo_url text,
    invoice_header_ar text,
    invoice_header_en text,
    invoice_footer_ar text,
    invoice_footer_en text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Branches
CREATE TABLE IF NOT EXISTS public.branches (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    name_ar text NOT NULL,
    name_en text,
    code text NOT NULL,
    address text,
    is_main boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

    -- Constraints
    CONSTRAINT branch_code_unique_in_org UNIQUE (organization_id, code)
);

-- Partial index for main branch (exactly one main branch per organization)
CREATE UNIQUE INDEX IF NOT EXISTS branches_main_branch_unique_idx ON public.branches (organization_id) WHERE (is_main = true);

-- Audit logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    action text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip_address text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    type text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

    -- Constraints
    CONSTRAINT notification_type_check CHECK (type IN ('info', 'warning', 'success', 'error'))
);


-- ==========================================================
-- 2. SECURE STABLE RLS HELPER FUNCTIONS
-- ==========================================================

-- Check if authenticated user is member of organization
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
    );
$$;

-- Check if authenticated user is admin/owner of organization
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
    );
$$;

-- Secure execution grants
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;


-- ==========================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 3.1 Profiles RLS
DROP POLICY IF EXISTS select_profile ON public.profiles;
CREATE POLICY select_profile ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

DROP POLICY IF EXISTS update_profile ON public.profiles;
CREATE POLICY update_profile ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 3.2 Organizations RLS (Creation is only via secure RPC)
DROP POLICY IF EXISTS select_organizations ON public.organizations;
CREATE POLICY select_organizations ON public.organizations
    FOR SELECT TO authenticated
    USING (public.is_org_member(id));

DROP POLICY IF EXISTS update_organizations ON public.organizations;
CREATE POLICY update_organizations ON public.organizations
    FOR UPDATE TO authenticated
    USING (public.is_org_admin(id))
    WITH CHECK (public.is_org_admin(id));

-- 3.3 Organization Members RLS (Read own memberships only, no direct insert/update via RLS)
DROP POLICY IF EXISTS select_members ON public.organization_members;
CREATE POLICY select_members ON public.organization_members
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid());

-- 3.4 Organization Settings RLS
DROP POLICY IF EXISTS select_settings ON public.organization_settings;
CREATE POLICY select_settings ON public.organization_settings
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS insert_settings ON public.organization_settings;
CREATE POLICY insert_settings ON public.organization_settings
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS update_settings ON public.organization_settings;
CREATE POLICY update_settings ON public.organization_settings
    FOR UPDATE TO authenticated
    USING (public.is_org_admin(organization_id))
    WITH CHECK (public.is_org_admin(organization_id));

-- 3.5 Branches RLS
DROP POLICY IF EXISTS select_branches ON public.branches;
CREATE POLICY select_branches ON public.branches
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS insert_branches ON public.branches;
CREATE POLICY insert_branches ON public.branches
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS update_branches ON public.branches;
CREATE POLICY update_branches ON public.branches
    FOR UPDATE TO authenticated
    USING (public.is_org_admin(organization_id))
    WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS delete_branches ON public.branches;
CREATE POLICY delete_branches ON public.branches
    FOR DELETE TO authenticated
    USING (public.is_org_admin(organization_id) AND is_main = false);

-- 3.6 Audit Logs RLS (Read-only for members, write is server-only / RPC / system-level)
DROP POLICY IF EXISTS select_audit_logs ON public.audit_logs;
CREATE POLICY select_audit_logs ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

-- 3.7 Notifications RLS
DROP POLICY IF EXISTS select_notifications ON public.notifications;
CREATE POLICY select_notifications ON public.notifications
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid());

DROP POLICY IF EXISTS update_notifications ON public.notifications;
CREATE POLICY update_notifications ON public.notifications
    FOR UPDATE TO authenticated
    USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());


-- ==========================================================
-- 4. TRUSTED SECURE DATA INTERACTION (RPCs)
-- ==========================================================

-- 4.1 RPC: Create Organization with Owner (Atomic transaction, returns newly created UUID)
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
    p_name_ar text,
    p_name_en text,
    p_activity_type text,
    p_city text,
    p_phone text,
    p_email text,
    p_legal_type text,
    p_vat_number text,
    p_is_vat_registered boolean,
    p_fiscal_year_start date,
    p_cr_number text,
    p_system_start_date date,
    p_accounting_mode text,
    p_starting_balances_later boolean,
    p_onboarding_completed boolean,
    p_onboarding_step integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_org_id uuid;
BEGIN
    -- Match auth.uid()
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'المستخدم مجهول الهوية أو غير قادر على إتمام العملية.';
    END IF;

    -- Create Organization
    INSERT INTO public.organizations (
        name_ar,
        name_en,
        activity_type,
        country_code,
        city,
        phone,
        email,
        legal_type,
        cr_number,
        vat_number,
        is_vat_registered,
        fiscal_year_start,
        currency_code,
        primary_language,
        onboarding_completed,
        setup_completed_at,
        onboarding_step,
        created_by,
        system_start_date,
        accounting_mode,
        starting_balances_later
    ) VALUES (
        p_name_ar,
        COALESCE(p_name_en, ''),
        p_activity_type,
        'SA',
        p_city,
        p_phone,
        p_email,
        p_legal_type,
        NULLIF(p_cr_number, ''),
        NULLIF(p_vat_number, ''),
        p_is_vat_registered,
        p_fiscal_year_start,
        'SAR',
        'ar',
        p_onboarding_completed,
        CASE WHEN p_onboarding_completed = true THEN now() ELSE NULL END,
        COALESCE(p_onboarding_step, 3),
        v_user_id,
        p_system_start_date,
        p_accounting_mode,
        p_starting_balances_later
    )
    RETURNING id INTO v_org_id;

    -- Link User as 'owner'
    INSERT INTO public.organization_members (
        organization_id,
        profile_id,
        role
    ) VALUES (
        v_org_id,
        v_user_id,
        'owner'
    );

    -- Create settings row
    INSERT INTO public.organization_settings (
        organization_id
    ) VALUES (
        v_org_id
    );

    -- Create default main branch
    INSERT INTO public.branches (
        organization_id,
        name_ar,
        name_en,
        code,
        is_main
    ) VALUES (
        v_org_id,
        'الفرع الرئيسي',
        'Main Branch',
        '001',
        true
    );

    -- Write initial log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        v_org_id,
        v_user_id,
        'create_organization',
        jsonb_build_object(
            'name_ar', p_name_ar,
            'timestamp', now()
        )
    );

    RETURN v_org_id;
END;
$$;

-- Secure grants for create org
REVOKE ALL ON FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text, boolean, date, text, date, text, boolean, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text, boolean, date, text, date, text, boolean, boolean, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text, boolean, date, text, date, text, boolean, boolean, integer) TO authenticated;


-- 4.2 RPC: Secure Member retrieval (Bypasses Profiles table leaking, enforces admin/owner check)
CREATE OR REPLACE FUNCTION public.get_organization_members(p_organization_id uuid)
RETURNS TABLE (
    membership_id uuid,
    profile_id uuid,
    full_name text,
    phone text,
    role text,
    created_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Check if authenticated user is Owner/Admin
    IF NOT public.is_org_admin(p_organization_id) THEN
        RAISE EXCEPTION 'غير مصرح لك باستعراض أعضاء هذه المجموعة النشطة.';
    END IF;

    RETURN QUERY
    SELECT 
        m.id AS membership_id,
        m.profile_id AS profile_id,
        COALESCE(p.full_name, 'عضو غير معروف') AS full_name,
        COALESCE(p.phone, 'غير مسجل') AS phone,
        m.role AS role,
        m.created_at AS created_at
    FROM public.organization_members m
    JOIN public.profiles p ON m.profile_id = p.id
    WHERE m.organization_id = p_organization_id;
END;
$$;

-- Secure grants for member retrieval
REVOKE ALL ON FUNCTION public.get_organization_members(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_organization_members(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_organization_members(uuid) TO authenticated;


-- ==========================================================
-- 5. AUTOMATIC SYSTEM REGISTRAR & UPDATES (Triggers)
-- ==========================================================

-- 5.1 Trigger for profile automatic creation after auth.users insertion
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, phone, avatar_url)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', 'مستخدم لِدجرا'),
        COALESCE(new.raw_user_meta_data->>'phone', ''),
        NULL
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$;

-- Register trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 5.2 Trigger for automatically updating updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

-- Register update_at triggers on basic tables
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at 
    BEFORE UPDATE ON public.profiles 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_organizations_updated_at ON public.organizations;
CREATE TRIGGER set_organizations_updated_at 
    BEFORE UPDATE ON public.organizations 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_organization_settings_updated_at ON public.organization_settings;
CREATE TRIGGER set_organization_settings_updated_at 
    BEFORE UPDATE ON public.organization_settings 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 5.3 Trigger to lock down notifications updates except is_read
CREATE OR REPLACE FUNCTION public.secure_notifications_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.id <> OLD.id OR
       NEW.organization_id <> OLD.organization_id OR
       NEW.profile_id <> OLD.profile_id OR
       NEW.title <> OLD.title OR
       NEW.message <> OLD.message OR
       NEW.type <> OLD.type OR
       NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'غير مسموح بتعديل تفاصيل الإشعار الفنية؛ يمكنك فقط وضع علامة مقروء.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_notifications_update ON public.notifications;
CREATE TRIGGER check_notifications_update
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.secure_notifications_update();


-- ==========================================================
-- 6. ONE-TIME TRANSITION & EXTRA SECURITY
-- ==========================================================

-- 6.1 Backfill Profile rows for users registered prior to running initialization
INSERT INTO public.profiles (id, full_name, phone)
SELECT id, 
       COALESCE(raw_user_meta_data->>'full_name', 'مستخدم لِدجرا'), 
       COALESCE(raw_user_meta_data->>'phone', '')
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 6.2 Revoke default public schema tables rights from public/anon/authenticated
GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Specifying narrowest possible authorization permissions on tables:
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name, phone, avatar_url) ON TABLE public.profiles TO authenticated;

GRANT SELECT, UPDATE ON TABLE public.organizations TO authenticated;
GRANT SELECT ON TABLE public.organization_members TO authenticated; -- Read-only access! Writers must use RPC.
GRANT SELECT, INSERT, UPDATE ON TABLE public.organization_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branches TO authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated; -- System writes only

GRANT SELECT ON TABLE public.notifications TO authenticated;
GRANT UPDATE (is_read) ON TABLE public.notifications TO authenticated; -- Column-specific update for notification state (is_read) only

COMMIT;
