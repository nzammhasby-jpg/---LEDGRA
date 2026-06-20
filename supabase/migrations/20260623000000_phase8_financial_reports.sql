BEGIN;

-- ==========================================================
-- LEDGRA PHASE 8: FINANCIAL REPORTING RPCs
-- ==========================================================

-- 1. Helper function to check if the current user can view financial reports
CREATE OR REPLACE FUNCTION public.can_view_financial_reports(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_org_id
          AND profile_id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant', 'viewer')
    );
$$;

-- Secure grants for helper
REVOKE ALL ON FUNCTION public.can_view_financial_reports(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_financial_reports(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_financial_reports(uuid) TO authenticated;


-- 2. Income Statement RPC (قائمة الدخل)
CREATE OR REPLACE FUNCTION public.get_income_statement(
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
    v_revenue numeric(15,2) := 0.00;
    v_cogs numeric(15,2) := 0.00;
    v_expenses numeric(15,2) := 0.00;
    v_gross_profit numeric(15,2) := 0.00;
    v_net_income numeric(15,2) := 0.00;
    v_breakdown jsonb;
BEGIN
    -- Auth role verification
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_view_financial_reports(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.';
    END IF;

    -- Calculate aggregates based on leaf ledger postings during the period
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

    -- Build breakdown JSON array
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
        WHERE CASE 
            WHEN classification = 'revenue' THEN (total_credit - total_debit) <> 0.00
            ELSE (total_debit - total_credit) <> 0.00
        END
        ORDER BY code ASC
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'account_id', id,
        'account_code', code,
        'account_name_ar', name_ar,
        'account_name_en', name_en,
        'classification', classification,
        'is_cogs', is_cogs,
        'amount', net_amount
    )), '[]'::jsonb)
    INTO v_breakdown
    FROM calculated_amounts;

    RETURN jsonb_build_object(
        'revenue', v_revenue,
        'cogs', v_cogs,
        'gross_profit', v_gross_profit,
        'expenses', v_expenses,
        'net_income', v_net_income,
        'accounts_breakdown', v_breakdown
    );
END;
$$;

-- Secure grants for Income Statement RPC
REVOKE ALL ON FUNCTION public.get_income_statement(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_income_statement(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_income_statement(uuid, date, date) TO authenticated;


-- 3. Balance Sheet RPC (المركز المالي)
CREATE OR REPLACE FUNCTION public.get_balance_sheet(
  p_org_id uuid,
  p_as_of_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_year_start date;
    v_assets_total numeric(15,2) := 0.00;
    v_liabilities_total numeric(15,2) := 0.00;
    v_equity_total numeric(15,2) := 0.00;
    v_current_year_net_income numeric(15,2) := 0.00;
    v_total_assets numeric(15,2) := 0.00;
    v_total_liabilities numeric(15,2) := 0.00;
    v_total_equity numeric(15,2) := 0.00;
    v_check_difference numeric(15,2) := 0.00;
    v_revenue_ytd numeric(15,2) := 0.00;
    v_expenses_ytd numeric(15,2) := 0.00;
    v_breakdown jsonb;
BEGIN
    -- Auth role verification
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_view_financial_reports(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.';
    END IF;

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

    -- Calculate YTD net income (Revenues - Expenses) from v_year_start to p_as_of_date
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

    v_current_year_net_income := v_revenue_ytd - v_expenses_ytd;

    -- Calculate assets, liabilities, equity cumulative balances (all-time up to p_as_of_date)
    WITH posted_lines AS (
        SELECT
            l.account_id,
            l.debit,
            l.credit
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je
          ON je.id = l.journal_entry_id
         AND je.organization_id = l.organization_id
        WHERE l.organization_id = p_org_id
          AND je.organization_id = p_org_id
          AND je.status = 'posted'
          AND je.entry_date <= p_as_of_date
    ),
    account_balances AS (
        SELECT 
            a.id,
            a.code,
            a.name_ar,
            a.name_en,
            a.classification,
            COALESCE(SUM(pl.debit), 0.00) AS total_debit,
            COALESCE(SUM(pl.credit), 0.00) AS total_credit
        FROM public.accounts a
        LEFT JOIN posted_lines pl ON pl.account_id = a.id
        WHERE a.organization_id = p_org_id
          AND a.classification IN ('assets', 'liabilities', 'equity')
        GROUP BY a.id, a.code, a.name_ar, a.name_en, a.classification
    ),
    calculated AS (
        SELECT 
            id,
            code,
            name_ar,
            name_en,
            classification,
            CASE 
                WHEN classification = 'assets' THEN (total_debit - total_credit)
                ELSE (total_credit - total_debit)
            END AS net_amount
        FROM account_balances
    )
    SELECT
        COALESCE(SUM(CASE WHEN classification = 'assets' THEN net_amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN classification = 'liabilities' THEN net_amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN classification = 'equity' THEN net_amount ELSE 0.00 END), 0.00)
    INTO v_assets_total, v_liabilities_total, v_equity_total
    FROM calculated;

    v_total_assets := v_assets_total;
    v_total_liabilities := v_liabilities_total;
    v_total_equity := v_equity_total;
    
    -- Check accounting equation: Assets = Liabilities + Equity + Current Net Income
    v_check_difference := v_total_assets - (v_total_liabilities + v_total_equity + v_current_year_net_income);

    -- Generate breakdown of accounts with non-zero balances for reporting presentation (only posted)
    WITH posted_lines AS (
        SELECT
            l.account_id,
            l.debit,
            l.credit
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je
          ON je.id = l.journal_entry_id
         AND je.organization_id = l.organization_id
        WHERE l.organization_id = p_org_id
          AND je.organization_id = p_org_id
          AND je.status = 'posted'
          AND je.entry_date <= p_as_of_date
    ),
    account_balances AS (
        SELECT 
            a.id,
            a.code,
            a.name_ar,
            a.name_en,
            a.classification,
            COALESCE(SUM(pl.debit), 0.00) AS total_debit,
            COALESCE(SUM(pl.credit), 0.00) AS total_credit
        FROM public.accounts a
        JOIN posted_lines pl ON pl.account_id = a.id
        WHERE a.organization_id = p_org_id
          AND a.classification IN ('assets', 'liabilities', 'equity')
        GROUP BY a.id, a.code, a.name_ar, a.name_en, a.classification
    ),
    calculated AS (
        SELECT 
            id,
            code,
            name_ar,
            name_en,
            classification,
            CASE 
                WHEN classification = 'assets' THEN (total_debit - total_credit)
                ELSE (total_credit - total_debit)
            END AS net_amount
        FROM account_balances
        WHERE CASE 
            WHEN classification = 'assets' THEN (total_debit - total_credit) <> 0.00
            ELSE (total_credit - total_debit) <> 0.00
        END
        ORDER BY code ASC
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'account_id', id,
        'account_code', code,
        'account_name_ar', name_ar,
        'account_name_en', name_en,
        'classification', classification,
        'amount', net_amount
    )), '[]'::jsonb)
    INTO v_breakdown
    FROM calculated;

    RETURN jsonb_build_object(
        'assets', v_assets_total,
        'liabilities', v_liabilities_total,
        'equity', v_equity_total,
        'current_year_net_income', v_current_year_net_income,
        'total_assets', v_total_assets,
        'total_liabilities', v_total_liabilities,
        'total_equity', v_total_equity,
        'check_difference', v_check_difference,
        'accounts_breakdown', v_breakdown
    );
END;
$$;

-- Secure grants for Balance Sheet RPC
REVOKE ALL ON FUNCTION public.get_balance_sheet(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_balance_sheet(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_balance_sheet(uuid, date) TO authenticated;


-- 4. Customer Statement RPC (كشف حساب عميل)
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

    -- Fetch customer receivables account and info
    SELECT code, name, receivable_account_id, 
           CASE WHEN opening_balance_type = 'debit' THEN opening_balance ELSE -opening_balance END
    INTO v_customer_code, v_customer_name, v_receivable_account_id, v_cust_opening
    FROM public.customers
    WHERE id = p_customer_id AND organization_id = p_org_id;

    IF v_receivable_account_id IS NULL THEN
        RAISE EXCEPTION 'العميل غير موجود أو ليس لديه حساب ذمم مدينة مربوط.';
    END IF;

    -- Calculate journal entries sum before p_date_from in AR account
    SELECT COALESCE(SUM(l.debit - l.credit), 0.00)
    INTO v_op_journal
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
    WHERE l.organization_id = p_org_id
      AND l.account_id = v_receivable_account_id
      AND je.status = 'posted'
      AND je.entry_date < p_date_from;

    v_opening_balance := v_cust_opening + v_op_journal;

    -- Fetch movements in the selected date range
    WITH raw_movements AS (
        SELECT 
            je.entry_date AS date,
            je.entry_number AS journal_number,
            je.reference,
            COALESCE(l.description, je.description, 'حركة قيد') AS description,
            l.debit,
            l.credit,
            je.source_type,
            je.source_id,
            l.id as line_id
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
        WHERE l.organization_id = p_org_id
          AND l.account_id = v_receivable_account_id
          AND je.status = 'posted'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
        ORDER BY je.entry_date ASC, je.entry_number ASC, l.id ASC
    ),
    with_running AS (
        SELECT 
            date,
            journal_number,
            reference,
            description,
            debit,
            credit,
            source_type,
            source_id,
            v_opening_balance + SUM(debit - credit) OVER (ORDER BY date ASC, journal_number ASC, line_id ASC) AS running_balance
        FROM raw_movements
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', date,
        'journal_number', journal_number,
        'reference', reference,
        'description', description,
        'debit', debit,
        'credit', credit,
        'running_balance', running_balance,
        'source_type', source_type,
        'source_id', source_id
    )), '[]'::jsonb)
    INTO v_movements
    FROM with_running;

    -- Calculate total debit & credit in range
    SELECT 
        COALESCE(SUM(l.debit), 0.00),
        COALESCE(SUM(l.credit), 0.00)
    INTO v_total_debit, v_total_credit
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
    WHERE l.organization_id = p_org_id
      AND l.account_id = v_receivable_account_id
      AND je.status = 'posted'
      AND je.entry_date >= p_date_from
      AND je.entry_date <= p_date_to;

    v_closing_balance := v_opening_balance + v_total_debit - v_total_credit;

    RETURN jsonb_build_object(
        'customer_code', v_customer_code,
        'customer_name', v_customer_name,
        'opening_balance', v_opening_balance,
        'total_debit', v_total_debit,
        'total_credit', v_total_credit,
        'closing_balance', v_closing_balance,
        'movements', v_movements
    );
END;
$$;

-- Secure grants for Customer Statement RPC
REVOKE ALL ON FUNCTION public.get_customer_statement(uuid, uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_customer_statement(uuid, uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_statement(uuid, uuid, date, date) TO authenticated;


-- 5. Vendor Statement RPC (كشف حساب مورد)
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

    -- Fetch vendor payables account and info
    SELECT code, name, payable_account_id, 
           CASE WHEN opening_balance_type = 'credit' THEN opening_balance ELSE -opening_balance END
    INTO v_vendor_code, v_vendor_name, v_payable_account_id, v_vend_opening
    FROM public.vendors
    WHERE id = p_vendor_id AND organization_id = p_org_id;

    IF v_payable_account_id IS NULL THEN
        RAISE EXCEPTION 'المورد غير موجود أو ليس لديه حساب ذمم دائنة مربوط.';
    END IF;

    -- Calculate journal entries sum before p_date_from (vendor is credit nature, so credit - debit)
    SELECT COALESCE(SUM(l.credit - l.debit), 0.00)
    INTO v_op_journal
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
    WHERE l.organization_id = p_org_id
      AND l.account_id = v_payable_account_id
      AND je.status = 'posted'
      AND je.entry_date < p_date_from;

    v_opening_balance := v_vend_opening + v_op_journal;

    -- Fetch movements in the selected date range
    WITH raw_movements AS (
        SELECT 
            je.entry_date AS date,
            je.entry_number AS journal_number,
            je.reference,
            COALESCE(l.description, je.description, 'حركة قيد') AS description,
            l.debit,
            l.credit,
            je.source_type,
            je.source_id,
            l.id as line_id
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
        WHERE l.organization_id = p_org_id
          AND l.account_id = v_payable_account_id
          AND je.status = 'posted'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
        ORDER BY je.entry_date ASC, je.entry_number ASC, l.id ASC
    ),
    with_running AS (
        SELECT 
            date,
            journal_number,
            reference,
            description,
            debit,
            credit,
            source_type,
            source_id,
            v_opening_balance + SUM(credit - debit) OVER (ORDER BY date ASC, journal_number ASC, line_id ASC) AS running_balance
        FROM raw_movements
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', date,
        'journal_number', journal_number,
        'reference', reference,
        'description', description,
        'debit', debit,
        'credit', credit,
        'running_balance', running_balance,
        'source_type', source_type,
        'source_id', source_id
    )), '[]'::jsonb)
    INTO v_movements
    FROM with_running;

    -- Calculate total debit & credit in range
    SELECT 
        COALESCE(SUM(l.debit), 0.00),
        COALESCE(SUM(l.credit), 0.00)
    INTO v_total_debit, v_total_credit
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
    WHERE l.organization_id = p_org_id
      AND l.account_id = v_payable_account_id
      AND je.status = 'posted'
      AND je.entry_date >= p_date_from
      AND je.entry_date <= p_date_to;

    v_closing_balance := v_opening_balance + v_total_credit - v_total_debit;

    RETURN jsonb_build_object(
        'vendor_code', v_vendor_code,
        'vendor_name', v_vendor_name,
        'opening_balance', v_opening_balance,
        'total_debit', v_total_debit,
        'total_credit', v_total_credit,
        'closing_balance', v_closing_balance,
        'movements', v_movements
    );
END;
$$;

-- Secure grants for Vendor Statement RPC
REVOKE ALL ON FUNCTION public.get_vendor_statement(uuid, uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_vendor_statement(uuid, uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_statement(uuid, uuid, date, date) TO authenticated;


-- 6. Inventory Report RPC (تقرير المخزون)
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

    IF NOT public.is_org_member(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه البيانات متاحة لأعضاء المنشأة فقط.';
    END IF;

    -- Retrieve active inventory valuation details
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'item_id', b.item_id,
        'item_code', i.code,
        'item_name_ar', i.name,
        'item_name_en', NULL,
        'quantity_on_hand', b.quantity_on_hand,
        'average_cost', CASE WHEN public.can_view_financial_reports(p_org_id) THEN b.average_cost ELSE 0.00 END,
        'inventory_value', CASE WHEN public.can_view_financial_reports(p_org_id) THEN b.inventory_value ELSE 0.00 END,
        'inventory_account_code', acc_inv.code,
        'inventory_account_name', acc_inv.name_ar,
        'cogs_account_code', acc_cogs.code,
        'cogs_account_name', acc_cogs.name_ar,
        'last_movement_at', b.last_movement_at
    ) ORDER BY i.code ASC), '[]'::jsonb)
    INTO v_report
    FROM public.inventory_balances b
    JOIN public.items i ON b.item_id = i.id AND b.organization_id = i.organization_id
    LEFT JOIN public.accounts acc_inv ON i.inventory_account_id = acc_inv.id AND i.organization_id = acc_inv.organization_id
    LEFT JOIN public.accounts acc_cogs ON i.cogs_account_id = acc_cogs.id AND i.organization_id = acc_cogs.organization_id
    WHERE b.organization_id = p_org_id;

    RETURN v_report;
END;
$$;

-- Secure grants for Inventory Report RPC
REVOKE ALL ON FUNCTION public.get_inventory_report(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_inventory_report(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_report(uuid) TO authenticated;

COMMIT;
