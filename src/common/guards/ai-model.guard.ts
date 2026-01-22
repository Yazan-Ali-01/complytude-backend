import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { RbacService } from '../../modules/rbac/rbac.service';
import { isPremiumModel } from '../../modules/rbac/config/permissions.config';

@Injectable()
export class AiModelGuard implements CanActivate {
  constructor(private readonly rbacService: RbacService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: string } | undefined;

    if (!user || !user.role) {
      throw new ForbiddenException('No role assigned');
    }

    const hasPremiumAccess = this.rbacService.hasPermission(
      user.role,
      'ai:use_premium_models',
    );

    if (hasPremiumAccess) {
      return true;
    }

    const requestedModel = this.extractRequestedModel(request);

    if (!requestedModel) {
      return true;
    }

    if (isPremiumModel(requestedModel)) {
      throw new ForbiddenException(
        `Premium AI model "${requestedModel}" requires elevated permissions. Your current role (${user.role}) does not allow access to premium models.`,
      );
    }

    return true;
  }

  private extractRequestedModel(request: unknown): string | null {
    const req = request as Record<string, unknown>;
    const body = req.body as Record<string, unknown> | undefined;
    const query = req.query as Record<string, unknown> | undefined;

    if (body?.model) {
      return String(body.model);
    }

    if (body?.aiModel) {
      return String(body.aiModel);
    }

    if (body?.ai_model) {
      return String(body.ai_model);
    }

    if (body?.modelId) {
      return String(body.modelId);
    }

    if (body?.model_id) {
      return String(body.model_id);
    }

    if (query?.model) {
      return String(query.model);
    }

    return null;
  }
}
