# Aivoice Full-stack Handoff

Updated: 2026-08-21 18:45 +08:00

## Goal and current verdict

Deliver PRD v0.4 as a native WeChat mini-program with server-authoritative voice authorization, cloning, preview, trial/paid quotas, chat/exact speech and WeChat Pay.

Current verdict: `PASS_WITH_LIMITATION / NOT_RELEASE_READY`.

The integrated local MVP and its primary free-generation flow are real and verified. A public release still requires formal AppID/login, production storage/deployment, real payment/device acceptance, legal content and AI file metadata marking.

## Repository

- Root: `D:\lyh\agent\agent-frame\aivoice`
- Remote: `https://github.com/forwardFish/aivoice`
- Branch: `codex/aivoice-fullstack`
- Remote main baseline: `4071b54 Initial commit`
- No commit or push has been performed.
- Unrelated files were not reset or removed.

## Frontend delivery and integration

- External worker: user-specified ChatGPT Pro conversation.
- Delivered ZIP: `C:\Users\linyanhui\Downloads\nashide-ta-miniprogram-frontend-v0.4.zip`.
- SHA-256: `F5038CA338FA3495857D860C245B9B6A25642A6A56E179439A47761DD3131B52`.
- ZIP inspection: 103 entries; no path traversal, `.env`, secret, `node_modules`, build output or private key material.
- Integrated source: `apps/miniprogram/`.
- Frontend architecture: native WeChat mini-program, TypeScript, WXML/WXSS and native tabBar.
- Codex repaired API drift: `OTHER` permission, server canonical consent version/text, authenticated server upload, preview-played proof, READY/unaccepted mapping, conversation shaping, message/order normalization and local development configuration.

## Implemented backend

- NestJS API, Node Worker, PostgreSQL/Drizzle and shared contracts.
- Hashed expiring sessions; real WeChat code2Session boundary; development mock is forbidden in production.
- User/voice/media/consent/model/conversation/message/order/quota/job authority in PostgreSQL.
- Private signed playback, cross-user ownership checks and source-video deletion.
- Trial and paid quota buckets, serializable transactions, ledgers and idempotency.
- Fixed `VOICE_QUOTA_10`: 990 fen, 10 successful outputs, no auto-renew.
- WeChat Pay v3 prepay, signing, notification verification, freshness, query and one-time quota grant.
- PostgreSQL job lease, heartbeat, expired-lease recovery and terminal/nonterminal error separation.
- Aliyun Voice Enrollment and CosyVoice v3.5 Flash, provider ID encryption, SSRF-restricted provider URLs and trusted Aliyun HTTP-to-HTTPS upgrade.
- Formal reference quality inspection: duration, effective speech, silence, dBFS and clipping; recommendation warnings plus minimum hard failures persisted in `quality_report`.
- Rejected, unpersisted reference WAVs are immediately deleted.
- Content-safety rules run before queueing and on model output.

## Verification

- Migrations: `0000` through `0005` generated and applied.
- `npm run typecheck`: PASS, including native mini-program.
- `scripts/local/run-backend-gates.ps1`: PASS.
- Mini-program contract/business tests: 5 PASS, including zero-quota purchase trigger and draft preservation.
- API tests with real isolated PostgreSQL: 6 PASS, 0 skipped.
- Worker tests: 9 PASS.
- Python prototype tests: 9 PASS.
- Production dependency audit: 0 vulnerabilities.
- Code review: no unresolved finding after reference-file cleanup repair.
- Architecture review: `CLEAR` for the implemented single-host MVP boundary.
- Test DB isolation: gates use `aivoice_test`; a known `aivoice` development voice remained `READY` after the full gate.
- Repeated paid purchases are additive: after one paid generation leaves 9, a second purchase produces 19 and a second purchase ledger rather than overwriting balance.

## Continuous live main-flow acceptance

Evidence: `.runtime/ui-evidence/main-flow/progress.json` (ignored private runtime evidence).

One continuous WeChat DevTools run passed 12 recorded stages:

1. Login page.
2. Local-only mock login and empty home.
3. Authorized 12-second video selected.
4. Real `wx.uploadFile` and server FFprobe validation.
5. Clip page with 0-12 second valid selection.
6. Clip saved.
7. SELF profile and canonical consent submitted.
8. Real Aliyun enrollment and 5.81-second preview produced.
9. Preview played completely and server timing proof accepted.
10. Preview accepted; account trial granted once.
11. Workbench opened.
12. Exact text `请照顾好自己，我们都很想你。` produced a playable 4.29-second audio; quota moved from 1 to 0 while the result remained visible.

WeChat DevTools tourist mode intermittently timed out after successful upload/profile navigation. The harness used `reLaunch` only when upload/session or submitted profile authority had already been confirmed and recorded that recovery as an explicit limitation. It did not bypass API work or fabricate DB state.

## Local database safety

- Development/acceptance DB: `aivoice`.
- Automated integration-test DB: `aivoice_test`.
- Both may share the project-local PostgreSQL cluster, but destructive test truncation is restricted to `aivoice_test`.
- Production DB is not configured or touched.

## Remaining release gates

1. Register/verify the official enterprise mini-program and replace `touristappid`.
2. Configure production AppID/AppSecret and run real WeChat login acceptance.
3. Implement `OssMediaStorage` and stop using local filesystem media in public production.
4. Add production Dockerfiles/Compose, Nginx HTTPS, secrets, backups, logs and deployment runbook.
5. Configure an ICP-filed HTTPS API domain and WeChat request/upload legal domains.
6. Add final privacy policy, service agreement, customer-service and refund content.
7. Implement/verify AI-generated audio file metadata implicit marking in addition to visible UI labels.
8. Run real WeChat payment, callback, delayed-query and post-payment continuation on a test merchant order.
9. Run real-device iOS/Android media, audio interruption and safe-area acceptance.
10. Capture durable final UI screenshots; desktop automation screenshot capture was interrupted/unsupported even though semantic page evidence passed.
11. Run live delete-voice/account provider and storage cleanup acceptance.
12. Commit and push only after the user explicitly authorizes publication.

## Safe next action

If continuing product development before cloud credentials exist, implement a storage adapter with Local and OSS implementations plus production container artifacts. Do not create cloud resources, deploy, migrate production, or publish Git changes without current user authorization.
