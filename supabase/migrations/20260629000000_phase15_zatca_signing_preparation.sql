BEGIN;

-- Phase 15: ZATCA CSID / CSR / Signing Preparation
-- Path: supabase/migrations/20260629000000_phase15_zatca_signing_preparation.sql

CREATE TABLE IF NOT EXISTS public.zatca_signing_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    environment text NOT NULL DEFAULT 'sandbox',
    profile_status text NOT NULL DEFAULT 'not_configured',

    csr_common_name text,
    csr_serial_number text,
    csr_organization_identifier text,
    csr_organization_unit_name text,
    csr_organization_name text,
    csr_country_name text DEFAULT 'SA',
    csr_invoice_type text,
    csr_location text,
    csr_industry text,

    csr_pem text,
    certificate_pem text,
    csid_value text,
    csid_type text,
    certificate_subject text,
    certificate_issuer text,
    certificate_valid_from timestamp with time zone,
    certificate_valid_to timestamp with time zone,

    private_key_storage_mode text NOT NULL DEFAULT 'not_stored',
    private_key_secret_reference text,

    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,

    CONSTRAINT zatca_signing_profiles_org_env_unique UNIQUE (organization_id, environment),
    CONSTRAINT zatca_signing_profiles_environment_check CHECK (environment IN ('sandbox', 'simulation', 'production')),
    CONSTRAINT zatca_signing_profiles_status_check CHECK (profile_status IN ('not_configured', 'csr_metadata_ready', 'csr_created_external', 'csid_added', 'ready_for_integration')),
    CONSTRAINT zatca_signing_profiles_csid_type_check CHECK (csid_type IS NULL OR csid_type IN ('compliance', 'production')),
    CONSTRAINT zatca_signing_profiles_private_key_check CHECK (private_key_storage_mode IN ('not_stored', 'external_secret_manager', 'edge_function_secret_reference'))
);

-- Enable Row Level Security
ALTER TABLE public.zatca_signing_profiles ENABLE ROW LEVEL SECURITY;

-- Drop policies if exist
DROP POLICY IF EXISTS "zatca_signing_profiles_owner_admin_all" ON public.zatca_signing_profiles;
DROP POLICY IF EXISTS "zatca_signing_profiles_accountant_read" ON public.zatca_signing_profiles;

-- RLS policies: owner and admin can do everything
CREATE POLICY "zatca_signing_profiles_owner_admin_all" 
ON public.zatca_signing_profiles
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_members.organization_id = zatca_signing_profiles.organization_id
          AND organization_members.profile_id = auth.uid()
          AND organization_members.role IN ('owner', 'admin')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_members.organization_id = zatca_signing_profiles.organization_id
          AND organization_members.profile_id = auth.uid()
          AND organization_members.role IN ('owner', 'admin')
    )
);

-- RLS policies: accountant can only read
CREATE POLICY "zatca_signing_profiles_accountant_read" 
ON public.zatca_signing_profiles
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_members.organization_id = zatca_signing_profiles.organization_id
          AND organization_members.profile_id = auth.uid()
          AND organization_members.role = 'accountant'
    )
);

-- Create secure RPC to upsert signing profiles
CREATE OR REPLACE FUNCTION public.upsert_zatca_signing_profile(
  p_org_id uuid,
  p_environment text,
  p_profile_status text,
  p_csr_common_name text,
  p_csr_serial_number text,
  p_csr_organization_identifier text,
  p_csr_organization_unit_name text,
  p_csr_organization_name text,
  p_csr_country_name text,
  p_csr_invoice_type text,
  p_csr_location text,
  p_csr_industry text,
  p_csr_pem text,
  p_certificate_pem text,
  p_csid_value text,
  p_csid_type text,
  p_certificate_subject text,
  p_certificate_issuer text,
  p_certificate_valid_from timestamp with time zone,
  p_certificate_valid_to timestamp with time zone,
  p_private_key_storage_mode text,
  p_private_key_secret_reference text,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id uuid;
    v_user_role text;
BEGIN
    -- Auth verification
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً.';
    END IF;

    -- Verify caller role is owner or admin in this organization
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE profile_id = auth.uid() AND organization_id = p_org_id;

    IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحية المالك أو المدير للكيان.';
    END IF;

    -- Pre-checks to prevent private key leak in database across all text fields
    IF COALESCE(p_csr_common_name, '') ILIKE '%BEGIN PRIVATE KEY%' OR COALESCE(p_csr_common_name, '') ILIKE '%BEGIN RSA PRIVATE KEY%' OR COALESCE(p_csr_common_name, '') ILIKE '%BEGIN EC PRIVATE KEY%' OR COALESCE(p_csr_common_name, '') ILIKE '%PRIVATE KEY-----%'
       OR COALESCE(p_csr_serial_number, '') ILIKE '%BEGIN PRIVATE KEY%' OR COALESCE(p_csr_serial_number, '') ILIKE '%BEGIN RSA PRIVATE KEY%' OR COALESCE(p_csr_serial_number, '') ILIKE '%BEGIN EC PRIVATE KEY%' OR COALESCE(p_csr_serial_number, '') ILIKE '%PRIVATE KEY-----%'
       OR COALESCE(p_csr_organization_identifier, '') ILIKE '%BEGIN PRIVATE KEY%' OR COALESCE(p_csr_organization_identifier, '') ILIKE '%BEGIN RSA PRIVATE KEY%' OR COALESCE(p_csr_organization_identifier, '') ILIKE '%BEGIN EC PRIVATE KEY%' OR COALESCE(p_csr_organization_identifier, '') ILIKE '%PRIVATE KEY-----%'
       OR COALESCE(p_csr_organization_unit_name, '') ILIKE '%BEGIN PRIVATE KEY%' OR COALESCE(p_csr_organization_unit_name, '') ILIKE '%BEGIN RSA PRIVATE KEY%' OR COALESCE(p_csr_organization_unit_name, '') ILIKE '%BEGIN EC PRIVATE KEY%' OR COALESCE(p_csr_organization_unit_name, '') ILIKE '%PRIVATE KEY-----%'
       OR COALESCE(p_csr_organization_name, '') ILIKE '%BEGIN PRIVATE KEY%' OR COALESCE(p_csr_organization_name, '') ILIKE '%BEGIN RSA PRIVATE KEY%' OR COALESCE(p_csr_organization_name, '') ILIKE '%BEGIN EC PRIVATE KEY%' OR COALESCE(p_csr_organization_name, '') ILIKE '%PRIVATE KEY-----%'
       OR COALESCE(p_csr_country_name, '') ILIKE '%BEGIN PRIVATE KEY%' OR COALESCE(p_csr_country_name, '') ILIKE '%BEGIN RSA PRIVATE KEY%' OR COALESCE(p_csr_country_name, '') ILIKE '%BEGIN EC PRIVATE KEY%' OR COALESCE(p_csr_country_name, '') ILIKE '%PRIVATE KEY-----%'
       OR COALESCE(p_csr_invoice_type, '') ILIKE '%BEGIN PRIVATE KEY%' OR COALESCE(p_csr_invoice_type, '') ILIKE '%BEGIN RSA PRIVATE KEY%' OR COALESCE(p_csr_invoice_type, '') ILIKE '%BEGIN EC PRIVATE KEY%' OR COALESCE(p_csr_invoice_type, '') ILIKE '%PRIVATE KEY-----%'
       OR COALESCE(p_csr_location, '') ILIKE '%BEGIN PRIVATE KEY%' OR COALESCE(p_csr_location, '') ILIKE '%BEGIN RSA PRIVATE KEY%' OR COALESCE(p_csr_location, '') ILIKE '%BEGIN EC PRIVATE KEY%' OR COALESCE(p_csr_location, '') ILIKE '%PRIVATE KEY-----%'
       OR COALESCE(p_csr_industry, '') ILIKE '%BEGIN PRIVATE KEY%' OR COALESCE(p_csr_industry, '') ILIKE '%BEGIN RSA PRIVATE KEY%' OR COALESCE(p_csr_industry, '') ILIKE '%BEGIN EC PRIVATE KEY%' OR COALESCE(p_csr_industry, '') ILIKE '%PRIVATE KEY-----%'
       OR COALESCE(p_csr_pem, '') ILIKE '%BEGIN PRIVATE KEY%' OR COALESCE(p_csr_pem, '') ILIKE '%BEGIN RSA PRIVATE KEY%' OR COALESCE(p_csr_pem, '') ILIKE '%BEGIN EC PRIVATE KEY%' OR COALESCE(p_csr_pem, '') ILIKE '%PRIVATE KEY-----%'
       OR COALESCE(p_certificate_pem, '') ILIKE '%BEGIN PRIVATE KEY%' OR COALESCE(p_certificate_pem, '') ILIKE '%BEGIN RSA PRIVATE KEY%' OR COALESCE(p_certificate_pem, '') ILIKE '%BEGIN EC PRIVATE KEY%' OR COALESCE(p_certificate_pem, '') ILIKE '%PRIVATE KEY-----%'
       OR COALESCE(p_csid_value, '') ILIKE '%BEGIN PRIVATE KEY%' OR COALESCE(p_csid_value, '') ILIKE '%BEGIN RSA PRIVATE KEY%' OR COALESCE(p_csid_value, '') ILIKE '%BEGIN EC PRIVATE KEY%' OR COALESCE(p_csid_value, '') ILIKE '%PRIVATE KEY-----%'
       OR COALESCE(p_certificate_subject, '') ILIKE '%BEGIN PRIVATE KEY%' OR COALESCE(p_certificate_subject, '') ILIKE '%BEGIN RSA PRIVATE KEY%' OR COALESCE(p_certificate_subject, '') ILIKE '%BEGIN EC PRIVATE KEY%' OR COALESCE(p_certificate_subject, '') ILIKE '%PRIVATE KEY-----%'
       OR COALESCE(p_certificate_issuer, '') ILIKE '%BEGIN PRIVATE KEY%' OR COALESCE(p_certificate_issuer, '') ILIKE '%BEGIN RSA PRIVATE KEY%' OR COALESCE(p_certificate_issuer, '') ILIKE '%BEGIN EC PRIVATE KEY%' OR COALESCE(p_certificate_issuer, '') ILIKE '%PRIVATE KEY-----%'
       OR COALESCE(p_private_key_secret_reference, '') ILIKE '%BEGIN PRIVATE KEY%' OR COALESCE(p_private_key_secret_reference, '') ILIKE '%BEGIN RSA PRIVATE KEY%' OR COALESCE(p_private_key_secret_reference, '') ILIKE '%BEGIN EC PRIVATE KEY%' OR COALESCE(p_private_key_secret_reference, '') ILIKE '%PRIVATE KEY-----%'
       OR COALESCE(p_notes, '') ILIKE '%BEGIN PRIVATE KEY%' OR COALESCE(p_notes, '') ILIKE '%BEGIN RSA PRIVATE KEY%' OR COALESCE(p_notes, '') ILIKE '%BEGIN EC PRIVATE KEY%' OR COALESCE(p_notes, '') ILIKE '%PRIVATE KEY-----%'
    THEN
        RAISE EXCEPTION 'أمنياً: لا يمكن حفظ المفتاح الخاص داخل قاعدة البيانات أو الواجهة. استخدم Secret Manager أو Edge Function Secrets في مرحلة التكامل اللاحقة.';
    END IF;

    -- Validation on CSR request format if provided
    IF p_csr_pem IS NOT NULL AND length(trim(p_csr_pem)) > 0 AND (p_csr_pem NOT LIKE '%BEGIN CERTIFICATE REQUEST%' OR p_csr_pem NOT LIKE '%END CERTIFICATE REQUEST%') THEN
        RAISE EXCEPTION 'نص CSR PEM غير صالح. يجب أن يحتوي على BEGIN CERTIFICATE REQUEST و END CERTIFICATE REQUEST.';
    END IF;

    -- Validation on Certificate format if provided
    IF p_certificate_pem IS NOT NULL AND length(trim(p_certificate_pem)) > 0 AND (p_certificate_pem NOT LIKE '%BEGIN CERTIFICATE%' OR p_certificate_pem NOT LIKE '%END CERTIFICATE%') THEN
        RAISE EXCEPTION 'نص Certificate PEM غير صالح. يجب أن يحتوي على BEGIN CERTIFICATE و END CERTIFICATE.';
    END IF;

    -- Perform upsert
    INSERT INTO public.zatca_signing_profiles (
        organization_id,
        environment,
        profile_status,
        csr_common_name,
        csr_serial_number,
        csr_organization_identifier,
        csr_organization_unit_name,
        csr_organization_name,
        csr_country_name,
        csr_invoice_type,
        csr_location,
        csr_industry,
        csr_pem,
        certificate_pem,
        csid_value,
        csid_type,
        certificate_subject,
        certificate_issuer,
        certificate_valid_from,
        certificate_valid_to,
        private_key_storage_mode,
        private_key_secret_reference,
        notes,
        updated_at
    )
    VALUES (
        p_org_id,
        p_environment,
        p_profile_status,
        p_csr_common_name,
        p_csr_serial_number,
        p_csr_organization_identifier,
        p_csr_organization_unit_name,
        p_csr_organization_name,
        COALESCE(p_csr_country_name, 'SA'),
        p_csr_invoice_type,
        p_csr_location,
        p_csr_industry,
        p_csr_pem,
        p_certificate_pem,
        p_csid_value,
        p_csid_type,
        p_certificate_subject,
        p_certificate_issuer,
        p_certificate_valid_from,
        p_certificate_valid_to,
        COALESCE(p_private_key_storage_mode, 'not_stored'),
        p_private_key_secret_reference,
        p_notes,
        now()
    )
    ON CONFLICT (organization_id, environment)
    DO UPDATE SET
        profile_status = EXCLUDED.profile_status,
        csr_common_name = EXCLUDED.csr_common_name,
        csr_serial_number = EXCLUDED.csr_serial_number,
        csr_organization_identifier = EXCLUDED.csr_organization_identifier,
        csr_organization_unit_name = EXCLUDED.csr_organization_unit_name,
        csr_organization_name = EXCLUDED.csr_organization_name,
        csr_country_name = EXCLUDED.csr_country_name,
        csr_invoice_type = EXCLUDED.csr_invoice_type,
        csr_location = EXCLUDED.csr_location,
        csr_industry = EXCLUDED.csr_industry,
        csr_pem = EXCLUDED.csr_pem,
        certificate_pem = EXCLUDED.certificate_pem,
        csid_value = EXCLUDED.csid_value,
        csid_type = EXCLUDED.csid_type,
        certificate_subject = EXCLUDED.certificate_subject,
        certificate_issuer = EXCLUDED.certificate_issuer,
        certificate_valid_from = EXCLUDED.certificate_valid_from,
        certificate_valid_to = EXCLUDED.certificate_valid_to,
        private_key_storage_mode = EXCLUDED.private_key_storage_mode,
        private_key_secret_reference = EXCLUDED.private_key_secret_reference,
        notes = EXCLUDED.notes,
        updated_at = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_zatca_signing_profile FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_zatca_signing_profile TO authenticated;

COMMIT;
