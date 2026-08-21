# Status Semantics

## PASS
All in-scope requirements, UI structure, contracts, tests, secret guard, and report integrity passed with evidence.

## PASS_WITH_LIMITATION
Core behavior passed, but acceptable limitations remain, such as non-production verification, documented blockers, or deferred out-of-scope items.

## PASS_NEEDS_MANUAL_UI_REVIEW
Core automated gates passed, but UI visual/pixel review still needs a human because screenshots, diff tooling, or aesthetic judgment could not fully close the UI claim.

## COMPLETED / COMPLETE
COMPLETED means process finished, not acceptance passed. COMPLETE and COMPLETED must never normalize to PASS; they are limitations or manual-review states until run-final-gate.ps1 proves acceptance.

## REPAIR_REQUIRED
Open in-scope gaps remain. The agent must read repair-plan.md and next-agent-action.md, edit implementation/tests/evidence, then rerun convergence.

## HARD_FAIL
Build, test, core requirement, core UI, contract, secret, report integrity, or safety boundary failed.

## BLOCKED
Progress is blocked by credentials, environment, production resource, payment, destructive operation, or another non-code authority constraint.

## DOCUMENTED_BLOCKER
A known blocker is recorded with evidence. It is not an automatic code failure, but final verdict cannot be pure PASS.

## DEFERRED
Explicitly outside current scope and must include rationale.

## MANUAL_REVIEW_REQUIRED
Human visual, product, or experience judgment is required. Do not claim fully automated PASS or pixel-perfect UI.

## PRODUCT_DECISION_REQUIRED
PRD, UI, or code behavior conflicts require product decision before pure PASS.

## UI Mapping Priority
UI mapping priority is: 1. harness.yml uiMapping; 2. UIReferences automatic discovery; 3. filename route guess; 4. manual review. Required uiMapping without screenshot evidence is HARD_FAIL. Auto-guessed mappings cannot claim pure PASS without screenshot and diff evidence.

