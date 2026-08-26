'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link';
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading';

interface Property {
  id: string;
  name: string;
  address: string;
}

interface Room {
  id: string;
  name: string;
  property_id: string;
  status: 'occupied' | 'available' | 'on_notice';
}

interface Tenancy {
  id: string;
  person_id: string;
  room_id: string;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'on_notice' | 'available';
  rent_amount: number;
  communication_preference: 'email' | 'text';
  opt_in_maintenance: boolean;
  opt_in_viewings: boolean;
  opt_in_appointments: boolean;
  opt_in_cleaning: boolean;
  person?: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
  };
  room?: Room;
  property?: Property;
}

interface TenantPerson {
  full_name: string;
  email: string;
  phone: string;
}

export default function TenanciesManagementPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTenancy, setShowAddTenancy] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [noticeTenancy, setNoticeTenancy] = useState<Tenancy | null>(null);
  const [noticeDate, setNoticeDate] = useState('');
  const [savingNotice, setSavingNotice] = useState(false);

  const [newTenant, setNewTenant] = useState<TenantPerson>({
    full_name: '',
    email: '',
    phone: '',
  });

  const [newTenancy, setNewTenancy] = useState({
    start_date: new Date().toISOString().split('T')[0],
    status: 'active' as 'active' | 'on_notice' | 'available',
    rent_amount: 0,
    communication_preference: 'email' as 'email' | 'text',
    opt_in_maintenance: true,
    opt_in_viewings: true,
    opt_in_appointments: true,
    opt_in_cleaning: true,
  });

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin') {
        router.push('/login');
        return;
      }

      await loadData();
    }
    init();
  }, [router]);

  async function loadData() {
    const supabase = createClient();

    // Fetch properties
    const { data: propsData } = await supabase
      .from('properties')
      .select('id, name, address')
      .order('name');

    // Fetch rooms
    const { data: roomsData } = await supabase
      .from('rooms')
      .select('id, name, property_id, status')
      .order('name');

    // Fetch tenancies
    const { data: tenanciesData } = await supabase
      .from('tenancies')
      .select(
        '*, people(id, full_name, email, phone), rooms(id, name, property_id, status), properties(id, name, address)'
      )
      .order('start_date', { ascending: false });

    setProperties(propsData || []);
    setRooms(roomsData || []);
    setTenancies((tenanciesData as any[]) || []);
    setLoading(false);
  }

  const filteredRooms = selectedProperty
    ? rooms.filter((r) => r.property_id === selectedProperty)
    : [];

  const handleAddTenancy = async () => {
    if (!selectedRoom || !newTenant.full_name || !newTenant.email) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const supabase = createClient();

      // 1. Create or find person
      let personId: string;
      const { data: existingPerson } = await supabase
        .from('people')
        .select('id')
        .eq('email', newTenant.email)
        .single();

      if (existingPerson) {
        personId = existingPerson.id;
        // Update person info if needed
        await supabase
          .from('people')
          .update({
            full_name: newTenant.full_name,
            phone: newTenant.phone,
          })
          .eq('id', personId);
      } else {
        // Create new person
        const { data: newPerson, error: personError } = await supabase
          .from('people')
          .insert([
            {
              full_name: newTenant.full_name,
              email: newTenant.email,
              phone: newTenant.phone,
              role: 'tenant',
            },
          ])
          .select()
          .single();

        if (personError) throw personError;
        personId = newPerson.id;
      }

      // 2. Create tenancy
      const { error: tenancyError } = await supabase
        .from('tenancies')
        .insert([
          {
            person_id: personId,
            room_id: selectedRoom,
            start_date: newTenancy.start_date,
            status: newTenancy.status,
            rent_amount: newTenancy.rent_amount,
            communication_preference: newTenancy.communication_preference,
            opt_in_maintenance: newTenancy.opt_in_maintenance,
            opt_in_viewings: newTenancy.opt_in_viewings,
            opt_in_appointments: newTenancy.opt_in_appointments,
            opt_in_cleaning: newTenancy.opt_in_cleaning,
          },
        ]);

      if (tenancyError) throw tenancyError;

      // Reload and reset
      await loadData();
      setShowAddTenancy(false);
      setSelectedProperty('');
      setSelectedRoom('');
      setNewTenant({ full_name: '', email: '', phone: '' });
      setNewTenancy({
        start_date: new Date().toISOString().split('T')[0],
        status: 'active',
        rent_amount: 0,
        communication_preference: 'email',
        opt_in_maintenance: true,
        opt_in_viewings: true,
        opt_in_appointments: true,
        opt_in_cleaning: true,
      });
      alert('✅ Tenancy created');
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  /** Open the notice dialog, defaulting the move-out date to one month out. */
  const openNotice = (tenancy: Tenancy) => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    setNoticeDate(tenancy.end_date || d.toISOString().split('T')[0]);
    setNoticeTenancy(tenancy);
  };

  /** Put a tenant on notice = set the tenancy end_date. Lettings then markets the
   *  room as "available from" that date, and it shows "on notice" on the property. */
  const handleSetNotice = async () => {
    if (!noticeTenancy || !noticeDate) return;
    setSavingNotice(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tenancies')
        .update({ end_date: noticeDate })
        .eq('id', noticeTenancy.id);
      if (error) throw error;
      setNoticeTenancy(null);
      setNoticeDate('');
      await loadData();
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSavingNotice(false);
    }
  };

  /** Cancel notice = clear the end_date, so the room stops being marketed. */
  const handleCancelNotice = async (tenancyId: string) => {
    if (!confirm('Clear the move-out date? The room will stop being marketed as available.')) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tenancies')
        .update({ end_date: null })
        .eq('id', tenancyId);
      if (error) throw error;
      await loadData();
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleDeleteTenancy = async (tenancyId: string) => {
    if (!confirm('Delete this tenancy?')) return;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tenancies')
        .delete()
        .eq('id', tenancyId);

      if (error) throw error;
      await loadData();
      alert('✅ Tenancy deleted');
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  if (loading) return <GenericPageSkeleton />;

  const selectedRoomData = rooms.find((r) => r.id === selectedRoom);
  const selectedPropertyData = selectedProperty ? properties.find((p) => p.id === selectedProperty) : null;

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-6xl px-lg">
        <div className="pt-lg mb-3xl flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Tenancies</h1>
            <p className="mt-sm text-sm text-neutral-600">Assign tenants to rooms with communication preferences</p>
          </div>
          <button
            onClick={() => setShowAddTenancy(true)}
            className="rounded-xl bg-neutral-900 px-lg py-md font-bold text-white hover:bg-neutral-800"
          >
            + Tenancy
          </button>
        </div>

        {/* Add Tenancy Modal */}
        {showAddTenancy && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="rounded-3xl bg-white p-lg max-w-2xl w-full mx-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-neutral-900 mb-lg">Add Tenancy</h2>

              <div className="space-y-lg">
                {/* Step 1: Select Property & Room */}
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-md">1. Select Room</h3>
                  <div className="space-y-md">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-xs">Property *</label>
                      <select
                        value={selectedProperty}
                        onChange={(e) => {
                          setSelectedProperty(e.target.value);
                          setSelectedRoom('');
                        }}
                        className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                      >
                        <option value="">Choose property...</option>
                        {properties.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} • {p.address}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-xs">Room *</label>
                      <select
                        value={selectedRoom}
                        onChange={(e) => setSelectedRoom(e.target.value)}
                        disabled={!selectedProperty}
                        className="w-full rounded-xl border border-neutral-300 px-md py-md text-base disabled:opacity-50"
                      >
                        <option value="">Choose room...</option>
                        {filteredRooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} • {r.status}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Step 2: Tenant Contact Info */}
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-md">2. Tenant Contact Info</h3>
                  <div className="space-y-md">
                    <input
                      type="text"
                      placeholder="Full name *"
                      value={newTenant.full_name}
                      onChange={(e) => setNewTenant({ ...newTenant, full_name: e.target.value })}
                      className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                    />
                    <input
                      type="email"
                      placeholder="Email *"
                      value={newTenant.email}
                      onChange={(e) => setNewTenant({ ...newTenant, email: e.target.value })}
                      className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                    />
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={newTenant.phone}
                      onChange={(e) => setNewTenant({ ...newTenant, phone: e.target.value })}
                      className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                    />
                  </div>
                </div>

                {/* Step 3: Tenancy Details */}
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-md">3. Tenancy Details</h3>
                  <div className="space-y-md">
                    <div className="grid grid-cols-2 gap-md">
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-xs">Start Date</label>
                        <input
                          type="date"
                          value={newTenancy.start_date}
                          onChange={(e) => setNewTenancy({ ...newTenancy, start_date: e.target.value })}
                          className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-xs">Status</label>
                        <select
                          value={newTenancy.status}
                          onChange={(e) => setNewTenancy({ ...newTenancy, status: e.target.value as any })}
                          className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                        >
                          <option value="active">Active</option>
                          <option value="on_notice">On Notice</option>
                          <option value="available">Available</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-xs">Rent (£pcm)</label>
                      <input
                        type="number"
                        placeholder="0"
                        value={newTenancy.rent_amount}
                        onChange={(e) => setNewTenancy({ ...newTenancy, rent_amount: Number(e.target.value) })}
                        className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                      />
                    </div>
                  </div>
                </div>

                {/* Step 4: Communication Preference */}
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-md">4. Communication Preference</h3>
                  <div className="flex gap-md">
                    <label className="flex items-center gap-sm">
                      <input
                        type="radio"
                        name="communication"
                        value="email"
                        checked={newTenancy.communication_preference === 'email'}
                        onChange={(e) =>
                          setNewTenancy({ ...newTenancy, communication_preference: e.target.value as any })
                        }
                      />
                      <span className="text-sm">📧 Email</span>
                    </label>
                    <label className="flex items-center gap-sm">
                      <input
                        type="radio"
                        name="communication"
                        value="text"
                        checked={newTenancy.communication_preference === 'text'}
                        onChange={(e) =>
                          setNewTenancy({ ...newTenancy, communication_preference: e.target.value as any })
                        }
                      />
                      <span className="text-sm">💬 Text</span>
                    </label>
                  </div>
                </div>

                {/* Step 5: Opt-in Preferences */}
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-md">5. Notification Opt-ins</h3>
                  <div className="space-y-sm">
                    <label className="flex items-center gap-sm">
                      <input
                        type="checkbox"
                        checked={newTenancy.opt_in_maintenance}
                        onChange={(e) =>
                          setNewTenancy({ ...newTenancy, opt_in_maintenance: e.target.checked })
                        }
                      />
                      <span className="text-sm">🔧 Maintenance updates</span>
                    </label>
                    <label className="flex items-center gap-sm">
                      <input
                        type="checkbox"
                        checked={newTenancy.opt_in_viewings}
                        onChange={(e) => setNewTenancy({ ...newTenancy, opt_in_viewings: e.target.checked })}
                      />
                      <span className="text-sm">👁️ Viewing notifications</span>
                    </label>
                    <label className="flex items-center gap-sm">
                      <input
                        type="checkbox"
                        checked={newTenancy.opt_in_appointments}
                        onChange={(e) =>
                          setNewTenancy({ ...newTenancy, opt_in_appointments: e.target.checked })
                        }
                      />
                      <span className="text-sm">📅 Appointment notifications</span>
                    </label>
                    <label className="flex items-center gap-sm">
                      <input
                        type="checkbox"
                        checked={newTenancy.opt_in_cleaning}
                        onChange={(e) => setNewTenancy({ ...newTenancy, opt_in_cleaning: e.target.checked })}
                      />
                      <span className="text-sm">🧹 Cleaning updates</span>
                    </label>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-sm pt-md">
                  <button
                    onClick={handleAddTenancy}
                    className="flex-1 rounded-xl bg-neutral-900 py-md font-bold text-white hover:bg-neutral-800"
                  >
                    Create Tenancy
                  </button>
                  <button
                    onClick={() => setShowAddTenancy(false)}
                    className="flex-1 rounded-xl border border-neutral-300 py-md font-semibold hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tenancies List */}
        <div className="space-y-md">
          {tenancies.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
              <p className="text-sm text-neutral-500">No tenancies yet</p>
            </div>
          ) : (
            tenancies.map((tenancy) => (
              <div key={tenancy.id} className="rounded-2xl border border-neutral-200 bg-white p-lg">
                <div className="flex items-start justify-between gap-md">
                  <div className="flex-1">
                    <p className="font-semibold text-neutral-900">
                      {tenancy.people?.full_name || 'Unknown tenant'}
                      {tenancy.rooms?.name ? ` • ${tenancy.rooms.name}` : ''}
                    </p>
                    <p className="text-sm text-neutral-600 mt-xs">
                      {tenancy.properties?.name ?? 'Property'}
                      {tenancy.properties?.address ? ` — ${tenancy.properties.address}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-sm mt-md text-xs text-neutral-600">
                      <span
                        className={`px-sm py-xs rounded font-semibold ${
                          tenancy.end_date ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {tenancy.end_date ? '📋 On notice' : '🏠 Active'}
                      </span>
                      <span className="px-sm py-xs bg-neutral-100 rounded">
                        📅 Moved in {new Date(tenancy.start_date).toLocaleDateString('en-GB')}
                      </span>
                      {tenancy.end_date && (
                        <span className="px-sm py-xs bg-amber-100 text-amber-800 rounded font-semibold">
                          🚚 Available from {new Date(tenancy.end_date).toLocaleDateString('en-GB')}
                        </span>
                      )}
                      {tenancy.rent_amount != null && (
                        <span className="px-sm py-xs bg-neutral-100 rounded">
                          £{tenancy.rent_amount}/month
                        </span>
                      )}
                      {tenancy.communication_preference && (
                        <span className="px-sm py-xs bg-neutral-100 rounded">
                          {tenancy.communication_preference === 'email' ? '📧' : '💬'}{' '}
                          {tenancy.communication_preference}
                        </span>
                      )}
                    </div>
                    <div className="mt-md text-xs text-neutral-600">
                      <p className="font-medium mb-xs">Notification preferences:</p>
                      <p>
                        {[
                          tenancy.opt_in_maintenance && '🔧 Maintenance',
                          tenancy.opt_in_viewings && '👁️ Viewings',
                          tenancy.opt_in_appointments && '📅 Appointments',
                          tenancy.opt_in_cleaning && '🧹 Cleaning',
                        ]
                          .filter(Boolean)
                          .join(' • ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-stretch gap-sm">
                    {tenancy.end_date ? (
                      <button
                        onClick={() => handleCancelNotice(tenancy.id)}
                        className="rounded border border-neutral-400 px-md py-sm text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
                      >
                        Clear move-out date
                      </button>
                    ) : (
                      <button
                        onClick={() => openNotice(tenancy)}
                        className="rounded bg-neutral-900 px-md py-sm text-sm font-semibold text-white hover:bg-neutral-800"
                      >
                        Set move-out date
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteTenancy(tenancy.id)}
                      className="text-xs text-neutral-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Put on notice dialog */}
        {noticeTenancy && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-lg">
            <div className="w-full max-w-md rounded-3xl bg-white p-lg">
              <h2 className="text-xl font-bold text-neutral-900">Set move-out date</h2>
              <p className="mt-xs text-sm text-neutral-600">
                {(noticeTenancy as any).people?.full_name}
                {(noticeTenancy as any).rooms?.name ? ` · ${(noticeTenancy as any).rooms.name}` : ''}
                {(noticeTenancy as any).properties?.name ? ` · ${(noticeTenancy as any).properties.name}` : ''}
              </p>
              <p className="mt-md text-sm text-neutral-600">
                Once set, this room is marked as leaving and lettings markets it as
                available from this date.
              </p>
              <label className="mt-lg block text-sm font-medium text-neutral-700">Move-out date</label>
              <input
                type="date"
                value={noticeDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setNoticeDate(e.target.value)}
                className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-md text-base"
              />
              <div className="mt-lg flex gap-sm">
                <button
                  onClick={handleSetNotice}
                  disabled={savingNotice || !noticeDate}
                  className="flex-1 rounded-xl bg-neutral-900 py-md font-bold text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {savingNotice ? 'Saving…' : 'Set move-out date'}
                </button>
                <button
                  onClick={() => setNoticeTenancy(null)}
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
