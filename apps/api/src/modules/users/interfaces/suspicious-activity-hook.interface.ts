/**
 * Placeholder for suspicious-activity reporting (implementation: COM-109).
 * Wire a concrete implementation when COM-109 is delivered.
 */

export interface SuspiciousActivityPayload {
  userId: string;
  /** High-level reason code for analytics / alerting */
  reason: string;
  metadata?: Record<string, unknown>;
}

/**
 * Optional hook invoked when security-sensitive user actions occur.
 * Implement and register in DI when COM-109 is implemented.
 */
export interface SuspiciousActivityHook {
  reportSuspiciousActivity(
    payload: SuspiciousActivityPayload,
  ): void | Promise<void>;
}
