import { ApiProperty as ApiProperty5 } from '@nestjs/swagger';
import {
  IsString as IsString5,
  MinLength as MinLength5,
} from 'class-validator';

export class DeactivateTenantDto {
  @ApiProperty5({
    description: 'Reason for deactivation',
    example: 'Non-payment of subscription invoice #INV-2026-001',
    minLength: 10,
  })
  @IsString5()
  @MinLength5(10, {
    message: 'Deactivation reason must be at least 10 characters',
  })
  reason: string;
}
