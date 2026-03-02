/**
 * Global setup — runs once before all integration test workers.
 * Implemented in COM-140: starts testcontainers (PostgreSQL, Redis),
 * writes connection config to temp file for workers to read.
 */
export default async function globalSetup(): Promise<void> {
  // Placeholder — COM-140 implements testcontainers lifecycle
}
