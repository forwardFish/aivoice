# Story Map

Generated: 08/23/2026 09:17:11

| Story ID | Epic | Sprint | Priority | Actor | Goal | Source requirements | Surfaces | APIs | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| STORY-GENERAL-001 | EPIC-CORE | SPRINT-LATER | P2 | user | 1. Production uses CloudBase Run API, CloudBase PostgreSQL REST/RPC, private CloudBase Storage and an on-demand Cloud Function Worker. |  |  |  | PENDING |  |
| STORY-GENERAL-002 | EPIC-CORE | SPRINT-LATER | P2 | user | 4. The 楼9.9/50-point product is server-configurable and order creation is idempotent. |  |  |  | PENDING |  |
| STORY-PAYMENT-003 | EPIC-CORE | SPRINT-P0 | P0 | user | ## P0 WeChat Pay |  |  |  | PENDING |  |
| STORY-PAYMENT-004 | EPIC-CORE | SPRINT-LATER | P2 | user | 1. JSAPI order creation and `wx.requestPayment` parameters retain merchant RSA signing. |  |  |  | PENDING |  |
| STORY-PAYMENT-005 | EPIC-CORE | SPRINT-LATER | P2 | user | 2. The callback uses the raw request body, WeChat Pay public-key/platform-certificate verification and APIv3 AES-GCM decryption. |  |  |  | PENDING |  |
| STORY-PAYMENT-006 | EPIC-CORE | SPRINT-LATER | P2 | user | 3. Callback and active order refresh converge on one payment RPC. |  |  |  | PENDING |  |
| STORY-PAYMENT-007 | EPIC-CORE | SPRINT-LATER | P2 | user | 4. Duplicate/concurrent payment success grants 50 points and one ledger exactly once. |  |  |  | PENDING |  |
| STORY-UPLOAD-008 | EPIC-CORE | SPRINT-LATER | P2 | user | 1. Up to 100MB authorized video uploads directly to private storage with a signed URL and never traverses the Run request body. |  |  |  | PENDING |  |
| STORY-UPLOAD-009 | EPIC-CORE | SPRINT-LATER | P2 | user | 2. Worker downloads source video to temporary storage, runs FFmpeg, enrolls Aliyun CosyVoice and uploads reference/preview/generated audio. |  |  |  | PENDING |  |
| STORY-GENERAL-010 | EPIC-CORE | SPRINT-LATER | P2 | user | 3. Voice/account deletion removes the Aliyun provider voice and private storage objects before final database cleanup. |  |  |  | PENDING |  |
| STORY-PAYMENT-011 | EPIC-CORE | SPRINT-P0 | P0 | user | 4. API or function restart must not lose point, payment or job state. |  |  |  | PENDING |  |
| STORY-AUTH-012 | EPIC-CORE | SPRINT-LATER | P2 | user | 2. SELF, OTHER and MINOR authorization types remain supported. |  |  |  | PENDING |  |
| STORY-GENERAL-013 | EPIC-CORE | SPRINT-LATER | P2 | user | `docs/auto-execute/results/cloudbase-runtime-smoke.json` |  |  |  | PENDING |  |
| STORY-PAYMENT-014 | EPIC-CORE | SPRINT-LATER | P2 | user | `docs/auto-execute/results/cloudbase-payment-rpc-smoke.json` |  |  |  | PENDING |  |
| STORY-GENERAL-015 | EPIC-CORE | SPRINT-LATER | P2 | user | `docs/auto-execute/results/cloudbase-full-flow.json` |  |  |  | PENDING |  |
| STORY-GENERAL-016 | EPIC-CORE | SPRINT-LATER | P2 | user | `docs/auto-execute/results/cloudbase-deployment.json` |  |  |  | PENDING |  |
| STORY-AUTH-017 | EPIC-CORE | SPRINT-LATER | P2 | user | Real WeChat login, the merchant public key and public-key ID, a real merchant charge/callback, mini-program domain allowlists, real-device testing and WeChat review require user/platform action and prevent a pure launch PASS. |  |  |  | PENDING |  |
