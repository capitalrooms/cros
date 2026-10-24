'use client'

import { useState, useEffect, use } from 'react'
import { isOfficeRole } from '@/lib/access/areas'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero, { HeroButton } from '@/components/PageHero'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import QuickNotifyModal from '@/app/admin/components/QuickNotifyModal'
import UnitsTab from './components/UnitsTab'
import RemoveProperty from './components/RemoveProperty'
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
import { PROPERTY_CERTIFICATES } from '@/lib/propertyCertificates'

const fullDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const addDaysIso = (n: number) => { const d = new Date(`${todayIso()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

type TabType = 'details' | 'units' | 'people' | 'maintenance' | 'lettings' | 'compliance' | 'documents' | 'tenant_app'

// Sub-tab types for merged tabs
type PeopleSubTab = 'tenants' | 'housemates' | 'messages'
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
  const rawTab = searchParams.get('tab') || 'units'   // opens on its rooms — where you go from All Units
  const legacyMap: Record<string, TabType> = {
    property: 'details', extended: 'details',
    housemates: 'people',
    purchases: 'maintenance', tasks: 'maintenance',
    communications: 'people',
    photos: 'documents', financials: 'documents',
  }
  const initialTab: TabType = (legacyMap[rawTab] as TabType) || (rawTab as TabType) || 'units'
  const initialRoomId = searchParams.get('room') || undefined;
  // an old link to "the house, Units tab, this room" now means the room's own page
  useEffect(() => { if (initialRoomId && (rawTab === 'units' || !searchParams.get('tab'))) router.replace(`/admin/properties/${id}/rooms/${initialRoomId}`) }, [initialRoomId])   // eslint-disable-line react-hooks/exhaustive-deps
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  // the header's figures: rooms let today, their rent, the next certificate to expire
  const [house, setHouse] = useState<{ rooms: number; let: number; rent: number; nextCert: { label: string; expiry: string } | null } | null>(null)
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
      if (!data || !isOfficeRole(data.assignment?.role)) {
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
      {
        const today = todayIso()
        const { data: ts } = await supabase.from('tenancies').select('room_id, start_date, end_date, rent_amount').eq('property_id', id).is('let_cancelled_at', null)
        const current = ((ts ?? []) as any[]).filter(t => t.start_date <= today && (!t.end_date || t.end_date >= today))
        const certs = PROPERTY_CERTIFICATES.map(([col, label]) => ({ label, expiry: (prop as any)?.[col] as string | null })).filter(c => !!c.expiry).sort((x, y) => x.expiry!.localeCompare(y.expiry!))
        setHouse({ rooms: (prop as any)?.rooms?.length ?? 0, let: new Set(current.map(t => t.room_id)).size, rent: current.reduce((n, t) => n + (Number(t.rent_amount) || 0), 0), nextCert: certs[0] ? { label: certs[0].label, expiry: certs[0].expiry! } : null })
      }
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

  const tabs: Array<{ id: TabType; label: string }> = [
    { id: 'details', label: 'Details' },
    { id: 'units', label: 'Units' },
    { id: 'people', label: 'People' },
    { id: 'maintenance', label: 'Maintenance' },
    { id: 'lettings', label: 'Lettings' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'documents', label: 'Documents' },
    { id: 'tenant_app', label: 'Tenant App' },
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
      {/* One header, the same as every other screen (24 Oct 2026 tidy): the name once, the facts that matter, the
          figures, and the tabs. Name, address and postcode are edited on the Details tab. */}
      <PageHero
        eyebrow={[property.property_code, property.property_type === 'hmo' ? 'HMO' : property.property_type === 'single' || property.property_type === 'single_let' ? 'Single let' : property.property_type, property.letting_type === 'let_only' ? 'Let only' : 'Fully managed'].filter(Boolean).join(' · ')}
        title={String(property.name || '—').split('\n')[0]}
        subtitle={<>
          {(() => { const addr = String(property.address || '').split('\n').join(', '); const sq = (v: string) => v.replace(/[\s,]/g, '').toLowerCase(); return sq(addr) === sq(String(property.name || '').split('\n').join(', ')) || sq(String(property.name || '')).includes(sq(addr)) ? null : <>{addr} · </> })()}
          {property.landlord_id ? <>Landlord: <Link href={`/admin/landlord/${property.landlord_id}`} className="hover:underline">{property.landlord_name}</Link></> : 'No landlord linked'}
        </>}
        actions={<HeroButton onClick={() => setShowQuickNotify(true)}>Message the house</HeroButton>}
        stats={house ? [
          { label: 'Rooms let', value: `${house.let} of ${house.rooms}`, tone: house.let < house.rooms ? 'warn' : 'good' },
          { label: 'Rent per month', value: `£${house.rent.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
          { label: house.nextCert ? `${house.nextCert.label} expires` : 'Certificates', value: house.nextCert ? fullDate(house.nextCert.expiry) : 'None on file', tone: house.nextCert && house.nextCert.expiry < addDaysIso(30) ? 'warn' : undefined },
          { label: 'Repairs open', value: String(tickets.filter((t: any) => !['completed', 'cancelled'].includes(t.status)).length), tone: tickets.some((t: any) => !['completed', 'cancelled'].includes(t.status)) ? 'warn' : undefined },
        ] : undefined}
        tabs={tabs.map(t => ({ key: t.id, label: t.label, active: activeTab === t.id, onClick: () => setActiveTab(t.id) }))}
      />

      <main className="mx-auto max-w-6xl px-lg py-xl">
        {!property.property_code && (
          <div className="mb-lg flex flex-wrap items-center gap-sm rounded-xl border border-amber-200 bg-amber-50 px-md py-sm text-sm text-amber-900">
            <span className="font-semibold">This house has no property code.</span>
            <input value={codeValue} onChange={(e) => setCodeValue(e.target.value.toUpperCase())} placeholder="e.g. 075CR" maxLength={10}
              className="w-28 rounded border border-amber-300 bg-white px-xs py-0.5 font-mono text-xs uppercase" />
            <button onClick={handleSaveCode} disabled={savingCode || !codeValue.trim()} className="rounded bg-neutral-900 px-sm py-0.5 text-xs font-semibold text-white disabled:opacity-50">{savingCode ? 'Saving…' : 'Set code'}</button>
            {codeError && <span className="text-xs text-red-700">{codeError}</span>}
          </div>
        )}

        {/* Tab Content */}
        <div className="rounded-2xl border border-neutral-200 bg-white">

          {/* ── Details (Property Info + Extended) ───────────────────────── */}
          {activeTab === 'details' && (
            <div className="p-lg space-y-2xl">
              <PropertyTabComponent property={property} onUpdate={(updates) => setProperty((p: any) => ({ ...p, ...updates }))} />
              <div className="border-t border-neutral-200 pt-2xl">
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-lg">Extended Details</p>
                <ExtendedDetailsTab propertyId={id} propertyType={property.property_type} />
              </div>
              <RemoveProperty propertyId={id} code={property.property_code ?? null} name={property.name} />
            </div>
          )}

          {/* ── Units ────────────────────────────────────────────────────── */}
          {activeTab === 'units' && (
            <div className="p-lg">
              <UnitsTab propertyId={id} propertyType={property.property_type} bedrooms={property.bedrooms} initialRoomId={initialRoomId} propertyName={property.name} propertyAddress={property.address} propertyCode={property.property_code} />
            </div>
          )}

          {/* ── People (Tenants + Housemates) ────────────────────────────── */}
          {activeTab === 'people' && (
            <div>
              <div className="flex gap-xs px-lg pt-lg pb-0 border-b border-neutral-100">
                {([['tenants', 'Tenants'], ['housemates', 'Housemates'], ['messages', 'Messages sent']] as [PeopleSubTab, string][]).map(([key, label]) => (
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
                {peopleSubTab === 'messages' && <CommunicationsTab propertyId={id} />}
              </div>
            </div>
          )}

          {/* ── Maintenance (Jobs + Purchases + Tasks) ───────────────────── */}
          {activeTab === 'maintenance' && (
            <div>
              <div className="flex gap-xs px-lg pt-lg pb-0 border-b border-neutral-100">
                {([['jobs', 'Jobs'], ['purchases', 'Purchases'], ['tasks', 'Tasks']] as [MaintenanceSubTab, string][]).map(([key, label]) => (
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
            <div className="p-lg">
              <ComplianceTab property={property} />
            </div>
          )}

          {/* ── Documents (Documents + Photos + Financials) ──────────────── */}
          {activeTab === 'documents' && (
            <div>
              <div className="flex flex-wrap gap-xs px-lg pt-lg pb-0 border-b border-neutral-100">
                {([['documents', 'Documents'], ['photos', 'Photos'], ['financials', 'Financials']] as [DocumentsSubTab, string][]).map(([key, label]) => (
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
                  Send certificates to tenants
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
