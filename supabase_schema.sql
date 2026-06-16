-- LEDGRA l لِدجرا - Database Schema (Unified & Secure)
-- Run this in your Supabase SQL Editor.

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

----------------------------------------------------
-- 1. Profiles Table (extends auth.users)
----------------------------------------------------
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

----------------------------------------------------
-- 2. Organizations Table
----------------------------------------------------
CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_ar TEXT NOT NULL,
    name_en TEXT,
    activity_type TEXT,
    country TEXT DEFAULT 'السعودية' NOT NULL,
    city TEXT,
    phone TEXT,
    email TEXT,
    logo_url TEXT,
    legal_type TEXT,
    vat_number TEXT,
    is_vat_registered BOOLEAN DEFAULT FALSE NOT NULL,
    fiscal_year_start DATE,
    currency TEXT DEFAULT 'SAR' NOT NULL,
    primary_language TEXT DEFAULT 'ar' NOT NULL,
    onboarding_completed BOOLEAN DEFAULT FALSE NOT NULL,
    onboarding_step INTEGER DEFAULT 1 NOT NULL,
    setup_completed_at TIMESTAMPTZ,
    cr_number TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    system_start_date DATE,
    accounting_mode TEXT,
    starting_balances_later BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_cr_number CHECK (cr_number IS NULL OR (cr_number ~ '^\d{10}$')),
    CONSTRAINT chk_vat_number CHECK (vat_number IS NULL OR (vat_number ~ '^3\d{13}3$'))
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

----------------------------------------------------
-- 3. Roles Table
----------------------------------------------------
CREATE TABLE public.roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT
);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- Seed Initial Roles
INSERT INTO public.roles (id, name, description) VALUES
('owner', 'مالك المنشأة', 'جميع الصلاحيات والتحكم الكامل بالنظام والاستضافات'),
('admin', 'مدير النظام', 'صلاحيات إدارية كاملة للمبيعات والمشتريات والمحاسبة والمستخدمين'),
('accountant', 'محاسب', 'صلاحيات واسعة تشمل الحركات المالية والقيود والتقارير والمبيعات/المشتريات'),
('sales', 'مبيعات', 'صلاحيات محصورة بإنشاء فواتير المبيعات، ومتابعة العملاء والقبض'),
('viewer', 'مستعرض', 'صلاحية الاستعراض والقراءة فقط للتقارير دون إدخال تعديلات')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

----------------------------------------------------
-- 4. Permissions Table
----------------------------------------------------
CREATE TABLE public.permissions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- Seed Permissions
INSERT INTO public.permissions (id, name, description) VALUES
('manage_org', 'إدارة المنشأة والمبيعات والمشتريات', 'السماح للتحكم ببيانات المنشأة وتعديلها'),
('view_all', 'استعراض جميع البيانات', 'صلاحية قراءة عامة لجميع السجلات والبيانات'),
('manage_users', 'إدارة المستخدمين والصلاحيات', 'إضافة وتعديل وحذف مستخدمي المنشأة وتعيين صلاحياتهم'),
('view_reports', 'عرض التقارير المالية والضريبية', 'الوصول لتقارير الأرباح والميزانية وضريبة القيمة المضافة'),
('create_invoices', 'إنشاء الفواتير وسندات القبض والدفع', 'إنشاء وتعديل فواتير العملاء وفواتير الموردين'),
('manage_settings', 'تعديل الإعدادات والربط والضريبة', 'الوصول لصفحة الإعدادات وتخصيص الفواتير والضريبة')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

----------------------------------------------------
-- 5. Role Permissions (Mapping Table)
----------------------------------------------------
CREATE TABLE public.role_permissions (
    role_id TEXT REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id TEXT REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Assign permissions to roles
INSERT INTO public.role_permissions (role_id, permission_id) VALUES
('owner', 'manage_org'), ('owner', 'view_all'), ('owner', 'manage_users'), ('owner', 'view_reports'), ('owner', 'create_invoices'), ('owner', 'manage_settings'),
('admin', 'view_all'), ('admin', 'manage_users'), ('admin', 'view_reports'), ('admin', 'create_invoices'), ('admin', 'manage_settings'),
('accountant', 'view_all'), ('accountant', 'view_reports'), ('accountant', 'create_invoices'),
('sales', 'create_invoices'),
('viewer', 'view_all'), ('viewer', 'view_reports')
ON CONFLICT DO NOTHING;

----------------------------------------------------
-- 6. Organization Members (Tenant Mapping)
----------------------------------------------------
CREATE TABLE public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL REFERENCES public.roles(id) DEFAULT 'viewer',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(organization_id, profile_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

----------------------------------------------------
-- 7. Organization Settings
----------------------------------------------------
CREATE TABLE public.organization_settings (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    settings JSONB DEFAULT '{}'::jsonb NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

----------------------------------------------------
-- 8. Branches Table
----------------------------------------------------
CREATE TABLE public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    code TEXT,
    address TEXT,
    is_main BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT unique_branch_code_per_org UNIQUE (organization_id, code)
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Verify only one main branch exists per organization using partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS unique_main_branch ON public.branches (organization_id) WHERE (is_main = true);

----------------------------------------------------
-- 9. Audit Logs Table
-- (Strictly writable only via trusted system RPC/Triggers)
----------------------------------------------------
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb NOT NULL,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

----------------------------------------------------
-- 10. Notifications Table
----------------------------------------------------
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info' NOT NULL, -- 'info', 'warning', 'success', 'error'
    is_read BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;


----------------------------------------------------
-- HELPERS AND CONTROL POLICIES
----------------------------------------------------

-- Function to check if a user is a member of an organization
CREATE OR REPLACE FUNCTION public.is_member_of(org_id UUID, user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = org_id AND profile_id = user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- 1. Profiles Policies
CREATE POLICY "Secure profile read policy"
    ON public.profiles FOR SELECT
    USING (
        auth.uid() = id
        OR EXISTS (
            SELECT 1 FROM public.organization_members m1
            JOIN public.organization_members m2 ON m1.organization_id = m2.organization_id
            WHERE m1.profile_id = auth.uid() AND m2.profile_id = id
        )
    );

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);


-- 2. Organizations Policies
CREATE POLICY "Secure organizations select policy"
    ON public.organizations FOR SELECT
    USING (public.is_member_of(id, auth.uid()));

CREATE POLICY "Secure organizations update policy"
    ON public.organizations FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = id 
            AND profile_id = auth.uid() 
            AND role IN ('owner', 'admin')
        )
    );

-- Organizations are created securely through create_organization_with_owner RPC only.
-- Hence, direct inserts on Organizations table from client SDK are not permitted (No insert policy).


-- 3. Organization Members Policies
CREATE POLICY "Secure organization_members select policy"
    ON public.organization_members FOR SELECT
    USING (public.is_member_of(organization_id, auth.uid()));

-- Only owners and admins can add, change, or remove members inside their organization
CREATE POLICY "Secure organization_members mutate policy"
    ON public.organization_members FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = public.organization_members.organization_id 
            AND profile_id = auth.uid() 
            AND role IN ('owner', 'admin')
        )
    );


-- 4. Organization Settings Policies
CREATE POLICY "Members can view setup settings"
    ON public.organization_settings FOR SELECT
    USING (public.is_member_of(organization_id, auth.uid()));

CREATE POLICY "Owners or Admins can toggle settings"
    ON public.organization_settings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = public.organization_settings.organization_id 
            AND profile_id = auth.uid() 
            AND role IN ('owner', 'admin')
        )
    );


-- 5. Branches Policies
CREATE POLICY "Members can view branches"
    ON public.branches FOR SELECT
    USING (public.is_member_of(organization_id, auth.uid()));

CREATE POLICY "Owners or Admins can manage branches"
    ON public.branches FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = public.branches.organization_id 
            AND profile_id = auth.uid() 
            AND role IN ('owner', 'admin')
        )
    );


-- 6. System catalogs read access
CREATE POLICY "Allow read public roles" ON public.roles FOR SELECT USING (true);
CREATE POLICY "Allow read public permissions" ON public.permissions FOR SELECT USING (true);
CREATE POLICY "Allow read public role_permissions" ON public.role_permissions FOR SELECT USING (true);


-- 7. Audit Logs Policies (No insert capabilities from frontend)
CREATE POLICY "Members can view audit logs"
    ON public.audit_logs FOR SELECT
    USING (public.is_member_of(organization_id, auth.uid()));


-- 8. Notifications Policies
CREATE POLICY "Secure notifications select and manage policy"
    ON public.notifications FOR ALL
    USING (
        auth.uid() = profile_id
        AND public.is_member_of(organization_id, auth.uid())
    );


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
        p_legal_type,
        p_vat_number,
        p_is_vat_registered,
        p_fiscal_year_start,
        'SAR', -- Standard SAR currency code
        'ar',
        p_onboarding_completed,
        p_onboarding_step,
        CASE WHEN p_onboarding_completed THEN NOW() ELSE NULL END,
        p_cr_number,
        v_user_id,
        p_system_start_date,
        p_accounting_mode,
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
            'accounting_mode', p_accounting_mode,
            'system_start_date', p_system_start_date,
            'starting_balances_later', p_starting_balances_later
        ),
        NOW()
    );

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
        '001',
        COALESCE(p_city, 'الرياض'),
        true,
        NOW()
    );

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


----------------------------------------------------
-- AUTOMATIC HANDLERS / TRIGGERS
----------------------------------------------------

-- Automatically create profile linked with Supabase Auth user on registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, phone, avatar_url)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'مستخدم لِدجرا'),
        new.raw_user_meta_data->>'phone',
        new.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Trigger definition for auth user creation
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Trigger Function: enforce updates on members (no self-upgrades, no demoting last Owner)
CREATE OR REPLACE FUNCTION public.handle_member_update_rules()
RETURNS TRIGGER AS $$
DECLARE
    v_owner_count INTEGER;
    v_user_role TEXT;
BEGIN
    -- Get role of the actor (auth.uid()) in the current org
    SELECT role INTO v_user_role FROM public.organization_members
    WHERE organization_id = OLD.organization_id AND profile_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'غير مصرح لك بتعديل أو حذف الأعضاء.';
    END IF;

    -- Prevent modifying their own role
    IF OLD.profile_id = auth.uid() AND OLD.role <> NEW.role THEN
        RAISE EXCEPTION 'يمنع ترقية أو تعديل دورك الشخصي بنفسك.';
    END IF;

    -- Prevent demoting last owner
    IF OLD.role = 'owner' AND NEW.role <> 'owner' THEN
         SELECT COUNT(1) INTO v_owner_count FROM public.organization_members
         WHERE organization_id = OLD.organization_id AND role = 'owner';
         IF v_owner_count <= 1 THEN
             RAISE EXCEPTION 'لا يمكن تغيير دور المالك الأخير للشركة لتجنب ترك المنشأة بلا مالك.';
          END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Trigger for member updates
CREATE OR REPLACE TRIGGER trg_member_update_rules
    BEFORE UPDATE ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.handle_member_update_rules();


-- Trigger Function: enforce deletes on members (no deleting last owner)
CREATE OR REPLACE FUNCTION public.handle_member_delete_rules()
RETURNS TRIGGER AS $$
DECLARE
    v_owner_count INTEGER;
    v_user_role TEXT;
BEGIN
    -- Get role of the actor in the current org
    SELECT role INTO v_user_role FROM public.organization_members
    WHERE organization_id = OLD.organization_id AND profile_id = auth.uid();

    -- Allow users to leave themselves, otherwise check admin permissions
    IF OLD.profile_id <> auth.uid() THEN
        IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
            RAISE EXCEPTION 'غير مصرح لك بحذف أعضاء هذه المنشأة.';
        END IF;
    END IF;

    -- Verify last owner block
    IF OLD.role = 'owner' THEN
         SELECT COUNT(1) INTO v_owner_count FROM public.organization_members
         WHERE organization_id = OLD.organization_id AND role = 'owner';
         IF v_owner_count <= 1 THEN
             RAISE EXCEPTION 'لا يمكنك مغادرة أو حذف المالك الأخير للشركة لتجنب ترك المنشأة بلا مالك.';
         END IF;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Trigger for member deletion
CREATE OR REPLACE TRIGGER trg_member_delete_rules
    BEFORE DELETE ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.handle_member_delete_rules();
