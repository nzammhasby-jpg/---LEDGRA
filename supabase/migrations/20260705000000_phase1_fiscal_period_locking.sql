BEGIN;

-- 1. Modify fiscal_periods: safely drop previous constraint and add new columns + updated constraint
ALTER TABLE public.fiscal_periods DROP CONSTRAINT IF EXISTS fiscal_periods_status_check;

-- Add new metadata and tracking columns
ALTER TABLE public.fiscal_periods ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone NULL;
ALTER TABLE public.fiscal_periods ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL NULL;
ALTER TABLE public.fiscal_periods ADD COLUMN IF NOT EXISTS locked_reason text NULL;
ALTER TABLE public.fiscal_periods ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());

-- Redefine check constraint on status to include 'locked'
ALTER TABLE public.fiscal_periods ADD CONSTRAINT fiscal_periods_status_check CHECK (status IN ('open', 'closed', 'locked'));

-- 2. Create helper function is_date_in_closed_period
CREATE OR REPLACE FUNCTION public.is_date_in_closed_period(
  p_org_id uuid,
  p_date date
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_closed boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM public.fiscal_periods 
        WHERE organization_id = p_org_id 
          AND p_date >= start_date 
          AND p_date <= end_date 
          AND status IN ('closed', 'locked')
    ) INTO v_closed;
    RETURN v_closed;
END;
$$;

-- Grant permissions for helper function
REVOKE ALL ON FUNCTION public.is_date_in_closed_period(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_date_in_closed_period(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_date_in_closed_period(uuid, date) TO authenticated;

-- 3. Create fiscal period lock trigger function to protect financial transactions
CREATE OR REPLACE FUNCTION public.check_fiscal_period_lock_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_date date;
    v_org_id uuid;
    v_status text;
BEGIN
    -- Determine table and appropriate date field
    IF TG_TABLE_NAME = 'journal_entries' THEN
        v_date := NEW.entry_date;
        v_org_id := NEW.organization_id;
        v_status := NEW.status;
    ELSIF TG_TABLE_NAME = 'sales_invoices' THEN
        v_date := NEW.invoice_date;
        v_org_id := NEW.organization_id;
        v_status := NEW.status;
    ELSIF TG_TABLE_NAME = 'purchase_bills' THEN
        v_date := NEW.bill_date;
        v_org_id := NEW.organization_id;
        v_status := NEW.status;
    ELSIF TG_TABLE_NAME = 'receipts' THEN
        v_date := NEW.receipt_date;
        v_org_id := NEW.organization_id;
        v_status := NEW.status;
    ELSIF TG_TABLE_NAME = 'payments' THEN
        v_date := NEW.payment_date;
        v_org_id := NEW.organization_id;
        v_status := NEW.status;
    END IF;

    -- For delete, check using OLD values
    IF TG_OP = 'DELETE' THEN
        IF TG_TABLE_NAME = 'journal_entries' THEN
            v_date := OLD.entry_date;
            v_org_id := OLD.organization_id;
            v_status := OLD.status;
        ELSIF TG_TABLE_NAME = 'sales_invoices' THEN
            v_date := OLD.invoice_date;
            v_org_id := OLD.organization_id;
            v_status := OLD.status;
        ELSIF TG_TABLE_NAME = 'purchase_bills' THEN
            v_date := OLD.bill_date;
            v_org_id := OLD.organization_id;
            v_status := OLD.status;
        ELSIF TG_TABLE_NAME = 'receipts' THEN
            v_date := OLD.receipt_date;
            v_org_id := OLD.organization_id;
            v_status := OLD.status;
        ELSIF TG_TABLE_NAME = 'payments' THEN
            v_date := OLD.payment_date;
            v_org_id := OLD.organization_id;
            v_status := OLD.status;
        END IF;
    END IF;

    -- Block the operation if date is in closed/locked period
    IF public.is_date_in_closed_period(v_org_id, v_date) THEN
        -- Log the blocked event into audit log if possible
        BEGIN
            INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
            VALUES (
                v_org_id,
                auth.uid(),
                'blocked_posting_closed_period',
                jsonb_build_object(
                    'table', TG_TABLE_NAME,
                    'operation', TG_OP,
                    'date', v_date,
                    'status', v_status
                )
            );
        EXCEPTION WHEN OTHERS THEN
            -- Ignore auditing errors
        END;

        RAISE EXCEPTION 'لا يمكن إجراء عمليات مالية (إنشاء، تعديل، اعتماد، أو حذف) داخل فترة مالية مغلقة أو مقفلة (التاريخ: %).', v_date;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- Bind safety triggers to sensitive financial tables
DROP TRIGGER IF EXISTS trg_check_fiscal_period_lock ON public.journal_entries;
CREATE TRIGGER trg_check_fiscal_period_lock
    BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
    FOR EACH ROW EXECUTE FUNCTION public.check_fiscal_period_lock_trigger();

DROP TRIGGER IF EXISTS trg_check_fiscal_period_lock ON public.sales_invoices;
CREATE TRIGGER trg_check_fiscal_period_lock
    BEFORE INSERT OR UPDATE OR DELETE ON public.sales_invoices
    FOR EACH ROW EXECUTE FUNCTION public.check_fiscal_period_lock_trigger();

DROP TRIGGER IF EXISTS trg_check_fiscal_period_lock ON public.purchase_bills;
CREATE TRIGGER trg_check_fiscal_period_lock
    BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_bills
    FOR EACH ROW EXECUTE FUNCTION public.check_fiscal_period_lock_trigger();

DROP TRIGGER IF EXISTS trg_check_fiscal_period_lock ON public.receipts;
CREATE TRIGGER trg_check_fiscal_period_lock
    BEFORE INSERT OR UPDATE OR DELETE ON public.receipts
    FOR EACH ROW EXECUTE FUNCTION public.check_fiscal_period_lock_trigger();

DROP TRIGGER IF EXISTS trg_check_fiscal_period_lock ON public.payments;
CREATE TRIGGER trg_check_fiscal_period_lock
    BEFORE INSERT OR UPDATE OR DELETE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.check_fiscal_period_lock_trigger();


-- 4. Create RPC to close a fiscal period
CREATE OR REPLACE FUNCTION public.close_fiscal_period(
  p_org_id uuid,
  p_period_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_period_num integer;
    v_start_date date;
    v_end_date date;
    v_status text;
    v_draft_entries_count integer := 0;
    v_draft_invoices_count integer := 0;
    v_draft_bills_count integer := 0;
BEGIN
    -- Require login
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'يجب تسجيل الدخول لإتمام عملية إغلاق الفترة المالية.';
    END IF;

    -- Only allow active owners or admins of the organization
    IF NOT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_org_id
          AND profile_id = v_user_id
          AND role IN ('owner', 'admin')
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'ليس لديك صلاحية إغلاق الفترة. هذه العملية تتطلب صلاحية المالك أو مدير النظام.';
    END IF;

    -- Fetch period information
    SELECT period_num, start_date, end_date, status 
    INTO v_period_num, v_start_date, v_end_date, v_status
    FROM public.fiscal_periods
    WHERE id = p_period_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الفترة المالية المحددة غير موجودة أو لا تنتمي لهذه المنشأة.';
    END IF;

    IF v_status <> 'open' THEN
        RAISE EXCEPTION 'الفترة المالية مغلقة بالفعل أو مقفلة.';
    END IF;

    -- Check for draft journal entries inside this period
    SELECT COUNT(*) INTO v_draft_entries_count
    FROM public.journal_entries
    WHERE organization_id = p_org_id
      AND entry_date >= v_start_date
      AND entry_date <= v_end_date
      AND status = 'draft';

    -- Check for draft sales invoices inside this period
    SELECT COUNT(*) INTO v_draft_invoices_count
    FROM public.sales_invoices
    WHERE organization_id = p_org_id
      AND invoice_date >= v_start_date
      AND invoice_date <= v_end_date
      AND status = 'draft';

    -- Check for draft purchase bills inside this period
    SELECT COUNT(*) INTO v_draft_bills_count
    FROM public.purchase_bills
    WHERE organization_id = p_org_id
      AND bill_date >= v_start_date
      AND bill_date <= v_end_date
      AND status = 'draft';

    -- If draft items found, raise descriptive exception
    IF v_draft_entries_count > 0 OR v_draft_invoices_count > 0 OR v_draft_bills_count > 0 THEN
        RAISE EXCEPTION 'توجد مسودات يجب اعتمادها أو حذفها قبل الإغلاق (قيود مسودة: %, فواتير مبيعات مسودة: %, فواتير مشتريات مسودة: %). يرجى تصفية كافة المسودات في هذه الفترة ومحاولة الإغلاق مجدداً.', v_draft_entries_count, v_draft_invoices_count, v_draft_bills_count;
    END IF;

    -- Close the period
    UPDATE public.fiscal_periods
    SET status = 'closed',
        closed_at = now(),
        closed_by = v_user_id,
        updated_at = now()
    WHERE id = p_period_id AND organization_id = p_org_id;

    -- Log the successful closure inside audit_logs
    BEGIN
        INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
        VALUES (
            p_org_id,
            v_user_id,
            'close_fiscal_period',
            jsonb_build_object(
                'period_id', p_period_id,
                'period_num', v_period_num,
                'start_date', v_start_date,
                'end_date', v_end_date
            )
        );
    EXCEPTION WHEN OTHERS THEN
        -- Ignore audit logging failures
    END;
END;
$$;

-- Secure close_fiscal_period RPC
REVOKE ALL ON FUNCTION public.close_fiscal_period(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_fiscal_period(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_fiscal_period(uuid, uuid) TO authenticated;


-- 5. Create RPC to reopen a closed fiscal period
CREATE OR REPLACE FUNCTION public.reopen_fiscal_period(
  p_org_id uuid,
  p_period_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_period_num integer;
    v_start_date date;
    v_end_date date;
    v_status text;
BEGIN
    -- Require login
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'يجب تسجيل الدخول لإعادة فتح الفترة المالية.';
    END IF;

    -- ONLY active OWNER can reopen
    IF NOT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_org_id
          AND profile_id = v_user_id
          AND role = 'owner'
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'فقط المالك يستطيع إعادة فتح الفترة.';
    END IF;

    -- Fetch period information
    SELECT period_num, start_date, end_date, status 
    INTO v_period_num, v_start_date, v_end_date, v_status
    FROM public.fiscal_periods
    WHERE id = p_period_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الفترة المالية المحددة غير موجودة أو لا تنتمي لهذه المنشأة.';
    END IF;

    IF v_status = 'locked' THEN
        RAISE EXCEPTION 'لا يمكن إعادة فتح فترة مقفلة بالكامل بقرار إداري نهائي.';
    END IF;

    IF v_status <> 'closed' THEN
        RAISE EXCEPTION 'الفترة المالية غير مغلقة لتتمكن من إعادة فتحها.';
    END IF;

    -- Reopen the period
    UPDATE public.fiscal_periods
    SET status = 'open',
        closed_at = NULL,
        closed_by = NULL,
        updated_at = now()
    WHERE id = p_period_id AND organization_id = p_org_id;

    -- Log the successful reopen inside audit_logs
    BEGIN
        INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
        VALUES (
            p_org_id,
            v_user_id,
            'reopen_fiscal_period',
            jsonb_build_object(
                'period_id', p_period_id,
                'period_num', v_period_num,
                'start_date', v_start_date,
                'end_date', v_end_date
            )
        );
    EXCEPTION WHEN OTHERS THEN
        -- Ignore audit logging failures
    END;
END;
$$;

-- Secure reopen_fiscal_period RPC
REVOKE ALL ON FUNCTION public.reopen_fiscal_period(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_fiscal_period(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reopen_fiscal_period(uuid, uuid) TO authenticated;


-- 6. Hardened create_fiscal_year with active owner/admin check only
CREATE OR REPLACE FUNCTION public.create_fiscal_year(
    p_org_id uuid,
    p_name text,
    p_start_date date,
    p_end_date date,
    p_is_current boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_year_id uuid;
    v_curr_start date;
    v_curr_end date;
    v_period_count integer;
BEGIN
    -- 1. Privilege & Authenticated check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_org_id
          AND profile_id = auth.uid()
          AND role IN ('owner', 'admin')
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'غير مصرح: إنشاء السنوات المالية متاح للمالك والمدير فقط.';
    END IF;

    -- Obtain transactional advisory lock on organization to prevent concurrency overlaps
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- 2. Validation Checks
    IF p_start_date >= p_end_date THEN
        RAISE EXCEPTION 'تاريخ بداية السنة المالية يجب أن يكون قبل تاريخ نهايتها.';
    END IF;

    -- Enforce starts on first day of month
    IF EXTRACT(DAY FROM p_start_date) <> 1 THEN
        RAISE EXCEPTION 'يجب أن يبدأ تاريخ السنة المالية في اليوم الأول من الشهر.';
    END IF;

    -- Enforce standard 12 month duration (ends on the last day of the twelfth month)
    IF p_end_date <> (p_start_date + interval '12 months' - interval '1 day')::date THEN
        RAISE EXCEPTION 'يجب أن تكون مدة السنة المالية 12 شهراً متكاملاً وتنتهي في اليوم الأخير من الشهر الثاني عشر.';
    END IF;

    -- Check overlap with any existing fiscal years
    IF EXISTS (
        SELECT 1 FROM public.fiscal_years
        WHERE organization_id = p_org_id
          AND NOT (end_date < p_start_date OR start_date > p_end_date)
    ) THEN
        RAISE EXCEPTION 'تواريخ هذه السنة المالية تتداخل مع فترة أو سنة مالية مسجلة أخرى بالمنشأة.';
    END IF;

    -- Verify Year name uniqueness within organization
    IF EXISTS (
        SELECT 1 FROM public.fiscal_years
        WHERE organization_id = p_org_id AND name = p_name
    ) THEN
        RAISE EXCEPTION 'السنة المالية بهذا الاسم مسجلة بالفعل بالمنشأة.';
    END IF;

    -- 3. Insert Fiscal Year
    INSERT INTO public.fiscal_years (
        organization_id,
        name,
        start_date,
        end_date,
        status,
        is_current,
        created_by
    ) VALUES (
        p_org_id,
        p_name,
        p_start_date,
        p_end_date,
        'draft',
        false, -- start as false, if p_is_current is true we promote atomically below
        auth.uid()
    ) RETURNING id INTO v_year_id;

    -- 4. Dynamic Period Generator Context (strictly 12 periods)
    FOR i IN 1..12 LOOP
        v_curr_start := (p_start_date + ((i - 1) || ' months')::interval)::date;
        v_curr_end := (p_start_date + (i || ' months')::interval - interval '1 day')::date;

        -- Insert Period
        INSERT INTO public.fiscal_periods (
            fiscal_year_id,
            organization_id,
            period_num,
            name,
            start_date,
            end_date,
            status
        ) VALUES (
            v_year_id,
            p_org_id,
            i,
            'F' || TO_CHAR(i, 'FM00'),
            v_curr_start,
            v_curr_end,
            'open'
        );
    END LOOP;

    -- Double-check that exactly 12 periods were generated
    SELECT COUNT(*) INTO v_period_count FROM public.fiscal_periods WHERE fiscal_year_id = v_year_id;
    IF v_period_count <> 12 THEN
        RAISE EXCEPTION 'فشل إنشاء السنة المالية: عدد الفترات المولدة هو % بدلاً من 12.', v_period_count;
    END IF;

    -- 5. Handle Is Current atomic operation inside the database
    IF p_is_current THEN
        -- Reset previous current years
        UPDATE public.fiscal_years
        SET is_current = false
        WHERE organization_id = p_org_id AND is_current = true;

        -- Set new one as current, promote status to open automatically
        UPDATE public.fiscal_years
        SET is_current = true, status = 'open'
        WHERE id = v_year_id;
    END IF;

    -- Record in audit logs
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'create_fiscal_year',
        jsonb_build_object(
            'fiscal_year_id', v_year_id,
            'name', p_name,
            'start_date', p_start_date,
            'end_date', p_end_date,
            'is_current', p_is_current
        )
    );

    RETURN v_year_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_fiscal_year(uuid, text, date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_fiscal_year(uuid, text, date, date, boolean) TO authenticated;


-- 7. Hardened set_current_fiscal_year with active owner/admin check only
CREATE OR REPLACE FUNCTION public.set_current_fiscal_year(
    p_org_id uuid,
    p_year_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- 1. Privilege check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_org_id
          AND profile_id = auth.uid()
          AND role IN ('owner', 'admin')
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'غير مصرح: تغيير السنة المالية الحالية متاح للمالك والمدير فقط.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- 2. Year exists in this org check
    IF NOT EXISTS (
        SELECT 1 FROM public.fiscal_years 
        WHERE id = p_year_id AND organization_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'السنة المالية المحددة غير موجودة في سجلات هذه المنشأة.';
    END IF;

    -- 3. Atomic atomic switcher transaction
    UPDATE public.fiscal_years
    SET is_current = false
    WHERE organization_id = p_org_id AND is_current = true;

    UPDATE public.fiscal_years
    SET is_current = true, status = 'open'
    WHERE id = p_year_id;

    -- Audit log
    INSERT INTO public.audit_logs (
        organization_id,
        profile_id,
        action,
        details
    ) VALUES (
        p_org_id,
        auth.uid(),
        'set_current_fiscal_year',
        jsonb_build_object('fiscal_year_id', p_year_id)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.set_current_fiscal_year(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_current_fiscal_year(uuid, uuid) TO authenticated;

COMMIT;
