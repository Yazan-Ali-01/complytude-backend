import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantRole } from 'src/common/types/tenant.types';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  tenantId: string;
  role: TenantRole;
}

/**
 * Custom decorator to extract authenticated user from request
 * Usage: @CurrentUser() user: AuthenticatedUser
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
