import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  AuthenticatedIdentityRefreshUser,
  AuthenticatedIdentityUser,
  AuthenticatedTenantRefreshUser,
  AuthenticatedTenantUser,
} from '../strategies';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  tenantId: string;
  role: string;
}

/**
 * @deprecated Use CurrentUserTenant or CurrentUserIdentity instead
 * Custom decorator to extract authenticated user from request
 * Usage: @CurrentUser() user: AuthenticatedUser
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

export const CurrentUserIdentity = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedIdentityUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.auth.identity;
  },
);

export const CurrentUserTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedTenantUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.auth.tenant;
  },
);

export const CurrentUserTenantRefresh = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedTenantRefreshUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.auth.tenant;
  },
);

export const CurrentUserIdentityRefresh = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedIdentityRefreshUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.auth.identity;
  },
);
