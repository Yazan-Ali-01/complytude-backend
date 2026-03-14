import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @ApiResponse({ status: 503, description: 'Service is unhealthy' })
  check() {
    return this.healthService.check();
  }

  @Get('db')
  @ApiOperation({ summary: 'Database health check' })
  @ApiResponse({ status: 200, description: 'Database is healthy' })
  @ApiResponse({ status: 503, description: 'Database is unhealthy' })
  async checkDatabase() {
    return await this.healthService.checkDatabase();
  }

  @Get('redis')
  @ApiOperation({ summary: 'Redis health check' })
  @ApiResponse({ status: 200, description: 'Redis is healthy' })
  @ApiResponse({ status: 503, description: 'Redis is unhealthy' })
  async checkRedis() {
    return await this.healthService.checkRedis();
  }

  @Get('queues')
  @ApiOperation({ summary: 'Queue health check' })
  @ApiResponse({ status: 200, description: 'Queues are healthy' })
  @ApiResponse({ status: 503, description: 'One or more queues are unhealthy' })
  async checkQueues() {
    return await this.healthService.checkQueues();
  }
}
