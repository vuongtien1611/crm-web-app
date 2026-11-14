import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { StorageProvider } from '../storage.types';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;
  private readonly signingSecret =
    process.env.LOCAL_STORAGE_SIGNING_SECRET || crypto.randomBytes(32).toString('hex');
  private memoryStore: Map<string, { buffer: Buffer; mimeType: string }> = new Map();

  constructor() {
    this.baseDir = path.resolve(process.cwd(), 'storage/uploads');
    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true });
      }
    } catch (e) {
      // In constrained environment fallback to memory store
    }
  }

  private resolveKeyPath(key: string): string {
    if (!key || typeof key !== 'string' || key.includes('\0')) {
      throw new Error('Invalid storage key');
    }

    const fullPath = path.resolve(this.baseDir, key);
    const relativePath = path.relative(this.baseDir, fullPath);
    if (
      !relativePath ||
      relativePath === '..' ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      throw new Error('Invalid storage key');
    }
    return fullPath;
  }

  private createSignature(key: string, expiresAt: number): string {
    return crypto
      .createHmac('sha256', this.signingSecret)
      .update(`${key}\n${expiresAt}`)
      .digest('hex');
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<{ key: string; size: number }> {
    const fullPath = this.resolveKeyPath(key);
    // Keep in memory store for fast test retrieval
    this.memoryStore.set(key, { buffer, mimeType });

    // Also persist to disk if baseDir is writable
    try {
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, buffer);
    } catch (e) {
      // Memory store remains available
    }

    return { key, size: buffer.length };
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.resolveKeyPath(key);
    this.memoryStore.delete(key);
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (e) {
      // ignore
    }
  }

  async getSignedUrl(key: string, expiresInSeconds: number = 900): Promise<string> {
    this.resolveKeyPath(key);
    if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
      throw new Error('Invalid signed URL expiration');
    }
    const expiresAt = Date.now() + Math.floor(expiresInSeconds * 1000);
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    const signature = this.createSignature(key, expiresAt);
    return `/api/storage/raw/${encodedKey}?expires=${expiresAt}&signature=${signature}`;
  }

  isSignedUrlValid(key: string, expiresAt: string | number, signature: string): boolean {
    try {
      this.resolveKeyPath(key);
      const expiry = typeof expiresAt === 'number' ? expiresAt : Number(expiresAt);
      if (!Number.isSafeInteger(expiry) || expiry <= Date.now() || !/^[a-f0-9]{64}$/i.test(signature)) {
        return false;
      }
      const expected = Buffer.from(this.createSignature(key, expiry), 'hex');
      const provided = Buffer.from(signature, 'hex');
      return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
    } catch {
      return false;
    }
  }

  async getBuffer(key: string): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
    const fullPath = this.resolveKeyPath(key);
    const mem = this.memoryStore.get(key);
    if (mem) {
      return { buffer: mem.buffer, mimeType: mem.mimeType, size: mem.buffer.length };
    }

    if (fs.existsSync(fullPath)) {
      const buffer = fs.readFileSync(fullPath);
      const ext = path.extname(key).toLowerCase();
      let mimeType = 'application/octet-stream';
      if (ext === '.pdf') mimeType = 'application/pdf';
      else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.webp') mimeType = 'image/webp';

      return { buffer, mimeType, size: buffer.length };
    }

    throw new Error(`File not found: ${key}`);
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = this.resolveKeyPath(key);
    if (this.memoryStore.has(key)) {
      return true;
    }
    return fs.existsSync(fullPath);
  }
}
