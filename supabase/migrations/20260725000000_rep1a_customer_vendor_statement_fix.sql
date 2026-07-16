-- ==========================================================
-- LEDGRA REP-1A — Fix Customer & Vendor Statements, Opening Balances and Stable Sorting
-- ==========================================================

BEGIN;

-- 1. Redefine get_customer_statement with robust, secure, and stable calculation
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

    -- Financial report permission check (statically blocks Sales role)
    IF NOT public.can_view_financial_reports(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.';
    END IF;

    -- Check if customer exists and belongs to organization
    IF NOT EXISTS (
        SELECT 1 FROM public.customers 
        WHERE id = p_customer_id AND organization_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'العميل غير موجود أو لا يتبع لهذه المنشأة.';
    END IF;

    -- Fetch customer receivables account and info
    SELECT code, name, receivable_account_id, 
           CASE WHEN opening_balance_type = 'debit' THEN opening_balance ELSE -opening_balance END
    INTO v_customer_code, v_customer_name, v_receivable_account_id, v_cust_opening
    FROM public.customers
    WHERE id = p_customer_id AND organization_id = p_org_id;

    IF v_receivable_account_id IS NULL THEN
        RAISE EXCEPTION 'العميل ليس لديه حساب ذمم مدينة مربوط.';
    END IF;

    -- Check if the account belongs to organization
    IF NOT EXISTS (
        SELECT 1 FROM public.accounts
        WHERE id = v_receivable_account_id AND organization_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'الحساب المرتبط بالعميل غير موجود أو لا يتبع لهذه المنشأة.';
    END IF;

    -- Calculate journal entries sum before p_date_from in AR account
    -- EXCLUDING opening_balance journal entry to avoid double counting with customers.opening_balance
    SELECT COALESCE(SUM(l.debit - l.credit), 0.00)
    INTO v_op_journal
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
    WHERE l.organization_id = p_org_id
      AND l.account_id = v_receivable_account_id
      AND je.status = 'posted'
      AND je.entry_date < p_date_from
      AND je.reference <> 'رصيد افتتاحي'
      AND COALESCE(je.source_type, '') <> 'opening_balance'
      AND NOT EXISTS (
          SELECT 1 FROM public.opening_balance_batches b 
          WHERE b.journal_entry_id = je.id AND b.organization_id = p_org_id
      );

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
            je.id AS entry_id,
            l.id AS line_id
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
        WHERE l.organization_id = p_org_id
          AND l.account_id = v_receivable_account_id
          AND je.status = 'posted'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
          AND je.reference <> 'رصيد افتتاحي'
          AND COALESCE(je.source_type, '') <> 'opening_balance'
          AND NOT EXISTS (
              SELECT 1 FROM public.opening_balance_batches b 
              WHERE b.journal_entry_id = je.id AND b.organization_id = p_org_id
          )
        ORDER BY je.entry_date ASC, je.entry_number ASC, je.id ASC, l.id ASC
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
            entry_id,
            line_id,
            v_opening_balance + SUM(debit - credit) OVER (
                ORDER BY date ASC, journal_number ASC, entry_id ASC, line_id ASC
            ) AS running_balance
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
    ) ORDER BY date ASC, journal_number ASC, entry_id ASC, line_id ASC), '[]'::jsonb)
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
      AND je.entry_date <= p_date_to
      AND je.reference <> 'رصيد افتتاحي'
      AND COALESCE(je.source_type, '') <> 'opening_balance'
      AND NOT EXISTS (
          SELECT 1 FROM public.opening_balance_batches b 
          WHERE b.journal_entry_id = je.id AND b.organization_id = p_org_id
      );

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

-- Secure get_customer_statement function execution
REVOKE ALL ON FUNCTION public.get_customer_statement(uuid, uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_customer_statement(uuid, uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_statement(uuid, uuid, date, date) TO authenticated;


-- 2. Redefine get_vendor_statement with robust, secure, and stable calculation
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

    -- Financial report permission check (statically blocks Sales role)
    IF NOT public.can_view_financial_reports(p_org_id) THEN
        RAISE EXCEPTION 'غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.';
    END IF;

    -- Check if vendor exists and belongs to organization
    IF NOT EXISTS (
        SELECT 1 FROM public.vendors 
        WHERE id = p_vendor_id AND organization_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'المورد غير موجود أو لا يتبع لهذه المنشأة.';
    END IF;

    -- Fetch vendor payables account and info
    SELECT code, name, payable_account_id, 
           CASE WHEN opening_balance_type = 'credit' THEN opening_balance ELSE -opening_balance END
    INTO v_vendor_code, v_vendor_name, v_payable_account_id, v_vend_opening
    FROM public.vendors
    WHERE id = p_vendor_id AND organization_id = p_org_id;

    IF v_payable_account_id IS NULL THEN
        RAISE EXCEPTION 'المورد ليس لديه حساب ذمم دائنة مربوط.';
    END IF;

    -- Check if the account belongs to organization
    IF NOT EXISTS (
        SELECT 1 FROM public.accounts
        WHERE id = v_payable_account_id AND organization_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'الحساب المرتبط بالمورد غير موجود أو لا يتبع لهذه المنشأة.';
    END IF;

    -- Calculate journal entries sum before p_date_from (vendor is credit nature, so credit - debit)
    -- EXCLUDING opening_balance journal entry to avoid double counting with vendors.opening_balance
    SELECT COALESCE(SUM(l.credit - l.debit), 0.00)
    INTO v_op_journal
    FROM public.journal_entry_lines l
    JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
    WHERE l.organization_id = p_org_id
      AND l.account_id = v_payable_account_id
      AND je.status = 'posted'
      AND je.entry_date < p_date_from
      AND je.reference <> 'رصيد افتتاحي'
      AND COALESCE(je.source_type, '') <> 'opening_balance'
      AND NOT EXISTS (
          SELECT 1 FROM public.opening_balance_batches b 
          WHERE b.journal_entry_id = je.id AND b.organization_id = p_org_id
      );

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
            je.id AS entry_id,
            l.id AS line_id
        FROM public.journal_entry_lines l
        JOIN public.journal_entries je ON l.journal_entry_id = je.id AND je.organization_id = p_org_id
        WHERE l.organization_id = p_org_id
          AND l.account_id = v_payable_account_id
          AND je.status = 'posted'
          AND je.entry_date >= p_date_from
          AND je.entry_date <= p_date_to
          AND je.reference <> 'رصيد افتتاحي'
          AND COALESCE(je.source_type, '') <> 'opening_balance'
          AND NOT EXISTS (
              SELECT 1 FROM public.opening_balance_batches b 
              WHERE b.journal_entry_id = je.id AND b.organization_id = p_org_id
          )
        ORDER BY je.entry_date ASC, je.entry_number ASC, je.id ASC, l.id ASC
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
            entry_id,
            line_id,
            v_opening_balance + SUM(credit - debit) OVER (
                ORDER BY date ASC, journal_number ASC, entry_id ASC, line_id ASC
            ) AS running_balance
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
    ) ORDER BY date ASC, journal_number ASC, entry_id ASC, line_id ASC), '[]'::jsonb)
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
      AND je.entry_date <= p_date_to
      AND je.reference <> 'رصيد افتتاحي'
      AND COALESCE(je.source_type, '') <> 'opening_balance'
      AND NOT EXISTS (
          SELECT 1 FROM public.opening_balance_batches b 
          WHERE b.journal_entry_id = je.id AND b.organization_id = p_org_id
      );

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

-- Secure get_vendor_statement function execution
REVOKE ALL ON FUNCTION public.get_vendor_statement(uuid, uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_vendor_statement(uuid, uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_statement(uuid, uuid, date, date) TO authenticated;


COMMIT;

NOTIFY pgrst, 'reload schema';
