CREATE OR REPLACE FUNCTION rpc_message_publish_text(
  p_job_id uuid,
  p_worker_id text,
  p_user_id uuid,
  p_message_id uuid,
  p_output_text text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_text text;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  v_text:=btrim(COALESCE(p_output_text,''));
  IF v_text='' OR char_length(v_text)>300 THEN RAISE EXCEPTION 'INVALID_MESSAGE_OUTPUT_TEXT'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM jobs
    WHERE id=p_job_id AND user_id=p_user_id AND message_id=p_message_id
      AND type='GENERATE_MESSAGE' AND status='PROCESSING'
      AND lease_owner=p_worker_id AND leased_until>now()
  ) THEN
    RAISE EXCEPTION 'MESSAGE_JOB_NOT_OWNED';
  END IF;
  UPDATE messages
  SET output_text=v_text,updated_at=now()
  WHERE id=p_message_id AND user_id=p_user_id AND status IN('PENDING','PROCESSING');
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_MESSAGE_STATE'; END IF;
  RETURN jsonb_build_object('messageId',p_message_id,'status','PROCESSING','textPublished',true);
END; $$;

REVOKE ALL ON FUNCTION rpc_message_publish_text(uuid,text,uuid,uuid,text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='worker_rpc_role') THEN
    GRANT EXECUTE ON FUNCTION rpc_message_publish_text(uuid,text,uuid,uuid,text) TO worker_rpc_role;
  END IF;
END $$;
