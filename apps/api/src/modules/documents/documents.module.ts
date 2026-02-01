import { Module } from '@nestjs/common';
// import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

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
    // DatabaseModule will be added during implementation
    // StorageModule will be added during implementation
    // TemplatesModule will be added during implementation
  ],
  controllers: [],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
