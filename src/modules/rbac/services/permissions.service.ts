import { Injectable, Logger } from '@nestjs/common';
import { PermissionsRepository } from '../repositories/permissions.repository';
import { Permission } from '../entities/permission.entity';

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(private readonly permissionsRepository: PermissionsRepository) {}

  async findAll(): Promise<Permission[]> {
    this.logger.debug('Finding all permissions');
    return this.permissionsRepository.findAll();
  }

  async findByName(name: string): Promise<Permission | null> {
    this.logger.debug(`Finding permission by name: ${name}`);
    return this.permissionsRepository.findByName(name);
  }

  async findByResource(resource: string): Promise<Permission[]> {
    this.logger.debug(`Finding permissions by resource: ${resource}`);
    return this.permissionsRepository.findByResource(resource);
  }

  async findByNames(names: string[]): Promise<Permission[]> {
    this.logger.debug(`Finding permissions by names: ${names.join(', ')}`);
    return this.permissionsRepository.findByNames(names);
  }

  async create(
    data: Omit<Permission, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<Permission> {
    this.logger.debug(`Creating permission: ${data.name}`);
    return this.permissionsRepository.create(data);
  }

  async update(
    id: string,
    data: Partial<Pick<Permission, 'description'>>,
  ): Promise<Permission | null> {
    this.logger.debug(`Updating permission: ${id}`);
    return this.permissionsRepository.update(id, data);
  }

  async delete(id: string): Promise<boolean> {
    this.logger.debug(`Deleting permission: ${id}`);
    return this.permissionsRepository.delete(id);
  }
}
