# Aivoice Native Mini-program Frontend Brief

## Ownership

You own only `apps/miniprogram/` and frontend delivery documents. Do not implement or modify backend services, databases, payment secrets, cloud providers, or Python tooling.

## Source priority

1. `docs/nashide_ta_private_voice_wechat_mvp_prd_v0.4.md`
2. `docs/auto-execute/05-api-contract.md`
3. `docs/auto-execute/04-page-flow.md`
4. `docs/auto-execute/13-frontend-backend-contract-map.md`
5. Printersheet reference files for patterns only

## Architecture

- Native WeChat mini-program
- TypeScript
- WXML / WXSS
- Native `tabBar`: Home, My Voices, Account
- Custom navigation component allowed
- No React, Vue, Taro, uni-app or webview

## Required pages

- `pages/home/index`
- `pages/create/select-video`
- `pages/create/select-clip`
- `pages/create/voice-profile`
- `pages/create/progress`
- `pages/create/preview`
- `pages/voice/workbench`
- `pages/voices/index`
- `pages/account/index`
- `pages/voice/settings`
- `pages/login/index`

## Non-negotiable product behavior

- Home shows only create entry and recent READY voices.
- Video is 12-60 seconds; user selects a 10-30 second clip.
- Permission type is self/other/minor and changes the exact confirmation text.
- Preview acceptance stays disabled until playback finishes. On the audio player's `ended` event call `POST /voices/:id/preview-played`; the server rejects early acceptance with `PREVIEW_NOT_PLAYED`.
- Preview offers only accept or retry; no similarity survey. Free retry is limited to one and may return `PREVIEW_RETRY_EXHAUSTED`.
- Accepting preview leads to workbench and may grant one account-level trial generation.
- Chat and exact-speech share quota and use text input only.
- Successful last generation remains visible/playable when quota becomes zero.
- Purchase modal appears only after the next active send/generate action receives `QUOTA_EXHAUSTED`.
- Purchase UI is one fixed product: ¥9.9 / 10 outputs, no auto-renew, failures do not consume quota.
- Payment success is not authoritative until server order refresh says quota was granted.
- Preserve the user's draft through purchase/cancel/refresh.
- Every generated audio result visibly says AI generated/AI reply.
- Provider voice IDs and all secrets must never appear in frontend code or storage.

## Reusable printersheet patterns

Use the attached reference only for:

- request/auth/upload wrappers;
- `wx.login`, chooseAvatar and nickname flow;
- `wx.requestPayment` and server order refresh;
- safe redirect handling;
- custom navigation/status bar measurements.

Do not reuse points, memberships, plan cards, local purchase authority, CloudBase contracts, product branding or legacy API routes.

## Required states

Every API-backed page must implement loading, empty, recoverable error and success. Creation progress must represent DRAFT, UPLOADING, QUEUED, PROCESSING, READY, FAILED and DELETING where relevant.

## API

Implement a single typed API client from `05-api-contract.md`. Upload uses the `uploadUrl` and multipart field name returned by `upload-policy`, then confirms the returned `mediaId`. Use Bearer tokens and generate UUIDv4-like idempotency keys for message/exact-speech calls. On 401 clear the token and redirect to login. Never mutate quota locally; always use server responses.

## Delivery

Return one ZIP containing:

```text
apps/miniprogram/
docs/frontend-delivery-report.md
docs/frontend-api-usage.json
```

Exclude `.env*`, secrets, node_modules, dist, caches and unrelated backend code. The report must list pages, interactions, known gaps, checks run and exact ZIP root. Do not return only screenshots or prose; the source ZIP is required.
