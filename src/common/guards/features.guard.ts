import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURES_KEY } from '../decorators/features.decorator';
import { FeaturesService } from '../../modules/workspace/features.service';

@Injectable()
export class FeaturesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private featuresService: FeaturesService,
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
    const workspaceId = String(
      request.workspaceId || request.user?.workspaceId,
    );

    // Ensure workspace context is available
    if (!workspaceId) {
      throw new UnauthorizedException(
        'Workspace context not found. Please authenticate.',
      );
    }

    // Check each required feature
    for (const feature of requiredFeatures) {
      const hasAccess = await this.featuresService.checkFeatureAccess(
        workspaceId,
        feature,
      );

      if (!hasAccess) {
        throw new ForbiddenException(
          `Access denied. Your plan does not include the "${feature}" feature. Please upgrade your plan.`,
        );
      }
    }

    return true;
  }
}
