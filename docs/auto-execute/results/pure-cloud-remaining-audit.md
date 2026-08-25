# Pure Cloud Remaining Audit

Date: 2026-08-24

Verdict: `BLOCKED_BY_SECURITY`

## Proven in the current branch

- The standard resource environment `aiassistant-0517-d6en8tw82f2f7fc` is shared to target AppID `wx106e5dcda1d1baeb` with 47 permissions.
- A real target-AppID DevTools probe initialized the shared environment, uploaded a native file, received a `cloud://` ID and deleted it successfully.
- PostgreSQL REST/RPC remains in `aivoice-d1g94bgoh67c6b974`; client-facing API, functions and native storage are mapped to the shared standard environment.
- Full workspace verification passes: CloudBase runtime 4/4, mini-program 25/25, API 27/29 with 2 environment-gated skips, Worker 22/24 with 2 environment-gated skips.
- Virtual-payment OfferID, sandbox and production AppKeys are locally configured outside Git.
- Development good `POINTS_50` exists at CNY 9.90 and is sandbox-ready but intentionally not published to production.
- Native storage, asynchronous Worker dispatch, RPC payment authority, virtual-payment signing, refund handling and deployment dry-runs have current evidence.
- Shared-layout deployment dry-runs pass for the API mapping, staged Worker and staged payment-event function without changing cloud state.

## Still required

1. Rotate credentials previously exposed in diagnostic output before publishing new cloud revisions.
2. Deploy the Run API, Worker and lightweight virtual-payment event function; apply RPC migration `0008_virtual_payment_rpc.sql`.
3. Configure WeChat message push with the deployed managed callback URL, Token and EncodingAESKey.
4. Run a real Android sandbox flow: login, upload, clone, exact speech/chat playback, purchase `POINTS_50`, one `+50` grant and duplicate callback/query replay.
5. After Android passes, publish the good and run one real CNY 9.90 production payment; iOS requires Apple IAP enablement and a real transaction because there is no iOS sandbox.
6. Complete small-program filing/category/privacy declarations, device acceptance, operator/contact/complaint details and formal legal review before public release.

## Not a code blocker

- No extra VPS or custom ICP-filed API domain is required for the selected shared-CloudBase architecture.
- Production publication of the virtual good is deliberately deferred until sandbox acceptance.
