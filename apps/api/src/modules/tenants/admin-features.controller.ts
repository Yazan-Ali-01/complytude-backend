import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SwaggerCookieAuth, SystemAdminGuard } from '@complytude/shared';
import { FeaturesService } from './features.service';
import {
  FeatureResponseDto,
  FeatureListResponseDto,
  UpdateFeatureDto,
  CreateFeatureDto,
  FeatureQueryDto,
} from './dto/feature.dto';

@ApiTags('System Admin - Features Registry')
@Controller('admin/features')
@UseGuards(SystemAdminGuard)
@SwaggerCookieAuth.accessToken()
export class AdminFeaturesController {
  private readonly logger = new Logger(AdminFeaturesController.name);

  constructor(private readonly featuresService: FeaturesService) {}

  @Get()
  @ApiOperation({
    summary: '[ADMIN] List all features',
    description:
      'Retrieves all registered features with optional filtering by category.',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter by category (documents, contracts, regulatory, etc.)',
  })
  @ApiQuery({
    name: 'isMetered',
    required: false,
    description: 'Filter by metered status',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum results to return (default: 100)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of features',
    type: FeatureListResponseDto,
  })
  async listFeatures(
    @Query() query: FeatureQueryDto,
  ): Promise<FeatureListResponseDto> {
    this.logger.log(
      `[ADMIN] Listing features with category: ${query.category}`,
    );
    return this.featuresService.listFeatures(query);
  }

  @Get(':key')
  @ApiOperation({
    summary: '[ADMIN] Get feature by key',
    description: 'Retrieves a specific feature by its key.',
  })
  @ApiParam({ name: 'key', description: 'Feature key' })
  @ApiResponse({
    status: 200,
    description: 'Feature details',
    type: FeatureResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Feature not found' })
  async getFeature(@Param('key') key: string): Promise<FeatureResponseDto> {
    this.logger.log(`[ADMIN] Getting feature: ${key}`);
    return this.featuresService.getFeatureByKey(key);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '[ADMIN] Create new feature',
    description: 'Creates a new feature in the registry.',
  })
  @ApiResponse({
    status: 201,
    description: 'Feature created successfully',
    type: FeatureResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid feature data or key already exists',
  })
  async createFeature(
    @Body() dto: CreateFeatureDto,
  ): Promise<FeatureResponseDto> {
    this.logger.log(`[ADMIN] Creating feature: ${dto.key}`);
    return this.featuresService.createFeature(dto);
  }

  @Patch(':key')
  @ApiOperation({
    summary: '[ADMIN] Update feature',
    description:
      'Updates an existing feature (displayName, description, sortOrder only).',
  })
  @ApiParam({ name: 'key', description: 'Feature key' })
  @ApiResponse({
    status: 200,
    description: 'Feature updated successfully',
    type: FeatureResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Feature not found' })
  async updateFeature(
    @Param('key') key: string,
    @Body() dto: UpdateFeatureDto,
  ): Promise<FeatureResponseDto> {
    this.logger.log(`[ADMIN] Updating feature: ${key}`);
    return this.featuresService.updateFeature(key, dto);
  }
}
