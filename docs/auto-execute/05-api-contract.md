# API Contract v1

Base path: `/v1`. JSON unless an upload endpoint explicitly uses multipart or returns a signed policy.

Backend configuration defaults: `SIGNUP_BONUS_POINTS=10`, `GENERATION_POINT_COST=1`, `POINTS_PACKAGE_CODE=POINTS_50`, `POINTS_PACKAGE_PRICE_FEN=990`, `POINTS_PACKAGE_AMOUNT=50`, `POINTS_VALIDITY_DAYS=180`. Invalid/non-positive values fail closed to validated defaults; the client only renders values returned by the API.

## Auth

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/auth/wechat` | `{ code, profile?: { nickname, avatarUrl } }` | `{ token, user, points }`; first registration atomically grants signup points |
| GET | `/me` | Bearer | `{ user, voiceCount, points }` |
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
| POST | `/voices/:id/accept-preview` | mark accepted; does not grant points |
| POST | `/voices/:id/retry-preview` | return to clip selection without charge |
| DELETE | `/voices/:id` | schedule provider/storage deletion |

## Workbench

All generation POSTs require `Idempotency-Key: UUIDv4`.

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/points` | none | authoritative account points and backend product config |
| GET | `/voices/:id/quota` | none | temporary compatibility alias; returns the same account-level points |
| GET | `/voices/:id/conversation` | none | last 10 rounds |
| DELETE | `/voices/:id/conversation` | none | cleared |
| POST | `/voices/:id/messages` | `{ text }` | `{ messageId, status: "PROCESSING" }` |
| POST | `/voices/:id/exact-speech` | `{ text }` | `{ messageId, status: "PROCESSING" }` |
| GET | `/messages/:id` | none | status/text/signed audio/quota |

Points response:

```json
{
  "balance": 53,
  "availablePoints": 53,
  "generationCost": 1
}
```

Zero-points response (HTTP 402):

```json
{
  "code": "POINTS_EXHAUSTED",
  "purchaseOption": {
    "productCode": "POINTS_50",
    "amountFen": 990,
    "points": 50,
    "autoRenew": false
  }
}
```

## Orders and account

| Method | Path | Request/response |
|---|---|---|
| GET | `/products` | backend-configured points product; current defaults are 50 points / 990 fen |
| POST | `/orders` | `{ productCode: "POINTS_50", voiceId? }` -> order + JSAPI payment params |
| GET | `/orders/:id` | user-owned order and points-grant status |
| POST | `/orders/:id/refresh` | active WeChat query and convergence |
| POST | `/payments/wechat/notify` | raw-body verified WeChat notification |
| GET | `/orders` | current user's orders |
| GET | `/points/ledgers` | current user's points ledger |
| GET | `/quota-ledgers` | temporary compatibility alias |
| DELETE | `/account` | idempotent deletion workflow |

## Error codes

`UNAUTHORIZED`, `INVALID_MEDIA`, `CLIP_TOO_SHORT`, `CONSENT_REQUIRED`, `VOICE_NOT_READY`, `PREVIEW_NOT_PLAYED`, `PREVIEW_RETRY_EXHAUSTED`, `GENERATION_IN_PROGRESS`, `POINTS_EXHAUSTED`, `CONTENT_BLOCKED`, `PROVIDER_FAILED`, `ORDER_NOT_FOUND`, `PAYMENT_MISMATCH`, `INTERNAL_ERROR`. `QUOTA_EXHAUSTED` is accepted only as a temporary compatibility code during migration.
