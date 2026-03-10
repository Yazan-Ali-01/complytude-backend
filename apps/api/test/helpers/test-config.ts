import * as os from 'os';
import * as path from 'path';

export const TEST_CONFIG_PATH = path.join(
  os.tmpdir(),
  'complytude-test-config.json',
);

export interface TestContainerConfig {
  postgres: { host: string; port: number; user: string; password: string };
  redis: { host: string; port: number };
}
