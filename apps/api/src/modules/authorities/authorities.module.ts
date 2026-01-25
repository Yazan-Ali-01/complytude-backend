import { Module } from '@nestjs/common';
import { AuthoritiesController } from './authorities.controller';
import { AuthoritiesService } from './authorities.service';
import { DatabaseModule, AuthorityRepository } from '@complytude/shared';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthoritiesController],
  providers: [AuthoritiesService, AuthorityRepository],
  exports: [AuthoritiesService],
})
export class AuthoritiesModule {}
