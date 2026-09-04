# Goal · Voice Identity Stable Emotion

- Run ID: `voice-identity-stable-20260904`
- Project root: `D:\lyh\agent\agent-frame\aivoice`
- Goal: 实现注册复刻音色在连续对话中的稳定身份底座与有界情绪覆盖，并在 2026-09-05 08:00 +08:00 前提供测试结果。
- Primary source: `C:\Users\linyanhui\.codex\attachments\0fc8bcb9-edc7-45f7-8c1a-087b4fa81e7e\pasted-text-1.txt`
- Checkpoint: `main@dbd5f4bde2e80ec77477d718abe243292103cf77`

## Success criteria

1. 所有连续对话和注册复刻音色 fail-closed 进入身份稳定模式，包括儿童。
2. provider/model/enrolled model/voice/seed/plain text/SSML/format/sample rate/policy version 跨五轮固定。
3. 情绪只能由静态白名单的 0–2 个局部韵律提示覆盖；不得传入角色、年龄、性别、关系、音色或完整表演描述。
4. 注册复刻请求不含 rate/pitch/volume、relationshipType、deliveryMode、speechAct、observedBaseline、deliveryPlan。
5. `OFF` 与 `SAFE_ONLY` 可运行；`BOUNDED_ALL` 存在但不作为未经听感验收的默认生产策略。
6. 五轮集成测试证明身份 fingerprint 不变、每轮一次 TTS、无 provider/model/voice fallback。
7. 离线五轮音频可供所有者按逐轮身份门槛复核。

## Out of scope

- 新页面、数据库表/列、长期记忆、关系成长、主动消息。
- 默认第二次 TTS、在线多候选、跨供应商切换、CosyVoice SFT。
- 未经授权的生产部署、远程推送或生产数据变更。

## Stop conditions

- 同一失败修复五轮仍无安全路径。
- 缺少凭据/供应商服务使真实音频测试无法继续。
- 生产部署需要用户另行明确授权。

Final verdict: `REPAIR_REQUIRED`
