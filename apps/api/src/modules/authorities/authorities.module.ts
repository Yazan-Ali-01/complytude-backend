import { Module } from '@nestjs/common';
import { AuthorityRepository } from 'src/repositories/authorities/authority.repository';
import { AuthoritiesController } from './authorities.controller';
import { AuthoritiesService } from './authorities.service';

@Module({
  imports: [],
  controllers: [AuthoritiesController],
  providers: [AuthoritiesService, AuthorityRepository],
  exports: [AuthoritiesService],
})
export class AuthoritiesModule {}
