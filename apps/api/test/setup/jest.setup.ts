import path from 'path';
import { config } from 'dotenv';

// Load .env.test before each integration test worker starts.
// COM-140 will extend this to read testcontainers config and override DB/Redis vars.
config({ path: path.resolve(__dirname, '../../.env.test') });
