#!/usr/bin/env node
// Idempotent Supabase migration runner (CLI).
//
// Applies every supabase/migrations/*.sql file not yet recorded in the
// schema_migrations tracking table, in filename order, recording each with its
// SHA-256 checksum so nothing runs twice and nothing is silently skipped.
//
// The real logic lives in migrate-core.mjs and is driver-agnostic; this file
// wires it to a live database. Preferred connection is a direct Postgres URL
// (POSTGRES_URL) which handles BOTH applying and the tracking table, so it does
// not depend on the REST service-role key. If POSTGRES_URL is absent it uses
// REST only to READ the tracking table, and prints pending SQL for manual paste.
//
// Usage:
//   node scripts/migrate.mjs            # apply pending
//   node scripts/migrate.mjs --dry      # show pending, don't apply
//   node scripts/migrate.mjs --list     # applied vs pending
//   node scripts/migrate.mjs --check    # duplicate-prefix guard (CI-friendly, no DB)
//   node scripts/migrate.mjs --record <file>   # mark a manually-pasted file applied

import { readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import {
  listMigrationFiles, checkCollisions, sha256,
  ensureTrackingTable, getApplied, recordApplied, planFrom, applyPending,
} from './migrate-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DIR = join(REPO_ROOT, 'supabase', 'migrations');
config({ path: join(REPO_ROOT, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PG_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const WHO = process.env.USER || 'unknown';

const die = (m, c = 1) => { console.error(`\n❌ ${m}\n`); process.exit(c); };

// A `postgres`-package adapter matching the core's db interface.
async function openPgAdapter() {
  if (!PG_URL) return null;
  let sql;
  try {
    const { default: postgres } = await import('postgres');
    sql = postgres(PG_URL, { max: 1, prepare: false, onnotice: () => {} });
  } catch (e) {
    die(`POSTGRES_URL is set but couldn't connect / load "postgres":\n${e.message}`);
  }
  return {
    exec: (text) => sql.unsafe(text),
    query: (text, params = []) => sql.unsafe(text, params),
    tx: (fn) => sql.begin((t) => fn({ exec: (s) => t.unsafe(s), query: (s, p = []) => t.unsafe(s, p) })),
    close: () => sql.end(),
  };
}

// REST fallback: read-only for the tracking table when there's no POSTGRES_URL.
async function restGetApplied() {
  if (!SUPABASE_URL || !SERVICE_KEY) die('No POSTGRES_URL and no REST credentials.');
  const url = `${SUPABASE_URL}/rest/v1/schema_migrations?select=filename,checksum,applied_at&order=filename.asc`;
  const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!res.ok) die(`Cannot read schema_migrations over REST: ${res.status} ${await res.text()}\n` +
    `The service-role key may be stale — prefer POSTGRES_URL (see supabase/migrations/README.md).`);
  return res.json();
}
async function restRecord(filename, checksum) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/schema_migrations`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ filename, checksum, applied_by: WHO }),
  });
  if (!res.ok) throw new Error(`record ${filename}: ${res.status} ${await res.text()}`);
}

async function run() {
  const args = new Set(process.argv.slice(2));
  const files = listMigrationFiles(DIR);

  // Collision guard always runs (no DB needed).
  const dups = checkCollisions(files);
  if (dups.length) {
    console.error('\n❌ Duplicate numeric prefixes:');
    for (const [a, b] of dups) console.error(`   ${a}\n   ${b}`);
    console.error('\nRename one to be unique (019a_, 019b_) or move one to _archive/.\n');
    process.exit(1);
  }
  if (args.has('--check')) return console.log(`✓ ${files.length} migration files, no prefix collisions.`);

  const db = await openPgAdapter();

  // --record <file>
  const ri = process.argv.indexOf('--record');
  if (ri !== -1) {
    const f = process.argv[ri + 1];
    if (!f) die('--record requires a filename');
    try { statSync(join(DIR, f)); } catch { die(`File not found: ${f}`); }
    const cs = sha256(readFileSync(join(DIR, f), 'utf8'));
    if (db) { await ensureTrackingTable(db); await recordApplied(db, f, cs, WHO); await db.close(); }
    else { await restRecord(f, cs); }
    return console.log(`✓ Recorded ${f}`);
  }

  const applied = db ? (await ensureTrackingTable(db), await getApplied(db)) : await restGetApplied();
  const { pending, drift, appliedCount } = planFrom(files, DIR, applied);

  if (drift.length) {
    console.warn('\n⚠️  Checksum drift on already-applied files (edited after apply):');
    for (const d of drift) console.warn(`   ${d.file}  was ${d.was.slice(0, 8)}…  now ${d.is.slice(0, 8)}…`);
    console.warn('   Fix: write a NEW migration. Never edit an applied file.\n');
  }

  if (args.has('--list')) {
    console.log('\nApplied:');
    for (const r of applied) console.log(`  ✓ ${r.filename}  (${new Date(r.applied_at).toISOString().slice(0, 10)})`);
    console.log(`\nPending (${pending.length}):`);
    for (const f of pending) console.log(`  • ${f}`);
    console.log('');
    if (db) await db.close();
    return;
  }

  if (pending.length === 0) {
    console.log(`\n✓ Up to date — ${files.length} migrations, ${appliedCount} recorded, 0 pending.\n`);
    if (db) await db.close();
    return;
  }

  console.log(`\n${pending.length} pending migration(s):`);
  for (const f of pending) console.log(`  • ${f}`);

  if (args.has('--dry')) { console.log('\n(--dry) not applying.\n'); if (db) await db.close(); return; }

  if (!db) {
    console.log('\n⚠️  No POSTGRES_URL — cannot apply automatically.');
    console.log('   Set POSTGRES_URL (Supabase → Settings → Database → Connection string → URI),');
    console.log('   or paste each pending file into the SQL Editor and record it:');
    console.log('     node scripts/migrate.mjs --record <filename>\n   Pending SQL:\n');
    for (const f of pending) { console.log(`\n===== ${f} =====\n`); console.log(readFileSync(join(DIR, f), 'utf8')); }
    return;
  }

  try {
    for (const f of pending) {
      process.stdout.write(`▸ ${f}`);
      await applyPending(db, DIR, [f], WHO);
      console.log('  ✓');
    }
  } catch (e) {
    console.log('  ✗');
    await db.close();
    die(e.message);
  }
  await db.close();
  console.log(`\n✓ Applied ${pending.length} migration(s).\n`);
}

run().catch((e) => die(e.stack || e.message));
