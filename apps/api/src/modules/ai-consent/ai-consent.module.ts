import { Module } from '@nestjs/common';
import { TenantAiConsentRepository } from 'src/repositories/tenants/tenant-ai-consent.repository';
import { AiConsentController } from './ai-consent.controller';
import { AiConsentService } from './ai-consent.service';

@Module({
  controllers: [AiConsentController],
  providers: [AiConsentService, TenantAiConsentRepository],
  exports: [AiConsentService],
})
export class AiConsentModule {}
