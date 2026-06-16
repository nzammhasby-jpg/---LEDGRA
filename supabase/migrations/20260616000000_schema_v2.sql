-- 1. Alter organizations Schema with missing fields and correct types
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS cr_number TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS system_start_date DATE;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS accounting_mode TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS starting_balances_later BOOLEAN DEFAULT FALSE;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 1 NOT NULL;

-- Alter fiscal_year_start to DATE type safely
ALTER TABLE public.organizations DROP COLUMN IF EXISTS fiscal_year_start;
ALTER TABLE public.organizations ADD COLUMN fiscal_year_start DATE;

-- Enforce currency code to 'SAR' default instead of 'ر.س' inside the DB
ALTER TABLE public.organizations ALTER COLUMN currency SET DEFAULT 'SAR';

-- 2. Add appropriate constraints for CR and VAT
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS chk_cr_number;
ALTER TABLE public.organizations ADD CONSTRAINT chk_cr_number CHECK (cr_number IS NULL OR (cr_number ~ '^\d{10}$'));

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS chk_vat_number;
ALTER TABLE public.organizations ADD CONSTRAINT chk_vat_number CHECK (vat_number IS NULL OR (vat_number ~ '^3\d{13}3$'));

-- 3. Branch constraints
ALTER TABLE public.branches DROP CONSTRAINT IF EXISTS unique_branch_code_per_org;
ALTER TABLE public.branches ADD CONSTRAINT unique_branch_code_per_org UNIQUE (organization_id, code);

-- Verify only one main branch exists per organization using partial unique index
DROP INDEX IF EXISTS unique_main_branch;
CREATE UNIQUE INDEX unique_main_branch ON public.branches (organization_id) WHERE (is_main = true);


----------------------------------------------------
-- 4. SECURE TRANSACTIONAL RPC: create_organization_with_owner
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
        'SAR', -- Standard SAR code inside DB instead of 'ر.س'
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

    -- 7. Done
    RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


----------------------------------------------------
-- 5. SECURITY & ROLE LEVEL POLICIES HARDENING (RLS)
----------------------------------------------------

-- Ensure all target tables have RLS enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: secure select, only self or co-members
DROP POLICY IF EXISTS "Users can view any profile" ON public.profiles;
DROP POLICY IF EXISTS "Secure profile read policy" ON public.profiles;

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

-- Organizations: members select, owners/admins update, NO direct insert from client
DROP POLICY IF EXISTS "Users can view organizations they are member of" ON public.organizations;
CREATE POLICY "Secure organizations select policy"
    ON public.organizations FOR SELECT
    USING (public.is_member_of(id, auth.uid()));

DROP POLICY IF EXISTS "Owners or Admins can update their organization" ON public.organizations;
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

DROP POLICY IF EXISTS "Any authenticated user can create an organization" ON public.organizations;


-- Members: select members of same org, manage-member rules trigger enforced
DROP POLICY IF EXISTS "Members can view other members in their organization" ON public.organization_members;
CREATE POLICY "Secure organization_members select policy"
    ON public.organization_members FOR SELECT
    USING (public.is_member_of(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Owners can manage members" ON public.organization_members;
DROP POLICY IF EXISTS "Allow members self-inserts (owner bootstrapping on creation)" ON public.organization_members;

-- Allow only owners and admins to insert/update/delete members inside organization
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


-- Trigger: enforce updates on members (no self-upgrades, no demoting last Owner)
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

DROP TRIGGER IF EXISTS trg_member_update_rules ON public.organization_members;
CREATE TRIGGER trg_member_update_rules
    BEFORE UPDATE ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.handle_member_update_rules();


-- Trigger: enforce deletes on members (no deleting last owner)
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

DROP TRIGGER IF EXISTS trg_member_delete_rules ON public.organization_members;
CREATE TRIGGER trg_member_delete_rules
    BEFORE DELETE ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.handle_member_delete_rules();


-- Roles and permissions: select only
DROP POLICY IF EXISTS "Allow read public roles" ON public.roles;
CREATE POLICY "Allow read public roles" ON public.roles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow read public permissions" ON public.permissions;
CREATE POLICY "Allow read public permissions" ON public.permissions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow read public role_permissions" ON public.role_permissions;
CREATE POLICY "Allow read public role_permissions" ON public.role_permissions FOR SELECT USING (true);


-- Audit logs: can select if member, NO direct write from client API
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Members can view audit logs" ON public.audit_logs;

CREATE POLICY "Members can view audit logs"
    ON public.audit_logs FOR SELECT
    USING (public.is_member_of(organization_id, auth.uid()));


-- Notifications: select/manage own, ensuring organisation membership match
DROP POLICY IF EXISTS "Users can manage/view their own notifications" ON public.notifications;
CREATE POLICY "Secure notifications select and manage policy"
    ON public.notifications FOR ALL
    USING (
        auth.uid() = profile_id 
        AND public.is_member_of(organization_id, auth.uid())
    );
