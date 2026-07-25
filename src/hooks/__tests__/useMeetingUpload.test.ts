import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMeetingUpload } from '../useMeetingUpload';
import {
  OpfsMeetingRecordingStorage,
  type MeetingRecordingManifest,
  type MeetingUploadPipeline,
} from '../../services/meeting';
import type {
  MeetingRecordingFile,
  MeetingRecordingStorage,
} from '../../services/meeting/opfsStorage';
import type {
  TosMeetingUploadTask,
  TosMeetingUploader,
} from '../../services/meeting/tosUploader';

class StubFile implements MeetingRecordingFile {
  private store = new Map<string, Uint8Array>();

  async write(offset: number, bytes: Uint8Array): Promise<void> {
    const buf = this.store.get('audio.wav') ?? new Uint8Array(0);
    const next = new Uint8Array(Math.max(buf.length, offset + bytes.length));
    next.set(buf);
    next.set(bytes, offset);
    this.store.set('audio.wav', next);
  }

  async truncate(size: number): Promise<void> {
    const buf = this.store.get('audio.wav') ?? new Uint8Array(0);
    this.store.set('audio.wav', buf.slice(0, size));
  }

  async size(): Promise<number> {
    return this.store.get('audio.wav')?.length ?? 0;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    const buf = this.store.get('audio.wav') ?? new Uint8Array(0);
    return buf.slice(offset, offset + length);
  }

  async blob(): Promise<Blob> {
    const buf = this.store.get('audio.wav');
    if (!buf) return new Blob([], { type: 'audio/wav' });
    const copy = new Uint8Array(buf.byteLength);
    copy.set(buf);
    const arrayBuffer = copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) as ArrayBuffer;
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  async commitManifest(manifest: MeetingRecordingManifest): Promise<void> {
    this.store.set('manifest.json', new TextEncoder().encode(JSON.stringify(manifest)));
  }

  async recoverManifest(): Promise<MeetingRecordingManifest | null> {
    const buf = this.store.get('manifest.json');
    return buf ? JSON.parse(new TextDecoder().decode(buf)) as MeetingRecordingManifest : null;
  }

  async commitUploadCheckpoint(checkpoint: unknown): Promise<void> {
    this.store.set('tos-upload-checkpoint.json', new TextEncoder().encode(JSON.stringify(checkpoint)));
  }

  async readUploadCheckpoint(): Promise<unknown | null> {
    const buf = this.store.get('tos-upload-checkpoint.json');
    return buf ? JSON.parse(new TextDecoder().decode(buf)) : null;
  }

  async clearUploadCheckpoint(): Promise<void> {
    this.store.delete('tos-upload-checkpoint.json');
  }

  async close(): Promise<void> {
    // no-op
  }
}

class StubStorage implements MeetingRecordingStorage {
  readonly files = new Map<string, StubFile>();

  async open(ownerUserId: string, recordingId: string): Promise<MeetingRecordingFile> {
    const key = `${ownerUserId}/${recordingId}`;
    let file = this.files.get(key);
    if (!file) {
      file = new StubFile();
      this.files.set(key, file);
    }
    return file;
  }

  async list(ownerUserId: string): Promise<MeetingRecordingManifest[]> {
    const out: MeetingRecordingManifest[] = [];
    for (const file of this.files.values()) {
      const manifest = await file.recoverManifest();
      if (manifest && manifest.ownerUserId === ownerUserId) out.push(manifest);
    }
    return out;
  }

  async delete(ownerUserId: string, recordingId: string): Promise<void> {
    this.files.delete(`${ownerUserId}/${recordingId}`);
  }
}

function makeStoppedTask(): TosMeetingUploadTask {
  return {
    result: Promise.resolve(),
    pause: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
  };
}

function makeHarness() {
  const storage = new StubStorage();
  const uploader: TosMeetingUploader = {
    start: vi.fn(() => {
      const task = makeStoppedTask();
      return task;
    }),
  };

  let nextRecordingId = 0;
  const pipelineFactory = (): MeetingUploadPipeline => {
    const startRecording = vi.fn(async (owner: string, recording: string) => {
      const file = await storage.open(owner, recording);
      const now = '2026-07-24T00:00:00.000Z';
      const manifest: MeetingRecordingManifest = {
        version: 1,
        ownerUserId: owner,
        recordingId: recording,
        state: 'recording',
        byteLength: 44,
        durationMs: 0,
        createdAt: now,
        updatedAt: now,
        sampleRate: 16000,
        channels: 1,
        format: 'wav-pcm-s16le',
      };
      await file.commitManifest(manifest);
      return manifest;
    });
    const appendPcm = vi.fn();
    const stopAndUpload = vi.fn(async ({ ownerUserId, recordingId, onProgress }: {
      ownerUserId: string;
      recordingId: string;
      onProgress?: (fraction: number, totalBytes: number) => void;
    }) => {
      onProgress?.(0.5, 100);
      onProgress?.(1, 100);
      const file = await storage.open(ownerUserId, recordingId);
      const manifest: MeetingRecordingManifest = {
        version: 1,
        ownerUserId,
        recordingId,
        state: 'ready',
        byteLength: 100,
        durationMs: 50,
        createdAt: '2026-07-24T00:00:00.000Z',
        updatedAt: '2026-07-24T00:00:00.000Z',
        sampleRate: 16000,
        channels: 1,
        format: 'wav-pcm-s16le',
        fileSha256: 'f'.repeat(64),
      };
      await file.commitManifest(manifest);
      return {
        uploadId: 'upload-1',
        meetingId: 'meeting-1',
        manifest,
      };
    });
    const continueUpload = vi.fn(async ({ manifest }: { manifest: MeetingRecordingManifest }) => ({
      uploadId: 'upload-2',
      meetingId: 'meeting-2',
      manifest,
    }));
    const pauseUpload = vi.fn(async () => undefined);
    const abortUpload = vi.fn(async (_uploadId: string, owner: string, recording: string) => {
      await storage.delete(owner, recording).catch(() => undefined);
    });
    const abortRecording: MeetingUploadPipeline['abortRecording'] = async (reason: string) => {
      const now = '2026-07-24T00:00:00.000Z';
      return {
        version: 1,
        ownerUserId: 'user-1',
        recordingId: 'rec-active',
        state: 'aborted',
        byteLength: 0,
        durationMs: 0,
        createdAt: now,
        updatedAt: now,
        sampleRate: 16000,
        channels: 1,
        format: 'wav-pcm-s16le',
        error: reason,
      };
    };
    const loadResumeCandidates = vi.fn(async (owner: string) => storage.list(owner));
    const readCheckpoint = vi.fn(async () => null);
    const previewWavFile = vi.fn(async (manifest: MeetingRecordingManifest) => new Blob([new Uint8Array(manifest.byteLength)], { type: 'audio/wav' }));
    const closeRecordingFile = vi.fn(async () => undefined);

    return {
      startRecording,
      appendPcm,
      stopAndUpload,
      continueUpload,
      pauseUpload,
      abortUpload,
      abortRecording,
      loadResumeCandidates,
      readCheckpoint,
      previewWavFile,
      closeRecordingFile,
    };
  };

  const pipeline = pipelineFactory();
  return {
    pipeline,
    storage,
    uploader,
    nextRecordingId: () => `rec-${++nextRecordingId}`,
  };
}

describe('useMeetingUpload', () => {
  it('starts in idle state with no recording id', () => {
    const { pipeline, storage, uploader: _u } = makeHarness();
    const { result } = renderHook(() =>
      useMeetingUpload({
        ownerUserId: 'user-1',
        storage: storage as unknown as OpfsMeetingRecordingStorage,
        pipeline,
        createRecordingId: () => 'rec-1',
      }),
    );
    expect(result.current.state).toBe('idle');
    expect(result.current.recordingId).toBeNull();
    expect(result.current.canStart).toBe(true);
    expect(result.current.canStop).toBe(false);
  });

  it('rejects start when ownerUserId is missing', async () => {
    const { pipeline, storage, uploader: _u } = makeHarness();
    const { result } = renderHook(() =>
      useMeetingUpload({
        ownerUserId: null,
        storage: storage as unknown as OpfsMeetingRecordingStorage,
        pipeline,
        createRecordingId: () => 'rec-1',
      }),
    );
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('failed');
    expect(result.current.error).toMatch(/请先登录/);
  });

  it('transitions idle → recording → finished and exposes meetingId', async () => {
    const { pipeline, storage, uploader: _u } = makeHarness();
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
    expect(result.current.state).toBe('recording');
    expect(result.current.recordingId).toBe('rec-1');
    expect(result.current.ownerUserId).toBe('user-1');

    await act(async () => {
      result.current.appendPcm(new Int16Array([1, 2, 3, 4]));
    });

    await act(async () => {
      await result.current.stop();
    });
    expect(pipeline.stopAndUpload).toHaveBeenCalledOnce();
    expect(result.current.state).toBe('finished');
    expect(result.current.meetingId).toBe('meeting-1');
    expect(result.current.progress.totalBytes).toBe(100);
    expect(result.current.progress.currentBytes).toBe(100);
  });

  it('returns to idle after the ready notice window elapses', async () => {
    let pendingReadyNotice: (() => void) | null = null;
    const realSetTimeout = globalThis.setTimeout;
    const capturedDelays: number[] = [];
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, delay = 0) => {
      capturedDelays.push(delay);
      if (delay === 3000 && typeof handler === 'function') {
        // Capture the 3000ms ready-notice callback so we can fire it manually
        // after asserting the 'finished' state.
        pendingReadyNotice = handler as () => void;
      }
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);
    try {
      const { pipeline, storage, uploader: _u } = makeHarness();
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
      expect(result.current.state).toBe('finished');
      expect(capturedDelays.some((delay) => delay === 3000)).toBe(true);
      expect(pendingReadyNotice).not.toBeNull();
      await act(async () => {
        pendingReadyNotice?.();
      });
      expect(result.current.state).toBe('idle');
      expect(result.current.recordingId).toBeNull();
    } finally {
      setTimeoutSpy.mockRestore();
      globalThis.setTimeout = realSetTimeout;
    }
  });

  it('transitions to failed when stopAndUpload throws', async () => {
    const { pipeline, storage } = makeHarness();
    pipeline.stopAndUpload = vi.fn(async () => {
      throw new Error('upload exploded');
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
    expect(result.current.error).toBe('upload exploded');
    expect(result.current.canContinue).toBe(true);
  });

  it('pause() is a no-op when no active upload id is set', async () => {
    const { pipeline, storage } = makeHarness();
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
      await result.current.pause();
    });
    // No active upload id → silent success, state stays recording.
    expect(result.current.state).toBe('recording');
    expect(pipeline.pauseUpload).not.toHaveBeenCalled();
  });

  it('continueUpload resumes from a failed state and surfaces new meetingId', async () => {
    const { pipeline, storage } = makeHarness();
    pipeline.stopAndUpload = vi.fn(async () => {
      throw new Error('flaky');
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
    await act(async () => {
      await result.current.continueUpload();
    });
    expect(pipeline.continueUpload).toHaveBeenCalledOnce();
    expect(result.current.state).toBe('finished');
    expect(result.current.meetingId).toBe('meeting-2');
  });

  it('terminate() clears local state and removes the OPFS file', async () => {
    const { pipeline, storage } = makeHarness();
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
    await act(async () => {
      await result.current.terminate();
    });
    expect(result.current.state).toBe('aborted');
    expect(result.current.meetingId).toBeNull();
    expect(storage.files.size).toBe(0);
  });

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

  it('reset() returns the controller to idle from an aborted state', async () => {
    const { pipeline, storage } = makeHarness();
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
      await result.current.terminate();
    });
    expect(result.current.state).toBe('aborted');
    await act(async () => {
      result.current.reset();
    });
    expect(result.current.state).toBe('idle');
  });
});
