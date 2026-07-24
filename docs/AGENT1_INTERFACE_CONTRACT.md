# Agent1 前后端接口契约

本契约以《OpenTars HTTP API 与 AppWS 接口文档》（2026-07-24）为唯一协议来源。B Version 不再使用早期用户旅程文档推测传输格式。

可编译类型和客户端实现：

- [`src/protocol/agent1.ts`](../src/protocol/agent1.ts)：AppWS 信封、事件和运行时判别
- [`src/api/httpClient.ts`](../src/api/httpClient.ts)：Bearer 鉴权、错误解析和令牌刷新
- [`src/api/agent1Api.ts`](../src/api/agent1Api.ts)：HTTP 业务接口
- [`src/api/appWsClient.ts`](../src/api/appWsClient.ts)：AppWS 建连、心跳和重连

## 1. 环境

| 类型 | 开发环境 |
| --- | --- |
| HTTP API | `https://agent1-dev-api.bicamind.xyz` |
| AppWS | `wss://agent1-dev-api.bicamind.xyz/ws` |
| Web | `https://agent1-dev.bicamind.xyz` |

浏览器通过环境变量切换：

```env
VITE_AGENT1_API_MODE=live
VITE_AGENT1_API_URL=https://agent1-dev-api.bicamind.xyz
VITE_AGENT1_WS_URL=wss://agent1-dev-api.bicamind.xyz/ws
```

B Version 默认启用 `live`；只有显式设置 `VITE_OPENTARS_API_MODE=mock`
或在测试环境中才使用 mock。

## 2. HTTP

除公开接口外均使用：

```http
Authorization: Bearer <access_token>
```

收到 `401` 时，客户端以 `refresh_token` 调用 `POST /v1/auth/refresh`。刷新成功必须同时替换两种令牌；刷新失败清空会话。

当前 B Version 已建模并封装：

- `/v1/config`
- `/v1/auth/register|login|refresh|logout`
- `/v1/tasks` 日列表与日历列表
- `/v1/tasks/{id}/status|cancel|suggestion-decision`
- `/v1/persona-twin...` 与 `/v1/persona-twins/market`
- `/v1/meeting-settings`
- `/v1/meetings`、详情、转写与总结

错误解析同时兼容：

```json
{"error":{"code":"validation_error","message":"request validation failed"}}
```

和会议设置旧结构：

```json
{"error":"invalid meeting settings request"}
```

## 3. AppWS

### 3.1 浏览器鉴权

浏览器原生 `WebSocket` 不能添加 Authorization Header，因此使用 URL 编码后的查询参数：

```text
wss://agent1-dev-api.bicamind.xyz/ws?access_token=<encoded-token>
```

不得记录或上报包含令牌的完整 URL。

### 3.2 消息信封

客户端与服务端统一使用：

```json
{
  "id": "optional-message-id",
  "event": "server.connected",
  "data": {
    "session_id": "session-id"
  }
}
```

- `event` 必填。
- `id` 可选；不能当作通用请求响应关联键。
- `data` 可以是对象、`null` 或省略。
- 已知事件走字段级校验；未知事件保留信封并安全忽略。

### 3.3 心跳与重连

- 建连后每 30 秒发送 `client.ping`。
- 没有对应 JSON `server.pong`。
- 断线采用 1、2、4、8 秒上限的抖动退避。
- `auth_session_revoked` 会停止重连、清空认证并关闭连接。

## 4. 实时音频

实时对话使用 PCM16 单声道 16000Hz、标准 Base64：

```json
{
  "event": "client.input.audio.append",
  "data": {
    "format": "pcm",
    "sample_rate": 16000,
    "data": "<base64-pcm-bytes>"
  }
}
```

B Version 将浏览器麦克风采样降采样为 16kHz PCM16，并按约 170ms 一帧发送。录音结束发送 `client.input.audio.commit`。

会议录音不是 AppWS 音频：会议使用 WAV / PCM16 / 16kHz / 单声道，经 TOS SDK 直传，最大 512MiB、4 小时。

## 5. 翻译与人格

- 语言列表和合法语言对来自 `GET /v1/config`，不能写死。
- 进入翻译场景发送 `client.translation.start`。
- 离开翻译场景发送 `client.translation.stop`。
- 人格选项来自 `config.profile.options`。
- 选择人格发送 `client.profile.select`。

## 6. 任务

HTTP 是断线恢复与最终状态的权威来源；AppWS 只提供实时增量。

日历任务状态包括：

`suggested`、`draft`、`awaiting_details`、`ready`、`scheduled`、`pending_dispatch`、`pending`、`running`、`succeeded`、`failed`、`cancelled`。

必须注意不同接口的时间格式：

- 任务列表：Unix 秒
- AppWS 任务事件：Unix 毫秒
- 任务详情：RFC3339

## 7. 会议

会议 HTTP 类型已经建模，B Version 当前可读取：

- 会议列表和详情
- 结构化转写
- schema v2 总结
- 说话人别名相关数据
- 转写与总结触发状态

TOS SDK 直传、checkpoint 与短期凭证续期尚未接入浏览器 UI，不应以普通 `fetch` 上传会议 WAV。

## 8. 安全准则

- TOS 临时密钥只放内存，不能进入日志、数据库或诊断文件。
- 会议能力 URL 是短期不透明字符串，过期后重新获取详情。
- 令牌不进入埋点、错误上报或 WebSocket URL 日志。
- 所有列表兼容空数组。
- 未知枚举值降级展示，不让 UI 崩溃。
