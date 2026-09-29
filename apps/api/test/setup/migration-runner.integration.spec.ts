import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { Client } from 'pg';
import {
  ChangedMigrationError,
  readMigrations,
  runMigrations,
  type MigrationFile,
} from '../../../../scripts/migrate';
import { TEST_CONFIG_PATH, TestContainerConfig } from '../helpers/test-config';

/**
 * The migration runner (scripts/migrate.ts) against scratch databases on the test Postgres:
 * checksums stop an edited migration, each migration and its bookkeeping row commit together,
 * and concurrent runners apply each file once.
 */
describe('Migration runner', () => {
  const { host, port, user, password } = (
    JSON.parse(
      fs.readFileSync(TEST_CONFIG_PATH, 'utf-8'),
    ) as TestContainerConfig
  ).postgres;
  const created: string[] = [];

  function connect(database: string): Client {
    return new Client({ host, port, user, password, database });
  }

  async function scratchDatabase(): Promise<string> {
    const name = `migrate_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const admin = connect('postgres');
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.end();
    created.push(name);
    return name;
  }

  async function withClient<T>(
    database: string,
    work: (client: Client) => Promise<T>,
  ): Promise<T> {
    const client = connect(database);
    await client.connect();
    try {
      return await work(client);
    } finally {
      await client.end();
    }
  }

  const file = (name: string, sql: string): MigrationFile => ({
    name,
    sql,
    checksum: randomUUID(),
  });

  const recorded = (client: Client): Promise<string[]> =>
    client
      .query<{
        migration_name: string;
      }>('SELECT migration_name FROM public.schema_migrations ORDER BY 1')
      .then((r) => r.rows.map((row) => row.migration_name));

  afterAll(async () => {
    const admin = connect('postgres');
    await admin.connect();
    for (const name of created) {
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
    await admin.end();
  }, 60000);

  it('migrates a database from zero, recording every file with its checksum, then has nothing to do', async () => {
    const db = await scratchDatabase();
    const files = readMigrations();

    await withClient(db, async (client) => {
      const first = await runMigrations(client);
      expect(first.applied).toEqual(files.map((f) => f.name));

      const { rows } = await client.query<{
        migration_name: string;
        checksum: string;
      }>('SELECT migration_name, checksum FROM public.schema_migrations');
      expect(new Map(rows.map((r) => [r.migration_name, r.checksum]))).toEqual(
        new Map(files.map((f) => [f.name, f.checksum])),
      );

      const second = await runMigrations(client);
      expect(second.applied).toEqual([]);
      expect(second.skipped).toHaveLength(files.length);
    });
  }, 60000);

  it('refuses to run when an applied migration was edited, naming it, and applies nothing', async () => {
    const db = await scratchDatabase();
    const one = file(
      '001_one.sql',
      'BEGIN;\nCREATE TABLE one (id int);\nCOMMIT;\n',
    );
    const two = file(
      '002_two.sql',
      'BEGIN;\nCREATE TABLE two (id int);\nCOMMIT;\n',
    );

    await withClient(db, async (client) => {
      await runMigrations(client, { files: [one] });
      const edited = { ...one, checksum: randomUUID() };

      const error = await runMigrations(client, { files: [edited, two] }).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ChangedMigrationError);
      expect((error as ChangedMigrationError).files).toEqual(['001_one.sql']);
      expect(await recorded(client)).toEqual(['001_one.sql']);

      // --check reports the same without applying anything
      await expect(
        runMigrations(client, { files: [edited], checkOnly: true }),
      ).rejects.toBeInstanceOf(ChangedMigrationError);
    });
  });

  it('rolls back a failing migration together with its bookkeeping row', async () => {
    const db = await scratchDatabase();
    const ok = file(
      '001_ok.sql',
      'BEGIN;\nCREATE TABLE ok (id int);\nCOMMIT;\n',
    );
    const broken = file(
      '002_broken.sql',
      'BEGIN;\nCREATE TABLE half_done (id int);\nSELECT 1 / 0;\nCOMMIT;\n' +
        '/*\nBEGIN;\nDROP TABLE half_done;\nCOMMIT;\n*/\n',
    );

    await withClient(db, async (client) => {
      await expect(
        runMigrations(client, { files: [ok, broken] }),
      ).rejects.toThrow(/002_broken\.sql failed and was rolled back/);

      expect(await recorded(client)).toEqual(['001_ok.sql']);
      const { rows } = await client.query<{ exists: string | null }>(
        "SELECT to_regclass('public.half_done') AS exists",
      );
      expect(rows[0].exists).toBeNull();

      // Fixed, it applies on the next run
      const fixed = file(
        '002_broken.sql',
        'BEGIN;\nCREATE TABLE half_done (id int);\nCOMMIT;\n',
      );
      expect(
        (await runMigrations(client, { files: [ok, fixed] })).applied,
      ).toEqual(['002_broken.sql']);
    });
  });

  it('does not keep a migration whose bookkeeping row could not be written', async () => {
    const db = await scratchDatabase();
    const one = file(
      '001_one.sql',
      'BEGIN;\nCREATE TABLE one (id int);\nCOMMIT;\n',
    );

    await withClient(db, async (client) => {
      await runMigrations(client, { files: [] });
      // The recording step fails (as a crash or cancel between the two would)
      await client.query(`
        CREATE FUNCTION refuse() RETURNS trigger LANGUAGE plpgsql AS
          $$ BEGIN RAISE EXCEPTION 'bookkeeping failed'; END $$;
        CREATE TRIGGER refuse BEFORE INSERT ON public.schema_migrations
          FOR EACH ROW EXECUTE FUNCTION refuse();`);

      await expect(runMigrations(client, { files: [one] })).rejects.toThrow(
        /bookkeeping failed/,
      );
      const { rows } = await client.query<{ exists: string | null }>(
        "SELECT to_regclass('public.one') AS exists",
      );
      expect(rows[0].exists).toBeNull();
    });
  });

  it('two runners at once apply each migration exactly once', async () => {
    const db = await scratchDatabase();
    const files = [
      file(
        '001_a.sql',
        'BEGIN;\nCREATE TABLE a (id int);\nSELECT pg_sleep(0.2);\nCOMMIT;\n',
      ),
      file('002_b.sql', 'BEGIN;\nCREATE TABLE b (id int);\nCOMMIT;\n'),
    ];

    const [first, second] = await Promise.all([
      withClient(db, (client) => runMigrations(client, { files })),
      withClient(db, (client) => runMigrations(client, { files })),
    ]);

    expect([...first.applied, ...second.applied].sort()).toEqual([
      '001_a.sql',
      '002_b.sql',
    ]);
    await withClient(db, async (client) =>
      expect(await recorded(client)).toEqual(['001_a.sql', '002_b.sql']),
    );
  });

  it('adopts a tracking table from before checksums, and checks from then on', async () => {
    const db = await scratchDatabase();
    const one = file(
      '001_one.sql',
      'BEGIN;\nCREATE TABLE one (id int);\nCOMMIT;\n',
    );

    await withClient(db, async (client) => {
      // The layout the old shell runner created
      await client.query(`CREATE TABLE one (id int)`);
      await client.query(
        `CREATE TABLE public.schema_migrations (
           id SERIAL PRIMARY KEY,
           migration_name VARCHAR(255) UNIQUE NOT NULL,
           executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      );
      await client.query(
        `INSERT INTO public.schema_migrations (migration_name) VALUES ('001_one.sql')`,
      );

      expect((await runMigrations(client, { files: [one] })).applied).toEqual(
        [],
      );
      const { rows } = await client.query<{ checksum: string }>(
        'SELECT checksum FROM public.schema_migrations',
      );
      expect(rows[0].checksum).toBe(one.checksum);
      await expect(
        runMigrations(client, { files: [{ ...one, checksum: randomUUID() }] }),
      ).rejects.toBeInstanceOf(ChangedMigrationError);
    });
  });

  it('refuses a file with more than one top-level transaction', async () => {
    const db = await scratchDatabase();
    const twice = file(
      '001_twice.sql',
      'BEGIN;\nCREATE TABLE x (id int);\nCOMMIT;\nBEGIN;\nCREATE TABLE y (id int);\nCOMMIT;\n',
    );

    await withClient(db, async (client) => {
      await expect(runMigrations(client, { files: [twice] })).rejects.toThrow(
        /expected at most one top-level BEGIN/,
      );
    });
  });
});
