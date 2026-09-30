import type {
  ClauseRef,
  EvalCase,
  EvalRun,
  RunFinding,
  Severity,
} from './eval-case';

/** Raw counts behind the ratios, summed over runs (and over cases for the overall score). */
export interface ScoreCounts {
  runs: number;
  completedRuns: number;
  /** Expected findings over all runs, and how many a run reported. */
  expected: number;
  matched: number;
  /** Findings by label: on an expected, acceptable, must-not-flag or unlabelled clause. */
  findings: number;
  correct: number;
  acceptable: number;
  wrong: number;
  unlabelled: number;
  severityMatches: number;
  mentionsExpected: number;
  mentionsFound: number;
  citationsChecked: number;
  citationsValid: number;
  evidenceChecked: number;
  evidenceValid: number;
  /** Personal-data values checked in outbound payloads, and how many leaked. */
  piiChecked: number;
  piiLeaked: number;
}

export interface Scores {
  /** Expected findings reported / expected findings. A failed run reports nothing. */
  recall: number | null;
  /** (correct + acceptable) / (correct + acceptable + wrong): labelled findings only. */
  precision: number | null;
  /** (correct + acceptable) / all findings: unlabelled findings count as wrong (a lower bound). */
  strictPrecision: number | null;
  /** Matched expected findings whose highest risk level equals the label. */
  severityAgreement: number | null;
  mentionRate: number | null;
  /** null until findings carry something checkable. */
  citationValidity: number | null;
  /** The model's findings whose quote holds up: stored ones re-checked, dropped ones counted as invalid. */
  evidenceValidity: number | null;
  /** Mean pairwise Jaccard similarity of the clauses flagged by the completed runs. */
  agreement: number | null;
  /** Personal-data values that never reached a provider / values checked. */
  redactionRecall: number | null;
}

export interface ClauseTally extends ClauseRef {
  runs: number;
  why?: string;
}

export interface CaseScore extends Scores {
  caseId: string;
  counts: ScoreCounts;
  /** Expected clauses missed by at least one run, with how many runs missed them. */
  missed: ClauseTally[];
  /** Findings resting on a must-not-flag clause, with how many runs reported them. */
  wrong: ClauseTally[];
  /** Findings on clauses the case doesn't label: candidates for new labels. */
  unlabelled: ClauseTally[];
  /** Personal-data values that reached a provider, with how many runs leaked them. */
  leakedPii: Array<{ value: string; runs: number }>;
  statuses: Record<string, number>;
  warnings: Record<string, number>;
  errors: string[];
}

export interface EvalScore {
  cases: CaseScore[];
  overall: Scores & { counts: ScoreCounts };
}

const RISK_ORDER: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

/** A run whose result reached the user; `failed` and thrown attempts reported nothing. */
function isCompleted(run: EvalRun): boolean {
  return run.status === 'completed' || run.status === 'completed_with_warnings';
}

function key(ref: ClauseRef): string {
  return `${ref.rulesetKey}/${ref.clauseId}`;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function emptyCounts(): ScoreCounts {
  return {
    runs: 0,
    completedRuns: 0,
    expected: 0,
    matched: 0,
    findings: 0,
    correct: 0,
    acceptable: 0,
    wrong: 0,
    unlabelled: 0,
    severityMatches: 0,
    mentionsExpected: 0,
    mentionsFound: 0,
    citationsChecked: 0,
    citationsValid: 0,
    evidenceChecked: 0,
    evidenceValid: 0,
    piiChecked: 0,
    piiLeaked: 0,
  };
}

function scoresOf(counts: ScoreCounts, agreement: number | null): Scores {
  const vouched = counts.correct + counts.acceptable;
  return {
    recall: ratio(counts.matched, counts.expected),
    precision: ratio(vouched, vouched + counts.wrong),
    strictPrecision: ratio(vouched, counts.findings),
    severityAgreement: ratio(counts.severityMatches, counts.matched),
    mentionRate: ratio(counts.mentionsFound, counts.mentionsExpected),
    citationValidity: ratio(counts.citationsValid, counts.citationsChecked),
    evidenceValidity: ratio(counts.evidenceValid, counts.evidenceChecked),
    agreement,
    redactionRecall: ratio(
      counts.piiChecked - counts.piiLeaked,
      counts.piiChecked,
    ),
  };
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const shared = [...a].filter((item) => b.has(item)).length;
  return shared / new Set([...a, ...b]).size;
}

function meanPairwiseJaccard(sets: Set<string>[]): number | null {
  if (sets.length < 2) return null;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      total += jaccard(sets[i], sets[j]);
      pairs++;
    }
  }
  return total / pairs;
}

function tally(
  counts: Map<string, ClauseTally>,
  ref: ClauseRef,
  why?: string,
): void {
  const existing = counts.get(key(ref));
  if (existing) existing.runs++;
  else {
    counts.set(key(ref), {
      rulesetKey: ref.rulesetKey,
      clauseId: ref.clauseId,
      runs: 1,
      ...(why && { why }),
    });
  }
}

/** Scores one case's runs against its labels. */
export function scoreCase(evalCase: EvalCase, runs: EvalRun[]): CaseScore {
  const expected = new Map(evalCase.expected.map((e) => [key(e), e]));
  const acceptable = new Set((evalCase.acceptable ?? []).map(key));
  const mentions = (evalCase.expectedMentions ?? []).map(
    (m) => new RegExp(m.pattern, 'i'),
  );
  const mustNotFlag = (finding: RunFinding): string | undefined =>
    evalCase.mustNotFlag.find(
      (m) =>
        m.rulesetKey === finding.rulesetKey &&
        (m.clauseId === undefined || m.clauseId === finding.clauseId),
    )?.why;

  const counts = emptyCounts();
  const missed = new Map<string, ClauseTally>();
  const wrong = new Map<string, ClauseTally>();
  const unlabelled = new Map<string, ClauseTally>();
  const statuses: Record<string, number> = {};
  const warnings: Record<string, number> = {};
  const errors: string[] = [];
  const leaked = new Map<string, number>();
  const flaggedByCompletedRun: Set<string>[] = [];

  for (const run of runs) {
    counts.runs++;
    counts.expected += expected.size;
    counts.mentionsExpected += mentions.length;
    statuses[run.status] = (statuses[run.status] ?? 0) + 1;
    for (const warning of run.warnings) {
      warnings[warning] = (warnings[warning] ?? 0) + 1;
    }
    if (run.error) errors.push(run.error);
    if (evalCase.pii && run.leakedPii) {
      counts.piiChecked += evalCase.pii.length;
      counts.piiLeaked += run.leakedPii.length;
      for (const value of run.leakedPii) {
        leaked.set(value, (leaked.get(value) ?? 0) + 1);
      }
    }

    const completed = isCompleted(run);
    const findings = completed ? run.findings : [];
    if (completed) {
      counts.completedRuns++;
      counts.evidenceChecked += run.unverifiedFindingsDropped ?? 0;
    }

    // The highest risk level reported for each clause in this run
    const highest = new Map<string, Severity>();
    const wrongThisRun = new Map<string, { ref: ClauseRef; why: string }>();
    const unlabelledThisRun = new Map<string, ClauseRef>();
    for (const finding of findings) {
      counts.findings++;
      const k = key(finding);
      const previous = highest.get(k);
      if (!previous || RISK_ORDER[finding.riskLevel] > RISK_ORDER[previous]) {
        highest.set(k, finding.riskLevel);
      }
      if (finding.citationValid !== undefined) {
        counts.citationsChecked++;
        if (finding.citationValid) counts.citationsValid++;
      }
      if (finding.evidenceValid !== undefined) {
        counts.evidenceChecked++;
        if (finding.evidenceValid) counts.evidenceValid++;
      }

      const why = mustNotFlag(finding);
      if (expected.has(k)) counts.correct++;
      else if (acceptable.has(k)) counts.acceptable++;
      else if (why !== undefined) {
        counts.wrong++;
        wrongThisRun.set(k, { ref: finding, why });
      } else {
        counts.unlabelled++;
        unlabelledThisRun.set(k, finding);
      }
    }
    for (const { ref, why } of wrongThisRun.values()) tally(wrong, ref, why);
    for (const ref of unlabelledThisRun.values()) tally(unlabelled, ref);

    for (const [k, label] of expected) {
      const reported = highest.get(k);
      if (reported === undefined) {
        tally(missed, label, label.why);
        continue;
      }
      counts.matched++;
      if (reported === label.severity) counts.severityMatches++;
    }

    if (completed) {
      const text = [
        run.summary,
        ...findings.flatMap((f) => [f.title, f.description]),
      ].join('\n');
      counts.mentionsFound += mentions.filter((m) => m.test(text)).length;
      flaggedByCompletedRun.push(new Set(highest.keys()));
    }
  }

  const byRuns = (a: ClauseTally, b: ClauseTally): number =>
    b.runs - a.runs || key(a).localeCompare(key(b));
  return {
    caseId: evalCase.id,
    ...scoresOf(counts, meanPairwiseJaccard(flaggedByCompletedRun)),
    counts,
    missed: [...missed.values()].sort(byRuns),
    wrong: [...wrong.values()].sort(byRuns),
    unlabelled: [...unlabelled.values()].sort(byRuns),
    leakedPii: [...leaked].map(([value, runs]) => ({ value, runs })),
    statuses,
    warnings,
    errors,
  };
}

/** Scores every case, and the whole set from the summed counts. */
export function scoreEvaluation(
  results: Array<{ evalCase: EvalCase; runs: EvalRun[] }>,
): EvalScore {
  const cases = results.map(({ evalCase, runs }) => scoreCase(evalCase, runs));
  const counts = emptyCounts();
  for (const scored of cases) {
    for (const name of Object.keys(counts) as Array<keyof ScoreCounts>) {
      counts[name] += scored.counts[name];
    }
  }
  const agreements = cases
    .map((c) => c.agreement)
    .filter((a): a is number => a !== null);
  const agreement =
    agreements.length === 0
      ? null
      : agreements.reduce((sum, a) => sum + a, 0) / agreements.length;
  return { cases, overall: { ...scoresOf(counts, agreement), counts } };
}
