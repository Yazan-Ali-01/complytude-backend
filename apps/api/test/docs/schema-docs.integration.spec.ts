import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const ROOT = join(__dirname, '../../../..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

/** Each `Table name { … }` of a DBML file and its column names (indexes and notes skipped). */
function dbmlTables(source: string): Map<string, string[]> {
  const tables = new Map<string, string[]>();
  for (const match of source.matchAll(/^Table (\w+)[^{]*\{([\s\S]*?)^\}/gm)) {
    const columns: string[] = [];
    let skipping = false;
    for (const line of match[2].split('\n')) {
      const text = line.trim();
      if (skipping) {
        if (text === '}' || text.endsWith("'''")) skipping = false;
        continue;
      }
      if (/^indexes\s*\{/.test(text)) {
        skipping = true;
        continue;
      }
      if (/^Note:\s*'''/.test(text)) {
        skipping = !text.slice(text.indexOf("'''") + 3).includes("'''");
        continue;
      }
      const column = /^ {2}(\w+)\s+\S/.exec(line);
      if (column && !text.startsWith('Note:')) columns.push(column[1]);
    }
    tables.set(match[1], columns);
  }
  return tables;
}

/** `### name` sections of a markdown file, keyed by heading. */
function sections(markdown: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of markdown.split(/^### /m).slice(1)) {
    const newline = part.indexOf('\n');
    result.set(part.slice(0, newline).trim(), part.slice(newline + 1));
  }
  return result;
}

/**
 * The schema docs describe the schema the migrations build: every table is in the DBML and the
 * DATABASE.md inventory (with its RLS status), every DBML column exists and none is missing, and
 * every column and index DATABASE.md names exists.
 */
describe('Schema documentation matches the migrated schema', () => {
  let app: TestApp;
  let columns: Map<string, Set<string>>;
  let rls: Map<string, boolean>;
  let indexes: Set<string>;

  beforeAll(async () => {
    app = await createTestApp();
    const db = app.databaseService;
    const { rows: tableRows } = await db.query<{
      name: string;
      rls: boolean;
    }>(
      `SELECT relname AS name, relrowsecurity AS rls FROM pg_class
       WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace
         AND relname <> 'schema_migrations'`,
    );
    rls = new Map(tableRows.map((row) => [row.name, row.rls]));
    const { rows: columnRows } = await db.query<{
      table: string;
      column: string;
    }>(
      `SELECT table_name AS table, column_name AS column FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name <> 'schema_migrations'`,
    );
    columns = new Map();
    for (const { table, column } of columnRows) {
      if (!columns.has(table)) columns.set(table, new Set());
      columns.get(table)!.add(column);
    }
    const { rows: indexRows } = await db.query<{ name: string }>(
      `SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'`,
    );
    indexes = new Set(indexRows.map((row) => row.name));
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  it('database-schema.dbml has every table, with exactly its columns', () => {
    const dbml = dbmlTables(read('docs/database-schema.dbml'));

    expect([...dbml.keys()].sort()).toEqual([...rls.keys()].sort());
    const drift: string[] = [];
    for (const [table, documented] of dbml) {
      const actual = columns.get(table) ?? new Set<string>();
      for (const column of documented) {
        if (!actual.has(column))
          drift.push(`${table}.${column}: not in the schema`);
      }
      for (const column of actual) {
        if (!documented.includes(column))
          drift.push(`${table}.${column}: not in the DBML`);
      }
    }
    expect(drift).toEqual([]);
  });

  it("DATABASE.md's inventory lists every table with its RLS status", () => {
    const inventory = sections(read('docs/DATABASE.md')).get('Table Inventory');
    expect(inventory).toBeDefined();
    const listed = new Map(
      [...inventory!.matchAll(/^\| `(\w+)` \| (yes|—) \|$/gm)].map((m) => [
        m[1],
        m[2] === 'yes',
      ]),
    );

    expect(Object.fromEntries(listed)).toEqual(Object.fromEntries(rls));
  });

  it('every column and index DATABASE.md names exists', () => {
    const markdown = read('docs/DATABASE.md');
    const missing: string[] = [];
    for (const [heading, body] of sections(markdown)) {
      const actual = columns.get(heading);
      if (!actual) continue;
      // Rows of the section's column tables (header "| Column | …")
      for (const table of body.matchAll(
        /^\| Column\b[^\n]*\n\|[-| ]+\|\n((?:\|[^\n]*\n)+)/gm,
      )) {
        for (const row of table[1].matchAll(/^\| `(\w+)`/gm)) {
          if (!actual.has(row[1])) missing.push(`${heading}.${row[1]}`);
        }
      }
    }
    for (const name of new Set(markdown.match(/\bidx_\w+/g) ?? [])) {
      if (!indexes.has(name)) missing.push(name);
    }
    expect(missing).toEqual([]);
  });
});
