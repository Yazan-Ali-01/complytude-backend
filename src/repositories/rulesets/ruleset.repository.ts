/* eslint-disable @typescript-eslint/no-unused-vars */
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
