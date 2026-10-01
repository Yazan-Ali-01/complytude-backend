import { DatabaseService } from '@lib/database';
import {
  INGESTION_JOB_NAMES,
  QUEUE_NAMES,
  QueueProducerService,
} from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CreateRulesetDto } from 'src/modules/rulesets/dto/create-ruleset.dto';
import { AuthorityRepository } from 'src/repositories/authorities/authority.repository';
import { RulesetVersionRepository } from 'src/repositories/rulesets/ruleset-version.repository';
import { RulesetRepository } from 'src/repositories/rulesets/ruleset.repository';

/** A `POST /rulesets` body with the authority named by code (see data/rulesets/README.md). */
interface RulesetFile {
  file: string;
  authority: { code: string; name: string };
  dto: CreateRulesetDto;
}

export type RulesetLoadOutcome = 'created' | 'new-version' | 'unchanged';

export interface LoadedRuleset {
  file: string;
  key: string;
  outcome: RulesetLoadOutcome;
  version: string;
  versionId: string;
  jobId?: string;
}

export class RulesetFileError extends Error {}

/**
 * Loads the ruleset files of a directory (data/rulesets): every file is validated as the API
 * validates `POST /rulesets` before anything is written. A new ruleset gets version 1.0.0; a
 * ruleset whose clauses changed gets a new minor version. Each new version is created inactive
 * and queued for ingestion; activating it (after its review, where required) stays an explicit
 * `POST /rulesets/:key/versions/:version/activate`.
 */
@Injectable()
export class RulesetLoadService {
  private readonly logger = new Logger(RulesetLoadService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly rulesetRepository: RulesetRepository,
    private readonly rulesetVersionRepository: RulesetVersionRepository,
    private readonly authorityRepository: AuthorityRepository,
    private readonly queueProducerService: QueueProducerService,
  ) {}

  async load(dir: string): Promise<LoadedRuleset[]> {
    const files = await this.readAll(dir);
    const loaded: LoadedRuleset[] = [];
    for (const file of files) {
      loaded.push(await this.loadOne(file));
    }
    return loaded;
  }

  private async readAll(dir: string): Promise<RulesetFile[]> {
    const names = readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort();
    const files: RulesetFile[] = [];
    const problems: string[] = [];
    for (const name of names) {
      const raw = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<
        string,
        unknown
      >;
      const { authority, ...body } = raw as {
        authority?: { code?: unknown; name?: unknown };
      } & Record<string, unknown>;
      if (
        typeof authority?.code !== 'string' ||
        typeof authority?.name !== 'string'
      ) {
        problems.push(`${name}: authority must have a code and a name`);
        continue;
      }
      const dto = plainToInstance(CreateRulesetDto, body);
      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      if (errors.length > 0) {
        problems.push(`${name}: ${describe(errors).join('; ')}`);
        continue;
      }
      files.push({
        file: name,
        authority: { code: authority.code, name: authority.name },
        dto,
      });
    }
    if (problems.length > 0) {
      throw new RulesetFileError(problems.join('\n'));
    }
    return files;
  }

  private async loadOne({
    file,
    authority,
    dto,
  }: RulesetFile): Promise<LoadedRuleset> {
    const authorityId = await this.authorityIdFor(authority);
    const clauses = instanceToPlain(dto.clauses) as unknown[];
    const fields = {
      name: dto.name,
      description: dto.description ?? null,
      authority_id: authorityId,
      jurisdictions: dto.jurisdictions ?? [],
      document_types: dto.document_types ?? [],
    };

    const existing = await this.rulesetRepository.findByKey(dto.key);
    if (!existing) {
      const { rulesetId, versionId } = await this.databaseService.transaction(
        async (client) => {
          const ruleset = await this.rulesetRepository.create(
            { key: dto.key, ...fields, created_by: null },
            { client },
          );
          const version = await this.rulesetVersionRepository.create(
            {
              ruleset_id: ruleset.id,
              version: '1.0.0',
              clauses: JSON.stringify(clauses),
              changelog: `Loaded from ${file}`,
              is_active: false,
              created_by: null,
            },
            { client },
          );
          return { rulesetId: ruleset.id, versionId: version.id };
        },
      );
      return {
        file,
        key: dto.key,
        outcome: 'created',
        version: '1.0.0',
        versionId,
        jobId: await this.enqueue(rulesetId, versionId),
      };
    }

    await this.rulesetRepository.update(existing.id, fields);
    const versions = (
      await this.rulesetVersionRepository.findByRulesetId(existing.id, {
        page: 1,
        limit: 1000,
      })
    ).data.sort((a, b) => compareVersions(b.version, a.version));
    const latest = versions[0];
    if (latest && canonical(latest.clauses) === canonical(clauses)) {
      return {
        file,
        key: dto.key,
        outcome: 'unchanged',
        version: latest.version,
        versionId: latest.id,
      };
    }

    const version = latest ? nextMinor(latest.version) : '1.0.0';
    const created = await this.rulesetVersionRepository.create({
      ruleset_id: existing.id,
      version,
      clauses: JSON.stringify(clauses),
      changelog: `Loaded from ${file}`,
      is_active: false,
      created_by: null,
    });
    return {
      file,
      key: dto.key,
      outcome: 'new-version',
      version,
      versionId: created.id,
      jobId: await this.enqueue(existing.id, created.id),
    };
  }

  private async authorityIdFor(authority: {
    code: string;
    name: string;
  }): Promise<string> {
    const code = authority.code.toUpperCase();
    const existing = await this.authorityRepository.findOne({
      filters: { code },
      select: ['id'],
    });
    if (existing) {
      return existing.id;
    }
    const created = await this.authorityRepository.create({
      code,
      name: authority.name,
    });
    this.logger.log(`Created authority ${code} (${authority.name})`);
    return created.id;
  }

  private async enqueue(
    rulesetId: string,
    versionId: string,
  ): Promise<string | undefined> {
    const job = await this.queueProducerService.enqueue(
      QUEUE_NAMES.DATA_INGESTION,
      INGESTION_JOB_NAMES.RULESET_INGESTION,
      { rulesetId, versionId },
    );
    return job.id;
  }
}

function describe(errors: ValidationError[], path = ''): string[] {
  return errors.flatMap((error) => {
    const at = path ? `${path}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map(
      (message) => `${at}: ${message}`,
    );
    return [...own, ...describe(error.children ?? [], at)];
  });
}

/** JSON with object keys sorted: JSONB doesn't keep key order. */
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v as Record<string, unknown>)
              .sort()
              .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(sort(value));
}

function parts(version: string): number[] {
  return version.split('.').map((part) => parseInt(part, 10) || 0);
}

function compareVersions(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  }
  return 0;
}

function nextMinor(version: string): string {
  const [major, minor] = parts(version);
  return `${major}.${minor + 1}.0`;
}
