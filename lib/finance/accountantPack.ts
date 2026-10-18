// The monthly pack for the accountant (17 Oct 2026, Harry: "how do we show each month to the accountant what has
// happened in the account — what landlords were paid, all the landlord statements, all the expenses charged, all the
// fees charged, all the deposits we have received and secured ourselves, not let-onlys"). One zip per month:
//   00 Summary.pdf                — the month on our letterhead: the figures, house by house, deposits, the client
//                                   account, anything missing, and what's in the pack
//   01 Landlord statements.csv   — every statement for the month (rent, fees, expenses, paid to the landlord)
//   02 Landlord payments.csv     — what each landlord was paid
//   03 Agency fees.csv           — management and letting fees, statement by statement
//   04 Expenses charged.csv      — every expense charged to a landlord, by category
//   05 Deposits.csv              — deposits we hold and protect (managed houses only — let-only deposits go to the
//                                   landlord), with those received this month marked
//   06 Holding deposits.csv      — holding deposits received this month
//   07 Client account.csv        — every movement through the client account (months CROS collects rent; in the import
//                                   period the agency's statements are the record)
//   Statements/                  — each landlord statement as a PDF
// A month's statements are the ones whose month is that month (lib/finance/statementMonth), the same rule as the
// statements grid, the rent roll and Finance home — so every figure here matches the screens.
import JSZip from 'jszip'
import type { SupabaseClient } from '@supabase/supabase-js'
import { statementMonth, monthLabel } from '@/lib/finance/statementMonth'
import { categoryLabel } from '@/lib/expense-categories'
import { loadLedger, ledgerCsv, landlordBalances } from '@/lib/clientLedger'
import { clientAccountPosition } from '@/lib/finance/clientAccount'
import { ledgerStart } from '@/lib/finance/dates'
import { loadStatementForPdf, renderStatementPdf } from '@/lib/statements/pdf'
import {
  loadPDFLetterheadAssets, fetchPDFBizSettings, drawPDFLogo, drawPDFFooter, drawPDFLetterRule,
  PAGE_W, PAGE_H, MARGIN, COL_W, LOGO_H, FOOTER_BAND_H, BLACK, GREY,
} from '@/lib/pdfLetterhead'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const gbp = (n: number) => `${Number(n || 0) < 0 ? '−' : ''}£${Math.abs(Number(n || 0)).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const ukDate = (d?: string | null) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : ''
const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
const csv = (head: string[], rows: unknown[][]) => [head.map(q).join(','), ...rows.map(r => r.map(q).join(','))].join('\r\n') + '\r\n'
const money = (n: number) => r2(n).toFixed(2)
const first = (s: unknown) => String(s ?? '').split('\n')[0]
const NON_EXPENSE = new Set(['rent_income', 'management_fee', 'letting_fee', 'deposit', 'other_income'])

export interface PackSummary {
  month: string; label: string; importPeriod: boolean; statements: number
  rent: number; toLandlords: number; mgmt: number; letting: number; expenses: number
  depositsHeld: { count: number; total: number }; depositsReceived: { count: number; total: number }
  holding: { count: number; total: number }; missing: string[]; pdfsMissing: string[]
  initial: { count: number; received: number; fees: number; paid: number }
}

/** Every imported statement PDF in the statements@ inbox, by LS number — found once for the whole pack. */
async function agentPdfIndex(): Promise<Map<string, { emailId: string; attId: string; filename: string }>> {
  const H = { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }
  const map = new Map<string, { emailId: string; attId: string; filename: string }>()
  let after = ''
  for (let page = 0; page < 10; page++) {
    const r = await fetch(`https://api.resend.com/emails/receiving?limit=100${after ? `&after=${after}` : ''}`, { headers: H }).catch(() => null)
    if (!r?.ok) break
    const d: any = await r.json().catch(() => ({}))
    for (const e of (d.data ?? []) as any[]) for (const a of (e.attachments ?? []) as any[]) {
      const no = String(a.filename ?? '').match(/\bLS\d{3,}\b/i)?.[0]?.toUpperCase()
      if (no && !map.has(no)) map.set(no, { emailId: e.id, attId: a.id, filename: a.filename })
    }
    if (!d.has_more || !d.data?.length) break
    after = d.data[d.data.length - 1].id
  }
  return map
}
async function agentPdf(ref: { emailId: string; attId: string }): Promise<Buffer | null> {
  const H = { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }
  const meta = await fetch(`https://api.resend.com/emails/inbound/${ref.emailId}/attachments/${ref.attId}`, { headers: H }).then(x => x.ok ? x.json() : null).catch(() => null)
  if (!meta?.download_url) return null
  const f = await fetch(meta.download_url).catch(() => null)
  return f?.ok ? Buffer.from(await f.arrayBuffer()) : null
}

export async function buildAccountantPack(s: SupabaseClient, month: string): Promise<{ zip: Buffer; fileName: string; summary: PackSummary }> {
  const [y, m] = month.split('-').map(Number)
  const start = `${month}-01`, end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const shift = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  const takeover = await ledgerStart(s)
  const importPeriod = start < takeover

  const [{ data: props }, { data: demoRows }, { data: stsRaw }, { data: tens }, { data: holds }] = await Promise.all([
    s.from('properties').select('id, name, address, letting_type, landlord_id, property_type'),
    s.from('properties').select('id').eq('is_demo', true),
    s.from('landlord_statements').select('*').gte('statement_date', shift(start, -45)).lte('statement_date', shift(end, 45)),
    s.from('tenancies').select('id, property_id, room_id, start_date, end_date, deposit_amount, deposit_scheme, deposit_scheme_ref, deposit_protected_at, deposit_protection_assumed, prescribed_info_served_at, let_cancelled_at, rooms(name), people!person_id(salutation, first_name, last_name, full_name)'),
    s.from('holding_deposits').select('hold_no, amount, received_on, status, payer_name, property_id, room_id').gte('received_on', start).lte('received_on', end),
  ])
  // let-only lets: initial monies received or paid out this month (migration 231)
  const { data: imRaw, error: imErr } = await s.from('initial_monies').select('*, tenancies(people!person_id(salutation, first_name, last_name, full_name))').is('voided_at', null)
  const { data: imTr } = await s.from('office_transfers').select('initial_monies_id, txn_no, transferred_on').not('initial_monies_id', 'is', null).is('voided_at', null)
  const demo = new Set(((demoRows ?? []) as any[]).map(r => r.id))
  const prop = new Map(((props ?? []) as any[]).map(p => [p.id, p]))
  const house = (pid: string) => first(prop.get(pid)?.name || prop.get(pid)?.address)
  const landlordIds = [...new Set(((props ?? []) as any[]).map(p => p.landlord_id).filter(Boolean))]
  const { data: lls } = landlordIds.length ? await s.from('people').select('id, salutation, first_name, last_name, full_name, company').in('id', landlordIds) : { data: [] as any[] }
  const llName = new Map(((lls ?? []) as any[]).map(p => [p.id, p.company || [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || '']))
  const landlordOf = (st: any) => llName.get(st.landlord_id || prop.get(st.property_id)?.landlord_id) || ''

  const sts = ((stsRaw ?? []) as any[]).filter(st => !demo.has(st.property_id) && statementMonth(st) === month)
    .sort((a, b) => house(a.property_id).localeCompare(house(b.property_id), undefined, { numeric: true }))
  const sum = (k: string) => r2(sts.reduce((t, x) => t + Number(x[k] || 0), 0))

  // expenses: imported statements carry them as categorised lines; CROS's own statements as their expenses list
  const ids = sts.map(st => st.id)
  const { data: lines } = ids.length ? await s.from('statement_line_items').select('statement_id, category, description, amount, statement_date').in('statement_id', ids) : { data: [] as any[] }
  const byId = new Map(sts.map(st => [st.id, st]))
  const expenseRows: unknown[][] = []
  for (const l of (lines ?? []) as any[]) {
    if (NON_EXPENSE.has(l.category)) continue
    const st = byId.get(l.statement_id)
    expenseRows.push([ukDate(l.statement_date || st?.statement_date), house(st?.property_id), landlordOf(st), categoryLabel(l.category), l.description, money(Number(l.amount || 0)), String(st?.statement_reference ?? '').split(' ')[0]])
  }
  for (const st of sts) for (const e of (Array.isArray(st.expenses) ? st.expenses : []) as any[]) {
    expenseRows.push([ukDate(e.date || e.expense_date || st.statement_date), house(st.property_id), landlordOf(st), e.category ? categoryLabel(e.category) : 'Expense', e.description || e.supplier || '', money(Number(e.amount || 0)), String(st.statement_reference).split(' ')[0]])
  }

  // deposits we hold and protect: managed houses only, tenancies running at the month end
  const managed = (pid: string) => prop.get(pid)?.letting_type !== 'let_only' && !demo.has(pid)
  const held = ((tens ?? []) as any[]).filter(t => !t.let_cancelled_at && managed(t.property_id) && Number(t.deposit_amount) > 0
    && String(t.start_date) <= end && (!t.end_date || String(t.end_date) >= end))
  const tenantName = (t: any) => [t.people?.salutation, t.people?.first_name, t.people?.last_name].filter(Boolean).join(' ') || t.people?.full_name || ''
  const received = held.filter(t => String(t.start_date) >= start)
  const holding = ((holds ?? []) as any[]).filter(h => !demo.has(h.property_id))
  const within = (d: string | null) => !!d && d >= start && d <= end
  const initial = ((imErr ? [] : imRaw ?? []) as any[]).filter(x => !demo.has(x.property_id) && (within(x.received_on) || within(x.paid_on)))
    .sort((a, b) => String(a.received_on).localeCompare(String(b.received_on)))
  const feeTr = new Map(((imTr ?? []) as any[]).map(t => [t.initial_monies_id, t]))
  const imTenant = (x: any) => tenantName(x.tenancies ?? {})

  // houses with tenants that month and no statement — a statement still to import (or prepare)
  const withStatement = new Set(sts.map(st => st.property_id))
  const tenanted = new Set(((tens ?? []) as any[]).filter(t => !t.let_cancelled_at && managed(t.property_id) && String(t.start_date) <= end && (!t.end_date || String(t.end_date) >= start)).map(t => t.property_id))
  const missing = [...tenanted].filter(pid => !withStatement.has(pid)).map(house).sort()

  const zip = new JSZip()
  zip.file('01 Landlord statements.csv', csv(
    ['Statement', 'Statement date', 'House', 'Landlord', 'Rent', 'Management fee', 'Letting fee', 'Expenses', 'Paid to landlord', 'Paid on', 'Source'],
    sts.map(st => [String(st.statement_reference).split(' ')[0], ukDate(st.statement_date), house(st.property_id), landlordOf(st), money(st.gross_rent), money(st.management_fees), money(st.letting_fees), money(st.property_charges), money(st.net_to_landlord), ukDate(st.paid_date), st.source === 'import' ? 'Imported (before go-live)' : 'CROS']),
  ))
  const byLandlord = new Map<string, { name: string; amount: number; refs: string[] }>()
  for (const st of sts) { const k = landlordOf(st) || '—'; const v = byLandlord.get(k) ?? { name: k, amount: 0, refs: [] as string[] }; v.amount = r2(v.amount + Number(st.net_to_landlord || 0)); v.refs.push(String(st.statement_reference).split(' ')[0]); byLandlord.set(k, v) }
  zip.file('02 Landlord payments.csv', csv(['Landlord', 'Paid', 'Statements'], [...byLandlord.values()].sort((a, b) => a.name.localeCompare(b.name)).map(v => [v.name, money(v.amount), v.refs.join(' ')])))
  zip.file('03 Agency fees.csv', csv(['Statement', 'House', 'Landlord', 'Management fee', 'Letting fee', 'Total'], [
    ...sts.filter(st => Number(st.management_fees) || Number(st.letting_fees)).map(st => [String(st.statement_reference).split(' ')[0], house(st.property_id), landlordOf(st), money(st.management_fees), money(st.letting_fees), money(Number(st.management_fees || 0) + Number(st.letting_fees || 0))]),
    // let-only tenant-find fees, taken from initial monies (numbered INIT, not on a landlord statement)
    ...initial.filter(x => within(x.received_on) && Number(x.fee)).map(x => [x.txn_no, house(x.property_id), landlordOf(x), money(0), money(x.fee), money(x.fee)]),
  ]))
  zip.file('04 Expenses charged.csv', csv(['Date', 'House', 'Landlord', 'Category', 'Description', 'Amount', 'Statement'], expenseRows))
  zip.file('05 Deposits.csv', csv(['Tenant', 'House', 'Room', 'Tenancy start', 'Deposit', 'Received this month', 'Scheme', 'Scheme reference', 'Protected on', 'Prescribed information served'],
    held.sort((a, b) => house(a.property_id).localeCompare(house(b.property_id))).map(t => [tenantName(t), house(t.property_id), t.rooms?.name ?? '', ukDate(t.start_date), money(t.deposit_amount), String(t.start_date) >= start ? 'Yes' : '', t.deposit_scheme ?? '', t.deposit_scheme_ref ?? '', ukDate(t.deposit_protected_at) || (t.deposit_protection_assumed ? 'Assumed (before CROS)' : 'NOT RECORDED'), ukDate(t.prescribed_info_served_at) || 'NOT RECORDED'])))
  zip.file('08 Let-only initial monies.csv', csv(['Number', 'Received', 'Tenant', 'House', 'Landlord', 'Holding deposit', 'Balance received', 'Total received', 'First rent', 'Deposit', 'Tenant-find fee', 'Fee to operations', 'Paid to landlord', 'Paid on', 'Payment', 'Payment reference'],
    initial.map(x => { const tr = feeTr.get(x.id); return [x.txn_no, ukDate(x.received_on), imTenant(x), house(x.property_id), landlordOf(x), money(x.holding_amount), money(x.balance_amount), money(Number(x.holding_amount) + Number(x.balance_amount)), money(x.first_rent), money(x.deposit), money(x.fee), tr ? `${tr.txn_no} ${ukDate(tr.transferred_on)}` : (Number(x.fee) ? 'NOT YET' : ''), money(x.to_landlord), ukDate(x.paid_on) || 'NOT YET', x.payout_no ?? '', x.paid_reference ?? ''] })))
  zip.file('06 Holding deposits.csv', csv(['Number', 'Received', 'From', 'House', 'Amount', 'Status'], holding.map(h => [h.hold_no, ukDate(h.received_on), h.payer_name ?? '', house(h.property_id), money(h.amount), h.status])))

  let client: { total: number; agrees: boolean; lines: [string, number][] } | null = null
  if (!importPeriod) {
    const led = await loadLedger(s, { from: start, asAt: end })
    const bal = await landlordBalances(s, led.entries)
    zip.file('07 Client account.csv', ledgerCsv(led.entries, new Map(bal.map(b => [b.landlordId ?? '', b.name]))))
    const pos = await clientAccountPosition(s, end)
    client = { total: pos.cashbook.total, agrees: pos.agrees, lines: pos.breakdown.map(b => [b.label, b.amount]) }
  } else {
    zip.file('07 Client account.csv', csv(['Note'], [[`${monthLabel(month)} is in the import period: rent was collected and landlords paid before CROS went live. The landlord statements in this pack are the record of the client account for the month.`]]))
  }

  // the statements themselves
  const pdfsMissing: string[] = []
  const index = sts.some(st => st.source === 'import') ? await agentPdfIndex() : new Map()
  for (const st of sts) {
    const no = String(st.statement_reference).match(/^X?LS\d{3,}/i)?.[0]?.toUpperCase() ?? String(st.statement_reference).split(' ')[0]
    const name = `Statements/${no} ${house(st.property_id).replace(/[\\/:*?"<>|]+/g, ' ')}.pdf`
    try {
      let pdf: Buffer | null = null
      if (st.source === 'import') { const ref = index.get(no); pdf = ref ? await agentPdf(ref) : null }
      else { const data = await loadStatementForPdf(s, st.id); pdf = data ? await renderStatementPdf(data) : null }
      if (pdf) zip.file(name, pdf); else pdfsMissing.push(`${no} · ${house(st.property_id)}`)
    } catch { pdfsMissing.push(`${no} · ${house(st.property_id)}`) }
  }

  const summary: PackSummary = {
    month, label: monthLabel(month), importPeriod, statements: sts.length,
    rent: sum('gross_rent'), toLandlords: sum('net_to_landlord'), mgmt: sum('management_fees'), letting: sum('letting_fees'), expenses: sum('property_charges'),
    depositsHeld: { count: held.length, total: r2(held.reduce((t, x) => t + Number(x.deposit_amount), 0)) },
    depositsReceived: { count: received.length, total: r2(received.reduce((t, x) => t + Number(x.deposit_amount), 0)) },
    holding: { count: holding.length, total: r2(holding.reduce((t, x) => t + Number(x.amount || 0), 0)) },
    missing, pdfsMissing,
    initial: { count: initial.length, received: r2(initial.filter(x => within(x.received_on)).reduce((t, x) => t + Number(x.holding_amount) + Number(x.balance_amount), 0)), fees: r2(initial.filter(x => within(x.received_on)).reduce((t, x) => t + Number(x.fee || 0), 0)), paid: r2(initial.filter(x => within(x.paid_on)).reduce((t, x) => t + Number(x.amount_paid || 0), 0)) },
  }
  zip.file('00 Summary.pdf', await summaryPdf(summary, sts.map(st => ({ ref: String(st.statement_reference).split(' ')[0], house: house(st.property_id), landlord: landlordOf(st), rent: +st.gross_rent || 0, fees: (+st.management_fees || 0) + (+st.letting_fees || 0), expenses: +st.property_charges || 0, paid: +st.net_to_landlord || 0 })), client))
  return { zip: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }), fileName: `Capital Rooms accounts pack - ${monthLabel(month)}.zip`, summary }
}

async function summaryPdf(sm: PackSummary, rows: { ref: string; house: string; landlord: string; rent: number; fees: number; expenses: number; paid: number }[], client: { total: number; agrees: boolean; lines: [string, number][] } | null): Promise<Buffer> {
  const [{ logoImg, footerImg, fontReg, fontBold }, biz] = await Promise.all([Promise.resolve(loadPDFLetterheadAssets()), fetchPDFBizSettings()])
  const PDFKit = (await import('pdfkit')).default
  const doc = new PDFKit({ size: 'A4', margin: MARGIN, bufferPages: true })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const bottom = PAGE_H - FOOTER_BAND_H - 24
  let y = 0
  const page = () => { doc.addPage(); drawPDFLogo(doc, logoImg); y = MARGIN + LOGO_H + 16 }
  const need = (h: number) => { if (y + h > bottom) page() }
  const h2 = (t: string) => { need(40); y += 10; doc.font(fontBold).fontSize(12).fillColor(BLACK).text(t, MARGIN, y); y = doc.y + 6 }
  const kv = (k: string, v: string, bold = false) => { need(16); doc.font(fontReg).fontSize(9.5).fillColor(GREY).text(k, MARGIN, y, { width: 300 }); doc.font(bold ? fontBold : fontReg).fillColor(BLACK).text(v, MARGIN + 300, y, { width: COL_W - 300, align: 'right' }); y += 15 }

  drawPDFLogo(doc, logoImg)
  doc.font(fontReg).fontSize(9).fillColor(GREY).text(`Prepared ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, MARGIN, MARGIN)
  doc.font(fontBold).fontSize(20).fillColor(BLACK).text(`Monthly accounts pack`, MARGIN, MARGIN + 28)
  doc.font(fontReg).fontSize(12).fillColor(GREY).text(`${sm.label}${sm.importPeriod ? ' · import period (before go-live)' : ''}`, MARGIN, doc.y + 2)
  y = drawPDFLetterRule(doc, Math.max(doc.y + 12, MARGIN + LOGO_H + 12))

  h2('The month')
  kv('Rent collected', gbp(sm.rent), true)
  kv('Paid to landlords', gbp(sm.toLandlords))
  kv('Management fees (agency income)', gbp(sm.mgmt))
  kv('Letting fees (agency income)', gbp(sm.letting))
  kv('Expenses charged to landlords', gbp(sm.expenses))
  kv('Check: paid + fees + expenses', gbp(r2(sm.toLandlords + sm.mgmt + sm.letting + sm.expenses)) + (Math.abs(r2(sm.toLandlords + sm.mgmt + sm.letting + sm.expenses) - sm.rent) < 0.01 ? '  — equals rent' : '  — does not equal rent, check'))
  kv('Landlord statements', String(sm.statements))

  h2('House by house')
  const cols = [MARGIN, MARGIN + 52, MARGIN + 210, MARGIN + 282, MARGIN + 344, MARGIN + 410]
  need(18); doc.font(fontBold).fontSize(8).fillColor(GREY)
  ;['Statement', 'House', 'Rent', 'Fees', 'Expenses', 'Paid to landlord'].forEach((t, i) => doc.text(t.toUpperCase(), cols[i], y, { width: i < 2 ? (cols[i + 1] - cols[i] - 4) : (i === 5 ? COL_W - (cols[5] - MARGIN) : cols[i + 1] - cols[i] - 4), align: i < 2 ? 'left' : 'right' }))
  y += 14
  for (const r of rows) {
    need(16); doc.font(fontReg).fontSize(8.5).fillColor(BLACK)
    // one line per house: a long name is shortened to fit its column (it used to wrap onto the next row)
    doc.font(fontReg).fontSize(8.5)
    let hn = r.house.split(',').slice(0, 2).join(',').trim()
    while (hn.length > 4 && doc.widthOfString(hn) > cols[2] - cols[1] - 6) hn = hn.slice(0, -2).trimEnd() + '…'
    const vals = [r.ref, hn.replace(/……$/, '…'), gbp(r.rent), gbp(r.fees), gbp(r.expenses), gbp(r.paid)]
    vals.forEach((t, i) => doc.text(t, cols[i], y, { width: i < 2 ? (cols[i + 1] - cols[i] - 4) : (i === 5 ? COL_W - (cols[5] - MARGIN) : cols[i + 1] - cols[i] - 4), align: i < 2 ? 'left' : 'right', lineBreak: false, ellipsis: true }))
    y += 14
    doc.save().strokeColor('#E4E0D8').lineWidth(0.4).moveTo(MARGIN, y - 3).lineTo(PAGE_W - MARGIN, y - 3).stroke().restore()
  }

  if (sm.initial.count) {
    h2('Let-only lets (initial monies)')
    kv('Received from tenants (holding deposit + balance)', gbp(sm.initial.received))
    kv('Tenant-find fees (agency income)', gbp(sm.initial.fees))
    kv('Paid to landlords', gbp(sm.initial.paid))
    need(14); doc.font(fontReg).fontSize(8).fillColor(GREY).text('First rent and deposit for let-only lets, less our fee, are paid straight to the landlord. Each let is in 08 Let-only initial monies.csv.', MARGIN, y, { width: COL_W }); y = doc.y + 4
  }

  h2('Deposits we hold and protect (managed houses)')
  kv(`Held at ${sm.label} month end`, `${sm.depositsHeld.count} · ${gbp(sm.depositsHeld.total)}`)
  kv('Received this month (new tenancies)', `${sm.depositsReceived.count} · ${gbp(sm.depositsReceived.total)}`)
  kv('Holding deposits received this month', `${sm.holding.count} · ${gbp(sm.holding.total)}`)
  need(14); doc.font(fontReg).fontSize(8).fillColor(GREY).text('Let-only deposits are paid to the landlord and are not held by us, so they are not included. Protection and prescribed-information dates are in 05 Deposits.csv.', MARGIN, y, { width: COL_W }); y = doc.y + 4

  h2('Client account')
  if (client) {
    kv('Cash book at month end', gbp(client.total), true)
    for (const [k, v] of client.lines) if (v) kv(`  ${k}`, gbp(v))
    kv('Ledgers', client.agrees ? 'Agree' : 'Do not agree — check')
  } else {
    need(28); doc.font(fontReg).fontSize(9).fillColor(BLACK).text('Import period: rent was collected and landlords were paid before CROS went live. The landlord statements in this pack are the record of the client account for the month.', MARGIN, y, { width: COL_W }); y = doc.y + 4
  }

  if (sm.missing.length || sm.pdfsMissing.length) {
    h2('Still to come')
    if (sm.missing.length) { need(14); doc.font(fontReg).fontSize(9).fillColor(BLACK).text(`No statement on file yet for: ${sm.missing.join(', ')}.`, MARGIN, y, { width: COL_W }); y = doc.y + 4 }
    if (sm.pdfsMissing.length) { need(14); doc.font(fontReg).fontSize(9).fillColor(BLACK).text(`Statement PDF not found (figures are included above): ${sm.pdfsMissing.join(', ')}.`, MARGIN, y, { width: COL_W }); y = doc.y + 4 }
  }

  h2('In this pack')
  for (const t of ['01 Landlord statements.csv', '02 Landlord payments.csv', '03 Agency fees.csv', '04 Expenses charged.csv', '05 Deposits.csv', '06 Holding deposits.csv', '07 Client account.csv', '08 Let-only initial monies.csv', 'Statements/ — each landlord statement as a PDF']) { need(13); doc.font(fontReg).fontSize(9).fillColor(BLACK).text(t, MARGIN, y); y += 13 }

  const range = (doc as any).bufferedPageRange?.() || { start: 0, count: 1 }
  for (let i = range.start; i < range.start + range.count; i++) { doc.switchToPage(i); drawPDFFooter(doc, footerImg, biz, fontReg) }
  doc.end()
  return new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))))
}
