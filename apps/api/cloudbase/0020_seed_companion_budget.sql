CREATE OR REPLACE FUNCTION rpc_voice_companion_budget_reserve_v1(
  p_job_id uuid,
  p_user_id uuid,
  p_worker_id text,
  p_provider text,
  p_window_size integer DEFAULT 50,
  p_limit integer DEFAULT 15
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_payload jsonb;
  v_used integer;
  v_current_in_window boolean;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  IF NULLIF(btrim(p_worker_id),'') IS NULL THEN RAISE EXCEPTION 'WORKER_ID_REQUIRED'; END IF;
  IF NULLIF(btrim(p_provider),'') IS NULL OR char_length(p_provider)>100 THEN RAISE EXCEPTION 'COMPANION_PROVIDER_REQUIRED'; END IF;
  IF p_window_size <= 0 OR p_window_size>1000 OR p_limit < 0 OR p_limit > p_window_size THEN
    RAISE EXCEPTION 'INVALID_COMPANION_BUDGET';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));
  SELECT payload INTO v_payload
  FROM jobs
  WHERE id=p_job_id AND user_id=p_user_id AND type='GENERATE_MESSAGE'
    AND status='PROCESSING' AND lease_owner=p_worker_id AND leased_until>now()
  FOR UPDATE;
  IF v_payload IS NULL THEN RAISE EXCEPTION 'GENERATION_JOB_NOT_FOUND'; END IF;

  IF COALESCE(v_payload->'voiceCompanionReservations','{}'::jsonb) ? p_provider THEN
    RETURN jsonb_build_object('allowed',false,'reserved',false,'idempotent',true,
      'provider',p_provider,'limit',p_limit,'windowSize',p_window_size);
  END IF;

  SELECT COALESCE(bool_or(id=p_job_id),false),
    count(*) FILTER (WHERE COALESCE(recent.payload->'voiceCompanionReservations','{}'::jsonb) ? p_provider)::integer
  INTO v_current_in_window,v_used
  FROM (
    SELECT id,payload
    FROM jobs
    WHERE user_id=p_user_id AND type='GENERATE_MESSAGE'
    ORDER BY created_at DESC,id DESC
    LIMIT p_window_size
  ) recent;

  IF NOT v_current_in_window THEN
    RETURN jsonb_build_object('allowed',false,'reserved',false,'idempotent',false,
      'provider',p_provider,'used',v_used,'limit',p_limit,'windowSize',p_window_size,'reason','OUTSIDE_CURRENT_WINDOW');
  END IF;

  IF v_used >= p_limit THEN
    RETURN jsonb_build_object('allowed',false,'reserved',false,'idempotent',false,
      'provider',p_provider,'used',v_used,'limit',p_limit,'windowSize',p_window_size);
  END IF;

  v_payload := jsonb_set(COALESCE(v_payload,'{}'::jsonb),'{voiceCompanionReservations}',
    COALESCE(v_payload->'voiceCompanionReservations','{}'::jsonb),true);
  v_payload := jsonb_set(v_payload,ARRAY['voiceCompanionReservations',p_provider],
    jsonb_build_object('reservedAt',now(),'limit',p_limit,'windowSize',p_window_size),true);
  UPDATE jobs SET payload=v_payload,updated_at=now() WHERE id=p_job_id;

  RETURN jsonb_build_object('allowed',true,'reserved',true,'idempotent',false,
    'provider',p_provider,'used',v_used+1,'limit',p_limit,'windowSize',p_window_size);
END; $$;

REVOKE ALL ON FUNCTION rpc_voice_companion_budget_reserve_v1(uuid,uuid,text,text,integer,integer) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='worker_rpc_role') THEN
    GRANT EXECUTE ON FUNCTION rpc_voice_companion_budget_reserve_v1(uuid,uuid,text,text,integer,integer) TO worker_rpc_role;
  END IF;
END $$;
