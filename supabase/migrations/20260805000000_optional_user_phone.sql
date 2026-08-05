-- Migration: Ensure user profiles phone field supports NULL and converts empty phone metadata to NULL
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, phone, avatar_url)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', 'مستخدم لِدجرا'),
        NULLIF(trim(new.raw_user_meta_data->>'phone'), ''),
        NULL
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
