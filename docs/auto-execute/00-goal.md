# Goal

## 2026-08-24 pure WeChat Cloud risk-first migration (current authority)

- Preserve the complete CloudBase Run baseline at `67f92ac` on local `main` and `codex/aivoice-pre-pure-cloud-20260824`.
- Before changing the remaining product surface, prove the four architecture risks that could make a no-ICP deployment unusable: private HTTP Function invocation and OpenID identity, domainless media upload/playback, stateless job dispatch/recovery, and WeChat Pay callback/grant idempotency.
- Reuse CloudBase PostgreSQL REST/RPC, existing points/order transactions, the event Worker, Aliyun CosyVoice and multi-speaker detection.
- Do not migrate the other client API calls until these four risk gates have executable evidence.
- Do not claim production PASS until a real mini-program invocation, authorized video upload/audio playback, and real small-amount payment callback have run in the live WeChat environment.

## 2026-08-22 CloudBase production refactor (current authority)

- Preserve the complete pre-refactor baseline at commit `423ab2a` on `main` and `codex/aivoice-pre-cloudbase-rpc-20260822`.
- Replace the deployed embedded PostgreSQL and container-local media with CloudBase PostgreSQL REST/RPC and CloudBase PG cloud storage.
- Keep CloudBase Run as the low-capacity public API and WeChat Pay callback service.
- Run long CosyVoice/FFmpeg/delete work in an event-invoked Cloud Function; no client or API HTTP request waits for job completion.
- Preserve every existing product flow and page. Invitation rewards and a visual operations admin remain deferred.
- Payment acceptance requires one atomic database RPC for paid-order state, the 50-point grant and its ledger, shared by callback and active query-order refresh.

## 2026-08-22 points contract (current authority)

- Points are account-level and shared by every authorized voice profile.
- A newly registered account receives 10 signup points exactly once.
- A successfully completed generation consumes 1 point exactly once; failed generations consume 0.
- The only MVP purchase product is 50 points for CNY 9.90, non-subscription, and it may be purchased repeatedly.
- Signup points, generation cost, package points, price and validity are backend-configurable. The mini-program never owns or invents a balance.
- Keep an `INVITE_GRANT` ledger source for a future invitation mechanism, but do not expose invitation UI or rewards in this delivery.

## 2026-08-21 local acceptance closure (current run)

- Page-click the `OTHER` and `MINOR` authorization variants and verify their server-canonical consent copy.
- Complete one real AI conversation through reply generation, cloned-voice audio playback, point debit, and a failure/no-debit check.
- Exercise My Voices and Voice Settings, including conversation clearing and delete confirmation behavior.
- Create a disposable, clearly named Aliyun test voice and then delete that exact provider voice plus its private local media; preserve evidence but no reusable voice asset.
- Replace placeholder agreement/privacy text with product-specific drafts and keep AI-generation disclosure visible. Legal review before public launch remains an external gate.

## Statement

基于 `nashide_ta_private_voice_wechat_mvp_prd_v0.4.md`，把已验证的阿里云 CosyVoice 声音复刻链路、从 `printersheet` 白名单迁移的微信登录/支付能力，以及由指定 ChatGPT Pro 交付的微信原生前端，集成为可运行、可验证的“那时的 TA”微信小程序 MVP。

## Project root and repository

- Local: `D:\lyh\agent\agent-frame\aivoice`
- Remote: `https://github.com/forwardFish/aivoice`
- Working branch: `codex/aivoice-cloudbase-rest-rpc`
- Preserved fallback branch: `codex/aivoice-pre-cloudbase-rpc-20260822` at `423ab2a`

## Sources

- `docs/nashide_ta_private_voice_wechat_mvp_prd_v0.4.md`
- `D:\lyh\agent\agent-frame\printersheet\ai-exam-miniapp`
- 用户指定的 ChatGPT Pro 前端会话
- 已验证的 `src/aivoice/providers/aliyun.py` 技术链路

## Success criteria

1. 微信原生小程序覆盖 PRD P0-P9 页面与首次体验、回访、声音管理路径。
2. 真实微信登录代码交换 openid，密钥只在服务端。
3. 视频上传、片段选择、动态声音权限确认、音色注册和固定试听可串联。
4. 新账号注册时由服务端幂等赠送 10 积分；接受试听不再赠送积分。
5. 对话和“说一句”共用账号积分；只有成功输出才扣 1 积分。
6. 余额为 0 时下一次主动生成才出现 ¥9.9/50 积分购买框。
7. 微信支付 API v3 回调、主动查单、金额/openid 校验与积分入账幂等。
8. PostgreSQL 保存用户、声音、授权、媒体、音色、会话、消息、订单、积分账户、积分流水和任务。
9. 原视频、参考样本、生成音频和供应商音色遵循 PRD 生命周期及删除策略。
10. 前端、后端、合同、数据库、集成、声音与安全验证均有证据。
11. 11 张 UI 参考状态均映射到真实页面/组件；登录页存在，独立积分购买页补齐，主要差异有开发者工具截图和比较证据。
12. 本地可验证功能覆盖登录边界、SELF/OTHER/MINOR、对话、说一句、删除、零积分购买触发与草稿保留；真实 AppID 和真实扣款明确作为外部凭据门禁。
13. CloudBase PostgreSQL REST/RPC 成为生产唯一持久数据路径，生产容器不再启动嵌入式 PostgreSQL。
14. CloudBase PG 云存储成为生产媒体路径，100MB 视频使用签名 URL 直传而不是经过 Run 请求体。
15. 支付回调和主动查单并发时只产生一次 `PURCHASE_GRANT` 和一次 `+50`，并通过真实 CloudBase RPC 证据证明。
16. 超过 60 秒的 FFmpeg/CosyVoice 任务由异步云函数执行并可重试，API 只创建持久任务并返回 202。

## Out of scope

实时语音通话、长期人格记忆、公开音色、音频下载、外呼、开放 API、自动说话人身份判定、邀请积分奖励和可视化运营后台。CloudBase 云存储、部署和微信支付现在属于本次范围。

## Stop conditions

仅在需要新的账号凭据、真实支付、生产部署、验证码/OTP、不可逆数据操作，或同一阻断连续五轮无法修复时停止。

## Final verdict

`PASS_WITH_LIMITATION`: CloudBase REST/RPC, private storage, on-demand Function Worker, real Aliyun cloning, exact speech, AI chat, point debits, payment idempotency and provider/storage deletion passed on the live environment. Real WeChat login, merchant public-key configuration, a real charge/callback, domain allowlists, device testing and platform review remain manual launch gates.
