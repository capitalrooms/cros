// One-click messages to a tenant from their tenancy (1 Nov 2026, Harry: "go to their tenancy and send rent reminders or
// whatever type of email … just click a button"). Each message is filled from the tenancy itself — rent, what's owed,
// the due date, the account rent is paid into (client account, or the landlord's for let-only) and the reference — so
// nothing has to be typed or looked up. Sent by email, text and/or app notification, only when the office presses Send.
// Renters' Rights wording throughout: periodic tenancies, no fixed terms or renewals.
import type { SupabaseClient } from '@supabase/supabase-js'
import { tenantAccount } from '@/lib/finance/tenantAccount'
import { resolvePropertyAccount } from '@/lib/banking/propertyAccount'
import { openFields, BANK_FIELDS } from '@/lib/crypto/fieldCrypt'
import { CLIENT_ACCOUNT } from '@/lib/movein/pack'
import { dearName, displayName } from '@/lib/people'

export interface TenantContact { personId: string; name: string; first: string; dear: string; email: string | null; phone: string | null }
export interface TenancyFacts {
  tenancyId: string
  tenants: TenantContact[]
  dear: string                       // "Ms Okafor" or "Ms Okafor and Mr Ade"
  room: string; house: string; address: string
  rent: number | null; dueDay: number; nextDue: string | null; paymentRef: string | null
  owed: number; owedMonths: string[]  // what's unpaid now, and for which months
  credit: number                      // paid ahead (an overpayment carried to next month); next rent is less by this
  account: { label: string; name: string; bank: string; sortCode: string; accountNo: string } | null
  deposit: number | null; startDate: string | null; endDate: string | null
  letOnly: boolean
}

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const longDate = (iso: string | null) => iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
const ordinal = (n: number) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th')
const monthName = (m: string) => new Date(`${m.slice(0, 7)}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

function nextDueDate(dueDay: number, today = new Date()): string {
  const y = today.getFullYear(), m = today.getMonth()
  const last = (yy: number, mm: number) => new Date(yy, mm + 1, 0).getDate()
  let d = new Date(y, m, Math.min(dueDay, last(y, m)), 12)
  if (d.toISOString().slice(0, 10) < today.toISOString().slice(0, 10)) d = new Date(y, m + 1, Math.min(dueDay, last(y, m + 1)), 12)
  return d.toISOString().slice(0, 10)
}

export async function tenancyFacts(s: SupabaseClient, tenancyId: string): Promise<TenancyFacts | null> {
  const { data: t } = await s.from('tenancies')
    .select('id, property_id, start_date, end_date, rent_amount, rent_due_day, deposit_amount, payment_reference, rooms(name), people!person_id(id, salutation, first_name, last_name, full_name, email, phone), co:people!co_tenant_id(id, salutation, first_name, last_name, full_name, email, phone)')
    .eq('id', tenancyId).maybeSingle()
  if (!t) return null
  const tt = t as any
  const { data: propRow } = await s.from('properties').select('*').eq('id', tt.property_id).maybeSingle()
  const prop = openFields(propRow as any, BANK_FIELDS.properties) as any
  const letOnly = prop?.letting_type === 'let_only'
  const [acct, landlordAcct] = await Promise.all([
    tenantAccount(s, tenancyId).catch(() => null),
    letOnly ? resolvePropertyAccount(s, prop).catch(() => null) : Promise.resolve(null),
  ])
  const tenants: TenantContact[] = [tt.people, tt.co].filter((p: any) => p?.id).map((p: any) => ({
    personId: p.id, name: displayName(p), first: p.first_name || String(p.full_name ?? '').split(' ')[0] || '', dear: dearName(p), email: p.email || null, phone: p.phone || null,
  }))
  const dueDay = Number(tt.rent_due_day) || acct?.dueDay || 1
  const unpaid = (acct?.months ?? []).filter(m => m.how === 'unpaid' || m.how === 'part')
  const thisMonth = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).slice(0, 7) + '-01'
  const { data: ahead } = await s.from('rent_charges').select('amount_received, remitted_amount, voided').eq('tenancy_id', tenancyId).gt('charge_month', thisMonth)
  const credit = Math.round(((ahead ?? []) as any[]).filter(c => !c.voided).reduce((n, c) => n + Math.max(0, Number(c.amount_received || 0) - Number(c.remitted_amount || 0)), 0) * 100) / 100
  // rent goes to our client account, except let-only, where the tenant pays the landlord directly after move-in
  const account = letOnly
    ? (landlordAcct ? { label: 'your landlord’s account', name: landlordAcct.name, bank: landlordAcct.bank, sortCode: landlordAcct.sortCode, accountNo: landlordAcct.accountNo } : null)
    : { label: 'our client account', name: CLIENT_ACCOUNT.name, bank: CLIENT_ACCOUNT.bank, sortCode: CLIENT_ACCOUNT.sortCode, accountNo: CLIENT_ACCOUNT.accountNo }
  return {
    tenancyId, tenants, dear: tenants.map(x => x.dear).join(' and ') || 'Tenant',
    room: tt.rooms?.name ?? '', house: String(prop?.name || prop?.address || '').split(/\n|,/)[0].trim(), address: [prop?.address, prop?.postcode].filter(Boolean).join(', '),
    rent: tt.rent_amount != null ? Number(tt.rent_amount) : null, dueDay, nextDue: nextDueDate(dueDay), paymentRef: tt.payment_reference || acct?.paymentRef || null,
    owed: Math.max(0, Math.round((acct?.balance ?? 0) * 100) / 100), owedMonths: unpaid.map(m => monthName(m.month)), credit,
    account, deposit: tt.deposit_amount != null ? Number(tt.deposit_amount) : null, startDate: tt.start_date, endDate: tt.end_date, letOnly,
  }
}

// ── The messages ────────────────────────────────────────────────────────────────────────────────────────────────────
// {tokens} come from the facts; [square brackets] are for the office to fill in before sending (dates of a visit etc).
export interface QuickMessage { id: string; group: 'Rent' | 'Visits & repairs' | 'The house' | 'Moving on'; name: string; subject: string; email: string; sms: string; needs?: string[] }

export const QUICK_MESSAGES: QuickMessage[] = [
  { id: 'rent-due', group: 'Rent', name: 'Rent due soon',
    subject: 'Your rent is due on {next_due}',
    email: `Just a reminder that your rent of **{next_rent}** is due on **{next_due}**.\n\n{pay_to}\n\nIf you pay by standing order, there’s nothing to do. Thank you.`,
    sms: `Hi {first}, a reminder your rent of {next_rent} is due on {next_due}. Ref {ref}. Thanks, Capital Rooms` },
  { id: 'rent-late', group: 'Rent', name: 'Rent overdue — friendly reminder',
    subject: 'Your rent for {room}, {house}',
    email: `We haven’t yet received **{owed}** for {owed_months}. It may simply have been missed, so this is a friendly reminder.\n\n{pay_to}\n\nPlease pay today. If you’ve paid in the last day or two, thank you — please ignore this.`,
    sms: `Hi {first}, we haven't received {owed} rent for {owed_months} yet. Please pay today to {acct_short}, ref {ref}. Capital Rooms` },
  { id: 'rent-late-2', group: 'Rent', name: 'Rent overdue — second reminder',
    subject: 'Rent still unpaid — {room}, {house}',
    email: `Your rent account is now **{owed}** in arrears ({owed_months}), and we haven’t heard from you since our last reminder.\n\nPlease pay the full amount by **[date — 7 days from today]**.\n\n{pay_to}`,
    sms: `Hi {first}, your rent account is {owed} in arrears. Please pay in full by [date]. Ref {ref}. Capital Rooms`, needs: ['date'] },
  { id: 'rent-received', group: 'Rent', name: 'Rent received — thank you',
    subject: 'Thank you — rent received',
    email: `Thank you, we’ve received your rent for {room}. Your account is up to date.`,
    sms: `Hi {first}, thanks, we've received your rent. Your account is up to date. Capital Rooms` },
  { id: 'overpaid', group: 'Rent', name: 'Overpaid — next rent less, or refund',
    subject: 'You’ve paid {credit} more than was due',
    email: `Thank you for your payment. It was **{credit}** more than was due, so you have a credit of {credit} with us.\n\nUnless you tell us otherwise, we’ll take it off your next rent: on **{next_due}** please pay **{next_rent}** instead of {rent}.\n\nIf you’d rather have the {credit} back, just reply with the account name, sort code and account number to refund it to.`,
    sms: `Hi {first}, you paid {credit} more than was due. Next rent on {next_due} is {next_rent} instead of {rent}, or reply for a refund. Capital Rooms` },
  { id: 'how-to-pay', group: 'Rent', name: 'How to pay your rent',
    subject: 'How to pay your rent for {room}',
    email: `Your rent is **{rent}** a month, due on the **{due_day}** of each month.\n\n{pay_to}\n\nA standing order is the easiest way to make sure it’s never late.`,
    sms: `Hi {first}, your rent is {rent}, due on the {due_day}. Pay {acct_short}, ref {ref}. Capital Rooms` },
  { id: 'inspection', group: 'Visits & repairs', name: 'Routine inspection notice',
    subject: 'Routine inspection at {house} — [date]',
    email: `We’ll be carrying out a routine inspection at {house} on **[date]** between **[time window]**, giving you at least 24 hours’ notice.\n\nWe’ll look at the condition of the room and shared areas and check the smoke and carbon monoxide alarms. You don’t need to be in, but you’re welcome to be. Please let us know if the time doesn’t suit and we’ll find another.`,
    sms: `Hi {first}, routine inspection at {house} on [date], [time window]. You don't need to be in. Reply if the time doesn't suit. Capital Rooms`, needs: ['date', 'time window'] },
  { id: 'contractor-visit', group: 'Visits & repairs', name: 'Contractor visit / access',
    subject: 'Contractor visit at {house} — [date]',
    email: `A contractor will visit {house} on **[date]** between **[time window]** to [what the work is].\n\nThey’ll use the house keys, so you don’t need to be in. If you’d rather be there, or the time doesn’t work, just reply and we’ll rearrange.`,
    sms: `Hi {first}, a contractor is coming to {house} on [date], [time window] for [work]. You don't need to be in. Capital Rooms`, needs: ['date', 'time window', 'work'] },
  { id: 'gas-safety', group: 'Visits & repairs', name: 'Annual gas safety check',
    subject: 'Annual gas safety check at {house} — [date]',
    email: `The annual gas safety check at {house} is booked for **[date]** between **[time window]**. It’s a legal requirement to keep everyone safe, and takes about an hour.\n\nThe engineer needs to reach the boiler and any gas appliances, so please keep them clear. If the time doesn’t suit, reply and we’ll rebook.`,
    sms: `Hi {first}, the annual gas safety check at {house} is on [date], [time window]. Please keep the boiler clear. Capital Rooms`, needs: ['date', 'time window'] },
  { id: 'repair-update', group: 'Visits & repairs', name: 'Repair update',
    subject: 'Update on your repair at {house}',
    email: `A quick update on the repair you reported: [update — e.g. the part has been ordered and the engineer will return on …].\n\nThank you for your patience. We’ll let you know as soon as it’s done.`,
    sms: `Hi {first}, update on your repair: [update]. Capital Rooms`, needs: ['update'] },
  { id: 'house-reminder', group: 'The house', name: 'House reminder (bins, cleaning, noise)',
    subject: 'A quick reminder for everyone at {house}',
    email: `A quick reminder for everyone at {house}: [reminder — e.g. bins go out on Wednesday night, and please keep the kitchen clear for the cleaner on Friday].\n\nThank you for helping keep the house a good place to live.`,
    sms: `Hi {first}, quick reminder for {house}: [reminder]. Thanks, Capital Rooms`, needs: ['reminder'] },
  { id: 'right-to-rent', group: 'The house', name: 'Right to rent — document needed',
    subject: 'Your right to rent check',
    email: `Your right to rent permission is due to expire on **[expiry date]**. The law requires us to see your updated documents (or a new share code from gov.uk/prove-right-to-rent) before then.\n\nPlease send them by replying to this email, or bring them to us. This doesn’t affect your tenancy if it’s done in time.`,
    sms: `Hi {first}, your right to rent permission expires [expiry date]. Please send us your new share code or documents. Capital Rooms`, needs: ['expiry date'] },
  { id: 'notice-received', group: 'Moving on', name: 'Your notice — confirmation',
    subject: 'Your notice to leave {room}',
    email: `Thank you for letting us know you’re moving on. We received your notice on **[date notice received]**, so your tenancy will end on **[end date — at least two months later]**.\n\nRent is due as normal up to that date. We’ll be in touch nearer the time about check-out and returning your deposit.`,
    sms: `Hi {first}, we've received your notice. Your tenancy ends on [end date]. We'll be in touch about check-out. Capital Rooms`, needs: ['date notice received', 'end date'] },
  { id: 'move-out', group: 'Moving on', name: 'Moving out — what to do',
    subject: 'Moving out of {room} — what happens next',
    email: `Your tenancy ends on **{end_date}**. To make check-out quick and your deposit return straightforward:\n\n- leave the room clean and empty, as it was when you moved in\n- return every key on your last day\n- give us a forwarding address and the bank details for your deposit\n- take meter photos if your room has its own meter\n\nYour deposit of **{deposit}** is returned within 10 days of us agreeing any deductions.`,
    sms: `Hi {first}, your tenancy ends {end_date}. Please leave the room clean, return all keys and send us your forwarding address. Capital Rooms` },
  { id: 'deposit-update', group: 'Moving on', name: 'Deposit return update',
    subject: 'Your deposit for {room}',
    email: `An update on your deposit of **{deposit}**: [update — e.g. it has been returned in full today, or the proposed deductions are attached].\n\nIf you have any questions, just reply to this email.`,
    sms: `Hi {first}, an update on your deposit: [update]. Capital Rooms`, needs: ['update'] },
]

/** Fill a message for one tenant. Anything we don't know is left as a [placeholder] — never guessed. */
export function fillMessage(text: string, f: TenancyFacts, who?: TenantContact): string {
  const first = (who ?? f.tenants[0])?.first ?? ''
  const a = f.account
  const payTo = a
    ? `Please pay to ${a.label}:\n\n- Account name: **${a.name}**\n- Bank: ${a.bank}\n- Sort code: **${a.sortCode}**\n- Account number: **${a.accountNo}**\n- Reference: **${f.paymentRef ?? '[payment reference]'}**`
    : `Please pay using your usual details, with reference **${f.paymentRef ?? '[payment reference]'}**.`
  const map: Record<string, string> = {
    first, room: f.room || '[room]', house: f.house || '[house]', rent: f.rent != null ? gbp(f.rent) : '[monthly rent]',
    next_due: longDate(f.nextDue), due_day: ordinal(f.dueDay), ref: f.paymentRef ?? '[reference]',
    owed: f.owed > 0 ? gbp(f.owed) : '[amount owed]', owed_months: f.owedMonths.length ? f.owedMonths.join(', ') : '[month]',
    pay_to: payTo, acct_short: a ? `${a.name} ${a.sortCode} ${a.accountNo}` : 'your usual account',
    deposit: f.deposit != null ? gbp(f.deposit) : '[deposit]',
    credit: f.credit > 0 ? gbp(f.credit) : '[overpaid amount]', next_rent: f.rent != null ? gbp(Math.max(0, f.rent - f.credit)) : '[next rent]', end_date: longDate(f.endDate) || '[end date]',
  }
  return text.replace(/\{([a-z_]+)\}/g, (m, k: string) => map[k] ?? m)
}

/** The email body as simple HTML: **bold**, "- " bullets, blank-line paragraphs. */
export function emailHtml(text: string, dear: string): string {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (v: string) => esc(v).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  const blocks = text.split(/\n{2,}/).map(b => {
    const lines = b.split('\n')
    if (lines.every(l => l.startsWith('- '))) return `<ul style="margin:0 0 16px;padding-left:20px">${lines.map(l => `<li style="margin:0 0 4px">${inline(l.slice(2))}</li>`).join('')}</ul>`
    return `<p style="margin:0 0 16px">${lines.map(inline).join('<br>')}</p>`
  })
  return `<p style="margin:0 0 16px">Dear ${esc(dear)},</p>${blocks.join('')}<p style="margin:0">Kind regards,</p>`
}

// ── Sending ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Channel = 'email' | 'sms' | 'push'
export interface SendResult { name: string; email?: string; sms?: string; push?: string }

/** Send one message to every tenant on the tenancy, each greeted by name, on the channels chosen. */
export async function sendToTenancy(f: TenancyFacts, o: { subject: string; email: string; sms: string; channels: Channel[]; req?: Request | null }): Promise<SendResult[]> {
  const { sendEmail } = await import('@/lib/sendEmail')
  const { sendSms } = await import('@/lib/sms')
  const { sendServerPush } = await import('@/lib/serverPush')
  const out: SendResult[] = []
  for (const who of f.tenants) {
    const r: SendResult = { name: who.name }
    const subject = fillMessage(o.subject, f, who)
    if (o.channels.includes('email')) {
      if (!who.email) r.email = 'no email on file'
      else { const e = await sendEmail(who.email, subject, emailHtml(fillMessage(o.email, f, who), who.dear), { req: o.req ?? undefined }); r.email = e.ok ? 'sent' : `failed: ${e.error}` }
    }
    if (o.channels.includes('sms')) {
      const t = await sendSms(who.phone, fillMessage(o.sms, f, who), { asName: true }); r.sms = t.ok ? 'sent' : t.error ?? 'failed'
    }
    if (o.channels.includes('push')) {
      const n = await sendServerPush({ personId: who.personId, title: subject, body: fillMessage(o.sms, f, who).replace(/\s*Capital Rooms$/, ''), url: '/tenant', elected: true })
      r.push = n > 0 ? 'sent' : 'not on the app'
    }
    out.push(r)
  }
  return out
}

/** Placeholders still to fill in — sending is refused while any remain. */
export const unfilled = (...texts: string[]) => [...new Set(texts.join('\n').match(/\[[^\]\n]{2,60}\]/g) ?? [])]

/** The morning job: send every scheduled tenant message due today or earlier (migration 256). */
export async function sendScheduledMessages(s: SupabaseClient): Promise<number> {
  const { getElectedCommsLive } = await import('@/lib/comms')
  if (!(await getElectedCommsLive())) return 0
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const { data, error } = await s.from('scheduled_tenant_messages').select('*').lte('send_on', today).is('sent_at', null).is('cancelled_at', null).limit(100)
  if (error) return 0
  let n = 0
  for (const m of (data ?? []) as any[]) {
    // claim it first, so a second run can't send it twice
    const { data: claimed } = await s.from('scheduled_tenant_messages').update({ sent_at: new Date().toISOString() }).eq('id', m.id).is('sent_at', null).select('id')
    if (!claimed?.length) continue
    const f = await tenancyFacts(s, m.tenancy_id).catch(() => null)
    if (!f) { await s.from('scheduled_tenant_messages').update({ result: { error: 'tenancy not found' } }).eq('id', m.id); continue }
    const result = await sendToTenancy(f, { subject: m.subject, email: m.email, sms: m.sms, channels: m.channels })
    await s.from('scheduled_tenant_messages').update({ result }).eq('id', m.id)
    n++
  }
  return n
}
