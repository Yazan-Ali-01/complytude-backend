// SHELL: This controller requires billing integration to be fully functional

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwaggerCookieAuth } from '@complytude/shared';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreditsService } from './credits.service';
import { CreditPackage, TenantCreditsSummary } from './entities/credits.entity';

/**
 * Credits controller for the Add-on Credits ("Top-up" Model)
 * SHELL: Requires billing integration (Stripe) to be fully functional
 */
@ApiTags('Credits (Coming Soon)')
@Controller()
export class CreditsController {
  private readonly logger = new Logger(CreditsController.name);

  constructor(private readonly creditsService: CreditsService) {}

  // ============================================================================
  // TENANT ENDPOINTS
  // ============================================================================

  @Get('tenants/me/credits')
  @SwaggerCookieAuth.accessToken()
  @ApiOperation({
    summary: 'Get my credit balances',
    description:
      'Get current credit balances for all features. Shows purchased add-on credits that can be used beyond plan limits.',
  })
  @ApiResponse({
    status: 200,
    description: 'Credit balances for all features',
    schema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', format: 'uuid' },
        balances: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              featureKey: {
                type: 'string',
                example: 'contract_reviews_per_month',
              },
              creditsRemaining: { type: 'number', example: 5 },
              expiresAt: {
                type: 'string',
                format: 'date-time',
                nullable: true,
              },
            },
          },
        },
      },
    },
  })
  async getMyCredits(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TenantCreditsSummary> {
    this.logger.log(`User ${user.userId} fetching their credit balances`);
    return this.creditsService.getTenantCreditsSummary(user.tenantId);
  }

  // ============================================================================
  // PUBLIC ENDPOINTS
  // ============================================================================

  @Get('credits/packages')
  @SwaggerCookieAuth.accessToken()
  @ApiOperation({
    summary: 'List available credit packages',
    description:
      'Get all available credit packages that can be purchased. Includes pricing in AED.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of available credit packages',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Extra Contract Review' },
          featureKey: { type: 'string', example: 'contract_reviews_per_month' },
          credits: { type: 'number', example: 1 },
          priceAed: { type: 'number', example: 99 },
          isActive: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  async getAvailablePackages(): Promise<CreditPackage[]> {
    this.logger.log('Fetching available credit packages');
    return this.creditsService.getAvailablePackages();
  }

  // ============================================================================
  // PURCHASE ENDPOINTS (Stub)
  // ============================================================================

  @Post('credits/purchase')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  @SwaggerCookieAuth.accessToken()
  @ApiOperation({
    summary: 'Purchase credits (Coming Soon)',
    description:
      'Purchase additional credits for a feature. This endpoint requires billing integration (Stripe) which is not yet available.',
  })
  @ApiResponse({
    status: 501,
    description: 'Billing integration not yet available',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 501 },
        message: {
          type: 'string',
          example: 'Billing integration not yet available',
        },
        error: { type: 'string', example: 'Not Implemented' },
      },
    },
  })
  purchaseCredits(
    @CurrentUser() user: AuthenticatedUser,
    @Body() _body: { packageId: string },
  ): { statusCode: number; message: string; error: string } {
    this.logger.warn(
      `User ${user.userId} attempted to purchase credits (billing not yet integrated)`,
    );

    // TODO: Integrate with Stripe
    // 1. Validate package exists and is active
    // 2. Create Stripe payment intent
    // 3. Return client secret for frontend to complete payment
    // 4. On webhook, call creditsService.completeTransaction()

    return {
      statusCode: 501,
      message: 'Billing integration not yet available',
      error: 'Not Implemented',
    };
  }
}
