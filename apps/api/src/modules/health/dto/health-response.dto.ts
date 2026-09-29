import { ApiProperty } from '@nestjs/swagger';

export class HealthCheckResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ example: '2026-09-29T10:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ description: 'Process uptime in seconds', example: 3600.5 })
  uptime!: number;
}

class ReadinessChecksDto {
  @ApiProperty({ enum: ['up', 'down'] })
  database!: 'up' | 'down';

  @ApiProperty({ enum: ['up', 'down'] })
  redis!: 'up' | 'down';

  @ApiProperty({ enum: ['up', 'down'] })
  queues!: 'up' | 'down';
}

export class ReadinessResponseDto {
  @ApiProperty({ enum: ['ok', 'unavailable'] })
  status!: 'ok' | 'unavailable';

  @ApiProperty({ type: ReadinessChecksDto })
  checks!: ReadinessChecksDto;
}
