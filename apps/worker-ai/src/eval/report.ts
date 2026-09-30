import type { CaseScore, ClauseTally, EvalScore, Scores } from './scorer';

export interface EvalMeta {
  /** ISO timestamp of the run. */
  date: string;
  commit: string;
  /** `fake` runs only check the harness; they measure nothing. */
  providers: 'real' | 'fake';
  chatModel: string;
  embeddingModel: string;
  rerankModel: string;
  promptVersion: number;
  runsPerCase: number;
  labelledBy: string[];
}

export const HISTORY_HEADER = [
  '| Date | Commit | Chat model | Embeddings | Rerank | Prompt | Runs | Recall | Precision | Strict precision | Must-not-flag hits | Severity | Mentions | Agreement | Redaction | Report |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
].join('\n');

export function percent(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(0)}%`;
}

function scoreCells(scores: Scores): string[] {
  return [
    percent(scores.recall),
    percent(scores.precision),
    percent(scores.strictPrecision),
  ];
}

function clauseList(items: ClauseTally[], runs: number): string {
  if (items.length === 0) return 'none';
  return items
    .map(
      (item) =>
        `\`${item.rulesetKey}/${item.clauseId}\` (${item.runs}/${runs})` +
        (item.why ? `: ${item.why}` : ''),
    )
    .join('; ');
}

function caseSection(scored: CaseScore): string {
  const { counts } = scored;
  const statuses = Object.entries(scored.statuses)
    .map(([status, n]) => `${status} ×${n}`)
    .join(', ');
  const warnings = Object.entries(scored.warnings)
    .map(([warning, n]) => `${warning} ×${n}`)
    .join(', ');
  return [
    `### ${scored.caseId}`,
    '',
    `- Runs: ${statuses}${warnings ? ` · warnings: ${warnings}` : ''}`,
    `- Recall ${percent(scored.recall)} (${counts.matched}/${counts.expected}) · precision ${percent(scored.precision)} · strict ${percent(scored.strictPrecision)} · severity ${percent(scored.severityAgreement)} · mentions ${percent(scored.mentionRate)} · agreement ${percent(scored.agreement)}`,
    `- Findings: ${counts.findings} (expected ${counts.correct}, acceptable ${counts.acceptable}, must-not-flag ${counts.wrong}, unlabelled ${counts.unlabelled})`,
    `- Missed: ${clauseList(scored.missed, counts.runs)}`,
    `- Must-not-flag hits: ${clauseList(scored.wrong, counts.runs)}`,
    `- Unlabelled (candidates for new labels): ${clauseList(scored.unlabelled, counts.runs)}`,
    ...(scored.counts.piiChecked > 0
      ? [
          `- Redaction: ${percent(scored.redactionRecall)} of personal-data values never reached a provider` +
            (scored.leakedPii.length > 0
              ? `; leaked: ${scored.leakedPii.map((l) => `\`${l.value}\` (${l.runs}/${scored.counts.runs})`).join(', ')}`
              : ''),
        ]
      : []),
    ...(scored.errors.length > 0
      ? [`- Errors: ${scored.errors.map((e) => `\`${e}\``).join('; ')}`]
      : []),
  ].join('\n');
}

/** The Markdown report written next to the JSON results. */
export function renderReport(score: EvalScore, meta: EvalMeta): string {
  const { overall } = score;
  return [
    `# AI evaluation ${meta.date}`,
    '',
    ...(meta.providers === 'fake'
      ? [
          '> **Fake providers:** this run only checks that the harness works. Its scores measure nothing.',
          '',
        ]
      : []),
    `- Commit \`${meta.commit}\` · chat \`${meta.chatModel}\` · embeddings \`${meta.embeddingModel}\` · rerank \`${meta.rerankModel}\` · prompt v${meta.promptVersion}`,
    `- ${score.cases.length} cases × ${meta.runsPerCase} runs · labels: ${meta.labelledBy.join('; ')}`,
    '',
    '## Overall',
    '',
    '| Recall | Precision | Strict precision | Must-not-flag hits | Severity | Mentions | Citations | Evidence | Agreement | Redaction | Completed runs |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    `| ${[
      ...scoreCells(overall),
      String(overall.counts.wrong),
      percent(overall.severityAgreement),
      percent(overall.mentionRate),
      percent(overall.citationValidity),
      percent(overall.evidenceValidity),
      percent(overall.agreement),
      percent(overall.redactionRecall),
      `${overall.counts.completedRuns}/${overall.counts.runs}`,
    ].join(' | ')} |`,
    '',
    'Recall: expected findings reported. Precision: labelled findings that were expected or acceptable. Strict precision counts unlabelled findings as wrong. Agreement: overlap of the clauses flagged by repeated runs. Redaction: personal-data values that never reached a provider.',
    '',
    '## Cases',
    '',
    score.cases.map(caseSection).join('\n\n'),
    '',
  ].join('\n');
}

/** One row for `data/eval/HISTORY.md`. */
export function historyLine(
  score: EvalScore,
  meta: EvalMeta,
  reportFile: string,
): string {
  const { overall } = score;
  return `| ${[
    meta.date.slice(0, 10),
    `\`${meta.commit}\``,
    meta.chatModel,
    meta.embeddingModel,
    meta.rerankModel,
    `v${meta.promptVersion}`,
    `${score.cases.length}×${meta.runsPerCase}`,
    ...scoreCells(overall),
    String(overall.counts.wrong),
    percent(overall.severityAgreement),
    percent(overall.mentionRate),
    percent(overall.agreement),
    percent(overall.redactionRecall),
    `[report](${reportFile})`,
  ].join(' | ')} |`;
}
