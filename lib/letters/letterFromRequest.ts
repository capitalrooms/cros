// Shared by the Document Generator's PDF and send routes: validates the posted letter and works out who signs it.
import { signerFromProfile, type FormalLetter, type LetterSigner } from '@/lib/letters/formalLetter'

const str = (v: unknown, max = 20000) => (typeof v === 'string' ? v.slice(0, max) : '')

export function letterFromBody(v: unknown): { letter?: FormalLetter; error?: string } {
  const l = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const letter: FormalLetter = {
    recipientName: str(l.recipientName, 300),
    recipientAddress: str(l.recipientAddress, 1000),
    date: str(l.date, 10) || new Date().toISOString().slice(0, 10),
    reference: str(l.reference, 100),
    subject: str(l.subject, 300),
    salutation: str(l.salutation, 200),
    body: str(l.body),
    closing: str(l.closing, 60) || 'Yours sincerely',
  }
  if (!letter.body.trim()) return { error: 'The letter has no body text' }
  return { letter }
}

/** The signed-in person signs; the page may adjust the name, title and phone shown, never the signature image. */
export async function signerForRequest(email: string, v: unknown): Promise<LetterSigner & { signatureImg: Buffer | null }> {
  const s = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const me = await signerFromProfile(email)
  return {
    name: str(s.name, 120).trim() || me.name,
    jobTitle: typeof s.jobTitle === 'string' ? s.jobTitle.slice(0, 120).trim() || null : me.jobTitle,
    directPhone: typeof s.directPhone === 'string' ? s.directPhone.slice(0, 40).trim() || null : me.directPhone,
    includeSignature: s.includeSignature !== false,
    signatureImg: me.signatureImg,
  }
}
