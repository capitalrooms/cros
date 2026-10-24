// Everything the room page shows (option D, built 24 Oct 2026): the room, its house and the other rooms, the current
// tenancy (from the letting file), the incoming tenancy and applicants, expired tenancies and voids, rent, repairs and
// spend, safety, one timeline of messages and activity, and "Needs you" — worked out from those records, most urgent
// first, each line gone once it's done. Wording follows Harry's rules: Current tenancy / Expired tenancies, full dates,
// full names with titles.
import type { SupabaseClient } from '@supabase/supabase-js'
import { stageOf } from '@/lib/lettings/lettingFile'
import { tenantAccount } from '@/lib/finance/tenantAccount'
import { ledgerStart } from '@/lib/clientLedger'
import { resolveFee, describeFee } from '@/lib/fees/managementFee'
import { PROPERTY_CERTIFICATES } from '@/lib/propertyCertificates'
import { oneWeekRent } from '@/lib/tenancy/deposit'
import { applyMoveInRent } from '@/lib/lettings/moveInRent'
import { fullDatesIn } from '@/lib/fullDates'

const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const r2 = (n: number) => Math.round(n * 100) / 100
const DAY = 86_400_000
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY)
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const addMonths = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10) }
/** "8 August 2024" — always in full */
export const fullDate = (iso: string | null | undefined) => iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pname = (p: any) => p ? ([p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.company || p.email || '') : ''
const roomNo = (name: string) => Number(String(name).match(/(\d+)/)?.[1] ?? 999)
const firstLine = (v: string | null | undefined) => String(v ?? '').split('\n')[0].trim()
const dailyRent = (monthly: number) => r2(monthly * 12 / 365)
const fullDates = (t: string) => fullDatesIn(t)

export type NeedLevel = 'urgent' | 'week' | 'tidy'
export interface Need { key: string; level: NeedLevel; category: string; title: string; detail: string; due: string; href?: string; op?: 'apply_move_in_rent'; opTenancyId?: string; action: string }
export interface TimelineItem { at: string; kind: 'email' | 'sms' | 'app' | 'event' | 'note' | 'money' | 'repair' | 'viewing' | 'offer' | 'feedback'; who: string; group: 'current' | 'expired' | 'applicant' | 'office' | 'room'; title: string; detail: string; failed?: boolean; href?: string }

export async function loadRoomOverview(s: SupabaseClient, roomId: string) {
  const today = todayIso()
  // the room with its house in one read (24 Oct 2026, speed)
  const { data: roomRow } = await s.from('rooms').select('*, property:properties(*)').eq('id', roomId).maybeSingle()
  if (!roomRow) return { error: 'Room not found' as const }
  const { property: prop, ...room } = roomRow as any
  if (!prop) return { error: 'Property not found' as const }

  const [houseRoomsQ, houseTenQ, roomTenQ, landlordQ, chargesQ, ticketsQ, purchasesQ, photosQ, viewingsQ, applicantsQ, offersQ, holdsQ, notesQ, checksQ, takeover] = await Promise.all([
    s.from('rooms').select('id, name, current_asking_rent, status').eq('property_id', prop.id),
    s.from('tenancies').select('id, room_id, start_date, end_date, notice_received_date, rent_amount, let_cancelled_at, people!person_id(salutation, first_name, last_name, full_name)').eq('property_id', prop.id).is('let_cancelled_at', null),
    s.from('tenancies').select('*, people!person_id(id, salutation, first_name, last_name, full_name, email, phone, occupation, right_to_rent_until), co:people!co_tenant_id(id, salutation, first_name, last_name, full_name, email, phone)').eq('room_id', roomId).is('let_cancelled_at', null).order('start_date'),
    prop.landlord_id ? s.from('people').select('id, salutation, first_name, last_name, full_name, company').eq('id', prop.landlord_id).maybeSingle() : Promise.resolve({ data: null }),
    s.from('rent_charges').select('id, charge_month, amount_due, amount_received, status, received_date, voided, tenancy_id, amount_due_note').eq('room_id', roomId).eq('voided', false).order('charge_month', { ascending: false }).limit(36),
    s.from('maintenance_tickets').select('id, title, status, priority, created_at, booked_date, completed_at, final_price, quote_amount').eq('room_id', roomId).order('created_at', { ascending: false }).limit(50),
    s.from('purchases').select('id, name, category, cost, purchased_date').eq('room_id', roomId).order('purchased_date', { ascending: false }),
    s.from('property_photos').select('id, file_url, file_path, caption, is_featured, display_order').eq('room_id', roomId).order('display_order', { ascending: true }),
    s.from('viewings').select('id, viewing_date, viewing_slot, visitor_name, visitor_email, viewing_status, feedback, created_at').eq('room_id', roomId).order('viewing_date', { ascending: false }).limit(30),
    s.from('applicants').select('id, salutation, first_name, last_name, full_name, email, phone, pipeline_stage, created_at, archived_at, offer_id').eq('room_id', roomId).is('archived_at', null).order('created_at', { ascending: false }).limit(30),
    s.from('offers').select('id, applicant_id, applicant_name, applicant_email, advertised_rent, status, sent_at').eq('room_id', roomId).order('sent_at', { ascending: false }).limit(30),
    s.from('holding_deposits').select('id, hold_no, amount, received_on, status, outcome_on, tenancy_id, applicant_id').eq('room_id', roomId),
    s.from('room_notes').select('id, content, note_type, created_by, created_at').eq('room_id', roomId).order('created_at', { ascending: false }).limit(50),
    s.from('tenant_self_checks').select('id, check_type, request_sent_at, response_received_at, tenant_response, issue_type').eq('room_id', roomId).order('created_at', { ascending: false }).limit(12),
    ledgerStart(s).catch(() => '2026-11-01'),
  ])

  const tenancies = ((roomTenQ as any).data ?? []) as any[]
  const current = tenancies.find(t => t.start_date <= today && (!t.end_date || t.end_date >= today)) ?? null
  const incoming = tenancies.find(t => t.start_date > today) ?? null
  const expired = tenancies.filter(t => t.end_date && t.end_date < today).sort((a, b) => b.end_date.localeCompare(a.end_date))
  // the letting-file steps, worked out from the tenancy itself (the full letting file loader took 1.4 seconds)
  const holds = ((holdsQ as any).data ?? []) as any[]
  const holdFor = (t: any) => holds.find(h => h.tenancy_id === t.id && (h.status === 'held' || h.status === 'applied')) ?? holds.find(h => h.tenancy_id === t.id) ?? null
  const stepsFor = (t: any) => {
    const h = holdFor(t)
    return [
      { id: 'holding', label: 'Holding deposit', done: !!h, date: h?.received_on ?? null, sub: h ? h.hold_no : 'Not recorded' },
      { id: 'referencing', label: 'Referencing', done: !!t.referencing_passed_at, date: t.referencing_passed_at ?? t.referencing_sent_at ?? null, sub: t.referencing_passed_at ? 'Passed' : t.referencing_sent_at ? 'With Homeppl' : 'Homeppl' },
      { id: 'right_to_rent', label: 'Right to Rent', done: !!t.right_to_rent_checked_at, date: t.right_to_rent_checked_at ?? null, sub: t.right_to_rent_checked_at ? 'Checked' : `Before ${fullDate(t.start_date)}` },
      // the agreement is due within 15 days of the holding deposit (Tenant Fees Act), unless agreed otherwise
      { id: 'agreement', label: 'Agreement', done: !!t.agreement_signed_at, date: t.agreement_signed_at ?? t.agreement_sent_at ?? null, sub: t.agreement_signed_at ? 'Signed' : `${t.agreement_sent_at ? 'Sent for signing' : 'Not sent'}${h?.received_on ? ` · due by ${fullDate(addDays(h.received_on, 15))}${addDays(h.received_on, 15) < todayIso() ? ' (passed)' : ''}` : ''}` },
      { id: 'monies', label: 'Move-in monies', done: !!t.move_in_monies_received_at, date: t.move_in_monies_received_at ?? null, sub: t.move_in_monies_received_at ? 'Received' : 'Due by move-in' },
      { id: 'deposit', label: 'Deposit protected', done: !!t.deposit_protected_at || !!t.deposit_protection_assumed, date: t.deposit_protected_at ?? null, sub: t.deposit_protected_at ? (t.deposit_scheme || 'Protected') : 'Within 30 days' },
      { id: 'keys', label: 'Keys & check-in', done: !!t.keys_handed_at, date: t.keys_handed_at ?? null, sub: t.keys_handed_at ? 'Handed over' : 'Inventory, keys' },
    ]
  }
  const file = current ? {
    tenant: { id: current.people?.id ?? current.person_id, name: pname(current.people), email: current.people?.email ?? null, phone: current.people?.phone ?? null, occupation: current.people?.occupation ?? null, rightToRentUntil: current.people?.right_to_rent_until ?? null },
    jointTenant: current.co ? { id: current.co.id, name: pname(current.co), email: current.co.email ?? null, phone: current.co.phone ?? null } : null,
    liveHold: holdFor(current), steps: stepsFor(current),
  } : null

  // ── the house strip: every room, who's in it, what's next ───────────────────────────────────────────────────────
  const houseTen = ((houseTenQ as any).data ?? []) as any[]
  const strip = (((houseRoomsQ as any).data ?? []) as any[]).map(r => {
    const ts = houseTen.filter(t => t.room_id === r.id)
    const cur = ts.find(t => t.start_date <= today && (!t.end_date || t.end_date >= today))
    const next = ts.filter(t => t.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    const state = cur ? (cur.end_date || cur.notice_received_date ? (next ? 'changeover' : 'notice') : 'let') : next ? 'let_agreed' : 'void'
    const line = cur ? (cur.end_date ? `ends ${fullDate(cur.end_date)}${next ? ' · next let agreed' : ''}` : `from ${fullDate(cur.start_date)}`)
      : next ? `from ${fullDate(next.start_date)}` : 'void'
    return { id: r.id, name: r.name, rent: Number(cur?.rent_amount ?? next?.rent_amount ?? r.current_asking_rent) || null, tenant: pname((cur ?? next)?.people) || null, state, line }
  }).sort((a, b) => roomNo(a.name) - roomNo(b.name) || a.name.localeCompare(b.name))

  // ── voids and occupancy since the first tenancy ────────────────────────────────────────────────────────────────
  const voids: { from: string; to: string | null; days: number; lost: number }[] = []
  const ordered = [...tenancies].sort((a, b) => a.start_date.localeCompare(b.start_date))
  for (let i = 0; i < ordered.length; i++) {
    const t = ordered[i], next = ordered[i + 1]
    if (!t.end_date) continue
    const gapFrom = addDays(t.end_date, 1)
    const gapTo = next ? addDays(next.start_date, -1) : null
    if (next && gapTo! < gapFrom) continue
    if (!next && gapFrom > today) continue
    const to = gapTo ?? today
    const n = days(gapFrom, to) + 1
    if (n > 0) voids.push({ from: gapFrom, to: gapTo, days: n, lost: r2(n * dailyRent(Number(t.rent_amount) || Number(room.current_asking_rent) || 0)) })
  }
  const since = ordered[0]?.start_date ?? null
  const spanDays = since ? days(since, today) + 1 : 0
  const voidDays = voids.reduce((n, v) => n + v.days, 0)
  const occupancy = since && spanDays > 0 ? { since, pct: Math.round(((spanDays - voidDays) / spanDays) * 1000) / 10, voidDays } : null

  // ── rent rows (newest first) ────────────────────────────────────────────────────────────────────────────────────
  const tName = new Map(tenancies.map(t => [t.id, pname(t.people)]))
  const whoseMonth = (month: string) => tenancies.find(t => t.start_date.slice(0, 7) <= month && (!t.end_date || t.end_date.slice(0, 7) >= month))
  const rent = (((chargesQ as any).data ?? []) as any[]).map(c => {
    const month = String(c.charge_month).slice(0, 7)
    const t = c.tenancy_id ? tenancies.find(x => x.id === c.tenancy_id) : whoseMonth(month)
    const monthStart = `${month}-01`
    const monthEnd = addDays(addMonths(monthStart, 1), -1)
    const from = t && t.start_date > monthStart ? t.start_date : monthStart
    const to = t?.end_date && t.end_date < monthEnd ? t.end_date : monthEnd
    const dueDay = Math.min(Math.max(Number(t?.rent_due_day) || 1, 1), 28)
    const dueOn = t && t.start_date > `${month}-${String(dueDay).padStart(2, '0')}` ? t.start_date : `${month}-${String(dueDay).padStart(2, '0')}`
    const due = r2(Number(c.amount_due)), received = r2(Number(c.amount_received || 0))
    const beforeCros = monthStart < takeover
    const state = c.status === 'paid' || received >= due - 0.004 ? 'paid' : received > 0 ? 'part' : dueOn < today ? (beforeCros ? 'statement' : 'overdue') : 'due'
    return { id: c.id, month, from, to, tenant: t ? (tName.get(t.id) || pname(t.people)) : '', tenancyId: t?.id ?? null, dueOn, due, received, state, note: c.amount_due_note ?? null, beforeCros }
  })

  // ── fee split ───────────────────────────────────────────────────────────────────────────────────────────────────
  const fee = current ? resolveFee(current, prop) : resolveFee({} as any, prop)
  const rentNow = Number(current?.rent_amount ?? incoming?.rent_amount ?? room.current_asking_rent) || null
  const feeNow = rentNow && fee.type !== 'fixed' && fee.pct != null ? r2(rentNow * fee.pct / 100) : fee.type === 'fixed' ? fee.fixed : null

  // ── certificates ────────────────────────────────────────────────────────────────────────────────────────────────
  const certs = PROPERTY_CERTIFICATES.map(([col, label]) => ({ label, expiry: (prop as any)[col] ?? null }))
    .filter(c => c.expiry).sort((a, b) => a.expiry.localeCompare(b.expiry))
  if (prop.epc_rating) { const e = certs.find(c => c.label === 'EPC'); if (e) (e as any).label = `EPC (${prop.epc_rating})` }

  // ── applicants and offers for this room (live ones) ─────────────────────────────────────────────────────────────
  const offers = ((offersQ as any).data ?? []) as any[]
  const applicants = (((applicantsQ as any).data ?? []) as any[]).filter(a => a.pipeline_stage !== 'converted' && a.pipeline_stage !== 'withdrawn' && a.pipeline_stage !== 'declined')
    .map(a => {
      const o = offers.find(x => x.applicant_id === a.id || x.id === a.offer_id)
      return { id: a.id, name: pname(a), hasTitle: !!a.salutation, stage: a.pipeline_stage as string, applied: String(a.created_at).slice(0, 10), offerSentAt: o?.sent_at ? String(o.sent_at).slice(0, 10) : null, offerRent: o?.advertised_rent != null ? Number(o.advertised_rent) : null, offerStatus: o?.status ?? null }
    })

  // ── expired tenancies, with their deposits ──────────────────────────────────────────────────────────────────────
  const expIds = expired.map(t => t.id)
  const { data: returns } = expIds.length ? await s.from('deposit_returns').select('tenancy_id, status, returned_on, to_tenant, to_landlord').in('tenancy_id', expIds) : { data: [] as any[] }
  const expiredRows = expired.map(t => {
    const ret = ((returns ?? []) as any[]).find(r => r.tenancy_id === t.id) ?? null
    const n = days(t.start_date, t.end_date) + 1
    return {
      id: t.id, tenant: pname(t.people), start: t.start_date, end: t.end_date, days: n, notice: t.notice_received_date ?? null,
      rent: Number(t.rent_amount) || null, deposit: Number(t.deposit_amount) || 0, scheme: t.deposit_scheme ?? null, protectedAt: t.deposit_protected_at ?? null,
      depositReturn: ret ? { status: ret.status, returnedOn: ret.returned_on, toTenant: ret.to_tenant, toLandlord: ret.to_landlord } : null,
      daysSinceEnd: days(t.end_date, today),
    }
  })

  // ── timeline ────────────────────────────────────────────────────────────────────────────────────────────────────
  const timeline: TimelineItem[] = []
  const groupOf = (tenancyId: string) => tenancyId === current?.id || tenancyId === incoming?.id ? 'current' as const : 'expired' as const
  const tIds = tenancies.map(t => t.id)
  const [eventsQ, notifQ, feedbackQ, account] = await Promise.all([
    tIds.length ? s.from('tenancy_events').select('tenancy_id, kind, note, at, by_email').in('tenancy_id', tIds).order('at', { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
    s.from('notifications').select('user_id, title, body, created_at').in('user_id', tenancies.map(t => t.person_id).filter(Boolean)).order('created_at', { ascending: false }).limit(60),
    tIds.length ? s.from('tenant_feedback').select('tenancy_id, created_at, comments').in('tenancy_id', tIds) : Promise.resolve({ data: [] }),
    current ? tenantAccount(s, current.id).catch(() => null) : Promise.resolve(null),
  ])
  for (const e of ((eventsQ as any).data ?? []) as any[]) {
    const kind = String(e.kind)
    const note = fullDates(String(e.note ?? kind))
    timeline.push({ at: e.at, kind: /holding|monies|move_in_rent|payment/.test(kind) ? 'money' : 'event', who: tName.get(e.tenancy_id) ?? '', group: groupOf(e.tenancy_id), title: note.split(' — ')[0], detail: [tName.get(e.tenancy_id), note.split(' — ').slice(1).join(' — '), e.by_email ? `by ${e.by_email}` : ''].filter(Boolean).join(' · '), href: `/admin/lettings/${e.tenancy_id}?tab=activity` })
  }
  const personTenancy = new Map(tenancies.map(t => [t.person_id, t]))
  for (const n of ((notifQ as any).data ?? []) as any[]) {
    const t = personTenancy.get(n.user_id)
    timeline.push({ at: n.created_at, kind: 'app', who: t ? pname(t.people) : '', group: t ? groupOf(t.id) : 'room', title: `App message · ${n.title}`, detail: [t ? pname(t.people) : '', String(n.body ?? '').slice(0, 160)].filter(Boolean).join(' · ') })
  }
  for (const f of ((feedbackQ as any).data ?? []) as any[]) timeline.push({ at: f.created_at, kind: 'feedback', who: tName.get(f.tenancy_id) ?? '', group: groupOf(f.tenancy_id), title: 'Feedback received', detail: [tName.get(f.tenancy_id), String(f.comments ?? '').slice(0, 160)].filter(Boolean).join(' · '), href: '/admin/feedback' })
  for (const o of offers) if (o.sent_at) timeline.push({ at: o.sent_at, kind: 'offer', who: o.applicant_name ?? '', group: 'applicant', title: `Offer sent to applicant ${o.applicant_name ?? ''}`.trim(), detail: [o.advertised_rent != null ? `${gbp(Number(o.advertised_rent))} per month` : '', o.status ? `status: ${String(o.status).replace(/_/g, ' ')}` : ''].filter(Boolean).join(' · ') })
  for (const h of ((holdsQ as any).data ?? []) as any[]) timeline.push({ at: `${h.received_on}T12:00:00Z`, kind: 'money', who: '', group: h.tenancy_id ? groupOf(h.tenancy_id) : 'applicant', title: `Holding deposit received · ${gbp(Number(h.amount))}`, detail: [h.hold_no, h.status].filter(Boolean).join(' · ') })
  for (const v of ((viewingsQ as any).data ?? []) as any[]) timeline.push({ at: `${v.viewing_date}T${String(v.viewing_slot || '12:00').slice(0, 5)}:00`, kind: 'viewing', who: v.visitor_name ?? '', group: 'applicant', title: `Viewing · ${v.visitor_name ?? 'visitor'}`, detail: [v.viewing_status, v.feedback].filter(Boolean).join(' · ') })
  for (const n of ((notesQ as any).data ?? []) as any[]) timeline.push({ at: n.created_at, kind: 'note', who: n.created_by ?? '', group: 'office', title: 'Office note', detail: String(n.content ?? '').slice(0, 300) })
  for (const m of ((ticketsQ as any).data ?? []) as any[]) {
    timeline.push({ at: m.created_at, kind: 'repair', who: '', group: 'room', title: `Repair reported · ${m.title}`, detail: `${m.priority ?? ''} priority`.trim(), href: `/admin/maintenance` })
    if (m.completed_at) timeline.push({ at: m.completed_at, kind: 'repair', who: '', group: 'room', title: `Repair completed · ${m.title}`, detail: m.final_price != null ? gbp(Number(m.final_price)) : '' })
  }
  // emails and texts (migration 242) to the tenants and applicants of this room
  const contacts = new Map<string, { who: string; group: TimelineItem['group'] }>()
  const addContact = (addr: string | null | undefined, who: string, group: TimelineItem['group']) => { const k = String(addr ?? '').trim().toLowerCase(); if (k && !contacts.has(k)) contacts.set(k, { who, group }) }
  const e164 = (p: string | null | undefined) => { const d = String(p ?? '').replace(/[^\d+]/g, ''); return d.startsWith('+') ? d : d.startsWith('0') ? `+44${d.slice(1)}` : d ? `+${d}` : '' }
  for (const t of tenancies) { const g = groupOf(t.id); addContact(t.people?.email, pname(t.people), g); addContact(e164(t.people?.phone), pname(t.people), g); if (t.co) { addContact(t.co.email, pname(t.co), g); addContact(e164(t.co.phone), pname(t.co), g) } }
  for (const a of ((applicantsQ as any).data ?? []) as any[]) { addContact(a.email, pname(a), 'applicant'); addContact(e164(a.phone), pname(a), 'applicant') }
  for (const o of offers) addContact(o.applicant_email, o.applicant_name ?? '', 'applicant')
  let messagesLogged = true
  if (contacts.size) {
    const { data: msgs, error } = await s.from('message_log').select('channel, to_address, subject, preview, status, error, created_at, sent_by').in('to_address', [...contacts.keys()]).order('created_at', { ascending: false }).limit(200)
    if (error) messagesLogged = false
    for (const m of (msgs ?? []) as any[]) {
      const c = contacts.get(String(m.to_address).toLowerCase())
      timeline.push({ at: m.created_at, kind: m.channel === 'sms' ? 'sms' : 'email', who: c?.who ?? m.to_address, group: c?.group ?? 'room', failed: m.status === 'failed',
        title: `${m.channel === 'sms' ? 'Text' : 'Email'} to ${c?.who ?? m.to_address}${m.subject ? ` · ${m.subject}` : ''}`,
        detail: m.status === 'failed' ? `Not sent: ${m.error ?? 'refused'}` : String(m.preview ?? '').slice(0, 180) })
    }
  }
  timeline.sort((a, b) => String(b.at).localeCompare(String(a.at)))

  // ── Needs you ───────────────────────────────────────────────────────────────────────────────────────────────────
  const needs: Need[] = []
  const curName = current ? pname(current.people) : ''
  if (current && account) {
    for (const mth of account.months.filter(m => (m.how === 'unpaid' || m.how === 'part') && m.due < today)) {
      const row = rent.find(r => r.month === mth.month)
      const owed = r2(mth.amount - (row?.received ?? 0))
      const inMonies = current.move_in_monies_received_at && mth.month === String(current.start_date).slice(0, 7)
      let canApply = false
      if (inMonies) canApply = (await applyMoveInRent(s, current.id, { date: current.move_in_monies_received_at, apply: false }).catch(() => ({ paid: [] as any[] }))).paid.length > 0
      needs.push({ key: `rent-${mth.month}`, level: 'urgent', category: 'Rent', title: `${gbp(owed)} shown as unpaid`,
        detail: `${row ? `${fullDate(row.from)} – ${fullDate(row.to)}` : mth.month}, due ${fullDate(mth.due)}.${canApply ? ` The move-in monies were recorded as received on ${fullDate(current.move_in_monies_received_at)} and include this rent.` : ''}`,
        due: `${days(mth.due, today)} days overdue`, ...(canApply ? { op: 'apply_move_in_rent' as const, opTenancyId: current.id, action: 'Mark paid from move-in monies' } : { href: `/admin/lettings/${current.id}?tab=money`, action: 'Sort out' }) })
    }
  }
  if (current && Number(current.deposit_amount) > 0) {
    const received = current.move_in_monies_received_at ?? current.start_date
    const by = addDays(received, 30), left = days(today, by)
    if (!current.deposit_protected_at && !current.deposit_protection_assumed)
      needs.push({ key: 'protect', level: 'urgent', category: 'Deposit', title: 'Deposit not protected', detail: `${curName}’s ${gbp(Number(current.deposit_amount))}, received ${fullDate(received)}. It must be protected within 30 days.`, due: left >= 0 ? `Due ${fullDate(by)} · ${left} days left` : `${-left} days late`, href: `/admin/lettings/${current.id}?tab=progress`, action: 'Protect it' })
    if (!current.prescribed_info_served_at)
      needs.push({ key: 'pi', level: left <= 14 ? 'urgent' : 'week', category: 'Deposit', title: 'Prescribed information not served', detail: `${curName}’s ${gbp(Number(current.deposit_amount))}${current.deposit_protected_at ? `, protected${current.deposit_scheme ? ` with ${current.deposit_scheme}` : ''} on ${fullDate(current.deposit_protected_at)}` : ''}. It must be served within 30 days of receipt.`, due: left >= 0 ? `Due ${fullDate(by)} · ${left} days left` : `${-left} days late`, href: '/admin/deposits', action: 'Serve it now' })
  }
  if (current && !incoming && current.end_date) {
    const left = days(today, current.end_date)
    const lead = applicants.find(a => a.offerSentAt) ?? applicants[0]
    needs.push({ key: 'relet', level: left <= 7 ? 'urgent' : 'week', category: 'Re-let', title: `No incoming tenancy for ${fullDate(addDays(current.end_date, 1))}`,
      detail: [lead ? `${lead.offerSentAt ? `Offer to applicant ${lead.name} sent ${fullDate(lead.offerSentAt)}` : `Applicant ${lead.name}`}, ${lead.stage === 'reserved' || lead.offerStatus === 'deposit_paid' ? 'reserved' : 'not reserved'}.` : 'No applicants for this room.', room.marketing_status === 'listed' || room.show_on_website ? '' : 'Not advertised.', ((viewingsQ as any).data ?? []).some((v: any) => v.viewing_date >= today) ? '' : 'No viewings booked.'].filter(Boolean).join(' '),
      due: left >= 0 ? `Room free in ${left + 1} day${left === 0 ? '' : 's'}` : 'Room free now', href: '#relet', action: 'Re-let plan' })
  }
  if (current?.notice_received_date && !current.checkout_confirmation_sent_at) {
    const ev = (((eventsQ as any).data ?? []) as any[]).find(e => e.tenancy_id === current.id && e.kind === 'notice')
    const noEmail = !ev || /no email/i.test(String(ev.note ?? ''))
    if (noEmail) {
      const short = current.end_date && current.end_date < addMonths(current.notice_received_date, 2)
      needs.push({ key: 'notice', level: 'week', category: 'Notice', title: 'Notice not acknowledged in writing', detail: `Received ${fullDate(current.notice_received_date)} from ${curName}${current.end_date ? ` for a tenancy end date of ${fullDate(current.end_date)}` : ''}${short ? `: ${days(current.notice_received_date, current.end_date)} days rather than two months` : ''}. No email has gone to the tenant.`, due: current.end_date ? `Before ${fullDate(current.end_date)}` : 'This week', href: `/admin/lettings/${current.id}?tab=notice`, action: 'Send confirmation' })
    }
  }
  for (const x of expiredRows) {
    if (x.deposit > 0 && !x.depositReturn && x.daysSinceEnd <= 120)
      needs.push({ key: `dep-${x.id}`, level: x.daysSinceEnd > 10 ? 'week' : 'tidy', category: 'Expired tenancy', title: `Deposit return pending · ${x.tenant}`, detail: `Tenancy ${fullDate(x.start)} – ${fullDate(x.end)}. ${gbp(x.deposit)}${x.scheme ? ` held with ${x.scheme}` : ''}. Agree any deductions or release it.`, due: `Ended ${x.daysSinceEnd} days ago`, href: '/admin/deposits', action: 'Open deposit return' })
  }
  for (const h of ((holdsQ as any).data ?? []) as any[]) {
    const t = tenancies.find(x => x.id === h.tenancy_id)
    if (!t || !(Number(t.rent_amount) > 0)) continue
    const cap = oneWeekRent(Number(t.rent_amount)), over = r2(Number(h.amount) - cap)
    if (over > 0.004 && (t.id === current?.id || t.id === incoming?.id))
      needs.push({ key: `hold-${h.id}`, level: 'tidy', category: 'Holding deposit', title: `${gbp(over)} over the legal cap`, detail: `${h.hold_no}, ${gbp(Number(h.amount))} received ${fullDate(h.received_on)}, is more than one week’s rent. At the agreed ${gbp(Number(t.rent_amount))} the cap is ${gbp(cap)}.`, due: 'No deadline', href: `/admin/lettings/${t.id}?tab=money`, action: `Credit ${gbp(over)}` })
  }
  if (file && current) {
    const until = file.tenant.rightToRentUntil, checked = current.right_to_rent_checked_at
    if (until && checked && until <= checked) needs.push({ key: 'r2r', level: 'tidy', category: 'Records', title: 'Right to Rent recheck date is wrong', detail: `Checked ${fullDate(checked)} as time-limited, with the recheck also recorded as ${fullDate(until)}.`, due: 'No deadline', href: `/admin/lettings/${current.id}?tab=progress`, action: 'Correct the date' })
    else if (until && until > (checked ?? '') && days(today, until) <= 28) needs.push({ key: 'r2r', level: 'urgent', category: 'Right to Rent', title: 'Right to Rent runs out', detail: `${curName}’s permission to stay ends ${fullDate(until)}. Recheck before then.`, due: `${fullDate(until)}`, href: `/admin/lettings/${current.id}?tab=progress`, action: 'Recheck' })
    if (!current.keys_handed_at && days(current.start_date, today) > 3) needs.push({ key: 'keys', level: 'tidy', category: 'Records', title: 'Keys handed over: no date recorded', detail: `Tenancy start date ${fullDate(current.start_date)}.`, due: 'No deadline', href: `/admin/lettings/${current.id}?tab=progress`, action: 'Record it' })
  }
  if (incoming) {
    const next = stepsFor(incoming).find(x => !x.done)
    if (next) needs.push({ key: 'incoming', level: days(today, incoming.start_date) <= 7 ? 'urgent' : 'week', category: 'Incoming tenancy', title: `${next.label} · ${pname(incoming.people)}`, detail: `Tenancy start date ${fullDate(incoming.start_date)}. ${next.sub}`.trim(), due: `Starts in ${days(today, incoming.start_date)} days`, href: `/admin/lettings/${incoming.id}?tab=progress`, action: 'Open letting file' })
  }
  if (!current && !incoming) {
    const lastEnd = expired[0]?.end_date ?? null
    const from = lastEnd ? addDays(lastEnd, 1) : null
    const n = from ? days(from, today) + 1 : null
    needs.push({ key: 'void', level: 'urgent', category: 'Void', title: from ? `Void since ${fullDate(from)}` : 'No tenancy on record', detail: n ? `${n} days · ${gbp(r2(n * dailyRent(Number(room.current_asking_rent) || Number(expired[0]?.rent_amount) || 0)))} of rent lost so far.` : 'Add the tenancy, or advertise the room.', due: n ? `${n} days` : '', href: '#relet', action: 'Fill the room' })
  }
  for (const m of ((ticketsQ as any).data ?? []) as any[]) {
    if (['completed', 'cancelled'].includes(m.status)) continue
    const age = days(String(m.created_at).slice(0, 10), today)
    if (age > 30 && !m.booked_date) needs.push({ key: `job-${m.id}`, level: 'week', category: 'Repair', title: `${m.title} · open ${age} days`, detail: `Reported ${fullDate(String(m.created_at).slice(0, 10))}, no date booked.`, due: current?.end_date && !incoming ? `Before ${fullDate(addDays(current.end_date, 1))}` : 'This week', href: `/admin/maintenance`, action: 'Book it' })
  }
  for (const c of certs) {
    const left = days(today, c.expiry)
    if (left <= 30) needs.push({ key: `cert-${c.label}`, level: left < 0 ? 'urgent' : 'week', category: 'House certificate', title: `${c.label} ${left < 0 ? 'expired' : 'expires'} ${fullDate(c.expiry)}`, detail: `${firstLine(prop.name)} · every room in the house`, due: left < 0 ? `${-left} days ago` : `${left} days left`, href: `/admin/compliance?property=${prop.id}`, action: 'Open certificates' })
  }
  const ORDER: Record<NeedLevel, number> = { urgent: 0, week: 1, tidy: 2 }
  needs.sort((a, b) => ORDER[a.level] - ORDER[b.level])

  const tickets = ((ticketsQ as any).data ?? []) as any[]
  const purchases = ((purchasesQ as any).data ?? []) as any[]
  const spend = r2(purchases.reduce((n, p) => n + (Number(p.cost) || 0), 0) + tickets.reduce((n, m) => n + (Number(m.final_price) || 0), 0))
  const photos = ((photosQ as any).data ?? []) as any[]
  const lead = applicants.find(a => a.offerSentAt) ?? applicants[0] ?? null

  return {
    today,
    room: {
      id: room.id, name: room.name, unitCode: room.unit_code ?? null, type: room.room_type ?? null, size: room.room_size ?? null,
      ensuite: room.has_ensuite ?? null, sharedBathroom: room.has_shared_bathroom ?? null, location: room.location_in_house ?? null,
      features: room.features ?? null, furnishings: room.furnishings_description ?? null, detected: room.detected_features ?? null,
      askingRent: room.current_asking_rent != null ? Number(room.current_asking_rent) : null, marketingStatus: room.marketing_status ?? null,
      marketingDescription: room.marketing_description ?? null, showOnWebsite: !!room.show_on_website, isLetOnly: !!room.is_let_only,
      photos: photos.map(p => ({ id: p.id, src: p.file_url || p.file_path, caption: p.caption ?? null })),
    },
    property: { id: prop.id, name: firstLine(prop.name), address: prop.address ?? '', postcode: prop.postcode ?? '', code: prop.property_code ?? null, type: prop.property_type ?? null, roomCount: strip.length, furnished: prop.furnished_status ?? null, bills: prop.bills_included ?? null, lettingType: prop.letting_type ?? null },
    landlord: (landlordQ as any).data ? { id: (landlordQ as any).data.id, name: pname((landlordQ as any).data), company: (landlordQ as any).data.company ?? null } : null,
    fee: { label: describeFee(fee), perMonth: feeNow, toLandlord: rentNow != null && feeNow != null ? r2(rentNow - feeNow) : null, rent: rentNow },
    strip,
    stage: current ? stageOf(current, today) : incoming ? 'let_agreed' : 'void',
    current: current && file ? {
      id: current.id, tenant: file.tenant, jointTenant: file.jointTenant, start: current.start_date, end: current.end_date ?? null, notice: current.notice_received_date ?? null,
      rent: Number(current.rent_amount) || null, dueDay: Number(current.rent_due_day) || 1, paymentRef: current.payment_reference ?? null,
      agreementType: current.agreement_type ?? null, agreementSigned: current.agreement_signed_at ?? null,
      deposit: Number(current.deposit_amount) || 0, scheme: current.deposit_scheme ?? null, protectedAt: current.deposit_protected_at ?? null, prescribedAt: current.prescribed_info_served_at ?? null,
      hold: file.liveHold ? { no: file.liveHold.hold_no, amount: Number(file.liveHold.amount), received: file.liveHold.received_on, status: file.liveHold.status, outcomeOn: file.liveHold.outcome_on ?? null } : null,
      steps: file.steps, balance: account?.balance ?? null,
    } : null,
    incoming: incoming ? { id: incoming.id, tenant: pname(incoming.people), start: incoming.start_date, rent: Number(incoming.rent_amount) || null } : null,
    applicants, lead,
    expired: expiredRows, voids, occupancy,
    rent, takeover,
    repairs: tickets.map(m => ({ id: m.id, title: m.title, status: m.status, priority: m.priority, reported: String(m.created_at).slice(0, 10), booked: m.booked_date ?? null, completed: m.completed_at ? String(m.completed_at).slice(0, 10) : null, price: m.final_price != null ? Number(m.final_price) : null })),
    purchases: purchases.map(p => ({ id: p.id, name: p.name, category: p.category, cost: p.cost != null ? Number(p.cost) : null, date: p.purchased_date })),
    spend,
    viewings: (((viewingsQ as any).data ?? []) as any[]).filter(v => v.viewing_date >= today).map(v => ({ id: v.id, date: v.viewing_date, slot: v.viewing_slot, name: v.visitor_name, status: v.viewing_status })),
    safety: { checks: ((checksQ as any).data ?? []).map((c: any) => ({ type: c.check_type, sent: c.request_sent_at, answered: c.response_received_at, response: c.tenant_response, issue: c.issue_type })), certs },
    timeline: timeline.slice(0, 250), messagesLogged,
    needs,
  }
}

export type RoomOverview = Exclude<Awaited<ReturnType<typeof loadRoomOverview>>, { error: string }>
