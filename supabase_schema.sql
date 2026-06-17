-- LEDGRA l لِدجرا - Database Schema (Unified & Secure)
-- Run this in your Supabase SQL Editor.

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

----------------------------------------------------
-- 1. Profiles Table (extends auth.users)
----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

----------------------------------------------------
-- 2. Organizations Table
----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_ar TEXT NOT NULL,
    name_en TEXT,
    activity_type TEXT,
    country TEXT DEFAULT 'السعودية',
    city TEXT,
    phone TEXT,
    email TEXT,
    logo_url TEXT,
    legal_type TEXT,
    vat_number TEXT,
    is_vat_registered BOOLEAN DEFAULT FALSE,
    fiscal_year_start DATE,
    currency TEXT DEFAULT 'SAR',
    primary_language TEXT DEFAULT 'ar',
    onboarding_completed BOOLEAN DEFAULT FALSE,
    onboarding_step INTEGER DEFAULT 1 NOT NULL,
    setup_completed_at TIMESTAMPTZ,
    cr_number TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    system_start_date DATE,
    accounting_mode TEXT DEFAULT 'pro',
    starting_balances_later BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_cr_number CHECK (cr_number IS NULL OR cr_number ~ '^\d{10}$'),
    CONSTRAINT chk_vat_number CHECK (vat_number IS NULL OR vat_number ~ '^3\d{13}3$')
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

----------------------------------------------------
-- 3. Organization Members (Tenant Mapping)
----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','accountant','viewer','member')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, profile_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

----------------------------------------------------
-- 4. Organization Settings
----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
    settings JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

----------------------------------------------------
-- 5. Branches Table
----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    code TEXT NOT NULL,
    address TEXT,
    is_main BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, code)
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Verify only one main branch exists per organization using partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS unique_main_branch ON public.branches(organization_id) WHERE is_main = true;

----------------------------------------------------
-- 6. Audit Logs Table
-- (Strictly writable only via trusted system RPC/Triggers)
----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

----------------------------------------------------
-- 7. Notifications Table
----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT,
    body TEXT,
    message TEXT, -- For backward-compatibility with UI queries
    type TEXT DEFAULT 'info', -- For backend/frontend compatibility
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

----------------------------------------------------
-- 8. Simple Roles / Permissions / Role Permissions
----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY(role_id, permission_id)
);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Stable Seed Initial Roles (using static UUIDs to prevent dupes)
INSERT INTO public.roles (id, name, description) VALUES
('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid, 'owner', 'مالك المنشأة - صلاحيات كاملة للتحكم بالنظام ماليًا وإداريًا'),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8'::uuid, 'admin', 'مدير النظام - صلاحيات إدارية كاملة للمبيعات والمشتريات والمحاسبة والمستخدمين'),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8'::uuid, 'accountant', 'محاسب - حركات مالية وقيود وتقارير مبيعات ومشتريات ومراجعة'),
('6ba7b813-9dad-11d1-80b4-00c04fd430c8'::uuid, 'viewer', 'مستعرض - صلاحية الاستعراض والقراءة فقط للتقارير دون إدخال تعديلات'),
('6ba7b814-9dad-11d1-80b4-00c04fd430c8'::uuid, 'member', 'عضو - صلاحيات أساسية من مبيعات ومتابعة عملاء وقبض')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- Stable Seed Initial Permissions
INSERT INTO public.permissions (id, name, description) VALUES
('e82502aa-c1cb-44f3-be25-83e979a0db10'::uuid, 'manage_org', 'إدارة المنشأة والمبيعات والمشتريات والبيانات'),
('e82502aa-c1cb-44f3-be25-83e979a0db11'::uuid, 'view_all', 'استعراض جميع السجلات والبيانات العامة والتقارير'),
('e82502aa-c1cb-44f3-be25-83e979a0db12'::uuid, 'manage_users', 'إدارة المستخدمين والصلاحيات داخل المنشأة'),
('e82502aa-c1cb-44f3-be25-83e979a0db13'::uuid, 'view_reports', 'عرض التقارير المالية والضريبية والميزانيات'),
('e82502aa-c1cb-44f3-be25-83e979a0db14'::uuid, 'create_invoices', 'إنشاء وتعديل فواتير المبيعات والمشتريات وسندات الصرف والقبض'),
('e82502aa-c1cb-44f3-be25-83e979a0db15'::uuid, 'manage_settings', 'تخصيص الإعدادات العامة وعناوين الضريبة والفروع')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- Assign permissions to roles
INSERT INTO public.role_permissions (role_id, permission_id) VALUES
-- Owner Permissions
('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db10'::uuid),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db11'::uuid),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db12'::uuid),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db13'::uuid),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db14'::uuid),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db15'::uuid),
-- Admin Permissions
('6ba7b811-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db11'::uuid),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db12'::uuid),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db13'::uuid),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db14'::uuid),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db15'::uuid),
-- Accountant Permissions
('6ba7b812-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db11'::uuid),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db13'::uuid),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db14'::uuid),
-- Viewer Permissions
('6ba7b813-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db11'::uuid),
('6ba7b813-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db13'::uuid),
-- Member/Sales Permissions
('6ba7b814-9dad-11d1-80b4-00c04fd430c8'::uuid, 'e82502aa-c1cb-44f3-be25-83e979a0db14'::uuid)
ON CONFLICT DO NOTHING;

----------------------------------------------------
-- Notification Body & Message synchronizer trigger
----------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_notification_body_message()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.body IS NOT NULL AND NEW.message IS NULL THEN
        NEW.message := NEW.body;
    ELSIF NEW.message IS NOT NULL AND NEW.body IS NULL THEN
        NEW.body := NEW.message;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_notification_body_message ON public.notifications;
CREATE TRIGGER trg_sync_notification_body_message
    BEFORE INSERT OR UPDATE ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.sync_notification_body_message();

----------------------------------------------------
-- HELPERS AND CONTROL POLICIES
----------------------------------------------------

-- Function to check if a user is a member of an organization
CREATE OR REPLACE FUNCTION public.is_member_of(org_id UUID, user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id AND profile_id = user_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- 1. Profiles Policies
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles
    FOR SELECT USING (
        auth.uid() = id
        OR EXISTS (
            SELECT 1 FROM public.organization_members m1
            JOIN public.organization_members m2 ON m1.organization_id = m2.organization_id
            WHERE m1.profile_id = auth.uid() AND m2.profile_id = public.profiles.id
        )
    );

DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
CREATE POLICY "profiles_insert_policy" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- 2. Organizations Policies
DROP POLICY IF EXISTS "organizations_select_policy" ON public.organizations;
CREATE POLICY "organizations_select_policy" ON public.organizations
    FOR SELECT USING (public.is_member_of(id, auth.uid()));

DROP POLICY IF EXISTS "organizations_update_policy" ON public.organizations;
CREATE POLICY "organizations_update_policy" ON public.organizations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = public.organizations.id
            AND profile_id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- 3. Organization Members Policies
DROP POLICY IF EXISTS "organization_members_select_policy" ON public.organization_members;
CREATE POLICY "organization_members_select_policy" ON public.organization_members
    FOR SELECT USING (public.is_member_of(organization_id, auth.uid()));

DROP POLICY IF EXISTS "organization_members_modify_policy" ON public.organization_members;
CREATE POLICY "organization_members_modify_policy" ON public.organization_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = public.organization_members.organization_id
            AND profile_id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- 4. Organization Settings Policies
DROP POLICY IF EXISTS "organization_settings_select_policy" ON public.organization_settings;
CREATE POLICY "organization_settings_select_policy" ON public.organization_settings
    FOR SELECT USING (public.is_member_of(organization_id, auth.uid()));

DROP POLICY IF EXISTS "organization_settings_modify_policy" ON public.organization_settings;
CREATE POLICY "organization_settings_modify_policy" ON public.organization_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = public.organization_settings.organization_id
            AND profile_id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- 5. Branches Policies
DROP POLICY IF EXISTS "branches_select_policy" ON public.branches;
CREATE POLICY "branches_select_policy" ON public.branches
    FOR SELECT USING (public.is_member_of(organization_id, auth.uid()));

DROP POLICY IF EXISTS "branches_modify_policy" ON public.branches;
CREATE POLICY "branches_modify_policy" ON public.branches
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = public.branches.organization_id
            AND profile_id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- 6. System catalogs read access
DROP POLICY IF EXISTS "roles_read_policy" ON public.roles;
CREATE POLICY "roles_read_policy" ON public.roles 
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "permissions_read_policy" ON public.permissions;
CREATE POLICY "permissions_read_policy" ON public.permissions 
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "role_permissions_read_policy" ON public.role_permissions;
CREATE POLICY "role_permissions_read_policy" ON public.role_permissions 
    FOR SELECT USING (auth.role() = 'authenticated');

-- 7. Audit Logs Policies (No insert capabilities from frontend)
DROP POLICY IF EXISTS "audit_logs_select_policy" ON public.audit_logs;
CREATE POLICY "audit_logs_select_policy" ON public.audit_logs
    FOR SELECT USING (public.is_member_of(organization_id, auth.uid()));

-- 8. Notifications Policies
DROP POLICY IF EXISTS "notifications_manage_policy" ON public.notifications;
CREATE POLICY "notifications_manage_policy" ON public.notifications
    FOR ALL USING (auth.uid() = profile_id);


----------------------------------------------------
-- SECURE TRANSACTIONAL RPC: create_organization_with_owner
----------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
    p_name_ar TEXT,
    p_name_en TEXT,
    p_activity_type TEXT,
    p_city TEXT,
    p_phone TEXT,
    p_email TEXT,
    p_legal_type TEXT,
    p_vat_number TEXT,
    p_is_vat_registered BOOLEAN,
    p_fiscal_year_start DATE,
    p_cr_number TEXT,
    p_system_start_date DATE,
    p_accounting_mode TEXT,
    p_starting_balances_later BOOLEAN,
    p_onboarding_completed BOOLEAN DEFAULT true,
    p_onboarding_step INTEGER DEFAULT 3
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id UUID;
    v_user_id UUID;
BEGIN
    -- 1. Verify authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح للزوار والعملاء غير المسجلين إنشاء منشأة جديدة.';
    END IF;

    -- 2. Insert Organization
    INSERT INTO public.organizations (
        name_ar,
        name_en,
        activity_type,
        country,
        city,
        phone,
        email,
        logo_url,
        legal_type,
        vat_number,
        is_vat_registered,
        fiscal_year_start,
        currency,
        primary_language,
        onboarding_completed,
        onboarding_step,
        setup_completed_at,
        cr_number,
        created_by,
        system_start_date,
        accounting_mode,
        starting_balances_later,
        created_at,
        updated_at
    ) VALUES (
        p_name_ar,
        p_name_en,
        p_activity_type,
        'السعودية',
        p_city,
        p_phone,
        p_email,
        NULL,
        p_legal_type,
        p_vat_number,
        p_is_vat_registered,
        p_fiscal_year_start,
        'SAR',
        'ar',
        p_onboarding_completed,
        p_onboarding_step,
        CASE WHEN p_onboarding_completed THEN NOW() ELSE NULL END,
        p_cr_number,
        v_user_id,
        p_system_start_date,
        COALESCE(p_accounting_mode, 'pro'),
        p_starting_balances_later,
        NOW(),
        NOW()
    ) RETURNING id INTO v_org_id;

    -- 3. Add user as Owner in organization_members
    INSERT INTO public.organization_members (
        organization_id,
        profile_id,
        role,
        created_at
    ) VALUES (
        v_org_id,
        v_user_id,
        'owner',
        NOW()
    );

    -- 4. Create Organization Settings
    INSERT INTO public.organization_settings (
        organization_id,
        settings,
        updated_at
    ) VALUES (
        v_org_id,
        jsonb_build_object(
            'accounting_mode', COALESCE(p_accounting_mode, 'pro'),
            'system_start_date', p_system_start_date,
            'starting_balances_later', p_starting_balances_later
        ),
        NOW()
    ) ON CONFLICT (organization_id) DO UPDATE 
      SET settings = EXCLUDED.settings, updated_at = NOW();

    -- 5. Create First/Main Branch
    INSERT INTO public.branches (
        organization_id,
        name_ar,
        name_en,
        code,
        address,
        is_main,
        created_at
    ) VALUES (
        v_org_id,
        'الفرع الرئيسي',
        'Main Branch',
        '0001',
        COALESCE(p_city, 'الرياض'),
        true,
        NOW()
    ) ON CONFLICT (organization_id, code) DO NOTHING;

    -- 6. Log Secure Audit Log entry
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details,
        ip_address,
        created_at
    ) VALUES (
        v_org_id,
        v_user_id,
        'إنشاء المنشأة',
        jsonb_build_object(
            'org_name_ar', p_name_ar,
            'cr_number', p_cr_number,
            'vat_number', p_vat_number,
            'created_by', v_user_id
        ),
        NULL,
        NOW()
    );

    -- 7. Return new Org ID
    RETURN v_org_id;
END;
$$;


----------------------------------------------------
-- AUTOMATIC HANDLERS / TRIGGERS
----------------------------------------------------

-- Automatically create profile linked with Supabase Auth user on registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, phone)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'مستخدم لِدجرا'),
        new.raw_user_meta_data->>'phone'
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Trigger definition for auth user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
