import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { I18nContext } from 'nestjs-i18n';
import { NormalizeEmail } from 'src/common/decorators/normalize-email.decorator';
import { SystemTenantRole } from 'src/common/types';
import { InvitationsI18n } from 'src/modules/invitations/constants/i18n.constants';

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
    throw new BadRequestException(
      I18nContext.current()?.t(InvitationsI18n.errors.ROLE_NOT_ASSIGNABLE, {
        args: { role: value },
      }) ?? `The ${value} role cannot be assigned`,
    );
  })
  @IsOptional()
  @IsString()
  roleKey?: string;
}
