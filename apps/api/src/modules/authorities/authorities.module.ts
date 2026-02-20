import { Module } from '@nestjs/common';
import { AuthorityRepository } from 'src/repositories/authorities/authority.repository';
import { DatabaseModule } from '../../database/database.module';
import { AuthoritiesController } from './authorities.controller';
import { AuthoritiesService } from './authorities.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthoritiesController],
  providers: [AuthoritiesService, AuthorityRepository],
  exports: [AuthoritiesService],
})
export class AuthoritiesModule {}
