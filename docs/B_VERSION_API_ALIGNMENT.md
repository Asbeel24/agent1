# B Version 接口对齐记录

## 结论

B Version 已按 `0xdenny218/opentars` 当前 `main` 的 Swagger 与 Go AppWS 协议对齐。
审查基线为后端提交 `40a1eac`（2026-07-24）。

B Version 从 `refactor/frontend-foundation` 创建。视觉、布局、Shader 和现有交互保持不变，
只修改服务层、协议类型、鉴权状态同步和接入配置。

## 实现矩阵

| 能力 | 文档协议 | B Version |
| --- | --- | --- |
| 公共配置 | `GET /v1/config` | 已接入语言和 profile 选项 |
| 登录与刷新 | Bearer + `/v1/auth/refresh` | 客户端已实现；不增加登录 UI |
| 当前会话 | `GET /v1/me` | 已实现 |
| HTTP 错误 | 对象结构 + 会议旧字符串结构 | 已兼容 |
| 当日任务 | `date + timezone` | 已接入任务抽屉 |
| 日历任务 | `start_date + end_date` | API 已实现；日历 UI 待接 |
| 人格选择 | `client.profile.select` | live AppWS 已接 |
| AppWS 信封 | `{id?, event, data?}` | 已替换旧 `{type,data}` |
| 浏览器 WS 鉴权 | `?access_token=` | 已 URL 编码并接入 |
| 心跳与重连 | 30s ping + 抖动退避 | 已实现 |
| 翻译模式 | start / stop | 已随场景切换发送 |
| 实时上行音频 | PCM16 mono 16kHz Base64 | 已从麦克风降采样发送 |
| 实时下行音频 | PCM Base64 | 已接顺序播放、interrupt 和反馈 |
| 任务实时事件 | started/progress/steps/... | 已按 Go 可选字段建模和校验 |
| 会议列表/详情 | `/v1/meetings...` | 已实现 |
| 会议转写/总结 | transcript / schema v2 summary | 已实现 |
| 会议上传会话 | initialize / credentials / complete / abort | 已实现 HTTP 接口 |
| 会议资产 | list / upload / download / audio | 已实现 |
| 说话人别名 | `PUT .../speaker-aliases` | 已实现 |
| 公开会议分享 | share + public token | 已实现 |
| 人格分身管理 | get / generate / rename / publish / unpublish | 已实现 |
| 人格市场 | `/v1/persona-twins/market` | 登录后只读展示；后端暂无使用接口 |

## 和旧契约的差异

1. AppWS 外层字段是 `event`，不是 `type`。
2. `id` 是可选跟踪字段，不保证去重或通用关联。
3. 音频不是二进制 WebSocket 帧，而是 JSON 中的标准 Base64 PCM。
4. `server.task.completed` 的 payload 不是 TaskSnapshot，而是 `{task_id,result?,elapsed_seconds}`。
5. AppWS 没有 `server.task.snapshot`；断线恢复使用 HTTP。
6. Onboarding 字段为 `total/index/text`，不是早期推测的 `total_questions/question`。
7. 翻译结果主要通过 `server.response.audio`、转写和 session mode 事件表达，不存在旧契约中的 `server.translation.source/target/state`。

## 启用 live 模式

复制 `.env.example` 的变量到本地环境。变量名与 OpenTars 仓库现有命名一致：

```env
VITE_OPENTARS_API_MODE=live
VITE_OPENTARS_API_BASE_URL=https://agent1-dev-api.bicamind.xyz
VITE_OPENTARS_WS_URL=wss://agent1-dev-api.bicamind.xyz/ws
VITE_OPENTARS_ACCESS_TOKEN=<development-access-token>
VITE_OPENTARS_REFRESH_TOKEN=<development-refresh-token>
```

旧的 `VITE_AGENT1_*` 变量仍兼容，便于现有部署平滑迁移。真实令牌不得提交。
没有令牌时仍可读取公开配置，认证接口数据保持现有 mock 回退，不改变界面。

令牌也可以由宿主调用 `agent1Api.login()`、`agent1Api.register()` 或
`SessionTokenStore.setTokens()` 写入。令牌更新会触发 AppWS 使用新 token 自动重连，
不需要刷新页面。

开发环境还需要后端 CORS 包含前端的准确 origin。当前线上后端允许
`https://agent1-dev.bicamind.xyz`，但不允许 `http://127.0.0.1:5173`。本地联调时应在
OpenTars server 配置中加入本地 origin；这属于后端部署配置，前端不会绕过浏览器 CORS。

## 会议模式边界

OpenTars 后端明确将会议录音定义为本地 WAV 加会议上传会话，不经过 AppWS。B Version
因此在会议场景中不发送 `client.input.audio.append` 或 `client.input.audio.commit`，
避免会议音频被实时助手误消费。界面和录音视觉没有改变。

当前 API 层已提供完整上传会话和资产方法。将本地 WAV/TOS SDK 管线接到现有录音按钮属于
后续业务接线，不在本次“前端不变”的范围内。

## 自动契约检查

后端仓库现在提交了 Swagger JSON。联仓开发时运行：

```bash
npm run contract:check -- ../opentars/server/swaggerdocs/swagger.json
```

检查覆盖 46 个 HTTP operation 和 13 个关键响应 schema。后端删除或更名这些契约时，
命令会失败并列出差异。

## 只读实测

2026-07-24 对开发环境做了只读验证：

- `/healthz` 返回 `opentars-server / ok`
- `/v1/config` 返回 12 个 voice、4 个 profile、22 种语言和 42 个翻译语言对

这与接口文档描述的顶层结构一致。

## 保持不变的部分

- 不新增登录、注册或设置界面。
- 不改动场景导航、抽屉和会议文本页面。
- 不改动 Shader、球体参数、录音动效与响应式样式。
- 人格市场与翻译关联的后端缺口仍按
  [`BACKEND_INTERFACE_GAPS.md`](./BACKEND_INTERFACE_GAPS.md) 处理，不在前端猜测语义。
