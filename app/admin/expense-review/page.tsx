'use client'

// Admin review page for uncategorised / low-confidence expense line items.
// Admin can confirm the AI's suggestion or pick a different category.
// Changes are silent from the landlord's POV.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
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

interface Room { id: string; name: string; room_number: number | null; property_id: string }

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
      if (!data || !['administrator', 'admin'].includes(data.assignment?.role ?? '')) {
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
          people!landlord_id(full_name, first_name, last_name, email)
        `)
        .order('statement_date', { ascending: false })
        .limit(500)
      setItems(rows || [])

      const { data: roomData } = await supabase
        .from('rooms')
        .select('id, name, room_number, property_id')
        .order('room_number')
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
    return p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.full_name || p.email
  }

  function propertyName(item: LineItem) {
    return (item.properties as any)?.name || (item.properties as any)?.address || item.property_id.slice(0, 8)
  }

  if (loading) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton />} />
      <main className="mx-auto max-w-5xl px-lg py-2xl">
        <div className="animate-pulse h-8 w-64 bg-neutral-300 rounded-lg" />
      </main>
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton />} />
      <main className="mx-auto max-w-5xl px-lg py-2xl space-y-xl">
        <div className="flex items-start justify-between gap-lg">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Expense Review</h1>
            <p className="text-sm text-neutral-500 mt-xs">
              Assign categories to uncategorised expense lines. Changes are invisible to landlords — they just see correct data.
            </p>
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
          <div className="space-y-sm">
            {displayed.map(item => {
              const propertyRooms = rooms.filter(r => r.property_id === item.property_id)
              return (
                <div key={item.id} className="rounded-2xl bg-white p-lg space-y-md">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-md">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-neutral-900">{item.description}</p>
                      <p className="text-xs text-neutral-400 mt-xs">
                        {new Date(item.statement_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {' · '}{landlordName(item)}
                        {' · '}{propertyName(item)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-neutral-900">£{Number(item.amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
                      {item.ai_category && item.ai_category !== UNMATCHED_SLUG && (
                        <p className="text-xs text-neutral-400 mt-xs">
                          AI: {categoryLabel(item.ai_category)} ({Math.round((item.ai_confidence ?? 0) * 100)}%)
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Quick confirm AI suggestion */}
                  {item.ai_category && item.ai_category !== UNMATCHED_SLUG && !item.admin_confirmed && (
                    <button
                      onClick={() => saveCategory(item.id, item.ai_category!)}
                      disabled={saving === item.id}
                      className="w-full rounded-xl border-2 border-emerald-200 bg-emerald-50 px-md py-sm text-sm font-medium text-emerald-800 text-left hover:bg-emerald-100 transition-colors disabled:opacity-50"
                    >
                      ✓ Confirm: {categoryLabel(item.ai_category)} ({Math.round((item.ai_confidence ?? 0) * 100)}% confident)
                    </button>
                  )}

                  {/* Category picker */}
                  <div>
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Assign category</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-xs">
                      {PROPERTY_WIDE_CATEGORIES.map(cat => (
                        <button
                          key={cat.slug}
                          onClick={() => saveCategory(item.id, cat.slug)}
                          disabled={saving === item.id}
                          className={`px-sm py-xs rounded-lg text-xs font-medium text-left transition-colors disabled:opacity-50 ${
                            item.category === cat.slug
                              ? 'bg-neutral-900 text-white'
                              : 'bg-neutral-50 text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
                          }`}
                        >
                          {cat.emoji} {cat.label}
                        </button>
                      ))}
                    </div>

                    {/* Room-specific */}
                    {propertyRooms.length > 0 && (
                      <div className="mt-sm">
                        <p className="text-xs text-neutral-400 mb-xs">Room-specific:</p>
                        <div className="flex flex-wrap gap-xs">
                          {propertyRooms.map(room =>
                            ROOM_SPECIFIC_CATEGORY_TYPES.slice(0, 2).map(rt => (
                              <button
                                key={`${room.id}-${rt.slug}`}
                                onClick={() => saveCategory(item.id, rt.slug, room.id, room.name || `Room ${room.room_number}`)}
                                disabled={saving === item.id}
                                className={`px-sm py-xs rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                                  item.room_id === room.id && item.category === rt.slug
                                    ? 'bg-neutral-900 text-white'
                                    : 'bg-neutral-50 text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
                                }`}
                              >
                                {room.name || `Room ${room.room_number}`} – {rt.label}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => saveCategory(item.id, UNMATCHED_SLUG)}
                      disabled={saving === item.id}
                      className={`mt-xs px-sm py-xs rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                        item.category === UNMATCHED_SLUG
                          ? 'bg-neutral-900 text-white'
                          : 'bg-neutral-50 text-neutral-400 hover:bg-neutral-100 border border-neutral-200'
                      }`}
                    >
                      📦 Keep as Other / Not Matched
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
