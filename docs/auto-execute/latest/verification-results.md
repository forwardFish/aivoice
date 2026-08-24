# Verification Results


## init-harness
- Time: 2026-08-21 12:24:42
- Status: PASS
- Details: Harness initialized
- Evidence:

## pure-cloud-live-deployment
- Time: 2026-08-24
- Status: PASS
- Details: API Event function, Worker, payment Event function and PostgreSQL REST/RPC migrations are active.
- Evidence: `../results/pure-cloud-deployment-live.json`

## target-app-authentication
- Time: 2026-08-24
- Status: PASS
- Details: Real target AppID login, server session, `/me`, 10-point registration ledger and duplicate-grant prevention pass.
- Evidence: `../results/shared-auth-live.json`

## main-product-flow
- Time: 2026-08-24
- Status: PASS
- Details: Authorized video upload, native storage, Worker, speaker checks, Aliyun voice enrollment, preview, exact speech, cloud playback and one-point charge pass.
- Evidence: `../results/pure-cloud-main-flow-live.json`

## aliyun-model-calls
- Time: 2026-08-24
- Status: PASS
- Details: Three sequential CosyVoice calls plus two Qwen chat-to-CosyVoice calls all reached READY with playable WAV outputs.
- Evidence: `../results/aliyun-cosyvoice-batch-live.json`, `../results/aliyun-chat-cosyvoice-live.json`

## virtual-payment
- Time: 2026-08-24
- Status: PASS_WITH_MANUAL_REVIEW_REQUIRED
- Details: POINTS_50 order creation, requestVirtualPayment parameters, signature, AES callback GET/POST and callback route pass. Android sandbox confirmation remains manual.
- Evidence: `../results/virtual-payment-sandbox-config.json`, `../results/pure-cloud-deployment-live.json`

## final-automated-regression
- Time: 2026-08-24
- Status: PASS
- Details: Runtime 4/4, mini-program 25/25, API 27/27 plus two environment-gated skips, Worker 22/22 plus two environment-gated skips. Exact external-secret scan: 0 matches in 619 files.
- Evidence: current run console output
