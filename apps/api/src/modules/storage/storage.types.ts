export type StorageEntityType =
  | 'payments'
  | 'project-acceptances'
  | 'service-period-acceptances'
  | 'projects'
  | 'orders';

export interface UploadFileOptions {
  entityType: StorageEntityType;
  entityId: string | number;
  filename: string;
  buffer: Buffer;
  claimedMimeType?: string;
}

export interface UploadResult {
  objectKey: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface StoredFile {
  objectKey: string;
  buffer: Buffer;
  mimeType: string;
  size: number;
}

export const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'] as const;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export interface StorageProvider {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<{ key: string; size: number }>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  getBuffer(key: string): Promise<{ buffer: Buffer; mimeType: string; size: number }>;
  exists(key: string): Promise<boolean>;
}
