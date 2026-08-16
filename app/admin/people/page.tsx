'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import AppBar from '@/components/AppBar';

interface Person {
  id: string;
  email: string;
  full_name?: string;
  role: string;
  property_id?: string;
  room_id?: string;
  created_at: string;
}

interface Property {
  id: string;
  name: string;
  address: string;
  rooms: { id: string; name: string; tenants: Person[] }[];
}

interface OrganizedPeople {
  contractors: Person[];
  cleaners: Person[];
  properties: Property[];
  landlords: Person[];
  administrators: Person[];
}

/** Small live indicator for whether a person has push notifications enabled. */
function NotifyBadge({ on }: { on: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-sm py-xs text-[11px] font-semibold ${
        on ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-400'
      }`}
      title={on ? 'Notifications on' : 'Notifications off'}
    >
      {on ? '🔔 On' : '🔕 Off'}
    </span>
  );
}

function RoleSection({
  title,
  people,
  onDelete,
  getRoleColor,
  notifyOn,
}: {
  title: string;
  people: Person[];
  onDelete: (id: string) => void;
  getRoleColor: (role: string) => string;
  notifyOn: Set<string>;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
      <div className="border-b border-neutral-200 bg-neutral-50 px-lg py-md">
        <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
      </div>

      <div className="divide-y divide-neutral-200">
        {people.map((person) => (
          <div key={person.id} className="flex items-center justify-between gap-md px-lg py-md hover:bg-neutral-50">
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900">{person.full_name || person.email}</p>
              <p className="text-xs text-neutral-500">{person.full_name ? person.email : `Added ${new Date(person.created_at).toLocaleDateString()}`}</p>
            </div>
            <div className="flex shrink-0 items-center gap-md">
              <NotifyBadge on={notifyOn.has(person.id)} />
              <button
                onClick={() => onDelete(person.id)}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PeopleManagement() {
  const [people, setPeople] = useState<Person[]>([]);
  const [organized, setOrganized] = useState<OrganizedPeople>({
    contractors: [],
    cleaners: [],
    properties: [],
    landlords: [],
    administrators: [],
  });
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ email: '', role: 'tenant', property_id: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'organized'>('organized');
  // Set of person ids that have at least one push subscription registered.
  const [notifyOn, setNotifyOn] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchPeople();
  }, []);

  async function fetchPeople() {
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from('people')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) throw err;

      // Real property/room names for the grouped view (not truncated UUIDs).
      const { data: props } = await supabase.from('properties').select('id, name, address');
      const { data: rms } = await supabase.from('rooms').select('id, name, property_id');
      const propMap = Object.fromEntries((props || []).map((p) => [p.id, p]));
      const roomMap = Object.fromEntries((rms || []).map((r) => [r.id, r]));

      // Who has push notifications turned on (any device registered).
      const { data: subs } = await supabase.from('push_subscriptions').select('person_id, email');
      const on = new Set<string>();
      const byEmail = new Map<string, string>((data || []).map((p: any) => [p.email, p.id]));
      (subs || []).forEach((s: any) => {
        if (s.person_id) on.add(s.person_id);
        else if (s.email && byEmail.has(s.email)) on.add(byEmail.get(s.email)!);
      });
      setNotifyOn(on);

      setPeople(data || []);
      organizeByRole(data || [], propMap, roomMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load people');
    } finally {
      setLoading(false);
    }
  }

  function organizeByRole(
    peopleList: Person[],
    propMapLookup: Record<string, any> = {},
    roomMapLookup: Record<string, any> = {}
  ) {
    const org: OrganizedPeople = {
      contractors: [],
      cleaners: [],
      properties: [],
      landlords: [],
      administrators: [],
    };

    // Separate by role
    const contractors: Person[] = [];
    const cleaners: Person[] = [];
    const tenants: Person[] = [];
    const landlords: Person[] = [];
    const administrators: Person[] = [];

    peopleList.forEach((person) => {
      switch (person.role) {
        case 'contractor':
          contractors.push(person);
          break;
        case 'cleaner':
          cleaners.push(person);
          break;
        case 'tenant':
          tenants.push(person);
          break;
        case 'landlord':
          landlords.push(person);
          break;
        case 'administrator':
          administrators.push(person);
          break;
      }
    });

    org.contractors = contractors;
    org.cleaners = cleaners;
    org.landlords = landlords;
    org.administrators = administrators;

    // Organize tenants by property, then by room (real names, room-number order)
    const propMap: Record<string, Property> = {};
    tenants.forEach((person) => {
      const propId = person.property_id || 'unassigned';
      const propName =
        propId === 'unassigned'
          ? 'Unassigned Tenants'
          : propMapLookup[propId]?.name || 'Property';

      if (!propMap[propId]) {
        propMap[propId] = {
          id: propId,
          name: propName,
          address: propId === 'unassigned' ? 'No property assigned' : propMapLookup[propId]?.address || '',
          rooms: [],
        };
      }

      const roomId = person.room_id || 'common';
      const roomName =
        roomId === 'common' ? 'Common area' : roomMapLookup[roomId]?.name || 'Room';

      const roomIndex = propMap[propId].rooms.findIndex((r) => r.id === roomId);
      if (roomIndex === -1) {
        propMap[propId].rooms.push({ id: roomId, name: roomName, tenants: [person] });
      } else {
        propMap[propId].rooms[roomIndex].tenants.push(person);
      }
    });

    // Sort rooms within each property by their number (Room 1, Room 2, …).
    const roomNum = (name: string) => {
      const m = name.match(/\d+/);
      return m ? parseInt(m[0], 10) : 9999;
    };
    Object.values(propMap).forEach((p) =>
      p.rooms.sort((a, b) => roomNum(a.name) - roomNum(b.name) || a.name.localeCompare(b.name))
    );

    org.properties = Object.values(propMap).sort((a, b) => a.name.localeCompare(b.name));
    setOrganized(org);
  }

  async function handleAddPerson(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.email || !formData.role) {
      setError('Email and role are required');
      return;
    }

    try {
      const supabase = createClient();
      const { error: err } = await supabase.from('people').insert([
        {
          email: formData.email,
          role: formData.role,
          property_id: formData.property_id || null,
        },
      ]);

      if (err) throw err;

      setSuccess(`User ${formData.email} added successfully`);
      setFormData({ email: '', role: 'tenant', property_id: '' });
      setShowForm(false);
      fetchPeople();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add user');
    }
  }

  async function handleDeletePerson(id: string) {
    if (!confirm('Are you sure you want to delete this person?')) return;

    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from('people')
        .delete()
        .eq('id', id);

      if (err) throw err;

      setSuccess('User deleted successfully');
      fetchPeople();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  }

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      administrator: 'bg-blue-50 text-blue-900 border-blue-200',
      tenant: 'bg-green-50 text-green-900 border-green-200',
      contractor: 'bg-purple-50 text-purple-900 border-purple-200',
      cleaner: 'bg-yellow-50 text-yellow-900 border-yellow-200',
      landlord: 'bg-red-50 text-red-900 border-red-200',
    };
    return colors[role] || 'bg-gray-50 text-gray-900 border-gray-200';
  };

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar right={<Link href="/admin" className="min-w-0 truncate font-semibold text-white hover:text-white/80">Dashboard</Link>} />

      <main className="p-lg">
        <h1 className="mb-lg text-2xl font-bold text-neutral-900">People Management</h1>
        {error && (
          <div className="mb-md rounded-xl border border-red-200 bg-red-50 p-md text-sm text-red-900">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-md rounded-xl border border-green-200 bg-green-50 p-md text-sm text-green-900">
            {success}
          </div>
        )}

        <div className="mb-lg flex flex-wrap gap-md">
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="rounded-xl bg-blue-600 px-md py-sm text-sm font-medium text-white hover:bg-blue-700"
            >
              + Add Person
            </button>
          )}

          <div className="flex gap-sm">
            <button
              onClick={() => setViewMode('table')}
              className={`rounded-xl px-md py-sm text-sm font-medium transition-colors ${
                viewMode === 'table'
                  ? 'bg-neutral-200 text-neutral-900'
                  : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              Table View
            </button>
            <button
              onClick={() => setViewMode('organized')}
              className={`rounded-xl px-md py-sm text-sm font-medium transition-colors ${
                viewMode === 'organized'
                  ? 'bg-neutral-200 text-neutral-900'
                  : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              Organized View
            </button>
          </div>
        </div>

        {showForm && (
          <div className="mb-xl rounded-2xl border border-neutral-200 bg-white p-lg">
            <h2 className="mb-md text-lg font-semibold text-neutral-900">Add New Person</h2>
            <form onSubmit={handleAddPerson} className="space-y-md">
              <div>
                <label className="block text-sm font-medium text-neutral-700">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-sm text-sm placeholder-neutral-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="user@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-sm text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="tenant">Tenant</option>
                  <option value="contractor">Contractor</option>
                  <option value="cleaner">Cleaner</option>
                  <option value="landlord">Landlord</option>
                  <option value="administrator">Administrator</option>
                </select>
              </div>

              <div className="flex gap-md">
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-md py-sm text-sm font-medium text-white hover:bg-blue-700"
                >
                  Add Person
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-xl border border-neutral-300 px-md py-sm text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center text-neutral-600">Loading people...</div>
        ) : viewMode === 'table' ? (
          // Table View
          people.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-xl text-center text-neutral-600">
              No people found
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50">
                  <tr>
                    <th className="px-md py-md text-left font-semibold text-neutral-900">Email</th>
                    <th className="px-md py-md text-left font-semibold text-neutral-900">Role</th>
                    <th className="px-md py-md text-left font-semibold text-neutral-900">Created</th>
                    <th className="px-md py-md text-left font-semibold text-neutral-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((person) => (
                    <tr key={person.id} className="border-t border-neutral-200 hover:bg-neutral-50">
                      <td className="px-md py-md text-neutral-900">{person.email}</td>
                      <td className="px-md py-md">
                        <span
                          className={`inline-block rounded-full border px-sm py-xs text-xs font-medium capitalize ${getRoleColor(
                            person.role
                          )}`}
                        >
                          {person.role}
                        </span>
                      </td>
                      <td className="px-md py-md text-neutral-600">
                        {new Date(person.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-md py-md">
                        <button
                          onClick={() => handleDeletePerson(person.id)}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          // Organized View by Role
          <div className="space-y-xl">
            {/* Contractors */}
            {organized.contractors.length > 0 && (
              <RoleSection
                title="Contractors"
                people={organized.contractors}
                onDelete={handleDeletePerson}
                getRoleColor={getRoleColor}
                notifyOn={notifyOn}
              />
            )}

            {/* Cleaners */}
            {organized.cleaners.length > 0 && (
              <RoleSection
                title="Cleaners"
                people={organized.cleaners}
                onDelete={handleDeletePerson}
                getRoleColor={getRoleColor}
                notifyOn={notifyOn}
              />
            )}

            {/* Tenants Organized by Property */}
            {organized.properties.length > 0 && (
              <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
                <div className="border-b border-neutral-200 bg-neutral-50 px-lg py-md">
                  <h2 className="text-lg font-semibold text-neutral-900">TENANTS</h2>
                </div>

                <div className="divide-y divide-neutral-200">
                  {organized.properties.map((property) => (
                    <div key={property.id} className="px-lg py-md">
                      <h3 className="mb-md font-medium text-neutral-900">{property.name}</h3>
                      <div className="ml-md space-y-md">
                        {property.rooms.map((room) => (
                          <div key={room.id}>
                            <h4 className="mb-sm text-sm font-medium text-neutral-700">{room.name}</h4>
                            <div className="ml-md space-y-sm">
                              {room.tenants.length === 0 ? (
                                <p className="text-xs text-neutral-500 italic">No tenants</p>
                              ) : (
                                room.tenants.map((person) => (
                                  <div
                                    key={person.id}
                                    className="flex items-center justify-between gap-md rounded-xl bg-neutral-50 px-md py-sm"
                                  >
                                    <p className="min-w-0 truncate text-sm text-neutral-900">{person.full_name || person.email}</p>
                                    <div className="flex shrink-0 items-center gap-md">
                                      <NotifyBadge on={notifyOn.has(person.id)} />
                                      <button
                                        onClick={() => handleDeletePerson(person.id)}
                                        className="text-xs text-red-600 hover:text-red-700"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Landlords */}
            {organized.landlords.length > 0 && (
              <RoleSection
                title="Landlords"
                people={organized.landlords}
                onDelete={handleDeletePerson}
                getRoleColor={getRoleColor}
                notifyOn={notifyOn}
              />
            )}

            {/* Administrators */}
            {organized.administrators.length > 0 && (
              <RoleSection
                title="Administrators"
                people={organized.administrators}
                onDelete={handleDeletePerson}
                getRoleColor={getRoleColor}
                notifyOn={notifyOn}
              />
            )}

            {people.length === 0 && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-xl text-center text-neutral-600">
                No users found
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
