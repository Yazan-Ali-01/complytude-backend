import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const APPS = join(REPO_ROOT, 'apps');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

/**
 * Workers act on one tenant's data per job, in that tenant's RLS context (from the payload), and
 * read global tables (templates, rulesets) without any context. Platform-admin context would
 * switch tenant isolation off for every policy, so no worker may use it.
 */
describe('worker database context', () => {
  const workers = readdirSync(APPS).filter((name) =>
    name.startsWith('worker-'),
  );

  it('finds the workers', () => {
    expect(workers.length).toBeGreaterThanOrEqual(3);
  });

  it('no worker runs queries as platform admin', () => {
    const offenders = workers
      .flatMap((worker) => sourceFiles(join(APPS, worker, 'src')))
      .filter((file) =>
        readFileSync(file, 'utf8').includes(
          'transactionWithPlatformAdminContext',
        ),
      )
      .map((file) => relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
  });
});
