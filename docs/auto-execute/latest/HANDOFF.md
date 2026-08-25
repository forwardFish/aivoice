# Pure Cloud Risk-First Handoff

Updated: 2026-08-24
Run ID: `aivoice-pure-cloud-risk-20260824`

## Goal

Prove every architecture risk that could make the no-ICP migration unusable before migrating deterministic pages and APIs.

## Repository state

- Baseline and rollback: `67f92ac`
- Local `main`: `67f92ac`
- Backup: `codex/aivoice-pre-pure-cloud-20260824`
- Active branch/worktree: `codex/aivoice-pure-cloud-risk-first` at `D:\lyh\agent\agent-frame\aivoice-pure-cloud-risk-first`
- Do not reset the original dirty worktree at `D:\lyh\agent\agent-frame\aivoice`.

## Implemented

- Mini-program transport supports `wx.cloud.callContainer` while retaining the existing NestJS/Run API contract.
- Environment sharing is now implemented with per-environment `wx.cloud.Cloud({ resourceAppid, resourceEnv })` clients so API, native upload and audio download use the same resource-side identity.
- The target AppID now has 47 permissions on shared standard environment `aiassistant-0517-d6en8tw82f2f7fc`. PostgreSQL remains server-only in `aivoice-d1g94bgoh67c6b974`.
- Platform HTTP Function OpenID headers are supported as an optional identity path; normal code2Session remains compatible.
- Native CloudBase storage supports cloud file IDs for upload, metadata, temporary access, download, playback and delete.
- Mixed legacy/native objects are supported. Existing PG media is lazily copied to native storage on first playback and atomically switched in `media_assets`.
- Worker uploads store returned cloud file IDs and mixed-key delete/download paths remain compatible.
- Worker dispatch now uses real async `Invoke + InvocationType=Event`; the old code incorrectly used synchronous `InvokeFunction`.
- Virtual goods payments use official `wx.requestVirtualPayment` payload/signatures, `/xpay/query_order`, amount verification, atomic `+50`, and `/xpay/notify_provide_goods`.
- Fresh `wx.login` code is exchanged server-side for `session_key`; the key is used only for HMAC and is never returned.
- Lost virtual-payment success callbacks retain a recoverable pending order and active query path.
- Virtual-payment secrets are read from the external `D:\lyh\secrets\aivoice\virtual-pay.env` file; OfferID is the default virtual merchant identifier, so a second merchant-id value is optional.
- The owner-provided sandbox AppKey is now present in that external file. A non-disclosing probe confirmed a 32-character key and a valid 64-hex-character HMAC-SHA256 signature.

## Evidence

- `npm run typecheck`: PASS.
- Mini-program tests: 32 PASS after integration into `main`.
- Full `npm run test:workspace`: PASS after the environment-sharing client change.
- `docs/auto-execute/results/shared-environment-init.json`: PASS from the real target AppID; shared environment init, native upload, `cloud://` return and cleanup all succeeded.
- `docs/auto-execute/results/shared-environment-deployment-dry-run.json`: PASS; database stays in the PostgreSQL environment while API, Worker, payment events and native storage target the shared standard environment. No cloud revision was published.
- `docs/auto-execute/results/credential-rotation-predeploy.json`: new CloudBase, Tencent Cloud, WeChat and Bailian credentials pass; one provider ID was transactionally re-encrypted; repository secret scan is clean. Old parallel CloudBase/Tencent/Bailian keys remain active only until new revisions pass.
- API tests: 31 PASS, 2 environment-gated skips after integration into `main`.
- Virtual-payment event-function deployment dry-run: PASS; managed callback, generated Token and 43-character EncodingAESKey are valid without publishing any cloud resource.
- `docs/auto-execute/results/virtual-payment-sandbox-config.json`: PASS; `POINTS_50` exists in the development catalog at CNY 9.90 and is ready for sandbox testing. It remains intentionally unpublished to production.
- Runtime tests: 4 PASS.
- Worker tests: 27 PASS, 2 environment-gated skips after integration into `main`.
- `docs/auto-execute/results/real-virtual-payment-live.json`: PASS for a real CNY 9.90 `POINTS_50` purchase; `requestPayment:ok`, one `PAID` order, exactly one `PURCHASE_GRANT +50` ledger and client/server balance 1 to 51.
- `docs/auto-execute/results/pure-cloud-native-storage.json`: PASS for a real 29.5MB authorized video; upload 3317ms, first ranged access 392ms, download 5911ms, SHA-256 match, delete confirmed.
- `docs/auto-execute/results/pure-cloud-async-dispatch.json`: PASS_WITH_LIMITATION; async queue accepted in about 300ms and a synchronous no-op probe confirmed the handler is callable, but async event tracking is not exposed.
- `docs/auto-execute/results/pure-cloud-performance-baseline.json`: current public Run baseline P50 46ms/P95 201ms.
- `docs/auto-execute/results/pure-cloud-container-sdk-probe.json`: private SDK callContainer returns HTTP 200; P50 226ms/P95 290ms from local Node, not a real-device measurement.

## Active blockers / not yet PASS

1. API Event function, Worker, payment Event function and PostgreSQL RPC migrations are deployed and verified in the shared environment.
2. Real target-AppID login, registration grant, native upload, Worker, Aliyun clone, preview, exact speech, cloud audio download and one-point deduction pass.
3. Real Android virtual payment, callback fulfillment and the 50-point grant pass. iOS real-device acceptance is still outstanding.
4. WeChat category qualification and version review remain external launch gates.
5. Preserved old CloudBase, Tencent Cloud and Bailian keys remain pending revocation after final confirmation.

## Next action

Deploy the integrated `main`, complete WeChat category and version review, run iOS real-device acceptance, then revoke preserved old credentials.
