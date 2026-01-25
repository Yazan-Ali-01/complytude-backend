import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AiUsageTrackingService } from '../../modules/ai/services/ai-usage-tracking.service';
import { TenantRoles } from '../../modules/rbac/constants/roles.constant';
import { AiRateLimits } from '../../modules/rbac/constants/rate-limits.constant';

export const AI_GENERATION_FEATURE = 'ai_generation';

@Injectable()
export class AiRateLimitGuard implements CanActivate {
  constructor(private readonly aiUsageService: AiUsageTrackingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Only rate-limit member role
    if (user.role !== TenantRoles.MEMBER) {
      return true;
    }

    const dailyLimit = AiRateLimits.MEMBER_DAILY_LIMIT;

    // Use atomic check-and-increment to prevent race conditions
    const result = await this.aiUsageService.checkAndIncrementAiUsage(
      user.userId as string,
      user.tenantId as string,
      dailyLimit,
    );

    if (!result.allowed) {
      throw new ForbiddenException(
        `Daily AI generation limit reached (${dailyLimit}/day for members). ` +
          `You have used ${result.current} generations today.`,
      );
    }

    // Attach usage info to request for downstream use
    request.aiUsage = {
      dailyCount: result.current,
      dailyLimit: result.limit,
      remaining: result.remaining,
    };

    return true;
  }
}
