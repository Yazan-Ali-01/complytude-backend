import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { Readable } from 'stream';
import { StorageI18n } from './constants/i18n.constants';
const PAGINATION_DEFAULTS = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 1000,
} as const;

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

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly signedUrlExpiresIn: number;
  private readonly templatesBucket: string;
  private readonly tenantFilesBucket: string;
  private readonly quarantineBucket: string;
  private quarantineBucketInitialized = false;

  /**
   * AWS S3 metadata key constants
   * NOTE: S3 automatically converts all custom metadata keys to lowercase.
   * These lowercase keys must be used when retrieving metadata from S3.
   */
  private static readonly S3_METADATA_KEYS = {
    USER_ID: 'userid',
    ORIGINAL_NAME: 'originalname',
    TENANT_ID: 'tenantid',
    UPLOADED_AT: 'uploadedat',
  } as const;

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
    const s3Config = this.configService.get('storage.s3');
    this.templatesBucket =
      this.configService.get('storage.templates.bucketName') ||
      'complytude-templates';
    this.tenantFilesBucket =
      this.configService.get('storage.bucket.filesBucketName') ||
      'complytude-files';
    this.quarantineBucket =
      this.configService.get('storage.quarantine.bucketName') ||
      'complytude-quarantine';
    this.signedUrlExpiresIn =
      this.configService.get('storage.signedUrl.expiresIn') || 900;

    const explicitCreds =
      s3Config.accessKeyId?.trim() && s3Config.secretAccessKey?.trim()
        ? {
            accessKeyId: s3Config.accessKeyId,
            secretAccessKey: s3Config.secretAccessKey,
          }
        : undefined;

    this.s3Client = new S3Client({
      ...(s3Config.endpoint ? { endpoint: s3Config.endpoint } : {}),
      region: s3Config.region,
      ...(explicitCreds ? { credentials: explicitCreds } : {}),
      forcePathStyle: s3Config.forcePathStyle,
    });

    this.logger.log(
      `Storage service initialized with endpoint: ${s3Config.endpoint || '(default AWS)'}`,
    );
  }

  // Get tenant Prefix
  private getTenantPrefix(tenantId: string): string {
    const cleanId = tenantId.startsWith('tenant_')
      ? tenantId.substring(7)
      : tenantId;
    return `tenants/${cleanId}`;
  }

  /**
   * Validate tenant ownership of a file
   * This is a critical security control and must NEVER be bypassed
   *
   * @throws BadRequestException if tenantId is missing or empty
   * @throws NotFoundException if file is outside tenant's scope
   */
  private validateTenantOwnership(tenantId: string, fileKey: string): void {
    // Tenant ID is mandatory for all tenant-scoped operations
    if (!tenantId || tenantId.trim() === '') {
      this.logger.error(
        `Tenant validation failed: tenantId is required but was ${tenantId === null ? 'null' : tenantId === undefined ? 'undefined' : 'empty'}`,
      );
      throw new BadRequestException(
        'Tenant ID is required for file operations',
      );
    }

    const expectedPrefix = this.getTenantPrefix(tenantId);

    if (!fileKey.startsWith(expectedPrefix + '/')) {
      this.logger.warn(
        `Tenant ${tenantId} attempted to access file outside their scope: ${fileKey}`,
      );
      throw new NotFoundException(
        this.i18n.t(StorageI18n.errors.FILE_NOT_FOUND),
      );
    }
  }

  /**
   * Check if an error represents a "not found" condition
   * Handles both file not found and bucket not found errors
   */
  private isNotFoundError(error: unknown): boolean {
    const err = error as Record<string, unknown> & {
      name?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number };
      message?: string;
    };
    return (
      err.name === 'NoSuchKey' ||
      err.name === 'NotFound' ||
      err.name === 'NoSuchBucket' ||
      err.Code === 'NoSuchBucket' ||
      err.$metadata?.httpStatusCode === 404 ||
      (typeof err.message === 'string' && err.message.includes('bucket')) ||
      (typeof err.message === 'string' &&
        err.message.includes('does not exist'))
    );
  }

  /**
   * Map S3 GetObjectCommand response metadata to FileMetadata
   * AWS S3 automatically lowercases all custom metadata keys
   */
  private mapS3MetadataToFileMetadata(
    response: GetObjectCommandOutput,
  ): FileMetadata | null {
    if (!response.Metadata) {
      return null;
    }

    const { S3_METADATA_KEYS } = StorageService;

    return {
      userId: response.Metadata[S3_METADATA_KEYS.USER_ID] || '',
      originalName: response.Metadata[S3_METADATA_KEYS.ORIGINAL_NAME] || '',
      tenantId: response.Metadata[S3_METADATA_KEYS.TENANT_ID] || '',
      uploadedAt: response.Metadata[S3_METADATA_KEYS.UPLOADED_AT] || '',
      contentType: response.ContentType || '',
    };
  }

  /**
   * Normalize filename by replacing spaces and special characters
   */
  normalizeFileName(filename: string): string {
    // Replace spaces with hyphens
    let normalized = filename.replace(/\s+/g, '-');

    // Remove special characters except dots, hyphens, and underscores
    normalized = normalized.replace(/[^a-zA-Z0-9._-]/g, '');

    // Remove multiple consecutive hyphens
    normalized = normalized.replace(/-+/g, '-');

    // Remove leading/trailing hyphens
    normalized = normalized.replace(/^-+|-+$/g, '');

    return normalized.toLowerCase();
  }

  /**
   * Upload a file to tenant's bucket
   */
  async uploadFile(
    tenantId: string,
    file: Buffer,
    originalName: string,
    contentType: string,
    userId: string,
  ): Promise<UploadResult> {
    await this.initializeTenantFilesBucket();

    const bucket = this.tenantFilesBucket;
    const tenantPrefix = this.getTenantPrefix(tenantId);
    const normalizedName = this.normalizeFileName(originalName);
    const timestamp = Date.now();
    const key = `${tenantPrefix}/${timestamp}-${normalizedName}`;
    const metadata: FileMetadata = {
      userId,
      originalName,
      tenantId,
      uploadedAt: new Date().toISOString(),
      contentType,
    };

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: file,
          ContentType: contentType,
          // NOTE: AWS S3 automatically converts these keys to lowercase
          // See S3_METADATA_KEYS constant for lowercase versions used in retrieval
          Metadata: {
            userId: metadata.userId,
            originalName: metadata.originalName,
            tenantId: metadata.tenantId,
            uploadedAt: metadata.uploadedAt,
          },
        }),
      );

      this.logger.log(
        `File uploaded successfully: ${key} to bucket ${bucket} by user ${userId}`,
      );

      // Generate a signed URL for immediate access
      const url = await this.generateSignedUrl(tenantId, key);

      return {
        key,
        bucket,
        size: file.length,
        contentType,
        url,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(StorageI18n.errors.FILE_UPLOAD_FAILED),
      );
    }
  }

  /**
   * Get file stream and metadata from tenant's bucket
   * Returns both in a single S3 request (no race condition)
   */
  async getFile(fileKey: string): Promise<FileWithMetadata> {
    const bucket = this.tenantFilesBucket;

    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: fileKey,
        }),
      );

      if (!response.Body) {
        throw new NotFoundException(
          this.i18n.t(StorageI18n.errors.FILE_NOT_FOUND),
        );
      }

      const metadata = this.mapS3MetadataToFileMetadata(response);

      return {
        stream: response.Body as Readable,
        metadata,
      };
    } catch (error) {
      if (this.isNotFoundError(error)) {
        throw new NotFoundException(
          this.i18n.t(StorageI18n.errors.FILE_NOT_FOUND),
        );
      }

      this.logger.error(`Failed to get file: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(StorageI18n.errors.FILE_DOWNLOAD_FAILED),
      );
    }
  }

  /**
   * Get file ready for download with extracted filename and content type
   * Handles filename extraction from metadata or fileKey
   * Validates tenant ownership before allowing download
   */
  async getFileForDownload(
    tenantId: string,
    fileKey: string,
  ): Promise<DownloadableFile> {
    // SECURITY: Always validate tenant ownership - no exceptions
    this.validateTenantOwnership(tenantId, fileKey);

    const { stream, metadata } = await this.getFile(fileKey);

    this.logger.debug(`getFileForDownload - fileKey: ${fileKey}`);
    this.logger.debug(
      `getFileForDownload - metadata: ${JSON.stringify(metadata)}`,
    );

    // Extract filename from metadata or fallback to fileKey
    // FileKey format: tenants/{tenantId}/{timestamp}-{filename}
    let filename = metadata?.originalName;

    // If no metadata or empty originalName, extract filename from the fileKey
    if (!filename) {
      this.logger.debug(
        `No originalName in metadata, extracting from fileKey: ${fileKey}`,
      );
      const parts = fileKey.split('/');
      const lastPart = parts[parts.length - 1];
      const timestampMatch = lastPart.match(/^\d+-(.+)$/);
      filename = timestampMatch ? timestampMatch[1] : lastPart;
      this.logger.debug(`Extracted filename: ${filename}`);
    }

    const contentType = metadata?.contentType || 'application/octet-stream';

    return {
      stream,
      filename,
      contentType,
    };
  }

  /**
   * Delete a file from tenant's bucket
   * Validates tenant ownership before deletion
   */
  async deleteFile(tenantId: string, fileKey: string): Promise<void> {
    // SECURITY: Always validate tenant ownership - no exceptions
    this.validateTenantOwnership(tenantId, fileKey);

    const bucket = this.tenantFilesBucket;

    try {
      // First check if the file exists to provide better error messages
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: fileKey,
        }),
      );

      // If we get here, the file exists, so delete it
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: fileKey,
        }),
      );

      this.logger.log(`File deleted: ${fileKey} from bucket ${bucket}`);
    } catch (error) {
      // Handle file not found (404)
      if (
        error.name === 'NoSuchKey' ||
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        throw new NotFoundException(
          this.i18n.t(StorageI18n.errors.FILE_NOT_FOUND),
        );
      }

      // Handle bucket not found (404) - occurs when accessing another tenant's files
      if (
        error.name === 'NoSuchBucket' ||
        error.Code === 'NoSuchBucket' ||
        error.message?.includes('bucket') ||
        error.message?.includes('does not exist')
      ) {
        throw new NotFoundException(
          this.i18n.t(StorageI18n.errors.FILE_NOT_FOUND),
        );
      }

      this.logger.error(`Failed to delete file: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(StorageI18n.errors.FILE_DELETE_FAILED),
      );
    }
  }

  /**
   * Generate a signed URL for downloading a file
   * Validates tenant ownership before generating URL
   */
  async generateSignedUrl(
    tenantId: string,
    fileKey: string,
    expiresIn?: number,
  ): Promise<string> {
    // SECURITY: Always validate tenant ownership - no exceptions
    this.validateTenantOwnership(tenantId, fileKey);

    const bucket = this.tenantFilesBucket;
    const expires = expiresIn || this.signedUrlExpiresIn;

    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: fileKey,
      });

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: expires,
      });

      return url;
    } catch (error) {
      this.logger.error(`Failed to generate signed URL: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(StorageI18n.errors.TEMPORARY_URL_GENERATION_FAILED),
      );
    }
  }

  async initializeQuarantineBucket(): Promise<void> {
    if (this.quarantineBucketInitialized) return;

    const exists = await this.bucketExists(this.quarantineBucket);
    if (!exists) {
      await this.createBucket(this.quarantineBucket);
      this.logger.log(`Created bucket ${this.quarantineBucket}`);
    }

    this.quarantineBucketInitialized = true;
  }

  /**
   * Generate a presigned PUT URL for direct client-to-S3 upload into the quarantine bucket.
   *
   * NOTE: Presigned PUT URLs (unlike S3 POST Policy) cannot enforce a content-length
   * range server-side. File size validation must be enforced at the API layer before
   * issuing this URL.
   */
  async generatePresignedPutUrl(
    s3Key: string,
    contentType: string,
    expiresIn?: number,
  ): Promise<string> {
    await this.initializeQuarantineBucket();
    const expires = expiresIn ?? this.signedUrlExpiresIn;

    try {
      const command = new PutObjectCommand({
        Bucket: this.quarantineBucket,
        Key: s3Key,
        ContentType: contentType,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn: expires });
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned PUT URL: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        this.i18n.t(StorageI18n.errors.TEMPORARY_URL_GENERATION_FAILED),
      );
    }
  }

  /**
   * Check whether an object exists in the quarantine bucket and return its metadata.
   * Returns null if the object does not exist (HeadObject 404).
   */
  async getQuarantineObjectMetadata(s3Key: string): Promise<{
    contentLength: number;
    contentType: string | undefined;
  } | null> {
    try {
      const response = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.quarantineBucket,
          Key: s3Key,
        }),
      );
      return {
        contentLength: response.ContentLength ?? 0,
        contentType: response.ContentType,
      };
    } catch (error) {
      if (
        error.name === 'NoSuchKey' ||
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      this.logger.error(
        `HeadObject failed for quarantine key "${s3Key}": ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        this.i18n.t(StorageI18n.errors.QUARANTINE_OBJECT_CHECK_FAILED),
      );
    }
  }

  get quarantineBucketName(): string {
    return this.quarantineBucket;
  }

  /**
   * Delete an S3 object from any known bucket.
   * Intended for cleanup when a document record is deleted.
   * Caller is responsible for authorization (DB-level RLS).
   * Silently ignores objects that don't exist (already cleaned up).
   */
  async deleteObjectFromBucket(bucket: string, key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      );
      this.logger.log(`S3 object deleted: bucket=${bucket} key=${key}`);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        this.logger.debug(
          `S3 object already gone: bucket=${bucket} key=${key}`,
        );
        return;
      }
      this.logger.error(
        `Failed to delete S3 object: bucket=${bucket} key=${key} error=${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * List files in tenant's bucket with pagination support
   * @param tenantId - Tenant identifier
   * @param prefix - Optional prefix to filter files
   * @param limit - Maximum number of files to return (default: 50, max: 1000)
   * @param continuationToken - Token from previous response for pagination
   * @returns Paginated list of files. Use /signed-url/:fileKey for individual file access URLs
   */
  async listFiles(
    tenantId: string,
    prefix?: string,
    limit: number = PAGINATION_DEFAULTS.DEFAULT_LIMIT,
    continuationToken?: string,
  ): Promise<PaginatedFileList> {
    const bucket = this.tenantFilesBucket;
    const tenantPrefix = this.getTenantPrefix(tenantId);
    const sanitizedPrefix = prefix
      ? prefix.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/')
      : '';
    const fullPrefix = sanitizedPrefix
      ? `${tenantPrefix.replace(/\/+$/, '')}/${sanitizedPrefix}`
      : tenantPrefix;

    try {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: fullPrefix,
          MaxKeys: Math.min(limit, PAGINATION_DEFAULTS.MAX_LIMIT),
          ContinuationToken: continuationToken,
        }),
      );

      const files = this.mapFilesWithoutUrls(response);

      return this.buildPaginatedResponse(response, files);
    } catch (error) {
      // Handle bucket doesn't exist cases
      if (
        error.name === 'NoSuchBucket' ||
        error.$metadata?.httpStatusCode === 404 ||
        error.Code === 'NoSuchBucket' ||
        error.message?.includes('bucket') ||
        error.message?.includes('not valid')
      ) {
        this.logger.log(
          `Bucket ${bucket} does not exist yet, returning empty list`,
        );
        return this.emptyPaginatedResponse();
      }

      this.logger.error(`Failed to list files: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(StorageI18n.errors.STORAGE_ACCESS_FAILED),
      );
    }
  }

  /**
   * Map S3 objects to file list without generating URLs (fast)
   */
  private mapFilesWithoutUrls(
    response: ListObjectsV2CommandOutput,
  ): FileListItem[] {
    if (!response.Contents?.length) {
      return [];
    }

    return response.Contents.filter((item) => item.Key).map((item) => ({
      key: item.Key!,
      size: item.Size || 0,
      lastModified: item.LastModified,
      url: undefined,
    }));
  }

  /**
   * Build paginated response object
   */
  private buildPaginatedResponse(
    response: ListObjectsV2CommandOutput,
    files: FileListItem[],
  ): PaginatedFileList {
    return {
      files,
      nextToken: response.NextContinuationToken,
      hasMore: response.IsTruncated || false,
    };
  }

  /**
   * Return empty paginated response
   */
  private emptyPaginatedResponse(): PaginatedFileList {
    return {
      files: [],
      hasMore: false,
    };
  }

  async initializeTenantFilesBucket(): Promise<void> {
    const bucketExists = await this.bucketExists(this.tenantFilesBucket);

    if (bucketExists) {
      this.logger.debug(`Bucket ${this.tenantFilesBucket} already exists`);
      return;
    }

    await this.createBucket(this.tenantFilesBucket);
    this.logger.log(`Created bucket ${this.tenantFilesBucket}`);
  }

  private formatS3ClientError(error: unknown): string {
    if (error == null) return 'unknown';
    if (typeof error === 'string') return error;
    if (typeof error === 'number' || typeof error === 'boolean') {
      return String(error);
    }
    if (typeof error !== 'object') {
      return `[${typeof error}]`;
    }
    const e = error as {
      name?: string;
      message?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number; requestId?: string };
      cause?: unknown;
    };
    const parts: string[] = [];
    if (e.name) parts.push(`name=${e.name}`);
    if (e.message) parts.push(e.message);
    if (e.Code) parts.push(`Code=${e.Code}`);
    const meta = e.$metadata;
    if (meta?.httpStatusCode != null) parts.push(`http=${meta.httpStatusCode}`);
    if (meta?.requestId) parts.push(`requestId=${meta.requestId}`);
    const c = e.cause;
    if (c instanceof Error) {
      parts.push(`cause=${c.message}`);
      const code = (c as NodeJS.ErrnoException).code;
      if (code) parts.push(`errno=${code}`);
    }
    return parts.length > 0 ? parts.join(' | ') : JSON.stringify(error);
  }

  private async bucketExists(bucket: string): Promise<boolean> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch (error: unknown) {
      const err = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
        Code?: string;
        cause?: unknown;
      };
      if (
        err.name === 'NotFound' ||
        err.$metadata?.httpStatusCode === 404 ||
        err.name === 'NoSuchBucket' ||
        err.Code === 'NoSuchBucket'
      ) {
        return false;
      }
      const detail = this.formatS3ClientError(error);
      this.logger.error(`HeadBucket failed for "${bucket}": ${detail}`);
      const errno =
        err.cause && typeof err.cause === 'object' && 'code' in err.cause
          ? String((err.cause as { code: unknown }).code)
          : '';
      if (errno === 'ECONNREFUSED' || detail.includes('ECONNREFUSED')) {
        throw new InternalServerErrorException(
          `S3/MinIO unreachable (connection refused). Is MinIO running and S3_ENDPOINT correct? (${detail})`,
        );
      }
      if (errno === 'ENOTFOUND' || detail.includes('ENOTFOUND')) {
        throw new InternalServerErrorException(
          `S3 host not found — check S3_ENDPOINT. (${detail})`,
        );
      }
      throw new InternalServerErrorException(
        `Failed to check bucket: ${detail}`,
      );
    }
  }

  private async createBucket(bucket: string): Promise<void> {
    try {
      await this.s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to create bucket: ${error.message}`,
      );
    }
  }

  // ============================================================================
  // TEMPLATES BUCKET METHODS
  // ============================================================================

  /**
   * Initialize global templates bucket
   */
  async initializeTemplatesBucket(): Promise<void> {
    try {
      // Check if bucket exists
      await this.s3Client.send(
        new HeadBucketCommand({ Bucket: this.templatesBucket }),
      );
      this.logger.log(
        `Templates bucket ${this.templatesBucket} already exists`,
      );
    } catch (error) {
      // Bucket doesn't exist, create it
      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        try {
          await this.s3Client.send(
            new CreateBucketCommand({ Bucket: this.templatesBucket }),
          );
          this.logger.log(`Created templates bucket ${this.templatesBucket}`);
        } catch (createError) {
          this.logger.error(
            `Failed to create templates bucket ${this.templatesBucket}: ${createError.message}`,
          );
          throw new InternalServerErrorException(
            'Failed to initialize templates storage',
          );
        }
      } else {
        this.logger.error(
          `Error checking templates bucket ${this.templatesBucket}: ${error.message}`,
        );
        throw new InternalServerErrorException(
          'Failed to access templates storage',
        );
      }
    }
  }

  /**
   * Upload a template file to the templates bucket
   */
  async uploadTemplateFile(
    templateId: string,
    version: string,
    file: Buffer,
    originalName: string,
    contentType: string,
    userId: string,
  ): Promise<UploadResult> {
    await this.initializeTemplatesBucket();

    const key = `templates/${templateId}/${version}/template.docx`;

    const metadata: FileMetadata = {
      userId,
      originalName,
      tenantId: 'system',
      uploadedAt: new Date().toISOString(),
      contentType,
    };

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.templatesBucket,
          Key: key,
          Body: file,
          ContentType: contentType,
          // NOTE: AWS S3 automatically converts these keys to lowercase
          // See S3_METADATA_KEYS constant for lowercase versions used in retrieval
          Metadata: {
            userId: metadata.userId,
            originalName: metadata.originalName,
            uploadedAt: metadata.uploadedAt,
            templateId: templateId,
            version: version,
          },
        }),
      );

      this.logger.log(
        `Template file uploaded successfully: ${key} to bucket ${this.templatesBucket} by user ${userId}`,
      );

      // Generate a signed URL for immediate access
      const url = await this.generateTemplateSignedUrl(key);

      return {
        key,
        bucket: this.templatesBucket,
        size: file.length,
        contentType,
        url,
      };
    } catch (error) {
      this.logger.error(`Failed to upload template file: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(StorageI18n.errors.FILE_UPLOAD_FAILED),
      );
    }
  }

  /**
   * Get template file from templates bucket
   */
  async getTemplateFile(
    templateId: string,
    version: string,
  ): Promise<Readable> {
    const fileKey = `templates/${templateId}/${version}/template.docx`;
    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.templatesBucket,
          Key: fileKey,
        }),
      );

      if (!response.Body) {
        throw new NotFoundException(
          this.i18n.t(StorageI18n.errors.FILE_NOT_FOUND),
        );
      }

      return response.Body as Readable;
    } catch (error) {
      if (
        error.name === 'NoSuchKey' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        throw new NotFoundException(
          this.i18n.t(StorageI18n.errors.FILE_NOT_FOUND),
        );
      }

      this.logger.error(`Failed to get template file: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(StorageI18n.errors.FILE_DOWNLOAD_FAILED),
      );
    }
  }

  /**
   * Generate a signed URL for a template file
   */
  async generateTemplateSignedUrl(
    fileKey: string,
    expiresIn?: number,
  ): Promise<string> {
    const expires = expiresIn || this.signedUrlExpiresIn;

    try {
      const command = new GetObjectCommand({
        Bucket: this.templatesBucket,
        Key: fileKey,
      });

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: expires,
      });

      return url;
    } catch (error) {
      this.logger.error(
        `Failed to generate template signed URL: ${error.message}`,
      );
      throw new InternalServerErrorException(
        this.i18n.t(StorageI18n.errors.TEMPORARY_URL_GENERATION_FAILED),
      );
    }
  }

  /**
   * Delete a template file from templates bucket
   */
  async deleteTemplateFile(fileKey: string): Promise<void> {
    try {
      // First check if the file exists to provide better error messages
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.templatesBucket,
          Key: fileKey,
        }),
      );

      // If we get here, the file exists, so delete it
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.templatesBucket,
          Key: fileKey,
        }),
      );

      this.logger.log(
        `Template file deleted: ${fileKey} from bucket ${this.templatesBucket}`,
      );
    } catch (error) {
      // Handle file not found (404)
      if (
        error.name === 'NoSuchKey' ||
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        throw new NotFoundException(
          this.i18n.t(StorageI18n.errors.FILE_NOT_FOUND),
        );
      }

      // Handle bucket not found (404)
      if (
        error.name === 'NoSuchBucket' ||
        error.Code === 'NoSuchBucket' ||
        error.message?.includes('bucket') ||
        error.message?.includes('does not exist')
      ) {
        throw new NotFoundException(
          this.i18n.t(StorageI18n.errors.FILE_NOT_FOUND),
        );
      }

      this.logger.error(`Failed to delete template file: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(StorageI18n.errors.FILE_DELETE_FAILED),
      );
    }
  }

  /**
   * List template files with pagination support
   * @param prefix - Optional prefix to filter template files
   * @param limit - Maximum number of files to return (default: 50, max: 1000)
   * @param continuationToken - Token from previous response for pagination
   * @returns Paginated list of template files without signed URLs
   */
  async listTemplateFiles(
    prefix?: string,
    limit: number = PAGINATION_DEFAULTS.DEFAULT_LIMIT,
    continuationToken?: string,
  ): Promise<PaginatedFileList> {
    try {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.templatesBucket,
          Prefix: prefix,
          MaxKeys: Math.min(limit, PAGINATION_DEFAULTS.MAX_LIMIT),
          ContinuationToken: continuationToken,
        }),
      );

      const files = this.mapFilesWithoutUrls(response);

      return this.buildPaginatedResponse(response, files);
    } catch (error) {
      // Handle bucket doesn't exist cases
      if (
        error.name === 'NoSuchBucket' ||
        error.$metadata?.httpStatusCode === 404 ||
        error.Code === 'NoSuchBucket'
      ) {
        this.logger.log(
          `Templates bucket ${this.templatesBucket} does not exist yet, returning empty list`,
        );
        return this.emptyPaginatedResponse();
      }

      this.logger.error(`Failed to list template files: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(StorageI18n.errors.STORAGE_ACCESS_FAILED),
      );
    }
  }
}
