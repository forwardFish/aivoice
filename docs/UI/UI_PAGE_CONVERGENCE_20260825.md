# 小程序页面 UI 收敛记录（2026-08-25）

## 执行边界

- 已经接近参考 UI 的页面只检查和做等价标准组件替换，不重构。
- 与参考差别很大的页面从 `codex/aivoice-ui-final` 完成版本恢复 WXML/WXSS、标准组件和正式资产。
- 当前分支的 TypeScript、API、积分、支付、授权和数据规则保持不变。
- 本轮未提交、未推送、未合并、未上传微信版本。

## 页面结果

| 页面 | 处理方式 | UI 来源 | 当前状态 |
| --- | --- | --- | --- |
| 首页 | 保持结构；增加访客首页和按需登录 | 首页参考图 + 当前产品规则 | 静态通过，待解锁实机复核 |
| 声音设置 | 恢复接近版结构；仅替换标准按钮变体 | 当前接近版 + 设置参考图 | 静态通过，待解锁实机复核 |
| 工作台 | 保持已修正结构；补标准按钮类 | 对话参考图 | 既有有效截图评分 91；最终回归待补 |
| 我的 | 恢复 UI 完成版，使用正式账户卡插画 | `codex/aivoice-ui-final` | 静态通过，待解锁实机复核 |
| 购买积分 | 恢复完成版积分卡和底部操作栏，保留 50 积分规则 | `codex/aivoice-ui-final` | 静态通过，待解锁实机复核 |
| 我的声音 | 恢复完成版大头像状态卡 | `codex/aivoice-ui-final` | 静态通过，待解锁实机复核 |
| 登录 | 恢复完成版品牌视觉，保留当前直接微信登录逻辑 | `codex/aivoice-ui-final` | 静态通过，待解锁实机复核 |
| 选择视频 | 恢复完成版媒体宫格和标准底栏 | `codex/aivoice-ui-final` | 静态通过，待解锁实机复核 |
| 标记片段 | 恢复完成版波形选择和标准底栏 | `codex/aivoice-ui-final` | 静态通过，待解锁实机复核 |
| 信息与授权 | 保持当前关系/称呼字段结构，不重构 | 当前接近版 | 静态通过，待解锁实机复核 |
| 创建进度 | 恢复完成版进度视觉和阶段列表 | `codex/aivoice-ui-final` | 静态通过，待解锁实机复核 |
| 试听 | 恢复完成版头像/波形试听结构 | `codex/aivoice-ui-final` | 静态通过，待解锁实机复核 |
| 协议文档 | 保持当前结构，不重构 | 当前接近版 | 静态通过，待解锁实机复核 |

## 标准组件与正式资产

新增或恢复的标准组件：

- `app-button`
- `bottom-action-bar`
- `app-avatar`
- `app-chevron`
- `menu-row`

恢复的正式资产包括：

- `account-identity-hero.png`
- `account-edit.webp`
- `account-stat-voices.webp`
- `account-stat-points.webp`
- `account-orders.webp`
- `account-points.webp`
- `account-help.webp`
- `account-service.webp`
- `points-bag.png`
- `hero-memory.png`
- `icon-waveform.png`
- `icon-more-glass.png`
- `chat-mode.png`
- `mic-mode.png`

## 自动验证

- `npm run typecheck:miniprogram`：PASS
- `npm run test:miniprogram`：40 PASS / 0 FAIL（迁入 `main` 后复验）
- 小程序 JSON 全量解析：PASS
- 正式 UI 资产存在性：PASS
- `git diff --check -- apps/miniprogram`：PASS（仅 CRLF 提示）

可复用的微信开发者工具实机审计脚本：

- `node scripts/acceptance/ui-all-pages-audit.cjs`：按页面顺序采集真实状态与受控状态截图、控制台和异常日志。
- `node scripts/acceptance/ui-audit-state.cjs <state>`：单独打开并检查指定页面状态。
- 两个脚本默认连接 `ws://127.0.0.1:9422`，也可通过 `WECHAT_AUTOMATION_WS` 指定开发者工具自动化端点。

## 尚未通过的门禁

Windows 桌面处于锁屏状态。根据桌面自动化安全规则，未尝试解锁，也未继续截图。因此除工作台已有旧截图外，其余恢复后的页面只能标记为：

`PASS_NEEDS_MANUAL_UI_REVIEW`

桌面解锁后必须按上述页面顺序重新打开、截图、检查控制台，并逐页运行 Visual Verdict；分数达到 90 以上后才能标记视觉 PASS。
