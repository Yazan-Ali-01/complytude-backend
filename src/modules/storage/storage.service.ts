import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
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
  lastModified: Date;
  url: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketPrefix: string;
  private readonly signedUrlExpiresIn: number;

  private readonly templatesBucket: string;

  constructor(private readonly configService: ConfigService) {
    const s3Config = this.configService.get('storage.s3');
    this.bucketPrefix =
      this.configService.get('storage.bucket.prefix') || 'complytude';
    this.templatesBucket =
      this.configService.get('storage.templates.bucketName') ||
      'complytude-templates';
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

  /**
   * Get bucket name for a tenant
   */
  private getTenantBucket(tenantId: string): string {
    // Strip 'tenant_' prefix if present to avoid duplication in bucket name
    const cleanId = tenantId.startsWith('tenant_')
      ? tenantId.substring(7)
      : tenantId;
    return `${this.bucketPrefix}-tenant-${cleanId}`;
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
   * Initialize bucket for a tenant if it doesn't exist
   */
  async initializeTenantBucket(tenantId: string): Promise<void> {
    const bucket = this.getTenantBucket(tenantId);

    try {
      // Check if bucket exists
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      this.logger.log(`Bucket ${bucket} already exists`);
    } catch (error) {
      // Bucket doesn't exist, create it
      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        try {
          await this.s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
          this.logger.log(`Created bucket ${bucket} for tenant ${tenantId}`);
        } catch (createError) {
          this.logger.error(
            `Failed to create bucket ${bucket}: ${createError.message}`,
          );
          throw new InternalServerErrorException(
            'Failed to initialize storage for tenant',
          );
        }
      } else {
        this.logger.error(`Error checking bucket ${bucket}: ${error.message}`);
        throw new InternalServerErrorException('Failed to access storage');
      }
    }
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
    await this.initializeTenantBucket(tenantId);

    const bucket = this.getTenantBucket(tenantId);
    const normalizedName = this.normalizeFileName(originalName);
    const timestamp = Date.now();
    const key = `${timestamp}-${normalizedName}`;

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
      throw new InternalServerErrorException('Failed to upload file');
    }
  }

  /**
   * Get file stream from tenant's bucket
   */
  async getFile(tenantId: string, fileKey: string): Promise<Readable> {
    const bucket = this.getTenantBucket(tenantId);

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

      return response.Body as Readable;
    } catch (error) {
      // Handle file not found
      if (
        error.name === 'NoSuchKey' ||
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        throw new NotFoundException('File not found');
      }

      // Handle bucket not found - occurs when accessing another tenant's files
      if (
        error.name === 'NoSuchBucket' ||
        error.Code === 'NoSuchBucket' ||
        error.message?.includes('bucket') ||
        error.message?.includes('does not exist')
      ) {
        throw new NotFoundException('File not found');
      }

      this.logger.error(`Failed to get file: ${error.message}`);
      throw new InternalServerErrorException('Failed to retrieve file');
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(
    tenantId: string,
    fileKey: string,
  ): Promise<FileMetadata | null> {
    const bucket = this.getTenantBucket(tenantId);

    try {
      const response = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: fileKey,
        }),
      );

      if (!response.Metadata) {
        return null;
      }

      return {
        userId: response.Metadata.userid || '',
        originalName: response.Metadata.originalname || '',
        tenantId: response.Metadata.tenantid || '',
        uploadedAt: response.Metadata.uploadedat || '',
        contentType: response.ContentType || '',
      };
    } catch (error) {
      // Handle file not found or bucket not found
      if (
        error.name === 'NotFound' ||
        error.name === 'NoSuchKey' ||
        error.$metadata?.httpStatusCode === 404 ||
        error.name === 'NoSuchBucket' ||
        error.Code === 'NoSuchBucket' ||
        error.message?.includes('bucket') ||
        error.message?.includes('does not exist')
      ) {
        return null;
      }

      this.logger.error(`Failed to get file metadata: ${error.message}`);
      return null;
    }
  }

  /**
   * Delete a file from tenant's bucket
   */
  async deleteFile(tenantId: string, fileKey: string): Promise<void> {
    const bucket = this.getTenantBucket(tenantId);

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

      // Handle bucket not found (404) - occurs when accessing another tenant's files
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
   */
  async generateSignedUrl(
    tenantId: string,
    fileKey: string,
    expiresIn?: number,
  ): Promise<string> {
    const bucket = this.getTenantBucket(tenantId);
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
   * List files in tenant's bucket
   */
  async listFiles(tenantId: string, prefix?: string): Promise<FileListItem[]> {
    const bucket = this.getTenantBucket(tenantId);

    try {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
        }),
      );

      if (!response.Contents || response.Contents.length === 0) {
        return [];
      }

      const files: FileListItem[] = await Promise.all(
        response.Contents.filter((item) => item.Key).map(async (item) => {
          const url = await this.generateSignedUrl(tenantId, item.Key!);
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
  async getTemplateFile(fileKey: string): Promise<Readable> {
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
