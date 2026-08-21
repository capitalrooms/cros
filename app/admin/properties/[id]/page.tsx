'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import QuickNotifyModal from '@/app/admin/components/QuickNotifyModal'
import UnitsTab from './components/UnitsTab'
import PeopleTab from './components/PeopleTab'
import MaintenanceTab from './components/MaintenanceTab'
import LettingsTab from './components/LettingsTab'
import ComplianceTab from './components/ComplianceTab'
import CommunicationsTab from './components/CommunicationsTab'
import DocumentsTab from './components/DocumentsTab'
import PropertyTabComponent from './components/PropertyTab'

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
  const [showQuickNotify, setShowQuickNotify] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingAddress, setEditingAddress] = useState(property?.address || '');
  const [savingAddress, setSavingAddress] = useState(false);

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

      // Get featured photo if exists
      let featuredPhoto = null;
      if (prop?.featured_photo_id) {
        const { data: photo, error: photoError } = await supabase
          .from('property_photos')
          .select('file_path, file_url')
          .eq('id', prop.featured_photo_id)
          .single();
        if (photoError) {
          console.error('Error fetching featured photo:', photoError);
        }
        featuredPhoto = photo;
        console.log('Featured photo data:', { featuredPhotoId: prop.featured_photo_id, photo, error: photoError });
      }

      // Add featured_photo to property object
      if (prop) {
        (prop as any).featured_photo = featuredPhoto;
      }

      setProperty(prop);
      setEditingAddress(prop?.address || '');

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

  async function handleSaveAddress() {
    setSavingAddress(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('properties')
      .update({ address: editingAddress })
      .eq('id', id);

    if (!error) {
      setProperty({ ...property, address: editingAddress });
      setEditingName(false);
    }
    setSavingAddress(false);
  }

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
    { id: 'property', label: 'Property Info', icon: '🏢' },
    { id: 'units', label: 'Tenancies', icon: '📋' },
    { id: 'lettings', label: 'Lettings', icon: '🔑' },
    { id: 'people', label: 'People', icon: '👥' },
    { id: 'maintenance', label: 'Maintenance', icon: '🔧' },
    { id: 'communications', label: 'Communications', icon: '💬' },
    { id: 'compliance', label: 'Compliance', icon: '✅' },
    { id: 'documents', label: 'Documents', icon: '📁' },
  ]

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        right={
          <div className="flex items-center gap-lg">
            <button
              onClick={() => setShowQuickNotify(true)}
              className="px-md py-md md:px-lg font-semibold text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition border border-blue-500 whitespace-nowrap shrink-0"
            >
              <span className="hidden md:inline">📢 Quick Notify</span>
              <span className="md:hidden">📢</span>
            </button>
            <Link href="/admin/properties" className="shrink-0 hover:opacity-80 text-white">
              Properties
            </Link>
          </div>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        {/* Page Header with Title and Back Link */}
        <div className="mb-2xl flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-md group">
              <h1 className="text-3xl font-bold text-neutral-900">
                🏢 {editingName ? (
                  <input
                    type="text"
                    value={editingAddress}
                    onChange={(e) => setEditingAddress(e.target.value)}
                    className="inline px-md py-sm border border-neutral-300 rounded text-xl"
                    autoFocus
                  />
                ) : property.address}
              </h1>
              <button
                onClick={() => editingName ? handleSaveAddress() : setEditingName(true)}
                className="opacity-0 group-hover:opacity-100 transition text-neutral-500 hover:text-neutral-900 p-sm"
                title={editingName ? "Save" : "Edit property name"}
              >
                {editingName ? '✓' : '✏️'}
              </button>
              {editingName && (
                <button
                  onClick={() => {
                    setEditingName(false);
                    setEditingAddress(property.address);
                  }}
                  className="text-neutral-400 hover:text-neutral-600 text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          <Link
            href="/admin/properties"
            className="text-sm font-semibold text-neutral-400 hover:text-white underline transition shrink-0"
          >
            ← Back to properties
          </Link>
        </div>

        {/* Property Header - Two Equal Columns */}
        <div className="mb-xl grid grid-cols-1 md:grid-cols-2 gap-0 rounded-xl border border-neutral-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
          {/* Left Column: Property Info Card */}
          <div className="bg-neutral-900 p-lg">
            <div className="grid grid-cols-2 gap-xl">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Address</p>
                <p className="text-sm font-semibold text-white leading-snug">{property.address}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Structure</p>
                <p className="text-sm font-semibold text-white capitalize">{property.property_type || 'House'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Landlord</p>
                <p className="text-sm font-semibold text-white">
                  {property.landlord_name || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Contact</p>
                <p className="text-sm font-semibold text-white">{property.landlord_email || property.landlord_phone || '—'}</p>
              </div>
            </div>
          </div>

          {/* Right Column: Featured Photo */}
          <div className="bg-neutral-900 flex items-center justify-center min-h-[280px] overflow-hidden">
            {property.featured_photo?.file_path ? (
              <img
                src={property.featured_photo.file_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${property.featured_photo.file_path?.startsWith('property-photos/') ? property.featured_photo.file_path : `property-photos/${property.featured_photo.file_path}`}`}
                alt="Featured photo"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <div className="text-center">
                <div className="text-6xl mb-md opacity-50">📷</div>
                <p className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">Featured photo</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Metrics Bar */}
        <div className="mb-2xl grid grid-cols-2 md:grid-cols-3 gap-md">
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-lg text-center">
            <p className="text-2xl font-bold text-white">{property.rooms?.length || property.bedrooms || 0}</p>
            <p className="text-xs text-neutral-400 mt-sm uppercase tracking-wider font-semibold">Rooms</p>
          </div>
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-lg text-center">
            <p className="text-2xl font-bold text-white">{tickets.length}</p>
            <p className="text-xs text-neutral-400 mt-sm uppercase tracking-wider font-semibold">Maintenance</p>
          </div>
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-lg text-center">
            <p className="text-2xl font-bold text-white">—</p>
            <p className="text-xs text-neutral-400 mt-sm uppercase tracking-wider font-semibold">Monthly Total</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-0 flex gap-0 border-b border-neutral-700 overflow-x-auto bg-neutral-900 rounded-t-xl relative">
          {tabs.map((tab, idx) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-lg py-md whitespace-nowrap font-semibold text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-white text-white bg-neutral-900'
                  : 'border-b-2 border-transparent text-neutral-400 hover:text-white hover:bg-neutral-900'
              } ${idx > 0 ? 'border-l border-l-neutral-800' : ''}`}
            >
              <span className="mr-xs">{tab.icon}</span> {tab.label}
            </button>
          ))}
          {/* Scroll Indicator */}
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-neutral-950 to-transparent pointer-events-none flex items-center justify-end pr-md">
            <span className="text-neutral-500 text-lg">›</span>
          </div>
        </div>

        {/* Tab Content */}
        <div className="rounded-b-xl border border-t-0 border-neutral-200 bg-white p-lg shadow-sm">
          {/* Units Tab */}
          {activeTab === 'units' && <UnitsTab propertyId={id} bedrooms={property.bedrooms} />}

          {/* Property Tab */}
          {activeTab === 'property' && <PropertyTabComponent property={property} />}

          {/* People Tab */}
          {activeTab === 'people' && <PeopleTab propertyId={id} />}

          {/* Maintenance Tab */}
          {activeTab === 'maintenance' && <MaintenanceTab propertyId={id} tickets={tickets} />}

          {/* Lettings Tab */}
          {activeTab === 'lettings' && (
            <LettingsTab propertyId={id} rooms={property.rooms || []} />
          )}

          {/* Communications Tab */}
          {activeTab === 'communications' && <CommunicationsTab propertyId={id} />}

          {/* Compliance Tab */}
          {activeTab === 'compliance' && <ComplianceTab property={property} />}

          {/* Documents Tab */}
          {activeTab === 'documents' && <DocumentsTab propertyId={id} />}
        </div>
      </main>

      {/* Quick Notify Modal */}
      {showQuickNotify && (
        <QuickNotifyModal
          propertyId={id}
          onClose={() => setShowQuickNotify(false)}
        />
      )}
    </div>
  );
}
