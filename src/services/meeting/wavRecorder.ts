import { sha256 } from '@noble/hashes/sha2.js';

import type {
  MeetingRecordingFile,
  MeetingRecordingManifest,
  MeetingRecordingStorage,
} from './opfsStorage';

const WAV_HEADER_BYTES = 44;
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2;
const DEFAULT_HASH_CHUNK_SIZE = 1024 * 1024;
const MAX_HASH_CHUNK_SIZE = 4 * 1024 * 1024;

export interface MeetingRecorderOptions {
  now?: () => Date;
  hashChunkSize?: number;
}

export class MeetingRecorder {
  private readonly now: () => Date;
  private readonly hashChunkSize: number;
  private file: MeetingRecordingFile | null = null;
  private manifest: MeetingRecordingManifest | null = null;
  private writeOffset = WAV_HEADER_BYTES;
  private sampleCount = 0;
  private pendingWrites: Promise<void> = Promise.resolve();
  private writeError: Error | null = null;

  constructor(
    private readonly storage: MeetingRecordingStorage,
    options: MeetingRecorderOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.hashChunkSize = normalizeHashChunkSize(options.hashChunkSize ?? DEFAULT_HASH_CHUNK_SIZE);
  }

  get active(): boolean {
    return this.manifest?.state === 'recording';
  }

  async start(ownerUserId: string, recordingId: string): Promise<MeetingRecordingManifest> {
    if (this.active) throw new Error('已有本地会议录音正在进行。');
    const file = await this.storage.open(ownerUserId, recordingId);
    const timestamp = this.now().toISOString();
    const manifest: MeetingRecordingManifest = {
      version: 1,
      ownerUserId,
      recordingId,
      state: 'recording',
      byteLength: WAV_HEADER_BYTES,
      durationMs: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      format: 'wav-pcm-s16le',
    };
    try {
      await file.truncate(0);
      await file.write(0, createCanonicalWavHeader(0));
      await file.commitManifest(manifest);
    } catch (error) {
      await file.close().catch(() => undefined);
      throw new Error(`无法创建本地会议录音：${errorMessage(error)}`);
    }
    this.file = file;
    this.manifest = manifest;
    this.writeOffset = WAV_HEADER_BYTES;
    this.sampleCount = 0;
    this.pendingWrites = Promise.resolve();
    this.writeError = null;
    return { ...manifest };
  }

  appendPcm(pcm: Int16Array): void {
    if (!this.active || !this.file) throw new Error('本地会议录音尚未开始。');
    const samples = Int16Array.from(pcm);
    if (samples.length === 0) return;
    const file = this.file;
    this.pendingWrites = this.pendingWrites.then(async () => {
      if (this.writeError) return;
      const bytes = pcmToLittleEndian(samples);
      const offset = this.writeOffset;
      try {
        await file.write(offset, bytes);
        this.writeOffset += bytes.length;
        this.sampleCount += samples.length;
      } catch (error) {
        this.writeError = new Error(`写入本地会议录音失败：${errorMessage(error)}`);
      }
    });
  }

  async stop(): Promise<MeetingRecordingManifest> {
    const { file, manifest } = this.requireActive();
    await this.pendingWrites;
    if (this.writeError) {
      await this.finalizeAborted(file, manifest, this.writeError);
      throw this.writeError;
    }

    const pcmBytes = this.writeOffset - WAV_HEADER_BYTES;
    try {
      await patchWavSizes(file, pcmBytes);
      await file.close();
      const byteLength = await file.size();
      if (byteLength !== this.writeOffset) {
        throw new Error(`本地录音长度不一致：${byteLength} != ${this.writeOffset}`);
      }
      const fileSha256 = await hashRecordingFile(file, this.hashChunkSize);
      const ready: MeetingRecordingManifest = {
        ...manifest,
        state: 'ready',
        byteLength,
        durationMs: Math.round((this.sampleCount * 1000) / SAMPLE_RATE),
        updatedAt: this.now().toISOString(),
        fileSha256,
      };
      await file.commitManifest(ready);
      this.reset();
      return { ...ready };
    } catch (error) {
      const failure = new Error(`完成本地会议录音失败：${errorMessage(error)}`);
      await this.finalizeAborted(file, manifest, failure);
      throw failure;
    }
  }

  async abort(reason = '本地会议录音已终止。'): Promise<MeetingRecordingManifest> {
    const { file, manifest } = this.requireActive();
    await this.pendingWrites;
    return this.finalizeAborted(file, manifest, new Error(reason));
  }

  private requireActive(): { file: MeetingRecordingFile; manifest: MeetingRecordingManifest } {
    if (!this.file || !this.manifest || this.manifest.state !== 'recording') {
      throw new Error('本地会议录音尚未开始。');
    }
    return { file: this.file, manifest: this.manifest };
  }

  private async finalizeAborted(
    file: MeetingRecordingFile,
    manifest: MeetingRecordingManifest,
    error: Error,
  ): Promise<MeetingRecordingManifest> {
    const pcmBytes = this.writeOffset - WAV_HEADER_BYTES;
    await patchWavSizes(file, pcmBytes).catch(() => undefined);
    await file.close().catch(() => undefined);
    const aborted: MeetingRecordingManifest = {
      ...manifest,
      state: 'aborted',
      byteLength: this.writeOffset,
      durationMs: Math.round((this.sampleCount * 1000) / SAMPLE_RATE),
      updatedAt: this.now().toISOString(),
      error: error.message,
    };
    await file.commitManifest(aborted).catch(() => undefined);
    this.reset();
    return { ...aborted };
  }

  private reset(): void {
    this.file = null;
    this.manifest = null;
    this.pendingWrites = Promise.resolve();
    this.writeError = null;
  }
}

export function createCanonicalWavHeader(pcmByteLength: number): Uint8Array {
  if (!Number.isSafeInteger(pcmByteLength) || pcmByteLength < 0 || pcmByteLength > 0xffffffff - 36) {
    throw new Error('Invalid WAV PCM byte length.');
  }
  const bytes = new Uint8Array(WAV_HEADER_BYTES);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, 'RIFF');
  view.setUint32(4, pcmByteLength + 36, true);
  writeAscii(bytes, 8, 'WAVE');
  writeAscii(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE, true);
  view.setUint16(32, CHANNELS * BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, 'data');
  view.setUint32(40, pcmByteLength, true);
  return bytes;
}

export async function hashRecordingFile(file: MeetingRecordingFile, requestedChunkSize = DEFAULT_HASH_CHUNK_SIZE): Promise<string> {
  const chunkSize = normalizeHashChunkSize(requestedChunkSize);
  const totalBytes = await file.size();
  const hash = sha256.create();
  let offset = 0;
  while (offset < totalBytes) {
    const requested = Math.min(chunkSize, totalBytes - offset);
    const chunk = await file.read(offset, requested);
    if (chunk.length === 0 || chunk.length > requested) {
      throw new Error('读取本地会议录音失败。');
    }
    hash.update(chunk);
    offset += chunk.length;
  }
  return bytesToHex(hash.digest());
}

async function patchWavSizes(file: MeetingRecordingFile, pcmByteLength: number): Promise<void> {
  const riffSize = new Uint8Array(4);
  const dataSize = new Uint8Array(4);
  new DataView(riffSize.buffer).setUint32(0, pcmByteLength + 36, true);
  new DataView(dataSize.buffer).setUint32(0, pcmByteLength, true);
  await file.write(4, riffSize);
  await file.write(40, dataSize);
}

function pcmToLittleEndian(pcm: Int16Array): Uint8Array {
  const bytes = new Uint8Array(pcm.length * BYTES_PER_SAMPLE);
  const view = new DataView(bytes.buffer);
  pcm.forEach((sample, index) => view.setInt16(index * BYTES_PER_SAMPLE, sample, true));
  return bytes;
}

function normalizeHashChunkSize(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid recording hash chunk size.');
  return Math.min(value, MAX_HASH_CHUNK_SIZE);
}

function writeAscii(target: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) target[offset + index] = value.charCodeAt(index);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
