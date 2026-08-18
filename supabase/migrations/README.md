# Database migrations

Every schema change to the CROS Supabase database lives here as a numbered
`.sql` file. A tracking table (`public.schema_migrations`) records which files
have been applied, so nothing runs twice and nothing gets silently skipped.

## TL;DR

```bash
# See what's applied vs pending
node scripts/migrate.mjs --list

# Apply all pending migrations
node scripts/migrate.mjs

# Check for duplicate numbers (also runs automatically before every apply)
node scripts/migrate.mjs --check

# Run the runner's own test suite (no DB needed — uses in-process PGlite)
npm run db:migrate:test
```

npm aliases: `db:migrate`, `db:migrate:list`, `db:migrate:check`, `db:migrate:test`.

## The rules

1. **One change = one new file.** Never edit a file that has already been
   applied. The runner stores a SHA-256 of each applied file and warns you
   ("checksum drift") if an applied file changes. To alter something already
   live, write a *new* migration.

2. **Numbers must be unique and increasing.** Use the next free number, 3
   digits, then a short description:
   `047_add_tenant_phone_verified.sql`. If two people grab the same number in
   parallel, append a letter to deconflict: `047a_...`, `047b_...`. The runner
   refuses to apply if it finds a duplicate numeric prefix.

3. **Make migrations idempotent** where practical: `CREATE TABLE IF NOT
   EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`, `CREATE OR REPLACE
   FUNCTION`. That way a re-run (or a partial failure) is safe.

4. **Triggers that write to a table with an FK back to the row being inserted
   must fire `AFTER INSERT`, not `BEFORE`.** (See `029_pending_cleaner_notes_trigger.sql`
   — a `BEFORE INSERT` version failed the FK because the row didn't exist yet.)

## How applying works

`scripts/migrate.mjs`:

1. Lists every top-level `*.sql` file (ignores `_archive/`), natural-sorted.
2. Aborts if two files share a numeric prefix.
3. Reads `schema_migrations` to see what's already applied.
4. Warns about checksum drift on applied files.
5. Runs each pending file inside the connection, then records it with its
   checksum.

### Connecting to the database

The runner applies SQL directly over a Postgres connection. Set:

```bash
export POSTGRES_URL="postgres://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres"
```

(Find this in Supabase → Project Settings → Database → Connection string → URI.)

It also needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (already
in `.env.local`) to read/write the `schema_migrations` tracking table over the
REST API.

> **If the service-role key is stale** (REST returns 401), rotate it in
> Supabase → Project Settings → API and update `.env.local`. As a fallback you
> can paste a migration into the Supabase SQL Editor by hand, then record it:
> ```bash
> node scripts/migrate.mjs --record 047_my_migration.sql
> ```

## `_archive/`

Superseded or never-applied historical migrations live in `_archive/` so the
main folder is a clean, collision-free, apply-in-order set that matches live.
Files there are **not** applied by the runner. They're kept only for history —
several early migrations were duplicated or replaced (e.g. two different
`019_*`, two `020_*`, an early `028` trigger replaced by `029`). See each
`*.SUPERSEDED_BY_*.sql` name for what replaced it.

## Baseline

On 2026-08-16 the tracking table was introduced and every then-current file was
recorded as applied (`applied_by = 'baseline-2026-08-16'`), because the live
database already contained their schema. Everything numbered `047+` is applied
and tracked normally by the runner.
