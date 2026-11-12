// POST /api/site/viewing-request — someone asks to view a room from its page on the website (12 Nov 2026, Harry).
// They choose up to 3 slots that suit them in the next week (lib/lettings/viewingSlots: Mon–Fri, 12:00–1:30pm or
// 5:00–6:30pm); it waits for lettings in viewing_requests (migration 279), lettings and the office are told, and the
// person gets an email saying we'll confirm a time. Public, so locked down like the enquiry forms: a hidden field bots
// fill in, a minimum time on the page, a per-address limit — tripping any looks like success but saves nothing.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/sendEmail'
import { messageHtml } from '@/lib/email/messageHtml'
import { insertNotifications } from '@/lib/serverNotify'
import { sendServerPush } from '@/lib/serverPush'
import { MAX_SLOTS, slotOk, slotLabel } from '@/lib/lettings/viewingSlots'
import { houseName } from '@/lib/lettings/letWording'

export const runtime = 'nodejs'
const EMAIL = /^[^@\s<>]{1,64}@[^@\s<>]{1,190}\.[a-z]{2,}$/i
const UUID = /^[0-9a-f-]{36}$/i
const seen = new Map<string, number[]>()
function tooMany(ip: string) {
  const now = Date.now(), recent = (seen.get(ip) ?? []).filter(t => now - t < 3_600_000)
  recent.push(now); seen.set(ip, recent)
  if (seen.size > 5000) seen.clear()
  return recent.length > 5
}
const clean = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, n)

export async function POST(req: NextRequest) {
  const quiet = NextResponse.json({ ok: true })
  const raw = await req.text()
  if (raw.length > 5000) return NextResponse.json({ error: 'That’s too long.' }, { status: 413 })
  let b: any
  try { b = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 400 }) }
  if (clean(b.website, 100) || Number(b.ms) < 2500) return quiet
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (tooMany(ip)) return quiet

  const name = clean(b.name, 120), email = clean(b.email, 200).toLowerCase(), phone = clean(b.phone, 30), message = clean(b.message, 1000)
  if (!name) return NextResponse.json({ error: 'Please add your name.' }, { status: 400 })
  if (!email && !phone) return NextResponse.json({ error: 'Please add an email address or mobile number so we can confirm.' }, { status: 400 })
  if (email && !EMAIL.test(email)) return NextResponse.json({ error: 'Please check the email address.' }, { status: 400 })
  const slots = (Array.isArray(b.slots) ? b.slots : []).slice(0, MAX_SLOTS).map((x: any) => ({ date: clean(x?.date, 10), time: clean(x?.time, 5) })).filter((x: any) => slotOk(x.date, x.time))
  if (!slots.length) return NextResponse.json({ error: 'Choose at least one time that suits you.' }, { status: 400 })
  if (!UUID.test(String(b.roomId ?? ''))) return NextResponse.json({ error: 'That room isn’t available.' }, { status: 400 })

  const s = createServiceClient()
  const { data: room } = await s.from('rooms').select('id, name, property_id, properties(name, address)').eq('id', b.roomId).maybeSingle() as { data: any }
  if (!room) return NextResponse.json({ error: 'That room isn’t available.' }, { status: 400 })
  const { data: row, error } = await s.from('viewing_requests').insert({ room_id: room.id, property_id: room.property_id, name, email: email || null, phone: phone || null, slots, message: message || null }).select('id').single()
  if (error) return NextResponse.json({ error: 'That didn’t go through — please call us on 0207 112 9163.' }, { status: 500 })

  const house = houseName(room.properties?.address || room.properties?.name) || 'the house'
  const times: string[] = slots.map((x: any) => slotLabel(x.date, x.time))
  // lettings and the office: an app notice (and phone notification) with the times
  const { data: staff } = await s.from('people').select('id').in('role', ['lettings', 'administrator'])
  const ids = ((staff ?? []) as any[]).map(p => p.id)
  if (ids.length) {
    const title = `Viewing request — ${house}`, body = `${name} would like to view ${house} (${room.name}): ${times.join(' · ')}`
    await insertNotifications(s, ids, { title, body, type: 'lettings', link: '/lettings?tab=leads' }, { propertyId: room.property_id, roomId: room.id }).catch(() => null)
    for (const id of ids) await sendServerPush({ personId: id, title, body, url: '/lettings?tab=leads', tag: `vreq-${row.id}` }).catch(() => null)
  }
  if (email) await sendEmail(email, `Your viewing request — ${house}`, messageHtml(`Hi ${name.split(' ')[0]},\n\nThanks for asking to view ${house}. You said these times suit you:\n\n${times.map(t => `• ${t}`).join('\n')}\n\nWe’ll confirm one of them shortly by text or email. If anything changes, just reply to this email.`), { req, kind: 'website-enquiry' }).catch(() => null)
  return NextResponse.json({ ok: true })
}
