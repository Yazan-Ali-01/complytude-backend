import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18n, I18nService } from 'nestjs-i18n';
import { EntitlementEnforcementService } from '../../modules/entitlements/services/entitlement-enforcement.service';
import { CommonI18n } from '../constants';
import {
  TRACK_USAGE_KEY,
  TrackUsageOptions,
} from '../decorators/track-usage.decorator';

/**
 * Usage Enforcement Guard
 *
 * Enforces quota limits and tracks usage for features marked with @TrackUsage decorator.
 * Integrates with EntitlementEnforcementService for credit fallback.
 *
 * Usage:
 * ```typescript
 * @AuthOptions({ tenant: true })
 * @UseGuards(UsageEnforcementGuard)
 * @TrackUsage('documents_per_month')
 * @Post('generate')
 * async generateDocument() { ... }
 * ```
 *
 * Behavior:
 * - If allowed: Attaches result to request.usageResult, allows request to proceed
 * - If denied: Throws 402 Payment Required with structured error body
 *
 * Error Response (402):
 * ```json
 * {
 *   "statusCode": 402,
 *   "message": "Quota exceeded for documents_per_month",
 *   "feature": "documents_per_month",
 *   "limit": 100,
 *   "used": 100,
 *   "requested": 1,
 *   "creditsAvailable": 0,
 *   "upgradeUrl": "/plans"
 * }
 * ```
 */
@Injectable()
export class UsageEnforcementGuard implements CanActivate {
  private readonly logger = new Logger(UsageEnforcementGuard.name);

  constructor(
    private reflector: Reflector,
    private enforcementService: EntitlementEnforcementService,
    @I18n() private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get @TrackUsage metadata
    const trackUsageOptions = this.reflector.getAllAndOverride<
      TrackUsageOptions | undefined
    >(TRACK_USAGE_KEY, [context.getHandler(), context.getClass()]);

    // If no @TrackUsage decorator, allow access
    if (!trackUsageOptions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenant = request.auth?.tenant;

    // Ensure tenant context is available
    if (!tenant || !tenant.tenantId) {
      throw new UnauthorizedException(
        this.i18n.t(CommonI18n.errors.UNAUTHORIZED) ??
          'Tenant token required for usage enforcement',
      );
    }

    const tenantId = tenant.tenantId as string;
    const userId = tenant.userId as string | undefined;
    const { featureKey, units } = trackUsageOptions;

    // Check entitlement and record usage
    const result = await this.enforcementService.checkAndRecord({
      tenantId,
      featureKey,
      userId,
      units,
      metadata: {
        endpoint: request.url,
        method: request.method,
      },
    });

    // If allowed, attach result to request and proceed
    if (result.allowed) {
      request.usageResult = result;
      const allocationInfo = result.allocations
        ? JSON.stringify(result.allocations)
        : result.source;
      this.logger.debug(
        `Usage allowed: tenant=${tenantId}, feature=${featureKey}, source=${result.source}, allocations=${allocationInfo}`,
      );
      return true;
    }

    // If denied, throw 402 Payment Required
    this.logger.warn(
      `Usage denied: tenant=${tenantId}, feature=${featureKey}, reason=${result.reason}`,
    );

    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        message:
          this.i18n.t(CommonI18n.errors.QUOTA_EXCEEDED) ??
          `Quota exceeded for ${featureKey}`,
        feature: featureKey,
        limit: result.limit,
        used: result.used,
        requested: units,
        creditsAvailable: result.creditsRemaining ?? 0,
        upgradeUrl: '/plans',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
