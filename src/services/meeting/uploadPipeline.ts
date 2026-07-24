import type {
  Agent1Api,
} from '../../api/agent1Api';
import type {
  MeetingUpload,
  MeetingUploadInitializeInput,
  MeetingUploadTarget,
} from '../../api/contracts';
import { createCanonicalWavHeader, hashRecordingFile, MeetingRecorder } from './wavRecorder';
import type { MeetingRecordingFile, MeetingRecordingManifest, MeetingRecordingStorage } from './opfsStorage';
import {
  createTosMeetingUploader,
  isTosUploadCheckpoint,
  type TosMeetingUploadTask,
  type TosMeetingUploader,
  type TosUploadCheckpoint,
} from './tosUploader';

export interface UploadInitInput {
  ownerUserId: string;
  recordingId: string;
  onProgress?: (fraction: number, totalBytes: number) => void;
}

export interface UploadResumeInput {
  ownerUserId: string;
  recordingId: string;
  manifest: MeetingRecordingManifest;
  onProgress?: (fraction: number, totalBytes: number) => void;
}

export interface UploadCompletedRecord {
  uploadId: string;
  meetingId: string | null;
  manifest: MeetingRecordingManifest;
}

export interface MeetingUploadPipeline {
  startRecording(ownerUserId: string, recordingId: string): Promise<MeetingRecordingManifest>;
  appendPcm(pcm: Int16Array): void;
  stopAndUpload(input: UploadInitInput): Promise<UploadCompletedRecord>;
  continueUpload(input: UploadResumeInput): Promise<UploadCompletedRecord>;
  pauseUpload(uploadId: string): Promise<void>;
  abortUpload(uploadId: string, ownerUserId: string, recordingId: string): Promise<void>;
  abortRecording(reason: string): Promise<MeetingRecordingManifest>;
  loadResumeCandidates(ownerUserId: string): Promise<MeetingRecordingManifest[]>;
  readCheckpoint(ownerUserId: string, recordingId: string): Promise<TosUploadCheckpoint | null>;
  previewWavFile(manifest: MeetingRecordingManifest): Promise<Blob>;
  closeRecordingFile(manifest: MeetingRecordingManifest): Promise<void>;
}

export interface MeetingUploadPipelineDependencies {
  api: Agent1Api;
  storage: MeetingRecordingStorage;
  uploader?: TosMeetingUploader;
  recorderFactory?: (storage: MeetingRecordingStorage) => MeetingRecorder;
  now?: () => Date;
}

export function createMeetingUploadPipeline(
  dependencies: MeetingUploadPipelineDependencies,
): MeetingUploadPipeline {
  const api = dependencies.api;
  const storage = dependencies.storage;
  const uploader = dependencies.uploader ?? createTosMeetingUploader();
  const recorder = (dependencies.recorderFactory ?? ((store) => new MeetingRecorder(store)))(storage);
  const now = dependencies.now ?? (() => new Date());
  const activeTasks = new Map<string, TosMeetingUploadTask>();

  async function startRecording(ownerUserId: string, recordingId: string): Promise<MeetingRecordingManifest> {
    return recorder.start(ownerUserId, recordingId);
  }

  function appendPcm(pcm: Int16Array): void {
    recorder.appendPcm(pcm);
  }

  async function stopRecorder(): Promise<MeetingRecordingManifest> {
    return recorder.stop();
  }

  async function abortRecorder(reason: string): Promise<MeetingRecordingManifest> {
    return recorder.abort(reason);
  }

  async function withFile<T>(
    manifest: MeetingRecordingManifest,
    fn: (file: MeetingRecordingFile) => Promise<T>,
  ): Promise<T> {
    const file = await storage.open(manifest.ownerUserId, manifest.recordingId);
    try {
      return await fn(file);
    } finally {
      await file.close().catch(() => undefined);
    }
  }

  async function buildInitializeInput(manifest: MeetingRecordingManifest, file: MeetingRecordingFile): Promise<MeetingUploadInitializeInput> {
    const declaredHash = manifest.fileSha256;
    const fileSha256 = declaredHash ?? await hashRecordingFile(file);
    return {
      channels: manifest.channels,
      content_type: 'audio/wav',
      duration_ms: manifest.durationMs,
      file_sha256: fileSha256,
      file_size: manifest.byteLength,
      format: 'wav',
      sample_rate: manifest.sampleRate,
    };
  }

  async function ensureWavHeader(manifest: MeetingRecordingManifest, file: MeetingRecordingFile): Promise<void> {
    const pcmBytes = manifest.byteLength - 44;
    if (pcmBytes < 0) throw new Error('本地会议录音小于 WAV 头长度。');
    const header = createCanonicalWavHeader(pcmBytes);
    await file.write(0, header);
  }

  async function performUpload(
    uploadId: string,
    target: MeetingUploadTarget,
    file: MeetingRecordingFile,
    checkpoint: TosUploadCheckpoint | undefined,
    onProgress?: (fraction: number) => void,
  ): Promise<void> {
    const blob = await file.blob();
    const task = uploader.start({
      target,
      file: blob,
      checkpoint,
      onProgress,
      onCheckpoint: async (next) => {
        await file.commitUploadCheckpoint(next);
      },
    });
    activeTasks.set(uploadId, task);
    try {
      await task.result;
      await file.clearUploadCheckpoint();
    } catch (error) {
      if (isTosUploadCheckpoint(checkpoint)) {
        await file.commitUploadCheckpoint(checkpoint).catch(() => undefined);
      }
      throw error;
    } finally {
      activeTasks.delete(uploadId);
    }
  }

  async function uploadAndComplete(
    manifest: MeetingRecordingManifest,
    file: MeetingRecordingFile,
    onProgress?: (fraction: number, totalBytes: number) => void,
  ): Promise<{ view: MeetingUpload }> {
    const initializeInput = await buildInitializeInput(manifest, file);
    await ensureWavHeader(manifest, file);

    let view = await api.initializeMeetingUpload(initializeInput, initializeInput.file_sha256);
    if (!view.storage) {
      throw new Error('服务端未返回 TOS 上传凭证。');
    }

    const checkpoint = await file.readUploadCheckpoint();
    const validCheckpoint = isTosUploadCheckpoint(checkpoint) ? checkpoint : undefined;

    const totalBytes = manifest.byteLength;
    await performUpload(view.upload_id, view.storage, file, validCheckpoint, (fraction) => {
      onProgress?.(fraction, totalBytes);
    });
    view = await api.completeMeetingUpload(view.upload_id);
    return { view };
  }

  async function stopAndUpload(input: UploadInitInput): Promise<UploadCompletedRecord> {
    const { ownerUserId, recordingId } = input;
    const startedAt = now().toISOString();
    let finalized: MeetingRecordingManifest;
    try {
      finalized = await stopRecorder();
    } catch (error) {
      throw wrapError('完成本地会议录音失败', error);
    }
    const file = await storage.open(ownerUserId, recordingId);
    try {
      let view: MeetingUpload;
      try {
        ({ view } = await uploadAndComplete(finalized, file, input.onProgress));
      } catch (error) {
        throw wrapError('上传会议录音失败', error);
      }
      return {
        uploadId: view.upload_id,
        meetingId: view.meeting_id ?? null,
        manifest: { ...finalized, updatedAt: startedAt },
      };
    } finally {
      await file.close().catch(() => undefined);
    }
  }

  async function continueUpload(input: UploadResumeInput): Promise<UploadCompletedRecord> {
    const { manifest } = input;
    const file = await storage.open(manifest.ownerUserId, manifest.recordingId);
    try {
      let view: MeetingUpload;
      try {
        ({ view } = await uploadAndComplete(manifest, file, input.onProgress));
      } catch (error) {
        throw wrapError('续传会议录音失败', error);
      }
      return {
        uploadId: view.upload_id,
        meetingId: view.meeting_id ?? null,
        manifest,
      };
    } finally {
      await file.close().catch(() => undefined);
    }
  }

  async function pauseUpload(uploadId: string): Promise<void> {
    const task = activeTasks.get(uploadId);
    if (!task) return;
    await task.pause();
  }

  async function abortUpload(uploadId: string, ownerUserId: string, recordingId: string): Promise<void> {
    const task = activeTasks.get(uploadId);
    if (task) {
      await task.abort();
      activeTasks.delete(uploadId);
    } else {
      try {
        await api.abortMeetingUpload(uploadId);
      } catch {
        // The server-side DELETE remains a no-op if the upload never minted.
      }
    }
    await storage.delete(ownerUserId, recordingId).catch(() => undefined);
  }

  async function abortRecording(reason: string): Promise<MeetingRecordingManifest> {
    return abortRecorder(reason);
  }

  async function loadResumeCandidates(ownerUserId: string): Promise<MeetingRecordingManifest[]> {
    const manifests = await storage.list(ownerUserId);
    return manifests.filter((manifest) => manifest.state === 'ready');
  }

  async function readCheckpoint(ownerUserId: string, recordingId: string): Promise<TosUploadCheckpoint | null> {
    return withFile({ ownerUserId, recordingId } as MeetingRecordingManifest, async (file) => {
      const value = await file.readUploadCheckpoint();
      return isTosUploadCheckpoint(value) ? value : null;
    });
  }

  async function previewWavFile(manifest: MeetingRecordingManifest): Promise<Blob> {
    return withFile(manifest, async (file) => file.blob());
  }

  async function closeRecordingFile(manifest: MeetingRecordingManifest): Promise<void> {
    await withFile(manifest, async () => undefined);
  }

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
}

function wrapError(prefix: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${prefix}：${message}`);
}
