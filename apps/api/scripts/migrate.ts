#!/usr/bin/env ts-node
/**
 * Migration runner for migrations applied AFTER the database's first boot.
 *
 * The Postgres container bootstraps the schema once, when its data volume is
 * empty (database/docker-init/01_bootstrap.sh). Everything after that comes
 * through here.
 *
 *   npm run db:migrate          apply pending migrations
 *   npm run db:migrate -- --dry show what would run, change nothing
 *   npm run db:reset            drop the schema, re-apply everything, re-seed
 *
 * Applied files are recorded in schema_migrations with a SHA-256 checksum.
 * Editing a file that has already run is an error, not a silent no-op.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from 'pg';

const DB_DIR = resolve(__dirname, '../../../database');
const MIGRATIONS_DIR = join(DB_DIR, 'migrations');
const SEEDS_DIR = join(DB_DIR, 'seeds');

const args = process.argv.slice(2);
const isReset = args.includes('--reset');
const isDry = args.includes('--dry');
const withDemo = isReset && !args.includes('--no-demo');

function sqlFiles(dir: string, prefix: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.sql'))
    .sort();
}

function checksum(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    if (isReset) {
      if (isDry) {
        console.log('[dry] would DROP SCHEMA public CASCADE and rebuild');
      } else {
        console.warn('!! Dropping and recreating schema "public"');
        await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      }
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    VARCHAR(20)  PRIMARY KEY,
        filename   VARCHAR(200) NOT NULL,
        checksum   CHAR(64),
        applied_at TIMESTAMPTZ  NOT NULL DEFAULT now()
      );
    `);

    const applied = new Map<string, string>();
    const { rows } = await client.query<{ version: string; checksum: string | null }>(
      'SELECT version, checksum FROM schema_migrations',
    );
    for (const row of rows) applied.set(row.version, row.checksum ?? '');

    let ran = 0;

    for (const file of sqlFiles(MIGRATIONS_DIR, 'V')) {
      const version = file.split('__')[0];
      const contents = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      const sum = checksum(contents);

      if (applied.has(version)) {
        const previous = applied.get(version);
        if (previous && previous !== sum) {
          throw new Error(
            `Checksum mismatch on ${file}. An applied migration was edited. ` +
              `Migrations are immutable — add a new one instead.`,
          );
        }
        continue;
      }

      if (isDry) {
        console.log(`[dry] would apply ${file}`);
        ran++;
        continue;
      }

      console.log(`applying ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(contents);
        await client.query(
          `INSERT INTO schema_migrations (version, filename, checksum)
           VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING`,
          [version, file, sum],
        );
        await client.query('COMMIT');
        ran++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`${file} failed: ${(err as Error).message}`);
      }
    }

    if (isReset && !isDry) {
      for (const file of sqlFiles(SEEDS_DIR, 'S001__')) {
        console.log(`seeding ${file}`);
        await client.query(readFileSync(join(SEEDS_DIR, file), 'utf8'));
      }
      if (withDemo) {
        for (const file of sqlFiles(SEEDS_DIR, 'S').filter((f) => !f.startsWith('S001__'))) {
          console.log(`seeding ${file}`);
          await client.query(readFileSync(join(SEEDS_DIR, file), 'utf8'));
        }
      }
    }

    console.log(
      ran === 0 ? 'Database is up to date; nothing to apply.' : `Done — ${ran} migration(s).`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err: Error) => {
  console.error(`\nMigration failed: ${err.message}\n`);
  process.exit(1);
});
