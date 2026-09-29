import {
  Controller,
  Get,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/auth-options.decorator';
import {
  HealthCheckResponseDto,
  ReadinessResponseDto,
} from './dto/health-response.dto';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
@Public()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness: the process is up (does not check dependencies)',
  })
  @ApiResponse({ status: 200, type: HealthCheckResponseDto })
  check(): HealthCheckResponseDto {
    return this.healthService.check();
  }

  @Get('ready')
  @ApiOperation({
    summary:
      'Readiness: the database, Redis and the queues answer (load balancer and uptime checks)',
  })
  @ApiResponse({ status: 200, type: ReadinessResponseDto })
  @ApiResponse({
    status: 503,
    description: 'A dependency is down; the body says which',
    type: ReadinessResponseDto,
  })
  async ready(): Promise<ReadinessResponseDto> {
    const result = await this.healthService.checkReadiness();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
