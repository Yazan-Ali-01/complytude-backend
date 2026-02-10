import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SessionService } from '../auth/services/session.service';
import { SessionInvalidationService } from '../auth/services/session-invalidation.service';
import { UserAgentParserService } from '../auth/services/user-agent-parser.service';
import { GeoLocationService } from '../auth/services/geo-location.service';

/**
 * SessionModule - Global module for session management
 *
 * Marked as @Global() so session services are available across all modules
 * without explicit import. This prevents circular dependencies.
 *
 * Architecture pattern:
 * - Session management is a cross-cutting concern (like RBAC, Audit)
 * - Makes SessionService and SessionInvalidationService available everywhere
 * - Eliminates need for AuthModule imports just to access session services
 *
 * Import once in AppModule (before AuthModule):
 * ```typescript
 * @Module({
 *   imports: [SessionModule, AuthModule, ...],
 * })
 * export class AppModule {}
 * ```
 *
 * Usage in any module (no import needed):
 * ```typescript
 * constructor(
 *   private readonly sessionInvalidationService: SessionInvalidationService,
 * ) {}
 * ```
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    SessionService,
    SessionInvalidationService,
    UserAgentParserService,
    GeoLocationService,
  ],
  exports: [
    SessionService,
    SessionInvalidationService,
    UserAgentParserService,
    GeoLocationService,
  ],
})
export class SessionModule {}
