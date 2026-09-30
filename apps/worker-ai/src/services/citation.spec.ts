import { baselineRiskOf, citationOf, finalRisk } from './citation';

describe('citations and baseline risk from ruleset data', () => {
  it('cites the authority, ruleset, version, article and title', () => {
    expect(
      citationOf({
        authorityName: 'Dubai Multi Commodities Centre',
        rulesetName: 'DMCCA Company Regulations 2024',
        rulesetKey: 'dmcc_company_regulations_2024',
        version: '1.0.0',
        article: 'Art. 32-34',
        section: 'Section 6',
        clauseTitle: 'Bearer Shares Prohibition',
      }),
    ).toBe(
      'Dubai Multi Commodities Centre — DMCCA Company Regulations 2024 v1.0.0, Art. 32-34: Bearer Shares Prohibition',
    );
  });

  it('falls back to the section, the ruleset key, and drops what is missing', () => {
    expect(
      citationOf({
        rulesetKey: 'uae_labour_law',
        section: 'Section 3',
        clauseTitle: '  ',
      }),
    ).toBe('uae_labour_law, Section 3');
    expect(citationOf({})).toBe('Unknown ruleset');
  });

  it('maps the clause severity to a baseline risk level', () => {
    expect(baselineRiskOf({ severity: 'critical' })).toBe('high');
    expect(baselineRiskOf({ severity: 'High' })).toBe('high');
    expect(baselineRiskOf({ severity: 'medium' })).toBe('medium');
    expect(baselineRiskOf({ severity: 'low' })).toBe('low');
    expect(baselineRiskOf({ severity: 'urgent' })).toBeNull();
    expect(baselineRiskOf({})).toBeNull();
  });

  it('lets the model raise the baseline, never lower it', () => {
    expect(finalRisk('medium', 'high')).toEqual({
      riskLevel: 'high',
      raised: true,
    });
    expect(finalRisk('high', 'low')).toEqual({
      riskLevel: 'high',
      raised: false,
    });
    expect(finalRisk('medium', 'medium')).toEqual({
      riskLevel: 'medium',
      raised: false,
    });
    expect(finalRisk(null, 'low')).toEqual({ riskLevel: 'low', raised: false });
  });
});
