# TOS SDK 动态导入 — 缩减首屏 JS 体积

日期：2026-07-25
分支：B-Version

## 背景

`npm run build` 当前产生 `index-*.js` 1.1 MB（gzip 324 KB），超出 App 类预算 300 KB（gzip < 100 KB）。`dist/stats.html` 体积归因表明大头是 `@volcengine/tos-sdk`，但它只在“会议场景录音上传”路径被使用。访客、任务、人格市场等场景都不需要该 SDK，却仍要随首屏下载。

SDK 目前在 `src/services/meeting/tosUploader.ts` 顶层静态 `import`，并通过 `services/meeting/index.ts` 的 barrel 出口与 singleton `tosMeetingUploader` 一起被 `useMeetingUpload` 间接引用，导致任何访问会议组件的代码路径都会拉取整段 SDK。

## 目标

1. 首屏 `index.js` 不再包含 `@volcengine/tos-sdk`；访客与未进入会议场景的用户零下载成本。
2. SDK 在用户点击粒子球结束录音时按需加载；加载失败显式进入 `failed` 状态。
3. 现有录制 / 上传 / 暂停 / 终止接口契约保持不变；测试覆盖与现状对齐。

## 非目标

- 不引入新依赖、不修改 `package.json`。
- 不实现 multipart REST fallback（如果 SDK 加载失败，不再自行上传）。
- 不重写 `wavRecorder` / `opfsStorage` / `uploadPipeline`，仅调整 SDK 装载方式。
- 不调整 `App.tsx`、`MeetingTranscript.tsx`、`vite.config.ts`。
- 不拆分额外的 Vite `manualChunks`，由 Rollup 自动识别 `import()`。

## 设计

### 1. `tosUploader.ts`

把默认 adapter 从“同步实例化 SDK”改为“按需异步装载”：

- 移除顶层 `import { CancelToken, TosClient, isCancel } from '@volcengine/tos-sdk'`。
- 导出 `loadDefaultAdapter(): Promise<TosSDKAdapter>`，内部 `await import('@volcengine/tos-sdk')`，复用现有 `CancelToken.source()`、`new TosClient({...})` 与 `isTosCancel` 实现。
- `createTosMeetingUploader(adapter: TosSDKAdapter | (() => Promise<TosSDKAdapter>) = loadDefaultAdapter)`：
  - 同步构造时只缓存“如何拿到 adapter”，不触发网络；
  - 内部维护 `let resolved: TosSDKAdapter | null = null`；
  - `start()` 在执行现有逻辑前 `const sdk = await resolve()`；同步传入的 adapter 直接缓存，函数式 adapter 调用一次后缓存结果。
- `tosMeetingUploader` singleton 不再导出；调用方一律通过 `createTosMeetingUploader()`（或通过 pipeline 隐式创建）拿到实例。
- `isTosMeetingUploadCancellation` 改为不依赖 SDK：只保留本地 sentinel（`__CANCEL__ === true || code === 'ERR_CANCELED'`）。`isTosCancel` 不再被引用。

### 2. `services/meeting/index.ts`

barrel 出口调整：

- 仍然 re-export `createTosMeetingUploader`、`isTosMeetingUploadCancellation`、`isTosUploadCheckpoint`、`toTosSDKEndpoint`。
- 移除 `tosMeetingUploader` 的 re-export，避免上层通过 barrel 静态拿到 singleton。
- 同步移除类型导出中的 `tosMeetingUploader`。

### 3. `useMeetingUpload.ts`

- 不修改 hook 接口、不新增状态字段。
- `stop()` 走 `pipeline.stopAndUpload`，pipeline 内部 `uploader.start` 现在会在 `await resolve()` 处等待 SDK；加载失败直接 reject，hook 现有 `catch` 分支把它当作业务错误处理，进入 `state='failed'`，`error` 显示抛出的 message。
- 新增测试覆盖：注入一个会 reject 的 loader 验证 `stop()` 进入 `failed`。

### 4. `vite.config.ts`

不修改。`import('@volcengine/tos-sdk')` 由 Rollup 识别为动态 chunk，输出独立 `assets/tos-sdk-*.js`。

## 错误处理

| 失败点 | 行为 |
|---|---|
| `import('@volcengine/tos-sdk')` reject | adapter resolve reject → `uploader.start` 的 `result` reject → hook `stop()` 进入 `failed`，`error` 透传 reject.message |
| loader 抛错但 `pause/abort` 已被调用 | `pause` / `abort` 仍可安全调用：因为它们依赖 `currentCheckpoint`，对未启动的 task 立即返回 |
| `validateTarget` 失败 | 行为不变，仍 throw “服务器返回了无效的 TOS 上传凭证” |
| 首次 `start()` 加载成功但后续 `client.uploadFile` reject | 行为不变，保留 checkpoint，进入 `failed` |
| `dispose` 在 SDK 加载之前被调用 | 行为不变；adapter 尚未 resolve，不触发网络请求 |

## 数据流

1. 应用启动：`useMeetingUpload` 同步加载，**不触发 SDK 网络请求**。
2. 用户点击粒子球：`start()` 调用 `pipeline.startRecording`，写 OPFS，**不触发 SDK**。
3. PCM 帧持续写入 OPFS。
4. 用户再次点击结束录音：`stop()` 调用 `pipeline.stopAndUpload` → `uploader.start` → 第一次进入时 `await resolve()` → `import('@volcengine/tos-sdk')`。
5. 加载完成：复用现有 `client.uploadFile` 流程，分片上传 + checkpoint + complete。
6. 失败：`result` reject，hook 切到 `failed`，UI 提示错误文案。

## 测试

### `src/services/meeting/__tests__/tosUploader.test.ts`

新增用例：

1. 工厂传入函数式 adapter，第一次 `start()` 调用 loader，第二次不再调用。
2. loader reject 时 `result` reject，且 `pause()` / `abort()` 不抛错。
3. 工厂传入同步 `TosSDKAdapter` 对象时，`start()` 不会触发 loader。
4. 现有 `validateTarget` / `checkpoint` / `endpoint` 用例继续通过。

### `src/hooks/__tests__/useMeetingUpload.test.ts`

新增用例：

1. SDK loader reject 时，`await stop()` 抛出，状态变成 `failed`，`error` 字段写入消息。
2. SDK loader resolve 时，行为与现状一致（仍进入 `finished`）。
3. 现有 `recording → finalizing → uploading → finished` 流程测试继续通过。

### 不修改

- `wavRecorder.test.ts`
- `opfsStorage.test.ts`
- `uploadPipeline.test.ts`
- `MeetingTranscript.test.tsx`

## 验证

```bash
npm run typecheck   # tsc -b 通过
npm test            # vitest 全过
npm run build       # 检查 dist/index-*.js 与新 tos-sdk chunk 大小
```

成功条件：

- `dist/index-*.js` gzip ≤ 150 KB。
- 出现 `dist/assets/tos-sdk-*.js` 独立 chunk。
- 23 个测试文件、全部用例通过。
- 未引入新的 `any` 或新增依赖。

## 范围与文件清单

| 操作 | 文件 |
|---|---|
| 修改 | `src/services/meeting/tosUploader.ts` |
| 修改 | `src/services/meeting/index.ts` |
| 修改 | `src/services/meeting/__tests__/tosUploader.test.ts` |
| 修改 | `src/hooks/useMeetingUpload.ts`（仅在 stop 错误路径中新增测试可达字段，无源码接口变更） |
| 修改 | `src/hooks/__tests__/useMeetingUpload.test.ts` |

不修改：

- `package.json`、`vite.config.ts`、`App.tsx`、`MeetingTranscript.tsx`
- `wavRecorder.ts`、`opfsStorage.ts`、`uploadPipeline.ts`
- `docs/PROJECT_HANDOFF_2026-07-24.md`

## 风险与权衡

- 正面：访客零 SDK 下载成本；首屏 JS 回到预算内。
- 代价：录音上传首次启动多一次 chunk 请求；估算 < 200 ms（dev 环境）、< 1 s（首次冷加载）。
- 后续可优化（不在本次范围）：用 Service Worker 预缓存 SDK chunk；或拆分更细的 chunk 以提升 cache 命中率。