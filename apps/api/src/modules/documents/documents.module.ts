import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { PiiMaskingService } from './services/pii-masking.service';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenants/tenant.module';

/**
 * Documents Module
 *
 * Handles document preview, generation, listing, retrieval, and soft-deletion.
 *
 * This module is currently in contract-only mode with stub service implementations.
 * Business logic will be added in the implementation phase.
 */
@Module({
  imports: [
    RbacModule,
    TenantModule,
    // DatabaseModule will be added during implementation
    // StorageModule will be added during implementation
    // TemplatesModule will be added during implementation
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, PiiMaskingService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
