import { describe, expect, it, vi } from 'vitest';
import { createMeetingUploadPipeline } from '../uploadPipeline';
import { MeetingRecorder, hashRecordingFile } from '../wavRecorder';
import type {
  MeetingRecordingFile,
  MeetingRecordingManifest,
  MeetingRecordingStorage,
} from '../opfsStorage';
import type { Agent1Api } from '../../../api/agent1Api';
import type { MeetingUpload, MeetingUploadInitializeInput, MeetingUploadTarget } from '../../../api/contracts';
import type { TosMeetingUploadTask, TosMeetingUploader, TosUploadCheckpoint } from '../tosUploader';

class InMemoryFile implements MeetingRecordingFile {
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

class InMemoryStorage implements MeetingRecordingStorage {
  readonly files = new Map<string, InMemoryFile>();

  async open(ownerUserId: string, recordingId: string): Promise<MeetingRecordingFile> {
    const key = `${ownerUserId}/${recordingId}`;
    let file = this.files.get(key);
    if (!file) {
      file = new InMemoryFile();
      this.files.set(key, file);
    }
    return file;
  }

  async list(ownerUserId: string): Promise<MeetingRecordingManifest[]> {
    const manifests: MeetingRecordingManifest[] = [];
    for (const file of this.files.values()) {
      const manifest = await file.recoverManifest();
      if (manifest && manifest.ownerUserId === ownerUserId) manifests.push(manifest);
    }
    return manifests;
  }

  async delete(ownerUserId: string, recordingId: string): Promise<void> {
    this.files.delete(`${ownerUserId}/${recordingId}`);
  }
}

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

function makeView(uploadId: string, withMeeting = false): MeetingUpload {
  return {
    upload_id: uploadId,
    status: 'uploading',
    mode: 'direct',
    total_bytes: 0,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    storage: makeTarget(),
    meeting_id: withMeeting ? 'meeting-id-1' : undefined,
  };
}

const NOW = new Date('2026-07-24T00:00:00.000Z');

function makeHarness(options: {
  initialize?: (input: MeetingUploadInitializeInput, idempotencyKey: string) => Promise<MeetingUpload>;
  complete?: (uploadId: string) => Promise<MeetingUpload>;
  abort?: (uploadId: string) => Promise<void>;
  recorder?: MeetingRecorder;
  uploader?: TosMeetingUploader;
} = {}) {
  const storage = new InMemoryStorage();
  const initialize = vi.fn(options.initialize ?? (async () => makeView('upload-1')));
  const complete = vi.fn(options.complete ?? (async () => makeView('upload-1', true)));
  const abort = vi.fn(options.abort ?? (async () => undefined));
  const api = {
    initializeMeetingUpload: initialize,
    completeMeetingUpload: complete,
    abortMeetingUpload: abort,
    refreshMeetingUploadCredentials: vi.fn(async () => makeTarget()),
  } as unknown as Agent1Api;

  const start = vi.fn((input: Parameters<TosMeetingUploader['start']>[0]) => {
    input.onProgress?.(0.5);
    return task;
  });
  const task: TosMeetingUploadTask = {
    result: Promise.resolve(),
    pause: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
  };
  start.mockImplementation((input: Parameters<TosMeetingUploader['start']>[0]) => {
    input.onProgress?.(0.5);
    return task;
  });
  const uploader: TosMeetingUploader = options.uploader ?? { start };

  const recorder = options.recorder ?? new MeetingRecorder(storage, { now: () => NOW });
  const pipeline = createMeetingUploadPipeline({
    api,
    storage,
    recorderFactory: () => recorder,
    uploader,
    now: () => NOW,
  });

  return { pipeline, storage, recorder, api, uploader, initialize, complete, abort, start, task };
}

async function fillRecorder(recorder: MeetingRecorder, count = 4): Promise<void> {
  const draft = await recorder.start('user-1', 'rec-1');
  expect(draft.state).toBe('recording');
  const samples = new Int16Array(count);
  for (let i = 0; i < count; i += 1) samples[i] = i + 1;
  recorder.appendPcm(samples);
}

describe('uploadPipeline.stopAndUpload', () => {
  it('runs initialize, uploads via TOS, and completes the upload', async () => {
    const harness = makeHarness();
    await fillRecorder(harness.recorder, 4);

    const result = await harness.pipeline.stopAndUpload({
      ownerUserId: 'user-1',
      recordingId: 'rec-1',
    });

    expect(harness.initialize).toHaveBeenCalledOnce();
    const initArgs = harness.initialize.mock.calls[0]!;
    expect(initArgs[0].file_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(initArgs[1]).toBe(initArgs[0].file_sha256); // Idempotency-Key matches hash
    expect(harness.uploader.start).toHaveBeenCalledOnce();
    expect(harness.complete).toHaveBeenCalledWith('upload-1');
    expect(result.uploadId).toBe('upload-1');
    expect(result.meetingId).toBe('meeting-id-1');
    expect(result.manifest.ownerUserId).toBe('user-1');
    expect(result.manifest.recordingId).toBe('rec-1');
    expect(result.manifest.state).toBe('ready');
  });

  it('reports bytes via onProgress using file size', async () => {
    let capturedFraction: number | undefined;
    let capturedTotal: number | undefined;
    const onProgress = vi.fn((fraction: number, totalBytes: number) => {
      capturedFraction = fraction;
      capturedTotal = totalBytes;
    });
    const harness = makeHarness();
    await fillRecorder(harness.recorder, 4);
    await harness.pipeline.stopAndUpload({
      ownerUserId: 'user-1',
      recordingId: 'rec-1',
      onProgress,
    });
    expect(onProgress).toHaveBeenCalled();
    expect(capturedTotal).toBe(44 + 4 * 2);
    expect(capturedFraction).toBeLessThanOrEqual(1);
  });

  it('throws wrapped error when initialize fails', async () => {
    const harness = makeHarness({
      initialize: vi.fn(async () => {
        throw new Error('idempotency conflict');
      }),
    });
    await fillRecorder(harness.recorder, 4);
    await expect(
      harness.pipeline.stopAndUpload({ ownerUserId: 'user-1', recordingId: 'rec-1' }),
    ).rejects.toThrow(/上传会议录音失败.*idempotency conflict/);
  });

  it('rejects when server does not return storage credentials', async () => {
    const harness = makeHarness({
      initialize: vi.fn(async () => {
        const view = makeView('upload-1');
        return { ...view, storage: undefined };
      }),
    });
    await fillRecorder(harness.recorder, 4);
    await expect(
      harness.pipeline.stopAndUpload({ ownerUserId: 'user-1', recordingId: 'rec-1' }),
    ).rejects.toThrow(/TOS.*凭证/);
  });
});

describe('uploadPipeline.continueUpload', () => {
  it('uses an existing ready manifest and replays upload from a saved checkpoint', async () => {
    const harness = makeHarness();
    await fillRecorder(harness.recorder, 4);
    const ready = await harness.recorder.stop();

    // Persist a checkpoint before resume
    const file = await harness.storage.open('user-1', 'rec-1');
    const checkpoint: TosUploadCheckpoint = {
      bucket: 'meeting-bucket',
      key: 'meeting/uploads/recording.wav',
      part_size: 20 * 1024 * 1024,
      upload_id: 'upload-existing',
    };
    await file.commitUploadCheckpoint(checkpoint);
    await file.close();

    const result = await harness.pipeline.continueUpload({
      ownerUserId: 'user-1',
      recordingId: 'rec-1',
      manifest: ready,
    });

    expect(harness.uploader.start).toHaveBeenCalledOnce();
    const startMock = vi.mocked(harness.uploader.start);
    const startArgs = startMock.mock.calls[0]![0];
    expect(startArgs.checkpoint).toEqual(checkpoint);
    expect(result.uploadId).toBe('upload-1');
  });

  it('throws if storage credentials are missing on continue', async () => {
    const harness = makeHarness({
      initialize: vi.fn(async () => {
        const view = makeView('upload-2');
        return { ...view, storage: undefined };
      }),
    });
    await fillRecorder(harness.recorder, 4);
    const ready = await harness.recorder.stop();
    await expect(
      harness.pipeline.continueUpload({
        ownerUserId: 'user-1',
        recordingId: 'rec-1',
        manifest: ready,
      }),
    ).rejects.toThrow(/续传会议录音失败/);
  });
});

describe('uploadPipeline.pauseUpload', () => {
  it('no-ops when no active upload matches the id', async () => {
    const harness = makeHarness();
    await expect(harness.pipeline.pauseUpload('missing')).resolves.toBeUndefined();
  });

  it('calls pause on the active upload task', async () => {
    const pause = vi.fn(async () => undefined);
    const harness = makeHarness({
      uploader: {
        start: () => ({
          result: new Promise(() => undefined),
          pause,
          abort: vi.fn(async () => undefined),
        }),
      },
    });
    await fillRecorder(harness.recorder, 4);
    const task = harness.pipeline.stopAndUpload({
      ownerUserId: 'user-1',
      recordingId: 'rec-1',
    });
    // give the microtask queue a chance to register the active task
    await new Promise((r) => setTimeout(r, 0));
    await harness.pipeline.pauseUpload('upload-1');
    expect(pause).toHaveBeenCalled();
    // resolve so the pipeline doesn't hang
    task.catch(() => undefined);
  });
});

describe('uploadPipeline.abortUpload', () => {
  it('cancels server-side delete when no active upload is registered', async () => {
    const harness = makeHarness();
    await harness.pipeline.abortUpload('upload-99', 'user-1', 'rec-1');
    expect(harness.api.abortMeetingUpload).toHaveBeenCalledWith('upload-99');
  });

  it('aborts the active task locally and removes the OPFS file', async () => {
    const abort = vi.fn(async () => undefined);
    const harness = makeHarness({
      uploader: {
        start: () => ({
          result: new Promise(() => undefined),
          pause: vi.fn(async () => undefined),
          abort,
        }),
      },
    });
    await fillRecorder(harness.recorder, 4);
    const task = harness.pipeline.stopAndUpload({
      ownerUserId: 'user-1',
      recordingId: 'rec-1',
    });
    await new Promise((r) => setTimeout(r, 0));
    await harness.pipeline.abortUpload('upload-1', 'user-1', 'rec-1');
    expect(abort).toHaveBeenCalled();
    const list = await harness.storage.list('user-1');
    expect(list).toHaveLength(0);
    task.catch(() => undefined);
  });
});

describe('uploadPipeline.abortRecording', () => {
  it('writes an aborted manifest with reason', async () => {
    const harness = makeHarness();
    await fillRecorder(harness.recorder, 4);
    const aborted = await harness.pipeline.abortRecording('user cancelled');
    expect(aborted.state).toBe('aborted');
    expect(aborted.error).toBe('user cancelled');
  });
});

describe('uploadPipeline resume candidates', () => {
  it('returns only ready manifests', async () => {
    const harness = makeHarness();
    await fillRecorder(harness.recorder, 4);
    await harness.recorder.stop();
    await harness.pipeline.startRecording('user-1', 'rec-2');
    const candidates = await harness.pipeline.loadResumeCandidates('user-1');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.recordingId).toBe('rec-1');
  });

  it('reads a saved checkpoint when present', async () => {
    const harness = makeHarness();
    await fillRecorder(harness.recorder, 4);
    await harness.recorder.stop();
    const file = await harness.storage.open('user-1', 'rec-1');
    const checkpoint: TosUploadCheckpoint = {
      bucket: 'meeting-bucket',
      key: 'meeting/uploads/recording.wav',
      part_size: 20 * 1024 * 1024,
      upload_id: 'upload-existing',
    };
    await file.commitUploadCheckpoint(checkpoint);
    await file.close();
    const read = await harness.pipeline.readCheckpoint('user-1', 'rec-1');
    expect(read).toEqual(checkpoint);
  });

  it('returns null when no checkpoint exists', async () => {
    const harness = makeHarness();
    await fillRecorder(harness.recorder, 4);
    await harness.recorder.stop();
    expect(await harness.pipeline.readCheckpoint('user-1', 'rec-1')).toBeNull();
  });
});

describe('uploadPipeline preview', () => {
  it('returns a blob with the recorded WAV bytes', async () => {
    const harness = makeHarness();
    await fillRecorder(harness.recorder, 4);
    const ready = await harness.recorder.stop();
    const blob = await harness.pipeline.previewWavFile(ready);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(ready.byteLength);
  });
});
