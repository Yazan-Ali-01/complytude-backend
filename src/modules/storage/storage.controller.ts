import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  UseInterceptors,
  UseGuards,
  UploadedFile,
  BadRequestException,
  Logger,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { FastifyFileInterceptor } from './interceptors/fastify-file.interceptor';
import { StorageService } from './storage.service';
import { FileValidationPipe } from './pipes/file-validation.pipe';
import type { ValidatedFile } from './pipes/file-validation.pipe';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DocumentLimitGuard } from '../../common/guards/document-limit.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import {
  FileResponseDto,
  FileListResponseDto,
  SignedUrlResponseDto,
  DeleteFileResponseDto,
} from './dto/file-response.dto';

@ApiTags('Storage')
@Controller('storage')
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @UseGuards(RolesGuard, DocumentLimitGuard)
  @Roles('admin', 'member', 'system')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upload a file',
    description:
      'Upload a file to tenant-isolated storage. Requires admin, member, or system role. Subject to plan document limits.',
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

    return { url: result.url };
  }

  @Get('list')
  @UseGuards(RolesGuard)
  @Roles('admin', 'member', 'viewer', 'system')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List all files for current tenant',
    description:
      'List all files in tenant storage. Available to all authenticated users.',
  })
  @ApiQuery({
    name: 'prefix',
    required: false,
    type: String,
    description: 'Optional prefix to filter files by path',
  })
  @ApiResponse({
    status: 200,
    description: 'Files retrieved successfully',
    type: FileListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async listFiles(
    @CurrentUser() user: AuthenticatedUser,
    @Query('prefix') prefix?: string,
  ): Promise<FileListResponseDto> {
    const files = await this.storageService.listFiles(user.tenantId, prefix);

    return {
      files,
      total: files.length,
    };
  }

  @Get('signed-url/:fileKey')
  @Public()
  @ApiOperation({
    summary: 'Get signed download URL for a file',
    description:
      'Generate a time-limited signed URL for downloading a file. Public endpoint - no authentication required. Tenant ID must be provided in the path.',
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
  @ApiResponse({ status: 404, description: 'File not found' })
  async getSignedUrl(
    @Param('fileKey') fileKey: string,
    @Query('expiresIn') expiresIn?: number,
  ): Promise<SignedUrlResponseDto> {
    const url = await this.storageService.generateSignedUrl(fileKey, expiresIn);

    return {
      key: fileKey,
      url,
      expiresIn: expiresIn || 900,
    };
  }

  @Get('download/:fileKey')
  @Public()
  @ApiOperation({
    summary: 'Download a file directly',
    description:
      'Download a file as an attachment. Public endpoint - no authentication required. Tenant ID must be provided in the path. All roles can download files from their tenant.',
  })
  @ApiResponse({
    status: 200,
    description: 'File downloaded successfully',
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  async downloadFile(
    @Param('fileKey') fileKey: string,
  ): Promise<StreamableFile> {
    // Get file and metadata in a single S3 request (no race condition)
    const { stream, metadata } = await this.storageService.getFile(fileKey);

    // Extract filename from metadata or fallback to fileKey
    // FileKey format: tenants/{tenantId}/{timestamp}-{filename}
    let filename = metadata?.originalName;

    // If no metadata, extract filename from the fileKey
    if (!filename) {
      const parts = fileKey.split('/');
      const lastPart = parts[parts.length - 1];
      const timestampMatch = lastPart.match(/^\d+-(.+)$/);
      filename = timestampMatch ? timestampMatch[1] : lastPart;
    }

    const encodedFilename = encodeURIComponent(filename);
    const disposition = `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`;

    return new StreamableFile(stream, {
      type: metadata?.contentType || 'application/octet-stream',
      disposition,
    });
  }

  @Delete(':fileKey')
  @UseGuards(RolesGuard)
  @Roles('admin', 'system')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a file',
    description:
      'Delete a file from tenant storage. Only admins and system users can delete files.',
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

    await this.storageService.deleteFile(fileKey);

    return {
      message: 'File deleted successfully',
      key: fileKey,
    };
  }
}
