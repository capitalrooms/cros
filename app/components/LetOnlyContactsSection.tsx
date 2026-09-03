'use client'

/**
 * LetOnlyContactsSection
 *
 * Inline panel for managing remaining tenant contacts at a let-only property.
 * These are NOT CROS users — just contact records stored in let_only_contacts.
 *
 * Shows existing contacts + add/remove form. Used inside the let-only detail view.
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Contact {
  id: string
  name: string
  email: string | null
  phone: string | null
  room_info: string | null
}

interface Props {
  listingId: string
}

export default function LetOnlyContactsSection({ listingId }: Props) {
  const supabase = createClient()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [roomInfo, setRoomInfo] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function loadContacts() {
    const { data } = await supabase
      .from('let_only_contacts')
      .select('id, full_name, first_name, last_name, email, phone, room_info')
      .eq('listing_id', listingId)
      .order('created_at')
    setContacts(data || [])
    setLoading(false)
  }

  useEffect(() => { loadContacts() }, [listingId])

  async function handleAdd() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('let_only_contacts').insert({
      listing_id: listingId,
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      room_info: roomInfo.trim() || null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setName(''); setEmail(''); setPhone(''); setRoomInfo('')
    setAdding(false)
    setSaving(false)
    await loadContacts()
  }

  async function handleRemove(id: string) {
    await supabase.from('let_only_contacts').delete().eq('id', id)
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  if (loading) return <p className="text-sm text-neutral-400 py-sm">Loading contacts…</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-sm">
        <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">
          Remaining tenant contacts ({contacts.length})
        </p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            + Add contact
          </button>
        )}
      </div>

      {contacts.length === 0 && !adding && (
        <p className="text-xs text-neutral-400 italic">
          No contacts yet. Add contacts to notify them when viewings are booked.
        </p>
      )}

      {/* Existing contacts */}
      <div className="space-y-sm">
        {contacts.map(c => (
          <div key={c.id} className="flex items-start justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-md py-sm">
            <div>
              <p className="text-sm font-medium text-neutral-900">{c.name}</p>
              <p className="text-xs text-neutral-500">
                {[c.room_info, c.email, c.phone].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button
              onClick={() => handleRemove(c.id)}
              className="text-xs text-red-400 hover:text-red-600 ml-md shrink-0"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* Add form */}
      {adding && (
        <div className="mt-sm rounded-xl border border-neutral-200 bg-white p-md space-y-sm">
          <div className="grid grid-cols-2 gap-sm">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-xs">Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm text-neutral-900 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-xs">Room</label>
              <input
                type="text"
                value={roomInfo}
                onChange={e => setRoomInfo(e.target.value)}
                placeholder="e.g. Room 2"
                className="w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm text-neutral-900 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-sm">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-xs">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="contact@…"
                className="w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm text-neutral-900 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-xs">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="07700 …"
                className="w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm text-neutral-900 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-sm">
            <button
              onClick={() => { setAdding(false); setError(null) }}
              className="flex-1 rounded-lg border border-neutral-200 py-xs text-xs font-medium text-neutral-600 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="flex-1 rounded-lg bg-neutral-900 py-xs text-xs font-bold text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add contact'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
