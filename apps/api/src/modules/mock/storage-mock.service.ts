import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { Readable } from 'stream';

// Re-export the same interfaces so imports stay identical
export interface FileMetadata {
  userId: string;
  originalName: string;
  tenantId: string;
  uploadedAt: string;
  contentType: string;
}

export interface UploadResult {
  key: string;
  bucket: string;
  size: number;
  contentType: string;
  url: string;
}

export interface FileListItem {
  key: string;
  size: number;
  lastModified?: Date;
  url?: string;
}

export interface PaginatedFileList {
  files: FileListItem[];
  nextToken?: string;
  hasMore: boolean;
}

export interface FileWithMetadata {
  stream: Readable;
  metadata: FileMetadata | null;
}

export interface DownloadableFile {
  stream: Readable;
  filename: string;
  contentType: string;
}

/**
 * Mock StorageService - Database-backed implementation for testing
 *
 * ✅ Same public interface as real StorageService
 * ✅ Uses mock_storage_uploads table from seed 004
 * ✅ No AWS SDK dependencies
 * ✅ Returns predictable mock URLs for testing
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  // Mock bucket names (for interface compatibility)
  private readonly tenantFilesBucket = 'mock-complytude-files';
  private readonly templatesBucket = 'mock-complytude-templates';

  constructor(private readonly databaseService: DatabaseService) {}

  // ============================================================================
  // TENANT FILE OPERATIONS
  // ============================================================================

  private getTenantPrefix(tenantId: string): string {
    const cleanId = tenantId.startsWith('tenant_')
      ? tenantId.substring(7)
      : tenantId;
    return `tenants/${cleanId}`;
  }

  private validateTenantOwnership(tenantId: string, fileKey: string): void {
    if (!tenantId || tenantId.trim() === '') {
      throw new BadRequestException(
        'Tenant ID is required for file operations',
      );
    }
    const expectedPrefix = this.getTenantPrefix(tenantId);
    if (!fileKey.startsWith(expectedPrefix + '/')) {
      throw new NotFoundException('File not found or access denied');
    }
  }

  normalizeFileName(filename: string): string {
    let normalized = filename.replace(/\s+/g, '-');
    normalized = normalized.replace(/[^a-zA-Z0-9._-]/g, '');
    normalized = normalized.replace(/-+/g, '-');
    normalized = normalized.replace(/^-+|-+$/g, '');
    return normalized.toLowerCase();
  }

  async uploadFile(
    tenantId: string,
    file: Buffer,
    originalName: string,
    contentType: string,
    userId: string,
  ): Promise<UploadResult> {
    if (!file || file.length === 0) {
      throw new BadRequestException('Mock: Empty file buffer');
    }

    const timestamp = Date.now();
    const normalizedName = this.normalizeFileName(originalName);
    const fileKey = `${this.getTenantPrefix(tenantId)}/${timestamp}-${normalizedName}`;
    const fileUrl = `https://mock-storage.test/${fileKey}`;

    // Store in mock_storage_uploads table (from seed 004)
    await this.databaseService.query(
      `
      INSERT INTO public.mock_storage_uploads (
        tenant_id, file_key, file_url, mimetype, original_name, size_bytes, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        tenantId,
        fileKey,
        fileUrl,
        contentType,
        originalName,
        file.length,
        userId,
      ],
    );

    this.logger.log(`[MOCK] Upload: ${fileKey} for tenant ${tenantId}`);

    return {
      key: fileKey,
      bucket: this.tenantFilesBucket,
      size: file.length,
      contentType,
      url: fileUrl,
    };
  }

  async getFile(fileKey: string): Promise<FileWithMetadata> {
    const parts = fileKey.split('/');
    if (parts.length < 3) {
      throw new NotFoundException('Mock: Invalid file key format');
    }
    const tenantId = parts[1];

    const result = await this.databaseService.query(
      `
      SELECT file_url, mimetype, original_name, size_bytes
      FROM public.mock_storage_uploads
      WHERE tenant_id = $1 AND file_key = $2
      `,
      [tenantId, fileKey],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Mock: File not found');
    }

    const row = result.rows[0];
    const mockBuffer = Buffer.from(`MOCK_FILE_CONTENT:${row.original_name}`);
    const stream = new Readable({
      read() {
        this.push(mockBuffer);
        this.push(null);
      },
    });

    const metadata: FileMetadata = {
      userId: 'mock-user',
      originalName: row.original_name,
      tenantId,
      uploadedAt: new Date().toISOString(),
      contentType: row.mimetype,
    };

    return { stream, metadata };
  }

  async getFileForDownload(
    tenantId: string,
    fileKey: string,
  ): Promise<DownloadableFile> {
    this.validateTenantOwnership(tenantId, fileKey);
    const { stream, metadata } = await this.getFile(fileKey);

    return {
      stream,
      filename: metadata?.originalName || fileKey.split('/').pop() || 'file',
      contentType: metadata?.contentType || 'application/octet-stream',
    };
  }

  async deleteFile(tenantId: string, fileKey: string): Promise<void> {
    this.validateTenantOwnership(tenantId, fileKey);

    const result = await this.databaseService.query(
      `
      DELETE FROM public.mock_storage_uploads
      WHERE tenant_id = $1 AND file_key = $2
      `,
      [tenantId, fileKey],
    );

    if (result.rowCount === 0) {
      this.logger.warn(
        `[MOCK] Delete: File not found ${fileKey} for tenant ${tenantId}`,
      );
      return; // Idempotent like S3
    }

    this.logger.log(`[MOCK] Delete: ${fileKey} for tenant ${tenantId}`);
  }

  async generateSignedUrl(
    tenantId: string,
    fileKey: string,
    expiresIn?: number,
  ): Promise<string> {
    this.validateTenantOwnership(tenantId, fileKey);
    return `https://mock-storage.test/signed/${fileKey}?expires=${expiresIn || 900}`;
  }

  async listFiles(
    tenantId: string,
    prefix?: string,
    limit: number = 50,
    continuationToken?: string,
  ): Promise<PaginatedFileList> {
    const tenantPrefix = this.getTenantPrefix(tenantId);
    const sanitizedPrefix = prefix
      ? prefix.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/')
      : '';
    const fullPrefix = sanitizedPrefix
      ? `${tenantPrefix.replace(/\/+$/, '')}/${sanitizedPrefix}`
      : tenantPrefix;

    const whereClause = prefix ? 'AND file_key LIKE $2' : '';
    const params = [tenantId];
    if (prefix) params.push(`%${fullPrefix}%`);

    const offset = continuationToken ? parseInt(continuationToken, 10) || 0 : 0;
    const sanitizedLimit = Math.min(limit, 1000);

    const result = await this.databaseService.query(
      `
      SELECT file_key, size_bytes, mimetype, original_name, created_at
      FROM public.mock_storage_uploads
      WHERE tenant_id = $1 ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, sanitizedLimit, offset],
    );

    const files: FileListItem[] = result.rows.map((row) => ({
      key: row.file_key,
      size: row.size_bytes,
      lastModified: row.created_at,
      url: undefined,
    }));

    const hasMore = result.rows.length === sanitizedLimit;
    const nextToken = hasMore ? String(offset + sanitizedLimit) : undefined;

    return { files, nextToken, hasMore };
  }

  // ============================================================================
  // TEMPLATE BUCKET OPERATIONS (Mocked)
  // ============================================================================

  async uploadTemplateFile(
    templateId: string,
    version: string,
    file: Buffer,
    originalName: string,
    contentType: string,
    userId: string,
  ): Promise<UploadResult> {
    const key = `templates/${templateId}/${version}/template.docx`;
    const url = `https://mock-storage.test/${key}`;

    await this.databaseService.query(
      `
      INSERT INTO public.mock_storage_uploads (
        tenant_id, file_key, file_url, mimetype, original_name, size_bytes, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      ['system', key, url, contentType, originalName, file.length, userId],
    );

    return {
      key,
      bucket: this.templatesBucket,
      size: file.length,
      contentType,
      url,
    };
  }

  async getTemplateFile(
    templateId: string,
    version: string,
  ): Promise<Readable> {
    const key = `templates/${templateId}/${version}/template.docx`;
    const result = await this.databaseService.query(
      'SELECT mimetype FROM public.mock_storage_uploads WHERE file_key = $1',
      [key],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Mock: Template not found');
    }

    const mockBuffer = Buffer.from(`MOCK_TEMPLATE:${templateId}:${version}`);
    return new Readable({
      read() {
        this.push(mockBuffer);
        this.push(null);
      },
    });
  }

  async generateTemplateSignedUrl(
    fileKey: string,
    expiresIn?: number,
  ): Promise<string> {
    return `https://mock-storage.test/signed/${fileKey}?expires=${expiresIn || 900}`;
  }

  async deleteTemplateFile(fileKey: string): Promise<void> {
    await this.databaseService.query(
      'DELETE FROM public.mock_storage_uploads WHERE file_key = $1',
      [fileKey],
    );
  }

  async listTemplateFiles(
    prefix?: string,
    limit: number = 50,
    continuationToken?: string,
  ): Promise<PaginatedFileList> {
    const whereClause = prefix ? 'AND file_key LIKE $1' : '';
    const params = prefix ? [`${prefix}%`] : [];
    const offset = continuationToken ? parseInt(continuationToken, 10) || 0 : 0;
    const sanitizedLimit = Math.min(limit, 1000);

    const result = await this.databaseService.query(
      `
      SELECT file_key, size_bytes, mimetype, created_at
      FROM public.mock_storage_uploads
      WHERE tenant_id = 'system' ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, sanitizedLimit, offset],
    );

    const files: FileListItem[] = result.rows.map((row) => ({
      key: row.file_key,
      size: row.size_bytes,
      lastModified: row.created_at,
      url: undefined,
    }));

    return {
      files,
      nextToken:
        result.rows.length === sanitizedLimit
          ? String(offset + sanitizedLimit)
          : undefined,
      hasMore: result.rows.length === sanitizedLimit,
    };
  }

  // ============================================================================
  // TEST UTILITIES
  // ============================================================================

  async getUploadsForTenant(tenantId: string): Promise<
    Array<{
      id: string;
      file_key: string;
      file_url: string;
      mimetype: string;
      original_name: string;
      size_bytes: number;
      created_at: Date;
    }>
  > {
    const result = await this.databaseService.query(
      `
      SELECT id, file_key, file_url, mimetype, original_name, size_bytes, created_at
      FROM public.mock_storage_uploads
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      `,
      [tenantId],
    );
    return result.rows;
  }

  async clearTenantUploads(tenantId: string): Promise<void> {
    await this.databaseService.query(
      'DELETE FROM public.mock_storage_uploads WHERE tenant_id = $1',
      [tenantId],
    );
  }

  async clearAll(): Promise<void> {
    await this.databaseService.query('DELETE FROM public.mock_storage_uploads');
  }
}
