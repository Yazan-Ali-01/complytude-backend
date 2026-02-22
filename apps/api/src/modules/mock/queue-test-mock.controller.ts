/* eslint-disable no-restricted-imports */
import {
  AI_JOB_NAMES,
  DocumentGenerationJobData,
  ENTITLEMENT_JOB_NAMES,
  INGESTION_JOB_NAMES,
  QUEUE_NAMES,
  QueueProducerService,
  UsageProjectionUpdateJobData,
} from '@lib/queue';
import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';

@Controller('admin/queue-test')
@ApiTags('Queue Test (Dev Only)')
export class QueueTestMockController {
  constructor(
    private readonly queueProducer: QueueProducerService,
    // Raw queue access needed for job inspection (GET /jobs/:queueName)
    @InjectQueue(QUEUE_NAMES.AI_PROCESSING) private readonly aiQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DATA_INGESTION)
    private readonly ingestionQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ENTITLEMENT_PROCESSING)
    private readonly entitlementQueue: Queue,
  ) {}

  @Post('enqueue/ai')
  @ApiOperation({ summary: 'Enqueue a test AI processing job' })
  async enqueueAiJob() {
    const job = await this.queueProducer.enqueue(
      QUEUE_NAMES.AI_PROCESSING,
      AI_JOB_NAMES.DOCUMENT_GENERATION,
      {
        tenantId: 'test-tenant-001',
        templateVersionId: 'test-tv-001',
        variables: { companyName: 'Test Corp', jurisdiction: 'UAE' },
        userId: 'test-user-001',
        documentId: 'test-doc-001',
      } satisfies DocumentGenerationJobData,
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
      QUEUE_NAMES.DATA_INGESTION,
      INGESTION_JOB_NAMES.USAGE_PROJECTION_UPDATE,
      {
        tenantId: 'test-tenant-001',
        featureKey: 'documents',
        usageEventId: 'test-event-001',
        periodStart: new Date().toISOString(),
        periodEnd: new Date().toISOString(),
      } satisfies UsageProjectionUpdateJobData,
    );

    return {
      jobId: job.id,
      name: job.name,
      queue: QUEUE_NAMES.DATA_INGESTION,
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

  @Get('jobs/:queueName')
  @ApiOperation({ summary: 'List recent jobs by state for a queue' })
  @ApiParam({ name: 'queueName', enum: ['ai', 'ingestion', 'entitlement'] })
  async getJobs(@Param('queueName') queueName: string) {
    let queue: Queue;
    let queueLabel: string;

    if (queueName === 'ai') {
      queue = this.aiQueue;
      queueLabel = QUEUE_NAMES.AI_PROCESSING;
    } else if (queueName === 'entitlement') {
      queue = this.entitlementQueue;
      queueLabel = QUEUE_NAMES.ENTITLEMENT_PROCESSING;
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
