'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import FloorPlanMap from './FloorPlanMap'

interface PropertyTabProps {
  property: any
  onUpdate?: (updates: Record<string, any>) => void
}

interface Photo {
  id: string
  file_name: string
  file_path: string
  file_url: string | null
  is_featured: boolean
}

export default function PropertyTab({ property, onUpdate }: PropertyTabProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  // Local display copy — updated on save so values reflect immediately without a page reload
  const [displayed, setDisplayed] = useState(property)
  const [uploadingFloorPlan, setUploadingFloorPlan] = useState(false)
  const [scanningPlan, setScanningPlan] = useState(false)
  const [floorPlanResult, setFloorPlanResult] = useState<{ detected: any[]; notes: string; bathrooms_count?: number; ensuite_room_labels?: string[]; layout_notes?: string } | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [savingFeatured, setSavingFeatured] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(true)
  // Landlord picker
  const [landlords, setLandlords] = useState<any[]>([])
  const [selectedLandlordId, setSelectedLandlordId] = useState<string | null>(property.landlord_id || null)

  const [formData, setFormData] = useState({
    name: property.name || '',
    address: property.address || '',
    council_tax_band: property.council_tax_band || '',
    bills_included: property.bills_included !== undefined ? property.bills_included : true,
    notice_period_months: property.notice_period_months || 2,
    license_date: property.license_date || '',
    license_expiry: property.license_expiry || '',
    bedrooms: property.bedrooms || 0,
    bathrooms: property.bathrooms || 0,
    total_area: property.total_area || '',
    description: property.description || '',
    property_type: property.property_type || 'house',
    key_safe_code: property.key_safe_code || '',
    management_fee_pct: property.management_fee_pct != null ? String(property.management_fee_pct) : '12',
  })

  const supabase = createClient()

  useEffect(() => {
    loadPhotos()
    loadLandlords()
  }, [property.id])

  async function loadLandlords() {
    const { data } = await supabase
      .from('people')
      .select('id, full_name, first_name, last_name, email, phone')
      .eq('role', 'landlord')
      .order('full_name')
    setLandlords(data || [])
  }

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
        name: formData.name.trim() || null,
        address: formData.address.trim() || null,
        landlord_id: selectedLandlordId || null,
        council_tax_band: formData.council_tax_band || null,
        bills_included: formData.bills_included,
        notice_period_months: parseInt(formData.notice_period_months),
        bedrooms: parseInt(formData.bedrooms),
        bathrooms: parseInt(formData.bathrooms),
        total_area: formData.total_area ? parseFloat(formData.total_area) : null,
        description: formData.description || null,
        property_type: formData.property_type,
        key_safe_code: formData.key_safe_code.trim() || null,
        management_fee_pct: formData.management_fee_pct ? parseFloat(formData.management_fee_pct) : 12,
        license_date: formData.license_date || null,
        license_expiry: formData.license_expiry || null,
      })
      .eq('id', property.id)

    if (err) {
      setError('Failed to save changes')
      console.error(err)
    } else {
      // Update local display copy AND bubble up to parent so it survives tab switches
      const updates = {
        name: formData.name.trim() || null,
        address: formData.address.trim() || null,
        landlord_id: selectedLandlordId || null,
        council_tax_band: formData.council_tax_band || null,
        bills_included: formData.bills_included,
        notice_period_months: parseInt(formData.notice_period_months),
        bedrooms: parseInt(formData.bedrooms),
        bathrooms: parseInt(formData.bathrooms),
        total_area: formData.total_area ? parseFloat(formData.total_area) : null,
        description: formData.description || null,
        property_type: formData.property_type,
        key_safe_code: formData.key_safe_code.trim() || null,
        management_fee_pct: formData.management_fee_pct ? parseFloat(formData.management_fee_pct) : 12,
        license_date: formData.license_date || null,
        license_expiry: formData.license_expiry || null,
      }
      setDisplayed(prev => ({ ...prev, ...updates }))
      onUpdate?.(updates)
      setSuccess('Saved')
      setIsEditing(false)
      setTimeout(() => setSuccess(null), 2000)
    }
    setSaving(false)
  }

  // Scan an uploaded floor plan with the AI to pull room sizes, then open the
  // mapping review so the admin can confirm and apply them to units.
  async function scanFloorPlan(file: File) {
    setScanningPlan(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/ai/scan-floorplan', { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Could not scan the floor plan for sizes')
        return
      }
      setFloorPlanResult({
        detected: json.result?.detected_rooms || [],
        notes: json.result?.notes || '',
        bathrooms_count: json.result?.bathrooms_count,
        ensuite_room_labels: json.result?.ensuite_room_labels || [],
        layout_notes: json.result?.layout_notes || '',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not scan the floor plan')
    } finally {
      setScanningPlan(false)
    }
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

      {/* Edit / Save / Cancel — top of page so it's clear it covers everything */}
      <div className="flex items-center justify-between pb-lg border-b border-neutral-200">
        <p className="text-xs text-neutral-400">
          {isEditing ? 'Editing property info — save or cancel below' : 'Property information'}
        </p>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="rounded-full bg-neutral-800 px-md py-xs text-xs font-semibold text-white hover:bg-neutral-700 transition"
          >
            ✎ Edit
          </button>
        ) : (
          <div className="flex gap-sm">
            <button
              onClick={() => {
                setIsEditing(false)
                setSelectedLandlordId(property.landlord_id || null)
                setFormData({
                  name: property.name || '',
                  address: property.address || '',
                  council_tax_band: property.council_tax_band || '',
                  bills_included: property.bills_included !== undefined ? property.bills_included : true,
                  notice_period_months: property.notice_period_months || 2,
                  bedrooms: property.bedrooms || 0,
                  bathrooms: property.bathrooms || 0,
                  total_area: property.total_area || '',
                  description: property.description || '',
                  property_type: property.property_type || 'house'
                })
              }}
              className="rounded-full border border-neutral-600 px-md py-xs text-xs font-semibold text-neutral-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-blue-600 px-md py-xs text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}
      </div>

      {/* Landlord Information */}
      <div>
        <div className="flex items-center justify-between mb-lg pb-lg border-b border-neutral-100">
          <h3 className="text-sm font-bold uppercase text-neutral-400">👨 Landlord</h3>
        </div>

        {isEditing ? (
          <div className="space-y-md">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                Link landlord record
              </label>
              <select
                value={selectedLandlordId || ''}
                onChange={(e) => setSelectedLandlordId(e.target.value || null)}
                className="w-full px-md py-sm border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-neutral-900"
              >
                <option value="">— No landlord linked —</option>
                {landlords.map(l => (
                  <option key={l.id} value={l.id}>{l.name}{l.email ? ` (${l.email})` : ''}</option>
                ))}
              </select>
              {landlords.length === 0 && (
                <p className="text-xs text-neutral-400 mt-sm">
                  No landlord records yet.{' '}
                  <a href="/admin/landlords" className="text-blue-600 underline">Create one first →</a>
                </p>
              )}
              {selectedLandlordId && (() => {
                const linked = landlords.find(l => l.id === selectedLandlordId)
                if (!linked) return null
                return (
                  <div className="mt-md rounded-lg bg-neutral-50 border border-neutral-200 p-md grid grid-cols-3 gap-md text-sm">
                    <div><p className="text-xs text-neutral-400 mb-xs">Name</p><p className="font-semibold text-neutral-900">{linked.full_name || [linked.first_name, linked.last_name].filter(Boolean).join(' ') || '—'}</p></div>
                    <div><p className="text-xs text-neutral-400 mb-xs">Email</p><p className="font-semibold text-neutral-900">{linked.email || '—'}</p></div>
                    <div><p className="text-xs text-neutral-400 mb-xs">Phone</p><p className="font-semibold text-neutral-900">{linked.phone || '—'}</p></div>
                  </div>
                )
              })()}
            </div>
          </div>
        ) : (
          (() => {
            const linked = landlords.find(l => l.id === displayed.landlord_id)
            if (linked) {
              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
                  <div className="space-y-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Name</p>
                    <a href={`/admin/landlord/${linked.id}`} className="text-sm font-semibold text-blue-600 hover:underline block">{linked.full_name || linked.company || [linked.first_name, linked.last_name].filter(Boolean).join(' ') || '—'}</a>
                  </div>
                  <div className="space-y-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Email</p>
                    <p className="text-sm font-semibold text-neutral-900">{linked.email || '—'}</p>
                  </div>
                  <div className="space-y-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Phone</p>
                    <p className="text-sm font-semibold text-neutral-900">{linked.phone || '—'}</p>
                  </div>
                </div>
              )
            }
            return (
              <div className="flex items-center gap-md rounded-lg border border-dashed border-neutral-300 p-md">
                <span className="text-neutral-400 text-sm">No landlord linked to this property.</span>
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-blue-600 font-semibold hover:underline"
                >
                  Link one →
                </button>
              </div>
            )
          })()
        )}
      </div>

      {/* Property Details (merged: tenancy settings + physical details) */}
      <div>
        <div className="mb-lg pb-lg border-b border-neutral-100">
          <h3 className="text-sm font-bold uppercase text-neutral-400">⚙️ Property Details</h3>
        </div>

        {isEditing ? (
          <div className="space-y-lg">
            {/* Row 0: name and address */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">Display Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. 71 Alloa Road"
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">Full Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="e.g. 71 Alloa Road, London, SE8 5AH"
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {/* Row 1: council tax, HMO license dates, bills */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-lg">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">Council Tax Band</label>
                <input
                  type="text"
                  value={formData.council_tax_band}
                  onChange={(e) => setFormData({ ...formData, council_tax_band: e.target.value.toUpperCase() })}
                  maxLength={1}
                  placeholder="A–H"
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">HMO Licence Issued</label>
                <input
                  type="date"
                  value={formData.license_date}
                  onChange={(e) => setFormData({ ...formData, license_date: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">HMO Licence Expiry</label>
                <input
                  type="date"
                  value={formData.license_expiry}
                  onChange={(e) => setFormData({ ...formData, license_expiry: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">Bills Included</label>
                <select
                  value={formData.bills_included ? 'yes' : 'no'}
                  onChange={(e) => setFormData({ ...formData, bills_included: e.target.value === 'yes' })}
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>

            {/* Row 2: bedrooms, bathrooms, area, type */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-lg">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">Bedrooms</label>
                <input
                  type="number"
                  value={formData.bedrooms}
                  onChange={(e) => setFormData({ ...formData, bedrooms: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">Bathrooms</label>
                <input
                  type="number"
                  value={formData.bathrooms}
                  onChange={(e) => setFormData({ ...formData, bathrooms: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">Total Area (m²)</label>
                <input
                  type="number"
                  value={formData.total_area}
                  onChange={(e) => setFormData({ ...formData, total_area: e.target.value })}
                  placeholder="0"
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">Property Type</label>
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

            {/* Key safe code + Management fee */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">🔐 Key Safe Code</label>
                <input
                  type="text"
                  value={formData.key_safe_code}
                  onChange={(e) => setFormData({ ...formData, key_safe_code: e.target.value })}
                  placeholder="e.g. 1234"
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-neutral-500 mt-xs">Only shown to contractors/cleaners after they book through the system.</p>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">Management Fee %</label>
                <div className="flex items-center gap-sm">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={formData.management_fee_pct}
                    onChange={(e) => setFormData({ ...formData, management_fee_pct: e.target.value })}
                    className="w-24 px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-neutral-400">% of monthly rent</span>
                </div>
                <p className="text-xs text-neutral-500 mt-xs">Set once per property — this rate applies to all rooms.</p>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Add notes about the property…"
                className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-lg">
            {/* Row 1: what kind of property is this */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-lg">
              <div className="space-y-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Property Type</p>
                <p className="text-sm font-semibold text-neutral-900 capitalize">
                  {displayed.property_type === 'hmo' ? 'HMO'
                    : displayed.property_type === 'single' || displayed.property_type === 'single_let' ? 'Single Let'
                    : displayed.property_type
                    ? displayed.property_type.charAt(0).toUpperCase() + displayed.property_type.slice(1)
                    : '—'}
                </p>
              </div>
              <div className="space-y-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Bedrooms</p>
                <p className="text-sm font-semibold text-neutral-900">{displayed.bedrooms || '—'}</p>
              </div>
              <div className="space-y-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Bathrooms</p>
                <p className="text-sm font-semibold text-neutral-900">{displayed.bathrooms || '—'}</p>
              </div>
              <div className="space-y-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Total Area</p>
                <p className="text-sm font-semibold text-neutral-900">{displayed.total_area ? `${displayed.total_area} m²` : '—'}</p>
              </div>
            </div>

            {/* Row 2: management/tenancy settings */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-lg pt-lg border-t border-neutral-200">
              <div className="space-y-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Council Tax Band</p>
                <p className="text-sm font-semibold text-neutral-900">{displayed.council_tax_band ? `Band ${displayed.council_tax_band}` : '—'}</p>
              </div>
              <div className="space-y-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">HMO Licence Issued</p>
                <p className="text-sm font-semibold text-neutral-900">
                  {displayed.license_date ? new Date(displayed.license_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </p>
              </div>
              <div className="space-y-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">HMO Licence Expiry</p>
                {(() => {
                  if (!displayed.license_expiry) return <p className="text-sm font-semibold text-neutral-900">—</p>
                  const expiry = new Date(displayed.license_expiry)
                  const now = new Date()
                  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                  const color = daysLeft < 0 ? 'text-red-600' : daysLeft < 90 ? 'text-amber-600' : 'text-neutral-900'
                  const badge = daysLeft < 0 ? ' · EXPIRED' : daysLeft < 90 ? ` · ${daysLeft}d left` : ''
                  return (
                    <p className={`text-sm font-semibold ${color}`}>
                      {expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {badge && <span className="text-xs ml-xs">{badge}</span>}
                    </p>
                  )
                })()}
              </div>
              <div className="space-y-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Bills Included</p>
                <p className="text-sm font-semibold text-neutral-900">{displayed.bills_included ? '✓ Yes' : '✗ No'}</p>
              </div>
              <div className="space-y-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">🔐 Key Safe</p>
                <p className="text-sm font-semibold text-neutral-900 font-mono">
                  {displayed.key_safe_code ? displayed.key_safe_code : '—'}
                </p>
                {displayed.key_safe_code && (
                  <p className="text-xs text-neutral-400">Shown to contractors after booking</p>
                )}
              </div>
            </div>

            {/* Row 3: fee */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-lg pt-lg border-t border-neutral-200">
              <div className="space-y-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Management Fee</p>
                <p className="text-sm font-semibold text-neutral-900">
                  {displayed.management_fee_pct != null ? `${displayed.management_fee_pct}%` : '12%'}
                  <span className="text-xs font-normal text-neutral-400 ml-sm">of monthly rent</span>
                </p>
              </div>
            </div>

            {displayed.description && (
              <div className="pt-lg border-t border-neutral-200">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Description / Notes</p>
                <p className="text-sm text-neutral-900 whitespace-pre-wrap">{displayed.description}</p>
              </div>
            )}
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
            if (files[0]) scanFloorPlan(files[0])
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
            if (files[0]) scanFloorPlan(files[0])
          }}
          className="rounded-lg border-2 border-dashed border-neutral-700 bg-neutral-900 p-2xl text-center transition hover:border-neutral-500 hover:bg-neutral-800 cursor-pointer"
        >
          <div className="text-3xl mb-md opacity-60">📄</div>
          <p className="text-sm font-semibold text-white mb-xs">Drop floor plan here or click to upload</p>
          <p className="text-xs text-neutral-400">PDF or JPEG • Max 10MB • AI reads room sizes on upload</p>
          {uploadingFloorPlan && <p className="text-xs text-blue-400 mt-md">Uploading...</p>}
          {scanningPlan && <p className="text-xs text-blue-400 mt-md">🔎 Scanning floor plan for room sizes…</p>}
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

      {floorPlanResult && (
        <FloorPlanMap
          propertyId={property.id}
          detected={floorPlanResult.detected}
          notes={floorPlanResult.notes}
          bathroomsCount={floorPlanResult.bathrooms_count}
          ensuiteLabels={floorPlanResult.ensuite_room_labels}
          layoutNotes={floorPlanResult.layout_notes}
          existingNotes={property.property_notes || ''}
          onClose={() => setFloorPlanResult(null)}
          onApplied={(msg) => { setSuccess(msg); setFloorPlanResult(null) }}
        />
      )}
    </div>
  )
}
