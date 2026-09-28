import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  AuthenticatedIdentityRefreshUser,
  AuthenticatedIdentityUser,
  AuthenticatedTenantRefreshUser,
  AuthenticatedTenantUser,
} from '../strategies';

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
