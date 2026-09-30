/**
 * The labelled evaluation set (`data/eval/cases/*.json`): what a correct analysis of each
 * contract reports, and what it must not.
 */
export type Severity = 'high' | 'medium' | 'low';

export interface ClauseRef {
  rulesetKey: string;
  clauseId: string;
}

/** A finding the analysis must report: it counts towards recall and precision. */
export interface ExpectedFinding extends ClauseRef {
  severity: Severity;
  why: string;
}

/** A defensible finding that isn't required: never counted as a miss or a false positive. */
export interface AcceptableFinding extends ClauseRef {
  why: string;
}

/** A clause, or without `clauseId` a whole ruleset, that no finding may rest on. */
export interface MustNotFlag {
  rulesetKey: string;
  clauseId?: string;
  why: string;
}

/** A case-insensitive pattern that finding titles, descriptions or the summary must match. */
export interface ExpectedMention {
  pattern: string;
  why: string;
}

export interface EvalCase {
  id: string;
  description: string;
  /** File name under `data/eval/contracts/`. */
  contract: string;
  labelledBy: string;
  expected: ExpectedFinding[];
  acceptable?: AcceptableFinding[];
  mustNotFlag: MustNotFlag[];
  expectedMentions?: ExpectedMention[];
}

/** One finding of a run, resolved to the source clause it cites. */
export interface RunFinding extends ClauseRef {
  riskLevel: Severity;
  title: string;
  description: string;
  /** Undefined until findings carry a checkable citation. */
  citationValid?: boolean;
  /** Undefined until findings carry a checkable quote from the contract. */
  evidenceValid?: boolean;
}

export interface EvalRun {
  /** The stored analysis job status, or `error` when the attempt threw. */
  status: string;
  warnings: string[];
  summary: string;
  findings: RunFinding[];
  /** Findings the worker dropped because their quote wasn't in the contract. */
  unverifiedFindingsDropped?: number;
  error?: string;
}
