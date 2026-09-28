import { getQueueToken, QUEUE_NAMES, type Queue } from '@lib/queue';
import { randomUUID } from 'node:crypto';
import {
  STUCK_WORK_TIMEOUT_MINUTES,
  StuckWorkSweepHandler,
} from 'src/modules/tenant-processing/handlers/stuck-work-sweep.handler';
import { StuckWorkSchedulerService } from 'src/modules/tenant-processing/stuck-work-scheduler.service';
import { createTestTenant, createTestUserInTenant } from '../factories';
import { waitForQueueIdle } from '../helpers/queue.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/**
 * Work that stops moving (a job lost after the commit, stalled past its retries, a crashed
 * worker) is failed by the sweep instead of showing "processing" forever; a stuck generate job
 * gets its quota back.
 */
describe('Stuck work sweep', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterEach(async () => {
    await waitForQueueIdle(
      app.module.get<Queue>(getQueueToken(QUEUE_NAMES.ENTITLEMENT_PROCESSING)),
      30000,
    );
  }, 35000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  const db = (): TestApp['databaseService'] => app.databaseService;

  const minutesAgo = (minutes: number): Date =>
    new Date(Date.now() - minutes * 60_000);

  async function status(
    table: string,
    column: string,
    id: string,
  ): Promise<string> {
    const { rows } = await db().query<{ value: string }>(
      `SELECT ${column} AS value FROM public.${table} WHERE id = $1`,
      [id],
    );
    return rows[0].value;
  }

  async function world(): Promise<{
    tenantId: string;
    userId: string;
    templateId: string;
    versionId: string;
  }> {
    const tenant = await createTestTenant(app.module);
    const { user } = await createTestUserInTenant(app.module, tenant.id);
    const { rows: t } = await db().query<{ id: string }>(
      `INSERT INTO public.templates (key, name) VALUES ($1, 'NDA') RETURNING id`,
      [`nda_${randomUUID().slice(0, 8)}`],
    );
    const { rows: v } = await db().query<{ id: string }>(
      `INSERT INTO public.template_versions (template_id, version) VALUES ($1, '1.0.0') RETURNING id`,
      [t[0].id],
    );
    return {
      tenantId: tenant.id,
      userId: user.id,
      templateId: t[0].id,
      versionId: v[0].id,
    };
  }

  async function documentIn(
    tenantId: string,
    extractionStatus: string,
    updatedAt: Date,
  ): Promise<string> {
    const { rows } = await db().query<{ id: string }>(
      `INSERT INTO public.documents (tenant_id, title, source_type, s3_key, extraction_status, updated_at)
       VALUES ($1, 'upload.pdf', 'file_upload', 'quarantine/upload.pdf', $2, $3) RETURNING id`,
      [tenantId, extractionStatus, updatedAt],
    );
    return rows[0].id;
  }

  async function analysisJob(
    tenantId: string,
    jobStatus: string,
    updatedAt: Date,
  ): Promise<string> {
    const documentId = await documentIn(tenantId, 'completed', new Date());
    const { rows } = await db().query<{ id: string }>(
      `INSERT INTO public.analysis_jobs (tenant_id, document_id, status, updated_at)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [tenantId, documentId, jobStatus, updatedAt],
    );
    return rows[0].id;
  }

  async function generationJob(
    w: Awaited<ReturnType<typeof world>>,
    jobType: 'preview' | 'generate',
    jobStatus: string,
    updatedAt: Date,
  ): Promise<string> {
    const { rows } = await db().query<{ id: string }>(
      `INSERT INTO public.generation_jobs
         (tenant_id, template_id, template_version_id, job_type, status, variables, created_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, $6, $7) RETURNING id`,
      [
        w.tenantId,
        w.templateId,
        w.versionId,
        jobType,
        jobStatus,
        w.userId,
        updatedAt,
      ],
    );
    return rows[0].id;
  }

  it('fails work stuck past its timeout, leaves the rest, and refunds stuck generate jobs', async () => {
    const w = await world();
    const T = STUCK_WORK_TIMEOUT_MINUTES;
    const stuckDocument = await documentIn(
      w.tenantId,
      'processing',
      minutesAgo(T.documentExtraction + 5),
    );
    const busyDocument = await documentIn(
      w.tenantId,
      'processing',
      minutesAgo(10),
    );
    const waitingUpload = await documentIn(
      w.tenantId,
      'pending',
      minutesAgo(T.documentExtraction + 5),
    );
    const stuckAnalysis = await analysisJob(
      w.tenantId,
      'queued',
      minutesAgo(T.analysis + 5),
    );
    const finishedAnalysis = await analysisJob(
      w.tenantId,
      'completed',
      minutesAgo(T.analysis + 5),
    );
    const stuckGenerate = await generationJob(
      w,
      'generate',
      'processing',
      minutesAgo(T.generation + 5),
    );
    const stuckPreview = await generationJob(
      w,
      'preview',
      'queued',
      minutesAgo(T.generation + 5),
    );
    const busyGenerate = await generationJob(
      w,
      'generate',
      'processing',
      minutesAgo(1),
    );
    const refunds = jest.spyOn(app.queueProducerService, 'enqueue');

    await app.module
      .get(StuckWorkSweepHandler)
      .execute({ data: { triggeredAt: new Date().toISOString() } } as never);

    expect({
      stuckDocument: await status(
        'documents',
        'extraction_status',
        stuckDocument,
      ),
      busyDocument: await status(
        'documents',
        'extraction_status',
        busyDocument,
      ),
      waitingUpload: await status(
        'documents',
        'extraction_status',
        waitingUpload,
      ),
      stuckAnalysis: await status('analysis_jobs', 'status', stuckAnalysis),
      finishedAnalysis: await status(
        'analysis_jobs',
        'status',
        finishedAnalysis,
      ),
      stuckGenerate: await status('generation_jobs', 'status', stuckGenerate),
      stuckPreview: await status('generation_jobs', 'status', stuckPreview),
      busyGenerate: await status('generation_jobs', 'status', busyGenerate),
    }).toEqual({
      stuckDocument: 'failed',
      busyDocument: 'processing',
      waitingUpload: 'pending',
      stuckAnalysis: 'failed',
      finishedAnalysis: 'completed',
      stuckGenerate: 'failed',
      stuckPreview: 'failed',
      busyGenerate: 'processing',
    });
    expect(
      refunds.mock.calls.map(([, name, , options]) => [name, options?.jobId]),
    ).toEqual([['usage-refund', `usage-refund-${stuckGenerate}`]]);
    refunds.mockRestore();
  });

  it('is scheduled every 5 minutes', async () => {
    // Registered at boot; the test reset flushed Redis since
    await app.module.get(StuckWorkSchedulerService).onModuleInit();
    const schedulers = await app.module
      .get<Queue>(getQueueToken(QUEUE_NAMES.TENANT_PROCESSING))
      .getJobSchedulers();

    expect(schedulers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'stuck-work-sweep',
          pattern: '*/5 * * * *',
        }),
      ]),
    );
  });
});
