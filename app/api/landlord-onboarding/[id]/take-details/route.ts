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
  const { data: row } = await svc().from('landlord_onboarding').select('id, stage, email, phone, landlord_people_id, form_data').eq('id', id).maybeSingle()
  if (!row) return null
  const f = openFields(row.form_data ?? {}, BANK_FIELDS.landlord_onboarding_form) as Record<string, unknown>
  const theirs = {
    email: (t(f.contact_email) || t(row.email)).toLowerCase(), phone: t(f.contact_phone) || t(row.phone),
    bank: { account_name: t(f.account_holder), bank_name: t(f.bank_name), sort_code: digits(t(f.sort_code)), account_number: digits(t(f.account_number)), iban: t(f.iban).replace(/\s/g, '') },
  }
  const pid = row.landlord_people_id as string | null
  const { data: person } = pid ? await svc().from('people').select('id, email, phone').eq('id', pid).maybeSingle() : { data: null }
  const { data: accs } = pid ? await svc().from('landlord_bank_accounts').select('*').eq('landlord_id', pid) : { data: [] }
  const accounts = openRows((accs ?? []) as any[], BANK_FIELDS.landlord_bank_accounts) as any[]
  const hasBank = !!(theirs.bank.account_number || theirs.bank.iban)
  const bankOnFile = hasBank && accounts.some(a => (theirs.bank.account_number && digits(String(a.account_number ?? '')) === theirs.bank.account_number && digits(String(a.sort_code ?? '')) === theirs.bank.sort_code) || (theirs.bank.iban && String(a.iban ?? '').replace(/\s/g, '') === theirs.bank.iban))
  return { row, f, pid, person, accounts, theirs, hasBank, bankOnFile }
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
