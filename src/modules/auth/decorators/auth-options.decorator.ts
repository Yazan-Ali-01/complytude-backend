import { SetMetadata } from '@nestjs/common';

export const AUTH_OPTIONS_KEY = 'auth-options';

/**
 * Decorator to specify authentication options for an endpoint
 * Usage: @AuthOptions({ tenant: true, identity: true })
 */
export const AuthOptions = ({
  tenant = false,
  identity = false,
}: {
  tenant?: boolean;
  identity?: boolean;
}) => SetMetadata(AUTH_OPTIONS_KEY, { tenant, identity });

export const AUTH_REFRESH_OPTIONS_KEY = 'auth-refresh-options';

/**
 * Decorator to specify refresh options for an endpoint
 * Usage: @AuthRefreshOptions({ tenant: true, identity: true })
 */
export const AuthRefreshOptions = ({
  tenant = false,
  identity = false,
}: {
  tenant?: boolean;
  identity?: boolean;
}) => SetMetadata(AUTH_REFRESH_OPTIONS_KEY, { tenant, identity });
