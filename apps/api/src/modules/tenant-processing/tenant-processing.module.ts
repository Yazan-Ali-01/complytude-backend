import { Module } from '@nestjs/common';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { StripeCustomerCreationHandler } from './handlers/stripe-customer-creation.handler';
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
  ],
})
export class TenantProcessingModule {}
