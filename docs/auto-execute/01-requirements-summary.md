# Requirements Summary

## P0 product requirements

1. Native WeChat login and server-owned account.
2. Home with create entry and recent usable voices only.
3. One video selection, 12-60 second input, 10-30 second clip.
4. Voice metadata plus dynamic permission confirmation for self/other/minor.
5. FFmpeg extraction, quality gate, Aliyun voice enrollment and fixed preview.
6. Preview must finish playing before acceptance; retry uses a new clip.
7. Accepting the first preview grants one account-level trial generation exactly once.
8. Workbench supports chat and exact-speech text input with AI labels.
9. Trial and paid quotas are separate; success consumes trial first, then paid.
10. Zero quota returns `QUOTA_EXHAUSTED`; purchase appears only on the next active generation attempt.
11. One fixed server product: `VOICE_QUOTA_10`, 990 fen, +10 paid quota.
12. WeChat Pay v3 notification and active refresh both converge on one idempotent grant.
13. Voice/media/conversation/account deletion and private data isolation.
14. Structured persistent job, order, message and ledger evidence.

## Points-to-quota migration decision

Printersheet's points pattern is reused conceptually:

```text
point_accounts        -> voice_profiles.trial_quota_remaining + paid_quota_remaining
point_ledger          -> quota_ledgers
point consume/refund  -> success-only generation consume; no pre-charge/refund
point pack purchase   -> fixed VOICE_QUOTA_10 purchase grant
```

The client never owns or mutates quota. PostgreSQL transactions and unique constraints are authoritative.
