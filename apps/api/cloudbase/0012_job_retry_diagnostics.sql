CREATE OR REPLACE FUNCTION rpc_job_mark_failed_or_retry(
  p_job_id uuid,p_worker_id text,p_error_code text,p_error_message text,p_retryable boolean DEFAULT true,p_retry_delay_seconds integer DEFAULT 10
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_job jobs%ROWTYPE; v_terminal boolean; v_status job_status; v_diagnostic jsonb;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  SELECT * INTO v_job FROM jobs WHERE id=p_job_id AND status='PROCESSING' AND lease_owner=p_worker_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_LEASE_NOT_OWNED'; END IF;
  v_terminal:=NOT p_retryable OR v_job.attempts>=v_job.max_attempts;
  v_status:=CASE WHEN v_terminal THEN 'FAILED'::job_status ELSE 'QUEUED'::job_status END;
  v_diagnostic:=jsonb_build_object(
    'attempt',v_job.attempts,
    'errorCode',left(COALESCE(p_error_code,'JOB_FAILED'),100),
    'errorMessage',left(COALESCE(p_error_message,''),500),
    'recordedAt',now(),
    'terminal',v_terminal
  );
  UPDATE jobs SET status=v_status,
    available_at=CASE WHEN v_terminal THEN available_at ELSE now()+make_interval(secs=>greatest(0,p_retry_delay_seconds)) END,
    leased_until=NULL,lease_owner=NULL,
    error_code=left(COALESCE(p_error_code,'JOB_FAILED'),100),error_message=left(COALESCE(p_error_message,''),1000),
    payload=jsonb_set(COALESCE(payload,'{}'::jsonb),'{retryDiagnostics}',COALESCE(payload->'retryDiagnostics','[]'::jsonb)||jsonb_build_array(v_diagnostic),true),
    finished_at=CASE WHEN v_terminal THEN now() ELSE NULL END,updated_at=now()
  WHERE id=p_job_id;
  IF v_terminal AND v_job.type='PROCESS_VOICE' AND v_job.voice_profile_id IS NOT NULL THEN
    UPDATE voice_profiles SET status='FAILED',failure_code=left(COALESCE(p_error_code,'PROVIDER_FAILED'),100),
      failure_message=left(COALESCE(p_error_message,''),500),updated_at=now()
    WHERE id=v_job.voice_profile_id AND status IN('QUEUED','PROCESSING');
  END IF;
  IF v_terminal AND v_job.type='GENERATE_MESSAGE' AND v_job.message_id IS NOT NULL THEN
    UPDATE messages SET status='FAILED',error_code=left(COALESCE(p_error_code,'PROVIDER_FAILED'),100),
      error_message=left(COALESCE(p_error_message,''),500),updated_at=now()
    WHERE id=v_job.message_id AND status IN('PENDING','PROCESSING');
  END IF;
  RETURN jsonb_build_object('jobId',p_job_id,'status',v_status,'terminal',v_terminal,'attempts',v_job.attempts,'maxAttempts',v_job.max_attempts);
END; $$;
