import { Controller, Get, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WorkspaceService } from './workspace.service';
import { FeaturesService } from './features.service';
import { Workspace } from './entities/workspace.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Workspaces')
@Controller('workspaces')
export class WorkspaceController {
  private readonly logger = new Logger(WorkspaceController.name);

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly featuresService: FeaturesService,
  ) {}

  // ============================================================================
  // SELF-MANAGEMENT ENDPOINTS (Read-only access to own workspace)
  // ============================================================================

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get my workspace information',
    description:
      'Get read-only information about your workspace including plan and active features. Use billing portal for plan upgrades.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Your workspace details with effective features (plan defaults + custom overrides)',
    type: Object,
  })
  async getMyWorkspace(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Workspace> {
    this.logger.log(`User ${user.userId} fetching their workspace info`);

    // Get workspace data
    const workspace = await this.workspaceService.findById(user.workspaceId);

    // Get effective features (plan defaults + custom overrides)
    const effectiveFeatures = await this.featuresService.getWorkspaceFeatures(
      user.workspaceId,
    );

    // Return workspace with effective features instead of just DB custom overrides
    return {
      ...workspace,
      features: effectiveFeatures,
    };
  }
}
