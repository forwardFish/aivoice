# Task Decomposition

| ID | Lane | Owner | Task | Target | Depends on | Verification | Status |
|---|---|---|---|---|---|---|---|
| AV-001 | Control | Codex | Freeze requirements, architecture, API and DB contracts | `docs/auto-execute/` | none | report integrity | PASS |
| AV-002 | Frontend | ChatGPT Pro + Codex | Implement and integrate native WeChat mini-program P0-P9 | `apps/miniprogram/` ZIP | AV-001 | static checks, DevTools, contract tests | PASS |
| AV-003 | Backend | Codex | Scaffold NestJS API, Drizzle and shared contracts | `apps/api/`, `packages/contracts/` | AV-001 | build/unit | PASS |
| AV-004 | Auth | Codex | Port and harden code2Session/session auth | API auth module | AV-003 | auth integration tests | PASS_WITH_LIMITATION |
| AV-005 | Voice | Codex | Productize media/consent/voice enrollment/preview | API + Worker voice modules | AV-003 | provider, API and live Aliyun tests | PASS |
| AV-006 | Quota | Codex | Implement trial/paid buckets and transactional ledger | Drizzle + quota service | AV-003 | concurrency/idempotency tests | PASS |
| AV-007 | Payment | Codex | Port Pay v3 and fixed 990-fen order/grant | payment/order modules | AV-004, AV-006 | crypto and callback tests | PASS_WITH_LIMITATION |
| AV-008 | Workbench | Codex | Implement messages, exact speech, job status and success debit | API + Worker | AV-005, AV-006 | full-flow tests | PASS |
| AV-009 | Integration | Codex | Inspect ChatGPT Pro ZIP and align frontend contracts | full repo | AV-002..AV-008 | contract/build/live main flow | PASS |
| AV-010 | Acceptance | Codex + user | Run UI, device, sound, payment and final gates | evidence pack | AV-009 | final gate | PASS_WITH_LIMITATION |
