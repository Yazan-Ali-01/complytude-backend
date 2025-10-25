import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantFeatures } from '../../modules/tenant/entities/tenant.entity';

export interface TenantContext {
  tenantId: string;
  schemaName: string;
  userId?: string;
  role?: string;
  features?: TenantFeatures;
}

export const EXCLUDED_PATHS = [
  '/api/health',
  '/health',
  '/api/docs',
  '/docs',
  '/api/auth',
  '/auth',
  '/api/tenants/initialize',
  '/tenants/initialize',
  '/api/tenants',
  '/tenants',
];

// Extend Express Request type
declare module 'express' {
  interface Request {
    tenantContext?: TenantContext;
  }
}

/**
 * Middleware to extract tenant context from JWT token or request headers
 * Priority:
 * 1. JWT token payload (set by JwtAuthGuard)
 * 2. Request headers (fallback for backward compatibility)
 *
 * Expected headers (fallback):
 * - x-tenant-id: The tenant identifier
 * - x-schema-name (optional): The schema name (can be derived from tenant-id)
 * - x-user-id (optional): The user identifier
 * - x-user-role (optional): The user role
 *
 * Note: Features are loaded lazily by FeaturesGuard when needed
 * to avoid database queries on every request
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  use(req: any, res: Response, next: NextFunction) {
    // Get the request path - use originalUrl for Fastify/NestJS
    // originalUrl contains the full path including API prefix
    const requestPath = req.originalUrl || req.url || req.path || '';

    this.logger.debug(`Processing request to: ${requestPath}`);

    // For routes that don't require tenant context (like health checks and auth routes)
    const isExcluded = EXCLUDED_PATHS.some((path) =>
      requestPath.startsWith(path),
    );

    if (isExcluded) {
      this.logger.debug(
        `Path ${requestPath} is excluded from tenant validation`,
      );
      return next();
    }

    // Extract tenant context from JWT token (preferred method)
    // req.user is set by JwtAuthGuard after successful authentication
    if (req.user) {
      req.tenantContext = {
        tenantId: req.user.tenantId,
        schemaName: `tenant_${req.user.tenantId.replace(/-/g, '_')}`,
        userId: req.user.userId,
        role: req.user.role,
      };

      this.logger.debug(
        `Tenant context set from JWT: ${JSON.stringify(req.tenantContext)}`,
      );
      return next();
    }

    // Fallback: Extract tenant information from headers (for backward compatibility)
    const tenantId = req.headers['x-tenant-id'] as string;
    const schemaName = req.headers['x-schema-name'] as string;
    const userId = req.headers['x-user-id'] as string;
    const role = req.headers['x-user-role'] as string;

    // Tenant ID is required
    if (!tenantId) {
      this.logger.warn(`Missing tenant context for request to ${requestPath}`);
      throw new UnauthorizedException(
        'Tenant context is required. Please authenticate or provide x-tenant-id header.',
      );
    }

    // Set tenant context on request
    req.tenantContext = {
      tenantId,
      schemaName: schemaName || `tenant_${tenantId.replace(/-/g, '_')}`,
      userId,
      role,
    };

    this.logger.debug(
      `Tenant context set from headers: ${JSON.stringify(req.tenantContext)}`,
    );

    next();
  }
}
