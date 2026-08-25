# 那年的TA / aivoice

微信原生小程序 MVP：从授权视频创建私有 AI 声音，完成固定试听、一次免费自定义生成，并以 ¥9.9 / 10 次继续使用。

## Architecture

```text
apps/miniprogram  微信原生小程序前端（ChatGPT Pro 交付后集成）
apps/api          NestJS + TypeScript 业务 API
apps/worker       PostgreSQL-backed FFmpeg / Voice / message Worker
packages/contracts 共享 API 与商品合同
PostgreSQL        用户、声音、授权、订单、额度、消息和任务权威
src/aivoice       Python 声音技术验证工具，不承载正式业务流量
```

完整需求：`docs/nashide_ta_private_voice_wechat_mvp_prd_v0.4.md`

冻结合同：

- `docs/auto-execute/03-architecture-plan.md`
- `docs/auto-execute/05-api-contract.md`
- `docs/auto-execute/06-database-schema.md`
- `docs/auto-execute/13-frontend-backend-contract-map.md`

## Local backend

```powershell
npm install
docker compose up -d postgres
$env:DATABASE_URL='postgresql://aivoice:aivoice_local@127.0.0.1:54329/aivoice'
npm run db:migrate
npm run build
npm test
npm run dev:api
```

另一个终端：

```powershell
$env:DATABASE_URL='postgresql://aivoice:aivoice_local@127.0.0.1:54329/aivoice'
npm run dev:worker
```

复制 `apps/api/.env.example` 到本地安全配置文件并注入运行环境。不得提交微信、支付、百炼或数据库密钥。

## Verified voice prototype

Python 3.11 技术工具已经验证：

```text
authorized video -> FFmpeg -> Aliyun Voice Enrollment -> CosyVoice 3.5 Flash -> WAV/MP3
```

安装：

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[clone]"
```

运行：

```powershell
.\.venv\Scripts\aivoice.exe clone `
  --video ".\inputs\authorized\authorized.mp4" `
  --text "你好，这是声音复刻技术测试。" `
  --output ".\outputs\result.wav" `
  --provider aliyun-cosyvoice `
  --confirm-authorized
```

## Acceptance semantics

- 代码存在不等于测试通过。
- 测试通过不等于真实微信登录/支付通过。
- API 返回 200 不等于用户页面流程通过。
- 声音文件生成不等于用户认为相似。
- 最终验收需要启动 PostgreSQL、API、Worker 和小程序，按真实用户点击路径运行并保存 UI/网络/控制台/截图证据。
