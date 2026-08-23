# CloudBase Production Refactor Requirements

## P0 Architecture

1. Production uses CloudBase Run API, CloudBase PostgreSQL REST/RPC, private CloudBase Storage and an on-demand Cloud Function Worker.
2. Production must not start embedded PostgreSQL, a resident media Worker or persistent local media storage.
3. The pre-refactor implementation must remain recoverable from a dedicated local and remote branch.

## P0 Database and points

1. New registration grants 10 account points exactly once.
2. Successful exact-speech or chat generation consumes exactly one point; failures and blocks consume zero.
3. Transactional operations use PostgreSQL RPC and roll back atomically.
4. The ¥9.9/50-point product is server-configurable and order creation is idempotent.

## P0 WeChat Pay

1. JSAPI order creation and `wx.requestPayment` parameters retain merchant RSA signing.
2. The callback uses the raw request body, WeChat Pay public-key/platform-certificate verification and APIv3 AES-GCM decryption.
3. Callback and active order refresh converge on one payment RPC.
4. Duplicate/concurrent payment success grants 50 points and one ledger exactly once.

## P0 Media and voice

1. Up to 100MB authorized video uploads directly to private storage with a signed URL and never traverses the Run request body.
2. Worker downloads source video to temporary storage, runs FFmpeg, enrolls Aliyun CosyVoice and uploads reference/preview/generated audio.
3. Private playback requires server authorization and a short-lived signed download URL.
4. Provider voice identifiers are encrypted at rest.

## P0 Job and deletion lifecycle

1. API requests return without waiting for FFmpeg or model work.
2. Durable jobs use leases, heartbeat, retry and duplicate-claim protection.
3. Voice/account deletion removes the Aliyun provider voice and private storage objects before final database cleanup.
4. API or function restart must not lose point, payment or job state.

## P1 Product surfaces

1. Existing mini-program login, creation, authorization, preview, workbench, purchase, voices, account, settings and legal pages retain their API contracts.
2. SELF, OTHER and MINOR authorization types remain supported.
3. Invitation rewards and a visual operations admin remain deferred.

## Acceptance evidence

- `docs/auto-execute/results/cloudbase-runtime-smoke.json`
- `docs/auto-execute/results/cloudbase-payment-rpc-smoke.json`
- `docs/auto-execute/results/cloudbase-full-flow.json`
- `docs/auto-execute/results/cloudbase-deployment.json`
- `npm run typecheck`
- `npm run test:workspace`

## External launch gates

Real WeChat login, the merchant public key and public-key ID, a real merchant charge/callback, mini-program domain allowlists, real-device testing and WeChat review require user/platform action and prevent a pure launch PASS.
