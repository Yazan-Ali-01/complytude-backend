import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  SwaggerCookieAuth,
  RequirePermissions,
  RequireUsageQuota,
  UsageLimitGuard,
  UsageTrackingInterceptor,
} from '@complytude/shared';
import { Permissions } from '../rbac/constants/permissions.constant';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StorageService } from './storage.service';
import { FastifyFileInterceptor } from './interceptors/fastify-file.interceptor';
import type { ValidatedFile } from './pipes/file-validation.pipe';
import { FileValidationPipe } from './pipes/file-validation.pipe';
import {
  DeleteFileResponseDto,
  FileListResponseDto,
  FileResponseDto,
  SignedUrlResponseDto,
} from './dto/list-files-response.dto';

@ApiTags('Storage')
@Controller('storage')
@SwaggerCookieAuth.accessToken()
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  private readonly PAGINATION = {
    DEFAULT_LIMIT: 50,
    MAX_LIMIT: 1000,
  } as const;

  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @RequirePermissions(Permissions.DOCUMENTS.CREATE)
  @RequireUsageQuota('documents_per_month')
  @UseGuards(UsageLimitGuard)
  @UseInterceptors(UsageTrackingInterceptor)
  @ApiOperation({
    summary: 'Upload a file',
    description:
      'Upload a file to tenant-isolated storage. Requires documents:create permission. Subject to plan document limits.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File to upload (PDF, DOCX, PNG, JPEG - max 10MB)',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    type: FileResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file or validation failed',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - Insufficient permissions or document limit exceeded',
  })
  @UseInterceptors(FastifyFileInterceptor('file'))
  async uploadFile(
    @UploadedFile(FileValidationPipe) file: ValidatedFile,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FileResponseDto> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    this.logger.log(
      `User ${user.userId} uploading file: ${file.originalName} (${file.size} bytes)`,
    );

    const result = await this.storageService.uploadFile(
      user.tenantId,
      file.buffer,
      file.originalName,
      file.mimeType,
      user.userId,
    );

    return {
      url: result.url,
      key: result.key,
      bucket: result.bucket,
      size: result.size,
      contentType: result.contentType,
    };
  }

  @Get('list')
  @RequirePermissions(Permissions.DOCUMENTS.READ)
  @ApiOperation({
    summary: 'List files for current tenant',
    description:
      'List files in tenant storage with pagination support. Requires documents:read permission.',
  })
  @ApiQuery({
    name: 'prefix',
    required: false,
    type: String,
    description: 'Optional prefix to filter files by path',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of files to return (default: 50, max: 1000)',
  })
  @ApiQuery({
    name: 'continuationToken',
    required: false,
    type: String,
    description: 'Token from previous response to fetch next page',
  })
  @ApiResponse({
    status: 200,
    description: 'Files retrieved successfully',
    type: FileListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async listFiles(
    @CurrentUser() user: AuthenticatedUser,
    @Query('prefix') prefix?: string,
    @Query('limit') limit?: number,
    @Query('continuationToken') continuationToken?: string,
  ): Promise<FileListResponseDto> {
    const validatedLimit = this.validatePaginationLimit(limit);

    const result = await this.storageService.listFiles(
      user.tenantId,
      prefix,
      validatedLimit,
      continuationToken,
    );

    return this.mapToFileListResponse(result);
  }

  /**
   * Validate and sanitize pagination limit
   */
  private validatePaginationLimit(limit?: number): number {
    if (limit === undefined) {
      return this.PAGINATION.DEFAULT_LIMIT;
    }

    const parsed = Number(limit);
    if (isNaN(parsed) || parsed < 1) {
      throw new BadRequestException(
        `Limit must be a positive number (max: ${this.PAGINATION.MAX_LIMIT})`,
      );
    }

    return Math.min(parsed, this.PAGINATION.MAX_LIMIT);
  }

  /**
   * Map service result to API response DTO
   */
  private mapToFileListResponse(result: {
    files: any[];
    nextToken?: string;
    hasMore: boolean;
  }): FileListResponseDto {
    return {
      files: result.files,
      total: result.files.length,
      nextToken: result.nextToken,
      hasMore: result.hasMore,
    };
  }

  @Get('signed-url/:fileKey')
  @RequirePermissions(Permissions.DOCUMENTS.READ)
  @ApiOperation({
    summary: 'Get signed download URL for a file',
    description:
      'Generate a time-limited signed URL for downloading a file. Requires documents:read permission.',
  })
  @ApiQuery({
    name: 'expiresIn',
    required: false,
    type: Number,
    description: 'URL expiration time in seconds (default: 900)',
  })
  @ApiResponse({
    status: 200,
    description: 'Signed URL generated successfully',
    type: SignedUrlResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  async getSignedUrl(
    @Param('fileKey') fileKey: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('expiresIn') expiresIn?: number,
  ): Promise<SignedUrlResponseDto> {
    const url = await this.storageService.generateSignedUrl(
      user.tenantId,
      fileKey,
      expiresIn,
    );

    return {
      key: fileKey,
      url,
      expiresIn: expiresIn || 900,
    };
  }

  @Get('download/:fileKey')
  @RequirePermissions(Permissions.DOCUMENTS.READ)
  @ApiOperation({
    summary: 'Download a file directly',
    description:
      'Download a file directly as a stream. Requires documents:read permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'File downloaded successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  async downloadFile(
    @Param('fileKey') fileKey: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StreamableFile> {
    const { stream, filename, contentType } =
      await this.storageService.getFileForDownload(user.tenantId, fileKey);

    const encodedFilename = encodeURIComponent(filename);
    const disposition = `inline; filename="${filename}"; filename*=UTF-8''${encodedFilename}`;

    return new StreamableFile(stream, {
      type: contentType,
      disposition,
    });
  }

  @Delete(':fileKey')
  @RequirePermissions(Permissions.DOCUMENTS.DELETE)
  @ApiOperation({
    summary: 'Delete a file',
    description:
      'Delete a file from tenant storage. Requires documents:delete permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'File deleted successfully',
    type: DeleteFileResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only admins and system users can delete files',
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  async deleteFile(
    @Param('fileKey') fileKey: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeleteFileResponseDto> {
    this.logger.log(
      `User ${user.userId} deleting file: ${fileKey} from tenant ${user.tenantId}`,
    );

    await this.storageService.deleteFile(user.tenantId, fileKey);

    return {
      message: 'File deleted successfully',
      key: fileKey,
    };
  }
}
