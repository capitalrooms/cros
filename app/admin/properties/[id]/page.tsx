'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'

type TabType = 'units' | 'property' | 'people' | 'maintenance' | 'lettings' | 'communications' | 'compliance' | 'documents'

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
    { id: 'compliance', label: 'Compliance', icon: '✅' },
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

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        {/* Page Header with Title and Back Link */}
        <div className="mb-2xl flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 flex items-center gap-md">
              🏢 {property.address}
            </h1>
          </div>
          <Link
            href="/admin/properties"
            className="text-sm font-semibold text-neutral-600 hover:text-neutral-900 underline transition"
          >
            ← Back to properties
          </Link>
        </div>

        {/* Property Header - Two Equal Columns */}
        <div className="mb-3xl grid grid-cols-1 md:grid-cols-2 gap-0 rounded-xl border border-neutral-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
          {/* Left Column: Property Info Card */}
          <div className="bg-white p-lg">
            <div className="grid grid-cols-2 gap-xl">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm">Address</p>
                <p className="text-sm font-semibold text-neutral-900 leading-snug">{property.address}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm">Structure</p>
                <p className="text-sm font-semibold text-neutral-900">{property.property_type || 'House'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm">Landlord</p>
                <Link href={`/admin/people/${property.landlord_id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-900 underline">
                  {property.landlord_name || '—'}
                </Link>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm">Contact</p>
                <p className="text-sm font-semibold text-neutral-900">{property.landlord_email || property.landlord_phone || '—'}</p>
              </div>
            </div>
          </div>

          {/* Right Column: Featured Photo */}
          <div className="bg-neutral-100 flex items-center justify-center min-h-[280px]">
            <div className="text-center">
              <div className="text-6xl mb-md opacity-50">📷</div>
              <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Featured photo</p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-0 flex gap-0 border-b border-neutral-200 overflow-x-auto bg-white rounded-t-xl">
          {tabs.map((tab, idx) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-lg py-md whitespace-nowrap font-semibold text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-neutral-900 text-neutral-900 bg-white'
                  : 'border-b-2 border-transparent text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
              } ${idx > 0 ? 'border-l border-l-neutral-100' : ''}`}
            >
              <span className="mr-xs">{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="rounded-b-xl border border-t-0 border-neutral-200 bg-white p-lg shadow-sm">
          {/* Units Tab */}
          {activeTab === 'units' && (
            <div className="space-y-xl">
              <div>
                <h2 className="text-xl font-semibold text-neutral-900 mb-sm">Property Units</h2>
                <p className="text-sm text-neutral-600">View and manage individual rooms and units</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-xl text-center transition hover:bg-neutral-100">
                <p className="text-sm text-neutral-600">Units management coming soon</p>
              </div>
            </div>
          )}

          {/* Property Tab */}
          {activeTab === 'property' && (
            <div className="space-y-3xl">
              {/* Property Details */}
              <div>
                <h3 className="text-sm font-bold uppercase text-neutral-600 mb-lg pb-lg border-b border-neutral-100">
                  Property Details
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-lg">
                  <div className="space-y-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Type</p>
                    <p className="text-sm font-semibold text-neutral-900">
                      {property.bedrooms > 1 ? 'HMO' : 'Single Let'}
                    </p>
                  </div>
                  <div className="space-y-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Bedrooms</p>
                    <p className="text-sm font-semibold text-neutral-900">{property.bedrooms}</p>
                  </div>
                  <div className="space-y-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Bathrooms</p>
                    <p className="text-sm font-semibold text-neutral-900">{property.bathrooms}</p>
                  </div>
                  <div className="space-y-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Total Area</p>
                    <p className="text-sm font-semibold text-neutral-900">—</p>
                  </div>
                </div>
              </div>

              {/* Floor Plans & Room Dimensions */}
              <div>
                <h3 className="text-sm font-bold uppercase text-neutral-600 mb-lg pb-lg border-b border-neutral-100">
                  Floor Plans & Room Dimensions
                </h3>
                <div className="rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 p-2xl text-center transition hover:border-neutral-400 hover:bg-neutral-100">
                  <div className="text-3xl mb-md opacity-60">📄</div>
                  <p className="text-sm font-semibold text-neutral-900 mb-xs">Drop floor plan here or click to upload</p>
                  <p className="text-xs text-neutral-500">PDF or JPEG • Max 10MB</p>
                </div>
              </div>

              {/* Property Photos */}
              <div>
                <h3 className="text-sm font-bold uppercase text-neutral-600 mb-lg pb-lg border-b border-neutral-100">
                  Property Photos (Communal & Exterior)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
                  <div className="bg-neutral-100 rounded-lg aspect-square flex items-center justify-center text-xs text-neutral-600 font-medium transition hover:bg-neutral-200">
                    Shared lounge
                  </div>
                  <div className="bg-neutral-100 rounded-lg aspect-square flex items-center justify-center text-xs text-neutral-600 font-medium transition hover:bg-neutral-200">
                    Kitchen
                  </div>
                  <div className="bg-neutral-100 rounded-lg aspect-square flex items-center justify-center text-xs text-neutral-600 font-medium transition hover:bg-neutral-200">
                    Hallway
                  </div>
                  <div className="border-2 border-dashed border-neutral-300 rounded-lg aspect-square flex items-center justify-center text-2xl cursor-pointer transition hover:bg-neutral-50 hover:border-neutral-400">
                    +
                  </div>
                </div>
              </div>

              {/* HMO Licensing & Compliance */}
              <div>
                <h3 className="text-sm font-bold uppercase text-neutral-600 mb-lg pb-lg border-b border-neutral-100">
                  HMO Licensing & Compliance
                </h3>
                {property.hmo_licensed ? (
                  <div className="space-y-md">
                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg hover:border-neutral-300 transition">
                      <div className="flex justify-between items-start mb-sm">
                        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">License Number</span>
                        <span className="text-sm font-semibold text-neutral-900 text-right">{property.license_number || '—'}</span>
                      </div>
                      <div className="flex justify-between items-start pt-md border-t border-neutral-200">
                        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">License Expiry</span>
                        <span className="text-sm font-semibold text-neutral-900 text-right">
                          {property.license_expiry ? new Date(property.license_expiry).toLocaleDateString('en-GB') : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg hover:border-neutral-300 transition">
                      <div className="space-y-md">
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Gas Safety Certificate</span>
                          <p className="text-sm font-semibold text-neutral-900 mt-xs">
                            {property.gas_safe_cert_expiry ? new Date(property.gas_safe_cert_expiry).toLocaleDateString('en-GB') : '—'}
                          </p>
                        </div>
                        <div className="pt-md border-t border-neutral-200">
                          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Electrical Inspection (EICR)</span>
                          <p className="text-sm font-semibold text-neutral-900 mt-xs">
                            {property.electrical_cert_expiry ? new Date(property.electrical_cert_expiry).toLocaleDateString('en-GB') : '—'}
                          </p>
                        </div>
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
            <div className="space-y-xl">
              <div>
                <h2 className="text-xl font-semibold text-neutral-900 mb-sm">People</h2>
                <p className="text-sm text-neutral-600">Tenants, staff, contractors, and landlords</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-xl text-center transition hover:bg-neutral-100">
                <p className="text-sm text-neutral-600">People management coming soon</p>
              </div>
            </div>
          )}

          {/* Maintenance Tab */}
          {activeTab === 'maintenance' && (
            <div className="space-y-xl">
              <div>
                <h2 className="text-xl font-semibold text-neutral-900 mb-sm">Maintenance Jobs</h2>
                <p className="text-sm text-neutral-600">All maintenance tickets for this property</p>
              </div>
              {tickets.length === 0 ? (
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-xl text-center transition hover:bg-neutral-100">
                  <p className="text-sm text-neutral-600">No maintenance jobs</p>
                </div>
              ) : (
                <div className="space-y-md">
                  {tickets.map((ticket) => (
                    <div key={ticket.id} className="rounded-lg border border-neutral-200 p-lg hover:border-neutral-300 hover:shadow-sm transition">
                      <div className="flex items-start justify-between gap-lg mb-md">
                        <div className="flex-1">
                          <p className="font-semibold text-neutral-900">{ticket.title}</p>
                          <p className="text-xs text-neutral-500 mt-xs uppercase tracking-wider">{ticket.category}</p>
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
            <div className="space-y-xl">
              <div>
                <h2 className="text-xl font-semibold text-neutral-900 mb-sm">Lettings</h2>
                <p className="text-sm text-neutral-600">Available units and viewing bookings</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-xl text-center transition hover:bg-neutral-100">
                <p className="text-sm text-neutral-600">Lettings management coming soon</p>
              </div>
            </div>
          )}

          {/* Communications Tab */}
          {activeTab === 'communications' && (
            <div className="space-y-xl">
              <div>
                <h2 className="text-xl font-semibold text-neutral-900 mb-sm">Communications</h2>
                <p className="text-sm text-neutral-600">Messages and notifications history</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-xl text-center transition hover:bg-neutral-100">
                <p className="text-sm text-neutral-600">Communications history coming soon</p>
              </div>
            </div>
          )}

          {/* Compliance Tab */}
          {activeTab === 'compliance' && (
            <div className="space-y-3xl">
              <div>
                <h2 className="text-xl font-semibold text-neutral-900 mb-sm">Compliance & Certifications</h2>
                <p className="text-sm text-neutral-600">Annual testing, licenses, and safety certificates</p>
              </div>

              {/* HMO License */}
              {(property.hmo_licensed || (property.rooms?.length || 0) > 1) && (
                <div>
                  <h3 className="text-sm font-bold uppercase text-neutral-600 mb-lg pb-lg border-b border-neutral-100">
                    HMO License
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg">
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm">License Number</p>
                      <p className="text-sm font-semibold text-neutral-900">{property.license_number || '—'}</p>
                    </div>
                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg">
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm">License Expiry</p>
                      <p className="text-sm font-semibold text-neutral-900">
                        {property.license_expiry ? new Date(property.license_expiry).toLocaleDateString('en-GB') : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Annual Testing & Compliance */}
              <div>
                <h3 className="text-sm font-bold uppercase text-neutral-600 mb-lg pb-lg border-b border-neutral-100">
                  Annual Testing & Certificates
                </h3>
                <div className="space-y-md">
                  {[
                    { label: 'Gas Safety Certificate (CP12)', expiryKey: 'gas_safe_cert_expiry' },
                    { label: 'EICR (Electrical Inspection)', expiryKey: 'electrical_cert_expiry' },
                    { label: 'PAT (Portable Appliance Testing)', expiryKey: 'pat_test_expiry' },
                    { label: 'Fire Detection / Alarm', expiryKey: 'fire_detection_expiry' },
                    { label: 'Emergency Lighting', expiryKey: 'emergency_lighting_expiry' },
                    { label: 'Fire Risk Assessment', expiryKey: 'fire_risk_assessment_expiry' },
                  ].map(({ label, expiryKey }) => {
                    const expiryDate = (property as any)[expiryKey];
                    const isExpired = expiryDate && new Date(expiryDate) < new Date();
                    return (
                      <div key={expiryKey} className={`rounded-lg border p-lg transition ${
                        isExpired
                          ? 'border-red-200 bg-red-50'
                          : 'border-neutral-200 bg-white'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-neutral-900">{label}</span>
                          <span className={`text-xs font-semibold px-md py-sm rounded-full ${
                            isExpired
                              ? 'bg-red-100 text-red-700'
                              : expiryDate ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-600'
                          }`}>
                            {expiryDate ? new Date(expiryDate).toLocaleDateString('en-GB') : 'Not set'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Insurance */}
              <div>
                <h3 className="text-sm font-bold uppercase text-neutral-600 mb-lg pb-lg border-b border-neutral-100">
                  Insurance
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm">Provider</p>
                    <p className="text-sm font-semibold text-neutral-900">{property.insurance_provider || '—'}</p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm">Policy Number</p>
                    <p className="text-sm font-semibold text-neutral-900">{property.insurance_policy_number || '—'}</p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg md:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm">Expiry Date</p>
                    <p className="text-sm font-semibold text-neutral-900">
                      {property.insurance_expiry ? new Date(property.insurance_expiry).toLocaleDateString('en-GB') : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <div className="space-y-xl">
              <div>
                <h2 className="text-xl font-semibold text-neutral-900 mb-sm">Documents</h2>
                <p className="text-sm text-neutral-600">Certificates, contracts, and property files</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-xl text-center transition hover:bg-neutral-100">
                <p className="text-sm text-neutral-600">Document management coming soon</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
