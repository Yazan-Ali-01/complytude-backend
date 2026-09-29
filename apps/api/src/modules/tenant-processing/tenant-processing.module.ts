import { Module } from '@nestjs/common';
import { StuckWorkRepository } from '../../repositories/maintenance/stuck-work.repository';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { RetentionRepository } from '../../repositories/maintenance/retention.repository';
import { DataRetentionSweepHandler } from './handlers/data-retention-sweep.handler';
import { QueueMetricsHandler } from './handlers/queue-metrics.handler';
import { StripeCustomerCreationHandler } from './handlers/stripe-customer-creation.handler';
import { StuckWorkSweepHandler } from './handlers/stuck-work-sweep.handler';
import { StuckWorkSchedulerService } from './stuck-work-scheduler.service';
import { TenantQueueProcessor } from './tenant-queue.processor';

/**
 * Tenant Processing Module
 *
 * Handles async tenant lifecycle side effects via the TENANT_PROCESSING queue.
 *
 * StripeCustomerService is globally provided by StripeBillingModule (@Global),
 * so no Stripe import is needed here.
 */
@Module({
  providers: [
    TenantQueueProcessor,
    StripeCustomerCreationHandler,
    TenantRepository,
    StuckWorkSweepHandler,
    QueueMetricsHandler,
    DataRetentionSweepHandler,
    RetentionRepository,
    StuckWorkSchedulerService,
    StuckWorkRepository,
  ],
})
export class TenantProcessingModule {}
