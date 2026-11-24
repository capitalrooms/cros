// Phone numbers for a person (24 Nov 2026). A new number is texted a code; once confirmed it is the preferred number,
// and that is the one the office shares or calls. Server only.
import { createHash, randomInt } from 'crypto'
import { createServiceClient } from '@/lib/supabase'
import { sendSms, toE164 } from '@/lib/sms'

const svc = () => createServiceClient() as any
const hash = (id: string, code: string) => createHash('sha256').update(`${id}:${code}`).digest('hex')

/** The number to use for a person: their confirmed preferred number, else the one on their record. */
export async function preferredPhone(personId: string): Promise<string | null> {
  const s = svc()
  const { data } = await s.from('person_phones').select('phone').eq('person_id', personId).eq('preferred', true).not('confirmed_at', 'is', null).maybeSingle()
  if (data?.phone) return data.phone
  const { data: p } = await s.from('people').select('phone').eq('id', personId).maybeSingle()
  return toE164(p?.phone) ?? null
}

/** Add a number and text it a code. Returns the id to confirm against. */
export async function addPhone(personId: string, raw: string) {
  const e164 = toE164(raw)
  if (!e164) return { error: 'That phone number does not look right. It should be a UK mobile, for example 07700 900000.', status: 400 }
  const s = svc()
  const code = String(randomInt(100000, 999999))
  const { data: existing } = await s.from('person_phones').select('id').eq('person_id', personId).eq('phone', e164).maybeSingle()
  const id = existing?.id
  const row = { person_id: personId, phone: e164, code_hash: null as string | null, code_expires: new Date(Date.now() + 10 * 60000).toISOString(), confirmed_at: null as string | null }
  let savedId = id
  if (id) {
    await s.from('person_phones').update({ code_expires: row.code_expires, confirmed_at: null }).eq('id', id)
  } else {
    const { data, error } = await s.from('person_phones').insert({ ...row, preferred: false }).select('id').single()
    if (error) return { error: error.message, status: 500 }
    savedId = data.id
  }
  await s.from('person_phones').update({ code_hash: hash(savedId, code) }).eq('id', savedId)
  const sent = await sendSms(e164, `Your Capital Rooms code is ${code}. It expires in 10 minutes.`, { asName: true })
  if (!sent.ok) return { error: 'We could not text that number just now. Try again in a minute.', status: 502 }
  return { ok: true, id: savedId, phone: e164, status: 200 }
}

/** Check the code. On success the number is confirmed and becomes the preferred number. */
export async function confirmPhone(personId: string, raw: string, code: string) {
  const e164 = toE164(raw)
  if (!e164) return { error: 'That phone number does not look right.', status: 400 }
  const s = svc()
  const { data: row } = await s.from('person_phones').select('*').eq('person_id', personId).eq('phone', e164).maybeSingle()
  if (!row) return { error: 'Add the number first.', status: 404 }
  if (!row.code_hash || !row.code_expires || new Date(row.code_expires) < new Date()) return { error: 'That code has expired. Ask for a new one.', status: 410 }
  if (hash(row.id, String(code).trim()) !== row.code_hash) return { error: 'That code is not right. Check the text and try again.', status: 400 }
  await s.from('person_phones').update({ preferred: false }).eq('person_id', personId).eq('preferred', true)
  await s.from('person_phones').update({ preferred: true, confirmed_at: new Date().toISOString(), code_hash: null, code_expires: null }).eq('id', row.id)
  await s.from('people').update({ phone: e164 }).eq('id', personId)
  return { ok: true, phone: e164, status: 200 }
}
