# UI Reference Inventory

This inventory is the visual source map for the native WeChat mini-program. The PRD and API/page contracts remain authoritative for behavior; the images below are authoritative for the intended visual direction of the mapped state.

## Reference map

| Ref | File | Target page/state | Acceptance anchors |
| --- | --- | --- | --- |
| UI-01 | `docs/UI/ChatGPT Image 2026年8月21日 14_41_13 (1).png` | `pages/home/index` | Brand heading, create card, recent READY voices only, three native tab-bar destinations, generous white-space and violet accent. |
| UI-02 | `docs/UI/ChatGPT Image 2026年8月21日 14_41_14 (2).png` | `pages/voice/workbench` mode chooser | Two clearly separated choices: conversation and exact speech; quota-cost note remains visible. |
| UI-03 | `docs/UI/ChatGPT Image 2026年8月21日 14_41_14 (3).png` | `pages/create/progress` | Prominent processing state, understandable stage list, progress/status feedback and 1-3 minute expectation. Do not fabricate provider percentage if the API has none. |
| UI-04 | `docs/UI/ChatGPT Image 2026年8月21日 14_41_15 (4).png` | `pages/voice/workbench` conversation state | Selected voice and remaining quota in header, alternating message cards, playable AI audio, fixed composer/action area. Generated output must be labelled as AI generated/AI reply. |
| UI-05 | `docs/UI/ChatGPT Image 2026年8月21日 14_41_15 (5).png` | `pages/create/select-video` | Album/video source switch, duration on candidates, one selected item, persistent selected-count/next action. Product validation remains 12-60 seconds. |
| UI-06 | `docs/UI/ChatGPT Image 2026年8月21日 14_41_16 (6).png` | `pages/create/preview` READY state | Voice identity, preview player and canonical preview sentence, primary accept/free-trial action, retry action and pricing disclosure. Accept stays disabled until playback finishes. |
| UI-07 | `docs/UI/ChatGPT Image 2026年8月21日 14_41_17 (7).png` | `pages/create/select-clip` | Video preview, waveform-style range control, explicit start/end and chosen duration, next action. Enforce 10-30 seconds. |
| UI-08 | `docs/UI/ChatGPT Image 2026年8月21日 14_41_18 (8).png` | `pages/voice/workbench` exact-speech state | Text input with character counter, generate action, persistent latest playable/downloadable result and quota-cost note. The latest success must remain visible at quota zero. |
| UI-09 | `docs/UI/ChatGPT Image 2026年8月21日 14_41_19 (9).png` | `pages/create/voice-profile` | Name, three permission types (self/other/minor), agreement checkbox and dynamic server-provided confirmation/consent step. Do not reduce authorization to a client-only checkbox. |
| UI-10 | `docs/UI/ChatGPT Image 2026年8月21日 14_45_07 (1).png` | Quota exhausted modal in workbench | Dimmed retained workbench/draft, fixed ¥9.9/10 purchase CTA, explicit cancel/close. Show only after the next active request receives `QUOTA_EXHAUSTED`. |
| UI-11 | `docs/UI/ChatGPT Image 2026年8月21日 14_45_08 (2).png` | Purchase detail sheet/page | One fixed 10-output product at ¥9.9, 180-day validity disclosure, no auto-renew, agreement/privacy links and single purchase CTA. Server order refresh is authoritative after payment. |

## Pages without a dedicated visual reference

The following pages inherit the same visual system (white translucent cards, deep navy text, soft violet gradients, rounded controls, native safe-area spacing) while following the PRD and page-flow contract:

- `pages/login/index`
- `pages/voices/index`
- `pages/account/index`
- `pages/voice/settings`

Their final verdict is functional and consistency-based; they must not be marked as a pixel match to a nonexistent reference.

## Final page-click evidence set

The final UI acceptance run must capture stable screenshots and interaction evidence for:

1. Login and authenticated home.
2. Video selection, invalid-duration rejection and valid selection.
3. Clip selection with 10-second and 30-second boundaries.
4. All three permission types and their server canonical confirmation text.
5. Upload/processing, READY preview, disabled accept before playback, enabled accept after playback and retry.
6. Conversation and exact-speech modes, playable AI-labelled results and quota transition from one to zero.
7. A further generation attempt producing the quota modal while preserving the draft.
8. Purchase initiation, cancel/failure without quota mutation, and server-confirmed success when a safe test payment route is available.
9. My Voices loading/empty/processing/failed/ready states, settings and delete confirmation.
10. Account logout and account-delete confirmation.

Evidence must also record console errors, failed network requests and whether each flow used a real backend or a clearly labelled local/test substitute.
