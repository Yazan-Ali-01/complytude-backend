import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireAnyPlatformPermission } from 'src/common/decorators/platform-permissions.decorator';
import { PlatformPermissionsGuard } from 'src/common/guards/platform-permissions.guard';
import { DatabaseService } from '../../../database/database.service';
import { TenantOverridesRepository } from '../../../repositories/entitlements/tenant-overrides.repository';
import { AuthOptions } from '../../auth/decorators/auth-options.decorator';
import { CurrentUserIdentity } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedIdentityUser } from '../../auth/strategies/jwt-payload.interface';
import {
  ApplyOverrideDto,
  OverrideResponseDto,
  UpdateOverrideDto,
} from '../dto/tenant-override.dto';
import { TenantOverridesService } from '../services/tenant-overrides.service';
import { mapOverrideToDto } from '../utils/entitlement-mappers.util';

@Controller('admin/tenants/:tenantId/overrides')
@ApiTags('admin-overrides')
@AuthOptions({ identity: true })
@UseGuards(PlatformPermissionsGuard)
@RequireAnyPlatformPermission('entitlements:manage')
export class TenantOverridesController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantOverridesService: TenantOverridesService,
    private readonly tenantOverridesRepository: TenantOverridesRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: '[ADMIN] List tenant entitlement overrides' })
  @ApiParam({ name: 'tenantId', description: 'Target tenant ID' })
  @ApiResponse({
    status: 200,
    description: "Tenant's active overrides",
    type: [OverrideResponseDto],
  })
  async listOverrides(
    @Param('tenantId') tenantId: string,
  ): Promise<OverrideResponseDto[]> {
    const overrides =
      await this.databaseService.transactionWithPlatformAdminContext(
        async (client) =>
          this.tenantOverridesRepository.findActiveByTenant(tenantId, {
            client,
          }),
      );

    return overrides.map(mapOverrideToDto);
  }

  @Post()
  @ApiOperation({ summary: '[ADMIN] Apply entitlement override' })
  @ApiParam({ name: 'tenantId', description: 'Target tenant ID' })
  @ApiResponse({
    status: 201,
    description: 'Override applied successfully',
    type: OverrideResponseDto,
  })
  async applyOverride(
    @Param('tenantId') tenantId: string,
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
    @Body() dto: ApplyOverrideDto,
  ): Promise<OverrideResponseDto> {
    const override = await this.tenantOverridesService.applyOverride(
      tenantId,
      dto,
      identity.userId,
      { context: { mode: 'platform' } },
    );

    return mapOverrideToDto(override);
  }

  @Patch(':id')
  @ApiOperation({ summary: '[ADMIN] Update entitlement override' })
  @ApiParam({ name: 'tenantId', description: 'Target tenant ID' })
  @ApiParam({ name: 'id', description: 'Override ID' })
  @ApiResponse({
    status: 200,
    description: 'Override updated successfully',
    type: OverrideResponseDto,
  })
  async updateOverride(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOverrideDto,
  ): Promise<OverrideResponseDto> {
    const updated = await this.tenantOverridesService.updateOverride(
      tenantId,
      id,
      dto,
      { context: { mode: 'platform' } },
    );

    return mapOverrideToDto(updated);
  }

  @Delete(':id')
  @ApiOperation({ summary: '[ADMIN] Revoke entitlement override' })
  @ApiParam({ name: 'tenantId', description: 'Target tenant ID' })
  @ApiParam({ name: 'id', description: 'Override ID' })
  @ApiResponse({
    status: 200,
    description: 'Override revoked successfully',
    type: OverrideResponseDto,
  })
  async revokeOverride(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ): Promise<OverrideResponseDto> {
    const revoked = await this.tenantOverridesService.revokeOverride(
      tenantId,
      id,
      { context: { mode: 'platform' } },
    );

    return mapOverrideToDto(revoked);
  }
}
