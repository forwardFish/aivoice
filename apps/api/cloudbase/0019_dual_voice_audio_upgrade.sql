CREATE OR REPLACE FUNCTION rpc_message_upgrade_audio_v1(
  p_user_id uuid,
  p_voice_id uuid,
  p_message_id uuid,
  p_object_key text,
  p_bytes integer,
  p_duration_ms integer,
  p_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_media_id uuid;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  UPDATE media_assets
  SET bytes=p_bytes,duration_ms=p_duration_ms,sha256=p_sha256,updated_at=now()
  WHERE user_id=p_user_id AND voice_profile_id=p_voice_id AND message_id=p_message_id
    AND kind='GENERATED_AUDIO' AND status='READY' AND deleted_at IS NULL AND object_key=p_object_key
  RETURNING id INTO v_media_id;
  IF v_media_id IS NULL THEN RAISE EXCEPTION 'MESSAGE_AUDIO_NOT_READY'; END IF;
  RETURN jsonb_build_object('upgraded',true,'mediaId',v_media_id);
END; $$;

REVOKE ALL ON FUNCTION rpc_message_upgrade_audio_v1(uuid,uuid,uuid,text,integer,integer,text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='worker_rpc_role') THEN
    GRANT EXECUTE ON FUNCTION rpc_message_upgrade_audio_v1(uuid,uuid,uuid,text,integer,integer,text) TO worker_rpc_role;
  END IF;
END $$;
