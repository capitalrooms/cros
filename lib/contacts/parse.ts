// Pick people's emails and mobile numbers out of anything pasted — an email thread, a signature, a WhatsApp list
// (17 Oct 2026: lettings need to tell people at a house that isn't on CROS, or whose tenants aren't recorded).
// "Jane Smith <jane@x.com>", "jane@x.com", "07700 900123", "+44 7700 900123" — names are picked up when they sit
// next to the address/number on the same line. Duplicates are dropped. UK numbers only for texts.
export interface PastedContact { name: string | null; email: string | null; phone: string | null }

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const PHONE = /(?:\+44\s?\(?0?\)?\s?|0)7\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g
const toE164 = (raw: string) => { const d = raw.replace(/[^\d+]/g, ''); return d.startsWith('+44') ? d.replace(/^\+440?/, '+44') : d.startsWith('0') ? `+44${d.slice(1)}` : d }
const tidyName = (s: string) => {
  const t = s.replace(/["'<>()[\]:;|,–—-]+/g, ' ').replace(/\b(mob(ile)?|tel|phone|email|e-mail|m|t|e)\b\.?/gi, ' ').replace(/\s+/g, ' ').trim()
  return t && t.length <= 60 && /^[A-Za-z][A-Za-z .'-]+$/.test(t) && t.split(' ').length <= 5 ? t : null
}

export function parseContacts(text: string): PastedContact[] {
  const out: PastedContact[] = []
  const seenE = new Set<string>(), seenP = new Set<string>()
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const emails = [...line.matchAll(EMAIL)].map(m => m[0].toLowerCase())
    const phones = [...line.matchAll(PHONE)].map(m => toE164(m[0]))
    if (!emails.length && !phones.length) continue
    const rest = tidyName(line.replace(EMAIL, ' ').replace(PHONE, ' '))
    const n = Math.max(emails.length, phones.length)
    for (let i = 0; i < n; i++) {
      const email = emails[i] && !seenE.has(emails[i]) ? emails[i] : null
      const phone = phones[i] && !seenP.has(phones[i]) ? phones[i] : null
      if (!email && !phone) continue
      if (email) seenE.add(email)
      if (phone) seenP.add(phone)
      out.push({ name: n === 1 ? rest : null, email, phone })
    }
  }
  return out.slice(0, 50)
}
