CREATE OR REPLACE FUNCTION rpc_message_create(
  p_user_id uuid,p_voice_id uuid,p_idempotency_key text,p_mode message_mode,p_input_text text,p_generation_cost integer DEFAULT 1
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_existing messages%ROWTYPE; v_voice voice_profiles%ROWTYPE; v_balance integer; v_active integer;
  v_conversation_id uuid; v_message_id uuid; v_job_id uuid; v_length integer;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  IF NULLIF(btrim(p_idempotency_key),'') IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  v_length:=char_length(COALESCE(p_input_text,''));
  IF v_length=0 OR v_length>300 OR (p_mode='EXACT_SPEECH' AND v_length>50) THEN RAISE EXCEPTION 'INVALID_MESSAGE_TEXT'; END IF;
  IF p_generation_cost<=0 THEN RAISE EXCEPTION 'INVALID_GENERATION_COST'; END IF;
  SELECT * INTO v_existing FROM messages WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('messageId',v_existing.id,'status',v_existing.status,'idempotent',true); END IF;
  SELECT balance INTO v_balance FROM point_accounts WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'POINT_ACCOUNT_NOT_FOUND'; END IF;
  SELECT * INTO v_voice FROM voice_profiles WHERE id=p_voice_id AND user_id=p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VOICE_NOT_FOUND'; END IF;
  IF v_voice.status<>'READY' OR v_voice.accepted_at IS NULL THEN RAISE EXCEPTION 'VOICE_NOT_READY'; END IF;
  SELECT count(*)::integer INTO v_active FROM messages WHERE user_id=p_user_id AND status IN('PENDING','PROCESSING');
  IF v_balance < p_generation_cost*(v_active+1) THEN RAISE EXCEPTION 'POINTS_EXHAUSTED'; END IF;
  IF EXISTS(
    SELECT 1 FROM messages
    WHERE voice_profile_id=p_voice_id AND status IN('PENDING','PROCESSING')
      AND (mode='EXACT_SPEECH' OR NULLIF(btrim(output_text),'') IS NULL)
  ) THEN RAISE EXCEPTION 'GENERATION_IN_PROGRESS'; END IF;
  INSERT INTO conversations(voice_profile_id) VALUES(p_voice_id)
  ON CONFLICT(voice_profile_id) DO UPDATE SET updated_at=now() RETURNING id INTO v_conversation_id;
  INSERT INTO messages(conversation_id,user_id,voice_profile_id,idempotency_key,mode,status,input_text)
  VALUES(v_conversation_id,p_user_id,p_voice_id,p_idempotency_key,p_mode,'PROCESSING',btrim(p_input_text)) RETURNING id INTO v_message_id;
  INSERT INTO jobs(user_id,voice_profile_id,message_id,type,status,dedupe_key,payload,max_attempts)
  VALUES(p_user_id,p_voice_id,v_message_id,'GENERATE_MESSAGE','QUEUED','generate-message:'||v_message_id::text,
    jsonb_build_object('messageId',v_message_id,'mode',p_mode),3) RETURNING id INTO v_job_id;
  RETURN jsonb_build_object('messageId',v_message_id,'status','PROCESSING','jobId',v_job_id,'idempotent',false);
END; $$;

CREATE OR REPLACE FUNCTION rpc_job_get_message_input(p_job_id uuid,p_worker_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  SELECT jsonb_build_object(
    'jobId',j.id,'userId',j.user_id,'voiceId',j.voice_profile_id,'messageId',m.id,
    'conversationId',m.conversation_id,'mode',m.mode,'inputText',m.input_text,
    'voiceName',vp.name,'relationshipType',vp.relationship_type,'relationshipLabel',vp.relationship_label,
    'voiceAddress',vp.voice_address,'userAddress',vp.user_address,
    'ageYears',vp.age_years,'gender',vp.gender,'userAgeYears',vp.user_age_years,'userLifeStage',vp.user_life_stage,
    'background',vp.background,'relationshipNote',vp.relationship_note,'personalityNote',vp.personality_note,'speechHabitNote',vp.speech_habit_note,
    'qualityReport',COALESCE(vp.quality_report,'{}'::jsonb),
    'provider',vm.provider,'targetModel',vm.target_model,'providerVoiceIdEncrypted',vm.provider_voice_id_encrypted,
    'referenceObjectKey',ra.object_key,
    'history',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('messageId',h.id,'mode',h.mode,'inputText',h.input_text,'outputText',h.output_text,
        'interactionState',h.interaction_state) ORDER BY h.created_at,h.id)
      FROM (
        SELECT h.* FROM messages h
        WHERE h.conversation_id=m.conversation_id AND h.mode='CHAT' AND h.id<>m.id
          AND (h.status='READY' OR (h.status='PROCESSING' AND NULLIF(btrim(h.output_text),'') IS NOT NULL))
          AND (c.cleared_at IS NULL OR h.created_at>c.cleared_at)
        ORDER BY h.created_at DESC,h.id DESC LIMIT 8
      ) h
    ),'[]'::jsonb)
  ) INTO v_result
  FROM jobs j JOIN messages m ON m.id=j.message_id
  JOIN conversations c ON c.id=m.conversation_id
  JOIN voice_profiles vp ON vp.id=m.voice_profile_id AND vp.user_id=m.user_id AND vp.deleted_at IS NULL
  JOIN voice_models vm ON vm.voice_profile_id=m.voice_profile_id AND vm.status='READY'
  LEFT JOIN LATERAL (
    SELECT ma.object_key FROM media_assets ma
    WHERE ma.voice_profile_id=m.voice_profile_id AND ma.kind='REFERENCE_AUDIO'
      AND ma.status='READY' AND ma.deleted_at IS NULL
    ORDER BY ma.created_at DESC LIMIT 1
  ) ra ON true
  WHERE j.id=p_job_id AND j.type='GENERATE_MESSAGE' AND j.status='PROCESSING' AND j.lease_owner=p_worker_id;
  IF v_result IS NULL THEN RAISE EXCEPTION 'MESSAGE_JOB_INPUT_NOT_FOUND'; END IF;
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION rpc_message_create(uuid,uuid,text,message_mode,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION rpc_job_get_message_input(uuid,text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='api_rpc_role') THEN
    GRANT EXECUTE ON FUNCTION rpc_message_create(uuid,uuid,text,message_mode,text,integer) TO api_rpc_role;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='worker_rpc_role') THEN
    GRANT EXECUTE ON FUNCTION rpc_job_get_message_input(uuid,text) TO worker_rpc_role;
  END IF;
END $$;
