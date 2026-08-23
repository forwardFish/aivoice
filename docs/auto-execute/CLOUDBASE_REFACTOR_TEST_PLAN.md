# CloudBase Refactor Test Plan

Date: 2026-08-22
Scope: CloudBase refactor contract test plan only. No product-code change.

## Goal

Prove that the CloudBase version preserves the already verified local behavior for:

- REST/RPC API authority
- cloud storage upload and private media access
- cloud-function Worker async execution
- Aliyun CosyVoice enrollment and synthesis
- WeChat login
- WeChat Pay

And add explicit proof for the user-defined hard checks:

1. Same order concurrent/duplicate callback grants exactly one `+50`
2. Transaction rollback leaves no partial balance/order side effect
3. Active query-order path and payment callback converge to one final paid state
4. Service restart or worker restart does not lose in-flight work or double-grant

Additional mandatory checks:

- generation/provider/storage failure does not deduct points
- 100MB direct upload bypasses the former 20MB Run limit
- Worker jobs longer than 60s stay async and recoverable
- delete flow has compensation and reaches final cleanup

## Current Evidence Baseline

Current local PostgreSQL evidence already exists and should be treated as the baseline contract to preserve:

- `apps/api/test/payment.test.ts`
  - signed JSAPI prepay params
  - WeChat Pay notify signature verification
  - notify -> grant only once at service level
- `apps/api/test/quota.integration.test.ts`
  - signup grant idempotency
  - same order duplicate point grant idempotency
  - success-only debit
  - failure-no-debit
  - cross-voice oversell protection
- `apps/api/test/auth.test.ts`
  - production forbids mock login
  - real `code2Session` response never exposes `session_key`
- `apps/api/test/api-flow.integration.test.ts`
  - login -> upload -> consent -> process -> accept preview -> generate -> purchase -> delete end-to-end API flow
- `apps/worker/test/points.integration.test.ts`
  - only successful generation consumes one point
  - provider/disk/metadata failure consumes zero points
- `apps/worker/test/deletion.integration.test.ts`
  - delete voice/account removes provider voice and local private media
- `apps/worker/test/lease-recovery.test.ts`
  - lease expiry requeue/fail semantics exist in the current Worker design
- `tests/test_aliyun_provider.py`
  - CosyVoice enrollment reuses voice and avoids key leakage

Important migration warning already recorded in `docs/auto-execute/00-project-intake.md`:

- old CloudBase balance updates were not transactional
- old job pump behavior must not be copied forward as-is

## Test Layers

| Layer | Purpose | Can automate locally | Needs real CloudBase | Needs user action |
|---|---|---:|---:|---:|
| L0 contract/unit | Prove API/Worker/storage/payment state machine behavior with mocks/fakes | Yes | No | No |
| L1 local integration | Prove DB transaction, idempotency, retry, async lease/restart semantics | Yes | No | No |
| L2 CloudBase integration | Prove CloudBase DB/storage/function semantics match L1 contract | No | Yes | No |
| L3 WeChat sandbox/manual | Prove real login code exchange and real merchant/sandbox pay path | Partly | Yes | Yes |
| L4 production-like acceptance | Prove full mini-program flow with scanned login, pay, callback, query-order, deletion evidence | No | Yes | Yes |

## Hard Verification Priority

### P0-1 Same order concurrent or duplicate callback grants exactly once

Risk: highest. This is the original CloudBase weakness area.

Pass condition:

- N concurrent callback deliveries for the same `orderId` and same `transactionId`
- callback + active refresh query interleaved
- final state:
  - order is `PAID`
  - exactly one `PURCHASE_GRANT`
  - balance increases from `X` to `X + 50` only once
  - no second ledger row
  - no second side effect after function retry or restart

Best proof:

- one deterministic automated concurrency test
- one real CloudBase replay test with parallel callback invocations

### P0-2 Transaction rollback leaves no partial side effect

Pass condition:

- inject failure after order marked paid but before ledger insert
- inject failure after ledger insert but before transaction commit
- final state after rollback:
  - no partial balance change
  - no orphan paid order without ledger
  - no ledger without order paid state
  - retry can safely complete once

### P0-3 Query-order and callback convergence

Pass condition:

- `/orders/:id/refresh` polls upstream and callback also arrives
- either path may win first
- final state still has one paid order and one `PURCHASE_GRANT`
- duplicate refresh after callback is read-only

### P0-4 Restart persistence and async recovery

Pass condition:

- restart API/function container during payment or generation flow
- restart Worker/function during >60s async job
- pending work resumes from durable queue/state
- no lost job, no duplicate deduction, no duplicate grant

## Detailed Matrix

| ID | Area | Scenario | Expected result | Existing evidence | Required after CloudBase refactor | Execution class |
|---|---|---|---|---|---|---|
| CB-PAY-001 | WeChat Pay | Same order duplicate callback | exactly one `PURCHASE_GRANT`, balance `+50` once | `apps/api/test/payment.test.ts`, `apps/api/test/quota.integration.test.ts` | add true concurrent CloudBase callback test | L1 + L2 |
| CB-PAY-002 | WeChat Pay | callback races with active query-order refresh | final state converges once, no duplicate ledger | service code exists in `refreshOrder` + `handleNotify`, no dedicated race test | add race test | L1 + L2 |
| CB-PAY-003 | WeChat Pay | rollback after paid mark before ledger commit | order/balance/ledger all rollback together | not explicitly proven today | add fault injection test | L1 + L2 |
| CB-PAY-004 | WeChat Pay | restart between callback retries | retry resumes, still single grant | partial worker lease evidence only | add durable callback replay test | L2 + L4 |
| CB-PAY-005 | WeChat Pay | wrong amount/openid/appid/mchid | reject payment, no grant | `apps/api/src/payments/wechat-pay.service.ts` guards, no full matrix test | add negative matrix | L0 + L2 |
| CB-AUTH-001 | WeChat login | real code2Session exchange | server gets `openid`, never exposes `session_key` | `apps/api/test/auth.test.ts` | rerun against real WeChat env | L0 + L3 |
| CB-AUTH-002 | WeChat login | repeated login after restart | same user identity resumes, no duplicate account mutation | partial API-flow evidence | add CloudBase session persistence test | L2 + L3 |
| CB-STO-001 | Upload/storage | 100MB direct upload succeeds | upload bypasses old 20MB Run path; metadata persists | current API advertises `maxBytes=100MB` and local multer limit is 100MB | must prove CloudBase direct-upload path | L2 + L4 |
| CB-STO-002 | Upload/storage | file >100MB rejected cleanly | no dangling media record/object | local path not explicitly covered | add boundary test | L1 + L2 |
| CB-STO-003 | Upload/storage | upload success but DB write fails | uploaded blob compensated or quarantined | not proven today | add compensation test | L2 |
| CB-STO-004 | Private media | signed playback only for owner | no unauthorized leak after migration | current local signed URL logic exists | rerun in CloudBase storage/CDN path | L2 |
| CB-VC-001 | CosyVoice | enrollment + synthesize success | ready voice, preview playable, no key leak | `tests/test_aliyun_provider.py`, functional closure docs | rerun with CloudBase storage/function path | L2 + L4 |
| CB-VC-002 | CosyVoice | provider failure | voice/message failed, zero point deduction | `apps/worker/test/points.integration.test.ts` | rerun in function worker | L1 + L2 |
| CB-VC-003 | CosyVoice | long-running worker job >60s | async status persists, heartbeat/lease recovery works | `lease-recovery.test.ts` only proves SQL logic | add real long-job recovery test | L1 + L2 |
| CB-PTS-001 | Points | generation success deducts exactly once | one `GENERATION_CONSUME` only | `apps/worker/test/points.integration.test.ts` | rerun in CloudBase durable queue path | L1 + L2 |
| CB-PTS-002 | Points | provider/disk/storage failure does not deduct | balance unchanged | `apps/worker/test/points.integration.test.ts` | extend to cloud storage failure case | L1 + L2 |
| CB-PTS-003 | Points | concurrent generate with one remaining point | one request wins, other gets exhausted | `apps/api/test/quota.integration.test.ts` | rerun against CloudBase transaction model | L1 + L2 |
| CB-DEL-001 | Delete compensation | delete provider succeeds, storage delete fails | retry/compensation eventually reaches `DELETED`, no leaked active asset | local deletion success only | add compensation test | L2 |
| CB-DEL-002 | Delete compensation | storage delete succeeds, provider delete fails | no visible active voice; retry drains provider side later | not proven today | add compensation test | L2 |
| CB-DEL-003 | Delete idempotency | repeated delete/account delete requests | same final state, no duplicate side effects | local delete flow evidence exists | rerun in CloudBase async path | L1 + L2 |

## What Can Be Fully Automated Locally

These should be added first because they are fast and catch contract regressions before hitting CloudBase:

- duplicate callback grant-once
- callback/query-order race convergence
- rollback fault injection around paid-order and ledger write
- wrong amount/openid/appid/mchid negative cases
- failure-no-deduct for provider error
- one-point-left concurrent generation
- delete compensation state-machine tests with fake storage/provider ports
- >60s worker lease and restart simulation with fake long job

These are local because they validate behavior, not provider infrastructure.

## What Requires Real CloudBase

- direct upload path truly bypasses old 20MB function payload limit
- object storage write + DB metadata commit/compensation semantics
- durable queue or cloud-function trigger persistence across restart
- callback replay and retry behavior through real ingress/function execution
- real signed private media path after object storage/CDN indirection
- CloudBase environment cold start or restart recovery

Recommended real-environment evidence:

- per scenario request ids
- order id / transaction id / ledger id snapshots
- storage object existence before and after compensation
- function invocation logs showing retry/replay timing

## What Requires User Scan or Real Payment

- real WeChat login by scanning/authorizing in the target mini-program
- real merchant payment or merchant sandbox payment from the actual mini-program purchase page
- manual confirmation that the paid UI returns from cashier to the app and balance changes once

User-only checkpoints:

- login authorization prompt is correct
- payment sheet opens from real mini-program
- payment completion returns to the purchase/result page
- duplicate user tapping or reopening page does not double-credit

## Recommended Execution Order

1. `CB-PAY-001` same-order duplicate callback grants once
2. `CB-PAY-003` rollback fault injection
3. `CB-PAY-002` query-order and callback convergence
4. `CB-PAY-004` restart persistence
5. `CB-STO-001` 100MB direct upload on real CloudBase
6. `CB-VC-003` >60s worker async recovery
7. `CB-PTS-002` cloud storage/provider failure no-deduct
8. `CB-DEL-001` and `CB-DEL-002` delete compensation
9. real WeChat login
10. real payment end-to-end acceptance

## Stop Conditions

Do not claim CloudBase refactor accepted unless all four hard verifications are evidenced and the following are true:

- no duplicate `PURCHASE_GRANT`
- no partial paid/order/ledger state after injected failure
- refresh/query and callback converge to one paid result
- restart does not lose or duplicate work
- generation failure still does not deduct
- 100MB upload path is proven on real CloudBase
- >60s async worker path is durable
- delete compensation reaches final cleanup

## Most Important First Test

Highest priority is `CB-PAY-001`: same order concurrent/duplicate callback plus active query-order race, with final proof that the account balance increases by exactly `+50` once and only one `PURCHASE_GRANT` ledger exists.
