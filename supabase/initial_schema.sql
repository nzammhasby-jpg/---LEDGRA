-- LEDGRA Database Schema Initialization (Phase 1 & Phase 2)
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


-- ==========================================================
-- LEDGRA PHASE 2: ATOMIC & SECURE ACCOUNTING BASE TABLES AND SCHEMA
-- ==========================================================

-- 1. STABLE RLS PRIVILEGED PRIVILEGES FUNCTION
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
    );
$$;

-- Secure execution grants
REVOKE ALL ON FUNCTION public.is_org_privileged_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_privileged_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_org_privileged_member(uuid) TO authenticated;


CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. CREATE TABLE: fiscal_years
CREATE TABLE IF NOT EXISTS public.fiscal_years (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status text NOT NULL CHECK (status IN ('draft', 'open', 'closed')) DEFAULT 'draft',
    is_current boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT fiscal_years_dates_check CHECK (start_date < end_date),
    CONSTRAINT fiscal_years_id_org_unique UNIQUE (id, organization_id),
    CONSTRAINT fiscal_years_start_date_month_start CHECK (start_date = date_trunc('month', start_date)::date),
    CONSTRAINT fiscal_years_end_date_twelve_months CHECK (end_date = (start_date + INTERVAL '12 months' - INTERVAL '1 day')::date)
);

-- Ensure year names are unique per organization
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_years_org_name_unique_idx ON public.fiscal_years (organization_id, name);

-- Enforce at most ONE current fiscal year per organization using a partial index
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_years_one_current_idx ON public.fiscal_years (organization_id) WHERE (is_current = true);

-- Prevent overlapping years inside the same organization
ALTER TABLE public.fiscal_years DROP CONSTRAINT IF EXISTS fiscal_years_no_overlap;
ALTER TABLE public.fiscal_years ADD CONSTRAINT fiscal_years_no_overlap EXCLUDE USING gist (
    organization_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
);


-- 3. CREATE TABLE: fiscal_periods
CREATE TABLE IF NOT EXISTS public.fiscal_periods (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    fiscal_year_id uuid NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    period_num integer NOT NULL,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status text NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fiscal_periods_dates_check CHECK (start_date <= end_date),
    CONSTRAINT fiscal_periods_num_check CHECK (period_num >= 1 AND period_num <= 12),
    CONSTRAINT fiscal_periods_year_org_fk FOREIGN KEY (fiscal_year_id, organization_id) REFERENCES public.fiscal_years (id, organization_id) ON DELETE CASCADE,
    CONSTRAINT fiscal_periods_year_num_unique UNIQUE (fiscal_year_id, period_num)
);

-- Ensure period index is unique within a fiscal year
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_periods_year_num_unique_idx ON public.fiscal_periods (fiscal_year_id, period_num);

-- Period dates validation trigger
CREATE OR REPLACE FUNCTION public.validate_fiscal_period_dates()
RETURNS trigger AS $$
DECLARE
    v_year_start date;
    v_year_end date;
BEGIN
    SELECT start_date, end_date INTO v_year_start, v_year_end
    FROM public.fiscal_years
    WHERE id = NEW.fiscal_year_id;

    IF NEW.start_date < v_year_start OR NEW.end_date > v_year_end THEN
        RAISE EXCEPTION 'تاريخ الفترة المالية خارج حدود السنة المالية المرتبطة بها (% إلى %).', v_year_start, v_year_end;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_validate_fiscal_period_dates ON public.fiscal_periods;
CREATE TRIGGER trg_validate_fiscal_period_dates
    BEFORE INSERT OR UPDATE ON public.fiscal_periods
    FOR EACH ROW EXECUTE FUNCTION public.validate_fiscal_period_dates();

REVOKE ALL ON FUNCTION public.validate_fiscal_period_dates() FROM PUBLIC, anon;


-- 4. CREATE TABLE: accounts
CREATE TABLE IF NOT EXISTS public.accounts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    code text NOT NULL CONSTRAINT accounts_code_digits_check CHECK (code ~ '^[0-9]+$'),
    name_ar text NOT NULL,
    name_en text,
    classification text NOT NULL CHECK (classification IN ('assets', 'liabilities', 'equity', 'revenue', 'expenses')),
    parent_id uuid REFERENCES public.accounts(id) ON DELETE RESTRICT,
    level integer NOT NULL DEFAULT 1,
    nature text NOT NULL CHECK (nature IN ('debit', 'credit')),
    allow_direct_posting boolean NOT NULL DEFAULT true,
    is_active boolean NOT NULL DEFAULT true,
    is_system boolean NOT NULL DEFAULT false,
    description text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT accounts_parent_self_check CHECK (parent_id <> id),
    CONSTRAINT accounts_nature_classification_check CHECK (
        (classification IN ('assets', 'expenses') AND nature = 'debit') OR
        (classification IN ('liabilities', 'equity', 'revenue') AND nature = 'credit')
    )
);

-- Safely add accounts nature/classification check constraint if existing
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_nature_classification_check;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_nature_classification_check CHECK (
    (classification IN ('assets', 'expenses') AND nature = 'debit') OR
    (classification IN ('liabilities', 'equity', 'revenue') AND nature = 'credit')
);

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_code_digits_check;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_code_digits_check CHECK (code ~ '^[0-9]+$');

-- Ensure account code is unique per organization
CREATE UNIQUE INDEX IF NOT EXISTS accounts_code_org_unique_idx ON public.accounts (organization_id, code);


-- 5. CREATE TABLE: accounting_settings
CREATE TABLE IF NOT EXISTS public.accounting_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE NOT NULL,
    default_receivables_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_payables_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_cash_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_bank_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_sales_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_service_sales_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_tax_output_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_tax_input_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_cogs_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_inventory_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_retained_earnings_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    coa_initialized_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ==========================================================
-- 6. SYSTEM PROTECTIONS, RECURSIVE TREE TRIGGERS & VALIDATIONS
-- ==========================================================

-- Trigger to prevent deleting system accounts
CREATE OR REPLACE FUNCTION public.prevent_delete_system_account()
RETURNS trigger AS $$
BEGIN
    IF OLD.is_system THEN
        RAISE EXCEPTION 'لا يمكن حذف الحسابات النظامية المحمية بنظام لِدجرا لدواعي الامتثال المحاسبي.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_delete_system_account ON public.accounts;
CREATE TRIGGER trg_prevent_delete_system_account
    BEFORE DELETE ON public.accounts
    FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_system_account();

REVOKE ALL ON FUNCTION public.prevent_delete_system_account() FROM PUBLIC, anon;


-- Core Account Tree validation and auto parent-to-summary promotion trigger
CREATE OR REPLACE FUNCTION public.validation_and_propagate_accounts()
RETURNS trigger AS $$
DECLARE
    v_parent_org uuid;
    v_parent_class text;
    v_parent_nature text;
    v_parent_level integer;
    v_parent_is_system boolean;
    v_parent_code text;
BEGIN
    -- Protect and prevent editing system fields for system accounts
    IF TG_OP = 'UPDATE' AND OLD.is_system THEN
        IF NEW.is_system = false THEN
            RAISE EXCEPTION 'يُمنع تحويل الحسابات النظامية المحمية إلى حسابات عادية.';
        END IF;

        IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
            RAISE EXCEPTION 'يُمنع تعديل معرف المنشأة للحسابات النظامية.';
        END IF;

        IF NEW.code IS DISTINCT FROM OLD.code OR
           NEW.classification IS DISTINCT FROM OLD.classification OR
           NEW.nature IS DISTINCT FROM OLD.nature THEN
            RAISE EXCEPTION 'يُمنع تعديل الرمز أو التصنيف أو الطبيعة المحاسبية للحسابات النظامية لضمان سلامة العمليات المالية.';
        END IF;

        IF NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
            RAISE EXCEPTION 'يُمنع نقل الحسابات النظامية المحمية إلى حساب أب آخر لضمان تماسك هيكل النظام.';
        END IF;
    END IF;

    -- Prevent invalid edits on an account if used in accounting settings
    IF TG_OP = 'UPDATE' AND EXISTS (
        SELECT 1 FROM public.accounting_settings
        WHERE organization_id = NEW.organization_id
          AND (
              default_receivables_account_id = NEW.id OR
              default_payables_account_id = NEW.id OR
              default_cash_account_id = NEW.id OR
              default_bank_account_id = NEW.id OR
              default_sales_account_id = NEW.id OR
              default_service_sales_account_id = NEW.id OR
              default_tax_output_account_id = NEW.id OR
              default_tax_input_account_id = NEW.id OR
              default_cogs_account_id = NEW.id OR
              default_inventory_account_id = NEW.id OR
              default_retained_earnings_account_id = NEW.id
          )
    ) THEN
        -- Prevent is_active = false
        IF NEW.is_active = false THEN
            RAISE EXCEPTION 'لا يمكن تعديل الحساب بهذه الطريقة لأنه مستخدم ضمن الإعدادات المحاسبية الافتراضية. استبدل الحساب من الإعدادات أولًا.';
        END IF;

        -- Prevent allow_direct_posting = false (makes it summary)
        IF NEW.allow_direct_posting = false THEN
            RAISE EXCEPTION 'لا يمكن تعديل الحساب بهذه الطريقة لأنه مستخدم ضمن الإعدادات المحاسبية الافتراضية. استبدل الحساب من الإعدادات أولًا.';
        END IF;

        -- Prevent changing classification inappropriately
        IF EXISTS (
            SELECT 1 FROM public.accounting_settings
            WHERE organization_id = NEW.organization_id
              AND (
                  (default_receivables_account_id = NEW.id AND NEW.classification <> 'assets') OR
                  (default_payables_account_id = NEW.id AND NEW.classification <> 'liabilities') OR
                  (default_cash_account_id = NEW.id AND NEW.classification <> 'assets') OR
                  (default_bank_account_id = NEW.id AND NEW.classification <> 'assets') OR
                  (default_sales_account_id = NEW.id AND NEW.classification <> 'revenue') OR
                  (default_service_sales_account_id = NEW.id AND NEW.classification <> 'revenue') OR
                  (default_tax_output_account_id = NEW.id AND NEW.classification <> 'liabilities') OR
                  (default_tax_input_account_id = NEW.id AND NEW.classification <> 'assets') OR
                  (default_cogs_account_id = NEW.id AND NEW.classification <> 'expenses') OR
                  (default_inventory_account_id = NEW.id AND NEW.classification <> 'assets') OR
                  (default_retained_earnings_account_id = NEW.id AND NEW.classification <> 'equity')
              )
        ) THEN
            RAISE EXCEPTION 'لا يمكن تعديل الحساب بهذه الطريقة لأنه مستخدم ضمن الإعدادات المحاسبية الافتراضية. استبدل الحساب من الإعدادات أولًا.';
        END IF;
    END IF;

    -- 1. If parent_id is specified, apply validation rules
    IF NEW.parent_id IS NOT NULL THEN
        -- Verify parent account exists and retrieve attributes
        SELECT code, organization_id, classification, nature, level, is_system
        INTO v_parent_code, v_parent_org, v_parent_class, v_parent_nature, v_parent_level, v_parent_is_system
        FROM public.accounts 
        WHERE id = NEW.parent_id;

        IF v_parent_org IS NULL THEN
            RAISE EXCEPTION 'الحساب الأب المحدد غير موجود.';
        END IF;

        IF v_parent_org <> NEW.organization_id THEN
            RAISE EXCEPTION 'لا يمكن ربط حساب أب ينتمي لمنشأة مختلفة.';
        END IF;

        IF v_parent_class <> NEW.classification THEN
            RAISE EXCEPTION 'يجب أن يتطابق تصنيف الحساب الفرعي مع تصنيف الحساب الأب (% <> %).', NEW.classification, v_parent_class;
        END IF;

        IF v_parent_nature <> NEW.nature THEN
            RAISE EXCEPTION 'يجب أن تتطابق طبيعة الحساب الفرعي مع طبيعة الحساب الأب (% <> %).', NEW.nature, v_parent_nature;
        END IF;

        -- Subaccount code MUST start with parent code
        IF substring(NEW.code from 1 for length(v_parent_code)) <> v_parent_code THEN
            RAISE EXCEPTION 'رمز الحساب الابن (%) يجب أن يبدأ برمز الحساب الأب (%).', NEW.code, v_parent_code;
        END IF;

        -- Prevent adding a sub-account under an account that is linked to accounting_settings
        IF EXISTS (
            SELECT 1 FROM public.accounting_settings
            WHERE organization_id = NEW.organization_id
              AND (
                  default_receivables_account_id = NEW.parent_id OR
                  default_payables_account_id = NEW.parent_id OR
                  default_cash_account_id = NEW.parent_id OR
                  default_bank_account_id = NEW.parent_id OR
                  default_sales_account_id = NEW.parent_id OR
                  default_service_sales_account_id = NEW.parent_id OR
                  default_tax_output_account_id = NEW.parent_id OR
                  default_tax_input_account_id = NEW.parent_id OR
                  default_cogs_account_id = NEW.parent_id OR
                  default_inventory_account_id = NEW.parent_id OR
                  default_retained_earnings_account_id = NEW.parent_id
              )
        ) THEN
            RAISE EXCEPTION 'لا يمكن تعديل الحساب بهذه الطريقة لأنه مستخدم ضمن الإعدادات المحاسبية الافتراضية. استبدل الحساب من الإعدادات أولًا.';
        END IF;

        -- Prevent adding subaccounts under is_system terminal accounts that allow posting
        IF v_parent_is_system AND EXISTS (
            SELECT 1 FROM public.accounts WHERE id = NEW.parent_id AND allow_direct_posting = true AND is_system = true
        ) THEN
            RAISE EXCEPTION 'لا يمكن إضافة حساب فرعي تحت حساب نظامي نهائي يسمح بالترحيل المباشر.';
        END IF;

        -- niveau calculator: level = parent_level + 1
        NEW.level := v_parent_level + 1;

        -- Auto promote parent to a summary/aggregate account (allow_direct_posting = false)
        UPDATE public.accounts
        SET allow_direct_posting = false
        WHERE id = NEW.parent_id AND allow_direct_posting = true;

    ELSE
        NEW.level := 1;
    END IF;

    -- 2. Prevent circular relationship in tree hierarchy during updates
    IF TG_OP = 'UPDATE' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
        IF NEW.id = NEW.parent_id THEN
            RAISE EXCEPTION 'لا يمكن أن يكون الحساب أبًا لنفسه.';
        END IF;
        
        DECLARE
            v_curr_parent uuid := NEW.parent_id;
        BEGIN
            WHILE v_curr_parent IS NOT NULL LOOP
                IF v_curr_parent = NEW.id THEN
                    RAISE EXCEPTION 'تم اكتشاف علاقة دائرية غير مسموح بها في شجرة الحسابات.';
                END IF;
                SELECT parent_id INTO v_curr_parent FROM public.accounts WHERE id = v_curr_parent;
            END LOOP;
        END;
    END IF;

    -- 3. Prevent turning a summary account (with children) back to a postable account
    IF TG_OP = 'UPDATE' AND NEW.allow_direct_posting = true THEN
        IF EXISTS (SELECT 1 FROM public.accounts WHERE parent_id = NEW.id) THEN
            RAISE EXCEPTION 'لا يمكن تفعيل الترحيل المباشر لحساب تجميعي لديه حسابات فرعية بنظام لِدجرا.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_validation_and_propagate_accounts ON public.accounts;
CREATE TRIGGER trg_validation_and_propagate_accounts
    BEFORE INSERT OR UPDATE ON public.accounts
    FOR EACH ROW EXECUTE FUNCTION public.validation_and_propagate_accounts();

REVOKE ALL ON FUNCTION public.validation_and_propagate_accounts() FROM PUBLIC, anon;


-- Centralized PostgreSQL trigger to recalculate allow_direct_posting for parent accounts
CREATE OR REPLACE FUNCTION public.recalculate_parent_direct_posting()
RETURNS trigger AS $$
DECLARE
    v_old_parent uuid;
    v_new_parent uuid;
    v_has_children boolean;
BEGIN
    -- Determine parents affected
    IF TG_OP = 'INSERT' THEN
        v_new_parent := NEW.parent_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
            v_old_parent := OLD.parent_id;
            v_new_parent := NEW.parent_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        v_old_parent := OLD.parent_id;
    END IF;

    -- Handle old parent (if any)
    IF v_old_parent IS NOT NULL THEN
        -- Check if it still has any children
        SELECT EXISTS (
            SELECT 1 FROM public.accounts WHERE parent_id = v_old_parent
        ) INTO v_has_children;

        -- If it no longer has children and is non-system, return allow_direct_posting to true
        IF NOT v_has_children THEN
            UPDATE public.accounts
            SET allow_direct_posting = true
            WHERE id = v_old_parent 
              AND is_system = false;
        END IF;
    END IF;

    -- Handle new parent (if any)
    IF v_new_parent IS NOT NULL THEN
        UPDATE public.accounts
        SET allow_direct_posting = false
        WHERE id = v_new_parent AND allow_direct_posting = true;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_recalculate_parent_direct_posting ON public.accounts;
CREATE TRIGGER trg_recalculate_parent_direct_posting
    AFTER INSERT OR UPDATE OR DELETE ON public.accounts
    FOR EACH ROW EXECUTE FUNCTION public.recalculate_parent_direct_posting();

REVOKE ALL ON FUNCTION public.recalculate_parent_direct_posting() FROM PUBLIC, anon;


-- Trigger to handle updated_at column automatic updates
DROP TRIGGER IF EXISTS update_accounts_updated_at ON public.accounts;
CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON public.accounts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_accounting_settings_updated_at ON public.accounting_settings;
CREATE TRIGGER update_accounting_settings_updated_at
    BEFORE UPDATE ON public.accounting_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ==========================================================
-- 7. ATOMIC CORE SQL FUNCTIONS FOR FINANCIAL OPERATIONS
-- ==========================================================

-- A. ATOMIC FUNCTION: Atomic Fiscal Year Creation + Month-by-month Periods Generation
CREATE OR REPLACE FUNCTION public.create_fiscal_year(
    p_org_id uuid,
    p_name text,
    p_start_date date,
    p_end_date date,
    p_is_current boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_year_id uuid;
    v_curr_start date;
    v_curr_end date;
    v_period_count integer;
BEGIN
    -- 1. Privilege & Authenticated check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليس لديك الصلاحية الكافية لإنشاء السنوات المالية للمنشأة.';
    END IF;

    -- Obtain transactional advisory lock on organization to prevent concurrency overlaps
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- 2. Validation Checks
    IF p_start_date >= p_end_date THEN
        RAISE EXCEPTION 'تاريخ بداية السنة المالية يجب أن يكون قبل تاريخ نهايتها.';
    END IF;

    -- Enforce starts on first day of month
    IF EXTRACT(DAY FROM p_start_date) <> 1 THEN
        RAISE EXCEPTION 'يجب أن يبدأ تاريخ السنة المالية في اليوم الأول من الشهر.';
    END IF;

    -- Enforce standard 12 month duration (ends on the last day of the twelfth month)
    IF p_end_date <> (p_start_date + interval '12 months' - interval '1 day')::date THEN
        RAISE EXCEPTION 'يجب أن تكون مدة السنة المالية 12 شهراً متكاملاً وتنتهي في اليوم الأخير من الشهر الثاني عشر.';
    END IF;

    -- Check overlap with any existing fiscal years
    IF EXISTS (
        SELECT 1 FROM public.fiscal_years
        WHERE organization_id = p_org_id
          AND NOT (end_date < p_start_date OR start_date > p_end_date)
    ) THEN
        RAISE EXCEPTION 'تواريخ هذه السنة المالية تتداخل مع فترة أو سنة مالية مسجلة أخرى بالمنشأة.';
    END IF;

    -- Verify Year name uniqueness within organization
    IF EXISTS (
        SELECT 1 FROM public.fiscal_years
        WHERE organization_id = p_org_id AND name = p_name
    ) THEN
        RAISE EXCEPTION 'السنة المالية بهذا الاسم مسجلة بالفعل بالمنشأة.';
    END IF;

    -- 3. Insert Fiscal Year
    INSERT INTO public.fiscal_years (
        organization_id,
        name,
        start_date,
        end_date,
        status,
        is_current,
        created_by
    ) VALUES (
        p_org_id,
        p_name,
        p_start_date,
        p_end_date,
        'draft',
        false, -- start as false, if p_is_current is true we promote atomically below
        auth.uid()
    ) RETURNING id INTO v_year_id;

    -- 4. Dynamic Period Generator Context (strictly 12 periods)
    FOR i IN 1..12 LOOP
        v_curr_start := (p_start_date + ((i - 1) || ' months')::interval)::date;
        v_curr_end := (p_start_date + (i || ' months')::interval - interval '1 day')::date;

        -- Insert Period
        INSERT INTO public.fiscal_periods (
            fiscal_year_id,
            organization_id,
            period_num,
            name,
            start_date,
            end_date,
            status
        ) VALUES (
            v_year_id,
            p_org_id,
            i,
            'F' || TO_CHAR(i, 'FM00'),
            v_curr_start,
            v_curr_end,
            'open'
        );
    END LOOP;

    -- Double-check that exactly 12 periods were generated
    SELECT COUNT(*) INTO v_period_count FROM public.fiscal_periods WHERE fiscal_year_id = v_year_id;
    IF v_period_count <> 12 THEN
        RAISE EXCEPTION 'فشل إنشاء السنة المالية: عدد الفترات المولدة هو % بدلاً من 12.', v_period_count;
    END IF;

    -- 5. Handle Is Current atomic operation inside the database
    IF p_is_current THEN
        -- Reset previous current years
        UPDATE public.fiscal_years
        SET is_current = false
        WHERE organization_id = p_org_id AND is_current = true;

        -- Set new one as current, promote status to open automatically
        UPDATE public.fiscal_years
        SET is_current = true, status = 'open'
        WHERE id = v_year_id;
    END IF;

    -- Record in audit logs
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'create_fiscal_year',
        jsonb_build_object(
            'fiscal_year_id', v_year_id,
            'name', p_name,
            'start_date', p_start_date,
            'end_date', p_end_date,
            'is_current', p_is_current
        )
    );

    RETURN v_year_id;
END;
$$;


-- B. ATOMIC FUNCTION: Set Current Fiscal Year Atomic Switcher
CREATE OR REPLACE FUNCTION public.set_current_fiscal_year(
    p_org_id uuid,
    p_year_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- 1. Privilege check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليس لديك الصلاحية الكافية لتبديل السنة المالية النشطة.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- 2. Year exists in this org check
    IF NOT EXISTS (
        SELECT 1 FROM public.fiscal_years 
        WHERE id = p_year_id AND organization_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'السنة المالية المحددة غير موجودة في سجلات هذه المنشأة.';
    END IF;

    -- 3. Atomic atomic switcher transaction
    UPDATE public.fiscal_years
    SET is_current = false
    WHERE organization_id = p_org_id AND is_current = true;

    UPDATE public.fiscal_years
    SET is_current = true, status = 'open'
    WHERE id = p_year_id;

    -- Audit log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'set_current_fiscal_year',
        jsonb_build_object('fiscal_year_id', p_year_id)
    );
END;
$$;


-- C. ATOMIC FUNCTION: Seed Default Saudi SME Compliant Chart of Accounts with Settings Matched
CREATE OR REPLACE FUNCTION public.seed_default_chart_of_accounts(
    p_org_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_c_count integer;
    
    -- Level 1 ids
    v_id_1 uuid; -- Assets
    v_id_2 uuid; -- Liabilities
    v_id_3 uuid; -- Equity
    v_id_4 uuid; -- Revenue
    v_id_5 uuid; -- Expenses
    
    -- Level 2 ids
    v_id_11 uuid; -- Current Assets
    v_id_12 uuid; -- Non-Current Assets
    
    v_id_21 uuid; -- Current Liabilities
    v_id_22 uuid; -- Non-Current Liabilities
    
    v_id_31 uuid; -- Owner Equity
    
    v_id_41 uuid; -- Direct Revenue
    
    v_id_51 uuid; -- Direct Expense
    v_id_52 uuid; -- General Expenses
    
    -- Level 3 ids
    v_id_111 uuid; -- Cash and equivs
    v_id_112 uuid; -- Receivables
    v_id_113 uuid; -- Inventory
    v_id_114 uuid; -- Prepaid expenses
    v_id_115 uuid; -- VAT Input
    
    v_id_121 uuid; -- Fixed Assets
    
    v_id_211 uuid; -- Payables
    v_id_212 uuid; -- VAT Output
    v_id_213 uuid; -- Accrued Expenses
    
    v_id_311 uuid; -- Capital
    v_id_312 uuid; -- Retained Earnings
    
    v_id_411 uuid; -- Product Sales
    v_id_412 uuid; -- Service Revenues
    
    v_id_511 uuid; -- COGS
    
    -- Level 4 ids
    v_id_1111 uuid; -- Cash on Hand
    v_id_1112 uuid; -- Bank Default
    v_id_1121 uuid; -- Unified Cust
    v_id_1131 uuid; -- Warehouse Inv
    v_id_1141 uuid; -- Prepaid Rent
    v_id_1151 uuid; -- VAT Input Account
    
    v_id_1211 uuid; -- Machinery and Machinery
    v_id_1212 uuid; -- Furniture
    
    v_id_2111 uuid; -- Unified Vend
    v_id_2121 uuid; -- VAT Output Account
    v_id_2131 uuid; -- Accrued salaries
    
    v_id_3111 uuid; -- Paid-in capital
    v_id_3121 uuid; -- Retained earnings accum
    
    v_id_4111 uuid; -- Product Sales Leaf
    v_id_4121 uuid; -- Service Revenue Leaf
    
    v_id_5111 uuid; -- COGS Leaf
    v_id_5211 uuid; -- Salaries Expense
    v_id_5212 uuid; -- Rent Expense
    v_id_5213 uuid; -- Utilities Expense
    v_id_5214 uuid; -- Bank Fees
    v_id_5215 uuid; -- General G&A
    
BEGIN
    -- 1. Privilege & Authenticated check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليس لديك الصلاحية الكافية لتهيئة دليل الحسابات للمنشأة.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- 2. Idempotency check: "تمنع التكرار حتى لو تم الضغط مرتين أو فتح النظام من أكثر من تبويب"
    IF EXISTS (
        SELECT 1 FROM public.accounting_settings 
        WHERE organization_id = p_org_id AND coa_initialized_at IS NOT NULL
    ) THEN
        RETURN 'already_initialized';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.accounts 
        WHERE organization_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'توجد حسابات سابقة في المنشأة، ولا يمكن إنشاء الدليل الافتراضي فوقها. راجع الحسابات الحالية أولًا.';
    END IF;

    -- Level 1
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1', 'الأصول', 'Assets', 'assets', 'debit', 1, false, true, null) RETURNING id INTO v_id_1;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '2', 'الالتزامات', 'Liabilities', 'liabilities', 'credit', 1, false, true, null) RETURNING id INTO v_id_2;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '3', 'حقوق الملكية', 'Equity', 'equity', 'credit', 1, false, true, null) RETURNING id INTO v_id_3;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '4', 'الإيرادات', 'Revenue', 'revenue', 'credit', 1, false, true, null) RETURNING id INTO v_id_4;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '5', 'المصروفات', 'Expenses', 'expenses', 'debit', 1, false, true, null) RETURNING id INTO v_id_5;

    -- Level 2 under 1 (Assets)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '11', 'الأصول المتداولة', 'Current Assets', 'assets', 'debit', 2, false, true, v_id_1) RETURNING id INTO v_id_11;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '12', 'الأصول غير المتداولة', 'Non-Current Assets', 'assets', 'debit', 2, false, true, v_id_1) RETURNING id INTO v_id_12;

    -- Level 3 under 11 (Current Assets)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '111', 'النقدية وما في حكمها', 'Cash and Cash Equivalents', 'assets', 'debit', 3, false, true, v_id_11) RETURNING id INTO v_id_111;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '112', 'العملاء', 'Accounts Receivable', 'assets', 'debit', 3, false, true, v_id_11) RETURNING id INTO v_id_112;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '113', 'المخزون السلعي', 'Inventory', 'assets', 'debit', 3, false, true, v_id_11) RETURNING id INTO v_id_113;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '114', 'مصروفات مقدمة وأرصدة مدينة', 'Prepaid Expenses', 'assets', 'debit', 3, false, false, v_id_11) RETURNING id INTO v_id_114;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '115', 'ضريبة القيمة المضافة - المدخلات', 'VAT Input Tax', 'assets', 'debit', 3, false, true, v_id_11) RETURNING id INTO v_id_115;

    -- Level 4 under 111 (Cash and Equivalents)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1111', 'أمين الصندوق (الخزينة العامة)', 'Cash on Hand', 'assets', 'debit', 4, true, true, v_id_111) RETURNING id INTO v_id_1111;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1112', 'حساب البنك الجاري الرئيسي', 'Bank Default Account', 'assets', 'debit', 4, true, true, v_id_111) RETURNING id INTO v_id_1112;

    -- Level 4 under 112 (Receivables)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1121', 'حساب ذمم العملاء التجاريين الموحد', 'Trade Accounts Receivable', 'assets', 'debit', 4, true, true, v_id_112) RETURNING id INTO v_id_1121;

    -- Level 4 under 113 (Inventory)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1131', 'مخزون المستودع السلعي العام', 'Finished Goods Inventory', 'assets', 'debit', 4, true, true, v_id_113) RETURNING id INTO v_id_1131;

    -- Level 4 under 114 (Prepaids)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1141', 'مصروفات إيجار مدفوعة مقدماً', 'Prepaid Rent', 'assets', 'debit', 4, true, false, v_id_114) RETURNING id INTO v_id_1141;

    -- Level 4 under 115 (VAT Input)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1151', 'حساب ضريبة مدخلات المشتريات المرفوعة', 'VAT Input Tax Account', 'assets', 'debit', 4, true, true, v_id_115) RETURNING id INTO v_id_1151;

    -- Level 3 under 12 (Non-Current Assets)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '121', 'الأصول الثابتة ملموسة وغير ملموسة', 'Fixed Assets', 'assets', 'debit', 3, false, false, v_id_12) RETURNING id INTO v_id_121;

    -- Level 4 under 121 (Fixed Assets)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1211', 'الآلات والمعدات العينية للأعمال', 'Machinery and Equipment', 'assets', 'debit', 4, true, false, v_id_121) RETURNING id INTO v_id_1211;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '1212', 'الأثاث والتجهيزات المكتبية والديكور', 'Furniture and Fixtures', 'assets', 'debit', 4, true, false, v_id_121) RETURNING id INTO v_id_1212;

    -- Level 2 under 2 (Liabilities)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '21', 'الالتزامات المتداولة', 'Current Liabilities', 'liabilities', 'credit', 2, false, true, v_id_2) RETURNING id INTO v_id_21;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '22', 'الالتزامات غير المتداولة (طويلة الأجل)', 'Non-Current Liabilities', 'liabilities', 'credit', 2, false, true, v_id_2) RETURNING id INTO v_id_22;

    -- Level 3 under 21 (Current Liabilities)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '211', 'الموردون والمطالبات', 'Accounts Payable', 'liabilities', 'credit', 3, false, true, v_id_21) RETURNING id INTO v_id_211;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '212', 'ضريبة القيمة المضافة - المخرجات', 'VAT Output Tax', 'liabilities', 'credit', 3, false, true, v_id_21) RETURNING id INTO v_id_212;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '213', 'مصروفات مستحقة ومخصصات قصيرة الأجل', 'Accrued Expenses', 'liabilities', 'credit', 3, false, false, v_id_21) RETURNING id INTO v_id_213;

    -- Level 4 under 211 (Payables)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '2111', 'حساب ذمم الموردين التجاريين الموحد', 'Trade Accounts Payable', 'liabilities', 'credit', 4, true, true, v_id_211) RETURNING id INTO v_id_2111;

    -- Level 4 under 212 (VAT Output)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '2121', 'حساب ضريبة مخرجات المبيعات المستلمة', 'VAT Output Tax Account', 'liabilities', 'credit', 4, true, true, v_id_212) RETURNING id INTO v_id_2121;

    -- Level 4 under 213 (Accrued Expenses)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '2131', 'مصروف الرواتب والأجور المستحقة للموظفين', 'Accrued Salaries', 'liabilities', 'credit', 4, true, false, v_id_213) RETURNING id INTO v_id_2131;

    -- Level 2 under 3 (Equity)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '31', 'رأس المال وحقوق الملكية للمستثمرين', 'Paid-in Capital', 'equity', 'credit', 2, false, true, v_id_3) RETURNING id INTO v_id_31;

    -- Level 3 under 31 (Capital)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '311', 'رأس المال المساهم به والشركاء', 'Share Capital', 'equity', 'credit', 3, false, true, v_id_31) RETURNING id INTO v_id_311;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '312', 'الأرباح المبقاة والمدورة من فترات سابقة', 'Retained Earnings', 'equity', 'credit', 3, false, true, v_id_31) RETURNING id INTO v_id_312;

    -- Level 4 under 311 (Capital)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '3111', 'رأس المال التأسيسي المدفوع والموثق', 'Paid-in Capital Account', 'equity', 'credit', 4, true, true, v_id_311) RETURNING id INTO v_id_3111;

    -- Level 4 under 312 (Retained Earnings)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '3121', 'حساب الأرباح المبقاة والخسائر المتراكمة المعتمد', 'Retained Earnings Account', 'equity', 'credit', 4, true, true, v_id_312) RETURNING id INTO v_id_3121;

    -- Level 2 under 4 (Revenue)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '41', 'إيرادات النشاط والعمليات والمبيعات', 'Sales Revenues', 'revenue', 'credit', 2, false, true, v_id_4) RETURNING id INTO v_id_41;

    -- Level 3 under 41 (Revenues)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '411', 'إيرادات مبيعات السلع البضائعية والمنتجات', 'Product Sales', 'revenue', 'credit', 3, false, true, v_id_41) RETURNING id INTO v_id_411;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '412', 'إيرادات تقديم الخدمات الاستشارية والتشغيلية', 'Service Revenues', 'revenue', 'credit', 3, false, true, v_id_41) RETURNING id INTO v_id_412;

    -- Level 4 under 411 (Product sales leaf)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '4111', 'مبيعات منتجات وسلع المنشأة المعترف بها', 'Product Sales Account', 'revenue', 'credit', 4, true, true, v_id_411) RETURNING id INTO v_id_4111;

    -- Level 4 under 412 (Service revenue leaf)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '4121', 'إيرادات عقود تقديم الخدمات والتشغيل الفني', 'Service Revenue Account', 'revenue', 'credit', 4, true, true, v_id_412) RETURNING id INTO v_id_4121;

    -- Level 2 under 5 (Expenses)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '51', 'تكاليف الإنتاج والخدمات والنشاط', 'Cost of Revenue', 'expenses', 'debit', 2, false, true, v_id_5) RETURNING id INTO v_id_51;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '52', 'المصروفات التشغيلية والإدارية العامة', 'Operating Expenses', 'expenses', 'debit', 2, false, false, v_id_5) RETURNING id INTO v_id_52;

    -- Level 3 under 51 (Revenue costs)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '511', 'تكلفة البضاعة المباعة (التقييم المستمر)', 'Cost of Goods Sold', 'expenses', 'debit', 3, false, true, v_id_51) RETURNING id INTO v_id_511;

    -- Level 4 under 511 (COGS Leaf)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '5111', 'حساب تكلفة البضاعة والسلع المباعة', 'Cost of Goods Sold Account', 'expenses', 'debit', 4, true, true, v_id_511) RETURNING id INTO v_id_5111;

    -- Level 4 under 52 (Operating/General expenses)
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '5211', 'مصروفات الرواتب والأجور الأساسية والمنافع', 'Salaries and Wages Expense', 'expenses', 'debit', 4, true, false, v_id_52) RETURNING id INTO v_id_5211;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '5212', 'مصروفات إيجار المقرات والفروع والمعارض', 'Rent Expense', 'expenses', 'debit', 4, true, false, v_id_52) RETURNING id INTO v_id_5212;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '5213', 'مصروفات المرافق والخدمات (كهرباء ومياه وإنترنت)', 'Utilities Expense', 'expenses', 'debit', 4, true, false, v_id_52) RETURNING id INTO v_id_5213;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '5214', 'المصروفات والعمولات البنكية وأجهزة نقاط البيع', 'Bank Fees & Commissions', 'expenses', 'debit', 4, true, false, v_id_52) RETURNING id INTO v_id_5214;
    
    INSERT INTO public.accounts (organization_id, code, name_ar, name_en, classification, nature, level, allow_direct_posting, is_system, parent_id)
    VALUES (p_org_id, '5215', 'المصروفات الإدارية والمكتبية المتنوعة للشركة', 'General G&A Expense', 'expenses', 'debit', 4, true, false, v_id_52) RETURNING id INTO v_id_5215;

    -- Now seed the default accounting settings mapped perfectly to these leaf accounts
    INSERT INTO public.accounting_settings (
        organization_id,
        default_cash_account_id,
        default_bank_account_id,
        default_receivables_account_id,
        default_inventory_account_id,
        default_tax_input_account_id,
        default_payables_account_id,
        default_tax_output_account_id,
        default_retained_earnings_account_id,
        default_sales_account_id,
        default_service_sales_account_id,
        default_cogs_account_id,
        coa_initialized_at
    ) VALUES (
        p_org_id,
        v_id_1111, -- cash default
        v_id_1112, -- bank default
        v_id_1121, -- receivable default
        v_id_1131, -- inventory default
        v_id_1151, -- tax input default
        v_id_2111, -- payable default
        v_id_2121, -- tax output default
        v_id_3121, -- retained default (3121)
        v_id_4111, -- sales default
        v_id_4121, -- service default
        v_id_5111, -- cogs default
        timezone('utc'::text, now())
    ) ON CONFLICT (organization_id) DO UPDATE SET
        default_cash_account_id = EXCLUDED.default_cash_account_id,
        default_bank_account_id = EXCLUDED.default_bank_account_id,
        default_receivables_account_id = EXCLUDED.default_receivables_account_id,
        default_inventory_account_id = EXCLUDED.default_inventory_account_id,
        default_tax_input_account_id = EXCLUDED.default_tax_input_account_id,
        default_payables_account_id = EXCLUDED.default_payables_account_id,
        default_tax_output_account_id = EXCLUDED.default_tax_output_account_id,
        default_retained_earnings_account_id = EXCLUDED.default_retained_earnings_account_id,
        default_sales_account_id = EXCLUDED.default_sales_account_id,
        default_service_sales_account_id = EXCLUDED.default_service_sales_account_id,
        default_cogs_account_id = EXCLUDED.default_cogs_account_id,
        coa_initialized_at = EXCLUDED.coa_initialized_at,
        updated_at = timezone('utc'::text, now());

    -- Record in audit logs
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'seed_default_chart_of_accounts',
        jsonb_build_object('status', 'success')
    );

    RETURN 'created';
END;
$$;


-- ==========================================================
-- 8. ACCOUNTING SETTINGS DATABASE-LEVEL CONSTRAINT VERIFICATION
-- ==========================================================

CREATE OR REPLACE FUNCTION public.validate_accounting_setting_account(
    p_org_id uuid, 
    p_account_id uuid, 
    p_field_name text,
    p_expected_class text
) RETURNS void LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org uuid;
    v_active boolean;
    v_direct boolean;
    v_class text;
BEGIN
    if p_account_id IS NULL THEN
        RETURN;
    END IF;
    
    SELECT organization_id, is_active, allow_direct_posting, classification
    INTO v_org, v_active, v_direct, v_class
    FROM public.accounts 
    WHERE id = p_account_id;
    
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'الحساب المحدد في % غير موجود.', p_field_name;
    END IF;
    IF v_org <> p_org_id THEN
        RAISE EXCEPTION 'الحساب المحدد في % لا ينتمي لهذه المنشأة.', p_field_name;
    END IF;
    IF NOT v_active THEN
        RAISE EXCEPTION 'الحساب المحدد في % معطل وغير نشط ولا يمكن استخدامه.', p_field_name;
    END IF;
    IF NOT v_direct THEN
        RAISE EXCEPTION 'الحساب المحدد في % غير متاح للترحيل المباشر (حساب رتبة تجميعية).', p_field_name;
    END IF;
    IF v_class <> p_expected_class THEN
        RAISE EXCEPTION 'خطأ في تصفية الحساب %: التصنيف المطلوب هو "%" بينما الحساب الحالي تصنيفه "%".', p_field_name, p_expected_class, v_class;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_accounting_setting_account(uuid, uuid, text, text) FROM PUBLIC, anon;


CREATE OR REPLACE FUNCTION public.validation_accounting_settings()
RETURNS trigger AS $$
BEGIN
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_receivables_account_id, 'حساب العملاء والذمم المدينة', 'assets');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_payables_account_id, 'حساب الموردين والذمم الدائنة', 'liabilities');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_cash_account_id, 'الخزينة النقدية الافتراضية', 'assets');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_bank_account_id, 'الحساب البنكي الافتراضي', 'assets');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_sales_account_id, 'حساب مبيعات المنتجات', 'revenue');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_service_sales_account_id, 'حساب مبيعات الخدمات', 'revenue');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_tax_output_account_id, 'حساب الضريبة المخرجة', 'liabilities');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_tax_input_account_id, 'حساب الضريبة المدخلة', 'assets');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_cogs_account_id, 'حساب تكلفة البضاعة المباعة', 'expenses');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_inventory_account_id, 'حساب المخزون السلعي', 'assets');
    PERFORM public.validate_accounting_setting_account(NEW.organization_id, NEW.default_retained_earnings_account_id, 'حساب الأرباح المبقاة', 'equity');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_validation_accounting_settings ON public.accounting_settings;
CREATE TRIGGER trg_validation_accounting_settings
    BEFORE INSERT OR UPDATE ON public.accounting_settings
    FOR EACH ROW EXECUTE FUNCTION public.validation_accounting_settings();

REVOKE ALL ON FUNCTION public.validation_accounting_settings() FROM PUBLIC, anon;


-- ==========================================================
-- 9. DEFINE RLS POLICIES FOR ALL FOUR TABLES
-- ==========================================================

-- Enable Row Level Security (RLS) for Phase 2 tables
ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_settings ENABLE ROW LEVEL SECURITY;

-- A. fiscal_years Policies
DROP POLICY IF EXISTS "Users can view fiscal years of their organization" ON public.fiscal_years;
DROP POLICY IF EXISTS "Privileged users can manage fiscal years of their organization" ON public.fiscal_years;

DROP POLICY IF EXISTS "Select fiscal_years" ON public.fiscal_years;
DROP POLICY IF EXISTS "Insert fiscal_years" ON public.fiscal_years;
DROP POLICY IF EXISTS "Update fiscal_years" ON public.fiscal_years;
DROP POLICY IF EXISTS "Delete fiscal_years" ON public.fiscal_years;

CREATE POLICY "Select fiscal_years" ON public.fiscal_years FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


-- B. fiscal_periods Policies
DROP POLICY IF EXISTS "Users can view fiscal periods of their organization" ON public.fiscal_periods;
DROP POLICY IF EXISTS "Privileged users can manage fiscal periods of their organization" ON public.fiscal_periods;

DROP POLICY IF EXISTS "Select fiscal_periods" ON public.fiscal_periods;
DROP POLICY IF EXISTS "Insert fiscal_periods" ON public.fiscal_periods;
DROP POLICY IF EXISTS "Update fiscal_periods" ON public.fiscal_periods;
DROP POLICY IF EXISTS "Delete fiscal_periods" ON public.fiscal_periods;

CREATE POLICY "Select fiscal_periods" ON public.fiscal_periods FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


-- C. accounts Policies
DROP POLICY IF EXISTS "Users can view accounts of their organization" ON public.accounts;
DROP POLICY IF EXISTS "Privileged users can manage accounts of their organization" ON public.accounts;

DROP POLICY IF EXISTS "Select accounts" ON public.accounts;
DROP POLICY IF EXISTS "Insert accounts" ON public.accounts;
DROP POLICY IF EXISTS "Update accounts" ON public.accounts;
DROP POLICY IF EXISTS "Delete accounts" ON public.accounts;

CREATE POLICY "Select accounts" ON public.accounts FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


-- D. accounting_settings Policies
DROP POLICY IF EXISTS "Users can view accounting settings of their organization" ON public.accounting_settings;
DROP POLICY IF EXISTS "Privileged users can manage accounting settings of their organization" ON public.accounting_settings;

DROP POLICY IF EXISTS "Select accounting_settings" ON public.accounting_settings;
DROP POLICY IF EXISTS "Insert accounting_settings" ON public.accounting_settings;
DROP POLICY IF EXISTS "Update accounting_settings" ON public.accounting_settings;
DROP POLICY IF EXISTS "Delete accounting_settings" ON public.accounting_settings;

CREATE POLICY "Select accounting_settings" ON public.accounting_settings FOR SELECT TO authenticated USING (public.is_org_member(organization_id));


-- 10. RE-RESTRUCTURING ACCESS PERMISSIONS Narrowest (Read Only directly / Write through RPC)
REVOKE ALL ON TABLE public.fiscal_years FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.fiscal_periods FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.accounting_settings FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.fiscal_years TO authenticated;
GRANT SELECT ON TABLE public.fiscal_periods TO authenticated;
GRANT SELECT ON TABLE public.accounts TO authenticated;
GRANT SELECT ON TABLE public.accounting_settings TO authenticated;


-- ==========================================================
-- 11. SECURE DATABASE OPERATION WRAPPERS (RPC WRITES)
-- ==========================================================

-- [Status closing functions update_fiscal_year_status and update_fiscal_period_status temporarily removed]


-- C. create_account
CREATE OR REPLACE FUNCTION public.create_account(
    p_org_id uuid,
    p_code text,
    p_name_ar text,
    p_name_en text,
    p_classification text,
    p_nature text,
    p_parent_id uuid,
    p_description text,
    p_is_active boolean DEFAULT true,
    p_allow_direct_posting boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_account_id uuid;
    v_parent_code text;
    v_parent_org uuid;
    v_parent_class text;
    v_parent_nature text;
    v_parent_level integer;
    v_parent_is_system boolean;
    v_level integer := 1;
    v_clean_code text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليس لديك الصلاحية الكافية لإضافة حسابات في الدليل.';
    END IF;

    -- Trim and validate code
    v_clean_code := trim(p_code);
    IF v_clean_code IS NULL OR v_clean_code = '' THEN
        RAISE EXCEPTION 'رمز الحساب لا يمكن أن يكون فارغاً.';
    END IF;
    IF v_clean_code !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'رمز الحساب يجب أن يتكون من أرقام إنجليزية (0-9) فقط دون مسافات أو رموز.';
    END IF;

    -- Validate Arabic Name
    IF p_name_ar IS NULL OR trim(p_name_ar) = '' THEN
        RAISE EXCEPTION 'اسم الحساب باللغة العربية مطلوب ولا يمكن تركه فارغاً.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Check if code exists
    IF EXISTS (
        SELECT 1 FROM public.accounts WHERE organization_id = p_org_id AND code = v_clean_code
    ) THEN
        RAISE EXCEPTION 'رمز الحساب مكرر بالفعل في دليل منشأتك (% %)', v_clean_code, p_name_ar;
    END IF;

    -- Validate Parent
    IF p_parent_id IS NOT NULL THEN
        SELECT code, organization_id, classification, nature, level, is_system
        INTO v_parent_code, v_parent_org, v_parent_class, v_parent_nature, v_parent_level, v_parent_is_system
        FROM public.accounts WHERE id = p_parent_id;

        IF v_parent_org IS NULL THEN
            RAISE EXCEPTION 'الحساب الأب المحدد غير موجود.';
        END IF;
        IF v_parent_org <> p_org_id THEN
            RAISE EXCEPTION 'لا يمكن ربط حساب أب ينتمي لمنشأة مختلفة.';
        END IF;
        IF v_parent_class <> p_classification THEN
            RAISE EXCEPTION 'يجب أن يتطابق تصنيف الحساب الفرعي مع تصنيف الحساب الأب (% <> %).', p_classification, v_parent_class;
        END IF;
        IF v_parent_nature <> p_nature THEN
            RAISE EXCEPTION 'يجب أن تتطابق طبيعة الحساب الفرعي مع طبيعة الحساب الأب (% <> %).', p_nature, v_parent_nature;
        END IF;

        -- Subaccount code MUST start with parent code
        IF substring(v_clean_code from 1 for length(v_parent_code)) <> v_parent_code THEN
            RAISE EXCEPTION 'رمز الحساب الابن (%) يجب أن يبدأ برمز الحساب الأب (%).', v_clean_code, v_parent_code;
        END IF;

        -- Check that parent is not assigned in accounting_settings
        IF EXISTS (
            SELECT 1 FROM public.accounting_settings
            WHERE organization_id = p_org_id
              AND (
                  default_receivables_account_id = p_parent_id OR
                  default_payables_account_id = p_parent_id OR
                  default_cash_account_id = p_parent_id OR
                  default_bank_account_id = p_parent_id OR
                  default_sales_account_id = p_parent_id OR
                  default_service_sales_account_id = p_parent_id OR
                  default_tax_output_account_id = p_parent_id OR
                  default_tax_input_account_id = p_parent_id OR
                  default_cogs_account_id = p_parent_id OR
                  default_inventory_account_id = p_parent_id OR
                  default_retained_earnings_account_id = p_parent_id
              )
        ) THEN
            RAISE EXCEPTION 'لا يمكن إضافة حسابات فرعية تحت حساب مخصص كحساب ترحيل افتراضي في إعدادات المنشأة.';
        END IF;

        -- Prevent adding subaccounts under is_system terminal accounts that allow posting
        IF v_parent_is_system AND EXISTS (
            SELECT 1 FROM public.accounts WHERE id = p_parent_id AND allow_direct_posting = true AND is_system = true
        ) THEN
            RAISE EXCEPTION 'لا يمكن إضافة حساب فرعي تحت حساب نظامي نهائي يسمح بالترحيل المباشر.';
        END IF;

        v_level := v_parent_level + 1;
    END IF;

    INSERT INTO public.accounts (
        organization_id,
        code,
        name_ar,
        name_en,
        classification,
        nature,
        parent_id,
        level,
        description,
        is_system,
        allow_direct_posting,
        is_active
    ) VALUES (
        p_org_id,
        v_clean_code,
        trim(p_name_ar),
        trim(p_name_en),
        p_classification,
        p_nature,
        p_parent_id,
        v_level,
        trim(p_description),
        false,
        COALESCE(p_allow_direct_posting, true),
        COALESCE(p_is_active, true)
    ) RETURNING id INTO v_account_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'create_account',
        jsonb_build_object('account_id', v_account_id, 'code', v_clean_code, 'name_ar', p_name_ar)
    );

    RETURN v_account_id;
END;
$$;


-- D. update_account
CREATE OR REPLACE FUNCTION public.update_account(
    p_org_id uuid,
    p_account_id uuid,
    p_code text,
    p_name_ar text,
    p_name_en text,
    p_classification text,
    p_nature text,
    p_parent_id uuid,
    p_description text,
    p_is_active boolean,
    p_allow_direct_posting boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old_code text;
    v_old_name_ar text;
    v_old_is_system boolean;
    v_old_parent_id uuid;
    v_old_classification text;
    v_old_nature text;
    v_old_is_active boolean;
    v_old_allow_direct_posting boolean;
    
    v_parent_code text;
    v_parent_org uuid;
    v_parent_class text;
    v_parent_nature text;
    v_parent_level integer;
    v_parent_is_system boolean;
    
    v_new_level integer := 1;
    v_clean_code text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليس لديك الصلاحية الكافية لتعديل حسابات الدليل.';
    END IF;

    -- Trim and validate code
    v_clean_code := trim(p_code);
    IF v_clean_code IS NULL OR v_clean_code = '' THEN
        RAISE EXCEPTION 'رمز الحساب لا يمكن أن يكون فارغاً.';
    END IF;
    IF v_clean_code !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'رمز الحساب يجب أن يتكون من أرقام إنجليزية (0-9) فقط دون مسافات أو رموز.';
    END IF;

    -- Validate Arabic Name
    IF p_name_ar IS NULL OR trim(p_name_ar) = '' THEN
        RAISE EXCEPTION 'اسم الحساب باللغة العربية مطلوب ولا يمكن تركه فارغاً.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Lock the row and retrieve original state
    SELECT code, name_ar, is_system, parent_id, classification, nature, is_active, allow_direct_posting
    INTO v_old_code, v_old_name_ar, v_old_is_system, v_old_parent_id, v_old_classification, v_old_nature, v_old_is_active, v_old_allow_direct_posting
    FROM public.accounts
    WHERE id = p_account_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_old_code IS NULL THEN
        RAISE EXCEPTION 'الحساب المطلوب تعديله غير موجود أو لا ينتمي لهذه المنشأة.';
    END IF;

    -- Prevent modifying system fields on system accounts
    IF v_old_is_system THEN
        IF v_clean_code <> v_old_code OR p_classification <> v_old_classification OR p_nature <> v_old_nature THEN
            RAISE EXCEPTION 'يُمنع تعديل الرمز أو التصنيف أو الطبيعة المحاسبية للحسابات النظامية لضمان سلامة العمليات المالية.';
        END IF;
        IF p_parent_id IS DISTINCT FROM v_old_parent_id THEN
            RAISE EXCEPTION 'يُمنع نقل الحسابات النظامية المحمية إلى حساب أب آخر لضمان تماسك هيكل النظام.';
        END IF;
    END IF;

    -- Validate parent association
    IF p_parent_id IS NOT NULL THEN
        IF p_parent_id = p_account_id THEN
            RAISE EXCEPTION 'لا يمكن اختيار الحساب نفسه كحساب أب.';
        END IF;

        -- Check for circular loop
        DECLARE
            v_curr_parent uuid := p_parent_id;
        BEGIN
            WHILE v_curr_parent IS NOT NULL LOOP
                IF v_curr_parent = p_account_id THEN
                    RAISE EXCEPTION 'تم اكتشاف علاقة دائرية غير مسموح بها في شجرة الحسابات.';
                END IF;
                SELECT parent_id INTO v_curr_parent FROM public.accounts WHERE id = v_curr_parent;
            END LOOP;
        END;

        SELECT code, organization_id, classification, nature, level, is_system
        INTO v_parent_code, v_parent_org, v_parent_class, v_parent_nature, v_parent_level, v_parent_is_system
        FROM public.accounts WHERE id = p_parent_id;

        IF v_parent_org IS NULL THEN
            RAISE EXCEPTION 'الحساب الأب المحدد غير موجود.';
        END IF;
        IF v_parent_org <> p_org_id THEN
            RAISE EXCEPTION 'لا يمكن ربط حساب أب ينتمي لمنشأة مختلفة.';
        END IF;
        IF v_parent_class <> p_classification THEN
            RAISE EXCEPTION 'يجب أن يتطابق تصنيف الحساب مع تصنيف الحساب الأب (% <> %).', p_classification, v_parent_class;
        END IF;
        IF v_parent_nature <> p_nature THEN
            RAISE EXCEPTION 'يجب أن تتطابق طبيعة الحساب مع طبيعة الحساب الأب (% <> %).', p_nature, v_parent_nature;
        END IF;

        -- Subaccount code MUST start with parent code
        IF substring(v_clean_code from 1 for length(v_parent_code)) <> v_parent_code THEN
            RAISE EXCEPTION 'رمز الحساب الابن (%) يجب أن يبدأ برمز الحساب الأب (%).', v_clean_code, v_parent_code;
        END IF;

        -- Prevent adding a sub-account under an account that is linked to accounting_settings
        IF EXISTS (
            SELECT 1 FROM public.accounting_settings
            WHERE organization_id = p_org_id
              AND (
                  default_receivables_account_id = p_parent_id OR
                  default_payables_account_id = p_parent_id OR
                  default_cash_account_id = p_parent_id OR
                  default_bank_account_id = p_parent_id OR
                  default_sales_account_id = p_parent_id OR
                  default_service_sales_account_id = p_parent_id OR
                  default_tax_output_account_id = p_parent_id OR
                  default_tax_input_account_id = p_parent_id OR
                  default_cogs_account_id = p_parent_id OR
                  default_inventory_account_id = p_parent_id OR
                  default_retained_earnings_account_id = p_parent_id
              )
        ) THEN
            RAISE EXCEPTION 'لا يمكن إضافة حسابات فرعية تحت حساب مخصص كحساب ترحيل افتراضي في إعدادات المنشأة.';
        END IF;

        -- Prevent adding subaccounts under is_system terminal accounts that allow posting
        IF v_parent_is_system AND EXISTS (
            SELECT 1 FROM public.accounts WHERE id = p_parent_id AND allow_direct_posting = true AND is_system = true
        ) THEN
            RAISE EXCEPTION 'لا يمكن إضافة حساب فرعي تحت حساب نظامي نهائي يسمح بالترحيل المباشر.';
        END IF;

        v_new_level := v_parent_level + 1;
    END IF;

    -- Update standard modifiable fields
    UPDATE public.accounts
    SET 
        code = v_clean_code,
        name_ar = trim(p_name_ar),
        name_en = trim(p_name_en),
        classification = p_classification,
        nature = p_nature,
        parent_id = p_parent_id,
        level = v_new_level,
        description = trim(p_description),
        is_active = p_is_active,
        allow_direct_posting = p_allow_direct_posting,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_account_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الحساب المطلوب تعديله غير موجود أو يفتقر للصلاحية.';
    END IF;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'update_account',
        jsonb_build_object(
            'account_id', p_account_id,
            'old_code', v_old_code,
            'new_code', v_clean_code,
            'old_name_ar', v_old_name_ar,
            'new_name_ar', p_name_ar,
            'old_classification', v_old_classification,
            'new_classification', p_classification,
            'old_nature', v_old_nature,
            'new_nature', p_nature,
            'old_parent_id', v_old_parent_id,
            'new_parent_id', p_parent_id
        )
    );
END;
$$;


-- E. delete_account
CREATE OR REPLACE FUNCTION public.delete_account(
    p_org_id uuid,
    p_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_acc_name text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليس لديك الصلاحية الكافية لحذف حسابات الدليل.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Verify existence and retrieve name
    SELECT name_ar INTO v_acc_name FROM public.accounts WHERE id = p_account_id AND organization_id = p_org_id;
    IF v_acc_name IS NULL THEN
        RAISE EXCEPTION 'الحساب المطلوب حذفه غير موجود أو لا ينتمي لهذه المنشأة.';
    END IF;

    -- Check if the account is used in accounting_settings
    IF EXISTS (
        SELECT 1 FROM public.accounting_settings
        WHERE organization_id = p_org_id
          AND (
              default_receivables_account_id = p_account_id OR
              default_payables_account_id = p_account_id OR
              default_cash_account_id = p_account_id OR
              default_bank_account_id = p_account_id OR
              default_sales_account_id = p_account_id OR
              default_service_sales_account_id = p_account_id OR
              default_tax_output_account_id = p_account_id OR
              default_tax_input_account_id = p_account_id OR
              default_cogs_account_id = p_account_id OR
              default_inventory_account_id = p_account_id OR
              default_retained_earnings_account_id = p_account_id
          )
    ) THEN
        RAISE EXCEPTION 'لا يمكن حذف الحساب (%): لأنه مخصص كحساب ترحيل افتراضي في إعدادات المنشأة.', v_acc_name;
    END IF;

    DELETE FROM public.accounts
    WHERE id = p_account_id AND organization_id = p_org_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'delete_account',
        jsonb_build_object('account_id', p_account_id, 'name_ar', v_acc_name)
    );
END;
$$;


-- F. update_accounting_settings
CREATE OR REPLACE FUNCTION public.update_accounting_settings(
    p_org_id uuid,
    p_receivables uuid,
    p_payables uuid,
    p_cash uuid,
    p_bank uuid,
    p_sales uuid,
    p_service_sales uuid,
    p_tax_output uuid,
    p_tax_input uuid,
    p_cogs uuid,
    p_inventory uuid,
    p_retained uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليس لديك الصلاحية الكافية لتعديل الإعدادات المحاسبية الافتراضية.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    INSERT INTO public.accounting_settings (
        organization_id,
        default_receivables_account_id,
        default_payables_account_id,
        default_cash_account_id,
        default_bank_account_id,
        default_sales_account_id,
        default_service_sales_account_id,
        default_tax_output_account_id,
        default_tax_input_account_id,
        default_cogs_account_id,
        default_inventory_account_id,
        default_retained_earnings_account_id
    ) VALUES (
        p_org_id,
        p_receivables,
        p_payables,
        p_cash,
        p_bank,
        p_sales,
        p_service_sales,
        p_tax_output,
        p_tax_input,
        p_cogs,
        p_inventory,
        p_retained
    )
    ON CONFLICT (organization_id) DO UPDATE SET
        default_receivables_account_id = EXCLUDED.default_receivables_account_id,
        default_payables_account_id = EXCLUDED.default_payables_account_id,
        default_cash_account_id = EXCLUDED.default_cash_account_id,
        default_bank_account_id = EXCLUDED.default_bank_account_id,
        default_sales_account_id = EXCLUDED.default_sales_account_id,
        default_service_sales_account_id = EXCLUDED.default_service_sales_account_id,
        default_tax_output_account_id = EXCLUDED.default_tax_output_account_id,
        default_tax_input_account_id = EXCLUDED.default_tax_input_account_id,
        default_cogs_account_id = EXCLUDED.default_cogs_account_id,
        default_inventory_account_id = EXCLUDED.default_inventory_account_id,
        default_retained_earnings_account_id = EXCLUDED.default_retained_earnings_account_id,
        updated_at = timezone('utc'::text, now());

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'update_accounting_settings',
        jsonb_build_object('status', 'success')
    );
END;
$$;


-- ==========================================================
-- 12. RPC FUNCTION PERMISSION HOOKS (REVOKE & GRANTS)
-- ==========================================================

-- Secure custom high-privilege RPC functions
REVOKE ALL ON FUNCTION public.create_fiscal_year(uuid, text, date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_fiscal_year(uuid, text, date, date, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.set_current_fiscal_year(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_current_fiscal_year(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.seed_default_chart_of_accounts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_default_chart_of_accounts(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_account(uuid, text, text, text, text, text, uuid, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_account(uuid, text, text, text, text, text, uuid, text, boolean, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.update_account(uuid, uuid, text, text, text, text, text, uuid, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_account(uuid, uuid, text, text, text, text, text, uuid, text, boolean, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_account(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_account(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.update_accounting_settings(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_accounting_settings(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) TO authenticated;

COMMIT;
