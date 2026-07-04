-- ==========================================================
-- LEDGRA ADVANCED FINANCIAL REPORTS PHASE B
-- ==========================================================

BEGIN;

-- 1. Create get_income_statement_advanced
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
    -- Exclude closing entries if p_exclude_closing_entries is true
    WITH account_sums AS (
        SELECT 
            a.id,
            a.code,
            a.name_ar,
            a.name_en,
            a.classification,
            CASE 
                WHEN a.code LIKE '511%' 
                     OR a.id = (SELECT default_cogs_account_id FROM public.accounting_settings WHERE organization_id = p_org_id LIMIT 1)
                     OR a.id IN (SELECT distinct cogs_account_id FROM public.items WHERE organization_id = p_org_id AND cogs_account_id IS NOT NULL)
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
                CASE 
                    WHEN a.code LIKE '511%' 
                         OR a.id = (SELECT default_cogs_account_id FROM public.accounting_settings WHERE organization_id = p_org_id LIMIT 1)
                         OR a.id IN (SELECT distinct cogs_account_id FROM public.items WHERE organization_id = p_org_id AND cogs_account_id IS NOT NULL)
                    THEN true 
                    ELSE false 
                END AS is_cogs,
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
               (total_debit - total_credit) as net_amount
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
                  OR a.id = (SELECT default_cogs_account_id FROM public.accounting_settings WHERE organization_id = p_org_id LIMIT 1)
                  OR a.id IN (SELECT distinct cogs_account_id FROM public.items WHERE organization_id = p_org_id AND cogs_account_id IS NOT NULL)
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

    -- 3. Build general expense accounts array
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
               (total_debit - total_credit) as net_amount
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
                  OR a.id = (SELECT default_cogs_account_id FROM public.accounting_settings WHERE organization_id = p_org_id LIMIT 1)
                  OR a.id IN (SELECT distinct cogs_account_id FROM public.items WHERE organization_id = p_org_id AND cogs_account_id IS NOT NULL)
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
        'exclude_closing_entries', p_exclude_closing_entries,
        'total_revenue', v_revenue,
        'total_cogs', v_cogs,
        'gross_profit', v_gross_profit,
        'total_operating_expenses', v_expenses,
        'total_expenses', v_cogs + v_expenses,
        'net_income', v_net_income,
        'revenue_accounts', v_revenue_array,
        'cogs_accounts', v_cogs_array,
        'expense_accounts', v_expense_array
    );
END;
$$;

-- Secure grants for the advanced function
REVOKE ALL ON FUNCTION public.get_income_statement_advanced(uuid, date, date, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_income_statement_advanced(uuid, date, date, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_income_statement_advanced(uuid, date, date, boolean) TO authenticated;


-- 2. Create get_tax_report
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

    -- Fetch configured accounts
    SELECT default_tax_output_account_id, default_tax_input_account_id
    INTO v_output_tax_acc, v_input_tax_acc
    FROM public.accounting_settings
    WHERE organization_id = p_org_id
    LIMIT 1;

    -- Calculate total output tax (collected on sales)
    -- Natural balance is Credit: (Credit - Debit)
    IF v_output_tax_acc IS NOT NULL THEN
        SELECT COALESCE(SUM(l.credit - l.debit), 0.00)
        INTO v_total_output
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON l.journal_entry_id = je.id
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
        JOIN public.journal_entries je ON l.journal_entry_id = je.id
        WHERE l.organization_id = p_org_id
          AND l.account_id = v_output_tax_acc
          AND je.status = 'posted'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
          AND (je.reference IS NULL OR NOT (je.reference LIKE 'YEAR-CLOSE%'));
    END IF;

    -- Calculate total input tax (paid on purchases)
    -- Natural balance is Debit: (Debit - Credit)
    IF v_input_tax_acc IS NOT NULL THEN
        SELECT COALESCE(SUM(l.debit - l.credit), 0.00)
        INTO v_total_input
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON l.journal_entry_id = je.id
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
        JOIN public.journal_entries je ON l.journal_entry_id = je.id
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

-- Secure grants for tax report RPC
REVOKE ALL ON FUNCTION public.get_tax_report(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tax_report(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tax_report(uuid, date, date) TO authenticated;

COMMIT;
