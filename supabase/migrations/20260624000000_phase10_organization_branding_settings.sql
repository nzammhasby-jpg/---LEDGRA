BEGIN;

-- Phase 10: Organization Branding and Custom Print Settings
-- Path: supabase/migrations/20260624000000_phase10_organization_branding_settings.sql

-- Add new columns safely to public.organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS address_line text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS country text DEFAULT 'المملكة العربية السعودية';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS postal_code text;

-- Add branding & print customization columns
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS print_primary_color text DEFAULT '#111827';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS print_footer_text text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS default_invoice_note text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS default_receipt_note text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS default_payment_note text;

-- Add visibility switches
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS show_logo_on_print boolean DEFAULT true NOT NULL;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS show_tax_number_on_print boolean DEFAULT true NOT NULL;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS show_commercial_registration_on_print boolean DEFAULT true NOT NULL;

-- Create Storage bucket for organization assets as private if it doesn't exist, otherwise update to make it private
INSERT INTO storage.buckets (id, name, public)
VALUES ('organization-assets', 'organization-assets', false)
ON CONFLICT (id) DO UPDATE
SET public = false;

-- Clean existing deprecated policies
DROP POLICY IF EXISTS "Public Access to Organization Assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Members Read Own Organization Assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Users Upload Own Assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Users Delete Own Assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Users Update Own Assets" ON storage.objects;

-- 1. Read Policy (SELECT): Authenticated members can only view files if they are in the same organization
CREATE POLICY "Authenticated Members Read Own Organization Assets"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'organization-assets'
  AND EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.profile_id = auth.uid()
      AND om.organization_id::text = (storage.foldername(name))[1]
  )
);

-- 2. Insert Policy (INSERT): Authenticated owners/admins can upload to their organization's directory
CREATE POLICY "Authenticated Users Upload Own Assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'organization-assets'
  AND EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.profile_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND om.organization_id::text = (storage.foldername(name))[1]
  )
);

-- 3. Delete Policy (DELETE): Authenticated owners/admins can delete their organization's assets
CREATE POLICY "Authenticated Users Delete Own Assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'organization-assets'
  AND EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.profile_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND om.organization_id::text = (storage.foldername(name))[1]
  )
);

-- 4. Update Policy (UPDATE): Authenticated owners/admins can overwrite/update assets safely during upsert operations
CREATE POLICY "Authenticated Users Update Own Assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'organization-assets'
  AND EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.profile_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND om.organization_id::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'organization-assets'
  AND EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.profile_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND om.organization_id::text = (storage.foldername(name))[1]
  )
);

COMMIT;
