ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS has_pin boolean GENERATED ALWAYS AS (pin_hash IS NOT NULL) STORED;
REVOKE SELECT, UPDATE, INSERT ON public.workers FROM authenticated;
GRANT SELECT (id, company_id, first_name, last_name, second_last_name, dni_nie, naf, status, hired_at, archived_at,
  created_at, break_tracking, break_paid, ended_at, access_token, has_pin) ON public.workers TO authenticated;
GRANT INSERT (company_id, first_name, last_name, second_last_name, dni_nie, naf, status, hired_at, ended_at,
  break_tracking, break_paid) ON public.workers TO authenticated;
GRANT UPDATE (first_name, last_name, second_last_name, dni_nie, naf, status, hired_at, archived_at, ended_at,
  break_tracking, break_paid) ON public.workers TO authenticated;
COMMENT ON COLUMN public.workers.pin_hash IS 'Hidden from clients; managed only via SECURITY DEFINER RPCs.';