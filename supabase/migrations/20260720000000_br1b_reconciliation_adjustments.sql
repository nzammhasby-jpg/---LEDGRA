-- Migration: 20260720000000_br1b_reconciliation_adjustments.sql
-- Goal: BR-1B — Bank Charges, Interest & Reconciliation Differences

BEGIN;

-- 1. Create table public.bank_reconciliation_adjustments
CREATE TABLE IF NOT EXISTS public.bank_reconciliation_adjustments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id uuid NOT NULL REFERENCES public.bank_reconciliations(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    adjustment_type text NOT NULL CONSTRAINT bank_reconciliation_adjustments_type_check CHECK (adjustment_type IN ('bank_fee', 'bank_interest', 'transfer_charge', 'rounding_difference', 'other')),
    description text NOT NULL,
    account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    debit_amount numeric(15,2) NOT NULL DEFAULT 0.00 CONSTRAINT bank_reconciliation_adjustments_debit_amount_check CHECK (debit_amount >= 0),
    credit_amount numeric(15,2) NOT NULL DEFAULT 0.00 CONSTRAINT bank_reconciliation_adjustments_credit_amount_check CHECK (credit_amount >= 0),
    amount numeric(15,2) NOT NULL DEFAULT 0.00 CONSTRAINT bank_reconciliation_adjustments_amount_check CHECK (amount > 0),
    notes text NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bank_reconciliation_adjustments_one_amount_check CHECK (
        (debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0)
    )
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS bank_reconciliation_adjustments_rec_idx ON public.bank_reconciliation_adjustments (reconciliation_id);

-- 2. Add column to bank_reconciliations to reference the adjustment journal entry
ALTER TABLE public.bank_reconciliations 
ADD COLUMN IF NOT EXISTS adjustment_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

-- 3. Enable RLS on public.bank_reconciliation_adjustments
ALTER TABLE public.bank_reconciliation_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_reconciliation_adjustments_select ON public.bank_reconciliation_adjustments;
CREATE POLICY bank_reconciliation_adjustments_select ON public.bank_reconciliation_adjustments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.bank_reconciliations br
            JOIN public.organization_members om ON br.organization_id = om.organization_id
            WHERE br.id = bank_reconciliation_adjustments.reconciliation_id
              AND om.profile_id = auth.uid()
              AND om.role IN ('owner', 'admin', 'accountant', 'viewer')
              AND COALESCE(om.is_active, true) = true
        )
    );

-- Revoke direct modify permissions
REVOKE ALL ON TABLE public.bank_reconciliation_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.bank_reconciliation_adjustments TO authenticated;

-- 4. Idempotently seed default accounts for all existing organizations
DO $$
DECLARE
    v_org record;
    v_parent_id uuid;
    v_parent_code text;
    v_parent_classification text;
    v_parent_nature text;
BEGIN
    FOR v_org IN SELECT id FROM public.organizations LOOP
        -- A. Bank Fees and Charges ("رسوم ومصاريف بنكية")
        IF NOT EXISTS (
            SELECT 1 FROM public.accounts 
            WHERE organization_id = v_org.id 
              AND (name_ar LIKE '%رسوم ومصاريف بنكية%' OR name_ar LIKE '%رسوم بنكية%' OR name_en ILIKE '%bank fee%' OR name_en ILIKE '%bank charge%')
        ) THEN
            SELECT id, code, classification, nature
            INTO v_parent_id, v_parent_code, v_parent_classification, v_parent_nature
            FROM public.accounts
            WHERE organization_id = v_org.id AND classification = 'expenses' AND parent_id IS NULL
            ORDER BY code ASC LIMIT 1;

            IF v_parent_id IS NOT NULL THEN
                INSERT INTO public.accounts (
                    organization_id, code, name_ar, name_en, classification, nature, parent_id, allow_direct_posting, is_system, is_active, description
                ) VALUES (
                    v_org.id, v_parent_code || '98', 'رسوم ومصاريف بنكية', 'Bank Fees and Charges', 'expenses', 'debit', v_parent_id, true, false, true, 'حساب مصروفات لتسجيل رسوم وعمولات البنك'
                ) ON CONFLICT (organization_id, code) DO NOTHING;
            ELSE
                INSERT INTO public.accounts (
                    organization_id, code, name_ar, name_en, classification, nature, parent_id, allow_direct_posting, is_system, is_active, description
                ) VALUES (
                    v_org.id, '5198', 'رسوم ومصاريف بنكية', 'Bank Fees and Charges', 'expenses', 'debit', NULL, true, false, true, 'حساب مصروفات لتسجيل رسوم وعمولات البنك'
                ) ON CONFLICT (organization_id, code) DO NOTHING;
            END IF;
        END IF;

        -- B. Bank Interest ("عوائد وإيرادات بنكية")
        IF NOT EXISTS (
            SELECT 1 FROM public.accounts 
            WHERE organization_id = v_org.id 
              AND (name_ar LIKE '%عوائد بنكية%' OR name_ar LIKE '%إيرادات بنكية%' OR name_en ILIKE '%bank interest%' OR name_en ILIKE '%bank revenue%')
        ) THEN
            SELECT id, code, classification, nature
            INTO v_parent_id, v_parent_code, v_parent_classification, v_parent_nature
            FROM public.accounts
            WHERE organization_id = v_org.id AND classification = 'revenue' AND parent_id IS NULL
            ORDER BY code ASC LIMIT 1;

            IF v_parent_id IS NOT NULL THEN
                INSERT INTO public.accounts (
                    organization_id, code, name_ar, name_en, classification, nature, parent_id, allow_direct_posting, is_system, is_active, description
                ) VALUES (
                    v_org.id, v_parent_code || '98', 'عوائد وإيرادات بنكية', 'Bank Interest and Revenues', 'revenue', 'credit', v_parent_id, true, false, true, 'حساب إيرادات لتسجيل عوائد وأرباح الحسابات البنكية'
                ) ON CONFLICT (organization_id, code) DO NOTHING;
            ELSE
                INSERT INTO public.accounts (
                    organization_id, code, name_ar, name_en, classification, nature, parent_id, allow_direct_posting, is_system, is_active, description
                ) VALUES (
                    v_org.id, '4198', 'عوائد وإيرادات بنكية', 'Bank Interest and Revenues', 'revenue', 'credit', NULL, true, false, true, 'حساب إيرادات لتسجيل عوائد وأرباح الحسابات البنكية'
                ) ON CONFLICT (organization_id, code) DO NOTHING;
            END IF;
        END IF;

        -- C. Rounding/Difference ("فروقات تسوية بنكية")
        IF NOT EXISTS (
            SELECT 1 FROM public.accounts 
            WHERE organization_id = v_org.id 
              AND (name_ar LIKE '%فروقات تسوية بنكية%' OR name_ar LIKE '%فروقات تقريب%' OR name_en ILIKE '%reconciliation difference%' OR name_en ILIKE '%rounding difference%')
        ) THEN
            SELECT id, code, classification, nature
            INTO v_parent_id, v_parent_code, v_parent_classification, v_parent_nature
            FROM public.accounts
            WHERE organization_id = v_org.id AND classification = 'expenses' AND parent_id IS NULL
            ORDER BY code ASC LIMIT 1;

            IF v_parent_id IS NOT NULL THEN
                INSERT INTO public.accounts (
                    organization_id, code, name_ar, name_en, classification, nature, parent_id, allow_direct_posting, is_system, is_active, description
                ) VALUES (
                    v_org.id, v_parent_code || '99', 'فروقات تسوية بنكية', 'Bank Reconciliation Differences', 'expenses', 'debit', v_parent_id, true, false, true, 'حساب لتسجيل الفروقات البسيطة والتقريب عند مطابقة البنك'
                ) ON CONFLICT (organization_id, code) DO NOTHING;
            ELSE
                INSERT INTO public.accounts (
                    organization_id, code, name_ar, name_en, classification, nature, parent_id, allow_direct_posting, is_system, is_active, description
                ) VALUES (
                    v_org.id, '5199', 'فروقات تسوية بنكية', 'Bank Reconciliation Differences', 'expenses', 'debit', NULL, true, false, true, 'حساب لتسجيل الفروقات البسيطة والتقريب عند مطابقة البنك'
                ) ON CONFLICT (organization_id, code) DO NOTHING;
            END IF;
        END IF;
    END LOOP;
END;
$$;

-- 5. Helper RPC to calculate and update bank reconciliation difference
CREATE OR REPLACE FUNCTION public.recalculate_reconciliation_difference(p_reconciliation_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_cash_bank_account_id uuid;
    v_statement_balance numeric(15,2);
    v_account_opening_balance numeric(15,2);
    v_prior_matched_sum numeric(15,2);
    v_reconciled_opening_balance numeric(15,2);
    v_matched_sum numeric(15,2);
    v_debit_adjustments_sum numeric(15,2);
    v_credit_adjustments_sum numeric(15,2);
    v_new_difference numeric(15,2);
BEGIN
    SELECT organization_id, cash_bank_account_id, statement_balance
    INTO v_org_id, v_cash_bank_account_id, v_statement_balance
    FROM public.bank_reconciliations
    WHERE id = p_reconciliation_id;

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
    WHERE reconciliation_id = p_reconciliation_id
      AND is_matched = true;

    -- Sum adjustments
    SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
    INTO v_debit_adjustments_sum, v_credit_adjustments_sum
    FROM public.bank_reconciliation_adjustments
    WHERE reconciliation_id = p_reconciliation_id;

    -- Calculate new difference
    -- difference = (reconciled_opening_balance + matched_sum) - statement_balance - debit_adjustments + credit_adjustments
    v_new_difference := (v_reconciled_opening_balance + v_matched_sum) - v_statement_balance - v_debit_adjustments_sum + v_credit_adjustments_sum;

    -- Update parent reconciliation session
    UPDATE public.bank_reconciliations
    SET difference = v_new_difference,
        updated_at = now()
    WHERE id = p_reconciliation_id;

    RETURN v_new_difference;
END;
$$;

-- 6. RPC: add_bank_reconciliation_adjustment
CREATE OR REPLACE FUNCTION public.add_bank_reconciliation_adjustment(
  p_reconciliation_id uuid,
  p_adjustment_type text,
  p_description text,
  p_account_id uuid,
  p_debit_amount numeric DEFAULT 0,
  p_credit_amount numeric DEFAULT 0,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_rec_status text;
    v_role text;
    v_account_org uuid;
    v_account_active boolean;
    v_account_posting boolean;
    v_adjustment_id uuid;
    v_amount numeric(15,2);
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Get reconciliation details
    SELECT organization_id, status
    INTO v_org_id, v_rec_status
    FROM public.bank_reconciliations
    WHERE id = p_reconciliation_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'جلسة المطابقة البنكية المحددة غير موجودة.';
    END IF;

    -- Privilege check
    SELECT role INTO v_role
    FROM public.organization_members
    WHERE organization_id = v_org_id
      AND profile_id = auth.uid()
      AND COALESCE(is_active, true) = true;

    IF v_role IS NULL OR v_role = 'sales' OR v_role = 'viewer' THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية متاحة للمالك، المدير، أو المحاسب فقط.';
    END IF;

    -- Status check
    IF v_rec_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن إضافة تسويات لمطابقة ليست في حالة مسودة.';
    END IF;

    -- Account validation
    SELECT organization_id, is_active, allow_direct_posting
    INTO v_account_org, v_account_active, v_account_posting
    FROM public.accounts
    WHERE id = p_account_id;

    IF v_account_org IS NULL THEN
        RAISE EXCEPTION 'الحساب المحدد غير موجود.';
    END IF;

    IF v_account_org <> v_org_id THEN
        RAISE EXCEPTION 'الحساب المحدد لا ينتمي لنفس المنشأة.';
    END IF;

    IF NOT v_account_active THEN
        RAISE EXCEPTION 'الحساب المحدد غير نشط.';
    END IF;

    IF NOT v_account_posting THEN
        RAISE EXCEPTION 'الحساب المحدد لا يسمح بالترحيل المباشر لأنه حساب رئيسي/تجميعي.';
    END IF;

    -- Amount validations
    IF p_debit_amount < 0 OR p_credit_amount < 0 THEN
        RAISE EXCEPTION 'المبالغ المدخلة لا يمكن أن تكون سالبة.';
    END IF;

    IF (p_debit_amount > 0 AND p_credit_amount > 0) THEN
        RAISE EXCEPTION 'لا يمكن تحديد مدين ودائن معاً في نفس السطر.';
    END IF;

    IF (p_debit_amount = 0 AND p_credit_amount = 0) THEN
        RAISE EXCEPTION 'يجب أن يحتوي البند على قيمة مدينة أو دائنة أكبر من الصفر.';
    END IF;

    v_amount := GREATEST(p_debit_amount, p_credit_amount);

    -- Insert adjustment
    INSERT INTO public.bank_reconciliation_adjustments (
        reconciliation_id,
        organization_id,
        adjustment_type,
        description,
        account_id,
        debit_amount,
        credit_amount,
        amount,
        notes,
        created_by
    ) VALUES (
        p_reconciliation_id,
        v_org_id,
        p_adjustment_type,
        p_description,
        p_account_id,
        p_debit_amount,
        p_credit_amount,
        v_amount,
        p_notes,
        auth.uid()
    )
    RETURNING id INTO v_adjustment_id;

    -- Recalculate and update difference
    PERFORM public.recalculate_reconciliation_difference(p_reconciliation_id);

    RETURN v_adjustment_id;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.add_bank_reconciliation_adjustment(uuid, text, text, uuid, numeric, numeric, text) TO authenticated;

-- 7. RPC: remove_bank_reconciliation_adjustment
CREATE OR REPLACE FUNCTION public.remove_bank_reconciliation_adjustment(
  p_adjustment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec_id uuid;
    v_org_id uuid;
    v_rec_status text;
    v_role text;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Fetch details of adjustment and reconciliation
    SELECT bra.reconciliation_id, br.organization_id, br.status
    INTO v_rec_id, v_org_id, v_rec_status
    FROM public.bank_reconciliation_adjustments bra
    JOIN public.bank_reconciliations br ON bra.reconciliation_id = br.id
    WHERE bra.id = p_adjustment_id;

    IF v_rec_id IS NULL THEN
        RAISE EXCEPTION 'بند التسوية المحدد غير موجود.';
    END IF;

    -- Privilege check
    SELECT role INTO v_role
    FROM public.organization_members
    WHERE organization_id = v_org_id
      AND profile_id = auth.uid()
      AND COALESCE(is_active, true) = true;

    IF v_role IS NULL OR v_role = 'sales' OR v_role = 'viewer' THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية متاحة للمالك، المدير، أو المحاسب فقط.';
    END IF;

    -- Status check
    IF v_rec_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن تعديل أو حذف تسوية في مطابقة ليست في حالة مسودة.';
    END IF;

    -- Delete
    DELETE FROM public.bank_reconciliation_adjustments WHERE id = p_adjustment_id;

    -- Recalculate
    PERFORM public.recalculate_reconciliation_difference(v_rec_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_bank_reconciliation_adjustment(uuid) TO authenticated;

-- 8. Redefine toggle_reconciliation_line to use our new recalculation helper
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
BEGIN
    -- Fetch line and parent details
    SELECT brl.reconciliation_id, br.organization_id, br.status
    INTO v_rec_id, v_org_id, v_rec_status
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

    -- Recalculate difference using the new helper
    PERFORM public.recalculate_reconciliation_difference(v_rec_id);
END;
$$;

-- 9. Redefine complete_bank_reconciliation to support adjustments, difference checks, and journal entry generation
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
    v_cash_bank_account_id uuid;
    v_reconciliation_date date;
    v_role text;
    v_status text;
    v_difference numeric(15,2);
    v_linked_account_id uuid;
    v_lines_jsonb jsonb := '[]'::jsonb;
    v_adj record;
    v_je_id uuid;
BEGIN
    -- Get reconciliation details
    SELECT organization_id, cash_bank_account_id, reconciliation_date, status
    INTO v_org_id, v_cash_bank_account_id, v_reconciliation_date, v_status
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

    -- Recalculate difference using our helper to ensure up to date
    v_difference := public.recalculate_reconciliation_difference(p_reconciliation_id);

    -- Check difference is zero
    IF v_difference <> 0 THEN
        RAISE EXCEPTION 'لا يمكن إكمال المطابقة قبل تسوية الفرق البنكي أو تعديل الحركات المطابقة.';
    END IF;

    -- Fetch cash_bank_account ledger account_id to debit/credit the bank
    SELECT account_id INTO v_linked_account_id
    FROM public.cash_bank_accounts
    WHERE id = v_cash_bank_account_id AND organization_id = v_org_id;

    IF v_linked_account_id IS NULL THEN
        RAISE EXCEPTION 'الحساب البنكي المرتبط بهذه المطابقة غير موجود أو غير مهيأ محاسبياً.';
    END IF;

    -- Build journal entry lines from adjustments
    FOR v_adj IN (
        SELECT account_id, debit_amount, credit_amount, description
        FROM public.bank_reconciliation_adjustments
        WHERE reconciliation_id = p_reconciliation_id
    ) LOOP
        IF v_adj.debit_amount > 0 THEN
            -- Debit expense/target account, Credit bank/cash
            v_lines_jsonb := v_lines_jsonb || jsonb_build_object(
                'account_id', v_adj.account_id,
                'description', v_adj.description,
                'debit', v_adj.debit_amount,
                'credit', 0
            );
            v_lines_jsonb := v_lines_jsonb || jsonb_build_object(
                'account_id', v_linked_account_id,
                'description', 'رسوم/مصاريف بنكية - ' || v_adj.description,
                'debit', 0,
                'credit', v_adj.debit_amount
            );
        ELSIF v_adj.credit_amount > 0 THEN
            -- Debit bank/cash, Credit revenue/target account
            v_lines_jsonb := v_lines_jsonb || jsonb_build_object(
                'account_id', v_linked_account_id,
                'description', 'عوائد/أرباح بنكية - ' || v_adj.description,
                'debit', v_adj.credit_amount,
                'credit', 0
            );
            v_lines_jsonb := v_lines_jsonb || jsonb_build_object(
                'account_id', v_adj.account_id,
                'description', v_adj.description,
                'debit', 0,
                'credit', v_adj.credit_amount
            );
        END IF;
    END LOOP;

    -- If we have adjustments, create and post a single journal entry
    IF jsonb_array_length(v_lines_jsonb) > 0 THEN
        -- Create entry (starts in 'draft')
        v_je_id := public.create_journal_entry(
            v_org_id,
            v_reconciliation_date,
            'BR-ADJ-' || p_reconciliation_id,
            'قيد تسوية فروقات البنك لمطابقة تاريخ ' || to_char(v_reconciliation_date, 'YYYY-MM-DD'),
            v_lines_jsonb
        );

        -- Post entry (validates fiscal period / years & posts)
        PERFORM public.post_journal_entry(v_org_id, v_je_id);

        -- Link JE to bank_reconciliation
        UPDATE public.bank_reconciliations
        SET adjustment_journal_entry_id = v_je_id
        WHERE id = p_reconciliation_id;
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

GRANT EXECUTE ON FUNCTION public.complete_bank_reconciliation(uuid) TO authenticated;

-- 10. Drop and Redefine RPC: get_bank_reconciliation to include adjustment_journal_entry_id
DROP FUNCTION IF EXISTS public.get_bank_reconciliation(uuid);

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
    cancel_reason text,
    adjustment_journal_entry_id uuid
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
        br.cancel_reason,
        br.adjustment_journal_entry_id
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

GRANT EXECUTE ON FUNCTION public.get_bank_reconciliation(uuid) TO authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

COMMIT;
