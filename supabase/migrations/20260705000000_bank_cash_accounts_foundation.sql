-- Migration: 20260705000000_bank_cash_accounts_foundation.sql
-- Goal: BCM-1A — Bank & Cash Accounts Foundation

BEGIN;

-- 1. Create table public.cash_bank_accounts
CREATE TABLE IF NOT EXISTS public.cash_bank_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES public.accounts(id),
    type text NOT NULL CONSTRAINT cash_bank_accounts_type_check CHECK (type IN ('cash', 'bank')),
    name text NOT NULL,
    bank_name text,
    iban text,
    account_number text,
    currency_code text NOT NULL,
    opening_balance numeric(14,2) NOT NULL DEFAULT 0.00,
    current_balance numeric(14,2) NOT NULL DEFAULT 0.00,
    is_default boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. Add uniqueness indexes
-- Prevent duplicate account_id within the same organization
CREATE UNIQUE INDEX IF NOT EXISTS cash_bank_accounts_org_account_idx 
ON public.cash_bank_accounts (organization_id, account_id);

-- Enforce maximum of one default active cash account and one default active bank account per organization
CREATE UNIQUE INDEX IF NOT EXISTS cash_bank_accounts_default_idx 
ON public.cash_bank_accounts (organization_id, type) 
WHERE is_default = true AND is_active = true;

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.cash_bank_accounts ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies
-- SELECT policy: owner, admin, accountant, viewer roles are allowed (Sales is forbidden)
DROP POLICY IF EXISTS cash_bank_accounts_select ON public.cash_bank_accounts;
CREATE POLICY cash_bank_accounts_select ON public.cash_bank_accounts
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_members.organization_id = cash_bank_accounts.organization_id
              AND organization_members.profile_id = auth.uid()
              AND organization_members.role IN ('owner', 'admin', 'accountant', 'viewer')
              AND COALESCE(organization_members.is_active, true) = true
        )
    );

-- ALL policy: Owner and Admin only (Accountant, Sales, Viewer cannot directly manage, modify, delete)
DROP POLICY IF EXISTS cash_bank_accounts_owner_admin_all ON public.cash_bank_accounts;
CREATE POLICY cash_bank_accounts_owner_admin_all ON public.cash_bank_accounts
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_members.organization_id = cash_bank_accounts.organization_id
              AND organization_members.profile_id = auth.uid()
              AND organization_members.role IN ('owner', 'admin')
              AND COALESCE(organization_members.is_active, true) = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_members.organization_id = cash_bank_accounts.organization_id
              AND organization_members.profile_id = auth.uid()
              AND organization_members.role IN ('owner', 'admin')
              AND COALESCE(organization_members.is_active, true) = true
        )
    );

-- 4.5. Trigger for Currency validation
CREATE OR REPLACE FUNCTION public.validate_cash_bank_account_currency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_currency text;
BEGIN
    SELECT currency_code INTO v_org_currency
    FROM public.organizations
    WHERE id = NEW.organization_id;

    IF v_org_currency IS NULL THEN
        RAISE EXCEPTION 'عملة المنشأة غير مضبوطة. يرجى مراجعة إعدادات المنشأة.';
    END IF;

    IF NEW.currency_code IS NULL OR NEW.currency_code <> v_org_currency THEN
        RAISE EXCEPTION 'عملة حساب الصندوق أو البنك يجب أن تطابق عملة المنشأة.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_cash_bank_account_currency ON public.cash_bank_accounts;
CREATE TRIGGER trg_validate_cash_bank_account_currency
BEFORE INSERT OR UPDATE ON public.cash_bank_accounts
FOR EACH ROW
EXECUTE FUNCTION public.validate_cash_bank_account_currency();

-- 5. Set privileges on table
REVOKE ALL ON public.cash_bank_accounts FROM PUBLIC, anon;
GRANT SELECT ON public.cash_bank_accounts TO authenticated;

-- 6. RPC: create_cash_bank_account
CREATE OR REPLACE FUNCTION public.create_cash_bank_account(
    p_organization_id uuid,
    p_account_id uuid,
    p_type text,
    p_name text,
    p_bank_name text DEFAULT NULL,
    p_iban text DEFAULT NULL,
    p_account_number text DEFAULT NULL,
    p_opening_balance numeric DEFAULT 0,
    p_is_default boolean DEFAULT false,
    p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_currency_code text;
    v_new_id uuid;
BEGIN
    -- Ensure user is logged in
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لإتمام العملية.';
    END IF;

    -- Check Owner/Admin role
    IF NOT public.is_org_admin(p_organization_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية متاحة لمالك أو مدير المنشأة فقط.';
    END IF;

    -- Validate account_id belongs to the organization
    IF NOT EXISTS (
        SELECT 1 FROM public.accounts 
        WHERE id = p_account_id AND organization_id = p_organization_id
    ) THEN
        RAISE EXCEPTION 'الحساب المحدد لا ينتمي لهذه المنشأة.';
    END IF;

    -- Validate classification (Assets)
    IF NOT EXISTS (
        SELECT 1 FROM public.accounts 
        WHERE id = p_account_id AND classification = 'assets'
    ) THEN
        RAISE EXCEPTION 'يجب أن يكون الحساب المختار من الأصول (Assets).';
    END IF;

    -- Validate allow_direct_posting
    IF NOT EXISTS (
        SELECT 1 FROM public.accounts 
        WHERE id = p_account_id AND allow_direct_posting = true
    ) THEN
        RAISE EXCEPTION 'يجب اختيار حساب يقبل الترحيل المباشر (Direct Posting).';
    END IF;

    -- Validate is_active
    IF NOT EXISTS (
        SELECT 1 FROM public.accounts 
        WHERE id = p_account_id AND is_active = true
    ) THEN
        RAISE EXCEPTION 'الحساب المختار غير نشط.';
    END IF;

    -- Validate type
    IF p_type NOT IN ('cash', 'bank') THEN
        RAISE EXCEPTION 'نوع الحساب غير صالح. يجب أن يكون cash أو bank.';
    END IF;

    -- Retrieve organization currency code
    SELECT currency_code INTO v_currency_code 
    FROM public.organizations 
    WHERE id = p_organization_id;

    -- Check if currency code is null
    IF v_currency_code IS NULL THEN
        RAISE EXCEPTION 'عملة المنشأة غير مضبوطة. يرجى مراجعة إعدادات المنشأة.';
    END IF;

    -- If default is selected, unset other defaults of the same type for this organization
    IF p_is_default = true THEN
        UPDATE public.cash_bank_accounts
        SET is_default = false
        WHERE organization_id = p_organization_id AND type = p_type;
    END IF;

    -- Insert account
    INSERT INTO public.cash_bank_accounts (
        organization_id,
        account_id,
        type,
        name,
        bank_name,
        iban,
        account_number,
        currency_code,
        opening_balance,
        current_balance,
        is_default,
        is_active,
        notes,
        created_by
    ) VALUES (
        p_organization_id,
        p_account_id,
        p_type,
        p_name,
        p_bank_name,
        p_iban,
        p_account_number,
        v_currency_code,
        COALESCE(p_opening_balance, 0),
        COALESCE(p_opening_balance, 0), -- Initial current_balance matches opening_balance
        p_is_default,
        true,
        p_notes,
        auth.uid()
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_cash_bank_account(uuid, uuid, text, text, text, text, text, numeric, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_cash_bank_account(uuid, uuid, text, text, text, text, text, numeric, boolean, text) TO authenticated;

-- 7. RPC: update_cash_bank_account
CREATE OR REPLACE FUNCTION public.update_cash_bank_account(
    p_id uuid,
    p_name text,
    p_bank_name text DEFAULT NULL,
    p_iban text DEFAULT NULL,
    p_account_number text DEFAULT NULL,
    p_is_default boolean DEFAULT false,
    p_notes text DEFAULT NULL,
    p_is_active boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_type text;
BEGIN
    -- Ensure user is logged in
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لإتمام العملية.';
    END IF;

    -- Retrieve existing account details
    SELECT organization_id, type INTO v_org_id, v_type 
    FROM public.cash_bank_accounts 
    WHERE id = p_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'لم يتم العثور على حساب الصندوق أو البنك المحدد.';
    END IF;

    -- Verify Owner/Admin role
    IF NOT public.is_org_admin(v_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية متاحة لمالك أو مدير المنشأة فقط.';
    END IF;

    -- If default is set to true, unset other defaults of the same type
    IF p_is_default = true THEN
        UPDATE public.cash_bank_accounts
        SET is_default = false
        WHERE organization_id = v_org_id AND type = v_type AND id != p_id;
    END IF;

    -- Update account
    UPDATE public.cash_bank_accounts
    SET name = p_name,
        bank_name = p_bank_name,
        iban = p_iban,
        account_number = p_account_number,
        is_default = p_is_default,
        notes = p_notes,
        is_active = p_is_active,
        updated_at = now()
    WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_cash_bank_account(uuid, text, text, text, text, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_cash_bank_account(uuid, text, text, text, text, boolean, text, boolean) TO authenticated;

-- 8. RPC: list_cash_bank_accounts
CREATE OR REPLACE FUNCTION public.list_cash_bank_accounts(
    p_organization_id uuid
)
RETURNS TABLE (
    id uuid,
    type text,
    name text,
    bank_name text,
    iban text,
    account_number text,
    currency_code text,
    opening_balance numeric,
    current_balance numeric,
    is_default boolean,
    is_active boolean,
    notes text,
    account_id uuid,
    account_code text,
    account_name_ar text,
    account_name_en text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role text;
BEGIN
    -- Ensure user is logged in
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لإتمام العملية.';
    END IF;

    -- Verify active member role
    SELECT role INTO v_role
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND profile_id = auth.uid()
      AND COALESCE(is_active, true) = true;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'غير مصرح لك باستعراض الصناديق والحسابات البنكية الخاصة بهذه المنشأة.';
    END IF;

    IF v_role = 'sales' THEN
        RAISE EXCEPTION 'غير مصرح لك باستعراض الصناديق والحسابات البنكية.';
    END IF;

    IF v_role NOT IN ('owner', 'admin', 'accountant', 'viewer') THEN
        RAISE EXCEPTION 'غير مصرح لك باستعراض الصناديق والحسابات البنكية.';
    END IF;

    RETURN QUERY
    SELECT 
        cba.id,
        cba.type,
        cba.name,
        cba.bank_name,
        cba.iban,
        cba.account_number,
        cba.currency_code,
        cba.opening_balance::numeric,
        cba.current_balance::numeric,
        cba.is_default,
        cba.is_active,
        cba.notes,
        cba.account_id,
        acc.code::text AS account_code,
        acc.name_ar::text AS account_name_ar,
        acc.name_en::text AS account_name_en
    FROM public.cash_bank_accounts cba
    JOIN public.accounts acc ON cba.account_id = acc.id
    WHERE cba.organization_id = p_organization_id
    ORDER BY cba.type DESC, cba.is_default DESC, cba.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_cash_bank_accounts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_cash_bank_accounts(uuid) TO authenticated;

COMMIT;
