# Acceptance Checklist

## Pure-cloud risk-first gates (2026-08-24)

- [ ] A real target-AppID client uses `wx.cloud.Cloud({ resourceAppid, resourceEnv }).callContainer` without a request-domain whitelist and reaches the NestJS API after environment sharing.
- [x] Existing session/API response contracts remain compatible after the private transport swap; automated tests cover the shared resource AppID bindings for both API and storage environments.
- [ ] An authorized 12-60 second video up to 100MB uploads from the real target mini-program via native CloudBase storage without the Run/gateway domain (the native SDK storage risk probe already passes).
- [ ] Worker can download that cloud file, upload audio output, and the mini-program can download/play it from a `cloud://` file ID.
- [ ] Job creation invokes the Worker immediately; a timer invocation recovers queued/stalled jobs with no resident API loop and no duplicate debit.
- [ ] WeChat Virtual Payment uses a CloudBase-managed callback domain, a real callback reaches the handler, and duplicate callback/query paths produce one `PURCHASE_GRANT` and one `+50`.
- [x] Remaining deterministic API/page migration stays deferred until every risk gate above has evidence.

- [x] Native mini-program P0-P9 compiles and has loading/empty/error/success states.
- [x] WeChat login exchanges code server-side; token expires/revokes; session key is not exposed (real AppID acceptance remains separate).
- [x] User cannot access another user's voices, messages, files or orders.
- [x] Dynamic consent is required and persisted before processing.
- [x] Video/clip constraints and quality errors are visible.
- [x] Aliyun voice registration and fixed preview work behind Provider Adapter.
- [x] First registration grants exactly 10 account points once; preview acceptance grants none.
- [x] Exact speech reads supplied text; chat uses only last 10 rounds.
- [x] Same voice permits only one active generation.
- [x] Failure never consumes points; each successful generation consumes exactly 1 account point.
- [x] Last successful result is visible/playable when points become zero; no automatic purchase popup.
- [x] Next active generation displays backend-configured ¥9.9/50 points purchase option and retains the draft.
- [x] Pay notification and active refresh cannot double-grant points.
- [x] Repeated purchase adds 50 to the existing account balance.
- [x] Deletion removes provider voice and private media with compensation status; a disposable real Aliyun voice was deleted and verified.
- [x] Frontend contains no server/payment/provider secrets or provider voice ID.
- [x] PostgreSQL-backed API and Worker full-flow evidence exists.
- [x] Real user sound acceptance and real-device UI acceptance remain clearly separate gates.
- [x]微信开发者工具连续主流程完成模拟登录、视频上传、片段、授权、真实阿里云试听、完整播放、接受、免费精确语音和零额度结果保留。
- [ ] All local runtimes start together and a simulated real user completes login, create voice, upload, clip, consent, processing, preview, free exact speech, zero-quota purchase prompt and post-payment continuation through page clicks.
- [ ] UI evidence includes stable screenshots plus console/network inspection; build or API-only evidence cannot substitute for the click flow.
- [x] OTHER and MINOR authorization are each page-clicked and show the matching server-canonical consent text.
- [x] A real AI chat round returns reply text and playable cloned-voice audio, consumes the configured point cost once, and a controlled failure consumes zero.
- [x] My Voices and Voice Settings are page-clicked; conversation clear and delete confirmation behavior are evidenced.
- [x] One newly created disposable Aliyun voice is deleted from provider, DB lifecycle and local private media with no reusable test asset left behind.
- [x] Service agreement, privacy policy and AI-generation disclosures are product-specific drafts; public launch remains subject to formal legal review.
