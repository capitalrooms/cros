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
import { blockAddress, inlineAddress } from '@/lib/formatAddress'
import HousematesTab from './components/HousematesTab'
import ExtendedDetailsTab from './components/ExtendedDetailsTab'
import FinancialsTab from './components/FinancialsTab'
import TasksTab from './components/TasksTab'
import BackButton from '@/app/components/BackButton'
import TenantAppTab from './components/TenantAppTab'
import { landlordFormalNames } from '@/lib/people'

type TabType = 'details' | 'units' | 'people' | 'maintenance' | 'lettings' | 'compliance' | 'documents' | 'tenant_app'

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
        .select('*, rooms(id)')
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
          .select('*')
          .eq('id', prop.landlord_id)
          .single();
        if (landlordPerson && prop) {
          (prop as any).landlord_name = landlordFormalNames(landlordPerson) || null;
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
        <AppBar left={<BackButton href="/admin/active-rooms" />} />
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
    { id: 'tenant_app',  label: 'Tenant App',  icon: '📱' },
  ]

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        left={<BackButton href="/admin/active-rooms" />}
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

      <main className="mx-auto max-w-6xl px-lg py-xl">

        {/* ── Compact property header ───────────────────────────────────── */}
        <div className="mb-lg rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
          <div className="flex items-stretch">

            {/* Featured photo — slim left strip when available */}
            {property.featured_photo?.file_path && (
              <div className="w-32 flex-shrink-0 overflow-hidden">
                <img
                  src={property.featured_photo.file_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${property.featured_photo.file_path?.startsWith('property-photos/') ? property.featured_photo.file_path : `property-photos/${property.featured_photo.file_path}`}`}
                  alt="Featured photo"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.parentElement!.style.display = 'none' }}
                />
              </div>
            )}

            {/* Main info */}
            <div className="flex-1 px-xl py-lg min-w-0">
              {/* Name row — inline edit on hover */}
              <div className="flex items-start justify-between gap-md mb-xs">
                <div className="flex items-center gap-sm group min-w-0">
                  {editingName ? (
                    <div className="flex items-center gap-sm">
                      <input
                        value={nameValue}
                        onChange={(e) => setNameValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                        className="px-sm py-xs border border-neutral-300 rounded text-xl font-bold"
                        autoFocus
                      />
                      <button onClick={handleSaveName} disabled={savingName} className="text-sm text-green-700 font-semibold">{savingName ? '…' : '✓ Save'}</button>
                      <button onClick={() => { setEditingName(false); setNameValue(property.name || '') }} className="text-sm text-neutral-400">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <h1 className="text-2xl font-bold text-neutral-900">🏠 {property.name || '—'}</h1>
                      <button onClick={() => setEditingName(true)} className="opacity-0 group-hover:opacity-100 transition text-neutral-400 hover:text-neutral-700 text-xs">✏️</button>
                    </>
                  )}
                </div>
                {/* Metadata chips */}
                <div className="flex items-center gap-sm flex-shrink-0 flex-wrap justify-end">
                  {property.property_code && (
                    <span className="text-xs font-mono font-semibold bg-neutral-100 text-neutral-600 px-sm py-xs rounded">{property.property_code}</span>
                  )}
                  {property.property_type && (
                    <span className="text-xs font-semibold bg-neutral-900 text-white px-sm py-xs rounded">
                      {property.property_type === 'hmo' ? 'HMO' : property.property_type === 'single' || property.property_type === 'single_let' ? 'Single Let' : property.property_type}
                    </span>
                  )}
                  {property.letting_type === 'let_only' && (
                    <span className="text-xs font-semibold bg-purple-100 text-purple-800 px-sm py-xs rounded">🔑 Let only</span>
                  )}
                </div>
              </div>

              {/* Address row — inline edit on hover */}
              <div className="flex items-center gap-sm group mb-sm">
                {editingAddress ? (
                  <div className="flex items-center gap-sm w-full">
                    <input
                      value={addressValue}
                      onChange={(e) => setAddressValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveAddress()}
                      className="flex-1 px-sm py-xs border border-neutral-300 rounded text-sm"
                      autoFocus
                    />
                    <button onClick={handleSaveAddress} disabled={savingAddress} className="text-sm text-green-700 font-semibold whitespace-nowrap">{savingAddress ? '…' : '✓ Save'}</button>
                    <button onClick={() => { setEditingAddress(false); setAddressValue(property.address || '') }} className="text-sm text-neutral-400">Cancel</button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-neutral-500">{inlineAddress(property.address)}</p>
                    <button onClick={() => setEditingAddress(true)} className="opacity-0 group-hover:opacity-100 transition text-neutral-400 hover:text-neutral-700 text-xs">✏️</button>
                  </>
                )}
              </div>

              {/* Meta row: landlord · rooms · maintenance · postcode edit */}
              <div className="flex items-center gap-xl flex-wrap">
                {property.landlord_name && (
                  <span className="text-xs text-neutral-500">Landlord: <strong className="text-neutral-700">{property.landlord_name}</strong></span>
                )}
                <span className="text-xs text-neutral-500"><strong className="text-neutral-700">{property.rooms?.length || property.bedrooms || 0}</strong> rooms</span>
                {tickets.length > 0 && (
                  <span className="text-xs text-neutral-500"><strong className="text-amber-700">{tickets.length}</strong> maintenance</span>
                )}
                {/* Postcode — hidden inline edit only, not displayed (already in address) */}
                {!property.postcode && (
                  <div className="flex items-center gap-xs group">
                    <span className="text-xs text-amber-600 italic">No postcode set for lat/lng lookup</span>
                    {editingPostcode ? (
                      <div className="flex items-center gap-xs">
                        <input
                          value={postcodeValue}
                          onChange={(e) => setPostcodeValue(e.target.value.toUpperCase())}
                          onKeyDown={(e) => e.key === 'Enter' && handleSavePostcode()}
                          maxLength={8} placeholder="SW1A 2AA"
                          className="w-24 px-xs py-0.5 border border-neutral-300 rounded font-mono text-xs uppercase"
                          autoFocus
                        />
                        <button onClick={handleSavePostcode} disabled={savingPostcode} className="text-xs text-green-700 font-semibold">{savingPostcode ? '…' : '✓'}</button>
                        <button onClick={() => { setEditingPostcode(false); setPostcodeValue(property.postcode || '') }} className="text-xs text-neutral-400">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setEditingPostcode(true)} className="opacity-0 group-hover:opacity-100 text-xs text-neutral-400 hover:text-neutral-600 transition">Set postcode →</button>
                    )}
                  </div>
                )}
                {!property.property_code && (
                  <div className="flex items-center gap-xs">
                    <input
                      value={codeValue}
                      onChange={(e) => setCodeValue(e.target.value.toUpperCase())}
                      placeholder="Set property code"
                      maxLength={10}
                      className="w-32 rounded border border-neutral-300 px-xs py-0.5 text-xs font-mono uppercase"
                    />
                    <button
                      onClick={handleSaveCode}
                      disabled={savingCode || !codeValue.trim()}
                      className="rounded bg-neutral-900 px-sm py-0.5 text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
                    >
                      {savingCode ? '…' : 'Set code'}
                    </button>
                    {codeError && <span className="text-xs text-red-600">{codeError}</span>}
                  </div>
                )}
              </div>
            </div>
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
              <UnitsTab propertyId={id} bedrooms={property.bedrooms} initialRoomId={initialRoomId} propertyName={property.name} propertyAddress={property.address} propertyCode={property.property_code} />
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
                <Link href={`/admin/properties/${id}/send-documents`}
                  className="ml-auto mb-xs self-center rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white hover:bg-neutral-700">
                  ✉️ Send certificates to tenants
                </Link>
              </div>
              <div className="p-lg">
                {documentsSubTab === 'documents' && <DocumentsTab propertyId={id} propertyName={property.name} />}
                {documentsSubTab === 'photos' && <PhotosTab propertyId={id} />}
                {documentsSubTab === 'financials' && <FinancialsTab propertyId={id} />}
              </div>
            </div>
          )}

          {/* ── Tenant App ───────────────────────────────────────────────── */}
          {activeTab === 'tenant_app' && (
            <div className="p-lg">
              <TenantAppTab propertyId={id} property={property} onUpdate={(updates: any) => setProperty((p: any) => ({ ...p, ...updates }))} />
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
