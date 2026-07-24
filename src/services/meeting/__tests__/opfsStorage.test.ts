import { describe, expect, it } from 'vitest';
import {
  OpfsMeetingRecordingStorage,
  validateRecordingPathSegment,
  type MeetingRecordingFile,
  type MeetingRecordingManifest,
  type OpfsRootProvider,
} from '../opfsStorage';

class InMemoryDirectory {
  readonly kind = 'directory' as const;
  readonly children = new Map<string, InMemoryDirectory | InMemoryFile>();

  getDirectoryHandle(name: string, options?: { create?: boolean }): InMemoryDirectory {
    return this.entry(name, options?.create, () => new InMemoryDirectory()) as InMemoryDirectory;
  }

  getFileHandle(name: string, options?: { create?: boolean }): InMemoryFile {
    return this.entry(name, options?.create, () => new InMemoryFile()) as InMemoryFile;
  }

  async removeEntry(name: string): Promise<void> {
    this.children.delete(name);
  }

  async * entries(): AsyncIterableIterator<[string, InMemoryDirectory | InMemoryFile]> {
    for (const [name, handle] of this.children.entries()) {
      yield [name, handle];
    }
  }

  async * [Symbol.asyncIterator](): AsyncIterableIterator<[string, InMemoryDirectory | InMemoryFile]> {
    for (const [name, handle] of this.children.entries()) {
      yield [name, handle];
    }
  }

  private entry(
    name: string,
    create: boolean | undefined,
    factory: () => InMemoryDirectory | InMemoryFile,
  ): InMemoryDirectory | InMemoryFile {
    let child = this.children.get(name);
    if (!child) {
      if (!create) {
        throw new DOMException('not found', 'NotFoundError');
      }
      child = factory();
      this.children.set(name, child);
    }
    return child;
  }
}

class InMemoryFile {
  readonly kind = 'file' as const;
  bytes: Uint8Array = new Uint8Array();
  position = 0;

  async getFile(): Promise<File> {
    const bytes = this.bytes;
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new File([arrayBuffer], 'audio.wav', { type: 'audio/wav' });
  }

  async createWritable(): Promise<InMemoryWritable> {
    return new InMemoryWritable(this);
  }
}

class InMemoryWritable {
  private readonly file: InMemoryFile;

  constructor(file: InMemoryFile) {
    this.file = file;
  }

  async write(data: unknown): Promise<void> {
    if (typeof data === 'string') {
      this.append(new TextEncoder().encode(data));
      return;
    }
    if (data instanceof Uint8Array) {
      this.append(data);
      return;
    }
    if (data && typeof data === 'object' && 'type' in data) {
      const params = data as { type: string; position?: number; data?: Uint8Array | string; size?: number };
      if (params.type === 'truncate') {
        const size = params.size ?? 0;
        const next = new Uint8Array(size);
        next.set(this.file.bytes.slice(0, size));
        this.file.bytes = next;
        this.file.position = size;
        return;
      }
      if (params.type !== 'write') throw new Error('unsupported write');
      const payload = params.data;
      const bytes = payload instanceof Uint8Array
        ? payload
        : typeof payload === 'string'
          ? new TextEncoder().encode(payload)
          : new Uint8Array(0);
      const position = params.position ?? 0;
      const next = new Uint8Array(Math.max(this.file.bytes.length, position + bytes.length));
      next.set(this.file.bytes);
      next.set(bytes, position);
      this.file.bytes = next;
      this.file.position = position + bytes.length;
      return;
    }
    throw new Error('unsupported write');
  }

  async truncate(size: number): Promise<void> {
    const next = new Uint8Array(size);
    next.set(this.file.bytes.slice(0, size));
    this.file.bytes = next;
    this.file.position = size;
  }

  private append(bytes: Uint8Array): void {
    const next = new Uint8Array(this.file.bytes.length + bytes.length);
    next.set(this.file.bytes);
    next.set(bytes, this.file.bytes.length);
    this.file.bytes = next;
    this.file.position = next.length;
  }

  async close(): Promise<void> {
    // no-op
  }
}

function rootProvider(): OpfsRootProvider {
  const root = new InMemoryDirectory();
  return async () => root as unknown as FileSystemDirectoryHandle;
}

const NOW = new Date('2026-07-24T00:00:00.000Z');

async function makeRecordingFile(
  storage: OpfsMeetingRecordingStorage,
  ownerUserId: string,
  recordingId: string,
): Promise<MeetingRecordingFile> {
  const file = await storage.open(ownerUserId, recordingId);
  await file.write(0, new Uint8Array(44));
  await file.commitManifest({
    version: 1,
    ownerUserId,
    recordingId,
    state: 'ready',
    byteLength: 44,
    durationMs: 0,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    sampleRate: 16000,
    channels: 1,
    format: 'wav-pcm-s16le',
    fileSha256: 'a'.repeat(64),
  });
  return file;
}

describe('validateRecordingPathSegment', () => {
  it('accepts safe path segments', () => {
    expect(validateRecordingPathSegment('user-1')).toBe('user-1');
    expect(validateRecordingPathSegment('rec_2024.wav')).toBe('rec_2024.wav');
  });

  it('rejects empty or unsafe path segments', () => {
    expect(() => validateRecordingPathSegment('')).toThrow();
    expect(() => validateRecordingPathSegment('.')).toThrow();
    expect(() => validateRecordingPathSegment('..')).toThrow();
    expect(() => validateRecordingPathSegment('../etc')).toThrow();
    expect(() => validateRecordingPathSegment('user/1')).toThrow();
  });
});

describe('OpfsMeetingRecordingStorage', () => {
  it('opens and reads back a recording file', async () => {
    const storage = new OpfsMeetingRecordingStorage(rootProvider());
    const file = await storage.open('user-1', 'rec-1');
    await file.write(0, new Uint8Array([1, 2, 3, 4]));
    await file.write(2, new Uint8Array([9, 9, 9]));
    const size = await file.size();
    expect(size).toBe(5);
    const bytes = await file.read(0, size);
    expect(Array.from(bytes)).toEqual([1, 2, 9, 9, 9]);
    await file.close();
  });

  it('stores and recovers manifests', async () => {
    const storage = new OpfsMeetingRecordingStorage(rootProvider());
    const file = await storage.open('user-1', 'rec-2');
    const manifest: MeetingRecordingManifest = {
      version: 1,
      ownerUserId: 'user-1',
      recordingId: 'rec-2',
      state: 'ready',
      byteLength: 44,
      durationMs: 100,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      sampleRate: 16000,
      channels: 1,
      format: 'wav-pcm-s16le',
      fileSha256: 'b'.repeat(64),
    };
    await file.commitManifest(manifest);
    const recovered = await file.recoverManifest();
    expect(recovered).toEqual(manifest);
  });

  it('lists only recordings belonging to the owner', async () => {
    const storage = new OpfsMeetingRecordingStorage(rootProvider());
    await makeRecordingFile(storage, 'user-1', 'rec-1');
    await makeRecordingFile(storage, 'user-1', 'rec-2');
    await makeRecordingFile(storage, 'user-2', 'rec-1');
    const list1 = await storage.list('user-1');
    expect(list1).toHaveLength(2);
    const list2 = await storage.list('user-2');
    expect(list2).toHaveLength(1);
    expect(list2[0]?.ownerUserId).toBe('user-2');
  });

  it('deletes a recording', async () => {
    const storage = new OpfsMeetingRecordingStorage(rootProvider());
    await makeRecordingFile(storage, 'user-1', 'rec-1');
    await storage.delete('user-1', 'rec-1');
    const list = await storage.list('user-1');
    expect(list).toHaveLength(0);
  });

  it('manages upload checkpoints', async () => {
    const storage = new OpfsMeetingRecordingStorage(rootProvider());
    const file = await storage.open('user-1', 'rec-1');
    expect(await file.readUploadCheckpoint()).toBeNull();
    const checkpoint = { bucket: 'b', key: 'k', part_size: 1, upload_id: 'u' };
    await file.commitUploadCheckpoint(checkpoint);
    expect(await file.readUploadCheckpoint()).toEqual(checkpoint);
    await file.clearUploadCheckpoint();
    expect(await file.readUploadCheckpoint()).toBeNull();
  });

  it('returns an empty list when the owner has no recordings', async () => {
    const storage = new OpfsMeetingRecordingStorage(rootProvider());
    const list = await storage.list('user-1');
    expect(list).toEqual([]);
  });

  it('silently no-ops delete when the recording is missing', async () => {
    const storage = new OpfsMeetingRecordingStorage(rootProvider());
    await expect(storage.delete('user-1', 'rec-missing')).resolves.toBeUndefined();
  });
});
