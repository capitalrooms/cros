'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase';
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton';
import Link from 'next/link';
import { AcknowledgmentNoteSchema, validateInput } from '@/lib/validation-schemas';

interface AcknowledgmentNote {
  id: string;
  title: string;
  content: string;
  internal_note: string | null;
  status: string;
  created_by: string;
  created_at: string;
  acknowledged_at: string | null;
  expires_at: string;
  tenancies?: { people?: { full_name: string } } | null;
  properties?: { name: string } | null;
  rooms?: { name: string } | null;
  people?: { full_name: string } | null;
}

interface Property {
  id: string;
  name: string;
  address: string;
}

interface Room {
  id: string;
  name: string;
}

interface Tenancy {
  id: string;
  people: { full_name: string };
}

export default function AcknowledgmentNotesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [notes, setNotes] = useState<AcknowledgmentNote[]>([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [selectedTenancyId, setSelectedTenancyId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'active' | 'acknowledged' | 'filed' | 'all'>('active');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login');
        return;
      }

      const supabase = createClient();

      // Load properties
      const { data: propsData } = await supabase
        .from('properties')
        .select('id, name, address')
        .order('name');

      setProperties(propsData || []);
      if (propsData?.[0]) {
        setSelectedProperty(propsData[0].id);
        await loadRoomsAndTenancies(propsData[0].id);
        await loadNotes(propsData[0].id);
      }

      setLoading(false);
    }

    init();
  }, [router]);

  async function loadRoomsAndTenancies(propertyId: string) {
    try {
      const supabase = createClient();

      // Load rooms
      const { data: roomsData } = await supabase
        .from('rooms')
        .select('id, name')
        .eq('property_id', propertyId)
        .order('name');

      setRooms(roomsData || []);

      // Load active tenancies for this property
      const today = new Date().toISOString().split('T')[0];
      const { data: tenanciesData } = await supabase
        .from('tenancies')
        .select('id, people:person_id(full_name)')
        .eq('property_id', propertyId)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('created_at', { ascending: false });

      setTenancies(tenanciesData || []);
      setSelectedRoom('');
      setSelectedTenancyId(tenanciesData?.[0]?.id || '');
    } catch (error) {
      console.error('Failed to load rooms and tenancies:', error);
    }
  }

  async function loadNotes(propertyId: string) {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('tenant_acknowledgment_notes')
        .select('*, tenancies(people:person_id(full_name)), properties(name), rooms(name), people:created_by(full_name)')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false });

      setNotes(data || []);
    } catch (error) {
      console.error('Failed to load notes:', error);
    }
  }

  async function handleCreateNote() {
    // SECURITY: Validate all inputs before processing
    const validationResult = validateInput(AcknowledgmentNoteSchema, {
      title,
      content,
      internalNote,
      tenancyId: selectedTenancyId,
      roomId: selectedRoom || undefined,
    });

    if (!validationResult.valid) {
      setValidationErrors(validationResult.errors || {});
      alert('Please fix the errors below:\n\n' + Object.values(validationResult.errors || {}).join('\n'));
      return;
    }

    setValidationErrors({});
    setSubmitting(true);

    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      const supabase = createClient();

      // Get tenancy details to fetch room_id
      const { data: tenancy } = await supabase
        .from('tenancies')
        .select('room_id')
        .eq('id', selectedTenancyId)
        .single();

      const { error } = await supabase.from('tenant_acknowledgment_notes').insert({
        property_id: selectedProperty,
        room_id: selectedRoom || tenancy?.room_id || null,
        tenancy_id: selectedTenancyId,
        title: validationResult.data!.title, // Use validated data
        content: validationResult.data!.content,
        internal_note: validationResult.data!.internalNote || null,
        created_by: user.assignment?.id,
      });

      if (error) throw error;

      setTitle('');
      setContent('');
      setInternalNote('');
      setShowCreateModal(false);
      await loadNotes(selectedProperty);
      alert('✅ Acknowledgment note created');
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFileNote(noteId: string) {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tenant_acknowledgment_notes')
        .update({ status: 'filed' })
        .eq('id', noteId);

      if (error) throw error;

      await loadNotes(selectedProperty);
      alert('✅ Note filed');
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar right={<BackButton />} />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    );
  }

  let filtered = notes;
  if (filterStatus !== 'all') {
    filtered = notes.filter((n) => n.status === filterStatus);
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        right={
          <Link href="/admin" className="text-sm font-bold text-neutral-600 hover:text-neutral-900">
            ← Back
          </Link>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        <div className="flex items-center justify-between mb-lg">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Acknowledgment Notes</h1>
            <p className="text-sm text-neutral-600 mt-sm">
              Notes that require active tenant confirmation. Auto-files after 7 days if unacknowledged.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-lg py-md bg-neutral-900 text-white rounded-xl font-semibold hover:bg-neutral-800 transition-colors"
          >
            ➕ Create Note
          </button>
        </div>

        {/* Property selector */}
        <div className="mb-lg">
          <select
            value={selectedProperty}
            onChange={(e) => {
              setSelectedProperty(e.target.value);
              loadRoomsAndTenancies(e.target.value);
              loadNotes(e.target.value);
            }}
            className="w-full rounded-xl border border-neutral-300 px-lg py-md text-base"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.address})
              </option>
            ))}
          </select>
        </div>

        {/* Filter buttons */}
        <div className="mb-lg flex gap-sm flex-wrap">
          {(['active', 'acknowledged', 'filed', 'all'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-md py-sm rounded-lg font-semibold text-sm transition-colors ${
                filterStatus === status
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {status === 'active' && 'Active'}
              {status === 'acknowledged' && 'Acknowledged'}
              {status === 'filed' && 'Filed'}
              {status === 'all' && 'All'}
            </button>
          ))}
        </div>

        {/* Notes list */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No notes found</p>
          </div>
        ) : (
          <div className="space-y-md">
            {filtered.map((note) => (
              <div key={note.id} className="rounded-2xl border border-neutral-200 bg-white p-lg">
                <div className="flex items-start justify-between mb-md">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-neutral-900">{note.title}</h3>
                    <p className="text-sm text-neutral-600 mt-xs">
                      {note.tenancies?.people?.full_name} • {note.rooms?.name || 'Whole house'}
                    </p>
                  </div>
                  <span
                    className={`px-md py-xs rounded-full font-semibold text-xs ${
                      note.status === 'active'
                        ? 'bg-blue-100 text-blue-800'
                        : note.status === 'acknowledged'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-neutral-100 text-neutral-800'
                    }`}
                  >
                    {note.status === 'active' && 'Awaiting'}
                    {note.status === 'acknowledged' && '✓ Acknowledged'}
                    {note.status === 'filed' && 'Filed'}
                  </span>
                </div>

                <div className="bg-neutral-50 rounded-lg p-md mb-md border border-neutral-200">
                  <p className="text-sm text-neutral-700 whitespace-pre-wrap">{note.content}</p>
                </div>

                {note.internal_note && (
                  <div className="mb-md">
                    <p className="text-xs font-semibold text-neutral-600 uppercase mb-xs">
                      Admin Notes (internal)
                    </p>
                    <p className="text-sm text-neutral-600 bg-yellow-50 rounded-lg p-md border border-yellow-200">
                      {note.internal_note}
                    </p>
                  </div>
                )}

                <div className="text-xs text-neutral-500 mb-md">
                  {note.acknowledged_at && (
                    <p>
                      ✓ Acknowledged{' '}
                      {new Date(note.acknowledged_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                  <p>
                    Created {new Date(note.created_at).toLocaleDateString('en-GB')} by{' '}
                    {note.people?.full_name || 'Unknown'}
                  </p>
                  <p>
                    Expires{' '}
                    {new Date(note.expires_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>

                {note.status !== 'filed' && (
                  <button
                    onClick={() => handleFileNote(note.id)}
                    className="text-sm px-md py-xs rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                  >
                    File manually
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="rounded-3xl bg-white p-lg max-w-2xl w-full mx-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-neutral-900 mb-lg">Create Acknowledgment Note</h2>

              <div className="space-y-md mb-lg">
                <div>
                  <label className="text-xs font-semibold text-neutral-600 mb-xs block">
                    Tenant
                  </label>
                  <select
                    value={selectedTenancyId}
                    onChange={(e) => setSelectedTenancyId(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                  >
                    <option value="">Select a tenant…</option>
                    {tenancies.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.people.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-600 mb-xs block">
                    Room (optional - blank for whole house)
                  </label>
                  <select
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                  >
                    <option value="">Whole house</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-600 mb-xs block">
                    Title {title.length > 0 && <span className="text-xs text-neutral-500">({title.length}/255)</span>}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Electrical appliance reminder"
                    className={`w-full rounded-xl border px-md py-md text-base ${
                      validationErrors.title ? 'border-red-500 bg-red-50' : 'border-neutral-300'
                    }`}
                  />
                  {validationErrors.title && (
                    <p className="text-xs text-red-600 mt-xs">❌ {validationErrors.title}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-600 mb-xs block">
                    Message for tenant {content.length > 0 && <span className="text-xs text-neutral-500">({content.length}/5000)</span>}
                  </label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write the message the tenant must acknowledge..."
                    className={`w-full rounded-xl border px-md py-md text-base ${
                      validationErrors.content ? 'border-red-500 bg-red-50' : 'border-neutral-300'
                    }`}
                    rows={4}
                  />
                  {validationErrors.content && (
                    <p className="text-xs text-red-600 mt-xs">❌ {validationErrors.content}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-600 mb-xs block">
                    Internal note (admin-only, never shown to tenant)
                  </label>
                  <textarea
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    placeholder="e.g., 'Tenant left microwave on, reminder needed'"
                    className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-sm">
                <button
                  onClick={handleCreateNote}
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-neutral-900 py-md font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : 'Create Note'}
                </button>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 rounded-xl border border-neutral-300 py-md font-semibold hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
