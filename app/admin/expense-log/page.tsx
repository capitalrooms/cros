'use client'

/**
 * /admin/expense-log — Recharge expense tracker.
 *
 * Log ad-hoc expenses as they happen throughout the month.
 * At month end, send the full list to accounts@capitalrooms.co.uk
 * for processing into the finance software.
 */

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

interface Expense {
  id: string
  property_id: string
  description: string
  amount: number
  expense_date: string
  notes: string | null
  sent_at: string | null
  created_at: string
  properties?: { id: string; name: string; address: string } | null
}

interface Property {
  id: string
  name: string
  address: string
}

const gbp = (n: number) => `£${parseFloat(String(n)).toFixed(2)}`

function toMonthStr(isoDate: string) {
  return isoDate?.slice(0, 7) || ''
}

function monthLabel(ym: string) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

export default function ExpenseTrackerPage() {
  const router = useRouter()
  const [loading, setLoading]         = useState(true)
  const [expenses, setExpenses]       = useState<Expense[]>([])
  const [properties, setProperties]   = useState<Property[]>([])
  const [selectedMonth, setSelectedMonth] = useState(currentMonth())

  // Add form
  const [showForm, setShowForm]       = useState(false)
  const [formProperty, setFormProperty] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formAmount, setFormAmount]   = useState('')
  const [formDate, setFormDate]       = useState(new Date().toISOString().slice(0, 10))
  const [formNotes, setFormNotes]     = useState('')
  const [saving, setSaving]           = useState(false)
  const [formError, setFormError]     = useState('')

  // Send
  const [sending, setSending]         = useState(false)
  const [sendResult, setSendResult]   = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || !['administrator', 'admin'].includes(data.assignment?.role || '')) {
        router.push('/login'); return
      }
      const supabase = createClient()
      const [{ data: expData }, { data: propData }] = await Promise.all([
        supabase
          .from('recharge_expenses')
          .select('*, properties(id, name, address)')
          .order('expense_date', { ascending: false })
          .limit(500),
        supabase.from('properties').select('id, name, address').order('name'),
      ])
      setExpenses((expData || []) as Expense[])
      setProperties(sortPropertiesNumerically(propData || []))
      setLoading(false)
    }
    init()
  }, [router])

  // Filter to selected month
  const monthExpenses = useMemo(() =>
    expenses.filter(e => toMonthStr(e.expense_date) === selectedMonth),
    [expenses, selectedMonth]
  )

  const unsentExpenses = monthExpenses.filter(e => !e.sent_at)
  const sentExpenses   = monthExpenses.filter(e => e.sent_at)

  // Group by property (numerically sorted)
  function groupByProperty(list: Expense[]) {
    const grouped: Record<string, { prop: Property; rows: Expense[] }> = {}
    for (const e of list) {
      const prop = (e.properties as any) || { id: e.property_id, name: '—', address: '' }
      if (!grouped[prop.id]) grouped[prop.id] = { prop, rows: [] }
      grouped[prop.id].rows.push(e)
    }
    return Object.values(grouped).sort((a, b) => {
      const na = parseInt(a.prop.name.match(/\d+/)?.[0] || '9999')
      const nb = parseInt(b.prop.name.match(/\d+/)?.[0] || '9999')
      if (na !== nb) return na - nb
      return a.prop.name.localeCompare(b.prop.name)
    })
  }

  const unsentGroups = groupByProperty(unsentExpenses)
  const grandTotal = unsentExpenses.reduce((s, e) => s + parseFloat(String(e.amount)), 0)

  // All months in the data
  const months = useMemo(() => {
    const set = new Set<string>()
    set.add(currentMonth())
    for (const e of expenses) set.add(toMonthStr(e.expense_date))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [expenses])

  async function handleAdd() {
    setFormError('')
    if (!formProperty || !formDescription.trim() || !formAmount) {
      setFormError('Property, description and amount are required'); return
    }
    const amount = parseFloat(formAmount)
    if (isNaN(amount) || amount <= 0) {
      setFormError('Enter a valid amount'); return
    }
    setSaving(true)
    const supabase = createClient()
    const { data: row, error } = await supabase
      .from('recharge_expenses')
      .insert({
        property_id: formProperty,
        description: formDescription.trim(),
        amount,
        expense_date: formDate,
        notes: formNotes.trim() || null,
      })
      .select('*, properties(id, name, address)')
      .single()

    setSaving(false)
    if (error) { setFormError(error.message); return }
    setExpenses(prev => [row as Expense, ...prev])
    setShowForm(false)
    setFormProperty('')
    setFormDescription('')
    setFormAmount('')
    setFormDate(new Date().toISOString().slice(0, 10))
    setFormNotes('')
    // Switch to the month of the new expense so it's immediately visible
    setSelectedMonth(toMonthStr(formDate))
  }

  async function handleDelete(id: string) {
    const supabase = createClient()
    await supabase.from('recharge_expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  async function handleSend() {
    setSending(true)
    setSendResult(null)
    const res = await fetch('/api/admin/send-expense-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: selectedMonth }),
    })
    const json = await res.json()
    setSending(false)
    if (json.ok) {
      setSendResult(`✓ Sent ${json.sent} expense${json.sent !== 1 ? 's' : ''} (${gbp(json.total)}) to accounts@capitalrooms.co.uk`)
      // Mark as sent in local state
      setExpenses(prev => prev.map(e =>
        unsentExpenses.find(u => u.id === e.id)
          ? { ...e, sent_at: new Date().toISOString() }
          : e
      ))
    } else {
      setSendResult(`⚠ ${json.message || json.error || 'Failed to send'}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin" />} title="Expense Tracker" />
        <div className="mx-auto max-w-3xl px-lg py-2xl animate-pulse space-y-sm">
          {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-neutral-200" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} title="Expense Tracker" />

      <main className="mx-auto max-w-3xl px-lg py-2xl">

        {/* Header */}
        <div className="flex items-start justify-between mb-2xl flex-wrap gap-md">
          <div>
            <h1 className="text-2xl font-black text-neutral-900">Expense tracker</h1>
            <p className="text-sm text-neutral-500 mt-xs">Log expenses as they happen — send to accounts at month end</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="px-lg py-sm bg-neutral-900 text-white text-sm font-bold rounded-xl hover:bg-neutral-700 transition-colors"
          >
            + Add expense
          </button>
        </div>

        {/* Month picker */}
        <div className="mb-xl flex items-center gap-sm flex-wrap">
          {months.map(m => (
            <button
              key={m}
              onClick={() => setSelectedMonth(m)}
              className={`text-sm px-md py-xs rounded-full font-medium transition-colors ${
                selectedMonth === m
                  ? 'bg-neutral-900 text-white'
                  : 'bg-white border border-neutral-200 text-neutral-500 hover:text-neutral-900'
              }`}
            >
              {m === currentMonth() ? 'This month' : monthLabel(m)}
            </button>
          ))}
        </div>

        {/* Add expense modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-lg" onClick={() => setShowForm(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-lg">
                <h2 className="text-lg font-bold text-neutral-900">Add expense</h2>
                <button onClick={() => setShowForm(false)} className="text-neutral-400 hover:text-neutral-700 text-2xl leading-none">×</button>
              </div>

              {formError && <p className="text-sm text-red-600 mb-md">⚠ {formError}</p>}

              <div className="space-y-md">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-xs">Property</label>
                  <select
                    value={formProperty}
                    onChange={e => setFormProperty(e.target.value)}
                    className="w-full border border-neutral-300 rounded-xl px-md py-sm text-sm text-neutral-900 focus:outline-none"
                  >
                    <option value="">Select property…</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.name} — {p.address}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-xs">Description</label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    placeholder="e.g. Replacement smoke alarm"
                    className="w-full border border-neutral-300 rounded-xl px-md py-sm text-sm text-neutral-900 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-md">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-xs">Amount (£)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={formAmount}
                      onChange={e => setFormAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-neutral-300 rounded-xl px-md py-sm text-sm text-neutral-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-xs">Date</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={e => setFormDate(e.target.value)}
                      className="w-full border border-neutral-300 rounded-xl px-md py-sm text-sm text-neutral-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-xs">Notes <span className="font-normal normal-case text-neutral-400">(optional)</span></label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    placeholder="Any extra context"
                    className="w-full border border-neutral-300 rounded-xl px-md py-sm text-sm text-neutral-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-md mt-xl">
                <button
                  onClick={handleAdd}
                  disabled={saving}
                  className="flex-1 py-sm bg-neutral-900 text-white text-sm font-bold rounded-xl hover:bg-neutral-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Add'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-lg py-sm border border-neutral-200 rounded-xl text-sm text-neutral-600 hover:bg-neutral-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Unsent expenses */}
        {unsentExpenses.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white py-3xl text-center mb-xl">
            <p className="text-3xl mb-md">🧾</p>
            <p className="text-sm font-semibold text-neutral-600">No expenses logged for {monthLabel(selectedMonth)}</p>
            <p className="text-xs text-neutral-400 mt-xs">Click "Add expense" to log one</p>
          </div>
        ) : (
          <div className="space-y-sm mb-xl">
            {unsentGroups.map(({ prop, rows }) => {
              const subtotal = rows.reduce((s, e) => s + parseFloat(String(e.amount)), 0)
              return (
                <div key={prop.id} className="rounded-2xl bg-white border border-neutral-200 shadow-sm overflow-hidden">
                  {/* Property header */}
                  <div className="flex items-center justify-between px-lg py-md border-b border-neutral-100">
                    <div>
                      <p className="text-sm font-bold text-neutral-900">{prop.name}</p>
                      <p className="text-xs text-neutral-400">{prop.address}</p>
                    </div>
                    <span className="text-sm font-black text-neutral-900 tabular-nums">{gbp(subtotal)}</span>
                  </div>
                  {/* Expense rows */}
                  <div className="divide-y divide-neutral-50">
                    {rows.map(e => (
                      <div key={e.id} className="flex items-center justify-between px-lg py-sm gap-md group">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-neutral-900">{e.description}</p>
                          <p className="text-xs text-neutral-400">
                            {new Date(e.expense_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            {e.notes ? ` · ${e.notes}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-md shrink-0">
                          <span className="text-sm font-semibold text-neutral-900 tabular-nums">{gbp(parseFloat(String(e.amount)))}</span>
                          <button
                            onClick={() => handleDelete(e.id)}
                            className="text-neutral-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 text-lg leading-none"
                            title="Delete"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Grand total + send button */}
            <div className="rounded-2xl bg-neutral-900 text-white px-lg py-md flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/50">Total to send</p>
                <p className="text-2xl font-black tabular-nums mt-xs">{gbp(grandTotal)}</p>
              </div>
              <button
                onClick={handleSend}
                disabled={sending}
                className="px-xl py-md bg-white text-neutral-900 text-sm font-black rounded-xl hover:bg-neutral-100 disabled:opacity-50 transition-colors"
              >
                {sending ? 'Sending…' : '📧 Send to accounts'}
              </button>
            </div>

            {sendResult && (
              <div className={`rounded-xl px-lg py-md text-sm font-medium ${sendResult.startsWith('✓') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                {sendResult}
              </div>
            )}
          </div>
        )}

        {/* Already sent this month */}
        {sentExpenses.length > 0 && (
          <div className="mt-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Already sent this month</p>
            <div className="rounded-2xl bg-white border border-neutral-200 shadow-sm overflow-hidden opacity-60">
              <div className="divide-y divide-neutral-50">
                {sentExpenses.map(e => {
                  const prop = (e.properties as any)
                  return (
                    <div key={e.id} className="flex items-center justify-between px-lg py-sm gap-md">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-neutral-700">{e.description}</p>
                        <p className="text-xs text-neutral-400">
                          {prop?.name} · {new Date(e.expense_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-neutral-700 tabular-nums">{gbp(parseFloat(String(e.amount)))}</span>
                    </div>
                  )
                })}
              </div>
              <div className="px-lg py-sm bg-neutral-50 flex justify-between items-center border-t border-neutral-100">
                <span className="text-xs text-neutral-400">
                  Sent {new Date(sentExpenses[0].sent_at!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-sm font-black text-neutral-700 tabular-nums">
                  {gbp(sentExpenses.reduce((s, e) => s + parseFloat(String(e.amount)), 0))}
                </span>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
