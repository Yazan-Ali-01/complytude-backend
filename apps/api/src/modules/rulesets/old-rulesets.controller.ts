import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { SwaggerCookieAuth } from '@complytude/shared';
import { SystemAdminGuard, CursorPaginationResult } from '@complytude/shared';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateRulesetDto, UpdateRulesetDto } from './dto/create-ruleset.dto';
import { Ruleset } from './entities/ruleset.entity';
import { RulesetsService } from './rulesets.service';

@ApiTags('Rulesets')
@Controller('rulesets')
@SwaggerCookieAuth.accessToken()
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
    description: 'Number of items per page (default: 50)',
  })
  @ApiQuery({
    name: 'direction',
    required: false,
    enum: ['forward', 'backward'],
    description: 'Pagination direction (default: forward)',
  })
  @ApiResponse({ status: 200, description: 'List of rulesets', type: [Object] })
  async findAll(
    @Query('authorityId') authorityId?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('direction')
    direction?: 'forward' | 'backward',
  ): Promise<CursorPaginationResult<Ruleset>> {
    return this.rulesetsService.findAll(authorityId, status, {
      cursor,
      limit,
      direction,
    });
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
