import { BaseRepository, DatabaseService, QueryOptions } from '@lib/database';
import { Injectable } from '@nestjs/common';

export interface TenantAiConsent {
  id: string;
  tenant_id: string;
  disclosure_version: string;
  accepted_by: string | null;
  accepted_at: Date;
}

export type CreateTenantAiConsentRow = {
  tenant_id: string;
  disclosure_version: string;
  accepted_by: string;
};

/** Append-only (migration 037): rows are inserted, never updated or deleted. */
@Injectable()
export class TenantAiConsentRepository extends BaseRepository<
  TenantAiConsent,
  CreateTenantAiConsentRow,
  Record<string, never>
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.tenant_ai_consents');
  }

  protected getSelectColumns(): string {
    return 'id, tenant_id, disclosure_version, accepted_by, accepted_at';
  }

  protected mapRow(row: Record<string, unknown>): TenantAiConsent {
    return {
      id: row.id as string,
      tenant_id: row.tenant_id as string,
      disclosure_version: row.disclosure_version as string,
      accepted_by: (row.accepted_by as string | null) ?? null,
      accepted_at: row.accepted_at as Date,
    };
  }

  /** The most recent acceptance, or null if the organization never accepted any version. */
  async findLatest(
    tenantId: string,
    options: QueryOptions,
  ): Promise<TenantAiConsent | null> {
    const result = await this.executeQuery(
      `SELECT ${this.getSelectColumns()} FROM public.tenant_ai_consents
       WHERE tenant_id = $1
       ORDER BY accepted_at DESC, id DESC
       LIMIT 1`,
      [tenantId],
      options,
    );
    return result.rows[0]
      ? this.mapRow(result.rows[0] as Record<string, unknown>)
      : null;
  }

  async hasAccepted(
    tenantId: string,
    version: string,
    options: QueryOptions,
  ): Promise<boolean> {
    const result = await this.executeQuery(
      `SELECT 1 FROM public.tenant_ai_consents
       WHERE tenant_id = $1 AND disclosure_version = $2
       LIMIT 1`,
      [tenantId, version],
      options,
    );
    return result.rows.length > 0;
  }

  /** Records an acceptance; false when this version was already accepted (the first one stands). */
  async accept(
    row: CreateTenantAiConsentRow,
    options: QueryOptions,
  ): Promise<boolean> {
    const result = await this.executeQuery(
      `INSERT INTO public.tenant_ai_consents (tenant_id, disclosure_version, accepted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, disclosure_version) DO NOTHING
       RETURNING id`,
      [row.tenant_id, row.disclosure_version, row.accepted_by],
      options,
    );
    return result.rows.length > 0;
  }
}
