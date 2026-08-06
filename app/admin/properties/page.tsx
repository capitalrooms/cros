'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import AppBar from '@/components/AppBar';
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading';

interface Tenant {
  id: string;
  full_name: string | null;
  email: string;
}

interface Room {
  id: string;
  name: string;
  status: 'occupied' | 'available' | 'on_notice';
  current_asking_rent?: number;
  previous_rent?: number;
  tenant?: Tenant;
}

interface Property {
  id: string;
  name: string;
  address: string;
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
  fire_detection_test_date?: string;
  emergency_lighting_test_date?: string;
  pat_test_date?: string;
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

  const [newProperty, setNewProperty] = useState({
    name: '',
    address: '',
    bedrooms: 0,
    bathrooms: 0,
  });

  const [newRoom, setNewRoom] = useState({
    name: '',
    status: 'available' as 'occupied' | 'available' | 'on_notice',
  });

  const [propertyEdits, setPropertyEdits] = useState<Partial<Property>>({});

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'administrator') {
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
        `id,name,property_id,status,current_asking_rent,previous_rent,
        tenancies(person_id, people(id,full_name,email))`
      );

    // Build rooms with tenant info
    const roomsWithTenants = (roomsData || []).map((room: any) => {
      const activeTenancy = room.tenancies?.find((t: any) => !t.end_date);
      return {
        id: room.id,
        name: room.name,
        status: room.status,
        current_asking_rent: room.current_asking_rent,
        previous_rent: room.previous_rent,
        tenant: activeTenancy?.people,
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

  const handleAddProperty = async () => {
    if (!newProperty.name || !newProperty.address) {
      alert('Please fill in property name and address');
      return;
    }

    try {
      const supabase = createClient();
      const { data: created, error } = await supabase
        .from('properties')
        .insert([newProperty])
        .select();

      if (error) throw error;

      if (created) {
        setProperties([...properties, { ...created[0], rooms: [] }]);
        setNewProperty({ name: '', address: '', bedrooms: 0, bathrooms: 0 });
        setShowAddProperty(false);
        alert('✅ Property added');
      }
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleUpdateProperty = async (propertyId: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('properties')
        .update(propertyEdits)
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
    if (!confirm('Delete property and ALL rooms?')) return;

    try {
      const supabase = createClient();
      const { error } = await supabase.from('properties').delete().eq('id', propertyId);

      if (error) throw error;

      setProperties(properties.filter((p) => p.id !== propertyId));
      alert('✅ Property deleted');
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  if (loading) return <GenericPageSkeleton />;

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar />

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

        {properties.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No properties yet</p>
          </div>
        ) : (
          <div className="space-y-lg">
            {properties.map((property) => (
              <div key={property.id} className="rounded-2xl border-2 border-neutral-200 bg-white overflow-hidden">
                {/* Property Header */}
                <div className="bg-neutral-950 text-white px-lg py-md">
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
                      </div>
                    </div>
                    <div className="flex gap-sm">
                      <button
                        onClick={() => {
                          if (editingProperty === property.id) {
                            setEditingProperty(null);
                            setPropertyEdits({});
                          } else {
                            setEditingProperty(property.id);
                            setPropertyEdits(property);
                          }
                        }}
                        className="shrink-0 px-md py-sm bg-neutral-700 text-white rounded font-semibold text-sm hover:bg-neutral-600"
                      >
                        {editingProperty === property.id ? 'Done' : 'Edit'}
                      </button>
                      <button
                        onClick={() => handleDeleteProperty(property.id)}
                        className="shrink-0 px-md py-sm bg-red-600 text-white rounded font-semibold text-sm hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>

                {/* Property Details Section (Editable when editingProperty) */}
                {editingProperty === property.id && (
                  <div className="px-lg py-md bg-neutral-50 border-b border-neutral-200 space-y-lg">
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

                    {/* Insurance */}
                    <div>
                      <h4 className="font-bold text-neutral-900 mb-md text-sm">🛡️ Insurance</h4>
                      <div className="grid grid-cols-2 gap-md">
                        <input
                          type="text"
                          placeholder="Provider"
                          value={propertyEdits.insurance_provider || ''}
                          onChange={(e) =>
                            setPropertyEdits({ ...propertyEdits, insurance_provider: e.target.value })
                          }
                          className="rounded border border-neutral-300 px-sm py-xs text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Policy Number"
                          value={propertyEdits.insurance_policy_number || ''}
                          onChange={(e) =>
                            setPropertyEdits({ ...propertyEdits, insurance_policy_number: e.target.value })
                          }
                          className="rounded border border-neutral-300 px-sm py-xs text-xs"
                        />
                        <input
                          type="date"
                          value={propertyEdits.insurance_expiry || ''}
                          onChange={(e) =>
                            setPropertyEdits({ ...propertyEdits, insurance_expiry: e.target.value })
                          }
                          className="col-span-2 rounded border border-neutral-300 px-sm py-xs text-xs"
                        />
                      </div>
                    </div>

                    {/* Annual Testing & Compliance (Entered ONCE for whole property) */}
                    <div>
                      <h4 className="font-bold text-neutral-900 mb-md text-sm">✅ Annual Testing & Compliance (Property-wide)</h4>
                      <p className="text-xs text-neutral-600 mb-md">Enter test dates once - applies to entire property, not per room</p>
                      <div className="grid grid-cols-2 gap-md">
                        <div>
                          <label className="block text-xs text-neutral-700 mb-xs">Gas Safety Cert</label>
                          <input
                            type="date"
                            value={propertyEdits.gas_safe_cert_date || ''}
                            onChange={(e) =>
                              setPropertyEdits({ ...propertyEdits, gas_safe_cert_date: e.target.value })
                            }
                            className="w-full rounded border border-neutral-300 px-sm py-xs text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-neutral-700 mb-xs">Expires</label>
                          <input
                            type="date"
                            value={propertyEdits.gas_safe_cert_expiry || ''}
                            onChange={(e) =>
                              setPropertyEdits({ ...propertyEdits, gas_safe_cert_expiry: e.target.value })
                            }
                            className="w-full rounded border border-neutral-300 px-sm py-xs text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-neutral-700 mb-xs">EICR (Electrical)</label>
                          <input
                            type="date"
                            value={propertyEdits.electrical_cert_date || ''}
                            onChange={(e) =>
                              setPropertyEdits({ ...propertyEdits, electrical_cert_date: e.target.value })
                            }
                            className="w-full rounded border border-neutral-300 px-sm py-xs text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-neutral-700 mb-xs">Expires</label>
                          <input
                            type="date"
                            value={propertyEdits.electrical_cert_expiry || ''}
                            onChange={(e) =>
                              setPropertyEdits({ ...propertyEdits, electrical_cert_expiry: e.target.value })
                            }
                            className="w-full rounded border border-neutral-300 px-sm py-xs text-xs"
                          />
                        </div>
                        <input
                          type="date"
                          placeholder="Fire Detection Test"
                          value={propertyEdits.fire_detection_test_date || ''}
                          onChange={(e) =>
                            setPropertyEdits({ ...propertyEdits, fire_detection_test_date: e.target.value })
                          }
                          className="rounded border border-neutral-300 px-sm py-xs text-xs"
                        />
                        <input
                          type="date"
                          placeholder="Emergency Lighting Test"
                          value={propertyEdits.emergency_lighting_test_date || ''}
                          onChange={(e) =>
                            setPropertyEdits({ ...propertyEdits, emergency_lighting_test_date: e.target.value })
                          }
                          className="rounded border border-neutral-300 px-sm py-xs text-xs"
                        />
                        <input
                          type="date"
                          placeholder="PAT Testing"
                          value={propertyEdits.pat_test_date || ''}
                          onChange={(e) =>
                            setPropertyEdits({ ...propertyEdits, pat_test_date: e.target.value })
                          }
                          className="rounded border border-neutral-300 px-sm py-xs text-xs"
                        />
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

                    <button
                      onClick={() => handleUpdateProperty(property.id)}
                      className="w-full rounded bg-neutral-900 px-lg py-md text-white font-bold hover:bg-neutral-800"
                    >
                      Save All Property Info
                    </button>
                  </div>
                )}

                {/* Rooms Section */}
                <div className="px-lg py-md">
                  <div className="flex items-center justify-between mb-md">
                    <button
                      onClick={() => setExpandedProperty(expandedProperty === property.id ? null : property.id)}
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
                    <div className="space-y-sm">
                      {!property.rooms || property.rooms.length === 0 ? (
                        <p className="text-sm text-neutral-500 italic">No rooms</p>
                      ) : (
                        property.rooms.map((room) => (
                          <div key={room.id} className="rounded-lg border border-neutral-300 p-md bg-white">
                            <div className="flex items-start justify-between gap-md">
                              <div className="flex-1">
                                <p className="font-semibold text-neutral-900">{room.name}</p>
                                <div className="mt-xs flex gap-md text-xs text-neutral-600">
                                  <span className="px-sm py-xs bg-neutral-100 rounded">
                                    {room.status}
                                  </span>
                                  {room.current_asking_rent && (
                                    <span>
                                      £{room.current_asking_rent}/week
                                    </span>
                                  )}
                                </div>
                                {room.tenant && (
                                  <p className="mt-md text-sm text-neutral-700">
                                    <span className="font-semibold">Tenant:</span> {room.tenant.full_name || room.tenant.email}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => handleDeleteRoom(property.id, room.id)}
                                className="shrink-0 px-md py-sm text-red-600 hover:bg-red-50 rounded font-semibold text-sm"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))
                      )}

                      {/* Add Room Form */}
                      {showAddRoom === property.id && (
                        <div className="rounded-lg border-2 border-neutral-300 p-md bg-neutral-50">
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
                              <option value="occupied">Occupied</option>
                              <option value="available">Available</option>
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
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Property Modal */}
        {showAddProperty && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="rounded-3xl bg-white p-lg max-w-md w-full mx-lg">
              <h2 className="text-xl font-bold text-neutral-900 mb-lg">Add Property</h2>
              <div className="space-y-md">
                <input
                  type="text"
                  placeholder="Property name"
                  value={newProperty.name}
                  onChange={(e) => setNewProperty({ ...newProperty, name: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                />
                <input
                  type="text"
                  placeholder="Address"
                  value={newProperty.address}
                  onChange={(e) => setNewProperty({ ...newProperty, address: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                />
                <div className="grid grid-cols-2 gap-md">
                  <input
                    type="number"
                    placeholder="Bedrooms"
                    value={newProperty.bedrooms}
                    onChange={(e) => setNewProperty({ ...newProperty, bedrooms: Number(e.target.value) })}
                    className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                  />
                  <input
                    type="number"
                    placeholder="Bathrooms"
                    value={newProperty.bathrooms}
                    onChange={(e) => setNewProperty({ ...newProperty, bathrooms: Number(e.target.value) })}
                    className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                  />
                </div>
                <div className="flex gap-sm pt-md">
                  <button
                    onClick={handleAddProperty}
                    className="flex-1 rounded-xl bg-neutral-900 py-md font-bold text-white"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowAddProperty(false)}
                    className="flex-1 rounded-xl border border-neutral-300 py-md font-semibold"
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
