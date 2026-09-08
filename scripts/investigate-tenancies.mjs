#!/usr/bin/env node
/**
 * Investigates: people with room assignments but no active tenancy row.
 * "Active" = end_date IS NULL or end_date >= today (no status column on this table).
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://fihjzzxxhprxgjuefgtb.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const today = new Date().toISOString().slice(0, 10)

// ── 1. All tenants with a room_id ─────────────────────────────────────────
const { data: tenants, error: e1 } = await supabase
  .from('people')
  .select('id, email, full_name, first_name, last_name, role, room_id, property_id, created_at')
  .eq('role', 'tenant')
  .not('room_id', 'is', null)

if (e1) { console.error('people query failed:', e1.message); process.exit(1) }
console.log(`\nTotal tenants with a room_id: ${tenants.length}`)

// ── 2. All tenancies ──────────────────────────────────────────────────────
const { data: tenancies, error: e2 } = await supabase
  .from('tenancies')
  .select('id, person_id, room_id, property_id, start_date, end_date, rent_amount, deposit_amount, lease_reference')

if (e2) { console.error('tenancies query failed:', e2.message); process.exit(1) }
console.log(`Total tenancy rows in DB: ${tenancies.length}`)

// Build sets
const activePersonIds = new Set(
  tenancies
    .filter(t => !t.end_date || t.end_date >= today)
    .map(t => t.person_id)
)
const anyTenancyPersonIds = new Set(tenancies.map(t => t.person_id))

// ── 3. Find people with room but no active tenancy ─────────────────────────
const missing = tenants.filter(p => !activePersonIds.has(p.id))
const missingNoTenancyAtAll = tenants.filter(p => !anyTenancyPersonIds.has(p.id))

console.log(`Tenants with no ACTIVE tenancy row:   ${missing.length}`)
console.log(`Tenants with NO tenancy row at all:   ${missingNoTenancyAtAll.length}`)

if (missing.length === 0) {
  console.log('\n✅ All room-assigned tenants have an active tenancy — nothing to fix.')
  console.log('\nNote: 47 tenants have room_ids, 48 tenancy rows exist. There may be a 1:many situation.')
  process.exit(0)
}

// ── 4. Resolve rooms and properties ───────────────────────────────────────
const roomIds = [...new Set(missing.map(p => p.room_id))]
const { data: rooms } = await supabase
  .from('rooms')
  .select('id, name, property_id')
  .in('id', roomIds)
const roomMap = Object.fromEntries((rooms || []).map(r => [r.id, r]))

const propIds = [...new Set((rooms || []).map(r => r.property_id))]
const { data: props } = await supabase
  .from('properties')
  .select('id, name, address')
  .in('id', propIds)
const propMap = Object.fromEntries((props || []).map(p => [p.id, p]))

// Ended tenancies for affected people
const endedByPerson = {}
for (const t of tenancies) {
  if (activePersonIds.has(t.person_id)) continue
  if (!endedByPerson[t.person_id]) endedByPerson[t.person_id] = []
  endedByPerson[t.person_id].push(t)
}

// ── 5. Print full detail table ─────────────────────────────────────────────
console.log('\n── Affected tenants ──────────────────────────────────────────────────────')
const rows = []
for (const p of missing) {
  const room = roomMap[p.room_id]
  const prop = room ? propMap[room.property_id] : null
  const ended = endedByPerson[p.id] || []
  const displayName = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email
  rows.push({
    name: displayName,
    email: p.email,
    people_id: p.id,
    room_name: room?.name ?? '?',
    property: prop?.name || prop?.address || '?',
    people_created: p.created_at?.slice(0, 10),
    has_ended_tenancy: ended.length > 0,
    ended_detail: ended.map(t =>
      `start=${t.start_date ?? 'NULL'} end=${t.end_date ?? 'NULL'} rent=£${t.rent_amount ?? '?'} deposit=£${t.deposit_amount ?? '?'}`
    ).join(' | '),
  })
}

console.table(rows.map(r => ({
  Name: r.name,
  Email: r.email,
  Room: r.room_name,
  Property: r.property,
  'Created': r.people_created,
  'Has ended tenancy?': r.has_ended_tenancy ? 'YES' : 'no',
  'Ended detail': r.ended_detail || '—',
})))

// ── 6. Data availability summary ───────────────────────────────────────────
console.log('\n── What data exists to build tenancies from? ────────────────────────────')
console.log(`  room_id on people:          YES — all ${missing.length} affected tenants have it`)
console.log(`  property_id on people:      ${missing.filter(p=>p.property_id).length}/${missing.length}`)
console.log(`  people.created_at (proxy):  YES — could use as placeholder start_date`)
console.log(`  rent_amount anywhere:       NO field on people; ${Object.values(endedByPerson).flat().filter(t=>t.rent_amount).length} ended tenancies have it`)
console.log(`  deposit_amount anywhere:    NO field on people; ${Object.values(endedByPerson).flat().filter(t=>t.deposit_amount).length} ended tenancies have it`)
console.log(`  lease_reference:            ${Object.values(endedByPerson).flat().filter(t=>t.lease_reference).length} ended tenancies have it`)

console.log('\n── Conclusion ────────────────────────────────────────────────────────────')
const hasEndedData = Object.keys(endedByPerson).length > 0
if (!hasEndedData) {
  console.log('⚠️  No rent/deposit data available from the DB for any affected tenant.')
  console.log('   start_date, rent_amount, and deposit_amount must be entered manually.')
  console.log('   Best fix: a bulk-entry admin screen pre-populated with names/rooms,')
  console.log('   where you type start date + rent + deposit per row and save all at once.')
} else {
  console.log('ℹ️  Some affected tenants have ended tenancies with rent/deposit data.')
  console.log('   Others still need manual entry. A bulk-entry screen is the cleanest fix.')
}
