import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The Communications Hub feed. Aggregates EVERY message pathway in the platform
 * into one unified, filterable list — so nothing sent anywhere is invisible here.
 *
 * Sources (all that exist live): notifications (Quick Notify / alerts),
 * maintenance_tickets (repairs), property_notes + property_cleaning_notes +
 * cleans (staff/cleaner notes), viewings (lettings feedback). Each is normalized
 * to one row shape. New source tables just need a new block below.
 *
 * Uses the service-role client: reading tenant-scoped rows (notifications RLS is
 * per-tenant) requires bypassing RLS, and this is admin-only data.
 */

const CAP = 600

interface Msg {
  id: string
  date: string
  type: 'Tenant' | 'Maintenance' | 'Landlord' | 'Cleaning' | 'Lettings'
  from: string
  to: string
  message: string
  threadLabel: string
  link: string | null
  propertyId: string | null
  roomId: string | null
  personId: string | null
  former: boolean
}

function clip(s: any, n = 240): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

async function safe<T>(p: PromiseLike<{ data: T | null; error: any }>): Promise<T[]> {
  try {
    const { data } = await p
    return (data as any) || []
  } catch {
    return []
  }
}

export async function GET() {
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!sk) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })
  const s: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, sk, { auth: { persistSession: false } })

  const today = new Date().toISOString().split('T')[0]

  // ── Lookups ────────────────────────────────────────────────────────────────
  const [people, rooms, properties, tenancies] = await Promise.all([
    safe(s.from('people').select('id, full_name, email, role')),
    safe(s.from('rooms').select('id, name, property_id')),
    safe(s.from('properties').select('id, name, address')),
    safe(s.from('tenancies').select('person_id, room_id, property_id, end_date')),
  ])
  const personName = new Map<string, string>()
  const personRole = new Map<string, string>()
  for (const p of people as any[]) { personName.set(p.id, p.full_name || p.email || 'Someone'); personRole.set(p.id, p.role) }
  const roomName = new Map<string, string>()
  const roomProp = new Map<string, string>()
  for (const r of rooms as any[]) { roomName.set(r.id, r.name); roomProp.set(r.id, r.property_id) }

  // Active tenants (for former-tenant flag) + a person→their active room/property.
  const activeTenant = new Set<string>()
  const personTenancy = new Map<string, { propertyId: string; roomId: string | null }>()
  for (const t of tenancies as any[]) {
    const active = !t.end_date || t.end_date >= today
    if (active && t.person_id) {
      activeTenant.add(t.person_id)
      if (!personTenancy.has(t.person_id)) personTenancy.set(t.person_id, { propertyId: t.property_id, roomId: t.room_id })
    }
  }
  const isFormerTenant = (pid: string | null) =>
    !!pid && personRole.get(pid) === 'tenant' && !activeTenant.has(pid)

  const msgs: Msg[] = []

  // ── 1. notifications (Quick Notify / cleaner / lettings alerts) ──────────────
  for (const n of await safe(s.from('notifications').select('*').order('created_at', { ascending: false }).limit(300)) as any[]) {
    const t = String(n.type || '').toLowerCase()
    const type: Msg['type'] = t.includes('lettings') ? 'Lettings' : t.includes('clean') ? 'Cleaning' : t.includes('maint') ? 'Maintenance' : 'Tenant'
    const from = t.includes('lettings') ? 'Lettings' : t.includes('clean') ? 'Cleaner' : 'Admin'
    // derive property/room from the recipient's active tenancy if not stamped
    const derived = n.user_id ? personTenancy.get(n.user_id) : undefined
    const propertyId = n.property_id || derived?.propertyId || null
    const roomId = n.room_id || derived?.roomId || null
    msgs.push({
      id: `notif-${n.id}`,
      date: n.created_at,
      type,
      from,
      to: n.user_id ? (personName.get(n.user_id) || 'Tenant') : 'Tenants',
      message: clip(n.title || n.body),
      threadLabel: 'Alert',
      link: n.link || null,
      propertyId,
      roomId,
      personId: n.user_id || null,
      former: isFormerTenant(n.user_id || null),
    })
  }

  // ── 2. maintenance_tickets (repairs) ─────────────────────────────────────────
  for (const m of await safe(s.from('maintenance_tickets').select('*').order('created_at', { ascending: false }).limit(200)) as any[]) {
    const reporter = m.reporter_id ? personName.get(m.reporter_id) : null
    const contractor = m.contractor_id ? personName.get(m.contractor_id) : null
    msgs.push({
      id: `maint-${m.id}`,
      date: m.created_at,
      type: 'Maintenance',
      from: reporter || 'Admin',
      to: contractor || 'Contractor',
      message: clip(m.title || m.description),
      threadLabel: `Job #${String(m.id).replace(/-/g, '').slice(0, 4).toUpperCase()}`,
      link: m.room_id && m.property_id ? `/admin/properties/${m.property_id}/rooms/${m.room_id}` : '/admin/maintenance',
      propertyId: m.property_id || null,
      roomId: m.room_id || null,
      personId: m.reporter_id || null,
      former: isFormerTenant(m.reporter_id || null),
    })
  }

  // ── 3. property_notes (cleaner / agent / admin notes) ────────────────────────
  for (const pn of await safe(s.from('property_notes').select('*').eq('is_deleted', false).order('created_at', { ascending: false }).limit(200)) as any[]) {
    const nt = String(pn.note_type || '').toLowerCase()
    const type: Msg['type'] = nt === 'cleaner' ? 'Cleaning' : nt === 'agent' ? 'Lettings' : 'Tenant'
    msgs.push({
      id: `pnote-${pn.id}`,
      date: pn.created_at,
      type,
      from: pn.created_by ? (personName.get(pn.created_by) || (nt || 'Admin')) : (nt || 'Admin'),
      to: pn.room_id ? (roomName.get(pn.room_id) || 'Room') : 'Whole house',
      message: clip([pn.title, pn.content].filter(Boolean).join(' — ')),
      threadLabel: 'Note',
      link: pn.property_id ? `/admin/properties/${pn.property_id}` : null,
      propertyId: pn.property_id || null,
      roomId: pn.room_id || null,
      personId: null,
      former: false,
    })
  }

  // ── 4. property_cleaning_notes ───────────────────────────────────────────────
  for (const cn of await safe(s.from('property_cleaning_notes').select('*').eq('is_deleted', false).order('created_at', { ascending: false }).limit(200)) as any[]) {
    msgs.push({
      id: `cnote-${cn.id}`,
      date: cn.created_at,
      type: 'Cleaning',
      from: cn.created_by ? (personName.get(cn.created_by) || 'Cleaner') : 'Cleaner',
      to: cn.room_id ? (roomName.get(cn.room_id) || 'Room') : 'Whole house',
      message: clip([cn.note_title, cn.note_content].filter(Boolean).join(' — ')),
      threadLabel: 'Cleaning note',
      link: cn.property_id ? `/admin/properties/${cn.property_id}` : null,
      propertyId: cn.property_id || null,
      roomId: cn.room_id || null,
      personId: null,
      former: false,
    })
  }

  // ── 5. cleans (admin_note ↔ cleaner_note) ────────────────────────────────────
  for (const c of await safe(s.from('cleans').select('id, property_id, room_id, cleaner_id, admin_note, cleaner_note, clean_date, created_at').order('created_at', { ascending: false }).limit(200)) as any[]) {
    const base = { propertyId: c.property_id || null, roomId: c.room_id || null, personId: null, former: false, type: 'Cleaning' as const, link: c.property_id ? `/admin/properties/${c.property_id}` : null, threadLabel: 'Clean' }
    if (c.admin_note) msgs.push({ id: `clean-a-${c.id}`, date: c.created_at, from: 'Admin', to: c.cleaner_id ? (personName.get(c.cleaner_id) || 'Cleaner') : 'Cleaner', message: clip(c.admin_note), ...base })
    if (c.cleaner_note) msgs.push({ id: `clean-c-${c.id}`, date: c.created_at, from: c.cleaner_id ? (personName.get(c.cleaner_id) || 'Cleaner') : 'Cleaner', to: 'Admin', message: clip(c.cleaner_note), ...base })
  }

  // ── 6. viewings (lettings feedback) ──────────────────────────────────────────
  for (const v of await safe(s.from('viewings').select('*').order('created_at', { ascending: false }).limit(200)) as any[]) {
    if (!v.feedback) continue
    msgs.push({
      id: `view-${v.id}`,
      date: v.created_at,
      type: 'Lettings',
      from: v.visitor_name ? `${v.visitor_name} (viewing)` : 'Applicant',
      to: 'Lettings',
      message: clip(v.feedback),
      threadLabel: 'Viewing',
      link: '/lettings/viewings',
      propertyId: v.property_id || null,
      roomId: v.room_id || null,
      personId: null,
      former: false,
    })
  }

  msgs.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  const capped = msgs.slice(0, CAP)

  // Filter options: properties (with their rooms) for the drill-down.
  const propOptions = (properties as any[])
    .map((p) => ({ id: p.id, name: p.name || p.address || 'Property', rooms: (rooms as any[]).filter((r) => r.property_id === p.id).map((r) => ({ id: r.id, name: r.name })) }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }))

  return NextResponse.json({ total: msgs.length, messages: capped, properties: propOptions })
}
