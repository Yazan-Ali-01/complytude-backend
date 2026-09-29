import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import storageConfig from 'src/config/storage.config';
import { TenantModule } from 'src/modules/tenants/tenant.module';
import { StorageService } from './storage.service';

@Module({
  imports: [ConfigModule.forFeature(storageConfig), TenantModule],
  controllers: [],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
