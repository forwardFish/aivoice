# Task Decomposition

| ID | Owner | Task | Paths | Verification |
|---|---|---|---|---|
| CORE-001 | stable-core worker | implement stable types, policy, sanitizer, fingerprint, strict request and pinned route | `apps/worker/src/stable-voice.ts`; core tests | targeted tests + typecheck |
| INT-001 | integration worker | integrate runtime profile and stable plan into both job runners/provider/coordinator | Worker runtime/provider files | Worker tests + build |
| TXT-001 | orchestrator | add minimal speech-expressibility contract without new model field/call | chat prompt compiler + tests | prompt tests |
| QA-001 | tester | five-turn contract and offline audio pack | Worker tests + `scripts/acceptance/` | manifest/readback |
| REV-001 | reviewer | independent diff/spec review | read-only | review report |
| GATE-001 | orchestrator | full workspace tests, guards and final evidence | run folder | final report |
