/**
 * POST /api/admin/document-generator/draft
 *
 * Turns rough notes ("tell Nigel our fees are going up to 12% from January…") into a formal letter
 * on the Capital Rooms letterhead, plus a short covering email. Used by /admin/document-generator.
 *
 * Body: {
 *   instructions: string                          what the letter should say, in the user's own words
 *   kind?: string                                 'letter' | 'notice' | 'fees' | 'other'
 *   recipient?: { name, address, role, email }    who it is to (from People, or typed)
 *   current?: FormalLetter, changes?: string      redraft an existing draft with the requested changes
 * }
 * → { letter: FormalLetter, coverEmail: string, missing: string[], signer: { name, jobTitle } }
 *
 * The signer is the signed-in staff member, so letters sign off as whoever wrote them.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireStaff } from '@/lib/portalAuth'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { signerFromProfile, type FormalLetter } from '@/lib/letters/formalLetter'
import { draftLetter } from '@/lib/letters/draftLetter'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const FAILED = {
  refusal: 'The assistant declined to write this letter. Try rewording the notes.',
  max_tokens: 'The letter came out too long — ask for a shorter letter.',
  unparsed: 'Could not read the draft — try again',
}

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured on server' }, { status: 500 })

  const b = await req.json().catch(() => ({}))
  const instructions = String(b.instructions ?? '').trim()
  if (!instructions) return NextResponse.json({ error: 'Say what the letter should cover' }, { status: 400 })
  if (instructions.length > 20000) return NextResponse.json({ error: 'The notes are too long — keep them under 20,000 characters' }, { status: 400 })

  const r = b.recipient ?? {}
  const current: FormalLetter | null = b.current && typeof b.current === 'object' ? b.current : null
  const [biz, signer] = await Promise.all([fetchPDFBizSettings(), signerFromProfile(caller.email)])

  try {
    const out = await draftLetter({
      instructions, kind: b.kind, current, changes: String(b.changes ?? '').trim(),
      recipient: { name: r.name, address: r.address, role: r.role },
      signer, company: biz.company_name,
    })
    if ('failed' in out) return NextResponse.json({ error: FAILED[out.failed] }, { status: 422 })
    const d = out.draft
    const letter: FormalLetter = {
      recipientName: current?.recipientName ?? String(r.name ?? ''),
      recipientAddress: current?.recipientAddress ?? String(r.address ?? ''),
      date: current?.date ?? new Date().toISOString().slice(0, 10),
      reference: current?.reference ?? '',
      subject: d.subject,
      salutation: d.salutation,
      body: d.body,
      closing: d.closing,
    }
    return NextResponse.json({ letter, coverEmail: d.coverEmail, missing: d.missing, signer: { name: signer.name, jobTitle: signer.jobTitle, directPhone: signer.directPhone, hasSignature: !!signer.signatureImg } })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'The assistant is busy — try again in a minute' }, { status: 429 })
    if (err instanceof Anthropic.APIError) {
      console.error('document-generator draft: API error', err.status, err.message)
      return NextResponse.json({ error: `The assistant could not draft the letter (${err.status ?? 'error'})` }, { status: 502 })
    }
    console.error('document-generator draft error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}
