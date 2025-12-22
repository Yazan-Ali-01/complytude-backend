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
import { RulesetsService } from './rulesets.service';
import { CreateRulesetDto, UpdateRulesetDto } from './dto/create-ruleset.dto';
import { Ruleset } from './entities/ruleset.entity';
import { SystemAdminGuard } from 'src/common/guards/system-admin.guard';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/modules/auth/decorators/current-user.decorator';

@ApiTags('Rulesets')
@Controller('rulesets')
@ApiBearerAuth()
export class RulesetsController {
  constructor(private readonly rulesetsService: RulesetsService) {}

  @Post()
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Create new ruleset',
    description: 'Create a new legal ruleset with clauses (system admin only)',
  })
  @ApiResponse({
    status: 201,
    description: 'Ruleset created successfully',
    type: Object,
  })
  @ApiResponse({
    status: 409,
    description: 'Ruleset with this key already exists',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async create(
    @Body() createRulesetDto: CreateRulesetDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Ruleset> {
    return this.rulesetsService.create(createRulesetDto, user.userId);
  }

  @Get()
  @ApiOperation({
    summary: 'List all rulesets',
    description:
      'Get list of all legal rulesets (optionally filter by authority and status)',
  })
  @ApiQuery({
    name: 'authorityId',
    required: false,
    description: 'Filter by authority UUID',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive', 'deprecated'],
    description: 'Filter by status',
  })
  @ApiResponse({ status: 200, description: 'List of rulesets', type: [Object] })
  async findAll(
    @Query('authorityId') authorityId?: string,
    @Query('status') status?: string,
  ): Promise<Ruleset[]> {
    return this.rulesetsService.findAll(authorityId, status);
  }

  @Get(':key')
  @ApiOperation({
    summary: 'Get ruleset by key',
    description: 'Get details of a specific ruleset',
  })
  @ApiParam({ name: 'key', description: 'Ruleset unique key' })
  @ApiResponse({ status: 200, description: 'Ruleset details', type: Object })
  @ApiResponse({ status: 404, description: 'Ruleset not found' })
  async findByKey(@Param('key') key: string): Promise<Ruleset> {
    return this.rulesetsService.findByKey(key);
  }

  @Put(':key')
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Update ruleset',
    description: 'Update an existing ruleset (system admin only)',
  })
  @ApiParam({ name: 'key', description: 'Ruleset unique key' })
  @ApiResponse({
    status: 200,
    description: 'Ruleset updated successfully',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Ruleset not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async update(
    @Param('key') key: string,
    @Body() updateRulesetDto: UpdateRulesetDto,
  ): Promise<Ruleset> {
    return this.rulesetsService.update(key, updateRulesetDto);
  }

  @Delete(':key')
  @UseGuards(SystemAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete ruleset',
    description: 'Delete a ruleset (system admin only)',
  })
  @ApiParam({ name: 'key', description: 'Ruleset unique key' })
  @ApiResponse({ status: 204, description: 'Ruleset deleted successfully' })
  @ApiResponse({ status: 404, description: 'Ruleset not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async delete(@Param('key') key: string): Promise<void> {
    return this.rulesetsService.delete(key);
  }
}
