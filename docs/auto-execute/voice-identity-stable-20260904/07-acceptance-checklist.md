# Acceptance Checklist

- [x] Missing runtime/context locks, never fail-opens.
- [x] Child registered clone locks like adult registered clone.
- [x] Model equals enrollment target model.
- [x] Seed 0, PlainText, SSML false across all five turns.
- [x] No rate/pitch/volume in stable request.
- [x] No relationship/persona/delivery internals in stable request.
- [x] Instruction absent when unused and present only from static allowlist.
- [x] OFF default after owner calibration; SAFE_ONLY/BOUNDED_ALL require explicit opt-in.
- [x] Provider/model/voice fingerprint identical across five turns.
- [x] Exactly five calls for five turns.
- [x] Owner listening pack exists.
- [x] Ten distinct recent real-dialogue replies generated in OFF mode with exactly ten calls.
- [ ] T1 >= 83; T2-T5 no more than 3 below T1.
- [ ] No turn judged a different person or obvious age/gender/accent change.
- [ ] At least 3 of 4 emotions recognized blind.

Engineering verdict: PASS. Product auditory verdict: pending owner listening.
