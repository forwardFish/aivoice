# Prompt sent to ChatGPT Pro

请直接完成前端代码并最终返回 ZIP，不要只给计划或代码片段。

项目：微信小程序“那时的 TA”。

你负责范围：只实现原生微信小程序前端，输出到 `apps/miniprogram/`。后端、数据库、支付密钥、云服务和声音模型由 Codex 实现，你不得自行创建另一套后端或本地 mock 权限体系。

附件中包含：

1. 完整 PRD v0.4；
2. 已冻结的 API 合同、页面流程和前后端映射；
3. printersheet 的部分前端参考代码，仅用于复用微信登录、请求封装、上传和 `wx.requestPayment` 模式；
4. `FRONTEND_IMPLEMENTATION_BRIEF.md`，它是你的直接交付合同。

执行要求：

- 使用微信原生小程序 + TypeScript + WXML/WXSS + 原生 tabBar；禁止 React/Vue/Taro/uni-app/webview。
- 完整实现 PRD P0-P9、登录页和所有 loading/empty/error/success 状态。
- 严格调用附件中的 `/v1` API，不要发明不兼容接口。
- 不要把额度、订单、音色 ID 或支付结果当作客户端权威；服务端响应才是权威。
- 首页不显示处理中/失败/草稿；这些状态只进入“我的声音”。
- 试听必须播放完才能“使用这个声音”；不要加入相似度问卷。
- 最后一次成功生成正常显示并播放，不能自动弹购买框；下一次主动生成收到 `QUOTA_EXHAUSTED` 才弹 ¥9.9/10 次购买框。
- 保留购买前草稿；`wx.requestPayment` 成功后必须轮询服务端订单，确认额度入账才能继续。
- 代码和文案保持温暖、克制、可信，不宣传复活或真人回归。
- 不得包含任何密钥、`.env`、provider voice id、node_modules、构建缓存或后端代码。

完成后请运行你能运行的静态检查，修复错误，然后返回一个 ZIP，结构必须是：

```text
apps/miniprogram/
docs/frontend-delivery-report.md
docs/frontend-api-usage.json
```

ZIP 必须包含真实源代码。请在最终回复中附上可下载的 ZIP 文件，并简要列出已实现页面、检查结果和仍需真机验证的项目。

不要等待我确认普通 UI、路由、文案或代码位置；以 PRD和合同为准自主完成。
