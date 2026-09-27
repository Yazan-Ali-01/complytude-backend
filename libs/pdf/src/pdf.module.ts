import { Module } from '@nestjs/common';
import { PdfConversionService } from './pdf-conversion.service';

@Module({
  providers: [PdfConversionService],
  exports: [PdfConversionService],
})
export class PdfModule {}
