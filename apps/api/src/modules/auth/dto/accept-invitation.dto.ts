import { ApiProperty } from '@nestjs/swagger';
import { IsHexadecimal, IsString, Length } from 'class-validator';

export class AcceptInvitationDto {
  @ApiProperty({
    description:
      'Invitation token from the invitation link (the same value GET /auth/invitations/resolve takes)',
    example: 'a3f1c9e2…',
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @IsHexadecimal()
  @Length(64, 64)
  token: string;
}
