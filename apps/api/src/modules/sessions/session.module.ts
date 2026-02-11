import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminSessionService } from './services/admin-session.service';
import { GeoLocationService } from './services/geo-location.service';
import { SessionCircuitBreakerService } from './services/session-circuit-breaker.service';
import { SessionInvalidationService } from './services/session-invalidation.service';
import { SessionService } from './services/session.service';
import { UserAgentParserService } from './services/user-agent-parser.service';

/**
 * SessionModule - Global module for session management with Strangler Fig pattern
 *
 * Marked as @Global() so session services are available across all modules
 * without explicit import. This prevents circular dependencies.
 *
 * Exports:
 * - SessionService: Core session CRUD operations
 * - SessionInvalidationService: Bulk session cleanup for security events
 * - AdminSessionService: System admin operations (tenant-wide, cross-user queries)
 * - SessionCircuitBreakerService: Circuit breaker for Strangler Fig migration
 * - GeoLocationService: IP geolocation using MaxMind
 * - UserAgentParserService: User-Agent parsing with ua-parser-js
 *
 * Architecture pattern:
 * - Session management is a cross-cutting concern (like RBAC, Audit)
 * - Circuit breaker enables zero-downtime migration from PostgreSQL to Redis
 * - All session services available everywhere without explicit imports
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
 *   private readonly sessionCircuitBreaker: SessionCircuitBreakerService,
 * ) {}
 * ```
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    SessionService,
    SessionInvalidationService,
    AdminSessionService,
    SessionCircuitBreakerService,
    UserAgentParserService,
    GeoLocationService,
  ],
  exports: [
    SessionService,
    SessionInvalidationService,
    AdminSessionService,
    SessionCircuitBreakerService,
    UserAgentParserService,
    GeoLocationService,
  ],
})
export class SessionModule {}
