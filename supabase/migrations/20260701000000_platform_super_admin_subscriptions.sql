BEGIN;

-- Platform Phase 1: Super Admin & Manual Subscriptions Migration
-- Path: supabase/migrations/20260701000000_platform_super_admin_subscriptions.sql

-- 1. Create public.platform_admins table
CREATE TABLE IF NOT EXISTS public.platform_admins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'super_admin' CHECK (role IN ('super_admin', 'support_admin', 'billing_admin')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id),
    CONSTRAINT platform_admins_profile_id_key UNIQUE (profile_id)
);

-- 2. Create public.subscription_plans table
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name_ar text NOT NULL,
    name_en text,
    price_monthly numeric(12,2) NOT NULL DEFAULT 0,
    price_yearly numeric(12,2) NOT NULL DEFAULT 0,
    max_users integer,
    max_invoices integer,
    features jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Populate default subscription plans
INSERT INTO public.subscription_plans (code, name_ar, name_en, price_monthly, price_yearly, max_users, max_invoices, features, sort_order)
VALUES 
    ('free_trial', 'فترة تجريبية مجانية', 'Free Trial', 0.00, 0.00, 3, 50, '{"zatca": true, "inventory": true, "reports": true}'::jsonb, 0),
    ('basic', 'الباقة الأساسية', 'Basic Plan', 150.00, 1500.00, 5, 200, '{"zatca": true, "inventory": true, "reports": true}'::jsonb, 1),
    ('pro', 'الباقة الاحترافية', 'Pro Plan', 350.00, 3500.00, 15, 1000, '{"zatca": true, "inventory": true, "reports": true, "branding": true}'::jsonb, 2),
    ('enterprise', 'باقة الشركات الكبرى', 'Enterprise Plan', 750.00, 7500.00, 999, 99999, '{"zatca": true, "inventory": true, "reports": true, "branding": true, "dedicated_support": true}'::jsonb, 3)
ON CONFLICT (code) DO NOTHING;

-- 3. Create public.organization_subscriptions table
CREATE TABLE IF NOT EXISTS public.organization_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_id uuid REFERENCES public.subscription_plans(id),
    status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
    billing_cycle text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly', 'manual')),
    starts_at timestamptz,
    ends_at timestamptz,
    trial_ends_at timestamptz,
    manual_activation_reason text,
    internal_notes text,
    activated_by uuid REFERENCES auth.users(id),
    activated_at timestamptz,
    suspended_by uuid REFERENCES auth.users(id),
    suspended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT organization_subscriptions_organization_id_key UNIQUE (organization_id)
);

-- 4. Create public.subscription_events table
CREATE TABLE IF NOT EXISTS public.subscription_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    subscription_id uuid REFERENCES public.organization_subscriptions(id) ON DELETE SET NULL,
    event_type text NOT NULL CHECK (event_type IN ('created', 'plan_changed', 'activated', 'suspended', 'cancelled', 'trial_extended', 'note_added')),
    old_status text,
    new_status text,
    old_plan_id uuid,
    new_plan_id uuid,
    note text,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Helper Functions for Platform Admin Detection
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.platform_admins
    WHERE profile_id = auth.uid() AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_platform_admin_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.platform_admins
  WHERE profile_id = auth.uid() AND is_active = true;
  
  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.get_platform_admin_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_admin_role() TO authenticated;


-- 6. Trigger for automatic updated_at column updates
DROP TRIGGER IF EXISTS trg_set_updated_at_subscription_plans ON public.subscription_plans;
CREATE TRIGGER trg_set_updated_at_subscription_plans
    BEFORE UPDATE ON public.subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_organization_subscriptions ON public.organization_subscriptions;
CREATE TRIGGER trg_set_updated_at_organization_subscriptions
    BEFORE UPDATE ON public.organization_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_column();


-- 7. Trigger to automatically provision a free trial subscription for new organizations
CREATE OR REPLACE FUNCTION public.handle_new_organization_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trial_plan_id uuid;
    v_subscription_id uuid;
BEGIN
    -- Get free_trial plan ID
    SELECT id INTO v_trial_plan_id
    FROM public.subscription_plans
    WHERE code = 'free_trial'
    LIMIT 1;

    -- Fallback
    IF v_trial_plan_id IS NULL THEN
        SELECT id INTO v_trial_plan_id FROM public.subscription_plans LIMIT 1;
    END IF;

    -- Create subscription
    INSERT INTO public.organization_subscriptions (
        organization_id,
        plan_id,
        status,
        billing_cycle,
        starts_at,
        ends_at,
        trial_ends_at
    ) VALUES (
        NEW.id,
        v_trial_plan_id,
        'trial',
        'monthly',
        now(),
        now() + interval '14 days',
        now() + interval '14 days'
    )
    RETURNING id INTO v_subscription_id;

    -- Record event
    INSERT INTO public.subscription_events (
        organization_id,
        subscription_id,
        event_type,
        new_status,
        new_plan_id,
        note
    ) VALUES (
        NEW.id,
        v_subscription_id,
        'created',
        'trial',
        v_trial_plan_id,
        'تم بدء الفترة التجريبية تلقائياً عند تسجيل المنشأة.'
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_organization_subscription ON public.organizations;
CREATE TRIGGER trg_new_organization_subscription
    AFTER INSERT ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_organization_subscription();


-- 8. Populate existing organizations with free trial subscription if any are missing
DO $$
DECLARE
    v_trial_plan_id uuid;
    r_org record;
    v_sub_id uuid;
BEGIN
    SELECT id INTO v_trial_plan_id
    FROM public.subscription_plans
    WHERE code = 'free_trial'
    LIMIT 1;

    IF v_trial_plan_id IS NULL THEN
        SELECT id INTO v_trial_plan_id FROM public.subscription_plans LIMIT 1;
    END IF;

    IF v_trial_plan_id IS NOT NULL THEN
        FOR r_org IN 
            SELECT id FROM public.organizations o
            WHERE NOT EXISTS (
                SELECT 1 FROM public.organization_subscriptions s WHERE s.organization_id = o.id
            )
        LOOP
            INSERT INTO public.organization_subscriptions (
                organization_id,
                plan_id,
                status,
                billing_cycle,
                starts_at,
                ends_at,
                trial_ends_at
            ) VALUES (
                r_org.id,
                v_trial_plan_id,
                'trial',
                'monthly',
                now(),
                now() + interval '14 days',
                now() + interval '14 days'
            ) RETURNING id INTO v_sub_id;

            INSERT INTO public.subscription_events (
                organization_id,
                subscription_id,
                event_type,
                new_status,
                new_plan_id,
                note
            ) VALUES (
                r_org.id,
                v_sub_id,
                'created',
                'trial',
                v_trial_plan_id,
                'تم بدء الفترة التجريبية تلقائياً للمنشأة الحالية.'
            );
        END LOOP;
    END IF;
END;
$$;


-- 9. Row Level Security (RLS) policies
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- platform_admins select policy: users can view their own platform admin status safely
CREATE POLICY select_platform_admins ON public.platform_admins
FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- subscription_plans select policy: everyone can see active, admins see all
CREATE POLICY select_subscription_plans ON public.subscription_plans
FOR SELECT TO authenticated USING (is_active = true OR public.is_platform_admin());

-- organization_subscriptions RLS: platform admin manages all
CREATE POLICY admin_manage_subscriptions ON public.organization_subscriptions
FOR ALL TO authenticated USING (public.is_platform_admin());

-- subscription_events RLS: platform admin manages all
CREATE POLICY admin_manage_subscription_events ON public.subscription_events
FOR ALL TO authenticated USING (public.is_platform_admin());

-- Revoke direct tables write access to enforce RPC & Admin policies
REVOKE ALL ON TABLE public.platform_admins FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.subscription_plans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.organization_subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.subscription_events FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.platform_admins TO authenticated;
GRANT SELECT ON TABLE public.subscription_plans TO authenticated;


-- 10. Platform Admin RPC: platform_list_organizations
CREATE OR REPLACE FUNCTION public.platform_list_organizations()
RETURNS TABLE (
    organization_id uuid,
    organization_name text,
    owner_name text,
    owner_email text,
    owner_phone text,
    created_at timestamptz,
    subscription_status text,
    plan_name text,
    trial_ends_at timestamptz,
    ends_at timestamptz,
    users_count integer,
    invoices_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Auth and admin verification
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحيات إدارة المنصة.';
    END IF;

    RETURN QUERY
    SELECT 
        o.id AS organization_id,
        COALESCE(o.name_ar, o.name_en, 'منشأة غير مسماة') AS organization_name,
        COALESCE(p.full_name, 'غير محدد') AS owner_name,
        COALESCE(u.email, 'غير محدد')::text AS owner_email,
        COALESCE(p.phone, 'غير محدد') AS owner_phone,
        o.created_at AS created_at,
        COALESCE(s.status, 'trial') AS subscription_status,
        COALESCE(pl.name_ar, 'فترة تجريبية مجانية') AS plan_name,
        s.trial_ends_at AS trial_ends_at,
        s.ends_at AS ends_at,
        (SELECT COUNT(*)::integer FROM public.organization_members om WHERE om.organization_id = o.id) AS users_count,
        (SELECT COUNT(*)::integer FROM public.sales_invoices si WHERE si.organization_id = o.id) AS invoices_count
    FROM public.organizations o
    LEFT JOIN public.organization_members om_owner ON om_owner.organization_id = o.id AND om_owner.role = 'owner'
    LEFT JOIN public.profiles p ON p.id = om_owner.profile_id
    LEFT JOIN auth.users u ON u.id = p.id
    LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
    LEFT JOIN public.subscription_plans pl ON pl.id = s.plan_id
    ORDER BY o.created_at DESC;
END;
$$;

-- 11. Platform Admin RPC: platform_get_organization_details
CREATE OR REPLACE FUNCTION public.platform_get_organization_details(p_org_id uuid)
RETURNS TABLE (
    organization_id uuid,
    organization_name_ar text,
    organization_name_en text,
    cr_number text,
    vat_number text,
    city text,
    phone text,
    email text,
    created_at timestamptz,
    owner_name text,
    owner_email text,
    owner_phone text,
    subscription_id uuid,
    plan_id uuid,
    plan_code text,
    plan_name_ar text,
    subscription_status text,
    billing_cycle text,
    starts_at timestamptz,
    ends_at timestamptz,
    trial_ends_at timestamptz,
    manual_activation_reason text,
    internal_notes text,
    activated_at timestamptz,
    suspended_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Auth and admin verification
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحيات إدارة المنصة.';
    END IF;

    RETURN QUERY
    SELECT 
        o.id AS organization_id,
        o.name_ar AS organization_name_ar,
        o.name_en AS organization_name_en,
        o.cr_number AS cr_number,
        o.vat_number AS vat_number,
        o.city AS city,
        o.phone AS phone,
        o.email AS email,
        o.created_at AS created_at,
        COALESCE(p.full_name, 'غير محدد') AS owner_name,
        COALESCE(u.email, 'غير محدد')::text AS owner_email,
        COALESCE(p.phone, 'غير محدد') AS owner_phone,
        s.id AS subscription_id,
        s.plan_id AS plan_id,
        pl.code AS plan_code,
        pl.name_ar AS plan_name_ar,
        COALESCE(s.status, 'trial') AS subscription_status,
        COALESCE(s.billing_cycle, 'monthly') AS billing_cycle,
        s.starts_at AS starts_at,
        s.ends_at AS ends_at,
        s.trial_ends_at AS trial_ends_at,
        s.manual_activation_reason AS manual_activation_reason,
        s.internal_notes AS internal_notes,
        s.activated_at AS activated_at,
        s.suspended_at AS suspended_at
    FROM public.organizations o
    LEFT JOIN public.organization_members om_owner ON om_owner.organization_id = o.id AND om_owner.role = 'owner'
    LEFT JOIN public.profiles p ON p.id = om_owner.profile_id
    LEFT JOIN auth.users u ON u.id = p.id
    LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
    LEFT JOIN public.subscription_plans pl ON pl.id = s.plan_id
    WHERE o.id = p_org_id
    LIMIT 1;
END;
$$;

-- 12. Platform Admin RPC: platform_update_subscription
CREATE OR REPLACE FUNCTION public.platform_update_subscription(
  p_org_id uuid,
  p_plan_id uuid,
  p_status text,
  p_billing_cycle text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_trial_ends_at timestamptz,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub_id uuid;
  v_old_status text;
  v_old_plan_id uuid;
BEGIN
  -- Verify platform admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحيات إدارة المنصة.';
  END IF;

  -- Verify status value
  IF p_status NOT IN ('trial', 'active', 'past_due', 'suspended', 'cancelled') THEN
    RAISE EXCEPTION 'قيمة حالة الاشتراك غير صالحة.';
  END IF;

  -- Verify billing cycle value
  IF p_billing_cycle NOT IN ('monthly', 'yearly', 'manual') THEN
    RAISE EXCEPTION 'قيمة دورة الفوترة غير صالحة.';
  END IF;

  -- Get current subscription details
  SELECT id, status, plan_id INTO v_sub_id, v_old_status, v_old_plan_id
  FROM public.organization_subscriptions
  WHERE organization_id = p_org_id;

  IF v_sub_id IS NULL THEN
    -- Create new subscription
    INSERT INTO public.organization_subscriptions (
      organization_id,
      plan_id,
      status,
      billing_cycle,
      starts_at,
      ends_at,
      trial_ends_at,
      manual_activation_reason,
      internal_notes,
      activated_by,
      activated_at
    ) VALUES (
      p_org_id,
      p_plan_id,
      p_status,
      p_billing_cycle,
      p_starts_at,
      p_ends_at,
      p_trial_ends_at,
      p_note,
      p_note,
      auth.uid(),
      CASE WHEN p_status = 'active' THEN now() ELSE NULL END
    ) RETURNING id INTO v_sub_id;

    -- Log event
    INSERT INTO public.subscription_events (
      organization_id,
      subscription_id,
      event_type,
      new_status,
      new_plan_id,
      note,
      created_by
    ) VALUES (
      p_org_id,
      v_sub_id,
      'created',
      p_status,
      p_plan_id,
      p_note,
      auth.uid()
    );
  ELSE
    -- Update existing subscription
    UPDATE public.organization_subscriptions
    SET
      plan_id = p_plan_id,
      status = p_status,
      billing_cycle = p_billing_cycle,
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      trial_ends_at = p_trial_ends_at,
      manual_activation_reason = CASE WHEN p_status = 'active' AND v_old_status != 'active' THEN p_note ELSE manual_activation_reason END,
      internal_notes = p_note,
      activated_by = CASE WHEN p_status = 'active' AND v_old_status != 'active' THEN auth.uid() ELSE activated_by END,
      activated_at = CASE WHEN p_status = 'active' AND v_old_status != 'active' THEN now() ELSE activated_at END,
      suspended_by = CASE WHEN p_status = 'suspended' AND v_old_status != 'suspended' THEN auth.uid() ELSE suspended_by END,
      suspended_at = CASE WHEN p_status = 'suspended' AND v_old_status != 'suspended' THEN now() ELSE suspended_at END
    WHERE id = v_sub_id;

    -- Log event
    INSERT INTO public.subscription_events (
      organization_id,
      subscription_id,
      event_type,
      old_status,
      new_status,
      old_plan_id,
      new_plan_id,
      note,
      created_by
    ) VALUES (
      p_org_id,
      v_sub_id,
      CASE 
        WHEN v_old_plan_id != p_plan_id THEN 'plan_changed'::text
        WHEN p_status = 'active' AND v_old_status != 'active' THEN 'activated'::text
        WHEN p_status = 'suspended' AND v_old_status != 'suspended' THEN 'suspended'::text
        WHEN p_status = 'cancelled' AND v_old_status != 'cancelled' THEN 'cancelled'::text
        ELSE 'trial_extended'::text
      END,
      v_old_status,
      p_status,
      v_old_plan_id,
      p_plan_id,
      p_note,
      auth.uid()
    );
  END IF;
END;
$$;

-- 13. Platform Admin RPC: platform_add_subscription_note
CREATE OR REPLACE FUNCTION public.platform_add_subscription_note(
  p_org_id uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub_id uuid;
BEGIN
  -- Verify platform admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحيات إدارة المنصة.';
  END IF;

  SELECT id INTO v_sub_id
  FROM public.organization_subscriptions
  WHERE organization_id = p_org_id;

  INSERT INTO public.subscription_events (
    organization_id,
    subscription_id,
    event_type,
    note,
    created_by
  ) VALUES (
    p_org_id,
    v_sub_id,
    'note_added',
    p_note,
    auth.uid()
  );
END;
$$;

-- 13.5. Member safe RPC to get organization subscription without internal notes
CREATE OR REPLACE FUNCTION public.get_my_organization_subscription(p_org_id uuid)
RETURNS TABLE (
    subscription_id uuid,
    organization_id uuid,
    plan_id uuid,
    status text,
    billing_cycle text,
    starts_at timestamptz,
    ends_at timestamptz,
    trial_ends_at timestamptz,
    created_at timestamptz,
    plan_code text,
    plan_name_ar text,
    plan_name_en text,
    plan_features jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Verify user is a member of the requested organization or a platform admin
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.profile_id = auth.uid()
          AND om.organization_id = p_org_id
    ) AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك صلاحية الوصول لبيانات اشتراك هذه المنشأة.';
    END IF;

    RETURN QUERY
    SELECT 
        s.id AS subscription_id,
        s.organization_id AS organization_id,
        s.plan_id AS plan_id,
        COALESCE(s.status, 'trial') AS status,
        COALESCE(s.billing_cycle, 'monthly') AS billing_cycle,
        s.starts_at AS starts_at,
        s.ends_at AS ends_at,
        s.trial_ends_at AS trial_ends_at,
        s.created_at AS created_at,
        pl.code AS plan_code,
        pl.name_ar AS plan_name_ar,
        pl.name_en AS plan_name_en,
        COALESCE(pl.features, '{}'::jsonb) AS plan_features
    FROM public.organization_subscriptions s
    LEFT JOIN public.subscription_plans pl ON pl.id = s.plan_id
    WHERE s.organization_id = p_org_id
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_organization_subscription(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_organization_subscription(uuid) TO authenticated;

-- 13.6. Super Admin safe RPC to list subscription events
CREATE OR REPLACE FUNCTION public.platform_list_subscription_events(p_org_id uuid)
RETURNS TABLE (
    id uuid,
    organization_id uuid,
    subscription_id uuid,
    event_type text,
    old_status text,
    new_status text,
    old_plan_id uuid,
    new_plan_id uuid,
    note text,
    created_by uuid,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Verify platform admin
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحيات إدارة المنصة.';
    END IF;

    RETURN QUERY
    SELECT 
        se.id,
        se.organization_id,
        se.subscription_id,
        se.event_type::text,
        se.old_status,
        se.new_status,
        se.old_plan_id,
        se.new_plan_id,
        se.note,
        se.created_by,
        se.created_at
    FROM public.subscription_events se
    WHERE se.organization_id = p_org_id
    ORDER BY se.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_subscription_events(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_subscription_events(uuid) TO authenticated;

-- 14. Revoke/Grant executing administrative functions
REVOKE ALL ON FUNCTION public.platform_list_organizations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_organizations() TO authenticated;

REVOKE ALL ON FUNCTION public.platform_get_organization_details(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_organization_details(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.platform_update_subscription(uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_update_subscription(uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text) TO authenticated;

REVOKE ALL ON FUNCTION public.platform_add_subscription_note(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_add_subscription_note(uuid, text) TO authenticated;

COMMIT;
