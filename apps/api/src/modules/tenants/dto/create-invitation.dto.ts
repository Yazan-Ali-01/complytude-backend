import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { NormalizeEmail } from 'src/common/decorators/normalize-email.decorator';
import { SystemTenantRole } from 'src/common/types';

/**
 * Request body for creating a new invitation
 */
export class CreateInvitationDto {
  @ApiProperty({
    description: 'Email address of the user to invite',
    example: 'newuser@example.com',
  })
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Role the invited user will have in the tenant',
    example: SystemTenantRole.MEMBER,
    default: SystemTenantRole.MEMBER,
  })
  @Transform(({ value }) => {
    if (value?.toLowerCase() !== SystemTenantRole.TENANT_ADMIN) {
      return value?.toLowerCase();
    }
    throw new BadRequestException(`${value} role cannot be assigned`);
  })
  @IsOptional()
  @IsString()
  roleKey?: string;
}
