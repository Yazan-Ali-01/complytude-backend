import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { I18nContext } from 'nestjs-i18n';
import { CommonI18n } from '../constants/i18n.constants';
import { GLOBAL_RATE_LIMIT, type RateLimitRule } from './rate-limit.constants';
import { RATE_LIMIT_KEY } from './rate-limit.decorator';
import { RateLimitService } from './rate-limit.service';

type AuthedRequest = FastifyRequest & {
  auth?: {
    identity?: { userId?: string };
    tenant?: { userId?: string; tenantId?: string };
  };
};

/**
 * Global guard (after JwtAuthGuard, so tenant and user keys are known): the global per-IP limit
 * on every route, plus the route's own @RateLimit rules. 429 with Retry-After when exceeded.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const rules = [
      GLOBAL_RATE_LIMIT,
      ...(this.reflector.getAllAndOverride<RateLimitRule[] | undefined>(
        RATE_LIMIT_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? []),
    ];

    for (const rule of rules) {
      const subject = this.subject(rule, request);
      if (!subject) continue;
      const decision = await this.rateLimit.hit(rule, subject);
      if (!decision.allowed) {
        context
          .switchToHttp()
          .getResponse<FastifyReply>()
          .header('Retry-After', String(decision.retryAfterSeconds));
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message:
              I18nContext.current()?.t(CommonI18n.errors.TOO_MANY_REQUESTS) ??
              'Too many requests, try again later',
            retryAfterSeconds: decision.retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return true;
  }

  private subject(rule: RateLimitRule, request: AuthedRequest): string | null {
    switch (rule.by) {
      case 'ip':
        return request.ip ?? null;
      case 'email': {
        const email = (request.body as { email?: unknown } | undefined)?.email;
        return typeof email === 'string' && email.trim()
          ? email.trim().toLowerCase()
          : null;
      }
      case 'tenant':
        return request.auth?.tenant?.tenantId ?? null;
      case 'user':
        return (
          request.auth?.tenant?.userId ?? request.auth?.identity?.userId ?? null
        );
    }
  }
}
