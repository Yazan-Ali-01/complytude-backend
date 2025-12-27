import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import {
  CreateTemplateVersionInput,
  TemplateField,
  TemplateVersion,
} from './interfaces/template-version.interfaces';

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

type CreateTemplateVersionRow = {
  template_id: string;
  version: string;
  fields: string;
  file_url: string;
  changelog?: string | null;
  metadata: string;
  is_active?: boolean;
  created_by?: string | null;
};

type UpdateTemplateVersionRow = Partial<{
  fields: string;
  file_url: string;
  changelog: string | null;
  metadata: string;
  is_active: boolean;
  updated_at: Date;
}>;

@Injectable()
export class TemplateVersionRepository extends BaseRepository<
  TemplateVersion,
  CreateTemplateVersionRow,
  UpdateTemplateVersionRow
> {
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
      changelog: data.changelog ?? undefined,
      metadata:
        typeof data.metadata === 'string'
          ? JSON.parse(data.metadata)
          : data.metadata,
      is_active: data.is_active,
      created_by: data.created_by ?? undefined,
      created_at: data.created_at,
    };
  }

  async findByTemplateId(
    templateId: string,
    options?: QueryOptions,
  ): Promise<TemplateVersion[]> {
    const result = await this.executeQuery<TemplateVersionRow>(
      `SELECT * FROM ${this.tableName} WHERE template_id = $1 ORDER BY created_at DESC`,
      [templateId],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findByTemplateIdAndVersion(
    templateId: string,
    version: string,
    options?: QueryOptions,
  ): Promise<TemplateVersion | null> {
    const result = await this.executeQuery<TemplateVersionRow>(
      `SELECT * FROM ${this.tableName} WHERE template_id = $1 AND version = $2 LIMIT 1`,
      [templateId, version],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async getCurrentVersion(
    templateId: string,
    options?: QueryOptions,
  ): Promise<TemplateVersion | null> {
    const result = await this.executeQuery<TemplateVersionRow>(
      `SELECT * FROM ${this.tableName} WHERE template_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1`,
      [templateId],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async createVersion(
    input: CreateTemplateVersionInput,
    options?: QueryOptions,
  ): Promise<TemplateVersion> {
    const payload: CreateTemplateVersionRow = {
      template_id: input.template_id,
      version: input.version,
      fields: JSON.stringify(input.fields ?? []),
      file_url: input.file_url,
      changelog: input.changelog ?? null,
      metadata: JSON.stringify(input.metadata ?? {}),
      is_active: input.is_active ?? true,
      created_by: input.created_by ?? null,
    };

    return this.create(payload, options);
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

  async activateVersion(
    templateId: string,
    version: string,
    options?: QueryOptions,
  ): Promise<TemplateVersion> {
    const result = await this.executeQuery<TemplateVersionRow>(
      `UPDATE ${this.tableName} SET is_active = true WHERE template_id = $1 AND version = $2 RETURNING *`,
      [templateId, version],
      options,
    );

    if (!result.rows.length) {
      throw new NotFoundException(
        `Template version ${version} not found for template ${templateId}`,
      );
    }

    return this.mapRow(result.rows[0]);
  }
}
