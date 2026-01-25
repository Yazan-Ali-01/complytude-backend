import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';

export const AI_GENERATION_FEATURE = 'ai_generation';

// Service injection token for AiUsageTrackingService
export const AI_USAGE_TRACKING_SERVICE = Symbol('AI_USAGE_TRACKING_SERVICE');

export interface IAiUsageTrackingService {
  getDailyAiUsage(userId: string, tenantId: string): Promise<number>;
  incrementAiGeneration(userId: string, tenantId: string): Promise<void>;
}

// Constants that can be overridden via injection or config
export const TenantRoles = {
  MEMBER: 'member',
  ADMIN: 'admin',
  OWNER: 'owner',
} as const;

export const AiRateLimits = {
  MEMBER_DAILY_LIMIT: 50,
} as const;

interface RequestUser {
  userId: string;
  tenantId: string;
  role: string;
}

@Injectable()
export class AiRateLimitGuard implements CanActivate {
  constructor(
    @Inject(AI_USAGE_TRACKING_SERVICE)
    private readonly aiUsageService: IAiUsageTrackingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;

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
