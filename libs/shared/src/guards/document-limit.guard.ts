import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { I18nKeys } from '../constants/i18n-keys.js';

// Service injection token for TenantService
export const TENANT_SERVICE = Symbol('TENANT_SERVICE');

export interface ITenantService {
  canUploadDocument(tenantId: string): Promise<{
    allowed: boolean;
    message?: string;
    limit?: number;
    current?: number;
  }>;
}

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
  constructor(@Inject(TENANT_SERVICE) private tenantService: ITenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId = String(request.tenantId || request.user?.tenantId);

    // Ensure tenant context is available
    if (!tenantId) {
      const i18n = I18nContext.current();
      throw new UnauthorizedException(
        i18n?.t(I18nKeys.UNAUTHORIZED) ?? 'Unauthorized',
      );
    }

    // Check if tenant can upload more documents
    const uploadCheck = await this.tenantService.canUploadDocument(tenantId);

    if (!uploadCheck.allowed) {
      const i18n = I18nContext.current();
      throw new ForbiddenException({
        message: uploadCheck.message,
        limit: uploadCheck.limit,
        current: uploadCheck.current,
        statusCode: 403,
        error:
          i18n?.t(I18nKeys.DOCUMENT_LIMIT_EXCEEDED) ??
          'Document Limit Exceeded',
      });
    }

    return true;
  }
}
