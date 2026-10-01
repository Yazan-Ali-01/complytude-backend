import * as os from 'os';
import * as path from 'path';

export const TEST_CONFIG_PATH = path.join(
  os.tmpdir(),
  'complytude-test-config.json',
);

/**
 * Login role the application connects as in integration tests: a member of app_user, not a
 * superuser, so RLS applies exactly as in deployed environments.
 */
export const APP_LOGIN_USER = 'app_login';
export const APP_LOGIN_PASSWORD = 'app_login_test_password';

/**
 * The platform login the app's platform context runs as: a member of app_user and app_platform,
 * which is_platform_admin() requires (migration 045).
 */
export const PLATFORM_LOGIN_USER = 'app_platform_login';
export const PLATFORM_LOGIN_PASSWORD = 'app_platform_login_test_password';

export interface TestContainerConfig {
  postgres: { host: string; port: number; user: string; password: string };
  redis: { host: string; port: number };
}
