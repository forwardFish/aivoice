# TODO.md

Generated: 2026-08-23 09:17:38
Source: docs/auto-execute/latest/gap-list.json

## Execution Rules

Each Worker may execute only the first unfinished task.
After a task succeeds, change its checkbox to [x] and add modified files, commands, verification result, and evidence path.
If a task cannot be completed safely, add a '## BLOCKED' section with the reason and stop.
Do not use -ResetConvergence while resuming this run.

## Task List

- [ ] GAP-SEC-025-COVERAGE: P0/P1 PRD section '4. API or function restart must not lose point, payment or job state.' has no requirement/story coverage.
  - Type: requirement-section
  - Severity: IN_SCOPE_GAP
  - Repair target: Map this section into requirement-target.json and story-target.json.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-001: PRD section 'CloudBase Production Refactor Requirements' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-002: PRD section 'P0 Architecture' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-003: PRD section 'Production uses CloudBase Run API, CloudBase PostgreSQL REST/RPC, private CloudBase Storage and an on-demand Cloud Function Worker.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-004: PRD section 'Production must not start embedded PostgreSQL, a resident media Worker or persistent local media storage.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-005: PRD section 'The pre-refactor implementation must remain recoverable from a dedicated local and remote branch.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-006: PRD section 'P0 Database and points' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-007: PRD section 'New registration grants 10 account points exactly once.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-008: PRD section 'Successful exact-speech or chat generation consumes exactly one point; failures and blocks consume zero.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-009: PRD section 'Transactional operations use PostgreSQL RPC and roll back atomically.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-010: PRD section 'The 楼9.9/50-point product is server-configurable and order creation is idempotent.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-011: PRD section 'P0 WeChat Pay' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-012: PRD section 'JSAPI order creation and `wx.requestPayment` parameters retain merchant RSA signing.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-013: PRD section 'The callback uses the raw request body, WeChat Pay public-key/platform-certificate verification and APIv3 AES-GCM decryption.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-014: PRD section 'Callback and active order refresh converge on one payment RPC.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-015: PRD section 'Duplicate/concurrent payment success grants 50 points and one ledger exactly once.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-016: PRD section 'P0 Media and voice' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-017: PRD section 'Up to 100MB authorized video uploads directly to private storage with a signed URL and never traverses the Run request body.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-018: PRD section 'Worker downloads source video to temporary storage, runs FFmpeg, enrolls Aliyun CosyVoice and uploads reference/preview/generated audio.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-019: PRD section 'Private playback requires server authorization and a short-lived signed download URL.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-020: PRD section 'Provider voice identifiers are encrypted at rest.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-021: PRD section 'P0 Job and deletion lifecycle' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-022: PRD section 'API requests return without waiting for FFmpeg or model work.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-023: PRD section 'Durable jobs use leases, heartbeat, retry and duplicate-claim protection.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-024: PRD section 'Voice/account deletion removes the Aliyun provider voice and private storage objects before final database cleanup.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-025: PRD section 'API or function restart must not lose point, payment or job state.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-026: PRD section 'P1 Product surfaces' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-027: PRD section 'Existing mini-program login, creation, authorization, preview, workbench, purchase, voices, account, settings and legal pages retain their API contracts.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-028: PRD section 'SELF, OTHER and MINOR authorization types remain supported.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-029: PRD section 'Invitation rewards and a visual operations admin remain deferred.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-030: PRD section 'Acceptance evidence' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-CANDIDATES-NOT-NORMALIZED: Requirement candidates exist but requirement-target.json has no normalized requirements.
  - Type: requirement
  - Severity: HARD_FAIL
  - Repair target: Normalize requirement-candidates.json into requirement-target.json before implementation or final PASS.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-SEC-025-REQ-STORY-COVERAGE: P0/P1 PRD section SEC-025 has no requirement/story coverage.
  - Type: requirement
  - Severity: IN_SCOPE_GAP
  - Repair target: Map section '4. API or function restart must not lose point, payment or job state.' into requirement-target.json and story-target.json.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-STORY-PAYMENT-003-STORY-QUALITY-1: P0/P1 story STORY-PAYMENT-003 is missing required field sourceRequirements.
  - Type: story-quality
  - Severity: HARD_FAIL
  - Repair target: Populate sourceRequirements in story-target.json.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-STORY-PAYMENT-003-STORY-QUALITY-2: P0/P1 story STORY-PAYMENT-003 has neither surfaces nor apis.
  - Type: story-quality
  - Severity: HARD_FAIL
  - Repair target: Map the story to at least one UI surface/route or API endpoint.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-STORY-PAYMENT-003-STORY-QUALITY-3: P0/P1 story STORY-PAYMENT-003 has no route/api/e2e/visual test point.
  - Type: story-quality
  - Severity: HARD_FAIL
  - Repair target: Add at least one executable route, api, e2e, or visual test point.
  - Allowed files: api, e2e
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-STORY-PAYMENT-011-STORY-QUALITY-4: P0/P1 story STORY-PAYMENT-011 is missing required field sourceRequirements.
  - Type: story-quality
  - Severity: HARD_FAIL
  - Repair target: Populate sourceRequirements in story-target.json.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-STORY-PAYMENT-011-STORY-QUALITY-5: P0/P1 story STORY-PAYMENT-011 has neither surfaces nor apis.
  - Type: story-quality
  - Severity: HARD_FAIL
  - Repair target: Map the story to at least one UI surface/route or API endpoint.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-STORY-PAYMENT-011-STORY-QUALITY-6: P0/P1 story STORY-PAYMENT-011 has no route/api/e2e/visual test point.
  - Type: story-quality
  - Severity: HARD_FAIL
  - Repair target: Add at least one executable route, api, e2e, or visual test point.
  - Allowed files: api, e2e
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-STORY-PAYMENT-003-STATUS: P0/P1 story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION.
  - Type: story
  - Severity: IN_SCOPE_GAP
  - Repair target: Implement/repair STORY-PAYMENT-003 and attach truthful test-point evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-TP-STORY-PAYMENT-003-001-STATUS: Test point TP-STORY-PAYMENT-003-001 for story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION.
  - Type: story
  - Severity: IN_SCOPE_GAP
  - Repair target: Run or implement the test point and attach evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-TP-STORY-PAYMENT-003-001-EVIDENCE: Test point TP-STORY-PAYMENT-003-001 for P0/P1 story STORY-PAYMENT-003 has no evidence.
  - Type: story
  - Severity: HARD_FAIL
  - Repair target: Attach executable evidence for TP-STORY-PAYMENT-003-001.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-STORY-PAYMENT-011-STATUS: P0/P1 story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION.
  - Type: story
  - Severity: IN_SCOPE_GAP
  - Repair target: Implement/repair STORY-PAYMENT-011 and attach truthful test-point evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-TP-STORY-PAYMENT-011-001-STATUS: Test point TP-STORY-PAYMENT-011-001 for story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION.
  - Type: story
  - Severity: IN_SCOPE_GAP
  - Repair target: Run or implement the test point and attach evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-TP-STORY-PAYMENT-011-001-EVIDENCE: Test point TP-STORY-PAYMENT-011-001 for P0/P1 story STORY-PAYMENT-011 has no evidence.
  - Type: story
  - Severity: HARD_FAIL
  - Repair target: Attach executable evidence for TP-STORY-PAYMENT-011-001.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-CONTRACT-NOT-RECONCILED: Frontend API/data calls were discovered but no reconciled contracts are recorded.
  - Type: contract
  - Severity: IN_SCOPE_GAP
  - Repair target: Record frontend caller, backend endpoint, method, request body, response shape, auth/session, error/loading/empty states, and evidence in contract-map.json.
  - Allowed files: method, auth/session
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-UI-001: UI references exist but ui-target.json has no screens.
  - Type: ui
  - Severity: IN_SCOPE_GAP
  - Repair target: Map UI references to routes/screens in ui-target.json.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-001: PRD section 'CloudBase Production Refactor Requirements' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-002: PRD section 'P0 Architecture' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-003: PRD section 'Production uses CloudBase Run API, CloudBase PostgreSQL REST/RPC, private CloudBase Storage and an on-demand Cloud Function Worker.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-004: PRD section 'Production must not start embedded PostgreSQL, a resident media Worker or persistent local media storage.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-005: PRD section 'The pre-refactor implementation must remain recoverable from a dedicated local and remote branch.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-006: PRD section 'P0 Database and points' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-007: PRD section 'New registration grants 10 account points exactly once.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-008: PRD section 'Successful exact-speech or chat generation consumes exactly one point; failures and blocks consume zero.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-009: PRD section 'Transactional operations use PostgreSQL RPC and roll back atomically.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-010: PRD section 'The 楼9.9/50-point product is server-configurable and order creation is idempotent.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-011: PRD section 'P0 WeChat Pay' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-012: PRD section 'JSAPI order creation and `wx.requestPayment` parameters retain merchant RSA signing.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-013: PRD section 'The callback uses the raw request body, WeChat Pay public-key/platform-certificate verification and APIv3 AES-GCM decryption.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-014: PRD section 'Callback and active order refresh converge on one payment RPC.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-015: PRD section 'Duplicate/concurrent payment success grants 50 points and one ledger exactly once.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-016: PRD section 'P0 Media and voice' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-017: PRD section 'Up to 100MB authorized video uploads directly to private storage with a signed URL and never traverses the Run request body.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-018: PRD section 'Worker downloads source video to temporary storage, runs FFmpeg, enrolls Aliyun CosyVoice and uploads reference/preview/generated audio.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-019: PRD section 'Private playback requires server authorization and a short-lived signed download URL.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-020: PRD section 'Provider voice identifiers are encrypted at rest.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-021: PRD section 'P0 Job and deletion lifecycle' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-022: PRD section 'API requests return without waiting for FFmpeg or model work.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-023: PRD section 'Durable jobs use leases, heartbeat, retry and duplicate-claim protection.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-024: PRD section 'Voice/account deletion removes the Aliyun provider voice and private storage objects before final database cleanup.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-025: PRD section 'API or function restart must not lose point, payment or job state.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-026: PRD section 'P1 Product surfaces' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-027: PRD section 'Existing mini-program login, creation, authorization, preview, workbench, purchase, voices, account, settings and legal pages retain their API contracts.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-028: PRD section 'SELF, OTHER and MINOR authorization types remain supported.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-029: PRD section 'Invitation rewards and a visual operations admin remain deferred.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-COVERAGE-030: PRD section 'Acceptance evidence' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Type: requirement-coverage
  - Severity: IN_SCOPE_GAP
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-CANDIDATES-NOT-NORMALIZED: Requirement candidates exist but requirement-target.json has no normalized requirements.
  - Type: requirement
  - Severity: HARD_FAIL
  - Repair target: Normalize requirement-candidates.json into requirement-target.json before implementation or final PASS.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-STORY-PAYMENT-003-STORY-QUALITY-1: P0/P1 story STORY-PAYMENT-003 is missing required field sourceRequirements.
  - Type: story-quality
  - Severity: HARD_FAIL
  - Repair target: Populate sourceRequirements in story-target.json.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-STORY-PAYMENT-003-STORY-QUALITY-2: P0/P1 story STORY-PAYMENT-003 has neither surfaces nor apis.
  - Type: story-quality
  - Severity: HARD_FAIL
  - Repair target: Map the story to at least one UI surface/route or API endpoint.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-STORY-PAYMENT-003-STORY-QUALITY-3: P0/P1 story STORY-PAYMENT-003 has no route/api/e2e/visual test point.
  - Type: story-quality
  - Severity: HARD_FAIL
  - Repair target: Add at least one executable route, api, e2e, or visual test point.
  - Allowed files: api, e2e
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-STORY-PAYMENT-011-STORY-QUALITY-4: P0/P1 story STORY-PAYMENT-011 is missing required field sourceRequirements.
  - Type: story-quality
  - Severity: HARD_FAIL
  - Repair target: Populate sourceRequirements in story-target.json.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-STORY-PAYMENT-011-STORY-QUALITY-5: P0/P1 story STORY-PAYMENT-011 has neither surfaces nor apis.
  - Type: story-quality
  - Severity: HARD_FAIL
  - Repair target: Map the story to at least one UI surface/route or API endpoint.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-STORY-PAYMENT-011-STORY-QUALITY-6: P0/P1 story STORY-PAYMENT-011 has no route/api/e2e/visual test point.
  - Type: story-quality
  - Severity: HARD_FAIL
  - Repair target: Add at least one executable route, api, e2e, or visual test point.
  - Allowed files: api, e2e
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-STORY-PAYMENT-003-STATUS: P0/P1 story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION.
  - Type: story
  - Severity: IN_SCOPE_GAP
  - Repair target: Implement/repair STORY-PAYMENT-003 and attach truthful test-point evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-TP-STORY-PAYMENT-003-001-STATUS: Test point TP-STORY-PAYMENT-003-001 for story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION.
  - Type: story
  - Severity: IN_SCOPE_GAP
  - Repair target: Run or implement the test point and attach evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-TP-STORY-PAYMENT-003-001-EVIDENCE: Test point TP-STORY-PAYMENT-003-001 for P0/P1 story STORY-PAYMENT-003 has no evidence.
  - Type: story
  - Severity: HARD_FAIL
  - Repair target: Attach executable evidence for TP-STORY-PAYMENT-003-001.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-STORY-PAYMENT-011-STATUS: P0/P1 story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION.
  - Type: story
  - Severity: IN_SCOPE_GAP
  - Repair target: Implement/repair STORY-PAYMENT-011 and attach truthful test-point evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-TP-STORY-PAYMENT-011-001-STATUS: Test point TP-STORY-PAYMENT-011-001 for story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION.
  - Type: story
  - Severity: IN_SCOPE_GAP
  - Repair target: Run or implement the test point and attach evidence.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-TP-STORY-PAYMENT-011-001-EVIDENCE: Test point TP-STORY-PAYMENT-011-001 for P0/P1 story STORY-PAYMENT-011 has no evidence.
  - Type: story
  - Severity: HARD_FAIL
  - Repair target: Attach executable evidence for TP-STORY-PAYMENT-011-001.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-UI-001: UI references exist but ui-target.json has no screens.
  - Type: ui
  - Severity: IN_SCOPE_GAP
  - Repair target: Map UI references to routes/screens in ui-target.json.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-CONTRACT-NOT-RECONCILED: Frontend API/data calls were discovered but no reconciled contracts are recorded.
  - Type: contract
  - Severity: IN_SCOPE_GAP
  - Repair target: Record frontend caller, backend endpoint, method, request body, response shape, auth/session, error/loading/empty states, and evidence in contract-map.json.
  - Allowed files: method, auth/session
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-REQ-001: No normalized requirements are listed in requirement-target.json
  - Type: requirement
  - Severity: IN_SCOPE_GAP
  - Repair target: Normalize docs/auto-execute/requirement-candidates.json into requirement-target.json with P0/P1/P2 acceptance criteria, surfaces, and evidence expectations.
  - Allowed files: surfaces
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md

- [ ] GAP-UI-001: UI references exist but ui-target.json has no screens.
  - Type: ui
  - Severity: IN_SCOPE_GAP
  - Repair target: Map UI references to routes/screens in ui-target.json.
  - Allowed files: Implementation, tests, and evidence files directly related to this gap.
  - Required verification: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode gate -MaxRounds 5
  - Evidence: docs/auto-execute/latest/verification-results.md


## Repair Plan Snapshot

~~~markdown
# Repair Plan

Generated: 08/23/2026 09:17:35

Agent must edit implementation, tests, or evidence for these gaps before the next convergence run.

## GAP-SEC-025-COVERAGE

- Type: requirement-section
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: P0/P1 PRD section '4. API or function restart must not lose point, payment or job state.' has no requirement/story coverage.
- Repair target: Map this section into requirement-target.json and story-target.json.

## GAP-REQ-COVERAGE-001

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'CloudBase Production Refactor Requirements' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-002

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'P0 Architecture' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-003

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Production uses CloudBase Run API, CloudBase PostgreSQL REST/RPC, private CloudBase Storage and an on-demand Cloud Function Worker.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-004

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Production must not start embedded PostgreSQL, a resident media Worker or persistent local media storage.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-005

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'The pre-refactor implementation must remain recoverable from a dedicated local and remote branch.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-006

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'P0 Database and points' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-007

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'New registration grants 10 account points exactly once.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-008

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Successful exact-speech or chat generation consumes exactly one point; failures and blocks consume zero.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-009

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Transactional operations use PostgreSQL RPC and roll back atomically.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-010

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'The 楼9.9/50-point product is server-configurable and order creation is idempotent.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-011

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'P0 WeChat Pay' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-012

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'JSAPI order creation and `wx.requestPayment` parameters retain merchant RSA signing.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-013

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'The callback uses the raw request body, WeChat Pay public-key/platform-certificate verification and APIv3 AES-GCM decryption.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-014

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Callback and active order refresh converge on one payment RPC.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-015

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Duplicate/concurrent payment success grants 50 points and one ledger exactly once.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-016

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'P0 Media and voice' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-017

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Up to 100MB authorized video uploads directly to private storage with a signed URL and never traverses the Run request body.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-018

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Worker downloads source video to temporary storage, runs FFmpeg, enrolls Aliyun CosyVoice and uploads reference/preview/generated audio.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-019

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Private playback requires server authorization and a short-lived signed download URL.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-020

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Provider voice identifiers are encrypted at rest.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-021

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'P0 Job and deletion lifecycle' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-022

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'API requests return without waiting for FFmpeg or model work.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-023

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Durable jobs use leases, heartbeat, retry and duplicate-claim protection.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-024

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Voice/account deletion removes the Aliyun provider voice and private storage objects before final database cleanup.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-025

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'API or function restart must not lose point, payment or job state.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-026

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'P1 Product surfaces' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-027

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Existing mini-program login, creation, authorization, preview, workbench, purchase, voices, account, settings and legal pages retain their API contracts.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-028

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'SELF, OTHER and MINOR authorization types remain supported.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-029

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Invitation rewards and a visual operations admin remain deferred.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-030

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Acceptance evidence' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-CANDIDATES-NOT-NORMALIZED

- Type: requirement
- Severity: HARD_FAIL
- Source: docs\auto-execute\requirement-candidates.json
- Problem: Requirement candidates exist but requirement-target.json has no normalized requirements.
- Repair target: Normalize requirement-candidates.json into requirement-target.json before implementation or final PASS.

## GAP-SEC-025-REQ-STORY-COVERAGE

- Type: requirement
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: P0/P1 PRD section SEC-025 has no requirement/story coverage.
- Repair target: Map section '4. API or function restart must not lose point, payment or job state.' into requirement-target.json and story-target.json.

## GAP-STORY-PAYMENT-003-STORY-QUALITY-1

- Type: story-quality
- Severity: HARD_FAIL
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: P0/P1 story STORY-PAYMENT-003 is missing required field sourceRequirements.
- Repair target: Populate sourceRequirements in story-target.json.

## GAP-STORY-PAYMENT-003-STORY-QUALITY-2

- Type: story-quality
- Severity: HARD_FAIL
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: P0/P1 story STORY-PAYMENT-003 has neither surfaces nor apis.
- Repair target: Map the story to at least one UI surface/route or API endpoint.

## GAP-STORY-PAYMENT-003-STORY-QUALITY-3

- Type: story-quality
- Severity: HARD_FAIL
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: P0/P1 story STORY-PAYMENT-003 has no route/api/e2e/visual test point.
- Repair target: Add at least one executable route, api, e2e, or visual test point.

## GAP-STORY-PAYMENT-011-STORY-QUALITY-4

- Type: story-quality
- Severity: HARD_FAIL
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: P0/P1 story STORY-PAYMENT-011 is missing required field sourceRequirements.
- Repair target: Populate sourceRequirements in story-target.json.

## GAP-STORY-PAYMENT-011-STORY-QUALITY-5

- Type: story-quality
- Severity: HARD_FAIL
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: P0/P1 story STORY-PAYMENT-011 has neither surfaces nor apis.
- Repair target: Map the story to at least one UI surface/route or API endpoint.

## GAP-STORY-PAYMENT-011-STORY-QUALITY-6

- Type: story-quality
- Severity: HARD_FAIL
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: P0/P1 story STORY-PAYMENT-011 has no route/api/e2e/visual test point.
- Repair target: Add at least one executable route, api, e2e, or visual test point.

## GAP-STORY-PAYMENT-003-STATUS

- Type: story
- Severity: IN_SCOPE_GAP
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: P0/P1 story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION.
- Repair target: Implement/repair STORY-PAYMENT-003 and attach truthful test-point evidence.

## GAP-TP-STORY-PAYMENT-003-001-STATUS

- Type: story
- Severity: IN_SCOPE_GAP
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: Test point TP-STORY-PAYMENT-003-001 for story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION.
- Repair target: Run or implement the test point and attach evidence.

## GAP-TP-STORY-PAYMENT-003-001-EVIDENCE

- Type: story
- Severity: HARD_FAIL
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: Test point TP-STORY-PAYMENT-003-001 for P0/P1 story STORY-PAYMENT-003 has no evidence.
- Repair target: Attach executable evidence for TP-STORY-PAYMENT-003-001.

## GAP-STORY-PAYMENT-011-STATUS

- Type: story
- Severity: IN_SCOPE_GAP
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: P0/P1 story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION.
- Repair target: Implement/repair STORY-PAYMENT-011 and attach truthful test-point evidence.

## GAP-TP-STORY-PAYMENT-011-001-STATUS

- Type: story
- Severity: IN_SCOPE_GAP
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: Test point TP-STORY-PAYMENT-011-001 for story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION.
- Repair target: Run or implement the test point and attach evidence.

## GAP-TP-STORY-PAYMENT-011-001-EVIDENCE

- Type: story
- Severity: HARD_FAIL
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: Test point TP-STORY-PAYMENT-011-001 for P0/P1 story STORY-PAYMENT-011 has no evidence.
- Repair target: Attach executable evidence for TP-STORY-PAYMENT-011-001.

## GAP-CONTRACT-NOT-RECONCILED

- Type: contract
- Severity: IN_SCOPE_GAP
- Source: docs\auto-execute\contract-map.json
- Problem: Frontend API/data calls were discovered but no reconciled contracts are recorded.
- Repair target: Record frontend caller, backend endpoint, method, request body, response shape, auth/session, error/loading/empty states, and evidence in contract-map.json.

## GAP-UI-001

- Type: ui
- Severity: IN_SCOPE_GAP
- Source: docs\auto-execute\ui-target.json
- Problem: UI references exist but ui-target.json has no screens.
- Repair target: Map UI references to routes/screens in ui-target.json.

## GAP-REQ-COVERAGE-001

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'CloudBase Production Refactor Requirements' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-002

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'P0 Architecture' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-003

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Production uses CloudBase Run API, CloudBase PostgreSQL REST/RPC, private CloudBase Storage and an on-demand Cloud Function Worker.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-004

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Production must not start embedded PostgreSQL, a resident media Worker or persistent local media storage.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-005

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'The pre-refactor implementation must remain recoverable from a dedicated local and remote branch.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-006

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'P0 Database and points' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-007

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'New registration grants 10 account points exactly once.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-008

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Successful exact-speech or chat generation consumes exactly one point; failures and blocks consume zero.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-009

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Transactional operations use PostgreSQL RPC and roll back atomically.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-010

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'The 楼9.9/50-point product is server-configurable and order creation is idempotent.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-011

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'P0 WeChat Pay' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-012

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'JSAPI order creation and `wx.requestPayment` parameters retain merchant RSA signing.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-013

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'The callback uses the raw request body, WeChat Pay public-key/platform-certificate verification and APIv3 AES-GCM decryption.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-014

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Callback and active order refresh converge on one payment RPC.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-015

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Duplicate/concurrent payment success grants 50 points and one ledger exactly once.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-016

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'P0 Media and voice' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-017

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Up to 100MB authorized video uploads directly to private storage with a signed URL and never traverses the Run request body.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-018

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Worker downloads source video to temporary storage, runs FFmpeg, enrolls Aliyun CosyVoice and uploads reference/preview/generated audio.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-019

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Private playback requires server authorization and a short-lived signed download URL.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-020

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Provider voice identifiers are encrypted at rest.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-021

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'P0 Job and deletion lifecycle' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-022

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'API requests return without waiting for FFmpeg or model work.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-023

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Durable jobs use leases, heartbeat, retry and duplicate-claim protection.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-024

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Voice/account deletion removes the Aliyun provider voice and private storage objects before final database cleanup.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-025

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'API or function restart must not lose point, payment or job state.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-026

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'P1 Product surfaces' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-027

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Existing mini-program login, creation, authorization, preview, workbench, purchase, voices, account, settings and legal pages retain their API contracts.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-028

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'SELF, OTHER and MINOR authorization types remain supported.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-029

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Invitation rewards and a visual operations admin remain deferred.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-COVERAGE-030

- Type: requirement-coverage
- Severity: IN_SCOPE_GAP
- Source: docs\cloudbase-production-refactor-requirements.md
- Problem: PRD section 'Acceptance evidence' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
- Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.

## GAP-REQ-CANDIDATES-NOT-NORMALIZED

- Type: requirement
- Severity: HARD_FAIL
- Source: docs\auto-execute\requirement-candidates.json
- Problem: Requirement candidates exist but requirement-target.json has no normalized requirements.
- Repair target: Normalize requirement-candidates.json into requirement-target.json before implementation or final PASS.

## GAP-STORY-PAYMENT-003-STORY-QUALITY-1

- Type: story-quality
- Severity: HARD_FAIL
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: P0/P1 story STORY-PAYMENT-003 is missing required field sourceRequirements.
- Repair target: Populate sourceRequirements in story-target.json.

## GAP-STORY-PAYMENT-003-STORY-QUALITY-2

- Type: story-quality
- Severity: HARD_FAIL
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: P0/P1 story STORY-PAYMENT-003 has neither surfaces nor apis.
- Repair target: Map the story to at least one UI surface/route or API endpoint.

## GAP-STORY-PAYMENT-003-STORY-QUALITY-3

- Type: story-quality
- Severity: HARD_FAIL
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: P0/P1 story STORY-PAYMENT-003 has no route/api/e2e/visual test point.
- Repair target: Add at least one executable route, api, e2e, or visual test point.

## GAP-STORY-PAYMENT-011-STORY-QUALITY-4

- Type: story-quality
- Severity: HARD_FAIL
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: P0/P1 story STORY-PAYMENT-011 is missing required field sourceRequirements.
- Repair target: Populate sourceRequirements in story-target.json.

## GAP-STORY-PAYMENT-011-STORY-QUALITY-5

- Type: story-quality
- Severity: HARD_FAIL
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: P0/P1 story STORY-PAYMENT-011 has neither surfaces nor apis.
- Repair target: Map the story to at least one UI surface/route or API endpoint.

## GAP-STORY-PAYMENT-011-STORY-QUALITY-6

- Type: story-quality
- Severity: HARD_FAIL
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: P0/P1 story STORY-PAYMENT-011 has no route/api/e2e/visual test point.
- Repair target: Add at least one executable route, api, e2e, or visual test point.

## GAP-STORY-PAYMENT-003-STATUS

- Type: story
- Severity: IN_SCOPE_GAP
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: P0/P1 story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION.
- Repair target: Implement/repair STORY-PAYMENT-003 and attach truthful test-point evidence.

## GAP-TP-STORY-PAYMENT-003-001-STATUS

- Type: story
- Severity: IN_SCOPE_GAP
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: Test point TP-STORY-PAYMENT-003-001 for story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION.
- Repair target: Run or implement the test point and attach evidence.

## GAP-TP-STORY-PAYMENT-003-001-EVIDENCE

- Type: story
- Severity: HARD_FAIL
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: Test point TP-STORY-PAYMENT-003-001 for P0/P1 story STORY-PAYMENT-003 has no evidence.
- Repair target: Attach executable evidence for TP-STORY-PAYMENT-003-001.

## GAP-STORY-PAYMENT-011-STATUS

- Type: story
- Severity: IN_SCOPE_GAP
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: P0/P1 story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION.
- Repair target: Implement/repair STORY-PAYMENT-011 and attach truthful test-point evidence.

## GAP-TP-STORY-PAYMENT-011-001-STATUS

- Type: story
- Severity: IN_SCOPE_GAP
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: Test point TP-STORY-PAYMENT-011-001 for story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION.
- Repair target: Run or implement the test point and attach evidence.

## GAP-TP-STORY-PAYMENT-011-001-EVIDENCE

- Type: story
- Severity: HARD_FAIL
- Source: docs\auto-execute\story-candidates-curated.json
- Problem: Test point TP-STORY-PAYMENT-011-001 for P0/P1 story STORY-PAYMENT-011 has no evidence.
- Repair target: Attach executable evidence for TP-STORY-PAYMENT-011-001.

## GAP-UI-001

- Type: ui
- Severity: IN_SCOPE_GAP
- Source: docs\auto-execute\ui-target.json
- Problem: UI references exist but ui-target.json has no screens.
- Repair target: Map UI references to routes/screens in ui-target.json.

## GAP-CONTRACT-NOT-RECONCILED

- Type: contract
- Severity: IN_SCOPE_GAP
- Source: docs\auto-execute\contract-map.json
- Problem: Frontend API/data calls were discovered but no reconciled contracts are recorded.
- Repair target: Record frontend caller, backend endpoint, method, request body, response shape, auth/session, error/loading/empty states, and evidence in contract-map.json.

## GAP-REQ-001

- Type: requirement
- Severity: IN_SCOPE_GAP
- Source: docs\auto-execute\requirement-candidates.json
- Problem: No normalized requirements are listed in requirement-target.json
- Repair target: Normalize docs/auto-execute/requirement-candidates.json into requirement-target.json with P0/P1/P2 acceptance criteria, surfaces, and evidence expectations.

## GAP-UI-001

- Type: ui
- Severity: IN_SCOPE_GAP
- Source: docs\auto-execute\ui-target.json
- Problem: UI references exist but ui-target.json has no screens.
- Repair target: Map UI references to routes/screens in ui-target.json.
~~~

## Next Agent Action Snapshot

~~~markdown
# Next Agent Action

Generated: 08/23/2026 09:17:35

Do not run convergence again before making code, test, or evidence changes.

## Repair These Gaps First

- GAP-SEC-025-COVERAGE: P0/P1 PRD section '4. API or function restart must not lose point, payment or job state.' has no requirement/story coverage.
  - Repair target: Map this section into requirement-target.json and story-target.json.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-001: PRD section 'CloudBase Production Refactor Requirements' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-002: PRD section 'P0 Architecture' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-003: PRD section 'Production uses CloudBase Run API, CloudBase PostgreSQL REST/RPC, private CloudBase Storage and an on-demand Cloud Function Worker.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-004: PRD section 'Production must not start embedded PostgreSQL, a resident media Worker or persistent local media storage.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-005: PRD section 'The pre-refactor implementation must remain recoverable from a dedicated local and remote branch.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-006: PRD section 'P0 Database and points' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-007: PRD section 'New registration grants 10 account points exactly once.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-008: PRD section 'Successful exact-speech or chat generation consumes exactly one point; failures and blocks consume zero.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-009: PRD section 'Transactional operations use PostgreSQL RPC and roll back atomically.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-010: PRD section 'The 楼9.9/50-point product is server-configurable and order creation is idempotent.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-011: PRD section 'P0 WeChat Pay' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-012: PRD section 'JSAPI order creation and `wx.requestPayment` parameters retain merchant RSA signing.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-013: PRD section 'The callback uses the raw request body, WeChat Pay public-key/platform-certificate verification and APIv3 AES-GCM decryption.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-014: PRD section 'Callback and active order refresh converge on one payment RPC.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-015: PRD section 'Duplicate/concurrent payment success grants 50 points and one ledger exactly once.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-016: PRD section 'P0 Media and voice' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-017: PRD section 'Up to 100MB authorized video uploads directly to private storage with a signed URL and never traverses the Run request body.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-018: PRD section 'Worker downloads source video to temporary storage, runs FFmpeg, enrolls Aliyun CosyVoice and uploads reference/preview/generated audio.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-019: PRD section 'Private playback requires server authorization and a short-lived signed download URL.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-020: PRD section 'Provider voice identifiers are encrypted at rest.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-021: PRD section 'P0 Job and deletion lifecycle' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-022: PRD section 'API requests return without waiting for FFmpeg or model work.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-023: PRD section 'Durable jobs use leases, heartbeat, retry and duplicate-claim protection.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-024: PRD section 'Voice/account deletion removes the Aliyun provider voice and private storage objects before final database cleanup.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-025: PRD section 'API or function restart must not lose point, payment or job state.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-026: PRD section 'P1 Product surfaces' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-027: PRD section 'Existing mini-program login, creation, authorization, preview, workbench, purchase, voices, account, settings and legal pages retain their API contracts.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-028: PRD section 'SELF, OTHER and MINOR authorization types remain supported.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-029: PRD section 'Invitation rewards and a visual operations admin remain deferred.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-030: PRD section 'Acceptance evidence' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-CANDIDATES-NOT-NORMALIZED: Requirement candidates exist but requirement-target.json has no normalized requirements.
  - Repair target: Normalize requirement-candidates.json into requirement-target.json before implementation or final PASS.
  - Source: docs\auto-execute\requirement-candidates.json
- GAP-SEC-025-REQ-STORY-COVERAGE: P0/P1 PRD section SEC-025 has no requirement/story coverage.
  - Repair target: Map section '4. API or function restart must not lose point, payment or job state.' into requirement-target.json and story-target.json.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-STORY-PAYMENT-003-STORY-QUALITY-1: P0/P1 story STORY-PAYMENT-003 is missing required field sourceRequirements.
  - Repair target: Populate sourceRequirements in story-target.json.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-STORY-PAYMENT-003-STORY-QUALITY-2: P0/P1 story STORY-PAYMENT-003 has neither surfaces nor apis.
  - Repair target: Map the story to at least one UI surface/route or API endpoint.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-STORY-PAYMENT-003-STORY-QUALITY-3: P0/P1 story STORY-PAYMENT-003 has no route/api/e2e/visual test point.
  - Repair target: Add at least one executable route, api, e2e, or visual test point.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-STORY-PAYMENT-011-STORY-QUALITY-4: P0/P1 story STORY-PAYMENT-011 is missing required field sourceRequirements.
  - Repair target: Populate sourceRequirements in story-target.json.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-STORY-PAYMENT-011-STORY-QUALITY-5: P0/P1 story STORY-PAYMENT-011 has neither surfaces nor apis.
  - Repair target: Map the story to at least one UI surface/route or API endpoint.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-STORY-PAYMENT-011-STORY-QUALITY-6: P0/P1 story STORY-PAYMENT-011 has no route/api/e2e/visual test point.
  - Repair target: Add at least one executable route, api, e2e, or visual test point.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-STORY-PAYMENT-003-STATUS: P0/P1 story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION.
  - Repair target: Implement/repair STORY-PAYMENT-003 and attach truthful test-point evidence.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-TP-STORY-PAYMENT-003-001-STATUS: Test point TP-STORY-PAYMENT-003-001 for story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION.
  - Repair target: Run or implement the test point and attach evidence.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-TP-STORY-PAYMENT-003-001-EVIDENCE: Test point TP-STORY-PAYMENT-003-001 for P0/P1 story STORY-PAYMENT-003 has no evidence.
  - Repair target: Attach executable evidence for TP-STORY-PAYMENT-003-001.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-STORY-PAYMENT-011-STATUS: P0/P1 story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION.
  - Repair target: Implement/repair STORY-PAYMENT-011 and attach truthful test-point evidence.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-TP-STORY-PAYMENT-011-001-STATUS: Test point TP-STORY-PAYMENT-011-001 for story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION.
  - Repair target: Run or implement the test point and attach evidence.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-TP-STORY-PAYMENT-011-001-EVIDENCE: Test point TP-STORY-PAYMENT-011-001 for P0/P1 story STORY-PAYMENT-011 has no evidence.
  - Repair target: Attach executable evidence for TP-STORY-PAYMENT-011-001.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-CONTRACT-NOT-RECONCILED: Frontend API/data calls were discovered but no reconciled contracts are recorded.
  - Repair target: Record frontend caller, backend endpoint, method, request body, response shape, auth/session, error/loading/empty states, and evidence in contract-map.json.
  - Source: docs\auto-execute\contract-map.json
- GAP-UI-001: UI references exist but ui-target.json has no screens.
  - Repair target: Map UI references to routes/screens in ui-target.json.
  - Source: docs\auto-execute\ui-target.json
- GAP-REQ-COVERAGE-001: PRD section 'CloudBase Production Refactor Requirements' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-002: PRD section 'P0 Architecture' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-003: PRD section 'Production uses CloudBase Run API, CloudBase PostgreSQL REST/RPC, private CloudBase Storage and an on-demand Cloud Function Worker.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-004: PRD section 'Production must not start embedded PostgreSQL, a resident media Worker or persistent local media storage.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-005: PRD section 'The pre-refactor implementation must remain recoverable from a dedicated local and remote branch.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-006: PRD section 'P0 Database and points' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-007: PRD section 'New registration grants 10 account points exactly once.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-008: PRD section 'Successful exact-speech or chat generation consumes exactly one point; failures and blocks consume zero.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-009: PRD section 'Transactional operations use PostgreSQL RPC and roll back atomically.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-010: PRD section 'The 楼9.9/50-point product is server-configurable and order creation is idempotent.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-011: PRD section 'P0 WeChat Pay' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-012: PRD section 'JSAPI order creation and `wx.requestPayment` parameters retain merchant RSA signing.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-013: PRD section 'The callback uses the raw request body, WeChat Pay public-key/platform-certificate verification and APIv3 AES-GCM decryption.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-014: PRD section 'Callback and active order refresh converge on one payment RPC.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-015: PRD section 'Duplicate/concurrent payment success grants 50 points and one ledger exactly once.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-016: PRD section 'P0 Media and voice' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-017: PRD section 'Up to 100MB authorized video uploads directly to private storage with a signed URL and never traverses the Run request body.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-018: PRD section 'Worker downloads source video to temporary storage, runs FFmpeg, enrolls Aliyun CosyVoice and uploads reference/preview/generated audio.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-019: PRD section 'Private playback requires server authorization and a short-lived signed download URL.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-020: PRD section 'Provider voice identifiers are encrypted at rest.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-021: PRD section 'P0 Job and deletion lifecycle' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-022: PRD section 'API requests return without waiting for FFmpeg or model work.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-023: PRD section 'Durable jobs use leases, heartbeat, retry and duplicate-claim protection.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-024: PRD section 'Voice/account deletion removes the Aliyun provider voice and private storage objects before final database cleanup.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-025: PRD section 'API or function restart must not lose point, payment or job state.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-026: PRD section 'P1 Product surfaces' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-027: PRD section 'Existing mini-program login, creation, authorization, preview, workbench, purchase, voices, account, settings and legal pages retain their API contracts.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-028: PRD section 'SELF, OTHER and MINOR authorization types remain supported.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-029: PRD section 'Invitation rewards and a visual operations admin remain deferred.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-COVERAGE-030: PRD section 'Acceptance evidence' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.
  - Repair target: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
  - Source: docs\cloudbase-production-refactor-requirements.md
- GAP-REQ-CANDIDATES-NOT-NORMALIZED: Requirement candidates exist but requirement-target.json has no normalized requirements.
  - Repair target: Normalize requirement-candidates.json into requirement-target.json before implementation or final PASS.
  - Source: docs\auto-execute\requirement-candidates.json
- GAP-STORY-PAYMENT-003-STORY-QUALITY-1: P0/P1 story STORY-PAYMENT-003 is missing required field sourceRequirements.
  - Repair target: Populate sourceRequirements in story-target.json.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-STORY-PAYMENT-003-STORY-QUALITY-2: P0/P1 story STORY-PAYMENT-003 has neither surfaces nor apis.
  - Repair target: Map the story to at least one UI surface/route or API endpoint.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-STORY-PAYMENT-003-STORY-QUALITY-3: P0/P1 story STORY-PAYMENT-003 has no route/api/e2e/visual test point.
  - Repair target: Add at least one executable route, api, e2e, or visual test point.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-STORY-PAYMENT-011-STORY-QUALITY-4: P0/P1 story STORY-PAYMENT-011 is missing required field sourceRequirements.
  - Repair target: Populate sourceRequirements in story-target.json.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-STORY-PAYMENT-011-STORY-QUALITY-5: P0/P1 story STORY-PAYMENT-011 has neither surfaces nor apis.
  - Repair target: Map the story to at least one UI surface/route or API endpoint.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-STORY-PAYMENT-011-STORY-QUALITY-6: P0/P1 story STORY-PAYMENT-011 has no route/api/e2e/visual test point.
  - Repair target: Add at least one executable route, api, e2e, or visual test point.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-STORY-PAYMENT-003-STATUS: P0/P1 story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION.
  - Repair target: Implement/repair STORY-PAYMENT-003 and attach truthful test-point evidence.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-TP-STORY-PAYMENT-003-001-STATUS: Test point TP-STORY-PAYMENT-003-001 for story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION.
  - Repair target: Run or implement the test point and attach evidence.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-TP-STORY-PAYMENT-003-001-EVIDENCE: Test point TP-STORY-PAYMENT-003-001 for P0/P1 story STORY-PAYMENT-003 has no evidence.
  - Repair target: Attach executable evidence for TP-STORY-PAYMENT-003-001.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-STORY-PAYMENT-011-STATUS: P0/P1 story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION.
  - Repair target: Implement/repair STORY-PAYMENT-011 and attach truthful test-point evidence.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-TP-STORY-PAYMENT-011-001-STATUS: Test point TP-STORY-PAYMENT-011-001 for story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION.
  - Repair target: Run or implement the test point and attach evidence.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-TP-STORY-PAYMENT-011-001-EVIDENCE: Test point TP-STORY-PAYMENT-011-001 for P0/P1 story STORY-PAYMENT-011 has no evidence.
  - Repair target: Attach executable evidence for TP-STORY-PAYMENT-011-001.
  - Source: docs\auto-execute\story-candidates-curated.json
- GAP-UI-001: UI references exist but ui-target.json has no screens.
  - Repair target: Map UI references to routes/screens in ui-target.json.
  - Source: docs\auto-execute\ui-target.json
- GAP-CONTRACT-NOT-RECONCILED: Frontend API/data calls were discovered but no reconciled contracts are recorded.
  - Repair target: Record frontend caller, backend endpoint, method, request body, response shape, auth/session, error/loading/empty states, and evidence in contract-map.json.
  - Source: docs\auto-execute\contract-map.json
- GAP-REQ-001: No normalized requirements are listed in requirement-target.json
  - Repair target: Normalize docs/auto-execute/requirement-candidates.json into requirement-target.json with P0/P1/P2 acceptance criteria, surfaces, and evidence expectations.
  - Source: docs\auto-execute\requirement-candidates.json
- GAP-UI-001: UI references exist but ui-target.json has no screens.
  - Repair target: Map UI references to routes/screens in ui-target.json.
  - Source: docs\auto-execute\ui-target.json

## Allowed Work

- Modify implementation files required to close the listed gaps.
- Modify or add tests that prove the intended PRD/UI behavior.
- Capture or attach truthful evidence such as logs, screenshots, API results, or visual diffs.
- Update requirement-target.json or ui-target.json only when it reflects actual implementation and evidence.

## Required Rerun

After repairs, run:

~~~powershell
powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -Mode full -MaxRounds 5
~~~

## Prohibited

- Do not delete or weaken valid tests to force a pass.
- Do not fabricate screenshots, logs, visual diffs, or evidence.
- Do not mark requirements or UI screens PASS unless the evidence exists.
- Do not rerun convergence repeatedly without changing implementation, tests, or evidence.
~~~
