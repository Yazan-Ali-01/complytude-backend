import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator to extract workspace context from request
 * Usage: @WorkspaceContext() workspace: { workspaceId: string, schemaName: string }
 */
export const WorkspaceContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.workspaceContext;
  },
);

/**
 * Decorator to extract workspace ID from request
 * Usage: @WorkspaceId() workspaceId: string
 */
export const WorkspaceId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.workspaceContext?.workspaceId;
  },
);

/**
 * Decorator to extract schema name from request
 * Usage: @SchemaName() schemaName: string
 */
export const SchemaName = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.workspaceContext?.schemaName;
  },
);
