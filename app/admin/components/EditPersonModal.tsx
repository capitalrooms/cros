'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Person {
  id: string
  email: string
  full_name?: string
  name?: string
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
  const [formData, setFormData] = useState({
    full_name: person.full_name || person.name || '',
    email: person.email || '',
    phone_number: person.phone_number || '',
    bank_details: person.bank_details || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!formData.full_name.trim()) {
      setError('Name is required')
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
      const { error: err } = await supabase
        .from('people')
        .update({
          full_name: formData.full_name,
          email: formData.email,
          phone_number: formData.phone_number || null,
          bank_details: formData.bank_details || null,
        })
        .eq('id', person.id)

      if (err) throw err

      onSave({
        ...person,
        ...formData,
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
          {/* Full Name */}
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-xs">
              Full Name
            </label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 px-md py-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="John Doe"
            />
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
              placeholder="john@example.com"
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
