'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'

interface HouseInfoItem {
  icon: string
  label: string
  value: string
  sensitive?: boolean
}

const QUICK_ADD: HouseInfoItem[] = [
  { icon: '📶', label: 'WiFi', value: 'Network: \nPassword: \nProvider: ', sensitive: false },
  { icon: '🗑️', label: 'Bin Day', value: '', sensitive: false },
  { icon: '♻️', label: 'Recycling', value: '', sensitive: false },
  { icon: '🔥', label: 'Heating', value: '', sensitive: false },
  { icon: '🔌', label: 'Fuse Box', value: '', sensitive: false },
  { icon: '🚰', label: 'Stopcock', value: '', sensitive: false },
  { icon: '💧', label: 'Water (Thames Water)', value: '0800 316 9800', sensitive: false },
  { icon: '⚡', label: 'Gas & Electric', value: '', sensitive: false },
  { icon: '🧹', label: 'Cleaner', value: '', sensitive: false },
  { icon: '🚗', label: 'Parking', value: '', sensitive: false },
  { icon: '📦', label: 'Parcels / Post', value: '', sensitive: false },
  { icon: '🔑', label: 'Key Safe Code', value: '', sensitive: true },
  { icon: '🔧', label: 'Locksmith', value: '', sensitive: false },
  { icon: '🏛️', label: 'Council', value: '', sensitive: false },
  { icon: '📞', label: 'Emergency Contact', value: '', sensitive: false },
  { icon: '🚒', label: 'Fire — Evacuation Point', value: '', sensitive: false },
]

interface Props {
  propertyId: string
  initialItems: HouseInfoItem[]
}

export default function HouseInfoEditor({ propertyId, initialItems }: Props) {
  const [items, setItems] = useState<HouseInfoItem[]>(initialItems)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  // PDF import state
  const importRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importPreview, setImportPreview] = useState<Array<HouseInfoItem & { selected: boolean }> | null>(null)

  function addItem(template?: Partial<HouseInfoItem>) {
    const newItem: HouseInfoItem = {
      icon: template?.icon || '📌',
      label: template?.label || '',
      value: template?.value || '',
      sensitive: template?.sensitive ?? false,
    }
    setItems(prev => [...prev, newItem])
    setEditingIdx(items.length)
  }

  function updateItem(idx: number, patch: Partial<HouseInfoItem>) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, ...patch } : item))
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
    setEditingIdx(null)
  }

  function moveItem(idx: number, dir: -1 | 1) {
    const next = idx + dir
    if (next < 0 || next >= items.length) return
    setItems(prev => {
      const arr = [...prev]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr
    })
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    // Strip empty rows before saving
    const clean = items.filter(it => it.label.trim() || it.value.trim())
    await supabase
      .from('properties')
      .update({ house_info: { items: clean } })
      .eq('id', propertyId)
    setItems(clean)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleImportFile(file: File) {
    setImporting(true)
    setImportError('')
    setImportPreview(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/admin/house-info-extract', { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Extraction failed')
      if (!json.items?.length) throw new Error('No fields could be extracted from this document')
      // Pre-select all, dedup against existing labels
      const existing = items.map(i => i.label.toLowerCase())
      setImportPreview(
        json.items.map((it: HouseInfoItem) => ({
          ...it,
          selected: !existing.includes(it.label.toLowerCase()),
        }))
      )
    } catch (err: any) {
      setImportError(err.message || 'Something went wrong')
    } finally {
      setImporting(false)
    }
  }

  function confirmImport() {
    const toAdd = (importPreview || []).filter(it => it.selected).map(({ selected, ...it }) => it)
    setItems(prev => [...prev, ...toAdd])
    setImportPreview(null)
  }

  // Quick-add buttons — only show ones not already in the list
  const existingLabels = items.map(i => i.label.toLowerCase())
  const quickOptions = QUICK_ADD.filter(q => !existingLabels.includes(q.label.toLowerCase()))

  return (
    <div className="mt-3xl border-t border-neutral-200 pt-xl">
      <div className="flex items-center justify-between gap-md mb-md">
        <div>
          <h3 className="text-base font-bold text-neutral-900">🏠 House Info</h3>
          <p className="text-xs text-neutral-500 mt-xs">
            Static facts shown permanently to all tenants at this property — wifi, bins, heating, etc.
          </p>
        </div>
        <div className="flex items-center gap-sm shrink-0">
          {/* Hidden file input for PDF import */}
          <input
            ref={importRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = '' }}
          />
          <button
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
          >
            {importing ? '⚡ Reading…' : '📄 Import from PDF'}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-neutral-900 px-md py-sm text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : saved ? '✅ Saved' : 'Save'}
          </button>
        </div>
      </div>

      {importError && (
        <div className="mb-md rounded-xl border border-red-200 bg-red-50 px-md py-sm text-sm text-red-700">{importError}</div>
      )}

      {/* Import preview panel */}
      {importPreview && (
        <div className="mb-md rounded-xl border-2 border-neutral-900 bg-white overflow-hidden">
          <div className="px-lg py-md border-b border-neutral-100 flex items-center justify-between gap-md">
            <div>
              <p className="text-sm font-bold text-neutral-900">⚡ AI extracted {importPreview.length} fields</p>
              <p className="text-xs text-neutral-500 mt-xs">Tick the ones to import — already-existing labels are pre-deselected.</p>
            </div>
            <div className="flex items-center gap-sm shrink-0">
              <button
                onClick={() => setImportPreview(null)}
                className="text-xs font-semibold text-neutral-500 hover:text-neutral-900"
              >Cancel</button>
              <button
                onClick={confirmImport}
                className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white hover:bg-neutral-700"
              >
                Import selected
              </button>
            </div>
          </div>
          <div className="divide-y divide-neutral-100 max-h-80 overflow-y-auto">
            {importPreview.map((it, idx) => (
              <label key={idx} className="flex items-start gap-md px-lg py-sm cursor-pointer hover:bg-neutral-50">
                <input
                  type="checkbox"
                  checked={it.selected}
                  onChange={e => setImportPreview(prev => prev!.map((p, i) => i === idx ? { ...p, selected: e.target.checked } : p))}
                  className="mt-xs shrink-0"
                />
                <span className="text-lg shrink-0">{it.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-neutral-900">{it.label}</p>
                  <p className="text-xs text-neutral-500 truncate whitespace-pre-line">
                    {it.sensitive ? '•••••• (sensitive)' : it.value}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Item list */}
      <div className="space-y-sm">
        {items.map((item, idx) => (
          <div key={idx} className="rounded-xl border border-neutral-200 bg-white">
            {/* Row header */}
            <div
              className="flex items-center gap-sm px-md py-sm cursor-pointer hover:bg-neutral-50 transition-colors"
              onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
            >
              <span className="text-lg shrink-0">{item.icon || '📌'}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-neutral-900">{item.label || <span className="text-neutral-400">Untitled</span>}</span>
                {item.value && (
                  <span className="ml-sm text-sm text-neutral-500 truncate">
                    {item.sensitive ? '••••••••' : item.value}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-xs shrink-0">
                <button onClick={e => { e.stopPropagation(); moveItem(idx, -1) }} disabled={idx === 0}
                  className="text-xs text-neutral-400 hover:text-neutral-700 disabled:opacity-30 px-xs">▲</button>
                <button onClick={e => { e.stopPropagation(); moveItem(idx, 1) }} disabled={idx === items.length - 1}
                  className="text-xs text-neutral-400 hover:text-neutral-700 disabled:opacity-30 px-xs">▼</button>
                <button onClick={e => { e.stopPropagation(); removeItem(idx) }}
                  className="text-xs text-red-400 hover:text-red-600 px-xs font-bold">✕</button>
              </div>
            </div>

            {/* Inline edit form */}
            {editingIdx === idx && (
              <div className="border-t border-neutral-100 px-md py-md grid grid-cols-2 gap-sm">
                <div>
                  <label className="text-xs font-semibold text-neutral-500 mb-xs block">Icon (emoji)</label>
                  <input
                    value={item.icon}
                    onChange={e => updateItem(idx, { icon: e.target.value })}
                    maxLength={4}
                    className="w-full rounded-lg border border-neutral-200 px-sm py-xs text-sm focus:outline-none focus:border-neutral-900"
                    placeholder="📌"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-neutral-500 mb-xs block">Label</label>
                  <input
                    value={item.label}
                    onChange={e => updateItem(idx, { label: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 px-sm py-xs text-sm focus:outline-none focus:border-neutral-900"
                    placeholder="e.g. WiFi Password"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-neutral-500 mb-xs block">Value</label>
                  <textarea
                    value={item.value}
                    onChange={e => updateItem(idx, { value: e.target.value })}
                    rows={2}
                    className="w-full rounded-lg border border-neutral-200 px-sm py-xs text-sm focus:outline-none focus:border-neutral-900 resize-none"
                    placeholder="e.g. CapitalRooms5G or multi-line details"
                  />
                </div>
                <div className="col-span-2 flex items-center gap-sm">
                  <label className="flex items-center gap-xs text-sm text-neutral-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!item.sensitive}
                      onChange={e => updateItem(idx, { sensitive: e.target.checked })}
                      className="rounded"
                    />
                    Sensitive — hide by default on tenant screen (tap to reveal)
                  </label>
                </div>
              </div>
            )}
          </div>
        ))}

        {items.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 p-lg text-center text-sm text-neutral-400">
            No house info yet — add from the quick buttons below or start from scratch.
          </div>
        )}
      </div>

      {/* Quick-add buttons */}
      {quickOptions.length > 0 && (
        <div className="mt-md">
          <p className="text-xs font-semibold text-neutral-400 mb-xs">Quick add</p>
          <div className="flex flex-wrap gap-xs">
            {quickOptions.map(q => (
              <button
                key={q.label}
                onClick={() => addItem(q)}
                className="rounded-lg border border-neutral-200 bg-white px-sm py-xs text-xs font-semibold text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50 transition-colors"
              >
                {q.icon} {q.label}
              </button>
            ))}
            <button
              onClick={() => addItem()}
              className="rounded-lg border border-dashed border-neutral-300 px-sm py-xs text-xs font-semibold text-neutral-500 hover:border-neutral-900 transition-colors"
            >
              + Custom
            </button>
          </div>
        </div>
      )}
      {quickOptions.length === 0 && (
        <div className="mt-md">
          <button
            onClick={() => addItem()}
            className="rounded-lg border border-dashed border-neutral-300 px-sm py-xs text-xs font-semibold text-neutral-500 hover:border-neutral-900 transition-colors"
          >
            + Add another
          </button>
        </div>
      )}
    </div>
  )
}
