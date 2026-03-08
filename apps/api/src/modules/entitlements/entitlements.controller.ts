import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { I18n, I18nService } from 'nestjs-i18n';
import type { FeatureKey, PlanKey } from 'src/common/types/entitlement.types';
import { CommonI18n } from '../../common/constants';
import {
  getAllPlanEntitlements,
  getFeatureDefinition,
} from '../../common/constants/plan-entitlements.constant';
import { PlansRepository } from '../../repositories/plans/plans.repository';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies/jwt-payload.interface';
import {
  CurrentEntitlementsResponseDto,
  EffectiveEntitlementDto,
  PlanResponseDto,
} from './dto/entitlement-response.dto';
import { EntitlementResolverService } from './services/entitlement-resolver.service';

/**
 * Entitlements Controller
 *
 * Endpoints for querying entitlements and plan information.
 */
@Controller('entitlements')
@ApiTags('entitlements')
export class EntitlementsController {
  constructor(
    private readonly resolver: EntitlementResolverService,
    private readonly plansRepository: PlansRepository,
    @I18n() private readonly i18n: I18nService,
  ) {}

  /**
   * Get current tenant's effective entitlements
   */
  @Get('current')
  @AuthOptions({ tenant: true })
  @ApiOperation({ summary: 'Get current tenant entitlements' })
  @ApiResponse({
    status: 200,
    description: 'Effective entitlements for current tenant',
    type: CurrentEntitlementsResponseDto,
  })
  async getCurrentEntitlements(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<CurrentEntitlementsResponseDto> {
    const { entitlements, plan } = await this.resolver.resolveAllForTenant(
      user.tenantId,
    );

    // Convert to DTO format
    const entitlementsDto: Record<string, EffectiveEntitlementDto> = {};
    for (const [key, value] of Object.entries(entitlements)) {
      entitlementsDto[key] = {
        featureKey: value.feature_key,
        featureType: value.feature_type,
        valueBool: value.value_bool,
        valueInt: value.value_int,
        valueText: value.value_text,
        source: value.source,
      };
    }

    return {
      tenantId: user.tenantId,
      plan,
      entitlements: entitlementsDto,
    };
  }

  /**
   * Get all available plans with their entitlements
   */
  @Get('plans')
  @ApiOperation({ summary: 'List all available plans' })
  @ApiResponse({
    status: 200,
    description: 'List of all plans with entitlements',
    type: [PlanResponseDto],
  })
  async listPlans(): Promise<PlanResponseDto[]> {
    const plans = await this.plansRepository.findAll();

    return plans.map((plan) => {
      const planEntitlements = getAllPlanEntitlements(plan.key);
      const entitlementsDto: Record<string, EffectiveEntitlementDto> = {};

      for (const [featureKey, value] of Object.entries(planEntitlements)) {
        const featureDef = getFeatureDefinition(featureKey as FeatureKey);
        if (!featureDef) continue;

        entitlementsDto[featureKey] = {
          featureKey,
          featureType: featureDef.feature_type,
          valueBool: value.value_bool,
          valueInt: value.value_int,
          valueText: value.value_text,
          source: 'plan',
        };
      }

      return {
        id: plan.id,
        key: plan.key,
        name: plan.name,
        description: plan.description ?? '',
        priceMonthly: plan.price_monthly,
        priceCurrency: plan.price_currency,
        billingPeriod: plan.billing_period,
        entitlements: entitlementsDto,
      };
    });
  }

  /**
   * Get specific plan details with entitlements
   */
  @Get('plans/:key')
  @ApiOperation({ summary: 'Get plan details by key' })
  @ApiResponse({
    status: 200,
    description: 'Plan details with entitlements',
    type: PlanResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Plan not found',
  })
  async getPlanByKey(@Param('key') key: PlanKey): Promise<PlanResponseDto> {
    const plan = await this.plansRepository.findByKey(key);

    if (!plan) {
      throw new NotFoundException(
        this.i18n.t(CommonI18n.errors.NOT_FOUND) ??
          `Plan with key "${key}" not found`,
      );
    }

    const planEntitlements = getAllPlanEntitlements(plan.key);
    const entitlementsDto: Record<string, EffectiveEntitlementDto> = {};

    for (const [featureKey, value] of Object.entries(planEntitlements)) {
      const featureDef = getFeatureDefinition(featureKey as FeatureKey);
      if (!featureDef) continue;

      entitlementsDto[featureKey] = {
        featureKey,
        featureType: featureDef.feature_type,
        valueBool: value.value_bool,
        valueInt: value.value_int,
        valueText: value.value_text,
        source: 'plan',
      };
    }

    return {
      id: plan.id,
      key: plan.key,
      name: plan.name,
      description: plan.description ?? '',
      priceMonthly: plan.price_monthly,
      priceCurrency: plan.price_currency,
      billingPeriod: plan.billing_period,
      entitlements: entitlementsDto,
    };
  }
}
