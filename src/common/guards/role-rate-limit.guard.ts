import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RbacService } from '../../modules/rbac/rbac.service';
import { ROLE_RATE_LIMITS } from '../../modules/rbac/config/permissions.config';
import { TenantRole } from '../../modules/rbac/types/rbac.types';

interface RateLimitEntry {
  count: number;
  resetTime: Date;
}

@Injectable()
export class RoleRateLimitGuard implements CanActivate {
  private readonly rateLimitCache = new Map<string, RateLimitEntry>();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(
    private readonly rbacService: RbacService,
    private readonly databaseService: DatabaseService,
  ) {
    this.cleanupInterval = setInterval(() => this.cleanupCache(), 60 * 1000);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('No role assigned');
    }

    const role = user.role as TenantRole;
    const rateLimit = ROLE_RATE_LIMITS[role];

    if (!rateLimit) {
      return true;
    }

    if (rateLimit.dailyLimit === -1) {
      return true;
    }

    if (rateLimit.dailyLimit === 0) {
      throw new ForbiddenException(
        `Your role (${role}) does not allow AI generations.`,
      );
    }

    return this.checkRateLimit(
      user.userId,
      user.tenantId,
      role,
      rateLimit.dailyLimit,
    );
  }

  private async checkRateLimit(
    userId: string,
    tenantId: string,
    role: TenantRole,
    dailyLimit: number,
  ): Promise<boolean> {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );

    const cacheKey = `${tenantId}:${userId}`;
    let entry = this.rateLimitCache.get(cacheKey);

    if (!entry || entry.resetTime < now) {
      const result = await this.databaseService.query(
        `SELECT COUNT(*) as count
         FROM public.rbac_audit_log
         WHERE user_id = $1
           AND tenant_id = $2
           AND action LIKE '%ai%'
           AND created_at >= $3
           AND created_at < $4`,
        [userId, tenantId, startOfDay, endOfDay],
        false,
      );

      const count = parseInt(result.rows[0]?.count || '0', 10);

      entry = {
        count,
        resetTime: endOfDay,
      };
      this.rateLimitCache.set(cacheKey, entry);
    }

    if (entry.count >= dailyLimit) {
      throw new ForbiddenException(
        `Rate limit exceeded. You have reached your daily limit of ${dailyLimit} AI generations for role ${role}. Limit resets at midnight.`,
      );
    }

    return true;
  }

  private cleanupCache(): void {
    const now = new Date();
    for (const [key, entry] of this.rateLimitCache.entries()) {
      if (entry.resetTime < now) {
        this.rateLimitCache.delete(key);
      }
    }
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
