import { BaseRepository, QueryOptions } from '@lib/database';
import { Injectable } from '@nestjs/common';
import {
  CreateFeatureRow,
  Feature,
  FeatureKey,
  UpdateFeatureRow,
} from 'src/common/types/entitlement.types';
import { DatabaseService } from '../../database/database.service';

type FeatureRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  feature_type: string;
  unit: string | null;
  creditable: boolean;
  credit_cost: number | null;
  is_active: boolean;
  metadata: unknown;
  created_at: Date;
  updated_at: Date;
};

/**
 * Repository for managing Feature catalog entities.
 * Features define all available features in the system.
 */
@Injectable()
export class FeaturesRepository extends BaseRepository<
  Feature,
  CreateFeatureRow,
  UpdateFeatureRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.features');
  }

  protected getSelectColumns(): string {
    return 'id, key, name, description, feature_type, unit, creditable, credit_cost, is_active, metadata, created_at, updated_at';
  }

  protected mapRow(row: Record<string, unknown>): Feature {
    const data = row as FeatureRow;
    return {
      id: data.id,
      key: data.key as FeatureKey, // Safe: features.key is validated by sync service from FEATURE_CATALOG
      name: data.name,
      description: data.description ?? undefined,
      feature_type: data.feature_type as Feature['feature_type'],
      unit: data.unit ?? undefined,
      creditable: data.creditable,
      credit_cost: data.credit_cost ?? undefined,
      is_active: data.is_active,
      metadata: (data.metadata as Record<string, any>) ?? {},
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * Find feature by key
   */
  async findByKey(
    key: FeatureKey,
    options?: QueryOptions,
  ): Promise<Feature | null> {
    const result = await this.executeQuery<FeatureRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE key = $1`,
      [key],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find all active features
   */
  async findAll(options?: QueryOptions): Promise<Feature[]> {
    const result = await this.executeQuery<FeatureRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE is_active = true ORDER BY key`,
      [],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Upsert feature by key (for sync service)
   */
  async upsertByKey(
    feature: CreateFeatureRow,
    options?: QueryOptions,
  ): Promise<Feature> {
    const result = await this.executeQuery<FeatureRow>(
      `
      INSERT INTO ${this.tableName} (key, name, description, feature_type, unit, creditable, credit_cost, is_active, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (key) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        feature_type = EXCLUDED.feature_type,
        unit = EXCLUDED.unit,
        creditable = EXCLUDED.creditable,
        credit_cost = EXCLUDED.credit_cost,
        is_active = EXCLUDED.is_active,
        metadata = EXCLUDED.metadata,
        updated_at = now()
      RETURNING ${this.getSelectColumns()}
      `,
      [
        feature.key,
        feature.name,
        feature.description ?? null,
        feature.feature_type,
        feature.unit ?? null,
        feature.creditable ?? false,
        feature.credit_cost ?? null,
        feature.is_active ?? true,
        feature.metadata ?? '{}',
      ],
      options,
    );

    return this.mapRow(result.rows[0]);
  }
}
