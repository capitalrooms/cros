'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { landlordFormalNames, landlordName } from '@/lib/people'
import { adminFetch } from '@/lib/adminFetch'
import { FEES, type FeeCode } from '@/lib/invoices/fees'
import SendToLandlord, { type AgreementDoc } from './SendToLandlord'
import InvoicesOnly, { type InvoiceLine } from './InvoicesOnly'
import { buildPaymentRef } from '@/lib/tenancy/paymentRef'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  _id: string
  property_name: string | null
  room_number: number | null
  salutation: string | null
  tenant_name: string | null
  tenant_email: string | null
  tenant_phone: string | null
  rent_amount: number | null
  deposit_amount: number | null
  start_date_raw: string | null
  notes: string | null
  // UI state
  selected: boolean
  bank_account_id: string | null
  template: 'apt-base' | 'apt-ns' | 'apt-ct'
  landlord_id: string | null
  // the rent payment reference on the agreement: typed / taken from the tenant's CROS tenancy; blank = worked out from the address
  payment_reference?: string | null
  ref_source?: 'cros' | 'typed' | null
}

/** The reference the agreement will carry: the one set on the row, else worked out from the address and room. */
const refFor = (row: ParsedRow) => (row.payment_reference || '').trim() || (row.property_name ? buildPaymentRef(row.property_name, row.room_number) : '')

interface BankAccount {
  id: string
  account_label: string
  account_name: string
  bank_name: string | null
  sort_code: string | null
  account_number: string | null
  iban: string | null
  swift: string | null
  landlord_id: string
}

interface Landlord {
  id: string
  salutation: string | null
  first_name: string | null
  last_name: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  home_address: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n: number | null): string {
  if (n == null) return ''
  return '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function ordinal(n: number): string {
  const s = ['th','st','nd','rd']
  const v = n % 100
  return n + (s[(v-20)%10] || s[v] || s[0])
}

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december']

// Accepts ISO (2026-10-16), UK numeric (16/10/2026, 16/10/26, 16/10, 16.10.2026) or text (16 October 2026, 16th Oct).
function parseStartDate(raw: string | null): Date | null {
  if (!raw) return null
  const t = raw.trim()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12))
  m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/)
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear()
    return new Date(Date.UTC(year, +m[2] - 1, +m[1], 12))
  }
  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?(?:\s+(\d{4}))?$/i)
  if (m) {
    const mi = MONTHS.findIndex(mo => mo.startsWith(m![2].toLowerCase().slice(0, 3)))
    if (mi >= 0) return new Date(Date.UTC(m[3] ? +m[3] : new Date().getFullYear(), mi, +m[1], 12))
  }
  return null
}

function fmtDate(raw: string | null): string {
  const d = parseStartDate(raw)
  if (!d || isNaN(d.getTime())) return raw || ''
  const month = d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })
  return `${ordinal(d.getUTCDate())} ${month} ${d.getUTCFullYear()}`
}

function rentDueDay(raw: string | null): string {
  const d = parseStartDate(raw)
  if (!d || isNaN(d.getTime())) return '1st'
  return ordinal(d.getUTCDate())
}

// "95 ROPE STREET, LONDON, SE16 7TH" → "95 Rope Street, London, SE16 7TH" (postcodes stay upper case)
function tidyAddress(raw: string | null): string {
  const s = (raw || '').trim()
  if (!s || s !== s.toUpperCase()) return s
  return s.split(/(\s+|,)/).map(w => {
    if (/^[A-Z]{1,2}\d[A-Z\d]?$/.test(w) || /^\d[A-Z]{2}$/.test(w) || !/[A-Z]/.test(w)) return w
    return w.charAt(0) + w.slice(1).toLowerCase()
  }).join('')
}


// ─── LandlordPicker ───────────────────────────────────────────────────────────

function LandlordPicker({
  landlords,
  value,
  onChange,
}: {
  landlords: Landlord[]
  value: string
  onChange: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = landlords.find(l => l.id === value)
  const displayName = selected
    ? (landlordName(selected as any) !== '—' ? landlordName(selected as any) : selected.email)
    : ''

  const filtered = query.trim()
    ? landlords.filter(l => {
        const q = query.toLowerCase()
        const name = landlordName(l as any).toLowerCase()
        const fullName = ((l as any).full_name || '').toLowerCase()
        return name.includes(q) || fullName.includes(q) || (l.email || '').toLowerCase().includes(q)
      })
    : landlords

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(id: string, name: string) {
    onChange(id)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        className="w-full rounded-lg border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-400"
        placeholder="Type landlord name…"
        value={open ? query : displayName}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
      />
      {value && !open && (
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 text-xs"
          onClick={() => { onChange(''); setQuery('') }}
        >✕</button>
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-md py-sm text-sm text-neutral-400">No landlords found</div>
          ) : (
            filtered.map(l => {
              const name = landlordName(l as any) !== '—' ? landlordName(l as any) : ''
              return (
                <button
                  key={l.id}
                  className="w-full text-left px-md py-sm hover:bg-neutral-50 text-sm"
                  onMouseDown={e => { e.preventDefault(); select(l.id, name) }}
                >
                  <span className="font-medium text-neutral-900">{name}</span>
                  {l.email && <span className="text-neutral-400 ml-2">{l.email}</span>}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BulkTenancyGenerator() {
  const supabase = createClient()

  // Step: 'paste' | 'confirm' | 'done'
  const [step, setStep] = useState<'paste' | 'confirm' | 'invoices' | 'done'>('paste')
  // 'agreements' = agreements + invoice; 'invoices' = invoice work already done, no agreements
  const [mode, setMode] = useState<'agreements' | 'invoices'>('agreements')
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([])
  const [parseCount, setParseCount] = useState(0)
  const [pasteText, setPasteText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [landlords, setLandlords] = useState<Landlord[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [selectedLandlordId, setSelectedLandlordId] = useState<string>('')
  const [generating, setGenerating] = useState<Set<string>>(new Set())
  const [generated, setGenerated] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  // Inline bank details — used when landlord has no saved accounts
  const [inlineBank, setInlineBank] = useState({ account_name: '', bank_name: '', sort_code: '', account_number: '' })
  const [globalBankId, setGlobalBankId] = useState<string>('')
  // Landlord invoice for the paperwork on this batch
  const [invoiceExtras, setInvoiceExtras] = useState<Record<string, Partial<Record<FeeCode, boolean>>>>({})
  const [invoiceAddress, setInvoiceAddress] = useState('')
  const [invoiceBusy, setInvoiceBusy] = useState<'' | 'pdf' | 'save'>('')
  const [invoiceMsg, setInvoiceMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // The agreement is the same for every batch except the parking clause, bank and bills.
  const [batchTemplate, setBatchTemplate] = useState<'apt-ns' | 'apt-base'>('apt-ns')

  // Bills configuration — who pays each bill
  type BillKey = 'water' | 'gas' | 'tv_licence' | 'broadband' | 'electricity' | 'telephone' | 'council_tax'
  const BILL_LABELS: Record<BillKey, string> = {
    water: 'Water', gas: 'Gas', tv_licence: 'TV licence',
    broadband: 'Broadband', electricity: 'Electricity',
    telephone: 'Telephone', council_tax: 'Council tax',
  }
  const [bills, setBills] = useState<Record<BillKey, 'landlord' | 'tenant'>>({
    water: 'landlord', gas: 'landlord', tv_licence: 'tenant',
    broadband: 'landlord', electricity: 'landlord',
    telephone: 'landlord', council_tax: 'landlord',
  })

  // Communal cleaning — who pays for the cleaner and how often they come
  type CleaningPayer = 'landlord' | 'tenant' | 'none'
  type CleaningFrequency = 'weekly' | 'fortnightly' | 'twice_monthly' | 'monthly'
  const CLEANING_PAYERS: [CleaningPayer, string][] = [['landlord', 'Landlord — included in rent'], ['tenant', 'Tenants pay'], ['none', 'No cleaner']]
  const CLEANING_FREQUENCIES: [CleaningFrequency, string][] = [['weekly', 'Once a week'], ['fortnightly', 'Every two weeks'], ['twice_monthly', 'Twice a month'], ['monthly', 'Once a month']]
  const [cleaning, setCleaning] = useState<{ payer: CleaningPayer; frequency: CleaningFrequency }>({ payer: 'landlord', frequency: 'weekly' })

  // Load landlords on mount
  useEffect(() => {
    supabase
      .from('people')
      .select('*')
      .eq('role', 'landlord')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => { if (!error) setLandlords(data || []) })
  }, [])

  // Invoice address defaults to the landlord's correspondence address
  useEffect(() => {
    const l = landlords.find(x => x.id === selectedLandlordId)
    setInvoiceAddress(l?.home_address ?? '')
  }, [selectedLandlordId, landlords])

  // Load bank accounts when landlord changes
  useEffect(() => {
    if (!selectedLandlordId) { setBankAccounts([]); return }
    setGlobalBankId('')
    fetch(`/api/admin/landlord-bank-accounts?landlord_id=${selectedLandlordId}`)
      .then(r => r.json())
      .then(d => {
        setBankAccounts(d.accounts || [])
        // Pre-select default account on all rows
        const def = (d.accounts || []).find((a: BankAccount) => a.is_default)
        if (def) {
          setGlobalBankId(def.id)
          setRows(prev => prev.map(r => ({ ...r, bank_account_id: def.id, landlord_id: selectedLandlordId })))
        }
      })
  }, [selectedLandlordId])

  // ── Step 1: Parse ─────────────────────────────────────────────────────────

  async function handleParse() {
    if (!pasteText.trim()) return
    setParsing(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/bulk-tenancy-generator/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: pasteText, mode,
          landlord: (() => { const l = landlords.find(x => x.id === selectedLandlordId); return l ? landlordFormalNames(l as any) : '' })(),
        }),
      })
      let data: any
      try { data = await res.json() } catch (e: any) { setError('Server error — check that ANTHROPIC_API_KEY is set on Vercel'); return }
      if (!res.ok) { setError(data.error || 'Parse failed'); return }
      if (mode === 'invoices') {
        if (!data.rows?.length) { setError('No charges found in the notes — check the text and try again'); return }
        setInvoiceLines(data.rows)
        setParseCount(c => c + 1)
        setStep('invoices')
        return
      }
      const parsed: ParsedRow[] = (data.rows || []).map((r: any) => ({
        ...r,
        property_name: tidyAddress(r.property_name),
        selected: true,
        bank_account_id: globalBankId || null,
        template: batchTemplate,
        landlord_id: selectedLandlordId || null,
      }))
      setRows(parsed)
      // A tenant already in CROS keeps the reference their tenancy has — it's what the bank import matches rent on
      try {
        const { data: tens } = await supabase.from('tenancies').select('payment_reference, let_cancelled_at, start_date, people!person_id(email, first_name, last_name)').not('payment_reference', 'is', null).order('start_date', { ascending: false })
        const live = ((tens ?? []) as any[]).filter(t => !t.let_cancelled_at && t.people)
        const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
        setRows(rs => rs.map(r => {
          const hit = live.find(t => r.tenant_email && norm(t.people.email) === norm(r.tenant_email))
            ?? live.find(t => r.tenant_name && norm([t.people.first_name, t.people.last_name].filter(Boolean).join(' ')) === norm(r.tenant_name))
          return hit ? { ...r, payment_reference: hit.payment_reference, ref_source: 'cros' as const } : r
        }))
      } catch { /* no CROS match: references are worked out from the address */ }
      // Cleaning mentioned in the notes ("landlord pays … cleaning twice monthly") pre-selects the cleaning choice
      const withCleaning = (data.rows || []).find((r: any) => ['landlord', 'tenant', 'none'].includes(r.cleaning_payer))
      if (withCleaning) {
        const freq = ['weekly', 'fortnightly', 'twice_monthly', 'monthly'].includes(withCleaning.cleaning_frequency) ? withCleaning.cleaning_frequency : null
        setCleaning(c => ({ payer: withCleaning.cleaning_payer, frequency: freq ?? c.frequency }))
      }
      // Charges mentioned in the pasted notes pre-tick the invoice extras
      setInvoiceExtras(Object.fromEntries((data.rows || []).map((r: any) => [r._id, {
        tenant_reference: !!r.charge_tenant_reference,
        guarantor_signatory: !!r.charge_guarantor_signatory,
        guarantor_reference: !!r.charge_guarantor_reference,
      }])))
      setStep('confirm')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setParsing(false)
    }
  }

  // ── Step 2: Row editing ───────────────────────────────────────────────────

  function updateRow(id: string, updates: Partial<ParsedRow>) {
    setRows(prev => prev.map(r => r._id === id ? { ...r, ...updates } : r))
  }

  // ── Step 3: Generate ──────────────────────────────────────────────────────

  function buildAgreementPayload(row: ParsedRow): { payload?: Record<string, unknown>; error?: string } {
    const bank = bankAccounts.find(a => a.id === row.bank_account_id)
    const landlord = landlords.find(l => l.id === (row.landlord_id || selectedLandlordId))

    if (!bank && !inlineBank.account_name) return { error: `Enter the bank details for ${row.tenant_name || 'this tenant'}` }
    if (!landlord) return { error: 'Select a landlord' }

    const bankDetails = bank
      ? { account_name: bank.account_name, bank_name: bank.bank_name || '', sort_code: bank.sort_code || '', account_number: bank.account_number || '' }
      : { account_name: inlineBank.account_name, bank_name: inlineBank.bank_name, sort_code: inlineBank.sort_code, account_number: inlineBank.account_number }

    const tenantFullName = [row.salutation, row.tenant_name].filter(Boolean).join(' ')
    const landlordFullName = landlordFormalNames(landlord as any)

    const payload = {
      template: row.template,
      bills,
      cleaning,
      tenant_name: tenantFullName || row.tenant_name || '',
      property_address: row.room_number ? `Room ${row.room_number}, ${tidyAddress(row.property_name)}` : tidyAddress(row.property_name),
      landlord_name: landlordFullName,
      landlord_contact_address: (landlord as any).home_address || '66 Paul St, London EC2A 4NA',
      landlord_email: landlord.email || '',
      landlord_phone: landlord.phone || '',
      start_date: fmtDate(row.start_date_raw),
      rent_amount: formatCurrency(row.rent_amount),
      when_rent_due: rentDueDay(row.start_date_raw),
      deposit: formatCurrency(row.deposit_amount),
      tenant_email: row.tenant_email || '',
      bank_account_name: bankDetails.account_name,
      bank_name: bankDetails.bank_name,
      bank_sort_code: bankDetails.sort_code,
      bank_account_number: bankDetails.account_number,
      payment_reference: refFor(row),
    }
    return { payload }
  }

  async function generateDocx(row: ParsedRow) {
    const { payload, error: payloadError } = buildAgreementPayload(row)
    if (!payload) { alert(payloadError); return }
    setGenerating(prev => new Set(prev).add(row._id))
    try {
      const res = await fetch('/api/admin/bulk-tenancy-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json()
        alert('Error generating agreement: ' + (d.error || 'Unknown error'))
        return
      }
      // Trigger download
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Tenancy Agreement - ${row.tenant_name || 'Tenant'}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setGenerated(prev => new Set(prev).add(row._id))
    } finally {
      setGenerating(prev => { const s = new Set(prev); s.delete(row._id); return s })
    }
  }

  async function generateAll() {
    const selected = rows.filter(r => r.selected)
    for (const row of selected) {
      await generateDocx(row)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const selectedCount = rows.filter(r => r.selected).length

  // ── Invoice (shared by the invoice panel and the send-to-landlord step) ──
  const invoiceRows = rows.filter(r => r.selected)
  const landlord = landlords.find(l => l.id === selectedLandlordId)
  const items = invoiceRows.flatMap(r => {
    const who = [r.room_number != null ? `Room ${r.room_number}` : '', [r.salutation, r.tenant_name].filter(Boolean).join(' ')].filter(Boolean).join(' — ')
    const ex = invoiceExtras[r._id] ?? {}
    return (['agreement', 'tenant_reference', 'guarantor_signatory', 'guarantor_reference'] as FeeCode[])
      .filter(code => code === 'agreement' || ex[code])
      .map(code => ({ description: FEES[code].label, detail: who, qty: 1, unitPrice: FEES[code].amount }))
  })
  const total = items.reduce((t, i) => t + i.unitPrice * i.qty, 0)
  const property = tidyAddress(invoiceRows[0]?.property_name ?? '')
  const today = new Date()
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const invoiceNumber = property ? `${stamp}${buildPaymentRef(property, null).slice(0, -2)}` : `${stamp}INV`
  const invoiceBody = () => ({
    landlordName: landlord ? landlordFormalNames(landlord as any) : '',
    addressLines: invoiceAddress.split(/\n|,/).map(x => x.trim()).filter(Boolean),
    propertyAddress: property,
    invoiceNumber, invoiceDate: today.toISOString().slice(0, 10),
    title: 'Tenancy agreements and signing',
    items,
  })

  // ── Send to landlord ──
  const sendDocs: AgreementDoc[] = invoiceRows.map(r => {
    const name = [r.salutation, r.tenant_name].filter(Boolean).join(' ') || 'Tenant'
    const room = r.room_number != null ? `Room ${r.room_number} — ` : ''
    const start = fmtDate(r.start_date_raw)
    return {
      key: r._id,
      label: `${room}${name}`,
      summary: `${room}${name}${r.rent_amount != null ? `, ${formatCurrency(r.rent_amount)} per month` : ''}${start ? ` from ${start}` : ''}`,
      ...buildAgreementPayload(r),
    }
  })
  const landlordAny = landlord as (Landlord & { joint_first_name?: string | null; joint_email?: string | null }) | undefined
  const greetingName = landlordAny
    ? [landlordAny.first_name, landlordAny.joint_first_name].filter(Boolean).join(' and ') || landlordFormalNames(landlordAny as any)
    : ''
  const billNames = (who: 'landlord' | 'tenant') => (Object.keys(BILL_LABELS) as BillKey[]).filter(k => bills[k] === who).map(k => BILL_LABELS[k])

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/let-only-properties" />} title="Bulk Agreement Generator" />
      <PageHero title="Bulk Agreements" subtitle="Paste tenancy details to make the agreements, or landlord notes to make invoices" />
      <div className="mx-auto max-w-6xl px-lg py-xl">

        {/* ── Step indicator ── */}
        <div className="flex flex-wrap items-center gap-3 mb-xl">
          {(mode === 'invoices' ? ['Paste notes', 'Check invoices', 'Download'] : ['Paste data', 'Confirm', 'Download']).map((label, i) => {
            const stepNum = i + 1
            const current = step === 'paste' ? 1 : step === 'confirm' || step === 'invoices' ? 2 : 3
            const done = stepNum < current
            const active = stepNum === current
            // Earlier steps are clickable so you can always go back (the pasted text and rows are kept)
            const go = stepNum === 1 ? () => setStep('paste')
              : stepNum === 2 && mode === 'agreements' && rows.length ? () => setStep('confirm')
              : stepNum === 2 && mode === 'invoices' && invoiceLines.length ? () => setStep('invoices') : null
            return (
              <div key={label} className={`flex items-center gap-2 ${go && !active ? 'cursor-pointer hover:opacity-80' : ''}`}
                onClick={go && !active ? go : undefined} role={go && !active ? 'button' : undefined}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${
                  done ? 'bg-green-600 text-white' : active ? 'bg-neutral-900 text-white' : 'bg-neutral-300 text-neutral-600'
                }`}>
                  {done ? '✓' : stepNum}
                </div>
                <span className={`text-sm ${active ? 'font-semibold text-neutral-900' : 'text-neutral-500'}`}>{label}</span>
                {i < 2 && <div className="w-10 h-px bg-neutral-300" />}
              </div>
            )
          })}
          {(rows.length > 0 || invoiceLines.length > 0) && (
            <button type="button" className="ml-auto text-sm font-semibold text-neutral-600 hover:text-neutral-900"
              onClick={() => {
                if (!window.confirm('Start a new batch? The pasted text and everything below will be cleared.')) return
                setPasteText(''); setRows([]); setInvoiceLines([]); setInvoiceExtras({}); setGenerated(new Set()); setError(null); setStep('paste')
              }}>
              Start a new batch
            </button>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="mb-lg p-md bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* STEP 1: PASTE */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {step === 'paste' && (
          <div className="space-y-lg">
            {/* Landlord selector */}
            <div className="bg-white rounded-xl border border-neutral-200 p-lg">
              <h2 className="font-semibold text-neutral-900 mb-md">Landlord</h2>
              <LandlordPicker
                landlords={landlords}
                value={selectedLandlordId}
                onChange={setSelectedLandlordId}
              />
            </div>

            {/* Text paste area */}
            <div className="bg-white rounded-xl border border-neutral-200 p-lg">
              <div className="grid grid-cols-2 gap-xs mb-md max-w-md">
                {([['agreements', 'Agreements and invoice'], ['invoices', 'Invoices only']] as const).map(([val, lbl]) => (
                  <button key={val} type="button" onClick={() => setMode(val)}
                    className={`rounded-lg border px-sm py-xs text-sm font-medium ${mode === val ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
              <h2 className="font-semibold text-neutral-900 mb-sm">{mode === 'invoices' ? 'Paste what to invoice' : 'Paste landlord data'}</h2>
              {mode === 'invoices' ? (
              <p className="text-sm text-neutral-500 mb-md">
                For tenancies already set up — no agreements are made. One line per charge with the property, tenant, service, amount and who pays, e.g. “090ROS02 – Margarita – £150 referencing and paperwork (Nigel to pay)”. You’ll get one invoice per property to check before downloading.
              </p>
              ) : (
              <p className="text-sm text-neutral-500 mb-md">
                Paste the landlord's email or notes. Include property address, room numbers, tenant names, rents, deposits, and start dates. The AI will extract the tenancies automatically. You can also note what to invoice, e.g. “plus £25 on room 5 for adding a guarantor as a signer”, and it will be ticked on the invoice.
              </p>
              )}
              <textarea
                className="w-full h-64 rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm text-sm text-neutral-900 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-neutral-400"
                placeholder={"11 HICKS STREET, LONDON, SE8 5AQ  16/10\n\nRoom 1 – Mr Ethan Longford – rent £944.80; deposit £1,090.15\nethanlongfordfx@gmail.com\n\nRoom 2 – Miss Rosa Koivunoro – rent £914.80; deposit £1,055.54\n..."}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
              />
                <div className="flex items-center justify-between mt-md">
                <p className="text-xs text-neutral-400">You can also select the landlord after parsing.</p>
                <button
                  onClick={handleParse}
                  disabled={parsing || !pasteText.trim()}
                  className="px-lg py-sm rounded-lg bg-neutral-900 text-white text-sm font-semibold disabled:opacity-40"
                >
                  {parsing ? 'Reading…' : mode === 'invoices' ? 'Make invoices →' : 'Parse tenancies →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* INVOICES ONLY */}
        {step === 'invoices' && (
          <InvoicesOnly
            key={parseCount}
            lines={invoiceLines}
            landlordName={landlord ? landlordFormalNames(landlord as any) : ''}
            landlordAddress={landlord?.home_address ?? ''}
            landlordEmail={[landlordAny?.email, landlordAny?.joint_email].filter(Boolean).join(', ')}
            landlordGreeting={greetingName}
            propertyCode={p => buildPaymentRef(tidyAddress(p), null).slice(0, -2)}
            tidy={p => tidyAddress(p)}
            onBack={() => setStep('paste')}
          />
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* STEP 2: CONFIRM */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {step === 'confirm' && (
          <div className="space-y-lg">
            {/* Landlord + bank selector at top of confirm screen */}
            <div className="bg-white rounded-xl border border-neutral-200 p-lg">
              <div className="grid grid-cols-2 gap-lg">
                <div className="space-y-md">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Landlord</label>
                    <LandlordPicker
                      landlords={landlords}
                      value={selectedLandlordId}
                      onChange={setSelectedLandlordId}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Parking clause</label>
                    <div className="grid grid-cols-2 gap-xs">
                      {([['apt-ns', 'NIGEL LET ONLY — with parking clause'], ['apt-base', 'NIGEL LET ONLY — no parking clause']] as const).map(([val, lbl]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => { setBatchTemplate(val); setRows(prev => prev.map(r => ({ ...r, template: val }))) }}
                          className={`rounded-lg border px-sm py-xs text-sm font-medium transition-colors ${batchTemplate === val ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400'}`}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-xs">Applies to every room below. Everything else in the agreement stays the same.</p>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Bank account</label>
                  {bankAccounts.length > 0 ? (
                    <select
                      className="w-full rounded-lg border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900"
                      value={globalBankId}
                      onChange={e => {
                        setGlobalBankId(e.target.value)
                        if (e.target.value) setRows(prev => prev.map(r => ({ ...r, bank_account_id: e.target.value })))
                      }}
                    >
                      <option value="">— Apply to all rows —</option>
                      {bankAccounts.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.account_label} — {a.account_name}{a.sort_code ? ` (${a.sort_code})` : ''}
                        </option>
                      ))}
                    </select>
                  ) : selectedLandlordId ? (
                    <div className="space-y-sm">
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-sm py-xs">No saved accounts — enter details below</p>
                      <div className="grid grid-cols-2 gap-sm">
                        <input
                          className="rounded-lg border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900"
                          placeholder="Account name (e.g. J Smith)"
                          value={inlineBank.account_name}
                          onChange={e => setInlineBank(p => ({ ...p, account_name: e.target.value }))}
                        />
                        <input
                          className="rounded-lg border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900"
                          placeholder="Bank (e.g. HSBC)"
                          value={inlineBank.bank_name}
                          onChange={e => setInlineBank(p => ({ ...p, bank_name: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-sm">
                        <input
                          className="rounded-lg border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900"
                          placeholder="Sort code (20-49-76)"
                          value={inlineBank.sort_code}
                          onChange={e => setInlineBank(p => ({ ...p, sort_code: e.target.value }))}
                        />
                        <input
                          className="rounded-lg border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900"
                          placeholder="Account number"
                          value={inlineBank.account_number}
                          onChange={e => setInlineBank(p => ({ ...p, account_number: e.target.value }))}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-400 py-sm">Select a landlord first</p>
                  )}
                </div>
              </div>
            </div>

            {/* Bills configuration */}
            <div className="bg-white rounded-xl border border-neutral-200 p-md">
              <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-sm">Bills — who pays?</p>
              <div className="grid grid-cols-2 gap-xs sm:grid-cols-4">
                {(Object.keys(BILL_LABELS) as BillKey[]).map(k => (
                  <label key={k} className="flex items-center gap-xs cursor-pointer group">
                    <button
                      type="button"
                      onClick={() => setBills(prev => ({ ...prev, [k]: prev[k] === 'landlord' ? 'tenant' : 'landlord' }))}
                      className={`w-full flex items-center justify-between rounded-lg border px-sm py-xs text-xs font-medium transition-colors ${
                        bills[k] === 'landlord'
                          ? 'border-blue-300 bg-blue-50 text-blue-700'
                          : 'border-amber-300 bg-amber-50 text-amber-700'
                      }`}
                    >
                      <span>{BILL_LABELS[k]}</span>
                      <span className="text-[10px] uppercase font-bold">{bills[k] === 'landlord' ? 'LL' : 'T'}</span>
                    </button>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-neutral-400 mt-xs">Applies to every room. LL = landlord pays · T = tenant pays — click to switch.</p>

              <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mt-md mb-sm">Cleaning (communal areas)</p>
              <div className="flex flex-wrap items-center gap-xs">
                <span className="text-[11px] font-semibold text-neutral-500 w-16">Who pays</span>
                {CLEANING_PAYERS.map(([k, label]) => {
                  const on = cleaning.payer === k
                  return (
                    <button key={k} type="button" onClick={() => setCleaning(c => ({ ...c, payer: k }))}
                    className={`rounded-lg border px-sm py-xs text-xs font-medium transition-colors ${
                      on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400'
                    }`}>
                      {label}
                    </button>
                  )
                })}
              </div>
              {cleaning.payer !== 'none' && (
                <div className="flex flex-wrap items-center gap-xs mt-xs">
                  <span className="text-[11px] font-semibold text-neutral-500 w-16">How often</span>
                  {CLEANING_FREQUENCIES.map(([k, label]) => {
                    const on = cleaning.frequency === k
                    return (
                      <button key={k} type="button" onClick={() => setCleaning(c => ({ ...c, frequency: k }))}
                      className={`rounded-lg border px-sm py-xs text-xs font-medium transition-colors ${
                      on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400'
                    }`}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}
              <p className="text-[11px] text-neutral-400 mt-xs">Shown as a row under the bills in every agreement.</p>
            </div>

            {/* Header actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-md">
                <button onClick={() => setStep('paste')} className="text-sm text-neutral-500 hover:text-neutral-700">
                  ← Back
                </button>
                <span className="text-sm text-neutral-500">
                  {selectedCount} of {rows.length} selected
                </span>
              </div>
              <button
                onClick={generateAll}
                disabled={selectedCount === 0}
                className="px-lg py-sm rounded-lg bg-neutral-900 text-white text-sm font-semibold disabled:opacity-40"
              >
                Generate {selectedCount > 0 ? `${selectedCount} ` : ''}Agreement{selectedCount !== 1 ? 's' : ''}
              </button>
            </div>

            {/* Rows */}
            <div className="space-y-md">
              {rows.map(row => {
                const isGenerating = generating.has(row._id)
                const isDone = generated.has(row._id)
                return (
                  <div
                    key={row._id}
                    className={`bg-white rounded-xl border p-lg transition-colors ${
                      isDone ? 'border-green-300 bg-green-50' : row.selected ? 'border-neutral-200' : 'border-neutral-100 opacity-60'
                    }`}
                  >
                    {/* Row header: checkbox + name + status */}
                    <div className="flex items-start gap-md mb-md">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={e => updateRow(row._id, { selected: e.target.checked })}
                        className="mt-1 h-4 w-4 rounded border-neutral-300 accent-neutral-900"
                      />
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-md">
                        {/* Tenant salutation + name */}
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Tenant</label>
                          <div className="flex gap-xs">
                            <select
                              className="w-20 rounded border border-neutral-200 px-xs py-xs text-sm text-neutral-900 bg-white flex-shrink-0"
                              value={row.salutation || ''}
                              onChange={e => updateRow(row._id, { salutation: e.target.value || null })}
                            >
                              <option value="">—</option>
                              <option>Mr</option>
                              <option>Mrs</option>
                              <option>Miss</option>
                              <option>Ms</option>
                              <option>Dr</option>
                              <option>Prof</option>
                              <option>Rev</option>
                              <option>Sir</option>
                            </select>
                            <input
                              className="flex-1 rounded border border-neutral-200 px-sm py-xs text-sm text-neutral-900 bg-white"
                              value={row.tenant_name || ''}
                              onChange={e => updateRow(row._id, { tenant_name: e.target.value })}
                            />
                          </div>
                        </div>
                        {/* Email */}
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Email</label>
                          <input
                            className="w-full rounded border border-neutral-200 px-sm py-xs text-sm text-neutral-900 bg-white"
                            value={row.tenant_email || ''}
                            onChange={e => updateRow(row._id, { tenant_email: e.target.value })}
                          />
                        </div>
                        {/* Property + room */}
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Property / Room</label>
                          <div className="flex gap-xs">
                            <input
                              className="flex-1 rounded border border-neutral-200 px-sm py-xs text-sm text-neutral-900 bg-white"
                              value={row.property_name || ''}
                              onChange={e => updateRow(row._id, { property_name: e.target.value })}
                              placeholder="Address"
                            />
                            <input
                              className="w-14 rounded border border-neutral-200 px-sm py-xs text-sm text-neutral-900 bg-white text-center"
                              type="number"
                              value={row.room_number ?? ''}
                              onChange={e => updateRow(row._id, { room_number: e.target.value ? parseInt(e.target.value) : null })}
                              placeholder="Rm"
                            />
                          </div>
                        </div>
                        {/* Start date */}
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Start date</label>
                          <input
                            className="w-full rounded border border-neutral-200 px-sm py-xs text-sm text-neutral-900 bg-white"
                            value={row.start_date_raw || ''}
                            onChange={e => updateRow(row._id, { start_date_raw: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Second row: rent, deposit, bank, template, action */}
                    <div className="flex items-end gap-md ml-8">
                      {/* Rent */}
                      <div className="w-28">
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Rent / mo</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">£</span>
                          <input
                            className="w-full rounded border border-neutral-200 pl-5 pr-sm py-xs text-sm text-neutral-900 bg-white"
                            type="number"
                            step="0.01"
                            value={row.rent_amount ?? ''}
                            onChange={e => updateRow(row._id, { rent_amount: e.target.value ? parseFloat(e.target.value) : null })}
                          />
                        </div>
                      </div>
                      {/* Deposit */}
                      <div className="w-28">
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Deposit</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">£</span>
                          <input
                            className="w-full rounded border border-neutral-200 pl-5 pr-sm py-xs text-sm text-neutral-900 bg-white"
                            type="number"
                            step="0.01"
                            value={row.deposit_amount ?? ''}
                            onChange={e => updateRow(row._id, { deposit_amount: e.target.value ? parseFloat(e.target.value) : null })}
                          />
                        </div>
                      </div>
                      {/* Payment reference — shown so it can be checked and changed */}
                      <div className="w-36">
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Payment ref</label>
                        <input
                          className="w-full rounded border border-neutral-200 px-sm py-xs font-mono text-sm uppercase text-neutral-900 bg-white"
                          value={row.payment_reference ?? ''}
                          placeholder={row.property_name ? buildPaymentRef(row.property_name, row.room_number) : ''}
                          onChange={e => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9\-\/]/g, '').slice(0, 18); updateRow(row._id, { payment_reference: v || null, ref_source: v ? 'typed' : null }) }}
                          aria-label="Rent payment reference"
                        />
                        <span className={`mt-0.5 block text-[11px] ${row.ref_source === 'cros' ? 'text-green-700' : 'text-neutral-400'}`}>
                          {row.ref_source === 'cros' ? 'From their tenancy in CROS' : row.ref_source === 'typed' ? 'Typed — blank to work it out' : 'Worked out from the address'}
                        </span>
                      </div>
                      {/* Bank account dropdown — hidden when using inline bank */}
                      {bankAccounts.length > 0 ? (
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Bank account</label>
                          <select
                            className="w-full rounded border border-neutral-200 px-sm py-xs text-sm text-neutral-900 bg-white"
                            value={row.bank_account_id || ''}
                            onChange={e => updateRow(row._id, { bank_account_id: e.target.value || null })}
                          >
                            <option value="">— Select account —</option>
                            {bankAccounts.map(a => (
                              <option key={a.id} value={a.id}>
                                {a.account_label} — {a.account_name}
                                {a.sort_code ? ` (${a.sort_code})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : inlineBank.sort_code || inlineBank.account_number ? (
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Bank account</label>
                          <div className="rounded border border-green-200 bg-green-50 px-sm py-xs text-sm text-green-800">
                            ✓ {inlineBank.account_name || 'Account'} · {inlineBank.sort_code}
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Bank account</label>
                          <div className="rounded border border-amber-200 bg-amber-50 px-sm py-xs text-sm text-amber-700">
                            Enter bank details above
                          </div>
                        </div>
                      )}
                      {/* Template */}
                      <div className="w-32">
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Parking</label>
                        <select
                          className="w-full rounded border border-neutral-200 px-sm py-xs text-sm text-neutral-900 bg-white"
                          value={row.template}
                          onChange={e => updateRow(row._id, { template: e.target.value as 'apt-base' | 'apt-ns' | 'apt-ct' })}
                        >
                          <option value="apt-ns">Nigel let only — with parking</option>
                          <option value="apt-base">Nigel let only — no parking</option>
                        </select>
                      </div>
                      {/* Generate button per row */}
                      <div className="flex-shrink-0">
                        {isDone ? (
                          <span className="inline-flex items-center gap-1 text-green-700 text-sm font-medium">
                            ✓ Downloaded
                          </span>
                        ) : (
                          <button
                            onClick={() => generateDocx(row)}
                            disabled={isGenerating || !row.selected || (!row.bank_account_id && !(inlineBank.sort_code && inlineBank.account_number))}
                            className="px-md py-xs rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-900 text-sm font-medium disabled:opacity-40"
                          >
                            {isGenerating ? '…' : 'Download'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Notes */}
                    {row.notes && (
                      <p className="text-xs text-neutral-400 mt-sm ml-8">{row.notes}</p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* No bank accounts warning */}
            {bankAccounts.length === 0 && selectedLandlordId && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-md text-sm text-amber-800">
                No bank accounts saved for this landlord. Go to the landlord's record in People to add them.
              </div>
            )}
            {!selectedLandlordId && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-md text-sm text-amber-800">
                Select a landlord above to load their bank accounts, then select one per row before generating.
              </div>
            )}

            {/* Invoice the landlord */}
            {(() => {
              const toggle = (id: string, code: FeeCode) =>
                setInvoiceExtras(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), [code]: !(prev[id]?.[code]) } }))

              async function saveAddress() {
                if (!landlord || !invoiceAddress.trim()) return
                setInvoiceBusy('save'); setInvoiceMsg(null)
                const { data: saved, error } = await (supabase.from('people') as any).update({ home_address: invoiceAddress.trim() }).eq('id', landlord.id).select('id')
                if (error || !saved?.length) setInvoiceMsg({ ok: false, text: `Could not save the address: ${error?.message ?? 'no permission to update this landlord'}` })
                else {
                  setLandlords(prev => prev.map(l => l.id === landlord.id ? { ...l, home_address: invoiceAddress.trim() } : l))
                  setInvoiceMsg({ ok: true, text: 'Address saved to the landlord’s record' })
                }
                setInvoiceBusy('')
              }

              async function downloadInvoice() {
                setInvoiceBusy('pdf'); setInvoiceMsg(null)
                try {
                  const res = await adminFetch('/api/admin/landlord-invoice', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(invoiceBody()),
                  })
                  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Could not create the invoice') }
                  const url = URL.createObjectURL(await res.blob())
                  const a = document.createElement('a'); a.href = url; a.download = `Invoice ${invoiceNumber}.pdf`; a.click()
                  setTimeout(() => URL.revokeObjectURL(url), 5000)
                  setInvoiceMsg({ ok: true, text: `Invoice ${invoiceNumber} downloaded` })
                } catch (e) {
                  setInvoiceMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not create the invoice' })
                } finally { setInvoiceBusy('') }
              }

              return (
                <div className="bg-white rounded-xl border border-neutral-200 p-lg space-y-md">
                  <div>
                    <p className="text-sm font-bold text-neutral-900">Invoice the landlord</p>
                    <p className="text-xs text-neutral-500 mt-xs">Charges for the paperwork in this batch. Each selected room includes the agreement; tick any extras.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Correspondence address {landlord ? `— ${landlordFormalNames(landlord as any)}` : ''}</label>
                    <textarea rows={3} value={invoiceAddress} onChange={e => setInvoiceAddress(e.target.value)}
                      placeholder={'House number and street\nTown\nPostcode'}
                      className="w-full rounded-lg border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900" />
                    <div className="flex flex-wrap items-center gap-sm mt-xs">
                      {landlord && invoiceAddress.trim() !== (landlord.home_address ?? '').trim() && (
                        <button type="button" onClick={saveAddress} disabled={!!invoiceBusy || !invoiceAddress.trim()}
                          className="text-xs font-semibold rounded-lg border border-neutral-300 px-sm py-xs hover:bg-neutral-50 disabled:opacity-40">
                          {invoiceBusy === 'save' ? 'Saving…' : 'Save to landlord record'}
                        </button>
                      )}
                      {landlord && !landlord.home_address && <span className="text-xs text-amber-700">No correspondence address on file for this landlord yet.</span>}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-neutral-500 text-left">
                          <th className="py-xs pr-sm font-semibold">Room</th>
                          <th className="py-xs px-sm font-semibold text-center">Agreement £{FEES.agreement.amount}</th>
                          <th className="py-xs px-sm font-semibold text-center">Tenant ref £{FEES.tenant_reference.amount}</th>
                          <th className="py-xs px-sm font-semibold text-center">Guarantor signer £{FEES.guarantor_signatory.amount}</th>
                          <th className="py-xs px-sm font-semibold text-center">Guarantor ref £{FEES.guarantor_reference.amount}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {invoiceRows.map(r => (
                          <tr key={r._id}>
                            <td className="py-xs pr-sm text-neutral-800 whitespace-nowrap">{r.room_number != null ? `Room ${r.room_number} · ` : ''}{r.tenant_name}</td>
                            <td className="py-xs px-sm text-center text-green-700">✓</td>
                            {(['tenant_reference', 'guarantor_signatory', 'guarantor_reference'] as FeeCode[]).map(code => (
                              <td key={code} className="py-xs px-sm text-center">
                                <input type="checkbox" checked={!!invoiceExtras[r._id]?.[code]} onChange={() => toggle(r._id, code)} className="w-4 h-4" />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {invoiceMsg && (
                    <div className={`rounded-lg border px-md py-xs text-sm ${invoiceMsg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{invoiceMsg.text}</div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-md pt-sm border-t border-neutral-100">
                    <p className="text-sm text-neutral-700">Invoice <span className="font-mono">{invoiceNumber}</span> · <strong>{formatCurrency(total)}</strong> for {items.length} item{items.length !== 1 ? 's' : ''}</p>
                    <button type="button" onClick={downloadInvoice}
                      disabled={!!invoiceBusy || !landlord || !items.length || !invoiceAddress.trim()}
                      className="rounded-lg bg-neutral-900 text-white px-lg py-sm text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40">
                      {invoiceBusy === 'pdf' ? 'Creating…' : 'Download invoice (PDF)'}
                    </button>
                  </div>
                  {(!landlord || !invoiceAddress.trim()) && <p className="text-xs text-neutral-400">{!landlord ? 'Choose the landlord above.' : 'Add the correspondence address to create the invoice.'}</p>}
                </div>
              )
            })()}

            {/* Review and send to the landlord */}
            {sendDocs.length > 0 && selectedLandlordId && (
              <SendToLandlord
                agreements={sendDocs}
                invoice={landlord && invoiceAddress.trim() && items.length ? invoiceBody() : null}
                invoiceIssue={!invoiceAddress.trim() ? 'add the correspondence address above to attach it' : undefined}
                invoiceTotal={formatCurrency(total)}
                defaultTo={[landlordAny?.email, landlordAny?.joint_email].filter((e): e is string => !!e)}
                greetingName={greetingName}
                property={property}
                tenantBills={billNames('tenant')}
                landlordBills={billNames('landlord')}
                cleaning={cleaning}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
