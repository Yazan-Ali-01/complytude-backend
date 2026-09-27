import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SystemTenantRole } from 'src/common/types';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'newuser@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password (minimum 8 characters)',
    example: 'Test123!@#',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(100)
  password: string;

  @ApiProperty({
    description: 'User first name',
    example: 'Jane',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  firstName?: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Smith',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastName?: string;

  @ApiProperty({
    description:
      'User role key in the current tenant (system role or custom role)',
    enum: Object.values(SystemTenantRole),
    example: SystemTenantRole.MEMBER,
  })
  @IsString()
  @Matches(/^[a-z_]+$/, {
    message: 'Role key must contain only lowercase letters and underscores',
  })
  role: string;
}
