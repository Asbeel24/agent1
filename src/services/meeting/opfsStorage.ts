export type MeetingRecordingState = 'recording' | 'ready' | 'aborted';

export interface MeetingRecordingManifest {
  version: 1;
  ownerUserId: string;
  recordingId: string;
  state: MeetingRecordingState;
  byteLength: number;
  durationMs: number;
  createdAt: string;
  updatedAt: string;
  sampleRate: 16000;
  channels: 1;
  format: 'wav-pcm-s16le';
  fileSha256?: string;
  error?: string;
}

export interface MeetingRecordingFile {
  write(offset: number, bytes: Uint8Array): Promise<void>;
  truncate(size: number): Promise<void>;
  size(): Promise<number>;
  read(offset: number, length: number): Promise<Uint8Array>;
  blob(): Promise<Blob>;
  commitManifest(manifest: MeetingRecordingManifest): Promise<void>;
  recoverManifest(): Promise<MeetingRecordingManifest | null>;
  commitUploadCheckpoint(checkpoint: unknown): Promise<void>;
  readUploadCheckpoint(): Promise<unknown | null>;
  clearUploadCheckpoint(): Promise<void>;
  close(): Promise<void>;
}

export interface MeetingRecordingStorage {
  open(ownerUserId: string, recordingId: string): Promise<MeetingRecordingFile>;
  list(ownerUserId: string): Promise<MeetingRecordingManifest[]>;
  delete(ownerUserId: string, recordingId: string): Promise<void>;
}

export type OpfsRootProvider = () => Promise<FileSystemDirectoryHandle>;

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;

export function validateRecordingPathSegment(value: string): string {
  const segment = value.trim();
  if (!segment || segment === '.' || segment === '..' || !SAFE_PATH_SEGMENT.test(segment)) {
    throw new Error('Invalid recording path segment.');
  }
  return segment;
}

async function browserOpfsRoot(): Promise<FileSystemDirectoryHandle> {
  const storage = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
  if (typeof storage?.getDirectory !== 'function') {
    throw new Error('当前浏览器不支持 OPFS 本地录音存储。');
  }
  return storage.getDirectory();
}

export class OpfsMeetingRecordingStorage implements MeetingRecordingStorage {
  constructor(private readonly rootProvider: OpfsRootProvider = browserOpfsRoot) {}

  async open(ownerUserId: string, recordingId: string): Promise<MeetingRecordingFile> {
    const owner = validateRecordingPathSegment(ownerUserId);
    const recording = validateRecordingPathSegment(recordingId);
    const ownerDirectory = await this.ownerDirectory(owner, true);
    const recordingDirectory = await ownerDirectory.getDirectoryHandle(recording, { create: true });
    const audio = await recordingDirectory.getFileHandle('audio.wav', { create: true });
    return new OpfsMeetingRecordingFile(recordingDirectory, audio);
  }

  async list(ownerUserId: string): Promise<MeetingRecordingManifest[]> {
    const owner = validateRecordingPathSegment(ownerUserId);
    let ownerDirectory: FileSystemDirectoryHandle;
    try {
      ownerDirectory = await this.ownerDirectory(owner, false);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const manifests: MeetingRecordingManifest[] = [];
    for await (const [, handle] of (ownerDirectory as IterableDirectoryHandle).entries()) {
      if (handle.kind !== 'directory') continue;
      const recordingDirectory = handle as FileSystemDirectoryHandle;
      try {
        const audio = await recordingDirectory.getFileHandle('audio.wav');
        const manifest = await new OpfsMeetingRecordingFile(recordingDirectory, audio).recoverManifest();
        if (manifest?.ownerUserId === owner) manifests.push(manifest);
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
    return manifests.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async delete(ownerUserId: string, recordingId: string): Promise<void> {
    const owner = validateRecordingPathSegment(ownerUserId);
    const recording = validateRecordingPathSegment(recordingId);
    try {
      const ownerDirectory = await this.ownerDirectory(owner, false);
      await ownerDirectory.removeEntry(recording, { recursive: true });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  private async ownerDirectory(owner: string, create: boolean): Promise<FileSystemDirectoryHandle> {
    const root = await this.rootProvider();
    const app = await root.getDirectoryHandle('opentars', { create });
    const recordings = await app.getDirectoryHandle('meeting-recordings', { create });
    return recordings.getDirectoryHandle(owner, { create });
  }
}

class OpfsMeetingRecordingFile implements MeetingRecordingFile {
  private writable: FileSystemWritableFileStream | null = null;
  private closed = false;

  constructor(
    private readonly directory: FileSystemDirectoryHandle,
    private readonly audio: FileSystemFileHandle,
  ) {}

  async write(offset: number, bytes: Uint8Array): Promise<void> {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid recording write offset.');
    const writable = await this.writer();
    const data = new Uint8Array(bytes);
    await writable.write({ type: 'write', position: offset, data });
  }

  async truncate(size: number): Promise<void> {
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid recording size.');
    await (await this.writer()).truncate(size);
  }

  async size(): Promise<number> {
    return (await this.audio.getFile()).size;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0) {
      throw new Error('Invalid recording read range.');
    }
    const file = await this.audio.getFile();
    return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
  }

  async blob(): Promise<Blob> {
    return this.audio.getFile();
  }

  async commitManifest(manifest: MeetingRecordingManifest): Promise<void> {
    const handle = await this.directory.getFileHandle('manifest.json', { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(JSON.stringify(manifest));
    } finally {
      await writable.close();
    }
  }

  async recoverManifest(): Promise<MeetingRecordingManifest | null> {
    try {
      const handle = await this.directory.getFileHandle('manifest.json');
      const parsed: unknown = JSON.parse(await (await handle.getFile()).text());
      return isMeetingRecordingManifest(parsed) ? parsed : null;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async commitUploadCheckpoint(checkpoint: unknown): Promise<void> {
    const handle = await this.directory.getFileHandle('tos-upload-checkpoint.json', { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(JSON.stringify(checkpoint));
    } finally {
      await writable.close();
    }
  }

  async readUploadCheckpoint(): Promise<unknown | null> {
    try {
      const handle = await this.directory.getFileHandle('tos-upload-checkpoint.json');
      return JSON.parse(await (await handle.getFile()).text()) as unknown;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async clearUploadCheckpoint(): Promise<void> {
    try {
      await this.directory.removeEntry('tos-upload-checkpoint.json');
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.writable) await this.writable.close();
    this.writable = null;
  }

  private async writer(): Promise<FileSystemWritableFileStream> {
    if (this.closed) throw new Error('Recording file is closed.');
    this.writable ??= await this.audio.createWritable({ keepExistingData: true });
    return this.writable;
  }
}

function isMeetingRecordingManifest(value: unknown): value is MeetingRecordingManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<MeetingRecordingManifest>;
  return manifest.version === 1
    && typeof manifest.ownerUserId === 'string'
    && typeof manifest.recordingId === 'string'
    && ['recording', 'ready', 'aborted'].includes(manifest.state ?? '')
    && typeof manifest.byteLength === 'number'
    && typeof manifest.durationMs === 'number'
    && manifest.sampleRate === 16000
    && manifest.channels === 1
    && manifest.format === 'wav-pcm-s16le';
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}
