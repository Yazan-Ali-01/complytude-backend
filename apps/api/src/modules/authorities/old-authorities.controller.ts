import { CursorPaginationResult } from '@lib/database';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import { RequireAnyPlatformPermission } from '../../common/decorators/platform-permissions.decorator';
import { PlatformPermissionsGuard } from '../../common/guards/platform-permissions.guard';
import { AuthoritiesService } from './authorities.service';
import {
  CreateAuthorityDto,
  UpdateAuthorityDto,
} from './dto/create-authority.dto';
import { Authority } from './entities/authority.entity';

@ApiTags('Authorities')
@Controller('authorities')
@SwaggerCookieAuth.tenantAccessToken()
export class AuthoritiesController {
  constructor(private readonly authoritiesService: AuthoritiesService) {}

  @Post()
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('authorities:manage')
  @ApiOperation({
    summary: 'Create new authority',
    description: 'Create a new legal authority (system admin only)',
  })
  @ApiResponse({
    status: 201,
    description: 'Authority created successfully',
    type: Object,
  })
  @ApiResponse({
    status: 409,
    description: 'Authority with this code already exists',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async create(
    @Body() createAuthorityDto: CreateAuthorityDto,
  ): Promise<Authority> {
    return this.authoritiesService.create(createAuthorityDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all authorities',
    description:
      'Get list of all legal authorities (optionally filter by active status)',
  })
  @ApiQuery({
    name: 'active',
    required: false,
    type: Boolean,
    description: 'Filter by active status',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Cursor for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Limit for pagination',
  })
  @ApiQuery({
    name: 'direction',
    required: false,
    type: String,
    description: 'Direction for pagination',
  })
  @ApiResponse({
    status: 200,
    description: 'List of authorities',
    type: [Object],
  })
  async findAll(
    @Query('active', new ParseBoolPipe({ optional: true })) active?: boolean,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('direction')
    direction?: 'forward' | 'backward',
  ): Promise<CursorPaginationResult<Authority>> {
    return this.authoritiesService.findAll(active, {
      cursor,
      limit,
      direction,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get authority by ID',
    description: 'Get details of a specific authority',
  })
  @ApiParam({ name: 'id', description: 'Authority UUID' })
  @ApiResponse({ status: 200, description: 'Authority details', type: Object })
  @ApiResponse({ status: 404, description: 'Authority not found' })
  async findById(@Param('id') id: string): Promise<Authority> {
    return this.authoritiesService.findById(id);
  }

  @Put(':id')
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('authorities:manage')
  @ApiOperation({
    summary: 'Update authority',
    description: 'Update an existing authority (system admin only)',
  })
  @ApiParam({ name: 'id', description: 'Authority UUID' })
  @ApiResponse({
    status: 200,
    description: 'Authority updated successfully',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Authority not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async update(
    @Param('id') id: string,
    @Body() updateAuthorityDto: UpdateAuthorityDto,
  ): Promise<Authority> {
    return this.authoritiesService.update(id, updateAuthorityDto);
  }

  @Delete(':id')
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('authorities:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete authority',
    description: 'Delete an authority (system admin only)',
  })
  @ApiParam({ name: 'id', description: 'Authority UUID' })
  @ApiResponse({ status: 204, description: 'Authority deleted successfully' })
  @ApiResponse({ status: 404, description: 'Authority not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async delete(@Param('id') id: string): Promise<void> {
    return this.authoritiesService.delete(id);
  }
}
