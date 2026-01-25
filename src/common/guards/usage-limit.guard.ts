import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nContext } from 'nestjs-i18n';
import { USAGE_FEATURE_KEY } from '../decorators/usage-quota.decorator';
import { UsageTrackingService } from '../../modules/tenants/usage-tracking.service';
import { I18nKeys } from '../constants/i18n-keys';
import { MeteredFeature } from '../../modules/tenants/entities/tenant-features.interface';

@Injectable()
export class UsageLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private usageService: UsageTrackingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.get<MeteredFeature>(
      USAGE_FEATURE_KEY,
      context.getHandler(),
    );

    if (!feature) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenantId = String(request.tenantId || request.user?.tenantId);
    const _userId = request.user?.id;
    const i18n = I18nContext.current();

    if (!tenantId) {
      throw new UnauthorizedException(
        i18n?.t(I18nKeys.UNAUTHORIZED) ?? 'Unauthorized',
      );
    }

    const check = await this.usageService.checkUsageLimit(tenantId, feature);

    if (!check.allowed) {
      throw new ForbiddenException({
        message: check.message,
        limit: check.limit,
        current: check.current,
        remaining: check.remaining,
        periodEnd: check.periodEnd,
        feature,
      });
    }

    request.usageCheck = check;

    return true;
  }
}
