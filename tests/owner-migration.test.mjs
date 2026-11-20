// Migration 295 (owner flag) and docs/owner-recovery.sql, run on an in-process PGlite copy of the relevant tables.
// Production is never touched. Run: node --test tests/owner-migration.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const HARRY_UID = '32fe30d1-e02d-41b3-921b-7167016b15d1'
const HARRY = 'harry@capitalrooms.co.uk'
const MIGRATION = readFileSync(new URL('../supabase/migrations/295_owner_flag_and_annual_access.sql', import.meta.url), 'utf8')
const RECOVERY = readFileSync(new URL('../docs/owner-recovery.sql', import.meta.url), 'utf8')

async function fresh({ harryAuth = { deleted: false, banned: false }, harryRole = 'administrator', dupe = false } = {}) {
  const db = new PGlite()
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, deleted_at timestamptz, banned_until timestamptz);
    CREATE TABLE public.people (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, role text, access_areas text[]);
  `)
  // the migration adds is_owner; the trigger function reads it, so we add it before the migration as the app would have
  await db.exec(`INSERT INTO auth.users (id, email, deleted_at, banned_until) VALUES
     ('${HARRY_UID}', '${HARRY}', ${harryAuth.deleted ? 'now()' : 'NULL'}, ${harryAuth.banned ? "now() + interval '1 day'" : 'NULL'}),
     ('11111111-1111-1111-1111-111111111111', 'staff1@example.com', NULL, NULL);`)
  await db.exec(`INSERT INTO public.people (email, role, access_areas) VALUES
     ('${HARRY}', '${harryRole}', NULL),
     ('staff1@example.com', 'lettings', NULL),
     ('staff2@example.com', 'lettings', ARRAY['dashboard','finance']);`)
  if (dupe) await db.exec(`INSERT INTO public.people (email, role) VALUES ('${HARRY.toUpperCase()}', 'administrator');`)
  return db
}

// before the migration there is no is_owner column: that means no owner
const ownerOf = async db => (await db.query(`SELECT email FROM public.people WHERE to_jsonb(people)->>'is_owner' = 'true'`)).rows.map(r => r.email)

test('migration marks Harry as the only owner and changes no access', async () => {
  const db = await fresh()
  const before = (await db.query(`SELECT email, role, access_areas FROM public.people ORDER BY email`)).rows
  await db.exec(MIGRATION)
  assert.deepEqual(await ownerOf(db), [HARRY])
  const after = (await db.query(`SELECT email, role, access_areas FROM public.people ORDER BY email`)).rows
  assert.deepEqual(after.map(({ email, role, access_areas }) => ({ email, role, access_areas })), before)
})

test('migration is idempotent (safe to re-run)', async () => {
  const db = await fresh()
  await db.exec(MIGRATION); await db.exec(MIGRATION)
  assert.deepEqual(await ownerOf(db), [HARRY])
})

test('fails safely if the owner auth account is deleted', async () => {
  const db = await fresh({ harryAuth: { deleted: true } })
  await assert.rejects(db.exec(MIGRATION), /deleted or banned/)
  assert.deepEqual(await ownerOf(db), [])
})

test('fails safely if the owner auth account is banned', async () => {
  const db = await fresh({ harryAuth: { banned: true } })
  await assert.rejects(db.exec(MIGRATION), /deleted or banned/)
  assert.deepEqual(await ownerOf(db), [])
})

test('fails safely if the email matches two people records', async () => {
  const db = await fresh({ dupe: true })
  await assert.rejects(db.exec(MIGRATION), /expected exactly one/)
  assert.deepEqual(await ownerOf(db), [])
})

test('fails safely if the owner is not an administrator', async () => {
  const db = await fresh({ harryRole: 'lettings' })
  await assert.rejects(db.exec(MIGRATION), /must be an administrator/)
  assert.deepEqual(await ownerOf(db), [])
})

test('the trigger refuses any change to is_owner outside the migration', async () => {
  const db = await fresh()
  await db.exec(MIGRATION)
  await assert.rejects(db.exec(`UPDATE public.people SET is_owner = TRUE WHERE email = 'staff1@example.com'`), /database migration/)
  await assert.rejects(db.exec(`UPDATE public.people SET is_owner = FALSE WHERE email = '${HARRY}'`), /database migration/)
  assert.deepEqual(await ownerOf(db), [HARRY])
})

test('recovery script re-marks the owner after the auth account is re-created with a new ID', async () => {
  const db = await fresh()
  await db.exec(MIGRATION)
  // Harry's sign-in is deleted and re-created: new auth ID, same email
  const NEW_UID = '22222222-2222-2222-2222-222222222222'
  await db.exec(`DELETE FROM auth.users WHERE id = '${HARRY_UID}'; INSERT INTO auth.users (id, email) VALUES ('${NEW_UID}', '${HARRY}');`)
  // recovery with the OLD ID fails safely (no auth user), owner unchanged
  await assert.rejects(db.exec(RECOVERY.replace('00000000-0000-0000-0000-000000000000', HARRY_UID)), /No auth user/)
  assert.deepEqual(await ownerOf(db), [HARRY])
  // recovery with the NEW ID succeeds and leaves exactly one owner
  await db.exec(RECOVERY.replace('00000000-0000-0000-0000-000000000000', NEW_UID))
  assert.deepEqual(await ownerOf(db), [HARRY])
})
