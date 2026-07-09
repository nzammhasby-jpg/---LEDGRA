-- ==========================================================
-- LEDGRA: BCM-1C CASH/BANK TRANSFERS INTEGRATION
-- ==========================================================

BEGIN;

-- 1. Create table public.cash_bank_transfers
CREATE TABLE IF NOT EXISTS public.cash_bank_transfers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    transfer_number text NOT NULL,
    transfer_date date NOT NULL,
    from_cash_bank_account_id uuid NOT NULL REFERENCES public.cash_bank_accounts(id),
    to_cash_bank_account_id uuid NOT NULL REFERENCES public.cash_bank_accounts(id),
    amount numeric(14,2) NOT NULL CONSTRAINT cash_bank_transfers_amount_check CHECK (amount > 0),
    currency_code text NOT NULL,
    description text,
    reference_number text,
    status text NOT NULL DEFAULT 'draft' CONSTRAINT cash_bank_transfers_status_check CHECK (status IN ('draft', 'approved', 'cancelled')),
    journal_entry_id uuid REFERENCES public.journal_entries(id),
    approved_by uuid REFERENCES auth.users(id),
    approved_at timestamp with time zone,
    cancelled_by uuid REFERENCES auth.users(id),
    cancelled_at timestamp with time zone,
    cancel_reason text,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    
    -- Ensure distinct sender and receiver accounts
    CONSTRAINT cash_bank_transfers_different_accounts CHECK (from_cash_bank_account_id <> to_cash_bank_account_id)
);

-- 2. Add indexes
CREATE UNIQUE INDEX IF NOT EXISTS cash_bank_transfers_org_num_idx 
ON public.cash_bank_transfers (organization_id, transfer_number);

CREATE INDEX IF NOT EXISTS cash_bank_transfers_org_date_idx 
ON public.cash_bank_transfers (organization_id, transfer_date);

-- 3. Enable RLS
ALTER TABLE public.cash_bank_transfers ENABLE ROW LEVEL SECURITY;

-- SELECT Policy
DROP POLICY IF EXISTS cash_bank_transfers_select ON public.cash_bank_transfers;
CREATE POLICY cash_bank_transfers_select ON public.cash_bank_transfers
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_members.organization_id = cash_bank_transfers.organization_id
          AND organization_members.profile_id = auth.uid()
          AND organization_members.role IN ('owner', 'admin', 'accountant', 'viewer')
          AND COALESCE(organization_members.is_active, true) = true
    )
);

-- Drop direct write policies since all writes must go through RPCs
DROP POLICY IF EXISTS cash_bank_transfers_write ON public.cash_bank_transfers;

-- Revoke all direct public rights
REVOKE ALL ON public.cash_bank_transfers FROM PUBLIC, anon;
GRANT SELECT ON public.cash_bank_transfers TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cash_bank_transfers FROM authenticated;


-- 4. RPC: create_cash_bank_transfer
CREATE OR REPLACE FUNCTION public.create_cash_bank_transfer(
  p_organization_id uuid,
  p_transfer_date date,
  p_from_cash_bank_account_id uuid,
  p_to_cash_bank_account_id uuid,
  p_amount numeric,
  p_description text DEFAULT NULL,
  p_reference_number text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_transfer_id uuid;
    v_transfer_number text;
    v_from_org_id uuid;
    v_to_org_id uuid;
    v_from_active boolean;
    v_to_active boolean;
    v_from_currency text;
    v_to_currency text;
    v_org_currency text;
    v_next_seq integer;
    v_year_prefix text;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Privilege check (direct active role check)
    IF NOT EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE organization_id = p_organization_id
          AND profile_id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant')
          AND COALESCE(is_active, true) = true
    ) THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية متاحة فقط للمالك، المدير، والمحاسب النشط.';
    END IF;

    -- Amount check
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'مبلغ التحويل يجب أن يكون أكبر من الصفر.';
    END IF;

    -- Account equality check
    IF p_from_cash_bank_account_id = p_to_cash_bank_account_id THEN
        RAISE EXCEPTION 'لا يمكن التحويل من الحساب إلى نفسه.';
    END IF;

    -- Get accounts details
    SELECT organization_id, is_active, currency_code INTO v_from_org_id, v_from_active, v_from_currency
    FROM public.cash_bank_accounts
    WHERE id = p_from_cash_bank_account_id;

    SELECT organization_id, is_active, currency_code INTO v_to_org_id, v_to_active, v_to_currency
    FROM public.cash_bank_accounts
    WHERE id = p_to_cash_bank_account_id;

    -- Check existence and same organization
    IF v_from_org_id IS NULL OR v_to_org_id IS NULL THEN
        RAISE EXCEPTION 'أحد الحسابات المحددة غير موجود.';
    END IF;

    IF v_from_org_id <> p_organization_id OR v_to_org_id <> p_organization_id THEN
        RAISE EXCEPTION 'الحسابات المحددة يجب أن تنتمي لنفس المنشأة.';
    END IF;

    -- Check active status
    IF NOT v_from_active OR NOT v_to_active THEN
        RAISE EXCEPTION 'لا يمكن التحويل باستخدام حساب غير نشط.';
    END IF;

    -- Currency checks
    SELECT currency_code INTO v_org_currency
    FROM public.organizations
    WHERE id = p_organization_id;

    IF v_from_currency <> v_org_currency OR v_to_currency <> v_org_currency THEN
        RAISE EXCEPTION 'عملة الحسابات يجب أن تطابق عملة المنشأة.';
    END IF;

    -- Generate transfer number: TRF-YYYY-XXXXXX
    v_year_prefix := to_char(p_transfer_date, 'YYYY');
    
    SELECT COALESCE(MAX(SUBSTRING(transfer_number FROM 10 FOR 6)::integer), 0) + 1 INTO v_next_seq
    FROM public.cash_bank_transfers
    WHERE organization_id = p_organization_id
      AND transfer_number LIKE 'TRF-' || v_year_prefix || '-%';

    v_transfer_number := 'TRF-' || v_year_prefix || '-' || lpad(v_next_seq::text, 6, '0');

    -- Insert draft transfer
    INSERT INTO public.cash_bank_transfers (
        organization_id,
        transfer_number,
        transfer_date,
        from_cash_bank_account_id,
        to_cash_bank_account_id,
        amount,
        currency_code,
        description,
        reference_number,
        status,
        created_by
    ) VALUES (
        p_organization_id,
        v_transfer_number,
        p_transfer_date,
        p_from_cash_bank_account_id,
        p_to_cash_bank_account_id,
        p_amount,
        v_org_currency,
        p_description,
        p_reference_number,
        'draft',
        auth.uid()
    )
    RETURNING id INTO v_transfer_id;

    RETURN v_transfer_id;
END;
$$;


-- 5. RPC: approve_cash_bank_transfer
CREATE OR REPLACE FUNCTION public.approve_cash_bank_transfer(
  p_transfer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_transfer_number text;
    v_transfer_date date;
    v_from_cba_id uuid;
    v_to_cba_id uuid;
    v_amount numeric(14,2);
    v_currency_code text;
    v_description text;
    v_reference_number text;
    v_status text;

    v_from_account_id uuid;
    v_to_account_id uuid;
    v_from_name text;
    v_to_name text;
    v_from_active boolean;
    v_to_active boolean;

    v_desc text;
    v_journal_lines jsonb;
    v_journal_entry_id uuid;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Lock and retrieve transfer row for update
    SELECT 
        organization_id, transfer_number, transfer_date, 
        from_cash_bank_account_id, to_cash_bank_account_id, 
        amount, currency_code, description, reference_number, status
    INTO 
        v_org_id, v_transfer_number, v_transfer_date, 
        v_from_cba_id, v_to_cba_id, 
        v_amount, v_currency_code, v_description, v_reference_number, v_status
    FROM public.cash_bank_transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'التحويل المحدد غير موجود.';
    END IF;

    -- Privilege check (direct active role check)
    IF NOT EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE organization_id = v_org_id
          AND profile_id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant')
          AND COALESCE(is_active, true) = true
    ) THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية متاحة فقط للمالك، المدير، والمحاسب النشط.';
    END IF;

    -- Status check
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن اعتماد تحويل حالته ليست مسودة.';
    END IF;

    -- Lock and check both bank/cash accounts (with organization_id check)
    SELECT account_id, name, is_active INTO v_from_account_id, v_from_name, v_from_active
    FROM public.cash_bank_accounts
    WHERE id = v_from_cba_id
      AND organization_id = v_org_id
    FOR UPDATE;

    SELECT account_id, name, is_active INTO v_to_account_id, v_to_name, v_to_active
    FROM public.cash_bank_accounts
    WHERE id = v_to_cba_id
      AND organization_id = v_org_id
    FOR UPDATE;

    IF NOT v_from_active OR NOT v_to_active THEN
        RAISE EXCEPTION 'لا يمكن اعتماد التحويل لأن أحد الحسابات المرتبطة غير نشط حالياً.';
    END IF;

    -- Build Accounting Journal description
    v_desc := 'تحويل نقدية من ' || v_from_name || ' إلى ' || v_to_name || ' بموجب مستند رقم: ' || v_transfer_number;
    IF v_description IS NOT NULL AND v_description <> '' THEN
        v_desc := v_desc || ' - ' || v_description;
    END IF;

    -- Build Journal Entry lines JSON
    v_journal_lines := jsonb_build_array(
        jsonb_build_object(
            'account_id', v_to_account_id,
            'description', v_desc || ' (استلام)',
            'debit', v_amount,
            'credit', 0.00
        ),
        jsonb_build_object(
            'account_id', v_from_account_id,
            'description', v_desc || ' (صرف)',
            'debit', 0.00,
            'credit', v_amount
        )
    );

    -- Create and Post Journal entry
    v_journal_entry_id := public.create_journal_entry(
        v_org_id,
        v_transfer_date,
        v_transfer_number,
        v_desc,
        v_journal_lines
    );

    -- Update Entry source_type to system (with organization_id check)
    UPDATE public.journal_entries 
    SET source_type = 'system' 
    WHERE id = v_journal_entry_id
      AND organization_id = v_org_id;

    -- Post the entry
    PERFORM public.post_journal_entry(v_org_id, v_journal_entry_id);

    -- Update account balances (with organization_id check)
    UPDATE public.cash_bank_accounts
    SET current_balance = current_balance - v_amount,
        updated_at = now()
    WHERE id = v_from_cba_id
      AND organization_id = v_org_id;

    UPDATE public.cash_bank_accounts
    SET current_balance = current_balance + v_amount,
        updated_at = now()
    WHERE id = v_to_cba_id
      AND organization_id = v_org_id;

    -- Update Transfer row to Approved (with organization_id check)
    UPDATE public.cash_bank_transfers
    SET status = 'approved',
        journal_entry_id = v_journal_entry_id,
        approved_by = auth.uid(),
        approved_at = now(),
        updated_at = now()
    WHERE id = p_transfer_id
      AND organization_id = v_org_id;

END;
$$;


-- 6. RPC: cancel_cash_bank_transfer
CREATE OR REPLACE FUNCTION public.cancel_cash_bank_transfer(
  p_transfer_id uuid,
  p_cancel_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_transfer_number text;
    v_from_cba_id uuid;
    v_to_cba_id uuid;
    v_amount numeric(14,2);
    v_status text;
    v_journal_entry_id uuid;
    v_rev_entry_id uuid;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Lock and retrieve transfer row for update
    SELECT 
        organization_id, transfer_number, 
        from_cash_bank_account_id, to_cash_bank_account_id, 
        amount, status, journal_entry_id
    INTO 
        v_org_id, v_transfer_number, 
        v_from_cba_id, v_to_cba_id, 
        v_amount, v_status, v_journal_entry_id
    FROM public.cash_bank_transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'التحويل المحدد غير موجود.';
    END IF;

    -- Privilege check (direct active role check)
    IF NOT EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE organization_id = v_org_id
          AND profile_id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant')
          AND COALESCE(is_active, true) = true
    ) THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية متاحة فقط للمالك، المدير، والمحاسب النشط.';
    END IF;

    -- Status check
    IF v_status <> 'approved' THEN
        RAISE EXCEPTION 'لا يمكن إلغاء تحويل حالته ليست معتمد.';
    END IF;

    -- Lock both accounts (with organization_id check)
    PERFORM 1 FROM public.cash_bank_accounts WHERE id = v_from_cba_id AND organization_id = v_org_id FOR UPDATE;
    PERFORM 1 FROM public.cash_bank_accounts WHERE id = v_to_cba_id AND organization_id = v_org_id FOR UPDATE;

    -- Reverse the Journal Entry (creates a reversed entry and posts it automatically)
    IF v_journal_entry_id IS NOT NULL THEN
        v_rev_entry_id := public.reverse_journal_entry(v_org_id, v_journal_entry_id);
    END IF;

    -- Reverse balances (with organization_id check)
    UPDATE public.cash_bank_accounts
    SET current_balance = current_balance + v_amount,
        updated_at = now()
    WHERE id = v_from_cba_id
      AND organization_id = v_org_id;

    UPDATE public.cash_bank_accounts
    SET current_balance = current_balance - v_amount,
        updated_at = now()
    WHERE id = v_to_cba_id
      AND organization_id = v_org_id;

    -- Mark Transfer row as cancelled (with organization_id check)
    UPDATE public.cash_bank_transfers
    SET status = 'cancelled',
        cancelled_by = auth.uid(),
        cancelled_at = now(),
        cancel_reason = p_cancel_reason,
        updated_at = now()
    WHERE id = p_transfer_id
      AND organization_id = v_org_id;

END;
$$;


-- 7. RPC: list_cash_bank_transfers
CREATE OR REPLACE FUNCTION public.list_cash_bank_transfers(
  p_organization_id uuid,
  p_status text DEFAULT NULL,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  transfer_number text,
  transfer_date date,
  from_cash_bank_account_id uuid,
  from_account_name text,
  from_account_type text,
  from_bank_name text,
  to_cash_bank_account_id uuid,
  to_account_name text,
  to_account_type text,
  to_bank_name text,
  amount numeric,
  currency_code text,
  description text,
  reference_number text,
  status text,
  journal_entry_id uuid,
  approved_by uuid,
  approved_at timestamp with time zone,
  cancelled_by uuid,
  cancelled_at timestamp with time zone,
  cancel_reason text,
  created_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Auth and Privilege check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = p_organization_id
          AND profile_id = auth.uid()
          AND role IN ('owner', 'admin', 'accountant', 'viewer')
          AND COALESCE(is_active, true) = true
    ) THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية متاحة فقط للمالك، المدير، المحاسب، والمشاهد النشطين.';
    END IF;

    RETURN QUERY
    SELECT 
        t.id,
        t.transfer_number,
        t.transfer_date,
        t.from_cash_bank_account_id,
        f.name AS from_account_name,
        f.type AS from_account_type,
        f.bank_name AS from_bank_name,
        t.to_cash_bank_account_id,
        o.name AS to_account_name,
        o.type AS to_account_type,
        o.bank_name AS to_bank_name,
        t.amount,
        t.currency_code,
        t.description,
        t.reference_number,
        t.status,
        t.journal_entry_id,
        t.approved_by,
        t.approved_at,
        t.cancelled_by,
        t.cancelled_at,
        t.cancel_reason,
        t.created_by,
        t.created_at,
        t.updated_at
    FROM public.cash_bank_transfers t
    JOIN public.cash_bank_accounts f ON t.from_cash_bank_account_id = f.id
    JOIN public.cash_bank_accounts o ON t.to_cash_bank_account_id = o.id
    WHERE t.organization_id = p_organization_id
      AND (p_status IS NULL OR t.status = p_status)
      AND (p_from_date IS NULL OR t.transfer_date >= p_from_date)
      AND (p_to_date IS NULL OR t.transfer_date <= p_to_date)
    ORDER BY t.transfer_date DESC, t.created_at DESC;
END;
$$;


-- 8. Setup Grants
REVOKE ALL ON FUNCTION public.create_cash_bank_transfer(uuid, date, uuid, uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_cash_bank_transfer(uuid, date, uuid, uuid, numeric, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_cash_bank_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_cash_bank_transfer(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_cash_bank_transfer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_cash_bank_transfer(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.list_cash_bank_transfers(uuid, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_cash_bank_transfers(uuid, text, date, date) TO authenticated;

COMMIT;
