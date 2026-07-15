BEGIN;

-- 1. Upgrade subscription_plans table with new columns and constraints
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS description_ar text;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS description_en text;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS plan_type text DEFAULT 'paid';
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS billing_interval text DEFAULT 'monthly';
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS duration_days integer;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS price numeric(12,2) DEFAULT 0.00;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'SAR';
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS trial_days integer DEFAULT 14;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS max_branches integer;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS max_invoices_per_month integer;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true NOT NULL;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS is_default_trial boolean DEFAULT false NOT NULL;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

-- Drop old check constraints if they exist on subscription_plans
ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_plan_type_check;
ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_billing_interval_check;
ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_price_non_negative;
ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_trial_days_check;

-- Add check constraints to subscription_plans
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_plan_type_check CHECK (plan_type IN ('paid', 'free', 'trial'));
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_billing_interval_check CHECK (billing_interval IN ('monthly', 'yearly', 'custom', 'none'));
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_price_non_negative CHECK (price >= 0);
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_trial_days_check CHECK (plan_type != 'trial' OR trial_days > 0);

-- Partial index to prevent multiple active plans with is_default_trial = true
DROP INDEX IF EXISTS public.idx_subscription_plans_default_trial;
CREATE UNIQUE INDEX idx_subscription_plans_default_trial ON public.subscription_plans (is_default_trial) 
WHERE (is_default_trial = true AND archived_at IS NULL AND is_active = true);


-- 2. Upgrade organization_subscriptions table with new columns and constraints
ALTER TABLE public.organization_subscriptions ADD COLUMN IF NOT EXISTS trial_starts_at timestamp with time zone;
ALTER TABLE public.organization_subscriptions ADD COLUMN IF NOT EXISTS grace_ends_at timestamp with time zone;
ALTER TABLE public.organization_subscriptions ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;
ALTER TABLE public.organization_subscriptions ADD COLUMN IF NOT EXISTS auto_renew boolean DEFAULT false NOT NULL;
ALTER TABLE public.organization_subscriptions ADD COLUMN IF NOT EXISTS activation_method text DEFAULT 'manual';
ALTER TABLE public.organization_subscriptions ADD COLUMN IF NOT EXISTS price_snapshot numeric(12,2);
ALTER TABLE public.organization_subscriptions ADD COLUMN IF NOT EXISTS currency_snapshot text DEFAULT 'SAR';
ALTER TABLE public.organization_subscriptions ADD COLUMN IF NOT EXISTS plan_name_snapshot text;
ALTER TABLE public.organization_subscriptions ADD COLUMN IF NOT EXISTS duration_days_snapshot integer;
ALTER TABLE public.organization_subscriptions ADD COLUMN IF NOT EXISTS notes text;

-- Change CHECK constraint on organization_subscriptions.status
ALTER TABLE public.organization_subscriptions DROP CONSTRAINT IF EXISTS organization_subscriptions_status_check;
ALTER TABLE public.organization_subscriptions ADD CONSTRAINT organization_subscriptions_status_check 
  CHECK (status IN ('trialing', 'active', 'grace_period', 'expired', 'suspended', 'cancelled', 'legacy_pending'));

-- Migrate old trial status to trialing
UPDATE public.organization_subscriptions SET status = 'trialing' WHERE status = 'trial';
UPDATE public.organization_subscriptions SET status = 'grace_period' WHERE status = 'past_due';


-- 3. Safety function to prevent deletion of plans linked to previous subscriptions
CREATE OR REPLACE FUNCTION public.trg_prevent_delete_referenced_plans()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.organization_subscriptions WHERE plan_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'لا يمكن حذف هذه الباقة لارتباطها باشتراكات حالية أو سابقة. يرجى أرشفتها بدلاً من الحذف.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_plans ON public.subscription_plans;
CREATE TRIGGER trg_prevent_delete_plans
  BEFORE DELETE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_delete_referenced_plans();


-- 4. Central subscription status validation & write guard
CREATE OR REPLACE FUNCTION public.assert_organization_subscription_write_access(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_ends_at timestamp with time zone;
  v_grace_ends_at timestamp with time zone;
  v_effective_status text;
BEGIN
  -- If platform admin, bypass write limits for administration tasks
  IF public.is_platform_admin() THEN
    RETURN true;
  END IF;

  -- Get subscription info
  SELECT 
    status,
    ends_at,
    grace_ends_at
  INTO
    v_status,
    v_ends_at,
    v_grace_ends_at
  FROM public.organization_subscriptions
  WHERE organization_id = p_org_id;

  -- If no subscription exists, default to legacy_pending (allowed to write temporarily)
  IF v_status IS NULL THEN
    RETURN true;
  END IF;

  -- Calculate effective status
  IF v_status = 'suspended' THEN
    v_effective_status := 'suspended';
  ELSIF v_status = 'cancelled' THEN
    v_effective_status := 'cancelled';
  ELSIF v_status = 'legacy_pending' THEN
    v_effective_status := 'legacy_pending';
  ELSIF now() <= v_ends_at THEN
    v_effective_status := 'active'; -- trialing/active are both allowed
  ELSIF now() > v_ends_at AND (v_grace_ends_at IS NULL OR now() <= v_grace_ends_at) THEN
    v_effective_status := 'grace_period';
  ELSE
    v_effective_status := 'expired';
  END IF;

  -- Block writes if status is expired, suspended, or cancelled
  IF v_effective_status IN ('expired', 'suspended', 'cancelled') THEN
    IF v_effective_status = 'suspended' THEN
      RAISE EXCEPTION 'عملية مرفوضة: تم إيقاف اشتراك منشأتك مؤقتاً من قبل الإدارة. يرجى مراجعة إدارة المنصة.';
    ELSIF v_effective_status = 'cancelled' THEN
      RAISE EXCEPTION 'عملية مرفوضة: اشتراك المنشأة ملغى. يرجى التواصل مع الدعم لتفعيل الاشتراك.';
    ELSE
      RAISE EXCEPTION 'عملية مرفوضة: انتهت صلاحية اشتراك منشأتك. يمكنك تصفح وعرض وتصدير البيانات، ولكن يرجى تجديد الاشتراك لتتمكن من إضافة حركات جديدة.';
    END IF;
  END IF;

  RETURN true;
END;
$$;


-- 5. Trigger function to enforce the write access guard on transactional tables
CREATE OR REPLACE FUNCTION public.trg_assert_subscription_write_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_org_id := OLD.organization_id;
  ELSE
    v_org_id := NEW.organization_id;
  END IF;

  IF v_org_id IS NOT NULL THEN
    PERFORM public.assert_organization_subscription_write_access(v_org_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Attach write guard triggers to transactional tables
DROP TRIGGER IF EXISTS trg_sub_write_sales_invoices ON public.sales_invoices;
CREATE TRIGGER trg_sub_write_sales_invoices
  BEFORE INSERT OR UPDATE OR DELETE ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_assert_subscription_write_access();

DROP TRIGGER IF EXISTS trg_sub_write_purchase_bills ON public.purchase_bills;
CREATE TRIGGER trg_sub_write_purchase_bills
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_bills
  FOR EACH ROW EXECUTE FUNCTION public.trg_assert_subscription_write_access();

DROP TRIGGER IF EXISTS trg_sub_write_journal_entries ON public.journal_entries;
CREATE TRIGGER trg_sub_write_journal_entries
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_assert_subscription_write_access();

DROP TRIGGER IF EXISTS trg_sub_write_payments ON public.payments;
CREATE TRIGGER trg_sub_write_payments
  BEFORE INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_assert_subscription_write_access();

DROP TRIGGER IF EXISTS trg_sub_write_receipts ON public.receipts;
CREATE TRIGGER trg_sub_write_receipts
  BEFORE INSERT OR UPDATE OR DELETE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.trg_assert_subscription_write_access();

DROP TRIGGER IF EXISTS trg_sub_write_sales_credit_notes ON public.sales_credit_notes;
CREATE TRIGGER trg_sub_write_sales_credit_notes
  BEFORE INSERT OR UPDATE OR DELETE ON public.sales_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.trg_assert_subscription_write_access();

DROP TRIGGER IF EXISTS trg_sub_write_purchase_debit_notes ON public.purchase_debit_notes;
CREATE TRIGGER trg_sub_write_purchase_debit_notes
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_debit_notes
  FOR EACH ROW EXECUTE FUNCTION public.trg_assert_subscription_write_access();

DROP TRIGGER IF EXISTS trg_sub_write_cash_bank_transfers ON public.cash_bank_transfers;
CREATE TRIGGER trg_sub_write_cash_bank_transfers
  BEFORE INSERT OR UPDATE OR DELETE ON public.cash_bank_transfers
  FOR EACH ROW EXECUTE FUNCTION public.trg_assert_subscription_write_access();

DROP TRIGGER IF EXISTS trg_sub_write_bank_reconciliations ON public.bank_reconciliations;
CREATE TRIGGER trg_sub_write_bank_reconciliations
  BEFORE INSERT OR UPDATE OR DELETE ON public.bank_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.trg_assert_subscription_write_access();

DROP TRIGGER IF EXISTS trg_sub_write_inventory_adjustments ON public.inventory_adjustments;
CREATE TRIGGER trg_sub_write_inventory_adjustments
  BEFORE INSERT OR UPDATE OR DELETE ON public.inventory_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.trg_assert_subscription_write_access();

DROP TRIGGER IF EXISTS trg_sub_write_opening_balance_batches ON public.opening_balance_batches;
CREATE TRIGGER trg_sub_write_opening_balance_batches
  BEFORE INSERT OR UPDATE OR DELETE ON public.opening_balance_batches
  FOR EACH ROW EXECUTE FUNCTION public.trg_assert_subscription_write_access();


-- 6. Max Users Limit Enforcement
CREATE OR REPLACE FUNCTION public.assert_organization_user_limit(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_users integer;
  v_current_users integer;
  v_plan_name text;
BEGIN
  -- Get the current plan's max users limit
  SELECT 
    COALESCE(sub.max_users, plan.max_users) AS max_users,
    COALESCE(sub.plan_name_snapshot, plan.name_ar) AS plan_name
  INTO 
    v_max_users,
    v_plan_name
  FROM public.organization_subscriptions sub
  LEFT JOIN public.subscription_plans plan ON sub.plan_id = plan.id
  WHERE sub.organization_id = p_org_id;

  -- If no subscription or no limit exists, allow
  IF v_max_users IS NULL THEN
    RETURN true;
  END IF;

  -- Count current active users in organization_members
  SELECT COUNT(*)::integer INTO v_current_users
  FROM public.organization_members
  WHERE organization_id = p_org_id AND is_active = true;

  -- If limit reached, raise exception
  IF v_current_users >= v_max_users THEN
    RAISE EXCEPTION 'لقد وصلت منشأتك إلى الحد الأقصى للمستخدمين المسموح به في باقتك الحالية (% مستخدم في %). يرجى ترقية اشتراك المنشأة أو تعطيل بعض المستخدمين الحاليين لتتمكن من إضافة مستخدم جديد.', v_max_users, v_plan_name;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_assert_organization_user_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(NEW.is_active, true) = true THEN
    PERFORM public.assert_organization_user_limit(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_members_limit ON public.organization_members;
CREATE TRIGGER trg_members_limit
  BEFORE INSERT ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_assert_organization_user_limit();


-- 7. Max Branches Limit Enforcement
CREATE OR REPLACE FUNCTION public.assert_organization_branch_limit(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_branches integer;
  v_current_branches integer;
  v_plan_name text;
BEGIN
  SELECT 
    COALESCE(sub.max_branches, plan.max_branches) AS max_branches,
    COALESCE(sub.plan_name_snapshot, plan.name_ar) AS plan_name
  INTO 
    v_max_branches,
    v_plan_name
  FROM public.organization_subscriptions sub
  LEFT JOIN public.subscription_plans plan ON sub.plan_id = plan.id
  WHERE sub.organization_id = p_org_id;

  IF v_max_branches IS NULL THEN
    RETURN true;
  END IF;

  SELECT COUNT(*)::integer INTO v_current_branches
  FROM public.branches
  WHERE organization_id = p_org_id;

  IF v_current_branches >= v_max_branches THEN
    RAISE EXCEPTION 'لقد وصلت منشأتك إلى الحد الأقصى للفروع المسموح به في باقتك الحالية (% فروع في %). يرجى ترقية اشتراك المنشأة لتتمكن من إضافة فرع جديد.', v_max_branches, v_plan_name;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_assert_organization_branch_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_organization_branch_limit(NEW.organization_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_branches_limit ON public.branches;
CREATE TRIGGER trg_branches_limit
  BEFORE INSERT ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.trg_assert_organization_branch_limit();


-- 8. Max Invoices Limit Enforcement
CREATE OR REPLACE FUNCTION public.assert_organization_invoice_limit(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_invoices integer;
  v_current_invoices integer;
  v_plan_name text;
  v_month_start timestamp with time zone;
  v_month_end timestamp with time zone;
BEGIN
  SELECT 
    COALESCE(sub.max_invoices_per_month, plan.max_invoices_per_month) AS max_invoices_per_month,
    COALESCE(sub.plan_name_snapshot, plan.name_ar) AS plan_name
  INTO 
    v_max_invoices,
    v_plan_name
  FROM public.organization_subscriptions sub
  LEFT JOIN public.subscription_plans plan ON sub.plan_id = plan.id
  WHERE sub.organization_id = p_org_id;

  IF v_max_invoices IS NULL THEN
    RETURN true;
  END IF;

  v_month_start := date_trunc('month', now());
  v_month_end := (date_trunc('month', now()) + interval '1 month') - interval '1 microsecond';

  -- Count sales invoices in current month that are approved, paid, or sent (not draft)
  SELECT COUNT(*)::integer INTO v_current_invoices
  FROM public.sales_invoices
  WHERE organization_id = p_org_id
    AND created_at >= v_month_start
    AND created_at <= v_month_end
    AND status IN ('approved', 'posted', 'paid', 'partially_paid', 'sent');

  IF v_current_invoices >= v_max_invoices THEN
    RAISE EXCEPTION 'لقد وصلت منشأتك إلى الحد الأقصى للفواتير المسموح به شهرياً في باقتك الحالية (% فواتير في %). يرجى ترقية اشتراك المنشأة لتتمكن من إصدار واعتماد فواتير جديدة.', v_max_invoices, v_plan_name;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_assert_organization_invoice_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Check limit when an invoice transitions out of draft, or is inserted as active
  IF (TG_OP = 'INSERT' AND NEW.status != 'draft') OR 
     (TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status != 'draft') THEN
    PERFORM public.assert_organization_invoice_limit(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_limit ON public.sales_invoices;
CREATE TRIGGER trg_invoices_limit
  BEFORE INSERT OR UPDATE ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_assert_organization_invoice_limit();


-- 9. Automatic Trial Onboarding Trigger Logic
CREATE OR REPLACE FUNCTION public.handle_new_organization_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trial_plan record;
    v_subscription_id uuid;
BEGIN
    -- If subscription already exists, exit
    IF EXISTS (
        SELECT 1 FROM public.organization_subscriptions 
        WHERE organization_id = NEW.id
    ) THEN
        RETURN NEW;
    END IF;

    -- Get active default trial plan
    SELECT * INTO v_trial_plan
    FROM public.subscription_plans
    WHERE is_default_trial = true AND is_active = true AND archived_at IS NULL
    LIMIT 1;

    -- Fallback to any active plan if no default trial plan exists
    IF v_trial_plan.id IS NULL THEN
        SELECT * INTO v_trial_plan
        FROM public.subscription_plans
        WHERE is_active = true AND archived_at IS NULL
        ORDER BY sort_order ASC
        LIMIT 1;
    END IF;

    -- Fallback to legacy_pending state if absolutely no plan is found
    IF v_trial_plan.id IS NULL THEN
        INSERT INTO public.organization_subscriptions (
            organization_id,
            plan_id,
            status,
            starts_at,
            ends_at,
            activation_method,
            notes
        ) VALUES (
            NEW.id,
            NULL,
            'legacy_pending',
            now(),
            now() + interval '30 days',
            'automatic_trial',
            'تم إسناد رتبة معلقة لعدم وجود باقة تجريبية افتراضية.'
        );
        RETURN NEW;
    END IF;

    -- Insert active trial subscription
    INSERT INTO public.organization_subscriptions (
        organization_id,
        plan_id,
        status,
        starts_at,
        ends_at,
        trial_starts_at,
        trial_ends_at,
        activation_method,
        price_snapshot,
        currency_snapshot,
        plan_name_snapshot,
        duration_days_snapshot,
        notes
    ) VALUES (
        NEW.id,
        v_trial_plan.id,
        'trialing',
        now(),
        now() + (COALESCE(v_trial_plan.trial_days, 14) * interval '1 day'),
        now(),
        now() + (COALESCE(v_trial_plan.trial_days, 14) * interval '1 day'),
        'automatic_trial',
        v_trial_plan.price,
        v_trial_plan.currency_code,
        v_trial_plan.name_ar,
        v_trial_plan.trial_days,
        'تم بدء الفترة التجريبية تلقائياً عند تسجيل المنشأة.'
    )
    RETURNING id INTO v_subscription_id;

    -- Log creation event
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
        'trialing',
        v_trial_plan.id,
        'تم إدراج اشتراك التجربة الافتراضية بنجاح.'
    );

    RETURN NEW;
END;
$$;

-- Redrop and recreate trigger to use updated trigger function
DROP TRIGGER IF EXISTS trg_new_organization_subscription ON public.organizations;
CREATE TRIGGER trg_new_organization_subscription
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization_subscription();


-- 10. Administrative RPCs and Helper Functions

-- 10.1 platform_create_subscription_plan
CREATE OR REPLACE FUNCTION public.platform_create_subscription_plan(
  p_code text,
  p_name_ar text,
  p_name_en text,
  p_description_ar text,
  p_description_en text,
  p_plan_type text,
  p_billing_interval text,
  p_duration_days integer,
  p_price numeric,
  p_currency_code text,
  p_trial_days integer,
  p_max_users integer,
  p_max_branches integer,
  p_max_invoices_per_month integer,
  p_features jsonb,
  p_is_active boolean,
  p_is_public boolean,
  p_is_default_trial boolean,
  p_sort_order integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_plan_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية الإدارية.';
  END IF;

  IF p_price < 0 THEN
    RAISE EXCEPTION 'السعر لا يمكن أن يكون سالباً.';
  END IF;

  IF p_plan_type = 'trial' AND COALESCE(p_trial_days, 0) <= 0 THEN
    RAISE EXCEPTION 'يجب تحديد عدد أيام تجريبية أكبر من الصفر للباقة التجريبية.';
  END IF;

  v_user_id := auth.uid();

  -- If p_is_default_trial is true, make sure no other active plan has it
  IF p_is_default_trial = true AND p_is_active = true THEN
    UPDATE public.subscription_plans 
    SET is_default_trial = false 
    WHERE is_default_trial = true AND archived_at IS NULL;
  END IF;

  INSERT INTO public.subscription_plans (
    code,
    name_ar,
    name_en,
    description_ar,
    description_en,
    plan_type,
    billing_interval,
    duration_days,
    price,
    currency_code,
    trial_days,
    max_users,
    max_branches,
    max_invoices_per_month,
    features,
    is_active,
    is_public,
    is_default_trial,
    sort_order,
    created_by
  ) VALUES (
    p_code,
    p_name_ar,
    p_name_en,
    p_description_ar,
    p_description_en,
    p_plan_type,
    p_billing_interval,
    p_duration_days,
    p_price,
    COALESCE(p_currency_code, 'SAR'),
    p_trial_days,
    p_max_users,
    p_max_branches,
    p_max_invoices_per_month,
    p_features,
    p_is_active,
    p_is_public,
    p_is_default_trial,
    p_sort_order,
    v_user_id
  )
  RETURNING id INTO v_plan_id;

  -- Platform Admin Audit Log
  INSERT INTO public.platform_admin_audit_logs (
    admin_profile_id,
    action,
    document_type,
    document_id,
    metadata
  ) VALUES (
    v_user_id,
    'create_plan',
    'subscription_plan',
    v_plan_id,
    jsonb_build_object('code', p_code, 'price', p_price)
  );

  RETURN v_plan_id;
END;
$$;


-- 10.2 platform_update_subscription_plan
CREATE OR REPLACE FUNCTION public.platform_update_subscription_plan(
  p_id uuid,
  p_code text,
  p_name_ar text,
  p_name_en text,
  p_description_ar text,
  p_description_en text,
  p_plan_type text,
  p_billing_interval text,
  p_duration_days integer,
  p_price numeric,
  p_currency_code text,
  p_trial_days integer,
  p_max_users integer,
  p_max_branches integer,
  p_max_invoices_per_month integer,
  p_features jsonb,
  p_is_active boolean,
  p_is_public boolean,
  p_is_default_trial boolean,
  p_sort_order integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية الإدارية.';
  END IF;

  IF p_price < 0 THEN
    RAISE EXCEPTION 'السعر لا يمكن أن يكون سالباً.';
  END IF;

  IF p_plan_type = 'trial' AND COALESCE(p_trial_days, 0) <= 0 THEN
    RAISE EXCEPTION 'يجب تحديد عدد أيام تجريبية أكبر من الصفر للباقة التجريبية.';
  END IF;

  v_user_id := auth.uid();

  -- Handle is_default_trial coordination
  IF p_is_default_trial = true AND p_is_active = true THEN
    UPDATE public.subscription_plans 
    SET is_default_trial = false 
    WHERE is_default_trial = true AND id != p_id AND archived_at IS NULL;
  END IF;

  UPDATE public.subscription_plans
  SET
    code = p_code,
    name_ar = p_name_ar,
    name_en = p_name_en,
    description_ar = p_description_ar,
    description_en = p_description_en,
    plan_type = p_plan_type,
    billing_interval = p_billing_interval,
    duration_days = p_duration_days,
    price = p_price,
    currency_code = COALESCE(p_currency_code, 'SAR'),
    trial_days = p_trial_days,
    max_users = p_max_users,
    max_branches = p_max_branches,
    max_invoices_per_month = p_max_invoices_per_month,
    features = p_features,
    is_active = p_is_active,
    is_public = p_is_public,
    is_default_trial = p_is_default_trial,
    sort_order = p_sort_order,
    updated_at = now(),
    updated_by = v_user_id
  WHERE id = p_id;

  INSERT INTO public.platform_admin_audit_logs (
    admin_profile_id,
    action,
    document_type,
    document_id,
    metadata
  ) VALUES (
    v_user_id,
    'update_plan',
    'subscription_plan',
    p_id,
    jsonb_build_object('code', p_code, 'price', p_price)
  );
END;
$$;


-- 10.3 platform_archive_subscription_plan
CREATE OR REPLACE FUNCTION public.platform_archive_subscription_plan(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية الإدارية.';
  END IF;

  v_user_id := auth.uid();

  -- Prevent archiving the default trial plan if it's the only active trial plan
  IF EXISTS (
    SELECT 1 FROM public.subscription_plans 
    WHERE id = p_id AND is_default_trial = true
  ) THEN
    IF (SELECT COUNT(*) FROM public.subscription_plans WHERE is_default_trial = true AND is_active = true AND archived_at IS NULL) <= 1 THEN
      RAISE EXCEPTION 'لا يمكن أرشفة باقة التجربة الافتراضية لأنها الباقة الوحيدة النشطة حالياً.';
    END IF;
  END IF;

  UPDATE public.subscription_plans
  SET 
    archived_at = now(),
    is_active = false,
    updated_at = now(),
    updated_by = v_user_id
  WHERE id = p_id;

  INSERT INTO public.platform_admin_audit_logs (
    admin_profile_id,
    action,
    document_type,
    document_id
  ) VALUES (
    v_user_id,
    'archive_plan',
    'subscription_plan',
    p_id
  );
END;
$$;


-- 10.4 platform_restore_subscription_plan
CREATE OR REPLACE FUNCTION public.platform_restore_subscription_plan(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية الإدارية.';
  END IF;

  v_user_id := auth.uid();

  UPDATE public.subscription_plans
  SET 
    archived_at = NULL,
    is_active = true,
    updated_at = now(),
    updated_by = v_user_id
  WHERE id = p_id;

  INSERT INTO public.platform_admin_audit_logs (
    admin_profile_id,
    action,
    document_type,
    document_id
  ) VALUES (
    v_user_id,
    'restore_plan',
    'subscription_plan',
    p_id
  );
END;
$$;


-- 10.5 platform_list_subscription_plans
CREATE OR REPLACE FUNCTION public.platform_list_subscription_plans()
RETURNS TABLE (
  id uuid,
  code text,
  name_ar text,
  name_en text,
  description_ar text,
  description_en text,
  plan_type text,
  billing_interval text,
  duration_days integer,
  price numeric,
  currency_code text,
  trial_days integer,
  max_users integer,
  max_branches integer,
  max_invoices_per_month integer,
  features jsonb,
  is_active boolean,
  is_public boolean,
  is_default_trial boolean,
  sort_order integer,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  archived_at timestamp with time zone,
  active_subscriptions_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'غير مصرح لك باستعراض الباقات الإدارية.';
  END IF;

  RETURN QUERY
  SELECT 
    sp.id,
    sp.code,
    sp.name_ar,
    sp.name_en,
    sp.description_ar,
    sp.description_en,
    sp.plan_type,
    sp.billing_interval,
    sp.duration_days,
    sp.price::numeric,
    sp.currency_code,
    sp.trial_days,
    sp.max_users,
    sp.max_branches,
    sp.max_invoices_per_month,
    sp.features,
    sp.is_active,
    sp.is_public,
    sp.is_default_trial,
    sp.sort_order,
    sp.created_at,
    sp.updated_at,
    sp.archived_at,
    COALESCE((SELECT COUNT(*)::integer FROM public.organization_subscriptions s WHERE s.plan_id = sp.id AND s.status = 'active'), 0) AS active_subscriptions_count
  FROM public.subscription_plans sp
  ORDER BY sp.archived_at ASC, sp.sort_order ASC, sp.created_at DESC;
END;
$$;


-- 10.6 platform_activate_organization_subscription
CREATE OR REPLACE FUNCTION public.platform_activate_organization_subscription(
  p_org_id uuid,
  p_plan_id uuid,
  p_starts_at timestamp with time zone,
  p_ends_at timestamp with time zone,
  p_grace_days integer,
  p_price_snapshot numeric,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
  v_plan record;
  v_sub_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية الإدارية.';
  END IF;

  v_admin_id := auth.uid();

  -- Get plan details
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id;
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'الباقة المحددة غير موجودة.';
  END IF;

  -- Upsert subscription
  INSERT INTO public.organization_subscriptions (
    organization_id,
    plan_id,
    status,
    starts_at,
    ends_at,
    grace_ends_at,
    activation_method,
    price_snapshot,
    currency_snapshot,
    plan_name_snapshot,
    duration_days_snapshot,
    notes,
    activated_by
  ) VALUES (
    p_org_id,
    p_plan_id,
    'active',
    p_starts_at,
    p_ends_at,
    p_ends_at + (COALESCE(p_grace_days, 3) * interval '1 day'),
    'manual',
    COALESCE(p_price_snapshot, v_plan.price),
    v_plan.currency_code,
    v_plan.name_ar,
    EXTRACT(DAY FROM (p_ends_at - p_starts_at))::integer,
    p_notes,
    v_admin_id
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'active',
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    grace_ends_at = EXCLUDED.grace_ends_at,
    activation_method = 'manual',
    price_snapshot = EXCLUDED.price_snapshot,
    currency_snapshot = EXCLUDED.currency_snapshot,
    plan_name_snapshot = EXCLUDED.plan_name_snapshot,
    duration_days_snapshot = EXCLUDED.duration_days_snapshot,
    notes = EXCLUDED.notes,
    activated_by = EXCLUDED.activated_by,
    updated_at = now()
  RETURNING id INTO v_sub_id;

  -- Record event
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
    'activated',
    'active',
    p_plan_id,
    COALESCE(p_notes, 'تم تفعيل الاشتراك يدوياً بواسطة الإدارة.'),
    v_admin_id
  );

  -- Platform Admin Audit Log
  INSERT INTO public.platform_admin_audit_logs (
    admin_profile_id,
    action,
    target_organization_id,
    document_type,
    document_id,
    metadata
  ) VALUES (
    v_admin_id,
    'activate_subscription',
    p_org_id,
    'organization_subscription',
    v_sub_id,
    jsonb_build_object('plan_id', p_plan_id, 'price', p_price_snapshot)
  );
END;
$$;


-- 10.7 platform_extend_organization_subscription
CREATE OR REPLACE FUNCTION public.platform_extend_organization_subscription(
  p_org_id uuid,
  p_ends_at timestamp with time zone,
  p_grace_days integer,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
  v_sub record;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية الإدارية.';
  END IF;

  v_admin_id := auth.uid();

  SELECT * INTO v_sub FROM public.organization_subscriptions WHERE organization_id = p_org_id;
  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد اشتراك قائم لهذه المنشأة لتمديده.';
  END IF;

  UPDATE public.organization_subscriptions
  SET
    ends_at = p_ends_at,
    grace_ends_at = p_ends_at + (COALESCE(p_grace_days, 3) * interval '1 day'),
    notes = p_notes,
    updated_at = now()
  WHERE organization_id = p_org_id;

  -- Record Event
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
    v_sub.id,
    'trial_extended',
    v_sub.status,
    v_sub.plan_id,
    COALESCE(p_notes, 'تم تمديد تاريخ انتهاء الاشتراك يدوياً.'),
    v_admin_id
  );

  INSERT INTO public.platform_admin_audit_logs (
    admin_profile_id,
    action,
    target_organization_id,
    document_type,
    document_id,
    metadata
  ) VALUES (
    v_admin_id,
    'extend_subscription',
    p_org_id,
    'organization_subscription',
    v_sub.id,
    jsonb_build_object('new_ends_at', p_ends_at)
  );
END;
$$;


-- 10.8 platform_change_organization_plan
CREATE OR REPLACE FUNCTION public.platform_change_organization_plan(
  p_org_id uuid,
  p_plan_id uuid,
  p_ends_at timestamp with time zone,
  p_grace_days integer,
  p_price_snapshot numeric,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
  v_sub record;
  v_plan record;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية الإدارية.';
  END IF;

  v_admin_id := auth.uid();

  SELECT * INTO v_sub FROM public.organization_subscriptions WHERE organization_id = p_org_id;
  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد اشتراك قائم لهذه المنشأة لتغيير الباقة لها.';
  END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id;
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'الباقة المحددة غير موجودة.';
  END IF;

  UPDATE public.organization_subscriptions
  SET
    plan_id = p_plan_id,
    ends_at = p_ends_at,
    grace_ends_at = p_ends_at + (COALESCE(p_grace_days, 3) * interval '1 day'),
    price_snapshot = COALESCE(p_price_snapshot, v_plan.price),
    currency_snapshot = v_plan.currency_code,
    plan_name_snapshot = v_plan.name_ar,
    notes = p_notes,
    updated_at = now()
  WHERE organization_id = p_org_id;

  -- Record event
  INSERT INTO public.subscription_events (
    organization_id,
    subscription_id,
    event_type,
    old_plan_id,
    new_plan_id,
    new_status,
    note,
    created_by
  ) VALUES (
    p_org_id,
    v_sub.id,
    'plan_changed',
    v_sub.plan_id,
    p_plan_id,
    v_sub.status,
    COALESCE(p_notes, 'تم تغيير الباقة يدوياً بواسطة الإدارة.'),
    v_admin_id
  );

  INSERT INTO public.platform_admin_audit_logs (
    admin_profile_id,
    action,
    target_organization_id,
    document_type,
    document_id,
    metadata
  ) VALUES (
    v_admin_id,
    'change_plan',
    p_org_id,
    'organization_subscription',
    v_sub.id,
    jsonb_build_object('old_plan_id', v_sub.plan_id, 'new_plan_id', p_plan_id)
  );
END;
$$;


-- 10.9 platform_suspend_organization_subscription
CREATE OR REPLACE FUNCTION public.platform_suspend_organization_subscription(
  p_org_id uuid,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
  v_sub record;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية الإدارية.';
  END IF;

  v_admin_id := auth.uid();

  SELECT * INTO v_sub FROM public.organization_subscriptions WHERE organization_id = p_org_id;
  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد اشتراك قائم لهذه المنشأة لإيقافه.';
  END IF;

  UPDATE public.organization_subscriptions
  SET
    status = 'suspended',
    suspended_at = now(),
    notes = p_notes,
    updated_at = now()
  WHERE organization_id = p_org_id;

  -- Record event
  INSERT INTO public.subscription_events (
    organization_id,
    subscription_id,
    event_type,
    old_status,
    new_status,
    note,
    created_by
  ) VALUES (
    p_org_id,
    v_sub.id,
    'suspended',
    v_sub.status,
    'suspended',
    COALESCE(p_notes, 'تم إيقاف الاشتراك مؤقتاً.'),
    v_admin_id
  );

  INSERT INTO public.platform_admin_audit_logs (
    admin_profile_id,
    action,
    target_organization_id,
    document_type,
    document_id
  ) VALUES (
    v_admin_id,
    'suspend_subscription',
    p_org_id,
    'organization_subscription',
    v_sub.id
  );
END;
$$;


-- 10.10 platform_resume_organization_subscription
CREATE OR REPLACE FUNCTION public.platform_resume_organization_subscription(
  p_org_id uuid,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
  v_sub record;
  v_new_status text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية الإدارية.';
  END IF;

  v_admin_id := auth.uid();

  SELECT * INTO v_sub FROM public.organization_subscriptions WHERE organization_id = p_org_id;
  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد اشتراك قائم لهذه المنشأة لاستئنافه.';
  END IF;

  -- Determine resumed status based on time
  IF now() <= v_sub.ends_at THEN
    v_new_status := 'active';
  ELSE
    v_new_status := 'expired';
  END IF;

  UPDATE public.organization_subscriptions
  SET
    status = v_new_status,
    suspended_at = NULL,
    notes = p_notes,
    updated_at = now()
  WHERE organization_id = p_org_id;

  -- Record event
  INSERT INTO public.subscription_events (
    organization_id,
    subscription_id,
    event_type,
    old_status,
    new_status,
    note,
    created_by
  ) VALUES (
    p_org_id,
    v_sub.id,
    'activated',
    'suspended',
    v_new_status,
    COALESCE(p_notes, 'تم استئناف الاشتراك بنجاح.'),
    v_admin_id
  );

  INSERT INTO public.platform_admin_audit_logs (
    admin_profile_id,
    action,
    target_organization_id,
    document_type,
    document_id,
    metadata
  ) VALUES (
    v_admin_id,
    'resume_subscription',
    p_org_id,
    'organization_subscription',
    v_sub.id,
    jsonb_build_object('resumed_status', v_new_status)
  );
END;
$$;


-- 10.11 platform_cancel_organization_subscription
CREATE OR REPLACE FUNCTION public.platform_cancel_organization_subscription(
  p_org_id uuid,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
  v_sub record;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية الإدارية.';
  END IF;

  v_admin_id := auth.uid();

  SELECT * INTO v_sub FROM public.organization_subscriptions WHERE organization_id = p_org_id;
  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد اشتراك قائم لإلغائه.';
  END IF;

  UPDATE public.organization_subscriptions
  SET
    status = 'cancelled',
    cancelled_at = now(),
    notes = p_notes,
    updated_at = now()
  WHERE organization_id = p_org_id;

  -- Record event
  INSERT INTO public.subscription_events (
    organization_id,
    subscription_id,
    event_type,
    old_status,
    new_status,
    note,
    created_by
  ) VALUES (
    p_org_id,
    v_sub.id,
    'cancelled',
    v_sub.status,
    'cancelled',
    COALESCE(p_notes, 'تم إلغاء الاشتراك يدوياً بواسطة الإدارة.'),
    v_admin_id
  );

  INSERT INTO public.platform_admin_audit_logs (
    admin_profile_id,
    action,
    target_organization_id,
    document_type,
    document_id
  ) VALUES (
    v_admin_id,
    'cancel_subscription',
    p_org_id,
    'organization_subscription',
    v_sub.id
  );
END;
$$;


-- 10.12 platform_list_organization_subscriptions
CREATE OR REPLACE FUNCTION public.platform_list_organization_subscriptions(
  p_search text,
  p_status_filter text,
  p_plan_filter uuid
)
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  country_code text,
  plan_id uuid,
  plan_name_snapshot text,
  status text,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  trial_ends_at timestamp with time zone,
  grace_ends_at timestamp with time zone,
  activation_method text,
  price_snapshot numeric,
  currency_snapshot text,
  notes text,
  days_remaining integer,
  owner_name text,
  owner_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'غير مصرح لك باستعراض اشتراكات المنشآت.';
  END IF;

  RETURN QUERY
  SELECT 
    o.id AS organization_id,
    o.name_ar AS organization_name,
    o.country_code AS country_code,
    sub.plan_id AS plan_id,
    COALESCE(sub.plan_name_snapshot, plan.name_ar, 'رتبة معلقة') AS plan_name_snapshot,
    COALESCE(sub.status, 'legacy_pending') AS status,
    sub.starts_at AS starts_at,
    sub.ends_at AS ends_at,
    sub.trial_ends_at AS trial_ends_at,
    sub.grace_ends_at AS grace_ends_at,
    COALESCE(sub.activation_method, 'migration') AS activation_method,
    COALESCE(sub.price_snapshot, plan.price, 0.00)::numeric AS price_snapshot,
    COALESCE(sub.currency_snapshot, plan.currency_code, 'SAR') AS currency_snapshot,
    sub.notes AS notes,
    GREATEST(0, EXTRACT(EPOCH FROM (sub.ends_at - now())) / 86400)::integer AS days_remaining,
    COALESCE(p.full_name, 'مالك غير معروف') AS owner_name,
    COALESCE(u.email::text, 'لا يوجد بريد') AS owner_email
  FROM public.organizations o
  LEFT JOIN public.organization_subscriptions sub ON o.id = sub.organization_id
  LEFT JOIN public.subscription_plans plan ON sub.plan_id = plan.id
  LEFT JOIN public.organization_members om ON om.organization_id = o.id AND om.role = 'owner'
  LEFT JOIN public.profiles p ON om.profile_id = p.id
  LEFT JOIN auth.users u ON om.profile_id = u.id
  WHERE (p_search IS NULL OR p_search = '' OR o.name_ar ILIKE '%' || p_search || '%' OR p.full_name ILIKE '%' || p_search || '%')
    AND (p_status_filter IS NULL OR p_status_filter = '' OR COALESCE(sub.status, 'legacy_pending') = p_status_filter)
    AND (p_plan_filter IS NULL OR sub.plan_id = p_plan_filter)
  ORDER BY sub.ends_at ASC NULLS LAST, o.created_at DESC;
END;
$$;


-- 10.13 platform_get_subscription_dashboard
CREATE OR REPLACE FUNCTION public.platform_get_subscription_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_active integer := 0;
  v_total_trialing integer := 0;
  v_total_expired integer := 0;
  v_total_suspended integer := 0;
  v_revenue_snapshot_sum numeric := 0.00;
  v_expiring_soon jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'غير مصرح لك باستعراض لوحة التحكم.';
  END IF;

  -- Totals
  SELECT COUNT(*)::integer INTO v_total_active FROM public.organization_subscriptions WHERE status = 'active';
  SELECT COUNT(*)::integer INTO v_total_trialing FROM public.organization_subscriptions WHERE status = 'trialing';
  SELECT COUNT(*)::integer INTO v_total_expired FROM public.organization_subscriptions WHERE status = 'expired' OR (status = 'active' AND ends_at < now());
  SELECT COUNT(*)::integer INTO v_total_suspended FROM public.organization_subscriptions WHERE status = 'suspended';

  -- Sum of active plan prices
  SELECT COALESCE(SUM(price_snapshot), 0.00) INTO v_revenue_snapshot_sum 
  FROM public.organization_subscriptions 
  WHERE status = 'active';

  -- Expiring soon list (within 7 days)
  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_expiring_soon
  FROM (
    SELECT 
      o.id AS organization_id,
      o.name_ar AS organization_name,
      sub.ends_at AS ends_at,
      plan.name_ar AS plan_name,
      GREATEST(0, EXTRACT(EPOCH FROM (sub.ends_at - now())) / 86400)::integer AS days_remaining
    FROM public.organizations o
    JOIN public.organization_subscriptions sub ON o.id = sub.organization_id
    JOIN public.subscription_plans plan ON sub.plan_id = plan.id
    WHERE sub.status = 'active' AND sub.ends_at <= now() + interval '7 days' AND sub.ends_at >= now()
    ORDER BY sub.ends_at ASC
    LIMIT 5
  ) item;

  RETURN jsonb_build_object(
    'total_active_subscriptions', v_total_active,
    'total_trialing_subscriptions', v_total_trialing,
    'total_expired_subscriptions', v_total_expired,
    'total_suspended_subscriptions', v_total_suspended,
    'revenue_snapshot_sum', v_revenue_snapshot_sum,
    'expiring_soon_subscriptions', v_expiring_soon
  );
END;
$$;


-- 10.14 get_current_organization_subscription
CREATE OR REPLACE FUNCTION public.get_current_organization_subscription(p_org_id uuid)
RETURNS TABLE (
  subscription_id uuid,
  organization_id uuid,
  plan_id uuid,
  status text,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  trial_starts_at timestamp with time zone,
  trial_ends_at timestamp with time zone,
  grace_ends_at timestamp with time zone,
  auto_renew boolean,
  activation_method text,
  price_snapshot numeric,
  currency_snapshot text,
  plan_name_snapshot text,
  duration_days_snapshot integer,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  plan_code text,
  plan_name_ar text,
  plan_name_en text,
  plan_features jsonb,
  max_users integer,
  effective_status text,
  days_remaining integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Security check: user must be a member of this organization, or a platform admin
  IF NOT (public.is_org_member(p_org_id) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'غير مصرح لك باستعراض بيانات اشتراك هذه المنشأة.';
  END IF;

  RETURN QUERY
  SELECT 
    sub.id AS subscription_id,
    sub.organization_id AS organization_id,
    sub.plan_id AS plan_id,
    COALESCE(sub.status, 'legacy_pending') AS status,
    sub.starts_at AS starts_at,
    sub.ends_at AS ends_at,
    sub.trial_starts_at AS trial_starts_at,
    sub.trial_ends_at AS trial_ends_at,
    sub.grace_ends_at AS grace_ends_at,
    sub.auto_renew AS auto_renew,
    COALESCE(sub.activation_method, 'migration') AS activation_method,
    COALESCE(sub.price_snapshot, plan.price, 0.00)::numeric AS price_snapshot,
    COALESCE(sub.currency_snapshot, plan.currency_code, 'SAR') AS currency_snapshot,
    COALESCE(sub.plan_name_snapshot, plan.name_ar, 'رتبة معلقة') AS plan_name_snapshot,
    sub.duration_days_snapshot AS duration_days_snapshot,
    sub.created_at AS created_at,
    sub.updated_at AS updated_at,
    plan.code AS plan_code,
    plan.name_ar AS plan_name_ar,
    plan.name_en AS plan_name_en,
    plan.features AS plan_features,
    COALESCE(sub.max_users, plan.max_users) AS max_users,
    CASE
      WHEN sub.status = 'suspended' THEN 'suspended'
      WHEN sub.status = 'cancelled' THEN 'cancelled'
      WHEN sub.status = 'legacy_pending' THEN 'legacy_pending'
      WHEN now() <= sub.ends_at THEN 
        CASE 
          WHEN sub.trial_ends_at IS NOT NULL AND now() <= sub.trial_ends_at THEN 'trialing'
          ELSE 'active'
        END
      WHEN now() > sub.ends_at AND (sub.grace_ends_at IS NULL OR now() <= sub.grace_ends_at) THEN 'grace_period'
      ELSE 'expired'
    END AS effective_status,
    GREATEST(0, EXTRACT(EPOCH FROM (sub.ends_at - now())) / 86400)::integer AS days_remaining
  FROM public.organization_subscriptions sub
  LEFT JOIN public.subscription_plans plan ON sub.plan_id = plan.id
  WHERE sub.organization_id = p_org_id;

  -- If there is no record, we return nothing. The React client should detect that and fallback or request onboarding trial.
END;
$$;


-- 10.15 ensure_organization_trial_subscription (idempotent helper)
CREATE OR REPLACE FUNCTION public.ensure_organization_trial_subscription(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_record record;
BEGIN
  -- Authenticated user must be an admin of the organization
  IF NOT (public.is_org_admin(p_org_id) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'غير مصرح لك بتسجيل اشتراك تجريبي لهذه المنشأة.';
  END IF;

  -- Load organization
  SELECT * INTO v_org_record FROM public.organizations WHERE id = p_org_id;
  IF v_org_record.id IS NOT NULL THEN
    -- This calls handle_new_organization_subscription inside the trigger/manually
    PERFORM public.handle_new_organization_subscription_manual(v_org_record.id, v_org_record.name_ar);
  END IF;
END;
$$;


-- Helper function for manual handle
CREATE OR REPLACE FUNCTION public.handle_new_organization_subscription_manual(p_org_id uuid, p_org_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trial_plan record;
    v_subscription_id uuid;
BEGIN
    -- If subscription already exists, exit
    IF EXISTS (
        SELECT 1 FROM public.organization_subscriptions 
        WHERE organization_id = p_org_id
    ) THEN
        RETURN;
    END IF;

    -- Get active default trial plan
    SELECT * INTO v_trial_plan
    FROM public.subscription_plans
    WHERE is_default_trial = true AND is_active = true AND archived_at IS NULL
    LIMIT 1;

    -- Fallback to any active plan if no default trial plan exists
    IF v_trial_plan.id IS NULL THEN
        SELECT * INTO v_trial_plan
        FROM public.subscription_plans
        WHERE is_active = true AND archived_at IS NULL
        ORDER BY sort_order ASC
        LIMIT 1;
    END IF;

    -- Fallback to legacy_pending state if absolutely no plan is found
    IF v_trial_plan.id IS NULL THEN
        INSERT INTO public.organization_subscriptions (
            organization_id,
            plan_id,
            status,
            starts_at,
            ends_at,
            activation_method,
            notes
        ) VALUES (
            p_org_id,
            NULL,
            'legacy_pending',
            now(),
            now() + interval '30 days',
            'automatic_trial',
            'تم إسناد رتبة معلقة لعدم وجود باقة تجريبية افتراضية.'
        );
        RETURN;
    END IF;

    -- Insert active trial subscription
    INSERT INTO public.organization_subscriptions (
        organization_id,
        plan_id,
        status,
        starts_at,
        ends_at,
        trial_starts_at,
        trial_ends_at,
        activation_method,
        price_snapshot,
        currency_snapshot,
        plan_name_snapshot,
        duration_days_snapshot,
        notes
    ) VALUES (
        p_org_id,
        v_trial_plan.id,
        'trialing',
        now(),
        now() + (COALESCE(v_trial_plan.trial_days, 14) * interval '1 day'),
        now(),
        now() + (COALESCE(v_trial_plan.trial_days, 14) * interval '1 day'),
        'automatic_trial',
        v_trial_plan.price,
        v_trial_plan.currency_code,
        v_trial_plan.name_ar,
        v_trial_plan.trial_days,
        'تم بدء الفترة التجريبية تلقائياً عند طلب تفعيل الاشتراك.'
    )
    RETURNING id INTO v_subscription_id;

    -- Log creation event
    INSERT INTO public.subscription_events (
        organization_id,
        subscription_id,
        event_type,
        new_status,
        new_plan_id,
        note
    ) VALUES (
        p_org_id,
        v_subscription_id,
        'created',
        'trialing',
        v_trial_plan.id,
        'تم إدراج اشتراك التجربة الافتراضية بنجاح.'
    );
END;
$$;


-- Overload create_organization_invitation to assert user limit before inviting
CREATE OR REPLACE FUNCTION public.create_organization_invitation(
  p_org_id uuid,
  p_email text,
  p_role text
)
RETURNS TABLE (
  invitation_id uuid,
  raw_token text,
  expires_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamp with time zone;
  v_invitation_id uuid;
  v_user_id uuid;
BEGIN
  -- Assert the active user limit BEFORE creating or sending an invitation
  PERFORM public.assert_organization_user_limit(p_org_id);

  -- Ensure user is logged in
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لتوجيه الدعوات';
  END IF;

  -- Check if owner/admin
  IF NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION 'غير مصرح لك بإصدار دعوات لهذه المنشأة';
  END IF;

  -- Validate role
  IF p_role NOT IN ('admin', 'accountant', 'sales', 'viewer') THEN
    RAISE EXCEPTION 'دور غير صالح للدعوة. الأدوار المتاحة: admin, accountant, sales, viewer';
  END IF;

  -- Validate email
  IF p_email IS NULL OR TRIM(p_email) = '' OR p_email NOT LIKE '%@%' THEN
    RAISE EXCEPTION 'الرجاء إدخال بريد إلكتروني صحيح';
  END IF;

  p_email := LOWER(TRIM(p_email));

  -- Update expired invitations for this email inside this organization first
  UPDATE public.organization_invitations
  SET status = 'expired', updated_at = now()
  WHERE organization_id = p_org_id
    AND LOWER(email) = p_email
    AND status = 'pending'
    AND expires_at <= now();

  -- Prevent duplicate pending
  IF EXISTS (
    SELECT 1 FROM public.organization_invitations 
    WHERE organization_id = p_org_id 
      AND LOWER(email) = p_email 
      AND status = 'pending'
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'هناك دعوة معلقة بالفعل لنفس البريد الإلكتروني في هذه المنشأة ولم تنته بعد';
  END IF;

  -- Check if already member
  IF EXISTS (
    SELECT 1
    FROM public.organization_members m
    JOIN auth.users u ON m.profile_id = u.id
    WHERE m.organization_id = p_org_id
      AND lower(u.email) = p_email
      AND COALESCE(m.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'هذا المستخدم عضو بالفعل في هذه المنشأة';
  END IF;

  -- Generate raw token and hash
  v_raw_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_token_hash := md5(v_raw_token);
  v_expires_at := now() + interval '7 days';

  -- Insert invitation
  INSERT INTO public.organization_invitations (
    organization_id,
    email,
    role,
    status,
    token_hash,
    invited_by,
    expires_at
  ) VALUES (
    p_org_id,
    p_email,
    p_role,
    'pending',
    v_token_hash,
    v_user_id,
    v_expires_at
  )
  RETURNING id INTO v_invitation_id;

  RETURN QUERY SELECT v_invitation_id, v_raw_token, v_expires_at;
END;
$$;


-- 11. Seed Default Initial Plans (Idempotent)
INSERT INTO public.subscription_plans (
  code,
  name_ar,
  name_en,
  description_ar,
  description_en,
  plan_type,
  billing_interval,
  duration_days,
  price,
  currency_code,
  trial_days,
  max_users,
  max_branches,
  max_invoices_per_month,
  features,
  is_active,
  is_public,
  is_default_trial,
  sort_order
) VALUES 
(
  'trial',
  'باقة التجربة المجانية',
  'Free Trial Plan',
  'تجربة نظام لِدجرا المتكامل بجميع الميزات لمدة 14 يوماً مجاناً.',
  'Experience Ledgra system with all features for 14 days free.',
  'trial',
  'none',
  14,
  0.00,
  'SAR',
  14,
  3,
  1,
  10,
  '["التقارير المالية الأساسية", "المبيعات والمشتريات", "شجرة الحسابات والقيود", "المخزون"]'::jsonb,
  true,
  true,
  true,
  1
),
(
  'monthly',
  'الباقة الشهرية المرنة',
  'Flexible Monthly Plan',
  'اشتراك شهري مرن يمنحك كامل الصلاحيات لإدارة منشأتك.',
  'Flexible monthly subscription that gives you full power to manage your business.',
  'paid',
  'monthly',
  30,
  59.00,
  'SAR',
  0,
  10,
  3,
  500,
  '["إدارة غير محدودة للقيود", "التسويات البنكية", "دعم الفروع المتعددة", "الربط الإلكتروني مبسط"]'::jsonb,
  true,
  true,
  false,
  2
),
(
  'yearly',
  'الباقة السنوية المتقدمة',
  'Advanced Yearly Plan',
  'وفر أكثر مع الاشتراك السنوي المتكامل مع دعم ميزات الفواتير والربط المتطور.',
  'Save more with the complete yearly subscription with advanced features.',
  'paid',
  'yearly',
  365,
  590.00,
  'SAR',
  0,
  30,
  10,
  5000,
  '["مستخدمين متعددين وفروع غير محدودة", "فواتير غير محدودة", "الدعم المتقدم والربط الإلكتروني", "الأرصدة الافتتاحية والمتقدمة"]'::jsonb,
  true,
  true,
  false,
  3
)
ON CONFLICT (code) DO NOTHING;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.platform_create_subscription_plan TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_update_subscription_plan TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_archive_subscription_plan TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_restore_subscription_plan TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_subscription_plans TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_activate_organization_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_extend_organization_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_change_organization_plan TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_suspend_organization_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_resume_organization_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_cancel_organization_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_organization_subscriptions TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_subscription_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_organization_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_organization_trial_subscription TO authenticated;

COMMIT;
