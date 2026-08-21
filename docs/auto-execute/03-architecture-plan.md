# Architecture Plan

```text
apps/miniprogram (WXML/WXSS/TypeScript)
        |
        | HTTPS + Bearer session + Idempotency-Key
        v
apps/api (NestJS)
  auth | voices | consents | quota | orders | messages | account
        |
        +---- PostgreSQL / Drizzle ORM (authority)
        +---- private media service (MVP: local filesystem; OSS adapter is a later deployment option)
        +---- WeChat Pay v3
        |
        v
apps/worker (custom PostgreSQL lease/heartbeat job loop)
  FFmpeg -> quality -> VoiceProvider -> output storage -> transactional completion
        |
        +---- Aliyun Voice Enrollment / CosyVoice 3.5 Flash

tools/voice-prototype
  local technical comparison only; never serves product traffic
```

## Authority rules

- PostgreSQL is the sole authority for users, permissions, statuses, orders and quotas.
- Realtime/event delivery may invalidate client state only; clients re-fetch authoritative GETs.
- The mini-program never receives provider voice IDs, payment secrets or cloud credentials.
- Audio is considered generated only after provider output is saved and the DB success transaction commits.
- Preview playback starts when the authenticated signed preview stream is opened. Completion is accepted only after the server-observed elapsed time reaches the current preview duration and the client reports the player's `ended` event.
- Local filesystem media is the single-host MVP implementation, not a claim of multi-instance object-storage durability.
