import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import {
  TemplateField,
  TemplateVersion,
} from 'src/modules/templates/entities/template-version.entity';

type TemplateVersionRow = {
  id: string;
  template_id: string;
  version: string;
  fields: string | TemplateField[];
  file_url: string;
  changelog: string | null;
  metadata: string | Record<string, unknown>;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
};

@Injectable()
export class TemplateVersionRepository extends BaseRepository<TemplateVersion> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.template_versions');
  }

  protected mapRow(row: Record<string, unknown>): TemplateVersion {
    const data = row as TemplateVersionRow;
    return {
      id: data.id,
      template_id: data.template_id,
      version: data.version,
      fields:
        typeof data.fields === 'string' ? JSON.parse(data.fields) : data.fields,
      file_url: data.file_url,
      changelog: data.changelog,
      metadata:
        typeof data.metadata === 'string'
          ? JSON.parse(data.metadata)
          : data.metadata,
      is_active: data.is_active,
      created_by: data.created_by,
      created_at: data.created_at,
    };
  }

  async deactivateAllVersions(
    templateId: string,
    options?: QueryOptions,
  ): Promise<void> {
    await this.executeQuery(
      `UPDATE ${this.tableName} SET is_active = false WHERE template_id = $1`,
      [templateId],
      options,
    );
  }
}
