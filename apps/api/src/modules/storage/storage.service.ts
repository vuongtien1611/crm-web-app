import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as path from 'path';
import {
  StorageEntityType,
  StorageProvider,
  UploadFileOptions,
  UploadResult,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
} from './storage.types';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { R2StorageProvider } from './providers/r2-storage.provider';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private provider: StorageProvider;

  constructor() {
    this.provider = this.resolveProvider();
  }

  /**
   * Select appropriate storage provider based on environment configuration.
   */
  private resolveProvider(): StorageProvider {
    const driver = process.env.STORAGE_DRIVER;
    const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    const bucket = process.env.CLOUDFLARE_R2_BUCKET || 'crm-uploads';
    const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;

    const hasValidR2Credentials =
      accountId &&
      accessKeyId &&
      secretAccessKey &&
      accessKeyId !== 'your_r2_access_key_id' &&
      secretAccessKey !== 'your_r2_secret_access_key';

    if (driver === 'r2' || (driver !== 'local' && hasValidR2Credentials)) {
      if (!hasValidR2Credentials && process.env.NODE_ENV === 'production') {
        throw new Error('FATAL: Storage driver is set to R2 or production mode, but Cloudflare R2 credentials are missing or invalid.');
      }

      this.logger.log('StorageService initialized with Cloudflare R2 Provider');
      return new R2StorageProvider({
        accountId: accountId!,
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
        bucket,
        endpoint,
      });
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Cannot use LocalStorageProvider in production environment. Cloudflare R2 credentials required.');
    }

    this.logger.log('StorageService initialized with Local / In-Memory Storage Provider');
    return new LocalStorageProvider();
  }

  /**
   * Override provider for testing or custom setup.
   */
  setProvider(provider: StorageProvider): void {
    this.provider = provider;
  }

  getProvider(): StorageProvider {
    return this.provider;
  }

  /**
   * Validate file content, size, extension and magic bytes.
   */
  validateFile(
    filename: string,
    buffer: Buffer,
    claimedMimeType?: string,
  ): { safeFilename: string; resolvedMimeType: string } {
    const maxMb = Number(process.env.MAX_UPLOAD_SIZE_MB) || 10;
    const maxBytes = maxMb * 1024 * 1024;

    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Tệp tải lên không được rỗng (File is empty)');
    }

    if (buffer.length > maxBytes) {
      throw new BadRequestException(
        `Kích thước tệp vượt quá giới hạn tối đa cho phép (${maxMb}MB)`,
      );
    }

    // 1. Sanitize filename & check extension
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext as any)) {
      throw new BadRequestException(
        `Định dạng tệp không được hỗ trợ (${ext}). Chỉ chấp nhận: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }

    const baseName = path.basename(filename, ext);
    const safeBaseName = baseName
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/^_+/, '') || 'document';
    const safeFilename = `${safeBaseName}${ext}`;

    // 2. Validate MIME type allowlist
    const mime = (claimedMimeType || this.inferMimeFromExtension(ext)).toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(mime as any)) {
      throw new BadRequestException(
        `MIME type không hợp lệ (${mime}). Chỉ chấp nhận: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    // 3. Inspect magic bytes to verify content integrity
    const isValidSignature = this.verifyMagicBytes(buffer, ext);
    if (!isValidSignature) {
      throw new BadRequestException(
        'Nội dung tệp không khớp với định dạng khai báo (File signature mismatch)',
      );
    }

    return { safeFilename, resolvedMimeType: mime };
  }

  /**
   * Verify file magic bytes against extension.
   */
  private verifyMagicBytes(buffer: Buffer, ext: string): boolean {
    if (buffer.length < 4) return false;

    // PDF: %PDF- (0x25 0x50 0x44 0x46)
    if (ext === '.pdf') {
      return (
        buffer[0] === 0x25 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x44 &&
        buffer[3] === 0x46
      );
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (ext === '.png') {
      if (buffer.length < 8) return false;
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );
    }

    // JPEG: FF D8 FF
    if (ext === '.jpg' || ext === '.jpeg') {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }

    // WEBP: RIFF....WEBP
    if (ext === '.webp') {
      if (buffer.length < 12) return false;
      const isRiff =
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46;
      const isWebp =
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50;
      return isRiff && isWebp;
    }

    return false;
  }

  private inferMimeFromExtension(ext: string): string {
    switch (ext) {
      case '.pdf':
        return 'application/pdf';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Generate canonical, collision-free object key.
   * Structure: {entityType}/{entityId}/{uuid}-{safeFilename}
   */
  buildObjectKey(
    entityType: StorageEntityType,
    entityId: string | number,
    safeFilename: string,
  ): string {
    const uuid = crypto.randomUUID();
    return `${entityType}/${entityId}/${uuid}-${safeFilename}`;
  }

  /**
   * Validate and upload file to the active storage provider.
   */
  async uploadFile(options: UploadFileOptions): Promise<UploadResult> {
    const { safeFilename, resolvedMimeType } = this.validateFile(
      options.filename,
      options.buffer,
      options.claimedMimeType,
    );

    const objectKey = this.buildObjectKey(
      options.entityType,
      options.entityId,
      safeFilename,
    );

    const result = await this.provider.upload(
      objectKey,
      options.buffer,
      resolvedMimeType,
    );

    return {
      objectKey: result.key,
      filename: safeFilename,
      mimeType: resolvedMimeType,
      size: result.size,
    };
  }

  /**
   * Delete file from storage.
   */
  async deleteFile(key: string): Promise<void> {
    if (!key) return;
    await this.provider.delete(key);
  }

  /**
   * Generate a short-lived authenticated signed URL.
   */
  async getSignedUrl(key: string, expiresInSeconds: number = 900): Promise<string> {
    return await this.provider.getSignedUrl(key, expiresInSeconds);
  }

  /**
   * Retrieve file buffer.
   */
  async getFileBuffer(key: string): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
    return await this.provider.getBuffer(key);
  }

  /**
   * Check if object exists.
   */
  async exists(key: string): Promise<boolean> {
    return await this.provider.exists(key);
  }

  /**
   * Distributed Consistency Orchestrator:
   * FILE STORAGE CONSISTENCY MODEL = BEST-EFFORT COMPENSATING ROLLBACK (NON-DISTRIBUTED ACID)
   *
   * 1. Runs uploadFn.
   * 2. Runs dbActionFn with uploaded object key.
   * 3. If dbActionFn fails -> Automatically compensates by deleting uploaded storage object.
   */
  async executeWithCompensatingCleanup<T>(
    uploadFn: () => Promise<{ objectKey: string; [k: string]: any }>,
    dbActionFn: (objectKey: string) => Promise<T>,
  ): Promise<T> {
    const uploadResult = await uploadFn();
    try {
      return await dbActionFn(uploadResult.objectKey);
    } catch (dbErr) {
      this.logger.warn(
        `[STORAGE COMPENSATION] DB transaction failed. Cleaning up orphan storage object: ${uploadResult.objectKey}`,
      );
      try {
        await this.deleteFile(uploadResult.objectKey);
      } catch (cleanupErr) {
        this.logger.error(
          `[STORAGE COMPENSATION ERROR] Failed to delete orphan object: ${uploadResult.objectKey}`,
          cleanupErr,
        );
      }
      throw dbErr;
    }
  }
}
