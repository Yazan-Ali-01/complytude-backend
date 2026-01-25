import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwaggerCookieAuth } from '../../../common/swagger/common';
import {
  ApiGetResponses,
  ApiListResponses,
} from '../../../common/swagger/decorators';
import { PermissionsService } from '../services/permissions.service';
import {
  PermissionListResponseDto,
  PermissionResponseDto,
} from '../dto/check-permission.dto';

@ApiTags('Permissions')
@Controller('permissions')
@SwaggerCookieAuth.accessToken()
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all permissions',
    description: 'Retrieve all available permissions in the system',
  })
  @ApiListResponses(PermissionListResponseDto, 'Permissions list')
  async listPermissions(): Promise<PermissionListResponseDto> {
    const permissions = await this.permissionsService.findAll();
    return {
      permissions: permissions.map((p) => ({
        id: p.id,
        name: p.name,
        resource: p.resource,
        action: p.action,
        description: p.description,
        created_at: p.created_at,
        updated_at: p.updated_at,
      })),
    };
  }

  @Get(':name')
  @ApiOperation({
    summary: 'Get permission by name',
    description: 'Retrieve a specific permission by its name',
  })
  @ApiGetResponses(PermissionResponseDto, 'Permission details')
  @ApiResponse({ status: 404, description: 'Permission not found' })
  async getPermissionByName(
    @Param('name') name: string,
  ): Promise<PermissionResponseDto> {
    const permission = await this.permissionsService.findByName(name);
    if (!permission) {
      throw new Error(`Permission with name '${name}' not found`);
    }
    return {
      id: permission.id,
      name: permission.name,
      resource: permission.resource,
      action: permission.action,
      description: permission.description,
      created_at: permission.created_at,
      updated_at: permission.updated_at,
    };
  }
}
