-- Migration: 20260715000000_multi_country_foundation.sql
-- Goal: Multi-Country Foundation (SA & YE support)

-- 1. Ensure columns exist on public.organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'SA' NOT NULL;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'SAR' NOT NULL;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS default_tax_rate numeric DEFAULT 15.0 NOT NULL;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_vat_registered boolean DEFAULT false NOT NULL;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS cr_number text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS vat_number text;

-- 2. Migrate existing organizations that might have null values or old defaults
UPDATE public.organizations 
SET country_code = 'SA' 
WHERE country_code IS NULL OR country_code = '';

UPDATE public.organizations 
SET currency_code = 'SAR' 
WHERE currency_code IS NULL OR currency_code = '';

UPDATE public.organizations 
SET default_tax_rate = 15.0 
WHERE (default_tax_rate IS NULL OR default_tax_rate = 0.0) AND country_code = 'SA';

-- 3. Modify Constraints
-- Drop old constraints if they exist
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS country_code_check;
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS currency_code_check;
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS cr_check;
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS vat_check;

-- Add updated multi-country checks
ALTER TABLE public.organizations ADD CONSTRAINT country_code_check CHECK (country_code IN ('SA', 'YE'));
ALTER TABLE public.organizations ADD CONSTRAINT currency_code_check CHECK (currency_code IN ('SAR', 'YER', 'USD'));

-- CR/Sajel validation: Only apply the 10-digit check when country_code is 'SA'
ALTER TABLE public.organizations ADD CONSTRAINT cr_check CHECK (
    cr_number IS NULL OR 
    country_code != 'SA' OR 
    cr_number ~ '^[0-9]{10}$'
);

-- VAT validation: Only apply the 15-digit Saudi VAT validation starts/ends with 3 when country_code is 'SA'
ALTER TABLE public.organizations ADD CONSTRAINT vat_check CHECK (
    is_vat_registered = false OR 
    country_code != 'SA' OR 
    (is_vat_registered = true AND vat_number IS NOT NULL AND vat_number ~ '^3[0-9]{13}3$')
);


-- 4. Update and overload create_organization_with_owner function
DROP FUNCTION IF EXISTS public.create_organization_with_owner(
    text, text, text, text, text, text, text, text, boolean, date, text, date, text, boolean, boolean, integer
);
DROP FUNCTION IF EXISTS public.create_organization_with_owner(
    text, text, text, text, text, text, text, text, boolean, date, text, date, text, boolean, boolean, integer, text, text
);

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
    p_onboarding_step integer,
    p_country_code text DEFAULT 'SA',
    p_currency_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_org_id uuid;
    v_country_code text;
    v_currency_code text;
    v_default_tax_rate numeric;
BEGIN
    -- Match auth.uid()
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'المستخدم مجهول الهوية أو غير قادر على إتمام العملية.';
    END IF;

    -- Determine country and currency safely
    v_country_code := COALESCE(p_country_code, 'SA');
    
    IF v_country_code = 'SA' THEN
        IF p_currency_code IS NOT NULL AND p_currency_code != 'SAR' THEN
            RAISE EXCEPTION 'العملة غير متوافقة مع الدولة السعودية في هذه المرحلة.';
        END IF;
        v_currency_code := 'SAR';
        v_default_tax_rate := 15.0;
    ELSIF v_country_code = 'YE' THEN
        IF p_currency_code IS NOT NULL AND p_currency_code != 'YER' THEN
            RAISE EXCEPTION 'العملة غير متوافقة مع الدولة اليمنية في هذه المرحلة. سيتم دعم العملات المتعددة لاحقًا.';
        END IF;
        v_currency_code := 'YER';
        v_default_tax_rate := 0.0;
    ELSE
        RAISE EXCEPTION 'الدولة المحددة غير مدعومة حالياً: %', v_country_code;
    END IF;

    -- Check if requested currency is within supported options (database checks)
    IF v_currency_code NOT IN ('SAR', 'YER', 'USD') THEN
        RAISE EXCEPTION 'العملة المحددة غير مدعومة: %', v_currency_code;
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
        starting_balances_later,
        default_tax_rate
    ) VALUES (
        p_name_ar,
        COALESCE(p_name_en, ''),
        p_activity_type,
        v_country_code,
        p_city,
        p_phone,
        p_email,
        p_legal_type,
        NULLIF(p_cr_number, ''),
        NULLIF(p_vat_number, ''),
        p_is_vat_registered,
        p_fiscal_year_start,
        v_currency_code,
        'ar',
        p_onboarding_completed,
        CASE WHEN p_onboarding_completed = true THEN now() ELSE NULL END,
        COALESCE(p_onboarding_step, 3),
        v_user_id,
        p_system_start_date,
        p_accounting_mode,
        p_starting_balances_later,
        v_default_tax_rate
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
            'country_code', v_country_code,
            'currency_code', v_currency_code,
            'default_tax_rate', v_default_tax_rate
        )
    );

    RETURN v_org_id;
END;
$$;

-- Grant permissions
REVOKE ALL ON FUNCTION public.create_organization_with_owner(
    text, text, text, text, text, text, text, text, boolean, date, text, date, text, boolean, boolean, integer, text, text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_organization_with_owner(
    text, text, text, text, text, text, text, text, boolean, date, text, date, text, boolean, boolean, integer, text, text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(
    text, text, text, text, text, text, text, text, boolean, date, text, date, text, boolean, boolean, integer, text, text
) TO authenticated;
