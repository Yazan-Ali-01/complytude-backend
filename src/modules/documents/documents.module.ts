import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentRepository } from 'src/repositories/documents/document.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentRepository],
  exports: [DocumentsService],
})
export class DocumentsModule {}
