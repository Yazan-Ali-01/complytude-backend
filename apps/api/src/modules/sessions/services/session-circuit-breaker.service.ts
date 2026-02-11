import { RedisService } from '@complytude/shared/redis/redis.service';
import { Injectable, Logger } from '@nestjs/common';
import { CIRCUIT_BREAKER_CONFIG } from 'src/modules/auth/constants/session.constants';

/**
 * SessionCircuitBreakerService - Circuit breaker for Redis session validation
 *
 * Implements the Strangler Fig pattern with circuit breaker:
 * - Monitors Redis health via periodic health checks
 * - Switches between Redis (primary) and PostgreSQL (fallback) based on health
 * - Tracks failure rate and automatically opens/closes circuit
 *
 * Circuit States:
 * 1. CLOSED (healthy) - Use Redis for session validation
 * 2. OPEN (unhealthy) - Use PostgreSQL fallback, skip Redis
 * 3. HALF_OPEN (recovering) - Try Redis with caution, ready to reopen if fails
 *
 * Thresholds:
 * - Failure threshold: 5 consecutive Redis failures → OPEN circuit
 * - Success threshold: 3 consecutive Redis successes → CLOSE circuit
 * - Timeout: Check health every 10 seconds when OPEN
 *
 * Strangler Fig Strategy:
 * Phase 1 (Current): Write to both Redis and PostgreSQL, read from Redis with DB fallback
 * Phase 2 (After migration): Write only to Redis, read from Redis with DB fallback
 * Phase 3 (Final): Redis-only, remove PostgreSQL entirely
 */
@Injectable()
export class SessionCircuitBreakerService {
  private readonly logger = new Logger(SessionCircuitBreakerService.name);

  // Circuit breaker state
  private circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastHealthCheck: Date | null = null;

  // Thresholds from configuration
  private readonly FAILURE_THRESHOLD = CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD;
  private readonly SUCCESS_THRESHOLD = CIRCUIT_BREAKER_CONFIG.SUCCESS_THRESHOLD;
  private readonly HEALTH_CHECK_INTERVAL_MS =
    CIRCUIT_BREAKER_CONFIG.HEALTH_CHECK_INTERVAL_MS;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Check if Redis is available (circuit is CLOSED or HALF_OPEN)
   * @returns boolean - true if should try Redis, false if should use DB fallback
   */
  shouldUseRedis(): boolean {
    // If circuit is OPEN, check if enough time has passed to try again
    if (this.circuitState === 'OPEN') {
      const now = new Date();
      const timeSinceLastCheck = this.lastHealthCheck
        ? now.getTime() - this.lastHealthCheck.getTime()
        : Infinity;

      if (timeSinceLastCheck >= this.HEALTH_CHECK_INTERVAL_MS) {
        // Transition to HALF_OPEN - try Redis cautiously
        this.circuitState = 'HALF_OPEN';
        this.logger.log(
          'Circuit breaker: OPEN → HALF_OPEN (attempting recovery)',
        );
        return true;
      }

      // Circuit still open, use database fallback
      return false;
    }

    // Circuit is CLOSED or HALF_OPEN - try Redis
    return true;
  }

  /**
   * Record successful Redis operation
   * Used to close circuit after recovery
   */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses++;

    if (
      this.circuitState === 'HALF_OPEN' &&
      this.consecutiveSuccesses >= this.SUCCESS_THRESHOLD
    ) {
      // Recovered! Close circuit
      this.circuitState = 'CLOSED';
      this.consecutiveSuccesses = 0;
      this.logger.log(
        `Circuit breaker: HALF_OPEN → CLOSED (Redis recovered after ${this.SUCCESS_THRESHOLD} successes)`,
      );
    }
  }

  /**
   * Record Redis failure
   * Opens circuit if failure threshold exceeded
   */
  recordFailure(error: Error): void {
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures++;
    this.lastHealthCheck = new Date();

    if (this.circuitState === 'HALF_OPEN') {
      // Failed during recovery - reopen circuit immediately
      this.circuitState = 'OPEN';
      this.consecutiveFailures = 0;
      this.logger.error(
        `Circuit breaker: HALF_OPEN → OPEN (Redis still unhealthy). Error: ${error.message}`,
      );
      return;
    }

    if (
      this.circuitState === 'CLOSED' &&
      this.consecutiveFailures >= this.FAILURE_THRESHOLD
    ) {
      // Too many failures - open circuit
      this.circuitState = 'OPEN';
      this.logger.error(
        `Circuit breaker: CLOSED → OPEN (${this.FAILURE_THRESHOLD} consecutive Redis failures). ` +
          `Falling back to PostgreSQL for session validation.`,
      );
    }
  }

  /**
   * Get current circuit state (for monitoring)
   */
  getCircuitState(): {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    lastHealthCheck: Date | null;
  } {
    return {
      state: this.circuitState,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastHealthCheck: this.lastHealthCheck,
    };
  }

  /**
   * Manually reset circuit (for testing/admin operations)
   */
  resetCircuit(): void {
    this.circuitState = 'CLOSED';
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastHealthCheck = null;
    this.logger.log('Circuit breaker manually reset to CLOSED state');
  }
}
