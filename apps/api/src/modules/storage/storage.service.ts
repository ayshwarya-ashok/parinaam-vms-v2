import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AppConfig } from '../../config';

export interface StoredFile {
  path: string;
  sizeBytes: number;
  contentHash: string;
}

/**
 * Files are never served from the filesystem directly. Callers get a namespaced
 * path; downloads go through GET /files/:id, which authorizes first.
 *
 * Local disk today, S3 later — the driver boundary is this class.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly config: AppConfig) {}

  private get root(): string {
    return this.config.get('UPLOAD_DIR');
  }

  /** e.g. namespace 'certificates' -> 'certificates/<uuid>.pdf' */
  buildPath(namespace: string, extension: string, id = randomUUID()): string {
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    return `${namespace}/${id}${ext}`;
  }

  async put(relativePath: string, data: Buffer): Promise<StoredFile> {
    const absolute = join(this.root, relativePath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, data);

    return {
      path: relativePath,
      sizeBytes: data.byteLength,
      contentHash: createHash('sha256').update(data).digest('hex'),
    };
  }

  async get(relativePath: string): Promise<Buffer> {
    return readFile(join(this.root, relativePath));
  }

  async delete(relativePath: string): Promise<void> {
    try {
      await unlink(join(this.root, relativePath));
    } catch (err) {
      this.logger.warn(`Could not delete ${relativePath}: ${(err as Error).message}`);
    }
  }

  /** Human-readable size for display columns such as training_materials.file_size_text. */
  static formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }
}
