import {
  StorageService,
  type DownloadableFile,
  type FileWithMetadata,
  type PaginatedFileList,
  type UploadResult,
} from 'src/modules/storage/storage.service';
import { Readable } from 'stream';

type PublicApi<T> = Pick<T, keyof T>;

export class MockStorageService implements PublicApi<StorageService> {
  normalizeFileName(filename: string): string {
    return filename
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .toLowerCase();
  }

  async uploadFile(
    _tenantId: string,
    file: Buffer,
    _originalName: string,
    contentType: string,
    _userId: string,
  ): Promise<UploadResult> {
    await Promise.resolve();
    return {
      key: 'mock-key',
      bucket: 'mock-bucket',
      size: file.length,
      contentType,
      url: 'https://mock-s3/mock-key',
    };
  }

  async getFile(_fileKey: string): Promise<FileWithMetadata> {
    await Promise.resolve();
    return {
      stream: Readable.from(Buffer.from('mock')),
      metadata: null,
    };
  }

  async getFileForDownload(
    _tenantId: string,
    fileKey: string,
  ): Promise<DownloadableFile> {
    await Promise.resolve();
    const parts = fileKey.split('/');
    const filename = parts[parts.length - 1] ?? 'mock-file';
    return {
      stream: Readable.from(Buffer.from('mock')),
      filename,
      contentType: 'application/octet-stream',
    };
  }

  async deleteFile(_tenantId: string, _fileKey: string): Promise<void> {}

  async generateSignedUrl(
    _tenantId: string,
    _fileKey: string,
    _expiresIn?: number,
  ): Promise<string> {
    await Promise.resolve();
    return 'https://mock-s3/signed/mock-key';
  }

  async listFiles(
    _tenantId: string,
    _prefix?: string,
    _limit?: number,
    _continuationToken?: string,
  ): Promise<PaginatedFileList> {
    await Promise.resolve();
    return { files: [], hasMore: false };
  }

  async initializeTenantFilesBucket(): Promise<void> {}

  async initializeTemplatesBucket(): Promise<void> {}

  async uploadTemplateFile(
    _templateId: string,
    _version: string,
    file: Buffer,
    _originalName: string,
    contentType: string,
    _userId: string,
  ): Promise<UploadResult> {
    await Promise.resolve();
    return {
      key: 'mock-template-key',
      bucket: 'mock-templates-bucket',
      size: file.length,
      contentType,
      url: 'https://mock-s3/mock-template-key',
    };
  }

  async getTemplateFile(
    _templateId: string,
    _version: string,
  ): Promise<Readable> {
    await Promise.resolve();
    return Readable.from(Buffer.from('mock'));
  }

  async generateTemplateSignedUrl(
    _fileKey: string,
    _expiresIn?: number,
  ): Promise<string> {
    await Promise.resolve();
    return 'https://mock-s3/signed/mock-template-key';
  }

  async deleteTemplateFile(_fileKey: string): Promise<void> {}

  async listTemplateFiles(
    _prefix?: string,
    _limit?: number,
    _continuationToken?: string,
  ): Promise<PaginatedFileList> {
    await Promise.resolve();
    return { files: [], hasMore: false };
  }

  async generatePresignedPutUrl(
    _s3Key: string,
    _contentType: string,
    _expiresIn?: number,
  ): Promise<string> {
    await Promise.resolve();
    return 'https://mock-s3/presigned-put/mock-key';
  }

  async getQuarantineObjectMetadata(_s3Key: string): Promise<{
    contentLength: number;
    contentType: string | undefined;
  } | null> {
    await Promise.resolve();
    return { contentLength: 2048576, contentType: 'application/pdf' };
  }

  async deleteObjectFromBucket(_bucket: string, _key: string): Promise<void> {}

  async initializeQuarantineBucket(): Promise<void> {}

  get quarantineBucketName(): string {
    return 'mock-quarantine-bucket';
  }
}
