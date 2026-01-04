import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
  CreateBucketCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

export interface FileMetadata {
  userId: string;
  originalName: string;
  workspaceId: string;
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
  lastModified: Date;
  url: string;
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
  private readonly workspaceFilesBucket: string;

  /**
   * AWS S3 metadata key constants
   * NOTE: S3 automatically converts all custom metadata keys to lowercase.
   * These lowercase keys must be used when retrieving metadata from S3.
   */
  private static readonly S3_METADATA_KEYS = {
    USER_ID: 'userid',
    ORIGINAL_NAME: 'originalname',
    TENANT_ID: 'workspaceid',
    UPLOADED_AT: 'uploadedat',
  } as const;

  constructor(private readonly configService: ConfigService) {
    const s3Config = this.configService.get('storage.s3');
    this.templatesBucket =
      this.configService.get('storage.templates.bucketName') ||
      'complytude-templates';
    this.workspaceFilesBucket =
      this.configService.get('storage.bucket.filesBucketName') ||
      'complytude-files';
    this.signedUrlExpiresIn =
      this.configService.get('storage.signedUrl.expiresIn') || 900;

    this.s3Client = new S3Client({
      endpoint: s3Config.endpoint,
      region: s3Config.region,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      },
      forcePathStyle: s3Config.forcePathStyle,
    });

    this.logger.log(
      `Storage service initialized with endpoint: ${s3Config.endpoint}`,
    );
  }

  // Get workspace Prefix
  private getWorkspacePrefix(workspaceId: string): string {
    const cleanId = workspaceId.startsWith('workspace_')
      ? workspaceId.substring(7)
      : workspaceId;
    return `workspaces/${cleanId}`;
  }

  /**
   * Validate workspace ownership of a file
   * This is a critical security control and must NEVER be bypassed
   *
   * @throws BadRequestException if workspaceId is missing or empty
   * @throws NotFoundException if file is outside workspace's scope
   */
  private validateWorkspaceOwnership(
    workspaceId: string,
    fileKey: string,
  ): void {
    // Workspace ID is mandatory for all workspace-scoped operations
    if (!workspaceId || workspaceId.trim() === '') {
      this.logger.error(
        `Workspace validation failed: workspaceId is required but was ${workspaceId === null ? 'null' : workspaceId === undefined ? 'undefined' : 'empty'}`,
      );
      throw new BadRequestException(
        'Workspace ID is required for file operations',
      );
    }

    const expectedPrefix = this.getWorkspacePrefix(workspaceId);

    if (!fileKey.startsWith(expectedPrefix + '/')) {
      this.logger.warn(
        `Workspace ${workspaceId} attempted to access file outside their scope: ${fileKey}`,
      );
      throw new NotFoundException('File not found');
    }
  }

  /**
   * Check if an error represents a "not found" condition
   * Handles both file not found and bucket not found errors
   */
  private isNotFoundError(error: any): boolean {
    return (
      error.name === 'NoSuchKey' ||
      error.name === 'NotFound' ||
      error.name === 'NoSuchBucket' ||
      error.Code === 'NoSuchBucket' ||
      error.$metadata?.httpStatusCode === 404 ||
      error.message?.includes('bucket') ||
      error.message?.includes('does not exist')
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
      workspaceId: response.Metadata[S3_METADATA_KEYS.TENANT_ID] || '',
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
   * Upload a file to workspace's bucket
   */
  async uploadFile(
    workspaceId: string,
    file: Buffer,
    originalName: string,
    contentType: string,
    userId: string,
  ): Promise<UploadResult> {
    await this.initializeWorkspaceFilesBucket();

    const bucket = this.workspaceFilesBucket;
    const workspacePrefix = this.getWorkspacePrefix(workspaceId);
    const normalizedName = this.normalizeFileName(originalName);
    const timestamp = Date.now();
    const key = `${workspacePrefix}/${timestamp}-${normalizedName}`;
    const metadata: FileMetadata = {
      userId,
      originalName,
      workspaceId,
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
            workspaceId: metadata.workspaceId,
            uploadedAt: metadata.uploadedAt,
          },
        }),
      );

      this.logger.log(
        `File uploaded successfully: ${key} to bucket ${bucket} by user ${userId}`,
      );

      // Generate a signed URL for immediate access
      const url = await this.generateSignedUrl(workspaceId, key);

      return {
        key,
        bucket,
        size: file.length,
        contentType,
        url,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`);
      throw new InternalServerErrorException('Failed to upload file');
    }
  }

  /**
   * Get file stream and metadata from workspace's bucket
   * Returns both in a single S3 request (no race condition)
   */
  async getFile(fileKey: string): Promise<FileWithMetadata> {
    const bucket = this.workspaceFilesBucket;

    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: fileKey,
        }),
      );

      if (!response.Body) {
        throw new NotFoundException('File not found');
      }

      this.logger.debug(
        `Raw S3 metadata for ${fileKey}: ${JSON.stringify(response.Metadata)}`,
      );

      const metadata = this.mapS3MetadataToFileMetadata(response);

      return {
        stream: response.Body as Readable,
        metadata,
      };
    } catch (error) {
      if (this.isNotFoundError(error)) {
        throw new NotFoundException('File not found');
      }

      this.logger.error(`Failed to get file: ${error.message}`);
      throw new InternalServerErrorException('Failed to retrieve file');
    }
  }

  /**
   * Get file ready for download with extracted filename and content type
   * Handles filename extraction from metadata or fileKey
   * Validates workspace ownership before allowing download
   */
  async getFileForDownload(
    workspaceId: string,
    fileKey: string,
  ): Promise<DownloadableFile> {
    // SECURITY: Always validate workspace ownership - no exceptions
    this.validateWorkspaceOwnership(workspaceId, fileKey);

    const { stream, metadata } = await this.getFile(fileKey);

    this.logger.debug(`getFileForDownload - fileKey: ${fileKey}`);
    this.logger.debug(
      `getFileForDownload - metadata: ${JSON.stringify(metadata)}`,
    );

    // Extract filename from metadata or fallback to fileKey
    // FileKey format: workspaces/{workspaceId}/{timestamp}-{filename}
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
   * Delete a file from workspace's bucket
   * Validates workspace ownership before deletion
   */
  async deleteFile(workspaceId: string, fileKey: string): Promise<void> {
    // SECURITY: Always validate workspace ownership - no exceptions
    this.validateWorkspaceOwnership(workspaceId, fileKey);

    const bucket = this.workspaceFilesBucket;

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
        throw new NotFoundException('File not found');
      }

      // Handle bucket not found (404) - occurs when accessing another workspace's files
      if (
        error.name === 'NoSuchBucket' ||
        error.Code === 'NoSuchBucket' ||
        error.message?.includes('bucket') ||
        error.message?.includes('does not exist')
      ) {
        throw new NotFoundException('File not found');
      }

      this.logger.error(`Failed to delete file: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete file');
    }
  }

  /**
   * Generate a signed URL for downloading a file
   * Validates workspace ownership before generating URL
   */
  async generateSignedUrl(
    workspaceId: string,
    fileKey: string,
    expiresIn?: number,
  ): Promise<string> {
    // SECURITY: Always validate workspace ownership - no exceptions
    this.validateWorkspaceOwnership(workspaceId, fileKey);

    const bucket = this.workspaceFilesBucket;
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
      throw new InternalServerErrorException('Failed to generate download URL');
    }
  }

  /**
   * List files in workspace's bucket
   */
  async listFiles(
    workspaceId: string,
    prefix?: string,
  ): Promise<FileListItem[]> {
    const bucket = this.workspaceFilesBucket;
    const workspacePrefix = this.getWorkspacePrefix(workspaceId);
    // Sanitize prefix to remove leading slashes to avoid double slashes in path
    const sanitizedPrefix = prefix ? prefix.replace(/^\/+/, '') : '';
    const fullPrefix = sanitizedPrefix
      ? `${workspacePrefix}/${sanitizedPrefix}`
      : workspacePrefix;

    try {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: fullPrefix,
        }),
      );

      if (!response.Contents || response.Contents.length === 0) {
        return [];
      }

      const files: FileListItem[] = await Promise.all(
        response.Contents.filter((item) => item.Key).map(async (item) => {
          const url = await this.generateSignedUrl(workspaceId, item.Key!);
          return {
            key: item.Key!,
            size: item.Size || 0,
            lastModified: item.LastModified || new Date(),
            url,
          };
        }),
      );

      return files;
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
        return [];
      }

      this.logger.error(`Failed to list files: ${error.message}`);
      throw new InternalServerErrorException('Failed to list files');
    }
  }

  async initializeWorkspaceFilesBucket(): Promise<void> {
    const bucketExists = await this.bucketExists(this.workspaceFilesBucket);

    if (bucketExists) {
      this.logger.debug(`Bucket ${this.workspaceFilesBucket} already exists`);
      return;
    }

    await this.createBucket(this.workspaceFilesBucket);
    this.logger.log(`Created bucket ${this.workspaceFilesBucket}`);
  }

  private async bucketExists(bucket: string): Promise<boolean> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch (error) {
      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      throw new InternalServerErrorException(
        `Failed to check bucket: ${error.message}`,
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
      workspaceId: 'system',
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
      throw new InternalServerErrorException('Failed to upload template file');
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
        throw new NotFoundException('Template file not found');
      }

      return response.Body as Readable;
    } catch (error) {
      if (
        error.name === 'NoSuchKey' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        throw new NotFoundException('Template file not found');
      }

      this.logger.error(`Failed to get template file: ${error.message}`);
      throw new InternalServerErrorException(
        'Failed to retrieve template file',
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
        'Failed to generate template download URL',
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
        throw new NotFoundException('Template file not found');
      }

      // Handle bucket not found (404)
      if (
        error.name === 'NoSuchBucket' ||
        error.Code === 'NoSuchBucket' ||
        error.message?.includes('bucket') ||
        error.message?.includes('does not exist')
      ) {
        throw new NotFoundException('Template file not found');
      }

      this.logger.error(`Failed to delete template file: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete template file');
    }
  }

  /**
   * List all template files
   */
  async listTemplateFiles(prefix?: string): Promise<FileListItem[]> {
    try {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.templatesBucket,
          Prefix: prefix,
        }),
      );

      if (!response.Contents || response.Contents.length === 0) {
        return [];
      }

      const files: FileListItem[] = await Promise.all(
        response.Contents.filter((item) => item.Key).map(async (item) => {
          const url = await this.generateTemplateSignedUrl(item.Key!);
          return {
            key: item.Key!,
            size: item.Size || 0,
            lastModified: item.LastModified || new Date(),
            url,
          };
        }),
      );

      return files;
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
        return [];
      }

      this.logger.error(`Failed to list template files: ${error.message}`);
      throw new InternalServerErrorException('Failed to list template files');
    }
  }
}
