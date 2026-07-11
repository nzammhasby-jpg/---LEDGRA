-- Migration: 20260719000000_br1a_bank_reconciliation.sql
-- Goal: BR-1A — Bank Reconciliation / مطابقة الحسابات البنكية

BEGIN;

-- 1. Create table public.bank_reconciliations
CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    cash_bank_account_id uuid NOT NULL REFERENCES public.cash_bank_accounts(id) ON DELETE CASCADE,
    reconciliation_date date NOT NULL,
    book_balance numeric(15,2) NOT NULL DEFAULT 0.00,
    statement_balance numeric(15,2) NOT NULL DEFAULT 0.00,
    difference numeric(15,2) NOT NULL DEFAULT 0.00,
    status text NOT NULL DEFAULT 'draft' CONSTRAINT bank_reconciliations_status_check CHECK (status IN ('draft', 'completed', 'cancelled')),
    notes text NULL,
    completed_by uuid NULL,
    completed_at timestamp with time zone NULL,
    cancelled_by uuid NULL,
    cancelled_at timestamp with time zone NULL,
    cancel_reason text NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Unique constraint: prevent overlapping active reconciliations for the same account on the same date
CREATE UNIQUE INDEX IF NOT EXISTS bank_reconciliations_unique_active_reconciliation_idx 
ON public.bank_reconciliations (organization_id, cash_bank_account_id, reconciliation_date) 
WHERE (status <> 'cancelled');

-- 2. Create table public.bank_reconciliation_lines
CREATE TABLE IF NOT EXISTS public.bank_reconciliation_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id uuid NOT NULL REFERENCES public.bank_reconciliations(id) ON DELETE CASCADE,
    source_type text NOT NULL CONSTRAINT bank_reconciliation_lines_type_check CHECK (source_type IN ('receipt', 'payment', 'transfer', 'journal_entry')),
    source_id uuid NOT NULL,
    transaction_date date NOT NULL,
    description text,
    debit_amount numeric(15,2) NOT NULL DEFAULT 0.00 CONSTRAINT bank_reconciliation_lines_debit_amount_check CHECK (debit_amount >= 0),
    credit_amount numeric(15,2) NOT NULL DEFAULT 0.00 CONSTRAINT bank_reconciliation_lines_credit_amount_check CHECK (credit_amount >= 0),
    amount numeric(15,2) NOT NULL DEFAULT 0.00,
    is_matched boolean NOT NULL DEFAULT false,
    matched_at timestamp with time zone NULL,
    notes text NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS bank_reconciliations_org_account_idx ON public.bank_reconciliations (organization_id, cash_bank_account_id);
CREATE INDEX IF NOT EXISTS bank_reconciliation_lines_rec_idx ON public.bank_reconciliation_lines (reconciliation_id);

-- 3. Enable RLS
ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliation_lines ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies
DROP POLICY IF EXISTS bank_reconciliations_select ON public.bank_reconciliations;
CREATE POLICY bank_reconciliations_select ON public.bank_reconciliations
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_members.organization_id = bank_reconciliations.organization_id
              AND organization_members.profile_id = auth.uid()
              AND organization_members.role IN ('owner', 'admin', 'accountant', 'viewer')
              AND COALESCE(organization_members.is_active, true) = true
        )
    );

DROP POLICY IF EXISTS bank_reconciliation_lines_select ON public.bank_reconciliation_lines;
CREATE POLICY bank_reconciliation_lines_select ON public.bank_reconciliation_lines
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.bank_reconciliations br
            JOIN public.organization_members om ON br.organization_id = om.organization_id
            WHERE br.id = bank_reconciliation_lines.reconciliation_id
              AND om.profile_id = auth.uid()
              AND om.role IN ('owner', 'admin', 'accountant', 'viewer')
              AND COALESCE(om.is_active, true) = true
        )
    );

-- Revoke all direct modification rights (force writing via SECURITY DEFINER functions)
REVOKE ALL ON TABLE public.bank_reconciliations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bank_reconciliation_lines FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.bank_reconciliations TO authenticated;
GRANT SELECT ON TABLE public.bank_reconciliation_lines TO authenticated;

-- 5. Create RPC: create_bank_reconciliation
CREATE OR REPLACE FUNCTION public.create_bank_reconciliation(
  p_organization_id uuid,
  p_cash_bank_account_id uuid,
  p_reconciliation_date date,
  p_statement_balance numeric,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec_id uuid;
    v_role text;
    v_linked_account_id uuid;
    v_account_opening_balance numeric(15,2);
    v_prior_matched_sum numeric(15,2);
    v_reconciled_opening_balance numeric(15,2);
    v_book_balance numeric(15,2);
    v_receipts_sum numeric(15,2);
    v_payments_sum numeric(15,2);
    v_transfers_in_sum numeric(15,2);
    v_transfers_out_sum numeric(15,2);
    v_manual_je_sum numeric(15,2);
    v_initial_difference numeric(15,2);
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Privilege check
    SELECT role INTO v_role
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND profile_id = auth.uid()
      AND COALESCE(is_active, true) = true;

    IF v_role IS NULL OR v_role = 'sales' OR v_role = 'viewer' THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية متاحة للمالك، المدير، أو المحاسب فقط.';
    END IF;

    -- Validate cash_bank_account belongs to organization
    SELECT account_id, COALESCE(opening_balance, 0)
    INTO v_linked_account_id, v_account_opening_balance
    FROM public.cash_bank_accounts
    WHERE id = p_cash_bank_account_id AND organization_id = p_organization_id AND is_active = true;

    IF v_linked_account_id IS NULL THEN
        RAISE EXCEPTION 'الحساب البنكي/الصندوق المحدد غير موجود أو غير نشط في هذه المنشأة.';
    END IF;

    -- Calculate reconciled opening balance (opening_balance + historically matched transactions)
    SELECT COALESCE(SUM(brl.amount), 0) INTO v_prior_matched_sum
    FROM public.bank_reconciliation_lines brl
    JOIN public.bank_reconciliations br ON brl.reconciliation_id = br.id
    WHERE br.cash_bank_account_id = p_cash_bank_account_id
      AND br.organization_id = p_organization_id
      AND br.status = 'completed'
      AND brl.is_matched = true;

    v_reconciled_opening_balance := v_account_opening_balance + v_prior_matched_sum;

    -- Calculate total book balance up to p_reconciliation_date
    -- A) Receipts
    SELECT COALESCE(SUM(amount), 0) INTO v_receipts_sum
    FROM public.receipts
    WHERE cash_bank_account_id = p_cash_bank_account_id
      AND organization_id = p_organization_id
      AND status = 'approved'
      AND receipt_date <= p_reconciliation_date;

    -- B) Payments
    SELECT COALESCE(SUM(amount), 0) INTO v_payments_sum
    FROM public.payments
    WHERE cash_bank_account_id = p_cash_bank_account_id
      AND organization_id = p_organization_id
      AND status = 'approved'
      AND payment_date <= p_reconciliation_date;

    -- C) Transfers In
    SELECT COALESCE(SUM(amount), 0) INTO v_transfers_in_sum
    FROM public.cash_bank_transfers
    WHERE to_cash_bank_account_id = p_cash_bank_account_id
      AND organization_id = p_organization_id
      AND status = 'approved'
      AND transfer_date <= p_reconciliation_date;

    -- D) Transfers Out
    SELECT COALESCE(SUM(amount), 0) INTO v_transfers_out_sum
    FROM public.cash_bank_transfers
    WHERE from_cash_bank_account_id = p_cash_bank_account_id
      AND organization_id = p_organization_id
      AND status = 'approved'
      AND transfer_date <= p_reconciliation_date;

    -- E) Manual Journal Entries
    SELECT COALESCE(SUM(jel.debit - jel.credit), 0) INTO v_manual_je_sum
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON jel.journal_entry_id = je.id AND jel.organization_id = je.organization_id
    WHERE jel.account_id = v_linked_account_id
      AND jel.organization_id = p_organization_id
      AND je.status = 'posted'
      AND je.source_type = 'manual'
      AND je.entry_date <= p_reconciliation_date;

    v_book_balance := v_account_opening_balance + v_receipts_sum - v_payments_sum + v_transfers_in_sum - v_transfers_out_sum + v_manual_je_sum;

    -- Initial difference (when no lines are matched yet, difference is between current reconciled opening balance and statement_balance)
    v_initial_difference := v_reconciled_opening_balance - p_statement_balance;

    -- Insert reconciliation session
    INSERT INTO public.bank_reconciliations (
        organization_id,
        cash_bank_account_id,
        reconciliation_date,
        book_balance,
        statement_balance,
        difference,
        status,
        notes,
        created_by
    )
    VALUES (
        p_organization_id,
        p_cash_bank_account_id,
        p_reconciliation_date,
        v_book_balance,
        p_statement_balance,
        v_initial_difference,
        'draft',
        p_notes,
        auth.uid()
    )
    RETURNING id INTO v_rec_id;

    -- Populate lines
    -- Receipts
    INSERT INTO public.bank_reconciliation_lines (
        reconciliation_id,
        source_type,
        source_id,
        transaction_date,
        description,
        debit_amount,
        credit_amount,
        amount,
        is_matched
    )
    SELECT 
        v_rec_id,
        'receipt',
        r.id,
        r.receipt_date,
        COALESCE(r.notes, 'سند قبض رقم: ' || r.receipt_number),
        r.amount,
        0,
        r.amount,
        false
    FROM public.receipts r
    WHERE r.cash_bank_account_id = p_cash_bank_account_id
      AND r.organization_id = p_organization_id
      AND r.status = 'approved'
      AND r.receipt_date <= p_reconciliation_date
      AND NOT EXISTS (
          SELECT 1 
          FROM public.bank_reconciliation_lines brl
          JOIN public.bank_reconciliations br ON brl.reconciliation_id = br.id
          WHERE brl.source_type = 'receipt'
            AND brl.source_id = r.id
            AND brl.is_matched = true
            AND br.status = 'completed'
      );

    -- Payments
    INSERT INTO public.bank_reconciliation_lines (
        reconciliation_id,
        source_type,
        source_id,
        transaction_date,
        description,
        debit_amount,
        credit_amount,
        amount,
        is_matched
    )
    SELECT 
        v_rec_id,
        'payment',
        p.id,
        p.payment_date,
        COALESCE(p.notes, 'سند صرف رقم: ' || p.payment_number),
        0,
        p.amount,
        -p.amount,
        false
    FROM public.payments p
    WHERE p.cash_bank_account_id = p_cash_bank_account_id
      AND p.organization_id = p_organization_id
      AND p.status = 'approved'
      AND p.payment_date <= p_reconciliation_date
      AND NOT EXISTS (
          SELECT 1 
          FROM public.bank_reconciliation_lines brl
          JOIN public.bank_reconciliations br ON brl.reconciliation_id = br.id
          WHERE brl.source_type = 'payment'
            AND brl.source_id = p.id
            AND brl.is_matched = true
            AND br.status = 'completed'
      );

    -- Transfers
    INSERT INTO public.bank_reconciliation_lines (
        reconciliation_id,
        source_type,
        source_id,
        transaction_date,
        description,
        debit_amount,
        credit_amount,
        amount,
        is_matched
    )
    SELECT 
        v_rec_id,
        'transfer',
        t.id,
        t.transfer_date,
        COALESCE(t.description, 'تحويل داخلي رقم: ' || t.transfer_number),
        CASE WHEN t.to_cash_bank_account_id = p_cash_bank_account_id THEN t.amount ELSE 0 END,
        CASE WHEN t.from_cash_bank_account_id = p_cash_bank_account_id THEN t.amount ELSE 0 END,
        CASE WHEN t.to_cash_bank_account_id = p_cash_bank_account_id THEN t.amount ELSE -t.amount END,
        false
    FROM public.cash_bank_transfers t
    WHERE (t.from_cash_bank_account_id = p_cash_bank_account_id OR t.to_cash_bank_account_id = p_cash_bank_account_id)
      AND t.organization_id = p_organization_id
      AND t.status = 'approved'
      AND t.transfer_date <= p_reconciliation_date
      AND NOT EXISTS (
          SELECT 1 
          FROM public.bank_reconciliation_lines brl
          JOIN public.bank_reconciliations br ON brl.reconciliation_id = br.id
          WHERE brl.source_type = 'transfer'
            AND brl.source_id = t.id
            AND brl.is_matched = true
            AND br.status = 'completed'
      );

    -- Manual Journal Entries
    INSERT INTO public.bank_reconciliation_lines (
        reconciliation_id,
        source_type,
        source_id,
        transaction_date,
        description,
        debit_amount,
        credit_amount,
        amount,
        is_matched
    )
    SELECT 
        v_rec_id,
        'journal_entry',
        jel.id,
        je.entry_date,
        COALESCE(jel.description, je.description, 'قيد يومية يدوي رقم: ' || je.entry_number),
        jel.debit,
        jel.credit,
        jel.debit - jel.credit,
        false
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON jel.journal_entry_id = je.id AND jel.organization_id = je.organization_id
    WHERE jel.account_id = v_linked_account_id
      AND jel.organization_id = p_organization_id
      AND je.status = 'posted'
      AND je.source_type = 'manual'
      AND je.entry_date <= p_reconciliation_date
      AND NOT EXISTS (
          SELECT 1 
          FROM public.bank_reconciliation_lines brl
          JOIN public.bank_reconciliations br ON brl.reconciliation_id = br.id
          WHERE brl.source_type = 'journal_entry'
            AND brl.source_id = jel.id
            AND brl.is_matched = true
            AND br.status = 'completed'
      );

    RETURN v_rec_id;
END;
$$;

-- 6. Create RPC: toggle_reconciliation_line
CREATE OR REPLACE FUNCTION public.toggle_reconciliation_line(
  p_line_id uuid,
  p_is_matched boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec_id uuid;
    v_org_id uuid;
    v_role text;
    v_rec_status text;
    v_cash_bank_account_id uuid;
    v_account_opening_balance numeric(15,2);
    v_prior_matched_sum numeric(15,2);
    v_reconciled_opening_balance numeric(15,2);
    v_matched_sum numeric(15,2);
    v_statement_balance numeric(15,2);
    v_new_difference numeric(15,2);
BEGIN
    -- Fetch line and parent details
    SELECT brl.reconciliation_id, br.organization_id, br.status, br.cash_bank_account_id, br.statement_balance
    INTO v_rec_id, v_org_id, v_rec_status, v_cash_bank_account_id, v_statement_balance
    FROM public.bank_reconciliation_lines brl
    JOIN public.bank_reconciliations br ON brl.reconciliation_id = br.id
    WHERE brl.id = p_line_id;

    IF v_rec_id IS NULL THEN
        RAISE EXCEPTION 'سطر المطابقة المحدد غير موجود.';
    END IF;

    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Check roles
    SELECT role INTO v_role
    FROM public.organization_members
    WHERE organization_id = v_org_id
      AND profile_id = auth.uid()
      AND COALESCE(is_active, true) = true;

    IF v_role IS NULL OR v_role = 'sales' OR v_role = 'viewer' THEN
        RAISE EXCEPTION 'غير مصرح: ليس لديك الصلاحيات لتعديل المطابقة البنكية.';
    END IF;

    -- Must be in draft status
    IF v_rec_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن تعديل سطر في مطابقة غير مسودة.';
    END IF;

    -- Toggle line matched status
    UPDATE public.bank_reconciliation_lines
    SET is_matched = p_is_matched,
        matched_at = CASE WHEN p_is_matched THEN now() ELSE NULL END
    WHERE id = p_line_id;

    -- Recalculate reconciled opening balance
    SELECT COALESCE(opening_balance, 0) INTO v_account_opening_balance
    FROM public.cash_bank_accounts
    WHERE id = v_cash_bank_account_id AND organization_id = v_org_id;

    SELECT COALESCE(SUM(brl.amount), 0) INTO v_prior_matched_sum
    FROM public.bank_reconciliation_lines brl
    JOIN public.bank_reconciliations br ON brl.reconciliation_id = br.id
    WHERE br.cash_bank_account_id = v_cash_bank_account_id
      AND br.organization_id = v_org_id
      AND br.status = 'completed'
      AND brl.is_matched = true;

    v_reconciled_opening_balance := v_account_opening_balance + v_prior_matched_sum;

    -- Sum currently matched lines in THIS reconciliation
    SELECT COALESCE(SUM(amount), 0) INTO v_matched_sum
    FROM public.bank_reconciliation_lines
    WHERE reconciliation_id = v_rec_id
      AND is_matched = true;

    -- Calculate new difference
    -- difference = (reconciled_opening_balance + v_matched_sum) - v_statement_balance
    v_new_difference := (v_reconciled_opening_balance + v_matched_sum) - v_statement_balance;

    -- Update parent reconciliation session
    UPDATE public.bank_reconciliations
    SET difference = v_new_difference,
        updated_at = now()
    WHERE id = v_rec_id;
END;
$$;

-- 7. Create RPC: complete_bank_reconciliation
CREATE OR REPLACE FUNCTION public.complete_bank_reconciliation(
  p_reconciliation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_role text;
    v_status text;
    v_difference numeric(15,2);
BEGIN
    -- Get reconciliation details
    SELECT organization_id, status, difference
    INTO v_org_id, v_status, v_difference
    FROM public.bank_reconciliations
    WHERE id = p_reconciliation_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'جلسة المطابقة البنكية المحددة غير موجودة.';
    END IF;

    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Check roles
    SELECT role INTO v_role
    FROM public.organization_members
    WHERE organization_id = v_org_id
      AND profile_id = auth.uid()
      AND COALESCE(is_active, true) = true;

    IF v_role IS NULL OR v_role = 'sales' OR v_role = 'viewer' THEN
        RAISE EXCEPTION 'غير مصرح: ليس لديك الصلاحيات لإكمال المطابقة البنكية.';
    END IF;

    -- Check status
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'يمكن إكمال المطابقات التي في حالة مسودة فقط.';
    END IF;

    -- Check difference is zero
    IF v_difference <> 0 THEN
        RAISE EXCEPTION 'لا يمكن إكمال المطابقة قبل تسوية الفرق بالكامل (يجب أن يكون الفرق صفراً).';
    END IF;

    -- Mark reconciliation completed
    UPDATE public.bank_reconciliations
    SET status = 'completed',
        completed_by = auth.uid(),
        completed_at = now(),
        updated_at = now()
    WHERE id = p_reconciliation_id;
END;
$$;

-- 8. Create RPC: cancel_bank_reconciliation
CREATE OR REPLACE FUNCTION public.cancel_bank_reconciliation(
  p_reconciliation_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_role text;
    v_status text;
BEGIN
    -- Get reconciliation details
    SELECT organization_id, status
    INTO v_org_id, v_status
    FROM public.bank_reconciliations
    WHERE id = p_reconciliation_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'جلسة المطابقة البنكية المحددة غير موجودة.';
    END IF;

    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Check roles
    SELECT role INTO v_role
    FROM public.organization_members
    WHERE organization_id = v_org_id
      AND profile_id = auth.uid()
      AND COALESCE(is_active, true) = true;

    IF v_role IS NULL OR v_role = 'sales' OR v_role = 'viewer' THEN
        RAISE EXCEPTION 'غير مصرح: ليس لديك الصلاحيات لإلغاء المطابقة البنكية.';
    END IF;

    -- Completed reconciliations can only be cancelled by owner or admin
    IF v_status = 'completed' AND v_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'إلغاء مطابقة مكتملة متاح فقط لمالك أو مدير المنشأة.';
    END IF;

    IF v_status = 'cancelled' THEN
        RAISE EXCEPTION 'هذه المطابقة ملغاة بالفعل.';
    END IF;

    -- Cancel reconciliation
    UPDATE public.bank_reconciliations
    SET status = 'cancelled',
        cancelled_by = auth.uid(),
        cancelled_at = now(),
        cancel_reason = p_reason,
        updated_at = now()
    WHERE id = p_reconciliation_id;
END;
$$;

-- 9. Create RPC: list_bank_reconciliations
CREATE OR REPLACE FUNCTION public.list_bank_reconciliations(
  p_organization_id uuid
)
RETURNS TABLE (
    id uuid,
    cash_bank_account_id uuid,
    account_name text,
    account_type text,
    reconciliation_date date,
    book_balance numeric,
    statement_balance numeric,
    difference numeric,
    status text,
    notes text,
    matched_count bigint,
    unmatched_count bigint,
    created_at timestamp with time zone,
    created_by_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Role check
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = p_organization_id
          AND profile_id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant', 'viewer')
          AND COALESCE(is_active, true) = true
    ) THEN
        RAISE EXCEPTION 'غير مصرح للمستخدم بقراءة بيانات هذه المنشأة.';
    END IF;

    RETURN QUERY
    SELECT 
        br.id,
        br.cash_bank_account_id,
        cba.name AS account_name,
        cba.type AS account_type,
        br.reconciliation_date,
        br.book_balance::numeric,
        br.statement_balance::numeric,
        br.difference::numeric,
        br.status,
        br.notes,
        COALESCE(m.matched, 0)::bigint,
        COALESCE(u.unmatched, 0)::bigint,
        br.created_at,
        p.full_name AS created_by_name
    FROM public.bank_reconciliations br
    JOIN public.cash_bank_accounts cba ON br.cash_bank_account_id = cba.id
    LEFT JOIN public.profiles p ON br.created_by = p.id
    LEFT JOIN (
        SELECT reconciliation_id, COUNT(*) AS matched
        FROM public.bank_reconciliation_lines
        WHERE is_matched = true
        GROUP BY reconciliation_id
    ) m ON m.reconciliation_id = br.id
    LEFT JOIN (
        SELECT reconciliation_id, COUNT(*) AS unmatched
        FROM public.bank_reconciliation_lines
        WHERE is_matched = false
        GROUP BY reconciliation_id
    ) u ON u.reconciliation_id = br.id
    WHERE br.organization_id = p_organization_id
    ORDER BY br.reconciliation_date DESC, br.created_at DESC;
END;
$$;

-- 10. Create RPC: get_bank_reconciliation
CREATE OR REPLACE FUNCTION public.get_bank_reconciliation(
  p_reconciliation_id uuid
)
RETURNS TABLE (
    id uuid,
    organization_id uuid,
    cash_bank_account_id uuid,
    account_name text,
    account_type text,
    currency_code text,
    reconciliation_date date,
    book_balance numeric,
    statement_balance numeric,
    difference numeric,
    status text,
    notes text,
    created_at timestamp with time zone,
    created_by_name text,
    completed_at timestamp with time zone,
    completed_by_name text,
    cancelled_at timestamp with time zone,
    cancelled_by_name text,
    cancel_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    RETURN QUERY
    SELECT 
        br.id,
        br.organization_id,
        br.cash_bank_account_id,
        cba.name AS account_name,
        cba.type AS account_type,
        cba.currency_code,
        br.reconciliation_date,
        br.book_balance::numeric,
        br.statement_balance::numeric,
        br.difference::numeric,
        br.status,
        br.notes,
        br.created_at,
        p_c.full_name AS created_by_name,
        br.completed_at,
        p_comp.full_name AS completed_by_name,
        br.cancelled_at,
        p_can.full_name AS cancelled_by_name,
        br.cancel_reason
    FROM public.bank_reconciliations br
    JOIN public.cash_bank_accounts cba ON br.cash_bank_account_id = cba.id
    LEFT JOIN public.profiles p_c ON br.created_by = p_c.id
    LEFT JOIN public.profiles p_comp ON br.completed_by = p_comp.id
    LEFT JOIN public.profiles p_can ON br.cancelled_by = p_can.id
    WHERE br.id = p_reconciliation_id
      AND EXISTS (
          SELECT 1 FROM public.organization_members
          WHERE organization_members.organization_id = br.organization_id
            AND organization_members.profile_id = auth.uid()
            AND organization_members.role IN ('owner', 'admin', 'accountant', 'viewer')
            AND COALESCE(organization_members.is_active, true) = true
      );
END;
$$;

-- 11. Create RPC: list_bank_reconciliation_lines
CREATE OR REPLACE FUNCTION public.list_bank_reconciliation_lines(
  p_reconciliation_id uuid
)
RETURNS TABLE (
    id uuid,
    reconciliation_id uuid,
    source_type text,
    source_id uuid,
    transaction_date date,
    description text,
    debit_amount numeric,
    credit_amount numeric,
    amount numeric,
    is_matched boolean,
    matched_at timestamp with time zone,
    notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    RETURN QUERY
    SELECT 
        brl.id,
        brl.reconciliation_id,
        brl.source_type,
        brl.source_id,
        brl.transaction_date,
        brl.description,
        brl.debit_amount::numeric,
        brl.credit_amount::numeric,
        brl.amount::numeric,
        brl.is_matched,
        brl.matched_at,
        brl.notes
    FROM public.bank_reconciliation_lines brl
    JOIN public.bank_reconciliations br ON brl.reconciliation_id = br.id
    WHERE brl.reconciliation_id = p_reconciliation_id
      AND EXISTS (
          SELECT 1 FROM public.organization_members
          WHERE organization_members.organization_id = br.organization_id
            AND organization_members.profile_id = auth.uid()
            AND organization_members.role IN ('owner', 'admin', 'accountant', 'viewer')
            AND COALESCE(organization_members.is_active, true) = true
      )
    ORDER BY brl.transaction_date ASC, brl.created_at ASC;
END;
$$;

-- Trigger schema reload
NOTIFY pgrst, 'reload schema';

COMMIT;
