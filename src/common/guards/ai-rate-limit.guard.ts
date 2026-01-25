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

    const todayUsage = await this.aiUsageService.getDailyAiUsage(
      user.userId,
      user.tenantId,
    );

    const dailyLimit = AiRateLimits.MEMBER_DAILY_LIMIT;

    if (todayUsage >= dailyLimit) {
      throw new ForbiddenException(
        `Daily AI generation limit reached (${dailyLimit}/day for members). ` +
          `You have used ${todayUsage} generations today.`,
      );
    }

    // Increment usage count
    await this.aiUsageService.incrementAiGeneration(user.userId, user.tenantId);

    // Attach usage info to request for downstream use
    request.aiUsage = {
      dailyCount: todayUsage + 1,
      dailyLimit,
    };

    return true;
  }
}
