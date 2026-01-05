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
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import { DocumentLimitGuard } from '../../common/guards/document-limit.guard';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  DeleteFileResponseDto,
  FileListResponseDto,
  FileResponseDto,
  SignedUrlResponseDto,
} from './dto/file-response.dto';
import { FastifyFileInterceptor } from './interceptors/fastify-file.interceptor';
import type { ValidatedFile } from './pipes/file-validation.pipe';
import { FileValidationPipe } from './pipes/file-validation.pipe';
import { StorageService } from './storage.service';

@ApiTags('Storage')
@Controller('storage')
@SwaggerCookieAuth.accessToken()
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @UseGuards(RolesGuard, DocumentLimitGuard)
  @Roles('admin', 'member', 'system')
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
  @UseGuards(RolesGuard)
  @Roles('admin', 'member', 'system')
  @ApiOperation({
    summary: 'Get signed download URL for a file',
    description:
      'Generate a time-limited signed URL for downloading a file. Requires authentication. All authenticated users can access files from their tenant.',
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
  @UseGuards(RolesGuard)
  @Roles('admin', 'member', 'system')
  @ApiOperation({
    summary: 'Download a file directly',
    description:
      'Download a file directly as a stream. Requires authentication. All authenticated users can download files from their tenant.',
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
  @UseGuards(RolesGuard)
  @Roles('admin', 'system')
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

    await this.storageService.deleteFile(user.tenantId, fileKey);

    return {
      message: 'File deleted successfully',
      key: fileKey,
    };
  }
}
