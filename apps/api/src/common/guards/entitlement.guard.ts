import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nContext } from 'nestjs-i18n';
import { EntitlementResolverService } from '../../modules/entitlements/services/entitlement-resolver.service';
import { I18nKeys } from '../constants/i18n-keys';
import {
  ENTITLEMENT_KEY,
  EntitlementRequirement,
} from '../decorators/require-entitlement.decorator';
import { EffectiveEntitlement } from '../types/entitlement.types';

/**
 * Entitlement Guard
 *
 * Enforces feature access based on tenant's effective entitlements.
 * Replaces the old FeaturesGuard with entitlement-aware logic.
 *
 * Usage:
 * ```typescript
 * @AuthOptions({ tenant: true })
 * @UseGuards(EntitlementGuard)
 * @RequireEntitlement('redlining_enabled')
 * async analyzeContract() { ... }
 * ```
 */
@Injectable()
export class EntitlementGuard implements CanActivate {
  private readonly logger = new Logger(EntitlementGuard.name);

  constructor(
    private reflector: Reflector,
    private resolver: EntitlementResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required entitlements from decorator
    const requirements = this.reflector.getAllAndOverride<
      EntitlementRequirement[]
    >(ENTITLEMENT_KEY, [context.getHandler(), context.getClass()]);

    // If no entitlements are required, allow access
    if (!requirements || requirements.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenant = request.auth?.tenant;
    const i18n = I18nContext.current();

    // Ensure tenant context is available
    if (!tenant || !tenant.tenantId) {
      throw new UnauthorizedException(
        i18n?.t(I18nKeys.UNAUTHORIZED) ?? 'Unauthorized',
      );
    }

    const tenantId = tenant.tenantId as string;

    // Check each required entitlement
    for (const requirement of requirements) {
      const entitlement = await this.resolver.resolveForTenant(
        tenantId,
        requirement.featureKey,
      );

      if (!entitlement) {
        this.logger.warn(
          `Feature not found: ${requirement.featureKey} for tenant ${tenantId}`,
        );
        throw new ForbiddenException({
          message:
            i18n?.t(I18nKeys.FORBIDDEN) ??
            'You do not have access to this feature',
          feature: requirement.featureKey,
          statusCode: 403,
        });
      }

      // Check if entitlement meets requirement
      if (!this.meetsRequirement(entitlement, requirement)) {
        this.logger.warn(
          `Entitlement requirement not met: ${requirement.featureKey} for tenant ${tenantId}`,
        );
        throw new ForbiddenException({
          message:
            i18n?.t(I18nKeys.FORBIDDEN) ??
            'Your plan does not include this feature',
          feature: requirement.featureKey,
          required: this.getRequirementDescription(requirement),
          current: this.getEntitlementDescription(entitlement),
          statusCode: 403,
        });
      }
    }

    return true;
  }

  /**
   * Check if effective entitlement meets the requirement
   */
  private meetsRequirement(
    entitlement: EffectiveEntitlement,
    requirement: EntitlementRequirement,
  ): boolean {
    // Boolean check
    if (requirement.value_bool !== undefined) {
      return entitlement.value_bool === requirement.value_bool;
    }

    // Text value check (exact match)
    if (requirement.value_text !== undefined) {
      return entitlement.value_text === requirement.value_text;
    }

    // Integer value check (exact match)
    if (requirement.value_int !== undefined) {
      return entitlement.value_int === requirement.value_int;
    }

    // Minimum value check (for quota/capacity)
    if (requirement.minValue !== undefined) {
      const value = entitlement.value_int ?? 0;
      // -1 means unlimited
      if (value === -1) return true;
      return value >= requirement.minValue;
    }

    // Default: for simple boolean features, check if value_bool is true
    if (entitlement.feature_type === 'boolean') {
      return entitlement.value_bool === true;
    }

    // For quota/capacity features without specific requirement, check if > 0 or unlimited
    if (
      entitlement.feature_type === 'quota' ||
      entitlement.feature_type === 'capacity'
    ) {
      const value = entitlement.value_int ?? 0;
      return value > 0 || value === -1;
    }

    // Default: allow if entitlement exists
    return true;
  }

  /**
   * Get human-readable requirement description
   */
  private getRequirementDescription(
    requirement: EntitlementRequirement,
  ): string {
    if (requirement.value_bool !== undefined) {
      return `${requirement.featureKey} must be ${requirement.value_bool}`;
    }
    if (requirement.value_text !== undefined) {
      return `${requirement.featureKey} must be '${requirement.value_text}'`;
    }
    if (requirement.value_int !== undefined) {
      return `${requirement.featureKey} must be ${requirement.value_int}`;
    }
    if (requirement.minValue !== undefined) {
      return `${requirement.featureKey} must be at least ${requirement.minValue}`;
    }
    return `${requirement.featureKey} is required`;
  }

  /**
   * Get human-readable entitlement description
   */
  private getEntitlementDescription(entitlement: EffectiveEntitlement): string {
    if (entitlement.value_bool !== undefined) {
      return `${entitlement.value_bool}`;
    }
    if (entitlement.value_text !== undefined) {
      return `'${entitlement.value_text}'`;
    }
    if (entitlement.value_int !== undefined) {
      return `${entitlement.value_int}`;
    }
    return 'unknown';
  }
}
