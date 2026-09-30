import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const LOG_CALL =
  /\b(?:this\.logger|logger|console)\.(?:log|warn|error|debug|verbose|info)\(([\s\S]*?)\);/g;
const INTERPOLATION = /\$\{\s*([\w.?]+)\s*\}/g;
/** A variable or property named like a secret: token, resetToken, secret, apiSecret, password… */
const SECRET_NAME = /(?:^|[a-z])(?:[Tt]oken|[Ss]ecret|[Pp]assword)$/;
/** Every identifier chain inside a `${…}`, so `${String(document.title)}` is seen too. */
const INTERPOLATED_BLOCK = /\$\{([^}]*)\}/g;
const IDENTIFIER_CHAIN = /[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*/g;
/** A document's title or text, or generation variables: title, documentTitle, content, variables… */
const DOCUMENT_DATA_NAME = /(?:^|[a-z])(?:[Tt]itle|[Cc]ontent|[Vv]ariables)$/;

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

export function documentDataInLogCalls(source: string): string[] {
  const found: string[] = [];
  for (const call of source.matchAll(LOG_CALL)) {
    for (const [, block] of call[1].matchAll(INTERPOLATED_BLOCK)) {
      for (const [chain] of block.matchAll(IDENTIFIER_CHAIN)) {
        const name = chain.split('.').pop()?.replace(/\?$/, '') ?? '';
        if (DOCUMENT_DATA_NAME.test(name)) found.push(chain);
      }
    }
  }
  return found;
}

/** `file: expression` for every match of `check` in each app's and lib's src directory. */
function offenders(check: (source: string) => string[]): string[] {
  return ['apps', 'libs'].flatMap((top) =>
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
        check(readFileSync(file, 'utf8')).map(
          (expression) => `${relative(ROOT, file)}: ${expression}`,
        ),
      ),
  );
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
    expect(offenders(secretsInLogCalls)).toEqual([]);
  });
});

/**
 * Document titles are upload filenames, content is the contract, and generation variables are
 * names, IDs and salaries: logs identify a document by its ID, never by what it says.
 */
describe('no document data interpolated into log calls', () => {
  it('flags a title, content or variables in a log template', () => {
    expect(
      documentDataInLogCalls(
        'this.logger.log(`Document "${document.title}" was truncated`);',
      ),
    ).toEqual(['document.title']);
    expect(
      documentDataInLogCalls(
        'this.logger.warn(`budget for "${documentTitle}": ${String(finalDocumentContent)}`);',
      ),
    ).toEqual(['documentTitle', 'finalDocumentContent']);
    expect(
      documentDataInLogCalls('logger.debug(`job ${job?.variables}`);'),
    ).toEqual(['job?.variables']);
  });

  it('allows IDs, counts and lengths', () => {
    expect(
      documentDataInLogCalls(
        'this.logger.log(`document=${documentId} length=${content.length} chunks=${chunkTexts.length} schema=${responseSchema.name}`);',
      ),
    ).toEqual([]);
  });

  it('none in apps/*/src or libs/*/src', () => {
    expect(offenders(documentDataInLogCalls)).toEqual([]);
  });
});
