# Backend Live Full-flow Acceptance

Date: 2026-08-21
Status: `PASS_WITH_LIMITATION`

## Runtime

- Isolated PostgreSQL 16 cluster: `.runtime/postgres-data`, `127.0.0.1:54329`.
- Compiled NestJS API: `127.0.0.1:8787`.
- Compiled Node Worker: foreground controlled session.
- Voice provider: real Aliyun Voice Enrollment + `cosyvoice-v3.5-flash`.
- Input: user-authorized `老人和狗.mp4`, locally extended to the 12-second product input minimum; selected voice clip remained original 0-10 seconds.

## Exercised flow

1. Mock WeChat code login through real HTTP API.
2. Create voice draft.
3. Reject multipart upload without `video/mp4` as `INVALID_MEDIA`.
4. Upload correct 12-second video and record SHA-256/metadata.
5. Save 0-10 second clip.
6. Save OTHER permission and exact canonical consent version/text hash.
7. Enqueue PROCESS_VOICE.
8. Worker claims job with `FOR UPDATE SKIP LOCKED`.
9. FFmpeg extracts 24kHz mono PCM16 reference.
10. Aliyun voice enrollment reaches READY and fixed preview is generated.
11. Source video is physically deleted and DB media status becomes DELETED.
12. Accept preview; account receives exactly one trial quota.
13. Submit exact-speech text `请照顾好自己，我们都很想你。`.
14. Worker generates Aliyun audio, saves private media and transactionally consumes trial quota.
15. Message becomes READY, text remains exact, quota becomes zero.
16. Next generation returns HTTP 402 `QUOTA_EXHAUSTED`, product 990 fen / 10.
17. Signed media playback initially exposed a Windows `sendFile` 404; repaired to Node stream pipeline and reverified.
18. Repaired signed URL downloads a 4.29-second, 24kHz, mono PCM16 WAV.

## Evidence

- Output bytes: 205,964.
- Output SHA-256: `1CB204ABE59BD979191FBC1863F58E73DE3A8A8E54FD9E837C5F444A6CD3709D`.
- Private local output: `.runtime/backend-e2e/generated.wav` (ignored, not publishable).
- Machine summary: `docs/auto-execute/results/backend-live-flow.json`.

## Limitation

This proves the live backend/DB/Worker/provider flow, not the native mini-program click flow. Frontend ZIP integration, WeChat DevTools screenshots, console/network evidence, real WeChat login and real payment remain separate required gates.

## 08/23/2026 09:00:49
Full-flow smoke is project-specific. Populate 03-surface-map.md and implement flow tests where tooling exists.


## 08/23/2026 09:01:51
Full-flow smoke is project-specific. Populate 03-surface-map.md and implement flow tests where tooling exists.

