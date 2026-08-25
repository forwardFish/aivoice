# Auto Execute Handoff

GeneratedAt: 2026-08-23 09:17:40
Reason: REPAIR_REQUIRED after convergence round 1

## Current Run

- RunId: ae-20260821122442-c8791f92
- ProjectRoot: D:\lyh\agent\agent-frame\aivoice
- Convergence round: 1
- Final verdict: REPAIR_REQUIRED
- Allow continue repair: True
- Prohibit ResetConvergence on resume: True

## Current State Files

- handoff: docs/auto-execute/latest/HANDOFF.md
- run-id: docs/auto-execute/latest/run-id.txt
- machine-summary: docs/auto-execute/latest/machine-summary.json
- gap-list: docs/auto-execute/latest/gap-list.json
- repair-plan: docs/auto-execute/latest/repair-plan.md
- next-agent-action: docs/auto-execute/latest/next-agent-action.md
- verification-results: docs/auto-execute/latest/verification-results.md
- blockers: docs/auto-execute/latest/blockers.md

## Open HARD_FAIL / IN_SCOPE_GAP

- GAP-SEC-025-COVERAGE [IN_SCOPE_GAP] P0/P1 PRD section '4. API or function restart must not lose point, payment or job state.' has no requirement/story coverage. Repair: Map this section into requirement-target.json and story-target.json.
- GAP-REQ-COVERAGE-001 [IN_SCOPE_GAP] PRD section 'CloudBase Production Refactor Requirements' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-002 [IN_SCOPE_GAP] PRD section 'P0 Architecture' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-003 [IN_SCOPE_GAP] PRD section 'Production uses CloudBase Run API, CloudBase PostgreSQL REST/RPC, private CloudBase Storage and an on-demand Cloud Function Worker.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-004 [IN_SCOPE_GAP] PRD section 'Production must not start embedded PostgreSQL, a resident media Worker or persistent local media storage.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-005 [IN_SCOPE_GAP] PRD section 'The pre-refactor implementation must remain recoverable from a dedicated local and remote branch.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-006 [IN_SCOPE_GAP] PRD section 'P0 Database and points' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-007 [IN_SCOPE_GAP] PRD section 'New registration grants 10 account points exactly once.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-008 [IN_SCOPE_GAP] PRD section 'Successful exact-speech or chat generation consumes exactly one point; failures and blocks consume zero.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-009 [IN_SCOPE_GAP] PRD section 'Transactional operations use PostgreSQL RPC and roll back atomically.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-010 [IN_SCOPE_GAP] PRD section 'The 楼9.9/50-point product is server-configurable and order creation is idempotent.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-011 [IN_SCOPE_GAP] PRD section 'P0 WeChat Pay' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-012 [IN_SCOPE_GAP] PRD section 'JSAPI order creation and `wx.requestPayment` parameters retain merchant RSA signing.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-013 [IN_SCOPE_GAP] PRD section 'The callback uses the raw request body, WeChat Pay public-key/platform-certificate verification and APIv3 AES-GCM decryption.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-014 [IN_SCOPE_GAP] PRD section 'Callback and active order refresh converge on one payment RPC.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-015 [IN_SCOPE_GAP] PRD section 'Duplicate/concurrent payment success grants 50 points and one ledger exactly once.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-016 [IN_SCOPE_GAP] PRD section 'P0 Media and voice' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-017 [IN_SCOPE_GAP] PRD section 'Up to 100MB authorized video uploads directly to private storage with a signed URL and never traverses the Run request body.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-018 [IN_SCOPE_GAP] PRD section 'Worker downloads source video to temporary storage, runs FFmpeg, enrolls Aliyun CosyVoice and uploads reference/preview/generated audio.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-019 [IN_SCOPE_GAP] PRD section 'Private playback requires server authorization and a short-lived signed download URL.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-020 [IN_SCOPE_GAP] PRD section 'Provider voice identifiers are encrypted at rest.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-021 [IN_SCOPE_GAP] PRD section 'P0 Job and deletion lifecycle' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-022 [IN_SCOPE_GAP] PRD section 'API requests return without waiting for FFmpeg or model work.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-023 [IN_SCOPE_GAP] PRD section 'Durable jobs use leases, heartbeat, retry and duplicate-claim protection.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-024 [IN_SCOPE_GAP] PRD section 'Voice/account deletion removes the Aliyun provider voice and private storage objects before final database cleanup.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-025 [IN_SCOPE_GAP] PRD section 'API or function restart must not lose point, payment or job state.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-026 [IN_SCOPE_GAP] PRD section 'P1 Product surfaces' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-027 [IN_SCOPE_GAP] PRD section 'Existing mini-program login, creation, authorization, preview, workbench, purchase, voices, account, settings and legal pages retain their API contracts.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-028 [IN_SCOPE_GAP] PRD section 'SELF, OTHER and MINOR authorization types remain supported.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-029 [IN_SCOPE_GAP] PRD section 'Invitation rewards and a visual operations admin remain deferred.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-030 [IN_SCOPE_GAP] PRD section 'Acceptance evidence' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-CANDIDATES-NOT-NORMALIZED [HARD_FAIL] Requirement candidates exist but requirement-target.json has no normalized requirements. Repair: Normalize requirement-candidates.json into requirement-target.json before implementation or final PASS.
- GAP-SEC-025-REQ-STORY-COVERAGE [IN_SCOPE_GAP] P0/P1 PRD section SEC-025 has no requirement/story coverage. Repair: Map section '4. API or function restart must not lose point, payment or job state.' into requirement-target.json and story-target.json.
- GAP-STORY-PAYMENT-003-STORY-QUALITY-1 [HARD_FAIL] P0/P1 story STORY-PAYMENT-003 is missing required field sourceRequirements. Repair: Populate sourceRequirements in story-target.json.
- GAP-STORY-PAYMENT-003-STORY-QUALITY-2 [HARD_FAIL] P0/P1 story STORY-PAYMENT-003 has neither surfaces nor apis. Repair: Map the story to at least one UI surface/route or API endpoint.
- GAP-STORY-PAYMENT-003-STORY-QUALITY-3 [HARD_FAIL] P0/P1 story STORY-PAYMENT-003 has no route/api/e2e/visual test point. Repair: Add at least one executable route, api, e2e, or visual test point.
- GAP-STORY-PAYMENT-011-STORY-QUALITY-4 [HARD_FAIL] P0/P1 story STORY-PAYMENT-011 is missing required field sourceRequirements. Repair: Populate sourceRequirements in story-target.json.
- GAP-STORY-PAYMENT-011-STORY-QUALITY-5 [HARD_FAIL] P0/P1 story STORY-PAYMENT-011 has neither surfaces nor apis. Repair: Map the story to at least one UI surface/route or API endpoint.
- GAP-STORY-PAYMENT-011-STORY-QUALITY-6 [HARD_FAIL] P0/P1 story STORY-PAYMENT-011 has no route/api/e2e/visual test point. Repair: Add at least one executable route, api, e2e, or visual test point.
- GAP-STORY-PAYMENT-003-STATUS [IN_SCOPE_GAP] P0/P1 story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION. Repair: Implement/repair STORY-PAYMENT-003 and attach truthful test-point evidence.
- GAP-TP-STORY-PAYMENT-003-001-STATUS [IN_SCOPE_GAP] Test point TP-STORY-PAYMENT-003-001 for story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION. Repair: Run or implement the test point and attach evidence.
- GAP-TP-STORY-PAYMENT-003-001-EVIDENCE [HARD_FAIL] Test point TP-STORY-PAYMENT-003-001 for P0/P1 story STORY-PAYMENT-003 has no evidence. Repair: Attach executable evidence for TP-STORY-PAYMENT-003-001.
- GAP-STORY-PAYMENT-011-STATUS [IN_SCOPE_GAP] P0/P1 story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION. Repair: Implement/repair STORY-PAYMENT-011 and attach truthful test-point evidence.
- GAP-TP-STORY-PAYMENT-011-001-STATUS [IN_SCOPE_GAP] Test point TP-STORY-PAYMENT-011-001 for story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION. Repair: Run or implement the test point and attach evidence.
- GAP-TP-STORY-PAYMENT-011-001-EVIDENCE [HARD_FAIL] Test point TP-STORY-PAYMENT-011-001 for P0/P1 story STORY-PAYMENT-011 has no evidence. Repair: Attach executable evidence for TP-STORY-PAYMENT-011-001.
- GAP-CONTRACT-NOT-RECONCILED [IN_SCOPE_GAP] Frontend API/data calls were discovered but no reconciled contracts are recorded. Repair: Record frontend caller, backend endpoint, method, request body, response shape, auth/session, error/loading/empty states, and evidence in contract-map.json.
- GAP-UI-001 [IN_SCOPE_GAP] UI references exist but ui-target.json has no screens. Repair: Map UI references to routes/screens in ui-target.json.
- GAP-REQ-COVERAGE-001 [IN_SCOPE_GAP] PRD section 'CloudBase Production Refactor Requirements' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-002 [IN_SCOPE_GAP] PRD section 'P0 Architecture' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-003 [IN_SCOPE_GAP] PRD section 'Production uses CloudBase Run API, CloudBase PostgreSQL REST/RPC, private CloudBase Storage and an on-demand Cloud Function Worker.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-004 [IN_SCOPE_GAP] PRD section 'Production must not start embedded PostgreSQL, a resident media Worker or persistent local media storage.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-005 [IN_SCOPE_GAP] PRD section 'The pre-refactor implementation must remain recoverable from a dedicated local and remote branch.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-006 [IN_SCOPE_GAP] PRD section 'P0 Database and points' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-007 [IN_SCOPE_GAP] PRD section 'New registration grants 10 account points exactly once.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-008 [IN_SCOPE_GAP] PRD section 'Successful exact-speech or chat generation consumes exactly one point; failures and blocks consume zero.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-009 [IN_SCOPE_GAP] PRD section 'Transactional operations use PostgreSQL RPC and roll back atomically.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-010 [IN_SCOPE_GAP] PRD section 'The 楼9.9/50-point product is server-configurable and order creation is idempotent.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-011 [IN_SCOPE_GAP] PRD section 'P0 WeChat Pay' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-012 [IN_SCOPE_GAP] PRD section 'JSAPI order creation and `wx.requestPayment` parameters retain merchant RSA signing.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-013 [IN_SCOPE_GAP] PRD section 'The callback uses the raw request body, WeChat Pay public-key/platform-certificate verification and APIv3 AES-GCM decryption.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-014 [IN_SCOPE_GAP] PRD section 'Callback and active order refresh converge on one payment RPC.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-015 [IN_SCOPE_GAP] PRD section 'Duplicate/concurrent payment success grants 50 points and one ledger exactly once.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-016 [IN_SCOPE_GAP] PRD section 'P0 Media and voice' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-017 [IN_SCOPE_GAP] PRD section 'Up to 100MB authorized video uploads directly to private storage with a signed URL and never traverses the Run request body.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-018 [IN_SCOPE_GAP] PRD section 'Worker downloads source video to temporary storage, runs FFmpeg, enrolls Aliyun CosyVoice and uploads reference/preview/generated audio.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-019 [IN_SCOPE_GAP] PRD section 'Private playback requires server authorization and a short-lived signed download URL.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-020 [IN_SCOPE_GAP] PRD section 'Provider voice identifiers are encrypted at rest.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-021 [IN_SCOPE_GAP] PRD section 'P0 Job and deletion lifecycle' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-022 [IN_SCOPE_GAP] PRD section 'API requests return without waiting for FFmpeg or model work.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-023 [IN_SCOPE_GAP] PRD section 'Durable jobs use leases, heartbeat, retry and duplicate-claim protection.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-024 [IN_SCOPE_GAP] PRD section 'Voice/account deletion removes the Aliyun provider voice and private storage objects before final database cleanup.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-025 [IN_SCOPE_GAP] PRD section 'API or function restart must not lose point, payment or job state.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-026 [IN_SCOPE_GAP] PRD section 'P1 Product surfaces' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-027 [IN_SCOPE_GAP] PRD section 'Existing mini-program login, creation, authorization, preview, workbench, purchase, voices, account, settings and legal pages retain their API contracts.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-028 [IN_SCOPE_GAP] PRD section 'SELF, OTHER and MINOR authorization types remain supported.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-029 [IN_SCOPE_GAP] PRD section 'Invitation rewards and a visual operations admin remain deferred.' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-COVERAGE-030 [IN_SCOPE_GAP] PRD section 'Acceptance evidence' in docs\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json. Repair: Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.
- GAP-REQ-CANDIDATES-NOT-NORMALIZED [HARD_FAIL] Requirement candidates exist but requirement-target.json has no normalized requirements. Repair: Normalize requirement-candidates.json into requirement-target.json before implementation or final PASS.
- GAP-STORY-PAYMENT-003-STORY-QUALITY-1 [HARD_FAIL] P0/P1 story STORY-PAYMENT-003 is missing required field sourceRequirements. Repair: Populate sourceRequirements in story-target.json.
- GAP-STORY-PAYMENT-003-STORY-QUALITY-2 [HARD_FAIL] P0/P1 story STORY-PAYMENT-003 has neither surfaces nor apis. Repair: Map the story to at least one UI surface/route or API endpoint.
- GAP-STORY-PAYMENT-003-STORY-QUALITY-3 [HARD_FAIL] P0/P1 story STORY-PAYMENT-003 has no route/api/e2e/visual test point. Repair: Add at least one executable route, api, e2e, or visual test point.
- GAP-STORY-PAYMENT-011-STORY-QUALITY-4 [HARD_FAIL] P0/P1 story STORY-PAYMENT-011 is missing required field sourceRequirements. Repair: Populate sourceRequirements in story-target.json.
- GAP-STORY-PAYMENT-011-STORY-QUALITY-5 [HARD_FAIL] P0/P1 story STORY-PAYMENT-011 has neither surfaces nor apis. Repair: Map the story to at least one UI surface/route or API endpoint.
- GAP-STORY-PAYMENT-011-STORY-QUALITY-6 [HARD_FAIL] P0/P1 story STORY-PAYMENT-011 has no route/api/e2e/visual test point. Repair: Add at least one executable route, api, e2e, or visual test point.
- GAP-STORY-PAYMENT-003-STATUS [IN_SCOPE_GAP] P0/P1 story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION. Repair: Implement/repair STORY-PAYMENT-003 and attach truthful test-point evidence.
- GAP-TP-STORY-PAYMENT-003-001-STATUS [IN_SCOPE_GAP] Test point TP-STORY-PAYMENT-003-001 for story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION. Repair: Run or implement the test point and attach evidence.
- GAP-TP-STORY-PAYMENT-003-001-EVIDENCE [HARD_FAIL] Test point TP-STORY-PAYMENT-003-001 for P0/P1 story STORY-PAYMENT-003 has no evidence. Repair: Attach executable evidence for TP-STORY-PAYMENT-003-001.
- GAP-STORY-PAYMENT-011-STATUS [IN_SCOPE_GAP] P0/P1 story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION. Repair: Implement/repair STORY-PAYMENT-011 and attach truthful test-point evidence.
- GAP-TP-STORY-PAYMENT-011-001-STATUS [IN_SCOPE_GAP] Test point TP-STORY-PAYMENT-011-001 for story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION. Repair: Run or implement the test point and attach evidence.
- GAP-TP-STORY-PAYMENT-011-001-EVIDENCE [HARD_FAIL] Test point TP-STORY-PAYMENT-011-001 for P0/P1 story STORY-PAYMENT-011 has no evidence. Repair: Attach executable evidence for TP-STORY-PAYMENT-011-001.
- GAP-UI-001 [IN_SCOPE_GAP] UI references exist but ui-target.json has no screens. Repair: Map UI references to routes/screens in ui-target.json.
- GAP-CONTRACT-NOT-RECONCILED [IN_SCOPE_GAP] Frontend API/data calls were discovered but no reconciled contracts are recorded. Repair: Record frontend caller, backend endpoint, method, request body, response shape, auth/session, error/loading/empty states, and evidence in contract-map.json.
- GAP-REQ-001 [IN_SCOPE_GAP] No normalized requirements are listed in requirement-target.json Repair: Normalize docs/auto-execute/requirement-candidates.json into requirement-target.json with P0/P1/P2 acceptance criteria, surfaces, and evidence expectations.
- GAP-UI-001 [IN_SCOPE_GAP] UI references exist but ui-target.json has no screens. Repair: Map UI references to routes/screens in ui-target.json.

## Blockers

~~~text
# Blockers


## backend
- Time: 2026-08-21 12:58:12
- Type: DEFERRED
- Details: No backend detected


## secret-guard
- Time: 2026-08-21 16:22:34
- Type: DOCUMENTED_BLOCKER
- Details: Secret-like files found; confirm they are safe test fixtures or remove them.


## secret-guard
- Time: 2026-08-22 22:15:21
- Type: DOCUMENTED_BLOCKER
- Details: Secret-like files found; confirm they are safe test fixtures or remove them.


## secret-guard
- Time: 2026-08-23 08:51:43
- Type: DOCUMENTED_BLOCKER
- Details: Secret-like files found; confirm they are safe test fixtures or remove them.

## cloudbase-launch-gates
- Time: 2026-08-23
- Type: BLOCKED_BY_ENVIRONMENT
- Details: The merchant WeChat Pay public key/ID are not configured. Real WeChat login, real payment, domain allowlists, real-device testing and WeChat review require user/platform action. Core CloudBase deployment and non-charging payment transaction logic are verified.


## secret-guard
- Time: 2026-08-23 08:56:04
- Type: DOCUMENTED_BLOCKER
- Details: Secret-like files found; confirm they are safe test fixtures or remove them.


## frontend
- Time: 2026-08-23 09:00:12
- Type: DEFERRED
- Details: No frontend detected


## api-smoke
- Time: 2026-08-23 09:00:32
- Type: MANUAL_REVIEW_REQUIRED
- Details: No endpoints found in surface map


## secret-guard
- Time: 2026-08-23 09:04:55
- Type: DOCUMENTED_BLOCKER
- Details: Secret-like files found; confirm they are safe test fixtures or remove them.


## secret-guard
- Time: 2026-08-23 09:12:11
- Type: DOCUMENTED_BLOCKER
- Details: Secret-like files found; confirm they are safe test fixtures or remove them.


## frontend
- Time: 2026-08-23 09:16:26
- Type: DEFERRED
- Details: No frontend detected


## api-smoke
- Time: 2026-08-23 09:16:45
- Type: MANUAL_REVIEW_REQUIRED
- Details: No endpoints found in surface map
~~~

## Commands Run

- @{status=PASS; command=npm run build; log=docs/auto-execute/logs/backend-build.log}
- @{status=PASS; command=npm run test; log=docs/auto-execute/logs/backend-test.log}
- @{status=DEFERRED; command=node scripts/acceptance/generated/route-smoke.generated.mjs --project-root .; log=}
- @{status=DEFERRED; command=node scripts/acceptance/generated/api-smoke.generated.mjs --project-root .; log=}
- @{status=PASS; command=git status --short; log=docs\auto-execute\summaries\git-status.md}
- @{status=PASS; command=git diff --cached --name-only; log=docs\auto-execute\summaries\secret-guard.md}
- @{status=PASS_WITH_LIMITATION; command=node scripts/acceptance/capture-ui.mjs --project-root "D:\lyh\agent\agent-frame\aivoice" --base-url http://127.0.0.1:3000; log=docs\auto-execute\logs\ui-capture.log}

## Modified Files

-  M Dockerfile
-  M apps/api/package.json
-  M apps/api/src/account/account.service.ts
-  M apps/api/src/auth/auth.service.ts
-  M apps/api/src/db/database.module.ts
-  M apps/api/src/db/database.service.ts
-  M apps/api/src/media/media.controller.ts
-  M apps/api/src/media/media.service.ts
-  M apps/api/src/messages/message.service.ts
-  M apps/api/src/orders/order.controller.ts
-  M apps/api/src/orders/order.service.ts
-  M apps/api/src/payments/wechat-pay.service.ts
-  M apps/api/src/quota/quota.service.ts
-  M apps/api/src/voices/voice.service.ts
-  M apps/api/test/auth.test.ts
-  M apps/api/test/payment.test.ts
-  M apps/api/test/products.test.ts
-  M apps/api/test/quota.integration.test.ts
-  M apps/miniprogram/models/api.ts
-  M apps/miniprogram/models/normalize.ts
-  M apps/miniprogram/services/api.ts
-  M apps/miniprogram/test/contract.test.ts
-  M apps/miniprogram/test/purchase-page.test.ts
-  M apps/worker/package.json
-  M apps/worker/src/media/ffmpeg.ts
-  M docs/auto-execute/00-environment-snapshot.md
-  M docs/auto-execute/00-goal.md
-  M docs/auto-execute/00-total-task.md
-  M docs/auto-execute/03-story-map.md
-  M docs/auto-execute/04-story-test-matrix.md
-  M docs/auto-execute/06-scope-classification.md
-  M docs/auto-execute/08-repair-log.md
-  M docs/auto-execute/09-code-review.md
-  M docs/auto-execute/12-fullstack-delivery-plan.md
-  M docs/auto-execute/18-acceptance-comparison-loop.md
-  M docs/auto-execute/FULL_FLOW_ACCEPTANCE.md
-  M docs/auto-execute/acceptance-goal.json
-  M docs/auto-execute/agent-orchestration.json
-  M docs/auto-execute/agent-orchestration.md
-  M docs/auto-execute/blockers.md
-  M docs/auto-execute/contract-map.json
-  M docs/auto-execute/convergence-state.json
-  M docs/auto-execute/epic-map.json
-  M docs/auto-execute/evidence-manifest.json
-  M docs/auto-execute/final-convergence-report.md
-  M docs/auto-execute/gap-closure-log.md
-  M docs/auto-execute/gap-list.json
-  M docs/auto-execute/latest/HANDOFF.md
-  M docs/auto-execute/latest/blockers.md
-  M docs/auto-execute/latest/gap-list.json
-  M docs/auto-execute/latest/machine-summary.json
-  M docs/auto-execute/latest/next-agent-action.md
-  M docs/auto-execute/latest/repair-plan.md
-  M docs/auto-execute/latest/verification-results.md
-  M docs/auto-execute/machine-summary.json
-  M docs/auto-execute/next-agent-action.md
-  M docs/auto-execute/repair-attempts.json
-  M docs/auto-execute/requirement-candidates.json
-  M docs/auto-execute/requirement-section-map.json
-  M docs/auto-execute/results/backend-test.json
-  M docs/auto-execute/results/backend.json
-  M docs/auto-execute/results/contract-discovery.json
-  M docs/auto-execute/results/contract.json
-  M docs/auto-execute/results/e2e-flow.json
-  M docs/auto-execute/results/requirement-extract.json
-  M docs/auto-execute/results/requirement-section-map.json
-  M docs/auto-execute/results/requirements-candidates.json
-  M docs/auto-execute/results/requirements.json
-  M docs/auto-execute/results/secret-guard.json
-  M docs/auto-execute/sprint-plan.json
-  M docs/auto-execute/state.json
-  M docs/auto-execute/story-acceptance-summary.json
-  M docs/auto-execute/story-candidates-curated.json
-  M docs/auto-execute/story-candidates.json
-  M docs/auto-execute/story-gap-list.json
-  M docs/auto-execute/story-materialized-tests.json
-  M docs/auto-execute/story-quality-gate.json
-  M docs/auto-execute/story-status.json
-  M docs/auto-execute/story-target.json
-  M docs/auto-execute/story-test-matrix.json
-  M docs/auto-execute/summaries/secret-guard.md
-  M docs/auto-execute/ui-candidates.json
-  M docs/auto-execute/ui-target.json
-  M docs/auto-execute/verification-results.md
-  M docs/auto-execute/visual-diff-report.md
-  M docs/deployment/CLOUDBASE.md
-  M docs/deployment/WECHAT_PAY_MIGRATION.md
-  M harness.yml
-  M package-lock.json
-  M package.json
-  M scripts/acceptance/generated/visual-targets.generated.json
-  M scripts/deploy/cloudbase-combined.mjs
-  M scripts/runtime/start-combined.mjs
- ?? TODO.md
- ?? apps/api/cloudbase/
- ?? apps/api/src/db/cloudbase-worker-dispatcher.service.ts
- ?? apps/api/src/db/cloudbase-worker-invoker.ts
- ?? apps/api/test/cloudbase-voice-message.test.ts
- ?? apps/api/test/cloudbase-worker-invoker.test.ts
- ?? apps/api/test/media.cloudbase.test.ts
- ?? apps/worker/src/cloud-function.ts
- ?? apps/worker/src/cloudbase-job-runner.ts
- ?? apps/worker/test/cloud-function.test.ts
- ?? cloudfunctions/
- ?? docs/AUTO_EXECUTE_DELIVERY_REPORT.md
- ?? "docs/UI/ChatGPT Image 2026\345\271\2648\346\234\21023\346\227\245 08_41_46.png"
- ?? docs/auto-execute/11-final-acceptance-report.md
- ?? docs/auto-execute/CLOUDBASE_REFACTOR_TEST_PLAN.md
- ?? docs/auto-execute/CLOUDBASE_REST_RPC_ARCHITECTURE.md
- ?? docs/auto-execute/comparison/
- ?? docs/auto-execute/convergence-rounds/
- ?? docs/auto-execute/gap-list.md
- ?? docs/auto-execute/logs/backend-build.log
- ?? docs/auto-execute/logs/backend-test.log
- ?? docs/auto-execute/repair-plan.md
- ?? docs/auto-execute/results/acceptance-compare.json
- ?? docs/auto-execute/results/adapter-detect.json
- ?? docs/auto-execute/results/api-smoke.generated.json
- ?? docs/auto-execute/results/api-smoke.json
- ?? docs/auto-execute/results/architecture-guard.json
- ?? docs/auto-execute/results/cloudbase-deployment.json
- ?? docs/auto-execute/results/cloudbase-full-flow.json
- ?? docs/auto-execute/results/cloudbase-payment-rpc-smoke.json
- ?? docs/auto-execute/results/cloudbase-public-api-smoke.json
- ?? docs/auto-execute/results/cloudbase-runtime-smoke.json
- ?? docs/auto-execute/results/code-review.json
- ?? docs/auto-execute/results/compare-requirements.json
- ?? docs/auto-execute/results/compare-ui.json
- ?? docs/auto-execute/results/contract-map.json
- ?? docs/auto-execute/results/contract-verifier.json
- ?? docs/auto-execute/results/db-e2e.json
- ?? docs/auto-execute/results/environment.json
- ?? docs/auto-execute/results/final-gate.json
- ?? docs/auto-execute/results/frontend-test.json
- ?? docs/auto-execute/results/frontend.json
- ?? docs/auto-execute/results/gap-repair.json
- ?? docs/auto-execute/results/generated-story-tests.json
- ?? docs/auto-execute/results/git-status.json
- ?? docs/auto-execute/results/integration.json
- ?? docs/auto-execute/results/repair.json
- ?? docs/auto-execute/results/report-integrity.json
- ?? docs/auto-execute/results/requirement-coverage.json
- ?? docs/auto-execute/results/requirement-verifier.json
- ?? docs/auto-execute/results/route-smoke.generated.json
- ?? docs/auto-execute/results/run-all.json
- ?? docs/auto-execute/results/scope-classification.json
- ?? docs/auto-execute/results/story-curation.json
- ?? docs/auto-execute/results/story-extract.json
- ?? docs/auto-execute/results/story-final-report.json
- ?? docs/auto-execute/results/story-normalize.json
- ?? docs/auto-execute/results/story-quality-gate.json
- ?? docs/auto-execute/results/story-test-generate.json
- ?? docs/auto-execute/results/story-test-materialize.json
- ?? docs/auto-execute/results/story-verifier.json
- ?? docs/auto-execute/results/todo-export.json
- ?? docs/auto-execute/results/ui-capture.json
- ?? docs/auto-execute/results/ui-pixel-diff.json
- ?? docs/auto-execute/results/ui-verifier.json
- ?? docs/auto-execute/results/verifier-dependencies.json
- ?? docs/auto-execute/summaries/api-smoke.md
- ?? docs/auto-execute/summaries/architecture-guard.md
- ?? docs/auto-execute/summaries/error-summary.md
- ?? docs/auto-execute/summaries/git-status.md
- ?? docs/auto-execute/summaries/report-integrity.md
- ?? docs/auto-execute/summaries/requirement-coverage.md
- ?? docs/cloudbase-production-refactor-requirements.md
- ?? packages/cloudbase-runtime/
- ?? scripts/acceptance/cloudbase-claims-probe.mjs
- ?? scripts/acceptance/cloudbase-finish-flow.mjs
- ?? scripts/acceptance/cloudbase-full-flow.mjs
- ?? scripts/acceptance/cloudbase-payment-rpc-smoke.mjs
- ?? scripts/acceptance/cloudbase-public-api-smoke.mjs
- ?? scripts/acceptance/cloudbase-runtime-smoke.mjs
- ?? scripts/deploy/cloudbase-worker-function.mjs
- ?? scripts/deploy/provision-cloudbase-runtime.mjs

## Next Command

~~~powershell
Read docs/auto-execute/latest/repair-plan.md and docs/auto-execute/latest/next-agent-action.md, repair implementation/tests/evidence, then run: powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\resume-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode full -MaxRounds 5
~~~

## Resume Rule

Do NOT use -ResetConvergence when resuming the same run.

## Recovery Command

~~~powershell
powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\resume-convergence.ps1 -ProjectRoot "D:\lyh\agent\agent-frame\aivoice" -Mode full -MaxRounds 5
~~~

## Repair Required Rule

If current verdict is REPAIR_REQUIRED:

1. Read docs/auto-execute/latest/repair-plan.md
2. Read docs/auto-execute/latest/next-agent-action.md
3. Modify implementation/tests/evidence
4. Re-run convergence through resume-convergence.ps1 without -ResetConvergence

## Current Machine Summary

~~~json
{
    "manualReviewRequired":  [

                             ],
    "hardFails":  [

                  ],
    "documentedBlockers":  [

                           ],
    "deferred":  [

                 ],
    "finalVerdict":  "REPAIR_REQUIRED",
    "schemaVersion":  "2.0",
    "repairRequired":  true,
    "lastGapCount":  94,
    "repairPlan":  "docs\\auto-execute\\repair-plan.md",
    "nextAgentAction":  "docs\\auto-execute\\next-agent-action.md",
    "nextRecommendedAction":  "Read docs/auto-execute/next-agent-action.md and docs/auto-execute/repair-plan.md, fix the listed implementation/test/evidence gaps, then rerun run-convergence.ps1.",
    "updatedAt":  "2026-08-23T09:17:39"
}

~~~

## Current Gap List

~~~json
{
    "schemaVersion":  "2.0",
    "round":  1,
    "gaps":  [
                 {
                     "id":  "GAP-SEC-025-COVERAGE",
                     "type":  "requirement-section",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "P0/P1 PRD section \u00274. API or function restart must not lose point, payment or job state.\u0027 has no requirement/story coverage.",
                     "repairTarget":  "Map this section into requirement-target.json and story-target.json.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-001",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027CloudBase Production Refactor Requirements\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-002",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027P0 Architecture\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-003",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Production uses CloudBase Run API, CloudBase PostgreSQL REST/RPC, private CloudBase Storage and an on-demand Cloud Function Worker.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-004",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Production must not start embedded PostgreSQL, a resident media Worker or persistent local media storage.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-005",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027The pre-refactor implementation must remain recoverable from a dedicated local and remote branch.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-006",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027P0 Database and points\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-007",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027New registration grants 10 account points exactly once.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-008",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Successful exact-speech or chat generation consumes exactly one point; failures and blocks consume zero.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-009",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Transactional operations use PostgreSQL RPC and roll back atomically.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-010",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027The 楼9.9/50-point product is server-configurable and order creation is idempotent.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-011",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027P0 WeChat Pay\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-012",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027JSAPI order creation and `wx.requestPayment` parameters retain merchant RSA signing.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-013",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027The callback uses the raw request body, WeChat Pay public-key/platform-certificate verification and APIv3 AES-GCM decryption.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-014",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Callback and active order refresh converge on one payment RPC.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-015",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Duplicate/concurrent payment success grants 50 points and one ledger exactly once.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-016",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027P0 Media and voice\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-017",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Up to 100MB authorized video uploads directly to private storage with a signed URL and never traverses the Run request body.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-018",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Worker downloads source video to temporary storage, runs FFmpeg, enrolls Aliyun CosyVoice and uploads reference/preview/generated audio.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-019",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Private playback requires server authorization and a short-lived signed download URL.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-020",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Provider voice identifiers are encrypted at rest.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-021",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027P0 Job and deletion lifecycle\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-022",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027API requests return without waiting for FFmpeg or model work.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-023",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Durable jobs use leases, heartbeat, retry and duplicate-claim protection.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-024",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Voice/account deletion removes the Aliyun provider voice and private storage objects before final database cleanup.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-025",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027API or function restart must not lose point, payment or job state.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-026",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027P1 Product surfaces\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-027",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Existing mini-program login, creation, authorization, preview, workbench, purchase, voices, account, settings and legal pages retain their API contracts.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-028",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027SELF, OTHER and MINOR authorization types remain supported.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-029",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Invitation rewards and a visual operations admin remain deferred.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-030",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Acceptance evidence\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-CANDIDATES-NOT-NORMALIZED",
                     "type":  "requirement",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\requirement-candidates.json",
                     "description":  "Requirement candidates exist but requirement-target.json has no normalized requirements.",
                     "repairTarget":  "Normalize requirement-candidates.json into requirement-target.json before implementation or final PASS.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-SEC-025-REQ-STORY-COVERAGE",
                     "type":  "requirement",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "P0/P1 PRD section SEC-025 has no requirement/story coverage.",
                     "repairTarget":  "Map section \u00274. API or function restart must not lose point, payment or job state.\u0027 into requirement-target.json and story-target.json.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-STORY-PAYMENT-003-STORY-QUALITY-1",
                     "type":  "story-quality",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "P0/P1 story STORY-PAYMENT-003 is missing required field sourceRequirements.",
                     "repairTarget":  "Populate sourceRequirements in story-target.json.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-STORY-PAYMENT-003-STORY-QUALITY-2",
                     "type":  "story-quality",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "P0/P1 story STORY-PAYMENT-003 has neither surfaces nor apis.",
                     "repairTarget":  "Map the story to at least one UI surface/route or API endpoint.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-STORY-PAYMENT-003-STORY-QUALITY-3",
                     "type":  "story-quality",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "P0/P1 story STORY-PAYMENT-003 has no route/api/e2e/visual test point.",
                     "repairTarget":  "Add at least one executable route, api, e2e, or visual test point.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-STORY-PAYMENT-011-STORY-QUALITY-4",
                     "type":  "story-quality",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "P0/P1 story STORY-PAYMENT-011 is missing required field sourceRequirements.",
                     "repairTarget":  "Populate sourceRequirements in story-target.json.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-STORY-PAYMENT-011-STORY-QUALITY-5",
                     "type":  "story-quality",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "P0/P1 story STORY-PAYMENT-011 has neither surfaces nor apis.",
                     "repairTarget":  "Map the story to at least one UI surface/route or API endpoint.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-STORY-PAYMENT-011-STORY-QUALITY-6",
                     "type":  "story-quality",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "P0/P1 story STORY-PAYMENT-011 has no route/api/e2e/visual test point.",
                     "repairTarget":  "Add at least one executable route, api, e2e, or visual test point.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-STORY-PAYMENT-003-STATUS",
                     "type":  "story",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "P0/P1 story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION.",
                     "repairTarget":  "Implement/repair STORY-PAYMENT-003 and attach truthful test-point evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-TP-STORY-PAYMENT-003-001-STATUS",
                     "type":  "story",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "Test point TP-STORY-PAYMENT-003-001 for story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION.",
                     "repairTarget":  "Run or implement the test point and attach evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-TP-STORY-PAYMENT-003-001-EVIDENCE",
                     "type":  "story",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "Test point TP-STORY-PAYMENT-003-001 for P0/P1 story STORY-PAYMENT-003 has no evidence.",
                     "repairTarget":  "Attach executable evidence for TP-STORY-PAYMENT-003-001.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-STORY-PAYMENT-011-STATUS",
                     "type":  "story",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "P0/P1 story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION.",
                     "repairTarget":  "Implement/repair STORY-PAYMENT-011 and attach truthful test-point evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-TP-STORY-PAYMENT-011-001-STATUS",
                     "type":  "story",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "Test point TP-STORY-PAYMENT-011-001 for story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION.",
                     "repairTarget":  "Run or implement the test point and attach evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-TP-STORY-PAYMENT-011-001-EVIDENCE",
                     "type":  "story",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "Test point TP-STORY-PAYMENT-011-001 for P0/P1 story STORY-PAYMENT-011 has no evidence.",
                     "repairTarget":  "Attach executable evidence for TP-STORY-PAYMENT-011-001.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-CONTRACT-NOT-RECONCILED",
                     "type":  "contract",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\auto-execute\\contract-map.json",
                     "description":  "Frontend API/data calls were discovered but no reconciled contracts are recorded.",
                     "repairTarget":  "Record frontend caller, backend endpoint, method, request body, response shape, auth/session, error/loading/empty states, and evidence in contract-map.json.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-UI-001",
                     "type":  "ui",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\auto-execute\\ui-target.json",
                     "description":  "UI references exist but ui-target.json has no screens.",
                     "repairTarget":  "Map UI references to routes/screens in ui-target.json.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-001",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027CloudBase Production Refactor Requirements\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-002",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027P0 Architecture\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-003",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Production uses CloudBase Run API, CloudBase PostgreSQL REST/RPC, private CloudBase Storage and an on-demand Cloud Function Worker.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-004",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Production must not start embedded PostgreSQL, a resident media Worker or persistent local media storage.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-005",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027The pre-refactor implementation must remain recoverable from a dedicated local and remote branch.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-006",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027P0 Database and points\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-007",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027New registration grants 10 account points exactly once.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-008",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Successful exact-speech or chat generation consumes exactly one point; failures and blocks consume zero.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-009",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Transactional operations use PostgreSQL RPC and roll back atomically.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-010",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027The 楼9.9/50-point product is server-configurable and order creation is idempotent.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-011",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027P0 WeChat Pay\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-012",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027JSAPI order creation and `wx.requestPayment` parameters retain merchant RSA signing.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-013",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027The callback uses the raw request body, WeChat Pay public-key/platform-certificate verification and APIv3 AES-GCM decryption.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-014",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Callback and active order refresh converge on one payment RPC.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-015",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Duplicate/concurrent payment success grants 50 points and one ledger exactly once.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-016",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027P0 Media and voice\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-017",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Up to 100MB authorized video uploads directly to private storage with a signed URL and never traverses the Run request body.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-018",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Worker downloads source video to temporary storage, runs FFmpeg, enrolls Aliyun CosyVoice and uploads reference/preview/generated audio.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-019",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Private playback requires server authorization and a short-lived signed download URL.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-020",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Provider voice identifiers are encrypted at rest.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-021",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027P0 Job and deletion lifecycle\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-022",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027API requests return without waiting for FFmpeg or model work.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-023",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Durable jobs use leases, heartbeat, retry and duplicate-claim protection.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-024",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Voice/account deletion removes the Aliyun provider voice and private storage objects before final database cleanup.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-025",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027API or function restart must not lose point, payment or job state.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-026",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027P1 Product surfaces\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-027",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Existing mini-program login, creation, authorization, preview, workbench, purchase, voices, account, settings and legal pages retain their API contracts.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-028",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027SELF, OTHER and MINOR authorization types remain supported.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-029",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Invitation rewards and a visual operations admin remain deferred.\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-COVERAGE-030",
                     "type":  "requirement-coverage",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\cloudbase-production-refactor-requirements.md",
                     "description":  "PRD section \u0027Acceptance evidence\u0027 in docs\\cloudbase-production-refactor-requirements.md is not mapped into requirement-target.json.",
                     "repairTarget":  "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-CANDIDATES-NOT-NORMALIZED",
                     "type":  "requirement",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\requirement-candidates.json",
                     "description":  "Requirement candidates exist but requirement-target.json has no normalized requirements.",
                     "repairTarget":  "Normalize requirement-candidates.json into requirement-target.json before implementation or final PASS.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-STORY-PAYMENT-003-STORY-QUALITY-1",
                     "type":  "story-quality",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "P0/P1 story STORY-PAYMENT-003 is missing required field sourceRequirements.",
                     "repairTarget":  "Populate sourceRequirements in story-target.json.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-STORY-PAYMENT-003-STORY-QUALITY-2",
                     "type":  "story-quality",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "P0/P1 story STORY-PAYMENT-003 has neither surfaces nor apis.",
                     "repairTarget":  "Map the story to at least one UI surface/route or API endpoint.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-STORY-PAYMENT-003-STORY-QUALITY-3",
                     "type":  "story-quality",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "P0/P1 story STORY-PAYMENT-003 has no route/api/e2e/visual test point.",
                     "repairTarget":  "Add at least one executable route, api, e2e, or visual test point.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-STORY-PAYMENT-011-STORY-QUALITY-4",
                     "type":  "story-quality",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "P0/P1 story STORY-PAYMENT-011 is missing required field sourceRequirements.",
                     "repairTarget":  "Populate sourceRequirements in story-target.json.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-STORY-PAYMENT-011-STORY-QUALITY-5",
                     "type":  "story-quality",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "P0/P1 story STORY-PAYMENT-011 has neither surfaces nor apis.",
                     "repairTarget":  "Map the story to at least one UI surface/route or API endpoint.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-STORY-PAYMENT-011-STORY-QUALITY-6",
                     "type":  "story-quality",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "P0/P1 story STORY-PAYMENT-011 has no route/api/e2e/visual test point.",
                     "repairTarget":  "Add at least one executable route, api, e2e, or visual test point.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-STORY-PAYMENT-003-STATUS",
                     "type":  "story",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "P0/P1 story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION.",
                     "repairTarget":  "Implement/repair STORY-PAYMENT-003 and attach truthful test-point evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-TP-STORY-PAYMENT-003-001-STATUS",
                     "type":  "story",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "Test point TP-STORY-PAYMENT-003-001 for story STORY-PAYMENT-003 status is PENDING, not PASS/PASS_WITH_LIMITATION.",
                     "repairTarget":  "Run or implement the test point and attach evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-TP-STORY-PAYMENT-003-001-EVIDENCE",
                     "type":  "story",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "Test point TP-STORY-PAYMENT-003-001 for P0/P1 story STORY-PAYMENT-003 has no evidence.",
                     "repairTarget":  "Attach executable evidence for TP-STORY-PAYMENT-003-001.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-STORY-PAYMENT-011-STATUS",
                     "type":  "story",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "P0/P1 story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION.",
                     "repairTarget":  "Implement/repair STORY-PAYMENT-011 and attach truthful test-point evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-TP-STORY-PAYMENT-011-001-STATUS",
                     "type":  "story",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "Test point TP-STORY-PAYMENT-011-001 for story STORY-PAYMENT-011 status is PENDING, not PASS/PASS_WITH_LIMITATION.",
                     "repairTarget":  "Run or implement the test point and attach evidence.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-TP-STORY-PAYMENT-011-001-EVIDENCE",
                     "type":  "story",
                     "severity":  "HARD_FAIL",
                     "source":  "docs\\auto-execute\\story-candidates-curated.json",
                     "description":  "Test point TP-STORY-PAYMENT-011-001 for P0/P1 story STORY-PAYMENT-011 has no evidence.",
                     "repairTarget":  "Attach executable evidence for TP-STORY-PAYMENT-011-001.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-UI-001",
                     "type":  "ui",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\auto-execute\\ui-target.json",
                     "description":  "UI references exist but ui-target.json has no screens.",
                     "repairTarget":  "Map UI references to routes/screens in ui-target.json.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-CONTRACT-NOT-RECONCILED",
                     "type":  "contract",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\auto-execute\\contract-map.json",
                     "description":  "Frontend API/data calls were discovered but no reconciled contracts are recorded.",
                     "repairTarget":  "Record frontend caller, backend endpoint, method, request body, response shape, auth/session, error/loading/empty states, and evidence in contract-map.json.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-REQ-001",
                     "type":  "requirement",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\auto-execute\\requirement-candidates.json",
                     "description":  "No normalized requirements are listed in requirement-target.json",
                     "repairTarget":  "Normalize docs/auto-execute/requirement-candidates.json into requirement-target.json with P0/P1/P2 acceptance criteria, surfaces, and evidence expectations.",
                     "status":  "OPEN"
                 },
                 {
                     "id":  "GAP-UI-001",
                     "type":  "ui",
                     "severity":  "IN_SCOPE_GAP",
                     "source":  "docs\\auto-execute\\ui-target.json",
                     "description":  "UI references exist but ui-target.json has no screens.",
                     "repairTarget":  "Map UI references to routes/screens in ui-target.json.",
                     "status":  "OPEN"
                 }
             ],
    "generatedAt":  "2026-08-23T09:17:33"
}

~~~

