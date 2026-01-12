import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { TenantService } from 'src/modules/tenants/tenant.service';

/**
 * Guard to enforce document upload limits based on tenant's plan
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
  constructor(private tenantService: TenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId = String(request.tenantId || request.user?.tenantId);

    // Ensure tenant context is available
    if (!tenantId) {
      throw new UnauthorizedException(
        'Tenant context not found. Please authenticate.',
      );
    }

    // Check if tenant can upload more documents
    const uploadCheck = await this.tenantService.canUploadDocument(tenantId);

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
