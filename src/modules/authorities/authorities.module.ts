import { Module } from '@nestjs/common';
import { AuthoritiesController } from './authorities.controller';
import { AuthoritiesService } from './authorities.service';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthoritiesController],
  providers: [AuthoritiesService],
  exports: [AuthoritiesService],
})
export class AuthoritiesModule {}
