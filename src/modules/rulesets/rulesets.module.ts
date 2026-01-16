import { Module } from '@nestjs/common';
import { RulesetsController } from './rulesets.controller';
import { RulesetsService } from './rulesets.service';
import { DatabaseModule } from 'src/database/database.module';
import { RulesetRepository } from 'src/repositories/rulesets/ruleset.repository';
import { AuthorityRepository } from 'src/repositories/authorities/authority.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [RulesetsController],
  providers: [RulesetsService, RulesetRepository, AuthorityRepository],
  exports: [RulesetsService],
})
export class RulesetsModule {}
