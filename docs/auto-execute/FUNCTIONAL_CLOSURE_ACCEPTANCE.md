# Functional and Legal Closure Acceptance

Date: 2026-08-21
Verdict: `PASS_WITH_LIMITATION`

## OTHER and MINOR authorization

- `OTHER` page selected “他人的声音”, displayed the matching authorization text, and matched the server canonical consent `voice-consent-v0.4`.
- `MINOR` page selected “未成年人的声音”, displayed the guardian authorization text, and matched the server canonical consent `voice-consent-v0.4`.
- The matching consent records were persisted by the API. Test-only drafts created during repeated screenshot runs were subsequently submitted to the normal delete workflow.

Evidence:

- `screenshots/functional-closure/consent-other.png`
- `screenshots/functional-closure/consent-minor.png`
- `screenshots/functional-closure/functional-closure-ui.json`

## Real AI conversation

- Existing real Aliyun voice `主流程测试声音` received the user text `今天过得怎么样？请用一句温柔的话回答我。`.
- Qwen returned `今天有你的牵挂，心里暖暖的。`.
- CosyVoice produced a 3.89-second playable audio result.
- The mini-program conversation page rendered one USER message and one READY ASSISTANT message with an `AI回复` audio player. Playback reached `playing=true`, `00:01`, about 36% progress with no console or page exception.
- Account points changed from 50 to 49 exactly once.
- A controlled blocked request returned HTTP 422 / `CONTENT_BLOCKED`; points stayed at 49.
- A second fully disposable real provider run independently proved create -> accept preview -> chat -> audio -> success debit -> blocked/no-debit -> delete; see `results/live-chat-delete-check.json`.

Page runtime/playback evidence: `results/chat-ui-live.json`.

## My Voices and Voice Settings

- My Voices rendered READY, preview-pending, and DRAFT state cards with the account points value.
- Voice Settings loaded name, permission type, status and points from the server.
- Actual clear-conversation confirmation completed; the following authoritative conversation GET returned `messages=[]`.
- Delete first/second confirmation cancel paths made zero delete requests and kept the existing reusable test voice READY.

Evidence:

- `screenshots/functional-closure/voices-index.png`
- `screenshots/functional-closure/voice-settings.png`
- `screenshots/functional-closure/voice-settings-after-cancel.png`
- `screenshots/functional-closure/functional-closure-ui.json`

## Real provider deletion

- A new disposable voice named `删除验收专用-20260821` was created from an authorized, locally derived 12-second sample and reached provider/model READY.
- Voice Settings submitted the two-confirmation delete path for exact voice id `fd216ead-2909-4c34-bebf-71067f0f1784`.
- Final database lifecycle: voice `DELETED`, provider model `DELETED`, delete job `SUCCEEDED`, empty error code/message.
- SOURCE_VIDEO, REFERENCE_AUDIO and PREVIEW_AUDIO records are `DELETED`; the reference and preview files were checked under the resolved media root and do not exist.
- No provider voice identifier was printed or exposed.

Additional reproducible evidence: `results/live-chat-delete-check.json` and `scripts/acceptance/live-chat-delete-check.cjs`.

## Agreements, privacy and AI labels

- Added dedicated Service Agreement, Privacy Policy and AI Generation Label pages and linked them from login, purchase and account pages.
- Privacy copy now distinguishes clearing conversation context from physical deletion, identifies voice/biometric and under-14 risks, requires separate/guardian consent, and states the actual local/provider deletion behavior.
- Visible labels remain next to generated text/audio (`AI生成` / `AI回复`).
- Generated WAV message `2fe02592-7dd7-44a2-b65d-5ca2145f5b5e` was generated through real Aliyun after the change and contains exactly one RIFF `AIGC` chunk. It has `Label=1`, producer/propagator `那时的TA`, and ProduceID/PropagateID equal to the message id. The audio remained playable at 4.53 seconds and points changed 48 -> 47.

Evidence:

- `screenshots/functional-closure/legal-terms.png`
- `screenshots/functional-closure/legal-privacy.png`
- `screenshots/functional-closure/legal-ai.png`
- `docs/legal/COMPLIANCE_DRAFT_NOTES.md`
- Worker AIGC unit/integration tests.

## Why not pure PASS?

- Legal pages are implementation drafts, not the operating entity's final lawyer-reviewed documents.
- Formal operator/contact/complaint data, WeChat privacy declaration, applicable AI/deep-synthesis filing information, real AppID, real merchant payment, production deployment and device acceptance remain launch gates.
- UI screenshots prove the functional states above, but do not constitute pixel-perfect comparison for every historical UI reference.
