import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { FeaturesService } from '../../modules/tenant/features.service';

@Injectable()
export class UsageConsumeInterceptor implements NestInterceptor {
  constructor(private featuresService: FeaturesService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      tap(async () => {
        const request = context.switchToHttp().getRequest();
        const { usageFeature, creditsRequired, user } = request;
        const tenantId = request.tenantId || user?.tenantId;

        if (!usageFeature || !tenantId) return;

        // Consume from quota first, then credits if quota exhausted
        await this.featuresService.consumeUsageOrCredits(
          tenantId,
          usageFeature,
          creditsRequired ?? 1,
          user?.userId,
          { endpoint: request.url, method: request.method }
        );
      }),
    );
  }
}
