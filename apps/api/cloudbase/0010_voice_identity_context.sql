ALTER TABLE voice_profiles ADD COLUMN IF NOT EXISTS age_years integer;
ALTER TABLE voice_profiles ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE voice_profiles ADD COLUMN IF NOT EXISTS user_life_stage text;
ALTER TABLE voice_profiles ADD COLUMN IF NOT EXISTS background text NOT NULL DEFAULT '';
ALTER TABLE voice_profiles ADD COLUMN IF NOT EXISTS relationship_note text NOT NULL DEFAULT '';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='voice_profiles_age_years_valid') THEN
    ALTER TABLE voice_profiles ADD CONSTRAINT voice_profiles_age_years_valid CHECK (age_years IS NULL OR (age_years>=0 AND age_years<=120));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='voice_profiles_gender_valid') THEN
    ALTER TABLE voice_profiles ADD CONSTRAINT voice_profiles_gender_valid CHECK (gender IS NULL OR gender IN ('FEMALE','MALE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='voice_profiles_user_life_stage_valid') THEN
    ALTER TABLE voice_profiles ADD CONSTRAINT voice_profiles_user_life_stage_valid CHECK (user_life_stage IS NULL OR user_life_stage IN ('CHILD','TEEN','ADULT','OLDER_ADULT'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='voice_profiles_background_length') THEN
    ALTER TABLE voice_profiles ADD CONSTRAINT voice_profiles_background_length CHECK (char_length(background)<=300);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='voice_profiles_relationship_note_length') THEN
    ALTER TABLE voice_profiles ADD CONSTRAINT voice_profiles_relationship_note_length CHECK (char_length(relationship_note)<=300);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION rpc_voice_update_profile_v4(
  p_user_id uuid,p_voice_id uuid,p_name text,p_permission_type permission_type,
  p_relationship_type voice_relationship_type DEFAULT NULL,p_relationship_label text DEFAULT '',p_user_address text DEFAULT '',
  p_age_years integer DEFAULT NULL,p_gender text DEFAULT NULL,p_user_life_stage text DEFAULT NULL,
  p_background text DEFAULT '',p_relationship_note text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_relationship_type voice_relationship_type; v_relationship_label text; v_user_address text;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  IF NULLIF(btrim(p_name),'') IS NULL THEN RAISE EXCEPTION 'VOICE_NAME_REQUIRED'; END IF;
  IF p_age_years IS NOT NULL AND (p_age_years<0 OR p_age_years>120) THEN RAISE EXCEPTION 'AGE_YEARS_INVALID'; END IF;
  IF p_gender IS NOT NULL AND p_gender NOT IN ('FEMALE','MALE') THEN RAISE EXCEPTION 'GENDER_INVALID'; END IF;
  IF p_user_life_stage IS NOT NULL AND p_user_life_stage NOT IN ('CHILD','TEEN','ADULT','OLDER_ADULT') THEN RAISE EXCEPTION 'USER_LIFE_STAGE_INVALID'; END IF;
  v_relationship_type:=CASE WHEN p_permission_type='SELF' THEN 'SELF'::voice_relationship_type ELSE p_relationship_type END;
  v_relationship_label:=CASE WHEN v_relationship_type='OTHER' THEN left(btrim(COALESCE(p_relationship_label,'')),10) ELSE '' END;
  v_user_address:=left(btrim(COALESCE(p_user_address,'')),10);
  IF p_relationship_type='OTHER' AND v_relationship_label='' THEN RAISE EXCEPTION 'RELATIONSHIP_LABEL_REQUIRED'; END IF;
  UPDATE voice_profiles SET name=left(btrim(p_name),40),permission_type=p_permission_type,
    relationship_type=v_relationship_type,relationship_label=v_relationship_label,user_address=v_user_address,
    age_years=p_age_years,gender=p_gender,user_life_stage=p_user_life_stage,
    background=left(btrim(COALESCE(p_background,'')),300),relationship_note=left(btrim(COALESCE(p_relationship_note,'')),300),updated_at=now()
  WHERE id=p_voice_id AND user_id=p_user_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'VOICE_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('voiceId',p_voice_id,'name',left(btrim(p_name),40),'permissionType',p_permission_type,
    'relationshipType',v_relationship_type,'relationshipLabel',v_relationship_label,'userAddress',v_user_address,
    'ageYears',p_age_years,'gender',p_gender,'userLifeStage',p_user_life_stage,
    'background',left(btrim(COALESCE(p_background,'')),300),'relationshipNote',left(btrim(COALESCE(p_relationship_note,'')),300));
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
    'ageYears',vp.age_years,'gender',vp.gender,'userLifeStage',vp.user_life_stage,
    'background',vp.background,'relationshipNote',vp.relationship_note,
    'providerVoiceIdEncrypted',vm.provider_voice_id_encrypted,
    'history',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('messageId',h.id,'mode',h.mode,'inputText',h.input_text,'outputText',h.output_text)
        ORDER BY h.created_at,h.id)
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

REVOKE ALL ON FUNCTION rpc_voice_update_profile_v4(uuid,uuid,text,permission_type,voice_relationship_type,text,text,integer,text,text,text,text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='api_rpc_role') THEN
    GRANT EXECUTE ON FUNCTION rpc_voice_update_profile_v4(uuid,uuid,text,permission_type,voice_relationship_type,text,text,integer,text,text,text,text) TO api_rpc_role;
  END IF;
END $$;
