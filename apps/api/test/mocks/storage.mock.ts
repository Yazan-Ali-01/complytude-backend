import { Readable } from 'stream';
import type {
  DownloadableFile,
  FileWithMetadata,
  PaginatedFileList,
  UploadResult,
} from 'src/modules/storage/storage.service';

/**
 * Mock StorageService for integration tests — no S3, returns sensible defaults.
 */
export class MockStorageService {
  normalizeFileName(filename: string): string {
    return filename.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
  }

  async uploadFile(
    _tenantId: string,
    file: Buffer,
    _originalName: string,
    contentType: string,
    _userId: string,
  ): Promise<UploadResult> {
    return {
      key: 'mock-key',
      bucket: 'mock-bucket',
      size: file.length,
      contentType,
      url: 'https://mock-s3/mock-key',
    };
  }

  async getFile(_fileKey: string): Promise<FileWithMetadata> {
    return {
      stream: Readable.from(Buffer.from('mock')),
      metadata: null,
    };
  }

  async getFileForDownload(
    _tenantId: string,
    fileKey: string,
  ): Promise<DownloadableFile> {
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
    return 'https://mock-s3/signed/mock-key';
  }

  async listFiles(
    _tenantId: string,
    _prefix?: string,
    _limit?: number,
    _continuationToken?: string,
  ): Promise<PaginatedFileList> {
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
    return {
      key: 'mock-template-key',
      bucket: 'mock-templates-bucket',
      size: file.length,
      contentType,
      url: 'https://mock-s3/mock-template-key',
    };
  }

  async getTemplateFile(_templateId: string, _version: string): Promise<Readable> {
    return Readable.from(Buffer.from('mock'));
  }

  async generateTemplateSignedUrl(
    _fileKey: string,
    _expiresIn?: number,
  ): Promise<string> {
    return 'https://mock-s3/signed/mock-template-key';
  }

  async deleteTemplateFile(_fileKey: string): Promise<void> {}

  async listTemplateFiles(
    _prefix?: string,
    _limit?: number,
    _continuationToken?: string,
  ): Promise<PaginatedFileList> {
    return { files: [], hasMore: false };
  }
}
