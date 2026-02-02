import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
// import { StorageController } from './storage.controller';
import storageConfig from 'src/config/storage.config';
import { TenantModule } from 'src/modules/tenants/tenant.module';
import { FileValidationPipe } from './pipes/file-validation.pipe';
import { StorageService } from './storage.service';

@Module({
  imports: [ConfigModule.forFeature(storageConfig), TenantModule],
  controllers: [],
  providers: [StorageService, FileValidationPipe],
  exports: [StorageService],
})
export class StorageModule {}
