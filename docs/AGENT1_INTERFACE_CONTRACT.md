# Agent1 前后端接口契约

依据《OpenTars 交互界面 · 用户旅程文档》（2026-07-23）整理。本文只把源码旅程能够证明的内容定为契约；无法从文档证明的传输细节列入“待后端确认”，避免前端自行发明协议。

对应的可编译类型位于 [`src/protocol/agent1.ts`](../src/protocol/agent1.ts)。

## 1. 接口分层

| 层 | 用途 | 当前结论 |
| --- | --- | --- |
| HTTP | 登录、服务端配置、任务快照、会议上传与归档 | 业务能力已确认；除任务快照外，路径仍需后端确认 |
| WebSocket | 实时会话、翻译、任务、Onboarding、TTS 事件 | 事件名与业务 payload 已固化为 TypeScript 类型 |
| Binary audio | 麦克风 PCM/编码音频上行与 TTS 音频下行 | 文档未给出编码、采样率、帧头及背压策略，暂不实现 |
| Orb JS API | 声强、横滑、preset、人格色、marker、burst | 已由 `window.particleOrb` 实现，不属于后端协议 |

`src/protocol/agent1.ts` 使用 `{ type, data }` 作为前端内部的标准事件形态。它不是对 WebSocket 外层格式的假设；网络适配层必须在后端确认协议后，将真实 wire envelope 转换为该形态。

## 2. WebSocket 事件

### Client → Server

| 事件 | Payload | 触发点 |
| --- | --- | --- |
| `client.onboarding.answer` | `{ answer, question_id? }` | 用户完成一题语音回答 |
| `client.onboarding.skip` | `{}` | 用户跳过首次引导 |
| `client.translation.start` | `{ source_lang, target_lang }` | 翻译模式开始连续采集 |
| `client.translation.stop` | `{}` | 翻译模式停止 |
| `client.task.cancel` | `{ task_id, reason }` | 用户从任务光墨取消任务 |
| `client.review_candidates.evidence` | `{ candidate_id }` | 用户请求查看记忆候选证据 |

### Server → Client

| 事件组 | 事件 |
| --- | --- |
| 连接与错误 | `server.connected`, `server.error` |
| 输入转写 | `server.input.transcript` |
| Onboarding | `server.onboarding.started`, `.question`, `.completed` |
| 翻译 | `server.translation.source`, `.target`, `.state` |
| 任务 | `server.task.snapshot`, `.draft_created`, `.awaiting_details`, `.ready`, `.started`, `.steps_created`, `.step_started`, `.step_progress`, `.step_completed`, `.progress`, `.result_pending_announcement`, `.completed`, `.failed`, `.cancelled` |
| TTS | `server.tts.sentence.start`, `.end` |

翻译片段必须携带 `stream_id + sequence`。前端以 `stream_id` 区分代际，并丢弃同一流内 `sequence` 不递增的旧包。可选时间字段为 `start_time_ms / end_time_ms`。

翻译状态为闭集：

```ts
type TranslationStreamState =
  | 'armed'
  | 'ready'
  | 'recovering'
  | 'recovered'
  | 'unavailable'
  | 'stopped'
```

## 3. HTTP 能力

文档明确给出的任务补拉接口：

```http
GET /v1/tasks?scope=open&limit=20
GET /v1/tasks?scope=recent&limit=20
```

前端合并并按 `task.id` 去重，再按需拉取详情。详情应包含 `steps / evidence / artifacts`。

会议链路需要以下能力，但文档没有给出 URL，因此这里只冻结语义，不冻结路径：

1. 创建分片上传会话，返回 `meeting_id / part_size / total_bytes / 已确认分片`。
2. 上传缺失分片、暂停、继续、终止上传。
3. 查询校验/登记状态。
4. 列出会议、读取带鉴权音频、删除会议。
5. 发起转写、读取转写。
6. 发起总结、读取总结。

## 4. 任务数据最小字段

```ts
type TaskSnapshot = {
  id: string
  status:
    | 'draft'
    | 'awaiting_details'
    | 'ready'
    | 'queued'
    | 'planning'
    | 'pending'
    | 'running'
    | 'retrying'
    | 'awaiting_confirmation'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
  context?: string
  clarification_question?: string
  missing_fields?: string[]
  progress?: number
  result?: string
  error?: string
  steps?: TaskStep[]
  evidence?: TaskEvidence[]
  artifacts?: TaskArtifact[]
  updated_at?: string
}
```

步骤事件必须携带 `task_id` 与稳定的 `step.id`。球体 marker 只能按任务寻址，不能用步骤索引冒充任务索引。

## 5. 待后端确认的阻塞项

以下内容在确认前不接真实网络：

1. WebSocket 消息外层究竟是 `{ type, data }`、`{ event, payload }`，还是其他格式。
2. WebSocket 鉴权方式：query token、首包鉴权或 Cookie。
3. 主场录音的开始/停止事件、音频编码、采样率、分片大小和 commit 语义。
4. TTS 音频的下行格式及文本事件与音频帧的关联键。
5. 会议 HTTP 的实际路径、方法、错误结构与分片幂等键。
6. `server.task.snapshot` 是 WS 推送还是 HTTP 响应镜像。
7. 所有事件是否统一携带 `request_id / session_id / timestamp / schema_version`。

## 6. 接入准则

- 只有 `setAudioLevel` 与 `setHorizontalInput` 允许逐帧更新；业务事件不能直接驱动 Shader uniform。
- 球体颜色只表达人格。翻译/会议场景色由 DOM 承担。
- 任务 marker 最多 6 个，另预留 1 个记忆 marker 和 1 个采集 marker。
- 录音停止后必须关闭 MediaStream、AudioContext、rAF，并立刻写入 `setAudioLevel(0)`。
- WebSocket 事件进入 UI 前必须先过事件名与 payload 字段级运行时判别；未知或畸形事件记录但不得让页面崩溃。
