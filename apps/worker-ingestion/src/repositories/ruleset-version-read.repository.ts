import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';

export interface RulesetVersionRow {
  id: string;
  rulesetId: string;
  version: string;
  clauses: unknown[];
  metadata: Record<string, unknown>;
}

export interface RulesetWithAuthorityRow {
  id: string;
  key: string;
  name: string;
  authorityId: string | null;
  authorityName: string | null;
}

@Injectable()
export class RulesetVersionReadRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findById(versionId: string): Promise<RulesetVersionRow | null> {
    const result = await this.databaseService.query<{
      id: string;
      ruleset_id: string;
      version: string;
      clauses: unknown[];
      metadata: Record<string, unknown>;
    }>(
      `SELECT id, ruleset_id, version, clauses, metadata
       FROM public.ruleset_versions
       WHERE id = $1`,
      [versionId],
      true,
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      rulesetId: row.ruleset_id,
      version: row.version,
      clauses: Array.isArray(row.clauses) ? row.clauses : [],
      metadata: row.metadata ?? {},
    };
  }

  async findRulesetWithAuthority(
    rulesetId: string,
  ): Promise<RulesetWithAuthorityRow | null> {
    const result = await this.databaseService.query<{
      id: string;
      key: string;
      name: string;
      authority_id: string | null;
      authority_name: string | null;
    }>(
      `SELECT r.id, r.key, r.name, r.authority_id,
              a.name AS authority_name
       FROM public.rulesets r
       LEFT JOIN public.authorities a ON a.id = r.authority_id
       WHERE r.id = $1`,
      [rulesetId],
      true,
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      key: row.key,
      name: row.name,
      authorityId: row.authority_id,
      authorityName: row.authority_name,
    };
  }
}
