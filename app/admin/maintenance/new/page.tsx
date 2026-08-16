'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import Link from 'next/link';
import AppBar from '@/components/AppBar';

const MAINTENANCE_CATEGORIES = [
  { id: 'plumbing', title: 'Plumbing' },
  { id: 'electrical', title: 'Electrical' },
  { id: 'appliances', title: 'Appliances' },
  { id: 'structural', title: 'Structural' },
  { id: 'hvac', title: 'Heating/AC' },
  { id: 'cosmetic', title: 'Cosmetic' },
  { id: 'safety', title: 'Safety' },
  { id: 'locks-keys', title: 'Locks & Keys' },
  { id: 'other', title: 'Other' },
];

interface Property {
  id: string;
  name: string;
  address: string;
}

interface Room {
  id: string;
  name: string;
  property_id: string;
}

export default function NewJobPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [propertyId, setPropertyId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [category, setCategory] = useState('other');
  const [priority, setPriority] = useState('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [contractors, setContractors] = useState<{ id: string; full_name: string | null; email: string }[]>([]);
  const [contractorId, setContractorId] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin') {
        router.push('/login');
        return;
      }

      const supabase = createClient();
      const { data: props } = await supabase.from('properties').select('*').order('name');
      setProperties(props || []);
      const { data: cons } = await supabase
        .from('people')
        .select('id, full_name, email')
        .eq('role', 'contractor')
        .order('full_name');
      setContractors(cons || []);
      setLoading(false);
    }
    init();
  }, [router]);

  async function handlePhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `new/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('job-photos')
          .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) throw upErr;
        urls.push(supabase.storage.from('job-photos').getPublicUrl(path).data.publicUrl);
      }
      setPhotos((p) => [...p, ...urls]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  }

  // Fetch rooms when property changes
  useEffect(() => {
    async function fetchRooms() {
      if (!propertyId) {
        setRooms([]);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from('rooms')
        .select('*')
        .eq('property_id', propertyId)
        .order('name');
      setRooms(data || []);
      setRoomId('');
    }
    fetchRooms();
  }, [propertyId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    if (!propertyId) {
      setError('Please select a property');
      setSaving(false);
      return;
    }

    if (!title.trim()) {
      setError('Please enter a job title');
      setSaving(false);
      return;
    }

    try {
      const user = await getCurrentUser();
      if (!user) {
        setError('Not authenticated');
        setSaving(false);
        return;
      }

      const supabase = createClient();
      // If a contractor is chosen up front, send it straight to them to schedule.
      const assignNow = !!contractorId;
      const { data: created, error: err } = await supabase
        .from('maintenance_tickets')
        .insert([
          {
            property_id: propertyId,
            room_id: roomId || null,
            reporter_id: user.user.id,
            title: title.trim(),
            description: description.trim(),
            category,
            priority,
            location: location.trim() || null,
            photos: photos.length ? photos : null,
            // Admin-created jobs are pre-approved, ready for contractor assignment
            approved_at: new Date().toISOString(),
            ...(assignNow
              ? { status: 'assigned', contractor_id: contractorId }
              : { status: 'reported' }),
          },
        ])
        .select('id')
        .single();

      if (err) throw err;

      // Let the contractor know they've got a job to schedule.
      if (assignNow && created?.id) {
        fetch('/api/notify-job-raised', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: created.id }),
        }).catch((e) => console.error('Assign notification failed:', e));
      }

      // Redirect back to maintenance board
      router.push('/admin/maintenance');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar
          right={
            <Link href="/admin/maintenance" className="min-w-0 truncate text-sm font-semibold text-white hover:text-white/80">
              Back
            </Link>
          }
        />
        <p className="p-xl text-neutral-500">Loading...</p>
      </div>
    );
  }

  const selectedProperty = properties.find((p) => p.id === propertyId);

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        right={
          <Link href="/admin/maintenance" className="min-w-0 truncate text-sm font-semibold text-white hover:text-white/80">
            Back
          </Link>
        }
      />

      <main className="mx-auto max-w-2xl px-lg py-lg">
        <div className="rounded-2xl border border-neutral-200 bg-white p-xl">
          {error && (
            <div className="mb-md rounded-xl border border-2 border-neutral-900 bg-white p-md text-sm text-neutral-900">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-md">
            {/* Property */}
            <div>
              <label className="block text-sm font-medium text-neutral-700">Property *</label>
              <select
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                required
                className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-sm text-sm focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
              >
                <option value="">Select a property…</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.address}
                  </option>
                ))}
              </select>
            </div>

            {/* Room (optional, will be filtered based on property) */}
            {selectedProperty && (
              <div>
                <label className="block text-sm font-medium text-neutral-700">Room (optional)</label>
                <select
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-sm text-sm focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                >
                  <option value="">Communal area</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Location (if not selecting a room, e.g. "Garden" or "Front entrance") */}
            {propertyId && !roomId && (
              <div>
                <label className="block text-sm font-medium text-neutral-700">Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Front entrance, Garden, Basement"
                  className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-sm text-sm placeholder-neutral-400 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                />
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-neutral-700">Job title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Replace bathroom light bulb"
                required
                className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-sm text-sm placeholder-neutral-400 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-neutral-700">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional details for the contractor…"
                rows={4}
                className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-sm text-sm placeholder-neutral-400 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-neutral-700">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-sm text-sm focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
              >
                {MAINTENANCE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-neutral-700">Priority *</label>
              <div className="mt-sm flex gap-md">
                {(['low', 'medium', 'high'] as const).map((p) => (
                  <label key={p} className="flex items-center gap-sm cursor-pointer">
                    <input
                      type="radio"
                      name="priority"
                      value={p}
                      checked={priority === p}
                      onChange={(e) => setPriority(e.target.value)}
                    />
                    <span className="text-sm capitalize text-neutral-700">{p}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Contractor (optional — assign now, or leave to assign on the board) */}
            <div>
              <label className="block text-sm font-medium text-neutral-700">Send to a contractor (optional)</label>
              <select
                value={contractorId}
                onChange={(e) => setContractorId(e.target.value)}
                className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-sm text-sm focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
              >
                <option value="">Leave unassigned (assign on the board)</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name || c.email}
                  </option>
                ))}
              </select>
              <p className="mt-xs text-xs text-neutral-500">
                If chosen, they&apos;re notified and pick a date themselves.
              </p>
            </div>

            {/* Photos (from camera roll) */}
            <div>
              <label className="block text-sm font-medium text-neutral-700">Photos (optional)</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handlePhotos(e.target.files)}
                className="mt-sm w-full text-sm text-neutral-600 file:mr-md file:rounded-lg file:border-0 file:bg-neutral-900 file:px-md file:py-sm file:text-sm file:font-semibold file:text-white"
              />
              {uploading && <p className="mt-xs text-xs text-neutral-500">Uploading…</p>}
              {photos.length > 0 && (
                <div className="mt-md flex flex-wrap gap-sm">
                  {photos.map((url) => (
                    <div key={url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="Job photo" className="h-16 w-16 rounded-lg object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotos((p) => p.filter((u) => u !== url))}
                        className="absolute -right-1 -top-1 rounded-full bg-neutral-900 px-sm text-xs text-white"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="flex gap-md border-t border-neutral-200 pt-md">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-neutral-900 px-lg py-sm text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-300"
              >
                {saving ? 'Creating…' : 'Create job'}
              </button>
              <Link href="/admin/maintenance" className="flex-1">
                <button
                  type="button"
                  className="w-full rounded-xl border border-neutral-300 px-lg py-sm text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
