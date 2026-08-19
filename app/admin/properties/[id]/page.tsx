'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'

type TabType = 'units' | 'property' | 'people' | 'maintenance' | 'lettings' | 'communications' | 'documents'

interface Ticket {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  location: string | null;
  booked_date: string | null;
  booked_slot: string | null;
  created_at: string;
  contractor_id?: string;
  rooms: { name: string } | null;
}

export default function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [property, setProperty] = useState<any>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('property');

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin') {
        router.push('/login');
        return;
      }

      const supabase = createClient();

      // Get property
      const { data: prop } = await supabase
        .from('properties')
        .select('*')
        .eq('id', id)
        .single();

      setProperty(prop);

      // Get maintenance jobs for this property
      const { data: jobs } = await supabase
        .from('maintenance_tickets')
        .select('*, rooms(name)')
        .eq('property_id', id)
        .order('created_at', { ascending: false });

      setTickets(jobs || []);
      setLoading(false);
    }
    init();
  }, [id, router]);

  if (loading) return <GenericPageSkeleton />;

  if (!property) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar
          right={
            <Link href="/admin/properties" className="shrink-0 hover:opacity-80">
              ← Properties
            </Link>
          }
        />
        <p className="p-xl text-sm text-neutral-600">Property not found</p>
      </div>
    );
  }

  const tabs: Array<{ id: TabType; label: string; icon: string }> = [
    { id: 'units', label: 'Units', icon: '📋' },
    { id: 'property', label: 'Property', icon: '🏢' },
    { id: 'people', label: 'People', icon: '👥' },
    { id: 'maintenance', label: 'Maintenance', icon: '🔧' },
    { id: 'lettings', label: 'Lettings', icon: '🔑' },
    { id: 'communications', label: 'Communications', icon: '💬' },
    { id: 'documents', label: 'Documents', icon: '📁' },
  ]

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        right={
          <div className="flex items-center gap-md">
            <Link href="/admin/properties" className="shrink-0 hover:opacity-80">
              Properties
            </Link>
          </div>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        {/* Property Header - Two Equal Squares */}
        <div className="mb-3xl grid grid-cols-1 md:grid-cols-2 gap-0 rounded-lg border border-neutral-200 bg-white overflow-hidden">
          {/* Left Square: Property Info */}
          <div className="p-lg grid grid-cols-2 gap-lg">
            <div>
              <p className="text-xs font-semibold uppercase text-neutral-500 mb-md">Address</p>
              <p className="text-sm font-semibold text-neutral-900">{property.address}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-neutral-500 mb-md">Type</p>
              <p className="text-sm font-semibold text-neutral-900">
                {property.hmo_licensed ? 'HMO' : 'Single Let'} • {property.bedrooms} bed
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-neutral-500 mb-md">Occupancy</p>
              <p className="text-sm font-semibold text-neutral-900">{property.occupied_by_tenants}/{property.bedrooms}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-neutral-500 mb-md">Status</p>
              <p className="text-sm font-semibold text-neutral-900">✓ Active</p>
            </div>
          </div>

          {/* Right Square: Featured Photo Placeholder */}
          <div className="bg-neutral-200 flex items-center justify-center min-h-[200px]">
            <div className="text-center">
              <div className="text-4xl mb-md">📷</div>
              <p className="text-sm text-neutral-600">Featured photo</p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-lg flex gap-md border-b border-neutral-200 overflow-x-auto bg-white rounded-t-lg">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-lg py-md whitespace-nowrap font-semibold text-sm border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="rounded-b-lg border border-t-0 border-neutral-200 bg-white p-lg">
          {/* Units Tab */}
          {activeTab === 'units' && (
            <div className="space-y-lg">
              <div>
                <h2 className="text-lg font-bold text-neutral-900 mb-md">Property Units</h2>
                <p className="text-sm text-neutral-600">View and manage individual rooms and units</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg text-center">
                <p className="text-sm text-neutral-600">Units management coming soon</p>
              </div>
            </div>
          )}

          {/* Property Tab */}
          {activeTab === 'property' && (
            <div className="space-y-2xl">
              {/* Property Details */}
              <div>
                <h3 className="text-sm font-bold uppercase text-neutral-500 mb-lg pb-md border-b border-neutral-200">
                  Property Details
                </h3>
                <div className="grid grid-cols-2 gap-lg">
                  <div>
                    <p className="text-xs font-semibold uppercase text-neutral-500 mb-sm">Type</p>
                    <p className="text-sm font-semibold text-neutral-900">
                      {property.hmo_licensed ? 'HMO (Houses in Multiple Occupation)' : 'Single Let Property'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-neutral-500 mb-sm">Bedrooms</p>
                    <p className="text-sm font-semibold text-neutral-900">{property.bedrooms}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-neutral-500 mb-sm">Bathrooms</p>
                    <p className="text-sm font-semibold text-neutral-900">{property.bathrooms}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-neutral-500 mb-sm">Total Area</p>
                    <p className="text-sm font-semibold text-neutral-900">— m²</p>
                  </div>
                </div>
              </div>

              {/* Floor Plans & Room Dimensions */}
              <div>
                <h3 className="text-sm font-bold uppercase text-neutral-500 mb-lg pb-md border-b border-neutral-200">
                  Floor Plans & Room Dimensions
                </h3>
                <div className="rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 p-lg text-center">
                  <div className="text-2xl mb-md">📄</div>
                  <p className="text-sm font-semibold text-neutral-900">Drop floor plan here or click to upload</p>
                  <p className="text-xs text-neutral-500 mt-sm">PDF or JPEG • Max 10MB</p>
                </div>
              </div>

              {/* Property Photos */}
              <div>
                <h3 className="text-sm font-bold uppercase text-neutral-500 mb-lg pb-md border-b border-neutral-200">
                  Property Photos (Communal & Exterior)
                </h3>
                <div className="grid grid-cols-4 gap-md">
                  <div className="bg-neutral-200 rounded-lg aspect-square flex items-center justify-center text-xs text-neutral-600">
                    Shared lounge
                  </div>
                  <div className="bg-neutral-200 rounded-lg aspect-square flex items-center justify-center text-xs text-neutral-600">
                    Kitchen
                  </div>
                  <div className="bg-neutral-200 rounded-lg aspect-square flex items-center justify-center text-xs text-neutral-600">
                    Hallway
                  </div>
                  <div className="border-2 border-dashed border-neutral-300 rounded-lg aspect-square flex items-center justify-center text-2xl cursor-pointer hover:bg-neutral-50">
                    +
                  </div>
                </div>
              </div>

              {/* HMO Licensing & Compliance */}
              <div>
                <h3 className="text-sm font-bold uppercase text-neutral-500 mb-lg pb-md border-b border-neutral-200">
                  HMO Licensing & Compliance
                </h3>
                {property.hmo_licensed ? (
                  <div className="space-y-md">
                    <div className="rounded-lg border border-neutral-200 p-lg">
                      <div className="flex justify-between mb-sm">
                        <span className="text-xs font-semibold uppercase text-neutral-500">License Number</span>
                        <span className="text-sm font-semibold text-neutral-900">{property.license_number || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold uppercase text-neutral-500">License Expiry</span>
                        <span className="text-sm font-semibold text-neutral-900">
                          {property.license_expiry ? new Date(property.license_expiry).toLocaleDateString('en-GB') : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-lg border border-neutral-200 p-lg">
                      <div className="flex justify-between mb-sm">
                        <span className="text-xs font-semibold uppercase text-neutral-500">Gas Safety Certificate</span>
                        <span className="text-sm font-semibold text-neutral-900">
                          {property.gas_safe_cert_expiry ? new Date(property.gas_safe_cert_expiry).toLocaleDateString('en-GB') : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold uppercase text-neutral-500">Electrical Inspection (EICR)</span>
                        <span className="text-sm font-semibold text-neutral-900">
                          {property.electrical_cert_expiry ? new Date(property.electrical_cert_expiry).toLocaleDateString('en-GB') : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-600">This property is not an HMO</p>
                )}
              </div>
            </div>
          )}

          {/* People Tab */}
          {activeTab === 'people' && (
            <div className="space-y-lg">
              <div>
                <h2 className="text-lg font-bold text-neutral-900 mb-md">People</h2>
                <p className="text-sm text-neutral-600">Tenants, staff, contractors, and landlords</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg text-center">
                <p className="text-sm text-neutral-600">People management coming soon</p>
              </div>
            </div>
          )}

          {/* Maintenance Tab */}
          {activeTab === 'maintenance' && (
            <div className="space-y-lg">
              <div>
                <h2 className="text-lg font-bold text-neutral-900 mb-md">Maintenance Jobs</h2>
                <p className="text-sm text-neutral-600">All maintenance tickets for this property</p>
              </div>
              {tickets.length === 0 ? (
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg text-center">
                  <p className="text-sm text-neutral-600">No maintenance jobs</p>
                </div>
              ) : (
                <div className="space-y-md">
                  {tickets.map((ticket) => (
                    <div key={ticket.id} className="rounded-lg border border-neutral-200 p-lg hover:border-neutral-300">
                      <div className="flex items-start justify-between mb-md">
                        <div>
                          <p className="font-semibold text-neutral-900">{ticket.title}</p>
                          <p className="text-xs text-neutral-500 mt-xs">{ticket.category}</p>
                        </div>
                        <span
                          className={`text-xs font-semibold px-md py-sm rounded-full whitespace-nowrap ${
                            ticket.priority === 'high'
                              ? 'bg-red-100 text-red-700'
                              : ticket.priority === 'medium'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {ticket.priority}
                        </span>
                      </div>
                      {ticket.booked_date && (
                        <p className="text-xs text-neutral-600">
                          📅 {new Date(ticket.booked_date).toLocaleDateString('en-GB')}
                          {ticket.booked_slot && ` • ${ticket.booked_slot}`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Lettings Tab */}
          {activeTab === 'lettings' && (
            <div className="space-y-lg">
              <div>
                <h2 className="text-lg font-bold text-neutral-900 mb-md">Lettings</h2>
                <p className="text-sm text-neutral-600">Available units and viewing bookings</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg text-center">
                <p className="text-sm text-neutral-600">Lettings management coming soon</p>
              </div>
            </div>
          )}

          {/* Communications Tab */}
          {activeTab === 'communications' && (
            <div className="space-y-lg">
              <div>
                <h2 className="text-lg font-bold text-neutral-900 mb-md">Communications</h2>
                <p className="text-sm text-neutral-600">Messages and notifications history</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg text-center">
                <p className="text-sm text-neutral-600">Communications history coming soon</p>
              </div>
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <div className="space-y-lg">
              <div>
                <h2 className="text-lg font-bold text-neutral-900 mb-md">Documents</h2>
                <p className="text-sm text-neutral-600">Certificates, contracts, and property files</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg text-center">
                <p className="text-sm text-neutral-600">Document management coming soon</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
