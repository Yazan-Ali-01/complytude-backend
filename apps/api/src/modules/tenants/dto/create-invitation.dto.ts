import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { TenantRole } from 'src/common/types';

/**
 * Request body for creating a new invitation
 */
export class CreateInvitationDto {
  @ApiProperty({
    description: 'Email address of the user to invite',
    example: 'newuser@example.com',
  })
  @IsEmail()
  @Transform(({ value }) => value.toLowerCase())
  email: string;

  @ApiProperty({
    description: 'Role the invited user will have in the tenant',
    enum: Object.values(TenantRole).filter(
      (role) => role !== TenantRole.TENANT_ADMIN,
    ),
    example: TenantRole.MEMBER,
    default: TenantRole.MEMBER,
  })
  @IsEnum(
    Object.values(TenantRole).filter(
      (role) => role !== TenantRole.TENANT_ADMIN,
    ),
  )
  @IsOptional()
  role?: TenantRole;
}
