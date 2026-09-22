ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS original_server_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS original_local_time text,
  ADD COLUMN IF NOT EXISTS original_work_date date;

CREATE OR REPLACE FUNCTION public.admin_correct_entry(p_entry_id uuid, p_corrected_timestamp timestamp with time zone, p_reason text, p_internal_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry public.time_entries;
  v_local timestamp;
  v_correction_id uuid;
BEGIN
  SELECT * INTO v_entry FROM public.time_entries WHERE id = p_entry_id;
  IF v_entry.id IS NULL OR NOT public.is_company_member(v_entry.company_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  INSERT INTO public.corrections (company_id, time_entry_id, worker_id, original_timestamp,
    corrected_timestamp, reason, internal_notes, corrected_by_admin_id)
  VALUES (v_entry.company_id, v_entry.id, v_entry.worker_id, v_entry.server_timestamp,
    p_corrected_timestamp, p_reason, p_internal_notes, auth.uid())
  RETURNING id INTO v_correction_id;

  v_local := (p_corrected_timestamp AT TIME ZONE 'Europe/Madrid');

  UPDATE public.time_entries
    SET original_server_timestamp = COALESCE(original_server_timestamp, server_timestamp),
        original_local_time = COALESCE(original_local_time, local_time),
        original_work_date = COALESCE(original_work_date, work_date),
        server_timestamp = p_corrected_timestamp,
        work_date = v_local::date,
        local_time = to_char(v_local, 'HH24:MI'),
        corrected = true,
        internal_notes = COALESCE(p_internal_notes, internal_notes)
    WHERE id = p_entry_id;

  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_entry.company_id, auth.uid(), 'correct_time_entry', 'time_entry', p_entry_id,
    jsonb_build_object('correction_id', v_correction_id, 'original', v_entry.server_timestamp,
                       'corrected', p_corrected_timestamp, 'reason', p_reason));

  RETURN jsonb_build_object('ok', true, 'correction_id', v_correction_id);
END;
$function$;

COMMENT ON COLUMN public.time_entries.original_server_timestamp IS 'First recorded server timestamp, preserved when an admin corrects the entry.';