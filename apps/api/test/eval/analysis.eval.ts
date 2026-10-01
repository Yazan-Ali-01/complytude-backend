import {
  ClauseChunkerService,
  embeddingConfig,
  EmbeddingService,
  TextChunkerService,
  TokenCounterService,
} from '@lib/embedding';
import type {
  AnalysisDocumentType,
  AnalysisJurisdiction,
  DocumentAnalysisJobData,
  QueueProducerService,
} from '@lib/queue';
import { ConfigService } from '@nestjs/config';
import { config as loadEnv } from 'dotenv';
import { execSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { validationSchema as workerAiSchema } from '../../../worker-ai/src/config/env.schema';
import workerAiConfig from '../../../worker-ai/src/config/worker-ai.config';
import type {
  EvalCase,
  EvalRun,
  RunFinding,
} from '../../../worker-ai/src/eval/eval-case';
import {
  type EvalMeta,
  HISTORY_HEADER,
  historyLine,
  renderReport,
} from '../../../worker-ai/src/eval/report';
import { scoreEvaluation } from '../../../worker-ai/src/eval/scorer';
import type { AnalysisResult } from '../../../worker-ai/src/interfaces/analysis-result.interface';
import { RedactionService } from '../../../worker-ai/src/redaction/redaction.service';
import { AnalysisJobWriteRepository } from '../../../worker-ai/src/repositories/analysis-job-write.repository';
import { DocumentReadRepository } from '../../../worker-ai/src/repositories/document-read.repository';
import { RulesetChunkSearchRepository } from '../../../worker-ai/src/repositories/ruleset-chunk-search.repository';
import { citationOf } from '../../../worker-ai/src/services/citation';
import { DocumentAnalysisService } from '../../../worker-ai/src/services/document-analysis.service';
import {
  type ChatCompletionOptions,
  LlmService,
} from '../../../worker-ai/src/services/llm.service';
import {
  PROMPT_VERSION,
  PromptBuilderService,
} from '../../../worker-ai/src/services/prompt-builder.service';
import { RulesetChunksRepository } from '../../../worker-ingestion/src/repositories/ruleset-chunks.repository';
import { RulesetVersionReadRepository } from '../../../worker-ingestion/src/repositories/ruleset-version-read.repository';
import { RulesetIngestionService } from '../../../worker-ingestion/src/services/ruleset-ingestion.service';
import { createTestTenant } from '../factories';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';
import { FakeEmbeddingService, FakeLlmService } from './fake-providers';

/**
 * `pnpm eval:ai`: runs the real analysis worker over the labelled contracts in data/eval on a
 * fresh database, scores the findings and writes a report (see apps/worker-ai/docs/README.md).
 *
 * EVAL_PROVIDERS=fake  deterministic stand-ins for OpenAI (checks the harness only)
 * EVAL_RUNS=3          runs per contract
 * EVAL_CASES=a,b       only these case IDs
 */
const REPO = resolve(__dirname, '../../../..');
const DATA = join(REPO, 'data/eval');

// Provider keys and model settings, from the shell or the worker's own .env
loadEnv({ path: join(REPO, 'apps/worker-ai/.env') });

const PROVIDERS = process.env.EVAL_PROVIDERS === 'fake' ? 'fake' : 'real';
const RUNS = Math.max(1, parseInt(process.env.EVAL_RUNS ?? '3', 10));
const ONLY = process.env.EVAL_CASES?.split(',').map((id) => id.trim());
/** EVAL_REDACTION=off measures the analysis without redaction, for the comparison. */
const REDACTION = process.env.EVAL_REDACTION !== 'off';

interface Providers {
  embeddings: EmbeddingService;
  llm: LlmService;
}

interface RulesetFixture {
  key: string;
  name: string;
  description: string;
  authority: { code: string; name: string };
  jurisdictions: string[];
  documentTypes: string[];
  clauses: unknown[];
}

function realProviders(): Providers {
  const missing = ['OPENAI_API_KEY'].filter((name) => {
    const value = process.env[name];
    return !value || /your-|placeholder/i.test(value);
  });
  if (missing.length > 0) {
    throw new Error(
      `pnpm eval:ai calls the real providers: set ${missing.join(' and ')} in the shell or apps/worker-ai/.env, ` +
        'or run EVAL_PROVIDERS=fake pnpm eval:ai to check the harness only',
    );
  }
  // The worker's own rules for these settings (OpenAI host allowlist, context window, …)
  const { error } = workerAiSchema.validate(process.env, {
    allowUnknown: true,
    abortEarly: false,
  });
  const invalid = (error?.details ?? []).filter((detail) =>
    /^(OPENAI|RAG|EMBEDDING)_/.test(String(detail.context?.key)),
  );
  if (invalid.length > 0) {
    throw new Error(invalid.map((detail) => detail.message).join('; '));
  }

  const config = new ConfigService({
    workerAi: workerAiConfig(),
    embedding: embeddingConfig(),
  });
  return {
    embeddings: new EmbeddingService(
      embeddingConfig(),
      new TokenCounterService(),
    ),
    llm: new LlmService(config),
  };
}

function fakeProviders(): Providers {
  return {
    embeddings: new FakeEmbeddingService() as unknown as EmbeddingService,
    llm: new FakeLlmService() as unknown as LlmService,
  };
}

/**
 * `target` with every method forwarded (so a provider method added later isn't lost), and the
 * arguments of the named ones handed to `before` first.
 */
function recorded<T extends object>(
  target: T,
  before: { [K in keyof T]?: (...args: unknown[]) => void },
): T {
  return new Proxy(target, {
    get(object, property) {
      const value: unknown = Reflect.get(object, property);
      if (typeof value !== 'function') return value;
      const hook = before[property as keyof T];
      return (...args: unknown[]): unknown => {
        hook?.(...args);
        return (value as (...forwarded: unknown[]) => unknown).apply(
          object,
          args,
        );
      };
    },
  });
}

/** The same providers, recording every text sent to them, to check no personal data leaves. */
function capturing(providers: Providers, sent: string[]): Providers {
  const { embeddings, llm } = providers;
  return {
    embeddings: recorded(embeddings, {
      generateEmbedding: (text) => sent.push(text as string),
      generateEmbeddings: (texts) => sent.push(...(texts as string[])),
    }),
    llm: recorded(llm, {
      chatCompletion: (options) => {
        const { systemPrompt, userMessage } = options as ChatCompletionOptions;
        sent.push(systemPrompt, userMessage);
      },
    }),
  };
}

function loadCases(): EvalCase[] {
  const cases = readdirSync(join(DATA, 'cases'))
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map(
      (file) =>
        JSON.parse(readFileSync(join(DATA, 'cases', file), 'utf8')) as EvalCase,
    );
  return ONLY ? cases.filter((c) => ONLY.includes(c.id)) : cases;
}

function commit(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: REPO })
      .toString()
      .trim();
    // The inputs that shape a run; earlier runs' reports and history rows don't
    const dirty = execSync(
      "git status --porcelain -- apps libs data/eval ':!data/eval/results' ':!data/eval/HISTORY.md'",
      { cwd: REPO },
    )
      .toString()
      .trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return 'unknown';
  }
}

const describeEval = process.env.EVAL_AI === '1' ? describe : describe.skip;

describeEval('AI evaluation', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
    await resetTestState(app.databaseService, app.redisClient);
  }, 60000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  /** Loads the frozen eval rulesets through the real ingestion (chunking, embeddings, metadata). */
  async function seedRulesets(providers: Providers): Promise<void> {
    const db = app.databaseService;
    await db.query('DELETE FROM public.ruleset_chunks');
    await db.query('DELETE FROM public.ruleset_versions');
    await db.query('DELETE FROM public.rulesets');

    const tokenCounter = new TokenCounterService();
    const ingestion = new RulesetIngestionService(
      db,
      new RulesetVersionReadRepository(db),
      new RulesetChunksRepository(db),
      new ClauseChunkerService(
        tokenCounter,
        new TextChunkerService(tokenCounter),
      ),
      providers.embeddings,
      new ConfigService({ workerIngestion: { batchSize: 500 } }),
    );

    const dir = join(DATA, 'rulesets');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const ruleset = JSON.parse(
        readFileSync(join(dir, file), 'utf8'),
      ) as RulesetFixture;
      const { rows: authority } = await db.query<{ id: string }>(
        `INSERT INTO public.authorities (code, name) VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [ruleset.authority.code, ruleset.authority.name],
      );
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO public.rulesets (key, name, description, authority_id, current_version, jurisdictions, document_types)
         VALUES ($1, $2, $3, $4, '1.0.0', $5, $6) RETURNING id`,
        [
          ruleset.key,
          ruleset.name,
          ruleset.description,
          authority[0].id,
          ruleset.jurisdictions,
          ruleset.documentTypes,
        ],
      );
      const { rows: version } = await db.query<{ id: string }>(
        `INSERT INTO public.ruleset_versions (ruleset_id, version, clauses)
         VALUES ($1, '1.0.0', $2::jsonb) RETURNING id`,
        [rows[0].id, JSON.stringify(ruleset.clauses)],
      );
      await ingestion.ingest({
        rulesetId: rows[0].id,
        versionId: version[0].id,
      });
    }
    tokenCounter.onModuleDestroy();
  }

  /** The metadata of the chunks findings rest on (source clause ID, citation facts), by chunk ID. */
  async function chunkMetadataOf(
    chunkIds: string[],
  ): Promise<Map<string, Record<string, unknown>>> {
    const { rows } = await app.databaseService.query<{
      id: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT id, metadata FROM public.ruleset_chunks WHERE id = ANY($1::uuid[])`,
      [chunkIds],
    );
    return new Map(rows.map((row) => [row.id, row.metadata]));
  }

  /** The rulesets a case is checked against, resolved the way the API resolves a request. */
  async function scopeOf(
    evalCase: EvalCase,
  ): Promise<
    Pick<
      DocumentAnalysisJobData,
      'rulesetIds' | 'jurisdiction' | 'documentType'
    >
  > {
    const context = {
      ...(evalCase.jurisdiction && {
        jurisdiction: evalCase.jurisdiction as AnalysisJurisdiction,
      }),
      ...(evalCase.documentType && {
        documentType: evalCase.documentType as AnalysisDocumentType,
      }),
    };
    const { rows } = evalCase.rulesetKeys?.length
      ? await app.databaseService.query<{ id: string }>(
          `SELECT id FROM public.rulesets WHERE key = ANY($1) AND status = 'active'`,
          [evalCase.rulesetKeys],
        )
      : await app.databaseService.query<{ id: string }>(
          `SELECT id FROM public.rulesets
           WHERE status = 'active' AND $1 = ANY(jurisdictions) AND $2 = ANY(document_types)`,
          [evalCase.jurisdiction, evalCase.documentType],
        );
    if (rows.length === 0) {
      throw new Error(
        `Case ${evalCase.id}: no ruleset applies (set jurisdiction and documentType, or rulesetKeys)`,
      );
    }
    return { rulesetIds: rows.map((r) => r.id), ...context };
  }

  async function runCase(
    evalCase: EvalCase,
    analysis: DocumentAnalysisService,
    sent: string[],
  ): Promise<EvalRun[]> {
    const tenant = await createTestTenant(app.module);
    const content = readFileSync(
      join(DATA, 'contracts', evalCase.contract),
      'utf8',
    );
    const { rows: documents } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.documents (tenant_id, title, content) VALUES ($1, $2, $3) RETURNING id`,
      [tenant.id, evalCase.id, content],
    );

    const scope = await scopeOf(evalCase);
    const runs: EvalRun[] = [];
    for (let run = 0; run < RUNS; run++) {
      const { rows: jobs } = await app.databaseService.query<{ id: string }>(
        `INSERT INTO public.analysis_jobs (tenant_id, document_id) VALUES ($1, $2) RETURNING id`,
        [tenant.id, documents[0].id],
      );
      const data: DocumentAnalysisJobData = {
        analysisJobId: jobs[0].id,
        documentId: documents[0].id,
        tenantId: tenant.id,
        ...scope,
      };
      let thrown: string | undefined;
      sent.length = 0;
      await analysis.analyze(data).catch((error: unknown) => {
        thrown = error instanceof Error ? error.message : String(error);
      });
      const leakedPii = evalCase.pii?.filter((value) =>
        sent.some((text) => text.includes(value)),
      );

      const { rows } = await app.databaseService.query<{
        status: string;
        result: AnalysisResult | null;
        error: string | null;
      }>(
        'SELECT status, result, error FROM public.analysis_jobs WHERE id = $1',
        [data.analysisJobId],
      );
      const { status, result, error } = rows[0];
      const chunks = await chunkMetadataOf(
        (result?.findings ?? []).map((f) => f.chunkId),
      );
      runs.push({
        status: thrown && status !== 'failed' ? 'error' : status,
        warnings: result?.warnings ?? [],
        summary: result?.summary ?? '',
        unverifiedFindingsDropped: result?.unverifiedFindingsDropped ?? 0,
        ...(leakedPii && { leakedPii }),
        findings: (result?.findings ?? []).map((f): RunFinding => {
          const metadata = chunks.get(f.chunkId) ?? {};
          return {
            rulesetKey: f.rulesetKey ?? 'unknown',
            clauseId:
              typeof metadata.clauseId === 'string'
                ? metadata.clauseId
                : 'unknown',
            riskLevel: f.riskLevel,
            title: f.title,
            description: f.description,
            // The stored citation must be the one its clause's ruleset data gives
            citationValid: f.citation === citationOf(metadata),
            // A stored quote must be exactly the contract text at its offset
            evidenceValid:
              f.evidenceOffset === null ||
              content.slice(
                f.evidenceOffset,
                f.evidenceOffset + f.evidence.length,
              ) === f.evidence,
          };
        }),
        ...((error ?? thrown) && { error: (error ?? thrown)! }),
      });
    }
    return runs;
  }

  it(
    'scores the labelled contracts and writes a report',
    async () => {
      const providers =
        PROVIDERS === 'fake' ? fakeProviders() : realProviders();
      await seedRulesets(providers);

      const tokenCounter = new TokenCounterService();
      const sent: string[] = [];
      const outbound = capturing(providers, sent);
      const analysis = new DocumentAnalysisService(
        new AnalysisJobWriteRepository(app.appDatabaseService),
        new DocumentReadRepository(app.appDatabaseService),
        new RulesetChunkSearchRepository(app.appDatabaseService),
        new TextChunkerService(tokenCounter),
        outbound.embeddings,
        new PromptBuilderService(tokenCounter, outbound.llm),
        outbound.llm,
        new RedactionService(
          new ConfigService({
            workerAi: {
              ...workerAiConfig(),
              redactionEnabled: REDACTION,
            },
          }),
        ),
        new ConfigService({ workerAi: workerAiConfig() }),
        // The eval runs no quota, so there's nothing to refund
        { enqueue: () => Promise.resolve() } as unknown as QueueProducerService,
      );

      const cases = loadCases();
      expect(cases.length).toBeGreaterThan(0);
      const results: Array<{ evalCase: EvalCase; runs: EvalRun[] }> = [];
      for (const evalCase of cases) {
        results.push({
          evalCase,
          runs: await runCase(evalCase, analysis, sent),
        });
      }
      tokenCounter.onModuleDestroy();

      const score = scoreEvaluation(results);
      const meta: EvalMeta = {
        date: new Date().toISOString(),
        commit: commit(),
        providers: PROVIDERS,
        chatModel: providers.llm.getModel(),
        embeddingModel: providers.embeddings.getModel(),
        rerankModel: 'none',
        promptVersion: PROMPT_VERSION,
        runsPerCase: RUNS,
        labelledBy: [...new Set(cases.map((c) => c.labelledBy))],
      };

      // Fake runs measure nothing: keep them out of the results and the history
      const dir =
        PROVIDERS === 'fake'
          ? mkdtempSync(join(tmpdir(), 'complytude-eval-'))
          : join(DATA, 'results');
      mkdirSync(dir, { recursive: true });
      const base = `${meta.date.slice(0, 19).replace(/[:T]/g, '-')}-${meta.commit}`;
      const reportFile = join(dir, `${base}.md`);
      writeFileSync(
        join(dir, `${base}.json`),
        JSON.stringify({ meta, score, results }, null, 2) + '\n',
      );
      writeFileSync(reportFile, renderReport(score, meta));
      if (PROVIDERS === 'real') {
        const history = join(DATA, 'HISTORY.md');
        if (!existsSync(history)) writeFileSync(history, `${HISTORY_HEADER}\n`);
        appendFileSync(
          history,
          `${historyLine(score, meta, relative(DATA, reportFile))}\n`,
        );
      }
      console.log(`AI evaluation report: ${reportFile}`);

      expect(score.cases).toHaveLength(cases.length);
      // The fake providers never fail: a failed run is a bug in the pipeline or this harness
      if (PROVIDERS === 'fake') {
        expect(
          results.flatMap(({ evalCase, runs }) =>
            runs
              .filter((run) => run.error)
              .map((run) => `${evalCase.id}: ${run.error}`),
          ),
        ).toEqual([]);
      }
    },
    60 * 60_000,
  );
});
