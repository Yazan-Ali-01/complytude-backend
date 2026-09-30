import {
  ALL_FEATURE_KEYS,
  FEATURE_AVAILABILITY,
  FEATURE_CATALOG,
  PLAN_CATALOG,
} from './plan-entitlements.constant';

/** Unbuilt features (owner's answer to D-4, 2026-10-01): shown as coming soon, never sold. */
const COMING_SOON = [
  'bilingual_quality',
  'custom_playbooks',
  'data_isolation',
  'jurisdictions',
  'license_verifier_lookups',
  'localizer_check',
  'redlining_enabled',
  'regulatory_hub_access',
  'regulatory_queries_per_month',
];

/** How plan copy tends to name the coming-soon features. */
const COMING_SOON_TERMS = [
  'regulatory watch',
  'regulatory hub',
  'chat with law',
  'license',
  'redlin',
  'localizer',
  'jais',
  'bilingual',
  'playbook',
  'isolation',
  'silo',
  'jurisdiction',
];

describe('plan catalog', () => {
  it('gives every feature an availability', () => {
    for (const key of ALL_FEATURE_KEYS) {
      expect(FEATURE_AVAILABILITY).toContain(FEATURE_CATALOG[key].availability);
    }
  });

  it('marks exactly the unbuilt features as coming soon', () => {
    const comingSoon = ALL_FEATURE_KEYS.filter(
      (key) => FEATURE_CATALOG[key].availability === 'coming_soon',
    ).sort();

    expect(comingSoon).toEqual(COMING_SOON);
  });

  it('describes each plan by features that exist (the text is synced to Stripe)', () => {
    for (const [plan, { description }] of Object.entries(PLAN_CATALOG)) {
      const text = description.toLowerCase();
      const named = COMING_SOON_TERMS.filter((term) => text.includes(term));
      expect(`${plan}: ${named.join(', ')}`).toBe(`${plan}: `);
    }
  });
});
