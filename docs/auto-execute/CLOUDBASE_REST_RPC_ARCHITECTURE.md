# CloudBase REST/RPC Architecture Contract

更新日期：2026-08-22

## 1. Contract Goal

本文件定义 `aivoice` 从“CloudBase Run + 嵌入式 PostgreSQL + 容器本地媒体 + 自轮询 Worker”迁移到“CloudBase Run API + CloudBase PostgreSQL REST/RPC + PG 云存储 + 事件型云函数 Worker + Aliyun CosyVoice + 微信支付”的唯一目标架构。

本合同覆盖：

- 微信登录
- 新用户注册送 10 积分
- 每次成功生成扣 1 积分，失败不扣
- `¥9.9 / 50 积分`
- 微信支付回调原始报文验签与解密
- 服务端主动查单
- 幂等
- 视频上传
- 声音克隆
- AI 对话
- 精确生成
- 播放
- 删除声音
- 删除账号
- 授权、法律、AIGC 标识
- 从当前 Drizzle / `pg` 直连迁移到 REST / RPC 的模块接口
- RPC 清单
- 权限模型
- 失败 / 补偿策略
- 部署配置
- 不回退旧架构的硬验证

本合同要求：

- 对外小程序 API 路由保持现有 `/v1` 契约稳定。
- 权威状态仍只认服务端，不认前端本地状态。
- 生产态禁止回退到嵌入式 PostgreSQL、容器本地媒体、长期轮询数据库 Worker。

## 2. Current Baseline And Why It Must Change

### 2.1 Current code authority

当前生产候选代码的业务权威在 PostgreSQL 表结构和事务逻辑：

- 用户、会话、积分、声音、媒体、授权、消息、订单、积分流水、任务全部在 `apps/api/src/db/schema.ts:69-248`。
- 登录时会 upsert 用户、赠送注册送积分、创建 session，见 `apps/api/src/auth/auth.service.ts:41-83`。
- 积分赠送、扣减、支付入账依赖 `BEGIN ISOLATION LEVEL SERIALIZABLE` 和 `FOR UPDATE`，见 `apps/api/src/quota/quota.service.ts:50-62`, `85-99`, `186-320`。
- 生成请求的幂等、余额校验、单声音单任务限制、消息入队都在事务里，见 `apps/api/src/messages/message.service.ts:37-107`。
- 声音处理、删除声音、删除账号依赖 `jobs` 表入队，见 `apps/api/src/voices/voice.service.ts:167-221`, `271-296` 和 `apps/api/src/account/account.service.ts:9-25`。

### 2.2 Current deployment is transitional, not durable

当前 CloudBase 部署文档已明确说明：

- CloudBase Personal PG 共享集群不提供当前代码所需的原始协议直连密码。
- 现运行容器为了兼容未改造的 Drizzle / `pg` 事务代码，使用嵌入式 PostgreSQL。
- 该嵌入式数据库是临时性的，不是生产持久化方案。
- 媒体仍在容器本地目录。

证据：

- `docs/deployment/CLOUDBASE.md:14`
- `docs/deployment/CLOUDBASE.md:49-50`
- `scripts/deploy/cloudbase-combined.mjs:91-95`

### 2.3 Current media plane is local-disk only

- 上传策略仍返回 `server-upload`，上传目标是 API 自己，见 `apps/api/src/media/media.service.ts:66-75`。
- 媒体上传落到本地文件系统，再写 `media_assets`，见 `apps/api/src/media/media.service.ts:78-118`。
- 播放签名 URL 最终读取本地文件，见 `apps/api/src/media/media.service.ts:137-167` 和 `apps/api/src/media/media.controller.ts:50-66`。
- Worker 直接读写本地 `MEDIA_LOCAL_ROOT`，见 `apps/worker/src/job-runner.ts:65-83`, `212-214`, `251-252`, `403-410`。

### 2.4 Current worker is table-polling, not event-driven

- Worker 通过 `FOR UPDATE SKIP LOCKED` 轮询 `jobs` 表抢占任务，见 `apps/worker/src/job-runner.ts:89-108`。
- 通过 `leased_until` 与 heartbeat 恢复租约，见 `apps/worker/src/job-runner.ts:124-133`。
- 这是数据库轮询泵，不是事件型云函数。

## 3. External API Contract To Preserve

对小程序保持现有 `/v1` 路由和服务端权威规则：

- 登录：`/v1/auth/wechat`
- 上传：`/v1/voices/:id/upload-policy`、`/v1/voices/:id/media-upload`、`/v1/voices/:id/media`
- 授权：`/v1/voices/:id/consents`
- 生成：`/v1/voices/:id/messages`、`/v1/voices/:id/exact-speech`、`/v1/messages/:id`
- 支付：`/v1/orders`、`/v1/orders/:id`、`/v1/orders/:id/refresh`
- 删除：`/v1/voices/:id`、`/v1/account`
- 微信支付回调：`/v1/payments/wechat/notify`

证据：

- `apps/api/src/auth/auth.controller.ts:9-31`
- `apps/api/src/voices/voice.controller.ts:10-95`
- `apps/api/src/messages/message.controller.ts:14-46`
- `apps/api/src/orders/order.controller.ts:10-53`
- `apps/api/src/payments/payment.controller.ts:7-20`
- `docs/frontend-api-usage.json:20-29`, `43`, `129`, `147`, `264`, `491`, `517`, `533`, `555`, `570`, `819`, `862`

前端约束也必须保留：

- 积分权威只认服务端，见 `docs/frontend-api-usage.json:20`
- 每次生成必须带新的 `Idempotency-Key`，见 `docs/frontend-api-usage.json:23` 和 `apps/miniprogram/services/api.ts:428-446`
- `wx.requestPayment` 成功后必须回服务端刷新订单与积分，见 `docs/frontend-api-usage.json:27`
- provider voice id 不得下发前端，见 `docs/frontend-api-usage.json:29`

## 4. Target Architecture

```text
WeChat Mini Program
  -> CloudBase Run API (NestJS, stateless)
      -> CloudBase PostgreSQL REST (simple reads / narrow writes)
      -> CloudBase PostgreSQL RPC (all transactional state changes)
      -> CloudBase PG Storage (private objects)
      -> WeChat Pay v3
      -> Cloud Function Event Trigger
  -> Event Cloud Function Worker
      -> CloudBase PostgreSQL RPC
      -> CloudBase PG Storage
      -> Aliyun CosyVoice / DashScope Chat
```

### 4.1 Authority split

- PostgreSQL remains the only authority for user, session, order, points, consent, message, job and deletion status.
- PG 云存储只保存二进制对象；对象是否有效、是否可见、是否已删除，仍由 PostgreSQL 状态控制。
- CloudBase Run API 是唯一对小程序暴露的业务入口。
- Cloud Function Worker 只消费事件并执行外部副作用；最终状态提交必须回到 PostgreSQL RPC。
- 微信支付结果只认“服务端回调成功”或“服务端主动查单成功”，不认 `wx.requestPayment` 本地成功。

## 5. Component Decisions

### 5.1 CloudBase Run API

CloudBase Run API 保留 NestJS 路由层，但移除 `DatabaseService` / `WorkerDatabase` 对 `pg` 与 Drizzle 连接的运行时依赖。

新增内部适配层：

- `PgRestClient`
  - 用于用户态只读查询、简单插入、简单更新
  - 只访问白名单表 / 视图
- `PgRpcClient`
  - 用于所有需要事务、幂等、锁、余额校验、任务入队、支付入账、删除申请的操作
- `PgStorageClient`
  - 用于创建上传票据、HEAD 校验对象、生成短时下载 URL、删除对象
- `EventTriggerClient`
  - 用于在任务入队后触发 Cloud Function Worker

### 5.2 CloudBase PostgreSQL REST

REST 只负责：

- `/me`、`/home`、`/voices`、`/voices/:id`、`/voices/:id/quota`
- `/voices/:id/conversation`
- `/messages/:id`
- `/orders`、`/orders/:id`
- `/points`、`/points/ledgers`
- `/quota-ledgers`
- `/media-playback-ticket` 之类的只读授权查询

实现规则：

- 读请求优先走只读视图，不直接拼多表业务 SQL。
- 只允许无事务副作用或单行级更新。
- 不允许把“扣积分”“支付入账”“任务入队”“删除申请”放在 REST 普通表写里。

### 5.3 CloudBase PostgreSQL RPC

RPC 负责所有必须原子化的行为。理由来自当前代码：

- 现有注册送分、生成扣分、支付入账都依赖串行化事务和行锁，见 `apps/api/src/quota/quota.service.ts:85-99`, `216-248`, `283-310`
- 现有生成请求依赖“幂等键去重 + 余额门槛 + 同声音单活跃任务 + conversation upsert + jobs 入队”同事务完成，见 `apps/api/src/messages/message.service.ts:42-107`
- 现有声音处理与删除也是“校验 + 状态变更 + jobs 入队”同事务，见 `apps/api/src/voices/voice.service.ts:167-221`, `271-296`

因此，CloudBase RPC 是本项目迁移的核心，不是补充件。

### 5.4 PG 云存储

对象布局继续沿用当前 object key 语义，但落到私有云存储而不是容器本地盘：

- `source/<userId>/<voiceId>/<uuid>.mp4`
- `reference/<userId>/<voiceId>.wav`
- `preview/<userId>/<voiceId>.wav`
- `generated/<userId>/<voiceId>/<messageId>.wav`

数据库里仍保留 `media_assets.object_key`、`mime_type`、`bytes`、`duration_ms`、`sha256`，见 `apps/api/src/db/schema.ts:114-133`。

### 5.5 Event Cloud Function Worker

Worker 改为事件型：

1. API 通过 RPC 写入 `jobs`
2. API 成功提交后立刻触发云函数事件
3. Worker 通过 RPC 领取任务、写 heartbeat、提交完成、提交失败
4. 另有定时恢复函数负责回收超时任务

Worker 继续负责：

- 提取片段
- 质量检查
- Aliyun CosyVoice 声音注册与合成
- DashScope Chat 回复
- AIGC WAV 元数据写入
- 删除 provider voice
- 删除云存储对象

#### 5.5.1 当前 CloudBase 环境的已验证调度方式

真实部署验证发现：该 CloudBase 环境会接受 SCF `Invoke Event` 请求，但不生成异步事件记录；平台 timer 触发器也不能作为唯一实时入口。因此生产实现采用以下兼容方式，且不改变职责边界：

- API 请求完成 RPC 入队后，只在进程后台发起 `InvokeFunction`，不等待 Worker 完成，小程序请求立即返回。
- Run API 的恢复调度器每 15 秒只扫描少量 `QUEUED`/超时任务并补发函数调用；它不执行 FFmpeg、模型或删除工作。
- Worker 仍然按任务弹性启动；`rpc_job_acquire` 租约确保两个 API 实例或重复补发不会重复执行。
- API 重启不会丢任务，数据库队列仍是权威；函数失败后由可用时间和最大重试次数控制恢复。

这是对当前 CloudBase 调用能力的部署适配，不是回退到 Cloud Run 常驻 Worker。真实 `PROCESS_VOICE`、生成和删除任务已经通过该方式完成。

#### 5.5.2 凭据边界限制

CloudBase 环境 API Key 的网关角色固定为 `service_role`，当前不能靠创建两枚同类型 Key 获得 `api_rpc_role`/`worker_rpc_role` 的数据库级分权。当前防线是：Key只进入Run/SCF服务端环境、所有 RPC 自检 claims、客户端不持有 Key。后续若平台提供可签发的自定义服务角色，应将 API 和 Worker 拆为不同角色；在此之前必须把服务端 API Key 视为管理员级秘密并定期轮换。

证据：

- `apps/worker/src/job-runner.ts:194-292`
- `apps/worker/src/job-runner.ts:370-410`
- `apps/worker/src/job-runner.ts:416-471`
- `apps/worker/test/points.integration.test.ts:61-204`
- `apps/worker/test/deletion.integration.test.ts:13-119`

## 6. Module Migration Map: Drizzle / pg -> REST / RPC

| Current Module | Current direct access | New access mode | Migration rule |
|---|---|---|---|
| `AuthService.login` | Drizzle insert users + point grant + sessions | RPC + REST | 用户 upsert / 注册送分走 RPC；session 持久化可走 RPC 或白名单 REST |
| `AuthService.authenticate` | Drizzle join `sessions` + `users` | REST view | 保留 Bearer token 模式，查询 session view |
| `QuotaService.ensureSignupGrant` | `pg` serializable txn | RPC | 必须迁移为 RPC |
| `QuotaService.completeMessage` | `pg` serializable txn | RPC | 必须迁移为 RPC |
| `QuotaService.grantPaidQuota` | `pg` serializable txn | RPC | 必须迁移为 RPC |
| `VoiceService.createDraft` | Drizzle insert | REST | 可保留简单插入 |
| `VoiceService.process` | `pg` txn + jobs enqueue | RPC | 必须迁移为 RPC |
| `VoiceService.deleteVoice` | `pg` txn + jobs enqueue | RPC | 必须迁移为 RPC |
| `MessageService.create` | `pg` txn + jobs enqueue | RPC | 必须迁移为 RPC |
| `OrderService.createOrder` | Drizzle insert | RPC | 为了 voice ready 校验、商品冻结、客户端请求幂等，改为 RPC |
| `WechatPayService.validateAndGrant` | Drizzle read + quota txn | RPC | 支付入账只走 RPC |
| `MediaService.registerSourceVideo` | 本地文件 + Drizzle insert | Storage + RPC/REST | 上传到 PG 云存储，确认入库 |
| `JobRunner.acquire/mark/heartbeat` | `pg` row locks | RPC | Worker 只能通过 RPC 读写任务 |

## 7. RPC Catalog

下表是必须提供的 RPC 最小清单。

| RPC | Caller | Purpose | Replaces |
|---|---|---|---|
| `rpc_auth_login_wechat` | API | upsert 用户、初始化 point account、幂等发放注册送分、返回用户快照 | `AuthService.login` + `QuotaService.ensureSignupGrant` |
| `rpc_auth_issue_session` | API | 写入 session hash 与过期时间 | `AuthService.login` |
| `rpc_auth_revoke_session` | API | 注销 token | `AuthService.revoke` |
| `rpc_voice_confirm_source_upload` | API | 校验上传对象并登记 `media_assets` | `MediaService.registerSourceVideo` / `confirmSourceMedia` |
| `rpc_voice_update_clip` | API | 保存 clip 并重置失败态 | `VoiceService.updateClip` |
| `rpc_voice_update_profile` | API | 更新名字与权限类型 | `VoiceService.updateProfile` |
| `rpc_voice_confirm_consent` | API | 记录 consent version / text hash / confirmedAt | `VoiceService.confirmConsent` |
| `rpc_voice_queue_processing` | API | 校验声音资料、授权、源视频是否齐备并入队 `PROCESS_VOICE` | `VoiceService.process` |
| `rpc_voice_mark_preview_played` | API | 校验试听已完整播放并打点 | `VoiceService.markPreviewPlayed` |
| `rpc_voice_accept_preview` | API | 确认接受试听结果、幂等处理免费资格 / 接受状态 | `VoiceService.acceptPreview` |
| `rpc_voice_retry_preview` | API | 扣减免费重试次数并重新入队声音处理 | `VoiceService.retryPreview` |
| `rpc_message_create` | API | 幂等创建生成任务、校验 READY、校验 accepted、校验余额、限制单声音单活跃任务、入队 `GENERATE_MESSAGE` | `MessageService.create` |
| `rpc_message_complete_success` | Worker | 写生成音频、扣 1 积分、写积分流水、更新 message READY | `QuotaService.completeMessage` / `JobRunner.completeGeneratedMessage` |
| `rpc_message_complete_failure` | Worker | 标记 FAILED 且不扣积分 | `QuotaService.failMessage` / `JobRunner.markFailed` |
| `rpc_message_complete_blocked` | Worker | 标记 BLOCKED 且不扣积分 | `JobRunner.markBlocked` |
| `rpc_order_create` | API | 冻结商品参数、创建订单、支持客户端请求幂等 | `OrderService.createOrder` |
| `rpc_order_attach_prepay` | API | 绑定 prepayId 和请求摘要 | `OrderService.attachPrepay` |
| `rpc_payment_apply_success` | API / Pay Callback | 校验订单未重复入账，更新 `PAID`、写 transactionId / paidAt / notifyDigest、增加 50 积分、写 PURCHASE_GRANT 流水 | `QuotaService.grantPaidQuota` |
| `rpc_payment_record_notify_event` | API / Pay Callback | 保存回调原始摘要、解密摘要、request id、重复次数 | 新增审计能力 |
| `rpc_voice_delete_request` | API | 标记声音 `DELETING` 并入队 `DELETE_VOICE` | `VoiceService.deleteVoice` |
| `rpc_voice_delete_finalize` | Worker | 声音、provider model、media 全部逻辑删除 | `JobRunner.deleteVoice` |
| `rpc_account_delete_request` | API | 标记用户 deleted、撤销 session、标记声音 DELETING、入队 `DELETE_ACCOUNT` | `AccountService.deleteAccount` |
| `rpc_account_delete_finalize` | Worker | 删除账号下所有媒体和 provider voice 并落库 | `JobRunner.deleteAccount` |
| `rpc_job_acquire` | Worker | 带租约领取任务 | `JobRunner.acquire` |
| `rpc_job_heartbeat` | Worker | 延长租约 | `JobRunner.heartbeat` |
| `rpc_job_mark_succeeded` | Worker | 完成任务 | `JobRunner.markSucceeded` |
| `rpc_job_mark_failed_or_retry` | Worker | 失败重试 / 终态失败 | `JobRunner.markFailed` |
| `rpc_job_requeue_stalled` | Timer Function | 恢复超时任务 | `recoverExpiredLeases` |

## 8. End-To-End Flow Contracts

### 8.1 微信登录 + 注册送 10 分

1. 小程序调 `/v1/auth/wechat`
2. API 仍在 CloudBase Run 内调用微信 `code2session`
3. API 调 `rpc_auth_login_wechat(openid, unionid, nickname, avatar_url)`
4. RPC：
   - upsert `users`
   - `INSERT ... ON CONFLICT DO NOTHING` 初始化 `point_accounts`
   - 若 `signup_granted_at IS NULL`，发 `10` 积分并写 `REGISTER_GRANT`
   - 返回最新用户与积分
5. API 生成随机 token，写 `rpc_auth_issue_session`
6. 响应 token + user + points

必须满足：

- 注册送分只发生一次
- 删除声音或再次建声音不能重新送分
- 注销账号是否允许再次送分不由前端决定，必须留给服务端反滥用策略

证据基线：

- `apps/api/src/auth/auth.service.ts:41-83`
- `apps/api/src/quota/quota.service.ts:85-99`
- `apps/api/src/quota/points.config.ts:16-23`
- `docs/nashide_ta_private_voice_wechat_mvp_prd_v0.4.md:4`

### 8.2 上传

1. 小程序调 `/v1/voices/:id/upload-policy`
2. API 向 PG 云存储申请短时上传凭证
3. 小程序直接上传到私有云存储
4. 小程序调 `/v1/voices/:id/media`
5. API 对对象执行 HEAD / metadata 校验
6. API 调 `rpc_voice_confirm_source_upload`
7. RPC 登记 `media_assets`，将对应 `voice_profiles.status` 置回 `DRAFT`

兼容要求：

- 维持现有三步式契约：拿策略、上传、确认
- 前端仍不直接拿长期云存储密钥
- 源视频仍要求 12-60 秒、100MB 内

### 8.3 声音克隆

1. 小程序保存 clip 与 profile
2. 小程序确认动态授权
3. 小程序调 `/v1/voices/:id/process`
4. API 调 `rpc_voice_queue_processing`
5. RPC 校验：
   - name / permission / clip 完整
   - `consent_version` 与 `consent_text_hash` 最新匹配
   - 存在 READY 源视频
6. RPC 入队 `PROCESS_VOICE`
7. API 触发 Worker 事件
8. Worker：
   - 从云存储读取源视频
   - 提取 wav 参考片段
   - 质量检查
   - 若已有旧 provider voice，先删旧模型
   - 调 Aliyun CosyVoice 注册
   - 生成固定试听音频
   - 写 `REFERENCE_AUDIO`、`PREVIEW_AUDIO`、`voice_models`
   - 声音状态改为 READY

### 8.4 AI 对话 / 精确生成

1. 小程序分别调 `/messages` 或 `/exact-speech`，并携带新 `Idempotency-Key`
2. API 调 `rpc_message_create`
3. RPC 原子完成：
   - 幂等键去重
   - 文本长度校验与内容安全校验
   - 声音必须 READY 且 accepted
   - 账户余额必须覆盖“当前活跃任务数 + 本次任务”所需积分
   - 同一声音只允许一个活跃生成任务
   - upsert `conversations`
   - 写 `messages`
   - 写 `jobs`
4. Worker 处理：
   - CHAT 模式先调对话模型生成 output text
   - EXACT_SPEECH 直接使用输入文本
   - 对 output text 再做内容安全校验
   - 调 CosyVoice 合成
   - 写 AIGC WAV 元数据
   - 调 `rpc_message_complete_success`
5. RPC 扣 1 积分并写 `GENERATION_CONSUME`

失败规则：

- 内容拦截：标记 `BLOCKED`，不扣积分
- provider 失败：标记 `FAILED`，不扣积分
- 存储失败：标记 `FAILED`，不扣积分

证据基线：

- `apps/api/src/messages/message.service.ts:37-107`
- `apps/api/src/quota/quota.service.ts:216-248`
- `apps/worker/src/job-runner.ts:370-410`
- `apps/worker/test/points.integration.test.ts:61-204`
- `docs/auto-execute/results/live-chat-delete-check.json:56-66`

### 8.5 微信支付、验签解密、主动查单

#### 下单

1. 小程序调 `/v1/orders`
2. API 调 `rpc_order_create`
3. API 调微信支付 JSAPI 下单
4. API 调 `rpc_order_attach_prepay`
5. API 返回 payment params

#### 回调

1. 微信支付回调命中 `/v1/payments/wechat/notify`
2. Nest 必须保留 `rawBody: true`，见 `apps/api/src/main.ts:15`
3. API 使用原始报文验签，见 `apps/api/src/payments/wechat-pay.service.ts:238-259`
4. API 使用 APIv3 Key 解密 AES-256-GCM 资源，见 `apps/api/src/payments/wechat-pay.service.ts:24-36`, `282-287`
5. API 先 `rpc_payment_record_notify_event`
6. 再调用 `rpc_payment_apply_success`
7. RPC 幂等地：
   - 校验 appid / mchid / payer openid / amount
   - 把订单更新为 `PAID`
   - 写 `transaction_id`
   - 写 `points_granted_at` / `quota_granted_at`
   - 加 50 积分
   - 写 `PURCHASE_GRANT`

#### 主动查单

1. 小程序 `wx.requestPayment` 成功后，只表示客户端流程成功
2. 小程序必须调用 `/v1/orders/:id/refresh`
3. API 调微信 `out-trade-no` 查单，见 `apps/api/src/payments/wechat-pay.service.ts:184-192`
4. 若查到 `SUCCESS`，走同一个 `rpc_payment_apply_success`

金额与商品参数：

- 注册送分：`10`
- 单次生成：`1`
- 商品：`¥9.9 / 50 积分 / 不自动续费`

证据基线：

- `apps/api/src/payments/wechat-pay.service.ts:121-219`
- `apps/api/src/quota/points.config.ts:16-23`
- `scripts/deploy/cloudbase-combined.mjs:118-122`
- `apps/api/test/payment.test.ts:84-178`
- `docs/nashide_ta_private_voice_wechat_mvp_prd_v0.4.md:4`, `12`

### 8.6 播放

播放改造目标：

- 前端仍拿 API 返回的播放 URL
- API 不再从本地盘读取文件
- API 验证业务签名后，302 到云存储短时下载 URL，或按需做安全代理流式转发

规则：

- `PREVIEW_AUDIO` 播放开始时写 `preview_playback_started_at`
- 完整试听后才允许 `accept-preview`
- 试听和生成结果都要保留显式 AIGC 标签

### 8.7 删除声音 / 删除账号

删除仍采用“两阶段删除”：

- API 只负责标记 `DELETING` 并入队
- Worker 负责真正删除 provider voice 和云存储对象
- 完成后 RPC 把 DB 记录逻辑删除为 `DELETED`

这样能保持当前行为语义：

- 删除声音才触发媒体和 provider 删除
- 清空对话不等于删除媒体

证据：

- `apps/api/src/account/account.service.ts:9-25`
- `apps/api/src/voices/voice.service.ts:271-296`
- `apps/worker/src/job-runner.ts:416-471`
- `apps/worker/test/deletion.integration.test.ts:13-119`
- `docs/legal/COMPLIANCE_DRAFT_NOTES.md:12`

## 9. Permission Model

### 9.1 Runtime roles

数据库最少拆成四类角色：

- `api_read_role`
  - 仅可读白名单视图
- `api_rpc_role`
  - 仅可执行业务 RPC
  - 不授予基础表直接写权限
- `worker_rpc_role`
  - 仅可执行 Worker 相关 RPC
  - 不授予面向前台的订单 / 账户任意写权限
- `migration_admin_role`
  - 仅用于 schema / function / policy 发布
  - 绝不进入运行时环境

### 9.2 Table / view / RPC policy

- 基础表默认不对运行时角色开放任意 DML
- API 与 Worker 的写操作只走 RPC
- REST 只读接口尽量建立在 `public_api_*` 视图上
- 用户归属校验在 RPC 内必须显式检查 `user_id`
- 对未来可能直接暴露给 CloudBase SDK 的对象，先启用 RLS 策略

### 9.3 Official gateway cautions

CloudBase PostgreSQL 官方文档对权限有几个关键注意点，这些必须写进实现约束：

1. CloudBase PG HTTP API 基于 PostgREST，表、视图、RPC 会自动暴露；因此“函数存在”不等于“任何调用者都可调用”。
2. 权限问题要按 `GRANT / RLS / JWT` 三层排查，不能只改其中一层。
3. 官方 FAQ 明确建议把大多数事务逻辑封装到 RPC。
4. 官方故障排查明确指出：函数签名或 schema 变更后，HTTP API 的 schema cache 可能导致“RPC not found”或字段缺失。
5. CloudBase PG 环境的资源权限工具与 PostgreSQL RLS 不是一回事，不能拿环境资源权限替代 SQL 里的 GRANT / POLICY 设计。

官方参考：

- CloudBase Database overview: https://tcb.cloud.tencent.com/en/products/database
- CloudBase RPC docs: https://docs.cloudbase.net/en/database/postgresql/rpc
- CloudBase FAQ: https://docs.cloudbase.net/en/database/postgresql/faq
- CloudBase common errors: https://docs.cloudbase.net/en/database/postgresql/troubleshooting/common-errors
- CloudBase schema cache troubleshooting: https://docs.cloudbase.net/en/database/postgresql/troubleshooting/schema-cache
- CloudBase troubleshooting overview: https://docs.cloudbase.net/en/database/postgresql/troubleshooting/
- CloudBase AI Toolkit permission note: https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/blob/main/doc/mcp-tools.md

本项目的落地结论是：

- 小程序不直连 PG gateway
- 只有 CloudBase Run API 与 Cloud Function Worker 能调 PG REST / RPC
- 运行时角色只拿最小 EXECUTE / SELECT 权限
- 业务 ownership 仍在 RPC 内显式校验

## 10. Failure And Compensation Strategy

### 10.1 Universal idempotency

- 登录赠分：按 `signup_granted_at` 幂等
- 生成请求：按 `messages(user_id, idempotency_key)` 幂等，见 `apps/api/src/db/schema.ts:164-181`
- 支付入账：按 `orders.transaction_id`、`points_granted_at`、`PURCHASE_GRANT + order_id` 幂等，见 `apps/api/src/db/schema.ts:183-211`
- 删除声音：按 `jobs.dedupe_key = delete-voice:<voiceId>` 幂等
- 删除账号：按 `jobs.dedupe_key = delete-account:<userId>` 幂等

### 10.2 Compensation rules

| Failure point | Required result |
|---|---|
| 上传后确认失败 | 对象保留短期隔离标签，定时清理；不写 READY 业务状态 |
| 声音注册失败 | 删除临时 reference / preview 对象；声音记 FAILED；不送免费资格 |
| 对话模型失败 | message FAILED；不扣积分 |
| CosyVoice 合成失败 | message FAILED；不扣积分 |
| 生成对象写入失败 | message FAILED；不扣积分；删除半成品对象 |
| 微信回调处理失败 | 返回非 204，让微信重试；回调事件表记录错误 |
| 查单成功但入账 RPC 失败 | 订单保持可重试状态；再次 refresh 必须可恢复 |
| 删除 provider 成功但 DB finalize 失败 | 任务重试时必须识别“provider 已删”并继续 finalize |
| DB 标记 DELETING 成功但事件触发失败 | 定时补偿函数扫描 `jobs.status=QUEUED` 并重新触发 |

### 10.3 Worker retry policy

- `PROCESS_VOICE`: 最多 3 次
- `GENERATE_MESSAGE`: 最多 3 次
- `DELETE_VOICE`: 最多 5 次
- `DELETE_ACCOUNT`: 最多 10 次

基线来自当前代码：

- `apps/api/src/db/schema.ts:248-269`
- `apps/api/src/voices/voice.service.ts:212-218`, `287-292`
- `apps/api/src/account/account.service.ts:23-25`

## 11. Legal, Authorization, And AIGC Requirements

### 11.1 Consent

必须保留：

- `CONSENT_VERSION = voice-consent-v0.4`
- `SELF`
- `OTHER`
- `MINOR`

文本基线：

- `apps/api/src/voices/consent-text.ts:3-8`

记录要求：

- `permission_type`
- `consent_version`
- `consent_text_hash`
- `confirmed_at`

见 `apps/api/src/db/schema.ts:135-143`。

### 11.2 Legal pages

当前已落地的法律页面与约束不能丢：

- 《隐私政策》
- 《服务协议》
- 《AI 生成标识说明》
- OTHER 需声音本人明确同意
- MINOR 需监护人授权

见 `docs/legal/COMPLIANCE_DRAFT_NOTES.md:7-12`。

### 11.3 AIGC labeling

- 页面文案持续显示“AI回复”“AI生成”
- 生成 WAV 写入 `AIGC` 元数据
- 删除流程必须删除 AIGC 文件与 provider voice

证据：

- `docs/legal/COMPLIANCE_DRAFT_NOTES.md:10-12`
- `apps/worker/src/job-runner.ts:407`
- `apps/worker/test/points.integration.test.ts:203-204`

## 12. Deployment Contract

### 12.1 Runtime topology

- CloudBase Run:
  - 只跑 API
  - 无嵌入式 PostgreSQL
  - 无本地持久媒体目录
- Cloud Function:
  - `voice-worker`
  - `job-requeue-timer`
  - 可选 `storage-finalizer`

### 12.2 Required environment variables

API / Worker 至少需要：

- `CLOUDBASE_ENV_ID`
- `CLOUDBASE_PG_REST_BASE_URL`
- `CLOUDBASE_PG_RPC_BASE_URL`
- `CLOUDBASE_PG_SERVICE_TOKEN`
- `CLOUDBASE_PG_STORAGE_BUCKET`
- `CLOUDBASE_PG_STORAGE_REGION`
- `MEDIA_SIGNING_SECRET`
- `PROVIDER_ID_ENCRYPTION_KEY`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `WECHAT_PAY_MCH_ID`
- `WECHAT_PAY_SERIAL_NO`
- `WECHAT_PAY_PRIVATE_KEY`
- `WECHAT_PAY_API_V3_KEY`
- `WECHAT_PAY_PLATFORM_CERT` 或 `WECHAT_PAY_PUBLIC_KEY_ID` + `WECHAT_PAY_PUBLIC_KEY`
- `WECHAT_PAY_NOTIFY_URL`
- `WECHAT_PAY_DESCRIPTION`
- `DASHSCOPE_API_KEY`
- `AIVOICE_TARGET_MODEL=cosyvoice-v3.5-flash`
- `CHAT_MODEL`
- `SIGNUP_BONUS_POINTS=10`
- `GENERATION_POINT_COST=1`
- `POINTS_PACKAGE_PRICE_FEN=990`
- `POINTS_PACKAGE_AMOUNT=50`
- `POINTS_PACKAGE_CODE=POINTS_50`

### 12.3 Variables that must disappear from production

以下变量出现在生产即视为架构违约：

- `DATABASE_URL=postgresql://aivoice@127.0.0.1:5432/aivoice`
- `USE_EMBEDDED_POSTGRES=true`
- `MEDIA_LOCAL_ROOT=/app/.runtime/media`

它们当前只属于过渡态，证据见：

- `scripts/deploy/cloudbase-combined.mjs:91-95`

## 13. Hard Verification: No Rollback To Old Architecture

以下门槛全部通过，才算完成迁移：

### 13.1 Code guards

- 运行时代码中不再存在 `drizzle-orm/node-postgres`、`new Pool(...)` 用于 API / Worker 主链路
- `apps/api/src/db/database.service.ts` 与 `apps/worker/src/db.ts` 被替换为 REST / RPC 客户端
- 生产部署脚本不再注入 `USE_EMBEDDED_POSTGRES`
- 生产部署脚本不再注入本地媒体目录

### 13.2 Runtime guards

- API 容器内没有嵌入式 PostgreSQL 启动流程
- API 容器重启后，历史订单、声音、媒体、积分状态不丢失
- API 节点可横向扩容，不能依赖单实例本地文件
- Worker 可并发处理，不依赖 `FOR UPDATE SKIP LOCKED` 长轮询主进程

### 13.3 Functional guards

- 新用户首次登录只得 10 分，再次登录不重复得分
- 成功生成后积分 `-1`
- 内容拦截 / provider 故障 / 存储故障积分不变
- `¥9.9` 支付成功后恰好 `+50` 分
- 回调重复、主动查单重复都不会重复入账
- 删除声音后 provider voice 与对象都被删除
- 删除账号后所有声音、媒体、session 都进入删除终态

### 13.4 Deployment guards

- 生产环境断开原始 PostgreSQL 直连能力后系统仍正常
- 删除容器本地媒体目录后系统仍正常
- Worker 停掉一个实例后，定时补偿能恢复未完成任务

## 14. Final Decisions

1. 小程序外部 API 不改成直连 CloudBase PG；仍保留 CloudBase Run API 作为唯一前门。
2. CloudBase PostgreSQL REST 只做读和简单写；所有事务一致性操作全部改成 RPC。
3. 微信支付回调与主动查单最终都汇聚到同一个 `rpc_payment_apply_success`，避免双路径入账分叉。
4. 媒体必须迁到私有 PG 云存储；数据库只保存元数据与授权状态。
5. Worker 必须事件化；`jobs` 表保留为权威状态机，但不再由常驻进程轮询驱动。
6. 生产架构不得保留嵌入式 PostgreSQL 和容器本地媒体作为任何形式的回退方案。

## 15. Evidence Index

- `apps/api/src/db/schema.ts:69-248` - 当前权威数据模型
- `apps/api/src/auth/auth.service.ts:41-83` - 登录、注册送分、session
- `apps/api/src/quota/quota.service.ts:85-99` - 注册送分事务
- `apps/api/src/quota/quota.service.ts:216-248` - 成功生成扣 1 分事务
- `apps/api/src/quota/quota.service.ts:283-310` - 支付入账事务
- `apps/api/src/messages/message.service.ts:37-107` - 生成幂等、余额校验、任务入队
- `apps/api/src/voices/voice.service.ts:167-221` - 声音处理入队
- `apps/api/src/voices/voice.service.ts:271-296` - 删除声音入队
- `apps/api/src/account/account.service.ts:9-25` - 删除账号入队
- `apps/api/src/media/media.service.ts:66-167` - 本地上传 / 播放现状
- `apps/api/src/payments/wechat-pay.service.ts:121-288` - 预下单、查单、回调验签解密
- `apps/api/src/main.ts:15` - 微信回调依赖 rawBody
- `apps/worker/src/job-runner.ts:89-108` - 轮询 jobs 现状
- `apps/worker/src/job-runner.ts:194-292` - 声音克隆处理
- `apps/worker/src/job-runner.ts:370-410` - 生成音频处理与 AIGC 元数据
- `apps/worker/src/job-runner.ts:416-471` - 删除声音 / 账号处理
- `apps/worker/test/points.integration.test.ts:61-204` - 成功扣分、失败不扣、AIGC 元数据
- `apps/worker/test/deletion.integration.test.ts:13-119` - 删除 provider voice 和媒体
- `apps/api/test/payment.test.ts:84-178` - 微信支付签名、解密、幂等入账测试基线
- `docs/deployment/CLOUDBASE.md:14`, `49-50` - 当前 CloudBase 过渡态与迁移必要性
- `scripts/deploy/cloudbase-combined.mjs:91-95`, `118-122` - 当前过渡态 env 与积分商品参数
- `docs/frontend-api-usage.json:20-29`, `862` - 前端权威与回调边界
- `docs/legal/COMPLIANCE_DRAFT_NOTES.md:7-12` - 法律、授权、AIGC 与失败不扣
- `docs/nashide_ta_private_voice_wechat_mvp_prd_v0.4.md:4`, `12` - `10/1/50/990` 商业与积分基线
