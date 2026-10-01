import { DatabaseModule } from '@lib/database';
import { QUEUE_NAMES, QueueModule } from '@lib/queue';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configModuleOptions } from 'src/config/config-module.options';
import { AuthorityRepository } from 'src/repositories/authorities/authority.repository';
import { RulesetVersionRepository } from 'src/repositories/rulesets/ruleset-version.repository';
import { RulesetRepository } from 'src/repositories/rulesets/ruleset.repository';
import { RulesetLoadService } from './ruleset-load.service';

/** Just what loading ruleset files needs: no BullMQ consumers, no HTTP server. */
@Module({
  imports: [
    ConfigModule.forRoot(configModuleOptions),
    DatabaseModule.forRoot(),
    QueueModule.forRoot([QUEUE_NAMES.DATA_INGESTION]),
  ],
  providers: [
    AuthorityRepository,
    RulesetRepository,
    RulesetVersionRepository,
    RulesetLoadService,
  ],
})
export class RulesetLoadCliModule {}
