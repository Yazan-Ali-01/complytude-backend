import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtTenantSwitchAuthGuard extends AuthGuard([
  'jwt-temp-auth',
  'jwt',
]) {
  handleRequest(err: any, user: any, _info: any) {
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException(
          'Invalid or missing temporary authentication token',
        )
      );
    }
    return user;
  }
}
