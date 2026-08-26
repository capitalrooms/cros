'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

interface Purchase {
  id: string
  property_id: string
  room_id: string | null
  category: string
  name: string | null
  make_model: string | null
  purchased_date: string | null
  purchased_by: string | null
  cost: number | null
  notes: string | null
  room?: { name: string } | null
}

interface PurchasesTabProps {
  propertyId: string
}

const CATEGORIES = [
  { value: 'appliance', label: 'Appliances', defaultsToProperty: true },
  { value: 'furniture', label: 'Furniture', defaultsToProperty: false },
  { value: 'furnishings', label: 'Furnishings', defaultsToProperty: false },
  { value: 'building_material', label: 'Building Materials', defaultsToProperty: false },
  { value: 'other', label: 'Other', defaultsToProperty: false },
] as const

const catLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label || 'Other'
const catStyle = (v: string) => {
  switch (v) {
    case 'appliance': return 'bg-blue-900 text-blue-200'
    case 'furniture': return 'bg-purple-900 text-purple-200'
    case 'furnishings': return 'bg-pink-900 text-pink-200'
    case 'building_material': return 'bg-amber-900 text-amber-200'
    default: return 'bg-neutral-700 text-neutral-200'
  }
}

const emptyForm = {
  category: 'appliance',
  name: '',
  make_model: '',
  room_id: '',
  purchased_date: '',
  purchased_by: '',
  cost: '',
  notes: '',
}

export default function PurchasesTab({ propertyId }: PurchasesTabProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([])
  const [filter, setFilter] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [me, setMe] = useState<any>(null)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      setMe(data?.assignment || null)
      await Promise.all([loadPurchases(), loadRooms()])
      setLoading(false)
    }
    init()
  }, [propertyId])

  async function loadPurchases() {
    const { data, error: err } = await supabase
      .from('purchases')
      .select('*, room:room_id(name)')
      .eq('property_id', propertyId)
      .order('purchased_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (err) {
      setError('Could not load purchases — has the purchases table been created?')
      return
    }
    setPurchases(data || [])
  }

  async function loadRooms() {
    const { data } = await supabase
      .from('rooms')
      .select('id, name')
      .eq('property_id', propertyId)
      .order('name')
    setRooms(data || [])
  }

  // When the category changes, apply the room-assignment default per the spec.
  function onCategoryChange(category: string) {
    const cat = CATEGORIES.find((c) => c.value === category)
    // Appliances default to the whole property; everything else prompts for a room.
    setForm((f) => ({ ...f, category, room_id: cat?.defaultsToProperty ? '' : f.room_id }))
  }

  async function handleAdd() {
    if (!form.name.trim()) {
      setError('Give the item a name')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { error: err } = await supabase.from('purchases').insert({
        property_id: propertyId,
        room_id: form.room_id || null,
        category: form.category,
        name: form.name.trim(),
        make_model: form.make_model.trim() || null,
        purchased_date: form.purchased_date || null,
        purchased_by: form.purchased_by.trim() || null,
        cost: form.cost ? Number(form.cost) : null,
        notes: form.notes.trim() || null,
        created_by: me?.id || null,
      })
      if (err) throw new Error(err.message)
      setForm({ ...emptyForm })
      setShowAdd(false)
      await loadPurchases()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this purchase record?')) return
    const { error: err } = await supabase.from('purchases').delete().eq('id', id)
    if (!err) setPurchases((p) => p.filter((x) => x.id !== id))
  }

  const filtered = filter === 'all' ? purchases : purchases.filter((p) => p.category === filter)
  const promptRoom = !CATEGORIES.find((c) => c.value === form.category)?.defaultsToProperty

  if (loading) {
    return <div className="p-xl text-sm text-neutral-400">Loading purchases…</div>
  }

  return (
    <div className="space-y-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Purchases</h2>
          <p className="text-sm text-neutral-400 mt-xs">
            Everything bought for this property — appliances, furniture, materials. Recorded for the whole property, or for an individual room.
          </p>
        </div>
        <button
          onClick={() => { setForm({ ...emptyForm }); setShowAdd(true); setError(null) }}
          className="px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition shrink-0"
        >
          + Log a purchase
        </button>
      </div>

      {error && !showAdd && (
        <div className="p-md rounded-lg bg-red-950 border border-red-800 text-sm text-red-300">{error}</div>
      )}

      {/* Category filter */}
      <div className="flex flex-wrap gap-sm">
        {[{ value: 'all', label: 'All' }, ...CATEGORIES].map((c) => (
          <button
            key={c.value}
            onClick={() => setFilter(c.value)}
            className={`px-md py-xs rounded-full text-xs font-semibold border ${
              filter === c.value
                ? 'bg-white text-neutral-900 border-white'
                : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
            }`}
          >
            {c.label}
            {c.value !== 'all' && (
              <span className="ml-xs text-neutral-500">
                {purchases.filter((p) => p.category === c.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-700 bg-neutral-900 p-xl text-center">
          <p className="text-sm text-neutral-500">
            {purchases.length === 0 ? 'No purchases logged yet.' : 'Nothing in this category.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-900 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <th className="px-md py-sm">Item</th>
                <th className="px-md py-sm">Category</th>
                <th className="px-md py-sm">Where</th>
                <th className="px-md py-sm">Date</th>
                <th className="px-md py-sm">By</th>
                <th className="px-md py-sm text-right">Cost</th>
                <th className="px-md py-sm"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                  <td className="px-md py-sm">
                    <p className="font-medium text-white">{p.name || '—'}</p>
                    {p.make_model && <p className="text-xs text-neutral-500">{p.make_model}</p>}
                    {p.notes && <p className="text-xs text-neutral-500 italic mt-xs">{p.notes}</p>}
                  </td>
                  <td className="px-md py-sm">
                    <span className={`inline-block rounded px-sm py-0.5 text-xs font-semibold ${catStyle(p.category)}`}>
                      {catLabel(p.category)}
                    </span>
                  </td>
                  <td className="px-md py-sm text-neutral-300">
                    {p.room?.name || <span className="text-neutral-500">Whole property</span>}
                  </td>
                  <td className="px-md py-sm text-neutral-400 text-xs">
                    {p.purchased_date ? new Date(p.purchased_date).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td className="px-md py-sm text-neutral-400 text-xs">{p.purchased_by || '—'}</td>
                  <td className="px-md py-sm text-right text-neutral-300">
                    {p.cost != null ? `£${Number(p.cost).toLocaleString()}` : <span className="text-neutral-600">—</span>}
                  </td>
                  <td className="px-md py-sm text-right">
                    <button onClick={() => handleDelete(p.id)} className="text-xs text-neutral-500 hover:text-red-400">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-lg" onClick={() => !saving && setShowAdd(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-700 p-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-lg">
              <h3 className="text-lg font-bold text-white">Log a purchase</h3>
              <button onClick={() => !saving && setShowAdd(false)} className="text-neutral-500 hover:text-white text-2xl leading-none">×</button>
            </div>

            <div className="space-y-md">
              <div className="grid grid-cols-2 gap-md">
                <div>
                  <label className="block text-xs font-bold text-neutral-400 mb-xs">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => onCategoryChange(e.target.value)}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-md py-sm text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-400 mb-xs">
                    Purchased for {promptRoom && <span className="text-amber-400">· choose a room</span>}
                  </label>
                  <select
                    value={form.room_id}
                    onChange={(e) => setForm({ ...form, room_id: e.target.value })}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-md py-sm text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Whole property</option>
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 mb-xs">Item name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Dishwasher, Wardrobe, Laminate flooring"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-md py-sm text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 mb-xs">Make / model</label>
                <input
                  value={form.make_model}
                  onChange={(e) => setForm({ ...form, make_model: e.target.value })}
                  placeholder="e.g. Bosch Series 4"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-md py-sm text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-md">
                <div>
                  <label className="block text-xs font-bold text-neutral-400 mb-xs">Purchased</label>
                  <input type="date" value={form.purchased_date} onChange={(e) => setForm({ ...form, purchased_date: e.target.value })}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-md py-sm text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-400 mb-xs">By</label>
                  <input value={form.purchased_by} onChange={(e) => setForm({ ...form, purchased_by: e.target.value })} placeholder="Capital Rooms / landlord"
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-md py-sm text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-400 mb-xs">Cost (£)</label>
                  <input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="optional"
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-md py-sm text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 mb-xs">Notes</label>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Warranty, serial, cover…"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-md py-sm text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>

            <div className="mt-lg flex gap-md">
              <button onClick={() => setShowAdd(false)} disabled={saving}
                className="flex-1 rounded-lg border border-neutral-700 px-lg py-sm text-sm font-semibold text-neutral-300 hover:bg-neutral-800 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleAdd} disabled={saving}
                className="flex-1 rounded-lg bg-blue-600 px-lg py-sm text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save purchase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
