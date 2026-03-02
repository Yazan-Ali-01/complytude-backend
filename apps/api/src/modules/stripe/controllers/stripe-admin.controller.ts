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

@ApiTags('System Admin - Stripe')
@Controller('admin/stripe')
@AuthOptions({ identity: true })
@UseGuards(PlatformPermissionsGuard)
@SwaggerCookieAuth.identityAccessToken()
export class StripeAdminController {
  private readonly logger = new Logger(StripeAdminController.name);

  constructor(private readonly stripeCustomerService: StripeCustomerService) {}

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
}
