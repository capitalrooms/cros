#!/usr/bin/env node
// Self-contained test for the migration runner core.
//
// Runs the ACTUAL migrate-core logic against a real Postgres engine (PGlite,
// in-process WASM) using a temporary migrations directory. No external database
// and no credentials required — safe for CI. Exercises: apply, record,
// idempotency (re-run = 0 pending), checksum-drift detection, and the
// duplicate-prefix collision guard.

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  listMigrationFiles, checkCollisions,
  ensureTrackingTable, getApplied, planFrom, applyPending,
} from './migrate-core.mjs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) failures++; };

// PGlite adapter matching the core's db interface.
function pgliteAdapter(pg) {
  return {
    exec: (text) => pg.exec(text),
    query: async (text, params = []) => (await pg.query(text, params)).rows,
    tx: (fn) => pg.transaction((t) => fn({
      exec: (s) => t.exec(s),
      query: async (s, p = []) => (await t.query(s, p)).rows,
    })),
    close: () => pg.close(),
  };
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'migtest-'));
  const pg = new PGlite();
  const db = pgliteAdapter(pg);

  console.log('\nMigration runner — end-to-end test (PGlite)\n');

  // Seed two well-formed migrations.
  writeFileSync(join(dir, '001_create_widgets.sql'),
    'CREATE TABLE widgets (id serial primary key, name text not null);');
  writeFileSync(join(dir, '002_add_widget_color.sql'),
    'ALTER TABLE widgets ADD COLUMN color text;');

  await ensureTrackingTable(db);

  // --- 1. Apply from empty -> both pending, both applied ---
  let files = listMigrationFiles(dir);
  ok(files.length === 2, 'discovers 2 migration files');
  let plan = planFrom(files, dir, await getApplied(db));
  ok(plan.pending.length === 2, 'both migrations pending on a fresh DB');
  const done = await applyPending(db, dir, plan.pending, 'test');
  ok(done.length === 2, 'applies both migrations');

  // The actual schema change happened:
  const cols = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='widgets' ORDER BY column_name`);
  const colNames = cols.map((c) => c.column_name).sort();
  ok(JSON.stringify(colNames) === JSON.stringify(['color', 'id', 'name']),
    'schema reflects applied migrations (widgets has id, name, color)');

  // --- 2. Idempotency: re-run sees 0 pending ---
  plan = planFrom(files, dir, await getApplied(db));
  ok(plan.pending.length === 0, 're-run reports 0 pending (idempotent)');
  ok(plan.appliedCount === 2, 'tracking table records 2 applied');

  // --- 3. A new migration becomes the only pending one ---
  writeFileSync(join(dir, '003_create_gadgets.sql'),
    'CREATE TABLE gadgets (id serial primary key);');
  files = listMigrationFiles(dir);
  plan = planFrom(files, dir, await getApplied(db));
  ok(plan.pending.length === 1 && plan.pending[0] === '003_create_gadgets.sql',
    'a newly-added file is the only pending migration');
  await applyPending(db, dir, plan.pending, 'test');
  const gadgets = await db.query(
    `SELECT to_regclass('public.gadgets') IS NOT NULL AS exists`);
  ok(gadgets[0].exists === true, 'the new migration actually ran (gadgets table exists)');

  // --- 4. Checksum drift: editing an applied file is detected ---
  writeFileSync(join(dir, '002_add_widget_color.sql'),
    'ALTER TABLE widgets ADD COLUMN color text; -- edited after apply');
  plan = planFrom(listMigrationFiles(dir), dir, await getApplied(db));
  ok(plan.drift.length === 1 && plan.drift[0].file === '002_add_widget_color.sql',
    'checksum drift detected when an applied file is edited');
  ok(plan.pending.length === 0, 'an edited applied file is NOT re-run (stays out of pending)');

  // --- 5. Collision guard ---
  ok(checkCollisions(['001_a.sql', '002_b.sql', '003_c.sql']).length === 0,
    'no false positive on unique prefixes');
  ok(checkCollisions(['019_a.sql', '019_b.sql']).length === 1,
    'catches a duplicate numeric prefix');
  ok(checkCollisions(['019a_x.sql', '019b_y.sql']).length === 0,
    'allows intentional letter-deconflicted prefixes (019a / 019b)');

  await db.close();
  rmSync(dir, { recursive: true, force: true });

  console.log(`\n${failures === 0 ? '✓ all assertions passed' : `✗ ${failures} assertion(s) failed`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
