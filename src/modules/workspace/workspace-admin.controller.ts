import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WorkspaceService } from './workspace.service';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { Workspace } from './entities/workspace.entity';
import { SystemAdminGuard } from '../../common/guards/system-admin.guard';

/**
 * System Administrator endpoints for workspace management
 * All endpoints require system admin privileges
 */
@ApiTags('System Admin - Workspaces')
@Controller('admin/workspaces')
@UseGuards(SystemAdminGuard)
@ApiBearerAuth()
export class WorkspaceAdminController {
  private readonly logger = new Logger(WorkspaceAdminController.name);

  constructor(private readonly workspaceService: WorkspaceService) {}

  // ============================================================================
  // SYSTEM ADMIN ENDPOINTS (Platform-wide management)
  // ============================================================================

  @Get()
  @ApiOperation({
    summary: '[ADMIN] List all workspaces',
    description:
      'Retrieves a list of all workspaces in the system. System admin only.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all workspaces',
    type: [Object],
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async getAllWorkspaces(): Promise<Workspace[]> {
    this.logger.log('[ADMIN] Fetching all workspaces');
    return this.workspaceService.findAll();
  }

  @Get(':workspaceId')
  @ApiOperation({
    summary: '[ADMIN] Get workspace by ID',
    description:
      'Retrieves detailed information about any workspace. System admin only.',
  })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'Workspace details',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async getWorkspaceById(
    @Param('workspaceId') workspaceId: string,
  ): Promise<Workspace> {
    this.logger.log(`[ADMIN] Fetching workspace: ${workspaceId}`);
    return this.workspaceService.findById(workspaceId);
  }

  @Get('email/:email')
  @ApiOperation({
    summary: '[ADMIN] Get workspace by email',
    description:
      'Retrieves workspace information by email address. System admin only.',
  })
  @ApiParam({ name: 'email', description: 'Workspace email' })
  @ApiResponse({
    status: 200,
    description: 'Workspace details',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async getWorkspaceByEmail(@Param('email') email: string): Promise<Workspace> {
    this.logger.log(`[ADMIN] Fetching workspace by email: ${email}`);
    return this.workspaceService.findByEmail(email);
  }

  @Put(':workspaceId')
  @ApiOperation({
    summary: '[ADMIN] Update any workspace',
    description:
      'Updates any workspace including plan and features. System admin only. Use this to grant custom features or change plans.',
  })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'Workspace updated successfully',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async updateWorkspace(
    @Param('workspaceId') workspaceId: string,
    @Body() updateWorkspaceDto: UpdateWorkspaceDto,
  ): Promise<Workspace> {
    this.logger.log(`[ADMIN] Updating workspace: ${workspaceId}`);
    return this.workspaceService.updateWorkspace(
      workspaceId,
      updateWorkspaceDto,
    );
  }

  @Delete(':workspaceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[ADMIN] Delete any workspace',
    description:
      'Deletes any workspace and all associated data including the database schema. ⚠️ This action is irreversible. System admin only.',
  })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'Workspace deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async deleteWorkspace(
    @Param('workspaceId') workspaceId: string,
  ): Promise<{ message: string; workspaceId: string }> {
    this.logger.warn(`[ADMIN] Deleting workspace: ${workspaceId}`);
    await this.workspaceService.deleteWorkspace(workspaceId);
    return {
      message: 'Workspace deleted successfully',
      workspaceId,
    };
  }

  @Get(':workspaceId/schema')
  @ApiOperation({
    summary: '[ADMIN] Get any workspace schema',
    description:
      'Retrieves schema details for any workspace. System admin only.',
  })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'Workspace schema information',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Schema not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async getWorkspaceSchema(@Param('workspaceId') workspaceId: string) {
    this.logger.log(`[ADMIN] Fetching schema for workspace: ${workspaceId}`);
    return this.workspaceService.getWorkspaceSchema(workspaceId);
  }
}
