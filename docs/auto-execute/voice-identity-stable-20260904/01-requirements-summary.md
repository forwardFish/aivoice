# Requirements Summary

| ID | Priority | Requirement | Evidence |
|---|---|---|---|
| VIS-001 | P0 | identity lock fail closed and covers every registered clone/multi-turn voice | unit tests |
| VIS-002 | P0 | fixed identity baseline and voice/model match | core/compiler tests |
| VIS-003 | P0 | static bounded cue allowlist with OFF/SAFE_ONLY/BOUNDED_ALL | policy tests |
| VIS-004 | P0 | strict provider request omits semantic/acoustic leak fields | provider payload tests |
| VIS-005 | P0 | pinned single provider/model/voice route | coordinator tests |
| VIS-006 | P0 | five-turn identity fingerprint remains equal | integration test |
| VIS-007 | P1 | text carries emotion and strips SSML/stage/provider tags | text/compiler tests |
| VIS-008 | P0 | real five-audio listening pack and per-turn hard gate | audio manifest + owner review |

The owner acceptance rule is per-turn, not average-only: `DRIFT_AT_T2` fails the whole set.
