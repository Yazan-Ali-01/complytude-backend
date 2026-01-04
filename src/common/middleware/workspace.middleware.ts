import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { WorkspaceFeatures } from '../../modules/workspace/entities/workspace.entity';

export interface WorkspaceContext {
  workspaceId: string;
  schemaName: string;
  userId?: string;
  role?: string;
  features?: WorkspaceFeatures;
}

export const EXCLUDED_PATHS = [
  '/api/health',
  '/health',
  '/api/docs',
  '/docs',
  '/api/auth',
  '/auth',
  '/api/workspaces/initialize',
  '/workspaces/initialize',
  '/api/workspaces',
  '/workspaces',
];

// Extend Express Request type
declare module 'express' {
  interface Request {
    workspaceContext?: WorkspaceContext;
  }
}

/**
 * Middleware to extract workspace context from JWT token or request headers
 * Priority:
 * 1. JWT token payload (set by JwtAuthGuard)
 * 2. Request headers (fallback for backward compatibility)
 *
 * Expected headers (fallback):
 * - x-workspace-id: The workspace identifier
 * - x-schema-name (optional): The schema name (can be derived from workspace-id)
 * - x-user-id (optional): The user identifier
 * - x-user-role (optional): The user role
 *
 * Note: Features are loaded lazily by FeaturesGuard when needed
 * to avoid database queries on every request
 */
@Injectable()
export class WorkspaceMiddleware implements NestMiddleware {
  private readonly logger = new Logger(WorkspaceMiddleware.name);

  use(req: any, res: Response, next: NextFunction) {
    // Get the request path - use originalUrl for Fastify/NestJS
    // originalUrl contains the full path including API prefix
    const requestPath = req.originalUrl || req.url || req.path || '';

    this.logger.debug(`Processing request to: ${requestPath}`);

    // For routes that don't require workspace context (like health checks and auth routes)
    const isExcluded = EXCLUDED_PATHS.some((path) =>
      requestPath.startsWith(path),
    );

    if (isExcluded) {
      this.logger.debug(
        `Path ${requestPath} is excluded from workspace validation`,
      );
      return next();
    }

    // Extract workspace context from JWT token (preferred method)
    // req.user is set by JwtAuthGuard after successful authentication
    if (req.user) {
      req.workspaceContext = {
        workspaceId: req.user.workspaceId,
        schemaName: `workspace_${req.user.workspaceId.replace(/-/g, '_')}`,
        userId: req.user.userId,
        role: req.user.role,
      };

      this.logger.debug(
        `Workspace context set from JWT: ${JSON.stringify(req.workspaceContext)}`,
      );
      return next();
    }

    // Fallback: Extract workspace information from headers (for backward compatibility)
    const workspaceId = req.headers['x-workspace-id'] as string;
    const schemaName = req.headers['x-schema-name'] as string;
    const userId = req.headers['x-user-id'] as string;
    const role = req.headers['x-user-role'] as string;

    // Workspace ID is required
    if (!workspaceId) {
      this.logger.warn(
        `Missing workspace context for request to ${requestPath}`,
      );
      throw new UnauthorizedException(
        'Workspace context is required. Please authenticate or provide x-workspace-id header.',
      );
    }

    // Set workspace context on request
    req.workspaceContext = {
      workspaceId,
      schemaName: schemaName || `workspace_${workspaceId.replace(/-/g, '_')}`,
      userId,
      role,
    };

    this.logger.debug(
      `Workspace context set from headers: ${JSON.stringify(req.workspaceContext)}`,
    );

    next();
  }
}
