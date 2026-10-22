// GET   /api/admin/landlords/[id]/correspondence — everything we've sent this landlord, newest first: statements,
//       letters and invoices, landlord updates, house documents, app messages; plus how they like to hear from us
//       and who's copied (migration 239)
// PATCH /api/admin/landlords/[id]/correspondence { contact_pref?, correspondence_cc? }
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PREFS = ['app_and_email', 'app_only', 'email_only']
type Item = { at: string; kind: string; title: string; to: string }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { id } = await params
  const s = createServiceClient()
  const { data: p } = await s.from('people').select('*').eq('id', id).maybeSingle()
  if (!p) return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
  const emails = [p.email, p.joint_email].filter(Boolean).map((e: string) => e.toLowerCase())

  const [st, docs, ups, notes, sends] = await Promise.all([
    s.from('landlord_statements').select('statement_reference, sent_at, sent_to').eq('landlord_id', id).not('sent_at', 'is', null).order('sent_at', { ascending: false }).limit(200),
    emails.length ? s.from('generated_documents').select('kind, number, title, recipient_email, emailed_to, emailed_at, created_at').is('deleted_at', null).or(emails.map(e => `recipient_email.ilike.${e}`).join(',')).order('created_at', { ascending: false }).limit(200) : Promise.resolve({ data: [] as any[] }),
    s.from('landlord_updates').select('subject, sent_to, sent_at, stage').eq('landlord_id', id).order('sent_at', { ascending: false }).limit(200),
    s.from('notifications').select('title, created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(100),
    s.from('house_document_sends').select('subject, recipients, sent_at').order('sent_at', { ascending: false }).limit(500),
  ])
  const items: Item[] = [
    ...((st.data ?? []) as any[]).map(x => ({ at: x.sent_at, kind: 'Statement', title: x.statement_reference, to: x.sent_to ?? '' })),
    ...((docs.data ?? []) as any[]).map(x => ({ at: x.emailed_at ?? x.created_at, kind: x.kind === 'invoice' ? 'Invoice' : x.kind === 'receipt' ? 'Receipt' : 'Letter', title: x.kind === 'letter' ? x.title : `${x.number}${x.title ? ` — ${x.title}` : ''}`, to: x.emailed_at ? (x.emailed_to ?? []).join(', ') : 'Not emailed (saved)' })),
    ...((ups.data ?? []) as any[]).map(x => ({ at: x.sent_at, kind: 'Landlord update', title: x.subject, to: Array.isArray(x.sent_to) ? x.sent_to.join(', ') : String(x.sent_to ?? '') })),
    ...((notes.data ?? []) as any[]).map(x => ({ at: x.created_at, kind: 'In the app', title: x.title, to: 'Landlord app' })),
    ...((sends.data ?? []) as any[]).filter(x => (x.recipients ?? []).some((r: any) => r.person_id === id || emails.includes(String(r.email ?? '').toLowerCase())))
      .map(x => ({ at: x.sent_at, kind: 'House documents', title: x.subject, to: (x.recipients ?? []).filter((r: any) => r.person_id === id || emails.includes(String(r.email ?? '').toLowerCase())).map((r: any) => r.email).join(', ') })),
  ].filter(x => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at)))

  return NextResponse.json({ contactPref: p.contact_pref ?? 'app_and_email', cc: Array.isArray(p.correspondence_cc) ? p.correspondence_cc : [], setupNeeded: !('contact_pref' in p), items })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if (b.contact_pref !== undefined) {
    if (!PREFS.includes(b.contact_pref)) return NextResponse.json({ error: 'Choose app and email, app only or email only.' }, { status: 400 })
    patch.contact_pref = b.contact_pref
  }
  if (b.correspondence_cc !== undefined) {
    const list = (Array.isArray(b.correspondence_cc) ? b.correspondence_cc : []).slice(0, 6)
      .map((c: any) => ({ name: String(c?.name ?? '').trim().slice(0, 80), email: String(c?.email ?? '').trim().toLowerCase().slice(0, 120), role: String(c?.role ?? '').trim().slice(0, 40) }))
    const bad = list.find((c: any) => !EMAIL.test(c.email))
    if (bad) return NextResponse.json({ error: `“${bad.email || 'blank'}” isn’t an email address.` }, { status: 400 })
    patch.correspondence_cc = list
  }
  const { error } = await createServiceClient().from('people').update(patch).eq('id', id).eq('role', 'landlord')
  if (error) return NextResponse.json({ error: /contact_pref|correspondence_cc/.test(error.message) ? 'Run migration 239 to switch this on.' : error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
