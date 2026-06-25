BEGIN;

-- Phase 14: ZATCA SDK Validation
-- Path: supabase/migrations/20260628000000_phase14_zatca_sdk_validation.sql

ALTER TABLE public.e_invoice_artifacts
ADD COLUMN IF NOT EXISTS sdk_validation_status text NOT NULL DEFAULT 'not_checked',
ADD COLUMN IF NOT EXISTS sdk_validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS sdk_validation_summary text,
ADD COLUMN IF NOT EXISTS sdk_validated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS sdk_validated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sdk_tool_version text,
ADD COLUMN IF NOT EXISTS sdk_raw_result text;

-- Add constraint check
ALTER TABLE public.e_invoice_artifacts DROP CONSTRAINT IF EXISTS e_invoice_artifacts_sdk_validation_status_check;
ALTER TABLE public.e_invoice_artifacts
ADD CONSTRAINT e_invoice_artifacts_sdk_validation_status_check 
CHECK (sdk_validation_status IN ('not_checked', 'ready_for_check', 'passed', 'failed', 'needs_review'));

-- RPC to update SDK validation result
CREATE OR REPLACE FUNCTION public.update_e_invoice_sdk_validation(
    p_artifact_id uuid,
    p_status text,
    p_errors jsonb,
    p_summary text,
    p_tool_version text,
    p_raw_result text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id uuid;
    v_user_role text;
    v_org_id uuid;
BEGIN
    -- Auth verification
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Fetch organization_id from artifact
    SELECT organization_id INTO v_org_id
    FROM public.e_invoice_artifacts
    WHERE id = p_artifact_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'المستند غير موجود.';
    END IF;

    -- Verify caller is Owner, Admin, or Accountant in the organization
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE profile_id = auth.uid() AND organization_id = v_org_id;

    IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin', 'accountant') THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحية المالك أو المدير أو المحاسب للكيان.';
    END IF;

    -- Update e_invoice_artifacts with SDK validation data
    UPDATE public.e_invoice_artifacts
    SET
        sdk_validation_status = p_status,
        sdk_validation_errors = p_errors,
        sdk_validation_summary = p_summary,
        sdk_tool_version = p_tool_version,
        sdk_raw_result = p_raw_result,
        sdk_validated_at = now(),
        sdk_validated_by = auth.uid(),
        updated_at = now()
    WHERE id = p_artifact_id
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_e_invoice_sdk_validation FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_e_invoice_sdk_validation TO authenticated;

COMMIT;
