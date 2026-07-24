import { describe, expect, it, vi } from 'vitest';
import { createCanonicalWavHeader, hashRecordingFile, MeetingRecorder } from '../wavRecorder';
import type {
  MeetingRecordingFile,
  MeetingRecordingManifest,
  MeetingRecordingStorage,
} from '../opfsStorage';

class InMemoryMeetingFile implements MeetingRecordingFile {
  private readonly files = new Map<string, Uint8Array>();
  private store: Map<string, Uint8Array>;

  constructor() {
    this.store = this.files;
  }

  async write(offset: number, bytes: Uint8Array): Promise<void> {
    const buffer = this.files.get('audio.wav') ?? new Uint8Array(0);
    const next = new Uint8Array(Math.max(buffer.length, offset + bytes.length));
    next.set(buffer);
    next.set(bytes, offset);
    this.files.set('audio.wav', next);
  }

  async truncate(size: number): Promise<void> {
    const buffer = this.files.get('audio.wav');
    if (!buffer) {
      this.files.set('audio.wav', new Uint8Array(size));
      return;
    }
    this.files.set('audio.wav', buffer.slice(0, size));
  }

  async size(): Promise<number> {
    return this.files.get('audio.wav')?.length ?? 0;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    const buffer = this.files.get('audio.wav') ?? new Uint8Array(0);
    return buffer.slice(offset, offset + length);
  }

  async blob(): Promise<Blob> {
    const buffer = this.files.get('audio.wav');
    if (!buffer) return new Blob([], { type: 'audio/wav' });
    const copy = new Uint8Array(buffer.byteLength);
    copy.set(buffer);
    const arrayBuffer = copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) as ArrayBuffer;
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  async commitManifest(manifest: MeetingRecordingManifest): Promise<void> {
    this.files.set('manifest.json', new TextEncoder().encode(JSON.stringify(manifest)));
  }

  async recoverManifest(): Promise<MeetingRecordingManifest | null> {
    const buffer = this.files.get('manifest.json');
    if (!buffer) return null;
    return JSON.parse(new TextDecoder().decode(buffer)) as MeetingRecordingManifest;
  }

  async commitUploadCheckpoint(checkpoint: unknown): Promise<void> {
    this.files.set('tos-upload-checkpoint.json', new TextEncoder().encode(JSON.stringify(checkpoint)));
  }

  async readUploadCheckpoint(): Promise<unknown | null> {
    const buffer = this.files.get('tos-upload-checkpoint.json');
    if (!buffer) return null;
    return JSON.parse(new TextDecoder().decode(buffer));
  }

  async clearUploadCheckpoint(): Promise<void> {
    this.files.delete('tos-upload-checkpoint.json');
  }

  async close(): Promise<void> {
    // No-op for the in-memory implementation.
  }

  snapshot(): Map<string, Uint8Array> {
    return this.store;
  }
}

class InMemoryStorage implements MeetingRecordingStorage {
  readonly files = new Map<string, InMemoryMeetingFile>();

  async open(ownerUserId: string, recordingId: string): Promise<MeetingRecordingFile> {
    const key = `${ownerUserId}/${recordingId}`;
    let file = this.files.get(key);
    if (!file) {
      file = new InMemoryMeetingFile();
      this.files.set(key, file);
    }
    return file;
  }

  async list(_ownerUserId: string): Promise<MeetingRecordingManifest[]> {
    const all: MeetingRecordingManifest[] = [];
    for (const file of this.files.values()) {
      const manifest = await file.recoverManifest();
      if (manifest) all.push(manifest);
    }
    return all;
  }

  async delete(_ownerUserId: string, recordingId: string): Promise<void> {
    for (const [key, file] of this.files.entries()) {
      if (key.endsWith(`/${recordingId}`)) {
        await file.close();
        this.files.delete(key);
      }
    }
  }
}

const NOW = new Date('2026-07-24T00:00:00.000Z');

describe('wavRecorder', () => {
  it('writes a canonical 44-byte WAV header with PCM16/16kHz/mono', () => {
    const header = createCanonicalWavHeader(0);
    expect(header.length).toBe(44);
    const view = new DataView(header.buffer);
    expect(String.fromCharCode(...header.slice(0, 4))).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36);
    expect(String.fromCharCode(...header.slice(8, 12))).toBe('WAVE');
    expect(String.fromCharCode(...header.slice(12, 16))).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // channels
    expect(view.getUint32(24, true)).toBe(16_000); // sample rate
    expect(view.getUint32(28, true)).toBe(32_000); // byte rate
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(String.fromCharCode(...header.slice(36, 40))).toBe('data');
    expect(view.getUint32(40, true)).toBe(0);
  });

  it('rejects invalid PCM byte lengths', () => {
    expect(() => createCanonicalWavHeader(-1)).toThrow();
    expect(() => createCanonicalWavHeader(0xffffffff)).toThrow();
    expect(() => createCanonicalWavHeader(1.5)).toThrow();
  });

  it('flushes appended PCM samples, fixes the WAV sizes, and hashes the file', async () => {
    const storage = new InMemoryStorage();
    const recorder = new MeetingRecorder(storage, { now: () => NOW });
    const draft = await recorder.start('user-1', 'rec-1');
    expect(draft.state).toBe('recording');
    expect(draft.byteLength).toBe(44);

    // 16-bit signed PCM little-endian: 0x0001, 0x0100, 0x7fff, 0x8000
    const samples = new Int16Array([0x0001, 0x0100, 0x7fff, -0x8000]);
    recorder.appendPcm(samples);
    recorder.appendPcm(new Int16Array(0));
    recorder.appendPcm(new Int16Array([42]));

    const ready = await recorder.stop();
    expect(ready.state).toBe('ready');
    expect(ready.byteLength).toBe(44 + 5 * 2);
    expect(ready.durationMs).toBe(Math.round((5 * 1000) / 16_000));
    expect(ready.fileSha256).toMatch(/^[0-9a-f]{64}$/);

    const file = await storage.open('user-1', 'rec-1');
    expect(await file.size()).toBe(44 + 5 * 2);

    const header = await file.read(0, 44);
    const view = new DataView(header.buffer);
    expect(view.getUint32(4, true)).toBe(36 + 5 * 2);
    expect(view.getUint32(40, true)).toBe(5 * 2);

    const recovered = await file.recoverManifest();
    expect(recovered?.fileSha256).toBe(ready.fileSha256);
  });

  it('writes an aborted manifest when abort is called mid-recording', async () => {
    const storage = new InMemoryStorage();
    const recorder = new MeetingRecorder(storage, { now: () => NOW });
    await recorder.start('user-1', 'rec-2');
    recorder.appendPcm(new Int16Array([1, 2, 3, 4]));
    const aborted = await recorder.abort('user cancelled');
    expect(aborted.state).toBe('aborted');
    expect(aborted.error).toBe('user cancelled');
    const file = await storage.open('user-1', 'rec-2');
    const manifest = await file.recoverManifest();
    expect(manifest?.state).toBe('aborted');
  });

  it('hashes a file in chunks and returns a stable SHA-256 hex digest', async () => {
    const storage = new InMemoryStorage();
    const recorder = new MeetingRecorder(storage, { now: () => NOW });
    await recorder.start('user-1', 'rec-3');
    const samples = new Int16Array(1024);
    for (let i = 0; i < samples.length; i += 1) samples[i] = i % 256;
    recorder.appendPcm(samples);
    await recorder.stop();

    const file = await storage.open('user-1', 'rec-3');
    const hash = await hashRecordingFile(file, 100);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const hashAgain = await hashRecordingFile(file, 1024);
    expect(hashAgain).toBe(hash);
  });

  it('rejects an invalid hash chunk size', () => {
    const storage = new InMemoryStorage();
    const file = {
      write: vi.fn(),
      truncate: vi.fn(),
      size: vi.fn(),
      read: vi.fn(),
      blob: vi.fn(),
      commitManifest: vi.fn(),
      recoverManifest: vi.fn(),
      commitUploadCheckpoint: vi.fn(),
      readUploadCheckpoint: vi.fn(),
      clearUploadCheckpoint: vi.fn(),
      close: vi.fn(),
    } as unknown as MeetingRecordingFile;
    return expect(hashRecordingFile(file, 0)).rejects.toThrow();
  });
});
