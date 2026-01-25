import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nContext } from 'nestjs-i18n';
import {
  USAGE_FEATURE_KEY,
  UsageQuotaMeta,
} from '../decorators/usage-quota.decorator.js';
import { I18nKeys } from '../constants/i18n-keys.js';
import { MeteredFeature } from '../types/tenant-features.interface.js';

// Service injection token for UsageTrackingService
export const USAGE_TRACKING_SERVICE = Symbol('USAGE_TRACKING_SERVICE');

export interface IUsageTrackingService {
  checkUsageLimit(
    tenantId: string,
    feature: MeteredFeature,
  ): Promise<{
    allowed: boolean;
    message?: string;
    limit?: number;
    current?: number;
    remaining?: number;
    periodEnd?: Date;
  }>;
}

@Injectable()
export class UsageLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(USAGE_TRACKING_SERVICE) private usageService: IUsageTrackingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.get<UsageQuotaMeta>(
      USAGE_FEATURE_KEY,
      context.getHandler(),
    );

    if (!meta) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenantId = String(request.tenantId || request.user?.tenantId);
    const userId: string | undefined = request.user?.id;
    const i18n = I18nContext.current();

    if (!tenantId) {
      throw new UnauthorizedException(
        i18n?.t(I18nKeys.UNAUTHORIZED) ?? 'Unauthorized',
      );
    }

    // Use atomic check-and-increment with credits fallback
    // This ensures no race conditions and handles credit consumption
    const check = await this.usageService.checkAndIncrementWithCredits(
      tenantId,
      meta.feature,
      userId,
      {
        endpoint: request.url,
        method: request.method,
        timestamp: new Date().toISOString(),
      },
    );

    if (!check.allowed) {
      throw new ForbiddenException({
        message: check.message,
        limit: check.limit,
        current: check.current,
        remaining: check.remaining,
        periodEnd: check.periodEnd,
        feature: meta.feature,
        creditsRemaining: check.creditsRemaining ?? 0,
      });
    }

    // Store the check result for downstream use
    request.usageCheck = check;
    // Flag to prevent double-increment by UsageTrackingInterceptor
    request.usageAlreadyIncremented = true;

    return true;
  }
}
