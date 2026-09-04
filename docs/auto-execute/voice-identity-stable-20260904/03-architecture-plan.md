# Architecture Plan

## Stable path

1. Text model still emits the existing four-field `VoiceDeliveryPlan`.
2. `stable-voice.ts` compiles it through a versioned static allowlist.
3. Stable request contains only provider-supported identity-stable fields plus optional branded allowlisted instruction.
4. Route is pinned to one provider/model/voice ID; no fallback or companion upgrade.
5. Diagnostic fields and identity fingerprint are logged but never enter the provider request.

## Compatibility

- No schema or public API change.
- Existing encrypted provider binding remains authority.
- Existing local PostgreSQL and CloudBase runners use the same compiler.
- Existing non-clone/single-turn legacy path may remain only when explicitly selected; missing runtime metadata fails closed.
