'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import AppBar from '@/components/AppBar'
import Link from 'next/link';
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading';
import AddressAutocomplete from '@/components/admin/AddressAutocomplete';
import DocReview, { AIResult } from '@/app/components/DocReview';
import SetOnNoticeModal, { OnNoticeData } from '@/app/components/SetOnNoticeModal';

interface Tenant {
  id: string;
  full_name: string | null;
  email: string;
}

interface TenancyRecord {
  id: string;
  person_id: string;
  start_date: string;
  end_date: string | null;
  rent_amount: number | null;
  deposit_amount: number | null;
  lease_reference: string | null;
  people: { full_name: string | null; email: string } | null;
}

interface Room {
  id: string;
  name: string;
  status: 'occupied' | 'available' | 'on_notice';
  current_asking_rent?: number;
  previous_rent?: number;
  tenant?: Tenant;
}

interface Appliance {
  type?: string;
  name?: string;
  model?: string;
  purchased_date?: string;
  purchased_by?: string;
  notes?: string;
}

const APPLIANCE_TYPES = [
  'Fridge', 'Freezer', 'Fridge/Freezer', 'Washing machine', 'Tumble dryer', 'Dishwasher',
  'Oven', 'Hob/Cooker', 'Microwave', 'Boiler', 'Extractor fan', 'Other',
]

interface Property {
  id: string;
  name: string;
  address: string;
  property_type?: 'hmo' | 'single_let';
  bedrooms?: number;
  bathrooms?: number;
  // Licensing
  license_number?: string;
  license_expiry?: string;
  council_tax_band?: string;
  deposit_holder?: string;
  // Insurance
  insurance_provider?: string;
  insurance_policy_number?: string;
  insurance_expiry?: string;
  // Annual Testing & Compliance (entered once, applies to property)
  gas_safe_cert_date?: string;
  gas_safe_cert_expiry?: string;
  electrical_cert_date?: string;
  electrical_cert_expiry?: string;
  pat_test_date?: string;
  pat_test_expiry?: string;
  fire_detection_test_date?: string;
  fire_detection_expiry?: string;
  emergency_lighting_test_date?: string;
  emergency_lighting_expiry?: string;
  fire_risk_assessment_date?: string;
  fire_risk_assessment_expiry?: string;
  // Appliances (grows over time; stored as JSON on the property)
  appliances?: Appliance[];
  // Notes visible to tenants
  property_notes?: string;
  fire_safety_notes?: string;
  communal_notes?: string;
  rooms?: Room[];
}

export default function PropertiesManagementPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState<string | null>(null);
  const [editingProperty, setEditingProperty] = useState<string | null>(null);
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);
  const [propertySearch, setPropertySearch] = useState('');

  const [newProperty, setNewProperty] = useState({
    name: '',
    address: '',
    property_type: 'hmo' as 'hmo' | 'single_let',
    bedrooms: 0,
    bathrooms: 0,
    bulkRoomCount: 0,
  });

  const [newRoom, setNewRoom] = useState({
    name: '',
    status: 'available' as 'occupied' | 'available' | 'on_notice',
  });

  const [propertyEdits, setPropertyEdits] = useState<Partial<Property>>({});
  const [confirmDeletePropertyId, setConfirmDeletePropertyId] = useState<string | null>(null);

  // Tenancy history per room (loaded when a property is opened)
  const [roomTenancies, setRoomTenancies] = useState<Record<string, TenancyRecord[]>>({});
  // Room whose "+ Add Tenancy" form is open
  const [addTenancyRoomId, setAddTenancyRoomId] = useState<string | null>(null);
  const [newTenancy, setNewTenancy] = useState({
    full_name: '', email: '', start_date: '', end_date: '',
    rent_amount: '', deposit_amount: '', lease_reference: '',
  });
  const [tenancySaving, setTenancySaving] = useState(false);
  // Rooms whose full tenancy history is expanded (beyond the top 2)
  const [expandedTenancyHistory, setExpandedTenancyHistory] = useState<Set<string>>(new Set());
  // Inline room name editing
  const [editingRoomName, setEditingRoomName] = useState<{ id: string; value: string } | null>(null);
  // Inline room internal (admin-only) label editing
  const [editingRoomLabel, setEditingRoomLabel] = useState<{ id: string; value: string } | null>(null);

  // Property documents (loaded per-property when opened)
  const [propertyDocs, setPropertyDocs] = useState<Record<string, any[]>>({});
  const [docUpload, setDocUpload] = useState<Record<string, {
    file?: File; type: string; uploading: boolean; error: string; success: boolean
  }>>({});

  // AI scan modal — triggered from inside a property card
  const [aiScan, setAiScan] = useState<{
    propertyId: string
    busy: boolean
    busyLabel: string
    error: string
    result: AIResult | null
    file: File | null
    allPeople: any[]
    allTenancies: any[]
  } | null>(null);

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin') {
        router.push('/login');
        return;
      }

      await loadProperties();
    }
    init();
  }, [router]);

  async function loadProperties() {
    const supabase = createClient();

    // Fetch properties
    const { data: propsData } = await supabase
      .from('properties')
      .select('*')
      .order('name');

    if (!propsData) {
      setLoading(false);
      return;
    }

    // Fetch all rooms with tenant info
    const { data: roomsData } = await supabase
      .from('rooms')
      .select(
        'id,name,internal_name,property_id,status,current_asking_rent,previous_rent,tenancies(person_id,end_date,people(id,full_name,email))'
      );

    // Build rooms with tenant info
    const today = new Date().toISOString().split('T')[0];
    const roomsWithTenants = (roomsData || []).map((room: any) => {
      // Prefer an active tenancy; otherwise show an on-notice one (end_date in the
      // future) so a room mid-turnover still shows who's living there.
      const activeTenancy = room.tenancies?.find((t: any) => !t.end_date);
      const onNoticeTenancy = room.tenancies?.find(
        (t: any) => t.end_date && t.end_date >= today
      );
      const tenancy = activeTenancy || onNoticeTenancy;
      return {
        id: room.id,
        property_id: room.property_id,
        name: room.name,
        status: room.status,
        current_asking_rent: room.current_asking_rent,
        previous_rent: room.previous_rent,
        tenant: tenancy?.people,
        onNotice: !activeTenancy && !!onNoticeTenancy,
      };
    });

    // Group rooms by property
    const propsWithRooms = propsData.map((prop: any) => ({
      ...prop,
      rooms: roomsWithTenants.filter((r: any) => r.property_id === prop.id),
    }));

    setProperties(propsWithRooms);
    setLoading(false);
  }

  async function loadPropertyDocs(propertyId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from('property_documents')
      .select('id, document_type, file_name, storage_url, description, uploaded_at, visible_to_tenants')
      .eq('property_id', propertyId)
      .order('uploaded_at', { ascending: false });
    setPropertyDocs((prev) => ({ ...prev, [propertyId]: data || [] }));
  }

  async function loadRoomTenancies(propertyId: string) {
    const supabase = createClient();
    // Get all rooms for this property, then all tenancies for those rooms
    const { data: rooms } = await supabase
      .from('rooms')
      .select('id')
      .eq('property_id', propertyId);

    if (!rooms || rooms.length === 0) return;
    const roomIds = rooms.map((r: any) => r.id);

    const { data } = await supabase
      .from('tenancies')
      .select('id, person_id, room_id, start_date, end_date, rent_amount, deposit_amount, lease_reference, people(full_name, email)')
      .in('room_id', roomIds)
      .order('start_date', { ascending: false });

    // Group by room_id
    const grouped: Record<string, TenancyRecord[]> = {};
    for (const t of data || []) {
      if (!grouped[(t as any).room_id]) grouped[(t as any).room_id] = [];
      grouped[(t as any).room_id].push(t as TenancyRecord);
    }
    setRoomTenancies((prev) => ({ ...prev, ...grouped }));
  }

  async function handleAddTenancy(roomId: string, propertyId: string) {
    if (!newTenancy.email || !newTenancy.start_date || !newTenancy.rent_amount) {
      alert('Email, start date and rent amount are required');
      return;
    }
    setTenancySaving(true);
    try {
      const supabase = createClient();

      // Find or create person
      let personId: string;
      const { data: existing } = await supabase
        .from('people')
        .select('id')
        .eq('email', newTenancy.email.trim().toLowerCase())
        .maybeSingle();

      if (existing) {
        personId = existing.id;
        // Update name if provided and blank
        if (newTenancy.full_name) {
          await supabase
            .from('people')
            .update({ full_name: newTenancy.full_name, room_id: roomId, property_id: propertyId })
            .eq('id', personId);
        }
      } else {
        const { data: created, error: peErr } = await supabase
          .from('people')
          .insert({
            full_name: newTenancy.full_name || null,
            email: newTenancy.email.trim().toLowerCase(),
            role: 'tenant',
            room_id: roomId,
            property_id: propertyId,
          })
          .select('id')
          .single();
        if (peErr) throw peErr;
        personId = created.id;
      }

      // Create tenancy
      const { error: tenErr } = await supabase
        .from('tenancies')
        .insert({
          person_id: personId,
          room_id: roomId,
          property_id: propertyId,
          start_date: newTenancy.start_date,
          end_date: newTenancy.end_date || null,
          rent_amount: parseFloat(newTenancy.rent_amount),
          deposit_amount: newTenancy.deposit_amount ? parseFloat(newTenancy.deposit_amount) : null,
          lease_reference: newTenancy.lease_reference || null,
          rent_due_day: 1,
        });
      if (tenErr) throw tenErr;

      // If no end date → room is occupied; mark it
      if (!newTenancy.end_date) {
        await supabase.from('rooms').update({ status: 'occupied' }).eq('id', roomId);
      }

      // Reload
      await loadRoomTenancies(propertyId);
      await loadProperties();
      setAddTenancyRoomId(null);
      setNewTenancy({ full_name: '', email: '', start_date: '', end_date: '', rent_amount: '', deposit_amount: '', lease_reference: '' });
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setTenancySaving(false);
    }
  }

  async function handleUpdateRoomStatus(roomId: string, propertyId: string, status: 'available' | 'occupied' | 'on_notice') {
    const supabase = createClient();
    await supabase.from('rooms').update({ status }).eq('id', roomId);
    setProperties((prev) =>
      prev.map((p) =>
        p.id !== propertyId ? p : {
          ...p,
          rooms: (p.rooms || []).map((r) => r.id === roomId ? { ...r, status } : r),
        }
      )
    );
  }

  async function handleSaveRoomName(roomId: string, propertyId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const supabase = createClient();
    const { error } = await supabase.from('rooms').update({ name: trimmed }).eq('id', roomId);
    if (error) { alert('Could not rename room: ' + error.message); return; }
    setProperties((prev) =>
      prev.map((p) =>
        p.id !== propertyId ? p : {
          ...p,
          rooms: (p.rooms || []).map((r) => r.id === roomId ? { ...r, name: trimmed } : r),
        }
      )
    );
    setEditingRoomName(null);
  }

  async function handleSaveRoomLabel(roomId: string, propertyId: string, label: string) {
    const trimmed = label.trim() || null;
    const supabase = createClient();
    const { error } = await supabase.from('rooms').update({ internal_name: trimmed }).eq('id', roomId);
    if (error) { alert('Could not save label: ' + error.message); return; }
    setProperties((prev) =>
      prev.map((p) =>
        p.id !== propertyId ? p : {
          ...p,
          rooms: (p.rooms || []).map((r) => r.id === roomId ? { ...r, internal_name: trimmed } : r),
        }
      )
    );
    setEditingRoomLabel(null);
  }

  // ── AI Scan (from inside property card) ──────────────────────────────────
  const AI_DIRECT_LIMIT = 4 * 1024 * 1024; // 4 MB — Vercel body limit

  async function handleAIScan(propertyId: string, file: File) {
    setAiScan({ propertyId, busy: true, busyLabel: 'Scanning…', error: '', result: null, file: null, allPeople: [], allTenancies: [] });
    try {
      const body = new FormData();

      if (file.size > AI_DIRECT_LIMIT) {
        setAiScan((s) => s ? { ...s, busyLabel: `Large file — uploading to storage (${(file.size / 1024 / 1024).toFixed(1)} MB)…` } : null);
        const presignRes = await fetch('/api/storage/presign-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type || 'application/pdf' }),
        });
        if (!presignRes.ok) { const e = await presignRes.json().catch(() => ({})); throw new Error(`Presign failed: ${e.error || presignRes.status}`); }
        const { token, path, publicUrl } = await presignRes.json();
        const supabase = createClient();
        const { error: upErr } = await supabase.storage.from('property-documents').uploadToSignedUrl(path, token, file, { contentType: file.type || 'application/pdf' });
        if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
        body.append('storage_url', publicUrl);
        body.append('mime_type', file.type || 'application/pdf');
      } else {
        body.append('file', file);
      }

      setAiScan((s) => s ? { ...s, busyLabel: 'Reading with AI…' } : null);
      const res = await fetch('/api/ai/classify-document', { method: 'POST', body });
      let json: any;
      try { json = await res.json(); } catch { throw new Error(`Server error ${res.status}`); }
      if (!res.ok) throw new Error(json.error || 'AI classification failed');

      // Load people + tenancies needed by DocReview (lazy — only when modal opens)
      const supabase = createClient();
      const [{ data: ppl }, { data: tens }] = await Promise.all([
        supabase.from('people').select('id, full_name, email').eq('role', 'tenant').order('full_name'),
        supabase.from('tenancies').select('id, start_date, end_date, people(full_name), rooms(id, name, property_id, properties(id, name))').order('start_date', { ascending: false }),
      ]);

      setAiScan((s) => s ? { ...s, busy: false, busyLabel: '', result: json.result as AIResult, file, allPeople: ppl || [], allTenancies: (tens || []) as any[] } : null);
    } catch (err) {
      setAiScan((s) => s ? { ...s, busy: false, busyLabel: '', error: err instanceof Error ? err.message : 'Error' } : null);
    }
  }

  async function handleDocUpload(propertyId: string) {
    const state = docUpload[propertyId];
    if (!state?.file || !state?.type) return;
    setDocUpload((prev) => ({ ...prev, [propertyId]: { ...prev[propertyId], uploading: true, error: '', success: false } }));
    try {
      const body = new FormData();
      body.append('file', state.file);
      body.append('property_id', propertyId);
      body.append('document_type', state.type);
      body.append('file_name', state.file.name);
      const res = await fetch('/api/admin/upload-property-document', { method: 'POST', body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setDocUpload((prev) => ({ ...prev, [propertyId]: { type: '', uploading: false, error: '', success: true } }));
      await loadPropertyDocs(propertyId);
    } catch (err: any) {
      setDocUpload((prev) => ({ ...prev, [propertyId]: { ...prev[propertyId], uploading: false, error: err.message } }));
    }
  }

  const handleAddProperty = async () => {
    if (!newProperty.name || !newProperty.address) {
      alert('Please fill in property name and address');
      return;
    }

    try {
      const supabase = createClient();
      const { bulkRoomCount, property_type, ...propData } = newProperty as any;
      const { data: created, error } = await supabase
        .from('properties')
        .insert([propData])
        .select();

      if (error) throw error;

      if (created) {
        const propertyId = created[0].id;
        let rooms: any[] = [];

        // Create bulk rooms if specified
        if (bulkRoomCount > 0) {
          const roomsToCreate = Array.from({ length: bulkRoomCount }, (_, i) => ({
            property_id: propertyId,
            name: `Room ${i + 1}`,
            status: 'available',
          }));

          const { data: createdRooms, error: roomError } = await supabase
            .from('rooms')
            .insert(roomsToCreate)
            .select();

          if (roomError) throw roomError;
          rooms = createdRooms || [];
        }

        setProperties([...properties, { ...created[0], rooms }]);
        setNewProperty({ name: '', address: '', property_type: 'hmo', bedrooms: 0, bathrooms: 0, bulkRoomCount: 0 });
        setShowAddProperty(false);
        alert(`✅ Property added${bulkRoomCount > 0 ? ` with ${bulkRoomCount} rooms` : ''}`);
      }
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleUpdateProperty = async (propertyId: string) => {
    try {
      const supabase = createClient();
      // `propertyEdits` is seeded from the full property object, which carries a
      // joined `rooms` array (and its own id) — neither is a column on properties,
      // so send only the real columns or PostgREST rejects the whole update.
      const { rooms, id, ...updates } = propertyEdits as any;
      const { error } = await supabase
        .from('properties')
        .update(updates)
        .eq('id', propertyId);

      if (error) throw error;

      // Reload properties
      await loadProperties();
      setEditingProperty(null);
      setPropertyEdits({});
      alert('✅ Property updated');
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleAddRoom = async (propertyId: string) => {
    if (!newRoom.name) {
      alert('Please enter a room name');
      return;
    }

    try {
      const supabase = createClient();
      const { data: created, error } = await supabase
        .from('rooms')
        .insert([{ ...newRoom, property_id: propertyId }])
        .select();

      if (error) throw error;

      if (created) {
        setProperties(
          properties.map((prop) =>
            prop.id === propertyId
              ? {
                  ...prop,
                  rooms: [...(prop.rooms || []), { ...created[0], tenant: undefined }],
                }
              : prop
          )
        );
        setNewRoom({ name: '', status: 'available' });
        setShowAddRoom(null);
        alert('✅ Room added');
      }
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleDeleteRoom = async (propertyId: string, roomId: string) => {
    if (!confirm('Delete this room?')) return;

    try {
      const supabase = createClient();
      const { error } = await supabase.from('rooms').delete().eq('id', roomId);

      if (error) throw error;

      setProperties(
        properties.map((prop) =>
          prop.id === propertyId
            ? {
                ...prop,
                rooms: (prop.rooms || []).filter((r) => r.id !== roomId),
              }
            : prop
        )
      );
      alert('✅ Room deleted');
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleDeleteProperty = async (propertyId: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase.from('properties').delete().eq('id', propertyId);

      if (error) throw error;

      setConfirmDeletePropertyId(null);
      setEditingProperty(null);
      setProperties(properties.filter((p) => p.id !== propertyId));
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  if (loading) return <GenericPageSkeleton />;

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/admin" className="min-w-0 truncate font-semibold text-white hover:text-white/80">Dashboard</Link>} />

      <main className="mx-auto max-w-6xl px-lg">
        <div className="pt-lg mb-3xl flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Properties</h1>
            <p className="mt-sm text-sm text-neutral-600">
              Parent units with licensing • Rooms beneath • Tenants in rooms
            </p>
          </div>
          <button
            onClick={() => setShowAddProperty(true)}
            className="rounded-xl bg-neutral-900 px-lg py-md font-bold text-white hover:bg-neutral-800"
          >
            + Property
          </button>
        </div>

        {/* Search bar */}
        {properties.length > 0 && (
          <div className="mb-lg">
            <input
              type="search"
              placeholder="Search properties…"
              value={propertySearch}
              onChange={(e) => setPropertySearch(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400"
            />
          </div>
        )}

        {properties.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No properties yet</p>
          </div>
        ) : (
          <div className="space-y-lg">
            {properties
              .filter((p) => {
                if (!propertySearch.trim()) return true;
                const q = propertySearch.toLowerCase();
                return p.name?.toLowerCase().includes(q) || p.address?.toLowerCase().includes(q);
              })
              .map((property) => (
              <div key={property.id} className="rounded-2xl border-2 border-neutral-200 bg-white overflow-hidden">
                {/* Property Header — click anywhere to open/close */}
                <div
                  className="bg-neutral-950 text-white px-lg py-md cursor-pointer select-none"
                  onClick={() => {
                    if (editingProperty === property.id) {
                      setEditingProperty(null);
                      setPropertyEdits({});
                    } else {
                      setEditingProperty(property.id);
                      setPropertyEdits(property);
                      loadPropertyDocs(property.id);
                      loadRoomTenancies(property.id);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-md">
                    <div className="flex-1">
                      <h2 className="text-xl font-bold">{property.name}</h2>
                      <p className="text-sm text-neutral-300 mt-xs">{property.address}</p>
                      <div className="flex gap-lg mt-md text-xs text-neutral-400">
                        <span>{property.bedrooms} beds</span>
                        <span>•</span>
                        <span>{property.bathrooms} baths</span>
                        <span>•</span>
                        <span>{property.rooms?.length || 0} rooms</span>
                        <span>•</span>
                        <span className="font-semibold text-white">
                          {(property.rooms || []).filter((r: any) => r.tenant).length} occupied
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-sm">
                      <a
                        href={`/admin/appointments?property=${property.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 px-md py-sm bg-green-600 hover:bg-green-700 text-white rounded font-semibold text-sm transition"
                        title="Book appointment for this property"
                      >
                        📅 Book
                      </a>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 px-md py-sm bg-neutral-700 text-white rounded font-semibold text-sm pointer-events-none select-none"
                      >
                        {editingProperty === property.id ? '▼ Close' : '▶ Open'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Property Details Section (Editable when editingProperty) */}
                {editingProperty === property.id && (
                  <div className="px-lg py-md bg-neutral-50 border-b border-neutral-200 space-y-lg">
                    {/* Basic Property Info */}
                    <div>
                      <h4 className="font-bold text-neutral-900 mb-md text-sm">📍 Property Information</h4>
                      <div className="space-y-md">
                        <div>
                          <label className="block text-xs text-neutral-700 mb-xs font-semibold">Property Name</label>
                          <input
                            type="text"
                            value={propertyEdits.name || ''}
                            onChange={(e) =>
                              setPropertyEdits({ ...propertyEdits, name: e.target.value })
                            }
                            className="w-full rounded border border-neutral-300 px-sm py-xs text-xs"
                            placeholder="e.g., 71 Alloa Road"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-neutral-700 mb-xs font-semibold">Address</label>
                          <AddressAutocomplete
                            value={propertyEdits.address || ''}
                            onChange={(value) =>
                              setPropertyEdits({ ...propertyEdits, address: value })
                            }
                            placeholder="Full address"
                            className="w-full rounded border border-neutral-300 px-sm py-xs text-xs"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-md">
                          <div>
                            <label className="block text-xs text-neutral-700 mb-xs font-semibold">Type</label>
                            <select
                              value={propertyEdits.property_type || 'hmo'}
                              onChange={(e) =>
                                setPropertyEdits({ ...propertyEdits, property_type: e.target.value as any })
                              }
                              className="w-full rounded border border-neutral-300 px-sm py-xs text-xs"
                            >
                              <option value="hmo">HMO</option>
                              <option value="single_let">Single Let</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-neutral-700 mb-xs font-semibold">Beds</label>
                            <input
                              type="number"
                              value={propertyEdits.bedrooms || 0}
                              onChange={(e) =>
                                setPropertyEdits({ ...propertyEdits, bedrooms: Number(e.target.value) })
                              }
                              className="w-full rounded border border-neutral-300 px-sm py-xs text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-neutral-700 mb-xs font-semibold">Baths</label>
                            <input
                              type="number"
                              value={propertyEdits.bathrooms || 0}
                              onChange={(e) =>
                                setPropertyEdits({ ...propertyEdits, bathrooms: Number(e.target.value) })
                              }
                              className="w-full rounded border border-neutral-300 px-sm py-xs text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Licensing */}
                    <div>
                      <h4 className="font-bold text-neutral-900 mb-md text-sm">🏛️ Licensing</h4>
                      <div className="grid grid-cols-2 gap-md">
                        <input
                          type="text"
                          placeholder="License Number"
                          value={propertyEdits.license_number || ''}
                          onChange={(e) =>
                            setPropertyEdits({ ...propertyEdits, license_number: e.target.value })
                          }
                          className="rounded border border-neutral-300 px-sm py-xs text-xs"
                        />
                        <input
                          type="date"
                          value={propertyEdits.license_expiry || ''}
                          onChange={(e) =>
                            setPropertyEdits({ ...propertyEdits, license_expiry: e.target.value })
                          }
                          className="rounded border border-neutral-300 px-sm py-xs text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Council Tax Band"
                          value={propertyEdits.council_tax_band || ''}
                          onChange={(e) =>
                            setPropertyEdits({ ...propertyEdits, council_tax_band: e.target.value })
                          }
                          className="rounded border border-neutral-300 px-sm py-xs text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Deposit Holder"
                          value={propertyEdits.deposit_holder || ''}
                          onChange={(e) =>
                            setPropertyEdits({ ...propertyEdits, deposit_holder: e.target.value })
                          }
                          className="rounded border border-neutral-300 px-sm py-xs text-xs"
                        />
                      </div>
                    </div>

                    {/* Annual Testing & Compliance (Entered ONCE for whole property) */}
                    <div>
                      <h4 className="font-bold text-neutral-900 mb-md text-sm">✅ Annual Testing & Compliance (Property-wide)</h4>
                      <p className="text-xs text-neutral-600 mb-md">Applies to the whole property — not per room</p>

                      {/* Each cert gets its own row: label | test date | expiry date */}
                      <div className="space-y-sm">
                        {[
                          { label: 'Gas Safety Cert (CP12)', dateKey: 'gas_safe_cert_date', expiryKey: 'gas_safe_cert_expiry' },
                          { label: 'EICR (Electrical)', dateKey: 'electrical_cert_date', expiryKey: 'electrical_cert_expiry' },
                          { label: 'PAT (Portable Appliance)', dateKey: 'pat_test_date', expiryKey: 'pat_test_expiry' },
                          { label: 'Fire Detection / Alarm', dateKey: 'fire_detection_test_date', expiryKey: 'fire_detection_expiry' },
                          { label: 'Emergency Lighting', dateKey: 'emergency_lighting_test_date', expiryKey: 'emergency_lighting_expiry' },
                          { label: 'Fire Risk Assessment', dateKey: 'fire_risk_assessment_date', expiryKey: 'fire_risk_assessment_expiry' },
                        ].map(({ label, dateKey, expiryKey }) => (
                          <div key={dateKey} className="grid grid-cols-[1fr_140px_140px] items-center gap-sm rounded-lg bg-white border border-neutral-200 px-md py-sm">
                            <span className="text-xs font-semibold text-neutral-700">{label}</span>
                            <div>
                              <p className="text-[10px] text-neutral-400 mb-xs">Test / issue date</p>
                              <input
                                type="date"
                                value={(propertyEdits as any)[dateKey] || ''}
                                onChange={(e) => setPropertyEdits({ ...propertyEdits, [dateKey]: e.target.value })}
                                className="w-full rounded border border-neutral-300 px-sm py-xs text-xs"
                              />
                            </div>
                            <div>
                              <p className="text-[10px] text-neutral-400 mb-xs">Expiry / next due</p>
                              <input
                                type="date"
                                value={(propertyEdits as any)[expiryKey] || ''}
                                onChange={(e) => setPropertyEdits({ ...propertyEdits, [expiryKey]: e.target.value })}
                                className="w-full rounded border border-neutral-300 px-sm py-xs text-xs"
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Pathways to the recurring in-person checks */}
                      <div className="mt-md flex flex-wrap gap-sm">
                        <a href="/admin/compliance-logs" className="rounded-lg border border-neutral-300 bg-neutral-50 px-md py-sm text-xs font-semibold text-neutral-800 hover:bg-neutral-100">🔔 Monthly smoke alarm tests →</a>
                        <a href="/admin/compliance-logs" className="rounded-lg border border-neutral-300 bg-neutral-50 px-md py-sm text-xs font-semibold text-neutral-800 hover:bg-neutral-100">🚪 Fire door checks →</a>
                        <a href="/admin/tenant-safety-checks" className="rounded-lg border border-neutral-300 bg-neutral-50 px-md py-sm text-xs font-semibold text-neutral-800 hover:bg-neutral-100">📋 Tenant safety self-checks →</a>
                      </div>
                    </div>

                    {/* Tenant-visible Notes */}
                    <div>
                      <h4 className="font-bold text-neutral-900 mb-md text-sm">📌 Tenant Notice Board</h4>
                      <p className="text-xs text-neutral-600 mb-md">These notes appear on all tenants' notice boards in this property</p>
                      <textarea
                        placeholder="Property updates for all tenants (repairs, maintenance, events, etc.)"
                        value={propertyEdits.property_notes || ''}
                        onChange={(e) =>
                          setPropertyEdits({ ...propertyEdits, property_notes: e.target.value })
                        }
                        className="w-full rounded border border-neutral-300 px-sm py-xs text-xs"
                        rows={3}
                      />
                    </div>

                    {/* Internal Notes */}
                    <div>
                      <h4 className="font-bold text-neutral-900 mb-md text-sm">🔒 Internal Notes</h4>
                      <textarea
                        placeholder="Fire safety notes (internal use only)"
                        value={propertyEdits.fire_safety_notes || ''}
                        onChange={(e) =>
                          setPropertyEdits({ ...propertyEdits, fire_safety_notes: e.target.value })
                        }
                        className="w-full rounded border border-neutral-300 px-sm py-xs text-xs mb-md"
                        rows={2}
                      />
                      <textarea
                        placeholder="Communal/shared area notes (internal use only)"
                        value={propertyEdits.communal_notes || ''}
                        onChange={(e) =>
                          setPropertyEdits({ ...propertyEdits, communal_notes: e.target.value })
                        }
                        className="w-full rounded border border-neutral-300 px-sm py-xs text-xs"
                        rows={2}
                      />
                    </div>

                    {/* Insurance — landlords usually arrange this themselves, so it lives low down */}
                    <div>
                      <h4 className="font-bold text-neutral-500 mb-md text-sm">🛡️ Insurance (optional — often the landlord's own)</h4>
                      <div className="grid grid-cols-2 gap-md">
                        <input type="text" placeholder="Provider" value={propertyEdits.insurance_provider || ''} onChange={(e) => setPropertyEdits({ ...propertyEdits, insurance_provider: e.target.value })} className="rounded border border-neutral-300 px-sm py-xs text-xs" />
                        <input type="text" placeholder="Policy Number" value={propertyEdits.insurance_policy_number || ''} onChange={(e) => setPropertyEdits({ ...propertyEdits, insurance_policy_number: e.target.value })} className="rounded border border-neutral-300 px-sm py-xs text-xs" />
                        <input type="date" value={propertyEdits.insurance_expiry || ''} onChange={(e) => setPropertyEdits({ ...propertyEdits, insurance_expiry: e.target.value })} className="col-span-2 rounded border border-neutral-300 px-sm py-xs text-xs" />
                      </div>
                    </div>

                    {/* Appliances — grows over time; kept at the bottom, out of the way */}
                    <div>
                      <h4 className="font-bold text-neutral-500 mb-md text-sm">🧺 Appliances (optional)</h4>
                      <p className="text-xs text-neutral-500 mb-md">Log appliances as you go — type, make/model, when bought and by whom. Builds a history over time.</p>
                      <div className="space-y-md">
                        {(propertyEdits.appliances || []).map((a, i) => (
                          <div key={i} className="rounded-lg border border-neutral-200 p-md">
                            <div className="grid grid-cols-2 gap-sm">
                              <select value={a.type || ''} onChange={(e) => setPropertyEdits({ ...propertyEdits, appliances: (propertyEdits.appliances || []).map((x, idx) => idx === i ? { ...x, type: e.target.value } : x) })} className="rounded border border-neutral-300 px-sm py-xs text-xs">
                                <option value="">Type…</option>
                                {APPLIANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                              <input placeholder="Make / model" value={a.model || ''} onChange={(e) => setPropertyEdits({ ...propertyEdits, appliances: (propertyEdits.appliances || []).map((x, idx) => idx === i ? { ...x, model: e.target.value } : x) })} className="rounded border border-neutral-300 px-sm py-xs text-xs" />
                              <div>
                                <label className="block text-[10px] text-neutral-500 mb-xs">Purchased</label>
                                <input type="date" value={a.purchased_date || ''} onChange={(e) => setPropertyEdits({ ...propertyEdits, appliances: (propertyEdits.appliances || []).map((x, idx) => idx === i ? { ...x, purchased_date: e.target.value } : x) })} className="w-full rounded border border-neutral-300 px-sm py-xs text-xs" />
                              </div>
                              <div>
                                <label className="block text-[10px] text-neutral-500 mb-xs">Purchased by</label>
                                <input placeholder="e.g. Capital Rooms / landlord" value={a.purchased_by || ''} onChange={(e) => setPropertyEdits({ ...propertyEdits, appliances: (propertyEdits.appliances || []).map((x, idx) => idx === i ? { ...x, purchased_by: e.target.value } : x) })} className="w-full rounded border border-neutral-300 px-sm py-xs text-xs" />
                              </div>
                            </div>
                            <div className="mt-sm flex items-center gap-sm">
                              <input placeholder="Notes (warranty, serial, cover…)" value={a.notes || ''} onChange={(e) => setPropertyEdits({ ...propertyEdits, appliances: (propertyEdits.appliances || []).map((x, idx) => idx === i ? { ...x, notes: e.target.value } : x) })} className="flex-1 rounded border border-neutral-300 px-sm py-xs text-xs" />
                              <button type="button" onClick={() => setPropertyEdits({ ...propertyEdits, appliances: (propertyEdits.appliances || []).filter((_, idx) => idx !== i) })} className="shrink-0 text-xs text-neutral-400 hover:text-neutral-900">Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={() => setPropertyEdits({ ...propertyEdits, appliances: [...(propertyEdits.appliances || []), {}] })} className="mt-md text-xs font-semibold text-neutral-700 hover:text-neutral-900">+ Add appliance</button>
                    </div>

                    <div className="flex gap-md">
                      <button
                        onClick={() => handleUpdateProperty(property.id)}
                        className="flex-1 rounded bg-neutral-900 px-lg py-md text-white font-bold hover:bg-neutral-800"
                      >
                        Save All Property Info
                      </button>
                      <button
                        onClick={() => {
                          setEditingProperty(null);
                          setPropertyEdits({});
                        }}
                        className="rounded border border-neutral-400 px-lg py-md font-bold text-neutral-900 hover:bg-neutral-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Rooms Section — only when property is open */}
                {editingProperty === property.id &&
                <div className="px-lg py-md">
                  <div className="flex items-center justify-between mb-md">
                    <button
                      onClick={() => {
                        const next = expandedProperty === property.id ? null : property.id;
                        setExpandedProperty(next);
                        if (next) loadRoomTenancies(next);
                      }}
                      className="font-semibold text-neutral-900 hover:text-neutral-700"
                    >
                      {expandedProperty === property.id ? '▼' : '▶'} Rooms ({property.rooms?.length || 0})
                    </button>
                    {expandedProperty === property.id && (
                      <button
                        onClick={() => setShowAddRoom(property.id)}
                        className="text-sm px-md py-sm bg-neutral-900 text-white rounded font-semibold hover:bg-neutral-800"
                      >
                        + Room
                      </button>
                    )}
                  </div>

                  {expandedProperty === property.id && (
                    <div className="space-y-md">
                      {!property.rooms || property.rooms.length === 0 ? (
                        <p className="text-sm text-neutral-500 italic">No rooms yet — add one above.</p>
                      ) : (
                        [...(property.rooms)].sort((a, b) => {
                          // Natural numeric sort: "Room 2" < "Room 10" < "Studio"
                          const numA = parseInt(a.name.match(/\d+/)?.[0] ?? '9999');
                          const numB = parseInt(b.name.match(/\d+/)?.[0] ?? '9999');
                          return numA !== numB ? numA - numB : a.name.localeCompare(b.name);
                        }).map((room) => {
                          const tenancies = roomTenancies[room.id] || [];
                          const today = new Date().toISOString().split('T')[0];
                          const statusColour: Record<string, string> = {
                            occupied: 'bg-emerald-100 text-emerald-800',
                            available: 'bg-blue-100 text-blue-800',
                            on_notice: 'bg-amber-100 text-amber-800',
                          };
                          return (
                            <div key={room.id} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                              {/* Room header row */}
                              <div className="flex items-center justify-between gap-md px-md py-sm bg-neutral-50 border-b border-neutral-200">
                                <div className="flex items-center gap-xs min-w-0">
                                  {/* Tenant-visible room name */}
                                  {editingRoomName?.id === room.id ? (
                                    <input
                                      autoFocus
                                      value={editingRoomName.value}
                                      onChange={(e) => setEditingRoomName({ id: room.id, value: e.target.value })}
                                      onBlur={() => handleSaveRoomName(room.id, property.id, editingRoomName.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveRoomName(room.id, property.id, editingRoomName.value);
                                        if (e.key === 'Escape') setEditingRoomName(null);
                                      }}
                                      className="font-semibold text-neutral-900 bg-white border border-blue-400 rounded px-xs py-[2px] text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    />
                                  ) : (
                                    <button
                                      onClick={() => setEditingRoomName({ id: room.id, value: room.name })}
                                      title="Click to rename (tenants see this)"
                                      className="font-semibold text-neutral-900 hover:text-blue-600 hover:underline text-left"
                                    >
                                      {room.name}
                                    </button>
                                  )}
                                  {/* Admin-only internal label */}
                                  {editingRoomLabel?.id === room.id ? (
                                    <input
                                      autoFocus
                                      placeholder="e.g. former lounge"
                                      value={editingRoomLabel.value}
                                      onChange={(e) => setEditingRoomLabel({ id: room.id, value: e.target.value })}
                                      onBlur={() => handleSaveRoomLabel(room.id, property.id, editingRoomLabel.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveRoomLabel(room.id, property.id, editingRoomLabel.value);
                                        if (e.key === 'Escape') setEditingRoomLabel(null);
                                      }}
                                      className="text-xs text-neutral-500 italic bg-white border border-neutral-300 rounded px-xs py-[2px] w-36 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                                    />
                                  ) : room.internal_name ? (
                                    <button
                                      onClick={() => setEditingRoomLabel({ id: room.id, value: room.internal_name || '' })}
                                      title="Admin label (not shown to tenants) — click to edit"
                                      className="text-xs text-neutral-400 italic hover:text-neutral-600 truncate"
                                    >
                                      ({room.internal_name})
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => setEditingRoomLabel({ id: room.id, value: '' })}
                                      title="Add an admin-only label for this room"
                                      className="text-xs text-neutral-300 hover:text-neutral-500 italic"
                                    >
                                      + label
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-sm">
                                  {/* Inline status selector */}
                                  <select
                                    value={room.status}
                                    onChange={(e) => handleUpdateRoomStatus(room.id, property.id, e.target.value as any)}
                                    className={`text-xs font-semibold px-sm py-xs rounded border-0 cursor-pointer ${statusColour[room.status] || 'bg-neutral-100 text-neutral-700'}`}
                                  >
                                    <option value="available">Available</option>
                                    <option value="occupied">Occupied</option>
                                    <option value="on_notice">On Notice</option>
                                  </select>
                                  <button
                                    onClick={() => {
                                      setAddTenancyRoomId(addTenancyRoomId === room.id ? null : room.id);
                                      setNewTenancy({ full_name: '', email: '', start_date: '', end_date: '', rent_amount: '', deposit_amount: '', lease_reference: '' });
                                    }}
                                    className="text-xs px-sm py-xs bg-neutral-900 text-white rounded font-semibold hover:bg-neutral-700"
                                  >
                                    + Tenancy
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRoom(property.id, room.id)}
                                    className="text-xs px-sm py-xs text-red-600 hover:bg-red-50 rounded font-semibold"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>

                              {/* Tenancy history table */}
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-neutral-100 text-xs text-neutral-500 uppercase tracking-wide">
                                      <th className="text-left px-md py-xs font-medium">Reference</th>
                                      <th className="text-left px-md py-xs font-medium">Start</th>
                                      <th className="text-left px-md py-xs font-medium">End</th>
                                      <th className="text-left px-md py-xs font-medium">Tenant</th>
                                      <th className="text-right px-md py-xs font-medium">Rent pcm</th>
                                      <th className="text-right px-md py-xs font-medium">Deposit</th>
                                      <th className="px-md py-xs"></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tenancies.length === 0 ? (
                                      <tr>
                                        <td colSpan={7} className="px-md py-md text-sm text-neutral-400 italic">No tenancy history</td>
                                      </tr>
                                    ) : (() => {
                                      const isExpanded = expandedTenancyHistory.has(room.id);
                                      const visible = isExpanded ? tenancies : tenancies.slice(0, 2);
                                      const hidden = tenancies.length - 2;
                                      const renderRow = (t: TenancyRecord) => {
                                        const isActive = !t.end_date || t.end_date >= today;
                                        return (
                                          <tr
                                            key={t.id}
                                            className={`border-b border-neutral-50 last:border-0 ${isActive ? '' : 'opacity-50'}`}
                                          >
                                            <td className="px-md py-sm font-mono text-xs text-neutral-700">
                                              {t.lease_reference || <span className="text-neutral-300">—</span>}
                                              {!isActive && <span className="ml-xs text-[10px] italic text-neutral-400">(inactive)</span>}
                                            </td>
                                            <td className="px-md py-sm text-xs text-neutral-700 whitespace-nowrap">
                                              {t.start_date ? new Date(t.start_date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                                            </td>
                                            <td className="px-md py-sm text-xs text-neutral-700 whitespace-nowrap">
                                              {t.end_date ? new Date(t.end_date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : <span className="text-emerald-600 font-semibold">Active</span>}
                                            </td>
                                            <td className="px-md py-sm">
                                              <p className="font-semibold text-neutral-900 text-xs">{t.people?.full_name || '—'}</p>
                                              <p className="text-[11px] text-neutral-500">{t.people?.email || ''}</p>
                                            </td>
                                            <td className="px-md py-sm text-xs text-right text-neutral-700 whitespace-nowrap">
                                              {t.rent_amount ? `£${Number(t.rent_amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}` : '—'}
                                            </td>
                                            <td className="px-md py-sm text-xs text-right text-neutral-700 whitespace-nowrap">
                                              {t.deposit_amount ? `£${Number(t.deposit_amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}` : '—'}
                                            </td>
                                            <td className="px-md py-sm" />
                                          </tr>
                                        );
                                      };
                                      return (
                                        <>
                                          {visible.map(renderRow)}
                                          {!isExpanded && hidden > 0 && (
                                            <tr>
                                              <td colSpan={7} className="px-md py-xs">
                                                <button
                                                  onClick={() => setExpandedTenancyHistory((prev) => {
                                                    const next = new Set(prev);
                                                    next.add(room.id);
                                                    return next;
                                                  })}
                                                  className="text-xs text-neutral-500 hover:text-neutral-800 font-semibold flex items-center gap-xs"
                                                >
                                                  ▾ {hidden} older {hidden === 1 ? 'tenancy' : 'tenancies'} — click to view full history
                                                </button>
                                              </td>
                                            </tr>
                                          )}
                                          {isExpanded && hidden > 0 && (
                                            <tr>
                                              <td colSpan={7} className="px-md py-xs">
                                                <button
                                                  onClick={() => setExpandedTenancyHistory((prev) => {
                                                    const next = new Set(prev);
                                                    next.delete(room.id);
                                                    return next;
                                                  })}
                                                  className="text-xs text-neutral-400 hover:text-neutral-700 font-semibold flex items-center gap-xs"
                                                >
                                                  ▴ collapse history
                                                </button>
                                              </td>
                                            </tr>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </tbody>
                                </table>
                              </div>

                              {/* Add Tenancy inline form */}
                              {addTenancyRoomId === room.id && (
                                <div className="border-t border-neutral-200 bg-neutral-50 p-md space-y-md">
                                  <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">New Tenancy</p>
                                  <div className="grid grid-cols-2 gap-sm">
                                    <input
                                      type="text"
                                      placeholder="Full name"
                                      value={newTenancy.full_name}
                                      onChange={(e) => setNewTenancy({ ...newTenancy, full_name: e.target.value })}
                                      className="rounded border border-neutral-300 px-sm py-xs text-sm"
                                    />
                                    <input
                                      type="email"
                                      placeholder="Email address *"
                                      value={newTenancy.email}
                                      onChange={(e) => setNewTenancy({ ...newTenancy, email: e.target.value })}
                                      className="rounded border border-neutral-300 px-sm py-xs text-sm"
                                    />
                                    <div className="space-y-xs">
                                      <label className="text-[11px] text-neutral-500">Start date *</label>
                                      <input
                                        type="date"
                                        value={newTenancy.start_date}
                                        onChange={(e) => setNewTenancy({ ...newTenancy, start_date: e.target.value })}
                                        className="w-full rounded border border-neutral-300 px-sm py-xs text-sm"
                                      />
                                    </div>
                                    <div className="space-y-xs">
                                      <label className="text-[11px] text-neutral-500">End date (leave blank if ongoing)</label>
                                      <input
                                        type="date"
                                        value={newTenancy.end_date}
                                        onChange={(e) => setNewTenancy({ ...newTenancy, end_date: e.target.value })}
                                        className="w-full rounded border border-neutral-300 px-sm py-xs text-sm"
                                      />
                                    </div>
                                    <div className="space-y-xs">
                                      <label className="text-[11px] text-neutral-500">Monthly rent (£) *</label>
                                      <input
                                        type="number"
                                        placeholder="e.g. 825"
                                        value={newTenancy.rent_amount}
                                        onChange={(e) => setNewTenancy({ ...newTenancy, rent_amount: e.target.value })}
                                        className="w-full rounded border border-neutral-300 px-sm py-xs text-sm"
                                      />
                                    </div>
                                    <div className="space-y-xs">
                                      <label className="text-[11px] text-neutral-500">Deposit (£)</label>
                                      <input
                                        type="number"
                                        placeholder="e.g. 825"
                                        value={newTenancy.deposit_amount}
                                        onChange={(e) => setNewTenancy({ ...newTenancy, deposit_amount: e.target.value })}
                                        className="w-full rounded border border-neutral-300 px-sm py-xs text-sm"
                                      />
                                    </div>
                                    <input
                                      type="text"
                                      placeholder="Lease reference (e.g. 004WIR01)"
                                      value={newTenancy.lease_reference}
                                      onChange={(e) => setNewTenancy({ ...newTenancy, lease_reference: e.target.value })}
                                      className="col-span-2 rounded border border-neutral-300 px-sm py-xs text-sm"
                                    />
                                  </div>
                                  <div className="flex gap-sm">
                                    <button
                                      disabled={tenancySaving}
                                      onClick={() => handleAddTenancy(room.id, property.id)}
                                      className="flex-1 rounded bg-neutral-900 py-sm font-bold text-white text-sm hover:bg-neutral-800 disabled:opacity-50"
                                    >
                                      {tenancySaving ? 'Saving…' : 'Save Tenancy'}
                                    </button>
                                    <button
                                      onClick={() => setAddTenancyRoomId(null)}
                                      className="flex-1 rounded border border-neutral-300 py-sm font-semibold text-sm"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}

                      {/* Add Room Form */}
                      {showAddRoom === property.id && (
                        <div className="rounded-lg border-2 border-neutral-300 p-md bg-neutral-50">
                          <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-md">New Room</p>
                          <div className="space-y-md">
                            <input
                              type="text"
                              placeholder="Room name (e.g., Room 1 - Double)"
                              value={newRoom.name}
                              onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                              className="w-full rounded border border-neutral-300 px-md py-sm text-base"
                            />
                            <select
                              value={newRoom.status}
                              onChange={(e) =>
                                setNewRoom({ ...newRoom, status: e.target.value as any })
                              }
                              className="w-full rounded border border-neutral-300 px-md py-sm text-base"
                            >
                              <option value="available">Available</option>
                              <option value="occupied">Occupied</option>
                              <option value="on_notice">On Notice</option>
                            </select>
                            <div className="flex gap-sm">
                              <button
                                onClick={() => handleAddRoom(property.id)}
                                className="flex-1 rounded bg-neutral-900 py-md font-bold text-white hover:bg-neutral-800"
                              >
                                Add Room
                              </button>
                              <button
                                onClick={() => setShowAddRoom(null)}
                                className="flex-1 rounded border border-neutral-300 py-md font-semibold"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Property Documents ───────────────────────────────── */}
                  {(() => {
                    const docs = propertyDocs[property.id] || []
                    const up = docUpload[property.id] || { type: '', uploading: false, error: '', success: false }
                    const setUp = (patch: Partial<typeof up>) =>
                      setDocUpload((prev) => ({ ...prev, [property.id]: { ...up, ...patch } }))

                    const DOC_TYPES = [
                      { value: 'evacuation_plan',      label: '🚨 Evacuation / Fire Plan' },
                      { value: 'emergency_contacts',   label: '☎️ Important Contact Info' },
                      { value: 'house_rules',          label: '📋 House Rules' },
                      { value: 'safety_info',          label: '🛡️ Safety Information' },
                      { value: 'inventory',            label: '📦 Inventory' },
                      { value: 'wifi_details',         label: '📶 Wi-Fi / Internet Details' },
                      { value: 'waste_schedule',       label: '🗑️ Waste & Recycling Guide' },
                      { value: 'utility_info',         label: '⚙️ Utility Bills / Info' },
                      { value: 'policies',             label: '📄 Policy Document' },
                      { value: 'council_correspondence', label: '🏛️ Council Correspondence' },
                      { value: 'landlord_statement',   label: '💷 Landlord Statement' },
                      { value: 'tenancy_agreement',    label: '📝 Tenancy Agreement (APT)' },
                      { value: 'deposit_certificate',  label: '🔐 Deposit Certificate' },
                      { value: 'supplier_invoice',     label: '🧾 Supplier / Contractor Invoice' },
                      { value: 'purchase_receipt',     label: '🛒 Purchase Receipt' },
                      { value: 'other',                label: '📎 Other Document' },
                    ]
                    const typeLabel = (v: string) => DOC_TYPES.find((d) => d.value === v)?.label || v

                    return (
                      <div className="border-t border-neutral-200 px-lg py-lg">
                        <div className="flex items-center justify-between mb-md">
                          <h4 className="font-bold text-neutral-900 text-sm">📁 Property Documents</h4>
                          {/* AI scan shortcut — pick a file and let AI identify + file it */}
                          <label className="flex shrink-0 cursor-pointer items-center gap-xs rounded-lg bg-neutral-900 px-sm py-xs text-[11px] font-bold text-white hover:bg-neutral-700">
                            🤖 AI scan
                            <input type="file" className="sr-only" accept="image/*,application/pdf"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleAIScan(property.id, f);
                                e.target.value = '';
                              }} />
                          </label>
                          <span className="text-xs text-neutral-400">
                            {docs.filter((d) => d.visible_to_tenants).length} of {docs.length} shared with tenants
                          </span>
                        </div>

                        {/* Existing documents */}
                        {docs.length > 0 && (
                          <div className="space-y-xs mb-md">
                            {docs.map((doc: any) => (
                              <div key={doc.id} className="flex items-center gap-sm rounded-lg border border-neutral-200 bg-white px-sm py-xs">
                                <span className="flex-1 min-w-0">
                                  <span className="block text-xs font-semibold text-neutral-800 truncate">{typeLabel(doc.document_type)}</span>
                                  <span className="block text-[10px] text-neutral-400 truncate">{doc.file_name}</span>
                                </span>
                                {doc.storage_url && (
                                  <a href={doc.storage_url} target="_blank" rel="noopener noreferrer"
                                    className="shrink-0 text-[10px] text-blue-600 hover:underline">View</a>
                                )}
                                {/* Tenant visibility toggle */}
                                <button
                                  title={doc.visible_to_tenants ? 'Visible to tenants — click to hide' : 'Hidden from tenants — click to share'}
                                  onClick={async () => {
                                    const supabase = createClient()
                                    await supabase.from('property_documents')
                                      .update({ visible_to_tenants: !doc.visible_to_tenants })
                                      .eq('id', doc.id)
                                    loadPropertyDocs(property.id)
                                  }}
                                  className={`shrink-0 rounded-full px-sm py-xs text-[10px] font-semibold transition-colors ${
                                    doc.visible_to_tenants
                                      ? 'bg-green-100 text-green-700 hover:bg-red-50 hover:text-red-600'
                                      : 'bg-neutral-100 text-neutral-500 hover:bg-green-50 hover:text-green-700'
                                  }`}
                                >
                                  {doc.visible_to_tenants ? '👁 Tenant visible' : 'Admin only'}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {docs.length === 0 && (
                          <p className="text-xs text-neutral-400 mb-md">No documents uploaded yet.</p>
                        )}

                        {/* Upload form */}
                        <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-md">
                          <p className="text-xs font-semibold text-neutral-600 mb-sm">Upload a document</p>
                          <div className="flex flex-col gap-sm">
                            <select
                              value={up.type}
                              onChange={(e) => setUp({ type: e.target.value })}
                              className="w-full rounded-lg border border-neutral-300 px-sm py-xs text-xs"
                            >
                              <option value="">Select document type…</option>
                              {DOC_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>

                            <div className="flex items-center gap-sm">
                              <label className="flex-1 cursor-pointer rounded-lg border border-neutral-300 bg-white px-sm py-xs text-xs text-neutral-500 hover:border-neutral-400 truncate">
                                {up.file ? up.file.name : 'Choose file (PDF, PNG, JPG)…'}
                                <input type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.gif"
                                  onChange={(e) => setUp({ file: e.target.files?.[0], success: false })} />
                              </label>

                              {/* Tenant visibility option */}
                              <label className="flex shrink-0 items-center gap-xs text-[10px] text-neutral-600 cursor-pointer select-none">
                                <input type="checkbox"
                                  checked={!!(up as any).shareWithTenants}
                                  onChange={(e) => setUp({ shareWithTenants: e.target.checked } as any)}
                                  className="rounded" />
                                Share with tenants
                              </label>
                            </div>

                            {up.error && <p className="text-xs text-red-600">{up.error}</p>}
                            {up.success && <p className="text-xs text-green-600">✅ Uploaded successfully</p>}

                            <button
                              disabled={!up.file || !up.type || up.uploading}
                              onClick={async () => {
                                const state = docUpload[property.id] || {}
                                const body = new FormData()
                                body.append('file', state.file!)
                                body.append('property_id', property.id)
                                body.append('document_type', state.type)
                                body.append('file_name', state.file!.name)
                                body.append('visible_to_tenants', String(!!(state as any).shareWithTenants))
                                setUp({ uploading: true, error: '', success: false })
                                try {
                                  const res = await fetch('/api/admin/upload-property-document', { method: 'POST', body })
                                  const json = await res.json()
                                  if (!res.ok) throw new Error(json.error || 'Upload failed')
                                  setUp({ type: '', file: undefined, uploading: false, success: true, shareWithTenants: false } as any)
                                  loadPropertyDocs(property.id)
                                } catch (err: any) {
                                  setUp({ uploading: false, error: err.message })
                                }
                              }}
                              className="rounded-lg bg-neutral-900 px-md py-sm text-xs font-bold text-white hover:bg-neutral-700 disabled:opacity-40"
                            >
                              {up.uploading ? 'Uploading…' : '↑ Upload'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Delete property — destructive, two-step confirmation */}
                  <div className="px-lg pb-lg pt-md border-t border-neutral-200 mt-lg">
                    {confirmDeletePropertyId === property.id ? (
                      <div className="rounded-xl bg-red-50 border border-red-200 p-md">
                        <p className="text-sm font-semibold text-red-700 mb-xs">⚠️ Delete this property?</p>
                        <p className="text-xs text-red-600 mb-md">
                          This will permanently delete <strong>{property.name}</strong> and all its rooms. Tenant records and compliance data will be lost. This cannot be undone.
                        </p>
                        <div className="flex gap-sm">
                          <button
                            onClick={() => handleDeleteProperty(property.id)}
                            className="rounded-lg bg-red-600 px-md py-sm text-xs font-bold text-white hover:bg-red-700"
                          >
                            Yes, delete permanently
                          </button>
                          <button
                            onClick={() => setConfirmDeletePropertyId(null)}
                            className="rounded-lg border border-neutral-300 px-md py-sm text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeletePropertyId(property.id)}
                        className="text-xs text-neutral-400 hover:text-red-500"
                      >
                        Delete property…
                      </button>
                    )}
                  </div>
                </div>
                }
              </div>
            ))}
          </div>
        )}

        {/* ── AI Scan modal (triggered from inside a property card) ─────── */}
        {aiScan && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-lg overflow-y-auto">
            <div className="w-full max-w-lg my-xl">
              {/* Header bar */}
              <div className="flex items-center justify-between mb-md">
                <p className="text-sm font-bold text-white">
                  🤖 AI Document Scan — {properties.find((p) => p.id === aiScan.propertyId)?.name || 'Property'}
                </p>
                <button
                  onClick={() => setAiScan(null)}
                  className="rounded-full bg-white/20 px-md py-xs text-xs font-semibold text-white hover:bg-white/30"
                >
                  ✕ Close
                </button>
              </div>

              {/* Busy state */}
              {aiScan.busy && (
                <div className="rounded-2xl bg-white p-xl text-center">
                  <p className="text-2xl mb-md">⏳</p>
                  <p className="font-bold text-neutral-900">{aiScan.busyLabel}</p>
                  <p className="text-xs text-neutral-500 mt-xs">Please wait…</p>
                </div>
              )}

              {/* Error state */}
              {!aiScan.busy && aiScan.error && (
                <div className="rounded-2xl bg-white p-lg">
                  <p className="text-sm text-red-700 font-semibold mb-md">⚠️ {aiScan.error}</p>
                  <button onClick={() => setAiScan(null)} className="rounded-xl border border-neutral-300 px-lg py-sm text-sm font-semibold">Dismiss</button>
                </div>
              )}

              {/* DocReview result */}
              {!aiScan.busy && !aiScan.error && aiScan.result && aiScan.file && (
                <DocReview
                  initial={aiScan.result}
                  file={aiScan.file}
                  properties={properties}
                  people={aiScan.allPeople}
                  tenancies={aiScan.allTenancies}
                  defaultPropertyId={aiScan.propertyId}
                  onApplied={(msg) => {
                    setAiScan(null);
                    loadPropertyDocs(aiScan.propertyId);
                    alert('✅ ' + msg);
                  }}
                  onCancel={() => setAiScan(null)}
                />
              )}
            </div>
          </div>
        )}

        {/* Add Property Modal */}
        {showAddProperty && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="rounded-3xl bg-white p-lg max-w-md w-full mx-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-neutral-900 mb-lg">Add Property</h2>
              <div className="space-y-md">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-xs">Property Name</label>
                  <input
                    type="text"
                    placeholder="e.g., 71 Alloa Road"
                    value={newProperty.name}
                    onChange={(e) => setNewProperty({ ...newProperty, name: e.target.value })}
                    className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-xs">Address</label>
                  <AddressAutocomplete
                    value={newProperty.address}
                    onChange={(value) => setNewProperty({ ...newProperty, address: value })}
                    placeholder="Full address"
                    className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                  />
                </div>
                <div className="grid grid-cols-2 gap-md">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-xs">Property Type</label>
                    <select
                      value={newProperty.property_type}
                      onChange={(e) => setNewProperty({ ...newProperty, property_type: e.target.value as any })}
                      className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                    >
                      <option value="hmo">HMO (Multi-let)</option>
                      <option value="single_let">Single Let</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-md">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-xs">Bedrooms</label>
                    <input
                      type="number"
                      placeholder="0"
                      min="0"
                      value={newProperty.bedrooms}
                      onChange={(e) => setNewProperty({ ...newProperty, bedrooms: Math.max(0, Number(e.target.value)) })}
                      className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-xs">Bathrooms</label>
                    <input
                      type="number"
                      placeholder="0"
                      min="0"
                      value={newProperty.bathrooms}
                      onChange={(e) => setNewProperty({ ...newProperty, bathrooms: Math.max(0, Number(e.target.value)) })}
                      className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                    />
                  </div>
                </div>
                <div className="flex gap-sm pt-md">
                  <button
                    onClick={handleAddProperty}
                    className="flex-1 rounded-xl bg-neutral-900 py-md font-bold text-white hover:bg-neutral-800"
                  >
                    Add Property
                  </button>
                  <button
                    onClick={() => setShowAddProperty(false)}
                    className="flex-1 rounded-xl border border-neutral-300 py-md font-semibold hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
