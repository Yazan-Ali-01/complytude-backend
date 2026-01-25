import { Module } from '@nestjs/common';
import { RulesetsController } from './rulesets.controller';
import { RulesetsService } from './rulesets.service';
import { DatabaseModule, RulesetRepository, AuthorityRepository } from '@complytude/shared';

@Module({
  imports: [DatabaseModule],
  controllers: [RulesetsController],
  providers: [RulesetsService, RulesetRepository, AuthorityRepository],
  exports: [RulesetsService],
})
export class RulesetsModule {}
