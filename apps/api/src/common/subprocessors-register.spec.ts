import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const REGISTER = join(ROOT, 'docs', 'SUBPROCESSORS.md');

/** The AI clients the code constructs, and the processor each one sends data to. */
const AI_CLIENTS: Record<string, string> = {
  OpenAI: 'OpenAI',
  DocumentIntelligenceClient: 'Microsoft',
};

/** Packages of AI providers, and the processor behind each; anything else AI-shaped fails. */
const AI_PACKAGES: Record<string, string> = {
  openai: 'OpenAI',
};
const AI_PACKAGE_IMPORT =
  /from '((?:openai|cohere-ai|@anthropic-ai\/[^']+|@mistralai\/[^']+|groq-sdk|@google\/genai|@google-cloud\/[^']+|@azure\/[^']*|@azure-rest\/[^']*|@aws-sdk\/client-(?:bedrock[^']*|textract|comprehend[^']*|rekognition|translate|transcribe)))(?:\/[^']*)?'/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === 'node_modules' ? [] : sourceFiles(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

function productionSources(): Array<{ file: string; source: string }> {
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
      .map((file) => ({
        file: relative(ROOT, file),
        source: readFileSync(file, 'utf8'),
      })),
  );
}

/** The processor names in the first column of the register's tables. */
function registeredProcessors(): Set<string> {
  return new Set(
    [...readFileSync(REGISTER, 'utf8').matchAll(/^\| ([^|]+?) \| /gm)].map(
      ([, name]) => name.trim(),
    ),
  );
}

describe('docs/SUBPROCESSORS.md', () => {
  const sources = productionSources();

  it('lists the processor behind every AI client the code constructs', () => {
    const constructed = new Map<string, string[]>();
    for (const { file, source } of sources) {
      for (const [, client] of source.matchAll(/\bnew ([A-Z]\w*)\(/g)) {
        if (!(client in AI_CLIENTS)) continue;
        constructed.set(client, [...(constructed.get(client) ?? []), file]);
      }
    }

    // The scan finds today's clients (a moved or renamed file would silently skip them)
    expect([...constructed.keys()].sort()).toEqual(
      Object.keys(AI_CLIENTS).sort(),
    );
    const registered = registeredProcessors();
    const missing = [...constructed.keys()]
      .map((client) => AI_CLIENTS[client])
      .filter((processor) => !registered.has(processor));
    expect(missing).toEqual([]);
  });

  it('knows every AI provider package the code imports', () => {
    const unknown: string[] = [];
    for (const { file, source } of sources) {
      for (const [, pkg] of source.matchAll(AI_PACKAGE_IMPORT)) {
        if (!(pkg in AI_PACKAGES)) unknown.push(`${file}: ${pkg}`);
      }
    }
    // A new provider SDK: add its processor to docs/SUBPROCESSORS.md, then to AI_PACKAGES and
    // AI_CLIENTS here, and raise AI_DISCLOSURE_VERSION
    expect(unknown).toEqual([]);

    const registered = registeredProcessors();
    expect(
      Object.values(AI_PACKAGES).filter((name) => !registered.has(name)),
    ).toEqual([]);
  });
});
