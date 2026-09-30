import { DatabaseModule } from '@lib/database';
import { QUEUE_NAMES, QueueModule } from '@lib/queue';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configModuleOptions } from 'src/config/config-module.options';
import { RulesetVersionRepository } from 'src/repositories/rulesets/ruleset-version.repository';
import { RulesetReingestService } from './ruleset-reingest.service';

/** Just what queueing the ingestion jobs needs: no BullMQ consumers, no HTTP server. */
@Module({
  imports: [
    ConfigModule.forRoot(configModuleOptions),
    DatabaseModule.forRoot(),
    QueueModule.forRoot([QUEUE_NAMES.DATA_INGESTION]),
  ],
  providers: [RulesetVersionRepository, RulesetReingestService],
})
export class RulesetReingestCliModule {}
