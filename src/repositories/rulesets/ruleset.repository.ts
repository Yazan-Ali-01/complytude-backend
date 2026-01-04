import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import {
  Ruleset,
  RulesetClause,
} from 'src/modules/templates/entities/ruleset.entity';

type RulesetRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  authority_id: string | null;
  clauses: string | unknown[];
  metadata: string | Record<string, unknown>;
  version: string;
  status: Ruleset['status'];
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class RulesetRepository extends BaseRepository<Ruleset> {
  private readonly SORTABLE_FIELDS = [
    'name',
    'created_at',
    'updated_at',
  ] as const;

  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.rulesets');
  }

  async findMany(
    filters: { authority_id?: string; status?: string },
    _pagination: { page: number; limit: number } = { page: 1, limit: 50 },
    sortBy: (typeof this.SORTABLE_FIELDS)[number] = 'name',
    options?: QueryOptions,
  ): Promise<{ data: Ruleset[]; total: number }> {
    // Validate sortBy against whitelist
    if (!this.SORTABLE_FIELDS.includes(sortBy)) {
      throw new Error(`Invalid sort field: ${sortBy}`);
    }

    // Build query with filters
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.authority_id) {
      params.push(filters.authority_id);
      conditions.push(`authority_id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }

    const orderBy = `ORDER BY ${sortBy} ASC`; // TODO: add order direction

    // pagination --------------------------

    // Execute query
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query =
      `SELECT * FROM ${this.tableName} ${whereClause} ${orderBy}`.trim();
    const result = await this.executeQuery<RulesetRow>(query, params, options);

    // Count total
    const totalQuery = `SELECT COUNT(*) FROM ${this.tableName} ${whereClause}`;
    const totalResult = await this.executeQuery(totalQuery, params, options);

    return {
      data: result.rows.map((row) => this.mapRow(row)),
      total: parseInt(totalResult.rows[0].count as string, 10),
    };
  }

  async findActive(options?: QueryOptions): Promise<Ruleset[]> {
    const result = await this.findMany(
      { status: 'active' },
      { page: 1, limit: 1000 },
      'name',
      options,
    );
    return result.data;
  }

  protected mapRow(row: Record<string, unknown>): Ruleset {
    const data = row as RulesetRow;
    return {
      id: data.id,
      key: data.key,
      name: data.name,
      description: data.description,
      authority_id: data.authority_id,
      clauses: data.clauses as RulesetClause[],
      metadata: data.metadata as Record<string, unknown>,
      version: data.version,
      status: data.status,
      created_by: data.created_by,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async findByTemplateId(
    templateId: string,
    options?: QueryOptions,
  ): Promise<Ruleset[]> {
    const result = await this.executeQuery<RulesetRow>(
      `
      SELECT r.*
      FROM public.rulesets r
      INNER JOIN public.template_rulesets tr ON r.id = tr.ruleset_id
      WHERE tr.template_id = $1
    `,
      [templateId],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findByKeys(keys: string[], options?: QueryOptions): Promise<Ruleset[]> {
    if (!keys.length) return [];

    const result = await this.executeQuery<RulesetRow>(
      `SELECT * FROM ${this.tableName} WHERE key IN ($1) AND status = $2 ORDER BY name`,
      [keys, 'active'],
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
      throw new Error(`Ruleset with key ${key} not found`);
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
