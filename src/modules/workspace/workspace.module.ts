import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceAdminController } from './workspace-admin.controller';
import { FeaturesService } from './features.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [WorkspaceController, WorkspaceAdminController],
  providers: [WorkspaceService, FeaturesService],
  exports: [WorkspaceService, FeaturesService],
})
export class WorkspaceModule {}
