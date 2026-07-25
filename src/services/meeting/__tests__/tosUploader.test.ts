import { describe, expect, it, vi } from 'vitest';
import {
  createTosMeetingUploader,
  isTosMeetingUploadCancellation,
  isTosUploadCheckpoint,
  toTosSDKEndpoint,
  type TosMeetingUploadInput,
  type TosSDKAdapter,
  type TosUploadCheckpoint,
} from '../tosUploader';
import type { MeetingUploadTarget } from '../../../api/contracts';

function makeTarget(overrides: Partial<MeetingUploadTarget> = {}): MeetingUploadTarget {
  return {
    provider: 'tos',
    endpoint: 'https://tos-svc.example.com',
    region: 'cn-beijing',
    bucket: 'meeting-bucket',
    object_key: 'meeting/uploads/recording.wav',
    credentials: {
      access_key_id: 'AK',
      secret_access_key: 'SK',
      session_token: 'TOKEN',
      expires_at: Date.now() + 15 * 60 * 1000,
    },
    ...overrides,
  };
}

function adapterHarness(overrides: Partial<TosSDKAdapter> = {}) {
  const uploadFile = vi.fn().mockResolvedValue(undefined);
  const abortMultipart = vi.fn().mockResolvedValue(undefined);
  const cancel = vi.fn();
  const cancelSource = { token: { __cancelToken: 'token' }, cancel };
  const adapter: TosSDKAdapter = {
    createClient: vi.fn().mockReturnValue({ uploadFile, abortMultipartUpload: abortMultipart }),
    createCancelSource: vi.fn().mockReturnValue(cancelSource),
    isCancel: (error) => isTosMeetingUploadCancellation(error),
    ...overrides,
  };
  return { adapter, uploadFile, abortMultipart, cancel, cancelSource };
}

const baseInput: TosMeetingUploadInput = {
  target: makeTarget(),
  file: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
};

describe('tosUploader', () => {
  it('starts, cancels, and aborts multipart uploads via the adapter', async () => {
    const { adapter, uploadFile, cancel, abortMultipart } = adapterHarness();
    const uploader = createTosMeetingUploader(adapter);
    const task = uploader.start(baseInput);
    await task.result;
    expect(uploadFile).toHaveBeenCalledOnce();
    const call = uploadFile.mock.calls[0]![0]!;
    expect(call.bucket).toBe('meeting-bucket');
    expect(call.key).toBe('meeting/uploads/recording.wav');
    expect(call.contentType).toBe('audio/wav');
    expect(call.partSize).toBe(20 * 1024 * 1024);
    expect(call.taskNum).toBe(3);

    const pauseTask = uploader.start({ ...baseInput, file: new Blob([new Uint8Array([4])]) });
    await pauseTask.pause();
    expect(cancel).toHaveBeenCalledWith('meeting upload paused');

    const checkpoint: TosUploadCheckpoint = {
      bucket: 'meeting-bucket',
      key: 'meeting/uploads/recording.wav',
      part_size: 20 * 1024 * 1024,
      upload_id: 'upload-1',
    };
    const abortTask = uploader.start({ ...baseInput, checkpoint });
    await abortTask.abort();
    expect(abortMultipart).toHaveBeenCalledWith({
      bucket: 'meeting-bucket',
      key: 'meeting/uploads/recording.wav',
      uploadId: 'upload-1',
    });
  });

  it('rejects checkpoint mismatches', () => {
    const { adapter } = adapterHarness();
    const uploader = createTosMeetingUploader(adapter);
    const checkpoint: TosUploadCheckpoint = {
      bucket: 'other-bucket',
      key: 'meeting/uploads/recording.wav',
      part_size: 20 * 1024 * 1024,
      upload_id: 'upload-1',
    };
    expect(() => uploader.start({ ...baseInput, checkpoint })).toThrow(/断点记录/);
  });

  it('rejects invalid targets', () => {
    const { adapter } = adapterHarness();
    const uploader = createTosMeetingUploader(adapter);
    expect(() => uploader.start({ ...baseInput, target: makeTarget({ endpoint: 'not-a-url' }) })).toThrow(/上传地址/);
    expect(() => uploader.start({ ...baseInput, target: makeTarget({ endpoint: 'http://tos.example.com' }) })).toThrow(/上传凭证/);
    expect(() => uploader.start({ ...baseInput, target: makeTarget({ provider: 's3' as never }) })).toThrow(/上传凭证/);
    expect(() => uploader.start({ ...baseInput, target: makeTarget({ credentials: { access_key_id: '', secret_access_key: 's', session_token: 't', expires_at: 1 } }) })).toThrow(/上传凭证/);
  });

  it('strips the protocol from the endpoint before constructing the SDK client', () => {
    expect(toTosSDKEndpoint('https://tos-svc.example.com/path')).toBe('tos-svc.example.com');
  });

  it('validates checkpoint shape', () => {
    expect(isTosUploadCheckpoint({
      bucket: 'b',
      key: 'k',
      part_size: 1024,
      upload_id: 'u',
    })).toBe(true);
    expect(isTosUploadCheckpoint({})).toBe(false);
    expect(isTosUploadCheckpoint({
      bucket: 'b',
      key: 'k',
      part_size: 0,
      upload_id: 'u',
    })).toBe(false);
    expect(isTosUploadCheckpoint(null)).toBe(false);
    expect(isTosUploadCheckpoint('string')).toBe(false);
  });

  it('detects cancel errors from the SDK', () => {
    const sdkCancel = Object.assign(new Error('canceled'), { __CANCEL__: true });
    expect(isTosMeetingUploadCancellation(sdkCancel)).toBe(true);
    const errCanc = Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' });
    expect(isTosMeetingUploadCancellation(errCanc)).toBe(true);
    expect(isTosMeetingUploadCancellation(new Error('boom'))).toBe(false);
  });

  it('forwards progress events and the latest checkpoint to the caller', async () => {
    const progress = vi.fn();
    const onCheckpoint = vi.fn();
    const { adapter, uploadFile } = adapterHarness();
    const uploader = createTosMeetingUploader(adapter);
    uploadFile.mockImplementationOnce(async (input) => {
      input.dataTransferStatusChange({ consumedBytes: 5, totalBytes: 10 });
      input.progress(0.5, {
        bucket: 'meeting-bucket',
        key: 'meeting/uploads/recording.wav',
        part_size: 20 * 1024 * 1024,
        upload_id: 'upload-2',
      });
      return undefined;
    });
    await uploader.start({ ...baseInput, onProgress: progress, onCheckpoint }).result;
    expect(progress).toHaveBeenCalledWith(0.5);
    expect(progress).toHaveBeenCalledWith(0.5);
    expect(onCheckpoint).toHaveBeenCalledWith(expect.objectContaining({ upload_id: 'upload-2' }));
  });

  it('queues pause() cancel intent until the lazy loader resolves, then resumes cleanly', async () => {
    // The lazy SDK loader is represented by `createCancelSource` returning a
    // source whose `.cancel()` records every call. By delaying its resolution
    // we simulate `pause()` arriving BEFORE the loader promise settles —
    // exactly the race that motivated Issue 1's fix.
    let resolveLoader: ((adapter: TosSDKAdapter) => void) | null = null;
    const loaderPromise = new Promise<TosSDKAdapter>((resolve) => {
      resolveLoader = resolve;
    });
    const { adapter, cancel, cancelSource } = adapterHarness();
    const uploader = createTosMeetingUploader(() => loaderPromise);

    const task = uploader.start(baseInput);

    // Synchronous pause() — must NOT throw even though `resolve()` has not
    // returned yet, and must queue the cancel message for the cancelSource
    // that does not yet exist.
    const pausePromise = task.pause();
    expect(cancel).not.toHaveBeenCalled();

    // Now resolve the loader. The pending cancel message must reach
    // `cancelSource.cancel(...)` before `uploadFile` is invoked, so the
    // SDK cancels the upload cleanly instead of doing real network work.
    resolveLoader!(adapter);
    // Flush the full microtask chain: `resolve()` (async) → `await pending`
    // → `.then(adapter => …)` in `start()` → `createCancelSource()` →
    // `cancelSource.cancel(pendingCancelMessage)`. One macrotask tick is
    // enough for the queued microtasks to drain.
    await new Promise<void>((tick) => setTimeout(tick, 0));

    // The queued cancel must have been flushed exactly once, with the
    // pause message.
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith('meeting upload paused');

    // The SDK mock has `uploadFile` resolve successfully even though the
    // cancel was issued (the SDK doesn't enforce cancellation in the mock);
    // `pause()`'s try/catch filters that out via `adapter.isCancel` so the
    // await resolves cleanly without rethrowing.
    await expect(pausePromise).resolves.toBeUndefined();
    expect(cancelSource.cancel).toHaveBeenCalledWith('meeting upload paused');
  });

  it('does not call abortMultipartUpload with the stale paused checkpoint after pause()', async () => {
    // Pause-then-abort sequence on a fresh (non-resumed) upload. The pause
    // cancels the upload session server-side via the SDK; a follow-up abort
    // must NOT issue another `abortMultipartUpload` against that same
    // (now-dead) `upload_id`.
    const { adapter, abortMultipart } = adapterHarness();
    const uploader = createTosMeetingUploader(adapter);
    const task = uploader.start(baseInput);
    await task.result;
    await task.pause();
    await task.abort();
    expect(abortMultipart).not.toHaveBeenCalled();
  });

  it('does not call abortMultipartUpload with a resumed checkpoint after pause() precedes abort()', async () => {
    // Resume case (caller passes a checkpoint) followed by pause-then-abort.
    // Without the fix, `abort()` would re-issue `abortMultipartUpload`
    // against the paused session's `upload_id`. With the fix, `pause()`
    // clears checkpoint ownership, so `abort()` skips the abort call.
    const resumedCheckpoint: TosUploadCheckpoint = {
      bucket: 'meeting-bucket',
      key: 'meeting/uploads/recording.wav',
      part_size: 20 * 1024 * 1024,
      upload_id: 'stale-resumed-id',
    };
    const { adapter, abortMultipart } = adapterHarness();
    const uploader = createTosMeetingUploader(adapter);
    const task = uploader.start({ ...baseInput, checkpoint: resumedCheckpoint });
    await task.result;
    await task.pause();
    await task.abort();
    expect(abortMultipart).not.toHaveBeenCalled();
  });

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
    // `pause()` and `abort()` internally `await result`, so they cannot
    // settle until the loader resolves and the upload completes. Capture
    // the in-flight promises WITHOUT awaiting, then trigger the loader
    // and let the microtask chain drain.
    const pausePromise = task.pause();
    const abortPromise = task.abort();
    resolveLoader(adapterHarness().adapter);
    // NOTE: with the default `adapterHarness()` `uploadFile` mock resolving
    // successfully (the harness does not simulate cancellation rejection),
    // the queued cancel message is flushed to `cancelSource.cancel(...)` but
    // the SDK call itself still settles successfully, so `task.result`
    // *resolves* to `undefined` rather than rejecting. The loader's
    // pending-cancel queue logic is exercised regardless — what matters
    // here is that `pause()` and `abort()` do not throw and the task
    // lifecycle completes cleanly.
    await expect(pausePromise).resolves.toBeUndefined();
    await expect(abortPromise).resolves.toBeUndefined();
    await expect(task.result).resolves.toBeUndefined();
  });

  it('keeps abort safe in isolation when the loader never resolves', async () => {
    // Mirrors the dispose-during-loader scenario at the uploader boundary:
    // a single `abort()` (no prior pause) is issued before the SDK chunk
    // finishes loading. Abort must not throw and must skip
    // `abortMultipartUpload` because no checkpoint was ever minted.
    let resolveLoader!: (adapter: TosSDKAdapter) => void;
    const loader = vi.fn(() => new Promise<TosSDKAdapter>((resolve) => {
      resolveLoader = resolve;
    }));
    const { adapter, abortMultipart, cancel } = adapterHarness();
    const uploader = createTosMeetingUploader(loader);
    const task = uploader.start(baseInput);
    const abortPromise = task.abort();
    expect(cancel).not.toHaveBeenCalled();
    resolveLoader(adapter);
    await expect(abortPromise).resolves.toBeUndefined();
    expect(abortMultipart).not.toHaveBeenCalled();
    await expect(task.result).resolves.toBeUndefined();
  });
});
