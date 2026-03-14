import { Injectable } from '@nestjs/common';
import { BaseRepository, QueryOptions } from '@lib/database';
import { DatabaseService } from '@lib/database';

export interface CreditPackage {
  id: string;
  key: string;
  name: string;
  credits: number;
  /** Price in the default currency (AED) */
  price: number;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

type CreateCreditPackageRow = {
  key: string;
  name: string;
  credits: number;
  /** Price in the default currency (AED) */
  price: number;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  is_active?: boolean;
};

type UpdateCreditPackageRow = {
  name?: string;
  credits?: number;
  /** Price in the default currency (AED) */
  price?: number;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  is_active?: boolean;
};

type CreditPackageRow = {
  id: string;
  key: string;
  name: string;
  credits: number;
  price: string; // NUMERIC comes back as string from pg
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class CreditPackagesRepository extends BaseRepository<
  CreditPackage,
  CreateCreditPackageRow,
  UpdateCreditPackageRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.credit_packages');
  }

  protected getSelectColumns(): string {
    return 'id, key, name, credits, price, stripe_product_id, stripe_price_id, is_active, created_at, updated_at';
  }

  protected mapRow(row: Record<string, unknown>): CreditPackage {
    const data = row as CreditPackageRow;
    return {
      id: data.id,
      key: data.key,
      name: data.name,
      credits: data.credits,
      price: parseFloat(data.price),
      stripe_product_id: data.stripe_product_id,
      stripe_price_id: data.stripe_price_id,
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async findAll(options?: QueryOptions): Promise<CreditPackage[]> {
    const result = await this.executeQuery<CreditPackageRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} ORDER BY price ASC`,
      [],
      options,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findAllActive(options?: QueryOptions): Promise<CreditPackage[]> {
    const result = await this.executeQuery<CreditPackageRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE is_active = true ORDER BY price ASC`,
      [],
      options,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findByKey(
    key: string,
    options?: QueryOptions,
  ): Promise<CreditPackage | null> {
    const result = await this.executeQuery<CreditPackageRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE key = $1`,
      [key],
      options,
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async upsertFromConstant(
    key: string,
    name: string,
    credits: number,
    price: number,
    options?: QueryOptions,
  ): Promise<CreditPackage> {
    const result = await this.executeQuery<CreditPackageRow>(
      `INSERT INTO ${this.tableName} (key, name, credits, price)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE SET
         name = EXCLUDED.name,
         credits = EXCLUDED.credits,
         price = EXCLUDED.price,
         updated_at = now()
       RETURNING ${this.getSelectColumns()}`,
      [key, name, credits, price],
      options,
    );
    return this.mapRow(result.rows[0]);
  }

  async updateStripeProductId(
    id: string,
    stripeProductId: string,
    options?: QueryOptions,
  ): Promise<void> {
    await this.executeQuery(
      `UPDATE ${this.tableName} SET stripe_product_id = $1, updated_at = now() WHERE id = $2`,
      [stripeProductId, id],
      options,
    );
  }

  async updateStripePriceId(
    id: string,
    stripePriceId: string,
    options?: QueryOptions,
  ): Promise<void> {
    await this.executeQuery(
      `UPDATE ${this.tableName} SET stripe_price_id = $1, updated_at = now() WHERE id = $2`,
      [stripePriceId, id],
      options,
    );
  }
}
