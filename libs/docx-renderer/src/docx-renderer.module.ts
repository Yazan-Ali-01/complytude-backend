import { Module } from '@nestjs/common';
import { DocxRendererService } from './docx-renderer.service';

@Module({
  providers: [DocxRendererService],
  exports: [DocxRendererService],
})
export class DocxRendererModule {}
