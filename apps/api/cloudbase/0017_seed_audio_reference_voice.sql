CREATE OR REPLACE FUNCTION rpc_job_get_voice_input(p_job_id uuid,p_worker_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  SELECT jsonb_build_object(
    'jobId',j.id,'userId',j.user_id,'voiceId',v.id,'clipStartMs',v.clip_start_ms,'clipEndMs',v.clip_end_ms,
    'sourceMediaId',m.id,'sourceObjectKey',m.object_key,'sourceMimeType',m.mime_type,
    'ageYears',v.age_years,'gender',v.gender,'userAgeYears',v.user_age_years,'relationshipType',v.relationship_type,
    'existingProviderVoiceIdEncrypted',vm.provider_voice_id_encrypted,'existingProviderStatus',vm.status
  ) INTO v_result
  FROM jobs j
  JOIN voice_profiles v ON v.id=j.voice_profile_id
  JOIN LATERAL (
    SELECT ma.* FROM media_assets ma WHERE ma.voice_profile_id=v.id AND ma.kind='SOURCE_VIDEO'
      AND ma.status='READY' AND ma.deleted_at IS NULL ORDER BY ma.created_at DESC LIMIT 1
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
