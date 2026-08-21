# Account Points Flow Acceptance

Date: 2026-08-21
Environment: local PostgreSQL + local API + WeChat DevTools automation (`touristappid`)
Authority: server `point_accounts` and `point_ledgers`; no client-side balance mutation

## Page-click evidence

1. Cleared the mini-program local session, opened the login page, clicked the agreement row and the WeChat login button.
2. The home page opened successfully. The account page returned `availablePoints: 5` and a `REGISTER_GRANT +5` ledger.
3. A dedicated local test adjustment set the account to zero so the zero-balance UX could be exercised without spending provider calls.
4. From the exact-speech workbench, entered text and clicked Generate. The server returned `POINTS_EXHAUSTED`; the retained draft and the server-configured `POINTS_50 / 990 fen / 50 points` purchase option were displayed.
5. Clicked the purchase modal, opened the independent purchase page, and clicked the purchase button. Local payment confirmation returned to the workbench with 50 points.
6. Opened the purchase page again and clicked purchase again. The balance became 100, proving additive repurchase behavior.

Screenshots:

- `screenshots/points-flow/01-after-login.png`
- `screenshots/points-flow/03-zero-points-modal.png`
- `screenshots/points-flow/04-purchase-page.png`
- `screenshots/points-flow/05-after-purchase.png`
- `screenshots/points-flow/06-after-repurchase-100.png`

The account-page 5-point state was also read directly from the running page data (`availablePoints=5`) together with its `REGISTER_GRANT +5 / balanceAfter=5` row. WeChat DevTools' screenshot command timed out on that long account page, so this state is recorded as runtime/DB evidence rather than a misleading screenshot claim.

## Database evidence

After the first purchase, the test account contained:

```text
point_accounts.balance = 50
orders.status = PAID
orders.amount_fen = 990
orders.points = 50
orders.points_granted_at IS NOT NULL
```

The ledger sequence was:

```text
REGISTER_GRANT       +5   balance_after=5   REGISTRATION
MANUAL_ADJUSTMENT   -5   balance_after=0   LOCAL_UI_TEST
PURCHASE_GRANT      +50  balance_after=50  WECHAT_PAY
```

The second page purchase increased the UI/server balance to 100.

## Automated gates

- Mini-program: 10/10 passed.
- API with real local PostgreSQL: 8/8 passed, zero skipped.
- Worker with real local PostgreSQL: 12/12 passed, zero skipped.
- Workspace typecheck: passed.
- Workspace build: passed.

The API/Worker integration cases independently prove first-registration idempotency, shared account balance, success-only debit, failure-no-debit, message/order idempotency, and cross-voice concurrency protection. The local UI test proves the corresponding page behavior and payment convergence. Real WeChat AppID login, merchant settlement and production deployment remain external-credential gates.
