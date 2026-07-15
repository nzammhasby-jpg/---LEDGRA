-- LEDGRA FIN-1A: Advanced Statement of Financial Position Migration
-- 1. Extend accounts and coa_templates with balance_sheet_section column

BEGIN;

-- Add balance_sheet_section column to accounts
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS balance_sheet_section text;

-- Add balance_sheet_section column to coa_templates
ALTER TABLE public.coa_templates ADD COLUMN IF NOT EXISTS balance_sheet_section text;

-- Apply check constraints on accounts
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_balance_sheet_section_check;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_balance_sheet_section_check CHECK (
  balance_sheet_section IS NULL OR 
  balance_sheet_section IN ('current_asset', 'non_current_asset', 'current_liability', 'non_current_liability', 'equity')
);

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_balance_sheet_section_classification_check;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_balance_sheet_section_classification_check CHECK (
  balance_sheet_section IS NULL OR
  (classification = 'assets' AND balance_sheet_section IN ('current_asset', 'non_current_asset')) OR
  (classification = 'liabilities' AND balance_sheet_section IN ('current_liability', 'non_current_liability')) OR
  (classification = 'equity' AND balance_sheet_section = 'equity')
);

-- Apply check constraints on coa_templates
ALTER TABLE public.coa_templates DROP CONSTRAINT IF EXISTS coa_templates_balance_sheet_section_check;
ALTER TABLE public.coa_templates ADD CONSTRAINT coa_templates_balance_sheet_section_check CHECK (
  balance_sheet_section IS NULL OR 
  balance_sheet_section IN ('current_asset', 'non_current_asset', 'current_liability', 'non_current_liability', 'equity')
);

-- Seed coa_templates with accurate, non-guess balance_sheet_section classification based on code prefixes
UPDATE public.coa_templates
SET balance_sheet_section = 'current_asset'
WHERE code LIKE '11%' AND classification = 'assets';

UPDATE public.coa_templates
SET balance_sheet_section = 'non_current_asset'
WHERE code LIKE '12%' AND classification = 'assets';

UPDATE public.coa_templates
SET balance_sheet_section = 'current_liability'
WHERE code LIKE '21%' AND classification = 'liabilities';

UPDATE public.coa_templates
SET balance_sheet_section = 'non_current_liability'
WHERE code LIKE '22%' AND classification = 'liabilities';

UPDATE public.coa_templates
SET balance_sheet_section = 'equity'
WHERE (code LIKE '3%' OR classification = 'equity') AND classification = 'equity';


-- Update automatic COA generation function to carry over balance_sheet_section to accounts when created
CREATE OR REPLACE FUNCTION public.generate_coa_from_template(
  p_organization_id uuid,
  p_industry_type text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec record;
    v_inserted_count integer := 0;
    
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
BEGIN
    -- Auth verification
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Privileged check
    IF NOT public.is_org_privileged_member(p_organization_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحيات محاسب أو مدير المنشأة.';
    END IF;

    -- Configure industry-specific target codes
    IF p_industry_type = 'general_trading' OR p_industry_type = 'ecommerce' OR p_industry_type = 'restaurant' THEN
        v_sales_code := '4111';
        v_inventory_code := '1131';
        v_cogs_code := '5111';
    ELSIF p_industry_type = 'services' THEN
        v_sales_code := '4111';
        v_service_sales_code := '4112';
        v_cogs_code := NULL;
    ELSIF p_industry_type = 'contracting' THEN
        v_sales_code := '4111';
        v_inventory_code := '1131';
        v_cogs_code := '5111';
    ELSIF p_industry_type = 'real_estate' THEN
        v_sales_code := '4111';
        v_service_sales_code := '4112';
        v_inventory_code := NULL;
    ELSE
        -- Default/Fallback
        v_sales_code := '4111';
        v_service_sales_code := '4112';
        v_inventory_code := '1131';
        v_cogs_code := '5111';
    END IF;

    -- Insert accounts ordered by length(code) so that parents are built before children
    FOR v_rec IN 
        SELECT code, name_ar, name_en, classification, nature, parent_code, allow_direct_posting, is_system, balance_sheet_section
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
                'تم التأسيس تلقائيًا لضمان سلامة الهيكل المالي لقسم: ' || p_industry_type
            ) ON CONFLICT (organization_id, code) DO UPDATE 
            SET balance_sheet_section = EXCLUDED.balance_sheet_section
            WHERE accounts.balance_sheet_section IS NULL;

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
        default_payables_account_id,
        default_tax_output_account_id,
        default_tax_input_account_id,
        default_retained_earnings_account_id,
        default_sales_account_id,
        default_service_sales_account_id,
        default_inventory_account_id,
        default_cogs_account_id,
        coa_initialized_at
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
        timezone('utc'::text, now())
    ) ON CONFLICT (organization_id) DO UPDATE 
    SET 
        coa_initialized_at = COALESCE(accounting_settings.coa_initialized_at, EXCLUDED.coa_initialized_at);

    RETURN v_inserted_count;
END;
$$;


-- 3. Define high-performance advanced balance sheet RPC
CREATE OR REPLACE FUNCTION public.get_advanced_balance_sheet(
  p_org_id uuid,
  p_as_of_date date,
  p_comparison_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_year_start date;
    v_comp_year_start date;
    
    -- Main period totals
    v_main_assets_current numeric(15,2) := 0.00;
    v_main_assets_non_current numeric(15,2) := 0.00;
    v_main_assets_unclassified numeric(15,2) := 0.00;
    v_main_assets_total numeric(15,2) := 0.00;
    
    v_main_liabilities_current numeric(15,2) := 0.00;
    v_main_liabilities_non_current numeric(15,2) := 0.00;
    v_main_liabilities_unclassified numeric(15,2) := 0.00;
    v_main_liabilities_total numeric(15,2) := 0.00;
    
    v_main_equity_total numeric(15,2) := 0.00;
    v_main_net_income numeric(15,2) := 0.00;
    v_main_total_equity_and_income numeric(15,2) := 0.00;
    v_main_check_difference numeric(15,2) := 0.00;
    
    -- Comparison period totals
    v_comp_assets_current numeric(15,2) := 0.00;
    v_comp_assets_non_current numeric(15,2) := 0.00;
    v_comp_assets_unclassified numeric(15,2) := 0.00;
    v_comp_assets_total numeric(15,2) := 0.00;
    
    v_comp_liabilities_current numeric(15,2) := 0.00;
    v_comp_liabilities_non_current numeric(15,2) := 0.00;
    v_comp_liabilities_unclassified numeric(15,2) := 0.00;
    v_comp_liabilities_total numeric(15,2) := 0.00;
    
    v_comp_equity_total numeric(15,2) := 0.00;
    v_comp_net_income numeric(15,2) := 0.00;
    v_comp_total_equity_and_income numeric(15,2) := 0.00;
    v_comp_check_difference numeric(15,2) := 0.00;
    
    -- Temporary variables for revenue/expense sums
    v_revenue_ytd numeric(15,2) := 0.00;
    v_expenses_ytd numeric(15,2) := 0.00;
    
    v_accounts_json jsonb;
    v_unclassified_count integer := 0;
BEGIN
    -- Auth role verification
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_view_financial_reports(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.';
    END IF;

    ---------------------------------------------------------
    -- MAIN PERIOD CALCULATIONS (As of p_as_of_date)
    ---------------------------------------------------------
    -- Find start of fiscal year containing p_as_of_date
    SELECT start_date
    INTO v_year_start
    FROM public.fiscal_years
    WHERE organization_id = p_org_id
      AND start_date <= p_as_of_date
      AND end_date >= p_as_of_date
    LIMIT 1;

    IF v_year_start IS NULL THEN
        v_year_start := date_trunc('year', p_as_of_date)::date;
    END IF;

    -- Calculate main YTD net income (Revenues - Expenses) from v_year_start to p_as_of_date
    -- revenues YTD (posted journal entry lines)
    SELECT COALESCE(SUM(l.credit - l.debit), 0.00)
    INTO v_revenue_ytd
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
    JOIN public.accounts a ON l.account_id = a.id AND a.organization_id = p_org_id
    WHERE je.organization_id = p_org_id
      AND je.status = 'posted'
      AND je.entry_date >= v_year_start
      AND je.entry_date <= p_as_of_date
      AND a.classification = 'revenue';

    -- expenses YTD (posted journal entry lines)
    SELECT COALESCE(SUM(l.debit - l.credit), 0.00)
    INTO v_expenses_ytd
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
    JOIN public.accounts a ON l.account_id = a.id AND a.organization_id = p_org_id
    WHERE je.organization_id = p_org_id
      AND je.status = 'posted'
      AND je.entry_date >= v_year_start
      AND je.entry_date <= p_as_of_date
      AND a.classification = 'expenses';

    v_main_net_income := v_revenue_ytd - v_expenses_ytd;

    -- Calculate main assets, liabilities, equity cumulative balances (all-time up to p_as_of_date)
    WITH main_posted_lines AS (
        SELECT
            l.account_id,
            l.debit,
            l.credit
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON je.id = l.journal_entry_id AND je.organization_id = l.organization_id
        WHERE l.organization_id = p_org_id
          AND je.status = 'posted'
          AND je.entry_date <= p_as_of_date
    ),
    main_account_balances AS (
        SELECT 
            a.id,
            a.classification,
            a.balance_sheet_section,
            COALESCE(SUM(pl.debit), 0.00) AS total_debit,
            COALESCE(SUM(pl.credit), 0.00) AS total_credit
        FROM public.accounts a
        LEFT JOIN main_posted_lines pl ON pl.account_id = a.id
        WHERE a.organization_id = p_org_id
          AND a.classification IN ('assets', 'liabilities', 'equity')
        GROUP BY a.id, a.classification, a.balance_sheet_section
    ),
    main_calculated AS (
        SELECT 
            classification,
            balance_sheet_section,
            CASE 
                WHEN classification = 'assets' THEN (total_debit - total_credit)
                ELSE (total_credit - total_debit)
            END AS net_amount
        FROM main_account_balances
    )
    SELECT
        COALESCE(SUM(CASE WHEN classification = 'assets' AND balance_sheet_section = 'current_asset' THEN net_amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN classification = 'assets' AND balance_sheet_section = 'non_current_asset' THEN net_amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN classification = 'assets' AND balance_sheet_section IS NULL THEN net_amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN classification = 'assets' THEN net_amount ELSE 0.00 END), 0.00),
        
        COALESCE(SUM(CASE WHEN classification = 'liabilities' AND balance_sheet_section = 'current_liability' THEN net_amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN classification = 'liabilities' AND balance_sheet_section = 'non_current_liability' THEN net_amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN classification = 'liabilities' AND balance_sheet_section IS NULL THEN net_amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN classification = 'liabilities' THEN net_amount ELSE 0.00 END), 0.00),
        
        COALESCE(SUM(CASE WHEN classification = 'equity' THEN net_amount ELSE 0.00 END), 0.00)
    INTO 
        v_main_assets_current, v_main_assets_non_current, v_main_assets_unclassified, v_main_assets_total,
        v_main_liabilities_current, v_main_liabilities_non_current, v_main_liabilities_unclassified, v_main_liabilities_total,
        v_main_equity_total
    FROM main_calculated;

    v_main_total_equity_and_income := v_main_equity_total + v_main_net_income;
    v_main_check_difference := v_main_assets_total - (v_main_liabilities_total + v_main_total_equity_and_income);


    ---------------------------------------------------------
    -- COMPARISON PERIOD CALCULATIONS (If p_comparison_date is provided)
    ---------------------------------------------------------
    IF p_comparison_date IS NOT NULL THEN
        -- Find start of fiscal year containing p_comparison_date
        SELECT start_date
        INTO v_comp_year_start
        FROM public.fiscal_years
        WHERE organization_id = p_org_id
          AND start_date <= p_comparison_date
          AND end_date >= p_comparison_date
        LIMIT 1;

        IF v_comp_year_start IS NULL THEN
            v_comp_year_start := date_trunc('year', p_comparison_date)::date;
        END IF;

        -- Calculate YTD net income for comparison period
        SELECT COALESCE(SUM(l.credit - l.debit), 0.00)
        INTO v_revenue_ytd
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
        JOIN public.accounts a ON l.account_id = a.id AND a.organization_id = p_org_id
        WHERE je.organization_id = p_org_id
          AND je.status = 'posted'
          AND je.entry_date >= v_comp_year_start
          AND je.entry_date <= p_comparison_date
          AND a.classification = 'revenue';

        SELECT COALESCE(SUM(l.debit - l.credit), 0.00)
        INTO v_expenses_ytd
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
        JOIN public.accounts a ON l.account_id = a.id AND a.organization_id = p_org_id
        WHERE je.organization_id = p_org_id
          AND je.status = 'posted'
          AND je.entry_date >= v_comp_year_start
          AND je.entry_date <= p_comparison_date
          AND a.classification = 'expenses';

        v_comp_net_income := v_revenue_ytd - v_expenses_ytd;

        -- Calculate comparison cumulative balances
        WITH comp_posted_lines AS (
            SELECT
                l.account_id,
                l.debit,
                l.credit
            FROM public.journal_entry_lines l
            JOIN public.journal_entries je ON je.id = l.journal_entry_id AND je.organization_id = l.organization_id
            WHERE l.organization_id = p_org_id
              AND je.status = 'posted'
              AND je.entry_date <= p_comparison_date
        ),
        comp_account_balances AS (
            SELECT 
                a.id,
                a.classification,
                a.balance_sheet_section,
                COALESCE(SUM(pl.debit), 0.00) AS total_debit,
                COALESCE(SUM(pl.credit), 0.00) AS total_credit
            FROM public.accounts a
            LEFT JOIN comp_posted_lines pl ON pl.account_id = a.id
            WHERE a.organization_id = p_org_id
              AND a.classification IN ('assets', 'liabilities', 'equity')
            GROUP BY a.id, a.classification, a.balance_sheet_section
        ),
        comp_calculated AS (
            SELECT 
                classification,
                balance_sheet_section,
                CASE 
                    WHEN classification = 'assets' THEN (total_debit - total_credit)
                    ELSE (total_credit - total_debit)
                END AS net_amount
            FROM comp_account_balances
        )
        SELECT
            COALESCE(SUM(CASE WHEN classification = 'assets' AND balance_sheet_section = 'current_asset' THEN net_amount ELSE 0.00 END), 0.00),
            COALESCE(SUM(CASE WHEN classification = 'assets' AND balance_sheet_section = 'non_current_asset' THEN net_amount ELSE 0.00 END), 0.00),
            COALESCE(SUM(CASE WHEN classification = 'assets' AND balance_sheet_section IS NULL THEN net_amount ELSE 0.00 END), 0.00),
            COALESCE(SUM(CASE WHEN classification = 'assets' THEN net_amount ELSE 0.00 END), 0.00),
            
            COALESCE(SUM(CASE WHEN classification = 'liabilities' AND balance_sheet_section = 'current_liability' THEN net_amount ELSE 0.00 END), 0.00),
            COALESCE(SUM(CASE WHEN classification = 'liabilities' AND balance_sheet_section = 'non_current_liability' THEN net_amount ELSE 0.00 END), 0.00),
            COALESCE(SUM(CASE WHEN classification = 'liabilities' AND balance_sheet_section IS NULL THEN net_amount ELSE 0.00 END), 0.00),
            COALESCE(SUM(CASE WHEN classification = 'liabilities' THEN net_amount ELSE 0.00 END), 0.00),
            
            COALESCE(SUM(CASE WHEN classification = 'equity' THEN net_amount ELSE 0.00 END), 0.00)
        INTO 
            v_comp_assets_current, v_comp_assets_non_current, v_comp_assets_unclassified, v_comp_assets_total,
            v_comp_liabilities_current, v_comp_liabilities_non_current, v_comp_liabilities_unclassified, v_comp_liabilities_total,
            v_comp_equity_total
        FROM comp_calculated;

        v_comp_total_equity_and_income := v_comp_equity_total + v_comp_net_income;
        v_comp_check_difference := v_comp_assets_total - (v_comp_liabilities_total + v_comp_total_equity_and_income);
    END IF;


    ---------------------------------------------------------
    -- ACCOUNTS BREAKDOWN (Include both main and comp amounts)
    ---------------------------------------------------------
    -- We want only accounts that are active OR have a non-zero balance in either period
    WITH main_posted AS (
        SELECT
            l.account_id,
            COALESCE(SUM(l.debit), 0.00) AS total_debit,
            COALESCE(SUM(l.credit), 0.00) AS total_credit
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON je.id = l.journal_entry_id AND je.organization_id = l.organization_id
        WHERE l.organization_id = p_org_id
          AND je.status = 'posted'
          AND je.entry_date <= p_as_of_date
        GROUP BY l.account_id
    ),
    comp_posted AS (
        SELECT
            l.account_id,
            COALESCE(SUM(l.debit), 0.00) AS total_debit,
            COALESCE(SUM(l.credit), 0.00) AS total_credit
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON je.id = l.journal_entry_id AND je.organization_id = l.organization_id
        WHERE l.organization_id = p_org_id
          AND je.status = 'posted'
          AND p_comparison_date IS NOT NULL
          AND je.entry_date <= p_comparison_date
        GROUP BY l.account_id
    ),
    account_balances AS (
        SELECT 
            a.id,
            a.code,
            a.name_ar,
            a.name_en,
            a.classification,
            a.balance_sheet_section,
            CASE 
                WHEN a.classification = 'assets' THEN (COALESCE(m.total_debit, 0.00) - COALESCE(m.total_credit, 0.00))
                ELSE (COALESCE(m.total_credit, 0.00) - COALESCE(m.total_debit, 0.00))
            END AS main_net,
            CASE 
                WHEN p_comparison_date IS NOT NULL THEN
                    CASE 
                        WHEN a.classification = 'assets' THEN (COALESCE(c.total_debit, 0.00) - COALESCE(c.total_credit, 0.00))
                        ELSE (COALESCE(c.total_credit, 0.00) - COALESCE(c.total_debit, 0.00))
                    END
                ELSE 0.00
            END AS comp_net
        FROM public.accounts a
        LEFT JOIN main_posted m ON m.account_id = a.id
        LEFT JOIN comp_posted c ON c.account_id = a.id
        WHERE a.organization_id = p_org_id
          AND a.classification IN ('assets', 'liabilities', 'equity')
    ),
    filtered_accounts AS (
        SELECT *
        FROM account_balances
        WHERE main_net <> 0.00 OR comp_net <> 0.00
        ORDER BY code ASC
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'account_id', id,
        'account_code', code,
        'account_name_ar', name_ar,
        'account_name_en', name_en,
        'classification', classification,
        'balance_sheet_section', balance_sheet_section,
        'amount', main_net,
        'comparison_amount', comp_net
    )), '[]'::jsonb)
    INTO v_accounts_json
    FROM filtered_accounts;

    -- Count unclassified active accounts that have transactions
    SELECT COUNT(*)
    INTO v_unclassified_count
    FROM public.accounts a
    WHERE a.organization_id = p_org_id
      AND a.is_active = true
      AND a.classification IN ('assets', 'liabilities')
      AND a.balance_sheet_section IS NULL;

    RETURN jsonb_build_object(
        'as_of_date', p_as_of_date,
        'comparison_date', p_comparison_date,
        'unclassified_accounts_count', v_unclassified_count,
        'main_period', jsonb_build_object(
            'assets_current', v_main_assets_current,
            'assets_non_current', v_main_assets_non_current,
            'assets_unclassified', v_main_assets_unclassified,
            'total_assets', v_main_assets_total,
            'liabilities_current', v_main_liabilities_current,
            'liabilities_non_current', v_main_liabilities_non_current,
            'liabilities_unclassified', v_main_liabilities_unclassified,
            'total_liabilities', v_main_liabilities_total,
            'equity', v_main_equity_total,
            'current_year_net_income', v_main_net_income,
            'total_equity_and_income', v_main_total_equity_and_income,
            'check_difference', v_main_check_difference
        ),
        'comparison_period', CASE 
            WHEN p_comparison_date IS NOT NULL THEN jsonb_build_object(
                'assets_current', v_comp_assets_current,
                'assets_non_current', v_comp_assets_non_current,
                'assets_unclassified', v_comp_assets_unclassified,
                'total_assets', v_comp_assets_total,
                'liabilities_current', v_comp_liabilities_current,
                'liabilities_non_current', v_comp_liabilities_non_current,
                'liabilities_unclassified', v_comp_liabilities_unclassified,
                'total_liabilities', v_comp_liabilities_total,
                'equity', v_comp_equity_total,
                'current_year_net_income', v_comp_net_income,
                'total_equity_and_income', v_comp_total_equity_and_income,
                'check_difference', v_comp_check_difference
            )
            ELSE NULL
        END,
        'accounts', v_accounts_json
    );
END;
$$;

-- Secure grants for the advanced Balance Sheet RPC
REVOKE ALL ON FUNCTION public.get_advanced_balance_sheet(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_advanced_balance_sheet(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_advanced_balance_sheet(uuid, date, date) TO authenticated;

COMMIT;
