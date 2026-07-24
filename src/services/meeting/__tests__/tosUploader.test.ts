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
});
