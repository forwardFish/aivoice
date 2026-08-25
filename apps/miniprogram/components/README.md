# Aivoice 小程序组件规范

本目录只允许两层组件：

```text
components/
├── ui/          # 不含产品业务语义的基础组件，标签统一使用 ui-* 前缀
└── business/    # 声音、积分、生成等业务组件，标签使用清晰业务名称
```

## UI 组件

| 标签 | 目录 | 职责 |
| --- | --- | --- |
| `ui-button` | `ui/button` | primary / secondary / ghost / danger 按钮 |
| `ui-avatar` | `ui/avatar` | 真实头像与统一回退视觉 |
| `ui-nav` | `ui/nav` | 自定义顶部导航与微信胶囊避让 |
| `ui-bottom-bar` | `ui/bottom-bar` | 固定底部操作栏与安全区 |
| `ui-sheet` | `ui/sheet` | 底部弹窗遮罩、圆角和安全区 |
| `ui-menu-row` | `ui/menu-row` | 设置和账户菜单行 |
| `ui-page-state` | `ui/page-state` | loading / empty / error / success 状态 |

## 业务组件

| 标签 | 目录 | 职责 |
| --- | --- | --- |
| `voice-player` | `business/voice-player` | 音频播放、进度与下载 |
| `voice-input-dock` | `business/voice-input-dock` | 语音/键盘输入底栏 |
| `quota-purchase-dialog` | `business/quota-purchase-dialog` | 积分不足与购买入口 |

## 固定约束

1. 页面不得重新定义主按钮渐变、固定底栏、弹窗遮罩、头像回退或菜单行。
2. UI 组件只通过 properties 接收状态，通过自定义事件向页面报告动作，不直接调用业务 API。
3. 事件统一使用名词或动作原形：`action`、`close`、`input`、`send`、`hold`、`mic`。
4. 颜色、圆角、间距、阴影和动效只能来自 `styles/` 下的 Token；页面不得新增随意数值。
5. 复杂业务视觉保留自有实现，不使用通用 Card 代替声音卡、波形、购买卡或生成状态。
6. 新组件必须有至少一个源码结构回归测试，并通过 `typecheck:miniprogram` 与 `test:miniprogram`。
