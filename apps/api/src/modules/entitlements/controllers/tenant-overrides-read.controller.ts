import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { I18nService } from 'nestjs-i18n';
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { DatabaseService } from '../../../database/database.service';
import { TenantOverridesRepository } from '../../../repositories/entitlements/tenant-overrides.repository';
import { AuthOptions } from '../../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../../auth/strategies/jwt-payload.interface';
import { OverrideResponseDto } from '../dto/tenant-override.dto';
import { mapOverrideToDto } from '../utils/entitlement-mappers.util';

@Controller('tenants/overrides')
@ApiTags('tenant-overrides')
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
@RequireAnyTenantPermission('billing:manage')
export class TenantOverridesReadController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantOverridesRepository: TenantOverridesRepository,
    private readonly i18n: I18nService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '[TENANT] View entitlement overrides applied to my tenant',
  })
  @ApiResponse({
    status: 200,
    description: 'Active overrides for tenant',
    type: [OverrideResponseDto],
  })
  async listMyOverrides(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<OverrideResponseDto[]> {
    const overrides = await this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId, isTenantAdmin: false },
      async (client) =>
        this.tenantOverridesRepository.findActiveByTenant(user.tenantId, {
          client,
        }),
    );

    return overrides.map(mapOverrideToDto);
  }
}
