-- =============================================================================
-- 01_auth_trigger.sql
-- Auth-schema-dependent trigger: auto-generate username on Supabase Auth signup
--
-- Apply via: Supabase SQL editor OR psql against DIRECT_URL
-- This file is intentionally separate from Prisma migrations because:
--   1. It references auth.users which only exists in Supabase, not in Prisma's
--      shadow database used during `prisma migrate dev`.
--   2. Prisma owns the public schema (app data); Supabase owns auth schema.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_adjective  TEXT;
  v_noun       TEXT;
  v_num        INT;
  v_username   TEXT;
  v_display_name TEXT;
  v_success    BOOLEAN := FALSE;
  v_retry      INT := 0;

  adjectives TEXT[] := ARRAY[
    'swift','bright','clever','brave','silent','quiet','bold','eager',
    'calm','kind','fierce','gentle','wise','happy','cool','grand',
    'royal','noble','lively','sharp'
  ];
  nouns TEXT[] := ARRAY[
    'fox','owl','wolf','lion','bear','hawk','eagle','deer','rabbit','tiger',
    'puma','lynx','otter','badger','falcon','dolphin','shark','whale','panther','leopard'
  ];
BEGIN
  -- Prefer display_name from OAuth metadata, fall back to email prefix, then 'User'
  v_display_name := COALESCE(
    (new.raw_user_meta_data ->> 'display_name'),
    (new.raw_user_meta_data ->> 'displayName'),
    split_part(new.email, '@', 1),
    'User'
  );

  -- Try up to 100 random adjective-noun-#### combinations before using UUID fallback
  WHILE NOT v_success AND v_retry < 100 LOOP
    v_adjective := adjectives[floor(random() * array_length(adjectives, 1)) + 1];
    v_noun      := nouns[floor(random() * array_length(nouns, 1)) + 1];
    v_num       := floor(random() * 9000)::INT + 1000; -- 1000–9999
    v_username  := v_adjective || '-' || v_noun || '-' || v_num;

    IF NOT EXISTS (SELECT 1 FROM public."User" WHERE username = v_username) THEN
      v_success := TRUE;
    ELSE
      v_retry := v_retry + 1;
    END IF;
  END LOOP;

  -- UUID-based fallback if 100 collisions occurred (practically impossible in prod)
  IF NOT v_success THEN
    v_username := 'user-' || substring(new.id::text FROM 1 FOR 8)
                  || '-' || (floor(random() * 9000)::INT + 1000)::text;
  END IF;

  INSERT INTO public."User" (id, username, "displayName", "createdAt")
  VALUES (
    new.id::text,
    v_username,
    v_display_name,
    COALESCE(new.created_at, now())
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate to ensure idempotency
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
