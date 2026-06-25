BEGIN;

-- Phase 12: ZATCA Foundation — QR + XML Base Layer
-- Path: supabase/migrations/20260626000000_phase12_zatca_foundation.sql

-- 1. Create zatca_settings table
CREATE TABLE IF NOT EXISTS public.zatca_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
    is_enabled boolean NOT NULL DEFAULT false,
    seller_name text,
    seller_vat_number text,
    seller_commercial_registration text,
    seller_address text,
    seller_city text,
    seller_postal_code text,
    seller_country text DEFAULT 'SA',
    invoice_type_default text DEFAULT 'simplified',
    environment text DEFAULT 'sandbox',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT zatca_settings_invoice_type_check CHECK (invoice_type_default IN ('simplified', 'standard')),
    CONSTRAINT zatca_settings_environment_check CHECK (environment IN ('sandbox', 'simulation', 'production'))
);

-- 2. Create e_invoice_artifacts table
CREATE TABLE IF NOT EXISTS public.e_invoice_artifacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    sales_invoice_id uuid NOT NULL UNIQUE REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
    invoice_number text NOT NULL,
    invoice_type text NOT NULL DEFAULT 'simplified',
    qr_tlv_base64 text,
    xml_content text,
    xml_hash text,
    generation_status text NOT NULL DEFAULT 'draft',
    validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
    generated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT e_invoice_artifacts_invoice_type_check CHECK (invoice_type IN ('simplified', 'standard')),
    CONSTRAINT e_invoice_artifacts_status_check CHECK (generation_status IN ('draft', 'qr_generated', 'xml_generated', 'invalid')),
    CONSTRAINT e_invoice_artifacts_unique_org_invoice UNIQUE (organization_id, sales_invoice_id)
);

-- 3. Triggers for updated_at tracking
DROP TRIGGER IF EXISTS trg_set_updated_at_zatca_settings ON public.zatca_settings;
CREATE TRIGGER trg_set_updated_at_zatca_settings
    BEFORE UPDATE ON public.zatca_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_column();

DROP TRIGGER IF EXISTS trg_set_updated_at_e_invoice_artifacts ON public.e_invoice_artifacts;
CREATE TRIGGER trg_set_updated_at_e_invoice_artifacts
    BEFORE UPDATE ON public.e_invoice_artifacts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_column();

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.zatca_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.e_invoice_artifacts ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "Select zatca_settings" ON public.zatca_settings;

CREATE POLICY "Select zatca_settings"
ON public.zatca_settings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.profile_id = auth.uid()
      AND om.organization_id = zatca_settings.organization_id
      AND om.role IN ('owner', 'admin', 'accountant', 'viewer')
  )
);

DROP POLICY IF EXISTS "Select e_invoice_artifacts" ON public.e_invoice_artifacts;

CREATE POLICY "Select e_invoice_artifacts"
ON public.e_invoice_artifacts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.profile_id = auth.uid()
      AND om.organization_id = e_invoice_artifacts.organization_id
      AND om.role IN ('owner', 'admin', 'accountant')
  )
);

-- 6. Direct writes security configuration (Disable direct inserts/updates/deletes)
REVOKE ALL ON TABLE public.zatca_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.e_invoice_artifacts FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.zatca_settings TO authenticated;
GRANT SELECT ON TABLE public.e_invoice_artifacts TO authenticated;

-- 7. SEC DEF Functions
-- Function: upsert_zatca_settings
CREATE OR REPLACE FUNCTION public.upsert_zatca_settings(
    p_org_id uuid,
    p_is_enabled boolean,
    p_seller_name text,
    p_seller_vat_number text,
    p_seller_commercial_registration text,
    p_seller_address text,
    p_seller_city text,
    p_seller_postal_code text,
    p_seller_country text,
    p_invoice_type_default text,
    p_environment text
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

    -- Verify caller is Owner or Admin in the organization
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE profile_id = auth.uid() AND organization_id = p_org_id;

    IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحية المالك أو المدير للكيان.';
    END IF;

    -- Upsert
    INSERT INTO public.zatca_settings (
        organization_id,
        is_enabled,
        seller_name,
        seller_vat_number,
        seller_commercial_registration,
        seller_address,
        seller_city,
        seller_postal_code,
        seller_country,
        invoice_type_default,
        environment
    )
    VALUES (
        p_org_id,
        p_is_enabled,
        p_seller_name,
        p_seller_vat_number,
        p_seller_commercial_registration,
        p_seller_address,
        p_seller_city,
        p_seller_postal_code,
        p_seller_country,
        p_invoice_type_default,
        p_environment
    )
    ON CONFLICT (organization_id) DO UPDATE
    SET
        is_enabled = EXCLUDED.is_enabled,
        seller_name = EXCLUDED.seller_name,
        seller_vat_number = EXCLUDED.seller_vat_number,
        seller_commercial_registration = EXCLUDED.seller_commercial_registration,
        seller_address = EXCLUDED.seller_address,
        seller_city = EXCLUDED.seller_city,
        seller_postal_code = EXCLUDED.seller_postal_code,
        seller_country = EXCLUDED.seller_country,
        invoice_type_default = EXCLUDED.invoice_type_default,
        environment = EXCLUDED.environment,
        updated_at = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_zatca_settings FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_zatca_settings TO authenticated;

-- Function: upsert_e_invoice_artifact
CREATE OR REPLACE FUNCTION public.upsert_e_invoice_artifact(
    p_org_id uuid,
    p_invoice_id uuid,
    p_invoice_number text,
    p_invoice_type text,
    p_qr_tlv_base64 text,
    p_xml_content text,
    p_xml_hash text,
    p_generation_status text,
    p_validation_errors jsonb
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

    -- Verify caller is Owner, Admin, or Accountant in the organization
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE profile_id = auth.uid() AND organization_id = p_org_id;

    IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin', 'accountant') THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحية المالك أو المدير أو المحاسب للكيان.';
    END IF;

    -- Verify that the invoice belongs to the same organization and is approved
    IF NOT EXISTS (
      SELECT 1
      FROM public.sales_invoices si
      WHERE si.id = p_invoice_id
        AND si.organization_id = p_org_id
        AND si.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'لا يمكن توليد الفوترة الإلكترونية إلا لفاتورة مبيعات معتمدة تابعة لنفس المنشأة.';
    END IF;

    -- Upsert
    INSERT INTO public.e_invoice_artifacts (
        organization_id,
        sales_invoice_id,
        invoice_number,
        invoice_type,
        qr_tlv_base64,
        xml_content,
        xml_hash,
        generation_status,
        validation_errors,
        generated_at
    )
    VALUES (
        p_org_id,
        p_invoice_id,
        p_invoice_number,
        p_invoice_type,
        p_qr_tlv_base64,
        p_xml_content,
        p_xml_hash,
        p_generation_status,
        p_validation_errors,
        now()
    )
    ON CONFLICT (sales_invoice_id) DO UPDATE
    SET
        invoice_number = EXCLUDED.invoice_number,
        invoice_type = EXCLUDED.invoice_type,
        qr_tlv_base64 = EXCLUDED.qr_tlv_base64,
        xml_content = EXCLUDED.xml_content,
        xml_hash = EXCLUDED.xml_hash,
        generation_status = EXCLUDED.generation_status,
        validation_errors = EXCLUDED.validation_errors,
        generated_at = now(),
        updated_at = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_e_invoice_artifact FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_e_invoice_artifact TO authenticated;

COMMIT;
