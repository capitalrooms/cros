'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import Link from 'next/link'

interface Property {
  id: string
  name: string
  address: string
}

const DOCUMENT_TYPES = [
  { value: 'evacuation_plan', label: '🚨 Evacuation Plan' },
  { value: 'emergency_contacts', label: '☎️ Emergency Contacts' },
  { value: 'house_rules', label: '📋 House Rules' },
  { value: 'safety_info', label: '🛡️ Safety Information' },
  { value: 'utility_info', label: '⚙️ Utilities' },
  { value: 'policies', label: '📄 Policies' }
]

export default function PropertyDocumentsPage() {
  const supabase = createClient()
  const [properties, setProperties] = useState<Property[]>([])
  const [selectedProperty, setSelectedProperty] = useState<string>('')
  const [documentType, setDocumentType] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    async function loadProperties() {
      const { data } = await supabase
        .from('properties')
        .select('id, name, address')
        .order('name')
      setProperties(data || [])
      setLoading(false)
    }
    loadProperties()
  }, [])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()

    if (!selectedProperty || !documentType || !file) {
      setMessage({ type: 'error', text: 'Please fill in all required fields' })
      return
    }

    setUploading(true)
    setMessage(null)

    try {
      // Route through server-side API which uses the service-role key,
      // bypassing RLS entirely (no storage policy or insert policy needed).
      const body = new FormData()
      body.append('file', file)
      body.append('property_id', selectedProperty)
      body.append('document_type', documentType)
      body.append('description', description || '')
      body.append('file_name', file.name)

      const res = await fetch('/api/admin/upload-property-document', { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')

      setMessage({ type: 'success', text: '✅ Document uploaded successfully! Tenants can now view it.' })
      setSelectedProperty('')
      setDocumentType('')
      setDescription('')
      setFile(null)
    } catch (err: any) {
      setMessage({ type: 'error', text: `Error: ${err.message}` })
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar right={<Link href="/admin" className="text-sm font-bold text-neutral-700">← Admin</Link>} />
        <div className="flex items-center justify-center h-96">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/admin" className="text-sm font-bold text-neutral-700">← Admin</Link>} />

      <main className="mx-auto max-w-2xl px-lg py-2xl">
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-neutral-900 to-neutral-800 px-xl py-lg text-white">
            <h1 className="text-2xl font-bold">📄 Upload Property Documents</h1>
            <p className="text-neutral-300 mt-xs">Evacuation plans, emergency contacts, house rules, and safety information for tenants</p>
          </div>

          {/* Form */}
          <form onSubmit={handleUpload} className="p-xl space-y-lg">
            {/* Messages */}
            {message && (
              <div className={`rounded-lg p-md text-sm font-semibold ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-900 border border-green-200'
                  : 'bg-red-50 text-red-900 border border-red-200'
              }`}>
                {message.text}
              </div>
            )}

            {/* Property Selection */}
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-sm">
                Property *
              </label>
              <select
                value={selectedProperty}
                onChange={(e) => setSelectedProperty(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:ring-opacity-20"
                required
              >
                <option value="">Select a property...</option>
                {properties.map((prop) => (
                  <option key={prop.id} value={prop.id}>
                    {prop.name} — {prop.address}
                  </option>
                ))}
              </select>
            </div>

            {/* Document Type */}
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-sm">
                Document Type *
              </label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:ring-opacity-20"
                required
              >
                <option value="">Select a type...</option>
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-sm">
                Description (Optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Updated June 2024, Contains meeting point details..."
                className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm placeholder-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:ring-opacity-20"
              />
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-sm">
                File (PDF or Image) *
              </label>
              <label className="flex items-center justify-center gap-md rounded-lg border-2 border-dashed border-neutral-300 px-md py-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <span className="text-2xl">📁</span>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">
                    {file ? file.name : 'Click to select file'}
                  </p>
                  <p className="text-xs text-neutral-600">or drag and drop</p>
                </div>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.gif"
                  onChange={(e) => setFile(e.currentTarget.files?.[0] || null)}
                  className="hidden"
                  required
                />
              </label>
            </div>

            {/* Submit */}
            <div className="flex gap-md pt-lg border-t border-neutral-200">
              <button
                type="submit"
                disabled={uploading}
                className="flex-1 rounded-xl bg-neutral-900 px-lg py-md text-sm font-semibold text-white hover:bg-neutral-800 disabled:bg-neutral-400 transition-colors"
              >
                {uploading ? '⏳ Uploading...' : '📤 Upload Document'}
              </button>
              <Link href="/admin" className="flex-1">
                <button
                  type="button"
                  className="w-full rounded-xl border border-neutral-300 px-lg py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
                >
                  Cancel
                </button>
              </Link>
            </div>
          </form>

          {/* Info */}
          <div className="border-t border-neutral-200 bg-neutral-50 px-xl py-lg">
            <h3 className="font-semibold text-neutral-900 mb-md">📌 Tips</h3>
            <ul className="space-y-sm text-sm text-neutral-600">
              <li>✓ Upload floor plans, emergency contact sheets, and house rules</li>
              <li>✓ Tenants will see these organized by category in their app</li>
              <li>✓ Supported formats: PDF, PNG, JPG, GIF</li>
              <li>✓ Use clear, readable files (scanned documents work well)</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  )
}
