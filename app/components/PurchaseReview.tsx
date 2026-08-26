'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { AIResult } from './DocReview'

const CATEGORIES = [
  { value: 'appliance', label: 'Appliances', defaultsToProperty: true },
  { value: 'furniture', label: 'Furniture', defaultsToProperty: false },
  { value: 'furnishings', label: 'Furnishings', defaultsToProperty: false },
  { value: 'building_material', label: 'Building Materials', defaultsToProperty: false },
  { value: 'other', label: 'Other', defaultsToProperty: false },
]

/**
 * Review step for a purchase_receipt: the AI has already extracted the category,
 * item, and amount — the admin confirms the property (+ room per category) and
 * saves it straight into the purchases table (no manual re-typing).
 */
export default function PurchaseReview({
  initial,
  file,
  properties,
  onApplied,
  onCancel,
}: {
  initial: AIResult
  file?: File
  properties: Array<{ id: string; name: string; address?: string }>
  onApplied: (msg: string) => void
  onCancel: () => void
}) {
  const guessedProperty = useMemo(() => {
    const addr = (initial.property_address || '').toLowerCase()
    if (!addr) return ''
    return (
      properties.find(
        (p) =>
          (p.address && addr.includes(String(p.address).toLowerCase())) ||
          addr.includes(String(p.name).toLowerCase())
      )?.id || ''
    )
  }, [initial.property_address, properties])

  const validCat = CATEGORIES.some((c) => c.value === initial.purchase_category)
    ? (initial.purchase_category as string)
    : 'other'

  const [propertyId, setPropertyId] = useState(guessedProperty)
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([])
  const [form, setForm] = useState({
    category: validCat,
    name: initial.item_name || '',
    make_model: initial.item_make_model || '',
    cost: initial.amount || '',
    purchased_date: initial.issue_date || '',
    purchased_by: initial.provider || '',
    room_id: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadRooms() {
      if (!propertyId) { setRooms([]); return }
      const supabase = createClient()
      const { data } = await supabase.from('rooms').select('id, name').eq('property_id', propertyId).order('name')
      setRooms(data || [])
    }
    loadRooms()
    setForm((f) => ({ ...f, room_id: '' }))
  }, [propertyId])

  const promptRoom = !CATEGORIES.find((c) => c.value === form.category)?.defaultsToProperty

  async function handleSave() {
    if (!propertyId) { setError('Choose which property this is for'); return }
    if (!form.name.trim()) { setError('Give the item a name'); return }
    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const { error: e } = await supabase.from('purchases').insert({
        property_id: propertyId,
        room_id: form.room_id || null,
        category: form.category,
        name: form.name.trim(),
        make_model: form.make_model.trim() || null,
        purchased_date: form.purchased_date || null,
        purchased_by: form.purchased_by.trim() || null,
        cost: form.cost ? Number(String(form.cost).replace(/[^0-9.]/g, '')) : null,
        notes: initial.summary || null,
      })
      if (e) throw new Error(e.message)
      const propName = properties.find((p) => p.id === propertyId)?.name || 'property'
      onApplied(`Purchase logged: ${form.name} → ${propName}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save purchase')
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900'

  return (
    <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
      <span className="inline-block rounded bg-blue-100 px-sm py-0.5 text-xs font-semibold text-blue-800">🧾 Purchase receipt</span>
      <p className="mt-xs text-sm font-semibold text-neutral-900">{initial.summary || file?.name || 'Purchase'}</p>
      <p className="text-xs text-neutral-500">Confirm the details and which property this is for — it&apos;ll be saved to Purchases.</p>

      <div className="mt-lg grid grid-cols-1 gap-md sm:grid-cols-2">
        <div>
          <label className="block text-xs font-bold text-neutral-700 mb-xs">Property *</label>
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={inputCls}>
            <option value="">Select a property…</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-neutral-700 mb-xs">Category</label>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-bold text-neutral-700 mb-xs">
            Purchased for {promptRoom && <span className="text-amber-600">· choose a room</span>}
          </label>
          <select value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })} disabled={!propertyId} className={`${inputCls} disabled:opacity-50`}>
            <option value="">Whole property</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-neutral-700 mb-xs">Item *</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-bold text-neutral-700 mb-xs">Make / model</label>
          <input value={form.make_model} onChange={(e) => setForm({ ...form, make_model: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-bold text-neutral-700 mb-xs">Cost (£)</label>
          <input value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-bold text-neutral-700 mb-xs">Purchased</label>
          <input type="date" value={form.purchased_date} onChange={(e) => setForm({ ...form, purchased_date: e.target.value })} className={inputCls} />
        </div>
      </div>

      {error && <p className="mt-md text-sm text-red-600">{error}</p>}

      <div className="mt-lg flex gap-md">
        <button onClick={onCancel} disabled={saving} className="flex-1 rounded-lg border border-neutral-300 px-lg py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">Skip</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 rounded-lg bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50">{saving ? 'Saving…' : 'Save purchase'}</button>
      </div>
    </div>
  )
}
