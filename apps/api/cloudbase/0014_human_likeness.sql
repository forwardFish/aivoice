ALTER TABLE voice_profiles ADD COLUMN IF NOT EXISTS personality_note text NOT NULL DEFAULT '';
ALTER TABLE voice_profiles ADD COLUMN IF NOT EXISTS speech_habit_note text NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS interaction_state jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='voice_profiles_personality_note_length') THEN
    ALTER TABLE voice_profiles ADD CONSTRAINT voice_profiles_personality_note_length CHECK (char_length(personality_note)<=300);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='voice_profiles_speech_habit_note_length') THEN
    ALTER TABLE voice_profiles ADD CONSTRAINT voice_profiles_speech_habit_note_length CHECK (char_length(speech_habit_note)<=300);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='messages_interaction_state_object') THEN
    ALTER TABLE messages ADD CONSTRAINT messages_interaction_state_object CHECK (jsonb_typeof(interaction_state)='object');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION rpc_voice_update_profile_v6(
  p_user_id uuid,p_voice_id uuid,p_name text,p_permission_type permission_type,
  p_relationship_type voice_relationship_type DEFAULT NULL,p_relationship_label text DEFAULT '',p_user_address text DEFAULT '',
  p_age_years integer DEFAULT NULL,p_gender text DEFAULT NULL,p_user_age_years integer DEFAULT NULL,p_user_life_stage text DEFAULT NULL,
  p_background text DEFAULT '',p_relationship_note text DEFAULT '',p_personality_note text DEFAULT '',p_speech_habit_note text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_relationship_type voice_relationship_type; v_relationship_label text; v_user_address text; v_user_life_stage text;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  IF NULLIF(btrim(p_name),'') IS NULL THEN RAISE EXCEPTION 'VOICE_NAME_REQUIRED'; END IF;
  IF p_age_years IS NOT NULL AND (p_age_years<0 OR p_age_years>120) THEN RAISE EXCEPTION 'AGE_YEARS_INVALID'; END IF;
  IF p_gender IS NOT NULL AND p_gender NOT IN ('FEMALE','MALE') THEN RAISE EXCEPTION 'GENDER_INVALID'; END IF;
  IF p_user_age_years IS NOT NULL AND (p_user_age_years<0 OR p_user_age_years>120) THEN RAISE EXCEPTION 'USER_AGE_YEARS_INVALID'; END IF;
  IF p_user_life_stage IS NOT NULL AND p_user_life_stage NOT IN ('CHILD','TEEN','ADULT','OLDER_ADULT') THEN RAISE EXCEPTION 'USER_LIFE_STAGE_INVALID'; END IF;
  v_relationship_type:=CASE WHEN p_permission_type='SELF' THEN 'SELF'::voice_relationship_type ELSE p_relationship_type END;
  v_relationship_label:=CASE WHEN v_relationship_type='OTHER' THEN left(btrim(COALESCE(p_relationship_label,'')),10) ELSE '' END;
  v_user_address:=left(btrim(COALESCE(p_user_address,'')),10);
  v_user_life_stage:=CASE
    WHEN p_user_age_years IS NULL THEN p_user_life_stage
    WHEN p_user_age_years<13 THEN 'CHILD'
    WHEN p_user_age_years<18 THEN 'TEEN'
    WHEN p_user_age_years<65 THEN 'ADULT'
    ELSE 'OLDER_ADULT'
  END;
  IF p_relationship_type='OTHER' AND v_relationship_label='' THEN RAISE EXCEPTION 'RELATIONSHIP_LABEL_REQUIRED'; END IF;
  IF v_relationship_type='PARTNER' AND ((p_age_years IS NOT NULL AND p_age_years<18) OR v_user_life_stage IN ('CHILD','TEEN')) THEN
    RAISE EXCEPTION 'PARTNER_REQUIRES_ADULTS';
  END IF;
  IF v_relationship_type IN ('MOTHER','FATHER','GRANDMOTHER','GRANDFATHER') AND p_age_years IS NOT NULL AND p_age_years<18 THEN
    RAISE EXCEPTION 'RELATIONSHIP_AGE_CONFLICT';
  END IF;
  IF v_relationship_type IN ('MOTHER','FATHER','GRANDMOTHER','GRANDFATHER') AND p_age_years IS NOT NULL AND p_user_age_years IS NOT NULL AND p_age_years<=p_user_age_years THEN
    RAISE EXCEPTION 'RELATIONSHIP_AGE_CONFLICT';
  END IF;
  IF v_relationship_type='CHILD' AND (v_user_life_stage IN ('CHILD','TEEN') OR (p_age_years IS NOT NULL AND p_user_age_years IS NOT NULL AND p_age_years>=p_user_age_years)) THEN
    RAISE EXCEPTION 'RELATIONSHIP_AGE_CONFLICT';
  END IF;
  UPDATE voice_profiles SET name=left(btrim(p_name),40),permission_type=p_permission_type,
    relationship_type=v_relationship_type,relationship_label=v_relationship_label,user_address=v_user_address,
    age_years=p_age_years,gender=p_gender,user_age_years=p_user_age_years,user_life_stage=v_user_life_stage,
    background=left(btrim(COALESCE(p_background,'')),300),relationship_note=left(btrim(COALESCE(p_relationship_note,'')),300),
    personality_note=left(btrim(COALESCE(p_personality_note,'')),300),speech_habit_note=left(btrim(COALESCE(p_speech_habit_note,'')),300),updated_at=now()
  WHERE id=p_voice_id AND user_id=p_user_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'VOICE_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('voiceId',p_voice_id,'name',left(btrim(p_name),40),'permissionType',p_permission_type,
    'relationshipType',v_relationship_type,'relationshipLabel',v_relationship_label,'userAddress',v_user_address,
    'ageYears',p_age_years,'gender',p_gender,'userAgeYears',p_user_age_years,'userLifeStage',v_user_life_stage,
    'background',left(btrim(COALESCE(p_background,'')),300),'relationshipNote',left(btrim(COALESCE(p_relationship_note,'')),300),
    'personalityNote',left(btrim(COALESCE(p_personality_note,'')),300),'speechHabitNote',left(btrim(COALESCE(p_speech_habit_note,'')),300));
END; $$;

CREATE OR REPLACE FUNCTION rpc_job_get_message_input(p_job_id uuid,p_worker_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  SELECT jsonb_build_object(
    'jobId',j.id,'userId',j.user_id,'voiceId',j.voice_profile_id,'messageId',m.id,
    'conversationId',m.conversation_id,'mode',m.mode,'inputText',m.input_text,
    'voiceName',vp.name,'relationshipType',vp.relationship_type,'relationshipLabel',vp.relationship_label,'userAddress',vp.user_address,
    'ageYears',vp.age_years,'gender',vp.gender,'userAgeYears',vp.user_age_years,'userLifeStage',vp.user_life_stage,
    'background',vp.background,'relationshipNote',vp.relationship_note,'personalityNote',vp.personality_note,'speechHabitNote',vp.speech_habit_note,
    'providerVoiceIdEncrypted',vm.provider_voice_id_encrypted,
    'history',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('messageId',h.id,'mode',h.mode,'inputText',h.input_text,'outputText',h.output_text,
        'interactionState',h.interaction_state) ORDER BY h.created_at,h.id)
      FROM (SELECT h.* FROM messages h WHERE h.conversation_id=m.conversation_id AND h.status='READY' AND h.mode='CHAT'
            AND (c.cleared_at IS NULL OR h.created_at>c.cleared_at)
            ORDER BY h.created_at DESC,h.id DESC LIMIT 8) h
    ),'[]'::jsonb)
  ) INTO v_result
  FROM jobs j JOIN messages m ON m.id=j.message_id
  JOIN conversations c ON c.id=m.conversation_id
  JOIN voice_profiles vp ON vp.id=m.voice_profile_id AND vp.user_id=m.user_id AND vp.deleted_at IS NULL
  JOIN voice_models vm ON vm.voice_profile_id=m.voice_profile_id AND vm.status='READY'
  WHERE j.id=p_job_id AND j.type='GENERATE_MESSAGE' AND j.status='PROCESSING' AND j.lease_owner=p_worker_id;
  IF v_result IS NULL THEN RAISE EXCEPTION 'MESSAGE_JOB_INPUT_NOT_FOUND'; END IF;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION rpc_message_publish_text_v2(
  p_job_id uuid,p_worker_id text,p_user_id uuid,p_message_id uuid,p_output_text text,p_interaction_state jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_text text;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  v_text:=btrim(COALESCE(p_output_text,''));
  IF v_text='' OR char_length(v_text)>300 THEN RAISE EXCEPTION 'INVALID_MESSAGE_OUTPUT_TEXT'; END IF;
  IF jsonb_typeof(COALESCE(p_interaction_state,'{}'::jsonb))<>'object' THEN RAISE EXCEPTION 'INVALID_INTERACTION_STATE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jobs WHERE id=p_job_id AND user_id=p_user_id AND message_id=p_message_id
    AND type='GENERATE_MESSAGE' AND status='PROCESSING' AND lease_owner=p_worker_id AND leased_until>now()) THEN
    RAISE EXCEPTION 'MESSAGE_JOB_NOT_OWNED';
  END IF;
  UPDATE messages SET output_text=v_text,interaction_state=COALESCE(p_interaction_state,'{}'::jsonb),updated_at=now()
  WHERE id=p_message_id AND user_id=p_user_id AND status IN('PENDING','PROCESSING');
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_MESSAGE_STATE'; END IF;
  RETURN jsonb_build_object('messageId',p_message_id,'status','PROCESSING','textPublished',true);
END; $$;

CREATE OR REPLACE FUNCTION rpc_message_complete_success_v2(
  p_user_id uuid,p_voice_id uuid,p_message_id uuid,p_output_text text,p_object_key text,p_mime_type text,
  p_bytes integer,p_duration_ms integer,p_sha256 text,p_generation_cost integer DEFAULT 1,p_interaction_state jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_message messages%ROWTYPE; v_balance integer; v_media_id uuid;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  IF jsonb_typeof(COALESCE(p_interaction_state,'{}'::jsonb))<>'object' THEN RAISE EXCEPTION 'INVALID_INTERACTION_STATE'; END IF;
  SELECT * INTO v_message FROM messages WHERE id=p_message_id AND user_id=p_user_id AND voice_profile_id=p_voice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MESSAGE_NOT_FOUND'; END IF;
  SELECT balance INTO v_balance FROM point_accounts WHERE user_id=p_user_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM point_ledgers WHERE type='GENERATION_CONSUME' AND message_id=p_message_id) THEN
    SELECT id INTO v_media_id FROM media_assets WHERE message_id=p_message_id AND kind='GENERATED_AUDIO' AND status='READY' ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object('messageId',p_message_id,'status','READY','charged',false,'balance',v_balance,'mediaId',v_media_id,'idempotent',true);
  END IF;
  IF v_message.status NOT IN('PENDING','PROCESSING') THEN RAISE EXCEPTION 'INVALID_MESSAGE_STATE:%',v_message.status; END IF;
  IF v_balance<p_generation_cost THEN RAISE EXCEPTION 'POINTS_EXHAUSTED'; END IF;
  IF p_bytes<=0 OR NULLIF(p_object_key,'') IS NULL OR NULLIF(p_sha256,'') IS NULL THEN RAISE EXCEPTION 'INVALID_GENERATED_MEDIA'; END IF;
  INSERT INTO media_assets(user_id,voice_profile_id,message_id,kind,status,object_key,mime_type,bytes,duration_ms,sha256)
  VALUES(p_user_id,p_voice_id,p_message_id,'GENERATED_AUDIO','READY',p_object_key,p_mime_type,p_bytes,p_duration_ms,p_sha256)
  ON CONFLICT(object_key) DO UPDATE SET status='READY',bytes=EXCLUDED.bytes,duration_ms=EXCLUDED.duration_ms,
    sha256=EXCLUDED.sha256,deleted_at=NULL,updated_at=now() RETURNING id INTO v_media_id;
  v_balance:=v_balance-p_generation_cost;
  UPDATE point_accounts SET balance=v_balance,updated_at=now() WHERE user_id=p_user_id;
  UPDATE messages SET status='READY',output_text=p_output_text,interaction_state=COALESCE(p_interaction_state,'{}'::jsonb),
    error_code='',error_message='',ready_at=now(),updated_at=now() WHERE id=p_message_id;
  UPDATE voice_profiles SET last_used_at=now(),updated_at=now() WHERE id=p_voice_id;
  INSERT INTO point_ledgers(user_id,voice_profile_id,message_id,type,amount,balance_after,request_key,source)
  VALUES(p_user_id,p_voice_id,p_message_id,'GENERATION_CONSUME',-p_generation_cost,v_balance,'generation:'||p_message_id::text,'VOICE_GENERATION');
  RETURN jsonb_build_object('messageId',p_message_id,'status','READY','charged',true,'balance',v_balance,'mediaId',v_media_id,'idempotent',false);
END; $$;

REVOKE ALL ON FUNCTION rpc_voice_update_profile_v6(uuid,uuid,text,permission_type,voice_relationship_type,text,text,integer,text,integer,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION rpc_message_publish_text_v2(uuid,text,uuid,uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION rpc_message_complete_success_v2(uuid,uuid,uuid,text,text,text,integer,integer,text,integer,jsonb) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='api_rpc_role') THEN
    GRANT EXECUTE ON FUNCTION rpc_voice_update_profile_v6(uuid,uuid,text,permission_type,voice_relationship_type,text,text,integer,text,integer,text,text,text,text,text) TO api_rpc_role;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='worker_rpc_role') THEN
    GRANT EXECUTE ON FUNCTION rpc_message_publish_text_v2(uuid,text,uuid,uuid,text,jsonb) TO worker_rpc_role;
    GRANT EXECUTE ON FUNCTION rpc_message_complete_success_v2(uuid,uuid,uuid,text,text,text,integer,integer,text,integer,jsonb) TO worker_rpc_role;
  END IF;
END $$;
