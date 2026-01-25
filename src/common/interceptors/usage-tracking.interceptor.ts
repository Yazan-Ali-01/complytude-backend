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
  USAGE_INCREMENT_KEY,
} from '../decorators/usage-quota.decorator';
import { UsageTrackingService } from '../../modules/tenants/usage-tracking.service';
import { MeteredFeature } from '../../modules/tenants/entities/tenant-features.interface';

@Injectable()
export class UsageTrackingInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private usageService: UsageTrackingService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const feature = this.reflector.get<MeteredFeature>(
      USAGE_FEATURE_KEY,
      context.getHandler(),
    );

    const incrementMeta = this.reflector.get<{
      feature: MeteredFeature;
      delta: number;
    }>(USAGE_INCREMENT_KEY, context.getHandler());

    if (!feature && !incrementMeta) {
      return next.handle();
    }

    const featureToTrack = incrementMeta?.feature || feature;
    // Note: delta from incrementMeta is available for future use when incrementUsage supports variable deltas
    const _delta = incrementMeta?.delta || 1;

    const request = context.switchToHttp().getRequest();
    const tenantId = String(request.tenantId || request.user?.tenantId);
    const userId: string | undefined = request.user?.id;

    return next.handle().pipe(
      tap({
        next: () => {
          this.usageService
            .incrementUsage(tenantId, featureToTrack, userId, {
              endpoint: request.url,
              method: request.method,
              timestamp: new Date().toISOString(),
            })
            .catch((error: Error) => {
              console.error(
                `[UsageTracking] Failed to increment usage for tenant ${tenantId}, feature ${featureToTrack}:`,
                error,
              );
            });
        },
        error: (error: Error) => {
          console.error(
            `[UsageTracking] Request failed for tenant ${tenantId}, feature ${featureToTrack}:`,
            error.message,
          );
        },
      }),
    );
  }
}
