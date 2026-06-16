-- LEDGRA l لِدجرا - Database Schema
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
    fiscal_year_start TEXT,
    currency TEXT DEFAULT 'ر.س' NOT NULL,
    primary_language TEXT DEFAULT 'ar' NOT NULL,
    onboarding_completed BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
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
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

----------------------------------------------------
-- 9. Audit Logs Table
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
-- SECURITY POLICIES (Row Level Security - RLS)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 1. Profiles Policies
CREATE POLICY "Users can view any profile"
    ON public.profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);


-- 2. Organizations Policies
CREATE POLICY "Users can view organizations they are member of"
    ON public.organizations FOR SELECT
    USING (public.is_member_of(id, auth.uid()));

CREATE POLICY "Owners or Admins can update their organization"
    ON public.organizations FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = id 
            AND profile_id = auth.uid() 
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Any authenticated user can create an organization"
    ON public.organizations FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');


-- 3. Organization Members Policies
CREATE POLICY "Members can view other members in their organization"
    ON public.organization_members FOR SELECT
    USING (public.is_member_of(organization_id, auth.uid()));

CREATE POLICY "Owners can manage members"
    ON public.organization_members FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = public.organization_members.organization_id 
            AND profile_id = auth.uid() 
            AND role = 'owner'
        )
    );

CREATE POLICY "Allow members self-inserts (owner bootstrapping on creation)"
    ON public.organization_members FOR INSERT
    WITH CHECK (auth.uid() = profile_id);


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


-- 6. Audit Logs Policies
CREATE POLICY "Members can view audit logs"
    ON public.audit_logs FOR SELECT
    USING (public.is_member_of(organization_id, auth.uid()));

CREATE POLICY "System can insert audit logs"
    ON public.audit_logs FOR INSERT
    WITH CHECK (true);


-- 7. Notifications Policies
CREATE POLICY "Users can manage/view their own notifications"
    ON public.notifications FOR ALL
    USING (auth.uid() = profile_id);


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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger definition
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
