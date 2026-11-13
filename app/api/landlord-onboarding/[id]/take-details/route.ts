// /api/landlord-onboarding/[id]/take-details (3 Nov 2026, Harry: "Mohammad may have added preferred details … I see
// no way of taking on these preferred contact details or bank details"). The landlord's preferred contact details and
// nominated bank account from their onboarding form, set against what their landlord record holds.
// GET → the comparison (bank numbers masked). POST { contact?: boolean, bank?: boolean } → the ticked ones go onto the
// landlord record: email/phone on the person, the account added as their default (never overwriting an old one).
// Works before they press submit too — it reads what they have saved so far.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { svc } from '@/lib/landlordOnboarding/store'
import { openFields, openRows, sealFields, BANK_FIELDS } from '@/lib/crypto/fieldCrypt'
import { logAudit } from '@/lib/auditLog'

export const dynamic = 'force-dynamic'

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const digits = (v: string) => v.replace(/\D/g, '')
const mask = (v: string) => (v ? `••••${digits(v).slice(-4)}` : '')

async function load(id: string) {
  const { data: row } = await svc().from('landlord_onboarding').select('id, stage, email, phone, landlord_people_id, form_data, updated_at').eq('id', id).maybeSingle()
  if (!row) return null
  const f = openFields(row.form_data ?? {}, BANK_FIELDS.landlord_onboarding_form) as Record<string, unknown>
  const theirs = {
    email: (t(f.contact_email) || t(row.email)).toLowerCase(), phone: t(f.contact_phone) || t(row.phone),
    bank: { account_name: t(f.account_holder), bank_name: t(f.bank_name), sort_code: digits(t(f.sort_code)), account_number: digits(t(f.account_number)), iban: t(f.iban).replace(/\s/g, '') },
  }
  const pid = row.landlord_people_id as string | null
  const { data: person } = pid ? await svc().from('people').select('id, email, phone, joint_salutation, joint_first_name, joint_last_name, joint_email, home_address, emergency_contact_name, emergency_contact_phone').eq('id', pid).maybeSingle() : { data: null }
  const { data: accs } = pid ? await svc().from('landlord_bank_accounts').select('*').eq('landlord_id', pid) : { data: [] }
  const accounts = openRows((accs ?? []) as any[], BANK_FIELDS.landlord_bank_accounts) as any[]
  const hasBank = !!(theirs.bank.account_number || theirs.bank.iban)
  const bankOnFile = hasBank && accounts.some(a => (theirs.bank.account_number && digits(String(a.account_number ?? '')) === theirs.bank.account_number && digits(String(a.sort_code ?? '')) === theirs.bank.sort_code) || (theirs.bank.iban && String(a.iban ?? '').replace(/\s/g, '') === theirs.bank.iban))
  // more of what they told us (13 Nov 2026, Harry: "Mohammad updated his contact details … no way to incorporate those
  // new emails or his preferred contact info into our comms"): the joint landlord, their home address, an emergency contact
  const p: any = person ?? {}
  const joined = (...xs: unknown[]) => xs.map(t).filter(Boolean).join(', ')
  const sections = [
    {
      key: 'joint', label: 'Joint landlord (gets our emails too)',
      theirs: f.joint === 'yes' || t(f.j_first_name) ? joined([t(f.j_salutation), t(f.j_first_name), t(f.j_last_name)].filter(Boolean).join(' '), t(f.j_contact_email).toLowerCase(), t(f.j_contact_phone)) : '',
      record: joined([t(p.joint_salutation), t(p.joint_first_name), t(p.joint_last_name)].filter(Boolean).join(' '), t(p.joint_email)),
      patch: { joint_salutation: t(f.j_salutation) || null, joint_first_name: t(f.j_first_name) || null, joint_last_name: t(f.j_last_name) || null, joint_email: t(f.j_contact_email).toLowerCase() || null },
      same: (t(f.j_contact_email).toLowerCase() || '') === t(p.joint_email).toLowerCase() && t(f.j_last_name).toLowerCase() === t(p.joint_last_name).toLowerCase(),
    },
    {
      key: 'address', label: 'Their home address (for letters)',
      theirs: joined(f.addr_line1, f.addr_line2, f.addr_town, f.addr_county, f.addr_postcode),
      record: t(p.home_address).replace(/\s*\n\s*/g, ', '),
      patch: { home_address: [f.addr_line1, f.addr_line2, f.addr_town, f.addr_county, f.addr_postcode].map(t).filter(Boolean).join('\n') || null },
      same: false,
    },
    {
      key: 'emergency', label: 'Emergency contact',
      theirs: joined(f.emergency_name, f.emergency_relation && `(${t(f.emergency_relation)})`, f.emergency_phone),
      record: joined(p.emergency_contact_name, p.emergency_contact_phone),
      patch: { emergency_contact_name: [t(f.emergency_name), t(f.emergency_relation) && `(${t(f.emergency_relation)})`].filter(Boolean).join(' ') || null, emergency_contact_phone: t(f.emergency_phone) || null },
      same: false,
    },
  ].map(x => ({ ...x, same: x.same || (!!x.record && x.theirs.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(x.record.toLowerCase().replace(/[^a-z0-9]/g, ''))) }))
  return { row, f, pid, person, accounts, theirs, hasBank, bankOnFile, sections }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const x = await load((await params).id)
  if (!x) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { theirs, person, accounts } = x
  const def = accounts.find(a => a.is_default) ?? accounts[0]
  return NextResponse.json({
    submitted: x.row.stage >= 3, landlordLinked: !!x.pid,
    contact: { theirs: { email: theirs.email, phone: theirs.phone }, record: { email: person?.email ?? '', phone: person?.phone ?? '' },
      differs: !!person && ((!!theirs.email && theirs.email !== String(person.email ?? '').toLowerCase()) || (!!theirs.phone && digits(theirs.phone) !== digits(String(person.phone ?? '')))) },
    bank: { theirs: x.hasBank ? { account_name: theirs.bank.account_name, bank_name: theirs.bank.bank_name, sort_code: theirs.bank.sort_code, account_number: mask(theirs.bank.account_number), iban: mask(theirs.bank.iban) } : null,
      record: def ? { account_name: def.account_name, bank_name: def.bank_name, account_number: mask(String(def.account_number ?? '')) } : null, onFile: x.bankOnFile },
    sections: x.sections.filter(sec => sec.theirs).map(sec => ({ key: sec.key, label: sec.label, theirs: sec.theirs, record: sec.record, differs: !sec.same })),
    formUpdatedAt: (x.row as any).updated_at ?? null,
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const x = await load((await params).id)
  if (!x) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!x.pid) return NextResponse.json({ error: 'This onboarding isn’t linked to a landlord yet — approve and create the landlord first.' }, { status: 400 })
  const done: string[] = []
  if (body.contact) {
    const patch: Record<string, string> = {}
    if (x.theirs.email) patch.email = x.theirs.email
    if (x.theirs.phone) patch.phone = x.theirs.phone
    if (Object.keys(patch).length) {
      const { error } = await svc().from('people').update(patch).eq('id', x.pid)
      if (error) return NextResponse.json({ error: `Couldn’t save the contact details: ${error.message}` }, { status: 500 })
      await logAudit({ userId: admin.personId, action: 'landlord_contact_from_onboarding', table: 'people', recordId: x.pid, details: JSON.stringify({ before: { email: x.person?.email, phone: x.person?.phone }, after: patch }) }).catch(() => null)
      done.push('contact details')
    }
  }
  // the other sections (joint landlord, home address, emergency contact) — only the ticked ones
  const take: string[] = Array.isArray(body.take) ? body.take.map(String) : []
  for (const sec of x.sections.filter(sec => take.includes(sec.key) && sec.theirs)) {
    const patch = Object.fromEntries(Object.entries(sec.patch).filter(([, v]) => v != null))
    if (!Object.keys(patch).length) continue
    const { error } = await svc().from('people').update(patch).eq('id', x.pid)
    if (error) return NextResponse.json({ error: `Couldn’t save the ${sec.label.toLowerCase()}: ${error.message}` }, { status: 500 })
    await logAudit({ userId: admin.personId, action: `landlord_${sec.key}_from_onboarding`, table: 'people', recordId: x.pid, details: JSON.stringify({ before: sec.record, after: patch }) }).catch(() => null)
    done.push(sec.key === 'joint' ? 'the joint landlord' : sec.key === 'address' ? 'their home address' : 'the emergency contact')
  }
  if (body.bank && x.hasBank && !x.bankOnFile) {
    const b = x.theirs.bank
    await svc().from('landlord_bank_accounts').update({ is_default: false }).eq('landlord_id', x.pid)
    const { error } = await svc().from('landlord_bank_accounts').insert(sealFields({ landlord_id: x.pid, account_label: 'Nominated (onboarding)', bank_name: b.bank_name || null, account_name: b.account_name || 'Landlord', sort_code: b.sort_code || null, account_number: b.account_number || null, iban: b.iban || null, is_default: true }, BANK_FIELDS.landlord_bank_accounts))
    if (error) return NextResponse.json({ error: `Couldn’t save the bank account: ${error.message}` }, { status: 500 })
    await logAudit({ userId: admin.personId, action: 'landlord_bank_from_onboarding', table: 'landlord_bank_accounts', recordId: x.pid, details: JSON.stringify({ account: mask(b.account_number || b.iban) }) }).catch(() => null)
    done.push('bank account')
  }
  return NextResponse.json({ ok: true, done })
}
