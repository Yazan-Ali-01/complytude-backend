import { Global, Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';

/** Global so the guard (registered in AppModule) and the login lockout share one limiter. */
@Global()
@Module({
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
