# 「那年的TA」微信原生小程序前端交付报告

## 1. 交付范围

本交付仅包含微信原生小程序前端和前端交付文档，ZIP 根目录严格为：

```text
apps/miniprogram/
docs/frontend-delivery-report.md
docs/frontend-api-usage.json
```

技术形态：

- 微信原生小程序；
- TypeScript；
- WXML / WXSS；
- 微信原生 `tabBar`；
- 无 React、Vue、Taro、uni-app、WebView；
- 无后端、数据库、支付回调、云服务实现；
- 无 `.env`、API Key、AppSecret、支付证书或声音供应商音色 ID；
- 无本地额度账本或本地购买授权逻辑。

实现依据按以下优先级执行：

1. `docs/nashide_ta_private_voice_wechat_mvp_prd_v0.4.md`
2. `docs/auto-execute/05-api-contract.md`
3. `docs/auto-execute/04-page-flow.md`
4. `docs/auto-execute/13-frontend-backend-contract-map.md`
5. `docs/frontend-handoff/FRONTEND_IMPLEMENTATION_BRIEF.md`

## 2. 已实现页面

### `pages/login/index`

主要交互：

- `wx.login` 获取临时登录 code；
- 可选头像与昵称；
- 服务协议、隐私政策确认；
- 登录 loading、error、success 状态；
- 登录后恢复 401 前保存的安全路由；
- 已登录用户直接进入首页。

调用接口：

- `POST /v1/auth/wechat`

### `pages/home/index`

主要交互：

- 固定展示“创建新声音”；
- 最多展示 3 个服务端返回的 `READY` 声音；
- 点击最近声音直接进入工作台；
- loading、empty、error、success 状态；
- 下拉刷新；
- 首页不展示处理中、失败或草稿。

调用接口：

- `GET /v1/home`

### `pages/create/select-video`

主要交互：

- 使用 `wx.chooseMedia` 仅从相册选择 1 个视频；
- 使用 `wx.getVideoInfo` 校验视频；
- 前端限制 12–60 秒、最大 100MB；
- 创建声音草稿；
- 获取私有上传凭证并使用 `wx.uploadFile` 上传；
- 展示上传进度；
- 上传完成后向服务端确认媒体元数据；
- 保留创建会话，用于后续片段选择与免费重试恢复；
- idle、selected、uploading、error、success 状态。

调用接口：

- `POST /v1/voices`
- `POST /v1/voices/:id/upload-policy`
- 签名上传地址（由上传策略返回，不是前端自建接口）
- `POST /v1/voices/:id/media`

### `pages/create/select-clip`

主要交互：

- 本地视频播放；
- 使用当前位置设置开始和结束；
- 双滑块调整片段；
- 强制片段为 10–30 秒；
- 可试听所选片段；
- 必须确认该片段主要是目标人物清楚、单独说话；
- 保存后进入声音资料与授权页；
- loading、invalid、valid、saving、error 状态。

调用接口：

- `PUT /v1/voices/:id/clip`

### `pages/create/voice-profile`

主要交互：

- 输入声音名称；
- 选择“我的声音 / 他人的声音 / 未成年人的声音”；
- 三种权限分别展示 PRD 规定的动态确认文案；
- 每次切换权限都会重置确认状态；
- 未勾选动态授权不能提交；
- 查看声音使用规则；
- 顺序保存资料、授权记录并启动处理；
- error、submitting、success 跳转状态。

动态确认文案：

- `SELF`：我同意使用我的声音样本创建私有 AI 声音。
- `OTHER`：我已告知声音本人，并取得其对声音克隆和 AI 合成使用的明确同意。
- `MINOR`：我是该未成年人的监护人，或已取得其监护人的明确授权。

调用接口：

- `PUT /v1/voices/:id/profile`
- `POST /v1/voices/:id/consents`
- `POST /v1/voices/:id/process`

### `pages/create/progress`

主要交互：

- 幂等启动声音处理；
- 轮询服务端声音状态；
- 显示上传、提取、质量检查、声音创建、试听生成等阶段；
- `PREVIEW_READY` 自动进入试听；
- `READY` 自动进入工作台；
- `FAILED` 展示服务端可恢复错误及重新选择入口；
- 页面离开后停止前端轮询，任务仍由服务端继续；
- loading、processing、error、failed、redirect-success 状态。

调用接口：

- `POST /v1/voices/:id/process`
- `GET /v1/voices/:id`

### `pages/create/preview`

主要交互：

- 获取声音状态及短期试听地址；
- 展示固定试听文本和“AI生成”；
- 必须完整播放试听后才启用“使用这个声音”；
- 不包含“很像 / 比较像 / 不像”问卷；
- 仅提供“使用这个声音”和“换一段重新创建”；
- 接受试听后由服务端决定是否幂等赠送账号级免费额度；
- 免费重试后优先恢复本地已有视频与片段编辑，否则返回视频选择；
- 提前披露“后续 ¥9.9 / 10 次、不自动续费”；
- loading、playing、finished、accepting、retrying、error 状态。

调用接口：

- `GET /v1/voices/:id`
- `GET /v1/voices/:id/preview`
- `POST /v1/voices/:id/accept-preview`
- `POST /v1/voices/:id/retry-preview`

### `pages/voice/workbench`

主要交互：

- 对话与“说一句”两种模式；
- 两种模式共用服务端额度；
- 对话文字与“说一句”文字分别保存草稿；
- 每次生成创建新的 UUIDv4 `Idempotency-Key`；
- 前端不根据本地余额直接拦截生成，而是提交服务端校验；
- 只有主动点击发送或生成并收到 `QUOTA_EXHAUSTED` 时展示购买框；
- 最后一次成功结果正常显示和播放，额度变为 0 时不自动弹窗；
- 每条对话音频显示“AI回复”；
- 每条精确语音显示“AI生成”；
- 轮询生成状态；
- 失败或内容拦截不清除输入，且不在前端扣次数；
- 支付取消、支付等待和重新进入页面时保留草稿；
- 购买商品只接受服务端返回且与冻结合同一致的 `VOICE_QUOTA_10 / 990 分 / 10 次 / 不自动续费`；
- `wx.requestPayment` 成功后不本地增加额度；
- 轮询订单和声音额度，只有订单为 `PAID`、服务端确认额度已入账且服务端额度大于 0 后，才恢复生成；
- 支持恢复支付后被关闭页面的待确认订单；
- loading、empty conversation、success、processing、blocked、failed、quota-modal、paying、payment-pending、error 状态。

调用接口：

- `GET /v1/voices/:id`
- `GET /v1/voices/:id/quota`
- `GET /v1/voices/:id/conversation`
- `POST /v1/voices/:id/messages`
- `POST /v1/voices/:id/exact-speech`
- `GET /v1/messages/:id`
- `POST /v1/orders`
- `GET /v1/orders/:id`
- `POST /v1/orders/:id/refresh`

### `pages/voices/index`

主要交互：

- 管理全部声音资产；
- 本地视图筛选：全部、已完成、处理中、草稿、失败；
- `READY` 进入工作台；
- `PREVIEW_READY` 进入试听；
- `UPLOADING / QUEUED / PROCESSING / FAILED / DELETING` 进入进度页；
- `DRAFT` 恢复视频创建；
- `READY` 支持直接进入“说一句”；
- 可进入声音设置；
- loading、empty、error、success 状态；
- 处理中、失败和草稿只在该页面展示，不进入首页。

调用接口：

- `GET /v1/voices`

### `pages/account/index`

主要交互：

- 获取当前用户资料；
- 汇总服务端声音的当前可用次数，仅用于展示；
- 查看服务端订单；
- 查看服务端额度流水；
- 修改昵称；
- 使用帮助、退款售后、反馈、隐私、声音规则和协议说明；
- 二次确认账号注销；
- 注销成功后仅清理本项目本地登录、草稿、创建会话和待确认订单标记；
- loading、empty lists、error、success、updating、deleting 状态。

调用接口：

- `GET /v1/me`
- `PATCH /v1/me/profile`
- `GET /v1/voices`
- `GET /v1/orders`
- `GET /v1/quota-ledgers`
- `DELETE /v1/account`

### `pages/voice/settings`

主要交互：

- 读取声音详情和服务端额度；
- 修改声音名称时保留原权限类型并提交服务端；
- 展示声音状态、权限、阶段标签、对话风格和免费/付费额度；
- 清空当前对话；
- 跳转账户页查看订单和额度流水；
- 两次确认后删除整个声音；
- 删除成功后清理该声音对应的本地草稿、创建会话和待确认订单标记；
- loading、error、success、clearing、deleting、deleted 状态。

调用接口：

- `GET /v1/voices/:id`
- `GET /v1/voices/:id/quota`
- `PUT /v1/voices/:id/profile`
- `DELETE /v1/voices/:id/conversation`
- `DELETE /v1/voices/:id`

## 3. 公共前端能力

### 请求与鉴权

- 单一 typed API client：`apps/miniprogram/services/api.ts`；
- 所有受保护请求自动携带 `Authorization: Bearer <token>`；
- 401 或 `UNAUTHORIZED` 时清除登录状态，保存当前安全路由并进入登录页；
- API Base URL 只在 `apps/miniprogram/config.ts` 配置；
- 前端未包含任何私钥或供应商密钥。

### 上传

- 上传地址、headers、formData、object key 和 media id 全部来自服务端上传策略；
- 前端不内置 OSS/云存储密钥；
- 使用 `wx.uploadFile` 展示进度；
- 当前 `server-upload` 模式会在上传请求中携带 `Authorization: Bearer <token>`；
- 上传完成后通过冻结 API 确认媒体元数据。

### 音频

- 使用 `InnerAudioContext`；
- 支持播放、暂停、进度和播放完成事件；
- 免费试听通过播放完成事件调用 `/preview-played`，且服务端校验试听流开始时间与音频时长后才解锁接受按钮；
- 生成音频的 AI 标识由页面显式展示。

### 支付

- 购买框只由服务端 `QUOTA_EXHAUSTED.purchaseOption` 驱动；
- 不在试听页强制支付；
- 不存在多套餐或会员；
- 客户端不增加、扣减或覆盖额度；
- `wx.requestPayment` 成功不视为额度到账；
- 通过服务端订单 refresh、订单状态、额度入账标记和声音额度共同确认；
- 支付前草稿保留在当前项目的本地草稿缓存中；
- 本地待确认订单标记只用于恢复轮询，不作为订单或额度事实来源。

## 4. API 调用总表

| 方法 | 路径 | 使用位置 |
|---|---|---|
| POST | `/v1/auth/wechat` | 登录 |
| GET | `/v1/me` | 我的 |
| PATCH | `/v1/me/profile` | 我的 |
| GET | `/v1/home` | 首页 |
| GET | `/v1/voices` | 我的声音、我的 |
| POST | `/v1/voices` | 选择视频 |
| POST | `/v1/voices/:id/upload-policy` | 选择视频 |
| POST multipart | `/v1/voices/:id/media-upload` | 选择视频，使用服务端返回的上传地址与字段名 |
| POST | `/v1/voices/:id/media` | 选择视频 |
| PUT | `/v1/voices/:id/clip` | 标记片段 |
| PUT | `/v1/voices/:id/profile` | 声音资料、声音设置 |
| POST | `/v1/voices/:id/consents` | 声音资料与授权 |
| POST | `/v1/voices/:id/process` | 声音资料、创建进度 |
| GET | `/v1/voices/:id` | 进度、试听、工作台、设置 |
| GET | `/v1/voices/:id/preview` | 免费试听 |
| POST | `/v1/voices/:id/preview-played` | 试听完整播放后的服务端证明 |
| POST | `/v1/voices/:id/accept-preview` | 免费试听 |
| POST | `/v1/voices/:id/retry-preview` | 免费试听 |
| GET | `/v1/voices/:id/quota` | 工作台、设置 |
| GET | `/v1/voices/:id/conversation` | 工作台 |
| DELETE | `/v1/voices/:id/conversation` | 设置 |
| POST | `/v1/voices/:id/messages` | 对话，带 Idempotency-Key |
| POST | `/v1/voices/:id/exact-speech` | 说一句，带 Idempotency-Key |
| GET | `/v1/messages/:id` | 生成结果轮询 |
| POST | `/v1/orders` | 购买 10 次 |
| GET | `/v1/orders/:id` | 支付结果确认 |
| POST | `/v1/orders/:id/refresh` | 主动向服务端收敛支付状态 |
| GET | `/v1/orders` | 我的 |
| GET | `/v1/quota-ledgers` | 我的 |
| DELETE | `/v1/voices/:id` | 声音设置 |
| DELETE | `/v1/account` | 我的 |

前端没有调用或实现 `POST /v1/payments/wechat/notify`；该接口属于微信支付服务端回调。

## 5. 已执行检查

在交付目录执行：

```bash
cd apps/miniprogram
tsc -p tsconfig.json
```

结果：通过，无 TypeScript 静态错误。

另执行自定义只读静态检查，覆盖：

- 19 个 JSON 文件可解析；
- `app.json` 中 11 个要求页面全部存在；
- 每个页面均有 `.ts / .wxml / .wxss / .json`；
- 原生 TabBar 3 个入口及 6 个图标文件存在；
- 组件引用路径存在；
- 15 个 WXML 文件结构可解析；
- WXML 绑定事件均存在于对应页面或组件；
- API 路径全部属于冻结合同白名单；
- 未发现 React、Vue、Taro、uni-app、WebView；
- 未发现 `.env`、密钥特征、支付证书或 provider voice ID；
- 未发现 node_modules、dist、build 或缓存目录。

检查结果：

```text
OK  JSON parsed: 19
OK  Routes checked: 11
OK  usingComponents references checked
OK  WXML parsed: 15
OK  WXML event handlers checked
OK  Frozen API endpoint whitelist checked
OK  Forbidden framework/secret/provider-id scan checked
OK  Forbidden artifact scan checked
ALL STATIC STRUCTURE CHECKS PASSED
```

## 6. 已知限制

1. 本地开发默认使用 `http://127.0.0.1:8787` 和模拟登录；正式环境必须通过 ExtConfig 提供已备案、HTTPS 且加入微信 request/uploadFile 合法域名的 API 地址，并关闭本地模拟登录。
2. `project.config.json` 使用 `touristappid`，需要在微信开发者工具中改为真实小程序 AppID。
3. 冻结 API 的声音资料合同只允许 `{ name, permissionType }`。因此本前端不发明阶段标签、TA 如何称呼你或对话风格的写入字段；设置页只展示服务端若返回的这些字段。
4. 冻结合同没有头像文件上传接口。登录页只会把 HTTPS 头像 URL 传给服务端；微信临时头像路径不会被当作持久 URL 提交。
5. 正式《隐私政策》《服务协议》、客服入口和退款流程需要运营主体提供发布地址或正式小程序页面；当前前端使用说明弹窗占位，不包含法律文本定稿。
6. 上传策略的具体直传字段、对象存储 CORS、回调格式和签名有效期需要与后端实际返回联调。
7. 所有声音状态、额度、商品、订单和支付结果都依赖后端按冻结合同返回；本交付未包含后端 mock 或第二套本地业务状态机。

## 7. 仍需微信开发者工具或真机验证

- 真实 AppID 下的 `wx.login` code 交换；
- 微信昵称组件与头像选择在不同基础库版本上的表现；
- iOS 与 Android 的 `wx.chooseMedia`、HEVC/H.264、视频旋转与大文件行为；
- 私有对象存储直传、弱网重试与上传超时；
- `<video>` 时间更新、seek 精度及 10–30 秒片段边界；
- `InnerAudioContext` 在静音模式、蓝牙、来电打断和后台切换下的行为；
- 自定义导航安全区与不同机型胶囊按钮布局；
- 原生 TabBar 图标和字体在正式包中的显示；
- `wx.requestPayment`、支付取消、支付成功后杀进程、回调延迟和服务端主动查单；
- 订单 `PAID` 但额度尚未入账的长时间等待路径；
- 401 路由恢复和小程序冷启动；
- 服务端内容拦截、生成失败不扣次数及并发生成拦截；
- 开发者工具“代码质量”、体验版和真机全链路验收。

## 8. 交付结论

本交付已覆盖合同要求的 11 个微信原生小程序页面、冻结 `/v1` API 客户端、视频上传与片段选择、动态声音授权、处理轮询、完整试听门槛、对话与精确语音、服务端额度驱动的购买触发、微信支付后服务端订单确认、声音资产管理、账户与删除流程。

关键商业规则已在前端实现：最后一次成功生成后只展示结果，不自动弹出购买框；只有下一次主动生成由服务端返回 `QUOTA_EXHAUSTED` 时才展示唯一的 ¥9.9 / 10 次购买选项。

## 9. Codex 前后端集成与主流程证据

ChatGPT Pro ZIP 导入后，Codex 根据实际 NestJS API 修复并验证了以下合同差异：

- 权限值统一为 `SELF / OTHER / MINOR`；
- 授权版本和授权全文改为使用 `PUT /profile` 返回的服务端规范值，前端不再硬编码版本；
- `wx.uploadFile` 在当前 server-upload 模式携带 Bearer token；
- `READY + acceptedAt 为空` 在前端规范化为试听待确认状态；
- 试听播放结束调用 `/preview-played`，服务端同时校验试听时长；
- 对话历史由服务端返回最近 10 轮的用户/AI 展示结构和签名音频；
- 阿里云 OSS 返回的受信 HTTP 地址仅对阿里云域名升级为 HTTPS，不关闭 SSRF 白名单。

2026-08-21 使用微信开发者工具游客模式、模拟登录、真实 PostgreSQL、真实 API/Worker、真实阿里云 Voice Enrollment 与 CosyVoice 完成一次连续主流程：

```text
登录页 -> 首页 -> 选择授权视频 -> wx.uploadFile -> 12 秒片段
-> SELF 授权 -> 阿里云克隆 -> 5.81 秒固定试听完整播放
-> 接受声音 -> 工作台 -> 输入“请照顾好自己，我们都很想你。”
-> 生成 4.29 秒可播放音频 -> 服务端免费额度 1 -> 0
```

结果：`PASS`。机器证据位于 `.runtime/ui-evidence/main-flow/progress.json`（运行时私有证据，不提交生成音频或用户视频）。微信开发者工具游客模式在上传/处理后偶发页面导航超时；验收脚本仅在已确认服务端成功且本地创建会话完整时用 `reLaunch` 恢复，并单独记录该限制。真实 AppID 登录和真实微信支付仍是上线前独立门禁。
