-- ==========================================================
-- LEDGRA ADVANCED FINANCIAL REPORTS PHASE C HARDENING
-- ==========================================================

BEGIN;

-- 1. Strengthen public.can_view_financial_reports to require is_active = true
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
          AND COALESCE(is_active, true) = true
    );
$$;

-- Secure grants for helper
REVOKE ALL ON FUNCTION public.can_view_financial_reports(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_financial_reports(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_financial_reports(uuid) TO authenticated;


-- 2. Fixed ledger entries sorting in public.get_ledger_report_advanced
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
    -- If p_exclude_closing_entries is true, exclude closing entries from calculation
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
    -- Ordered chronologically and then by primary keys for absolute determinism
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
                    (SUM(debit) OVER (ORDER BY entry_date ASC, created_at ASC, line_id ASC)) - 
                    (SUM(credit) OVER (ORDER BY entry_date ASC, created_at ASC, line_id ASC))
                ELSE
                    (SUM(credit) OVER (ORDER BY entry_date ASC, created_at ASC, line_id ASC)) - 
                    (SUM(debit) OVER (ORDER BY entry_date ASC, created_at ASC, line_id ASC))
            END AS running_balance,
            entry_date AS sort_entry_date,
            created_at AS sort_created_at,
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
    ) ORDER BY sort_entry_date ASC, sort_created_at ASC, sort_line_id ASC), '[]'::jsonb)
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

-- Secure grants for get_ledger_report_advanced
REVOKE ALL ON FUNCTION public.get_ledger_report_advanced(uuid, uuid, date, date, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ledger_report_advanced(uuid, uuid, date, date, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ledger_report_advanced(uuid, uuid, date, date, boolean) TO authenticated;

COMMIT;
