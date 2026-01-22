import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RbacService } from './rbac.service';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
