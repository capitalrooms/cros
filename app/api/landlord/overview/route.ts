// GET /api/landlord/overview — the landlord home screen (17 Nov 2026): per house, certificates due in the next 60 days
// (or gone over), rooms let; and a picture of who lives in their homes — counts and kinds of work only, never names
// (Harry: "a summary of what their tenants do — students, studying, working — in consolidated fields"). ?as= for the
// office viewing as them (lib/landlord/documents landlordFor).
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { landlordFor } from '@/lib/landlord/documents'

export const dynamic = 'force-dynamic'
const CERTS: [string, string][] = [['gas_safe_cert_expiry', 'Gas'], ['electrical_cert_expiry', 'EICR'], ['epc_expiry', 'EPC'], ['license_expiry', 'HMO licence'], ['fire_risk_assessment_expiry', 'Fire risk'], ['fire_detection_expiry', 'Fire alarm'], ['emergency_lighting_expiry', 'Emergency lights'], ['pat_test_expiry', 'PAT']]
// kinds of work, from what tenants put on their application ("occupation")
const FIELDS: [RegExp, string][] = [
  [/student|studying|phd|masters|msc|undergrad|postgrad|universit|college/i, 'student'],
  [/financ|bank|account|audit|invest|insur|trader|analyst|actuar|tax/i, 'finance'],
  [/nurse|doctor|nhs|health|medic|pharm|dentist|carer|care worker|physio|clinic|hospital/i, 'healthcare'],
  [/engineer|developer|software|it |tech|data|programm|devops|designer|product/i, 'tech'],
  [/teach|lectur|tutor|school|education|academic|research/i, 'education'],
  [/retail|shop|sales|store|hospitality|chef|cook|waiter|barista|restaurant|hotel|bar /i, 'retail and hospitality'],
  [/law|legal|solicitor|barrister|paralegal/i, 'law'],
  [/construct|builder|electric|plumb|trade|labour|driver|logist|warehouse|delivery/i, 'trades and logistics'],
  [/market|media|creative|journal|music|art|film|photo/i, 'creative and media'],
  [/civil serv|government|council|police|public sector/i, 'public sector'],
]
const kind = (occ: string | null) => { const o = String(occ ?? '').trim(); if (!o) return null; for (const [re, k] of FIELDS) if (re.test(` ${o} `)) return k; return 'other work' }

export async function GET(req: NextRequest) {
  const id = await landlordFor(req)
  if (!id) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  const s = createServiceClient()
  const { data: props } = await s.from('properties').select(`id, name, letting_type, ${CERTS.map(c => c[0]).join(', ')}`).eq('landlord_id', id) as { data: any[] | null }
  const ids = (props ?? []).map(p => p.id)
  if (!ids.length) return NextResponse.json({ houses: [], tenants: null })
  const today = new Date().toISOString().slice(0, 10)
  const soon = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)
  const [{ data: rooms }, { data: tens }] = await Promise.all([
    s.from('rooms').select('id, property_id').in('property_id', ids),
    s.from('tenancies').select('property_id, room_id, start_date, person:people!person_id(occupation), co:people!co_tenant_id(occupation)').in('property_id', ids)
      .is('let_cancelled_at', null).lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`),
  ]) as { data: any[] | null }[]
  const houses = (props ?? []).map(p => {
    const due = CERTS.map(([col, label]) => ({ label, date: p[col] as string | null })).filter(c => c.date && c.date <= soon && p.letting_type !== 'let_only')
      .map(c => ({ label: c.label, date: c.date!, overdue: c.date! < today })).sort((a, b) => a.date.localeCompare(b.date))
    const roomCount = (rooms ?? []).filter(r => r.property_id === p.id).length
    const let_ = new Set((tens ?? []).filter(t => t.property_id === p.id).map(t => t.room_id ?? 'whole')).size
    return { id: p.id, name: String(p.name ?? '').split('\n')[0], due, rooms: roomCount, let: let_, lettingType: p.letting_type }
  })
  // who lives there — counts only
  const people = (tens ?? []).flatMap(t => [t.person, t.co].filter(Boolean))
  const counts: Record<string, number> = {}
  for (const p of people) { const k = kind(p.occupation) ?? 'not told us'; counts[k] = (counts[k] ?? 0) + 1 }
  const students = counts.student ?? 0, unknown = counts['not told us'] ?? 0
  const working = people.length - students - unknown
  const fields = Object.entries(counts).filter(([k]) => !['student', 'not told us', 'other work'].includes(k)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k)
  const months = (tens ?? []).map(t => (Date.now() - new Date(t.start_date).getTime()) / (30.4 * 86400000)).filter(n => n > 0)
  return NextResponse.json({
    houses,
    tenants: people.length ? { total: people.length, working, students, unknown, fields, roomsLet: houses.reduce((a, h) => a + h.let, 0), rooms: houses.reduce((a, h) => a + h.rooms, 0), avgStayMonths: months.length ? Math.round(months.reduce((a, b) => a + b, 0) / months.length) : null } : null,
  })
}
