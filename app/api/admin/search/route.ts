// GET /api/admin/search?q= — one search box across people, properties, rooms and maintenance jobs.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export interface SearchHit { id: string; kind: 'person' | 'property' | 'room' | 'job' | 'document' | 'invoice' | 'deposit'; title: string; detail: string; href: string; score?: number }

// words people type for certificates → the document type stored (24 Nov 2026: "gas" and "epc" found nothing)
const DOC_ALIAS: Record<string, string[]> = {
  gas: ['gas_safety_certificate', 'gas_safety'], epc: ['epc'], eicr: ['electrical_eicr', 'electrical_cert'], electrical: ['electrical_eicr', 'electrical_cert'],
  hmo: ['hmo_licence'], licence: ['hmo_licence'], license: ['hmo_licence'], fire: ['fire_risk_assessment', 'fire_alarm_certificate', 'emergency_lighting_certificate'], insurance: ['insurance_policy', 'insurance'], pat: ['pat_test'],
}

const personHref = (id: string, role: string | null) =>
  role === 'tenant' ? `/admin/tenant/${id}` : role === 'landlord' ? `/admin/landlord/${id}` : role === 'contractor' ? `/admin/contractor/${id}` : `/admin/person/${id}`

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // PostgREST .or() uses commas and brackets as syntax — strip them (and wildcards) from what was typed.
  const q = (req.nextUrl.searchParams.get('q') || '').replace(/[,()%*\\]/g, ' ').trim().slice(0, 60)
  if (q.length < 2) return NextResponse.json({ hits: [] })
  const like = `%${q}%`
  const digits = q.replace(/\D/g, '')
  const s = svc()

  const [people, props, rooms, jobs] = await Promise.all([
    s.from('people').select('id, salutation, first_name, last_name, full_name, email, phone, role')
      .or([`first_name.ilike.${like}`, `last_name.ilike.${like}`, `full_name.ilike.${like}`, `email.ilike.${like}`, ...(digits.length >= 4 ? [`phone.ilike.%${digits.slice(-6)}%`] : [])].join(','))
      .limit(12),
    s.from('properties').select('id, name, address, postcode').or(`name.ilike.${like},address.ilike.${like},postcode.ilike.${like}`).limit(8),
    s.from('rooms').select('id, name, property_id, properties(name, address)').ilike('name', like).limit(8),
    s.from('maintenance_tickets').select('id, title, status, properties(name)').ilike('title', like).order('created_at', { ascending: false }).limit(8),
  ])
  const failed = [people, props, rooms, jobs].find(r => r.error)
  if (failed) return NextResponse.json({ error: failed.error!.message }, { status: 500 })

  // a payment reference (as on bank lines and statements, e.g. 095ROS01) finds the tenant(s) who pay with it (3 Nov 2026)
  if (/\d/.test(q) && /[a-z]/i.test(q)) {
    const { data: byRef } = await s.from('tenancies').select('person_id').ilike('payment_reference', like).limit(8)
    const have = new Set((people.data ?? []).map((p: any) => p.id))
    const more = [...new Set(((byRef ?? []) as any[]).map(t => t.person_id).filter((id: string) => id && !have.has(id)))]
    if (more.length) {
      const { data: extra } = await s.from('people').select('id, salutation, first_name, last_name, full_name, email, phone, role').in('id', more)
      ;(people.data as any[] | null)?.push(...((extra ?? []) as any[]))
    }
  }

  // a tenant opens their letting file — the current tenancy, else the incoming one, else the latest
  const tenantIds = (people.data ?? []).filter((p: any) => p.role === 'tenant').map((p: any) => p.id)
  const { data: tens } = tenantIds.length
    ? await s.from('tenancies').select('id, person_id, start_date, end_date, rooms(name), properties(name)').in('person_id', tenantIds).order('start_date', { ascending: false })
    : { data: [] as any[] }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const fileFor = new Map<string, any>()
  for (const id of tenantIds) {
    const mine = ((tens ?? []) as any[]).filter(t => t.person_id === id)
    const pick = mine.find(t => t.start_date <= today && (!t.end_date || t.end_date >= today)) ?? mine.find(t => t.start_date > today && (!t.end_date || t.end_date >= today)) ?? mine[0]
    if (pick) fileFor.set(id, pick)
  }

  // property documents: by file name, type or house (certificates, plans, licences) — 24 Nov 2026
  const lowq = q.toLowerCase()
  const aliasTypes = DOC_ALIAS[lowq] ?? []
  const docOr = [`file_name.ilike.${like}`, `document_type.ilike.${like}`, ...aliasTypes.map(t => `document_type.eq.${t}`)].join(',')
  const { data: docs } = await s.from('property_documents').select('id, property_id, document_type, file_name, uploaded_at, properties(name, address)').or(docOr).order('uploaded_at', { ascending: false }).limit(10)
  const docHits: SearchHit[] = ((docs ?? []) as any[]).map(d => ({
    id: d.id, kind: 'document' as const, title: String(d.file_name || d.document_type).replace(/\.[a-z0-9]+$/i, ''),
    detail: [String(d.document_type).replace(/_/g, ' '), d.properties?.name || d.properties?.address, String(d.uploaded_at ?? '').slice(0, 10)].filter(Boolean).join(' · '),
    href: `/admin/properties/${d.property_id}`,
  }))
  // fee invoices by number or description
  const { data: invs } = await s.from('fee_invoices').select('id, invoice_no, description, total_amount, payer_kind').or(`invoice_no.ilike.${like},description.ilike.${like}`).limit(6)
  const invHits: SearchHit[] = ((invs ?? []) as any[]).map(i => ({ id: i.id, kind: 'invoice' as const, title: i.invoice_no, detail: [i.description, `£${Number(i.total_amount).toFixed(2)}`].filter(Boolean).join(' · '), href: '/admin/finance' }))
  // deposits by reference (DEP…)
  const { data: deps } = await s.from('tenancies').select('id, deposit_no, deposit_reference, rooms(name), properties(name)').or(`deposit_no.ilike.${like},deposit_reference.ilike.${like}`).limit(6)
  const depHits: SearchHit[] = ((deps ?? []) as any[]).map(t => ({ id: t.id, kind: 'deposit' as const, title: t.deposit_no || t.deposit_reference, detail: [t.rooms?.name, t.properties?.name].filter(Boolean).join(', '), href: `/admin/lettings/${t.id}?from=/admin/search` }))

  const hits: SearchHit[] = [
    ...(people.data ?? []).map((p: any) => {
      const t = fileFor.get(p.id)
      return {
        id: p.id, kind: 'person' as const,
        title: [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.email,
        detail: t ? [t.start_date > today ? 'Let agreed' : t.end_date && t.end_date < today ? 'Past tenant' : 'Tenant', [t.rooms?.name, t.properties?.name].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
          : [p.role, p.email].filter(Boolean).join(' · '),
        href: t ? `/admin/lettings/${t.id}?from=/admin/search` : personHref(p.id, p.role),
      }
    }),
    ...(props.data ?? []).map((p: any) => ({
      id: p.id, kind: 'property' as const, title: p.name || p.address, detail: [p.address, p.postcode].filter(Boolean).join(', '), href: `/admin/properties/${p.id}`,
    })),
    ...(rooms.data ?? []).map((r: any) => ({
      id: r.id, kind: 'room' as const, title: r.name, detail: r.properties?.name || r.properties?.address || '', href: `/admin/properties/${r.property_id}/rooms/${r.id}`,
    })),
    ...(jobs.data ?? []).map((j: any) => ({
      id: j.id, kind: 'job' as const, title: j.title || 'Maintenance job', detail: [j.properties?.name, j.status?.replace('_', ' ')].filter(Boolean).join(' · '), href: `/admin/maintenance?ticket=${j.id}`,
    })),
  ]
  // ranking: exact and starting-with matches first, then anything containing the words
  const rank = (h: SearchHit) => {
    const t = h.title.toLowerCase()
    return t === lowq ? 0 : t.startsWith(lowq) ? 1 : t.split(/\s+/).some(w => w.startsWith(lowq)) ? 2 : h.detail.toLowerCase().includes(lowq) ? 3 : 4
  }
  const ranked = [...hits, ...docHits, ...invHits, ...depHits].map(h => ({ ...h, score: rank(h) })).sort((a, b) => (a.score ?? 9) - (b.score ?? 9))
  return NextResponse.json({ hits: ranked.slice(0, 30) })
}
