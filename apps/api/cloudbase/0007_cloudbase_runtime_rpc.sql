-- CloudBase PostgreSQL REST/RPC runtime contract.
-- All state-changing entry points are SECURITY DEFINER, pin search_path, and
-- reject calls that do not carry a trusted server-side JWT claim.
-- Public signatures (all return jsonb; all parameters use the p_ prefix):
-- rpc_auth_login_wechat(p_openid text,p_unionid text,p_nickname text,p_avatar_url text,p_signup_bonus_points int)
-- rpc_auth_issue_session(p_user_id uuid,p_token_hash text,p_expires_at timestamptz)
-- rpc_auth_revoke_session(p_token_hash text)
-- rpc_voice_confirm_source_upload(p_user_id uuid,p_voice_id uuid,p_object_key text,p_mime_type text,p_bytes int,p_duration_ms int,p_sha256 text)
-- rpc_voice_update_clip(p_user_id uuid,p_voice_id uuid,p_start_ms int,p_end_ms int)
-- rpc_voice_update_profile(p_user_id uuid,p_voice_id uuid,p_name text,p_permission_type permission_type)
-- rpc_voice_confirm_consent(p_user_id uuid,p_voice_id uuid,p_permission_type permission_type,p_consent_version text,p_consent_text_hash text,p_confirmed_at timestamptz)
-- rpc_voice_queue_processing(p_user_id uuid,p_voice_id uuid,p_consent_version text,p_consent_text_hash text)
-- rpc_voice_mark_preview_played(p_user_id uuid,p_voice_id uuid,p_min_elapsed_ms int)
-- rpc_voice_accept_preview(p_user_id uuid,p_voice_id uuid)
-- rpc_voice_retry_preview(p_user_id uuid,p_voice_id uuid)
-- rpc_message_create(p_user_id uuid,p_voice_id uuid,p_idempotency_key text,p_mode message_mode,p_input_text text,p_generation_cost int)
-- rpc_message_complete_success(p_user_id uuid,p_voice_id uuid,p_message_id uuid,p_output_text text,p_object_key text,p_mime_type text,p_bytes int,p_duration_ms int,p_sha256 text,p_generation_cost int)
-- rpc_message_complete_failure(p_user_id uuid,p_message_id uuid,p_error_code text,p_error_message text)
-- rpc_message_complete_blocked(p_user_id uuid,p_message_id uuid,p_reason text)
-- rpc_order_create(p_user_id uuid,p_voice_profile_id uuid,p_product_code text,p_amount_fen int,p_points int,p_order_no text,p_idempotency_key text,p_appid text,p_mchid text,p_payer_openid text)
-- rpc_order_attach_prepay(p_order_id uuid,p_user_id uuid,p_prepay_id text,p_request_digest text)
-- rpc_payment_record_notify_event(p_event_id text,p_order_no text,p_request_id text,p_raw_digest text,p_resource_digest text,p_payload jsonb)
-- rpc_payment_apply_success(p_order_no text,p_transaction_id text,p_paid_at timestamptz,p_notify_digest text,p_appid text,p_mchid text,p_payer_openid text,p_amount_fen int)
-- rpc_voice_processing_started(p_job_id uuid,p_voice_id uuid,p_worker_id text)
-- rpc_voice_processing_finalize(p_job_id uuid,p_worker_id text,p_user_id uuid,p_voice_id uuid,p_reference_object_key text,p_reference_bytes int,p_reference_duration_ms int,p_reference_sha256 text,p_preview_object_key text,p_preview_bytes int,p_preview_duration_ms int,p_preview_sha256 text,p_provider text,p_target_model text,p_provider_voice_id_encrypted text,p_quality_report jsonb)
-- rpc_voice_delete_request(p_user_id uuid,p_voice_id uuid)
-- rpc_voice_delete_finalize(p_job_id uuid,p_worker_id text,p_user_id uuid,p_voice_id uuid)
-- rpc_account_delete_request(p_user_id uuid)
-- rpc_account_delete_finalize(p_job_id uuid,p_worker_id text,p_user_id uuid)
-- rpc_job_get_voice_input(p_job_id uuid,p_worker_id text)
-- rpc_job_get_message_input(p_job_id uuid,p_worker_id text)
-- rpc_job_get_delete_manifest(p_job_id uuid,p_worker_id text)
-- rpc_job_acquire(p_worker_id text,p_job_id uuid,p_lease_seconds int)
-- rpc_job_heartbeat(p_job_id uuid,p_worker_id text,p_lease_seconds int)
-- rpc_job_mark_succeeded(p_job_id uuid,p_worker_id text)
-- rpc_job_mark_failed_or_retry(p_job_id uuid,p_worker_id text,p_error_code text,p_error_message text,p_retryable bool,p_retry_delay_seconds int)
-- rpc_job_requeue_stalled(p_limit int)

CREATE TABLE IF NOT EXISTS payment_notify_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  order_no text NOT NULL,
  request_id text NOT NULL DEFAULT '',
  raw_digest text NOT NULL,
  resource_digest text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  duplicate_count integer NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runtime_products (
  product_code text PRIMARY KEY,
  amount_fen integer NOT NULL CHECK (amount_fen > 0),
  points integer NOT NULL CHECK (points > 0),
  validity_days integer NOT NULL CHECK (validity_days > 0),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO runtime_products(product_code, amount_fen, points, validity_days, active)
VALUES ('POINTS_50', 990, 50, 180, true)
ON CONFLICT (product_code) DO NOTHING;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_request_key text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS prepay_request_digest text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_appid text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_mchid text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payer_openid text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lease_owner text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_user_client_request_unique
  ON orders(user_id, client_request_key) WHERE client_request_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_notify_events_order_time_idx
  ON payment_notify_events(order_no, created_at DESC);

CREATE OR REPLACE FUNCTION _rpc_assert_caller(p_allowed_roles text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claims jsonb;
  v_role text;
  v_platform text;
  v_client_type text;
  v_provider text;
BEGIN
  BEGIN
    v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN others THEN
    v_claims := NULL;
  END;

  IF v_claims IS NULL THEN
    RAISE EXCEPTION 'RPC_UNAUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  v_role := COALESCE(v_claims->>'app_role', v_claims->>'role', '');
  v_platform := COALESCE(v_claims#>>'{meta,platform}', '');
  v_client_type := COALESCE(v_claims->>'client_type', '');
  v_provider := lower(COALESCE(v_claims#>>'{app_metadata,provider}', ''));

  -- The JWT itself carries meta.platform/client_type, while the CloudBase
  -- PostgREST gateway currently normalizes those fields to
  -- app_metadata.provider=apikey. Accept only either verified API-key shape.
  IF v_role = 'service_role' THEN
    IF NOT (
      (v_platform = 'ApiKey' AND v_client_type = 'client_server')
      OR v_provider = 'apikey'
    ) THEN
      RAISE EXCEPTION 'RPC_UNTRUSTED_SERVICE_CLAIMS' USING ERRCODE = '28000';
    END IF;
    RETURN;
  END IF;

  IF NOT (v_role = ANY(p_allowed_roles)) THEN
    RAISE EXCEPTION 'RPC_FORBIDDEN_ROLE:%', v_role USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_auth_login_wechat(
  p_openid text,
  p_unionid text DEFAULT NULL,
  p_nickname text DEFAULT '',
  p_avatar_url text DEFAULT '',
  p_signup_bonus_points integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_account point_accounts%ROWTYPE;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  IF NULLIF(btrim(p_openid), '') IS NULL THEN RAISE EXCEPTION 'OPENID_REQUIRED'; END IF;
  IF p_signup_bonus_points <= 0 THEN RAISE EXCEPTION 'INVALID_SIGNUP_BONUS'; END IF;

  INSERT INTO users(openid, unionid, nickname, avatar_url, created_at, updated_at)
  VALUES (btrim(p_openid), NULLIF(btrim(COALESCE(p_unionid, '')), ''),
          left(btrim(COALESCE(p_nickname, '')), 40), left(btrim(COALESCE(p_avatar_url, '')), 500), now(), now())
  ON CONFLICT (openid) DO UPDATE SET
    unionid = COALESCE(EXCLUDED.unionid, users.unionid),
    nickname = CASE WHEN EXCLUDED.nickname <> '' THEN EXCLUDED.nickname ELSE users.nickname END,
    avatar_url = CASE WHEN EXCLUDED.avatar_url <> '' THEN EXCLUDED.avatar_url ELSE users.avatar_url END,
    updated_at = now()
  RETURNING * INTO v_user;

  IF v_user.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'ACCOUNT_DELETED'; END IF;
  INSERT INTO point_accounts(user_id, balance, created_at, updated_at)
  VALUES (v_user.id, 0, now(), now()) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_account FROM point_accounts WHERE user_id = v_user.id FOR UPDATE;
  IF v_account.signup_granted_at IS NULL THEN
    UPDATE point_accounts SET balance = balance + p_signup_bonus_points,
      signup_granted_at = now(), updated_at = now()
    WHERE user_id = v_user.id RETURNING * INTO v_account;
    INSERT INTO point_ledgers(user_id, type, amount, balance_after, request_key, source)
    VALUES (v_user.id, 'REGISTER_GRANT', p_signup_bonus_points, v_account.balance,
            'registration:' || v_user.id::text, 'REGISTRATION')
    ON CONFLICT (type, request_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'user', jsonb_build_object('id', v_user.id, 'openid', v_user.openid, 'unionid', v_user.unionid,
      'nickname', v_user.nickname, 'avatarUrl', v_user.avatar_url,
      'trialCustomGenerationGrantedAt', v_user.trial_custom_generation_granted_at,
      'trialCustomGenerationConsumedAt', v_user.trial_custom_generation_consumed_at),
    'points', jsonb_build_object('balance', v_account.balance, 'availablePoints', v_account.balance)
  );
END;
$$;

CREATE OR REPLACE FUNCTION rpc_auth_issue_session(p_user_id uuid, p_token_hash text, p_expires_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  IF p_expires_at <= now() OR length(COALESCE(p_token_hash, '')) < 32 THEN RAISE EXCEPTION 'INVALID_SESSION'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_user_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  INSERT INTO sessions(user_id, token_hash, expires_at) VALUES(p_user_id, p_token_hash, p_expires_at)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('sessionId',v_id,'expiresAt',p_expires_at);
END; $$;

CREATE OR REPLACE FUNCTION rpc_auth_revoke_session(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count integer;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()),updated_at=now()
  WHERE token_hash=p_token_hash AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('revoked',v_count>0);
END; $$;

CREATE OR REPLACE FUNCTION rpc_voice_confirm_source_upload(
  p_user_id uuid, p_voice_id uuid, p_object_key text, p_mime_type text,
  p_bytes integer, p_duration_ms integer, p_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_media_id uuid;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  IF p_bytes<=0 OR p_bytes>104857600 OR p_duration_ms<12000 OR p_duration_ms>60000 THEN RAISE EXCEPTION 'INVALID_SOURCE_MEDIA'; END IF;
  IF NOT EXISTS(SELECT 1 FROM voice_profiles WHERE id=p_voice_id AND user_id=p_user_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'VOICE_NOT_FOUND'; END IF;
  INSERT INTO media_assets(user_id,voice_profile_id,kind,status,object_key,mime_type,bytes,duration_ms,sha256)
  VALUES(p_user_id,p_voice_id,'SOURCE_VIDEO','READY',p_object_key,p_mime_type,p_bytes,p_duration_ms,p_sha256)
  ON CONFLICT(object_key) DO UPDATE SET status='READY',mime_type=EXCLUDED.mime_type,bytes=EXCLUDED.bytes,
    duration_ms=EXCLUDED.duration_ms,sha256=EXCLUDED.sha256,deleted_at=NULL,updated_at=now()
  RETURNING id INTO v_media_id;
  UPDATE voice_profiles SET status='DRAFT',failure_code='',failure_message='',updated_at=now() WHERE id=p_voice_id;
  RETURN jsonb_build_object('mediaId',v_media_id,'voiceId',p_voice_id,'status','READY');
END; $$;

CREATE OR REPLACE FUNCTION rpc_voice_update_clip(p_user_id uuid,p_voice_id uuid,p_start_ms integer,p_end_ms integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  IF p_start_ms<0 OR p_end_ms-p_start_ms<10000 OR p_end_ms-p_start_ms>30000 THEN RAISE EXCEPTION 'INVALID_CLIP'; END IF;
  UPDATE voice_profiles SET clip_start_ms=p_start_ms,clip_end_ms=p_end_ms,status='DRAFT',failure_code='',failure_message='',updated_at=now()
  WHERE id=p_voice_id AND user_id=p_user_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'VOICE_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('voiceId',p_voice_id,'clipStartMs',p_start_ms,'clipEndMs',p_end_ms,'status','DRAFT');
END; $$;

CREATE OR REPLACE FUNCTION rpc_voice_update_profile(p_user_id uuid,p_voice_id uuid,p_name text,p_permission_type permission_type)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  IF NULLIF(btrim(p_name),'') IS NULL THEN RAISE EXCEPTION 'VOICE_NAME_REQUIRED'; END IF;
  UPDATE voice_profiles SET name=left(btrim(p_name),40),permission_type=p_permission_type,updated_at=now()
  WHERE id=p_voice_id AND user_id=p_user_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'VOICE_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('voiceId',p_voice_id,'name',left(btrim(p_name),40),'permissionType',p_permission_type);
END; $$;

CREATE OR REPLACE FUNCTION rpc_voice_confirm_consent(
  p_user_id uuid,p_voice_id uuid,p_permission_type permission_type,p_consent_version text,
  p_consent_text_hash text,p_confirmed_at timestamptz DEFAULT now()
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  IF NOT EXISTS(SELECT 1 FROM voice_profiles WHERE id=p_voice_id AND user_id=p_user_id AND permission_type=p_permission_type AND deleted_at IS NULL)
    THEN RAISE EXCEPTION 'VOICE_OR_PERMISSION_NOT_FOUND'; END IF;
  IF NULLIF(p_consent_version,'') IS NULL OR length(p_consent_text_hash)<>64 THEN RAISE EXCEPTION 'INVALID_CONSENT'; END IF;
  INSERT INTO consent_records(voice_profile_id,permission_type,consent_version,consent_text_hash,confirmed_at)
  VALUES(p_voice_id,p_permission_type,p_consent_version,p_consent_text_hash,p_confirmed_at) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'consentVersion',p_consent_version,'confirmedAt',p_confirmed_at);
END; $$;

CREATE OR REPLACE FUNCTION rpc_voice_queue_processing(
  p_user_id uuid,p_voice_id uuid,p_consent_version text,p_consent_text_hash text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_voice voice_profiles%ROWTYPE; v_job_id uuid;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  SELECT * INTO v_voice FROM voice_profiles WHERE id=p_voice_id AND user_id=p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VOICE_NOT_FOUND'; END IF;
  IF v_voice.status IN ('QUEUED','PROCESSING') THEN
    SELECT id INTO v_job_id FROM jobs WHERE dedupe_key='process-voice:'||p_voice_id::text;
    RETURN jsonb_build_object('voiceId',p_voice_id,'status',v_voice.status,'jobId',v_job_id,'idempotent',true);
  END IF;
  IF NULLIF(v_voice.name,'') IS NULL OR v_voice.permission_type IS NULL OR v_voice.clip_start_ms IS NULL OR v_voice.clip_end_ms IS NULL
    THEN RAISE EXCEPTION 'VOICE_PROFILE_INCOMPLETE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM consent_records WHERE voice_profile_id=p_voice_id AND permission_type=v_voice.permission_type
    AND consent_version=p_consent_version AND consent_text_hash=p_consent_text_hash) THEN RAISE EXCEPTION 'CONSENT_REQUIRED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM media_assets WHERE voice_profile_id=p_voice_id AND kind='SOURCE_VIDEO' AND status='READY' AND deleted_at IS NULL)
    THEN RAISE EXCEPTION 'SOURCE_VIDEO_REQUIRED'; END IF;
  UPDATE voice_profiles SET status='QUEUED',preview_playback_started_at=NULL,preview_played_at=NULL,accepted_at=NULL,
    failure_code='',failure_message='',updated_at=now() WHERE id=p_voice_id;
  INSERT INTO jobs(user_id,voice_profile_id,type,status,dedupe_key,payload,attempts,max_attempts,available_at)
  VALUES(p_user_id,p_voice_id,'PROCESS_VOICE','QUEUED','process-voice:'||p_voice_id::text,jsonb_build_object('voiceId',p_voice_id),0,3,now())
  ON CONFLICT(dedupe_key) DO UPDATE SET status='QUEUED',payload=EXCLUDED.payload,attempts=0,available_at=now(),leased_until=NULL,
    lease_owner=NULL,error_code='',error_message='',finished_at=NULL,updated_at=now()
  WHERE jobs.status IN ('FAILED','SUCCEEDED','CANCELLED') RETURNING id INTO v_job_id;
  IF v_job_id IS NULL THEN SELECT id INTO v_job_id FROM jobs WHERE dedupe_key='process-voice:'||p_voice_id::text; END IF;
  RETURN jsonb_build_object('voiceId',p_voice_id,'status','QUEUED','jobId',v_job_id,'idempotent',false);
END; $$;

CREATE OR REPLACE FUNCTION rpc_voice_mark_preview_played(p_user_id uuid,p_voice_id uuid,p_min_elapsed_ms integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_voice voice_profiles%ROWTYPE; v_duration integer;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  SELECT * INTO v_voice FROM voice_profiles WHERE id=p_voice_id AND user_id=p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VOICE_NOT_FOUND'; END IF;
  IF v_voice.status<>'READY' THEN RAISE EXCEPTION 'VOICE_NOT_READY'; END IF;
  SELECT duration_ms INTO v_duration FROM media_assets WHERE voice_profile_id=p_voice_id AND kind='PREVIEW_AUDIO' AND status='READY'
    ORDER BY created_at DESC LIMIT 1;
  IF v_duration IS NULL OR v_voice.preview_playback_started_at IS NULL OR
     extract(epoch FROM (now()-v_voice.preview_playback_started_at))*1000 < greatest(p_min_elapsed_ms,v_duration-750)
    THEN RAISE EXCEPTION 'PREVIEW_NOT_PLAYED'; END IF;
  UPDATE voice_profiles SET preview_played_at=COALESCE(preview_played_at,now()),updated_at=now() WHERE id=p_voice_id RETURNING * INTO v_voice;
  RETURN jsonb_build_object('previewPlayedAt',v_voice.preview_played_at);
END; $$;

CREATE OR REPLACE FUNCTION rpc_voice_accept_preview(p_user_id uuid,p_voice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_voice voice_profiles%ROWTYPE; v_balance integer;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  SELECT * INTO v_voice FROM voice_profiles WHERE id=p_voice_id AND user_id=p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VOICE_NOT_FOUND'; END IF;
  IF v_voice.status<>'READY' THEN RAISE EXCEPTION 'VOICE_NOT_READY'; END IF;
  IF v_voice.preview_played_at IS NULL THEN RAISE EXCEPTION 'PREVIEW_NOT_PLAYED'; END IF;
  UPDATE voice_profiles SET accepted_at=COALESCE(accepted_at,now()),updated_at=now() WHERE id=p_voice_id RETURNING * INTO v_voice;
  SELECT balance INTO v_balance FROM point_accounts WHERE user_id=p_user_id;
  RETURN jsonb_build_object('voiceId',p_voice_id,'acceptedAt',v_voice.accepted_at,
    'quota',jsonb_build_object('trialQuotaRemaining',0,'paidQuotaRemaining',COALESCE(v_balance,0),'availableQuota',COALESCE(v_balance,0),'trialEligibility','USED'));
END; $$;

CREATE OR REPLACE FUNCTION rpc_voice_retry_preview(p_user_id uuid,p_voice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_voice voice_profiles%ROWTYPE; v_job_id uuid;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  SELECT * INTO v_voice FROM voice_profiles WHERE id=p_voice_id AND user_id=p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VOICE_NOT_FOUND'; END IF;
  IF v_voice.status<>'READY' THEN RAISE EXCEPTION 'VOICE_NOT_READY'; END IF;
  IF v_voice.preview_retry_count>=1 THEN RAISE EXCEPTION 'PREVIEW_RETRY_EXHAUSTED'; END IF;
  UPDATE voice_profiles SET status='QUEUED',accepted_at=NULL,preview_playback_started_at=NULL,preview_played_at=NULL,
    preview_retry_count=preview_retry_count+1,failure_code='',failure_message='',updated_at=now() WHERE id=p_voice_id;
  INSERT INTO jobs(user_id,voice_profile_id,type,status,dedupe_key,payload,attempts,max_attempts,available_at)
  VALUES(p_user_id,p_voice_id,'PROCESS_VOICE','QUEUED','process-voice:'||p_voice_id::text,jsonb_build_object('voiceId',p_voice_id),0,3,now())
  ON CONFLICT(dedupe_key) DO UPDATE SET status='QUEUED',attempts=0,available_at=now(),leased_until=NULL,lease_owner=NULL,
    error_code='',error_message='',finished_at=NULL,updated_at=now()
  WHERE jobs.status IN('FAILED','SUCCEEDED','CANCELLED') RETURNING id INTO v_job_id;
  IF v_job_id IS NULL THEN SELECT id INTO v_job_id FROM jobs WHERE dedupe_key='process-voice:'||p_voice_id::text; END IF;
  RETURN jsonb_build_object('voiceId',p_voice_id,'status','QUEUED','previewRetryCount',v_voice.preview_retry_count+1,'jobId',v_job_id);
END; $$;

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
  IF EXISTS(SELECT 1 FROM messages WHERE voice_profile_id=p_voice_id AND status IN('PENDING','PROCESSING')) THEN RAISE EXCEPTION 'GENERATION_IN_PROGRESS'; END IF;
  INSERT INTO conversations(voice_profile_id) VALUES(p_voice_id)
  ON CONFLICT(voice_profile_id) DO UPDATE SET updated_at=now() RETURNING id INTO v_conversation_id;
  INSERT INTO messages(conversation_id,user_id,voice_profile_id,idempotency_key,mode,status,input_text)
  VALUES(v_conversation_id,p_user_id,p_voice_id,p_idempotency_key,p_mode,'PROCESSING',btrim(p_input_text)) RETURNING id INTO v_message_id;
  INSERT INTO jobs(user_id,voice_profile_id,message_id,type,status,dedupe_key,payload,max_attempts)
  VALUES(p_user_id,p_voice_id,v_message_id,'GENERATE_MESSAGE','QUEUED','generate-message:'||v_message_id::text,
    jsonb_build_object('messageId',v_message_id,'mode',p_mode),3) RETURNING id INTO v_job_id;
  RETURN jsonb_build_object('messageId',v_message_id,'status','PROCESSING','jobId',v_job_id,'idempotent',false);
END; $$;

CREATE OR REPLACE FUNCTION rpc_message_complete_success(
  p_user_id uuid,p_voice_id uuid,p_message_id uuid,p_output_text text,p_object_key text,p_mime_type text,
  p_bytes integer,p_duration_ms integer,p_sha256 text,p_generation_cost integer DEFAULT 1
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_message messages%ROWTYPE; v_balance integer; v_media_id uuid;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
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
  UPDATE messages SET status='READY',output_text=p_output_text,error_code='',error_message='',ready_at=now(),updated_at=now() WHERE id=p_message_id;
  UPDATE voice_profiles SET last_used_at=now(),updated_at=now() WHERE id=p_voice_id;
  INSERT INTO point_ledgers(user_id,voice_profile_id,message_id,type,amount,balance_after,request_key,source)
  VALUES(p_user_id,p_voice_id,p_message_id,'GENERATION_CONSUME',-p_generation_cost,v_balance,'generation:'||p_message_id::text,'VOICE_GENERATION');
  RETURN jsonb_build_object('messageId',p_message_id,'status','READY','charged',true,'balance',v_balance,'mediaId',v_media_id,'idempotent',false);
END; $$;

CREATE OR REPLACE FUNCTION rpc_message_complete_failure(p_user_id uuid,p_message_id uuid,p_error_code text,p_error_message text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count integer;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  UPDATE messages SET status='FAILED',error_code=left(COALESCE(p_error_code,'PROVIDER_FAILED'),100),
    error_message=left(COALESCE(p_error_message,''),500),updated_at=now()
  WHERE id=p_message_id AND user_id=p_user_id AND status IN('PENDING','PROCESSING');
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('messageId',p_message_id,'status','FAILED','updated',v_count>0,'charged',false);
END; $$;

CREATE OR REPLACE FUNCTION rpc_message_complete_blocked(p_user_id uuid,p_message_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count integer;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  UPDATE messages SET status='BLOCKED',error_code='CONTENT_BLOCKED',error_message=left(COALESCE(p_reason,''),500),updated_at=now()
  WHERE id=p_message_id AND user_id=p_user_id AND status IN('PENDING','PROCESSING');
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('messageId',p_message_id,'status','BLOCKED','updated',v_count>0,'charged',false);
END; $$;

CREATE OR REPLACE FUNCTION rpc_order_create(
  p_user_id uuid,p_voice_profile_id uuid,p_product_code text,p_amount_fen integer,p_points integer,p_order_no text,
  p_idempotency_key text DEFAULT NULL,p_appid text DEFAULT NULL,p_mchid text DEFAULT NULL,p_payer_openid text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_order orders%ROWTYPE; v_product runtime_products%ROWTYPE;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  SELECT * INTO v_product FROM runtime_products WHERE product_code=p_product_code AND active=true;
  IF NOT FOUND OR p_points<>v_product.points OR p_amount_fen<>v_product.amount_fen THEN RAISE EXCEPTION 'INVALID_PRODUCT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_user_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  IF p_voice_profile_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM voice_profiles WHERE id=p_voice_profile_id AND user_id=p_user_id AND status='READY' AND deleted_at IS NULL)
    THEN RAISE EXCEPTION 'VOICE_NOT_READY'; END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_order FROM orders WHERE user_id=p_user_id AND client_request_key=p_idempotency_key;
    IF FOUND THEN RETURN to_jsonb(v_order); END IF;
  END IF;
  INSERT INTO orders(order_no,user_id,voice_profile_id,product_code,amount_fen,quota,points,client_request_key,payment_appid,payment_mchid,payer_openid)
  VALUES(p_order_no,p_user_id,p_voice_profile_id,p_product_code,p_amount_fen,p_points,p_points,NULLIF(p_idempotency_key,''),
    NULLIF(p_appid,''),NULLIF(p_mchid,''),NULLIF(p_payer_openid,'')) RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END; $$;

CREATE OR REPLACE FUNCTION rpc_order_attach_prepay(p_order_id uuid,p_user_id uuid,p_prepay_id text,p_request_digest text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_order orders%ROWTYPE;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  IF NULLIF(p_prepay_id,'') IS NULL THEN RAISE EXCEPTION 'PREPAY_ID_REQUIRED'; END IF;
  SELECT * INTO v_order FROM orders WHERE id=p_order_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status<>'PENDING' THEN RAISE EXCEPTION 'ORDER_NOT_PENDING'; END IF;
  IF v_order.prepay_id<>'' AND v_order.prepay_id<>p_prepay_id THEN RAISE EXCEPTION 'PREPAY_ALREADY_ATTACHED'; END IF;
  UPDATE orders SET prepay_id=p_prepay_id,prepay_request_digest=COALESCE(p_request_digest,''),updated_at=now()
  WHERE id=p_order_id RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END; $$;

CREATE OR REPLACE FUNCTION rpc_payment_record_notify_event(
  p_event_id text,p_order_no text,p_request_id text,p_raw_digest text,p_resource_digest text,p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_event payment_notify_events%ROWTYPE; v_inserted boolean;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  IF NULLIF(p_event_id,'') IS NULL OR NULLIF(p_order_no,'') IS NULL OR NULLIF(p_raw_digest,'') IS NULL THEN RAISE EXCEPTION 'INVALID_NOTIFY_EVENT'; END IF;
  SELECT * INTO v_event FROM payment_notify_events WHERE event_id=p_event_id FOR UPDATE;
  v_inserted:=NOT FOUND;
  IF v_inserted THEN
    INSERT INTO payment_notify_events(event_id,order_no,request_id,raw_digest,resource_digest,payload)
    VALUES(p_event_id,p_order_no,COALESCE(p_request_id,''),p_raw_digest,COALESCE(p_resource_digest,''),COALESCE(p_payload,'{}'::jsonb))
    RETURNING * INTO v_event;
  ELSE
    UPDATE payment_notify_events SET duplicate_count=duplicate_count+1,updated_at=now()
    WHERE event_id=p_event_id RETURNING * INTO v_event;
  END IF;
  RETURN jsonb_build_object('eventId',v_event.event_id,'recorded',v_inserted,'duplicateCount',v_event.duplicate_count);
END; $$;

CREATE OR REPLACE FUNCTION rpc_payment_apply_success(
  p_order_no text,p_transaction_id text,p_paid_at timestamptz,p_notify_digest text DEFAULT '',
  p_appid text DEFAULT NULL,p_mchid text DEFAULT NULL,p_payer_openid text DEFAULT NULL,p_amount_fen integer DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_order orders%ROWTYPE; v_openid text; v_balance integer; v_credited boolean:=false;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  IF NULLIF(p_transaction_id,'') IS NULL THEN RAISE EXCEPTION 'TRANSACTION_ID_REQUIRED'; END IF;
  SELECT * INTO v_order FROM orders WHERE order_no=p_order_no FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT openid INTO v_openid FROM users WHERE id=v_order.user_id;
  IF p_amount_fen IS NULL OR p_amount_fen<>v_order.amount_fen THEN RAISE EXCEPTION 'PAYMENT_AMOUNT_MISMATCH'; END IF;
  IF NULLIF(p_appid,'') IS NULL OR (v_order.payment_appid IS NOT NULL AND p_appid<>v_order.payment_appid) THEN RAISE EXCEPTION 'PAYMENT_APPID_MISMATCH'; END IF;
  IF NULLIF(p_mchid,'') IS NULL OR (v_order.payment_mchid IS NOT NULL AND p_mchid<>v_order.payment_mchid) THEN RAISE EXCEPTION 'PAYMENT_MCHID_MISMATCH'; END IF;
  IF NULLIF(p_payer_openid,'') IS NULL OR p_payer_openid<>v_openid OR (v_order.payer_openid IS NOT NULL AND p_payer_openid<>v_order.payer_openid)
    THEN RAISE EXCEPTION 'PAYMENT_PAYER_MISMATCH'; END IF;
  IF v_order.transaction_id IS NOT NULL AND v_order.transaction_id<>p_transaction_id THEN RAISE EXCEPTION 'ORDER_TRANSACTION_CONFLICT'; END IF;
  IF EXISTS(SELECT 1 FROM orders WHERE transaction_id=p_transaction_id AND id<>v_order.id) THEN RAISE EXCEPTION 'TRANSACTION_ALREADY_USED'; END IF;
  INSERT INTO point_accounts(user_id,balance) VALUES(v_order.user_id,0) ON CONFLICT(user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM point_accounts WHERE user_id=v_order.user_id FOR UPDATE;
  IF v_order.points_granted_at IS NULL THEN
    v_balance:=v_balance+v_order.points;
    UPDATE point_accounts SET balance=v_balance,updated_at=now() WHERE user_id=v_order.user_id;
    UPDATE orders SET status='PAID',transaction_id=p_transaction_id,paid_at=p_paid_at,notify_digest=COALESCE(p_notify_digest,''),
      points_granted_at=now(),quota_granted_at=now(),updated_at=now() WHERE id=v_order.id RETURNING * INTO v_order;
    INSERT INTO point_ledgers(user_id,order_id,type,amount,balance_after,request_key,source)
    VALUES(v_order.user_id,v_order.id,'PURCHASE_GRANT',v_order.points,v_balance,'purchase:'||v_order.id::text,'WECHAT_PAY');
    v_credited:=true;
  ELSE
    UPDATE orders SET status='PAID',transaction_id=COALESCE(transaction_id,p_transaction_id),paid_at=COALESCE(paid_at,p_paid_at),
      notify_digest=CASE WHEN notify_digest='' THEN COALESCE(p_notify_digest,'') ELSE notify_digest END,updated_at=now() WHERE id=v_order.id RETURNING * INTO v_order;
  END IF;
  RETURN jsonb_build_object('orderId',v_order.id,'orderNo',v_order.order_no,'userId',v_order.user_id,'status',v_order.status,
    'credited',v_credited,'pointsGranted',v_order.points,'balance',v_balance,'transactionId',v_order.transaction_id);
END; $$;

CREATE OR REPLACE FUNCTION rpc_voice_processing_started(p_job_id uuid,p_voice_id uuid,p_worker_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  IF NOT EXISTS(SELECT 1 FROM jobs WHERE id=p_job_id AND voice_profile_id=p_voice_id AND status='PROCESSING' AND lease_owner=p_worker_id)
    THEN RAISE EXCEPTION 'JOB_LEASE_NOT_OWNED'; END IF;
  UPDATE voice_profiles SET status='PROCESSING',updated_at=now() WHERE id=p_voice_id AND status IN('QUEUED','PROCESSING');
  RETURN jsonb_build_object('voiceId',p_voice_id,'status','PROCESSING');
END; $$;

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
  UPDATE voice_profiles SET status='READY',quality_report=p_quality_report,failure_code='',failure_message='',updated_at=now() WHERE id=p_voice_id;
  UPDATE media_assets SET status='DELETE_PENDING',updated_at=now() WHERE voice_profile_id=p_voice_id AND kind='SOURCE_VIDEO' AND status='READY';
  RETURN jsonb_build_object('voiceId',p_voice_id,'status','READY','referenceMediaId',v_reference_id,'previewMediaId',v_preview_id);
END; $$;

CREATE OR REPLACE FUNCTION rpc_voice_delete_request(p_user_id uuid,p_voice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_voice voice_profiles%ROWTYPE; v_job_id uuid;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  SELECT * INTO v_voice FROM voice_profiles WHERE id=p_voice_id AND user_id=p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VOICE_NOT_FOUND'; END IF;
  IF v_voice.status<>'DELETING' THEN UPDATE voice_profiles SET status='DELETING',updated_at=now() WHERE id=p_voice_id; END IF;
  INSERT INTO jobs(user_id,voice_profile_id,type,status,dedupe_key,payload,max_attempts)
  VALUES(p_user_id,p_voice_id,'DELETE_VOICE','QUEUED','delete-voice:'||p_voice_id::text,jsonb_build_object('voiceId',p_voice_id),5)
  ON CONFLICT(dedupe_key) DO UPDATE SET status='QUEUED',attempts=0,available_at=now(),leased_until=NULL,lease_owner=NULL,
    error_code='',error_message='',finished_at=NULL,updated_at=now()
  WHERE jobs.status IN('FAILED','SUCCEEDED','CANCELLED') RETURNING id INTO v_job_id;
  IF v_job_id IS NULL THEN SELECT id INTO v_job_id FROM jobs WHERE dedupe_key='delete-voice:'||p_voice_id::text; END IF;
  RETURN jsonb_build_object('voiceId',p_voice_id,'status','DELETING','jobId',v_job_id);
END; $$;

CREATE OR REPLACE FUNCTION rpc_voice_delete_finalize(p_job_id uuid,p_worker_id text,p_user_id uuid,p_voice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  IF NOT EXISTS(SELECT 1 FROM jobs WHERE id=p_job_id AND user_id=p_user_id AND voice_profile_id=p_voice_id AND status='PROCESSING' AND lease_owner=p_worker_id)
    THEN RAISE EXCEPTION 'JOB_LEASE_NOT_OWNED'; END IF;
  UPDATE media_assets SET status='DELETED',deleted_at=COALESCE(deleted_at,now()),updated_at=now() WHERE voice_profile_id=p_voice_id;
  UPDATE voice_models SET status='DELETED',deleted_at=COALESCE(deleted_at,now()),deletion_error='',updated_at=now() WHERE voice_profile_id=p_voice_id;
  UPDATE voice_profiles SET status='DELETED',deleted_at=COALESCE(deleted_at,now()),updated_at=now() WHERE id=p_voice_id AND user_id=p_user_id;
  RETURN jsonb_build_object('voiceId',p_voice_id,'status','DELETED');
END; $$;

CREATE OR REPLACE FUNCTION rpc_account_delete_request(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_job_id uuid;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['api_rpc_role']);
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_user_id FOR UPDATE) THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  UPDATE users SET deleted_at=COALESCE(deleted_at,now()),updated_at=now() WHERE id=p_user_id;
  UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()),updated_at=now() WHERE user_id=p_user_id AND revoked_at IS NULL;
  UPDATE voice_profiles SET status='DELETING',updated_at=now() WHERE user_id=p_user_id AND deleted_at IS NULL;
  INSERT INTO jobs(user_id,type,status,dedupe_key,payload,max_attempts)
  VALUES(p_user_id,'DELETE_ACCOUNT','QUEUED','delete-account:'||p_user_id::text,jsonb_build_object('userId',p_user_id),10)
  ON CONFLICT(dedupe_key) DO UPDATE SET status='QUEUED',attempts=0,available_at=now(),leased_until=NULL,lease_owner=NULL,
    error_code='',error_message='',finished_at=NULL,updated_at=now()
  WHERE jobs.status IN('FAILED','SUCCEEDED','CANCELLED') RETURNING id INTO v_job_id;
  IF v_job_id IS NULL THEN SELECT id INTO v_job_id FROM jobs WHERE dedupe_key='delete-account:'||p_user_id::text; END IF;
  RETURN jsonb_build_object('userId',p_user_id,'status','DELETING','jobId',v_job_id);
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
  UPDATE voice_profiles SET status='DELETED',deleted_at=COALESCE(deleted_at,now()),updated_at=now() WHERE user_id=p_user_id;
  RETURN jsonb_build_object('userId',p_user_id,'status','DELETED');
END; $$;

CREATE OR REPLACE FUNCTION rpc_job_get_voice_input(p_job_id uuid,p_worker_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  SELECT jsonb_build_object(
    'jobId',j.id,'userId',j.user_id,'voiceId',v.id,'clipStartMs',v.clip_start_ms,'clipEndMs',v.clip_end_ms,
    'sourceMediaId',m.id,'sourceObjectKey',m.object_key,'sourceMimeType',m.mime_type,
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

CREATE OR REPLACE FUNCTION rpc_job_get_message_input(p_job_id uuid,p_worker_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  SELECT jsonb_build_object(
    'jobId',j.id,'userId',j.user_id,'voiceId',j.voice_profile_id,'messageId',m.id,
    'conversationId',m.conversation_id,'mode',m.mode,'inputText',m.input_text,
    'providerVoiceIdEncrypted',vm.provider_voice_id_encrypted,
    'history',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('mode',h.mode,'inputText',h.input_text,'outputText',h.output_text) ORDER BY h.created_at)
      FROM (SELECT h.* FROM messages h WHERE h.conversation_id=m.conversation_id AND h.status='READY'
            ORDER BY h.created_at DESC LIMIT 10) h
    ),'[]'::jsonb)
  ) INTO v_result
  FROM jobs j JOIN messages m ON m.id=j.message_id
  JOIN voice_models vm ON vm.voice_profile_id=m.voice_profile_id AND vm.status='READY'
  WHERE j.id=p_job_id AND j.type='GENERATE_MESSAGE' AND j.status='PROCESSING' AND j.lease_owner=p_worker_id;
  IF v_result IS NULL THEN RAISE EXCEPTION 'MESSAGE_JOB_INPUT_NOT_FOUND'; END IF;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION rpc_job_get_delete_manifest(p_job_id uuid,p_worker_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_job jobs%ROWTYPE; v_voice_ids uuid[]; v_result jsonb;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  SELECT * INTO v_job FROM jobs WHERE id=p_job_id AND type IN('DELETE_VOICE','DELETE_ACCOUNT')
    AND status='PROCESSING' AND lease_owner=p_worker_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'DELETE_JOB_NOT_FOUND'; END IF;
  IF v_job.type='DELETE_VOICE' THEN v_voice_ids:=ARRAY[v_job.voice_profile_id];
  ELSE SELECT COALESCE(array_agg(id),'{}'::uuid[]) INTO v_voice_ids FROM voice_profiles WHERE user_id=v_job.user_id; END IF;
  SELECT jsonb_build_object(
    'jobId',v_job.id,'type',v_job.type,'userId',v_job.user_id,'voiceId',v_job.voice_profile_id,
    'models',COALESCE((SELECT jsonb_agg(jsonb_build_object('voiceId',vm.voice_profile_id,
      'providerVoiceIdEncrypted',vm.provider_voice_id_encrypted,'status',vm.status)) FROM voice_models vm
      WHERE vm.voice_profile_id=ANY(v_voice_ids) AND vm.status<>'DELETED'),'[]'::jsonb),
    'assets',COALESCE((SELECT jsonb_agg(jsonb_build_object('mediaId',ma.id,'voiceId',ma.voice_profile_id,
      'objectKey',ma.object_key,'status',ma.status)) FROM media_assets ma
      WHERE ma.user_id=v_job.user_id AND ma.status<>'DELETED'
        AND (v_job.type='DELETE_ACCOUNT' OR ma.voice_profile_id=v_job.voice_profile_id)),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION rpc_job_acquire(p_worker_id text,p_job_id uuid DEFAULT NULL,p_lease_seconds integer DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_job jobs%ROWTYPE;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  IF NULLIF(p_worker_id,'') IS NULL OR p_lease_seconds<30 OR p_lease_seconds>900 THEN RAISE EXCEPTION 'INVALID_LEASE'; END IF;
  SELECT * INTO v_job FROM jobs WHERE status='QUEUED' AND available_at<=now() AND (p_job_id IS NULL OR id=p_job_id)
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE jobs SET status='PROCESSING',attempts=attempts+1,leased_until=now()+make_interval(secs=>p_lease_seconds),
    heartbeat_at=now(),lease_owner=p_worker_id,updated_at=now() WHERE id=v_job.id RETURNING * INTO v_job;
  RETURN jsonb_build_object('id',v_job.id,'userId',v_job.user_id,'voiceProfileId',v_job.voice_profile_id,'messageId',v_job.message_id,
    'type',v_job.type,'status',v_job.status,'attempts',v_job.attempts,'maxAttempts',v_job.max_attempts,'payload',v_job.payload,'leasedUntil',v_job.leased_until);
END; $$;

CREATE OR REPLACE FUNCTION rpc_job_heartbeat(p_job_id uuid,p_worker_id text,p_lease_seconds integer DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_until timestamptz;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  IF p_lease_seconds<30 OR p_lease_seconds>900 THEN RAISE EXCEPTION 'INVALID_LEASE'; END IF;
  UPDATE jobs SET leased_until=now()+make_interval(secs=>p_lease_seconds),heartbeat_at=now(),updated_at=now()
  WHERE id=p_job_id AND status='PROCESSING' AND lease_owner=p_worker_id AND leased_until>now() RETURNING leased_until INTO v_until;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_LEASE_NOT_OWNED'; END IF;
  RETURN jsonb_build_object('jobId',p_job_id,'leasedUntil',v_until);
END; $$;

CREATE OR REPLACE FUNCTION rpc_job_mark_succeeded(p_job_id uuid,p_worker_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  UPDATE jobs SET status='SUCCEEDED',leased_until=NULL,lease_owner=NULL,heartbeat_at=now(),error_code='',error_message='',finished_at=now(),updated_at=now()
  WHERE id=p_job_id AND status='PROCESSING' AND lease_owner=p_worker_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_LEASE_NOT_OWNED'; END IF;
  RETURN jsonb_build_object('jobId',p_job_id,'status','SUCCEEDED');
END; $$;

CREATE OR REPLACE FUNCTION rpc_job_mark_failed_or_retry(
  p_job_id uuid,p_worker_id text,p_error_code text,p_error_message text,p_retryable boolean DEFAULT true,p_retry_delay_seconds integer DEFAULT 10
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_job jobs%ROWTYPE; v_terminal boolean; v_status job_status;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  SELECT * INTO v_job FROM jobs WHERE id=p_job_id AND status='PROCESSING' AND lease_owner=p_worker_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_LEASE_NOT_OWNED'; END IF;
  v_terminal:=NOT p_retryable OR v_job.attempts>=v_job.max_attempts;
  v_status:=CASE WHEN v_terminal THEN 'FAILED'::job_status ELSE 'QUEUED'::job_status END;
  UPDATE jobs SET status=v_status,available_at=CASE WHEN v_terminal THEN available_at ELSE now()+make_interval(secs=>greatest(0,p_retry_delay_seconds)) END,
    leased_until=NULL,lease_owner=NULL,error_code=left(COALESCE(p_error_code,'JOB_FAILED'),100),error_message=left(COALESCE(p_error_message,''),1000),
    finished_at=CASE WHEN v_terminal THEN now() ELSE NULL END,updated_at=now() WHERE id=p_job_id;
  IF v_terminal AND v_job.type='PROCESS_VOICE' AND v_job.voice_profile_id IS NOT NULL THEN
    UPDATE voice_profiles SET status='FAILED',failure_code=left(COALESCE(p_error_code,'PROVIDER_FAILED'),100),
      failure_message=left(COALESCE(p_error_message,''),500),updated_at=now() WHERE id=v_job.voice_profile_id AND status IN('QUEUED','PROCESSING');
  END IF;
  IF v_terminal AND v_job.type='GENERATE_MESSAGE' AND v_job.message_id IS NOT NULL THEN
    UPDATE messages SET status='FAILED',error_code=left(COALESCE(p_error_code,'PROVIDER_FAILED'),100),
      error_message=left(COALESCE(p_error_message,''),500),updated_at=now() WHERE id=v_job.message_id AND status IN('PENDING','PROCESSING');
  END IF;
  RETURN jsonb_build_object('jobId',p_job_id,'status',v_status,'terminal',v_terminal,'attempts',v_job.attempts,'maxAttempts',v_job.max_attempts);
END; $$;

CREATE OR REPLACE FUNCTION rpc_job_requeue_stalled(p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count integer;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['worker_rpc_role']);
  WITH stalled AS (SELECT id FROM jobs WHERE status='PROCESSING' AND leased_until<now() ORDER BY leased_until FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,500)))
  UPDATE jobs j SET status='QUEUED',available_at=now(),leased_until=NULL,lease_owner=NULL,error_code='LEASE_EXPIRED',
    error_message='worker lease expired',updated_at=now() FROM stalled s WHERE j.id=s.id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('requeued',v_count);
END; $$;

REVOKE ALL ON FUNCTION _rpc_assert_caller(text[]) FROM PUBLIC;

DO $$
DECLARE v_fn record;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'rpc\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',v_fn.signature);
  END LOOP;
END; $$;

DO $$
DECLARE v_fn record; v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['service_role','api_rpc_role','worker_rpc_role'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',v_role);
      FOR v_fn IN
        SELECT p.oid::regprocedure AS signature
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname LIKE 'rpc\_%' ESCAPE '\'
      LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',v_fn.signature,v_role);
      END LOOP;
    END IF;
  END LOOP;
END; $$;
