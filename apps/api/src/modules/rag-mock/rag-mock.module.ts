import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { RagMockController } from './rag-mock.controller';

@Module({
  imports: [DocumentsModule],
  controllers: [RagMockController],
})
export class RagMockModule {}
