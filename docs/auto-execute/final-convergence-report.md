# Final Convergence Report

Generated: 08/23/2026 08:53:39

- Verdict: HARD_FAIL
- Gap list: docs\auto-execute\gap-list.json
- Machine summary: docs\auto-execute\machine-summary.json

## Final Verdict Classification

- Final verdict: HARD_FAIL
- Verdict class: failed-hard-gate-or-in-scope-gap
- Acceptance confidence: 0.33
- Requirement verifier: MISSING
- Story verifier: MISSING
- Contract verifier: MISSING
- E2E verifier: PASS
- DB E2E: MISSING
- UI verifier: MISSING
- Pixel-perfect visual diff: NOT_CLAIMED
- UI structure layer: UNKNOWN
- UI screenshot layer: UNKNOWN
- UI visual layer: UNKNOWN
- UI pixel-perfect layer: UNKNOWN
- Can ship locally: False
- Can claim pixel-perfect: False
- Requires human review: False
- Final gate suggestions: 0

Meaning: A HARD_FAIL, FAIL, or IN_SCOPE_GAP remains and prevents final acceptance.

## Why Not Pure PASS?

Final verdict: HARD_FAIL

- Requirement verifier: MISSING
- Story verifier: MISSING
- Contract verifier: MISSING
- E2E verifier: PASS
- DB E2E: MISSING
- UI verifier: MISSING
- Pixel-perfect evidence: NOT_CLAIMED
- Secret guard: DOCUMENTED_BLOCKER
- Report integrity: PASS

Reason:
A HARD_FAIL, FAIL, or IN_SCOPE_GAP remains and prevents final acceptance.

Pure PASS is not allowed because: Requirement verifier is MISSING; Story verifier is MISSING; Contract verifier is MISSING; DB E2E is MISSING; UI verifier is MISSING; Pixel-perfect visual diff is NOT_CLAIMED; Secret guard is DOCUMENTED_BLOCKER; manual/deferred/documented blocker lanes remain; required verifier result missing: requirement-coverage.json; requirement-section-map requires manual review; required verifier result missing: requirement-verifier.json; required verifier result missing: story-curation.json; required verifier result missing: story-test-materialize.json; required verifier result missing: generated-story-tests.json; required verifier result missing: story-quality-gate.json; acceptance confidence reduced by: requirementsCovered=0, storiesCovered=0, uiScreenshotsCovered=0, contractVerified=0

- Requirement verifier is MISSING
- Story verifier is MISSING
- Contract verifier is MISSING
- DB E2E is MISSING
- UI verifier is MISSING
- Pixel-perfect visual diff is NOT_CLAIMED
- Secret guard is DOCUMENTED_BLOCKER
- manual/deferred/documented blocker lanes remain
- required verifier result missing: requirement-coverage.json
- requirement-section-map requires manual review
- required verifier result missing: requirement-verifier.json
- required verifier result missing: story-curation.json
- required verifier result missing: story-test-materialize.json
- required verifier result missing: generated-story-tests.json
- required verifier result missing: story-quality-gate.json
- acceptance confidence reduced by: requirementsCovered=0, storiesCovered=0, uiScreenshotsCovered=0, contractVerified=0

## Dynamic Final Gate Suggestions
- No disabled-lane result suggestions.

## Reasons
- manual/deferred/documented blocker lanes remain
- required verifier result missing: requirement-coverage.json
- requirement-section-map requires manual review
- required verifier result missing: requirement-verifier.json
- required verifier result missing: story-curation.json
- required verifier result missing: story-test-materialize.json
- required verifier result missing: generated-story-tests.json
- required verifier result missing: story-quality-gate.json
- required verifier result missing: story-verifier.json
- required verifier result missing: story-final-report.json
- required verifier result missing: ui-capture.json
- required verifier result missing: ui-verifier.json
- required verifier result missing: contract-verifier.json
- required verifier result missing: frontend-test.json
- backend-test is DEFERRED, so pure PASS is not allowed
- required verifier result missing: db-e2e.json
- secret-guard has a documented blocker
- story-quality-gate status is PENDING
