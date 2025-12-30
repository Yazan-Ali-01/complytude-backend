import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { Authority } from 'src/modules/templates/entities/authority.entity';

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

@Injectable()
export class AuthorityRepository extends BaseRepository<Authority> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.authorities');
  }

  protected mapRow(row: Record<string, unknown>): Authority {
    const data = row as AuthorityRow;
    return {
      id: data.id,
      code: data.code,
      name: data.name,
      description: data.description,
      country: data.country,
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
}
