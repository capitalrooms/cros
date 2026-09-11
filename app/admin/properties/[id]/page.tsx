'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter, useSearchParams } from 'next/navigation'
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
import PurchasesTab from './components/PurchasesTab'
import PhotosTab from './components/PhotosTab'
import PropertyTabComponent from './components/PropertyTab'
import HousematesTab from './components/HousematesTab'
import ExtendedDetailsTab from './components/ExtendedDetailsTab'
import FinancialsTab from './components/FinancialsTab'
import TasksTab from './components/TasksTab'
import BackButton from '@/app/components/BackButton'

type TabType = 'details' | 'units' | 'people' | 'maintenance' | 'lettings' | 'compliance' | 'documents'

// Sub-tab types for merged tabs
type PeopleSubTab = 'tenants' | 'housemates'
type MaintenanceSubTab = 'jobs' | 'purchases' | 'tasks'
type ComplianceSubTab = 'compliance' | 'communications'
type DocumentsSubTab = 'documents' | 'photos' | 'financials'

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
  const searchParams = useSearchParams();
  const { id } = use(params);
  const [property, setProperty] = useState<any>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  // Backwards-compat: old URL ?tab=property → details, old sub-tabs → their merged parent
  const rawTab = searchParams.get('tab') || 'details'
  const legacyMap: Record<string, TabType> = {
    property: 'details', extended: 'details',
    housemates: 'people',
    purchases: 'maintenance', tasks: 'maintenance',
    communications: 'compliance',
    photos: 'documents', financials: 'documents',
  }
  const initialTab: TabType = (legacyMap[rawTab] as TabType) || (rawTab as TabType) || 'details'
  const initialRoomId = searchParams.get('room') || undefined;
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [peopleSubTab, setPeopleSubTab] = useState<PeopleSubTab>('tenants')
  const [maintenanceSubTab, setMaintenanceSubTab] = useState<MaintenanceSubTab>('jobs')
  const [complianceSubTab, setComplianceSubTab] = useState<ComplianceSubTab>('compliance')
  const [documentsSubTab, setDocumentsSubTab] = useState<DocumentsSubTab>('documents')
  const [showQuickNotify, setShowQuickNotify] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [editingPostcode, setEditingPostcode] = useState(false);
  const [nameValue, setNameValue] = useState(property?.name || '');
  const [addressValue, setAddressValue] = useState(property?.address || '');
  const [postcodeValue, setPostcodeValue] = useState(property?.postcode || '');
  const [savingName, setSavingName] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [savingPostcode, setSavingPostcode] = useState(false);

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

      // Resolve landlord name from people table (properties only stores landlord_id FK)
      if (prop?.landlord_id) {
        const { data: landlordPerson } = await supabase
          .from('people')
          .select('full_name, first_name, last_name')
          .eq('id', prop.landlord_id)
          .single();
        if (landlordPerson && prop) {
          (prop as any).landlord_name =
            landlordPerson.full_name ||
            [landlordPerson.first_name, landlordPerson.last_name].filter(Boolean).join(' ') ||
            null;
        }
      }

      setProperty(prop);
      setNameValue(prop?.name || '');
      setAddressValue(prop?.address || '');
      setPostcodeValue(prop?.postcode || '');

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

  async function handleSaveName() {
    setSavingName(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('properties')
      .update({ name: nameValue })
      .eq('id', id);

    if (!error) {
      setProperty({ ...property, name: nameValue });
      setEditingName(false);
    }
    setSavingName(false);
  }

  async function handleSaveAddress() {
    setSavingAddress(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('properties')
      .update({ address: addressValue })
      .eq('id', id);

    if (!error) {
      setProperty({ ...property, address: addressValue });
      setEditingAddress(false);
    }
    setSavingAddress(false);
  }

  async function handleSavePostcode() {
    setSavingPostcode(true);
    const supabase = createClient();
    const cleaned = postcodeValue.replace(/\s+/g, '').toUpperCase();
    const { error } = await supabase
      .from('properties')
      .update({ postcode: cleaned || null })
      .eq('id', id);

    if (!error) {
      setProperty({ ...property, postcode: cleaned || null });
      setPostcodeValue(cleaned);
      setEditingPostcode(false);
    }
    setSavingPostcode(false);
  }

  const [codeValue, setCodeValue] = useState('');
  const [savingCode, setSavingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  async function handleSaveCode() {
    const code = codeValue.trim().toUpperCase();
    if (!code) return;
    setSavingCode(true);
    setCodeError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from('properties')
      .update({ property_code: code })
      .eq('id', id);
    if (error) {
      setCodeError(error.message.includes('duplicate') ? 'That code is already in use.' : 'Could not save the code.');
    } else {
      setProperty({ ...property, property_code: code });
      setCodeValue('');
    }
    setSavingCode(false);
  }

  if (loading) return <GenericPageSkeleton />;

  if (!property) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin/properties" />} />
        <p className="p-xl text-sm text-neutral-600">Property not found</p>
      </div>
    );
  }

  const tabs: Array<{ id: TabType; label: string; icon: string }> = [
    { id: 'details',     label: 'Details',     icon: '🏠' },
    { id: 'units',       label: 'Units',       icon: '🛏️' },
    { id: 'people',      label: 'People',      icon: '👥' },
    { id: 'maintenance', label: 'Maintenance', icon: '🔧' },
    { id: 'lettings',    label: 'Lettings',    icon: '🔑' },
    { id: 'compliance',  label: 'Compliance',  icon: '✅' },
    { id: 'documents',   label: 'Documents',   icon: '📁' },
  ]

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        left={<BackButton href="/admin/properties" />}
        right={
          <button
            onClick={() => setShowQuickNotify(true)}
            className="px-md py-md md:px-lg font-semibold text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition border border-blue-500 whitespace-nowrap shrink-0"
          >
            <span className="hidden md:inline">📢 Quick Notify</span>
            <span className="md:hidden">📢</span>
          </button>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        {/* Page Header with Title and Back Link */}
        <div className="mb-2xl flex items-center justify-between">
          <div className="flex-1">
            <div className="space-y-sm">
              {/* Property Name */}
              <div className="flex items-center gap-md group">
                <h1 className="text-3xl font-bold text-neutral-900">
                  🏠 {editingName ? (
                    <input
                      type="text"
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      className="inline px-md py-sm border border-neutral-300 rounded text-xl"
                      autoFocus
                    />
                  ) : (property.name || '—')}
                </h1>
                <button
                  onClick={() => editingName ? handleSaveName() : setEditingName(true)}
                  className="opacity-0 group-hover:opacity-100 transition text-neutral-500 hover:text-neutral-900 p-sm"
                  title={editingName ? "Save name" : "Edit property name"}
                >
                  {editingName ? '✓' : '✏️'}
                </button>
                {editingName && (
                  <button
                    onClick={() => {
                      setEditingName(false);
                      setNameValue(property.name || '');
                    }}
                    className="text-neutral-400 hover:text-neutral-600 text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {/* Property Address */}
              <div className="flex items-center gap-md group">
                <p className="text-lg text-neutral-600">
                  {editingAddress ? (
                    <input
                      type="text"
                      value={addressValue}
                      onChange={(e) => setAddressValue(e.target.value)}
                      className="inline px-md py-sm border border-neutral-300 rounded"
                      autoFocus
                    />
                  ) : property.address}
                </p>
                <button
                  onClick={() => editingAddress ? handleSaveAddress() : setEditingAddress(true)}
                  className="opacity-0 group-hover:opacity-100 transition text-neutral-500 hover:text-neutral-900 p-sm"
                  title={editingAddress ? "Save address" : "Edit property address"}
                >
                  {editingAddress ? '✓' : '✏️'}
                </button>
                {editingAddress && (
                  <button
                    onClick={() => {
                      setEditingAddress(false);
                      setAddressValue(property.address || '');
                    }}
                    className="text-neutral-400 hover:text-neutral-600 text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {/* Postcode */}
              <div className="flex items-center gap-md group">
                <span className="text-sm text-neutral-400 font-mono">
                  {editingPostcode ? (
                    <input
                      type="text"
                      value={postcodeValue}
                      onChange={(e) => setPostcodeValue(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && handleSavePostcode()}
                      maxLength={8}
                      placeholder="e.g. SW1A 2AA"
                      className="w-32 px-sm py-xs border border-neutral-300 rounded font-mono text-sm uppercase"
                      autoFocus
                    />
                  ) : (
                    <span className={property.postcode ? 'text-neutral-500' : 'text-amber-500 italic'}>
                      {property.postcode || 'No postcode set'}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => editingPostcode ? handleSavePostcode() : setEditingPostcode(true)}
                  disabled={savingPostcode}
                  className="opacity-0 group-hover:opacity-100 transition text-neutral-500 hover:text-neutral-900 p-sm text-xs"
                  title={editingPostcode ? "Save postcode" : "Edit postcode"}
                >
                  {savingPostcode ? '…' : editingPostcode ? '✓' : '✏️'}
                </button>
                {editingPostcode && (
                  <button
                    onClick={() => {
                      setEditingPostcode(false);
                      setPostcodeValue(property.postcode || '');
                    }}
                    className="text-neutral-400 hover:text-neutral-600 text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Property Header - Two Equal Columns */}
        <div className="mb-xl grid grid-cols-1 md:grid-cols-2 gap-0 rounded-xl border border-neutral-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
          {/* Left Column: Property Info Card */}
          <div className="bg-neutral-900 p-lg">
            <div className="grid grid-cols-2 gap-xl">
              <div className="col-span-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Property Code</p>
                {property.property_code ? (
                  <p className="text-sm font-semibold text-white">{property.property_code}</p>
                ) : (
                  <>
                    <div className="flex items-center gap-sm">
                      <input
                        value={codeValue}
                        onChange={(e) => setCodeValue(e.target.value.toUpperCase())}
                        placeholder="e.g. 071ALR"
                        maxLength={10}
                        className="w-28 rounded border border-neutral-600 bg-neutral-800 px-sm py-xs text-sm font-mono uppercase text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleSaveCode}
                        disabled={savingCode || !codeValue.trim()}
                        className="rounded bg-blue-600 px-md py-xs text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {savingCode ? 'Saving…' : 'Set'}
                      </button>
                    </div>
                    <p className="text-xs text-neutral-500 mt-xs">
                      {codeError || 'Set once — becomes the immutable property code.'}
                    </p>
                  </>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Address</p>
                <p className="text-sm font-semibold text-white leading-snug">{property.address}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Type</p>
                <p className="text-sm font-semibold text-white">
                  {property.property_type === 'hmo'
                    ? 'HMO'
                    : property.property_type === 'single' || property.property_type === 'single_let'
                    ? 'Single Let'
                    : property.property_type
                    ? property.property_type.charAt(0).toUpperCase() + property.property_type.slice(1)
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Landlord</p>
                <p className="text-sm font-semibold text-white">
                  {property.landlord_name || '—'}
                </p>
                {property.cc_emails && (
                  <p className="text-xs text-neutral-400 mt-xs">CC: {property.cc_emails}</p>
                )}
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
            <p className="text-xs text-neutral-400 mt-sm uppercase tracking-wider font-semibold">Total Rent</p>
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
        </div>

        {/* Tab Content */}
        <div className="rounded-b-xl border border-t-0 border-neutral-200 bg-white shadow-sm">

          {/* ── Details (Property Info + Extended) ───────────────────────── */}
          {activeTab === 'details' && (
            <div className="p-lg space-y-2xl">
              <PropertyTabComponent property={property} onUpdate={(updates) => setProperty((p: any) => ({ ...p, ...updates }))} />
              <div className="border-t border-neutral-200 pt-2xl">
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-lg">Extended Details</p>
                <ExtendedDetailsTab propertyId={id} propertyType={property.property_type} />
              </div>
            </div>
          )}

          {/* ── Units ────────────────────────────────────────────────────── */}
          {activeTab === 'units' && (
            <div className="p-lg">
              <UnitsTab propertyId={id} bedrooms={property.bedrooms} initialRoomId={initialRoomId} propertyName={property.name} propertyAddress={property.address} />
            </div>
          )}

          {/* ── People (Tenants + Housemates) ────────────────────────────── */}
          {activeTab === 'people' && (
            <div>
              <div className="flex gap-xs px-lg pt-lg pb-0 border-b border-neutral-100">
                {([['tenants', '👥 Tenants'], ['housemates', '🙋 Housemates']] as [PeopleSubTab, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setPeopleSubTab(key)}
                    className={`px-md py-sm rounded-t-lg text-sm font-semibold transition-colors border-b-2 ${
                      peopleSubTab === key
                        ? 'text-neutral-900 border-neutral-900'
                        : 'text-neutral-400 border-transparent hover:text-neutral-600'
                    }`}
                  >{label}</button>
                ))}
              </div>
              <div className="p-lg">
                {peopleSubTab === 'tenants' && <PeopleTab propertyId={id} />}
                {peopleSubTab === 'housemates' && <HousematesTab propertyId={id} />}
              </div>
            </div>
          )}

          {/* ── Maintenance (Jobs + Purchases + Tasks) ───────────────────── */}
          {activeTab === 'maintenance' && (
            <div>
              <div className="flex gap-xs px-lg pt-lg pb-0 border-b border-neutral-100">
                {([['jobs', '🔧 Jobs'], ['purchases', '🛒 Purchases'], ['tasks', '📋 Tasks']] as [MaintenanceSubTab, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setMaintenanceSubTab(key)}
                    className={`px-md py-sm rounded-t-lg text-sm font-semibold transition-colors border-b-2 ${
                      maintenanceSubTab === key
                        ? 'text-neutral-900 border-neutral-900'
                        : 'text-neutral-400 border-transparent hover:text-neutral-600'
                    }`}
                  >{label}</button>
                ))}
              </div>
              <div className="p-lg">
                {maintenanceSubTab === 'jobs' && <MaintenanceTab propertyId={id} tickets={tickets} />}
                {maintenanceSubTab === 'purchases' && <PurchasesTab propertyId={id} />}
                {maintenanceSubTab === 'tasks' && <TasksTab propertyId={id} />}
              </div>
            </div>
          )}

          {/* ── Lettings ─────────────────────────────────────────────────── */}
          {activeTab === 'lettings' && (
            <div className="p-lg">
              <LettingsTab propertyId={id} rooms={property.rooms || []} propertyName={property.name} propertyAddress={property.address} />
            </div>
          )}

          {/* ── Compliance (Compliance + Communications) ─────────────────── */}
          {activeTab === 'compliance' && (
            <div>
              <div className="flex gap-xs px-lg pt-lg pb-0 border-b border-neutral-100">
                {([['compliance', '✅ Compliance'], ['communications', '💬 Communications']] as [ComplianceSubTab, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setComplianceSubTab(key)}
                    className={`px-md py-sm rounded-t-lg text-sm font-semibold transition-colors border-b-2 ${
                      complianceSubTab === key
                        ? 'text-neutral-900 border-neutral-900'
                        : 'text-neutral-400 border-transparent hover:text-neutral-600'
                    }`}
                  >{label}</button>
                ))}
              </div>
              <div className="p-lg">
                {complianceSubTab === 'compliance' && <ComplianceTab property={property} />}
                {complianceSubTab === 'communications' && <CommunicationsTab propertyId={id} />}
              </div>
            </div>
          )}

          {/* ── Documents (Documents + Photos + Financials) ──────────────── */}
          {activeTab === 'documents' && (
            <div>
              <div className="flex gap-xs px-lg pt-lg pb-0 border-b border-neutral-100">
                {([['documents', '📁 Documents'], ['photos', '📷 Photos'], ['financials', '💷 Financials']] as [DocumentsSubTab, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setDocumentsSubTab(key)}
                    className={`px-md py-sm rounded-t-lg text-sm font-semibold transition-colors border-b-2 ${
                      documentsSubTab === key
                        ? 'text-neutral-900 border-neutral-900'
                        : 'text-neutral-400 border-transparent hover:text-neutral-600'
                    }`}
                  >{label}</button>
                ))}
              </div>
              <div className="p-lg">
                {documentsSubTab === 'documents' && <DocumentsTab propertyId={id} />}
                {documentsSubTab === 'photos' && <PhotosTab propertyId={id} />}
                {documentsSubTab === 'financials' && <FinancialsTab propertyId={id} />}
              </div>
            </div>
          )}

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
