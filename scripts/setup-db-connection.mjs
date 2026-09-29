#!/usr/bin/env node
// One-time setup: save the database connection for migrations (scripts/migrate.mjs) in .env.local.
//
// The password is typed into a hidden prompt — it is never shown on screen, never printed, and only written to
// .env.local on this Mac (file permissions set to owner-only). The connection is tested before it's saved.
//
// Usage: node scripts/setup-db-connection.mjs
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENV = join(ROOT, '.env.local')
const PROJECT = 'fihjzzxxhprxgjuefgtb'
const HOST = `db.${PROJECT}.supabase.co`

function askHidden(question) {
  return new Promise((res, rej) => {
    const { stdin, stdout } = process
    if (!stdin.isTTY) return rej(new Error('Run this in a terminal so the password can be typed privately.'))
    stdout.write(question)
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8')
    let value = ''
    const onData = ch => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n'); return res(value) }
        if (c === '\u0003') { stdout.write('\n'); process.exit(130) }            // Ctrl-C
        if (c === '\u007f' || c === '\b') { if (value) { value = value.slice(0, -1); stdout.write('\b \b') } continue } // backspace
        value += c
        stdout.write('•')                                                          // a dot per character, never the character
      }
    }
    stdin.on('data', onData)
  })
}

const password = String(await askHidden('Database password (shown as dots — paste it and press Return): ').catch(e => { console.error(e.message); process.exit(1) })).trim()   // Notes often adds a space
if (!password) { console.error('No password entered — nothing saved.'); process.exit(1) }
const url = `postgres://postgres:${encodeURIComponent(password)}@${HOST}:5432/postgres`

process.stdout.write('Testing the connection… ')
const sql = postgres(url, { ssl: 'require', max: 1, connect_timeout: 15, onnotice: () => {} })
try {
  const [row] = await sql`select current_user as who, (select count(*) from public.schema_migrations) as tracked`
  console.log(`connected ✓ (as ${row.who}; ${row.tracked} migrations on record)`)
} catch (e) {
  console.log('failed')
  console.error(/password/i.test(e.message)
    ? 'That password was not accepted. Check it in Supabase → Project Settings → Database (reset it there if unsure), then run this again.'
    : `Could not connect: ${e.message}`)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}

let env = existsSync(ENV) ? readFileSync(ENV, 'utf8') : ''
const line = `POSTGRES_URL="${url}"`
env = /^POSTGRES_URL=.*$/m.test(env) ? env.replace(/^POSTGRES_URL=.*$/m, line) : `${env.replace(/\n*$/, '\n')}\n# Database connection for migrations (scripts/migrate.mjs) — set by scripts/setup-db-connection.mjs\n${line}\n`
writeFileSync(ENV, env)
chmodSync(ENV, 0o600)
console.log('Saved to .env.local (readable only by you). Migrations can now be run with: npm run db:migrate:list')
