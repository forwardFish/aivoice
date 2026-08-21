# API Contract v1

Base path: `/v1`. JSON unless an upload endpoint explicitly uses multipart or returns a signed policy.

## Auth

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/auth/wechat` | `{ code, profile?: { nickname, avatarUrl } }` | `{ token, user, trialEligibility }` |
| GET | `/me` | Bearer | `{ user, trialEligibility, voiceCount }` |
| PATCH | `/me/profile` | `{ nickname?, avatarUrl? }` | `{ user }` |

## Voices and media

| Method | Path | Purpose |
|---|---|---|
| GET | `/home` | create metadata + recent READY voices |
| GET | `/voices?status=` | user-owned voices |
| POST | `/voices` | create draft |
| POST | `/voices/:id/upload-policy` | returns authenticated server-upload URL, field name, size and expiry |
| POST | `/voices/:id/media-upload` | multipart `file`; validates MIME/content/duration and returns `mediaId` |
| POST | `/voices/:id/media` | confirm the returned `mediaId` |
| PUT | `/voices/:id/clip` | `{ startMs, endMs }` |
| PUT | `/voices/:id/profile` | `{ name, permissionType }` |
| POST | `/voices/:id/consents` | `{ consentVersion, consentText, confirmed: true }` |
| POST | `/voices/:id/process` | idempotently enqueue processing |
| GET | `/voices/:id` | status, preview, quota, recoverable error |
| GET | `/voices/:id/preview` | signed preview audio URL |
| POST | `/voices/:id/preview-played` | record completion from the player `ended` event; rejected until server-observed preview stream time reaches its duration |
| POST | `/voices/:id/accept-preview` | mark accepted and grant trial once |
| POST | `/voices/:id/retry-preview` | return to clip selection without charge |
| DELETE | `/voices/:id` | schedule provider/storage deletion |

## Workbench

All generation POSTs require `Idempotency-Key: UUIDv4`.

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/voices/:id/quota` | none | quota response |
| GET | `/voices/:id/conversation` | none | last 10 rounds |
| DELETE | `/voices/:id/conversation` | none | cleared |
| POST | `/voices/:id/messages` | `{ text }` | `{ messageId, status: "PROCESSING" }` |
| POST | `/voices/:id/exact-speech` | `{ text }` | `{ messageId, status: "PROCESSING" }` |
| GET | `/messages/:id` | none | status/text/signed audio/quota |

Quota response:

```json
{
  "trialQuotaRemaining": 0,
  "paidQuotaRemaining": 6,
  "availableQuota": 6,
  "trialEligibility": "USED"
}
```

Zero quota response (HTTP 402):

```json
{
  "code": "QUOTA_EXHAUSTED",
  "purchaseOption": {
    "productCode": "VOICE_QUOTA_10",
    "amountFen": 990,
    "quota": 10,
    "autoRenew": false
  }
}
```

## Orders and account

| Method | Path | Request/response |
|---|---|---|
| POST | `/orders` | `{ productCode: "VOICE_QUOTA_10", voiceId }` -> order + JSAPI payment params |
| GET | `/orders/:id` | user-owned order and quota grant status |
| POST | `/orders/:id/refresh` | active WeChat query and convergence |
| POST | `/payments/wechat/notify` | raw-body verified WeChat notification |
| GET | `/orders` | current user's orders |
| GET | `/quota-ledgers` | current user's quota ledger |
| DELETE | `/account` | idempotent deletion workflow |

## Error codes

`UNAUTHORIZED`, `INVALID_MEDIA`, `CLIP_TOO_SHORT`, `CONSENT_REQUIRED`, `VOICE_NOT_READY`, `PREVIEW_NOT_PLAYED`, `PREVIEW_RETRY_EXHAUSTED`, `GENERATION_IN_PROGRESS`, `QUOTA_EXHAUSTED`, `CONTENT_BLOCKED`, `PROVIDER_FAILED`, `ORDER_NOT_FOUND`, `PAYMENT_MISMATCH`, `INTERNAL_ERROR`.
