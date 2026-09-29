import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const LOG_CALL =
  /\b(?:this\.logger|logger|console)\.(?:log|warn|error|debug|verbose|info)\(([\s\S]*?)\);/g;
const INTERPOLATION = /\$\{\s*([\w.?]+)\s*\}/g;
/** A variable or property named like a secret: token, resetToken, secret, apiSecret, password… */
const SECRET_NAME = /(?:^|[a-z])(?:[Tt]oken|[Ss]ecret|[Pp]assword)$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === 'node_modules' ? [] : sourceFiles(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

export function secretsInLogCalls(source: string): string[] {
  const found: string[] = [];
  for (const call of source.matchAll(LOG_CALL)) {
    for (const [, expression] of call[1].matchAll(INTERPOLATION)) {
      const name = expression.split('.').pop()?.replace(/\?$/, '') ?? '';
      if (SECRET_NAME.test(name)) found.push(expression);
    }
  }
  return found;
}

/**
 * A token in a log line is account access for anyone who can read the logs (an invitation or
 * reset link). Masking can't catch an opaque random token, so none may be interpolated into one.
 */
describe('no secrets interpolated into log calls', () => {
  it('flags a token, secret or password in a log template', () => {
    expect(
      secretsInLogCalls(
        'this.logger.log(`Invitation ${result.invitationId}: ${result.token}`);',
      ),
    ).toEqual(['result.token']);
    expect(
      secretsInLogCalls('logger.debug(`sent ${resetToken} to ${userId}`);'),
    ).toEqual(['resetToken']);
    expect(
      secretsInLogCalls(
        'this.logger.log(`max ${this.maxTokens}, ok ${sent}`);',
      ),
    ).toEqual([]);
  });

  it('none in apps/*/src or libs/*/src', () => {
    const offenders = ['apps', 'libs'].flatMap((top) =>
      readdirSync(join(ROOT, top))
        .map((pkg) => join(ROOT, top, pkg, 'src'))
        .filter((src) => {
          try {
            return statSync(src).isDirectory();
          } catch {
            return false;
          }
        })
        .flatMap(sourceFiles)
        .flatMap((file) =>
          secretsInLogCalls(readFileSync(file, 'utf8')).map(
            (expression) => `${relative(ROOT, file)}: ${expression}`,
          ),
        ),
    );

    expect(offenders).toEqual([]);
  });
});
