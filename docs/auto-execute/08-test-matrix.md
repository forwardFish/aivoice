# Test Matrix

## 2026-08-24 risk-first additions

| Risk | Automated gate | Live gate | Required result |
|---|---|---|---|
| Private gateway/OpenID | HTTP transport/auth contract tests; staged HTTP Function boot | Real mini-program call with injected `x-wx-openid` | Same user/session response contract, no request domain |
| Native media | storage adapter tests; metadata/ownership/delete tests; audio resolver tests | Authorized video upload and audible preview/result | No public upload/playback domain; <=100MB supported |
| Stateless jobs | immediate invoke/recovery/dedupe tests | Clone/generate with resident dispatcher disabled | Job starts and recovers; success debit exactly once |
| Payment | order/callback/refresh concurrency tests | Real small charge plus callback replay | Correct amount/openid; one order transition and one +50 ledger |

| Lane | Required evidence |
|---|---|
| Frontend | TypeScript/static checks, page inventory, DevTools compile, screenshots, key user flows |
| Auth | code2Session mock integration, expiry/revocation, cross-user isolation |
| Media | FFmpeg extraction, probe/quality, upload ownership and deletion |
| Voice | Provider mock + live Aliyun smoke, preview accept/retry |
| Quota | once-only trial grant, trial-first consume, failure no-consume, non-negative balance, concurrency |
| Payment | prepay signing, raw callback verification/decrypt, amount/openid checks, refresh, duplicate notification |
| Jobs | unique active job, retry, recovery, timeout, multi-worker lease |
| Contract | every frontend call matches route/method/payload/auth/states |
| E2E | running PostgreSQL/API/Worker/mini-program; page-click new user -> preview -> free exact speech -> zero quota -> purchase prompt -> server-confirmed payment continuation |
| UI evidence | stable screenshots, route/action log, console errors, failed network requests, response-shape notes and explicit visual verdict |
| Guards | secret guard, report integrity, no provider voice IDs in client |
