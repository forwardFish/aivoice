# Test Matrix

| Test | Scope | Expected |
|---|---|---|
| fail-closed matrix | null/undefined, multi-turn, registered child, SELF | locked |
| allowlist matrix | 10 acts x intensity 0/1/2 x 3 modes | exact cue count/reason |
| leak guard | persona/timbre/age/relationship/stage directions | rejected |
| model capability | supported/unsupported clone models | instruction allowed/omitted |
| binding mismatch | enrolled model != synthesis model | hard failure |
| provider payload | forbidden keys | absent/rejected |
| five-turn contract | casual/boundary/hurt/delight/tired | same fingerprint, five calls |
| text sanitizer | SSML/provider tags/stage directions | stripped/fails empty |
| full regression | workspace | zero task-caused failures |
| audio pack | OFF, SAFE_ONLY, BOUNDED_ALL | five playable PCM16/24kHz/mono WAVs per mode |
| production owner pack | SAFE_ONLY | reference plus five anonymized files and scoring sheet |
| stress owner pack | BOUNDED_ALL | reference plus five anonymized files and scoring sheet |

Result: all automated rows PASS. Owner score rows remain pending.
