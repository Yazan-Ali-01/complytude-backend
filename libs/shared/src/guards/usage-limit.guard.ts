import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nContext } from 'nestjs-i18n';
import {
  USAGE_FEATURE_KEY,
  UsageQuotaMeta,
} from '../decorators/usage-quota.decorator';
import { UsageTrackingService } from '../../modules/tenants/usage-tracking.service';
import { I18nKeys } from '../constants/i18n-keys';

@Injectable()
export class UsageLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private usageService: UsageTrackingService,
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
