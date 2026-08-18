// Core migration logic, decoupled from any specific database driver.
//
// A "db adapter" is an object with:
//   exec(sqlText)          -> Promise<void>        run statement(s), ignore result
//   query(sqlText, params) -> Promise<rows[]>      run a query, return rows
//   tx(fn)                 -> Promise<void>         run fn({exec}) inside a transaction
//   close()                -> Promise<void>
//
// Production uses a `postgres`-backed adapter; tests use a PGlite-backed one.
// Both exercise this identical code, so the test genuinely covers production.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export function listMigrationFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql') && statSync(join(dir, name)).isFile())
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

// Duplicate numeric prefixes. A single trailing letter (019a / 019b) is a
// deliberate, distinct deconfliction and is allowed.
export function checkCollisions(files) {
  const seen = new Map();
  const dups = [];
  for (const f of files) {
    const m = f.match(/^(\d+[a-z]?)/);
    if (!m) continue;
    const key = m[1];
    if (seen.has(key)) dups.push([seen.get(key), f]);
    else seen.set(key, f);
  }
  return dups;
}

export async function ensureTrackingTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename    TEXT PRIMARY KEY,
      checksum    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_by  TEXT
    );
  `);
}

export async function getApplied(db) {
  return db.query(
    'SELECT filename, checksum, applied_at FROM public.schema_migrations ORDER BY filename ASC'
  );
}

export async function recordApplied(db, filename, checksum, who) {
  await db.query(
    `INSERT INTO public.schema_migrations (filename, checksum, applied_by)
       VALUES ($1, $2, $3)
     ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = NOW()`,
    [filename, checksum, who || 'unknown']
  );
}

// Compute drift (applied files edited since apply) and pending (not yet applied).
export function planFrom(files, dir, applied) {
  const byName = new Map(applied.map((r) => [r.filename, r]));
  const drift = [];
  for (const f of files) {
    const rec = byName.get(f);
    if (!rec) continue;
    const local = sha256(readFileSync(join(dir, f), 'utf8'));
    if (rec.checksum !== local) drift.push({ file: f, was: rec.checksum, is: local });
  }
  const pending = files.filter((f) => !byName.has(f));
  return { pending, drift, appliedCount: applied.length };
}

// Apply pending migrations through the adapter. Each file runs in its own
// transaction, then is recorded. Returns the list of files applied.
export async function applyPending(db, dir, pending, who) {
  const done = [];
  for (const f of pending) {
    const body = readFileSync(join(dir, f), 'utf8');
    const checksum = sha256(body);
    await db.tx(async (tx) => { await tx.exec(body); });
    await recordApplied(db, f, checksum, who);
    done.push(f);
  }
  return done;
}
