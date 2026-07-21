-- ==========================================================
-- LEDGRA FINANCIAL RECONCILIATION - REP-1B
-- ==========================================================

BEGIN;

-- 1. Redefine public.get_trial_balance_advanced with absolute precision and verification
CREATE OR REPLACE FUNCTION public.get_trial_balance_advanced(
  p_org_id uuid,
  p_date_from date,
  p_date_to date,
  p_include_zero_accounts boolean default false,
  p_include_parent_accounts boolean default true,
  p_exclude_closing_entries boolean default true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_accounts_array jsonb := '[]'::jsonb;
    v_tot_op_debit numeric(15,2) := 0.00;
    v_tot_op_credit numeric(15,2) := 0.00;
    v_tot_pd_debit numeric(15,2) := 0.00;
    v_tot_pd_credit numeric(15,2) := 0.00;
    v_tot_cl_debit numeric(15,2) := 0.00;
    v_tot_cl_credit numeric(15,2) := 0.00;
    v_is_balanced boolean := true;
    v_difference numeric(15,2) := 0.00;
BEGIN
    -- Auth verification
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_view_financial_reports(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.';
    END IF;

    -- Calculate Totals based strictly on direct/non-rolled-up leaf accounts to prevent double counting
    WITH direct_balances AS (
        SELECT 
            a.id AS account_id,
            a.nature,
            COALESCE(SUM(CASE WHEN je.entry_date < p_date_from THEN l.debit ELSE 0.00 END), 0.00) AS direct_opening_debit,
            COALESCE(SUM(CASE WHEN je.entry_date < p_date_from THEN l.credit ELSE 0.00 END), 0.00) AS direct_opening_credit,
            COALESCE(SUM(CASE WHEN je.entry_date >= p_date_from AND je.entry_date <= p_date_to THEN l.debit ELSE 0.00 END), 0.00) AS direct_period_debit,
            COALESCE(SUM(CASE WHEN je.entry_date >= p_date_from AND je.entry_date <= p_date_to THEN l.credit ELSE 0.00 END), 0.00) AS direct_period_credit
        FROM public.accounts a
        LEFT JOIN public.journal_entry_lines l ON l.account_id = a.id AND l.organization_id = p_org_id
        LEFT JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id AND je.status = 'posted'
             AND (
                 NOT p_exclude_closing_entries 
                 OR je.reference IS NULL 
                 OR NOT (je.reference LIKE 'YEAR-CLOSE%')
             )
        WHERE a.organization_id = p_org_id
        GROUP BY a.id, a.nature
    ),
    direct_netted AS (
        SELECT 
            account_id,
            nature,
            -- Netted Opening balances per account's nature
            CASE 
                WHEN nature = 'debit' THEN
                    CASE 
                        WHEN (direct_opening_debit - direct_opening_credit) >= 0 THEN (direct_opening_debit - direct_opening_credit)
                        ELSE 0.00
                    END
                ELSE
                    CASE 
                        WHEN (direct_opening_credit - direct_opening_debit) < 0 THEN (direct_opening_debit - direct_opening_credit)
                        ELSE 0.00
                    END
            END AS op_debit,
            CASE 
                WHEN nature = 'credit' THEN
                    CASE 
                        WHEN (direct_opening_credit - direct_opening_debit) >= 0 THEN (direct_opening_credit - direct_opening_debit)
                        ELSE 0.00
                    END
                ELSE
                    CASE 
                        WHEN (direct_opening_debit - direct_opening_credit) < 0 THEN (direct_opening_credit - direct_opening_debit)
                        ELSE 0.00
                    END
            END AS op_credit,
            direct_period_debit AS pd_debit,
            direct_period_credit AS pd_credit
        FROM direct_balances
    ),
    direct_fully_calculated AS (
        SELECT 
            d.account_id,
            d.op_debit,
            d.op_credit,
            d.pd_debit,
            d.pd_credit,
            -- Closing balances (op + period netted out)
            CASE 
                WHEN d.nature = 'debit' THEN
                    CASE 
                        WHEN ((d.op_debit + d.pd_debit) - (d.op_credit + d.pd_credit)) >= 0 THEN ((d.op_debit + d.pd_debit) - (d.op_credit + d.pd_credit))
                        ELSE 0.00
                    END
                ELSE
                    CASE 
                        WHEN ((d.op_debit + d.pd_debit) - (d.op_credit + d.pd_credit)) < 0 THEN ABS((d.op_debit + d.pd_debit) - (d.op_credit + d.pd_credit))
                        ELSE 0.00
                    END
            END AS cl_debit,
            CASE 
                WHEN d.nature = 'credit' THEN
                    CASE 
                        WHEN ((d.op_credit + d.pd_credit) - (d.op_debit + d.pd_debit)) >= 0 THEN ((d.op_credit + d.pd_credit) - (d.op_debit + d.pd_debit))
                        ELSE 0.00
                    END
                ELSE
                    CASE 
                        WHEN ((d.op_credit + d.pd_credit) - (d.op_debit + d.pd_debit)) < 0 THEN ABS((d.op_credit + d.pd_credit) - (d.op_debit + d.pd_debit))
                        ELSE 0.00
                    END
            END AS cl_credit
        FROM direct_netted d
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

    v_difference := ABS(v_tot_cl_debit - v_tot_cl_credit);
    v_is_balanced := (v_difference < 0.01);

    -- Build recursive tree rollup for beautiful reporting hierarchy
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
            
            -- Net Opening based on natural balance
            CASE 
                WHEN a.nature = 'debit' THEN
                    CASE 
                        WHEN (rb.rolled_opening_debit - rb.rolled_opening_credit) >= 0 THEN (rb.rolled_opening_debit - rb.rolled_opening_credit)
                        ELSE 0.00
                    END
                ELSE
                    CASE 
                        WHEN (rb.rolled_opening_credit - rb.rolled_opening_debit) < 0 THEN (rb.rolled_opening_debit - rb.rolled_opening_credit)
                        ELSE 0.00
                    END
            END AS op_debit,
            
            CASE 
                WHEN a.nature = 'credit' THEN
                    CASE 
                        WHEN (rb.rolled_opening_credit - rb.rolled_opening_debit) >= 0 THEN (rb.rolled_opening_credit - rb.rolled_opening_debit)
                        ELSE 0.00
                    END
                ELSE
                    CASE 
                        WHEN (rb.rolled_opening_debit - rb.rolled_opening_credit) < 0 THEN (rb.rolled_opening_credit - rb.rolled_opening_debit)
                        ELSE 0.00
                    END
            END AS op_credit,
            
            rb.rolled_period_debit AS pd_debit,
            rb.rolled_period_credit AS pd_credit
        FROM public.accounts a
        JOIN rolled_up_balances rb ON rb.account_id = a.id
        WHERE a.organization_id = p_org_id
    ),
    final_balances AS (
        SELECT 
            n.*,
            CASE 
                WHEN n.nature = 'debit' THEN
                    (n.op_debit + n.pd_debit) - (n.op_credit + n.pd_credit)
                ELSE
                    (n.op_credit + n.pd_credit) - (n.op_debit + n.pd_debit)
            END AS raw_net_closing
        FROM net_balances_calc n
    ),
    fully_calculated_accounts AS (
        SELECT 
            f.account_id,
            f.code,
            f.name_ar,
            f.name_en,
            f.classification,
            f.nature,
            f.level,
            f.parent_id,
            f.allow_direct_posting,
            f.is_active,
            f.is_system,
            f.op_debit AS opening_debit,
            f.op_credit AS opening_credit,
            f.pd_debit AS period_debit,
            f.pd_credit AS period_credit,
            
            -- Closing debit/credit
            CASE 
                WHEN f.nature = 'debit' THEN
                    CASE 
                        WHEN f.raw_net_closing >= 0 THEN f.raw_net_closing
                        ELSE 0.00
                    END
                ELSE
                    CASE 
                        WHEN f.raw_net_closing < 0 THEN ABS(f.raw_net_closing)
                        ELSE 0.00
                    END
            END AS closing_debit,
            
            CASE 
                WHEN f.nature = 'credit' THEN
                    CASE 
                        WHEN f.raw_net_closing >= 0 THEN f.raw_net_closing
                        ELSE 0.00
                    END
                ELSE
                    CASE 
                        WHEN f.raw_net_closing < 0 THEN ABS(f.raw_net_closing)
                        ELSE 0.00
                    END
            END AS closing_credit,
            
            f.raw_net_closing AS net_balance
        FROM final_balances f
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
        -- include_zero_accounts filter (shows non-zero or active/inactive historical ones)
        (p_include_zero_accounts OR NOT (
            opening_debit = 0.00 AND opening_credit = 0.00 AND 
            period_debit = 0.00 AND period_credit = 0.00 AND 
            closing_debit = 0.00 AND closing_credit = 0.00
        ));

    RETURN jsonb_build_object(
        'date_from', p_date_from,
        'date_to', p_date_to,
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
            'is_balanced', v_is_balanced,
            'difference', v_difference
        ),
        'accounts', v_accounts_array
    );
END;
$$;


-- 2. Redefine public.get_ledger_report_advanced with absolute chronological determinism
-- This enforces sorting by (entry_date, entry_number, journal_entry_id, journal_entry_line_id)
CREATE OR REPLACE FUNCTION public.get_ledger_report_advanced(
  p_org_id uuid,
  p_account_id uuid,
  p_date_from date,
  p_date_to date,
  p_exclude_closing_entries boolean default false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_account_code text;
    v_account_name_ar text;
    v_account_name_en text;
    v_classification text;
    v_nature text;
    v_opening_balance numeric(15,2) := 0.00;
    v_period_debit numeric(15,2) := 0.00;
    v_period_credit numeric(15,2) := 0.00;
    v_closing_balance numeric(15,2) := 0.00;
    v_entries_array jsonb := '[]'::jsonb;
BEGIN
    -- Auth role verification
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.can_view_financial_reports(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.';
    END IF;

    -- Verify account exists in organization
    SELECT code, name_ar, name_en, classification, nature
    INTO v_account_code, v_account_name_ar, v_account_name_en, v_classification, v_nature
    FROM public.accounts
    WHERE id = p_account_id AND organization_id = p_org_id;

    IF v_account_code IS NULL THEN
        RAISE EXCEPTION 'الحساب غير موجود أو لا يتبع المنشأة.';
    END IF;

    -- Calculate opening balance (prior postings)
    SELECT COALESCE(SUM(l.debit - l.credit), 0.00)
    INTO v_opening_balance
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON l.journal_entry_id = je.id
    WHERE l.organization_id = p_org_id
      AND l.account_id = p_account_id
      AND je.status = 'posted'
      AND je.entry_date < p_date_from
      AND (
          NOT p_exclude_closing_entries 
          OR je.reference IS NULL 
          OR NOT (je.reference LIKE 'YEAR-CLOSE%')
      );

    -- Adjust opening balance sign based on natural balance of account
    IF v_nature = 'credit' THEN
        v_opening_balance := -v_opening_balance;
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
      AND je.entry_date >= p_date_from
      AND je.entry_date <= p_date_to
      AND (
          NOT p_exclude_closing_entries 
          OR je.reference IS NULL 
          OR NOT (je.reference LIKE 'YEAR-CLOSE%')
      );

    -- Calculate closing balance based on nature
    IF v_nature = 'debit' THEN
        v_closing_balance := v_opening_balance + v_period_debit - v_period_credit;
    ELSE
        v_closing_balance := v_opening_balance + v_period_credit - v_period_debit;
    END IF;

    -- Fetch detailed entries with Running Balance
    -- Ordered precisely and chronologically for deterministic running balances
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
            entry_date::text AS entry_date_str,
            COALESCE(reference, entry_number) AS reference,
            COALESCE(line_description, entry_description, '') AS description,
            debit,
            credit,
            source_type,
            source_id,
            is_closing_entry,
            v_opening_balance + CASE 
                WHEN v_nature = 'debit' THEN
                    (SUM(debit) OVER (ORDER BY entry_date ASC, entry_number ASC, entry_id ASC, line_id ASC)) - 
                    (SUM(credit) OVER (ORDER BY entry_date ASC, entry_number ASC, entry_id ASC, line_id ASC))
                ELSE
                    (SUM(credit) OVER (ORDER BY entry_date ASC, entry_number ASC, entry_id ASC, line_id ASC)) - 
                    (SUM(debit) OVER (ORDER BY entry_date ASC, entry_number ASC, entry_id ASC, line_id ASC))
            END AS running_balance,
            entry_date AS sort_entry_date,
            entry_number AS sort_entry_number,
            entry_id AS sort_entry_id,
            line_id AS sort_line_id
        FROM period_lines
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'entry_id', entry_id,
        'entry_date', entry_date_str,
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
        'date_from', p_date_from,
        'date_to', p_date_to,
        'exclude_closing_entries', p_exclude_closing_entries,
        'opening_balance', v_opening_balance,
        'total_debit', v_period_debit,
        'total_credit', v_period_credit,
        'closing_balance', v_closing_balance,
        'entries', v_entries_array
    );
END;
$$;


-- Secure grants
REVOKE ALL ON FUNCTION public.get_trial_balance_advanced(uuid, date, date, boolean, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_trial_balance_advanced(uuid, date, date, boolean, boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_trial_balance_advanced(uuid, date, date, boolean, boolean, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.get_ledger_report_advanced(uuid, uuid, date, date, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ledger_report_advanced(uuid, uuid, date, date, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ledger_report_advanced(uuid, uuid, date, date, boolean) TO authenticated;

COMMIT;
