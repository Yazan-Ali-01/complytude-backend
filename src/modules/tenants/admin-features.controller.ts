import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import { SystemAdminGuard } from 'src/common/guards/system-admin.guard';
import { DatabaseService } from 'src/database/database.service';
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

  constructor(private readonly databaseService: DatabaseService) {}

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

    let sql = 'SELECT * FROM public.features WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.category) {
      sql += ` AND category = $${paramIndex++}`;
      params.push(query.category);
    }
    if (query.isMetered !== undefined) {
      sql += ` AND is_metered = $${paramIndex++}`;
      params.push(query.isMetered);
    }

    sql += ' ORDER BY sort_order ASC';
    sql += ` LIMIT $${paramIndex++}`;
    params.push(query.limit || 100);

    const result = await this.databaseService.query(sql, params);
    const features = result.rows;

    return {
      features: features.map((f) => this.toResponseDto(f)),
      total: features.length,
    };
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

    const result = await this.databaseService.query(
      'SELECT * FROM public.features WHERE key = $1',
      [key],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Feature '${key}' not found`);
    }

    return this.toResponseDto(result.rows[0]);
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

    const existing = await this.databaseService.query(
      'SELECT key FROM public.features WHERE key = $1',
      [dto.key],
    );

    if (existing.rows.length > 0) {
      throw new BadRequestException(`Feature '${dto.key}' already exists`);
    }

    const result = await this.databaseService.query(
      `INSERT INTO public.features (key, data_type, category, display_name, description, enum_values, default_value, is_metered, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        dto.key,
        dto.dataType,
        dto.category,
        dto.displayName,
        dto.description || null,
        dto.enumValues ? JSON.stringify(dto.enumValues) : null,
        dto.defaultValue ? JSON.stringify(dto.defaultValue) : null,
        dto.isMetered ?? false,
        dto.sortOrder ?? 0,
      ],
    );

    return this.toResponseDto(result.rows[0]);
  }

  @Put(':key')
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

    const existing = await this.databaseService.query(
      'SELECT * FROM public.features WHERE key = $1',
      [key],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundException(`Feature '${key}' not found`);
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (dto.displayName !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      params.push(dto.displayName);
    }
    if (dto.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(dto.description);
    }
    if (dto.sortOrder !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      params.push(dto.sortOrder);
    }

    if (updates.length === 0) {
      return this.toResponseDto(existing.rows[0]);
    }

    params.push(key);
    const result = await this.databaseService.query(
      `UPDATE public.features SET ${updates.join(', ')} WHERE key = $${paramIndex} RETURNING *`,
      params,
    );

    return this.toResponseDto(result.rows[0]);
  }

  private toResponseDto(feature: any): FeatureResponseDto {
    return {
      key: feature.key,
      dataType: feature.data_type,
      category: feature.category,
      displayName: feature.display_name,
      description: feature.description,
      enumValues: feature.enum_values
        ? typeof feature.enum_values === 'string'
          ? (JSON.parse(feature.enum_values as string) as string[])
          : (feature.enum_values as string[])
        : null,
      defaultValue: feature.default_value
        ? typeof feature.default_value === 'string'
          ? (JSON.parse(feature.default_value as string) as unknown)
          : feature.default_value
        : null,
      isMetered: feature.is_metered,
      sortOrder: feature.sort_order,
    };
  }
}
