#!/usr/bin/env node
// Preflight health-check ("doctor") for CROS.
//
// Catches the classes of SILENT failure that have bitten this project:
//   1. Missing / empty / DEAD API keys (a dead key returns "0 results", not an error)
//   2. Tables the code references that don't exist in the live DB
//   3. Columns the code references that don't exist (e.g. tenant_id vs person_id)
//   4. A service-role key that can't actually authenticate (blocks all cron routes)
//
// It talks to the live Supabase project over REST, so it validates the SAME
// database prod and local share. Env-var checks reflect whatever environment it
// runs in (local .env.local, or process.env in CI / after `vercel env pull`).
//
// Usage:
//   npm run doctor            # full check, exits 1 if anything is broken
//   node scripts/doctor.mjs   # same
//
// Exit code 0 = healthy, 1 = at least one ERROR (WARNINGs do not fail).

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
// `--env <file>` checks a specific environment (e.g. a pulled production env);
// defaults to .env.local. Values already in process.env (CI/Vercel) win.
const envArgIdx = process.argv.indexOf('--env');
const envFile = envArgIdx !== -1 ? process.argv[envArgIdx + 1] : join(REPO_ROOT, '.env.local');
config({ path: envFile });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CRON = process.env.CRON_SECRET || '';

// ── Terminal formatting ──────────────────────────────────────────────
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', dim: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };
let errors = 0, warns = 0;
const pass = (m) => console.log(`  ${C.g}✓${C.x} ${m}`);
const fail = (m, detail) => { errors++; console.log(`  ${C.r}✗ ${m}${C.x}${detail ? `\n      ${C.dim}${detail}${C.x}` : ''}`); };
const warn = (m, detail) => { warns++; console.log(`  ${C.y}⚠ ${m}${C.x}${detail ? `\n      ${C.dim}${detail}${C.x}` : ''}`); };
const section = (t) => console.log(`\n${C.b}${t}${C.x}`);

// The schema contract lives in lib/schema-manifest.json — shared with the
// production health endpoint (app/api/health) so both enforce the same list.
const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'lib', 'schema-manifest.json'), 'utf8'));
const SCHEMA = manifest.tables;
const KNOWN_GAPS = manifest.knownGaps || {};

async function probe(path, key = ANON) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return res.status;
}

async function main() {
  console.log(`${C.b}CROS preflight doctor${C.x}  ${C.dim}${URL || '(no SUPABASE URL)'}${C.x}`);

  // 1 ── Environment variables present ────────────────────────────────
  section('Environment');
  const req = { NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE, CRON_SECRET: CRON };
  for (const [name, val] of Object.entries(req)) {
    if (!val) fail(`${name} is missing/empty`, name === 'SUPABASE_SERVICE_ROLE_KEY' ? 'cron & generation routes cannot write without it' : undefined);
    else pass(`${name} present ${C.dim}(${val.length} chars)${C.x}`);
  }
  if (!URL || !ANON) { summary(); return; } // can't do live checks without these

  // 2 ── Key validity (a DEAD key is worse than a missing one — it fails silently) ──
  section('API key validity (live)');
  const anonStatus = await probe('people?select=id&limit=1', ANON);
  if (anonStatus === 401) fail('anon/publishable key is REJECTED by Supabase', 'the app cannot read anything — key is wrong or rotated');
  else if (anonStatus === 200) pass('anon/publishable key authenticates');
  else warn(`anon key probe returned ${anonStatus}`, 'unexpected, investigate');

  if (SERVICE) {
    // The OpenAPI root only accepts a SECRET (service) key — a perfect validity test.
    const svc = await fetch(`${URL}/rest/v1/`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
    if (svc.status === 200) pass('service-role/secret key authenticates (bypasses RLS)');
    else {
      const body = await svc.text().catch(() => '');
      fail(`service-role key is INVALID (HTTP ${svc.status})`, (body.slice(0, 120)) + ' — cron/generation routes will silently no-op');
    }
  }

  // 3 ── Required tables exist ────────────────────────────────────────
  section('Required tables exist (live)');
  for (const table of Object.keys(SCHEMA)) {
    const s = await probe(`${table}?select=${SCHEMA[table][0]}&limit=1`);
    if (s === 404) fail(`table "${table}" does NOT exist`, 'code references it — a migration was never applied');
    else if (s === 401) warn(`table "${table}" not readable by anon`, 'exists but RLS-locked (expected for some)');
    else pass(`${table}`);
  }

  // 4 ── Required columns exist (catches tenant_id vs person_id class) ──
  section('Required columns exist (live)');
  for (const [table, cols] of Object.entries(SCHEMA)) {
    const missing = [];
    for (const col of cols) {
      const s = await probe(`${table}?select=${col}&limit=1`);
      if (s === 400) missing.push(col);
    }
    if (missing.length) fail(`${table} missing column(s): ${missing.join(', ')}`, 'code references a column that is not in the live schema');
    else pass(`${table} (${cols.length} columns)`);
  }

  // 5 ── Known gaps (warn, don't fail) ────────────────────────────────
  section('Known gaps');
  let anyGap = false;
  for (const [table, why] of Object.entries(KNOWN_GAPS)) {
    const s = await probe(`${table}?select=id&limit=1`);
    if (s === 404) { warn(`table "${table}" missing`, why); anyGap = true; }
    else pass(`${table} now exists — remove it from KNOWN_GAPS in doctor.mjs`);
  }
  if (!anyGap && !Object.keys(KNOWN_GAPS).length) console.log(`  ${C.dim}none${C.x}`);

  summary();
}

function summary() {
  console.log(`\n${C.b}Result:${C.x} ${errors ? `${C.r}${errors} error(s)${C.x}` : `${C.g}healthy${C.x}`}${warns ? `, ${C.y}${warns} warning(s)${C.x}` : ''}`);
  process.exit(errors ? 1 : 0);
}

main().catch((e) => { console.error(`\n${C.r}doctor crashed:${C.x} ${e.message}`); process.exit(1); });
