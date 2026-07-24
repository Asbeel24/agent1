# B Version 接口对齐记录

## 结论

新接口文档已经把上一版的主要未知项全部确认：HTTP 域名、Bearer 鉴权、刷新流程、AppWS 地址、浏览器鉴权方式、消息信封、实时音频格式、任务结构和会议直传方案。

B Version 从 `refactor/frontend-foundation` 创建，视觉层保持不变，服务层改为 mock / live 双轨。

## 实现矩阵

| 能力 | 文档协议 | B Version |
| --- | --- | --- |
| 公共配置 | `GET /v1/config` | 已接入语言和 profile 选项 |
| 登录与刷新 | Bearer + `/v1/auth/refresh` | 客户端已实现；登录 UI 待设计 |
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
| 任务实时事件 | started/progress/steps/... | 已建模和校验；UI 状态合并待接 |
| 会议列表/详情 | `/v1/meetings...` | API 已实现 |
| 会议转写/总结 | transcript / schema v2 summary | API 已实现；文本 UI 待接真实数据 |
| TOS 直传 | 官方 TOS SDK + checkpoint | 尚未实现 |
| 公开会议分享 | share + public token | 尚未实现 |
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

复制 `.env.example` 的变量到本地环境并设置：

```env
VITE_AGENT1_API_MODE=live
VITE_AGENT1_ACCESS_TOKEN=<development-access-token>
VITE_AGENT1_REFRESH_TOKEN=<development-refresh-token>
```

真实令牌不得提交。没有令牌时，公开配置仍可读取，认证接口数据回退为本地 mock。

## 只读实测

2026-07-24 对开发环境做了只读验证：

- `/healthz` 返回 `opentars-server / ok`
- `/v1/config` 返回 12 个 voice、4 个 profile、22 种语言和 42 个翻译语言对

这与接口文档描述的顶层结构一致。

## 下一阶段

1. 设计登录/注册界面，移除开发令牌环境变量依赖。
2. 用 HTTP + AppWS 合并任务抽屉状态。
3. 将会议文本页替换为真实 transcript / summary。
4. 使用后端已指定的 `@volcengine/tos-sdk@2.9.1` 实现 WAV、SHA-256、OPFS 与 checkpoint。
5. 待后端补齐人格市场使用接口和翻译片段关联字段；详见
   [`BACKEND_INTERFACE_GAPS.md`](./BACKEND_INTERFACE_GAPS.md)。
