'use client'

// Admin review page for uncategorised / low-confidence expense line items.
// Admin can confirm the AI's suggestion or pick a different category.
// Changes are silent from the landlord's POV.

import { useEffect, useState } from 'react'
import { isOfficeRole } from '@/lib/access/areas'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import { financeTabs } from '@/lib/financeTabs'
import BackButton from '@/app/components/BackButton'
import {
  PROPERTY_WIDE_CATEGORIES,
  ROOM_SPECIFIC_CATEGORY_TYPES,
  UNMATCHED_SLUG,
  categoryLabel,
} from '@/lib/expense-categories'

interface LineItem {
  id: string
  description: string
  amount: number
  statement_date: string
  category: string
  category_type: string
  room_id: string | null
  room_label: string | null
  ai_category: string | null
  ai_confidence: number | null
  admin_confirmed: boolean
  property_id: string
  landlord_id: string
  properties?: { name: string; address: string }
  people?: { full_name: string | null; first_name: string | null; last_name: string | null; email: string }
}

interface Room { id: string; name: string; room_number?: number | null; property_id: string }

export default function ExpenseReviewPage() {
  const router = useRouter()
  const [items, setItems] = useState<LineItem[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'unmatched' | 'low_confidence' | 'all'>('unmatched')
  const [saving, setSaving] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [bulkConfirming, setBulkConfirming] = useState(false)

  async function bulkConfirm() {
    const pending = items.filter(i => !i.admin_confirmed && i.category !== UNMATCHED_SLUG && (i.ai_confidence ?? 0) >= 0.9)
    if (!pending.length) return
    setBulkConfirming(true)
    const res = await fetch('/api/admin/statement-line-items/bulk-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threshold: 0.9 }),
    })
    if (res.ok) {
      const { confirmed } = await res.json()
      setItems(prev => prev.map(i =>
        (!i.admin_confirmed && i.category !== UNMATCHED_SLUG && (i.ai_confidence ?? 0) >= 0.9)
          ? { ...i, admin_confirmed: true }
          : i
      ))
      setNotice(`✓ ${confirmed} item${confirmed !== 1 ? 's' : ''} confirmed`)
      setTimeout(() => setNotice(''), 3000)
    }
    setBulkConfirming(false)
  }

  useEffect(() => {
    async function load() {
      const data = await getCurrentUser()
      if (!data || !isOfficeRole(data.assignment?.role)) {
        router.push('/login')
        return
      }
      const supabase = createClient()
      const { data: rows } = await supabase
        .from('statement_line_items')
        .select(`
          id, description, amount, statement_date, category, category_type,
          room_id, room_label, ai_category, ai_confidence, admin_confirmed,
          property_id, landlord_id,
          properties(name, address),
          people!landlord_id(full_name, salutation, first_name, last_name, email)
        `)
        .order('statement_date', { ascending: false })
        .limit(500)
      setItems(rows || [])

      const { data: roomData } = await supabase
        .from('rooms')
        .select('id, name, property_id')
        .order('name')
      setRooms(roomData || [])

      setLoading(false)
    }
    load()
  }, [router])

  const displayed = items.filter(item => {
    if (filter === 'unmatched') return item.category === UNMATCHED_SLUG && !item.admin_confirmed
    if (filter === 'low_confidence') return !item.admin_confirmed && (item.ai_confidence ?? 1) < 0.7
    return !item.admin_confirmed
  })

  async function saveCategory(id: string, category: string, room_id?: string | null, room_label?: string | null) {
    setSaving(id)
    const category_type = category.startsWith('room_') ? 'room_specific' : 'property_wide'
    const res = await fetch(`/api/admin/statement-line-items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, category_type, room_id: room_id ?? null, room_label: room_label ?? null }),
    })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, category, category_type, room_id: room_id ?? null, room_label: room_label ?? null, admin_confirmed: true } : i))
      setNotice('Category updated')
      setTimeout(() => setNotice(''), 2000)
    }
    setSaving(null)
  }

  function landlordName(item: LineItem) {
    const p = item.people as any
    if (!p) return 'Unknown'
    return p.first_name && p.last_name ? `${[p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ')}` : p.full_name || p.email
  }

  function propertyName(item: LineItem) {
    return (item.properties as any)?.name || (item.properties as any)?.address || item.property_id.slice(0, 8)
  }

  if (loading) return (
    <div className="min-h-screen fin">
      <AppBar left={<BackButton href="/admin/accounts" />} />
      <main className="mx-auto max-w-6xl px-lg py-xl">
        <div className="animate-pulse h-8 w-64 bg-neutral-300 rounded-lg" />
      </main>
    </div>
  )

  return (
    <div className="min-h-screen fin pb-3xl">
      <AppBar left={<BackButton href="/admin/accounts" />} />
      <PageHero eyebrow="Finance" title="Expense Review" subtitle="The lines read off statements you email to statements@ — check any the system wasn’t sure about. Changes are invisible to landlords." tabs={financeTabs('expense-review')} />
      <main className="mx-auto max-w-6xl px-lg py-lg space-y-md">
        <div className="flex items-start justify-between gap-lg">
          <div>
          </div>
          <div className="flex items-center gap-md shrink-0">
            {notice && <span className="text-sm text-emerald-600 font-medium">{notice}</span>}
            {items.filter(i => !i.admin_confirmed && i.category !== UNMATCHED_SLUG && (i.ai_confidence ?? 0) >= 0.9).length > 0 && (
              <button
                onClick={bulkConfirm}
                disabled={bulkConfirming}
                className="px-md py-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {bulkConfirming ? 'Confirming…' : `Confirm ${items.filter(i => !i.admin_confirmed && i.category !== UNMATCHED_SLUG && (i.ai_confidence ?? 0) >= 0.9).length} high-confidence items`}
              </button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-sm">
          {([
            { key: 'unmatched', label: 'Other / Unmatched', count: items.filter(i => i.category === UNMATCHED_SLUG && !i.admin_confirmed).length },
            { key: 'low_confidence', label: 'Low confidence (<70%)', count: items.filter(i => !i.admin_confirmed && (i.ai_confidence ?? 1) < 0.7).length },
            { key: 'all', label: 'All unconfirmed', count: items.filter(i => !i.admin_confirmed).length },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-md py-sm rounded-full text-sm font-medium transition-colors ${
                filter === tab.key
                  ? 'bg-neutral-900 text-white'
                  : 'bg-white text-neutral-600 border border-neutral-200'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-xs px-xs py-0.5 rounded-full text-xs ${filter === tab.key ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {displayed.length === 0 ? (
          <div className="rounded-2xl bg-white p-3xl text-center">
            <p className="text-neutral-500">Nothing to review here — all items in this filter are categorised ✓</p>
          </div>
        ) : (
          <div className="ledger-card overflow-x-auto">
            {/* one row per line read off a statement (17 Oct 2026 — was a big card with every category as a button) */}
            <table>
              <thead><tr><th>Date</th><th>Property</th><th>Line on the statement</th><th className="text-right">Amount</th><th>Suggested</th><th>Category</th></tr></thead>
              <tbody>
                {displayed.map(item => {
                  const propertyRooms = rooms.filter(r => r.property_id === item.property_id)
                  const current = item.room_id ? `${item.category}|${item.room_id}` : item.category
                  return (
                    <tr key={item.id}>
                      <td className="whitespace-nowrap text-neutral-600">{new Date(item.statement_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                      <td className="max-w-[160px]"><span className="block truncate font-semibold">{propertyName(item)}</span><span className="block truncate text-[10.5px] text-neutral-500">{landlordName(item)}</span></td>
                      <td className="max-w-[340px]"><span className="line-clamp-2" title={item.description}>{item.description}</span></td>
                      <td className="text-right font-semibold whitespace-nowrap">£{Number(item.amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
                      <td className="whitespace-nowrap">
                        {item.ai_category && item.ai_category !== UNMATCHED_SLUG && !item.admin_confirmed ? (
                          <button onClick={() => saveCategory(item.id, item.ai_category!)} disabled={saving === item.id}
                            className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
                            ✓ {categoryLabel(item.ai_category)} <span className="font-normal text-emerald-700">{Math.round((item.ai_confidence ?? 0) * 100)}%</span>
                          </button>
                        ) : <span className="text-[11px] text-neutral-400">{item.admin_confirmed ? 'Confirmed' : '—'}</span>}
                      </td>
                      <td>
                        <select value={current} disabled={saving === item.id}
                          onChange={e => { const [slug, roomId] = e.target.value.split('|'); const room = propertyRooms.find(r => r.id === roomId); saveCategory(item.id, slug, roomId || undefined, room ? (room.name || `Room ${room.room_number}`) : undefined) }}
                          className="w-full min-w-[170px] rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs">
                          {PROPERTY_WIDE_CATEGORIES.map(cat => <option key={cat.slug} value={cat.slug}>{cat.emoji} {cat.label}</option>)}
                          {propertyRooms.length > 0 && <optgroup label="A room">
                            {propertyRooms.flatMap(room => ROOM_SPECIFIC_CATEGORY_TYPES.slice(0, 2).map(rt => <option key={`${rt.slug}|${room.id}`} value={`${rt.slug}|${room.id}`}>{room.name || `Room ${room.room_number}`} – {rt.label}</option>))}
                          </optgroup>}
                          <option value={UNMATCHED_SLUG}>📦 Other / not matched</option>
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
