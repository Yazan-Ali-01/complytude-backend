/* eslint-disable no-restricted-imports */
import {
  AI_JOB_NAMES,
  BILLING_JOB_NAMES,
  DocumentAnalysisJobData,
  ENTITLEMENT_JOB_NAMES,
  EntitlementProjectionUpdateJobData,
  QUEUE_NAMES,
  QueueProducerService,
} from '@lib/queue';
import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiExcludeController,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { SystemAdminGuard } from 'src/common/guards/system-admin.guard';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';

@ApiExcludeController()
@Controller('admin/queue-test')
@ApiTags('Queue Test (Dev Only)')
@AuthOptions({ identity: true })
@UseGuards(SystemAdminGuard)
export class QueueTestMockController {
  constructor(
    private readonly queueProducer: QueueProducerService,
    // Raw queue access needed for job inspection (GET /jobs/:queueName)
    @InjectQueue(QUEUE_NAMES.AI_PROCESSING) private readonly aiQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DATA_INGESTION)
    private readonly ingestionQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ENTITLEMENT_PROCESSING)
    private readonly entitlementQueue: Queue,
    @InjectQueue(QUEUE_NAMES.BILLING_PROCESSING)
    private readonly billingQueue: Queue,
  ) {}

  @Post('enqueue/ai')
  @ApiOperation({ summary: 'Enqueue a test AI processing job' })
  async enqueueAiJob() {
    const job = await this.queueProducer.enqueue(
      QUEUE_NAMES.AI_PROCESSING,
      AI_JOB_NAMES.DOCUMENT_ANALYSIS,
      {
        analysisJobId: 'test-analysis-001',
        documentId: 'test-doc-001',
        tenantId: 'test-tenant-001',
      } satisfies DocumentAnalysisJobData,
    );

    return {
      jobId: job.id,
      name: job.name,
      queue: QUEUE_NAMES.AI_PROCESSING,
      status: 'enqueued',
    };
  }

  @Post('enqueue/ingestion')
  @ApiOperation({ summary: 'Enqueue a test data ingestion job' })
  async enqueueIngestionJob() {
    const job = await this.queueProducer.enqueue(
      QUEUE_NAMES.ENTITLEMENT_PROCESSING,
      ENTITLEMENT_JOB_NAMES.PROJECTION_UPDATE,
      {
        usageLedgerId: 'test-ledger-001',
        tenantId: 'test-tenant-001',
        featureKey: 'documents',
        featureId: 'test-feature-001',
        featureName: 'Documents',
        featureType: 'quota',
        subscriptionId: 'test-sub-001',
        units: 1,
        billingPeriod: new Date().toISOString().slice(0, 7),
        allocations: [{ source: 'plan', units: 1 }],
        creditDeducted: false,
        recordedAt: new Date().toISOString(),
      } satisfies EntitlementProjectionUpdateJobData,
    );

    return {
      jobId: job.id,
      name: job.name,
      queue: QUEUE_NAMES.ENTITLEMENT_PROCESSING,
      status: 'enqueued',
    };
  }

  @Post('enqueue/entitlement')
  @ApiOperation({ summary: 'Enqueue a test entitlement processing job' })
  async enqueueEntitlementJob() {
    const job = await this.queueProducer.enqueue(
      QUEUE_NAMES.ENTITLEMENT_PROCESSING,
      ENTITLEMENT_JOB_NAMES.SNAPSHOT_REBUILD,
      { tenantId: 'test-tenant-001', reason: 'manual' },
    );

    return {
      jobId: job.id,
      name: job.name,
      queue: QUEUE_NAMES.ENTITLEMENT_PROCESSING,
      status: 'enqueued',
    };
  }

  @Post('enqueue/billing/reconciliation')
  @ApiOperation({
    summary: 'Manually trigger Stripe reconciliation job',
    description:
      'Enqueues a Stripe reconciliation job to sync DB with Stripe. Same as the scheduled daily job.',
  })
  async enqueueReconciliationJob() {
    const job = await this.queueProducer.enqueue(
      QUEUE_NAMES.BILLING_PROCESSING,
      BILLING_JOB_NAMES.STRIPE_RECONCILIATION,
      { reason: 'manual' },
    );

    return {
      jobId: job.id,
      name: job.name,
      queue: QUEUE_NAMES.BILLING_PROCESSING,
      status: 'enqueued',
      note: 'This job will reconcile all tenant subscriptions and add-ons with Stripe',
    };
  }

  @Get('jobs/:queueName')
  @ApiOperation({ summary: 'List recent jobs by state for a queue' })
  @ApiParam({
    name: 'queueName',
    enum: ['ai', 'ingestion', 'entitlement', 'billing'],
  })
  async getJobs(@Param('queueName') queueName: string) {
    let queue: Queue;
    let queueLabel: string;

    if (queueName === 'ai') {
      queue = this.aiQueue;
      queueLabel = QUEUE_NAMES.AI_PROCESSING;
    } else if (queueName === 'entitlement') {
      queue = this.entitlementQueue;
      queueLabel = QUEUE_NAMES.ENTITLEMENT_PROCESSING;
    } else if (queueName === 'billing') {
      queue = this.billingQueue;
      queueLabel = QUEUE_NAMES.BILLING_PROCESSING;
    } else {
      queue = this.ingestionQueue;
      queueLabel = QUEUE_NAMES.DATA_INGESTION;
    }

    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaiting(0, 10),
      queue.getActive(0, 10),
      queue.getCompleted(0, 10),
      queue.getFailed(0, 10),
    ]);

    return {
      queue: queueLabel,
      waiting: waiting.map((j) => ({ id: j.id, name: j.name, data: j.data })),
      active: active.map((j) => ({ id: j.id, name: j.name, data: j.data })),
      completed: completed.map((j) => ({
        id: j.id,
        name: j.name,
        data: j.data,
      })),
      failed: failed.map((j) => ({
        id: j.id,
        name: j.name,
        data: j.data,
        failedReason: j.failedReason,
      })),
    };
  }
}
