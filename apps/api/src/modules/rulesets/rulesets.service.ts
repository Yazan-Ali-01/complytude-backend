import {
  DatabaseService,
  OffsetPaginationOptions,
  OffsetPaginationResult,
} from '@lib/database';
import {
  INGESTION_JOB_NAMES,
  QUEUE_NAMES,
  QueueProducerService,
} from '@lib/queue';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AuthorityRepository } from '../../repositories/authorities/authority.repository';
import { RulesetVersionRepository } from '../../repositories/rulesets/ruleset-version.repository';
import {
  RulesetFilters,
  RulesetRepository,
} from '../../repositories/rulesets/ruleset.repository';
import { RulesetsI18n } from './constants/i18n.constants';
import { IngestionStatus } from './constants/ingestion-status.constants';
import { CreateRulesetVersionDto } from './dto/create-ruleset-version.dto';
import { CreateRulesetDto } from './dto/create-ruleset.dto';
import { UpdateRulesetDto } from './dto/update-ruleset.dto';
import { RulesetVersion } from './entities/ruleset-version.entity';
import { Ruleset } from './entities/ruleset.entity';

export interface RulesetWithVersion {
  ruleset: Ruleset;
  currentVersionData: RulesetVersion;
}

@Injectable()
export class RulesetsService {
  private readonly logger = new Logger(RulesetsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly rulesetRepository: RulesetRepository,
    private readonly rulesetVersionRepository: RulesetVersionRepository,
    private readonly authorityRepository: AuthorityRepository,
    private readonly queueProducerService: QueueProducerService,
    private readonly i18n: I18nService,
  ) {}

  async create(
    dto: CreateRulesetDto,
    createdBy: string,
  ): Promise<RulesetWithVersion & { ingestionStatus: IngestionStatus }> {
    try {
      const existing = await this.rulesetRepository.findByKey(dto.key);
      if (existing) {
        throw new ConflictException(
          this.i18n.t(RulesetsI18n.errors.RULESET_ALREADY_EXISTS),
        );
      }

      if (dto.authority_id) {
        await this.validateAuthorityExists(dto.authority_id);
      }

      const result = await this.databaseService.transaction(async (client) => {
        const ruleset = await this.rulesetRepository.create(
          {
            key: dto.key,
            name: dto.name,
            description: dto.description ?? null,
            authority_id: dto.authority_id ?? null,
            created_by: createdBy,
          },
          { client },
        );

        const version = await this.rulesetVersionRepository.create(
          {
            ruleset_id: ruleset.id,
            version: '1.0.0',
            clauses: JSON.stringify(dto.clauses ?? []),
            changelog: 'Initial version',
            is_active: true,
            created_by: createdBy,
          },
          { client },
        );

        this.logger.log(
          `Created ruleset "${dto.key}" with initial version 1.0.0`,
        );

        return { ruleset, currentVersionData: version };
      });

      const ingestionStatus = await this.enqueueIngestion(
        result.ruleset.id,
        result.currentVersionData.id,
        dto.key,
        '1.0.0',
      );

      return { ...result, ingestionStatus };
    } catch (error) {
      this.handleError(error, `create ruleset "${dto.key}"`);
    }
  }

  async findAll(
    filters: RulesetFilters = {},
    pagination: OffsetPaginationOptions = { page: 1, limit: 20 },
  ): Promise<OffsetPaginationResult<Ruleset>> {
    try {
      return await this.rulesetRepository.findMany(filters, pagination);
    } catch (error) {
      this.handleError(error, 'list rulesets');
    }
  }

  async findByKey(key: string): Promise<RulesetWithVersion> {
    try {
      const ruleset = await this.rulesetRepository.findByKey(key);
      if (!ruleset) {
        throw new NotFoundException(
          this.i18n.t(RulesetsI18n.errors.RULESET_NOT_FOUND),
        );
      }

      const activeVersion =
        await this.rulesetVersionRepository.findActiveByRulesetId(ruleset.id);
      if (!activeVersion) {
        throw new InternalServerErrorException(
          this.i18n.t(RulesetsI18n.errors.RULESET_NO_ACTIVE_VERSION),
        );
      }

      return { ruleset, currentVersionData: activeVersion };
    } catch (error) {
      this.handleError(error, `find ruleset "${key}"`);
    }
  }

  async findByKeys(keys: string[]): Promise<Ruleset[]> {
    try {
      return await this.rulesetRepository.findByKeys(keys);
    } catch (error) {
      this.handleError(error, 'find rulesets by keys');
    }
  }

  async update(
    key: string,
    dto: UpdateRulesetDto,
  ): Promise<RulesetWithVersion> {
    try {
      const ruleset = await this.rulesetRepository.findByKey(key);
      if (!ruleset) {
        throw new NotFoundException(
          this.i18n.t(RulesetsI18n.errors.RULESET_NOT_FOUND),
        );
      }

      if (dto.authority_id !== undefined) {
        await this.validateAuthorityExists(dto.authority_id);
      }

      const updateData: Record<string, unknown> = {};
      if (dto.name !== undefined) updateData.name = dto.name;
      if (dto.description !== undefined)
        updateData.description = dto.description;
      if (dto.authority_id !== undefined)
        updateData.authority_id = dto.authority_id;
      if (dto.status !== undefined) updateData.status = dto.status;

      const updated =
        Object.keys(updateData).length === 0
          ? ruleset
          : await this.rulesetRepository.update(ruleset.id, updateData);

      const activeVersion =
        await this.rulesetVersionRepository.findActiveByRulesetId(updated.id);
      if (!activeVersion) {
        throw new InternalServerErrorException(
          this.i18n.t(RulesetsI18n.errors.RULESET_NO_ACTIVE_VERSION),
        );
      }

      this.logger.log(`Updated ruleset "${key}"`);
      return { ruleset: updated, currentVersionData: activeVersion };
    } catch (error) {
      this.handleError(error, `update ruleset "${key}"`);
    }
  }

  async deactivate(key: string): Promise<void> {
    try {
      const result = await this.rulesetRepository.deactivateByKey(key);
      if (!result) {
        throw new NotFoundException(
          this.i18n.t(RulesetsI18n.errors.RULESET_NOT_FOUND),
        );
      }
      this.logger.log(`Deactivated ruleset "${key}"`);
    } catch (error) {
      this.handleError(error, `deactivate ruleset "${key}"`);
    }
  }

  async createVersion(
    key: string,
    dto: CreateRulesetVersionDto,
    createdBy: string,
  ): Promise<RulesetVersion & { ingestionStatus: IngestionStatus }> {
    try {
      const ruleset = await this.rulesetRepository.findByKey(key);
      if (!ruleset) {
        throw new NotFoundException(
          this.i18n.t(RulesetsI18n.errors.RULESET_NOT_FOUND),
        );
      }

      const existingVersion =
        await this.rulesetVersionRepository.findByRulesetIdAndVersion(
          ruleset.id,
          dto.version,
        );
      if (existingVersion) {
        throw new ConflictException(
          this.i18n.t(RulesetsI18n.errors.VERSION_ALREADY_EXISTS),
        );
      }

      const version = await this.publishVersion(ruleset.id, {
        ruleset_id: ruleset.id,
        version: dto.version,
        clauses: JSON.stringify(dto.clauses ?? []),
        changelog: dto.changelog ?? null,
        is_active: true,
        created_by: createdBy,
      });

      this.logger.log(`Created version "${dto.version}" for ruleset "${key}"`);

      const ingestionStatus = await this.enqueueIngestion(
        ruleset.id,
        version.id,
        key,
        dto.version,
      );

      return { ...version, ingestionStatus };
    } catch (error) {
      this.handleError(error, `create version for ruleset "${key}"`);
    }
  }

  async listVersions(
    key: string,
    pagination: OffsetPaginationOptions = { page: 1, limit: 20 },
  ): Promise<OffsetPaginationResult<RulesetVersion>> {
    try {
      const ruleset = await this.rulesetRepository.findByKey(key);
      if (!ruleset) {
        throw new NotFoundException(
          this.i18n.t(RulesetsI18n.errors.RULESET_NOT_FOUND),
        );
      }

      return await this.rulesetVersionRepository.findByRulesetId(
        ruleset.id,
        pagination,
      );
    } catch (error) {
      this.handleError(error, `list versions for ruleset "${key}"`);
    }
  }

  async findVersion(key: string, version: string): Promise<RulesetVersion> {
    try {
      const ruleset = await this.rulesetRepository.findByKey(key);
      if (!ruleset) {
        throw new NotFoundException(
          this.i18n.t(RulesetsI18n.errors.RULESET_NOT_FOUND),
        );
      }

      const rulesetVersion =
        await this.rulesetVersionRepository.findByRulesetIdAndVersion(
          ruleset.id,
          version,
        );
      if (!rulesetVersion) {
        throw new NotFoundException(
          this.i18n.t(RulesetsI18n.errors.VERSION_NOT_FOUND),
        );
      }

      return rulesetVersion;
    } catch (error) {
      this.handleError(error, `find version "${version}" for ruleset "${key}"`);
    }
  }

  async rollbackVersion(
    key: string,
    sourceVersion: string,
    newVersion: string,
    changelog: string | undefined,
    createdBy: string,
  ): Promise<RulesetVersion & { ingestionStatus: IngestionStatus }> {
    try {
      const ruleset = await this.rulesetRepository.findByKey(key);
      if (!ruleset) {
        throw new NotFoundException(
          this.i18n.t(RulesetsI18n.errors.RULESET_NOT_FOUND),
        );
      }

      const source =
        await this.rulesetVersionRepository.findByRulesetIdAndVersion(
          ruleset.id,
          sourceVersion,
        );
      if (!source) {
        throw new NotFoundException(
          this.i18n.t(RulesetsI18n.errors.VERSION_NOT_FOUND),
        );
      }

      const existingNew =
        await this.rulesetVersionRepository.findByRulesetIdAndVersion(
          ruleset.id,
          newVersion,
        );
      if (existingNew) {
        throw new ConflictException(
          this.i18n.t(RulesetsI18n.errors.VERSION_ALREADY_EXISTS),
        );
      }

      const version = await this.publishVersion(ruleset.id, {
        ruleset_id: ruleset.id,
        version: newVersion,
        clauses: JSON.stringify(source.clauses),
        changelog: changelog ?? `Rolled back to version ${sourceVersion}`,
        rolled_back_from_version: sourceVersion,
        is_active: true,
        created_by: createdBy,
      });

      this.logger.log(
        `Rolled back ruleset "${key}" from v${sourceVersion} → v${newVersion}`,
      );

      const ingestionStatus = await this.enqueueIngestion(
        ruleset.id,
        version.id,
        key,
        newVersion,
      );

      return { ...version, ingestionStatus };
    } catch (error) {
      this.handleError(
        error,
        `rollback ruleset "${key}" from v${sourceVersion}`,
      );
    }
  }

  async enqueueIngestionForActiveVersion(
    key: string,
  ): Promise<{ jobId: string | undefined; versionId: string }> {
    try {
      const ruleset = await this.rulesetRepository.findByKey(key);
      if (!ruleset) {
        throw new NotFoundException(
          this.i18n.t(RulesetsI18n.errors.RULESET_NOT_FOUND),
        );
      }

      const activeVersion =
        await this.rulesetVersionRepository.findActiveByRulesetId(ruleset.id);
      if (!activeVersion) {
        throw new ConflictException(
          this.i18n.t(RulesetsI18n.errors.RULESET_NO_ACTIVE_VERSION),
        );
      }

      // Manual /ingest endpoint: no jobId (allow re-ingestion for testing/backfill)
      const job = await this.queueProducerService.enqueue(
        QUEUE_NAMES.DATA_INGESTION,
        INGESTION_JOB_NAMES.RULESET_INGESTION,
        { rulesetId: ruleset.id, versionId: activeVersion.id },
      );

      this.logger.log(
        `Manually enqueued ingestion job for ruleset "${key}" v${activeVersion.version} (jobId=${job.id})`,
      );

      return { jobId: job.id, versionId: activeVersion.id };
    } catch (error) {
      this.handleError(
        error,
        `enqueue ingestion for active version of ruleset "${key}"`,
      );
    }
  }

  /**
   * Creates a version as the ruleset's only active one: retrieval reads only the active version,
   * so the previous one stops being cited as soon as this commits.
   */
  private async publishVersion(
    rulesetId: string,
    row: Parameters<RulesetVersionRepository['create']>[0],
  ): Promise<RulesetVersion> {
    return this.databaseService.transaction(async (client) => {
      const created = await this.rulesetVersionRepository.create(row, {
        client,
      });
      await this.rulesetVersionRepository.deactivateOthers(
        rulesetId,
        created.id,
        { client },
      );
      await this.rulesetRepository.setCurrentVersion(rulesetId, row.version, {
        client,
      });
      return created;
    });
  }

  private async enqueueIngestion(
    rulesetId: string,
    versionId: string,
    key: string,
    version: string,
  ): Promise<IngestionStatus> {
    try {
      await this.queueProducerService.enqueue(
        QUEUE_NAMES.DATA_INGESTION,
        INGESTION_JOB_NAMES.RULESET_INGESTION,
        { rulesetId, versionId },
        { jobId: `ruleset-ingest-${versionId}` },
      );
      this.logger.log(
        `Enqueued ingestion job for ruleset "${key}" v${version} (versionId=${versionId})`,
      );
      return 'enqueued';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to enqueue ingestion job for ruleset "${key}" v${version}: ${message}. ` +
          `Use POST /rulesets/${key}/ingest to retry.`,
      );
      return 'failed';
    }
  }

  private async validateAuthorityExists(authorityId: string): Promise<void> {
    const authority = await this.authorityRepository.findById(authorityId);
    if (!authority) {
      throw new BadRequestException(
        this.i18n.t(RulesetsI18n.errors.AUTHORITY_NOT_FOUND),
      );
    }
  }

  private handleError(error: unknown, context: string): never {
    if (
      error instanceof ConflictException ||
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`Failed to ${context}: ${message}`);
    throw new InternalServerErrorException(`Failed to ${context}`);
  }
}
