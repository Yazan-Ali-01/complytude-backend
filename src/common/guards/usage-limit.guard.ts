import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  USAGE_FEATURE_KEY,
  CREDITS_REQUIRED_KEY,
} from '../decorators/require-usage.decorator';
import { FeaturesService } from '../../modules/tenant/features.service';
import { CREDIT_PRICES, UsageTrackedFeature } from '../../config/plan-features.config';

@Injectable()
export class UsageLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private featuresService: FeaturesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureKey = this.reflector.getAllAndOverride<string>(USAGE_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!featureKey) return true;

    const creditsRequired = this.reflector.getAllAndOverride<number>(CREDITS_REQUIRED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? 1;

    const request = context.switchToHttp().getRequest();
    const tenantId = String(request.tenantId || request.user?.tenantId);

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context not found');
    }

    // Check quota AND credits availability
    const usageCheck = await this.featuresService.checkUsageWithCredits(tenantId, featureKey);

    if (!usageCheck.allowed) {
      // Neither quota nor credits available - include upsell info for frontend
      const pricePerCredit = CREDIT_PRICES[featureKey as UsageTrackedFeature] ?? 0;

      throw new ForbiddenException({
        message: `Monthly limit reached for ${featureKey}. ${usageCheck.current_usage}/${usageCheck.usage_limit} used. No credits available.`,
        feature: featureKey,
        current_usage: usageCheck.current_usage,
        usage_limit: usageCheck.usage_limit,
        remaining_quota: usageCheck.remaining_quota,
        credits_available: usageCheck.credits_available,
        error: 'Usage Limit Exceeded',
        // Upsell info for frontend
        can_purchase_credits: pricePerCredit > 0,
        credits_needed: creditsRequired,
        price_per_credit_aed: pricePerCredit,
      });
    }

    request.usageFeature = featureKey;
    request.usageCheck = usageCheck;
    request.creditsRequired = creditsRequired;

    return true;
  }
}
