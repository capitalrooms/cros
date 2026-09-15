'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Props {
  propertyId: string
  property: any
  onUpdate: (updates: any) => void
}

interface HouseInfoItem {
  icon: string
  label: string
  value: string
  sensitive?: boolean
}

const ICON_OPTIONS = ['🗑️', '📶', '🔑', '🔥', '🌡️', '🧹', '📦', '💧', '⚡', '🏠', '📞', '🔒', '🚗', '🌳', '🛎️', '📌']

function HouseInfoEditor({ items, onChange }: { items: HouseInfoItem[]; onChange: (items: HouseInfoItem[]) => void }) {
  function update(idx: number, field: keyof HouseInfoItem, value: string | boolean) {
    const next = items.map((item, i) => i === idx ? { ...item, [field]: value } : item)
    onChange(next)
  }
  function add() {
    onChange([...items, { icon: '📌', label: '', value: '', sensitive: false }])
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx))
  }
  function move(idx: number, dir: -1 | 1) {
    const next = [...items]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    onChange(next)
  }

  return (
    <div className="space-y-sm">
      {items.map((item, idx) => (
        <div key={idx} className="rounded-xl border border-neutral-200 bg-white p-md space-y-sm">
          <div className="flex items-center gap-sm">
            <select
              value={item.icon}
              onChange={e => update(idx, 'icon', e.target.value)}
              className="rounded-lg border border-neutral-200 bg-neutral-50 px-sm py-xs text-sm"
            >
              {ICON_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
            <input
              type="text"
              value={item.label}
              onChange={e => update(idx, 'label', e.target.value)}
              placeholder="Label (e.g. Bin day)"
              className="flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-sm py-xs text-sm"
            />
            <button onClick={() => move(idx, -1)} className="text-neutral-400 hover:text-neutral-700 text-sm px-xs" title="Move up">↑</button>
            <button onClick={() => move(idx, 1)} className="text-neutral-400 hover:text-neutral-700 text-sm px-xs" title="Move down">↓</button>
            <button onClick={() => remove(idx)} className="text-red-400 hover:text-red-600 text-sm px-xs" title="Remove">✕</button>
          </div>
          <textarea
            value={item.value}
            onChange={e => update(idx, 'value', e.target.value)}
            placeholder="Value (shown to tenants)"
            rows={2}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-sm py-xs text-sm"
          />
          <label className="flex items-center gap-sm text-sm text-neutral-600 cursor-pointer">
            <input
              type="checkbox"
              checked={!!item.sensitive}
              onChange={e => update(idx, 'sensitive', e.target.checked)}
              className="rounded"
            />
            Sensitive — tenants must tap to reveal (e.g. WiFi password, key safe code)
          </label>
        </div>
      ))}
      <button
        onClick={add}
        className="w-full rounded-xl border-2 border-dashed border-neutral-200 py-md text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition-colors"
      >
        + Add item
      </button>
    </div>
  )
}

export default function TenantAppTab({ propertyId, property, onUpdate }: Props) {
  const [houseInfoItems, setHouseInfoItems] = useState<HouseInfoItem[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Heating schedule
  const [heatingOn, setHeatingOn] = useState('06:30')
  const [heatingOff, setHeatingOff] = useState('22:00')
  const [heatingNote, setHeatingNote] = useState('')

  // Notice board settings
  const [noticeBoardEnabled, setNoticeBoardEnabled] = useState(true)

  // Featured tasks (simple text list for now)
  const [featuredTasks, setFeaturedTasks] = useState('')

  // Guides config — whether fire door guide is shown
  const [showFireDoorGuide, setShowFireDoorGuide] = useState(false)

  useEffect(() => {
    const items = property?.house_info?.items || []
    setHouseInfoItems(items)
    const hs = property?.heating_schedule || {}
    setHeatingOn(hs.on || '06:30')
    setHeatingOff(hs.off || '22:00')
    setHeatingNote(hs.note || '')
    setNoticeBoardEnabled(property?.notice_board_enabled !== false)
    setFeaturedTasks((property?.featured_tasks || []).join('\n'))
    setShowFireDoorGuide(property?.show_fire_door_guide ?? (property?.property_type === 'hmo' || false))
  }, [property])

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    const updates = {
      house_info: { items: houseInfoItems },
      heating_schedule: { on: heatingOn, off: heatingOff, note: heatingNote.trim() || null },
      notice_board_enabled: noticeBoardEnabled,
      featured_tasks: featuredTasks.split('\n').map(t => t.trim()).filter(Boolean),
      show_fire_door_guide: showFireDoorGuide,
    }
    await supabase.from('properties').update(updates).eq('id', propertyId)
    onUpdate(updates)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-2xl">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">Tenant App settings</p>
        <p className="text-sm text-neutral-500">Everything here controls what tenants see on their dashboard for this property.</p>
      </div>

      {/* ── House Info items ─────────────────────────────────────────────── */}
      <section>
        <h3 className="text-base font-bold text-neutral-900 mb-xs">House Info card</h3>
        <p className="text-sm text-neutral-500 mb-md">
          These appear on the tenant dashboard. The first two items show as a teaser before expanding. Drag to reorder.
        </p>
        <HouseInfoEditor items={houseInfoItems} onChange={setHouseInfoItems} />
      </section>

      {/* ── Heating schedule ─────────────────────────────────────────────── */}
      <section className="border-t border-neutral-100 pt-2xl">
        <h3 className="text-base font-bold text-neutral-900 mb-xs">Heating schedule</h3>
        <p className="text-sm text-neutral-500 mb-md">
          Shown to tenants in the House Info card. Helps reduce condensation from turning heating on/off at the wrong times.
        </p>
        <div className="flex flex-wrap gap-md mb-md">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-semibold text-neutral-500 mb-xs">Turns on</label>
            <input
              type="time"
              value={heatingOn}
              onChange={e => setHeatingOn(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-md py-sm text-sm"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-semibold text-neutral-500 mb-xs">Turns off</label>
            <input
              type="time"
              value={heatingOff}
              onChange={e => setHeatingOff(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-md py-sm text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-500 mb-xs">Note for tenants (optional)</label>
          <textarea
            value={heatingNote}
            onChange={e => setHeatingNote(e.target.value)}
            rows={2}
            placeholder="e.g. Boost button on the thermostat adds 1 hour. Portable heaters are available from the cupboard under the stairs."
            className="w-full rounded-xl border border-neutral-200 px-md py-sm text-sm"
          />
        </div>
      </section>

      {/* ── Guide settings ───────────────────────────────────────────────── */}
      <section className="border-t border-neutral-100 pt-2xl">
        <h3 className="text-base font-bold text-neutral-900 mb-xs">Guide settings</h3>
        <p className="text-sm text-neutral-500 mb-md">
          Standard guides are shown based on property type automatically. Toggle specific additions here.
        </p>
        <div className="rounded-xl border border-neutral-100 bg-neutral-50 divide-y divide-neutral-100">
          <label className="flex items-center justify-between gap-md p-md cursor-pointer">
            <div>
              <p className="text-sm font-semibold text-neutral-900">🚪 Fire door guide</p>
              <p className="text-xs text-neutral-500">Show the fire door maintenance guide (HMOs with fire doors)</p>
            </div>
            <input
              type="checkbox"
              checked={showFireDoorGuide}
              onChange={e => setShowFireDoorGuide(e.target.checked)}
              className="rounded w-5 h-5"
            />
          </label>
        </div>
      </section>

      {/* ── Notice board ─────────────────────────────────────────────────── */}
      <section className="border-t border-neutral-100 pt-2xl">
        <h3 className="text-base font-bold text-neutral-900 mb-xs">Notice Board</h3>
        <label className="flex items-center justify-between gap-md rounded-xl border border-neutral-100 bg-neutral-50 p-md cursor-pointer">
          <div>
            <p className="text-sm font-semibold text-neutral-900">Enable Notice Board for this property</p>
            <p className="text-xs text-neutral-500">Tenants can see and post updates, tasks, and house reminders</p>
          </div>
          <input
            type="checkbox"
            checked={noticeBoardEnabled}
            onChange={e => setNoticeBoardEnabled(e.target.checked)}
            className="rounded w-5 h-5"
          />
        </label>
      </section>

      {/* ── Featured tasks ───────────────────────────────────────────────── */}
      <section className="border-t border-neutral-100 pt-2xl">
        <h3 className="text-base font-bold text-neutral-900 mb-xs">Featured tasks</h3>
        <p className="text-sm text-neutral-500 mb-md">
          Suggested communal tasks pinned to the top of the Notice Board. One per line.
        </p>
        <textarea
          value={featuredTasks}
          onChange={e => setFeaturedTasks(e.target.value)}
          rows={4}
          placeholder={"Take out the bins on bin day\nWipe the hob after cooking\nCheck the boiler pressure monthly"}
          className="w-full rounded-xl border border-neutral-200 px-md py-sm text-sm"
        />
      </section>

      {/* ── Save button ──────────────────────────────────────────────────── */}
      <div className="border-t border-neutral-100 pt-lg flex items-center gap-md">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-neutral-900 px-xl py-md text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Tenant App settings'}
        </button>
        {saved && <p className="text-sm font-semibold text-green-600">✓ Saved</p>}
      </div>
    </div>
  )
}
