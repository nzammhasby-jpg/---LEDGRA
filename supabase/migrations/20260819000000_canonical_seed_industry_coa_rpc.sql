-- ====================================================================
-- LEDGRA MIGRATION: CANONICAL SEED_INDUSTRY_CHART_OF_ACCOUNTS RPC
-- Description: Unifies the parameter naming across frontend and database
--              to use canonical `p_organization_id` and drops legacy
--              signatures to prevent PostgREST signature mismatch & ambiguity.
-- ====================================================================

BEGIN;

-- 1. Safely drop legacy/conflicting overloads if any exist
DROP FUNCTION IF EXISTS public.seed_industry_chart_of_accounts(uuid, text);
DROP FUNCTION IF EXISTS public.seed_industry_chart_of_accounts(uuid);

-- 2. CREATE CANONICAL seed_industry_chart_of_accounts
CREATE OR REPLACE FUNCTION public.seed_industry_chart_of_accounts(
    p_organization_id uuid,
    p_industry_type text DEFAULT 'general_trading'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_is_already_init boolean;
    v_is_accounts_exist boolean;
    v_inserted_count integer := 0;
    
    v_rec record;
    v_new_id uuid;
    
    -- Specific system mappings identifiers
    v_cash_id uuid;
    v_bank_id uuid;
    v_receivables_id uuid;
    v_payables_id uuid;
    v_tax_output_id uuid;
    v_tax_input_id uuid;
    v_retained_id uuid;
    v_sales_id uuid;
    v_service_sales_id uuid;
    v_inventory_id uuid;
    v_cogs_id uuid;

    -- Standard codes
    v_cash_code text := '1111';
    v_bank_code text := '1112';
    v_receivables_code text := '1121';
    v_payables_code text := '2111';
    v_tax_output_code text := '2121';
    v_tax_input_code text := '1151';
    v_retained_code text := '3121';
    
    v_sales_code text := NULL;
    v_service_sales_code text := NULL;
    v_inventory_code text := NULL;
    v_cogs_code text := NULL;
    
    v_templates_exist boolean := false;
BEGIN
    -- 1. Auth & Membership check
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Privileged check (active owner, admin, or accountant)
    IF NOT EXISTS (
        SELECT 1 
        FROM public.organization_members 
        WHERE organization_id = p_organization_id 
          AND profile_id = v_user_id 
          AND role IN ('owner', 'admin', 'accountant')
          AND COALESCE(is_active, true) = true
    ) THEN
        RAISE EXCEPTION 'غير مصرح: تهيئة دليل الحسابات متاحة للمالك أو المدير أو المحاسب فقط.';
    END IF;

    -- Transactional advisory lock per organization to prevent race conditions / duplicate runs
    PERFORM pg_advisory_xact_lock(hashtext(p_organization_id::text));

    -- 2. Idempotency Check
    SELECT EXISTS (
        SELECT 1 FROM public.accounting_settings 
        WHERE organization_id = p_organization_id AND coa_initialized_at IS NOT NULL
    ) INTO v_is_already_init;

    SELECT EXISTS (
        SELECT 1 FROM public.accounts 
        WHERE organization_id = p_organization_id
    ) INTO v_is_accounts_exist;

    IF v_is_already_init AND v_is_accounts_exist THEN
        RETURN jsonb_build_object(
            'status', 'already_initialized',
            'inserted_accounts', 0,
            'industry_type', p_industry_type
        );
    END IF;

    -- 3. Verify template existence in coa_templates
    IF to_regclass('public.coa_templates') IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.coa_templates 
            WHERE industry_type = p_industry_type
        ) INTO v_templates_exist;
    END IF;

    IF NOT v_templates_exist THEN
        p_industry_type := 'general_trading';
        IF to_regclass('public.coa_templates') IS NOT NULL THEN
            SELECT EXISTS (
                SELECT 1 FROM public.coa_templates 
                WHERE industry_type = p_industry_type
            ) INTO v_templates_exist;
        END IF;
    END IF;

    -- Configure industry-specific target codes for settings
    IF p_industry_type = 'general_trading' OR p_industry_type = 'ecommerce' OR p_industry_type = 'restaurant' THEN
        v_sales_code := '4111';
        v_service_sales_code := '4112';
        v_inventory_code := '1131';
        v_cogs_code := '5111';
    ELSIF p_industry_type = 'services' THEN
        v_sales_code := '4112';
        v_service_sales_code := '4113';
        v_cogs_code := NULL;
        v_inventory_code := NULL;
    ELSIF p_industry_type = 'contracting' THEN
        v_sales_code := '4112';
        v_service_sales_code := '4113';
        v_inventory_code := '1131';
        v_cogs_code := '5111';
    ELSIF p_industry_type = 'real_estate' THEN
        v_sales_code := '4112';
        v_service_sales_code := '4113';
        v_inventory_code := NULL;
        v_cogs_code := NULL;
    ELSE
        v_sales_code := '4111';
        v_service_sales_code := '4112';
        v_inventory_code := '1131';
        v_cogs_code := '5111';
    END IF;

    -- 4. Inserting accounts ordered by length(code), code so parents are always inserted before child accounts
    IF v_templates_exist THEN
        FOR v_rec IN 
            SELECT code, name_ar, name_en, classification, nature, parent_code, allow_direct_posting, is_system, balance_sheet_section
            FROM public.coa_templates
            WHERE industry_type = p_industry_type
            ORDER BY length(code) ASC, code ASC
        LOOP
            DECLARE
                v_parent_id uuid := NULL;
            BEGIN
                IF v_rec.parent_code IS NOT NULL THEN
                    SELECT id INTO v_parent_id 
                    FROM public.accounts 
                    WHERE organization_id = p_organization_id AND code = v_rec.parent_code;
                END IF;

                INSERT INTO public.accounts (
                    organization_id,
                    code,
                    name_ar,
                    name_en,
                    classification,
                    nature,
                    parent_id,
                    allow_direct_posting,
                    is_system,
                    balance_sheet_section,
                    description
                ) VALUES (
                    p_organization_id,
                    v_rec.code,
                    v_rec.name_ar,
                    v_rec.name_en,
                    v_rec.classification,
                    v_rec.nature,
                    v_parent_id,
                    v_rec.allow_direct_posting,
                    v_rec.is_system,
                    v_rec.balance_sheet_section,
                    'تم التأسيس التلقائي للنموذج: ' || p_industry_type
                ) ON CONFLICT (organization_id, code) DO UPDATE 
                SET balance_sheet_section = EXCLUDED.balance_sheet_section
                WHERE accounts.balance_sheet_section IS NULL
                RETURNING id INTO v_new_id;

                IF v_new_id IS NOT NULL THEN
                    v_inserted_count := v_inserted_count + 1;
                END IF;
            END;
        END LOOP;
    ELSE
        -- Fallback to default COA generator if templates table is empty
        IF NOT v_is_accounts_exist THEN
            PERFORM public.seed_default_chart_of_accounts(p_organization_id);
            v_inserted_count := 1;
        END IF;
    END IF;

    -- 5. Map the newly created accounts to accounting_settings
    SELECT id INTO v_cash_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_cash_code;
    SELECT id INTO v_bank_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_bank_code;
    SELECT id INTO v_receivables_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_receivables_code;
    SELECT id INTO v_payables_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_payables_code;
    SELECT id INTO v_tax_output_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_tax_output_code;
    SELECT id INTO v_tax_input_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_tax_input_code;
    SELECT id INTO v_retained_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_retained_code;
    
    IF v_sales_code IS NOT NULL THEN
        SELECT id INTO v_sales_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_sales_code;
    END IF;
    
    IF v_service_sales_code IS NOT NULL THEN
        SELECT id INTO v_service_sales_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_service_sales_code;
    END IF;
    
    IF v_inventory_code IS NOT NULL THEN
        SELECT id INTO v_inventory_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_inventory_code;
    END IF;
    
    IF v_cogs_code IS NOT NULL THEN
        SELECT id INTO v_cogs_id FROM public.accounts WHERE organization_id = p_organization_id AND code = v_cogs_code;
    END IF;

    -- Upsert accounting settings
    INSERT INTO public.accounting_settings (
        organization_id,
        default_cash_account_id,
        default_bank_account_id,
        default_receivables_account_id,
        default_payables_account_id,
        default_tax_output_account_id,
        default_tax_input_account_id,
        default_retained_earnings_account_id,
        default_sales_account_id,
        default_service_sales_account_id,
        default_inventory_account_id,
        default_cogs_account_id,
        coa_initialized_at,
        updated_at
    ) VALUES (
        p_organization_id,
        v_cash_id,
        v_bank_id,
        v_receivables_id,
        v_payables_id,
        v_tax_output_id,
        v_tax_input_id,
        v_retained_id,
        v_sales_id,
        v_service_sales_id,
        v_inventory_id,
        v_cogs_id,
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
    ) ON CONFLICT (organization_id) DO UPDATE SET
        default_cash_account_id = COALESCE(accounting_settings.default_cash_account_id, EXCLUDED.default_cash_account_id),
        default_bank_account_id = COALESCE(accounting_settings.default_bank_account_id, EXCLUDED.default_bank_account_id),
        default_receivables_account_id = COALESCE(accounting_settings.default_receivables_account_id, EXCLUDED.default_receivables_account_id),
        default_payables_account_id = COALESCE(accounting_settings.default_payables_account_id, EXCLUDED.default_payables_account_id),
        default_tax_output_account_id = COALESCE(accounting_settings.default_tax_output_account_id, EXCLUDED.default_tax_output_account_id),
        default_tax_input_account_id = COALESCE(accounting_settings.default_tax_input_account_id, EXCLUDED.default_tax_input_account_id),
        default_retained_earnings_account_id = COALESCE(accounting_settings.default_retained_earnings_account_id, EXCLUDED.default_retained_earnings_account_id),
        default_sales_account_id = COALESCE(accounting_settings.default_sales_account_id, EXCLUDED.default_sales_account_id),
        default_service_sales_account_id = COALESCE(accounting_settings.default_service_sales_account_id, EXCLUDED.default_service_sales_account_id),
        default_inventory_account_id = COALESCE(accounting_settings.default_inventory_account_id, EXCLUDED.default_inventory_account_id),
        default_cogs_account_id = COALESCE(accounting_settings.default_cogs_account_id, EXCLUDED.default_cogs_account_id),
        coa_initialized_at = COALESCE(accounting_settings.coa_initialized_at, EXCLUDED.coa_initialized_at),
        updated_at = timezone('utc'::text, now());

    -- 6. Audit logging
    BEGIN
        INSERT INTO public.audit_logs (
            organization_id,
            profile_id,
            action,
            details
        ) VALUES (
            p_organization_id,
            v_user_id,
            'seed_industry_chart_of_accounts',
            jsonb_build_object(
                'industry_type', p_industry_type,
                'status', 'success',
                'accounts_count', v_inserted_count
            )
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'status', 'success',
        'inserted_accounts', v_inserted_count,
        'industry_type', p_industry_type
    );
END;
$$;

-- Revoke from public/anon and grant to authenticated
REVOKE ALL ON FUNCTION public.seed_industry_chart_of_accounts(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_industry_chart_of_accounts(uuid, text) TO authenticated;

COMMIT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
