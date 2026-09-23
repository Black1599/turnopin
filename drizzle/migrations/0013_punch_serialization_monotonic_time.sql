ALTER TABLE public.time_entries ALTER COLUMN server_timestamp SET DEFAULT clock_timestamp();
ALTER TABLE public.corrections ALTER COLUMN created_at SET DEFAULT clock_timestamp();
CREATE OR REPLACE FUNCTION public.punch_core(p_worker workers, p_location_id uuid, p_action text, p_reported_time text, p_no_recall boolean, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_state text; v_open record; v_ts timestamptz := clock_timestamp(); v_local timestamp := (clock_timestamp() AT TIME ZONE 'Europe/Madrid'); v_entry public.time_entries;
  v_prefix text := CASE WHEN p_source = 'whatsapp' THEN 'whatsapp_' ELSE 'kiosk_' END;
BEGIN
  -- Serialize punches per worker so concurrent requests (kiosk + WhatsApp, double taps) cannot both pass the state check.
  PERFORM pg_advisory_xact_lock(hashtext('punch:' || p_worker.id::text));
  v_ts := clock_timestamp(); v_local := (v_ts AT TIME ZONE 'Europe/Madrid');
  IF p_action NOT IN ('entry','exit','break_start','break_end') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;
  SELECT * INTO v_open FROM public.worker_open_event(p_worker.id);
  v_state := public.worker_state(p_worker.id);

  IF p_action IN ('break_start','break_end') AND NOT p_worker.break_tracking THEN
    RETURN jsonb_build_object('ok', false, 'error', 'breaks_disabled');
  END IF;
  IF p_action IN ('exit','break_start','break_end') AND v_state <> 'out'
     AND v_open.location_id IS DISTINCT FROM p_location_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wrong_location');
  END IF;

  IF p_action = 'entry' AND v_state IN ('working','break') THEN
    IF NOT COALESCE(p_no_recall, false) AND nullif(btrim(coalesce(p_reported_time, '')), '') IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_working');
    END IF;
    INSERT INTO public.incidents (company_id, worker_id, time_entry_id, location_id, kind, work_date,
      worker_reported_time, worker_no_recall)
    SELECT p_worker.company_id, p_worker.id, e.id, e.effective_location_id, 'missing_exit', e.effective_work_date,
      CASE WHEN p_no_recall THEN NULL ELSE nullif(btrim(coalesce(p_reported_time, '')), '') END,
      COALESCE(p_no_recall, false)
    FROM public.time_entries_effective e
    WHERE e.worker_id = p_worker.id AND e.type = 'entry'
    ORDER BY e.effective_timestamp DESC LIMIT 1
    ON CONFLICT DO NOTHING;
    INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_worker.company_id, NULL, 'incident_missing_exit', 'worker', p_worker.id,
      jsonb_build_object('reported_time', p_reported_time, 'no_recall', COALESCE(p_no_recall, false), 'source', p_source));
    v_state := 'out';
  END IF;

  IF p_action = 'entry' AND v_state <> 'out' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_working'); END IF;
  IF p_action = 'exit' AND v_state = 'break' THEN RETURN jsonb_build_object('ok', false, 'error', 'on_break'); END IF;
  IF p_action = 'exit' AND v_state <> 'working' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_working'); END IF;
  IF p_action = 'break_start' AND v_state <> 'working' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_working'); END IF;
  IF p_action = 'break_end' AND v_state <> 'break' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_on_break'); END IF;

  INSERT INTO public.time_entries (company_id, worker_id, work_date, local_time, type, location_id, source, server_timestamp)
  VALUES (p_worker.company_id, p_worker.id, v_local::date, to_char(v_local, 'HH24:MI'), p_action, p_location_id, p_source, v_ts)
  RETURNING * INTO v_entry;
  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_worker.company_id, NULL, v_prefix || p_action, 'time_entry', v_entry.id,
    jsonb_build_object('worker_id', p_worker.id, 'location_id', p_location_id, 'local_time', v_entry.local_time, 'source', p_source));
  RETURN jsonb_build_object('ok', true, 'entry_id', v_entry.id, 'local_time', v_entry.local_time);
END; $function$
;