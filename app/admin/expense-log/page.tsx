'use client'

/**
 * /admin/expense-log — Landlord expenses.
 *
 * "To come off statements": expenses logged but not yet on a landlord statement, with the statement each will
 * come off (lib/expenses/period). "All expenses": every expense on record — logged here or imported from past
 * statements — filterable by property, tax year, when it was dated and which statement took it, with totals by
 * UK tax year and CSV/PDF export. Adding an expense checks for duplicates (lib/expenses/duplicates), numbers it
 * (EXP000123, given by the database), and can carry the supplier's invoice (private) to send with the statement.
 * Nothing is deleted: a mistake is voided with a reason and stays on record.
 */

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import { adminFetch } from '@/lib/adminFetch'
import AppBar from '@/components/AppBar'
import PageHero, { HeroButton } from '@/components/PageHero'
import { financeTabs } from '@/lib/financeTabs'
import BackButton from '@/app/components/BackButton'
import ExportButtons, { type ExportColumn } from '@/app/components/ExportButtons'
import { sortPropertiesNumerically } from '@/lib/sortProperties'
import { PROPERTY_WIDE_CATEGORIES, ROOM_SPECIFIC_CATEGORY_TYPES, categoryLabel } from '@/lib/expense-categories'

interface Row {
  id: string; kind: 'logged' | 'statement'; property_id: string; property: string; date: string; description: string; amount: number
  category: string | null; supplier: string | null; invoice_number: string | null; has_invoice: boolean; share_invoice: boolean
  reference: string | null; statement: string | null; deduct_month: string | null; comes_off?: string; voided?: boolean; void_reason?: string | null
  room_label?: string | null
  paid_on?: string | null; paid_how?: string | null; paid_ref?: string | null
  deducted_on?: string | null; reimbursed_on?: string | null
}
interface Property { id: string; name: string; address: string; property_code?: string | null }
interface Dup { level: string; reason: string; description: string; amount: number; date: string; where: string }

const gbp = (n: number) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ukDate = (d: string) => new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const monthName = (m: string) => new Date(m.slice(0, 7) + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const firstLine = (s: string) => String(s || '').split('\n')[0]
const taxYearOf = (d: string) => { const y = Number(d.slice(0, 4)); return d.slice(5) >= '04-06' ? y : y - 1 }
const taxYearLabel = (y: number) => `${y}/${String(y + 1).slice(2)}`
const addMonths = (month: string, n: number) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10) }
const CATEGORIES = [...PROPERTY_WIDE_CATEGORIES.map(c => ({ slug: c.slug, label: c.label })), ...ROOM_SPECIFIC_CATEGORY_TYPES.map(c => ({ slug: c.slug, label: `Room: ${c.label}` }))]

const EMPTY_FORM = { property_id: '', room_id: '', description: '', supplier: '', category: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), invoice_number: '', notes: '', deduct_month: '', share_invoice: false, paid_to_supplier_on: '', supplier_payment_method: '', supplier_payment_ref: '', cost_amount: '' }
const HOW: Record<string, string> = { card: 'card', bank_transfer: 'bank transfer', cash: 'cash', direct_debit: 'direct debit' }

export default function ExpensesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [byTaxYear, setByTaxYear] = useState<Record<string, number>>({})
  const [properties, setProperties] = useState<Property[]>([])
  const [tab, setTab] = useState<'pending' | 'all'>('pending')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // filters (All expenses)
  const [fProperty, setFProperty] = useState('')
  const [fYear, setFYear] = useState<string>('')
  const [fBy, setFBy] = useState<'dated' | 'deducted' | 'reimbursed'>('dated')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [fText, setFText] = useState('')
  const [showVoided, setShowVoided] = useState(false)

  // add form
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [dups, setDups] = useState<Dup[] | null>(null)

  async function load() {
    const r = await adminFetch('/api/admin/expenses')
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error || 'Could not load expenses'); return }
    setRows(j.rows || []); setByTaxYear(j.byTaxYear || {})
  }

  useEffect(() => {
    (async () => {
      const u = await getCurrentUser()
      if (!u || !['administrator', 'admin'].includes(u.assignment?.role || '')) { router.push('/login'); return }
      const { data: props } = await createClient().from('properties').select('id, name, address, property_code').order('name')
      setProperties(sortPropertiesNumerically(props || []))
      await load()
      setLoading(false)
    })()
  }, [router])

  // bills and invoices waiting in Capture (photographed or emailed) — they become expenses only when filed there
  const [toFile, setToFile] = useState<{ bills: number; emailed: number } | null>(null)
  useEffect(() => { fetch('/api/admin/capture?count=1').then(r => r.json()).then(d => setToFile(d)).catch(() => {}) }, [])

  useEffect(() => {
    if (!form.property_id) { setRooms([]); return }
    createClient().from('rooms').select('id, name').eq('property_id', form.property_id).order('name')
      .then(({ data }) => setRooms(((data || []) as any[]).sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }))))
  }, [form.property_id])

  const pending = useMemo(() => rows.filter(r => r.kind === 'logged' && !r.statement && !r.voided), [rows])
  const pendingGroups = useMemo(() => {
    const g = new Map<string, { property: string; rows: Row[] }>()
    for (const r of pending) { const x = g.get(r.property_id) ?? { property: r.property, rows: [] }; x.rows.push(r); g.set(r.property_id, x) }
    const order = new Map(properties.map((p, i) => [p.id, i]))
    return [...g.entries()].sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999))
  }, [pending, properties])

  const years = useMemo(() => [...new Set(rows.map(r => taxYearOf(r.date)))].sort((a, b) => b - a), [rows])
  const deductedMonth = (r: Row) => (r.statement ? r.date.slice(0, 7) : r.comes_off?.slice(0, 7) ?? '')
  const filtered = useMemo(() => rows.filter(r => {
    if (!showVoided && r.voided) return false
    if (fProperty && r.property_id !== fProperty) return false
    if (fYear && taxYearOf(r.date) !== Number(fYear)) return false
    const key = fBy === 'dated' ? r.date.slice(0, 10) : fBy === 'reimbursed' ? (r.reimbursed_on ?? '') : (r.deducted_on ? r.deducted_on.slice(0, 10) : deductedMonth(r) ? deductedMonth(r) + '-01' : '')
    if (fFrom && (!key || key < fFrom)) return false
    if (fTo && (!key || key > fTo)) return false
    if (fText && !`${r.description} ${r.supplier ?? ''} ${r.reference ?? ''} ${r.invoice_number ?? ''} ${r.statement ?? ''} ${categoryLabel(r.category || '')}`.toLowerCase().includes(fText.toLowerCase())) return false
    return true
  }), [rows, fProperty, fYear, fBy, fFrom, fTo, fText, showVoided])
  const filteredTotal = filtered.filter(r => !r.voided).reduce((t, r) => t + r.amount, 0)

  const exportColumns: ExportColumn[] = [
    { key: 'reference', label: 'No.' }, { key: 'date', label: 'Dated' }, { key: 'property', label: 'Property' },
    { key: 'description', label: 'What for' }, { key: 'category', label: 'Category' }, { key: 'supplier', label: 'Supplier' },
    { key: 'invoice_number', label: 'Invoice no.' }, { key: 'paid', label: 'Supplier paid' }, { key: 'amount', label: 'Amount', money: true }, { key: 'statement', label: 'Statement' }, { key: 'reimbursed', label: 'Paid back to office' }, { key: 'status', label: 'Status' },
  ]
  const exportRows = (list: Row[]) => list.map(r => ({
    ...r, date: ukDate(r.date), category: r.category ? categoryLabel(r.category) : '', reimbursed: r.reimbursed_on ? ukDate(r.reimbursed_on) : '', paid: r.paid_on ? `${ukDate(r.paid_on)}${r.paid_how ? ' ' + HOW[r.paid_how] : ''}${r.paid_ref ? ' ' + r.paid_ref : ''}` : '',
    statement: r.statement ?? (r.comes_off ? `Due: ${monthName(r.comes_off)}` : ''),
    status: r.voided ? `Voided: ${r.void_reason ?? ''}` : r.kind === 'statement' ? 'On an imported statement' : r.statement ? 'Deducted' : 'Waiting for statement',
  }))
  const filterLabel = [fProperty ? firstLine(properties.find(p => p.id === fProperty)?.name || '') : 'All properties', fYear ? `Tax year ${taxYearLabel(Number(fYear))}` : null,
    fFrom || fTo ? `${fBy === 'dated' ? 'Dated' : 'Deducted'} ${fFrom ? 'from ' + ukDate(fFrom) : ''} ${fTo ? 'to ' + ukDate(fTo) : ''}`.trim() : null, fText ? `“${fText}”` : null].filter(Boolean).join(' · ')

  async function save(confirmDuplicate = false) {
    setFormError('')
    if (!form.property_id || !form.description.trim() || !form.amount) { setFormError('Property, what it was for, and the amount are needed.'); return }
    setSaving(true)
    try {
      let invoice_path: string | null = null
      if (file) {
        const r = await adminFetch('/api/admin/expenses/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name }) })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Could not upload the invoice')
        const { error: upErr } = await createClient().storage.from('finance-docs').uploadToSignedUrl(j.path, j.token, file, { contentType: file.type || undefined })
        if (upErr) throw new Error('The invoice didn’t upload: ' + upErr.message)
        invoice_path = j.path
      }
      const r = await adminFetch('/api/admin/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, room_id: form.room_id || null, category: form.category || null, deduct_month: form.deduct_month || null, amount: Number(form.amount), cost_amount: form.cost_amount === '' ? null : Number(form.cost_amount),
          invoice_path, invoice_name: file?.name ?? null, share_invoice: !!file && form.share_invoice, confirm_duplicate: confirmDuplicate }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.status === 409 && j.duplicates) { setDups(j.duplicates); return }
      if (!r.ok) throw new Error(j.error || 'Could not add the expense')
      setNotice(j.message); setShowForm(false); setDups(null); setForm({ ...EMPTY_FORM }); setFile(null)
      await load()
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not add the expense') }
    finally { setSaving(false) }
  }

  async function voidExpense(r: Row) {
    const reason = window.prompt(`Void ${r.reference ?? 'this expense'} (${gbp(r.amount)} — ${r.description})?\n\nIt stays on record, marked void. Why?`)
    if (!reason) return
    const res = await adminFetch(`/api/admin/expenses/${r.id}?reason=${encodeURIComponent(reason)}`, { method: 'DELETE' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setError(j.error || 'Could not void it'); return }
    setNotice(j.message); await load()
  }
  async function patch(r: Row, body: Record<string, unknown>) {
    const res = await adminFetch(`/api/admin/expenses/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setError(j.error || 'Could not save'); return }
    setNotice(j.message); await load()
  }
  async function openInvoice(r: Row) {
    const res = await adminFetch(`/api/admin/expenses/invoice?expense_id=${r.id}`)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setError(j.error || 'Could not open the invoice'); return }
    window.open(j.url, '_blank', 'noopener')
  }

  const input = 'w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900'
  const label = 'block text-xs font-semibold text-neutral-700 mb-xs'
  const thisMonth = new Date().toISOString().slice(0, 7) + '-01'
  const monthChoices = [0, 1, 2, 3].map(n => addMonths(form.expense_date ? form.expense_date.slice(0, 7) + '-01' : thisMonth, n - 1))

  if (loading) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} title="Expenses" />
      <div className="mx-auto max-w-6xl px-lg py-xl animate-pulse space-y-sm">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-neutral-200" />)}</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} title="Expenses" />
      <PageHero title="Expenses" subtitle="Money spent on a property that comes off the landlord’s statement — each is numbered (EXP…) and never deleted; mistakes are voided"
        stats={[{ label: 'To come off statements', value: pending.length, tone: pending.length ? 'warn' : undefined }]}
        actions={<><HeroButton href="/admin/ops-account">Operations account CSV</HeroButton><HeroButton href="/admin/reports/resold">Mark-ups</HeroButton><HeroButton primary onClick={() => { setShowForm(true); setDups(null); setFormError('') }}>+ Add expense</HeroButton></>}
        tabs={financeTabs('expenses')} />
      <div className="mx-auto max-w-6xl px-lg py-xl">

        {toFile && toFile.bills > 0 && (
          <a href="/admin/capture" className="mb-md flex items-center justify-between gap-sm rounded-xl border border-amber-300 bg-amber-50 px-lg py-sm text-sm text-amber-900 hover:bg-amber-100">
            <span><b>{toFile.bills} bill{toFile.bills === 1 ? '' : 's'} or invoice{toFile.bills === 1 ? '' : 's'} waiting to be filed</b>{toFile.emailed ? ` (${toFile.emailed} emailed in)` : ''} — say which property and statement, or that it’s a company cost.</span>
            <span className="font-semibold">Open Capture →</span>
          </a>
        )}
        {notice && <p className="mb-md rounded-xl border border-green-200 bg-green-50 px-lg py-md text-sm font-semibold text-green-800">{notice}</p>}
        {error && <p className="mb-md rounded-xl border border-red-200 bg-red-50 px-lg py-md text-sm text-red-700">{error}</p>}

        <div className="mb-lg inline-flex rounded-xl bg-white p-1 text-sm font-semibold shadow-sm">
          <button onClick={() => setTab('pending')} className={`rounded-lg px-lg py-sm ${tab === 'pending' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>To come off statements ({pending.length})</button>
          <button onClick={() => setTab('all')} className={`rounded-lg px-lg py-sm ${tab === 'all' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>All expenses</button>
        </div>

        {tab === 'pending' && (
          <>
            <div className="mb-md flex flex-wrap items-center justify-between gap-md">
              <p className="text-sm text-neutral-600">Waiting to go on a landlord statement: <strong>{gbp(pending.reduce((t, r) => t + r.amount, 0))}</strong></p>
              <ExportButtons title="Expenses to come off statements" filename="expenses-to-come-off-statements" columns={exportColumns} rows={exportRows(pending)}
                totals={{ description: 'Total', amount: pending.reduce((t, r) => t + r.amount, 0) }} />
            </div>
            {pendingGroups.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-2xl text-center text-sm text-neutral-500">Nothing waiting — every expense logged is already on a statement.</div>
            ) : (
              <div className="space-y-md">
                {pendingGroups.map(([pid, g]) => (
                  <div key={pid} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                    <div className="flex items-center justify-between border-b border-neutral-100 px-lg py-md">
                      <p className="text-sm font-bold text-neutral-900">{firstLine(g.property)}</p>
                      <p className="text-sm font-bold tabular-nums text-neutral-900">{gbp(g.rows.reduce((t, r) => t + r.amount, 0))}</p>
                    </div>
                    <div className="divide-y divide-neutral-100">
                      {g.rows.map(r => (
                        <div key={r.id} className="flex flex-wrap items-center gap-md px-lg py-sm">
                          <div className="min-w-[220px] flex-1">
                            <p className="text-sm text-neutral-900"><span className="font-mono text-xs text-neutral-500">{r.reference}</span> {r.description}</p>
                            <p className="text-xs text-neutral-500">{ukDate(r.date)}{r.supplier ? ` · ${r.supplier}` : ''}{r.invoice_number ? ` · inv ${r.invoice_number}` : ''}{r.category ? ` · ${categoryLabel(r.category)}` : ''}{r.paid_on ? ` · paid ${ukDate(r.paid_on)}${r.paid_how ? ' by ' + HOW[r.paid_how] : ''}${r.paid_ref ? ' (' + r.paid_ref + ')' : ''}` : ' · supplier payment not recorded'}</p>
                          </div>
                          <label className="text-xs text-neutral-600">Comes off{' '}
                            <select value={r.comes_off?.slice(0, 10) ?? ''} onChange={e => patch(r, { deduct_month: e.target.value })} className="rounded-md border border-neutral-300 bg-white px-xs py-0.5 text-xs">
                              {[...new Set([r.comes_off?.slice(0, 10), ...[0, 1, 2].map(n => addMonths((r.comes_off || thisMonth).slice(0, 7) + '-01', n))])].filter(Boolean).map(m => <option key={m} value={m!}>{monthName(m!)}</option>)}
                            </select>
                          </label>
                          {r.has_invoice ? (
                            <span className="flex items-center gap-xs text-xs">
                              <button onClick={() => openInvoice(r)} className="font-semibold text-indigo-700 underline">Invoice</button>
                              <label className="flex items-center gap-xs text-neutral-600"><input type="checkbox" checked={r.share_invoice} onChange={e => patch(r, { share_invoice: e.target.checked })} /> send with statement</label>
                            </span>
                          ) : <span className="text-xs text-neutral-400">No invoice</span>}
                          <span className="w-24 text-right text-sm font-semibold tabular-nums text-neutral-900">{gbp(r.amount)}</span>
                          <button onClick={() => voidExpense(r)} className="text-xs font-semibold text-neutral-400 hover:text-red-600">Void</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'all' && (
          <>
            <div className="mb-md grid gap-sm rounded-2xl border border-neutral-200 bg-white p-md sm:grid-cols-2 lg:grid-cols-6">
              <label className="lg:col-span-2"><span className={label}>Property</span>
                <select value={fProperty} onChange={e => setFProperty(e.target.value)} className={input}>
                  <option value="">All properties</option>{properties.map(p => <option key={p.id} value={p.id}>{firstLine(p.name)}</option>)}
                </select></label>
              <label><span className={label}>Tax year</span>
                <select value={fYear} onChange={e => setFYear(e.target.value)} className={input}>
                  <option value="">All years</option>{years.map(y => <option key={y} value={y}>{taxYearLabel(y)}</option>)}
                </select></label>
              <label><span className={label}>Dates are</span>
                <select value={fBy} onChange={e => setFBy(e.target.value as 'dated' | 'deducted' | 'reimbursed')} className={input}>
                  <option value="dated">When it was dated</option><option value="deducted">When it came off a statement</option><option value="reimbursed">When it was paid back to the office</option>
                </select></label>
              <label><span className={label}>From</span><input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} className={input} /></label>
              <label><span className={label}>To</span><input type="date" value={fTo} onChange={e => setFTo(e.target.value)} className={input} /></label>
              <label className="sm:col-span-2 lg:col-span-4"><span className={label}>Search</span><input value={fText} onChange={e => setFText(e.target.value)} placeholder="Description, supplier, EXP number, invoice number, statement…" className={input} /></label>
              <label className="flex items-end gap-sm pb-sm text-sm text-neutral-700 lg:col-span-2"><input type="checkbox" checked={showVoided} onChange={e => setShowVoided(e.target.checked)} /> Show voided</label>
            </div>

            <div className="mb-md flex flex-wrap items-center justify-between gap-md">
              <p className="text-sm text-neutral-600">{filtered.length} expense{filtered.length === 1 ? '' : 's'} · <strong>{gbp(filteredTotal)}</strong>
                {Object.keys(byTaxYear).length > 0 && !fYear && <span className="ml-sm text-xs text-neutral-500">(by tax year: {Object.entries(byTaxYear).sort().reverse().map(([y, v]) => `${y} ${gbp(v)}`).join(' · ')})</span>}
              </p>
              <ExportButtons title="Expenses" subtitle={filterLabel} filename={`expenses${fYear ? '-' + taxYearLabel(Number(fYear)).replace('/', '-') : ''}`} columns={exportColumns}
                rows={exportRows(filtered)} totals={{ description: 'Total', amount: filteredTotal }} />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-900 text-left text-xs font-bold text-white">
                  <tr>{['No.', 'Dated', 'Property', 'What for', 'Supplier', 'Amount', 'Statement', ''].map(h => <th key={h} className={`px-md py-sm ${h === 'Amount' ? 'text-right' : ''}`}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filtered.map(r => (
                    <tr key={r.kind + r.id} className={r.voided ? 'text-neutral-400 line-through' : 'text-neutral-900'}>
                      <td className="whitespace-nowrap px-md py-sm font-mono text-xs">{r.reference ?? (r.kind === 'statement' ? 'imported' : '')}</td>
                      <td className="whitespace-nowrap px-md py-sm">{ukDate(r.date)}</td>
                      <td className="px-md py-sm">{firstLine(r.property)}</td>
                      <td className="px-md py-sm">{r.description}{r.category ? <span className="ml-xs text-xs text-neutral-500">· {categoryLabel(r.category)}</span> : null}{r.voided ? <span className="ml-xs text-xs no-underline">(void: {r.void_reason})</span> : null}</td>
                      <td className="px-md py-sm">{r.supplier ?? ''}{r.invoice_number ? <span className="block text-xs text-neutral-500">inv {r.invoice_number}</span> : null}</td>
                      <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">{gbp(r.amount)}</td>
                      <td className="whitespace-nowrap px-md py-sm text-xs">{r.statement ?? (r.comes_off ? <span className="text-amber-700">Due {monthName(r.comes_off)}</span> : '')}</td>
                      <td className="whitespace-nowrap px-md py-sm text-xs">{r.has_invoice && <button onClick={() => openInvoice(r)} className="font-semibold text-indigo-700 underline">Invoice</button>}</td>
                    </tr>
                  ))}
                  {!filtered.length && <tr><td colSpan={8} className="px-md py-xl text-center text-sm text-neutral-500">No expenses match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-md" onClick={() => !saving && setShowForm(false)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-lg" onClick={e => e.stopPropagation()}>
            <div className="mb-md flex items-center justify-between">
              <h2 className="text-lg font-bold text-neutral-900">Add expense</h2>
              <button onClick={() => setShowForm(false)} className="text-2xl leading-none text-neutral-400 hover:text-neutral-700" aria-label="Close">×</button>
            </div>
            {dups ? (
              <div className="space-y-md">
                <p className="text-sm font-semibold text-amber-800">This looks like it may already be on record:</p>
                {dups.map((d, i) => (
                  <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-md py-sm text-sm">
                    <p className="font-semibold text-neutral-900">{d.description} — {gbp(d.amount)}</p>
                    <p className="text-xs text-neutral-600">{d.where} · {d.reason}</p>
                  </div>
                ))}
                <div className="flex gap-sm">
                  <button onClick={() => setDups(null)} className="flex-1 rounded-lg border border-neutral-300 py-sm text-sm font-semibold text-neutral-700">Go back and check</button>
                  <button disabled={saving} onClick={() => save(true)} className="flex-1 rounded-lg bg-neutral-900 py-sm text-sm font-bold text-white disabled:bg-neutral-300">{saving ? 'Adding…' : 'It’s different — add it'}</button>
                </div>
              </div>
            ) : (
              <div className="space-y-md">
                <label className="block"><span className={label}>Property</span>
                  <select value={form.property_id} onChange={e => setForm({ ...form, property_id: e.target.value, room_id: '' })} className={input}>
                    <option value="">Choose…</option>{properties.map(p => <option key={p.id} value={p.id}>{firstLine(p.name)}</option>)}
                  </select></label>
                {rooms.length > 0 && (
                  <label className="block"><span className={label}>Room <span className="font-normal text-neutral-400">(if it’s for one room)</span></span>
                    <select value={form.room_id} onChange={e => setForm({ ...form, room_id: e.target.value })} className={input}>
                      <option value="">Whole property</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select></label>
                )}
                <label className="block"><span className={label}>What it was for</span>
                  <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. Cleaning October, Roof repair – ridge tiles" className={input} /></label>
                <div className="grid grid-cols-2 gap-md">
                  <label className="block"><span className={label}>Supplier</span><input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} className={input} /></label>
                  <label className="block"><span className={label}>Category</span>
                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={input}>
                      <option value="">Choose…</option>{CATEGORIES.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}<option value="other">Other</option>
                    </select></label>
                  <label className="block"><span className={label}>Charge the landlord (£)</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className={input} /></label>
                  <label className="block"><span className={label}>What it cost us <span className="font-normal text-neutral-400">(if different)</span></span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.cost_amount} onChange={e => setForm({ ...form, cost_amount: e.target.value })} placeholder={form.amount || ''} className={input} />
                    {form.cost_amount !== '' && Number(form.amount) > 0 && Number(form.cost_amount) > 0 && Number(form.cost_amount) !== Number(form.amount) && <span className="mt-xs block text-xs text-neutral-500">{Number(form.amount) > Number(form.cost_amount) ? `Mark-up £${(Number(form.amount) - Number(form.cost_amount)).toFixed(2)} — shown in Mark-ups` : `£${(Number(form.cost_amount) - Number(form.amount)).toFixed(2)} less than it cost`}</span>}</label>
                  <label className="block"><span className={label}>Date on the invoice</span><input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} className={input} /></label>
                  <label className="block"><span className={label}>Invoice number</span><input value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} className={input} /></label>
                  <label className="block"><span className={label}>Comes off the statement for</span>
                    <select value={form.deduct_month} onChange={e => setForm({ ...form, deduct_month: e.target.value })} className={input}>
                      <option value="">The next one still open</option>{monthChoices.map(m => <option key={m} value={m}>{monthName(m)}</option>)}
                    </select></label>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-md">
                  <span className={label}>Invoice or receipt <span className="font-normal text-neutral-400">(PDF or photo — kept private)</span></span>
                  <input type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
                  {file && <label className="mt-sm flex items-center gap-sm text-sm text-neutral-700"><input type="checkbox" checked={form.share_invoice} onChange={e => setForm({ ...form, share_invoice: e.target.checked })} /> Send it to the landlord with their statement</label>}
                </div>
                <div className="grid grid-cols-3 gap-sm rounded-lg border border-neutral-200 p-md">
                  <span className="col-span-3 text-xs font-semibold text-neutral-700">How we paid the supplier <span className="font-normal text-neutral-400">(for the audit trail)</span></span>
                  <input type="date" value={form.paid_to_supplier_on} onChange={e => setForm({ ...form, paid_to_supplier_on: e.target.value })} className={input} aria-label="Date paid" />
                  <select value={form.supplier_payment_method} onChange={e => setForm({ ...form, supplier_payment_method: e.target.value })} className={input} aria-label="How paid">
                    <option value="">How…</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="direct_debit">Direct debit</option>
                  </select>
                  <input value={form.supplier_payment_ref} onChange={e => setForm({ ...form, supplier_payment_ref: e.target.value })} placeholder="Payment ref" className={input} />
                </div>
                <label className="block"><span className={label}>Notes <span className="font-normal text-neutral-400">(office only)</span></span><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={input} /></label>
                {formError && <p className="rounded-lg bg-red-50 px-md py-sm text-sm text-red-700">{formError}</p>}
                <button disabled={saving} onClick={() => save(false)} className="w-full rounded-lg bg-neutral-900 py-md text-sm font-bold text-white disabled:bg-neutral-300">{saving ? 'Adding…' : 'Add expense'}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
