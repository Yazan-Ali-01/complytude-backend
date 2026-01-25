import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import {
  USAGE_FEATURE_KEY,
  UsageQuotaMeta,
} from '../decorators/usage-quota.decorator.js';
import { USAGE_TRACKING_SERVICE } from '../guards/usage-limit.guard.js';

// Re-export the token for convenience
export { USAGE_TRACKING_SERVICE };

export interface IUsageTrackingServiceForInterceptor {
  incrementUsageUnchecked(
    tenantId: string,
    feature: string,
    userId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
}

@Injectable()
export class UsageTrackingInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    @Inject(USAGE_TRACKING_SERVICE)
    private usageService: IUsageTrackingServiceForInterceptor,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.get<UsageQuotaMeta>(
      USAGE_FEATURE_KEY,
      context.getHandler(),
    );

    if (!meta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();

    // Skip if UsageLimitGuard already handled the increment atomically
    // This flag is set by the guard when using checkAndIncrementWithCredits
    if (request.usageAlreadyIncremented) {
      return next.handle();
    }

    const tenantId = String(request.tenantId || request.user?.tenantId);
    const userId: string | undefined = request.user?.id;

    return next.handle().pipe(
      tap({
        next: () => {
          // Using incrementUsage because this interceptor runs AFTER the request succeeds
          // The UsageLimitGuard should have already verified limits before the request was processed
          this.usageService
            .incrementUsageUnchecked(tenantId, meta.feature, userId, {
              endpoint: request.url,
              method: request.method,
              timestamp: new Date().toISOString(),
            })
            .catch((error: Error) => {
              console.error(
                `[UsageTracking] Failed to increment usage for tenant ${tenantId}, feature ${meta.feature}:`,
                error,
              );
            });
        },
        error: (error: Error) => {
          console.error(
            `[UsageTracking] Request failed for tenant ${tenantId}, feature ${meta.feature}:`,
            error.message,
          );
        },
      }),
    );
  }
}
