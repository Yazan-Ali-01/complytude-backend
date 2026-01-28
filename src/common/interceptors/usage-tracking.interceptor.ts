import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import {
  USAGE_FEATURE_KEY,
  UsageQuotaMeta,
} from '../decorators/usage-quota.decorator';
import { UsageTrackingService } from '../../modules/tenants/usage-tracking.service';

@Injectable()
export class UsageTrackingInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private usageService: UsageTrackingService,
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
          this.usageService
            .incrementUsage(tenantId, meta.feature, userId, {
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
