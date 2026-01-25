import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nContext } from 'nestjs-i18n';
import { FEATURES_KEY } from '../decorators/features.decorator.js';
import { I18nKeys } from '../constants/i18n-keys.js';

// Service injection token for FeaturesService
export const FEATURES_SERVICE = Symbol('FEATURES_SERVICE');

export interface IFeaturesService {
  checkFeatureAccess(tenantId: string, feature: string): Promise<boolean>;
}

@Injectable()
export class FeaturesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(FEATURES_SERVICE) private featuresService: IFeaturesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required features from decorator
    const requiredFeatures = this.reflector.getAllAndOverride<string[]>(
      FEATURES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no features are required, allow access
    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenantId = String(request.tenantId || request.user?.tenantId);
    const i18n = I18nContext.current();

    // Ensure tenant context is available
    if (!tenantId) {
      throw new UnauthorizedException(
        i18n?.t(I18nKeys.UNAUTHORIZED) ?? 'Unauthorized',
      );
    }

    // Check each required feature
    for (const feature of requiredFeatures) {
      const hasAccess = await this.featuresService.checkFeatureAccess(
        tenantId,
        feature,
      );

      if (!hasAccess) {
        throw new ForbiddenException(
          i18n?.t(I18nKeys.FORBIDDEN) ?? 'Forbidden',
        );
      }
    }

    return true;
  }
}
