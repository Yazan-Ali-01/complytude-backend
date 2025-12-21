import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthoritiesService } from './authorities.service';
import {
  CreateAuthorityDto,
  UpdateAuthorityDto,
} from './dto/create-authority.dto';
import { Authority } from './entities/authority.entity';
import { SystemAdminGuard } from '../../../common/guards/system-admin.guard';

@ApiTags('Authorities')
@Controller('authorities')
@ApiBearerAuth()
export class AuthoritiesController {
  constructor(private readonly authoritiesService: AuthoritiesService) {}

  @Post()
  @UseGuards(SystemAdminGuard)
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
  @ApiResponse({
    status: 200,
    description: 'List of authorities',
    type: [Object],
  })
  async findAll(@Query('active') active?: string): Promise<Authority[]> {
    const activeOnly = active === 'true';
    return this.authoritiesService.findAll(activeOnly);
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
  @UseGuards(SystemAdminGuard)
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
  @UseGuards(SystemAdminGuard)
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
