// GET    /api/admin/letter-templates            — your saved letter templates (migration 238), newest first
// POST   /api/admin/letter-templates { letter } — AI names it and blanks the one-off details, then saves it
// DELETE /api/admin/letter-templates?id=…       — hides it from the list (kept on record)
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireStaff } from '@/lib/portalAuth'
import { templateFromLetter } from '@/lib/letters/templateFromLetter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const missing = (e: any) => /does not exist|schema cache/i.test(String(e?.message ?? ''))

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { data, error } = await createServiceClient().from('letter_templates').select('id, name, audience, subject, body, closing, created_at').is('deleted_at', null).order('created_at', { ascending: false })
  if (error) return missing(error) ? NextResponse.json({ templates: [], setupNeeded: true }) : NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

export async function POST(req: NextRequest) {
  const me = await requireStaff(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const subject = String(b.letter?.subject ?? '').slice(0, 300), body = String(b.letter?.body ?? '').slice(0, 20000)
  const closing = String(b.letter?.closing ?? 'Kind regards').slice(0, 60)
  if (!body.trim()) return NextResponse.json({ error: 'There’s no letter to save.' }, { status: 400 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI isn’t set up (no ANTHROPIC_API_KEY).' }, { status: 500 })
  try {
    const out = await templateFromLetter({ subject, body })
    if ('failed' in out) return NextResponse.json({ error: 'The AI couldn’t turn this into a template — try again.' }, { status: 502 })
    const t = out.template
    const { data, error } = await createServiceClient().from('letter_templates')
      .insert({ name: t.name.slice(0, 120), audience: t.audience, subject: t.subject, body: t.body, closing, source_document_id: /^[0-9a-f-]{36}$/i.test(String(b.documentId ?? '')) ? b.documentId : null, created_by: me.personId })
      .select('id, name, audience, subject, body, closing, created_at').single()
    if (error) return NextResponse.json({ error: missing(error) ? 'Run migration 238 to save letter templates.' : error.message }, { status: 500 })
    return NextResponse.json({ template: data })
  } catch (e: any) {
    return NextResponse.json({ error: `Saving the template failed: ${e?.message ?? 'unknown error'}` }, { status: 502 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') ?? ''
  const { error } = await createServiceClient().from('letter_templates').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
