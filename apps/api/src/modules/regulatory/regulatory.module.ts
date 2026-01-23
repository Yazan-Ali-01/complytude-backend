import { Module } from '@nestjs/common';
import { RegulatoryController } from './regulatory.controller';
import { RegulatoryService } from './regulatory.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [RegulatoryController],
  providers: [RegulatoryService],
})
export class RegulatoryModule {}
