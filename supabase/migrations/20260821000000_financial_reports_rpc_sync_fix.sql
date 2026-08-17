-- ==========================================================
-- LEDGRA: FINANCIAL REPORTS RPC SYNCHRONIZATION & POSTGREST CACHE RELOAD
-- Migration: 20260821000000_financial_reports_rpc_sync_fix.sql
-- ==========================================================

BEGIN;

-- 0. Ensure schema prerequisites for balance sheet sections
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS balance_sheet_section text;
ALTER TABLE public.coa_templates ADD COLUMN IF NOT EXISTS balance_sheet_section text;

-- 1. Helper function: can_view_financial_reports
CREATE OR REPLACE FUNCTION public.can_view_financial_reports(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.profile_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'accountant', 'viewer')
      AND COALESCE(om.is_active, true) = true
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_financial_reports(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_financial_reports(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_financial_reports(uuid) TO authenticated;


-- 2. Advanced Balance Sheet RPC (قائمة المركز المالي المتقدمة)
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

    -- Calculate main assets, liabilities, equity cumulative balances
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

REVOKE ALL ON FUNCTION public.get_advanced_balance_sheet(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_advanced_balance_sheet(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_advanced_balance_sheet(uuid, date, date) TO authenticated;


-- 3. Advanced Income Statement RPC (قائمة الدخل المتقدمة)
CREATE OR REPLACE FUNCTION public.get_income_statement_advanced(
  p_org_id uuid,
  p_date_from date,
  p_date_to date,
  p_exclude_closing_entries boolean default true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_revenue numeric(15,2) := 0.00;
    v_cogs numeric(15,2) := 0.00;
    v_expenses numeric(15,2) := 0.00;
    v_gross_profit numeric(15,2) := 0.00;
    v_net_income numeric(15,2) := 0.00;
    v_revenue_array jsonb := '[]'::jsonb;
    v_cogs_array jsonb := '[]'::jsonb;
    v_expense_array jsonb := '[]'::jsonb;
BEGIN
    -- Auth role verification
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_view_financial_reports(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.';
    END IF;

    -- Aggregate revenues, COGS and general expenses
    WITH account_sums AS (
        SELECT 
            a.id,
            a.code,
            a.name_ar,
            a.name_en,
            a.classification,
            CASE 
                WHEN a.code LIKE '511%' 
                     OR a.id = (SELECT s.default_cogs_account_id FROM public.accounting_settings s WHERE s.organization_id = p_org_id LIMIT 1)
                     OR a.id IN (SELECT distinct i.cogs_account_id FROM public.items i WHERE i.organization_id = p_org_id AND i.cogs_account_id IS NOT NULL)
                THEN true 
                ELSE false 
            END AS is_cogs,
            COALESCE(SUM(l.debit), 0.00) AS total_debit,
            COALESCE(SUM(l.credit), 0.00) AS total_credit
        FROM public.accounts a
        JOIN public.journal_entry_lines l ON l.account_id = a.id AND l.organization_id = p_org_id
        JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
        WHERE a.organization_id = p_org_id
          AND a.classification IN ('revenue', 'expenses')
          AND je.status = 'posted'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
          AND (
              NOT p_exclude_closing_entries 
              OR je.reference IS NULL 
              OR NOT (je.reference LIKE 'YEAR-CLOSE%')
          )
        GROUP BY a.id, a.code, a.name_ar, a.name_en, a.classification
    ),
    calculated_amounts AS (
        SELECT 
            id,
            code,
            name_ar,
            name_en,
            classification,
            is_cogs,
            CASE 
                WHEN classification = 'revenue' THEN (total_credit - total_debit)
                ELSE (total_debit - total_credit)
            END AS net_amount
        FROM account_sums
    )
    SELECT
        COALESCE(SUM(CASE WHEN classification = 'revenue' THEN net_amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN classification = 'expenses' AND is_cogs = true THEN net_amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN classification = 'expenses' AND is_cogs = false THEN net_amount ELSE 0.00 END), 0.00)
    INTO v_revenue, v_cogs, v_expenses
    FROM calculated_amounts;

    v_gross_profit := v_revenue - v_cogs;
    v_net_income := v_gross_profit - v_expenses;

    -- 1. Build revenue accounts array
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'account_id', id,
        'code', code,
        'name_ar', name_ar,
        'name_en', name_en,
        'amount', net_amount
    ) ORDER BY code ASC), '[]'::jsonb)
    INTO v_revenue_array
    FROM (
        SELECT id, code, name_ar, name_en, 
               CASE WHEN classification = 'revenue' THEN (total_credit - total_debit) ELSE 0.00 END as net_amount
        FROM (
            SELECT 
                a.id,
                a.code,
                a.name_ar,
                a.name_en,
                a.classification,
                COALESCE(SUM(l.debit), 0.00) AS total_debit,
                COALESCE(SUM(l.credit), 0.00) AS total_credit
            FROM public.accounts a
            JOIN public.journal_entry_lines l ON l.account_id = a.id AND l.organization_id = p_org_id
            JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
            WHERE a.organization_id = p_org_id
              AND a.classification = 'revenue'
              AND je.status = 'posted'
              AND je.entry_date >= p_date_from
              AND je.entry_date <= p_date_to
              AND (
                  NOT p_exclude_closing_entries 
                  OR je.reference IS NULL 
                  OR NOT (je.reference LIKE 'YEAR-CLOSE%')
              )
            GROUP BY a.id, a.code, a.name_ar, a.name_en, a.classification
        ) x
        WHERE (total_credit - total_debit) <> 0.00
    ) sub;

    -- 2. Build COGS accounts array
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'account_id', id,
        'code', code,
        'name_ar', name_ar,
        'name_en', name_en,
        'amount', net_amount
    ) ORDER BY code ASC), '[]'::jsonb)
    INTO v_cogs_array
    FROM (
        SELECT id, code, name_ar, name_en, 
               CASE WHEN classification = 'expenses' THEN (total_debit - total_credit) ELSE 0.00 END as net_amount
        FROM (
            SELECT 
                a.id,
                a.code,
                a.name_ar,
                a.name_en,
                a.classification,
                COALESCE(SUM(l.debit), 0.00) AS total_debit,
                COALESCE(SUM(l.credit), 0.00) AS total_credit
            FROM public.accounts a
            JOIN public.journal_entry_lines l ON l.account_id = a.id AND l.organization_id = p_org_id
            JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
            WHERE a.organization_id = p_org_id
              AND a.classification = 'expenses'
              AND (
                  a.code LIKE '511%' 
                  OR a.id = (SELECT s.default_cogs_account_id FROM public.accounting_settings s WHERE s.organization_id = p_org_id LIMIT 1)
                  OR a.id IN (SELECT distinct i.cogs_account_id FROM public.items i WHERE i.organization_id = p_org_id AND i.cogs_account_id IS NOT NULL)
              )
              AND je.status = 'posted'
              AND je.entry_date >= p_date_from
              AND je.entry_date <= p_date_to
              AND (
                  NOT p_exclude_closing_entries 
                  OR je.reference IS NULL 
                  OR NOT (je.reference LIKE 'YEAR-CLOSE%')
              )
            GROUP BY a.id, a.code, a.name_ar, a.name_en, a.classification
        ) x
        WHERE (total_debit - total_credit) <> 0.00
    ) sub;

    -- 3. Build other expense accounts array
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'account_id', id,
        'code', code,
        'name_ar', name_ar,
        'name_en', name_en,
        'amount', net_amount
    ) ORDER BY code ASC), '[]'::jsonb)
    INTO v_expense_array
    FROM (
        SELECT id, code, name_ar, name_en, 
               CASE WHEN classification = 'expenses' THEN (total_debit - total_credit) ELSE 0.00 END as net_amount
        FROM (
            SELECT 
                a.id,
                a.code,
                a.name_ar,
                a.name_en,
                a.classification,
                COALESCE(SUM(l.debit), 0.00) AS total_debit,
                COALESCE(SUM(l.credit), 0.00) AS total_credit
            FROM public.accounts a
            JOIN public.journal_entry_lines l ON l.account_id = a.id AND l.organization_id = p_org_id
            JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
            WHERE a.organization_id = p_org_id
              AND a.classification = 'expenses'
              AND NOT (
                  a.code LIKE '511%' 
                  OR a.id = (SELECT s.default_cogs_account_id FROM public.accounting_settings s WHERE s.organization_id = p_org_id LIMIT 1)
                  OR a.id IN (SELECT distinct i.cogs_account_id FROM public.items i WHERE i.organization_id = p_org_id AND i.cogs_account_id IS NOT NULL)
              )
              AND je.status = 'posted'
              AND je.entry_date >= p_date_from
              AND je.entry_date <= p_date_to
              AND (
                  NOT p_exclude_closing_entries 
                  OR je.reference IS NULL 
                  OR NOT (je.reference LIKE 'YEAR-CLOSE%')
              )
            GROUP BY a.id, a.code, a.name_ar, a.name_en, a.classification
        ) x
        WHERE (total_debit - total_credit) <> 0.00
    ) sub;

    RETURN jsonb_build_object(
        'date_from', p_date_from,
        'date_to', p_date_to,
        'total_revenue', v_revenue,
        'total_cogs', v_cogs,
        'gross_profit', v_gross_profit,
        'total_expenses', v_expenses,
        'net_income', v_net_income,
        'revenue_accounts', v_revenue_array,
        'cogs_accounts', v_cogs_array,
        'expense_accounts', v_expense_array
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_income_statement_advanced(uuid, date, date, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_income_statement_advanced(uuid, date, date, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_income_statement_advanced(uuid, date, date, boolean) TO authenticated;


-- 4. Advanced Trial Balance RPC (ميزان المراجعة المتقدم)
CREATE OR REPLACE FUNCTION public.get_trial_balance_advanced(
  p_org_id uuid,
  p_date_from date,
  p_date_to date,
  p_include_zero_accounts boolean,
  p_include_parent_accounts boolean,
  p_exclude_closing_entries boolean,
  p_fiscal_year_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_fy_start date;
    v_fy_end date;
    v_accounts_array jsonb := '[]'::jsonb;
    v_tot_op_debit numeric(15,2) := 0.00;
    v_tot_op_credit numeric(15,2) := 0.00;
    v_tot_pd_debit numeric(15,2) := 0.00;
    v_tot_pd_credit numeric(15,2) := 0.00;
    v_tot_cl_debit numeric(15,2) := 0.00;
    v_tot_cl_credit numeric(15,2) := 0.00;
    v_period_difference numeric(15,2) := 0.00;
    v_closing_difference numeric(15,2) := 0.00;
    v_is_period_balanced boolean := true;
    v_is_closing_balanced boolean := true;
    v_is_balanced boolean := true;
BEGIN
    -- Auth verification
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_view_financial_reports(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.';
    END IF;

    -- Mandatory Fiscal Year check
    IF p_fiscal_year_id IS NULL THEN
        RAISE EXCEPTION 'السنة المالية حقل إجباري ولا يمكن أن يكون فارغاً.';
    END IF;

    -- Date order validation
    IF p_date_from > p_date_to THEN
        RAISE EXCEPTION 'تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية (الفترة معكوسة غير صالحة).';
    END IF;

    -- Validate that Fiscal Year exists and belongs to the organization
    SELECT start_date, end_date
    INTO v_fy_start, v_fy_end
    FROM public.fiscal_years
    WHERE id = p_fiscal_year_id AND organization_id = p_org_id;

    IF v_fy_start IS NULL THEN
        RAISE EXCEPTION 'السنة المالية المحددة غير موجودة أو لا تتبع لهذه المنشأة.';
    END IF;

    -- Date bounding check against fiscal year
    IF p_date_from < v_fy_start OR p_date_to > v_fy_end THEN
        RAISE EXCEPTION 'تواريخ التقرير يجب أن تقع بالكامل داخل نطاق السنة المالية المحددة (% إلى %).', v_fy_start, v_fy_end;
    END IF;

    -- Build aggregated account balances
    WITH RECURSIVE leaf_and_parent_accounts AS (
        SELECT 
            a.id,
            a.code,
            a.name_ar,
            a.name_en,
            a.classification,
            a.nature,
            a.parent_id,
            a.allow_direct_posting,
            EXISTS(SELECT 1 FROM public.accounts c WHERE c.parent_id = a.id AND c.organization_id = p_org_id) AS is_parent
        FROM public.accounts a
        WHERE a.organization_id = p_org_id
    ),
    opening_movements AS (
        SELECT 
            l.account_id,
            COALESCE(SUM(l.debit), 0.00) AS op_debit,
            COALESCE(SUM(l.credit), 0.00) AS op_credit
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON je.id = l.journal_entry_id AND je.organization_id = l.organization_id
        JOIN public.accounts a ON a.id = l.account_id AND a.organization_id = l.organization_id
        WHERE l.organization_id = p_org_id
          AND je.status = 'posted'
          AND (
              (a.classification IN ('assets', 'liabilities', 'equity') AND je.entry_date < p_date_from)
              OR
              (a.classification IN ('revenue', 'expenses') AND je.entry_date >= v_fy_start AND je.entry_date < p_date_from)
          )
          AND (
              NOT p_exclude_closing_entries 
              OR je.reference IS NULL 
              OR NOT (je.reference LIKE 'YEAR-CLOSE%')
          )
        GROUP BY l.account_id
    ),
    period_movements AS (
        SELECT 
            l.account_id,
            COALESCE(SUM(l.debit), 0.00) AS pd_debit,
            COALESCE(SUM(l.credit), 0.00) AS pd_credit
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON je.id = l.journal_entry_id AND je.organization_id = l.organization_id
        WHERE l.organization_id = p_org_id
          AND je.status = 'posted'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
          AND (
              NOT p_exclude_closing_entries 
              OR je.reference IS NULL 
              OR NOT (je.reference LIKE 'YEAR-CLOSE%')
          )
        GROUP BY l.account_id
    ),
    leaf_calculated AS (
        SELECT 
            acc.id,
            acc.code,
            acc.name_ar,
            acc.name_en,
            acc.classification,
            acc.nature,
            acc.parent_id,
            acc.is_parent,
            acc.allow_direct_posting,
            
            -- Opening signed net
            (COALESCE(op.op_debit, 0.00) - COALESCE(op.op_credit, 0.00)) AS raw_op_net,
            -- Period debits and credits
            COALESCE(pm.pd_debit, 0.00) AS pd_debit,
            COALESCE(pm.pd_credit, 0.00) AS pd_credit,
            -- Closing signed net = raw_op_net + pd_debit - pd_credit
            ((COALESCE(op.op_debit, 0.00) - COALESCE(op.op_credit, 0.00)) + COALESCE(pm.pd_debit, 0.00) - COALESCE(pm.pd_credit, 0.00)) AS raw_cl_net
        FROM leaf_and_parent_accounts acc
        LEFT JOIN opening_movements op ON op.account_id = acc.id
        LEFT JOIN period_movements pm ON pm.account_id = acc.id
    ),
    formatted_accounts AS (
        SELECT
            id,
            code,
            name_ar,
            name_en,
            classification,
            nature,
            parent_id,
            is_parent,
            allow_direct_posting,
            
            -- Opening Debit/Credit format
            CASE WHEN raw_op_net > 0 THEN raw_op_net ELSE 0.00 END AS op_debit,
            CASE WHEN raw_op_net < 0 THEN ABS(raw_op_net) ELSE 0.00 END AS op_credit,
            
            -- Period Debit/Credit format
            pd_debit,
            pd_credit,
            
            -- Closing Debit/Credit format
            CASE WHEN raw_cl_net > 0 THEN raw_cl_net ELSE 0.00 END AS cl_debit,
            CASE WHEN raw_cl_net < 0 THEN ABS(raw_cl_net) ELSE 0.00 END AS cl_credit,

            -- Activity marker
            (raw_op_net <> 0.00 OR pd_debit <> 0.00 OR pd_credit <> 0.00 OR raw_cl_net <> 0.00) AS has_activity
        FROM leaf_calculated
    ),
    filtered_accounts AS (
        SELECT *
        FROM formatted_accounts
        WHERE 
            (p_include_parent_accounts = true OR is_parent = false)
            AND
            (p_include_zero_accounts = true OR has_activity = true)
        ORDER BY code ASC
    )
    SELECT 
        COALESCE(jsonb_agg(jsonb_build_object(
            'account_id', id,
            'code', code,
            'name_ar', name_ar,
            'name_en', name_en,
            'classification', classification,
            'nature', nature,
            'is_parent', is_parent,
            'opening_debit', op_debit,
            'opening_credit', op_credit,
            'period_debit', pd_debit,
            'period_credit', pd_credit,
            'closing_debit', cl_debit,
            'closing_credit', cl_credit
        ) ORDER BY code ASC), '[]'::jsonb)
    INTO v_accounts_array
    FROM filtered_accounts;

    -- Calculate Totals strictly across leaf (direct posting) accounts to prevent double-counting
    WITH leaf_totals AS (
        SELECT 
            SUM(CASE WHEN raw_op_net > 0 THEN raw_op_net ELSE 0.00 END) AS tot_op_deb,
            SUM(CASE WHEN raw_op_net < 0 THEN ABS(raw_op_net) ELSE 0.00 END) AS tot_op_crd,
            SUM(pd_debit) AS tot_pd_deb,
            SUM(pd_credit) AS tot_pd_crd,
            SUM(CASE WHEN raw_cl_net > 0 THEN raw_cl_net ELSE 0.00 END) AS tot_cl_deb,
            SUM(CASE WHEN raw_cl_net < 0 THEN ABS(raw_cl_net) ELSE 0.00 END) AS tot_cl_crd
        FROM (
            SELECT 
                acc.id,
                (COALESCE(op.op_debit, 0.00) - COALESCE(op.op_credit, 0.00)) AS raw_op_net,
                COALESCE(pm.pd_debit, 0.00) AS pd_debit,
                COALESCE(pm.pd_credit, 0.00) AS pd_credit,
                ((COALESCE(op.op_debit, 0.00) - COALESCE(op.op_credit, 0.00)) + COALESCE(pm.pd_debit, 0.00) - COALESCE(pm.pd_credit, 0.00)) AS raw_cl_net
            FROM leaf_and_parent_accounts acc
            LEFT JOIN opening_movements op ON op.account_id = acc.id
            LEFT JOIN period_movements pm ON pm.account_id = acc.id
            WHERE acc.is_parent = false
        ) leafs
    )
    SELECT 
        COALESCE(tot_op_deb, 0.00),
        COALESCE(tot_op_crd, 0.00),
        COALESCE(tot_pd_deb, 0.00),
        COALESCE(tot_pd_crd, 0.00),
        COALESCE(tot_cl_deb, 0.00),
        COALESCE(tot_cl_crd, 0.00)
    INTO 
        v_tot_op_debit,
        v_tot_op_credit,
        v_tot_pd_debit,
        v_tot_pd_credit,
        v_tot_cl_debit,
        v_tot_cl_credit
    FROM leaf_totals;

    v_period_difference := v_tot_pd_debit - v_tot_pd_credit;
    v_closing_difference := v_tot_cl_debit - v_tot_cl_credit;
    
    v_is_period_balanced := (ABS(v_period_difference) <= 0.01);
    v_is_closing_balanced := (ABS(v_closing_difference) <= 0.01);
    v_is_balanced := (v_is_period_balanced AND v_is_closing_balanced);

    RETURN jsonb_build_object(
        'date_from', p_date_from,
        'date_to', p_date_to,
        'fiscal_year_id', p_fiscal_year_id,
        'fiscal_year_start', v_fy_start,
        'fiscal_year_end', v_fy_end,
        'total_opening_debit', v_tot_op_debit,
        'total_opening_credit', v_tot_op_credit,
        'total_period_debit', v_tot_pd_debit,
        'total_period_credit', v_tot_pd_credit,
        'total_closing_debit', v_tot_cl_debit,
        'total_closing_credit', v_tot_cl_credit,
        'period_difference', v_period_difference,
        'closing_difference', v_closing_difference,
        'is_period_balanced', v_is_period_balanced,
        'is_closing_balanced', v_is_closing_balanced,
        'is_balanced', v_is_balanced,
        'accounts', v_accounts_array
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_trial_balance_advanced(uuid, date, date, boolean, boolean, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_trial_balance_advanced(uuid, date, date, boolean, boolean, boolean, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_trial_balance_advanced(uuid, date, date, boolean, boolean, boolean, uuid) TO authenticated;


-- 5. Advanced Ledger Report RPC (تقرير دفتر الأستاذ المتقدم)
CREATE OR REPLACE FUNCTION public.get_ledger_report_advanced(
  p_org_id uuid,
  p_account_id uuid,
  p_date_from date,
  p_date_to date,
  p_exclude_closing_entries boolean,
  p_fiscal_year_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_fy_start date;
    v_fy_end date;
    v_account_code text;
    v_account_name_ar text;
    v_account_name_en text;
    v_classification text;
    v_nature text;
    v_opening_balance numeric(15,2) := 0.00;
    v_opening_debit numeric(15,2) := 0.00;
    v_opening_credit numeric(15,2) := 0.00;
    v_period_debit numeric(15,2) := 0.00;
    v_period_credit numeric(15,2) := 0.00;
    v_closing_balance numeric(15,2) := 0.00;
    v_closing_debit numeric(15,2) := 0.00;
    v_closing_credit numeric(15,2) := 0.00;
    v_entries_array jsonb := '[]'::jsonb;
BEGIN
    -- Auth role verification
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_view_financial_reports(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.';
    END IF;

    -- Mandatory Fiscal Year check
    IF p_fiscal_year_id IS NULL THEN
        RAISE EXCEPTION 'السنة المالية حقل إجباري ولا يمكن أن يكون فارغاً.';
    END IF;

    -- Date order validation
    IF p_date_from > p_date_to THEN
        RAISE EXCEPTION 'تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية (الفترة معكوسة غير صالحة).';
    END IF;

    -- Validate Fiscal Year
    SELECT start_date, end_date
    INTO v_fy_start, v_fy_end
    FROM public.fiscal_years
    WHERE id = p_fiscal_year_id AND organization_id = p_org_id;

    IF v_fy_start IS NULL THEN
        RAISE EXCEPTION 'السنة المالية المحددة غير موجودة أو لا تتبع لهذه المنشأة.';
    END IF;

    IF p_date_from < v_fy_start OR p_date_to > v_fy_end THEN
        RAISE EXCEPTION 'تواريخ التقرير يجب أن تقع بالكامل داخل نطاق السنة المالية المحددة (% إلى %).', v_fy_start, v_fy_end;
    END IF;

    -- Validate and fetch Account Info
    SELECT code, name_ar, name_en, classification, nature
    INTO v_account_code, v_account_name_ar, v_account_name_en, v_classification, v_nature
    FROM public.accounts
    WHERE id = p_account_id AND organization_id = p_org_id;

    IF v_account_code IS NULL THEN
        RAISE EXCEPTION 'الحساب المحدد غير موجود أو لا يتبع لهذه المنشأة.';
    END IF;

    -- Calculate Opening Balance (Net Debit - Credit)
    SELECT 
        COALESCE(SUM(l.debit), 0.00),
        COALESCE(SUM(l.credit), 0.00)
    INTO 
        v_opening_debit,
        v_opening_credit
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON je.id = l.journal_entry_id AND je.organization_id = l.organization_id
    WHERE l.organization_id = p_org_id
      AND l.account_id = p_account_id
      AND je.status = 'posted'
      AND (
          (v_classification IN ('assets', 'liabilities', 'equity') AND je.entry_date < p_date_from)
          OR
          (v_classification IN ('revenue', 'expenses') AND je.entry_date >= v_fy_start AND je.entry_date < p_date_from)
      )
      AND (
          NOT p_exclude_closing_entries 
          OR je.reference IS NULL 
          OR NOT (je.reference LIKE 'YEAR-CLOSE%')
      );

    v_opening_balance := (v_opening_debit - v_opening_credit);

    -- Calculate Period Totals and Period Entries with Deterministic Sort Order
    WITH period_lines AS (
        SELECT 
            je.id AS entry_id,
            je.entry_number,
            je.entry_date,
            je.created_at,
            je.reference,
            je.description AS entry_description,
            l.id AS line_id,
            l.description AS line_description,
            l.debit,
            l.credit
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON je.id = l.journal_entry_id AND je.organization_id = l.organization_id
        WHERE l.organization_id = p_org_id
          AND l.account_id = p_account_id
          AND je.status = 'posted'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
          AND (
              NOT p_exclude_closing_entries 
              OR je.reference IS NULL 
              OR NOT (je.reference LIKE 'YEAR-CLOSE%')
          )
        ORDER BY je.entry_date ASC, je.created_at ASC, je.entry_number ASC, l.id ASC
    ),
    cumulative_lines AS (
        SELECT 
            entry_id,
            entry_number,
            entry_date,
            created_at,
            reference,
            entry_description,
            line_id,
            line_description,
            debit,
            credit,
            (v_opening_balance + SUM(debit - credit) OVER (
                ORDER BY entry_date ASC, created_at ASC, entry_number ASC, line_id ASC
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )) AS running_balance
        FROM period_lines
    )
    SELECT 
        COALESCE(jsonb_agg(jsonb_build_object(
            'entry_id', entry_id,
            'entry_number', entry_number,
            'entry_date', entry_date,
            'reference', reference,
            'description', COALESCE(line_description, entry_description),
            'debit', debit,
            'credit', credit,
            'running_balance', running_balance
        )), '[]'::jsonb),
        COALESCE(SUM(debit), 0.00),
        COALESCE(SUM(credit), 0.00)
    INTO 
        v_entries_array,
        v_period_debit,
        v_period_credit
    FROM cumulative_lines;

    v_closing_balance := (v_opening_balance + v_period_debit - v_period_credit);

    RETURN jsonb_build_object(
        'account_id', p_account_id,
        'account_code', v_account_code,
        'account_name_ar', v_account_name_ar,
        'account_name_en', v_account_name_en,
        'classification', v_classification,
        'nature', v_nature,
        'fiscal_year_id', p_fiscal_year_id,
        'fiscal_year_start', v_fy_start,
        'fiscal_year_end', v_fy_end,
        'date_from', p_date_from,
        'date_to', p_date_to,
        'opening_balance', v_opening_balance,
        'period_debit', v_period_debit,
        'period_credit', v_period_credit,
        'closing_balance', v_closing_balance,
        'entries', v_entries_array
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ledger_report_advanced(uuid, uuid, date, date, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ledger_report_advanced(uuid, uuid, date, date, boolean, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ledger_report_advanced(uuid, uuid, date, date, boolean, uuid) TO authenticated;


-- 6. Tax Report RPC (التقرير الضريبي لضريبة القيمة المضافة)
CREATE OR REPLACE FUNCTION public.get_tax_report(
  p_org_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_output_tax_acc uuid;
    v_input_tax_acc uuid;
    v_total_output numeric(15,2) := 0.00;
    v_total_input numeric(15,2) := 0.00;
    v_net_due numeric(15,2) := 0.00;
    v_output_movements jsonb := '[]'::jsonb;
    v_input_movements jsonb := '[]'::jsonb;
BEGIN
    -- Auth role verification
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_view_financial_reports(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.';
    END IF;

    -- Fetch configured tax accounts from accounting_settings
    SELECT default_tax_output_account_id, default_tax_input_account_id
    INTO v_output_tax_acc, v_input_tax_acc
    FROM public.accounting_settings
    WHERE organization_id = p_org_id
    LIMIT 1;

    -- Fallback search by standard code/classification if null in settings
    IF v_output_tax_acc IS NULL THEN
        SELECT id INTO v_output_tax_acc
        FROM public.accounts
        WHERE organization_id = p_org_id
          AND classification = 'liabilities'
          AND (code LIKE '2105%' OR code LIKE '2103%' OR name_ar LIKE '%مخرجات%' OR name_ar LIKE '%ضريبة القيمة المضافة%')
        ORDER BY code ASC
        LIMIT 1;
    END IF;

    IF v_input_tax_acc IS NULL THEN
        SELECT id INTO v_input_tax_acc
        FROM public.accounts
        WHERE organization_id = p_org_id
          AND classification = 'assets'
          AND (code LIKE '1106%' OR code LIKE '1105%' OR name_ar LIKE '%مدخلات%' OR name_ar LIKE '%ضريبة المدخلات%')
        ORDER BY code ASC
        LIMIT 1;
    END IF;

    -- Calculate total output tax (collected on sales)
    IF v_output_tax_acc IS NOT NULL THEN
        SELECT COALESCE(SUM(l.credit - l.debit), 0.00)
        INTO v_total_output
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = l.organization_id
        WHERE l.organization_id = p_org_id
          AND l.account_id = v_output_tax_acc
          AND je.status = 'posted'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
          AND (je.reference IS NULL OR NOT (je.reference LIKE 'YEAR-CLOSE%'));

        -- Fetch detailed output tax movements
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'date', je.entry_date::text,
            'reference', je.reference,
            'description', je.description,
            'debit', l.debit,
            'credit', l.credit,
            'net_amount', (l.credit - l.debit)
        ) ORDER BY je.entry_date ASC, je.created_at ASC), '[]'::jsonb)
        INTO v_output_movements
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = l.organization_id
        WHERE l.organization_id = p_org_id
          AND l.account_id = v_output_tax_acc
          AND je.status = 'posted'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
          AND (je.reference IS NULL OR NOT (je.reference LIKE 'YEAR-CLOSE%'));
    END IF;

    -- Calculate total input tax (paid on purchases)
    IF v_input_tax_acc IS NOT NULL THEN
        SELECT COALESCE(SUM(l.debit - l.credit), 0.00)
        INTO v_total_input
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = l.organization_id
        WHERE l.organization_id = p_org_id
          AND l.account_id = v_input_tax_acc
          AND je.status = 'posted'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
          AND (je.reference IS NULL OR NOT (je.reference LIKE 'YEAR-CLOSE%'));

        -- Fetch detailed input tax movements
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'date', je.entry_date::text,
            'reference', je.reference,
            'description', je.description,
            'debit', l.debit,
            'credit', l.credit,
            'net_amount', (l.debit - l.credit)
        ) ORDER BY je.entry_date ASC, je.created_at ASC), '[]'::jsonb)
        INTO v_input_movements
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = l.organization_id
        WHERE l.organization_id = p_org_id
          AND l.account_id = v_input_tax_acc
          AND je.status = 'posted'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
          AND (je.reference IS NULL OR NOT (je.reference LIKE 'YEAR-CLOSE%'));
    END IF;

    -- Net tax due to tax authority = Output tax - Input tax
    v_net_due := v_total_output - v_total_input;

    RETURN jsonb_build_object(
        'date_from', p_date_from,
        'date_to', p_date_to,
        'output_tax_account_id', v_output_tax_acc,
        'input_tax_account_id', v_input_tax_acc,
        'total_output_tax', v_total_output,
        'total_input_tax', v_total_input,
        'net_tax_due', v_net_due,
        'output_tax_movements', v_output_movements,
        'input_tax_movements', v_input_movements
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tax_report(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tax_report(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tax_report(uuid, date, date) TO authenticated;


-- 7. Customer Statement RPC (كشف حساب عميل)
CREATE OR REPLACE FUNCTION public.get_customer_statement(
  p_org_id uuid,
  p_customer_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_customer_code text;
    v_customer_name text;
    v_receivable_account_id uuid;
    v_cust_opening numeric(15,2) := 0.00;
    v_op_journal numeric(15,2) := 0.00;
    v_opening_balance numeric(15,2) := 0.00;
    v_total_debit numeric(15,2) := 0.00;
    v_total_credit numeric(15,2) := 0.00;
    v_closing_balance numeric(15,2) := 0.00;
    v_movements jsonb;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_view_financial_reports(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.';
    END IF;

    -- Check if customer exists
    SELECT code, name, receivable_account_id, 
           CASE WHEN opening_balance_type = 'debit' THEN opening_balance ELSE -opening_balance END
    INTO v_customer_code, v_customer_name, v_receivable_account_id, v_cust_opening
    FROM public.customers
    WHERE id = p_customer_id AND organization_id = p_org_id;

    IF v_customer_code IS NULL THEN
        RAISE EXCEPTION 'العميل غير موجود أو لا يتبع لهذه المنشأة.';
    END IF;

    IF v_receivable_account_id IS NULL THEN
        RAISE EXCEPTION 'العميل ليس لديه حساب ذمم مدينة مربوط.';
    END IF;

    -- Calculate journal opening balance before p_date_from
    SELECT COALESCE(SUM(l.debit - l.credit), 0.00)
    INTO v_op_journal
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON je.id = l.journal_entry_id AND je.organization_id = l.organization_id
    WHERE l.organization_id = p_org_id
      AND l.account_id = v_receivable_account_id
      AND je.status = 'posted'
      AND je.entry_date < p_date_from;

    v_opening_balance := COALESCE(v_cust_opening, 0.00) + v_op_journal;

    -- Period movements with cumulative running balance
    WITH period_lines AS (
        SELECT 
            je.id AS entry_id,
            je.entry_number,
            je.entry_date,
            je.created_at,
            je.reference,
            COALESCE(l.description, je.description) AS description,
            l.debit,
            l.credit
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON je.id = l.journal_entry_id AND je.organization_id = l.organization_id
        WHERE l.organization_id = p_org_id
          AND l.account_id = v_receivable_account_id
          AND je.status = 'posted'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
        ORDER BY je.entry_date ASC, je.created_at ASC, je.entry_number ASC, l.id ASC
    ),
    cumulative_lines AS (
        SELECT 
            entry_id,
            entry_number,
            entry_date,
            reference,
            description,
            debit,
            credit,
            (v_opening_balance + SUM(debit - credit) OVER (
                ORDER BY entry_date ASC, created_at ASC, entry_number ASC
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )) AS balance
        FROM period_lines
    )
    SELECT 
        COALESCE(jsonb_agg(jsonb_build_object(
            'date', entry_date,
            'reference', reference,
            'description', description,
            'debit', debit,
            'credit', credit,
            'balance', balance
        )), '[]'::jsonb),
        COALESCE(SUM(debit), 0.00),
        COALESCE(SUM(credit), 0.00)
    INTO 
        v_movements,
        v_total_debit,
        v_total_credit
    FROM cumulative_lines;

    v_closing_balance := v_opening_balance + v_total_debit - v_total_credit;

    RETURN jsonb_build_object(
        'customer_id', p_customer_id,
        'customer_code', v_customer_code,
        'customer_name', v_customer_name,
        'date_from', p_date_from,
        'date_to', p_date_to,
        'opening_balance', v_opening_balance,
        'total_debit', v_total_debit,
        'total_credit', v_total_credit,
        'closing_balance', v_closing_balance,
        'movements', v_movements
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_statement(uuid, uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_customer_statement(uuid, uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_statement(uuid, uuid, date, date) TO authenticated;


-- 8. Vendor Statement RPC (كشف حساب مورد)
CREATE OR REPLACE FUNCTION public.get_vendor_statement(
  p_org_id uuid,
  p_vendor_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_vendor_code text;
    v_vendor_name text;
    v_payable_account_id uuid;
    v_vend_opening numeric(15,2) := 0.00;
    v_op_journal numeric(15,2) := 0.00;
    v_opening_balance numeric(15,2) := 0.00;
    v_total_debit numeric(15,2) := 0.00;
    v_total_credit numeric(15,2) := 0.00;
    v_closing_balance numeric(15,2) := 0.00;
    v_movements jsonb;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_view_financial_reports(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.';
    END IF;

    -- Check if vendor exists
    SELECT code, name, payable_account_id,
           CASE WHEN opening_balance_type = 'credit' THEN opening_balance ELSE -opening_balance END
    INTO v_vendor_code, v_vendor_name, v_payable_account_id, v_vend_opening
    FROM public.vendors
    WHERE id = p_vendor_id AND organization_id = p_org_id;

    IF v_vendor_code IS NULL THEN
        RAISE EXCEPTION 'المورد غير موجود أو لا يتبع لهذه المنشأة.';
    END IF;

    IF v_payable_account_id IS NULL THEN
        RAISE EXCEPTION 'المورد ليس لديه حساب ذمم دائنة مربوط.';
    END IF;

    -- Calculate journal opening balance before p_date_from (Credit - Debit for payable accounts)
    SELECT COALESCE(SUM(l.credit - l.debit), 0.00)
    INTO v_op_journal
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON je.id = l.journal_entry_id AND je.organization_id = l.organization_id
    WHERE l.organization_id = p_org_id
      AND l.account_id = v_payable_account_id
      AND je.status = 'posted'
      AND je.entry_date < p_date_from;

    v_opening_balance := COALESCE(v_vend_opening, 0.00) + v_op_journal;

    -- Period movements with cumulative running balance
    WITH period_lines AS (
        SELECT 
            je.id AS entry_id,
            je.entry_number,
            je.entry_date,
            je.created_at,
            je.reference,
            COALESCE(l.description, je.description) AS description,
            l.debit,
            l.credit
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON je.id = l.journal_entry_id AND je.organization_id = l.organization_id
        WHERE l.organization_id = p_org_id
          AND l.account_id = v_payable_account_id
          AND je.status = 'posted'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
        ORDER BY je.entry_date ASC, je.created_at ASC, je.entry_number ASC, l.id ASC
    ),
    cumulative_lines AS (
        SELECT 
            entry_id,
            entry_number,
            entry_date,
            reference,
            description,
            debit,
            credit,
            (v_opening_balance + SUM(credit - debit) OVER (
                ORDER BY entry_date ASC, created_at ASC, entry_number ASC
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )) AS balance
        FROM period_lines
    )
    SELECT 
        COALESCE(jsonb_agg(jsonb_build_object(
            'date', entry_date,
            'reference', reference,
            'description', description,
            'debit', debit,
            'credit', credit,
            'balance', balance
        )), '[]'::jsonb),
        COALESCE(SUM(debit), 0.00),
        COALESCE(SUM(credit), 0.00)
    INTO 
        v_movements,
        v_total_debit,
        v_total_credit
    FROM cumulative_lines;

    v_closing_balance := v_opening_balance + v_total_credit - v_total_debit;

    RETURN jsonb_build_object(
        'vendor_id', p_vendor_id,
        'vendor_code', v_vendor_code,
        'vendor_name', v_vendor_name,
        'date_from', p_date_from,
        'date_to', p_date_to,
        'opening_balance', v_opening_balance,
        'total_debit', v_total_debit,
        'total_credit', v_total_credit,
        'closing_balance', v_closing_balance,
        'movements', v_movements
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_statement(uuid, uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_vendor_statement(uuid, uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_statement(uuid, uuid, date, date) TO authenticated;


-- 9. Customer Aging Report RPC (تقرير أعمار ذمم العملاء)
DROP FUNCTION IF EXISTS public.get_customer_aging_report(uuid, date);

CREATE OR REPLACE FUNCTION public.get_customer_aging_report(
    p_organization_id uuid,
    p_as_of_date date DEFAULT current_date
)
RETURNS TABLE (
    customer_id uuid,
    customer_name text,
    customer_code text,
    total_due numeric,
    not_due numeric,
    bucket_0_30 numeric,
    bucket_31_60 numeric,
    bucket_61_90 numeric,
    bucket_over_90 numeric,
    last_invoice_number text,
    last_invoice_date date,
    last_receipt_number text,
    last_receipt_date date,
    currency_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Auth Check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_view_financial_reports(p_organization_id) THEN
        RAISE EXCEPTION 'غير مصرح: ليس لديك الصلاحية لعرض تقرير أعمار ذمم العملاء.';
    END IF;

    RETURN QUERY
    WITH invoice_balances AS (
        SELECT 
            si.id AS invoice_id,
            si.customer_id,
            si.invoice_number,
            si.invoice_date,
            si.due_date,
            si.total AS orig_total,
            COALESCE((
                SELECT SUM(ra.allocated_amount)
                FROM public.receipt_allocations AS ra
                JOIN public.receipts AS r ON ra.receipt_id = r.id
                WHERE ra.sales_invoice_id = si.id
                  AND r.status = 'approved'
                  AND r.receipt_date <= p_as_of_date
                  AND r.deleted_at IS NULL
            ), 0) AS total_paid,
            COALESCE((
                SELECT SUM(scn.total_amount)
                FROM public.sales_credit_notes AS scn
                WHERE scn.original_invoice_id = si.id
                  AND scn.status = 'approved'
                  AND scn.credit_note_date <= p_as_of_date
                  AND scn.deleted_at IS NULL
            ), 0) AS total_credit
        FROM public.sales_invoices AS si
        WHERE si.organization_id = p_organization_id
          AND si.status = 'approved'
          AND si.invoice_date <= p_as_of_date
          AND si.deleted_at IS NULL
    ),
    invoice_outstanding AS (
        SELECT 
            ib.customer_id,
            ib.invoice_id,
            ib.invoice_number,
            ib.invoice_date,
            ib.due_date,
            (ib.orig_total - ib.total_paid - ib.total_credit) AS balance_due,
            (p_as_of_date - COALESCE(ib.due_date, ib.invoice_date)) AS age_days
        FROM invoice_balances AS ib
        WHERE (ib.orig_total - ib.total_paid - ib.total_credit) > 0
    ),
    customer_last_invoice AS (
        SELECT DISTINCT ON (si.customer_id)
            si.customer_id,
            si.invoice_number,
            si.invoice_date
        FROM public.sales_invoices AS si
        WHERE si.organization_id = p_organization_id
          AND si.status = 'approved'
          AND si.invoice_date <= p_as_of_date
          AND si.deleted_at IS NULL
        ORDER BY si.customer_id, si.invoice_date DESC, si.created_at DESC
    ),
    customer_last_receipt AS (
        SELECT DISTINCT ON (r.customer_id)
            r.customer_id,
            r.receipt_number,
            r.receipt_date
        FROM public.receipts AS r
        WHERE r.organization_id = p_organization_id
          AND r.status = 'approved'
          AND r.receipt_date <= p_as_of_date
          AND r.deleted_at IS NULL
        ORDER BY r.customer_id, r.receipt_date DESC, r.created_at DESC
    ),
    org_currency AS (
        SELECT o.currency_code AS org_currency_code 
        FROM public.organizations AS o
        WHERE o.id = p_organization_id
        LIMIT 1
    )
    SELECT 
        c.id AS customer_id,
        c.name AS customer_name,
        c.code AS customer_code,
        COALESCE(SUM(io.balance_due), 0)::numeric AS total_due,
        COALESCE(SUM(CASE WHEN io.age_days < 0 THEN io.balance_due ELSE 0 END), 0)::numeric AS not_due,
        COALESCE(SUM(CASE WHEN io.age_days BETWEEN 0 AND 30 THEN io.balance_due ELSE 0 END), 0)::numeric AS bucket_0_30,
        COALESCE(SUM(CASE WHEN io.age_days BETWEEN 31 AND 60 THEN io.balance_due ELSE 0 END), 0)::numeric AS bucket_31_60,
        COALESCE(SUM(CASE WHEN io.age_days BETWEEN 61 AND 90 THEN io.balance_due ELSE 0 END), 0)::numeric AS bucket_61_90,
        COALESCE(SUM(CASE WHEN io.age_days > 90 THEN io.balance_due ELSE 0 END), 0)::numeric AS bucket_over_90,
        cli.invoice_number AS last_invoice_number,
        cli.invoice_date AS last_invoice_date,
        clr.receipt_number AS last_receipt_number,
        clr.receipt_date AS last_receipt_date,
        COALESCE(oc.org_currency_code, 'SAR') AS currency_code
    FROM public.customers AS c
    LEFT JOIN invoice_outstanding AS io ON c.id = io.customer_id
    LEFT JOIN customer_last_invoice AS cli ON c.id = cli.customer_id
    LEFT JOIN customer_last_receipt AS clr ON c.id = clr.customer_id
    CROSS JOIN org_currency AS oc
    WHERE c.organization_id = p_organization_id
      AND c.is_active = true
    GROUP BY c.id, c.name, c.code, cli.invoice_number, cli.invoice_date, clr.receipt_number, clr.receipt_date, oc.org_currency_code
    HAVING COALESCE(SUM(io.balance_due), 0) > 0
    ORDER BY c.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_aging_report(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_customer_aging_report(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_aging_report(uuid, date) TO authenticated;


-- 10. Vendor Aging Report RPC (تقرير أعمار ذمم الموردين)
DROP FUNCTION IF EXISTS public.get_vendor_aging_report(uuid, date);

CREATE OR REPLACE FUNCTION public.get_vendor_aging_report(
    p_organization_id uuid,
    p_as_of_date date DEFAULT current_date
)
RETURNS TABLE (
    vendor_id uuid,
    vendor_name text,
    vendor_code text,
    total_due numeric,
    not_due numeric,
    bucket_0_30 numeric,
    bucket_31_60 numeric,
    bucket_61_90 numeric,
    bucket_over_90 numeric,
    last_bill_number text,
    last_bill_date date,
    last_payment_number text,
    last_payment_date date,
    currency_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Auth Check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_view_financial_reports(p_organization_id) THEN
        RAISE EXCEPTION 'غير مصرح: ليس لديك الصلاحية لعرض تقرير أعمار ذمم الموردين.';
    END IF;

    RETURN QUERY
    WITH bill_balances AS (
        SELECT 
            pb.id AS bill_id,
            pb.vendor_id,
            pb.bill_number,
            pb.bill_date,
            pb.due_date,
            pb.total AS orig_total,
            COALESCE((
                SELECT SUM(pa.allocated_amount)
                FROM public.payment_allocations AS pa
                JOIN public.payments AS p ON pa.payment_id = p.id
                WHERE pa.purchase_bill_id = pb.id
                  AND p.status = 'approved'
                  AND p.payment_date <= p_as_of_date
                  AND p.deleted_at IS NULL
            ), 0) AS total_paid,
            COALESCE((
                SELECT SUM(pdn.total_amount)
                FROM public.purchase_debit_notes AS pdn
                WHERE pdn.original_bill_id = pb.id
                  AND pdn.status = 'approved'
                  AND pdn.debit_note_date <= p_as_of_date
                  AND pdn.deleted_at IS NULL
            ), 0) AS total_debit
        FROM public.purchase_bills AS pb
        WHERE pb.organization_id = p_organization_id
          AND pb.status = 'approved'
          AND pb.bill_date <= p_as_of_date
          AND pb.deleted_at IS NULL
    ),
    bill_outstanding AS (
        SELECT 
            bb.vendor_id,
            bb.bill_id,
            bb.bill_number,
            bb.bill_date,
            bb.due_date,
            (bb.orig_total - bb.total_paid - bb.total_debit) AS balance_due,
            (p_as_of_date - COALESCE(bb.due_date, bb.bill_date)) AS age_days
        FROM bill_balances AS bb
        WHERE (bb.orig_total - bb.total_paid - bb.total_debit) > 0
    ),
    vendor_last_bill AS (
        SELECT DISTINCT ON (pb.vendor_id)
            pb.vendor_id,
            pb.bill_number,
            pb.bill_date
        FROM public.purchase_bills AS pb
        WHERE pb.organization_id = p_organization_id
          AND pb.status = 'approved'
          AND pb.bill_date <= p_as_of_date
          AND pb.deleted_at IS NULL
        ORDER BY pb.vendor_id, pb.bill_date DESC, pb.created_at DESC
    ),
    vendor_last_payment AS (
        SELECT DISTINCT ON (p.vendor_id)
            p.vendor_id,
            p.payment_number,
            p.payment_date
        FROM public.payments AS p
        WHERE p.organization_id = p_organization_id
          AND p.status = 'approved'
          AND p.payment_date <= p_as_of_date
          AND p.deleted_at IS NULL
        ORDER BY p.vendor_id, p.payment_date DESC, p.created_at DESC
    ),
    org_currency AS (
        SELECT o.currency_code AS org_currency_code 
        FROM public.organizations AS o
        WHERE o.id = p_organization_id
        LIMIT 1
    )
    SELECT 
        v.id AS vendor_id,
        v.name AS vendor_name,
        v.code AS vendor_code,
        COALESCE(SUM(bo.balance_due), 0)::numeric AS total_due,
        COALESCE(SUM(CASE WHEN bo.age_days < 0 THEN bo.balance_due ELSE 0 END), 0)::numeric AS not_due,
        COALESCE(SUM(CASE WHEN bo.age_days BETWEEN 0 AND 30 THEN bo.balance_due ELSE 0 END), 0)::numeric AS bucket_0_30,
        COALESCE(SUM(CASE WHEN bo.age_days BETWEEN 31 AND 60 THEN bo.balance_due ELSE 0 END), 0)::numeric AS bucket_31_60,
        COALESCE(SUM(CASE WHEN bo.age_days BETWEEN 61 AND 90 THEN bo.balance_due ELSE 0 END), 0)::numeric AS bucket_61_90,
        COALESCE(SUM(CASE WHEN bo.age_days > 90 THEN bo.balance_due ELSE 0 END), 0)::numeric AS bucket_over_90,
        vlb.bill_number AS last_bill_number,
        vlb.bill_date AS last_bill_date,
        vlp.payment_number AS last_payment_number,
        vlp.payment_date AS last_payment_date,
        COALESCE(oc.org_currency_code, 'SAR') AS currency_code
    FROM public.vendors AS v
    LEFT JOIN bill_outstanding AS bo ON v.id = bo.vendor_id
    LEFT JOIN vendor_last_bill AS vlb ON v.id = vlb.vendor_id
    LEFT JOIN vendor_last_payment AS vlp ON v.id = vlp.vendor_id
    CROSS JOIN org_currency AS oc
    WHERE v.organization_id = p_organization_id
      AND v.is_active = true
    GROUP BY v.id, v.name, v.code, vlb.bill_number, vlb.bill_date, vlp.payment_number, vlp.payment_date, oc.org_currency_code
    HAVING COALESCE(SUM(bo.balance_due), 0) > 0
    ORDER BY v.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_aging_report(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_vendor_aging_report(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_aging_report(uuid, date) TO authenticated;


-- 11. Inventory Report RPC (تقرير جرد وتقييم المخزون)
CREATE OR REPLACE FUNCTION public.get_inventory_report(
  p_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_report jsonb;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT (public.is_org_member(p_org_id) OR public.can_view_financial_reports(p_org_id)) THEN
        RAISE EXCEPTION 'غير مصرح: هذه البيانات متاحة لأعضاء المنشأة فقط.';
    END IF;

    -- Retrieve active inventory valuation details from items and balances
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'item_id', i.id,
        'item_code', i.code,
        'item_name_ar', i.name,
        'item_name_en', NULL,
        'quantity_on_hand', COALESCE(b.quantity_on_hand, 0.00),
        'average_cost', CASE WHEN public.can_view_financial_reports(p_org_id) THEN COALESCE(b.average_cost, 0.00) ELSE 0.00 END,
        'inventory_value', CASE WHEN public.can_view_financial_reports(p_org_id) THEN COALESCE(b.inventory_value, 0.00) ELSE 0.00 END,
        'inventory_account_code', acc_inv.code,
        'inventory_account_name', acc_inv.name_ar,
        'cogs_account_code', acc_cogs.code,
        'cogs_account_name', acc_cogs.name_ar,
        'last_movement_at', COALESCE(b.last_movement_at, i.created_at)
    ) ORDER BY i.code ASC), '[]'::jsonb)
    INTO v_report
    FROM public.items i
    LEFT JOIN public.inventory_balances b ON b.item_id = i.id AND b.organization_id = i.organization_id
    LEFT JOIN public.accounts acc_inv ON i.inventory_account_id = acc_inv.id AND i.organization_id = acc_inv.organization_id
    LEFT JOIN public.accounts acc_cogs ON i.cogs_account_id = acc_cogs.id AND i.organization_id = acc_cogs.organization_id
    WHERE i.organization_id = p_org_id
      AND (i.item_type = 'product' OR i.is_stockable = true)
      AND i.is_active = true;

    RETURN v_report;
END;
$$;

REVOKE ALL ON FUNCTION public.get_inventory_report(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_inventory_report(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_report(uuid) TO authenticated;


-- 12. Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';

COMMIT;
