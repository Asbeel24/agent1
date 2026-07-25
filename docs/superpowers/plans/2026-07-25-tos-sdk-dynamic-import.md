# TOS SDK 动态导入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `@volcengine/tos-sdk` 从主 chunk 中剥离，使首屏 `index.js` 不再包含 SDK；SDK 在用户结束录音时按需动态加载。

**Architecture:** 把 `tosUploader.ts` 中默认 adapter 改为按需异步装载：导出 `loadDefaultAdapter()` 用 `await import('@volcengine/tos-sdk')` 拿到 SDK；`createTosMeetingUploader(adapter)` 接受同步 adapter 或返回 adapter 的 loader 函数，`start()` 在第一次执行时 await loader 并缓存结果。`services/meeting/index.ts` 不再导出 `tosMeetingUploader` singleton（避免静态引用）。其余模块无改动。

**Tech Stack:** React 18、TypeScript strict、Vitest、@testing-library/react、Vite 5。

---

## 文件结构

| 操作 | 文件 | 职责 |
|---|---|---|
| 修改 | `src/services/meeting/tosUploader.ts` | 把默认 adapter 改成 lazy loader，提供 `loadDefaultAdapter` 工厂 |
| 修改 | `src/services/meeting/index.ts` | 移除 `tosMeetingUploader` 的 re-export，避免静态引用 SDK |
| 修改 | `src/services/meeting/__tests__/tosUploader.test.ts` | 新增 lazy loader 行为用例 |
| 修改 | `src/hooks/__tests__/useMeetingUpload.test.ts` | 新增 SDK 加载失败 → `failed` 用例 |

不修改：

- `package.json`、`vite.config.ts`、`App.tsx`、`MeetingTranscript.tsx`
- `wavRecorder.ts`、`opfsStorage.ts`、`uploadPipeline.ts`
- `docs/PROJECT_HANDOFF_2026-07-24.md`
- `useMeetingUpload.ts` 源码（仅添加测试覆盖，不修改接口或状态字段）

---

## Task 1: 重构 `tosUploader.ts` 提供 lazy loader

**Files:**
- Modify: `src/services/meeting/tosUploader.ts`
- Test: `src/services/meeting/__tests__/tosUploader.test.ts`

- [ ] **Step 1.1: 删除顶层 SDK 静态 import**

在 `src/services/meeting/tosUploader.ts` 顶部把：

```ts
import {
  CancelToken,
  TosClient,
  isCancel as isTosCancel,
} from '@volcengine/tos-sdk';
```

替换为：

```ts
import type { MeetingUploadTarget } from '../../api/contracts';
```

并删除 `import type { MeetingUploadTarget } from '../../api/contracts';` 行（如果它已经存在，保持单条 `import type`）。

- [ ] **Step 1.2: 把 `isTosMeetingUploadCancellation` 改为不依赖 SDK**

把现有函数：

```ts
export function isTosMeetingUploadCancellation(error: unknown): boolean {
  if (isTosCancel(error)) return true;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { __CANCEL__?: unknown; code?: unknown };
  return candidate.__CANCEL__ === true || candidate.code === 'ERR_CANCELED';
}
```

替换为：

```ts
export function isTosMeetingUploadCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { __CANCEL__?: unknown; code?: unknown };
  return candidate.__CANCEL__ === true || candidate.code === 'ERR_CANCELED';
}
```

- [ ] **Step 1.3: 移除 `defaultAdapter`，新增 `loadDefaultAdapter`**

删除现有 `defaultAdapter` 常量定义（包括 `createClient`、`createCancelSource: () => CancelToken.source()`、`isCancel: isTosMeetingUploadCancellation`）。在原位置插入：

```ts
export async function loadDefaultAdapter(): Promise<TosSDKAdapter> {
  const { CancelToken, TosClient } = await import('@volcengine/tos-sdk');
  return {
    createClient(target) {
      return new TosClient({
        accessKeyId: target.credentials.access_key_id,
        accessKeySecret: target.credentials.secret_access_key,
        stsToken: target.credentials.session_token,
        endpoint: toTosSDKEndpoint(target.endpoint),
        region: target.region,
        bucket: target.bucket,
      }) as unknown as TosSDKClient;
    },
    createCancelSource: () => CancelToken.source(),
    isCancel: isTosMeetingUploadCancellation,
  };
}
```

- [ ] **Step 1.4: 重写 `createTosMeetingUploader` 签名接受 loader**

把现有签名：

```ts
export function createTosMeetingUploader(adapter: TosSDKAdapter = defaultAdapter): TosMeetingUploader {
```

替换为：

```ts
export type TosSDKAdapterSource = TosSDKAdapter | (() => Promise<TosSDKAdapter>);

export function createTosMeetingUploader(
  source: TosSDKAdapterSource = loadDefaultAdapter,
): TosMeetingUploader {
  let resolved: TosSDKAdapter | null = null;
  const pending: { promise: Promise<TosSDKAdapter> } = { promise: Promise.reject(new Error('adapter unresolved')) };

  async function resolve(): Promise<TosSDKAdapter> {
    if (resolved) return resolved;
    if (typeof source === 'function') {
      pending.promise = source();
    } else {
      pending.promise = Promise.resolve(source);
    }
    resolved = await pending.promise;
    return resolved;
  }
```

- [ ] **Step 1.5: 在 `start()` 内部 `await resolve()` 并改写 cancel/abort**

把 `start()` 实现中：

```ts
const client = adapter.createClient(input.target);
const cancelSource = adapter.createCancelSource();
```

替换为：

```ts
const adapter = await resolve();
const client = adapter.createClient(input.target);
const cancelSource = adapter.createCancelSource();
```

并把 `pause()` / `abort()` 函数体里所有引用 `adapter.isCancel(error)` / `client.abortMultipartUpload(...)` 的代码保持不变；它们继续引用外层的 `adapter` 与 `client` 闭包。

- [ ] **Step 1.6: 移除 `tosMeetingUploader` singleton**

删除文件末尾的：

```ts
export const tosMeetingUploader = createTosMeetingUploader();
```

- [ ] **Step 1.7: 运行 typecheck，确认无 TS 报错**

Run: `npm run typecheck`
Expected: exit 0；如果提示找不到 `CancelToken` / `TosClient` / `isTosCancel`，说明前面 import 残留，需要复查。

- [ ] **Step 1.8: 提交**

```bash
git add src/services/meeting/tosUploader.ts
git commit -m "refactor(meeting): lazy-load TOS SDK on first upload"
```

---

## Task 2: `services/meeting/index.ts` 移除 `tosMeetingUploader` re-export

**Files:**
- Modify: `src/services/meeting/index.ts`

- [ ] **Step 2.1: 删除 `tosMeetingUploader` re-export**

把：

```ts
export {
  createTosMeetingUploader,
  isTosMeetingUploadCancellation,
  isTosUploadCheckpoint,
  tosMeetingUploader,
  toTosSDKEndpoint,
} from './tosUploader';
```

改为：

```ts
export {
  createTosMeetingUploader,
  isTosMeetingUploadCancellation,
  isTosUploadCheckpoint,
  toTosSDKEndpoint,
} from './tosUploader';
```

- [ ] **Step 2.2: 运行 typecheck**

Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 2.3: 提交**

```bash
git add src/services/meeting/index.ts
git commit -m "refactor(meeting): drop tosMeetingUploader singleton re-export"
```

---

## Task 3: 为 lazy loader 行为新增单测

**Files:**
- Modify: `src/services/meeting/__tests__/tosUploader.test.ts`

- [ ] **Step 3.1: 在文件顶部追加新用例所需的 import**

在已有 `import type { MeetingUploadTarget } from '../../../api/contracts';` 之后插入：

```ts
import type { TosSDKAdapter } from '../tosUploader';
```

确认文件里没有 `import type { TosSDKAdapter } from '../tosUploader';` 的重复。

- [ ] **Step 3.2: 新增 loader 缓存与 reject 用例**

在 `describe('tosUploader', () => { ... })` 闭合 `});` 之前，追加：

```ts
  it('invokes a loader once and caches the adapter across start() calls', async () => {
    const { adapter, uploadFile } = adapterHarness();
    const loader = vi.fn(async () => adapter);
    const uploader = createTosMeetingUploader(loader);
    await uploader.start(baseInput).result;
    await uploader.start({ ...baseInput, file: new Blob([new Uint8Array([9])]) }).result;
    expect(loader).toHaveBeenCalledOnce();
    expect(uploadFile).toHaveBeenCalledTimes(2);
  });

  it('rejects start() when the loader rejects', async () => {
    const loader = vi.fn(async () => {
      throw new Error('chunk offline');
    });
    const uploader = createTosMeetingUploader(loader);
    const task = uploader.start(baseInput);
    await expect(task.result).rejects.toThrow('chunk offline');
  });

  it('keeps pause/abort safe when the loader never resolves', async () => {
    let resolveLoader!: (adapter: TosSDKAdapter) => void;
    const loader = vi.fn(() => new Promise<TosSDKAdapter>((resolve) => {
      resolveLoader = resolve;
    }));
    const uploader = createTosMeetingUploader(loader);
    const task = uploader.start(baseInput);
    await expect(task.pause()).resolves.toBeUndefined();
    await expect(task.abort()).resolves.toBeUndefined();
    resolveLoader(adapterHarness().adapter);
    await expect(task.result).rejects.toBeUndefined();
  });
```

- [ ] **Step 3.3: 运行新增用例**

Run: `npm test -- src/services/meeting/__tests__/tosUploader.test.ts`
Expected: 全部用例通过；如果 loader 缓存用例只调用一次失败，说明 `resolve()` 没有把同步 source 走 `Promise.resolve(source)` 分支，需要复查 Task 1.4 实现。

- [ ] **Step 3.4: 提交**

```bash
git add src/services/meeting/__tests__/tosUploader.test.ts
git commit -m "test(meeting): cover lazy TOS SDK loader behaviour"
```

---

## Task 4: 为 hook 增加 SDK 加载失败的失败路径用例

**Files:**
- Modify: `src/hooks/__tests__/useMeetingUpload.test.ts`

- [ ] **Step 4.1: 让 harness 暴露 `stopAndUpload` 行为可覆盖**

现有 `makeHarness()` 已经把 `pipeline` 暴露出来，并在 'transitions to failed when stopAndUpload throws' 用例里通过 `pipeline.stopAndUpload = vi.fn(...)` 重新赋值。新增用例复用同一模式。

- [ ] **Step 4.2: 新增 SDK 加载失败用例**

在 `describe('useMeetingUpload', () => { ... })` 闭合 `});` 之前追加：

```ts
  it('enters failed when the SDK loader rejects during stop()', async () => {
    const { pipeline, storage } = makeHarness();
    pipeline.stopAndUpload = vi.fn(async () => {
      throw new Error('chunk offline');
    }) as unknown as typeof pipeline.stopAndUpload;
    const { result } = renderHook(() =>
      useMeetingUpload({
        ownerUserId: 'user-1',
        storage: storage as unknown as OpfsMeetingRecordingStorage,
        pipeline,
        createRecordingId: () => 'rec-1',
      }),
    );
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.state).toBe('failed');
    expect(result.current.error).toBe('chunk offline');
  });
```

- [ ] **Step 4.3: 运行新增用例**

Run: `npm test -- src/hooks/__tests__/useMeetingUpload.test.ts`
Expected: 全部用例通过；新增用例断言 `error` 为 `chunk offline`。

- [ ] **Step 4.4: 提交**

```bash
git add src/hooks/__tests__/useMeetingUpload.test.ts
git commit -m "test(hooks): surface SDK loader failures as failed state"
```

---

## Task 5: 全量验证与体积核对

**Files:** 仅运行命令，无文件变更。

- [ ] **Step 5.1: 运行 typecheck**

Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 5.2: 运行全部测试**

Run: `npm test`
Expected: 23 个测试文件、所有用例通过。

- [ ] **Step 5.3: 运行 production build**

Run: `npm run build`
Expected: 构建成功；`dist/assets/` 下出现独立 `tos-sdk-*.js` chunk；`dist/assets/index-*.js` gzip < 150 KB。

- [ ] **Step 5.4: 复核 chunk 拓扑**

Run: `ls -lh dist/assets/`
Expected: 至少看到 `tos-sdk-*.js` 与体积下降后的 `index-*.js`；如果 `tos-sdk` 没有拆出独立 chunk，回退检查 `tosUploader.ts` 是否还残留对 `@volcengine/tos-sdk` 的静态引用。

- [ ] **Step 5.5: 提交（可选 — 只有当 Step 5.1-5.4 改了任何文件时才执行）**

仅在 `dist/` 之外的文件被修改时提交；如果构建过程未触碰源码，跳过此步。

---

## 自审

- 占位符：搜索 `TBD / TODO / FIXME`，应无匹配。
- 类型一致性：`loadDefaultAdapter` 返回 `Promise<TosSDKAdapter>`；`TosSDKAdapterSource = TosSDKAdapter | (() => Promise<TosSDKAdapter>)`；`createTosMeetingUploader` 接受 `TosSDKAdapterSource`；`resolve()` 内部对同步 source 走 `Promise.resolve(source)`，对函数 source 走 `source()` 并缓存。`tosUploader.test.ts` 中新用例沿用同一 `TosSDKAdapter` 类型。
- 范围：仅改 `tosUploader.ts`、`index.ts`、对应测试；不改 `useMeetingUpload.ts`、`pipeline`、`App.tsx`、`package.json`、`vite.config.ts`。
- 错误传播：`loader` reject → `uploader.start().result` reject → hook `stop()` catch → `state='failed'` + `error='chunk offline'`。测试已覆盖。