-- ==========================================================
-- LEDGRA PHASE 3: REAL JOURNAL ENTRIES & DOUBLE-ENTRY MODULE
-- ==========================================================

BEGIN;

-- Ensure composite uniqueness constraint on fiscal_periods so it can be referenced by journal_entries safely
ALTER TABLE public.fiscal_periods
DROP CONSTRAINT IF EXISTS fiscal_periods_id_year_org_unique;

ALTER TABLE public.fiscal_periods
ADD CONSTRAINT fiscal_periods_id_year_org_unique
UNIQUE (id, fiscal_year_id, organization_id);

-- Ensure composite uniqueness constraint on accounts so it can be referenced by journal_entry_lines safely
ALTER TABLE public.accounts
DROP CONSTRAINT IF EXISTS accounts_id_org_unique;

ALTER TABLE public.accounts
ADD CONSTRAINT accounts_id_org_unique
UNIQUE (id, organization_id);

-- 1. CREATE TABLE: journal_entries
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    fiscal_year_id uuid REFERENCES public.fiscal_years(id) ON DELETE RESTRICT NOT NULL,
    fiscal_period_id uuid REFERENCES public.fiscal_periods(id) ON DELETE RESTRICT NOT NULL,
    entry_number text NOT NULL,
    entry_date date NOT NULL,
    reference text,
    description text,
    source_type text DEFAULT 'manual' CHECK (source_type IN ('manual', 'system')) NOT NULL,
    source_id uuid,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'reversed')),
    posted_at timestamp with time zone,
    posted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    reversed_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    reversed_at timestamp with time zone,
    reversed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT journal_entries_period_fk FOREIGN KEY (fiscal_period_id, fiscal_year_id, organization_id) REFERENCES public.fiscal_periods (id, fiscal_year_id, organization_id) ON DELETE RESTRICT
);

-- Ensure composite uniqueness on journal_entries so it can be referenced by journal_entry_lines
ALTER TABLE public.journal_entries
DROP CONSTRAINT IF EXISTS journal_entries_id_org_unique;

ALTER TABLE public.journal_entries
ADD CONSTRAINT journal_entries_id_org_unique
UNIQUE (id, organization_id);

-- Indexes for performance and uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_num_org_idx ON public.journal_entries (organization_id, entry_number);
CREATE INDEX IF NOT EXISTS journal_entries_org_status_idx ON public.journal_entries (organization_id, status);
CREATE INDEX IF NOT EXISTS journal_entries_date_idx ON public.journal_entries (organization_id, entry_date);

-- 2. CREATE TABLE: journal_entry_lines
CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    journal_entry_id uuid NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    account_id uuid NOT NULL,
    line_number integer NOT NULL,
    description text,
    debit numeric(15,2) NOT NULL DEFAULT 0.00,
    credit numeric(15,2) NOT NULL DEFAULT 0.00,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT journal_entry_lines_debit_credit_check CHECK (
        (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
    ),
    CONSTRAINT journal_entry_lines_positive_check CHECK (debit >= 0 AND credit >= 0),
    CONSTRAINT journal_entry_lines_number_unique UNIQUE (journal_entry_id, line_number),
    CONSTRAINT journal_entry_lines_entry_org_fk FOREIGN KEY (journal_entry_id, organization_id) REFERENCES public.journal_entries (id, organization_id) ON DELETE CASCADE,
    CONSTRAINT journal_entry_lines_account_org_fk FOREIGN KEY (account_id, organization_id) REFERENCES public.accounts (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS journal_entry_lines_account_idx ON public.journal_entry_lines (organization_id, account_id);

-- 3. AUTOMATED ENTRY SERIAL TRIGGER
CREATE OR REPLACE FUNCTION public.generate_journal_entry_number()
RETURNS trigger AS $$
DECLARE
    v_year_str text;
    v_next_num integer;
BEGIN
    v_year_str := to_char(NEW.entry_date, 'YYYY');
    
    -- Get next index for this organization and year
    SELECT COALESCE(
        MAX(
            NULLIF(
                regexp_replace(entry_number, '^JE-' || v_year_str || '-', ''),
                entry_number
            )::integer
        ), 0
    ) + 1
    INTO v_next_num
    FROM public.journal_entries
    WHERE organization_id = NEW.organization_id
      AND entry_number LIKE 'JE-' || v_year_str || '-%';

    NEW.entry_number := 'JE-' || v_year_str || '-' || lpad(v_next_num::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_generate_journal_entry_number ON public.journal_entries;
CREATE TRIGGER trg_generate_journal_entry_number
    BEFORE INSERT ON public.journal_entries
    FOR EACH ROW
    WHEN (NEW.entry_number IS NULL OR NEW.entry_number = '')
    EXECUTE FUNCTION public.generate_journal_entry_number();


-- 4. RLS & SECURE SELECT POLICIES
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select journal_entries" ON public.journal_entries;
CREATE POLICY "Select journal_entries" ON public.journal_entries 
    FOR SELECT TO authenticated 
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Select journal_entry_lines" ON public.journal_entry_lines;
CREATE POLICY "Select journal_entry_lines" ON public.journal_entry_lines 
    FOR SELECT TO authenticated 
    USING (public.is_org_member(organization_id));

-- Restrict general table direct writes (Writes only allowed through SECURITY DEFINER RPC API)
REVOKE ALL ON TABLE public.journal_entries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.journal_entry_lines FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.journal_entries TO authenticated;
GRANT SELECT ON TABLE public.journal_entry_lines TO authenticated;


-- ==========================================================
-- 5. SECURE TRANSACTIONAL API (RPC WRAPPERS)
-- ==========================================================

-- A. create_journal_entry
CREATE OR REPLACE FUNCTION public.create_journal_entry(
    p_org_id uuid,
    p_entry_date date,
    p_reference text,
    p_description text,
    p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_entry_id uuid;
    v_year_id uuid;
    v_period_id uuid;
    v_line jsonb;
    v_line_number integer := 1;
    v_account_id uuid;
    v_line_desc text;
    v_debit numeric(15,2);
    v_credit numeric(15,2);
    v_allow_posting boolean;
    v_is_active boolean;
    v_has_children boolean;
    v_total_debit numeric(15,2) := 0;
    v_total_credit numeric(15,2) := 0;
BEGIN
    -- Authorization check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليس لديك الصلاحية الكافية لإنشاء قيود اليومية.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Resolve fiscal year first
    SELECT id INTO v_year_id 
    FROM public.fiscal_years
    WHERE organization_id = p_org_id
      AND p_entry_date >= start_date AND p_entry_date <= end_date
    LIMIT 1;

    IF v_year_id IS NULL THEN
        RAISE EXCEPTION 'فشل العثور على سنة مالية تغطي التاريخ المحدد % لهذه المنشأة.', p_entry_date;
    END IF;

    -- Resolve fiscal period and ensure it is open
    SELECT id INTO v_period_id 
    FROM public.fiscal_periods
    WHERE organization_id = p_org_id
      AND fiscal_year_id = v_year_id
      AND p_entry_date >= start_date AND p_entry_date <= end_date
      AND status = 'open'
    LIMIT 1;

    IF v_period_id IS NULL THEN
        RAISE EXCEPTION 'فشل العثور على فترة مالية مفتوحة تغطي التاريخ المحدد %. تأكد من فتح الفترة المالية.', p_entry_date;
    END IF;

    -- Basic check on lines count and json format
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
        RAISE EXCEPTION 'بنود القيد يجب أن تكون قائمة صحيحة (Array).';
    END IF;

    IF jsonb_array_length(p_lines) < 2 THEN
        RAISE EXCEPTION 'يجب أن يحتوي القيد على بندين على الأقل.';
    END IF;

    -- Create journal entry header
    INSERT INTO public.journal_entries (
        organization_id,
        fiscal_year_id,
        fiscal_period_id,
        entry_number, -- initially empty, trigger will set JE-YYYY-XXXXXX
        entry_date,
        reference,
        description,
        source_type,
        status,
        created_by
    ) VALUES (
        p_org_id,
        v_year_id,
        v_period_id,
        '',
        p_entry_date,
        p_reference,
        p_description,
        'manual',
        'draft',
        auth.uid()
    ) RETURNING id INTO v_entry_id;

    -- Process lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_account_id := (v_line->>'account_id')::uuid;
        v_line_desc := v_line->>'description';
        
        -- Safely extract debit with numeric check
        BEGIN
            v_debit := CASE 
                WHEN v_line->>'debit' IS NULL OR trim(v_line->>'debit') = '' THEN 0.00
                ELSE (v_line->>'debit')::numeric
            END;
        EXCEPTION WHEN others THEN
            RAISE EXCEPTION 'المبلغ المدين المحدد في السطر % غير صالح أو ليس رقماً صحيحاً.', v_line_number;
        END;

        -- Safely extract credit with numeric check
        BEGIN
            v_credit := CASE 
                WHEN v_line->>'credit' IS NULL OR trim(v_line->>'credit') = '' THEN 0.00
                ELSE (v_line->>'credit')::numeric
            END;
        EXCEPTION WHEN others THEN
            RAISE EXCEPTION 'المبلغ الدائن المحدد في السطر % غير صالح أو ليس رقماً صحيحاً.', v_line_number;
        END;

        -- Validate amounts
        IF v_debit < 0 OR v_credit < 0 THEN
            RAISE EXCEPTION 'المبالغ المدخلة لا يمكن أن تكون سالبة.';
        END IF;

        IF (v_debit > 0 AND v_credit > 0) THEN
            RAISE EXCEPTION 'لا يمكن تحديد مدين ودائن معاً في نفس السطر.';
        END IF;

        IF (v_debit = 0 AND v_credit = 0) THEN
            RAISE EXCEPTION 'يجب أن يحتوي البند على قيمة مدينة أو دائنة أكبر من الصفر.';
        END IF;

        -- Validate account of this organization
        SELECT allow_direct_posting, is_active 
        INTO v_allow_posting, v_is_active
        FROM public.accounts
        WHERE id = v_account_id AND organization_id = p_org_id;

        IF v_is_active IS NULL THEN
            RAISE EXCEPTION 'الحساب المحدد غير موجود في شجرة الحسابات لهذه المنشأة.';
        END IF;

        IF NOT v_is_active THEN
            RAISE EXCEPTION 'الحساب المحدد غير نشط ولا يمكن استخدامه.';
        END IF;

        IF NOT v_allow_posting THEN
            RAISE EXCEPTION 'هذا الحساب لا يسمح بالترحيل المباشر (قد يكون حساباً رئيسياً).';
        END IF;

        -- Ensure it is not a summary/aggregate/parent account representing folders
        SELECT EXISTS(SELECT 1 FROM public.accounts WHERE parent_id = v_account_id AND organization_id = p_org_id) INTO v_has_children;
        IF v_has_children THEN
            RAISE EXCEPTION 'لا يمكن استخدام حساب تجميعي يحتوي على تفرعات داخلياً.';
        END IF;

        -- Insert line
        INSERT INTO public.journal_entry_lines (
            journal_entry_id,
            organization_id,
            account_id,
            line_number,
            description,
            debit,
            credit
        ) VALUES (
            v_entry_id,
            p_org_id,
            v_account_id,
            v_line_number,
            v_line_desc,
            v_debit,
            v_credit
        );

        v_total_debit := v_total_debit + v_debit;
        v_total_credit := v_total_credit + v_credit;
        v_line_number := v_line_number + 1;
    END LOOP;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'create_journal_entry',
        jsonb_build_object(
            'journal_entry_id', v_entry_id,
            'total_debit', v_total_debit,
            'total_credit', v_total_credit,
            'entry_date', p_entry_date
        )
    );

    RETURN v_entry_id;
END;
$$;


-- B. update_journal_entry
CREATE OR REPLACE FUNCTION public.update_journal_entry(
    p_org_id uuid,
    p_entry_id uuid,
    p_entry_date date,
    p_reference text,
    p_description text,
    p_lines jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_status text;
    v_year_id uuid;
    v_period_id uuid;
    v_line jsonb;
    v_line_number integer := 1;
    v_account_id uuid;
    v_line_desc text;
    v_debit numeric(15,2);
    v_credit numeric(15,2);
    v_allow_posting boolean;
    v_is_active boolean;
    v_has_children boolean;
    v_total_debit numeric(15,2) := 0;
    v_total_credit numeric(15,2) := 0;
BEGIN
    -- Authorization check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليس لديك الصلاحية الكافية لتعديل قيود اليومية.';
    END IF;

    -- Check status and organization ownership
    SELECT status INTO v_current_status
    FROM public.journal_entries
    WHERE id = p_entry_id AND organization_id = p_org_id;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'القيد المحدد غير موجود أو لا ينتمي لهذه المنشأة.';
    END IF;

    IF v_current_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن تعديل قيد مالي تم ترحيله أو عكسه.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Resolve fiscal year split
    SELECT id INTO v_year_id 
    FROM public.fiscal_years
    WHERE organization_id = p_org_id
      AND p_entry_date >= start_date AND p_entry_date <= end_date
    LIMIT 1;

    IF v_year_id IS NULL THEN
        RAISE EXCEPTION 'فشل العثور على سنة مالية تغطي التاريخ المحدد % لهذه المنشأة.', p_entry_date;
    END IF;

    -- Resolve fiscal period and ensure it is open
    SELECT id INTO v_period_id 
    FROM public.fiscal_periods
    WHERE organization_id = p_org_id
      AND fiscal_year_id = v_year_id
      AND p_entry_date >= start_date AND p_entry_date <= end_date
      AND status = 'open'
    LIMIT 1;

    IF v_period_id IS NULL THEN
        RAISE EXCEPTION 'فشل العثور على فترة مالية مفتوحة تغطي التاريخ المحدد %. تأكد من فتح الفترة المالية.', p_entry_date;
    END IF;

    -- Basic check on lines count and json format
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
        RAISE EXCEPTION 'بنود القيد يجب أن تكون قائمة صحيحة (Array).';
    END IF;

    IF jsonb_array_length(p_lines) < 2 THEN
        RAISE EXCEPTION 'يجب أن يحتوي القيد على بندين على الأقل.';
    END IF;

    -- Update journal entry header
    UPDATE public.journal_entries
    SET entry_date = p_entry_date,
        fiscal_year_id = v_year_id,
        fiscal_period_id = v_period_id,
        reference = p_reference,
        description = p_description,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_entry_id AND organization_id = p_org_id;

    -- Delete old lines
    DELETE FROM public.journal_entry_lines WHERE journal_entry_id = p_entry_id AND organization_id = p_org_id;

    -- Inject new lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_account_id := (v_line->>'account_id')::uuid;
        v_line_desc := v_line->>'description';
        
        -- Safely extract debit with numeric check
        BEGIN
            v_debit := CASE 
                WHEN v_line->>'debit' IS NULL OR trim(v_line->>'debit') = '' THEN 0.00
                ELSE (v_line->>'debit')::numeric
            END;
        EXCEPTION WHEN others THEN
            RAISE EXCEPTION 'المبلغ المدين المحدد في السطر % غير صالح أو ليس رقماً صحيحاً.', v_line_number;
        END;

        -- Safely extract credit with numeric check
        BEGIN
            v_credit := CASE 
                WHEN v_line->>'credit' IS NULL OR trim(v_line->>'credit') = '' THEN 0.00
                ELSE (v_line->>'credit')::numeric
            END;
        EXCEPTION WHEN others THEN
            RAISE EXCEPTION 'المبلغ الدائن المحدد في السطر % غير صالح أو ليس رقماً صحيحاً.', v_line_number;
        END;

        -- Validate amounts
        IF v_debit < 0 OR v_credit < 0 THEN
            RAISE EXCEPTION 'المبالغ المدخلة لا يمكن أن تكون سالبة.';
        END IF;

        IF (v_debit > 0 AND v_credit > 0) THEN
            RAISE EXCEPTION 'لا يمكن تحديد مدين ودائن معاً في نفس السطر.';
        END IF;

        IF (v_debit = 0 AND v_credit = 0) THEN
            RAISE EXCEPTION 'يجب أن يحتوي البند على قيمة مدينة أو دائنة أكبر من الصفر.';
        END IF;

        -- Validate account of this organization
        SELECT allow_direct_posting, is_active 
        INTO v_allow_posting, v_is_active
        FROM public.accounts
        WHERE id = v_account_id AND organization_id = p_org_id;

        IF v_is_active IS NULL THEN
            RAISE EXCEPTION 'الحساب المحدد غير موجود في شجرة الحسابات لهذه المنشأة.';
        END IF;

        IF NOT v_is_active THEN
            RAISE EXCEPTION 'الحساب المحدد غير نشط ولا يمكن استخدامه.';
        END IF;

        IF NOT v_allow_posting THEN
            RAISE EXCEPTION 'هذا الحساب لا يسمح بالترحيل المباشر (قد يكون حساباً رئيسياً).';
        END IF;

        -- Ensure it is not a summary/aggregate/parent account
        SELECT EXISTS(SELECT 1 FROM public.accounts WHERE parent_id = v_account_id AND organization_id = p_org_id) INTO v_has_children;
        IF v_has_children THEN
            RAISE EXCEPTION 'لا يمكن استخدام حساب تجميعي يحتوي على تفرعات داخلياً.';
        END IF;

        -- Insert line
        INSERT INTO public.journal_entry_lines (
            journal_entry_id,
            organization_id,
            account_id,
            line_number,
            description,
            debit,
            credit
        ) VALUES (
            p_entry_id,
            p_org_id,
            v_account_id,
            v_line_number,
            v_line_desc,
            v_debit,
            v_credit
        );

        v_total_debit := v_total_debit + v_debit;
        v_total_credit := v_total_credit + v_credit;
        v_line_number := v_line_number + 1;
    END LOOP;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'update_journal_entry',
        jsonb_build_object(
            'journal_entry_id', p_entry_id,
            'total_debit', v_total_debit,
            'total_credit', v_total_credit,
            'entry_date', p_entry_date
        )
    );
END;
$$;


-- C. post_journal_entry
CREATE OR REPLACE FUNCTION public.post_journal_entry(
    p_org_id uuid,
    p_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
    v_entry_date date;
    v_total_debit numeric(15,2);
    v_total_credit numeric(15,2);
    v_period_status text;
    v_lines_count integer;
    v_unposted_accounts integer;
BEGIN
    -- Authorization check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليس لديك الصلاحية الكافية لترحيل قيود اليومية.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Get entry status and stats
    SELECT status, entry_date
    INTO v_status, v_entry_date
    FROM public.journal_entries
    WHERE id = p_entry_id AND organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'القيد المحدد غير موجود أو لا ينتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن ترحيل قيد إلا إذا كان في حالة مسودة.';
    END IF;

    -- Verify period is open
    SELECT status INTO v_period_status
    FROM public.fiscal_periods
    WHERE organization_id = p_org_id
      AND v_entry_date >= start_date AND v_entry_date <= end_date
    LIMIT 1;

    IF v_period_status IS NULL THEN
        RAISE EXCEPTION 'لا توجد فترة مالية تغطي تاريخ هذا القيد %.', v_entry_date;
    END IF;

    IF v_period_status <> 'open' THEN
        RAISE EXCEPTION 'الفترة المالية مغلقة حالياً. لا يمكن الترحيل فيها.';
    END IF;

    -- Verify line count and balances
    SELECT count(*), COALESCE(sum(debit), 0.00), COALESCE(sum(credit), 0.00)
    INTO v_lines_count, v_total_debit, v_total_credit
    FROM public.journal_entry_lines
    WHERE journal_entry_id = p_entry_id AND organization_id = p_org_id;

    IF v_lines_count < 2 THEN
        RAISE EXCEPTION 'لا يمكن ترحيل قيد مالي يحتوي على أقل من سطرين.';
    END IF;

    IF v_total_debit <> v_total_credit THEN
        RAISE EXCEPTION 'القيد غير متوازن! مجموع المدين (%) لا يساوي مجموع الدائن (%).', v_total_debit, v_total_credit;
    END IF;

    IF v_total_debit <= 0 THEN
        RAISE EXCEPTION 'قيمة القيد المحاسبي يجب أن تكون أكبر من الصفر.';
    END IF;

    -- Double check accounts requirements
    SELECT count(*) INTO v_unposted_accounts
    FROM public.journal_entry_lines l
    JOIN public.accounts a ON a.id = l.account_id
    WHERE l.journal_entry_id = p_entry_id
      AND (NOT a.is_active OR NOT a.allow_direct_posting OR EXISTS (
          SELECT 1 FROM public.accounts sub WHERE sub.parent_id = a.id AND sub.organization_id = p_org_id
      ));

    IF v_unposted_accounts > 0 THEN
        RAISE EXCEPTION 'يحتوي القيد على حساب تجميعي أو حساب غير نشط. يرجى مراجعة وتصفية بنود القيد.';
    END IF;

    -- Update state
    UPDATE public.journal_entries
    SET status = 'posted',
        posted_at = timezone('utc'::text, now()),
        posted_by = auth.uid(),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_entry_id AND organization_id = p_org_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'post_journal_entry',
        jsonb_build_object(
            'journal_entry_id', p_entry_id,
            'total_amount', v_total_debit
        )
    );
END;
$$;


-- D. reverse_journal_entry
CREATE OR REPLACE FUNCTION public.reverse_journal_entry(
    p_org_id uuid,
    p_entry_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
    v_entry_date date;
    v_reference text;
    v_description text;
    v_year_id uuid;
    v_period_id uuid;
    v_period_status text;
    v_rev_entry_id uuid;
    v_line record;
    v_entry_number text;
BEGIN
    -- Authorization check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليس لديك الصلاحية الكافية لعكس قيود اليومية.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Get entry details
    SELECT status, entry_date, reference, description, entry_number
    INTO v_status, v_entry_date, v_reference, v_description, v_entry_number
    FROM public.journal_entries
    WHERE id = p_entry_id AND organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'القيد المحدد غير موجود أو لا ينتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'posted' THEN
        RAISE EXCEPTION 'لا يمكن عكس قيد إلا إذا كان في حالة مرحل.';
    END IF;

    -- Determine optimal date for reversal (today, or entry date fallback)
    v_entry_date := current_date;

    SELECT id, status INTO v_period_id, v_period_status
    FROM public.fiscal_periods
    WHERE organization_id = p_org_id
      AND v_entry_date >= start_date AND v_entry_date <= end_date
    LIMIT 1;

    IF v_period_id IS NULL OR v_period_status <> 'open' THEN
        SELECT entry_date INTO v_entry_date FROM public.journal_entries WHERE id = p_entry_id;
        
        SELECT id, status INTO v_period_id, v_period_status
        FROM public.fiscal_periods
        WHERE organization_id = p_org_id
          AND v_entry_date >= start_date AND v_entry_date <= end_date
        LIMIT 1;
    END IF;

    IF v_period_id IS NULL OR v_period_status <> 'open' THEN
        RAISE EXCEPTION 'لا يمكن إجراء قيد العكس لعدم وجود فترة مالية مفتوحة تغطي تاريخ اليوم أو تاريخ القيد الأصلي.';
    END IF;

    SELECT fiscal_year_id INTO v_year_id FROM public.fiscal_periods WHERE id = v_period_id;

    -- Create Reversed journal entry header (draft or directly posted as manual reversal)
    INSERT INTO public.journal_entries (
        organization_id,
        fiscal_year_id,
        fiscal_period_id,
        entry_number,
        entry_date,
        reference,
        description,
        source_type,
        status,
        posted_at,
        posted_by,
        created_by
    ) VALUES (
        p_org_id,
        v_year_id,
        v_period_id,
        'REV-' || v_entry_number,
        v_entry_date,
        v_entry_number,
        'عكس القيد اليومي رقم ' || v_entry_number || (CASE WHEN v_description IS NOT NULL AND v_description <> '' THEN ' - ' || v_description ELSE '' END),
        'manual',
        'posted',
        timezone('utc'::text, now()),
        auth.uid(),
        auth.uid()
    ) RETURNING id INTO v_rev_entry_id;

    -- Swap debit & credit of existing lines
    FOR v_line IN 
        SELECT account_id, line_number, description, debit, credit 
        FROM public.journal_entry_lines 
        WHERE journal_entry_id = p_entry_id AND organization_id = p_org_id
    LOOP
        INSERT INTO public.journal_entry_lines (
            journal_entry_id,
            organization_id,
            account_id,
            line_number,
            description,
            debit,
            credit
        ) VALUES (
            v_rev_entry_id,
            p_org_id,
            v_line.account_id,
            v_line.line_number,
            'عكس بند: ' || COALESCE(v_line.description, ''),
            v_line.credit, -- swapped!
            v_line.debit   -- swapped!
        );
    END LOOP;

    -- Mark original entry as reversed
    UPDATE public.journal_entries
    SET status = 'reversed',
        reversed_entry_id = v_rev_entry_id,
        reversed_at = timezone('utc'::text, now()),
        reversed_by = auth.uid(),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_entry_id AND organization_id = p_org_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'reverse_journal_entry',
        jsonb_build_object(
            'journal_entry_id', p_entry_id,
            'reversed_by_id', v_rev_entry_id
        )
    );

    RETURN v_rev_entry_id;
END;
$$;


-- E. delete_draft_journal_entry
CREATE OR REPLACE FUNCTION public.delete_draft_journal_entry(
    p_org_id uuid,
    p_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status text;
    v_entry_num text;
BEGIN
    -- Authorization check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT public.is_org_privileged_member(p_org_id) THEN
        RAISE EXCEPTION 'ليس لديك الصلاحية الكافية لحذف قيود اليومية.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Get status
    SELECT status, entry_number INTO v_status, v_entry_num
    FROM public.journal_entries
    WHERE id = p_entry_id AND organization_id = p_org_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'القيد المطلوب غير موجود أو لا ينتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'لا يمكن حذف قيد مالي تم ترحيله أو عكسه. مسموح بحذف المسودات فقط.';
    END IF;

    -- Clear entry (lines delete cascade is active)
    DELETE FROM public.journal_entries
    WHERE id = p_entry_id AND organization_id = p_org_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'delete_draft_journal_entry',
        jsonb_build_object(
            'journal_entry_id', p_entry_id,
            'entry_number', v_entry_num
        )
    );
END;
$$;


-- ==========================================================
-- 6. RPC GRANTS & REVOKES
-- ==========================================================

REVOKE ALL ON FUNCTION public.create_journal_entry(uuid, date, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_journal_entry(uuid, date, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.update_journal_entry(uuid, uuid, date, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_journal_entry(uuid, uuid, date, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.post_journal_entry(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.reverse_journal_entry(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_journal_entry(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_draft_journal_entry(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_draft_journal_entry(uuid, uuid) TO authenticated;

COMMIT;
