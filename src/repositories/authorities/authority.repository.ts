import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { FindManyOptions, QueryOptions } from '../base/repository.interface';
import {
  Authority,
  CreateAuthorityInput,
  UpdateAuthorityInput,
} from './intefaces/authority.interfaces';

type AuthorityRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  country: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

type CreateAuthorityRow = {
  code: string;
  name: string;
  description?: string | null;
  country?: string;
  is_active?: boolean;
};

type UpdateAuthorityRow = Partial<{
  name: string;
  description: string | null;
  country: string;
  is_active: boolean;
  updated_at: Date;
}>;

@Injectable()
export class AuthorityRepository extends BaseRepository<
  Authority,
  CreateAuthorityRow,
  UpdateAuthorityRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.authorities');
  }

  protected mapRow(row: Record<string, unknown>): Authority {
    const data = row as AuthorityRow;
    return {
      id: data.id,
      code: data.code,
      name: data.name,
      description: data.description ?? undefined,
      country: data.country,
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async findByCode(
    code: string,
    options?: QueryOptions,
  ): Promise<Authority | null> {
    return this.findOneBy({ code: code.toUpperCase() }, options);
  }

  async findAllAuthorities(
    activeOnly = false,
    options?: FindManyOptions,
  ): Promise<Authority[]> {
    const filters = activeOnly ? { is_active: true } : undefined;
    return this.findAll({ ...options, filters, orderBy: 'name' });
  }

  async createAuthority(
    input: CreateAuthorityInput,
    options?: QueryOptions,
  ): Promise<Authority> {
    const payload: CreateAuthorityRow = {
      code: input.code.toUpperCase(),
      name: input.name,
      description: input.description ?? null,
      country: input.country ?? 'UAE',
      is_active: input.is_active ?? true,
    };

    return this.create(payload, options);
  }

  async updateAuthority(
    id: string,
    data: UpdateAuthorityInput,
    options?: QueryOptions,
  ): Promise<Authority> {
    const payload: UpdateAuthorityRow = {
      name: data.name,
      description:
        data.description === undefined ? undefined : data.description,
      country: data.country === undefined ? undefined : data.country,
      is_active: data.is_active,
      updated_at: data.updated_at ?? new Date(),
    };

    return this.update(id, payload, options);
  }
}
