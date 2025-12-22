import { Module } from '@nestjs/common';
import { RulesetsController } from './rulesets.controller';
import { RulesetsService } from './rulesets.service';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [RulesetsController],
  providers: [RulesetsService],
  exports: [RulesetsService],
})
export class RulesetsModule {}
