import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryBuilder } from '../base/query-builder';
import { FindManyOptions, QueryOptions } from '../base/repository.interface';
import {
  CreateRulesetInput,
  Ruleset,
  RulesetStatus,
  UpdateRulesetInput,
} from './interfaces/ruleset.interfaces';

type RulesetRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  authority_id: string | null;
  clauses: string | unknown[];
  metadata: string | Record<string, unknown>;
  version: string;
  status: RulesetStatus;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

type CreateRulesetRow = {
  key: string;
  name: string;
  description?: string | null;
  authority_id?: string | null;
  clauses: string;
  metadata: string;
  version: string;
  status: RulesetStatus;
  created_by?: string | null;
};

type UpdateRulesetRow = Partial<{
  name: string;
  description: string | null;
  authority_id: string | null;
  clauses: string;
  metadata: string;
  version: string;
  status: RulesetStatus;
  updated_at: Date;
}>;

@Injectable()
export class RulesetRepository extends BaseRepository<
  Ruleset,
  CreateRulesetRow,
  UpdateRulesetRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.rulesets');
  }

  protected mapRow(row: Record<string, unknown>): Ruleset {
    const data = row as RulesetRow;
    return {
      id: data.id,
      key: data.key,
      name: data.name,
      description: data.description ?? undefined,
      authority_id: data.authority_id ?? undefined,
      clauses:
        typeof data.clauses === 'string'
          ? JSON.parse(data.clauses)
          : data.clauses,
      metadata:
        typeof data.metadata === 'string'
          ? JSON.parse(data.metadata)
          : data.metadata,
      version: data.version,
      status: data.status,
      created_by: data.created_by ?? undefined,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async findByKey(
    key: string,
    options?: QueryOptions,
  ): Promise<Ruleset | null> {
    return this.findOne({ ...options, filters: { key } });
  }

  async findByKeys(keys: string[], options?: QueryOptions): Promise<Ruleset[]> {
    if (!keys.length) return [];

    const qb = new QueryBuilder();
    qb.addCondition({ field: 'key', value: keys, operator: 'IN' });
    qb.addCondition({ field: 'status', value: 'active' });
    const where = qb.buildWhere();

    const result = await this.executeQuery<RulesetRow>(
      `SELECT * FROM ${this.tableName} ${where.clause} ORDER BY name`,
      where.params,
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findAllRulesets(
    filters?: { authority_id?: string; status?: RulesetStatus },
    options?: FindManyOptions,
  ): Promise<Ruleset[]> {
    const qb = new QueryBuilder();
    qb.addFilters(filters ?? {});
    const where = qb.buildWhere();

    const result = await this.executeQuery<RulesetRow>(
      `SELECT * FROM ${this.tableName} ${where.clause} ORDER BY name`,
      where.params,
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async createRuleset(
    input: CreateRulesetInput,
    options?: QueryOptions,
  ): Promise<Ruleset> {
    const payload: CreateRulesetRow = {
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      authority_id: input.authority_id ?? null,
      clauses: JSON.stringify(input.clauses ?? []),
      metadata: JSON.stringify(input.metadata ?? {}),
      version: input.version ?? '1.0.0',
      status: input.status ?? 'active',
      created_by: input.created_by ?? null,
    };

    return this.create(payload, options);
  }

  async updateByKey(
    key: string,
    data: UpdateRulesetInput,
    options?: QueryOptions,
  ): Promise<Ruleset> {
    const entries: Array<[string, unknown]> = Object.entries({
      name: data.name,
      description: data.description,
      authority_id: data.authority_id,
      clauses:
        data.clauses === undefined ? undefined : JSON.stringify(data.clauses),
      metadata:
        data.metadata === undefined ? undefined : JSON.stringify(data.metadata),
      version: data.version,
      status: data.status,
    }).filter(([, value]) => value !== undefined);

    entries.push(['updated_at', data.updated_at ?? new Date()]);

    const setClause = entries
      .map(([column], idx) => `${column} = $${idx + 1}`)
      .join(', ');
    const values = entries.map(([, value]) => value);

    const result = await this.executeQuery<RulesetRow>(
      `UPDATE ${this.tableName} SET ${setClause} WHERE key = $${
        entries.length + 1
      } RETURNING *`,
      [...values, key],
      options,
    );

    if (!result.rows.length) {
      throw new NotFoundException(`Ruleset with key ${key} not found`);
    }

    return this.mapRow(result.rows[0]);
  }

  async deleteByKey(key: string, options?: QueryOptions): Promise<void> {
    const result = await this.executeQuery(
      `DELETE FROM ${this.tableName} WHERE key = $1`,
      [key],
      options,
    );

    if (!result.rowCount) {
      throw new NotFoundException(`Ruleset with key ${key} not found`);
    }
  }

  async findByTemplateId(
    templateId: string,
    options?: QueryOptions,
  ): Promise<Array<Pick<Ruleset, 'id' | 'key' | 'name'>>> {
    const result = await this.executeQuery<RulesetRow>(
      `
        SELECT r.id, r.key, r.name
        FROM public.rulesets r
        INNER JOIN public.template_rulesets tr ON r.id = tr.ruleset_id
        WHERE tr.template_id = $1
      `,
      [templateId],
      options,
    );

    return result.rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
    }));
  }

  async associateWithTemplate(
    templateId: string,
    rulesetIds: string[],
    options?: QueryOptions,
  ): Promise<void> {
    for (const rulesetId of rulesetIds) {
      await this.executeQuery(
        `
          INSERT INTO public.template_rulesets (template_id, ruleset_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `,
        [templateId, rulesetId],
        options,
      );
    }
  }

  async removeTemplateAssociations(
    templateId: string,
    options?: QueryOptions,
  ): Promise<void> {
    await this.executeQuery(
      'DELETE FROM public.template_rulesets WHERE template_id = $1',
      [templateId],
      options,
    );
  }
}
