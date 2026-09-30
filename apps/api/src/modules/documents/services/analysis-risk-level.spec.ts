import { resultForRiskLevel } from './analysis-risk-level';

const RESULT = {
  summary: 'Three issues.',
  findings: [
    { clauseId: 'C1', riskLevel: 'high' },
    { clauseId: 'C1', riskLevel: 'medium' },
    { clauseId: 'C2', riskLevel: 'low' },
  ],
  clauseVerdicts: [
    { clauseId: 'C1', status: 'violated', reason: 'Hours' },
    { clauseId: 'C2', status: 'unclear', reason: 'Leave' },
    { clauseId: 'C3', status: 'compliant', reason: 'Notice' },
  ],
};

describe('resultForRiskLevel', () => {
  it('shows everything on a full plan, and a missing result as is', () => {
    expect(resultForRiskLevel(RESULT, 'full')).toBe(RESULT);
    expect(resultForRiskLevel(RESULT, undefined)).toBe(RESULT);
    expect(resultForRiskLevel(null, 'critical_only')).toBeNull();
  });

  it('shows only high-risk findings on critical_only, and keeps the reasons of their clauses', () => {
    expect(resultForRiskLevel(RESULT, 'critical_only')).toMatchObject({
      findings: [{ clauseId: 'C1', riskLevel: 'high' }],
      hiddenFindings: 2,
      riskAnalysisLevel: 'critical_only',
      clauseVerdicts: [
        { clauseId: 'C1', reason: 'Hours' },
        { clauseId: 'C2', status: 'unclear', reason: '' },
        { clauseId: 'C3', reason: 'Notice' },
      ],
    });
  });

  it('shows no findings or their reasons on none, only the count', () => {
    expect(resultForRiskLevel(RESULT, 'none')).toMatchObject({
      findings: [],
      hiddenFindings: 3,
      clauseVerdicts: [
        { clauseId: 'C1', reason: '' },
        { clauseId: 'C2', reason: '' },
        { clauseId: 'C3', reason: 'Notice' },
      ],
    });
  });
});
