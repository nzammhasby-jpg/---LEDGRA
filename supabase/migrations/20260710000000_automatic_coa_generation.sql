-- LEDGRA - Automatic Default Chart of Accounts (COA) Seeding & Safety Guard
-- Migration: 20260710000000_automatic_coa_generation.sql

-- 1. Create a safe, idempotent function to initialize COA for an organization without forcing user-level checks
CREATE OR REPLACE FUNCTION public.ensure_default_chart_of_accounts(
    p_organization_id uuid,
    p_industry_type text DEFAULT 'general_trading'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_already_init boolean;
    v_is_accounts_exist boolean;
    v_inserted_count integer := 0;
    
    -- Record variables for loop
    v_rec record;
    
    -- Variables to keep mapped ids
    v_cash_id uuid;
    v_bank_id uuid;
    v_receivables_id uuid;
    v_inventory_id uuid;
    v_tax_input_id uuid;
    v_payables_id uuid;
    v_tax_output_id uuid;
    v_retained_id uuid;
    v_sales_id uuid;
    v_service_sales_id uuid;
    v_cogs_id uuid;
    
    -- Mapping codes based on template types
    v_cash_code text := '1111';
    v_bank_code text := '1112';
    v_receivables_code text := '1121';
    v_payables_code text := '2111';
    v_tax_output_code text := '2121';
    v_tax_input_code text := '1151';
    v_retained_code text := '3121';
    
    v_sales_code text;
    v_service_sales_code text;
    v_inventory_code text;
    v_cogs_code text;
BEGIN
    -- Transactional lock on organization to protect against race conditions
    PERFORM pg_advisory_xact_lock(hashtext(p_organization_id::text));

    -- Idempotency Checks
    SELECT EXISTS (
        SELECT 1 FROM public.accounting_settings 
        WHERE organization_id = p_organization_id AND coa_initialized_at IS NOT NULL
    ) INTO v_is_already_init;

    SELECT EXISTS (
        SELECT 1 FROM public.accounts 
        WHERE organization_id = p_organization_id
    ) INTO v_is_accounts_exist;

    -- If already initialized and accounts exist, do not re-run full setup
    IF v_is_already_init AND v_is_accounts_exist THEN
        RETURN jsonb_build_object('status', 'already_initialized', 'message', 'الشجرة مهيأة مسبقًا للمنشأة.');
    END IF;

    -- Clean fallback for industry type if non-existent
    IF NOT EXISTS (
        SELECT 1 FROM public.coa_templates 
        WHERE industry_type = p_industry_type
    ) THEN
        p_industry_type := 'general_trading';
    END IF;

    -- Set default accounting settings codes based on the chosen industry template
    v_sales_code := '4111';
    v_service_sales_code := NULL;
    v_inventory_code := NULL;
    v_cogs_code := NULL;

    IF p_industry_type = 'general_trading' THEN
        v_inventory_code := '1131';
        v_cogs_code := '5111';
    ELSIF p_industry_type = 'services' THEN
        v_sales_code := '4112';
        v_service_sales_code := '4113';
    ELSIF p_industry_type = 'real_estate' THEN
        v_sales_code := '4112';
        v_service_sales_code := '4113';
    ELSIF p_industry_type = 'contracting' THEN
        v_sales_code := '4112';
        v_service_sales_code := '4113';
    ELSIF p_industry_type = 'ecommerce' THEN
        v_sales_code := '4111';
        v_service_sales_code := '4112';
        v_inventory_code := '1131';
        v_cogs_code := '5111';
    ELSIF p_industry_type = 'restaurant' THEN
        v_sales_code := '4111';
        v_service_sales_code := '4112';
        v_inventory_code := '1131';
        v_cogs_code := '5111';
    END IF;

    -- Insert accounts ordered by length(code) so that parents are built before children
    FOR v_rec IN 
        SELECT code, name_ar, name_en, classification, nature, parent_code, allow_direct_posting, is_system, sort_order
        FROM public.coa_templates
        WHERE industry_type = p_industry_type
        ORDER BY length(code) ASC, code ASC
    LOOP
        DECLARE
            v_parent_id uuid := NULL;
        BEGIN
            -- Resolve parent account ID if parent_code is present
            IF v_rec.parent_code IS NOT NULL THEN
                SELECT id INTO v_parent_id 
                FROM public.accounts 
                WHERE organization_id = p_organization_id AND code = v_rec.parent_code;
            END IF;

            -- Idempotent Insertion (ON CONFLICT DO NOTHING preserves any existing manual/partial accounts)
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
                'تم التأسيس تلقائيًا لضمان سلامة الهيكل المالي لقسم: ' || p_industry_type
            ) ON CONFLICT (organization_id, code) DO NOTHING;

            v_inserted_count := v_inserted_count + 1;
        END;
    END LOOP;

    -- Resolve ID references for settings mappings
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

    -- Upsert accounting settings mapping safely without replacing user-configured fields
    INSERT INTO public.accounting_settings (
        organization_id,
        default_cash_account_id,
        default_bank_account_id,
        default_receivables_account_id,
        default_inventory_account_id,
        default_tax_input_account_id,
        default_payables_account_id,
        default_tax_output_account_id,
        default_retained_earnings_account_id,
        default_sales_account_id,
        default_service_sales_account_id,
        default_cogs_account_id,
        coa_initialized_at,
        updated_at
    ) VALUES (
        p_organization_id,
        v_cash_id,
        v_bank_id,
        v_receivables_id,
        v_inventory_id,
        v_tax_input_id,
        v_payables_id,
        v_tax_output_id,
        v_retained_id,
        v_sales_id,
        v_service_sales_id,
        v_cogs_id,
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
    ) ON CONFLICT (organization_id) DO UPDATE SET
        default_cash_account_id = COALESCE(accounting_settings.default_cash_account_id, EXCLUDED.default_cash_account_id),
        default_bank_account_id = COALESCE(accounting_settings.default_bank_account_id, EXCLUDED.default_bank_account_id),
        default_receivables_account_id = COALESCE(accounting_settings.default_receivables_account_id, EXCLUDED.default_receivables_account_id),
        default_inventory_account_id = COALESCE(accounting_settings.default_inventory_account_id, EXCLUDED.default_inventory_account_id),
        default_tax_input_account_id = COALESCE(accounting_settings.default_tax_input_account_id, EXCLUDED.default_tax_input_account_id),
        default_payables_account_id = COALESCE(accounting_settings.default_payables_account_id, EXCLUDED.default_payables_account_id),
        default_tax_output_account_id = COALESCE(accounting_settings.default_tax_output_account_id, EXCLUDED.default_tax_output_account_id),
        default_retained_earnings_account_id = COALESCE(accounting_settings.default_retained_earnings_account_id, EXCLUDED.default_retained_earnings_account_id),
        default_sales_account_id = COALESCE(accounting_settings.default_sales_account_id, EXCLUDED.default_sales_account_id),
        default_service_sales_account_id = COALESCE(accounting_settings.default_service_sales_account_id, EXCLUDED.default_service_sales_account_id),
        default_cogs_account_id = COALESCE(accounting_settings.default_cogs_account_id, EXCLUDED.default_cogs_account_id),
        coa_initialized_at = COALESCE(accounting_settings.coa_initialized_at, EXCLUDED.coa_initialized_at),
        updated_at = timezone('utc'::text, now());

    RETURN jsonb_build_object(
        'status', 'success',
        'inserted_accounts', v_inserted_count,
        'industry_type', p_industry_type
    );
END;
$$;

-- Grant execution to authenticated users
REVOKE ALL ON FUNCTION public.ensure_default_chart_of_accounts(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_default_chart_of_accounts(uuid, text) TO authenticated;


-- 2. Create the Database Trigger to automatically initialize COA on organization creation
CREATE OR REPLACE FUNCTION public.trg_fn_auto_coa_on_org_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_industry_type text;
BEGIN
    -- Smart mapping of organization activity_type to industry_type
    v_industry_type := CASE
        WHEN NEW.activity_type = 'trading' OR NEW.activity_type = 'general_trading' THEN 'general_trading'
        WHEN NEW.activity_type = 'services' OR NEW.activity_type = 'consulting' THEN 'services'
        WHEN NEW.activity_type = 'real_estate' THEN 'real_estate'
        WHEN NEW.activity_type = 'contracting' THEN 'contracting'
        WHEN NEW.activity_type = 'ecommerce' THEN 'ecommerce'
        WHEN NEW.activity_type = 'restaurant' THEN 'restaurant'
        WHEN NEW.activity_type = 'simple_establishment' OR NEW.activity_type = 'retail' THEN 'simple_establishment'
        ELSE 'general_trading'
    END;

    -- Safe execution of initialization
    PERFORM public.ensure_default_chart_of_accounts(NEW.id, v_industry_type);

    RETURN NEW;
END;
$$;

-- Create the AFTER INSERT trigger on organizations
DROP TRIGGER IF EXISTS trg_auto_coa_on_org_insert ON public.organizations;
CREATE TRIGGER trg_auto_coa_on_org_insert
    AFTER INSERT ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_fn_auto_coa_on_org_insert();


-- 3. Backfill all existing organizations that do not have any accounts in public.accounts
DO $$
DECLARE
    v_org record;
    v_industry_type text;
BEGIN
    FOR v_org IN 
        SELECT id, activity_type FROM public.organizations o
        WHERE NOT EXISTS (
            SELECT 1 FROM public.accounts a WHERE a.organization_id = o.id
        )
    LOOP
        -- Smart mapping
        v_industry_type := CASE
            WHEN v_org.activity_type = 'trading' OR v_org.activity_type = 'general_trading' THEN 'general_trading'
            WHEN v_org.activity_type = 'services' OR v_org.activity_type = 'consulting' THEN 'services'
            WHEN v_org.activity_type = 'real_estate' THEN 'real_estate'
            WHEN v_org.activity_type = 'contracting' THEN 'contracting'
            WHEN v_org.activity_type = 'ecommerce' THEN 'ecommerce'
            WHEN v_org.activity_type = 'restaurant' THEN 'restaurant'
            WHEN v_org.activity_type = 'simple_establishment' OR v_org.activity_type = 'retail' THEN 'simple_establishment'
            ELSE 'general_trading'
        END;

        -- Auto initialize
        PERFORM public.ensure_default_chart_of_accounts(v_org.id, v_industry_type);
    END LOOP;
END;
$$;
