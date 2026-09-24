DO $$
BEGIN
  IF NOT public.has_role('3ea0be41-3cac-4b58-8319-bdfa520c8c85'::uuid, 'platform_admin') THEN
    RAISE EXCEPTION 'platform_admin not active for owner account';
  END IF;
  RAISE NOTICE 'has_role check passed: platform_admin active';
END $$;