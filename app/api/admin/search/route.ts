// GET /api/admin/search?q= — one search box across people, properties, rooms and maintenance jobs.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export interface SearchHit { id: string; kind: 'person' | 'property' | 'room' | 'job'; title: string; detail: string; href: string }

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
    s.from('people').select('id, first_name, last_name, full_name, email, phone, role')
      .or([`first_name.ilike.${like}`, `last_name.ilike.${like}`, `full_name.ilike.${like}`, `email.ilike.${like}`, ...(digits.length >= 4 ? [`phone.ilike.%${digits.slice(-6)}%`] : [])].join(','))
      .limit(12),
    s.from('properties').select('id, name, address, postcode').or(`name.ilike.${like},address.ilike.${like},postcode.ilike.${like}`).limit(8),
    s.from('rooms').select('id, name, property_id, properties(name, address)').ilike('name', like).limit(8),
    s.from('maintenance_tickets').select('id, title, status, properties(name)').ilike('title', like).order('created_at', { ascending: false }).limit(8),
  ])
  const failed = [people, props, rooms, jobs].find(r => r.error)
  if (failed) return NextResponse.json({ error: failed.error!.message }, { status: 500 })

  const hits: SearchHit[] = [
    ...(people.data ?? []).map((p: any) => ({
      id: p.id, kind: 'person' as const,
      title: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.email,
      detail: [p.role, p.email].filter(Boolean).join(' · '), href: personHref(p.id, p.role),
    })),
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
  return NextResponse.json({ hits })
}
