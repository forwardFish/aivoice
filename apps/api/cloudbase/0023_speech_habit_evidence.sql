-- Preserve source-speaker evidence and concurrent feedback while finalizing a
-- voice. No table or column is added; the versioned evidence remains inside
-- voice_profiles.quality_report.
CREATE OR REPLACE FUNCTION rpc_voice_processing_finalize(
  p_job_id uuid,p_worker_id text,p_user_id uuid,p_voice_id uuid,p_reference_object_key text,p_reference_bytes integer,
  p_reference_duration_ms integer,p_reference_sha256 text,p_preview_object_key text,p_preview_bytes integer,
  p_preview_duration_ms integer,p_preview_sha256 text,p_provider text,p_target_model text,p_provider_voice_id_encrypted text,
  p_quality_report jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_reference_id uuid; v_preview_id uuid;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  IF NOT EXISTS(SELECT 1 FROM jobs WHERE id=p_job_id AND user_id=p_user_id AND voice_profile_id=p_voice_id AND status='PROCESSING' AND lease_owner=p_worker_id)
    THEN RAISE EXCEPTION 'JOB_LEASE_NOT_OWNED'; END IF;
  INSERT INTO media_assets(user_id,voice_profile_id,kind,status,object_key,mime_type,bytes,duration_ms,sha256)
  VALUES(p_user_id,p_voice_id,'REFERENCE_AUDIO','READY',p_reference_object_key,'audio/wav',p_reference_bytes,p_reference_duration_ms,p_reference_sha256)
  ON CONFLICT(object_key) DO UPDATE SET status='READY',bytes=EXCLUDED.bytes,duration_ms=EXCLUDED.duration_ms,sha256=EXCLUDED.sha256,deleted_at=NULL,updated_at=now()
  RETURNING id INTO v_reference_id;
  INSERT INTO media_assets(user_id,voice_profile_id,kind,status,object_key,mime_type,bytes,duration_ms,sha256)
  VALUES(p_user_id,p_voice_id,'PREVIEW_AUDIO','READY',p_preview_object_key,'audio/wav',p_preview_bytes,p_preview_duration_ms,p_preview_sha256)
  ON CONFLICT(object_key) DO UPDATE SET status='READY',bytes=EXCLUDED.bytes,duration_ms=EXCLUDED.duration_ms,sha256=EXCLUDED.sha256,deleted_at=NULL,updated_at=now()
  RETURNING id INTO v_preview_id;
  INSERT INTO voice_models(voice_profile_id,provider,target_model,provider_voice_id_encrypted,status,deletion_error)
  VALUES(p_voice_id,p_provider,p_target_model,p_provider_voice_id_encrypted,'READY','')
  ON CONFLICT(voice_profile_id) DO UPDATE SET provider=EXCLUDED.provider,target_model=EXCLUDED.target_model,
    provider_voice_id_encrypted=EXCLUDED.provider_voice_id_encrypted,status='READY',deletion_error='',deleted_at=NULL,updated_at=now();
  UPDATE voice_profiles
  SET status='READY',
      quality_report=COALESCE(quality_report,'{}'::jsonb)||COALESCE(p_quality_report,'{}'::jsonb),
      failure_code='',failure_message='',updated_at=now()
  WHERE id=p_voice_id;
  UPDATE media_assets SET status='DELETE_PENDING',updated_at=now()
  WHERE voice_profile_id=p_voice_id AND kind='SOURCE_VIDEO' AND status='READY';
  RETURN jsonb_build_object('voiceId',p_voice_id,'status','READY','referenceMediaId',v_reference_id,'previewMediaId',v_preview_id);
END; $$;

REVOKE ALL ON FUNCTION rpc_voice_processing_finalize(uuid,text,uuid,uuid,text,integer,integer,text,text,integer,integer,text,text,text,text,jsonb) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='worker_rpc_role') THEN
    GRANT EXECUTE ON FUNCTION rpc_voice_processing_finalize(uuid,text,uuid,uuid,text,integer,integer,text,text,integer,integer,text,text,text,text,jsonb) TO worker_rpc_role;
  END IF;
END $$;

-- Voice and account deletion must clear the derived transcript/fingerprint
-- evidence even though the soft-deleted profile row remains for integrity.
CREATE OR REPLACE FUNCTION rpc_voice_delete_finalize(p_job_id uuid,p_worker_id text,p_user_id uuid,p_voice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  IF NOT EXISTS(SELECT 1 FROM jobs WHERE id=p_job_id AND user_id=p_user_id AND voice_profile_id=p_voice_id AND status='PROCESSING' AND lease_owner=p_worker_id)
    THEN RAISE EXCEPTION 'JOB_LEASE_NOT_OWNED'; END IF;
  UPDATE media_assets SET status='DELETED',deleted_at=COALESCE(deleted_at,now()),updated_at=now() WHERE voice_profile_id=p_voice_id;
  UPDATE voice_models SET status='DELETED',deleted_at=COALESCE(deleted_at,now()),deletion_error='',updated_at=now() WHERE voice_profile_id=p_voice_id;
  UPDATE voice_profiles SET status='DELETED',quality_report='{}'::jsonb,deleted_at=COALESCE(deleted_at,now()),updated_at=now()
  WHERE id=p_voice_id AND user_id=p_user_id;
  RETURN jsonb_build_object('voiceId',p_voice_id,'status','DELETED');
END; $$;

CREATE OR REPLACE FUNCTION rpc_account_delete_finalize(p_job_id uuid,p_worker_id text,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  IF NOT EXISTS(SELECT 1 FROM jobs WHERE id=p_job_id AND user_id=p_user_id AND type='DELETE_ACCOUNT' AND status='PROCESSING' AND lease_owner=p_worker_id)
    THEN RAISE EXCEPTION 'JOB_LEASE_NOT_OWNED'; END IF;
  UPDATE media_assets SET status='DELETED',deleted_at=COALESCE(deleted_at,now()),updated_at=now() WHERE user_id=p_user_id;
  UPDATE voice_models SET status='DELETED',deleted_at=COALESCE(deleted_at,now()),deletion_error='',updated_at=now()
    WHERE voice_profile_id IN(SELECT id FROM voice_profiles WHERE user_id=p_user_id);
  UPDATE voice_profiles SET status='DELETED',quality_report='{}'::jsonb,deleted_at=COALESCE(deleted_at,now()),updated_at=now()
  WHERE user_id=p_user_id;
  RETURN jsonb_build_object('userId',p_user_id,'status','DELETED');
END; $$;

REVOKE ALL ON FUNCTION rpc_voice_delete_finalize(uuid,text,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION rpc_account_delete_finalize(uuid,text,uuid) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='worker_rpc_role') THEN
    GRANT EXECUTE ON FUNCTION rpc_voice_delete_finalize(uuid,text,uuid,uuid) TO worker_rpc_role;
    GRANT EXECUTE ON FUNCTION rpc_account_delete_finalize(uuid,text,uuid) TO worker_rpc_role;
  END IF;
END $$;

-- Read both the current camelCase JSON contract and historical reports that
-- were recursively converted to snake_case by the old runtime client.
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
    'sourceSpeakerCheckPassed',COALESCE(
      v.quality_report->'sourceSpeakerCheck'->>'acceptable',
      v.quality_report->'source_speaker_check'->>'acceptable',
      'false'
    )='true',
    'sourceSpeakerCheckReport',COALESCE(
      v.quality_report->'sourceSpeakerCheck',
      v.quality_report->'source_speaker_check'
    )
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

REVOKE ALL ON FUNCTION rpc_job_get_voice_input(uuid,text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='worker_rpc_role') THEN
    GRANT EXECUTE ON FUNCTION rpc_job_get_voice_input(uuid,text) TO worker_rpc_role;
  END IF;
END $$;
