import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator to extract tenant context from request
 * Usage: @GetTenantContext() tenant: { tenantId: string, schemaName: string }
 */
export const GetTenantContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantContext;
  },
);

/**
 * Decorator to extract tenant ID from request
 * Usage: @TenantId() tenantId: string
 */
export const TenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantContext?.tenantId;
  },
);

/**
 * Decorator to extract schema name from request
 * Usage: @SchemaName() schemaName: string
 */
export const SchemaName = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantContext?.schemaName;
  },
);
