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
| AV-011 | UI closure | Frontend builder + Designer | Add purchase page and close reference-structure gaps | `apps/miniprogram/` | AV-009 | typecheck, screenshots, visual review | IN_PROGRESS |
| AV-012 | Functional closure | Backend/test lanes | Verify login boundary, three consent types, chat, deletion and purchase trigger | API/Worker/mini-program tests | AV-011 | integration and E2E evidence | PENDING |
| AV-013 | Visual evidence | Tester + Codex | Capture stable DevTools screens and compare all required UI references | `docs/auto-execute/screenshots/` | AV-011 | UI verifier | PENDING |
| AV-014 | Final convergence | Reviewer + Codex | Run guards, contract, report integrity, comparison and final gate | full repo | AV-011..AV-013 | final gate | PENDING |
| AV-015 | Points contract | Architect + Codex | Replace voice-scoped quota contract with one account points balance, configurable values and reserved invitation source | contracts/docs | AV-001 | contract review | PASS |
| AV-016 | Points backend | Backend builder | Add account/ledger migration, registration grant, success debit and purchase fulfillment | API/PostgreSQL | AV-015 | transaction/idempotency/integration tests | IN_PROGRESS |
| AV-017 | Points worker | Worker builder | Debit account points in the successful output transaction only | Worker | AV-015, AV-016 | worker integration tests | IN_PROGRESS |
| AV-018 | Points frontend | Frontend builder | Replace per-voice quota UI with server-authoritative account points and 50-point purchase | mini-program | AV-015 | typecheck/unit/UI flow | IN_PROGRESS |
| AV-019 | Points acceptance | Codex + verifier | Prove register 5 -> successful debit -> zero/failure -> purchase +50 -> repurchase/continue | full local stack | AV-016..AV-018 | DB/API/page evidence | PENDING |
