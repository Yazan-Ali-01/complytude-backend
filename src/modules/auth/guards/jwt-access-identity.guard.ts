import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JWT_ACCESS_STRATEGY, JWT_IDENTITY_STRATEGY } from '../strategies';

@Injectable()
export class JwtAccessAndIdentityGuard extends AuthGuard([
  JWT_IDENTITY_STRATEGY,
  JWT_ACCESS_STRATEGY,
]) {
  handleRequest(err: any, user: any, _info: any) {
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException('Invalid or missing authentication token')
      );
    }
    return user;
  }
}
