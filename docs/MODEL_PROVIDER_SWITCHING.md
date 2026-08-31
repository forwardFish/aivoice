# 模型 Provider 切换说明

项目只允许业务层依赖三个能力接口，页面、积分、消息和媒体存储不得直接依赖具体模型名称。

| 能力 | Provider 接口 | 当前默认实现 | 可切换实现 |
| --- | --- | --- | --- |
| 文字回复 | `ChatProviderPort` | DashScope / `qwen3.8-max` | DeepSeek、其他 OpenAI 兼容接口 |
| 语音生成 | `VoiceProviderPort` | 火山引擎 / `seed-audio-1.0` | 阿里云 CosyVoice |
| 说话人分析 | `SpeakerAnalysisProviderPort` | 阿里云 `fun-asr` | 后续新增实现 |

## 当前生产目标配置

```env
AIVOICE_CHAT_PROVIDER=dashscope
CHAT_MODEL=qwen3.8-max

AIVOICE_VOICE_PROVIDER=volcengine-seed-audio
VOLCENGINE_SEED_AUDIO_API_KEY=
VOLCENGINE_SEED_AUDIO_BASE_URL=https://openspeech.bytedance.com
SEED_AUDIO_MODEL=seed-audio-1.0

AIVOICE_SPEAKER_ANALYSIS_PROVIDER=aliyun
AIVOICE_SPEAKER_DIARIZATION_ENABLED=true
```

如需在非正式版本对比 DeepSeek，只改文字 Provider：

```env
AIVOICE_CHAT_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_API_HOST=https://api.deepseek.com
DEEPSEEK_CHAT_MODEL=deepseek-chat
```

火山引擎密钥保存在项目外部的 `D:/lyh/secrets/aivoice/byteplus.env`，不得写入仓库。

## 调用边界

### 创建声音

1. FFmpeg 从原视频提取 8–20 秒参考音频。
2. 说话人分析 Provider 检查单人说话并提取有限的可观察语音证据。
3. Seed Audio 直接使用参考音频生成试听。
4. 保存参考音频对象键，不创建火山引擎固定音色。

### 对话

1. Chat Provider 生成并校验回复文字；确定性质量失败时最多重试一次。
2. 安全文字先发布到页面。
3. Voice Provider 使用参考音频和可见回复文字生成 WAV。
4. 写入 AIGC 元数据、上传、扣减一次积分并标记完成。

### 说一句

不调用 Chat Provider，只调用 Voice Provider。

## 切换要求

- 切换 Provider 只允许修改环境变量或增加新的 Provider 实现，不能在页面或业务服务中加入模型分支。
- 未知 Provider 必须启动失败，不能静默回退到另一模型。
- Seed Audio 生成失败不自动重试，防止一次完成但响应丢失造成重复计费。
- 更换实际处理声音样本的第三方前，必须同步更新隐私政策、授权版本和上架材料；技术可切换不代表可以绕过重新告知和同意。
