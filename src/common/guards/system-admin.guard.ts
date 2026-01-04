import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Guard to check if user is a system administrator
 * System admins have platform-wide access (not workspace-specific)
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAuthGuard, SystemAdminGuard)
 * @Get('admin/workspaces')
 * async listAllWorkspaces() {
 *   // Only system admins can access
 * }
 * ```
 */
@Injectable()
export class SystemAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Ensure user is authenticated
    if (!user) {
      throw new UnauthorizedException('Authentication required. Please login.');
    }

    // Check if user is system admin
    if (!user.isSystemAdmin) {
      throw new ForbiddenException(
        'Access denied. System administrator privileges required.',
      );
    }

    return true;
  }
}
