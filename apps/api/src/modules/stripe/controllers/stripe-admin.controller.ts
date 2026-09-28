import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireAnyPlatformPermission } from 'src/common/decorators/platform-permissions.decorator';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import { PlatformPermissionsGuard } from '../../../common/guards/platform-permissions.guard';
import { AuthOptions } from '../../auth/decorators/auth-options.decorator';
import {
  BackfillResult,
  StripeCustomerService,
} from '../services/stripe-customer.service';
import {
  ReconciliationReport,
  StripeReconciliationService,
} from '../services/stripe-reconciliation.service';
import {
  StripeTaxService,
  TaxBackfillResult,
} from '../services/stripe-tax.service';
import {
  RetryResult,
  StripeWebhookMonitoringService,
  WebhookStats,
} from '../services/stripe-webhook-monitoring.service';
import { StripeCatalogSyncService } from '../services/stripe-catalog-sync.service';

@ApiTags('System Admin - Stripe')
@Controller('admin/stripe')
@AuthOptions({ identity: true })
@UseGuards(PlatformPermissionsGuard)
@SwaggerCookieAuth.identityAccessToken()
export class StripeAdminController {
  private readonly logger = new Logger(StripeAdminController.name);

  constructor(
    private readonly stripeCustomerService: StripeCustomerService,
    private readonly stripeTaxService: StripeTaxService,
    private readonly stripeReconciliationService: StripeReconciliationService,
    private readonly stripeWebhookMonitoringService: StripeWebhookMonitoringService,
    private readonly stripeCatalogSyncService: StripeCatalogSyncService,
  ) {}

  @Post('backfill-customers')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPlatformPermission('entitlements:manage')
  @ApiOperation({
    summary: '[ADMIN] Backfill Stripe customers for existing tenants',
    description:
      'Creates a Stripe Customer for every tenant that does not yet have one. Idempotent — safe to run multiple times.',
  })
  @ApiResponse({
    status: 200,
    description: 'Backfill completed',
    schema: {
      type: 'object',
      properties: {
        created: { type: 'number' },
        skipped: { type: 'number' },
        failed: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient platform permissions',
  })
  async backfillCustomers(): Promise<BackfillResult> {
    this.logger.log('[ADMIN] Starting Stripe customer backfill');
    return this.stripeCustomerService.backfillStripeCustomers();
  }

  @Post('backfill-tax')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPlatformPermission('entitlements:manage')
  @ApiOperation({
    summary:
      '[ADMIN] Backfill Stripe Tax (address + TRN) for existing customers',
    description:
      'Syncs UAE billing address and TRN to every tenant that already has a Stripe Customer. ' +
      'Idempotent — safe to run multiple times. Requires STRIPE_TAX_ENABLED=true.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tax backfill completed',
    schema: {
      type: 'object',
      properties: {
        synced: { type: 'number' },
        skipped: { type: 'number' },
        failed: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient platform permissions',
  })
  async backfillTax(): Promise<TaxBackfillResult> {
    this.logger.log('[ADMIN] Starting Stripe Tax backfill');
    return this.stripeTaxService.backfillCustomerTax();
  }

  @Post('reconcile')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPlatformPermission('entitlements:manage')
  @ApiOperation({
    summary: '[ADMIN] Run Stripe state reconciliation',
    description:
      'Compares Stripe subscription and add-on state against our DB, detects drift, and auto-fixes mismatches. ' +
      'Idempotent — safe to run multiple times. Emits domain events for every fix.',
  })
  @ApiResponse({
    status: 200,
    description: 'Reconciliation completed',
    schema: {
      type: 'object',
      properties: {
        checked: { type: 'number' },
        in_sync: { type: 'number' },
        drifted: { type: 'number' },
        fixed: { type: 'number' },
        errors: { type: 'array' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient platform permissions',
  })
  async runReconciliation(): Promise<ReconciliationReport> {
    this.logger.log('[ADMIN] Starting Stripe state reconciliation');
    return this.stripeReconciliationService.reconcileAll();
  }

  @Get('webhook-stats')
  @RequireAnyPlatformPermission('entitlements:manage')
  @ApiOperation({
    summary: '[ADMIN] Get webhook event processing stats',
    description:
      'Returns event counts by status and type, failed events, and average processing time.',
  })
  @ApiQuery({
    name: 'hours',
    required: false,
    type: Number,
    description: 'Time window in hours (default: 24)',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook stats',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        by_status: { type: 'object' },
        by_type: { type: 'object' },
        failed: { type: 'array' },
        avg_processing_time_ms: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient platform permissions',
  })
  async getWebhookStats(
    @Query('hours') hours: number = 24,
  ): Promise<WebhookStats> {
    return this.stripeWebhookMonitoringService.getWebhookStats(Number(hours));
  }

  @Post('retry-failed-webhooks')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPlatformPermission('entitlements:manage')
  @ApiOperation({
    summary: '[ADMIN] Retry failed webhook events',
    description:
      'Retries failed webhook events now, including events out of automatic re-drives. ' +
      'Each retry goes through the full processEvent pipeline (atomic claim included).',
  })
  @ApiQuery({
    name: 'maxRetries',
    required: false,
    type: Number,
    description:
      'Skip events that already had this many processing attempts (default: no limit)',
  })
  @ApiResponse({
    status: 200,
    description: 'Retry run completed',
    schema: {
      type: 'object',
      properties: {
        attempted: { type: 'number' },
        retried: { type: 'number' },
        failed: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient platform permissions',
  })
  async retryFailedWebhooks(
    @Query('maxRetries') maxRetries?: number,
  ): Promise<RetryResult> {
    this.logger.log('[ADMIN] Starting failed webhook retry run');
    return this.stripeWebhookMonitoringService.retryFailedEvents(
      maxRetries === undefined ? undefined : Number(maxRetries),
    );
  }

  @Post('sync-catalog')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPlatformPermission('entitlements:manage')
  @ApiOperation({
    summary: '[ADMIN] Sync catalog to Stripe',
    description:
      'Manually syncs plans, add-ons, and credit packages from code constants to Stripe Products and Prices. ' +
      'Idempotent — safe to run multiple times. Requires STRIPE_CATALOG_SYNC_ENABLED=true.',
  })
  @ApiResponse({
    status: 200,
    description: 'Catalog sync completed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        details: {
          type: 'object',
          properties: {
            plans: { type: 'number' },
            addons: { type: 'number' },
            creditPackages: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient platform permissions',
  })
  async syncCatalog(): Promise<{
    success: boolean;
    message: string;
    details?: {
      plans: number;
      addons: number;
      creditPackages: number;
    };
  }> {
    this.logger.log('[ADMIN] Starting manual Stripe catalog sync');
    return this.stripeCatalogSyncService.syncCatalog();
  }
}
