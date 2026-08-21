# Requirements Summary

## P0 product requirements

1. Native WeChat login and server-owned account.
2. Home with create entry and recent usable voices only.
3. One video selection, 12-60 second input, 10-30 second clip.
4. Voice metadata plus dynamic permission confirmation for self/other/minor.
5. FFmpeg extraction, quality gate, Aliyun voice enrollment and fixed preview.
6. Preview must finish playing before acceptance; retry uses a new clip.
7. First successful login grants one shared account balance of 5 points exactly once.
8. Workbench supports chat and exact-speech text input with AI labels.
9. All accepted voices under one account share the same point balance; each successful generation consumes 1 point.
10. Failed or blocked generation does not consume points; zero balance returns `POINTS_EXHAUSTED` with a server-owned purchase option and purchase appears only on the next active generation attempt.
11. One fixed server product: `POINTS_50`, 990 fen, +50 points, no auto-renew.
12. WeChat Pay v3 notification and active refresh both converge on one idempotent point grant.
13. Voice/media/conversation/account deletion and private data isolation.
14. Structured persistent job, order, point-ledger and payment evidence.

## Points-to-quota migration decision

Printersheet's points pattern is reused conceptually:

```text
point_accounts        -> shared account balance authority
point_ledger          -> signup, purchase, consume and refund evidence
point consume/refund  -> success-only generation consume; no pre-charge/refund
point pack purchase   -> fixed POINTS_50 purchase grant
```

The client never owns or mutates points. PostgreSQL transactions and unique constraints are authoritative.
