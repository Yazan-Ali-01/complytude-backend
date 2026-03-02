import { Module } from '@nestjs/common';
import { AuthorityRepository } from 'src/repositories/authorities/authority.repository';
import { RulesetRepository } from 'src/repositories/rulesets/ruleset.repository';
import { RulesetVersionRepository } from 'src/repositories/rulesets/ruleset-version.repository';
import { DatabaseModule } from '../../database/database.module';
import { RulesetsController } from './rulesets.controller';
import { RulesetsService } from './rulesets.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RulesetsController],
  providers: [
    RulesetsService,
    RulesetRepository,
    RulesetVersionRepository,
    AuthorityRepository,
  ],
  exports: [RulesetsService],
})
export class RulesetsModule {}
