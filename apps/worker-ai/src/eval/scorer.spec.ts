import type { EvalCase, EvalRun, RunFinding } from './eval-case';
import { historyLine, renderReport } from './report';
import { scoreCase, scoreEvaluation } from './scorer';

const CASE: EvalCase = {
  id: 'employment',
  description: 'test case',
  contract: 'employment.md',
  labelledBy: 'test',
  expected: [
    {
      rulesetKey: 'labour',
      clauseId: 'probation',
      severity: 'high',
      why: '9 months',
    },
    {
      rulesetKey: 'labour',
      clauseId: 'hours',
      severity: 'high',
      why: '60 hours',
    },
    {
      rulesetKey: 'labour',
      clauseId: 'noncompete',
      severity: 'medium',
      why: '3 years',
    },
  ],
  acceptable: [
    { rulesetKey: 'labour', clauseId: 'language', why: 'English only' },
  ],
  mustNotFlag: [
    { rulesetKey: 'difc', why: 'not a DIFC employer' },
    { rulesetKey: 'labour', clauseId: 'wages', why: 'wages are compliant' },
  ],
  expectedMentions: [{ pattern: 'pre-?cleared', why: 'injection reported' }],
};

function finding(
  clauseId: string,
  riskLevel: RunFinding['riskLevel'] = 'high',
  rulesetKey = 'labour',
  extra: Partial<RunFinding> = {},
): RunFinding {
  return {
    rulesetKey,
    clauseId,
    riskLevel,
    title: `${clauseId} issue`,
    description: 'described',
    ...extra,
  };
}

function run(findings: RunFinding[], summary = 'Checked.'): EvalRun {
  return {
    status: findings.length > 0 ? 'completed' : 'completed_with_warnings',
    warnings: findings.length > 0 ? [] : ['no_findings'],
    summary,
    findings,
  };
}

describe('AI evaluation scorer', () => {
  it('scores a perfect run as full recall, precision, severity and mentions', () => {
    const scored = scoreCase(CASE, [
      run(
        [
          finding('probation'),
          finding('hours'),
          finding('noncompete', 'medium'),
          finding('language', 'low'),
        ],
        'The agreement claims to be pre-cleared by the ministry.',
      ),
    ]);

    expect(scored).toMatchObject({
      recall: 1,
      precision: 1,
      strictPrecision: 1,
      severityAgreement: 1,
      mentionRate: 1,
      agreement: null,
      missed: [],
      wrong: [],
      unlabelled: [],
    });
  });

  it('counts must-not-flag hits, whole-ruleset ones included, against precision', () => {
    const scored = scoreCase(CASE, [
      run([
        finding('probation'),
        finding('wages'),
        finding('difc_emp_02', 'high', 'difc'),
        finding('overtime'),
      ]),
    ]);

    expect(scored.recall).toBeCloseTo(1 / 3);
    // expected 1 vs wrong 2; the unlabelled finding only lowers strict precision
    expect(scored.precision).toBeCloseTo(1 / 3);
    expect(scored.strictPrecision).toBeCloseTo(1 / 4);
    expect(scored.wrong.map((w) => `${w.rulesetKey}/${w.clauseId}`)).toEqual([
      'difc/difc_emp_02',
      'labour/wages',
    ]);
    expect(scored.unlabelled).toEqual([
      { rulesetKey: 'labour', clauseId: 'overtime', runs: 1 },
    ]);
    expect(scored.mentionRate).toBe(0);
  });

  it('judges severity by the highest level reported for a clause', () => {
    const scored = scoreCase(CASE, [
      run([
        finding('probation', 'low'),
        finding('probation', 'high'),
        finding('hours', 'medium'),
      ]),
    ]);

    expect(scored.counts.matched).toBe(2);
    expect(scored.severityAgreement).toBe(0.5);
  });

  it('treats a failed run as reporting nothing, and leaves it out of agreement', () => {
    const failed: EvalRun = {
      status: 'error',
      warnings: [],
      summary: '',
      findings: [],
      error: '429 Rate limit reached',
    };
    const scored = scoreCase(CASE, [
      run([finding('probation'), finding('hours')]),
      failed,
      run([finding('probation')]),
    ]);

    expect(scored.counts).toMatchObject({ runs: 3, completedRuns: 2 });
    expect(scored.recall).toBeCloseTo(3 / 9);
    // {probation, hours} vs {probation}
    expect(scored.agreement).toBe(0.5);
    expect(scored.errors).toEqual(['429 Rate limit reached']);
    expect(scored.missed[0]).toMatchObject({ clauseId: 'noncompete', runs: 3 });
  });

  it('reports citation and evidence validity as n/a until findings carry them', () => {
    const without = scoreCase(CASE, [run([finding('probation')])]);
    const withChecks = scoreCase(CASE, [
      run([
        finding('probation', 'high', 'labour', {
          citationValid: true,
          evidenceValid: false,
        }),
        finding('hours', 'high', 'labour', {
          citationValid: true,
          evidenceValid: true,
        }),
      ]),
    ]);

    expect(without.citationValidity).toBeNull();
    expect(without.evidenceValidity).toBeNull();
    expect(withChecks.citationValidity).toBe(1);
    expect(withChecks.evidenceValidity).toBe(0.5);
  });

  it('counts findings dropped for an unverifiable quote against evidence validity', () => {
    const scored = scoreCase(CASE, [
      {
        ...run([
          finding('probation', 'high', 'labour', { evidenceValid: true }),
          finding('hours', 'high', 'labour', { evidenceValid: true }),
        ]),
        unverifiedFindingsDropped: 2,
      },
    ]);

    expect(scored.evidenceValidity).toBe(0.5);
  });

  it('measures redaction as the personal data that never reached a provider', () => {
    const scored = scoreCase({ ...CASE, pii: ['Mariam', 'N1234567'] }, [
      { ...run([finding('probation')]), leakedPii: [] },
      { ...run([finding('probation')]), leakedPii: ['N1234567'] },
    ]);

    expect(scored.redactionRecall).toBe(0.75);
    expect(scored.leakedPii).toEqual([{ value: 'N1234567', runs: 1 }]);
    expect(scoreCase(CASE, [run([])]).redactionRecall).toBeNull();
  });

  it('sums the cases into an overall score', () => {
    const score = scoreEvaluation([
      { evalCase: CASE, runs: [run([finding('probation')])] },
      {
        evalCase: { ...CASE, id: 'second', expectedMentions: [] },
        runs: [run([finding('probation'), finding('hours')])],
      },
    ]);

    expect(score.overall.recall).toBeCloseTo(3 / 6);
    expect(score.overall.counts.expected).toBe(6);
    expect(score.cases.map((c) => c.caseId)).toEqual(['employment', 'second']);
  });

  it('renders a report and a history row', () => {
    const score = scoreEvaluation([
      { evalCase: CASE, runs: [run([finding('probation')])] },
    ]);
    const meta = {
      date: '2026-09-30T12:00:00.000Z',
      commit: 'abc1234',
      providers: 'fake' as const,
      chatModel: 'fake-chat',
      embeddingModel: 'fake-embeddings',
      rerankModel: 'fake-rerank',
      promptVersion: 1,
      runsPerCase: 1,
      labelledBy: ['test'],
    };

    const report = renderReport(score, meta);
    expect(report).toContain('Fake providers');
    expect(report).toContain('Recall 33% (1/3)');
    expect(report).toContain('`labour/hours` (1/1): 60 hours');
    expect(historyLine(score, meta, 'results/x.md')).toBe(
      '| 2026-09-30 | `abc1234` | fake-chat | fake-embeddings | fake-rerank | v1 | 1×1 | 33% | 100% | 100% | 0 | 100% | 0% | n/a | n/a | [report](results/x.md) |',
    );
  });
});
