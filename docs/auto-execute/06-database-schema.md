# Database Schema

PostgreSQL via Drizzle ORM.

| Table | Key fields / constraints |
|---|---|
| `users` | id, openid UNIQUE, unionid, profile, trial grant/consume timestamps, deleted_at |
| `sessions` | token_hash UNIQUE, user_id, expires_at, revoked_at |
| `voice_profiles` | user_id, name, permission_type, status, trial/paid quota, provider/model, last_used_at |
| `media_assets` | user_id, voice_id, kind, private object key, duration, hash, deletion status |
| `consent_records` | voice_id, permission_type, version, text_hash, confirmed_at |
| `voice_models` | voice_id UNIQUE, provider_voice_id encrypted, target_model, provider status |
| `conversations` | voice_id UNIQUE, cleared_at |
| `messages` | conversation_id, user_id, idempotency_key, mode, status, text, output asset |
| `orders` | order_no UNIQUE, user_id, voice_id, product, 990 fen, status, transaction_id UNIQUE, quota_granted_at |
| `quota_ledgers` | user_id, voice_id, order/message refs, bucket, type, amount, balance_after |
| `jobs` | unique active constraints, type, status, attempts, payload, lease/heartbeat, error |

Required constraints:

```text
UNIQUE(users.openid)
UNIQUE(messages.user_id, messages.idempotency_key)
UNIQUE(orders.order_no)
UNIQUE(orders.transaction_id) WHERE transaction_id IS NOT NULL
UNIQUE(quota_ledgers.type, quota_ledgers.order_id) for PURCHASE_GRANT
UNIQUE(quota_ledgers.type, quota_ledgers.message_id) for GENERATION_CONSUME
```

All trial grants, payment grants and successful consumes execute inside DB transactions with row locks or serializable conflict handling.
