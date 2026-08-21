# Database Schema

PostgreSQL via Drizzle ORM.

| Table | Key fields / constraints |
|---|---|
| `users` | id, openid UNIQUE, unionid, profile, trial grant/consume timestamps, deleted_at |
| `sessions` | token_hash UNIQUE, user_id, expires_at, revoked_at |
| `voice_profiles` | user_id, name, permission_type, status, provider/model, last_used_at; legacy quota columns are compatibility-only |
| `point_accounts` | user_id PRIMARY KEY, balance, signup_granted_at, non-negative check |
| `point_ledgers` | user_id, optional voice/order/message refs, type, signed amount, balance_after, request_key |
| `media_assets` | user_id, voice_id, kind, private object key, duration, hash, deletion status |
| `consent_records` | voice_id, permission_type, version, text_hash, confirmed_at |
| `voice_models` | voice_id UNIQUE, provider_voice_id encrypted, target_model, provider status |
| `conversations` | voice_id UNIQUE, cleared_at |
| `messages` | conversation_id, user_id, idempotency_key, mode, status, text, output asset |
| `orders` | order_no UNIQUE, user_id, optional voice context, product, amount/points snapshot, status, transaction_id UNIQUE, points_granted_at; legacy quota fields remain compatibility aliases |
| `quota_ledgers` | legacy read-only history during migration |
| `jobs` | unique active constraints, type, status, attempts, payload, lease/heartbeat, error |

Required constraints:

```text
UNIQUE(users.openid)
UNIQUE(messages.user_id, messages.idempotency_key)
UNIQUE(orders.order_no)
UNIQUE(orders.transaction_id) WHERE transaction_id IS NOT NULL
UNIQUE(point_accounts.user_id)
UNIQUE(point_ledgers.idempotency_key)
UNIQUE(point_ledgers.type, point_ledgers.order_id) for PURCHASE_GRANT
UNIQUE(point_ledgers.type, point_ledgers.message_id) for GENERATION_CONSUME
```

Signup grants, payment grants and successful consumes execute inside DB transactions with row locks or serializable conflict handling. Existing users are migrated without inventing a second signup grant. `INVITE_GRANT` is a reserved ledger type only; invitation behavior is out of scope.
