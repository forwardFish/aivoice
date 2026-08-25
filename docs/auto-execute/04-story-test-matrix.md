# Story Test Matrix

Generated: 08/23/2026 09:17:11

| Test point ID | Story ID | Type | Target | Expected | Evidence | Status |
|---|---|---|---|---|---|---|
| TP-STORY-GENERAL-001-001 | STORY-GENERAL-001 | functional | 1. Production uses CloudBase Run API, CloudBase PostgreSQL REST/RPC, private CloudBase Storage and an on-demand Cloud Function Worker. | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
| TP-STORY-GENERAL-002-001 | STORY-GENERAL-002 | functional | 4. The 楼9.9/50-point product is server-configurable and order creation is idempotent. | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
| TP-STORY-PAYMENT-003-001 | STORY-PAYMENT-003 | functional | ## P0 WeChat Pay | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
| TP-STORY-PAYMENT-004-001 | STORY-PAYMENT-004 | functional | 1. JSAPI order creation and `wx.requestPayment` parameters retain merchant RSA signing. | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
| TP-STORY-PAYMENT-005-001 | STORY-PAYMENT-005 | functional | 2. The callback uses the raw request body, WeChat Pay public-key/platform-certificate verification and APIv3 AES-GCM decryption. | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
| TP-STORY-PAYMENT-006-001 | STORY-PAYMENT-006 | functional | 3. Callback and active order refresh converge on one payment RPC. | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
| TP-STORY-PAYMENT-007-001 | STORY-PAYMENT-007 | functional | 4. Duplicate/concurrent payment success grants 50 points and one ledger exactly once. | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
| TP-STORY-UPLOAD-008-001 | STORY-UPLOAD-008 | functional | 1. Up to 100MB authorized video uploads directly to private storage with a signed URL and never traverses the Run request body. | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
| TP-STORY-UPLOAD-009-001 | STORY-UPLOAD-009 | functional | 2. Worker downloads source video to temporary storage, runs FFmpeg, enrolls Aliyun CosyVoice and uploads reference/preview/generated audio. | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
| TP-STORY-GENERAL-010-001 | STORY-GENERAL-010 | functional | 3. Voice/account deletion removes the Aliyun provider voice and private storage objects before final database cleanup. | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
| TP-STORY-PAYMENT-011-001 | STORY-PAYMENT-011 | functional | 4. API or function restart must not lose point, payment or job state. | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
| TP-STORY-AUTH-012-001 | STORY-AUTH-012 | functional | 2. SELF, OTHER and MINOR authorization types remain supported. | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
| TP-STORY-GENERAL-013-001 | STORY-GENERAL-013 | functional | `docs/auto-execute/results/cloudbase-runtime-smoke.json` | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
| TP-STORY-PAYMENT-014-001 | STORY-PAYMENT-014 | functional | `docs/auto-execute/results/cloudbase-payment-rpc-smoke.json` | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
| TP-STORY-GENERAL-015-001 | STORY-GENERAL-015 | functional | `docs/auto-execute/results/cloudbase-full-flow.json` | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
| TP-STORY-GENERAL-016-001 | STORY-GENERAL-016 | functional | `docs/auto-execute/results/cloudbase-deployment.json` | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
| TP-STORY-AUTH-017-001 | STORY-AUTH-017 | functional | Real WeChat login, the merchant public key and public-key ID, a real merchant charge/callback, mini-program domain allowlists, real-device testing and WeChat review require user/platform action and prevent a pure launch PASS. | acceptance criterion is proven by test/log/screenshot/API evidence |  | PENDING |
