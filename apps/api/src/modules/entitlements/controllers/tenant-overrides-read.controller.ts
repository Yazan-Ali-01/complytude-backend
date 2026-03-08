import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { AuthOptions } from '../../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../../auth/strategies/jwt-payload.interface';
import { OverrideResponseDto } from '../dto/tenant-override.dto';
import { TenantOverridesService } from '../services/tenant-overrides.service';
import { mapOverrideToDto } from '../utils/entitlement-mappers.util';

@Controller('tenants/overrides')
@ApiTags('tenant-overrides')
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
@RequireAnyTenantPermission('billing:manage')
export class TenantOverridesReadController {
  constructor(
    private readonly tenantOverridesService: TenantOverridesService,
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
    const overrides = await this.tenantOverridesService.listOverrides(
      user.tenantId,
      {
        context: { mode: 'tenant' },
      },
    );

    return overrides.map(mapOverrideToDto);
  }
}
