import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { FileValidationPipe } from './pipes/file-validation.pipe';
import { TenantModule } from '../tenants/tenant.module';
import storageConfig from '../../config/storage.config';

@Module({
  imports: [ConfigModule.forFeature(storageConfig), TenantModule],
  controllers: [StorageController],
  providers: [StorageService, FileValidationPipe],
  exports: [StorageService],
})
export class StorageModule {}
