import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nService } from 'nestjs-i18n';
import { FEATURES_KEY } from '../decorators/features.decorator';
import { FeaturesService } from '../../modules/tenant/features.service';

@Injectable()
export class FeaturesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private featuresService: FeaturesService,
    private readonly i18n: I18nService,
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

    // Ensure tenant context is available
    if (!tenantId) {
      throw new UnauthorizedException(this.i18n.t('common.UNAUTHORIZED'));
    }

    // Check each required feature
    for (const feature of requiredFeatures) {
      const hasAccess = await this.featuresService.checkFeatureAccess(
        tenantId,
        feature,
      );

      if (!hasAccess) {
        throw new ForbiddenException(this.i18n.t('common.FORBIDDEN'));
      }
    }

    return true;
  }
}
