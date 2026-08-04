-- ==========================================================
-- LEDGRA FINANCIAL RECONCILIATION - REP-1B (CORRECTED & HARDENED)
-- ==========================================================

BEGIN;

-- Drop legacy/overloaded signatures to avoid ambiguity
DROP FUNCTION IF EXISTS public.get_trial_balance_advanced(uuid, date, date, boolean, boolean, boolean);
DROP FUNCTION IF EXISTS public.get_trial_balance_advanced(uuid, date, date, boolean, boolean, boolean, uuid);
DROP FUNCTION IF EXISTS public.get_ledger_report_advanced(uuid, uuid, date, date, boolean);
DROP FUNCTION IF EXISTS public.get_ledger_report_advanced(uuid, uuid, date, date, boolean, uuid);

-- 1. Redefine public.get_trial_balance_advanced with absolute precision, fiscal year validation & date checks
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

    -- Fiscal year validation
    SELECT start_date, end_date INTO v_fy_start, v_fy_end
    FROM public.fiscal_years
    WHERE id = p_fiscal_year_id AND organization_id = p_org_id;

    IF v_fy_start IS NULL THEN
        RAISE EXCEPTION 'السنة المالية المحددة غير موجودة أو لا تتبع المنشأة.';
    END IF;

    IF p_date_from < v_fy_start OR p_date_to > v_fy_end THEN
        RAISE EXCEPTION 'الفترة المحددة تقع خارج نطاق السنة المالية المحددة.';
    END IF;

    -- Calculate Totals based strictly on direct/non-rolled-up leaf accounts to prevent double counting
    WITH direct_balances AS (
        SELECT 
            a.id AS account_id,
            COALESCE(SUM(CASE WHEN je.entry_date < p_date_from THEN l.debit ELSE 0.00 END), 0.00) AS direct_opening_debit,
            COALESCE(SUM(CASE WHEN je.entry_date < p_date_from THEN l.credit ELSE 0.00 END), 0.00) AS direct_opening_credit,
            COALESCE(SUM(CASE WHEN je.entry_date >= p_date_from AND je.entry_date <= p_date_to THEN l.debit ELSE 0.00 END), 0.00) AS direct_period_debit,
            COALESCE(SUM(CASE WHEN je.entry_date >= p_date_from AND je.entry_date <= p_date_to THEN l.credit ELSE 0.00 END), 0.00) AS direct_period_credit
        FROM public.accounts a
        LEFT JOIN public.journal_entry_lines l ON l.account_id = a.id AND l.organization_id = p_org_id
        LEFT JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id AND je.status = 'posted'
             AND je.fiscal_year_id = p_fiscal_year_id
             AND (
                 NOT p_exclude_closing_entries 
                 OR je.reference IS NULL 
                 OR NOT (je.reference LIKE 'YEAR-CLOSE%')
             )
        WHERE a.organization_id = p_org_id
          AND (a.allow_direct_posting = true OR NOT EXISTS (
              SELECT 1 FROM public.accounts child WHERE child.parent_id = a.id AND child.organization_id = p_org_id
          ))
        GROUP BY a.id
    ),
    direct_netted AS (
        SELECT 
            account_id,
            (direct_opening_debit - direct_opening_credit) AS opening_net,
            direct_period_debit AS pd_debit,
            direct_period_credit AS pd_credit
        FROM direct_balances
    ),
    direct_fully_calculated AS (
        SELECT 
            account_id,
            CASE WHEN opening_net > 0 THEN opening_net ELSE 0.00 END AS op_debit,
            CASE WHEN opening_net < 0 THEN ABS(opening_net) ELSE 0.00 END AS op_credit,
            pd_debit,
            pd_credit,
            CASE WHEN (opening_net + pd_debit - pd_credit) > 0 THEN (opening_net + pd_debit - pd_credit) ELSE 0.00 END AS cl_debit,
            CASE WHEN (opening_net + pd_debit - pd_credit) < 0 THEN ABS(opening_net + pd_debit - pd_credit) ELSE 0.00 END AS cl_credit
        FROM direct_netted
    )
    SELECT 
        COALESCE(SUM(op_debit), 0.00),
        COALESCE(SUM(op_credit), 0.00),
        COALESCE(SUM(pd_debit), 0.00),
        COALESCE(SUM(pd_credit), 0.00),
        COALESCE(SUM(cl_debit), 0.00),
        COALESCE(SUM(cl_credit), 0.00)
    INTO v_tot_op_debit, v_tot_op_credit, v_tot_pd_debit, v_tot_pd_credit, v_tot_cl_debit, v_tot_cl_credit
    FROM direct_fully_calculated;

    v_period_difference := ABS(v_tot_pd_debit - v_tot_pd_credit);
    v_is_period_balanced := (v_period_difference < 0.01);
    v_closing_difference := ABS(v_tot_cl_debit - v_tot_cl_credit);
    v_is_closing_balanced := (v_closing_difference < 0.01);
    v_is_balanced := (v_is_period_balanced AND v_is_closing_balanced);

    -- Build recursive tree rollup for reporting hierarchy
    WITH RECURSIVE account_tree AS (
        SELECT id AS ancestor_id, id AS descendant_id
        FROM public.accounts
        WHERE organization_id = p_org_id
        
        UNION ALL
        
        SELECT t.ancestor_id, a.id AS descendant_id
        FROM account_tree t
        JOIN public.accounts a ON a.parent_id = t.descendant_id
        WHERE a.organization_id = p_org_id
    ),
    direct_balances_tree AS (
        SELECT 
            a.id AS account_id,
            COALESCE(SUM(CASE WHEN je.entry_date < p_date_from THEN l.debit ELSE 0.00 END), 0.00) AS direct_opening_debit,
            COALESCE(SUM(CASE WHEN je.entry_date < p_date_from THEN l.credit ELSE 0.00 END), 0.00) AS direct_opening_credit,
            COALESCE(SUM(CASE WHEN je.entry_date >= p_date_from AND je.entry_date <= p_date_to THEN l.debit ELSE 0.00 END), 0.00) AS direct_period_debit,
            COALESCE(SUM(CASE WHEN je.entry_date >= p_date_from AND je.entry_date <= p_date_to THEN l.credit ELSE 0.00 END), 0.00) AS direct_period_credit
        FROM public.accounts a
        LEFT JOIN public.journal_entry_lines l ON l.account_id = a.id AND l.organization_id = p_org_id
        LEFT JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id AND je.status = 'posted'
             AND je.fiscal_year_id = p_fiscal_year_id
             AND (
                 NOT p_exclude_closing_entries 
                 OR je.reference IS NULL 
                 OR NOT (je.reference LIKE 'YEAR-CLOSE%')
             )
        WHERE a.organization_id = p_org_id
        GROUP BY a.id
    ),
    rolled_up_balances AS (
        SELECT 
            t.ancestor_id AS account_id,
            SUM(db.direct_opening_debit) AS rolled_opening_debit,
            SUM(db.direct_opening_credit) AS rolled_opening_credit,
            SUM(db.direct_period_debit) AS rolled_period_debit,
            SUM(db.direct_period_credit) AS rolled_period_credit
        FROM account_tree t
        JOIN direct_balances_tree db ON db.account_id = t.descendant_id
        GROUP BY t.ancestor_id
    ),
    net_balances_calc AS (
        SELECT 
            a.id AS account_id,
            a.code,
            a.name_ar,
            a.name_en,
            a.classification,
            a.nature,
            a.level,
            a.parent_id,
            a.allow_direct_posting,
            a.is_active,
            a.is_system,
            
            -- Unified signed opening net balance
            (rb.rolled_opening_debit - rb.rolled_opening_credit) AS opening_net,
            rb.rolled_period_debit AS pd_debit,
            rb.rolled_period_credit AS pd_credit
        FROM public.accounts a
        JOIN rolled_up_balances rb ON rb.account_id = a.id
        WHERE a.organization_id = p_org_id
    ),
    fully_calculated_accounts AS (
        SELECT 
            n.account_id,
            n.code,
            n.name_ar,
            n.name_en,
            n.classification,
            n.nature,
            n.level,
            n.parent_id,
            n.allow_direct_posting,
            n.is_active,
            n.is_system,
            
            CASE WHEN n.opening_net > 0 THEN n.opening_net ELSE 0.00 END AS opening_debit,
            CASE WHEN n.opening_net < 0 THEN ABS(n.opening_net) ELSE 0.00 END AS opening_credit,
            n.pd_debit AS period_debit,
            n.pd_credit AS period_credit,
            
            CASE WHEN (n.opening_net + n.pd_debit - n.pd_credit) > 0 THEN (n.opening_net + n.pd_debit - n.pd_credit) ELSE 0.00 END AS closing_debit,
            CASE WHEN (n.opening_net + n.pd_debit - n.pd_credit) < 0 THEN ABS(n.opening_net + n.pd_debit - n.pd_credit) ELSE 0.00 END AS closing_credit,
            
            (n.opening_net + n.pd_debit - n.pd_credit) AS net_balance
        FROM net_balances_calc n
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'account_id', account_id,
        'code', code,
        'name_ar', name_ar,
        'name_en', name_en,
        'classification', classification,
        'nature', nature,
        'level', level,
        'parent_id', parent_id,
        'allow_direct_posting', allow_direct_posting,
        'is_active', is_active,
        'is_system', is_system,
        'opening_debit', opening_debit,
        'opening_credit', opening_credit,
        'period_debit', period_debit,
        'period_credit', period_credit,
        'closing_debit', closing_debit,
        'closing_credit', closing_credit,
        'net_balance', net_balance
    ) ORDER BY code ASC), '[]'::jsonb)
    INTO v_accounts_array
    FROM fully_calculated_accounts
    WHERE 
        -- include_parent_accounts filter
        (p_include_parent_accounts OR account_id NOT IN (
            SELECT DISTINCT parent_id FROM public.accounts WHERE parent_id IS NOT NULL AND organization_id = p_org_id
        ))
        AND
        -- include_zero_accounts filter
        (p_include_zero_accounts OR NOT (
            opening_debit = 0.00 AND opening_credit = 0.00 AND 
            period_debit = 0.00 AND period_credit = 0.00 AND 
            closing_debit = 0.00 AND closing_credit = 0.00
        ));

    RETURN jsonb_build_object(
        'date_from', p_date_from,
        'date_to', p_date_to,
        'fiscal_year_id', p_fiscal_year_id,
        'include_zero_accounts', p_include_zero_accounts,
        'include_parent_accounts', p_include_parent_accounts,
        'exclude_closing_entries', p_exclude_closing_entries,
        'totals', jsonb_build_object(
            'opening_debit', v_tot_op_debit,
            'opening_credit', v_tot_op_credit,
            'period_debit', v_tot_pd_debit,
            'period_credit', v_tot_pd_credit,
            'closing_debit', v_tot_cl_debit,
            'closing_credit', v_tot_cl_credit,
            'period_difference', v_period_difference,
            'closing_difference', v_closing_difference,
            'is_period_balanced', v_is_period_balanced,
            'is_closing_balanced', v_is_closing_balanced,
            'is_balanced', v_is_balanced,
            'difference', v_closing_difference
        ),
        'accounts', v_accounts_array
    );
END;
$$;


-- 2. Redefine public.get_ledger_report_advanced with mandatory fiscal year, unified signed balance & deterministic sorting
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

    -- Verify account exists in organization
    SELECT code, name_ar, name_en, classification, nature
    INTO v_account_code, v_account_name_ar, v_account_name_en, v_classification, v_nature
    FROM public.accounts
    WHERE id = p_account_id AND organization_id = p_org_id;

    IF v_account_code IS NULL THEN
        RAISE EXCEPTION 'الحساب غير موجود أو لا يتبع المنشأة.';
    END IF;

    -- Fiscal year validation
    SELECT start_date, end_date INTO v_fy_start, v_fy_end
    FROM public.fiscal_years
    WHERE id = p_fiscal_year_id AND organization_id = p_org_id;

    IF v_fy_start IS NULL THEN
        RAISE EXCEPTION 'السنة المالية المحددة غير موجودة أو لا تتبع المنشأة.';
    END IF;

    IF p_date_from < v_fy_start OR p_date_to > v_fy_end THEN
        RAISE EXCEPTION 'الفترة المحددة تقع خارج نطاق السنة المالية المحددة.';
    END IF;

    -- Calculate opening balance (prior postings) using unified signed equation: debit - credit
    SELECT COALESCE(SUM(l.debit - l.credit), 0.00)
    INTO v_opening_balance
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON l.journal_entry_id = je.id
    WHERE l.organization_id = p_org_id
      AND l.account_id = p_account_id
      AND je.status = 'posted'
      AND je.fiscal_year_id = p_fiscal_year_id
      AND je.entry_date < p_date_from
      AND (
          NOT p_exclude_closing_entries 
          OR je.reference IS NULL 
          OR NOT (je.reference LIKE 'YEAR-CLOSE%')
      );

    IF v_opening_balance > 0 THEN
        v_opening_debit := v_opening_balance;
        v_opening_credit := 0.00;
    ELSIF v_opening_balance < 0 THEN
        v_opening_debit := 0.00;
        v_opening_credit := ABS(v_opening_balance);
    END IF;

    -- Fetch period statistics
    SELECT 
        COALESCE(SUM(l.debit), 0.00),
        COALESCE(SUM(l.credit), 0.00)
    INTO v_period_debit, v_period_credit
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON l.journal_entry_id = je.id
    WHERE l.organization_id = p_org_id
      AND l.account_id = p_account_id
      AND je.status = 'posted'
      AND je.fiscal_year_id = p_fiscal_year_id
      AND je.entry_date >= p_date_from
      AND je.entry_date <= p_date_to
      AND (
          NOT p_exclude_closing_entries 
          OR je.reference IS NULL 
          OR NOT (je.reference LIKE 'YEAR-CLOSE%')
      );

    -- Calculate closing balance using unified signed equation: opening + period_debit - period_credit
    v_closing_balance := v_opening_balance + v_period_debit - v_period_credit;

    IF v_closing_balance > 0 THEN
        v_closing_debit := v_closing_balance;
        v_closing_credit := 0.00;
    ELSIF v_closing_balance < 0 THEN
        v_closing_debit := 0.00;
        v_closing_credit := ABS(v_closing_balance);
    END IF;

    -- Fetch detailed entries with Running Balance
    -- Ordered precisely and chronologically: (entry_date, entry_number, journal_entry_id, line_id)
    WITH period_lines AS (
        SELECT 
            l.id AS line_id,
            je.id AS entry_id,
            je.entry_date,
            je.entry_number,
            je.reference,
            je.description AS entry_description,
            l.description AS line_description,
            l.debit,
            l.credit,
            je.source_type,
            je.source_id,
            je.created_at,
            CASE 
                WHEN je.reference LIKE 'YEAR-CLOSE%' THEN true 
                ELSE false 
            END AS is_closing_entry
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON l.journal_entry_id = je.id
        WHERE l.organization_id = p_org_id
          AND l.account_id = p_account_id
          AND je.status = 'posted'
          AND je.fiscal_year_id = p_fiscal_year_id
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
          AND (
              NOT p_exclude_closing_entries 
              OR je.reference IS NULL 
              OR NOT (je.reference LIKE 'YEAR-CLOSE%')
          )
    ),
    calculated_running AS (
        SELECT 
            entry_id,
            line_id,
            entry_date::text AS entry_date_str,
            entry_number,
            COALESCE(reference, entry_number) AS reference,
            COALESCE(line_description, entry_description, '') AS description,
            debit,
            credit,
            source_type,
            source_id,
            is_closing_entry,
            v_opening_balance + (
                (SUM(debit) OVER (ORDER BY entry_date ASC, entry_number ASC, entry_id ASC, line_id ASC)) - 
                (SUM(credit) OVER (ORDER BY entry_date ASC, entry_number ASC, entry_id ASC, line_id ASC))
            ) AS running_balance,
            entry_date AS sort_entry_date,
            entry_number AS sort_entry_number,
            entry_id AS sort_entry_id,
            line_id AS sort_line_id
        FROM period_lines
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'entry_id', entry_id,
        'journal_entry_id', entry_id,
        'line_id', line_id,
        'journal_entry_line_id', line_id,
        'entry_date', entry_date_str,
        'entry_number', entry_number,
        'reference', reference,
        'description', description,
        'debit', debit,
        'credit', credit,
        'source_type', source_type,
        'source_id', source_id,
        'is_closing_entry', is_closing_entry,
        'running_balance', running_balance
    ) ORDER BY sort_entry_date ASC, sort_entry_number ASC, sort_entry_id ASC, sort_line_id ASC), '[]'::jsonb)
    INTO v_entries_array
    FROM calculated_running;

    RETURN jsonb_build_object(
        'account', jsonb_build_object(
            'id', p_account_id,
            'code', v_account_code,
            'name_ar', v_account_name_ar,
            'name_en', v_account_name_en,
            'classification', v_classification,
            'nature', v_nature
        ),
        'account_id', p_account_id,
        'account_code', v_account_code,
        'account_name', v_account_name_ar,
        'date_from', p_date_from,
        'date_to', p_date_to,
        'fiscal_year_id', p_fiscal_year_id,
        'exclude_closing_entries', p_exclude_closing_entries,
        'opening_balance', v_opening_balance,
        'opening_debit', v_opening_debit,
        'opening_credit', v_opening_credit,
        'period_debit', v_period_debit,
        'period_credit', v_period_credit,
        'total_debit', v_period_debit,
        'total_credit', v_period_credit,
        'closing_balance', v_closing_balance,
        'closing_debit', v_closing_debit,
        'closing_credit', v_closing_credit,
        'movement_count', jsonb_array_length(v_entries_array),
        'entries', v_entries_array
    );
END;
$$;


-- Secure grants
REVOKE ALL ON FUNCTION public.get_trial_balance_advanced(uuid, date, date, boolean, boolean, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_trial_balance_advanced(uuid, date, date, boolean, boolean, boolean, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_trial_balance_advanced(uuid, date, date, boolean, boolean, boolean, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_ledger_report_advanced(uuid, uuid, date, date, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ledger_report_advanced(uuid, uuid, date, date, boolean, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ledger_report_advanced(uuid, uuid, date, date, boolean, uuid) TO authenticated;

COMMIT;
