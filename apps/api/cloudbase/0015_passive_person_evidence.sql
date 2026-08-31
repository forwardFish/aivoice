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
    'qualityReport',COALESCE(vp.quality_report,'{}'::jsonb),
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

REVOKE ALL ON FUNCTION rpc_job_get_message_input(uuid,text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='worker_rpc_role') THEN
    GRANT EXECUTE ON FUNCTION rpc_job_get_message_input(uuid,text) TO worker_rpc_role;
  END IF;
END $$;
