import type { MeetingUploadTarget } from '../../api/contracts';

const DEFAULT_PART_SIZE = 20 * 1024 * 1024;
const DEFAULT_TASK_COUNT = 3;

export interface TosUploadCheckpointPart {
  part_number: number;
  part_size: number;
  offset: number;
  etag: string;
  hash_crc64ecma: string;
  is_completed: boolean;
}

export interface TosUploadCheckpoint {
  bucket: string;
  key: string;
  part_size: number;
  upload_id: string;
  parts_info?: TosUploadCheckpointPart[];
}

interface TosUploadFileInput {
  bucket: string;
  key: string;
  file: Blob;
  contentType: string;
  partSize: number;
  taskNum: number;
  checkpoint?: TosUploadCheckpoint;
  cancelToken: unknown;
  dataTransferStatusChange(status: { consumedBytes: number; totalBytes: number }): void;
  progress(percent: number, checkpoint: TosUploadCheckpoint): void;
}

interface TosSDKClient {
  uploadFile(input: TosUploadFileInput): Promise<unknown>;
  abortMultipartUpload(input: { bucket: string; key: string; uploadId: string }): Promise<unknown>;
}

interface TosCancelSource {
  token: unknown;
  cancel(message?: string): void;
}

export interface TosSDKAdapter {
  createClient(target: MeetingUploadTarget): TosSDKClient;
  createCancelSource(): TosCancelSource;
  isCancel(error: unknown): boolean;
}

export interface TosMeetingUploadInput {
  target: MeetingUploadTarget;
  file: Blob;
  checkpoint?: TosUploadCheckpoint;
  onProgress?(fraction: number): void;
  onCheckpoint?(checkpoint: TosUploadCheckpoint): void;
}

export interface TosMeetingUploadTask {
  result: Promise<void>;
  pause(): Promise<void>;
  abort(): Promise<void>;
}

export interface TosMeetingUploader {
  start(input: TosMeetingUploadInput): TosMeetingUploadTask;
}

export async function loadDefaultAdapter(): Promise<TosSDKAdapter> {
  const { CancelToken, TosClient } = await import('@volcengine/tos-sdk');
  return {
    createClient(target) {
      return new TosClient({
        accessKeyId: target.credentials.access_key_id,
        accessKeySecret: target.credentials.secret_access_key,
        stsToken: target.credentials.session_token,
        // The API returns an absolute HTTPS URL, while the official Browser SDK
        // expects only the host and adds the protocol itself.
        endpoint: toTosSDKEndpoint(target.endpoint),
        region: target.region,
        bucket: target.bucket,
      }) as unknown as TosSDKClient;
    },
    createCancelSource: () => CancelToken.source(),
    isCancel: isTosMeetingUploadCancellation,
  };
}

export type TosSDKAdapterSource = TosSDKAdapter | (() => Promise<TosSDKAdapter>);

export function createTosMeetingUploader(
  source: TosSDKAdapterSource = loadDefaultAdapter,
): TosMeetingUploader {
  let resolved: TosSDKAdapter | null = null;
  const pending: { promise: Promise<TosSDKAdapter> } = {
    promise: Promise.reject(new Error('adapter unresolved')),
  };
  // The initial rejected promise is overwritten before any awaiter touches it;
  // attach a no-op handler so it doesn't surface as an unhandled rejection.
  pending.promise.catch(() => undefined);

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
  return {
    start(input) {
      validateTarget(input.target);
      if (input.checkpoint && !checkpointMatchesTarget(input.checkpoint, input.target)) {
        throw new Error('上传断点记录与当前会议录音不匹配');
      }

      let currentCheckpoint = input.checkpoint;
      let resolvedAdapter: TosSDKAdapter | null = null;
      let client: TosSDKClient | null = null;
      let cancelSource: TosCancelSource | null = null;
      // Queue cancel intent so synchronous pause()/abort() callers always see
      // their intent honored, even before the lazy loader resolves.
      let pendingCancelMessage: string | null = null;

      const result = resolve().then((adapter) => {
        resolvedAdapter = adapter;
        client = adapter.createClient(input.target);
        cancelSource = adapter.createCancelSource();
        if (pendingCancelMessage !== null) {
          cancelSource.cancel(pendingCancelMessage);
        }
        // TOS transport parts never pass through our API server. The SDK owns
        // multipart retries while this callback exposes only business progress
        // and a credential-free checkpoint that OPFS can safely persist.
        return client.uploadFile({
          bucket: input.target.bucket,
          key: input.target.object_key,
          file: input.file,
          contentType: 'audio/wav',
          partSize: DEFAULT_PART_SIZE,
          taskNum: DEFAULT_TASK_COUNT,
          checkpoint: input.checkpoint,
          cancelToken: cancelSource.token,
          dataTransferStatusChange(status) {
            if (status.totalBytes > 0) {
              input.onProgress?.(Math.max(0, Math.min(1, status.consumedBytes / status.totalBytes)));
            }
          },
          progress(percent, checkpoint) {
            currentCheckpoint = checkpoint;
            input.onCheckpoint?.(checkpoint);
            input.onProgress?.(Math.max(0, Math.min(1, percent)));
          },
        }).then(() => undefined);
      });

      async function pause(): Promise<void> {
        pendingCancelMessage = 'meeting upload paused';
        if (cancelSource) {
          cancelSource.cancel('meeting upload paused');
        }
        try {
          await result;
        } catch (error) {
          if (!resolvedAdapter?.isCancel(error)) throw error;
        }
      }

      async function abort(): Promise<void> {
        pendingCancelMessage = 'meeting upload aborted';
        if (cancelSource) {
          cancelSource.cancel('meeting upload aborted');
        }
        try {
          await result;
        } catch (error) {
          if (!resolvedAdapter?.isCancel(error)) {
            // The business DELETE remains authoritative even if an in-flight
            // request failed for another reason.
          }
        }
        if (!currentCheckpoint?.upload_id) return;
        await client?.abortMultipartUpload({
          bucket: input.target.bucket,
          key: input.target.object_key,
          uploadId: currentCheckpoint.upload_id,
        }).catch(() => undefined);
      }

      return { result, pause, abort };
    },
  };
}

export function isTosUploadCheckpoint(value: unknown): value is TosUploadCheckpoint {
  if (!value || typeof value !== 'object') return false;
  const checkpoint = value as Partial<TosUploadCheckpoint>;
  return typeof checkpoint.bucket === 'string'
    && typeof checkpoint.key === 'string'
    && Number.isSafeInteger(checkpoint.part_size)
    && (checkpoint.part_size ?? 0) > 0
    && typeof checkpoint.upload_id === 'string'
    && checkpoint.upload_id.length > 0;
}

export function isTosMeetingUploadCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { __CANCEL__?: unknown; code?: unknown };
  return candidate.__CANCEL__ === true || candidate.code === 'ERR_CANCELED';
}

export function toTosSDKEndpoint(endpoint: string): string {
  return new URL(endpoint).host;
}

function checkpointMatchesTarget(checkpoint: TosUploadCheckpoint, target: MeetingUploadTarget): boolean {
  return checkpoint.bucket === target.bucket && checkpoint.key === target.object_key;
}

function validateTarget(target: MeetingUploadTarget): void {
  let endpoint: URL;
  try {
    endpoint = new URL(target.endpoint);
  } catch {
    throw new Error('服务器返回了无效的 TOS 上传地址');
  }
  if (
    target.provider !== 'tos'
    || endpoint.protocol !== 'https:'
    || !target.region
    || !target.bucket
    || !target.object_key
    || !target.credentials.access_key_id
    || !target.credentials.secret_access_key
    || !target.credentials.session_token
    || !Number.isSafeInteger(target.credentials.expires_at)
  ) {
    throw new Error('服务器返回了无效的 TOS 上传凭证');
  }
}
