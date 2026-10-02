/**
 * POST /api/admin/document-generator/pdf
 *
 * Renders a Document Generator letter on the Capital Rooms letterhead, signed by the signed-in staff member.
 * Body: { letter: FormalLetter, signer?: { name, jobTitle, directPhone, includeSignature }, inline?: true }
 * inline → shown in the page's preview; otherwise downloaded.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { renderFormalLetter, letterFileName } from '@/lib/letters/formalLetter'
import { letterFromBody, signerForRequest } from '@/lib/letters/letterFromRequest'
import { contentDisposition } from '@/lib/contentDisposition'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const { letter, error } = letterFromBody(b.letter)
  if (!letter) return NextResponse.json({ error }, { status: 400 })
  try {
    const pdf = await renderFormalLetter(letter, await signerForRequest(caller.email, b.signer))
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(letterFileName(letter), b.inline ? 'inline' : 'attachment'),
      },
    })
  } catch (err) {
    console.error('document-generator pdf error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not create the PDF' }, { status: 500 })
  }
}
