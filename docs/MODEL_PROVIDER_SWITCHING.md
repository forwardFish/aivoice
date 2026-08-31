# 模型 Provider 切换说明

项目只允许业务层依赖三个能力接口，页面、积分、消息和媒体存储不得直接依赖具体模型名称。

| 能力 | Provider 接口 | 当前默认实现 | 可切换实现 |
| --- | --- | --- | --- |
| 文字回复 | `ChatProviderPort` | DashScope / `qwen3.8-max` | DeepSeek、其他 OpenAI 兼容接口 |
| 语音生成 | `VoiceProviderPort` | 阿里云 / `cosyvoice-v3.5-plus` | 火山引擎 Seed Audio（非实时实验） |
| 说话人分析 | `SpeakerAnalysisProviderPort` | 阿里云 `fun-asr` | 后续新增实现 |

## 当前生产目标配置

```env
AIVOICE_CHAT_PROVIDER=dashscope
CHAT_MODEL=qwen3.8-max

AIVOICE_VOICE_PROVIDER=aliyun-cosyvoice
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

语音业务层只向 Provider 传递稳定的语义控制：

- `deliveryMode`：七种可听见的表达方式，例如日常、轻快、直接紧绷、轻声不安；
- `speechAct`：八种本轮说话动作，例如回应、解释、提醒、调侃；
- `observedBaseline`：从授权视频得到的语速、停顿、句尾和音量起伏证据，以及用户明确给出的语气纠正。

年龄、性别、`personalityStyle`、人物心理标签和复杂场景描述不得直接传给 Seed Audio。它们只在业务层决定最终的一个 `deliveryMode` 和一个 `speechAct`，避免语音模型为了“演性格”而拖长尾音或产生配音腔。Seed Audio 始终保留参考音频身份，使用默认数值音频参数，并进行单次生成。

`seed-audio-1.0` 的 `/api/v3/tts/create` 是整段音频创作接口，必须等待完整音频返回，实测短句也可能需要 19–41 秒。因此它不能作为即时聊天的默认语音 Provider；只有显式设置 `AIVOICE_VOICE_PROVIDER=volcengine-seed-audio` 时才允许用于离线试听或实验。聊天发布默认保留 CosyVoice Plus，避免下一次部署意外引入不可接受的音频等待时间。

### 说一句

不调用 Chat Provider，只调用 Voice Provider。

## 切换要求

- 切换 Provider 只允许修改环境变量或增加新的 Provider 实现，不能在页面或业务服务中加入模型分支。
- 新创建的每个声音同时保留 CosyVoice `speakerId` 和私有参考音频：CosyVoice 使用前者，Seed Audio 使用后者。两者不重复创建人物资料，也不需要用户重新上传视频。
- 上线前只需设置 `AIVOICE_VOICE_PROVIDER=aliyun-cosyvoice` 或 `AIVOICE_VOICE_PROVIDER=volcengine-seed-audio` 并重启 Worker；单次消息不会同时调用两个语音模型。
- 未知 Provider 必须启动失败，不能静默回退到另一模型。
- Seed Audio 生成失败不自动重试，防止一次完成但响应丢失造成重复计费。
- 更换实际处理声音样本的第三方前，必须同步更新隐私政策、授权版本和上架材料；技术可切换不代表可以绕过重新告知和同意。
