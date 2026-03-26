import { ApiProperty } from '@nestjs/swagger';
import {
  IdentitySessionItemDto,
  TenantSessionItemDto,
} from './session-response.dto';

/** Single session group: identity session with its linked tenant session(s) */
export class SessionGroupItemDto {
  @ApiProperty({
    description: 'Identity session (device/browser)',
    type: IdentitySessionItemDto,
  })
  identitySession: IdentitySessionItemDto;

  @ApiProperty({
    description: 'Tenant sessions linked to this identity session',
    type: [TenantSessionItemDto],
    isArray: true,
  })
  tenantSessions: TenantSessionItemDto[];
}

/**
 * Response containing list of user sessions.
 * GET /auth/sessions: tenantSessions filtered to current tenant only.
 * GET /auth/sessions/all: all tenant sessions across all tenants.
 */
export class SessionListResponseDto {
  @ApiProperty({
    description: 'List of identity sessions with linked tenant sessions',
    type: [SessionGroupItemDto],
    isArray: true,
  })
  sessions: SessionGroupItemDto[];
}
