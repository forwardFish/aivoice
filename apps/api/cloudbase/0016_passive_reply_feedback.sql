CREATE OR REPLACE FUNCTION rpc_voice_record_feedback_v1(
  p_user_id uuid,
  p_voice_id uuid,
  p_message_id text,
  p_verdict text,
  p_reason text,
  p_instruction text,
  p_recorded_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_report jsonb;
  v_entry jsonb;
  v_existing jsonb;
  v_all jsonb;
  v_trimmed jsonb;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['app_rpc_role']);
  IF p_verdict NOT IN ('LIKE','DISLIKE') THEN RAISE EXCEPTION 'INVALID_REPLY_FEEDBACK'; END IF;

  SELECT COALESCE(quality_report,'{}'::jsonb) INTO v_report
  FROM voice_profiles
  WHERE id=p_voice_id AND user_id=p_user_id AND deleted_at IS NULL
  FOR UPDATE;
  IF v_report IS NULL THEN RAISE EXCEPTION 'VOICE_NOT_FOUND'; END IF;

  v_entry := jsonb_build_object(
    'messageId',left(COALESCE(p_message_id,''),64),
    'verdict',p_verdict,
    'reason',left(COALESCE(p_reason,''),40),
    'instruction',left(COALESCE(p_instruction,''),180),
    'recordedAt',COALESCE(p_recorded_at,now())
  );
  v_existing := CASE
    WHEN jsonb_typeof(v_report->'passiveCorrections')='array' THEN v_report->'passiveCorrections'
    ELSE '[]'::jsonb
  END;

  IF p_verdict='DISLIKE' AND btrim(COALESCE(p_instruction,''))<>'' THEN
    v_all := v_existing || jsonb_build_array(v_entry);
    SELECT COALESCE(jsonb_agg(value ORDER BY ordinality),'[]'::jsonb) INTO v_trimmed
    FROM (
      SELECT value,ordinality
      FROM jsonb_array_elements(v_all) WITH ORDINALITY
      ORDER BY ordinality DESC
      LIMIT 8
    ) recent;
  ELSE
    v_trimmed := v_existing;
  END IF;

  UPDATE voice_profiles
  SET quality_report=jsonb_set(jsonb_set(v_report,'{lastReplyFeedback}',v_entry,true),'{passiveCorrections}',v_trimmed,true),
      updated_at=now()
  WHERE id=p_voice_id AND user_id=p_user_id;

  RETURN jsonb_build_object('recorded',true,'correctionApplied',p_verdict='DISLIKE' AND btrim(COALESCE(p_instruction,''))<>'');
END; $$;

REVOKE ALL ON FUNCTION rpc_voice_record_feedback_v1(uuid,uuid,text,text,text,text,timestamptz) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_rpc_role') THEN
    GRANT EXECUTE ON FUNCTION rpc_voice_record_feedback_v1(uuid,uuid,text,text,text,text,timestamptz) TO app_rpc_role;
  END IF;
END $$;
