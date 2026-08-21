'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface PropertyTabProps {
  property: any
}

interface Photo {
  id: string
  file_name: string
  file_path: string
  file_url: string | null
  is_featured: boolean
}

export default function PropertyTab({ property }: PropertyTabProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [uploadingFloorPlan, setUploadingFloorPlan] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [savingFeatured, setSavingFeatured] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(true)

  const [formData, setFormData] = useState({
    bedrooms: property.bedrooms || 0,
    bathrooms: property.bathrooms || 0,
    total_area: property.total_area || '',
    description: property.description || '',
    property_type: property.property_type || 'house'
  })

  const supabase = createClient()

  useEffect(() => {
    loadPhotos()
  }, [property.id])

  async function loadPhotos() {
    setLoadingPhotos(true)
    const { data } = await supabase
      .from('property_photos')
      .select('*')
      .eq('property_id', property.id)
      .order('uploaded_at', { ascending: false })

    setPhotos(data || [])
    setLoadingPhotos(false)
  }

  async function handleSetFeatured(photoId: string) {
    setSavingFeatured(photoId)
    try {
      await supabase
        .from('properties')
        .update({ featured_photo_id: photoId })
        .eq('id', property.id)

      // Update local photos state
      const updated = photos.map(p => ({
        ...p,
        is_featured: p.id === photoId
      }))
      setPhotos(updated)
      setSuccess('✓ Featured photo updated - reload to see changes')
      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      setError(`Failed to set featured photo: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSavingFeatured(null)
    }
  }

  async function handleDeletePhoto(photoId: string) {
    try {
      const photo = photos.find(p => p.id === photoId)
      if (!photo) return

      // Delete from storage
      if (photo.file_path) {
        await fetch('/api/admin/delete-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_path: photo.file_path })
        })
      }

      // Delete from database
      await supabase
        .from('property_photos')
        .delete()
        .eq('id', photoId)

      // Update local state
      setPhotos(photos.filter(p => p.id !== photoId))
      setSuccess('Photo deleted')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(`Failed to delete photo: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

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
    setUploadingPhoto(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('property_id', property.id)

    try {
      const response = await fetch('/api/admin/upload-photo', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Upload failed')
      }

      const data = await response.json()

      // Save photo metadata to database
      await supabase
        .from('property_photos')
        .insert({
          property_id: property.id,
          file_name: file.name,
          file_path: data.path,
          file_url: data.url,
          file_size: file.size,
          file_type: file.type
        })

      // Reload photos
      await loadPhotos()

      setSuccess(`Photo "${file.name}" uploaded successfully`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(`Failed to upload photo: ${err instanceof Error ? err.message : 'Unknown error'}`)
      console.error(err)
    } finally {
      setUploadingPhoto(false)
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
          Floor Plans
        </h3>
        <input
          id="floorplan-input"
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files || [])
            setUploadingFloorPlan(true)
            files.forEach(f => handlePhotoUpload(f))
            e.currentTarget.value = ''
            setUploadingFloorPlan(false)
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
          {uploadingFloorPlan && <p className="text-xs text-blue-400 mt-md">Uploading...</p>}
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
          {uploadingPhoto && <p className="text-xs text-blue-400 mt-md">Uploading...</p>}
        </div>

        {/* Photo Gallery */}
        {loadingPhotos ? (
          <p className="text-sm text-neutral-400 mt-lg">Loading photos...</p>
        ) : photos.length > 0 ? (
          <div className="mt-lg">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-md">Uploaded Photos</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-md">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative rounded-lg border-2 border-neutral-200 overflow-hidden group bg-neutral-50"
                >
                  {/* Image display */}
                  <div className="aspect-square bg-neutral-100 flex items-center justify-center text-2xl overflow-hidden">
                    <img
                      src={photo.file_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${photo.file_path?.startsWith('property-photos/') ? photo.file_path : `property-photos/${photo.file_path}`}`}
                      alt={photo.file_name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  </div>

                  {/* File name */}
                  <p className="text-xs font-semibold p-sm text-neutral-700 truncate">{photo.file_name}</p>

                  {/* Featured checkbox and delete button */}
                  <div className="p-sm border-t border-neutral-200 flex items-center justify-between">
                    <div className="flex items-center gap-sm">
                      <input
                        type="checkbox"
                        checked={photo.is_featured}
                        onChange={() => handleSetFeatured(photo.id)}
                        disabled={savingFeatured === photo.id}
                        className="w-4 h-4 cursor-pointer disabled:opacity-50 transition"
                        title="Set as featured photo"
                      />
                      <label className={`text-xs font-semibold transition ${
                        savingFeatured === photo.id
                          ? 'text-blue-600 animate-pulse'
                          : photo.is_featured
                          ? 'text-green-600 font-bold'
                          : 'text-neutral-600 hover:text-blue-600 cursor-pointer'
                      }`}>
                        {savingFeatured === photo.id ? '⏳ Saving...' : photo.is_featured ? '✓ Featured' : 'Featured'}
                      </label>
                    </div>
                    <button
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="text-xs text-red-600 hover:text-red-700 font-semibold"
                      title="Delete photo"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-400 mt-lg">No photos uploaded yet</p>
        )}
      </div>
    </div>
  )
}
