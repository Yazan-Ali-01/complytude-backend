import { Module } from '@nestjs/common';
import { SessionInvalidationService } from './services/session-invalidation.service';
import { SessionService } from './services/session.service';

/**
 * Redis sessions on their own, so modules that AuthModule depends on (tenants) can end sessions
 * without importing AuthModule. Needs only the global Redis and Config providers.
 */
@Module({
  providers: [SessionService, SessionInvalidationService],
  exports: [SessionService, SessionInvalidationService],
})
export class SessionsModule {}
