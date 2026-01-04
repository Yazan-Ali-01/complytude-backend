import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { WorkspaceService } from '../../modules/workspace/workspace.service';

/**
 * Guard to enforce document upload limits based on workspace's plan
 * Apply this guard to file upload endpoints
 *
 * @example
 * ```typescript
 * @Post('upload')
 * @UseGuards(JwtAuthGuard, DocumentLimitGuard)
 * async uploadFile(@UploadedFile() file: Express.Multer.File) {
 *   // ... upload logic
 * }
 * ```
 */
@Injectable()
export class DocumentLimitGuard implements CanActivate {
  constructor(private workspaceService: WorkspaceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const workspaceId = String(
      request.workspaceId || request.user?.workspaceId,
    );

    // Ensure workspace context is available
    if (!workspaceId) {
      throw new UnauthorizedException(
        'Workspace context not found. Please authenticate.',
      );
    }

    // Check if workspace can upload more documents
    const uploadCheck =
      await this.workspaceService.canUploadDocument(workspaceId);

    if (!uploadCheck.allowed) {
      throw new ForbiddenException({
        message: uploadCheck.message,
        limit: uploadCheck.limit,
        current: uploadCheck.current,
        statusCode: 403,
        error: 'Document Limit Exceeded',
      });
    }

    return true;
  }
}
