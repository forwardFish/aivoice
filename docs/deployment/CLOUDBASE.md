# CloudBase production deployment

Updated: 2026-08-23

## Live layout

- PostgreSQL/Storage/Function environment: `aivoice-d1g94bgoh67c6b974`.
- CloudBase Run environment: `aivoice-run-d9gu3ee7n56f21869`.
- Public API service: `aivoice-api`.
- Public HTTPS origin: `https://aivoice-api-301049-8-1434074357.sh.run.tcloudbase.com`.
- Payment callback: `https://aivoice-api-301049-8-1434074357.sh.run.tcloudbase.com/v1/payments/wechat/notify`.
- Event Worker: `aivoice-worker`, Node.js 20, 900 seconds, 2048MB.

The production runtime no longer starts embedded PostgreSQL, FFmpeg or a resident Worker in Cloud Run. The API image is stateless. `DATABASE_URL`, `USE_EMBEDDED_POSTGRES` and `MEDIA_LOCAL_ROOT` are deliberately absent from the live service.

## Runtime authority

- Simple reads and narrow writes use CloudBase PostgreSQL REST.
- Transactions, state machines, point grants/consumes, order fulfillment, job leases and deletion use the 33 functions in `apps/api/cloudbase/0007_cloudbase_runtime_rpc.sql`.
- Source videos upload directly to private `aivoice-source` storage with a signed PUT URL; API request bodies never carry the 100MB video.
- Preview/generated/reference audio lives in private `aivoice-audio` storage.
- The Run API creates durable jobs and immediately returns to the mini-program. A background dispatcher invokes the on-demand function; PostgreSQL leases deduplicate multiple API replicas and retries.
- The function copies bundled Linux FFmpeg to `/tmp`, calls Aliyun CosyVoice/DashScope, uploads outputs and commits final state through RPC.

## Live Run sizing

```text
CPU=0.25
MEM=0.5GB
MIN_INSTANCES=1
MAX_INSTANCES=2
DATABASE_BACKEND=cloudbase
```

One minimum API instance is intentional because WeChat Pay callbacks must remain reachable. Media processing is not resident in that instance.

## Provision and deploy

```powershell
node scripts/deploy/provision-cloudbase-runtime.mjs
node scripts/deploy/cloudbase-worker-function.mjs
node scripts/deploy/cloudbase-combined.mjs
```

Runtime API keys and provider/payment secrets are stored under `D:\lyh\secrets\aivoice\` or CloudBase environment variables. They are never committed.

## Verified evidence

- REST + storage smoke: `docs/auto-execute/results/cloudbase-runtime-smoke.json`.
- Concurrent/idempotent payment RPC: `docs/auto-execute/results/cloudbase-payment-rpc-smoke.json`.
- Real source upload, voice enrollment, preview, exact speech, AI chat, point debit and provider/storage deletion: `docs/auto-execute/results/cloudbase-full-flow.json`.
- The public `/v1/health` endpoint returns 200 on the current deployment.

## Remaining external launch gates

- Download the merchant's current WeChat Pay public key and configure `WECHAT_PAY_PUBLIC_KEY` plus `WECHAT_PAY_PUBLIC_KEY_ID`.
- Complete one real mini-program login with a fresh `wx.login` code.
- Complete one real ¥0.01/¥9.90 merchant payment and replay its callback.
- Add the API/storage domains to the mini-program request/upload/download allowlists.
- Complete real-device and WeChat review acceptance.
