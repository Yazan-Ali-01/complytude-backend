import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';

/**
 * Guard to check if user belongs to the workspace they're trying to access
 * Ensures users can only access/modify their own workspace data
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAuthGuard, WorkspaceOwnershipGuard)
 * @Get('workspaces/:workspaceId')
 * async getWorkspace(@Param('workspaceId') workspaceId: string) {
 *   // Only users belonging to this workspace can access
 * }
 * ```
 */
@Injectable()
export class WorkspaceOwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Ensure user is authenticated
    if (!user) {
      throw new UnauthorizedException('Authentication required. Please login.');
    }

    // System admins bypass workspace ownership checks
    if (user.isSystemAdmin) {
      return true;
    }

    // Get workspace ID from route params or body
    const workspaceIdFromRoute =
      request.params.workspaceId || request.params.id;
    const workspaceIdFromBody = request.body?.workspaceId;
    const targetWorkspaceId = workspaceIdFromRoute || workspaceIdFromBody;

    // If no workspace ID in request, this guard shouldn't be used
    if (!targetWorkspaceId) {
      throw new BadRequestException(
        'Workspace ID is required for this operation',
      );
    }

    // Check if user belongs to this workspace
    const userWorkspaceId = user.workspaceId;

    if (!userWorkspaceId) {
      throw new ForbiddenException(
        'You do not have access to any workspace. Please contact support.',
      );
    }

    // Check if user's workspace matches the requested workspace
    if (userWorkspaceId !== targetWorkspaceId) {
      throw new ForbiddenException(
        'Access denied. You can only access your own workspace.',
      );
    }

    return true;
  }
}
