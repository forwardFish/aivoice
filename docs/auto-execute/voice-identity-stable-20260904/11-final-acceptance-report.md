# Stable Voice Final Acceptance Report

Overall verdict: `PASS_WITH_LIMITATION`.

## Delivered

- Stable cloned-voice identity baseline with fail-closed locking.
- Fixed provider, region, enrollment model, voice binding, seed, plaintext mode, SSML setting, format, sample rate, and policy fingerprint.
- OFF / SAFE_ONLY / BOUNDED_ALL bounded emotion policy with a static allowlist.
- Strict Aliyun DTO and transport mapping.
- Pinned single registered-provider route with no model/provider fallback, companion generation, or reference-audio resolution.
- Text-generation guidance that carries emotion in wording and punctuation without TTS stage directions.
- Existing CloudBase RPC extended with provider and enrollment model; no schema expansion.
- Five-turn contract tests, live generation script, traceable manifests, prosody reports, and owner scoring packs.

## Automated gates

- Workspace typecheck: PASS.
- Workspace tests: PASS.
  - CloudBase runtime: 4/4.
  - Mini-program: 91/91.
  - API: 50 passed, 2 pre-existing integration skips.
  - Worker: 225 passed, 2 pre-existing integration skips.
- Workspace build: PASS.
- Final focused stable suite: 37/37.
- API stable migration test: PASS.
- Architecture review: PASS.
- QA automation review: PASS.
- Auto-execute final gate: PASS_WITH_LIMITATION, acceptance confidence 0.75, zero hard or in-scope gaps.

## Live provider evidence

- Source: existing mini-program profile `本人身份证`, SELF, 43, MALE.
- Stored provider/model: `aliyun-cosyvoice` / `cosyvoice-v3.5-plus`.
- No new enrollment; plaintext voice ID was never written to evidence files.
- OFF: 5/5 successful, zero instructions.
- SAFE_ONLY: 5/5 successful, one low-risk delight instruction.
- BOUNDED_ALL: 5/5 successful, four bounded instructions.
- Every mode: one identity fingerprint, seed 0, PlainText, SSML false, WAV, 24 kHz, mono, exactly five calls, no mini-program points.

## Objective risk observation

- SAFE_ONLY T4 delight changed median pitch from OFF 98.8 Hz to 137.9 Hz and shortened duration from 3.01 s to 2.13 s.
- BOUNDED_ALL also produced larger timing or pitch-range changes on T2 and T5.
- These are not proof of identity drift, but they make SAFE_ONLY the only production candidate and BOUNDED_ALL a stress-only pack until the owner listens.

## Open owner gate

Use `work/acceptance/stable-voice-five-turn-20260904/owner-production-safe-only` first. Required PASS:

- T1 at least 83.
- T2-T5 each no more than 3 points below T1.
- No turn judged a different person.
- No obvious age, gender, or accent change.
- No `DRIFT_AT_T2`.

The code is not deployed and CloudBase migration `0022` is not applied. Production mutation remains outside the authorized scope.

## Why Not Pure PASS?

The familiar owner has not yet completed the five-turn auditory scoring sheet. Automated request stability, live synthesis, contract, secret, report-integrity, and E2E gates pass, but they cannot prove that every turn still sounds like the same real person.

Formal gate evidence: `final-gate-project/docs/auto-execute/final-convergence-report.md`.
