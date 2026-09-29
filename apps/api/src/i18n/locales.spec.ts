import * as fs from 'node:fs';
import * as path from 'node:path';

const LOCALES = path.join(__dirname, 'locales');
const SRC = path.join(__dirname, '..');

type Messages = Record<string, string>;

function flatten(value: unknown, prefix: string, out: Messages): Messages {
  if (typeof value === 'string') {
    out[prefix] = value;
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

function load(lang: string): Messages {
  const out: Messages = {};
  for (const file of fs.readdirSync(path.join(LOCALES, lang))) {
    if (!file.endsWith('.json')) continue;
    const json: unknown = JSON.parse(
      fs.readFileSync(path.join(LOCALES, lang, file), 'utf8'),
    );
    flatten(json, path.basename(file, '.json'), out);
  }
  return out;
}

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{+(\w+)\}+/g)].map(([, name]) => name).sort();
}

/** Every key an `*I18n` constants object names (`'<namespace>.errors.KEY'`). */
function referencedKeys(): string[] {
  const keys = new Set<string>();
  for (const file of fs.readdirSync(SRC, { recursive: true })) {
    if (!String(file).endsWith('i18n.constants.ts')) continue;
    const source = fs.readFileSync(path.join(SRC, String(file)), 'utf8');
    for (const [, key] of source.matchAll(
      /'([a-z]+\.(?:errors|messages)\.[A-Za-z0-9_.]+)'/g,
    )) {
      keys.add(key);
    }
  }
  return [...keys].sort();
}

describe('locales', () => {
  const en = load('en');
  const ar = load('ar');

  it('has the same keys in English and Arabic', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty message', () => {
    for (const [key, message] of [
      ...Object.entries(en),
      ...Object.entries(ar),
    ]) {
      expect({ key, empty: message.trim() === '' }).toEqual({
        key,
        empty: false,
      });
    }
  });

  it('uses the same placeholders in both languages', () => {
    for (const [key, message] of Object.entries(en)) {
      expect({ key, placeholders: placeholders(ar[key] ?? '') }).toEqual({
        key,
        placeholders: placeholders(message),
      });
    }
  });

  it('defines every key the code refers to, in both languages', () => {
    const keys = referencedKeys();
    expect(keys.length).toBeGreaterThan(100);
    expect(keys.filter((key) => !(key in en) || !(key in ar))).toEqual([]);
  });
});
