CREATE OR REPLACE FUNCTION rpc_voice_queue_source_speaker_check(p_user_id uuid,p_voice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_voice voice_profiles%ROWTYPE; v_media_id uuid; v_job_id uuid;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  SELECT * INTO v_voice FROM voice_profiles
  WHERE id=p_voice_id AND user_id=p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VOICE_NOT_FOUND'; END IF;

  SELECT id INTO v_media_id FROM media_assets
  WHERE voice_profile_id=p_voice_id AND user_id=p_user_id AND kind='SOURCE_VIDEO'
    AND status='READY' AND deleted_at IS NULL
  ORDER BY created_at DESC,id DESC LIMIT 1;
  IF v_media_id IS NULL THEN RAISE EXCEPTION 'SOURCE_VIDEO_REQUIRED'; END IF;

  SELECT id INTO v_job_id FROM jobs
  WHERE dedupe_key='source-speaker-check:'||p_voice_id::text
    AND status IN('QUEUED','PROCESSING') LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    RETURN jsonb_build_object('voiceId',p_voice_id,'status',v_voice.status,'jobId',v_job_id,'idempotent',true);
  END IF;
  IF v_voice.status NOT IN('DRAFT','FAILED') THEN RAISE EXCEPTION 'VOICE_NOT_READY_FOR_SOURCE_CHECK'; END IF;

  UPDATE voice_profiles SET status='QUEUED',failure_code='',failure_message='',updated_at=now()
  WHERE id=p_voice_id;
  INSERT INTO jobs(user_id,voice_profile_id,type,status,dedupe_key,payload,attempts,max_attempts,available_at)
  VALUES(
    p_user_id,p_voice_id,'PROCESS_VOICE','QUEUED','source-speaker-check:'||p_voice_id::text,
    jsonb_build_object('voiceId',p_voice_id,'phase','SOURCE_SPEAKER_CHECK','sourceMediaId',v_media_id),0,3,now()
  )
  ON CONFLICT(dedupe_key) DO UPDATE SET status='QUEUED',payload=EXCLUDED.payload,attempts=0,available_at=now(),
    leased_until=NULL,lease_owner=NULL,error_code='',error_message='',finished_at=NULL,updated_at=now()
  WHERE jobs.status IN('FAILED','SUCCEEDED','CANCELLED') RETURNING id INTO v_job_id;
  IF v_job_id IS NULL THEN
    SELECT id INTO v_job_id FROM jobs WHERE dedupe_key='source-speaker-check:'||p_voice_id::text;
  END IF;
  RETURN jsonb_build_object('voiceId',p_voice_id,'status','QUEUED','jobId',v_job_id,'idempotent',false);
END; $$;

CREATE OR REPLACE FUNCTION rpc_voice_source_speaker_check_passed(
  p_job_id uuid,p_worker_id text,p_voice_id uuid,p_media_id uuid,p_report jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  IF NOT EXISTS(
    SELECT 1 FROM jobs WHERE id=p_job_id AND voice_profile_id=p_voice_id AND type='PROCESS_VOICE'
      AND status='PROCESSING' AND lease_owner=p_worker_id AND payload->>'phase'='SOURCE_SPEAKER_CHECK'
      AND payload->>'sourceMediaId'=p_media_id::text
  ) THEN RAISE EXCEPTION 'SOURCE_SPEAKER_CHECK_LEASE_NOT_OWNED'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM media_assets WHERE id=p_media_id AND voice_profile_id=p_voice_id
      AND kind='SOURCE_VIDEO' AND status='READY' AND deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'SOURCE_VIDEO_REQUIRED'; END IF;

  UPDATE voice_profiles SET status='DRAFT',failure_code='',failure_message='',
    quality_report=COALESCE(quality_report,'{}'::jsonb)||jsonb_build_object('sourceSpeakerCheck',COALESCE(p_report,'{}'::jsonb)),
    updated_at=now() WHERE id=p_voice_id;
  UPDATE jobs SET status='SUCCEEDED',leased_until=NULL,lease_owner=NULL,heartbeat_at=now(),
    error_code='',error_message='',finished_at=now(),updated_at=now() WHERE id=p_job_id;
  RETURN jsonb_build_object('voiceId',p_voice_id,'mediaId',p_media_id,'status','DRAFT','jobId',p_job_id);
END; $$;

CREATE OR REPLACE FUNCTION rpc_voice_source_speaker_check_rejected(
  p_job_id uuid,p_worker_id text,p_voice_id uuid,p_media_id uuid,p_error_code text,p_error_message text,p_report jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  IF p_error_code NOT IN('MULTIPLE_SPEAKERS','OVERLAPPING_SPEECH','SPEAKER_UNCERTAIN') THEN
    RAISE EXCEPTION 'INVALID_SOURCE_SPEAKER_FAILURE';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM jobs WHERE id=p_job_id AND voice_profile_id=p_voice_id AND type='PROCESS_VOICE'
      AND status='PROCESSING' AND lease_owner=p_worker_id AND payload->>'phase'='SOURCE_SPEAKER_CHECK'
      AND payload->>'sourceMediaId'=p_media_id::text
  ) THEN RAISE EXCEPTION 'SOURCE_SPEAKER_CHECK_LEASE_NOT_OWNED'; END IF;

  UPDATE media_assets SET status='DELETED',deleted_at=now(),updated_at=now()
  WHERE id=p_media_id AND voice_profile_id=p_voice_id AND kind='SOURCE_VIDEO';
  UPDATE voice_profiles SET status='FAILED',failure_code=left(p_error_code,100),
    failure_message=left(COALESCE(p_error_message,''),500),
    quality_report=COALESCE(quality_report,'{}'::jsonb)||jsonb_build_object('sourceSpeakerCheck',COALESCE(p_report,'{}'::jsonb)),
    updated_at=now() WHERE id=p_voice_id;
  UPDATE jobs SET status='FAILED',leased_until=NULL,lease_owner=NULL,heartbeat_at=now(),
    error_code=left(p_error_code,100),error_message=left(COALESCE(p_error_message,''),1000),
    finished_at=now(),updated_at=now() WHERE id=p_job_id;
  RETURN jsonb_build_object('voiceId',p_voice_id,'mediaId',p_media_id,'status','FAILED','jobId',p_job_id);
END; $$;

CREATE OR REPLACE FUNCTION rpc_job_get_voice_input(p_job_id uuid,p_worker_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  SELECT jsonb_build_object(
    'jobId',j.id,'userId',j.user_id,'voiceId',v.id,'clipStartMs',v.clip_start_ms,'clipEndMs',v.clip_end_ms,
    'sourceMediaId',m.id,'sourceObjectKey',m.object_key,'sourceMimeType',m.mime_type,
    'ageYears',v.age_years,'gender',v.gender,'userAgeYears',v.user_age_years,'relationshipType',v.relationship_type,
    'existingProviderVoiceIdEncrypted',vm.provider_voice_id_encrypted,'existingProviderStatus',vm.status,
    'sourceSpeakerCheckPassed',COALESCE(v.quality_report->'sourceSpeakerCheck'->>'acceptable','false')='true',
    'sourceSpeakerCheckReport',v.quality_report->'sourceSpeakerCheck'
  ) INTO v_result
  FROM jobs j
  JOIN voice_profiles v ON v.id=j.voice_profile_id
  JOIN LATERAL (
    SELECT ma.* FROM media_assets ma WHERE ma.voice_profile_id=v.id AND ma.kind='SOURCE_VIDEO'
      AND ma.status='READY' AND ma.deleted_at IS NULL ORDER BY ma.created_at DESC,ma.id DESC LIMIT 1
  ) m ON true
  LEFT JOIN voice_models vm ON vm.voice_profile_id=v.id AND vm.status<>'DELETED'
  WHERE j.id=p_job_id AND j.type='PROCESS_VOICE' AND j.status='PROCESSING' AND j.lease_owner=p_worker_id;
  IF v_result IS NULL THEN RAISE EXCEPTION 'VOICE_JOB_INPUT_NOT_FOUND'; END IF;
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION rpc_voice_queue_source_speaker_check(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION rpc_voice_source_speaker_check_passed(uuid,text,uuid,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION rpc_voice_source_speaker_check_rejected(uuid,text,uuid,uuid,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION rpc_job_get_voice_input(uuid,text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='api_rpc_role') THEN
    GRANT EXECUTE ON FUNCTION rpc_voice_queue_source_speaker_check(uuid,uuid) TO api_rpc_role;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='worker_rpc_role') THEN
    GRANT EXECUTE ON FUNCTION rpc_voice_source_speaker_check_passed(uuid,text,uuid,uuid,jsonb) TO worker_rpc_role;
    GRANT EXECUTE ON FUNCTION rpc_voice_source_speaker_check_rejected(uuid,text,uuid,uuid,text,text,jsonb) TO worker_rpc_role;
    GRANT EXECUTE ON FUNCTION rpc_job_get_voice_input(uuid,text) TO worker_rpc_role;
  END IF;
END $$;
