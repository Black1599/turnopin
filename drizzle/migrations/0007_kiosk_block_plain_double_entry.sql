CREATE OR REPLACE FUNCTION public.kiosk_action(p_token text, p_worker_id uuid, p_pin text, p_action text DEFAULT 'status'::text, p_reported_time text DEFAULT NULL::text, p_no_recall boolean DEFAULT false, p_new_pin text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kiosk public.kiosks; v_worker public.workers; v_err text; v_state text;
  v_local timestamp := public.madrid_now(); v_open record; v_entry public.time_entries;
  v_entries jsonb; v_incidents jsonb; v_open_json jsonb; v_loc_name text;
BEGIN
  SELECT * INTO v_kiosk FROM public.kiosks WHERE token = p_token AND active;
  IF v_kiosk.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'kiosk_not_found'); END IF;

  SELECT w.* INTO v_worker FROM public.workers w
  JOIN public.worker_locations wl ON wl.worker_id = w.id AND wl.location_id = v_kiosk.location_id
  WHERE w.id = p_worker_id AND w.company_id = v_kiosk.company_id AND w.status = 'active';
  IF v_worker.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'worker_not_found'); END IF;

  v_err := public.kiosk_check_pin(v_worker, p_pin);
  IF v_err IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', v_err); END IF;

  SELECT * INTO v_open FROM public.worker_open_event(p_worker_id);
  v_state := public.worker_state(p_worker_id);

  IF p_action = 'change_pin' THEN
    IF p_new_pin IS NULL OR p_new_pin !~ '^\d{4}$' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_new_pin');
    END IF;
    UPDATE public.workers SET pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')) WHERE id = p_worker_id;
    INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (v_worker.company_id, NULL, 'worker_change_pin', 'worker', p_worker_id, jsonb_build_object('location_id', v_kiosk.location_id));
    RETURN jsonb_build_object('ok', true, 'pin_changed', true);
  END IF;

  IF p_action IN ('break_start', 'break_end') AND NOT v_worker.break_tracking THEN
    RETURN jsonb_build_object('ok', false, 'error', 'breaks_disabled');
  END IF;

  IF p_action IN ('exit', 'break_start', 'break_end') AND v_state <> 'out'
     AND v_open.location_id IS DISTINCT FROM v_kiosk.location_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wrong_location');
  END IF;

  -- "Olvidé fichar la salida": only when the worker explicitly reports it
  IF p_action = 'entry' AND v_state IN ('working', 'break') THEN
    IF NOT COALESCE(p_no_recall, false) AND nullif(btrim(coalesce(p_reported_time, '')), '') IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_working');
    END IF;
    INSERT INTO public.incidents (company_id, worker_id, time_entry_id, location_id, kind, work_date,
      worker_reported_time, worker_no_recall)
    SELECT v_worker.company_id, p_worker_id, e.id, e.effective_location_id, 'missing_exit', e.effective_work_date,
      CASE WHEN p_no_recall THEN NULL ELSE nullif(btrim(coalesce(p_reported_time, '')), '') END,
      COALESCE(p_no_recall, false)
    FROM public.time_entries_effective e
    WHERE e.worker_id = p_worker_id AND e.type = 'entry'
    ORDER BY e.effective_timestamp DESC LIMIT 1
    ON CONFLICT DO NOTHING;
    INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (v_worker.company_id, NULL, 'incident_missing_exit', 'worker', p_worker_id,
      jsonb_build_object('reported_time', p_reported_time, 'no_recall', COALESCE(p_no_recall, false)));
    v_state := 'out';
  END IF;

  IF p_action IN ('entry', 'exit', 'break_start', 'break_end') THEN
    IF p_action = 'entry' AND v_state <> 'out' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_working'); END IF;
    IF p_action = 'exit' AND v_state = 'break' THEN RETURN jsonb_build_object('ok', false, 'error', 'on_break'); END IF;
    IF p_action = 'exit' AND v_state <> 'working' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_working'); END IF;
    IF p_action = 'break_start' AND v_state <> 'working' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_working'); END IF;
    IF p_action = 'break_end' AND v_state <> 'break' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_on_break'); END IF;

    INSERT INTO public.time_entries (company_id, worker_id, work_date, local_time, type, location_id)
    VALUES (v_worker.company_id, p_worker_id, v_local::date, to_char(v_local, 'HH24:MI'), p_action, v_kiosk.location_id)
    RETURNING * INTO v_entry;
    INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (v_worker.company_id, NULL, 'kiosk_' || p_action, 'time_entry', v_entry.id,
      jsonb_build_object('worker_id', p_worker_id, 'location_id', v_kiosk.location_id, 'local_time', v_entry.local_time));
    SELECT * INTO v_open FROM public.worker_open_event(p_worker_id);
    v_state := public.worker_state(p_worker_id);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'type', e.type, 'local_time', e.effective_local_time,
    'corrected', e.is_corrected, 'manual', e.is_manual) ORDER BY e.effective_timestamp), '[]'::jsonb)
  INTO v_entries FROM public.time_entries_effective e
  WHERE e.worker_id = p_worker_id AND e.effective_work_date = v_local::date;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'work_date', i.work_date, 'reported_time', i.worker_reported_time,
    'no_recall', i.worker_no_recall) ORDER BY i.created_at DESC), '[]'::jsonb)
  INTO v_incidents FROM public.incidents i WHERE i.worker_id = p_worker_id AND i.status = 'pending';

  IF v_state <> 'out' THEN
    SELECT name INTO v_loc_name FROM public.locations WHERE id = v_open.location_id;
    SELECT jsonb_build_object('local_time', e.effective_local_time, 'work_date', e.effective_work_date,
      'location_id', e.effective_location_id, 'location_name', v_loc_name,
      'same_location', e.effective_location_id = v_kiosk.location_id)
    INTO v_open_json
    FROM public.time_entries_effective e
    WHERE e.worker_id = p_worker_id AND e.type = 'entry' ORDER BY e.effective_timestamp DESC LIMIT 1;
  END IF;

  RETURN jsonb_build_object('ok', true,
    'worker', jsonb_build_object('id', v_worker.id, 'first_name', v_worker.first_name, 'last_name', v_worker.last_name,
      'break_tracking', v_worker.break_tracking),
    'status', v_state, 'open_shift', v_open_json, 'today', v_local::date,
    'server_time', to_char(v_local, 'HH24:MI'), 'entries', v_entries, 'incidents', v_incidents);
END; $function$;