// The reply signature as one picture (26 Oct 2026, Harry: "the footer sometimes starts breaking up and I can write in
// it or move parts of the words"). A signature made of text is part of the message: Gmail lets the cursor into it and
// other people's mail apps re-draw it when they quote it. A single image can't be split, edited or re-fonted.
// The picture is public (mail apps fetch it with no login), so its details travel in the link with a seal only the
// server can make — nobody can use it to put other words under our address. Server-only.
import crypto from 'crypto'
import type { SignaturePerson } from '@/lib/brand/signature'

const secret = () => `signature-card:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`
const seal = (data: string) => crypto.createHmac('sha256', secret()).update(data).digest('base64url').slice(0, 24)

/** The picture's address for these details (the live site, which every mail app can reach). */
export function signatureCardUrl(p: SignaturePerson, base: string): string {
  const data = Buffer.from(JSON.stringify({ n: p.name.trim(), t: p.title.trim(), ph: p.phone.trim(), e: p.email.trim() })).toString('base64url')
  return `${base.replace(/\/$/, '')}/api/brand/signature-card?d=${data}&s=${seal(data)}`
}

/** The details in a picture address, if its seal is good. */
export function readSignatureCard(d: string | null, s: string | null): SignaturePerson | null {
  if (!d || !s || d.length > 600) return null
  const expect = seal(d)
  if (s.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expect))) return null
  try {
    const j = JSON.parse(Buffer.from(d, 'base64url').toString('utf8'))
    const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n)
    return { name: clip(j.n, 48), title: clip(j.t, 60), phone: clip(j.ph, 30), email: clip(j.e, 80) }
  } catch { return null }
}
