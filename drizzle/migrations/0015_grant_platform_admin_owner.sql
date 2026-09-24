DO $$
DECLARE v_uid uuid;
BEGIN
  v_uid := public.platform_set_role('soporte@turnopin.es', true, 'Propietario/operador interno de TurnoPIN');
  RAISE NOTICE 'platform_admin granted to %', v_uid;
END $$;