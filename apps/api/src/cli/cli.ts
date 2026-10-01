import { NestFactory } from '@nestjs/core';
import { isEmail } from 'class-validator';
import { resolve } from 'node:path';
import { SystemPlatformRole } from 'src/common/types/platform.types';
import {
  PlatformAdminBootstrapError,
  PlatformAdminBootstrapService,
} from './platform-admin/platform-admin-bootstrap.service';
import { PlatformAdminCliModule } from './platform-admin/platform-admin-cli.module';
import { RulesetLoadCliModule } from './rulesets/ruleset-load-cli.module';
import {
  RulesetFileError,
  RulesetLoadService,
} from './rulesets/ruleset-load.service';
import { RulesetReingestCliModule } from './rulesets/ruleset-reingest-cli.module';
import { RulesetReingestService } from './rulesets/ruleset-reingest.service';

export const GRANT_PLATFORM_ADMIN_COMMAND = 'grant-platform-admin';
export const REINGEST_RULESETS_COMMAND = 'reingest-rulesets';
export const LOAD_RULESETS_COMMAND = 'load-rulesets';

const USAGE = [
  `Usage: node dist/apps/api/main.js ${GRANT_PLATFORM_ADMIN_COMMAND} <email> [--role <role>]`,
  `       pnpm admin:grant <email> [--role <role>]`,
  `       node dist/apps/api/main.js ${REINGEST_RULESETS_COMMAND}`,
  `       pnpm rulesets:reingest`,
  `       node dist/apps/api/main.js ${LOAD_RULESETS_COMMAND} [--dir <directory>]`,
  `       pnpm rulesets:load [--dir <directory>]`,
  '',
  `Roles: ${Object.values(SystemPlatformRole).join(', ')} (default ${SystemPlatformRole.SYSTEM_ADMIN})`,
  'A new account is created verified, without a password, and emailed a set-password link.',
  'An existing account must have a verified email; its sessions are ended when its role changes.',
  `${REINGEST_RULESETS_COMMAND} queues ingestion of every active ruleset version (worker-ingestion runs it).`,
  `${LOAD_RULESETS_COMMAND} creates the rulesets in a directory (default data/rulesets), or a new version of those whose clauses changed, and queues their ingestion; versions are activated separately.`,
].join('\n');

interface GrantArgs {
  email: string;
  role: SystemPlatformRole;
}

function parseGrantArgs(args: string[]): GrantArgs | string {
  let email: string | undefined;
  let role: string = SystemPlatformRole.SYSTEM_ADMIN;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--role') {
      role = args[++i] ?? '';
    } else if (arg.startsWith('--role=')) {
      role = arg.slice('--role='.length);
    } else if (arg.startsWith('-')) {
      return `Unknown option: ${arg}`;
    } else if (email === undefined) {
      email = arg;
    } else {
      return `Unexpected argument: ${arg}`;
    }
  }
  if (!email || !isEmail(email)) {
    return 'A valid email address is required';
  }
  if (!(Object.values(SystemPlatformRole) as string[]).includes(role)) {
    return `Unknown role: ${role}`;
  }
  // Accounts are keyed on the lower-case address
  return {
    email: email.trim().toLowerCase(),
    role: role as SystemPlatformRole,
  };
}

async function grantPlatformAdmin(args: string[]): Promise<number> {
  const parsed = parseGrantArgs(args);
  if (typeof parsed === 'string') {
    console.error(`${parsed}\n\n${USAGE}`);
    return 2;
  }

  const app = await NestFactory.createApplicationContext(
    PlatformAdminCliModule,
    { logger: ['error', 'warn', 'log'] },
  );
  try {
    const result = await app
      .get(PlatformAdminBootstrapService)
      .grant(parsed.email, parsed.role);
    console.log(
      [
        `${parsed.role} granted to ${parsed.email} (user ${result.userId}).`,
        result.accountCreated
          ? 'New account created.'
          : result.roleChanged
            ? `Previous role: ${result.previousRole ?? 'none'}; existing sessions ended.`
            : 'Role unchanged.',
        result.setPasswordLinkSent
          ? 'A set-password link was emailed to that address.'
          : null,
      ]
        .filter(Boolean)
        .join(' '),
    );
    return 0;
  } catch (error) {
    if (error instanceof PlatformAdminBootstrapError) {
      console.error(`Refused: ${error.message}`);
      return 1;
    }
    throw error;
  } finally {
    await app.close();
  }
}

async function reingestRulesets(args: string[]): Promise<number> {
  if (args.length > 0) {
    console.error(`Unexpected argument: ${args[0]}\n\n${USAGE}`);
    return 2;
  }
  const app = await NestFactory.createApplicationContext(
    RulesetReingestCliModule,
    { logger: ['error', 'warn', 'log'] },
  );
  try {
    const queued = await app
      .get(RulesetReingestService)
      .reingestActiveVersions();
    for (const version of queued) {
      console.log(
        `Queued ruleset ${version.rulesetId} v${version.version} (version ${version.versionId}, job ${version.jobId ?? '?'})`,
      );
    }
    console.log(
      `${queued.length} active ruleset versions queued for re-ingestion.`,
    );
    return 0;
  } finally {
    await app.close();
  }
}

async function loadRulesets(args: string[]): Promise<number> {
  let dir = resolve(process.cwd(), 'data/rulesets');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
      dir = resolve(process.cwd(), args[++i]);
    } else {
      console.error(`Unexpected argument: ${args[i]}\n\n${USAGE}`);
      return 2;
    }
  }
  const app = await NestFactory.createApplicationContext(RulesetLoadCliModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const loaded = await app.get(RulesetLoadService).load(dir);
    for (const ruleset of loaded) {
      console.log(
        `${ruleset.file}: ${ruleset.key} v${ruleset.version} ${ruleset.outcome}${ruleset.jobId ? ` (ingestion job ${ruleset.jobId})` : ''}`,
      );
    }
    console.log(
      `${loaded.length} ruleset files loaded; activate new versions with POST /rulesets/:key/versions/:version/activate once ingested.`,
    );
    return 0;
  } catch (error) {
    if (error instanceof RulesetFileError) {
      console.error(`Nothing loaded; invalid ruleset files:\n${error.message}`);
      return 1;
    }
    throw error;
  } finally {
    await app.close();
  }
}

/**
 * Runs a one-off command instead of the HTTP server. Returns the process exit code.
 */
export async function runCli(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (command === GRANT_PLATFORM_ADMIN_COMMAND) {
    return grantPlatformAdmin(args);
  }
  if (command === REINGEST_RULESETS_COMMAND) {
    return reingestRulesets(args);
  }
  if (command === LOAD_RULESETS_COMMAND) {
    return loadRulesets(args);
  }
  console.error(`Unknown command: ${command}\n\n${USAGE}`);
  return 2;
}
