# OpenTars 前端接口补齐建议

> 对照后端仓库 `0xdenny218/opentars`，审查基线：`0a83856`（2026-07-24）。
> 本文只记录当前源码中无法由前端可靠补偿的接口缺口。

## 1. 人格市场缺少“使用人格”能力

### 当前状态

当前路由仅支持：

- `GET /v1/persona-twin`
- `POST /v1/persona-twin/generate`
- `PATCH /v1/persona-twin/name`
- `POST /v1/persona-twin/publish`
- `POST /v1/persona-twin/unpublish`
- `GET /v1/persona-twins/market`

`client.profile.select` 只能选择 `/v1/config` 中的内置 profile，市场返回的 twin ID
不能用于该事件。因此 B Version 目前将市场人格作为只读预览，不显示“使用”按钮。

### 建议补充

请先确定市场人格的使用语义：

1. 仅当前 AppWS session 生效；或
2. 保存为用户默认人格，后续 session 继续生效。

建议接口：

```http
POST /v1/persona-twins/{twin_id}/use
Authorization: Bearer <access_token>
Content-Type: application/json

{"scope":"session"}
```

建议响应：

```json
{
  "twin_id": "123",
  "scope": "session",
  "applied": true,
  "profile_id": "optional-runtime-profile-id"
}
```

如果人格只允许通过 AppWS 切换，也可以新增
`client.persona_twin.select { twin_id }`，并返回明确的成功/失败事件。请勿让客户端把
twin ID 直接当作现有 `profile_id`。

### 验收条件

- 未发布、已下架或无权限人格返回稳定错误码。
- 明确是否增加 `use_count`，以及重复使用是否重复计数。
- 切换成功后提供服务端确认事件，前端失败时可以回滚选中状态。

## 2. 翻译原文和译文缺少公共关联字段

### 当前状态

翻译 worker 内部事件已经包含 `sequence`、`start_time` 和 `end_time`，但映射到 AppWS 后：

- `server.input.transcript` 只有 `{text, final}`；
- `server.response.transcript` 只有 `{text, reply_id}`；
- 仅译文的 `reply_id` 隐含 `translation-<sequence>`。

前端可按到达顺序做基础展示，但在插话、中断、丢包和重连场景下无法可靠建立原文与译文
的一一对应关系。

### 建议补充

建议保持现有事件名，在翻译模式下增加可选字段：

```json
{
  "text": "你好",
  "final": true,
  "source": "translation",
  "sequence": 12,
  "start_ms": 1800,
  "end_ms": 2450
}
```

```json
{
  "text": "Hello",
  "reply_id": "translation-12",
  "source": "translation",
  "sequence": 12,
  "start_ms": 1800,
  "end_ms": 2450
}
```

`sequence` 应在一次 translation session 内单调递增。若重新进入翻译模式会归零，请同时提供
稳定的 `stream_id`；否则应保证同一 AppWS session 内不复用旧序号。

### 验收条件

- 原文、译文和对应音频可以使用同一关联键。
- interrupt 后能够识别哪些未完成片段应被丢弃。
- 明确 `final` 对源文本和译文的含义。

## 3. 协议文档与当前运行时行为需要注明

以下两项不会阻塞 B Version，但建议更新文档，避免其他客户端错误依赖：

1. `server.input_audio_buffer.speech_started/stopped` 在协议中存在，但当前 server mode
   没有实际发送调用，且现有广播方法已标记 deprecated。前端目前使用本地 Audio Analyser
   驱动录音视觉反馈。
2. `client.response.audio.feedback` 当前仅记录日志，不参与播放同步、补发或流控。前端仍会按
   协议发送 `played/interrupted/error`，但不会依赖服务端处理结果。

## 前端当前边界

- 内置 profile：允许通过 `client.profile.select` 切换。
- 人格市场：登录后读取并只读展示。
- 翻译文本：可以展示，但在关联字段补齐前不承诺严格双栏逐句配对。
- 普通录音停止：发送 `client.input.audio.commit`。
- `client.session.input_reset`：仅用于显式取消/复位，不作为正常停止录音动作。
