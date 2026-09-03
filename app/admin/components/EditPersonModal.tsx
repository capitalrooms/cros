'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { nameFields, SALUTATIONS } from '@/lib/people'

interface Person {
  id: string
  email: string
  salutation?: string
  first_name?: string
  last_name?: string
  full_name?: string
  name?: string  // kept for compat; live DB uses full_name
  phone_number?: string
  bank_details?: string
}

interface EditPersonModalProps {
  person: Person
  isOpen: boolean
  onClose: () => void
  onSave: (updatedPerson: Person) => void
}

export default function EditPersonModal({ person, isOpen, onClose, onSave }: EditPersonModalProps) {
  // Initialise from first_name/last_name; fall back to splitting the legacy name column
  const legacyName = person.full_name || person.name || ''
  const initFirst = person.first_name || legacyName.split(' ')[0] || ''
  const initLast  = person.last_name  || legacyName.split(' ').slice(1).join(' ') || ''

  const [formData, setFormData] = useState({
    salutation: person.salutation || '',
    first_name: initFirst,
    last_name: initLast,
    email: person.email || '',
    phone_number: person.phone_number || '',
    bank_details: person.bank_details || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!formData.first_name.trim()) {
      setError('First name is required')
      return
    }
    if (!formData.email.trim()) {
      setError('Email is required')
      return
    }

    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const names = nameFields(formData.first_name, formData.last_name)
      const { error: err } = await supabase
        .from('people')
        .update({
          ...names,
          salutation: formData.salutation || null,
          email: formData.email,
          phone_number: formData.phone_number || null,
          bank_details: formData.bank_details || null,
        })
        .eq('id', person.id)

      if (err) throw err

      onSave({
        ...person,
        ...names,
        salutation: formData.salutation || undefined,
        email: formData.email,
        phone_number: formData.phone_number || undefined,
        bank_details: formData.bank_details || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving person')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
      <div className="bg-white rounded-2xl max-w-md w-full p-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-neutral-900 mb-lg">Edit Person</h2>

        <div className="space-y-md">
          {/* Salutation + Name */}
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-xs">Salutation</label>
            <select
              value={formData.salutation}
              onChange={(e) => setFormData({ ...formData, salutation: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 px-md py-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">— None —</option>
              {SALUTATIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-xs">
                First Name
              </label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 px-md py-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Jane"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-xs">
                Last Name
              </label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 px-md py-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Doe"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-xs">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 px-md py-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="jane@example.com"
            />
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-xs">
              Phone Number
            </label>
            <input
              type="tel"
              value={formData.phone_number}
              onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 px-md py-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+44 123 456 7890"
            />
          </div>

          {/* Bank Details */}
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-xs">
              Bank Details
            </label>
            <input
              type="text"
              value={formData.bank_details}
              onChange={(e) => setFormData({ ...formData, bank_details: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 px-md py-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Sort code / Account number"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-md mt-lg">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-neutral-300 px-md py-md font-semibold text-neutral-900 hover:bg-neutral-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-blue-600 text-white px-md py-md font-semibold hover:bg-blue-700 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
