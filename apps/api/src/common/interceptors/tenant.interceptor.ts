import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export interface TenantContext {
  tenantId: string;
  userId?: string;
  role?: string;
}

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic || !request.user) {
      return next.handle();
    }

    if (request.user.tenantId) {
      request.tenantContext = {
        tenantId: request.user.tenantId,
        userId: request.user.userId,
        role: request.user.role,
      };
    }

    return next.handle();
  }
}