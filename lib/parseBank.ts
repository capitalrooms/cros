/**
 * lib/parseBank.ts
 * Bulletproof UK bank statement CSV parser.
 *
 * Handles Barclays, HSBC, Lloyds/Halifax, NatWest/RBS, Santander, Monzo,
 * Starling, and generic CSVs. Only extracts CREDIT (incoming) transactions.
 *
 * The dedup_hash is deterministic:
 *   SHA-256 of "${date}|${amount.toFixed(2)}|${description.toLowerCase().trim()}"
 * Re-importing the same file any number of times produces the same hashes.
 * On insert we use ON CONFLICT(dedup_hash) DO NOTHING — perfectly safe.
 *
 * NEVER called with auth context — runs in an API route that verifies the caller.
 */

import crypto from 'crypto'

export interface ParsedTransaction {
  transaction_date: string   // ISO YYYY-MM-DD
  amount: number             // always positive (credit only)
  description: string        // verbatim from CSV
  extracted_ref: string | null // payment_reference pattern found in description
  sender_name: string | null   // bank display name of the payer, extracted from description
  dedup_hash: string
}

export interface ParseResult {
  transactions: ParsedTransaction[]
  period_from: string | null   // earliest transaction date (ISO)
  period_to: string | null     // latest transaction date (ISO)
  credit_total: number
  bank_name: string | null
  warnings: string[]
}

// ─── Hash ─────────────────────────────────────────────────────────────────────

function dedupHash(date: string, amount: number, description: string): string {
  const raw = `${date}|${amount.toFixed(2)}|${description.toLowerCase().trim()}`
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex')
}

// ─── Date parsing ─────────────────────────────────────────────────────────────
// Handles: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD MMM YYYY, D MMM YYYY

const MONTHS: Record<string, string> = {
  jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
}

function parseDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }

  // DD MMM YYYY or D MMM YYYY (e.g. "5 Sep 2026")
  const textDate = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/)
  if (textDate) {
    const [, d, mon, y] = textDate
    const m = MONTHS[mon.toLowerCase()]
    if (m) return `${y}-${m}-${d.padStart(2,'0')}`
  }

  return null
}

// ─── Amount parsing ───────────────────────────────────────────────────────────
// Handles: "1,234.56" "-1234.56" "£1234.56" "1.234,56" (European)

function parseAmount(raw: string): number | null {
  if (!raw || !raw.trim()) return null
  let s = raw.trim().replace(/[£$€\s]/g, '')
  // Negative numbers → debit, skip
  if (s.startsWith('-') || s.startsWith('(')) return null
  s = s.replace(/^\+/, '')
  // European format: 1.234,56
  if (/^\d{1,3}(\.\d{3})+(,\d{2})?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    // UK format: 1,234.56
    s = s.replace(/,/g, '')
  }
  const n = parseFloat(s)
  return isNaN(n) || n <= 0 ? null : n
}

// ─── Payment reference extraction ────────────────────────────────────────────
// Looks for Capital Rooms payment_reference pattern in description.
// Canonical format: {PROPCODE}-R{N}  e.g. "008ROC-R1" or "008CLH-R4"
//
// Liberal matching — tenants type many variants; we normalise all to canonical:
//   008ROC-R1    canonical
//   008ROC R1    space separator
//   008ROC/R1    slash separator
//   008ROCR1     no separator
//   8ROC-R1      missing leading zero (2-digit property code)
//   CR-008ROC-R1 CR- prefix some tenants add
//   008roc-r1    lowercase (covered by /i flag)
//
// Must appear as a word-boundary token so we don't match inside longer strings.

// Capital Rooms rent references: house number + street letters + room number, e.g. "208ROS05"
// (lib/tenancy/paymentRef.ts). Tenants type them every which way, so accept:
//   208ROS05   208 ROS 05   208-ROS-05   208ROS5   CR 208ROS05   208ros05
//   008ROC-R1  8ROC-R1  208ROS/R5   (the older "-R<room>" style)
// and normalise all of them to the stored form "208ROS05". Must stand alone as a token, and date-like
// tokens ("23SEP26") are ignored so they're never mistaken for a reference.
const REF_PATTERN = /(?:^|[^A-Z0-9])(?:CR[-\s]?)?(\d{1,3})[\s\-\/]?([A-Z]{2,4})[\s\-\/]?(?:R(?=[\s\-\/]?\d))?[\s\-\/]?(\d{1,2})(?=[^A-Z0-9]|$)/gi
const MONTH_TOKEN = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)$/

export function refCandidates(description: string): string[] {
  const out: string[] = []
  for (const m of description.toUpperCase().matchAll(REF_PATTERN)) {
    const [, house, letters, room] = m
    if (MONTH_TOKEN.test(letters)) continue                 // 23SEP26, 1 OCT 26 …
    out.push(`${house.padStart(3, '0')}${letters}${room.padStart(2, '0')}`)
  }
  return [...new Set(out)]
}

function extractRef(description: string): string | null {
  return refCandidates(description)[0] ?? null
}

// ─── Sender name extraction ──────────────────────────────────────────────────
// UK bank CSVs typically put the counterparty name at the start of the description,
// before a payment reference or other codes. We strip the reference and common
// noise words to leave the payer's display name.

const NOISE_WORDS = /\b(FASTER PAYMENT(S)?|STANDING ORDER|DIRECT DEBIT|BACS|CHAPS|FPS|FP|BGC|BBP|SO|DD|FT|TFR|TRANSFER|REF|PAYMENT|RENT|FROM|TO|VIA|ONLINE|MOBILE|CHANNEL|BANK|ON)\b/gi

function extractSenderName(description: string, ref: string | null): string | null {
  let s = description.trim()
  // Remove the extracted reference from the string
  // Remove anything that reads as a rent reference
  s = s.replace(REF_PATTERN, ' ')
  void ref
  // Remove noise words and numeric-only tokens
  s = s.replace(NOISE_WORDS, ' ')
  s = s.replace(/\b\d[\d\s\-*]+\b/g, ' ')  // card numbers, sort codes etc
  s = s.replace(/[^A-Z a-z''-]/g, ' ')       // keep only letters and spaces
  s = s.replace(/\s+/g, ' ').trim()
  // Take first 60 chars; must be at least 3 chars to be worth saving
  const name = s.slice(0, 60).trim()
  return name.length >= 3 ? name : null
}

// ─── CSV tokeniser ────────────────────────────────────────────────────────────
// Handles quoted fields containing commas and newlines.

function tokeniseCSV(line: string): string[] {
  const fields: string[] = []
  let i = 0
  while (i <= line.length) {
    if (line[i] === '"') {
      // Quoted field
      let val = ''
      i++ // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2 }
        else if (line[i] === '"') { i++; break }
        else { val += line[i++] }
      }
      fields.push(val)
      if (line[i] === ',') i++ // skip comma
    } else {
      // Unquoted field
      const end = line.indexOf(',', i)
      if (end === -1) { fields.push(line.slice(i)); break }
      fields.push(line.slice(i, end))
      i = end + 1
    }
  }
  return fields
}

// ─── Column detection ─────────────────────────────────────────────────────────

interface ColumnMap {
  dateIdx: number
  creditIdx: number    // single credit/amount column
  debitIdx: number | null  // separate debit column
  descIdx: number
  refIdx: number | null    // separate reference column (some banks split this)
  typeIdx: number | null   // transaction type (Barclays has this)
}

function detectColumns(headers: string[]): ColumnMap | null {
  const h = headers.map(s => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim())

  const dateIdx = h.findIndex(s =>
    s === 'date' || s === 'transaction date' || s === 'value date' || s === 'posting date' || s === 'created'
  )
  if (dateIdx === -1) return null

  const descIdx = h.findIndex(s =>
    s === 'description' || s === 'details' || s === 'narrative' || s === 'memo' ||
    s === 'transaction description' || s === 'transaction details' ||
    s === 'payee' || s === 'reference' || s === 'transaction' || s === 'name'
  )
  if (descIdx === -1) return null

  // Try split credit/debit columns first
  const creditIdx = h.findIndex(s =>
    s === 'credit' || s === 'credit amount' || s === 'money in' ||
    s === 'paid in' || s === 'credits' || s === 'deposit'
  )
  const debitIdx = h.findIndex(s =>
    s === 'debit' || s === 'debit amount' || s === 'money out' ||
    s === 'paid out' || s === 'debits' || s === 'withdrawal'
  )

  // Fall back to single amount column
  const amountIdx = h.findIndex(s =>
    s === 'amount' || s === 'value' || s === 'transaction amount'
  )

  const finalCreditIdx = creditIdx !== -1 ? creditIdx : amountIdx
  if (finalCreditIdx === -1) return null

  const refIdx = h.findIndex(s => s === 'ref' || s === 'payment ref' || s === 'your ref')
  const typeIdx = h.findIndex(s => s === 'type' || s === 'transaction type')

  return {
    dateIdx,
    creditIdx: finalCreditIdx,
    debitIdx: debitIdx !== -1 ? debitIdx : null,
    descIdx,
    refIdx: refIdx !== -1 ? refIdx : null,
    typeIdx: typeIdx !== -1 ? typeIdx : null,
  }
}

function detectBankName(headers: string[]): string | null {
  const h = headers.join(',').toLowerCase()
  if (h.includes('sort code') && h.includes('account number')) return 'Barclays / Lloyds / Halifax'
  if (h.includes('monzo') || h.includes('merchant_name')) return 'Monzo'
  if (h.includes('starling')) return 'Starling'
  if (h.includes('merchant name') || h.includes('spending category')) return 'Monzo'
  return null
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function parseBankCSV(csvText: string): ParseResult {
  const warnings: string[] = []

  // Normalise line endings
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  if (lines.length < 2) {
    return { transactions: [], period_from: null, period_to: null,
             credit_total: 0, bank_name: null, warnings: ['File appears empty or has only one line'] }
  }

  // Find header row — first row whose fields look like column names, not data
  let headerLineIdx = 0
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const fields = tokeniseCSV(lines[i])
    const isHeader = fields.some(f =>
      /^(date|description|amount|credit|debit|balance|reference|type|transaction)/i.test(f.trim())
    )
    if (isHeader) { headerLineIdx = i; break }
  }

  const headers = tokeniseCSV(lines[headerLineIdx])
  const bank_name = detectBankName(headers)
  const cols = detectColumns(headers)

  if (!cols) {
    warnings.push('Could not identify required columns (date, amount/credit, description). Check the CSV format.')
    return { transactions: [], period_from: null, period_to: null,
             credit_total: 0, bank_name, warnings }
  }

  const transactions: ParsedTransaction[] = []
  let skippedDebits = 0
  let skippedBadDate = 0

  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const row = tokeniseCSV(lines[i])
    if (row.every(f => !f.trim())) continue // blank row

    // Date
    const rawDate = row[cols.dateIdx] || ''
    const date = parseDate(rawDate)
    if (!date) { skippedBadDate++; continue }

    // Amount — if separate debit column exists and debit is populated, this is a debit → skip
    if (cols.debitIdx !== null) {
      const debitRaw = row[cols.debitIdx] || ''
      const debitAmt = parseAmount(debitRaw)
      if (debitAmt !== null && debitAmt > 0) { skippedDebits++; continue }
    }

    const creditRaw = row[cols.creditIdx] || ''
    const amount = parseAmount(creditRaw)
    if (amount === null) { skippedDebits++; continue } // null or negative = debit

    // Description — combine desc + ref columns for richer matching
    const desc = (row[cols.descIdx] || '').trim()
    const refField = cols.refIdx !== null ? (row[cols.refIdx] || '').trim() : ''
    const description = refField && !desc.includes(refField) ? `${desc} ${refField}`.trim() : desc

    if (!description) { warnings.push(`Row ${i + 1}: no description, skipped`); continue }

    const extracted_ref = extractRef(description)
    const sender_name = extractSenderName(description, extracted_ref)
    const dedup_hash = dedupHash(date, amount, description)

    transactions.push({ transaction_date: date, amount, description, extracted_ref, sender_name, dedup_hash })
  }

  if (skippedBadDate > 0) warnings.push(`${skippedBadDate} row(s) skipped — unrecognised date format`)
  if (skippedDebits > 0) warnings.push(`${skippedDebits} debit/outgoing transaction(s) excluded (credits only)`)

  const dates = transactions.map(t => t.transaction_date).sort()
  const credit_total = transactions.reduce((s, t) => s + t.amount, 0)

  return {
    transactions,
    period_from: dates[0] || null,
    period_to: dates[dates.length - 1] || null,
    credit_total: Math.round(credit_total * 100) / 100,
    bank_name,
    warnings,
  }
}
