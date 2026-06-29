BEGIN;

-- Create secure RPC function for logging safe editing audit events
CREATE OR REPLACE FUNCTION public.log_safe_editing_audit(
  p_org_id uuid,
  p_action text,
  p_details jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- 1. Ensure user is logged in
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لتسجيل سجلات التدقيق';
  END IF;

  -- 2. Validate allowed actions
  IF p_action NOT IN ('draft_updated', 'correction_copy_created', 'safe_editing_blocked', 'journal_reversed') THEN
    RAISE EXCEPTION 'الحدث (%) غير مسموح به في سجل التدقيق الآمن', p_action;
  END IF;

  -- 3. Verify user membership and required role (owner, admin, accountant)
  IF NOT EXISTS (
    SELECT 1 
    FROM public.organization_members
    WHERE organization_id = p_org_id
      AND profile_id = v_user_id
      AND role IN ('owner', 'admin', 'accountant')
  ) THEN
    RAISE EXCEPTION 'غير مصرح لك بتسجيل سجلات التدقيق لهذه المنشأة أو دورك لا يسمح بذلك';
  END IF;

  -- 4. Insert into audit_logs table
  INSERT INTO public.audit_logs (
    organization_id,
    profile_id,
    action,
    details
  ) VALUES (
    p_org_id,
    v_user_id,
    p_action,
    p_details
  );
END;
$$;

-- Secure execution privileges
REVOKE ALL ON FUNCTION public.log_safe_editing_audit(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_safe_editing_audit(uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_safe_editing_audit(uuid, text, jsonb) TO authenticated;

COMMIT;
