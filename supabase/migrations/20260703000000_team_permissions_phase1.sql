BEGIN;

-- 1. Ensure public.organization_members table has is_active column
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. Create public.organization_invitations table
CREATE TABLE IF NOT EXISTS public.organization_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email text NOT NULL,
    role text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    token_hash text NOT NULL,
    invited_by uuid NOT NULL REFERENCES auth.users(id),
    accepted_by uuid REFERENCES auth.users(id),
    accepted_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    cancelled_at timestamp with time zone,
    cancelled_by uuid REFERENCES auth.users(id),
    CONSTRAINT invitation_role_check CHECK (role IN ('admin', 'accountant', 'sales', 'viewer')),
    CONSTRAINT invitation_status_check CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'))
);

-- 3. Add unique partial index to prevent multiple active pending invitations to same email inside same organization
CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_active_email_idx 
ON public.organization_invitations (organization_id, LOWER(email)) 
WHERE status = 'pending';

-- 4. Enable Row Level Security (RLS) on invitations
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- 5. Drop old policy if exists and create new SELECT policy for owner/admin
DROP POLICY IF EXISTS select_invitations ON public.organization_invitations;
CREATE POLICY select_invitations ON public.organization_invitations
    FOR SELECT TO authenticated
    USING (public.is_org_admin(organization_id));

-- 6. Re-define get_organization_members to include is_active and email
DROP FUNCTION IF EXISTS public.get_organization_members(uuid);
CREATE OR REPLACE FUNCTION public.get_organization_members(p_organization_id uuid)
RETURNS TABLE (
    membership_id uuid,
    profile_id uuid,
    full_name text,
    phone text,
    email text,
    role text,
    created_at timestamp with time zone,
    is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Check if authenticated user is Owner/Admin
    IF NOT public.is_org_admin(p_organization_id) THEN
        RAISE EXCEPTION 'غير مصرح لك باستعراض أعضاء هذه المجموعة النشطة.';
    END IF;

    RETURN QUERY
    SELECT 
        m.id AS membership_id,
        m.profile_id AS profile_id,
        COALESCE(p.full_name, 'عضو غير معروف') AS full_name,
        COALESCE(p.phone, 'غير مسجل') AS phone,
        u.email::text AS email,
        m.role AS role,
        m.created_at AS created_at,
        m.is_active AS is_active
    FROM public.organization_members m
    JOIN public.profiles p ON m.profile_id = p.id
    LEFT JOIN auth.users u ON m.profile_id = u.id
    WHERE m.organization_id = p_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_organization_members(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_organization_members(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_organization_members(uuid) TO authenticated;

-- 6.1 Update is_org_member to check is_active
CREATE OR REPLACE FUNCTION public.is_org_member(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_organization_id
          AND profile_id = auth.uid()
          AND COALESCE(is_active, true) = true
    );
$$;

REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;

-- 6.2 Update is_org_admin to check is_active
CREATE OR REPLACE FUNCTION public.is_org_admin(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members
        WHERE organization_id = p_organization_id
          AND profile_id = auth.uid()
          AND role IN ('owner', 'admin')
          AND COALESCE(is_active, true) = true
    );
$$;

REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;

-- 7. Create RPC: create_organization_invitation
CREATE OR REPLACE FUNCTION public.create_organization_invitation(
  p_org_id uuid,
  p_email text,
  p_role text
)
RETURNS TABLE (
  invitation_id uuid,
  raw_token text,
  expires_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamp with time zone;
  v_invitation_id uuid;
  v_user_id uuid;
BEGIN
  -- Ensure user is logged in
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لتوجيه الدعوات';
  END IF;

  -- Check if owner/admin
  IF NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION 'غير مصرح لك بإصدار دعوات لهذه المنشأة';
  END IF;

  -- Validate role
  IF p_role NOT IN ('admin', 'accountant', 'sales', 'viewer') THEN
    RAISE EXCEPTION 'دور غير صالح للدعوة. الأدوار المتاحة: admin, accountant, sales, viewer';
  END IF;

  -- Validate email
  IF p_email IS NULL OR TRIM(p_email) = '' OR p_email NOT LIKE '%@%' THEN
    RAISE EXCEPTION 'الرجاء إدخال بريد إلكتروني صحيح';
  END IF;

  p_email := LOWER(TRIM(p_email));

  -- Update expired invitations for this email inside this organization first
  UPDATE public.organization_invitations
  SET status = 'expired', updated_at = now()
  WHERE organization_id = p_org_id
    AND LOWER(email) = p_email
    AND status = 'pending'
    AND expires_at <= now();

  -- Prevent duplicate pending
  IF EXISTS (
    SELECT 1 FROM public.organization_invitations 
    WHERE organization_id = p_org_id 
      AND LOWER(email) = p_email 
      AND status = 'pending'
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'هناك دعوة معلقة بالفعل لنفس البريد الإلكتروني في هذه المنشأة ولم تنته بعد';
  END IF;

  -- Check if already member
  IF EXISTS (
    SELECT 1
    FROM public.organization_members m
    JOIN auth.users u ON m.profile_id = u.id
    WHERE m.organization_id = p_org_id
      AND lower(u.email) = p_email
      AND COALESCE(m.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'هذا المستخدم عضو بالفعل في هذه المنشأة';
  END IF;

  -- Generate raw token and hash (secure md5 of random text)
  v_raw_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_token_hash := md5(v_raw_token);
  v_expires_at := now() + interval '7 days';

  -- Insert invitation
  INSERT INTO public.organization_invitations (
    organization_id,
    email,
    role,
    status,
    token_hash,
    invited_by,
    expires_at
  ) VALUES (
    p_org_id,
    p_email,
    p_role,
    'pending',
    v_token_hash,
    v_user_id,
    v_expires_at
  )
  RETURNING id INTO v_invitation_id;

  RETURN QUERY SELECT v_invitation_id, v_raw_token, v_expires_at;
END;
$$;

-- 8. Create RPC: accept_organization_invitation
CREATE OR REPLACE FUNCTION public.accept_organization_invitation(
  p_token text
)
RETURNS TABLE (
  organization_id uuid,
  role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token_hash text;
  v_invitation record;
  v_user_id uuid;
  v_user_email text;
BEGIN
  -- Get current logged in user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لقبول الدعوة';
  END IF;

  -- Get user email from auth.users
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'تعذر التحقق من بريدك الإلكتروني الحالي';
  END IF;

  v_user_email := LOWER(TRIM(v_user_email));
  v_token_hash := md5(p_token);

  -- Fetch active pending invitation
  SELECT * INTO v_invitation
  FROM public.organization_invitations
  WHERE token_hash = v_token_hash;

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'رابط الدعوة غير صالح أو غير موجود';
  END IF;

  IF v_invitation.status = 'cancelled' THEN
    RAISE EXCEPTION 'تم إلغاء هذه الدعوة من قبل إدارة المنشأة';
  END IF;

  IF v_invitation.status = 'accepted' THEN
    RAISE EXCEPTION 'تم قبول هذه الدعوة مسبقاً';
  END IF;

  IF v_invitation.status = 'expired' OR v_invitation.expires_at < now() THEN
    UPDATE public.organization_invitations
    SET status = 'expired', updated_at = now()
    WHERE id = v_invitation.id;
    
    RAISE EXCEPTION 'رابط الدعوة منتهي الصلاحية. يرجى طلب دعوة جديدة';
  END IF;

  -- Verify email matches
  IF LOWER(v_invitation.email) <> v_user_email THEN
    RAISE EXCEPTION 'هذه الدعوة موجهة لبريد إلكتروني مختلف عن حسابك الحالي';
  END IF;

  -- Add member or update role
  INSERT INTO public.organization_members (
    organization_id,
    profile_id,
    role,
    is_active
  ) VALUES (
    v_invitation.organization_id,
    v_user_id,
    v_invitation.role,
    true
  )
  ON CONFLICT (organization_id, profile_id)
  DO UPDATE SET 
    role = EXCLUDED.role,
    is_active = true,
    created_at = now();

  -- Mark invitation as accepted
  UPDATE public.organization_invitations
  SET status = 'accepted',
      accepted_by = v_user_id,
      accepted_at = now(),
      updated_at = now()
  WHERE id = v_invitation.id;

  RETURN QUERY SELECT v_invitation.organization_id, v_invitation.role;
END;
$$;

-- 9. Create RPC: cancel_organization_invitation
CREATE OR REPLACE FUNCTION public.cancel_organization_invitation(
  p_invitation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لإلغاء الدعوة';
  END IF;

  SELECT organization_id INTO v_org_id 
  FROM public.organization_invitations 
  WHERE id = p_invitation_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'الدعوة غير موجودة';
  END IF;

  IF NOT public.is_org_admin(v_org_id) THEN
    RAISE EXCEPTION 'غير مصرح لك بإلغاء الدعوات في هذه المنشأة';
  END IF;

  UPDATE public.organization_invitations
  SET status = 'cancelled',
      cancelled_by = v_user_id,
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_invitation_id 
    AND status = 'pending';
END;
$$;

-- 10. Create RPC: update_organization_member_role
CREATE OR REPLACE FUNCTION public.update_organization_member_role(
  p_org_id uuid,
  p_member_user_id uuid,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_current_role text;
  v_owner_count int;
  v_admin_count int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لتعديل الأدوار';
  END IF;

  -- Check if owner/admin
  IF NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION 'غير مصرح لك بتعديل أدوار أعضاء المنشأة';
  END IF;

  -- Validate role
  IF p_role NOT IN ('admin', 'accountant', 'sales', 'viewer') THEN
    RAISE EXCEPTION 'دور غير صالح. الأدوار المتاحة: admin, accountant, sales, viewer';
  END IF;

  -- Get current role
  SELECT role INTO v_current_role
  FROM public.organization_members
  WHERE organization_id = p_org_id AND profile_id = p_member_user_id;

  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'العضو غير موجود في هذه المنشأة';
  END IF;

  -- Prevent changing owner role completely
  IF v_current_role = 'owner' THEN
    RAISE EXCEPTION 'لا يمكن تغيير دور مالك المنشأة الرئيسي';
  END IF;

  -- Downgrading self safety
  IF p_member_user_id = v_user_id AND v_current_role = 'admin' THEN
    SELECT COUNT(*) INTO v_owner_count FROM public.organization_members WHERE organization_id = p_org_id AND role = 'owner';
    SELECT COUNT(*) INTO v_admin_count FROM public.organization_members WHERE organization_id = p_org_id AND role = 'admin';
    IF v_owner_count = 0 AND v_admin_count <= 1 THEN
      RAISE EXCEPTION 'لا يمكنك تخفيض دورك لأنك المسؤول الوحيد المتبقي لإدارة هذه المنشأة';
    END IF;
  END IF;

  -- Update role
  UPDATE public.organization_members
  SET role = p_role,
      created_at = now()
  WHERE organization_id = p_org_id AND profile_id = p_member_user_id;
END;
$$;

-- 11. Create RPC: deactivate_organization_member
CREATE OR REPLACE FUNCTION public.deactivate_organization_member(
  p_org_id uuid,
  p_member_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_current_role text;
  v_owner_count int;
  v_admin_count int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لتعطيل الأعضاء';
  END IF;

  -- Check if owner/admin
  IF NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION 'غير مصرح لك بتعطيل الأعضاء';
  END IF;

  -- Get current role
  SELECT role INTO v_current_role
  FROM public.organization_members
  WHERE organization_id = p_org_id AND profile_id = p_member_user_id;

  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'العضو غير موجود في هذه المنشأة';
  END IF;

  -- Prevent deactivating last owner
  IF v_current_role = 'owner' THEN
    SELECT COUNT(*) INTO v_owner_count 
    FROM public.organization_members 
    WHERE organization_id = p_org_id AND role = 'owner' AND is_active = true;
    
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'لا يمكن تعطيل مالك المنشأة الرئيسي الأخير';
    END IF;
  END IF;

  -- Prevent self deactivating if last admin/owner
  IF p_member_user_id = v_user_id THEN
    SELECT COUNT(*) INTO v_owner_count FROM public.organization_members WHERE organization_id = p_org_id AND role = 'owner' AND is_active = true;
    SELECT COUNT(*) INTO v_admin_count FROM public.organization_members WHERE organization_id = p_org_id AND role = 'admin' AND is_active = true;
    IF v_current_role IN ('owner', 'admin') AND (v_owner_count + v_admin_count) <= 1 THEN
      RAISE EXCEPTION 'لا يمكنك تعطيل حسابك لأنك المسؤول النشط الوحيد المتبقي لإدارة هذه المنشأة';
    END IF;
  END IF;

  -- Deactivate
  UPDATE public.organization_members
  SET is_active = false
  WHERE organization_id = p_org_id AND profile_id = p_member_user_id;
END;
$$;

-- 12. Create RPC: activate_organization_member
CREATE OR REPLACE FUNCTION public.activate_organization_member(
  p_org_id uuid,
  p_member_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Check if owner/admin
  IF NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION 'غير مصرح لك بتفعيل الأعضاء';
  END IF;

  UPDATE public.organization_members
  SET is_active = true
  WHERE organization_id = p_org_id AND profile_id = p_member_user_id;
END;
$$;

-- 13. Secure grants on functions
REVOKE ALL ON FUNCTION public.create_organization_invitation(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_organization_invitation(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_organization_invitation(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_organization_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_organization_invitation(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(text) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_organization_invitation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_organization_invitation(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_organization_invitation(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.update_organization_member_role(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_organization_member_role(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_organization_member_role(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.deactivate_organization_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_organization_member(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.deactivate_organization_member(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.activate_organization_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_organization_member(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.activate_organization_member(uuid, uuid) TO authenticated;

-- 14. Create list_organization_invitations function
CREATE OR REPLACE FUNCTION public.list_organization_invitations(p_org_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  email text,
  role text,
  status text,
  expires_at timestamp with time zone,
  created_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  accepted_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Check if authenticated user is Owner/Admin
  IF NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION 'غير مصرح لك باستعراض دعوات هذه المنشأة.';
  END IF;

  RETURN QUERY
  SELECT 
    i.id,
    i.organization_id,
    i.email,
    i.role,
    i.status,
    i.expires_at,
    i.created_at,
    i.cancelled_at,
    i.accepted_at
  FROM public.organization_invitations i
  WHERE i.organization_id = p_org_id
  ORDER BY i.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_organization_invitations(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_organization_invitations(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_organization_invitations(uuid) TO authenticated;

COMMIT;
