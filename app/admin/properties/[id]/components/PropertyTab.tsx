'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

interface PropertyTabProps {
  property: any
}

export default function PropertyTab({ property }: PropertyTabProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const [formData, setFormData] = useState({
    bedrooms: property.bedrooms || 0,
    bathrooms: property.bathrooms || 0,
    total_area: property.total_area || '',
    description: property.description || '',
    property_type: property.property_type || 'house'
  })

  const supabase = createClient()

  async function handleSave() {
    setSaving(true)
    const { error: err } = await supabase
      .from('properties')
      .update({
        bedrooms: parseInt(formData.bedrooms),
        bathrooms: parseInt(formData.bathrooms),
        total_area: formData.total_area ? parseFloat(formData.total_area) : null,
        description: formData.description || null,
        property_type: formData.property_type
      })
      .eq('id', property.id)

    if (err) {
      setError('Failed to save changes')
      console.error(err)
    } else {
      setSuccess('Property updated successfully')
      setIsEditing(false)
      setTimeout(() => setSuccess(null), 3000)
    }
    setSaving(false)
  }

  async function handlePhotoUpload(file: File) {
    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('property_id', property.id)
    formData.append('document_type', 'property_photo')
    formData.append('file_name', file.name)

    try {
      const response = await fetch('/api/admin/upload-property-document', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Upload failed')
      }

      setSuccess(`Photo "${file.name}" uploaded successfully`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(`Failed to upload photo: ${err instanceof Error ? err.message : 'Unknown error'}`)
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3xl">
      {error && (
        <div className="p-lg rounded-lg bg-red-950 border border-red-800">
          <p className="text-sm font-semibold text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-lg rounded-lg bg-green-950 border border-green-800">
          <p className="text-sm font-semibold text-green-400">✓ {success}</p>
        </div>
      )}

      {/* Property Details */}
      <div>
        <div className="flex items-center justify-between mb-lg pb-lg border-b border-neutral-100">
          <h3 className="text-sm font-bold uppercase text-neutral-400">Property Details</h3>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 underline"
            >
              Edit
            </button>
          ) : (
            <div className="flex gap-sm">
              <button
                onClick={() => {
                  setIsEditing(false)
                  setFormData({
                    bedrooms: property.bedrooms || 0,
                    bathrooms: property.bathrooms || 0,
                    total_area: property.total_area || '',
                    description: property.description || '',
                    property_type: property.property_type || 'house'
                  })
                }}
                className="text-xs font-semibold text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-xs font-semibold text-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-lg">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Bedrooms
                </label>
                <input
                  type="number"
                  value={formData.bedrooms}
                  onChange={(e) => setFormData({ ...formData, bedrooms: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Bathrooms
                </label>
                <input
                  type="number"
                  value={formData.bathrooms}
                  onChange={(e) => setFormData({ ...formData, bathrooms: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Total Area (m²)
                </label>
                <input
                  type="number"
                  value={formData.total_area}
                  onChange={(e) => setFormData({ ...formData, total_area: e.target.value })}
                  placeholder="0"
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Property Type
                </label>
                <select
                  value={formData.property_type}
                  onChange={(e) => setFormData({ ...formData, property_type: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="house">House</option>
                  <option value="flat">Flat</option>
                  <option value="detached">Detached</option>
                  <option value="semi-detached">Semi-Detached</option>
                  <option value="terrace">Terrace</option>
                  <option value="bungalow">Bungalow</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Add notes about the property..."
                className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-lg">
            <div className="space-y-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Bedrooms</p>
              <p className="text-sm font-semibold text-white">{property.bedrooms}</p>
            </div>
            <div className="space-y-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Bathrooms</p>
              <p className="text-sm font-semibold text-white">{property.bathrooms}</p>
            </div>
            <div className="space-y-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Total Area</p>
              <p className="text-sm font-semibold text-white">{property.total_area ? `${property.total_area}m²` : '—'}</p>
            </div>
            <div className="space-y-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Type</p>
              <p className="text-sm font-semibold text-white capitalize">{property.property_type || 'house'}</p>
            </div>
          </div>
        )}

        {property.description && !isEditing && (
          <div className="mt-lg pt-lg border-t border-neutral-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Description</p>
            <p className="text-sm text-white whitespace-pre-wrap">{property.description}</p>
          </div>
        )}
      </div>

      {/* Floor Plans & Photos - Upload Ready */}
      <div>
        <h3 className="text-sm font-bold uppercase text-neutral-400 mb-lg pb-lg border-b border-neutral-100">
          Floor Plans & Room Dimensions
        </h3>
        <input
          id="floorplan-input"
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files || [])
            files.forEach(f => {
              const form = new FormData()
              form.append('file', f)
              form.append('property_id', property.id)
              form.append('document_type', 'floor_plan')
              form.append('file_name', f.name)
              handlePhotoUpload(f)
            })
            e.currentTarget.value = ''
          }}
          className="hidden"
        />
        <div
          onClick={() => document.getElementById('floorplan-input')?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            e.currentTarget.classList.add('border-blue-400', 'bg-neutral-800')
          }}
          onDragLeave={(e) => {
            e.currentTarget.classList.remove('border-blue-400', 'bg-neutral-800')
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.currentTarget.classList.remove('border-blue-400', 'bg-neutral-800')
            const files = Array.from(e.dataTransfer.files)
            files.forEach(f => handlePhotoUpload(f))
          }}
          className="rounded-lg border-2 border-dashed border-neutral-700 bg-neutral-900 p-2xl text-center transition hover:border-neutral-500 hover:bg-neutral-800 cursor-pointer"
        >
          <div className="text-3xl mb-md opacity-60">📄</div>
          <p className="text-sm font-semibold text-white mb-xs">Drop floor plan here or click to upload</p>
          <p className="text-xs text-neutral-400">PDF or JPEG • Max 10MB</p>
          {uploading && <p className="text-xs text-blue-400 mt-md">Uploading...</p>}
        </div>
      </div>

      {/* Property Photos */}
      <div>
        <h3 className="text-sm font-bold uppercase text-neutral-400 mb-lg pb-lg border-b border-neutral-100">
          Property Photos (Communal & Exterior)
        </h3>
        <input
          id="photo-input"
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files || [])
            files.forEach(f => handlePhotoUpload(f))
            e.currentTarget.value = ''
          }}
          className="hidden"
        />
        <div
          onClick={() => document.getElementById('photo-input')?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            e.currentTarget.classList.add('border-blue-400', 'bg-neutral-800')
          }}
          onDragLeave={(e) => {
            e.currentTarget.classList.remove('border-blue-400', 'bg-neutral-800')
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.currentTarget.classList.remove('border-blue-400', 'bg-neutral-800')
            const files = Array.from(e.dataTransfer.files)
            files.forEach(f => handlePhotoUpload(f))
          }}
          className="rounded-lg border-2 border-dashed border-neutral-700 bg-neutral-900 p-xl text-center transition hover:border-neutral-500 hover:bg-neutral-800 cursor-pointer"
        >
          <div className="text-3xl mb-md opacity-60">📷</div>
          <p className="text-sm font-semibold text-white mb-xs">Drop photos here or click to upload</p>
          <p className="text-xs text-neutral-400">PNG, JPG, WebP • Max 10MB each</p>
          {uploading && <p className="text-xs text-blue-400 mt-md">Uploading...</p>}
        </div>
      </div>
    </div>
  )
}
