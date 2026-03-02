import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireAnyPlatformPermission } from 'src/common/decorators/platform-permissions.decorator';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import { PlatformPermissionsGuard } from '../../../common/guards/platform-permissions.guard';
import { AuthOptions } from '../../auth/decorators/auth-options.decorator';
import {
  BackfillResult,
  StripeCustomerService,
} from '../services/stripe-customer.service';
import {
  StripeTaxService,
  TaxBackfillResult,
} from '../services/stripe-tax.service';

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
}
