import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createMeetingUploadPipeline,
  OpfsMeetingRecordingStorage,
  type MeetingRecordingManifest,
  type MeetingUploadPipeline,
} from '../services/meeting';
import { agent1Api } from '../api/agent1Api';

export type MeetingUploadUIState =
  | 'idle'
  | 'recording'
  | 'finalizing'
  | 'uploading'
  | 'finished'
  | 'failed'
  | 'aborted';

export interface MeetingUploadProgress {
  currentBytes: number;
  totalBytes: number;
}

export interface MeetingUploadController {
  state: MeetingUploadUIState;
  recording: boolean;
  manifest: MeetingRecordingManifest | null;
  meetingId: string | null;
  recordingId: string | null;
  ownerUserId: string | null;
  progress: MeetingUploadProgress;
  error: string;
  canStart: boolean;
  canStop: boolean;
  canContinue: boolean;
  canTerminate: boolean;
  start(): Promise<void>;
  appendPcm(pcm: Int16Array): void;
  stop(): Promise<void>;
  pause(): Promise<void>;
  continueUpload(): Promise<void>;
  terminate(): Promise<void>;
  reset(): void;
  dispose(): Promise<void>;
}

export interface MeetingUploadHookOptions {
  ownerUserId: string | null;
  storage?: OpfsMeetingRecordingStorage;
  pipeline?: MeetingUploadPipeline;
  createRecordingId?: () => string;
}

const READY_NOTICE_DURATION_MS = 3000;

export function useMeetingUpload(options: MeetingUploadHookOptions): MeetingUploadController {
  const storage = options.storage ?? new OpfsMeetingRecordingStorage();
  const pipeline = useMemo(
    () => options.pipeline ?? createMeetingUploadPipeline({ api: agent1Api, storage }),
    [options.pipeline, storage],
  );
  const createRecordingId = useMemo(
    () => options.createRecordingId ?? defaultCreateRecordingId,
    [options.createRecordingId],
  );

  const [state, setState] = useState<MeetingUploadUIState>('idle');
  const [error, setError] = useState('');
  const [manifest, setManifest] = useState<MeetingRecordingManifest | null>(null);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [progress, setProgress] = useState<MeetingUploadProgress>({ currentBytes: 0, totalBytes: 0 });

  const recordingIdRef = useRef<string | null>(recordingId);
  useEffect(() => {
    recordingIdRef.current = recordingId;
  }, [recordingId]);

  const readyNoticeRef = useRef<number | null>(null);
  const activeUploadIdRef = useRef<string | null>(null);

  const clearReadyNotice = useCallback(() => {
    if (readyNoticeRef.current === null) return;
    window.clearTimeout(readyNoticeRef.current);
    readyNoticeRef.current = null;
  }, []);

  const scheduleReadyNotice = useCallback((
    nextRecordingId: string,
    nextMeetingId: string | null,
    finalManifest: MeetingRecordingManifest,
  ) => {
    clearReadyNotice();
    readyNoticeRef.current = window.setTimeout(() => {
      readyNoticeRef.current = null;
      if (recordingIdRef.current !== nextRecordingId) return;
      setRecordingId(null);
      setOwnerUserId(null);
      setManifest(null);
      setMeetingId(null);
      setState('idle');
      setProgress({ currentBytes: 0, totalBytes: 0 });
    }, READY_NOTICE_DURATION_MS);
  }, [clearReadyNotice]);

  const reset = useCallback(() => {
    if (state !== 'failed' && state !== 'aborted' && state !== 'finished') return;
    clearReadyNotice();
    setRecordingId(null);
    setOwnerUserId(null);
    setManifest(null);
    setMeetingId(null);
    setError('');
    setState('idle');
    setProgress({ currentBytes: 0, totalBytes: 0 });
  }, [state, clearReadyNotice]);

  const start = useCallback(async () => {
    if (state === 'recording' || state === 'finalizing' || state === 'uploading') return;
    if (!options.ownerUserId) {
      setState('failed');
      setError('请先登录后再开始会议录音');
      return;
    }
    clearReadyNotice();
    setError('');
    setMeetingId(null);
    setManifest(null);
    setProgress({ currentBytes: 0, totalBytes: 0 });

    const nextRecordingId = createRecordingId();
    setRecordingId(nextRecordingId);
    setOwnerUserId(options.ownerUserId);
    try {
      const draft = await pipeline.startRecording(options.ownerUserId, nextRecordingId);
      setManifest(draft);
      setState('recording');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setState('failed');
      setError(message);
      await storage.delete(options.ownerUserId, nextRecordingId).catch(() => undefined);
      setRecordingId(null);
      setOwnerUserId(null);
    }
  }, [state, options.ownerUserId, createRecordingId, pipeline, storage, clearReadyNotice]);

  const appendPcm = useCallback((pcm: Int16Array) => {
    if (state !== 'recording') return;
    pipeline.appendPcm(pcm);
  }, [state, pipeline]);

  const stop = useCallback(async () => {
    if (state !== 'recording' || !ownerUserId || !recordingId) return;
    setState('finalizing');
    try {
      const result = await pipeline.stopAndUpload({
        ownerUserId,
        recordingId,
        onProgress: (fraction, totalBytes) => {
          setProgress({
            currentBytes: Math.floor(totalBytes * fraction),
            totalBytes,
          });
        },
      });
      activeUploadIdRef.current = result.uploadId;
      setManifest(result.manifest);
      setMeetingId(result.meetingId);
      setProgress({ currentBytes: result.manifest.byteLength, totalBytes: result.manifest.byteLength });
      setState('finished');
      scheduleReadyNotice(recordingId, result.meetingId, result.manifest);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setState('failed');
    }
  }, [state, ownerUserId, recordingId, pipeline, scheduleReadyNotice]);

  const pause = useCallback(async () => {
    if (!activeUploadIdRef.current) return;
    try {
      await pipeline.pauseUpload(activeUploadIdRef.current);
      setState('failed');
      setError('上传已暂停，可在稍后继续。');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setState('failed');
    }
  }, [pipeline]);

  const continueUpload = useCallback(async () => {
    if (!manifest || !ownerUserId || !recordingId) return;
    setError('');
    setState('uploading');
    try {
      const result = await pipeline.continueUpload({
        ownerUserId,
        recordingId,
        manifest,
        onProgress: (fraction, totalBytes) => {
          setProgress({
            currentBytes: Math.floor(totalBytes * fraction),
            totalBytes,
          });
        },
      });
      activeUploadIdRef.current = result.uploadId;
      setMeetingId(result.meetingId);
      setProgress({ currentBytes: manifest.byteLength, totalBytes: manifest.byteLength });
      setState('finished');
      scheduleReadyNotice(recordingId, result.meetingId, manifest);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setState('failed');
    }
  }, [manifest, ownerUserId, recordingId, pipeline, scheduleReadyNotice]);

  const terminate = useCallback(async () => {
    if (!ownerUserId || !recordingId) return;
    clearReadyNotice();
    const uploadId = activeUploadIdRef.current;
    if (uploadId) {
      try {
        await pipeline.abortUpload(uploadId, ownerUserId, recordingId);
      } catch {
        // Abort is best-effort; UI state transitions regardless.
      }
    } else {
      await storage.delete(ownerUserId, recordingId).catch(() => undefined);
    }
    activeUploadIdRef.current = null;
    setState('aborted');
    setRecordingId(null);
    setOwnerUserId(null);
    setManifest(null);
    setMeetingId(null);
    setProgress({ currentBytes: 0, totalBytes: 0 });
  }, [ownerUserId, recordingId, pipeline, storage, clearReadyNotice]);

  const dispose = useCallback(async () => {
    clearReadyNotice();
    if (state !== 'recording' && state !== 'finalizing') return;
    try {
      await pipeline.abortRecording('页面已关闭，本地会议录音已终止');
    } catch {
      // Recorder abort is best-effort during teardown.
    }
    if (ownerUserId && recordingId) {
      await storage.delete(ownerUserId, recordingId).catch(() => undefined);
    }
  }, [state, ownerUserId, recordingId, pipeline, storage, clearReadyNotice]);

  useEffect(() => {
    return () => {
      void dispose();
    };
  }, [dispose]);

  return {
    state,
    recording: state === 'recording',
    manifest,
    meetingId,
    recordingId,
    ownerUserId,
    progress,
    error,
    canStart: state === 'idle' || state === 'failed' || state === 'aborted' || state === 'finished',
    canStop: state === 'recording',
    canContinue: Boolean(manifest && (state === 'failed' || state === 'aborted')),
    canTerminate: Boolean(manifest && (state === 'uploading' || state === 'failed' || state === 'aborted' || state === 'finished')),
    start,
    appendPcm,
    stop,
    pause,
    continueUpload,
    terminate,
    reset,
    dispose,
  };
}

function defaultCreateRecordingId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `meeting-${crypto.randomUUID()}`;
  }
  return `meeting-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
