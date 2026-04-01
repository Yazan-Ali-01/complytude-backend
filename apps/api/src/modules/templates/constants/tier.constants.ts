/**
 * Template tier type matching the `template_tier` DB enum.
 * Source of truth: scripts/migrations/006_global_tables.sql
 */
export type TemplateTier = 'essential' | 'full';

/**
 * Hierarchical tier ordering for template access control.
 *
 * A tenant with tier N can access any template whose tier level <= N.
 * Example: `full` (2) can access both `essential` (1) and `full` (2).
 */
export const TIER_HIERARCHY: Record<TemplateTier, number> = {
  essential: 1,
  full: 2,
};
