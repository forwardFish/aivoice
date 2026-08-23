# CloudBase Refactor Acceptance Report

Date: 2026-08-23

## Verdict

`PASS_WITH_LIMITATION`

The CloudBase refactor goal is satisfied for implementation and live technical deployment. It is not a pure launch `PASS` because real WeChat identity/payment and platform review require external credentials and user action.

## Implemented

- CloudBase Run API at 0.25 CPU / 0.5GB, min 1, max 2.
- CloudBase PostgreSQL REST plus 33 transactional RPC functions.
- Private source/audio storage with signed direct upload and signed playback.
- On-demand Node.js 20 Worker function with bundled Linux FFmpeg copied to `/tmp`.
- Durable job leases, retry/recovery, CosyVoice cloning, exact speech, AI chat and deletion.
- Registration +10, success-only -1, ¥9.9/50 product, order idempotency and payment grant-once.
- Pre-refactor recovery branch and remote main baseline at `423ab2a`.

## Evidence

- `docs/auto-execute/results/cloudbase-runtime-smoke.json`
- `docs/auto-execute/results/cloudbase-payment-rpc-smoke.json`
- `docs/auto-execute/results/cloudbase-full-flow.json`
- `docs/auto-execute/results/cloudbase-deployment.json`
- `npm run typecheck`
- `npm run test:workspace`

## Why Not Pure PASS?

- `WECHAT_PAY_PUBLIC_KEY_ID` and `WECHAT_PAY_PUBLIC_KEY` are missing.
- No real merchant charge/callback has been performed.
- A fresh real `wx.login` code and full page-click flow on the deployed backend still require the authorized mini-program account.
- Domain allowlists, iOS/Android device acceptance and WeChat review remain external.
- CloudBase API Key is an administrator-grade server credential; API/Worker role separation should be adopted if CloudBase later supports scoped service roles.
