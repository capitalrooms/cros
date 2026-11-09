// The website's enquiry forms (9 Nov 2026) — the ONLY thing the public website can send in. Locked down:
//   • only the known forms, only their known fields, each length-capped; everything escaped before it goes in an email
//   • a hidden field bots fill in, a minimum time on the page, and a per-address limit — tripping any looks like
//     success to the sender but sends nothing
//   • nothing is stored and nothing is uploaded: it becomes one email to the office, and that's all
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/sendEmail'

export const runtime = 'nodejs'
const TO = 'info@capitalrooms.co.uk'
const FORMS: Record<string, { title: string; fields: string[]; required: string[] }> = {
  contact: { title: 'Website enquiry', fields: ['name', 'email', 'phone', 'found', 'budget', 'move_in', 'message'], required: ['name', 'email', 'message'] },
  landlord: { title: 'Landlord enquiry', fields: ['name', 'email', 'phone', 'rooms', 'area', 'service', 'message'], required: ['name', 'email'] },
  valuation: { title: 'Valuation request', fields: ['name', 'email', 'phone', 'postcode', 'address', 'type', 'bedrooms', 'service', 'message'], required: ['name', 'email', 'phone', 'postcode'] },
  maintenance: { title: 'Maintenance quote request', fields: ['name', 'email', 'phone', 'postcode', 'job', 'message'], required: ['name', 'email', 'message'] },
  preferences: { title: 'Communication preferences update', fields: ['name', 'telephone', 'email', 'mobile', 'address', 'contact_by'], required: ['name', 'telephone', 'email', 'address'] },
}
const LABEL: Record<string, string> = { name: 'Name', email: 'Email', phone: 'Phone', found: 'How they found us', budget: 'Budget', move_in: 'Move-in date', message: 'Message', rooms: 'Rooms in property', area: 'Area', service: 'Service', postcode: 'Postcode', address: 'Address', type: 'Property type', bedrooms: 'Bedrooms', job: 'Job', telephone: 'Telephone', mobile: 'Mobile', contact_by: 'Contact by' }
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const EMAIL = /^[^@\s<>]{1,64}@[^@\s<>]{1,190}\.[a-z]{2,}$/i

// a few tries per address per hour (per server instance — the rest of the guards catch anything that slips past)
const seen = new Map<string, number[]>()
function tooMany(ip: string) {
  const now = Date.now(), recent = (seen.get(ip) ?? []).filter(t => now - t < 3_600_000)
  recent.push(now); seen.set(ip, recent)
  if (seen.size > 5000) seen.clear()
  return recent.length > 6
}

export async function POST(req: NextRequest) {
  const quiet = NextResponse.json({ ok: true })   // what a bot sees
  const raw = await req.text()
  if (raw.length > 20_000) return NextResponse.json({ error: 'That’s too long.' }, { status: 413 })
  let b: any
  try { b = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 400 }) }
  const form = FORMS[String(b?.kind)]
  if (!form) return NextResponse.json({ error: 'Unknown form.' }, { status: 400 })
  if (String(b.website ?? '').trim() || Number(b.ms) < 2500) return quiet
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (tooMany(ip)) return quiet

  const v: Record<string, string> = {}
  for (const f of form.fields) v[f] = String(b.values?.[f] ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, f === 'message' ? 3000 : 200)
  const missing = form.required.filter(f => !v[f])
  if (missing.length) return NextResponse.json({ error: `Please fill in: ${missing.map(f => LABEL[f]).join(', ')}.` }, { status: 400 })
  if (v.email && !EMAIL.test(v.email)) return NextResponse.json({ error: 'Please check the email address.' }, { status: 400 })
  // links in the message are the usual spam tell
  if ((v.message.match(/https?:\/\//g) ?? []).length > 2) return quiet

  const rows = form.fields.filter(f => v[f]).map(f => `<tr><td style="padding:6px 16px 6px 0;color:#5C6B62;vertical-align:top;white-space:nowrap">${LABEL[f]}</td><td style="padding:6px 0;white-space:pre-wrap">${esc(v[f])}</td></tr>`).join('')
  const html = `<p><strong>${esc(form.title)}</strong> from the website.</p><table style="border-collapse:collapse;font-size:15px">${rows}</table><p style="color:#5C6B62;font-size:13px">Reply to this email to answer ${esc(v.name)} directly.</p>`
  const r = await sendEmail([TO], `${form.title}: ${v.name.slice(0, 80)}`, html, { req, kind: 'website-enquiry', replyTo: v.email && EMAIL.test(v.email) ? v.email : undefined })
  if (!r.ok) return NextResponse.json({ error: 'That didn’t go through — please try again, or call us on 0207 112 9163.' }, { status: 502 })
  return NextResponse.json({ ok: true })
}
