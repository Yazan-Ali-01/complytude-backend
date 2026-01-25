import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { RbacService } from '../../rbac/services/rbac.service';
import { Permissions } from '../../rbac/constants/permissions.constant';
import { TenantRole } from '../../rbac/constants/roles.constant';

export interface ModelAccessInfo {
  model: string;
  isPremium: boolean;
  requiredPermission: string;
  allowedRoles: TenantRole[];
}

@Injectable()
export class ModelGateService {
  private readonly logger = new Logger(ModelGateService.name);

  private readonly PREMIUM_MODELS = ['jais-70b', 'claude-3.5-sonnet', 'gpt-4-turbo'] as const;

  constructor(private readonly rbacService: RbacService) {}

  async validateModelAccess(model: string, userRole: string): Promise<void> {
    this.logger.debug(`Validating model access for: ${model}, role: ${userRole}`);

    const isPremium = this.isPremiumModel(model);
    if (!isPremium) {
      this.logger.debug(`Model ${model} is not premium, access granted`);
      return;
    }

    const canUsePremium = await this.rbacService.roleHasPermission(
      userRole as TenantRole,
      Permissions.AI.USE_PREMIUM_MODELS,
    );

    if (!canUsePremium) {
      this.logger.warn(`User with role ${userRole} denied access to premium model: ${model}`);
      throw new ForbiddenException(
        `Model "${model}" requires legal_counsel or tenant_admin role`,
      );
    }

    this.logger.debug(`User with role ${userRole} granted access to premium model: ${model}`);
  }

  async validateModelAccessForUser(
    model: string,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    this.logger.debug(`Validating model access for user ${userId} in tenant ${tenantId}`);

    const userPermissions = await this.rbacService.getUserPermissions(userId, tenantId);
    const hasPremiumAccess = userPermissions.has(Permissions.AI.USE_PREMIUM_MODELS);

    if (this.isPremiumModel(model) && !hasPremiumAccess) {
      throw new ForbiddenException(
        `Model "${model}" requires the ai:use_premium_models permission`,
      );
    }
  }

  isPremiumModel(model: string): boolean {
    return this.PREMIUM_MODELS.includes(model as (typeof this.PREMIUM_MODELS)[number]);
  }

  getPremiumModels(): string[] {
    return [...this.PREMIUM_MODELS];
  }

  getModelAccessInfo(model: string): ModelAccessInfo {
    const isPremium = this.isPremiumModel(model);
    return {
      model,
      isPremium,
      requiredPermission: Permissions.AI.USE_PREMIUM_MODELS,
      allowedRoles: isPremium
        ? [TenantRoles.TENANT_ADMIN, TenantRoles.LEGAL_COUNSEL]
        : [],
    };
  }

  async checkModelAccess(model: string, userRole: string): Promise<boolean> {
    try {
      await this.validateModelAccess(model, userRole);
      return true;
    } catch {
      return false;
    }
  }
}

const TenantRoles = {
  TENANT_ADMIN: 'tenant_admin' as const,
  LEGAL_COUNSEL: 'legal_counsel' as const,
  MEMBER: 'member' as const,
  VIEWER: 'viewer' as const,
};