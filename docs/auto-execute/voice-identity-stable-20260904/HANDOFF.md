# Handoff

- Run: `voice-identity-stable-20260904`
- Goal: stable cloned-voice identity with bounded emotion and test evidence before 08:00.
- Source spec: user pasted ChatGPT Pro review.
- Safe checkpoint: `main@dbd5f4bde2e80ec77477d718abe243292103cf77` (local only).
- Current phase: engineering complete; owner blind listening pending.
- Local main checkpoint: `dbd5f4bde2e80ec77477d718abe243292103cf77`, not pushed.
- Implemented after checkpoint: text expressibility, fail-closed stable runtime, bounded emotion compiler, strict provider DTO, pinned route, Aliyun stable adapter, both runner integrations, deployment default, CloudBase provider/targetModel RPC input, and five-turn evidence harness.
- Targeted evidence: final stable set 37/37; architecture review PASS; QA automation PASS.
- Full evidence: workspace typecheck PASS; workspace tests PASS (cloudbase-runtime 4/4, mini-program 91/91, API 50 pass + 2 skipped, Worker 225 pass + 2 skipped); workspace build PASS.
- Live evidence: existing `本人身份证` SELF binding, model `cosyvoice-v3.5-plus`; OFF/SAFE_ONLY/BOUNDED_ALL each exactly five successful calls; no new enrollment and no mini-program points.
- Current production owner pack: `work/acceptance/self-real-dialogue-off-ten-20260905`; it uses ten recent distinct real chat replies in OFF mode. Earlier SAFE_ONLY and BOUNDED_ALL packs remain diagnostic only.
- Traceability: calls/manifests record model, redacted voice hash, PlainText, SSML=false, seed=0, format, sample rate, language hints, provider contract hash, and stable identity fingerprint; no plaintext voice ID persisted.
- Open gate: familiar-listener scores for ten real-dialogue OFF samples and `DRIFT_AT_T2` decision.
- Formal gate: `final-gate-project/docs/auto-execute/machine-summary.json` = `PASS_WITH_LIMITATION`, acceptance confidence 0.75, no hard failure or in-scope gap.
- Preserve all unrelated dirty files.
- No production deploy/push without explicit authorization.
