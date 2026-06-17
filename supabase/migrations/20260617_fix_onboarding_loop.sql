-- Migration: Add missing onboarding columns to organizations and update helpers safely
-- Path: supabase/migrations/20260617_fix_onboarding_loop.sql

-- Ensure columns exist in organizations table
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 1 NOT NULL;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ;

-- Re-create or optimize the RPC function if needed, keeping it safe and idempotent
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
        '{}'::jsonb,
        NOW()
    );

    RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
