BEGIN;

-- Phase 16: Sandbox / Simulation API Integration
-- Path: supabase/migrations/20260630000000_phase16_zatca_sandbox_integration.sql

-- 1. Create zatca_api_submissions table
CREATE TABLE IF NOT EXISTS public.zatca_api_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    sales_invoice_id uuid REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
    artifact_id uuid REFERENCES public.e_invoice_artifacts(id) ON DELETE SET NULL,
    signing_profile_id uuid REFERENCES public.zatca_signing_profiles(id) ON DELETE SET NULL,
    environment text NOT NULL,
    operation text NOT NULL,
    submission_status text NOT NULL DEFAULT 'draft',
    request_uuid text,
    request_xml_hash text,
    request_payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    http_status integer,
    zatca_status text,
    zatca_request_id text,
    zatca_response_payload jsonb,
    zatca_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
    zatca_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
    error_message text,
    submitted_at timestamp with time zone,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT zatca_api_submissions_environment_check CHECK (environment IN ('sandbox', 'simulation')),
    CONSTRAINT zatca_api_submissions_operation_check CHECK (operation IN ('connectivity_check', 'compliance_check', 'sandbox_invoice_test', 'simulation_invoice_test')),
    CONSTRAINT zatca_api_submissions_status_check CHECK (submission_status IN ('draft', 'blocked', 'ready', 'submitted', 'accepted', 'rejected', 'failed', 'needs_review'))
);

-- 2. Add trigger for updated_at tracking
DROP TRIGGER IF EXISTS trg_set_updated_at_zatca_api_submissions ON public.zatca_api_submissions;
CREATE TRIGGER trg_set_updated_at_zatca_api_submissions
    BEFORE UPDATE ON public.zatca_api_submissions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_column();

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.zatca_api_submissions ENABLE ROW LEVEL SECURITY;

-- 4. Select Policy - only allow authenticated organization members with role owner/admin/accountant
DROP POLICY IF EXISTS "Select zatca_api_submissions" ON public.zatca_api_submissions;
CREATE POLICY "Select zatca_api_submissions"
ON public.zatca_api_submissions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.profile_id = auth.uid()
      AND om.organization_id = zatca_api_submissions.organization_id
      AND om.role IN ('owner', 'admin', 'accountant')
  )
);

-- 5. Revoke direct write access from public, anon, and authenticated roles to enforce RPC / Service Role
REVOKE ALL ON TABLE public.zatca_api_submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.zatca_api_submissions TO authenticated;

-- 6. RPC Function to log submissions securely
CREATE OR REPLACE FUNCTION public.create_zatca_api_submission_log(
    p_org_id uuid,
    p_sales_invoice_id uuid,
    p_artifact_id uuid,
    p_signing_profile_id uuid,
    p_environment text,
    p_operation text,
    p_submission_status text,
    p_request_uuid text,
    p_request_xml_hash text,
    p_request_payload_summary jsonb,
    p_http_status integer,
    p_zatca_status text,
    p_zatca_request_id text,
    p_zatca_response_payload jsonb,
    p_zatca_warnings jsonb,
    p_zatca_errors jsonb,
    p_error_message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_submission_id uuid;
    v_user_role text;
BEGIN
    -- Auth verification
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Verify caller is Owner, Admin, or Accountant in the organization
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE profile_id = auth.uid() AND organization_id = p_org_id;

    IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin', 'accountant') THEN
        RAISE EXCEPTION 'غير مصرح: لا تملك الصلاحيات الكافية لتسجيل محاولة الاتصال.';
    END IF;

    -- Ensure environment is not production
    IF p_environment = 'production' THEN
        RAISE EXCEPTION 'غير مصرح: بيئة الإنتاج غير مدعومة في هذه المرحلة.';
    END IF;

    -- Insert log
    INSERT INTO public.zatca_api_submissions (
        organization_id,
        sales_invoice_id,
        artifact_id,
        signing_profile_id,
        environment,
        operation,
        submission_status,
        request_uuid,
        request_xml_hash,
        request_payload_summary,
        http_status,
        zatca_status,
        zatca_request_id,
        zatca_response_payload,
        zatca_warnings,
        zatca_errors,
        error_message,
        created_by,
        submitted_at
    )
    VALUES (
        p_org_id,
        p_sales_invoice_id,
        p_artifact_id,
        p_signing_profile_id,
        p_environment,
        p_operation,
        p_submission_status,
        p_request_uuid,
        p_request_xml_hash,
        COALESCE(p_request_payload_summary, '{}'::jsonb),
        p_http_status,
        p_zatca_status,
        p_zatca_request_id,
        COALESCE(p_zatca_response_payload, null),
        COALESCE(p_zatca_warnings, '[]'::jsonb),
        COALESCE(p_zatca_errors, '[]'::jsonb),
        p_error_message,
        auth.uid(),
        CASE WHEN p_submission_status = 'submitted' OR p_submission_status = 'accepted' OR p_submission_status = 'rejected' THEN now() ELSE NULL END
    )
    RETURNING id INTO v_submission_id;

    RETURN v_submission_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_zatca_api_submission_log FROM PUBLIC, anon, authenticated;

COMMIT;
