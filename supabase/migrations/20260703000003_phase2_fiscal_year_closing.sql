BEGIN;

-- 1. Redefine status constraint on public.fiscal_years and add required columns
ALTER TABLE public.fiscal_years DROP CONSTRAINT IF EXISTS fiscal_years_status_check;

ALTER TABLE public.fiscal_years ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';
ALTER TABLE public.fiscal_years ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone NULL;
ALTER TABLE public.fiscal_years ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL NULL;
ALTER TABLE public.fiscal_years ADD COLUMN IF NOT EXISTS closing_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL NULL;
ALTER TABLE public.fiscal_years ADD COLUMN IF NOT EXISTS close_notes text NULL;
ALTER TABLE public.fiscal_years ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NULL;

-- Redefine check constraint on fiscal_years status to include 'draft', 'open', 'closed', 'locked'
ALTER TABLE public.fiscal_years ADD CONSTRAINT fiscal_years_status_check CHECK (status IN ('draft', 'open', 'closed', 'locked'));


-- 2. Create helper to check if a date falls inside a closed fiscal year
CREATE OR REPLACE FUNCTION public.is_date_in_closed_fiscal_year(
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
        FROM public.fiscal_years 
        WHERE organization_id = p_org_id 
          AND p_date >= start_date 
          AND p_date <= end_date 
          AND status IN ('closed', 'locked')
    ) INTO v_closed;
    RETURN v_closed;
END;
$$;

REVOKE ALL ON FUNCTION public.is_date_in_closed_fiscal_year(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_date_in_closed_fiscal_year(uuid, date) TO authenticated;


-- 3. Enhance period locking helper to allow bypass when performing administrative system closures
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
    -- Check for session bypass configuration (used during administrative close/reopen routines)
    IF COALESCE(current_setting('app.bypass_fiscal_lock', true), 'false') = 'true' THEN
        RETURN false;
    END IF;

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


-- 4. Update core validation trigger to check for both closed periods AND closed fiscal years
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
    -- Bypass checking if session config bypass is active
    IF COALESCE(current_setting('app.bypass_fiscal_lock', true), 'false') = 'true' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

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

    -- 1. Block operations inside closed fiscal years
    IF public.is_date_in_closed_fiscal_year(v_org_id, v_date) THEN
        BEGIN
            INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
            VALUES (
                v_org_id,
                auth.uid(),
                'blocked_posting_closed_fiscal_year',
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

        RAISE EXCEPTION 'لا يمكن إجراء عمليات مالية (إنشاء، تعديل، اعتماد، أو حذف) داخل سنة مالية مغلقة.';
    END IF;

    -- 2. Block operations inside closed/locked fiscal periods
    IF public.is_date_in_closed_period(v_org_id, v_date) THEN
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


-- 5. Create RPC: get_fiscal_year_closing_summary
CREATE OR REPLACE FUNCTION public.get_fiscal_year_closing_summary(
  p_org_id uuid,
  p_fiscal_year_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_start_date date;
    v_end_date date;
    v_total_revenue numeric(15,2) := 0.00;
    v_total_expenses numeric(15,2) := 0.00;
    v_retained_acc_id uuid;
    v_retained_acc_name text;
    v_all_periods_closed boolean := false;
    v_has_draft_entries boolean := false;
    v_has_draft_invoices boolean := false;
    v_has_draft_bills boolean := false;
    v_retained_acc_valid boolean := true;
    v_retained_acc_issue text := null;
    v_retained_class text;
    v_retained_active boolean;
    v_retained_direct boolean;
BEGIN
    -- Require login
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول.';
    END IF;

    -- Explicit Owner Authorization Check
    IF NOT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_org_id
          AND profile_id = auth.uid()
          AND role = 'owner'
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'غير مصرح: ملخص إقفال السنة المالية متاح لمالك المنشأة فقط.';
    END IF;

    -- Fetch fiscal year dates
    SELECT start_date, end_date INTO v_start_date, v_end_date
    FROM public.fiscal_years
    WHERE id = p_fiscal_year_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السنة المالية غير موجودة.';
    END IF;

    -- Calculate total revenues and expenses from posted journal entries
    SELECT 
        COALESCE(SUM(CASE WHEN a.classification = 'revenue' THEN (l.credit - l.debit) ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN a.classification = 'expenses' THEN (l.debit - l.credit) ELSE 0.00 END), 0.00)
    INTO v_total_revenue, v_total_expenses
    FROM public.journal_entry_lines l
    JOIN public.journal_entries e ON e.id = l.journal_entry_id
    JOIN public.accounts a ON a.id = l.account_id
    WHERE e.organization_id = p_org_id
      AND e.entry_date >= v_start_date
      AND e.entry_date <= v_end_date
      AND e.status = 'posted'
      AND a.classification IN ('revenue', 'expenses');

    -- Retained Earnings Account
    SELECT 
        s.default_retained_earnings_account_id,
        a.name_ar
    INTO v_retained_acc_id, v_retained_acc_name
    FROM public.accounting_settings s
    LEFT JOIN public.accounts a ON a.id = s.default_retained_earnings_account_id
    WHERE s.organization_id = p_org_id;

    -- Improve Retained Earnings Account Validation
    IF v_retained_acc_id IS NULL THEN
        v_retained_acc_valid := false;
        v_retained_acc_issue := 'حساب الأرباح المبقاة غير مضبوط.';
    ELSE
        SELECT classification, is_active, allow_direct_posting
        INTO v_retained_class, v_retained_active, v_retained_direct
        FROM public.accounts
        WHERE id = v_retained_acc_id AND organization_id = p_org_id;

        IF NOT FOUND THEN
            v_retained_acc_valid := false;
            v_retained_acc_issue := 'حساب الأرباح المبقاة غير موجود في دليل الحسابات.';
        ELSIF v_retained_class <> 'equity' THEN
            v_retained_acc_valid := false;
            v_retained_acc_issue := 'حساب الأرباح المبقاة يجب أن يكون من حقوق الملكية.';
        ELSIF NOT v_retained_active OR NOT v_retained_direct THEN
            v_retained_acc_valid := false;
            v_retained_acc_issue := 'حساب الأرباح المبقاة غير نشط أو لا يقبل الترحيل المباشر.';
        END IF;
    END IF;

    -- Check if all periods of the year are closed/locked
    SELECT NOT EXISTS (
        SELECT 1 
        FROM public.fiscal_periods
        WHERE fiscal_year_id = p_fiscal_year_id
          AND organization_id = p_org_id
          AND status = 'open'
    ) INTO v_all_periods_closed;

    -- Check for draft items
    SELECT EXISTS (
        SELECT 1 FROM public.journal_entries
        WHERE organization_id = p_org_id
          AND entry_date >= v_start_date AND entry_date <= v_end_date
          AND status = 'draft'
    ) INTO v_has_draft_entries;

    SELECT EXISTS (
        SELECT 1 FROM public.sales_invoices
        WHERE organization_id = p_org_id
          AND invoice_date >= v_start_date AND invoice_date <= v_end_date
          AND status = 'draft'
    ) INTO v_has_draft_invoices;

    SELECT EXISTS (
        SELECT 1 FROM public.purchase_bills
        WHERE organization_id = p_org_id
          AND bill_date >= v_start_date AND bill_date <= v_end_date
          AND status = 'draft'
    ) INTO v_has_draft_bills;

    RETURN jsonb_build_object(
        'total_revenue', v_total_revenue,
        'total_expenses', v_total_expenses,
        'net_profit_or_loss', (v_total_revenue - v_total_expenses),
        'retained_earnings_account_id', v_retained_acc_id,
        'retained_earnings_account_name', v_retained_acc_name,
        'all_periods_closed', v_all_periods_closed,
        'has_draft_entries', v_has_draft_entries,
        'has_draft_invoices', v_has_draft_invoices,
        'has_draft_bills', v_has_draft_bills,
        'retained_earnings_account_valid', v_retained_acc_valid,
        'retained_earnings_account_issue', v_retained_acc_issue
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_fiscal_year_closing_summary(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fiscal_year_closing_summary(uuid, uuid) TO authenticated;


-- 6. Create RPC: close_fiscal_year
CREATE OR REPLACE FUNCTION public.close_fiscal_year(
  p_org_id uuid,
  p_fiscal_year_id uuid,
  p_close_notes text default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_year_name text;
    v_start_date date;
    v_end_date date;
    v_status text;
    v_closing_period_id uuid;
    
    v_retained_earnings_acc_id uuid;
    v_retained_class text;
    v_retained_active boolean;
    v_retained_direct boolean;
    
    v_entry_id uuid;
    v_line_num integer := 1;
    v_balance numeric(15,2);
    v_debit numeric(15,2);
    v_credit numeric(15,2);
    
    v_total_debit_sum numeric(15,2) := 0.00;
    v_total_credit_sum numeric(15,2) := 0.00;
    v_diff numeric(15,2);
    
    r record;
BEGIN
    -- Require login
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- ONLY Owner is authorized to close a fiscal year
    IF NOT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_org_id
          AND profile_id = v_user_id
          AND role = 'owner'
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'غير مصرح: إقفال السنة المالية متاح لمالك المنشأة فقط.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Fetch year information
    SELECT name, start_date, end_date, status
    INTO v_year_name, v_start_date, v_end_date, v_status
    FROM public.fiscal_years
    WHERE id = p_fiscal_year_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السنة المالية المحددة غير موجودة.';
    END IF;

    -- Prevent re-closing if already closed or locked
    IF v_status = 'closed' OR v_status = 'locked' THEN
        RETURN jsonb_build_object(
            'status', 'already_closed',
            'fiscal_year_id', p_fiscal_year_id
        );
    END IF;

    -- Ensure all periods are closed/locked
    IF EXISTS (
        SELECT 1 
        FROM public.fiscal_periods
        WHERE fiscal_year_id = p_fiscal_year_id
          AND organization_id = p_org_id
          AND status = 'open'
    ) THEN
        RAISE EXCEPTION 'يجب إغلاق جميع الفترات المالية الشهرية قبل إقفال السنة المالية.';
    END IF;

    -- Check for draft transactions inside the year
    IF EXISTS (
        SELECT 1 FROM public.journal_entries
        WHERE organization_id = p_org_id
          AND entry_date >= v_start_date AND entry_date <= v_end_date
          AND status = 'draft'
    ) THEN
        RAISE EXCEPTION 'توجد قيود مسودة غير معتمدة داخل السنة المالية. يرجى اعتمادها أو حذفها.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.sales_invoices
        WHERE organization_id = p_org_id
          AND invoice_date >= v_start_date AND invoice_date <= v_end_date
          AND status = 'draft'
    ) THEN
        RAISE EXCEPTION 'توجد فواتير مبيعات مسودة غير معتمدة داخل السنة المالية. يرجى اعتمادها أو حذفها.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.purchase_bills
        WHERE organization_id = p_org_id
          AND bill_date >= v_start_date AND bill_date <= v_end_date
          AND status = 'draft'
    ) THEN
        RAISE EXCEPTION 'توجد فواتير مشتريات مسودة غير معتمدة داخل السنة المالية. يرجى اعتمادها أو حذفها.';
    END IF;

    -- Get Retained Earnings account from settings
    SELECT default_retained_earnings_account_id INTO v_retained_earnings_acc_id
    FROM public.accounting_settings
    WHERE organization_id = p_org_id;

    IF v_retained_earnings_acc_id IS NULL THEN
        RAISE EXCEPTION 'حساب الأرباح المبقاة الافتراضي غير مضبوط في إعدادات المحاسبة.';
    END IF;

    -- Validate retained earnings account
    SELECT classification, is_active, allow_direct_posting 
    INTO v_retained_class, v_retained_active, v_retained_direct
    FROM public.accounts
    WHERE id = v_retained_earnings_acc_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'حساب الأرباح المبقاة غير موجود في دليل حسابات هذه المنشأة.';
    END IF;

    IF v_retained_class <> 'equity' THEN
        RAISE EXCEPTION 'يجب أن يكون تصنيف حساب الأرباح المبقاة من نوع حقوق الملكية (equity).';
    END IF;

    IF NOT v_retained_active OR NOT v_retained_direct THEN
        RAISE EXCEPTION 'حساب الأرباح المبقاة غير نشط أو لا يسمح بالترحيل المباشر إليه.';
    END IF;

    -- Resolve fiscal period id for the end date to post the closing entry
    SELECT id INTO v_closing_period_id
    FROM public.fiscal_periods
    WHERE fiscal_year_id = p_fiscal_year_id
      AND organization_id = p_org_id
      AND v_end_date >= start_date AND v_end_date <= end_date
    LIMIT 1;

    IF v_closing_period_id IS NULL THEN
        SELECT id INTO v_closing_period_id
        FROM public.fiscal_periods
        WHERE fiscal_year_id = p_fiscal_year_id AND organization_id = p_org_id
        ORDER BY period_num DESC
        LIMIT 1;
    END IF;

    -- Set local setting to bypass the fiscal period/year lock checks during administrative system generation
    PERFORM set_config('app.bypass_fiscal_lock', 'true', true);

    -- Insert draft closing journal entry header first
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
        p_fiscal_year_id,
        v_closing_period_id,
        'CLOSE-' || to_char(v_end_date, 'YYYY'), -- Temp placeholder, trigger generates final serial
        v_end_date,
        'YEAR-CLOSE-' || v_year_name,
        'قيد إقفال السنة المالية ' || v_year_name,
        'system',
        'posted',
        now(),
        v_user_id,
        v_user_id
    ) RETURNING id INTO v_entry_id;

    -- Iterate and calculate balances of revenue & expense accounts
    FOR r IN (
        SELECT 
            l.account_id,
            a.classification,
            COALESCE(SUM(l.debit), 0.00) as total_debit,
            COALESCE(SUM(l.credit), 0.00) as total_credit
        FROM public.journal_entry_lines l
        JOIN public.journal_entries e ON e.id = l.journal_entry_id
        JOIN public.accounts a ON a.id = l.account_id
        WHERE e.organization_id = p_org_id
          AND e.entry_date >= v_start_date
          AND e.entry_date <= v_end_date
          AND e.status = 'posted'
          AND a.classification IN ('revenue', 'expenses')
        GROUP BY l.account_id, a.classification
    ) LOOP
        v_balance := 0.00;
        v_debit := 0.00;
        v_credit := 0.00;

        IF r.classification = 'revenue' THEN
            v_balance := r.total_credit - r.total_debit;
            IF v_balance > 0 THEN
                -- Net credit balance, zero it out with a DEBIT
                v_debit := v_balance;
            ELSIF v_balance < 0 THEN
                -- Net debit balance, zero it out with a CREDIT
                v_credit := ABS(v_balance);
            END IF;
        ELSE -- expenses
            v_balance := r.total_debit - r.total_credit;
            IF v_balance > 0 THEN
                -- Net debit balance, zero it out with a CREDIT
                v_credit := v_balance;
            ELSIF v_balance < 0 THEN
                -- Net credit balance, zero it out with a DEBIT
                v_debit := ABS(v_balance);
            END IF;
        END IF;

        IF v_debit > 0 OR v_credit > 0 THEN
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
                r.account_id,
                v_line_num,
                'تصفير الحساب عند إقفال السنة المالية ' || v_year_name,
                v_debit,
                v_credit
            );
            v_line_num := v_line_num + 1;
            v_total_debit_sum := v_total_debit_sum + v_debit;
            v_total_credit_sum := v_total_credit_sum + v_credit;
        END IF;
    END LOOP;

    -- If no activity (no revenue or expense transactions recorded in the year)
    IF v_line_num = 1 THEN
        -- Remove the empty journal entry we just inserted
        DELETE FROM public.journal_entries WHERE id = v_entry_id;

        -- Atomically close the fiscal year
        UPDATE public.fiscal_years
        SET status = 'closed',
            closed_at = now(),
            closed_by = v_user_id,
            closing_entry_id = NULL,
            close_notes = p_close_notes,
            updated_at = now()
        WHERE id = p_fiscal_year_id AND organization_id = p_org_id;

        -- Lock all the periods of this year permanently
        UPDATE public.fiscal_periods
        SET status = 'locked',
            locked_reason = 'تم قفل الفترة تلقائياً بعد إقفال السنة المالية ' || v_year_name,
            updated_at = now()
        WHERE fiscal_year_id = p_fiscal_year_id AND organization_id = p_org_id;

        -- Record successful audit log
        BEGIN
            INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
            VALUES (
                p_org_id,
                v_user_id,
                'close_fiscal_year',
                jsonb_build_object(
                    'fiscal_year_id', p_fiscal_year_id,
                    'name', v_year_name,
                    'result', 'closed_no_activity'
                )
            );
        EXCEPTION WHEN OTHERS THEN
        END;

        RETURN jsonb_build_object(
            'status', 'closed_no_activity',
            'fiscal_year_id', p_fiscal_year_id
        );
    END IF;

    -- Determine retained earnings balancing side
    v_diff := v_total_debit_sum - v_total_credit_sum;

    IF v_diff > 0 THEN
        -- Net profit (Debit closing lines exceed Credit closing lines), Credit Retained Earnings
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
            v_retained_earnings_acc_id,
            v_line_num,
            'تحويل صافي أرباح السنة المالية ' || v_year_name || ' إلى الأرباح المبقاة',
            0.00,
            v_diff
        );
    ELSIF v_diff < 0 THEN
        -- Net loss, Debit Retained Earnings
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
            v_retained_earnings_acc_id,
            v_line_num,
            'تحويل صافي خسائر السنة المالية ' || v_year_name || ' إلى الأرباح المبقاة',
            ABS(v_diff),
            0.00
        );
    END IF;

    -- Finally, link closing entry to year and close it
    UPDATE public.fiscal_years
    SET status = 'closed',
        closed_at = now(),
        closed_by = v_user_id,
        closing_entry_id = v_entry_id,
        close_notes = p_close_notes,
        updated_at = now()
    WHERE id = p_fiscal_year_id AND organization_id = p_org_id;

    -- Lock all the periods of this year
    UPDATE public.fiscal_periods
    SET status = 'locked',
        locked_reason = 'تم قفل الفترة تلقائياً بعد إقفال السنة المالية ' || v_year_name,
        updated_at = now()
    WHERE fiscal_year_id = p_fiscal_year_id AND organization_id = p_org_id;

    -- Record Audit Log
    BEGIN
        INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
        VALUES (
            p_org_id,
            v_user_id,
            'close_fiscal_year',
            jsonb_build_object(
                'fiscal_year_id', p_fiscal_year_id,
                'name', v_year_name,
                'closing_entry_id', v_entry_id,
                'net_profit_or_loss', v_diff,
                'result', 'success'
            )
        );
        
        INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
        VALUES (
            p_org_id,
            v_user_id,
            'fiscal_year_closing_entry_created',
            jsonb_build_object(
                'fiscal_year_id', p_fiscal_year_id,
                'journal_entry_id', v_entry_id
            )
        );
    EXCEPTION WHEN OTHERS THEN
    END;

    -- Reset bypass configuration
    PERFORM set_config('app.bypass_fiscal_lock', 'false', true);

    RETURN jsonb_build_object(
        'status', 'success',
        'fiscal_year_id', p_fiscal_year_id,
        'closing_entry_id', v_entry_id,
        'net_amount', v_diff
    );
END;
$$;

REVOKE ALL ON FUNCTION public.close_fiscal_year(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_fiscal_year(uuid, uuid, text) TO authenticated;


-- 7. Create RPC: reopen_fiscal_year
CREATE OR REPLACE FUNCTION public.reopen_fiscal_year(
  p_org_id uuid,
  p_fiscal_year_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_year_name text;
    v_status text;
    v_closing_entry_id uuid;
    v_rev_entry_id uuid;
BEGIN
    -- Require login
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Require a reason to reopen
    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'يرجى تقديم سبب مقبول لإعادة فتح السنة المالية.';
    END IF;

    -- ONLY Owner can reopen a fiscal year
    IF NOT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_org_id
          AND profile_id = v_user_id
          AND role = 'owner'
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'غير مصرح: إعادة فتح السنة المالية متاحة لمالك المنشأة حصرياً.';
    END IF;

    -- Obtain transactional advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

    -- Fetch fiscal year details
    SELECT name, status, closing_entry_id
    INTO v_year_name, v_status, v_closing_entry_id
    FROM public.fiscal_years
    WHERE id = p_fiscal_year_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السنة المالية غير موجودة.';
    END IF;

    -- Year must be currently closed to reopen
    IF v_status <> 'closed' THEN
        RAISE EXCEPTION 'السنة المالية غير مغلقة لتتمكن من إعادة فتحها.';
    END IF;

    -- Set local setting to bypass the fiscal period/year lock checks during administrative system generation
    PERFORM set_config('app.bypass_fiscal_lock', 'true', true);

    -- If a closing entry exists, reverse it محاسبياً via a reversal entry
    IF v_closing_entry_id IS NOT NULL THEN
        -- Insert reversal entry header
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
        )
        SELECT 
            organization_id,
            fiscal_year_id,
            fiscal_period_id,
            'REV-CLOSE-' || to_char(entry_date, 'YYYY'),
            entry_date,
            'REV-' || reference,
            'عكس قيد إقفال السنة المالية ' || v_year_name || ' - السبب: ' || p_reason,
            'system',
            'posted',
            now(),
            v_user_id,
            v_user_id
        FROM public.journal_entries
        WHERE id = v_closing_entry_id
        RETURNING id INTO v_rev_entry_id;

        -- Insert reversed lines (Debits become Credits and vice versa)
        INSERT INTO public.journal_entry_lines (
            journal_entry_id,
            organization_id,
            account_id,
            line_number,
            description,
            debit,
            credit
        )
        SELECT 
            v_rev_entry_id,
            organization_id,
            account_id,
            line_number,
            'عكس: ' || description,
            credit, -- debit <- credit
            debit   -- credit <- debit
        FROM public.journal_entry_lines
        WHERE journal_entry_id = v_closing_entry_id;

        -- Mark original closing entry as reversed
        UPDATE public.journal_entries
        SET status = 'reversed',
            reversed_entry_id = v_rev_entry_id,
            reversed_at = now(),
            reversed_by = v_user_id
        WHERE id = v_closing_entry_id;
    END IF;

    -- Update fiscal year to open state
    UPDATE public.fiscal_years
    SET status = 'open',
        closed_at = NULL,
        closed_by = NULL,
        closing_entry_id = NULL,
        close_notes = NULL,
        updated_at = now()
    WHERE id = p_fiscal_year_id AND organization_id = p_org_id;

    -- Unlock all locked periods (reverting them to closed, NOT open, as required by Phase 2 rules)
    UPDATE public.fiscal_periods
    SET status = 'closed',
        locked_reason = NULL,
        updated_at = now()
    WHERE fiscal_year_id = p_fiscal_year_id AND organization_id = p_org_id AND status = 'locked';

    -- Record Audit Log
    BEGIN
        INSERT INTO public.audit_logs (organization_id, profile_id, action, details)
        VALUES (
            p_org_id,
            v_user_id,
            'reopen_fiscal_year',
            jsonb_build_object(
                'fiscal_year_id', p_fiscal_year_id,
                'name', v_year_name,
                'reason', p_reason,
                'reversal_entry_id', v_rev_entry_id
            )
        );
    EXCEPTION WHEN OTHERS THEN
    END;

    -- Reset bypass configuration
    PERFORM set_config('app.bypass_fiscal_lock', 'false', true);

    RETURN jsonb_build_object(
        'status', 'success',
        'fiscal_year_id', p_fiscal_year_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_fiscal_year(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_fiscal_year(uuid, uuid, text) TO authenticated;

COMMIT;
