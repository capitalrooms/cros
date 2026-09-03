'use client'
import { displayName } from '@/lib/people'

import { useState, useEffect, use, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { ICEBREAKER_QUESTIONS } from '@/lib/icebreaker'

type TabType = 'overview' | 'tenant' | 'maintenance' | 'lettings' | 'photos' | 'compliance' | 'notes'
type ComplianceFilter = 'all' | 'fire_door' | 'smoke_alarm'

interface RoomData {
  id: string
  name: string
  property_id: string
  room_type: string | null
  room_size: number | null
  has_ensuite: boolean | null
  location_in_house: string | null
  features: string | null
  furnishings_description: string | null
  status: 'occupied' | 'available' | 'on_notice' | null
  available_date: string | null
  current_asking_rent: number | null
  detected_features: Record<string, any> | null
  marketing_description: string | null
}

interface PropertyData {
  name: string
  address: string
}

interface PersonData {
  id: string
  name: string | null
  email: string
  phone: string | null
}

interface TenancyData {
  id: string
  person_id: string
  co_tenant_id?: string | null
  co_tenant?: PersonData | null
  start_date: string
  end_date: string | null
  rent_amount: number | null
  person: PersonData
}

interface MaintenanceTicket {
  id: string
  title: string
  status: string
  priority: string
  created_at: string
  rooms: { name: string } | null
}

interface RoomPhoto {
  id: string
  file_url: string | null
  file_path: string | null
}

interface SelfCheck {
  id: string
  check_type: 'fire_door' | 'smoke_alarm'
  request_sent_at: string
  response_received_at: string | null
  tenant_response: 'confirmed_ok' | 'issue_reported' | 'no_response' | null
  issue_description: string | null
  photo_attachment_url: string | null
  tenancy_id: string
  // joined
  tenantName?: string
}

interface RoomNote {
  id: string
  content: string
  note_type: string
  created_at: string
  created_by: string | null
  // joined
  authorName?: string
}

interface Purchase {
  id: string
  name: string | null
  category: string | null
  cost: number | null
  purchased_date: string | null
  make_model: string | null
}

export default function RoomDashboardPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>
}) {
  const router = useRouter()
  const { id: propertyId, roomId } = use(params)
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [complianceFilter, setComplianceFilter] = useState<ComplianceFilter>('all')

  // Data
  const [room, setRoom] = useState<RoomData | null>(null)
  const [property, setProperty] = useState<PropertyData | null>(null)
  const [currentTenancy, setCurrentTenancy] = useState<TenancyData | null>(null)
  const [previousTenancies, setPreviousTenancies] = useState<TenancyData[]>([])
  const [icebreakerAnswers, setIcebreakerAnswers] = useState<Record<string, string> | null>(null)
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([])
  const [photos, setPhotos] = useState<RoomPhoto[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [selfChecks, setSelfChecks] = useState<SelfCheck[]>([])
  const [roomNotes, setRoomNotes] = useState<RoomNote[]>([])

  // Lettings / marketing state
  const [advertDraft, setAdvertDraft] = useState('')
  const [generatingAdvert, setGeneratingAdvert] = useState<'listing' | 'group' | null>(null)
  const [savingAdvert, setSavingAdvert] = useState(false)
  const [advertBanner, setAdvertBanner] = useState<string | null>(null)

  // Notes state
  const [newNoteText, setNewNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteBanner, setNoteBanner] = useState<string | null>(null)

  // Assign tenant modal
  const [showAssignTenant, setShowAssignTenant] = useState(false)
  const [assignBusy, setAssignBusy] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [newTenantName, setNewTenantName] = useState('')
  const [newTenantEmail, setNewTenantEmail] = useState('')
  const [newTenantPhone, setNewTenantPhone] = useState('')
  const [newTenancyStartDate, setNewTenancyStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [newTenancyEndDate, setNewTenancyEndDate] = useState('')
  const [newTenancyRent, setNewTenancyRent] = useState('')
  const [newTenancyRentDueDay, setNewTenancyRentDueDay] = useState('1')
  const [newTenancyDeposit, setNewTenancyDeposit] = useState('')
  const [newTenancyDepositHeldBy, setNewTenancyDepositHeldBy] = useState('')
  const [newTenancyDepositRef, setNewTenancyDepositRef] = useState('')
  const [newTenancyLeaseRef, setNewTenancyLeaseRef] = useState('')
  // Co-tenant (couples / joint tenants)
  const [showCoTenant, setShowCoTenant] = useState(false)
  const [coTenantName, setCoTenantName] = useState('')
  const [coTenantEmail, setCoTenantEmail] = useState('')
  const [coTenantPhone, setCoTenantPhone] = useState('')

  // Photos upload state
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [uploadPhotoMsg, setUploadPhotoMsg] = useState<string | null>(null)
  const [aiScanning, setAiScanning] = useState(false)
  const [pendingScanFeatures, setPendingScanFeatures] = useState<Record<string, any> | null>(null)
  const [manualFeatureInput, setManualFeatureInput] = useState('')
  const [savedFeatureInput, setSavedFeatureInput] = useState('')

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || !['administrator', 'admin'].includes(data.assignment?.role || '')) {
        router.push('/login')
        return
      }
      await loadAll()
      setLoading(false)
    }
    init()
  }, [propertyId, roomId])

  async function loadAll() {
    // Room
    const { data: roomData } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()
    if (!roomData) { router.push(`/admin/properties/${propertyId}`); return }
    setRoom(roomData)
    setAdvertDraft(roomData.marketing_description || '')

    // Property
    const { data: propData } = await supabase
      .from('properties')
      .select('name, address')
      .eq('id', propertyId)
      .single()
    if (propData) setProperty(propData)

    // Current tenancy: rolling (no end_date) OR on-notice (future end_date)
    const todayStr = new Date().toISOString().split('T')[0]
    const { data: curT } = await supabase
      .from('tenancies')
      .select('id, person_id, co_tenant_id, start_date, end_date, rent_amount, people!person_id(id, full_name, first_name, last_name, email, phone)')
      .eq('room_id', roomId)
      .or(`end_date.is.null,end_date.gte.${todayStr}`)
      .order('end_date', { ascending: false, nullsFirst: true })
      .limit(1)
      .maybeSingle()
    if (curT) {
      const t = curT as any
      const cur: TenancyData = {
        id: t.id,
        person_id: t.person_id,
        co_tenant_id: t.co_tenant_id,
        start_date: t.start_date,
        end_date: t.end_date,
        rent_amount: t.rent_amount,
        person: t.people,
      }
      // Fetch co-tenant person if present
      if (t.co_tenant_id) {
        const { data: ct } = await supabase
          .from('people')
          .select('id, full_name, first_name, last_name, email, phone')
          .eq('id', t.co_tenant_id)
          .maybeSingle()
        if (ct) cur.co_tenant = ct as PersonData
      }
      setCurrentTenancy(cur)

      // Icebreaker for current tenant
      const { data: ib } = await supabase
        .from('tenant_icebreakers')
        .select('answers')
        .eq('person_id', t.person_id)
        .maybeSingle()
      if (ib) setIcebreakerAnswers(ib.answers as Record<string, string>)
    }

    // Previous tenancies (end_date in the past only)
    const { data: prevTs } = await supabase
      .from('tenancies')
      .select('id, person_id, start_date, end_date, rent_amount, people!person_id(id, full_name, first_name, last_name, email, phone_number)')
      .eq('room_id', roomId)
      .lt('end_date', todayStr)
      .order('end_date', { ascending: false })
      .limit(10)
    if (prevTs) {
      setPreviousTenancies(prevTs.map((t: any) => ({
        id: t.id,
        person_id: t.person_id,
        start_date: t.start_date,
        end_date: t.end_date,
        rent_amount: t.rent_amount,
        person: t.people,
      })))
    }

    // Maintenance tickets
    const { data: tix } = await supabase
      .from('maintenance_tickets')
      .select('id, title, status, priority, created_at, rooms(name)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
    setTickets(tix || [])

    // Photos
    const { data: ph } = await supabase
      .from('property_photos')
      .select('id, file_url, file_path')
      .eq('room_id', roomId)
      .order('display_order', { ascending: true })
    setPhotos(ph || [])

    // Purchases
    const { data: purch } = await supabase
      .from('purchases')
      .select('id, name, category, cost, purchased_date, make_model')
      .eq('room_id', roomId)
      .order('purchased_date', { ascending: false, nullsFirst: false })
    setPurchases(purch || [])

    // Tenant self-checks (compliance)
    const { data: checks } = await supabase
      .from('tenant_self_checks')
      .select('id, check_type, request_sent_at, response_received_at, tenant_response, issue_description, photo_attachment_url, tenancy_id')
      .eq('room_id', roomId)
      .order('request_sent_at', { ascending: false })

    if (checks && checks.length > 0) {
      // Enrich with tenant names via tenancy_id → tenancies → people
      const tenancyIds = [...new Set(checks.map((c: any) => c.tenancy_id))]
      const { data: tenancyPeople } = await supabase
        .from('tenancies')
        .select('id, person_id, people!person_id(full_name, first_name, last_name, email)')
        .in('id', tenancyIds)
      const nameMap: Record<string, string> = {}
      ;(tenancyPeople || []).forEach((t: any) => {
        nameMap[t.id] = displayName(t.people) || t.people?.email || 'Unknown tenant'
      })
      setSelfChecks(checks.map((c: any) => ({ ...c, tenantName: nameMap[c.tenancy_id] || 'Unknown' })))
    } else {
      setSelfChecks([])
    }

    // Room notes
    const { data: notes } = await supabase
      .from('room_notes')
      .select('id, content, note_type, created_at, created_by, people(full_name, first_name, last_name)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
    if (notes) {
      setRoomNotes(notes.map((n: any) => ({
        id: n.id,
        content: n.content,
        note_type: n.note_type,
        created_at: n.created_at,
        created_by: n.created_by,
        authorName: displayName(n.people) || 'Admin',
      })))
    }
  }

  async function generateAdvert(format: 'listing' | 'group') {
    if (!room || !property) return
    setGeneratingAdvert(format)
    try {
      const res = await fetch('/api/let-only/generate-advert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          room_id: roomId,
          property_id: propertyId,
          room_name: room.name,
          monthly_rent: room.current_asking_rent,
          floor_area_sqm: room.room_size,
          has_ensuite: room.has_ensuite,
          detected_features: room.detected_features,
          address: property.address,
          postcode: null,
        }),
      })
      const data = await res.json()
      if (data.advert) setAdvertDraft(data.advert)
    } finally {
      setGeneratingAdvert(null)
    }
  }

  async function saveAdvert() {
    setSavingAdvert(true)
    await supabase.from('rooms').update({ marketing_description: advertDraft || null }).eq('id', roomId)
    setRoom(prev => prev ? { ...prev, marketing_description: advertDraft } : prev)
    setSavingAdvert(false)
    setAdvertBanner('Advert copy saved')
    setTimeout(() => setAdvertBanner(null), 2500)
  }

  async function addNote() {
    if (!newNoteText.trim()) return
    setSavingNote(true)
    const { data: me } = await supabase.from('people').select('id, full_name, first_name, last_name').eq('email', (await supabase.auth.getUser()).data.user?.email || '').maybeSingle()
    const { data: inserted } = await supabase.from('room_notes').insert({
      room_id: roomId,
      content: newNoteText.trim(),
      note_type: 'admin_notes',
      created_by: me?.id || null,
    }).select('id, content, note_type, created_at, created_by').single()
    if (inserted) {
      setRoomNotes(prev => [{ ...inserted, authorName: displayName(me) || 'Admin' }, ...prev])
      setNewNoteText('')
      setNoteBanner('Note added')
      setTimeout(() => setNoteBanner(null), 2500)
    }
    setSavingNote(false)
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploadingPhotos(true)
    setUploadPhotoMsg(null)
    let done = 0
    let firstUploadedUrl: string | null = null
    for (const file of files) {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${propertyId}/${roomId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('property-photos').upload(path, file, { upsert: false })
      if (error) continue
      const { data: urlData } = supabase.storage.from('property-photos').getPublicUrl(path)
      const publicUrl = urlData?.publicUrl || null
      const { data: inserted } = await supabase.from('property_photos').insert({
        property_id: propertyId,
        room_id: roomId,
        file_name: file.name,
        file_path: path,
        file_url: publicUrl,
        display_order: photos.length + done,
      }).select('id, file_url, file_path').single()
      if (inserted) {
        setPhotos(prev => [...prev, inserted])
        if (!firstUploadedUrl && publicUrl) firstUploadedUrl = publicUrl
      }
      done++
    }
    setUploadingPhotos(false)
    setUploadPhotoMsg(done > 0 ? `✓ ${done} photo${done === 1 ? '' : 's'} uploaded` : 'Upload failed — please try again')
    setTimeout(() => setUploadPhotoMsg(null), 4000)
    // Reset the input so the same file can be re-selected
    if (photoInputRef.current) photoInputRef.current.value = ''
    // Auto-trigger AI scan on first new room photo
    if (firstUploadedUrl && done > 0) {
      triggerAiScan(firstUploadedUrl)
    }
  }

  function photoUrl(p: RoomPhoto | undefined): string | null {
    if (!p) return null
    if (p.file_url) return p.file_url
    if (!p.file_path) return null
    const path = p.file_path.startsWith('property-photos/') ? p.file_path : `property-photos/${p.file_path}`
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${path}`
  }

  async function triggerAiScan(overrideUrl?: string) {
    const url = overrideUrl || photoUrl(photos[0])
    if (!url) return
    setAiScanning(true)
    setPendingScanFeatures(null)
    try {
      const res = await fetch('/api/rooms/scan-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_url: url }),
      })
      const data = await res.json()
      if (data.features) {
        // Hold for confirmation — don't auto-save
        const hasAny = Object.entries(data.features as Record<string, any>).some(
          ([, v]) => v && !(Array.isArray(v) && v.length === 0)
        )
        if (hasAny) setPendingScanFeatures(data.features)
        else setUploadPhotoMsg('Scan complete — no specific features detected in this photo')
      }
    } catch {
      // silent
    }
    setAiScanning(false)
  }

  async function acceptScanFeatures() {
    if (!pendingScanFeatures) return
    await supabase.from('rooms').update({ detected_features: pendingScanFeatures }).eq('id', roomId)
    setRoom(prev => prev ? { ...prev, detected_features: pendingScanFeatures } : prev)
    setPendingScanFeatures(null)
  }

  async function addSavedFeature(text: string) {
    if (!text.trim() || !room) return
    const current: Record<string, any> = room.detected_features || {}
    const extras: string[] = Array.isArray(current.extras) ? current.extras : []
    const updated = { ...current, extras: [...extras, text.trim()] }
    await supabase.from('rooms').update({ detected_features: updated }).eq('id', roomId)
    setRoom(prev => prev ? { ...prev, detected_features: updated } : prev)
    setSavedFeatureInput('')
  }

  async function removeDetectedFeature(key: string, extraValue?: string) {
    if (!room?.detected_features) return
    const updated: Record<string, any> = { ...room.detected_features }
    if (key === 'extras' && extraValue) {
      updated.extras = (updated.extras as string[] || []).filter((v: string) => v !== extraValue)
      if ((updated.extras as string[]).length === 0) delete updated.extras
    } else {
      delete updated[key]
    }
    const hasData = Object.entries(updated).some(([, v]) => v && !(Array.isArray(v) && v.length === 0))
    const nextVal = hasData ? updated : null
    await supabase.from('rooms').update({ detected_features: nextVal }).eq('id', roomId)
    setRoom(prev => prev ? { ...prev, detected_features: nextVal } : prev)
  }

  async function clearAllFeatures() {
    await supabase.from('rooms').update({ detected_features: null }).eq('id', roomId)
    setRoom(prev => prev ? { ...prev, detected_features: null } : prev)
  }

  async function deletePhoto(photo: RoomPhoto) {
    if (!photo.file_path) {
      await supabase.from('property_photos').delete().eq('id', photo.id)
    } else {
      await supabase.storage.from('property-photos').remove([photo.file_path])
      await supabase.from('property_photos').delete().eq('id', photo.id)
    }
    setPhotos(prev => prev.filter(p => p.id !== photo.id))
  }

  // ─── assign tenant ─────────────────────────────────────────────────────────

  async function handleAssignTenant() {
    if (!newTenantName.trim() || !newTenantEmail.trim() || !newTenancyStartDate) {
      setAssignError('Name, email and start date are required.')
      return
    }
    setAssignBusy(true)
    setAssignError(null)
    try {
      // 1. Find or create the person
      let personId: string
      const { data: existing } = await supabase
        .from('people')
        .select('id')
        .eq('email', newTenantEmail.trim().toLowerCase())
        .maybeSingle()

      if (existing) {
        personId = existing.id
        await supabase.from('people').update({
          first_name: newTenantName.trim().split(' ')[0] || null,
          last_name: newTenantName.trim().split(' ').slice(1).join(' ') || null,
          phone: newTenantPhone.trim() || null,
        }).eq('id', personId)
      } else {
        const nameParts = newTenantName.trim().split(' ')
        const { data: newPerson, error: pe } = await supabase
          .from('people')
          .insert({
            first_name: nameParts[0] || newTenantName.trim(),
            last_name: nameParts.slice(1).join(' ') || null,
            email: newTenantEmail.trim().toLowerCase(),
            phone: newTenantPhone.trim() || null,
            role: 'tenant',
          })
          .select('id')
          .single()
        if (pe) throw pe
        personId = newPerson.id
      }

      // 2. Handle co-tenant (if provided)
      let coTenantId: string | null = null
      if (showCoTenant && coTenantEmail.trim()) {
        const { data: existingCt } = await supabase
          .from('people')
          .select('id')
          .eq('email', coTenantEmail.trim().toLowerCase())
          .maybeSingle()
        if (existingCt) {
          coTenantId = existingCt.id
          const ctParts = coTenantName.trim().split(' ')
          await supabase.from('people').update({
            first_name: ctParts[0] || null,
            last_name: ctParts.slice(1).join(' ') || null,
            phone: coTenantPhone.trim() || null,
          }).eq('id', coTenantId)
        } else {
          const ctParts = coTenantName.trim().split(' ')
          const { data: newCt, error: cte } = await supabase
            .from('people')
            .insert({
              first_name: ctParts[0] || coTenantName.trim(),
              last_name: ctParts.slice(1).join(' ') || null,
              email: coTenantEmail.trim().toLowerCase(),
              phone: coTenantPhone.trim() || null,
              role: 'tenant',
            })
            .select('id')
            .single()
          if (cte) throw cte
          coTenantId = newCt.id
        }
      }

      // 3. Create tenancy
      const { error: te } = await supabase.from('tenancies').insert({
        person_id: personId,
        co_tenant_id: coTenantId,
        room_id: roomId,
        property_id: propertyId,
        start_date: newTenancyStartDate,
        end_date: newTenancyEndDate || null,
        rent_amount: newTenancyRent ? parseFloat(newTenancyRent) : null,
        rent_due_day: newTenancyRentDueDay ? parseInt(newTenancyRentDueDay) : 1,
        deposit_amount: newTenancyDeposit ? parseFloat(newTenancyDeposit) : null,
        deposit_held_by: newTenancyDepositHeldBy.trim() || null,
        deposit_scheme_ref: newTenancyDepositRef.trim() || null,
        deposit_release_status: 'pending',
        lease_reference: newTenancyLeaseRef.trim() || null,
        status: 'active',
        opt_in_maintenance: true,
        opt_in_viewings: false,
        opt_in_appointments: true,
        opt_in_cleaning: true,
      })
      if (te) throw te

      // 3. Mark room as occupied
      await supabase.from('rooms').update({ status: 'occupied' }).eq('id', roomId)

      // Reset + reload
      setShowAssignTenant(false)
      setNewTenantName('')
      setNewTenantEmail('')
      setNewTenantPhone('')
      setNewTenancyRent('')
      setNewTenancyStartDate(new Date().toISOString().slice(0, 10))
      setNewTenancyEndDate('')
      setNewTenancyRentDueDay('1')
      setNewTenancyDeposit('')
      setNewTenancyDepositHeldBy('')
      setNewTenancyDepositRef('')
      setNewTenancyLeaseRef('')
      await loadAll()
    } catch (err: any) {
      setAssignError(err?.message || 'Something went wrong — try again.')
    } finally {
      setAssignBusy(false)
    }
  }

  // ─── helpers ───────────────────────────────────────────────────────────────

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const fmtShort = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'

  const statusBadge = (status: string | null) => {
    if (status === 'occupied') return { label: 'Occupied', cls: 'bg-emerald-100 text-emerald-700' }
    if (status === 'on_notice') return { label: 'On notice', cls: 'bg-amber-100 text-amber-700' }
    return { label: 'Available', cls: 'bg-blue-100 text-blue-700' }
  }

  const priorityStyle = (p: string) => {
    if (p === 'high' || p === 'urgent') return 'bg-red-100 text-red-700'
    if (p === 'medium') return 'bg-amber-100 text-amber-700'
    return 'bg-neutral-100 text-neutral-600'
  }

  const ticketStatusDot = (s: string) => {
    if (s === 'completed' || s === 'closed') return 'bg-emerald-400'
    if (s === 'in_progress') return 'bg-blue-400'
    return 'bg-amber-400'
  }

  const openJobs = tickets.filter(t => t.status !== 'completed' && t.status !== 'closed')
  const closedJobs = tickets.filter(t => t.status === 'completed' || t.status === 'closed')

  const detectedChips = room?.detected_features
    ? Object.entries(room.detected_features)
        .filter(([k, v]) => v && k !== 'extras')
        .map(([, v]) => String(v))
        .concat((room.detected_features.extras as string[] | undefined) || [])
    : []

  const filteredChecks = complianceFilter === 'all'
    ? selfChecks
    : selfChecks.filter(c => c.check_type === complianceFilter)

  const tabs: Array<{ id: TabType; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'tenant', label: 'Tenant' },
    { id: 'maintenance', label: 'Maintenance' },
    { id: 'lettings', label: 'Lettings' },
    { id: 'photos', label: 'Photos' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'notes', label: 'Notes' },
  ]

  const heroPhoto = photos[0]
  const heroPhotoUrl = heroPhoto?.file_url || (heroPhoto?.file_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${heroPhoto.file_path.startsWith('property-photos/') ? heroPhoto.file_path : `property-photos/${heroPhoto.file_path}`}`
    : null)

  const { label: statusLabel, cls: statusCls } = statusBadge(room?.status || null)

  if (loading) return <GenericPageSkeleton />

  if (!room || !property) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href={`/admin/properties/${propertyId}`} />} />
      <div className="mx-auto max-w-4xl px-lg py-2xl">
        <p className="text-sm text-neutral-500">Room not found.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href={`/admin/properties/${propertyId}`} />} />

      <main className="mx-auto max-w-5xl px-lg py-2xl">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-xs text-xs text-neutral-500 mb-lg font-medium">
          <Link href="/admin/properties" className="hover:text-neutral-700">Properties</Link>
          <span>›</span>
          <Link href={`/admin/properties/${propertyId}`} className="hover:text-neutral-700">{property.name}</Link>
          <span>›</span>
          <span className="text-neutral-700">{room.name}</span>
        </nav>

        {/* ── Hero card ─────────────────────────────────────────────────────── */}
        <div className="mb-xl rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr]">
            {/* Photo */}
            <div className="relative bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center min-h-[180px] md:min-h-0">
              {heroPhotoUrl ? (
                <img src={heroPhotoUrl} alt={room.name} className="w-full h-full object-cover absolute inset-0" />
              ) : (
                <div className="text-center">
                  <div className="text-5xl mb-sm opacity-60">🛏️</div>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 md:hidden bg-gradient-to-t from-black/40 to-transparent h-10" />
            </div>

            {/* Info */}
            <div className="p-lg flex flex-col gap-md">
              <div className="flex items-start justify-between gap-md flex-wrap">
                <div>
                  <h1 className="text-2xl font-bold text-neutral-900 leading-tight">{room.name}</h1>
                  <p className="text-sm text-neutral-500 mt-xs">{property.name} · {property.address}</p>
                </div>
                <span className={`inline-flex items-center gap-xs px-md py-xs rounded-full text-xs font-semibold shrink-0 mt-xs ${statusCls}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {statusLabel}
                </span>
              </div>

              <div className="flex flex-wrap gap-xl">
                {currentTenancy && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Tenant</p>
                    <p className="text-sm font-semibold text-neutral-900">{displayName(currentTenancy.person) || currentTenancy.person?.email || '—'}</p>
                  </div>
                )}
                {(currentTenancy?.rent_amount || room.current_asking_rent) && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Rent</p>
                    <p className="text-sm font-semibold text-neutral-900">£{(currentTenancy?.rent_amount || room.current_asking_rent)?.toLocaleString()} pcm</p>
                  </div>
                )}
                {currentTenancy?.start_date && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Since</p>
                    <p className="text-sm font-semibold text-neutral-900">{fmtDate(currentTenancy.start_date)}</p>
                  </div>
                )}
                {openJobs.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Open jobs</p>
                    <p className="text-sm font-semibold text-amber-600">{openJobs.length}</p>
                  </div>
                )}
                {room.room_size && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Size</p>
                    <p className="text-sm font-semibold text-neutral-900">{room.room_size} m²</p>
                  </div>
                )}
                {room.has_ensuite && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">En-suite</p>
                    <p className="text-sm font-semibold text-neutral-900">Yes 🚿</p>
                  </div>
                )}
              </div>

              {detectedChips.length > 0 && (
                <div className="flex flex-wrap gap-xs">
                  {detectedChips.map((chip, i) => (
                    <span key={i} className="px-sm py-0.5 rounded-full bg-purple-50 border border-purple-200 text-xs font-medium text-purple-700">
                      {chip}
                    </span>
                  ))}
                  <span className="px-sm py-0.5 rounded-full bg-purple-50 border border-purple-200 text-xs font-medium text-purple-700">✨ AI scanned</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Tab bar ───────────────────────────────────────────────────────── */}
        <div className="mb-0 flex gap-0 border-b border-neutral-700 overflow-x-auto bg-neutral-900 rounded-t-xl">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 px-lg py-md whitespace-nowrap font-semibold text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-neutral-900 rounded-t-lg'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              {tab.label}
              {tab.id === 'maintenance' && openJobs.length > 0 && (
                <span className="ml-xs inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-neutral-900 text-[10px] font-bold">{openJobs.length}</span>
              )}
              {tab.id === 'compliance' && selfChecks.filter(c => c.tenant_response === 'issue_reported').length > 0 && (
                <span className="ml-xs inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-400 text-white text-[10px] font-bold">!</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab content ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-b-xl border border-t-0 border-neutral-700 shadow-sm p-lg">

          {/* ── OVERVIEW ────────────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-lg">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Room details</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-md">
                  {[
                    { label: 'Type', value: room.room_type },
                    { label: 'Size', value: room.room_size ? `${room.room_size} m²` : null },
                    { label: 'En-suite', value: room.has_ensuite === true ? 'Yes' : room.has_ensuite === false ? 'No' : null },
                    { label: 'Location', value: room.location_in_house },
                    { label: 'Features', value: room.features },
                    { label: 'Status', value: statusLabel },
                  ].filter(r => r.value).map(row => (
                    <div key={row.label} className="rounded-lg border border-neutral-100 bg-neutral-50 p-md">
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">{row.label}</p>
                      <p className="text-sm font-semibold text-neutral-900">{row.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {room.furnishings_description && (
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Furnishings</h2>
                  <p className="text-sm text-neutral-700 leading-relaxed">{room.furnishings_description}</p>
                </div>
              )}

              {detectedChips.length > 0 && (
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">AI-detected features <span className="text-purple-500">✨</span></h2>
                  <div className="flex flex-wrap gap-sm">
                    {detectedChips.map((chip, i) => (
                      <span key={i} className="px-md py-xs rounded-full bg-purple-50 border border-purple-200 text-xs font-semibold text-purple-700">{chip}</span>
                    ))}
                  </div>
                  <p className="text-xs text-neutral-400 mt-sm">Detected from room photos. Rescan from the Photos tab after uploading new images.</p>
                </div>
              )}
            </div>
          )}

          {/* ── TENANT ──────────────────────────────────────────────────────── */}
          {activeTab === 'tenant' && (
            <div className="space-y-xl">
              {/* Current tenant */}
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Current tenant</h2>
                {currentTenancy ? (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 overflow-hidden">
                    {/* Primary tenant */}
                    <div className="flex items-center gap-md p-lg border-b border-neutral-200">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-300 to-blue-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
                        {(displayName(currentTenancy.person) || currentTenancy.person?.email || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link href={`/admin/tenant/${currentTenancy.person?.id}`}>
                          <p className="font-semibold text-blue-600 hover:text-blue-700">
                            {displayName(currentTenancy.person) || currentTenancy.person?.email || 'Unknown'}
                            {currentTenancy.co_tenant && (
                              <span className="text-neutral-400 font-normal"> &amp; {displayName(currentTenancy.co_tenant)}</span>
                            )}
                          </p>
                        </Link>
                        {currentTenancy.person?.email && <p className="text-xs text-neutral-500">{currentTenancy.person.email}</p>}
                        {currentTenancy.person?.phone && <p className="text-xs text-neutral-500">{currentTenancy.person.phone}</p>}
                      </div>
                      <Link href={`/admin/tenant/${currentTenancy.person?.id}?tab=tenancy`}
                        className="shrink-0 text-xs font-semibold text-neutral-500 hover:text-neutral-900 border border-neutral-200 rounded-lg px-md py-xs bg-white">
                        Tenant profile →
                      </Link>
                    </div>
                    {/* Co-tenant detail row */}
                    {currentTenancy.co_tenant && (
                      <div className="flex items-center gap-md px-lg py-sm border-b border-neutral-200 bg-blue-50/50">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-300 to-purple-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                          {(displayName(currentTenancy.co_tenant) || currentTenancy.co_tenant?.email || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-neutral-600">{displayName(currentTenancy.co_tenant)}</p>
                          {currentTenancy.co_tenant.email && <p className="text-xs text-neutral-400">{currentTenancy.co_tenant.email}</p>}
                        </div>
                        <span className="text-xs text-purple-600 font-semibold bg-purple-100 px-sm py-xs rounded-full shrink-0">Co-tenant</span>
                      </div>
                    )}
                    <div className="grid grid-cols-3 divide-x divide-neutral-200 text-center">
                      <div className="p-md">
                        <p className="text-xs text-neutral-500 font-semibold uppercase tracking-wider mb-xs">Rent</p>
                        <p className="text-sm font-bold text-neutral-900">£{currentTenancy.rent_amount?.toLocaleString() || '—'}</p>
                      </div>
                      <div className="p-md">
                        <p className="text-xs text-neutral-500 font-semibold uppercase tracking-wider mb-xs">Start</p>
                        <p className="text-sm font-bold text-neutral-900">{fmtShort(currentTenancy.start_date)}</p>
                      </div>
                      <div className="p-md">
                        <p className="text-xs text-neutral-500 font-semibold uppercase tracking-wider mb-xs">End</p>
                        <p className="text-sm font-bold text-neutral-900">{currentTenancy.end_date ? fmtShort(currentTenancy.end_date) : 'Rolling'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    {!showAssignTenant ? (
                      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-lg flex flex-col items-center gap-md text-center">
                        <p className="text-sm text-neutral-500">
                          No current tenant — room is {room.status === 'available' ? 'available' : 'on notice'}
                        </p>
                        <button
                          onClick={() => setShowAssignTenant(true)}
                          className="rounded-lg bg-neutral-900 text-white text-sm font-semibold px-lg py-sm hover:bg-neutral-800 transition-colors"
                        >
                          + Assign tenant
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-xl border-2 border-neutral-900 bg-white p-lg space-y-md">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-neutral-900">Assign tenant to this room</h3>
                          <button onClick={() => { setShowAssignTenant(false); setAssignError(null) }}
                            className="text-neutral-400 hover:text-neutral-700 text-sm">✕ Cancel</button>
                        </div>
                        {assignError && (
                          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-md py-sm">{assignError}</p>
                        )}
                        <div className="grid gap-md sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-semibold text-neutral-500 mb-xs uppercase tracking-wider">Full name *</label>
                            <input value={newTenantName} onChange={e => setNewTenantName(e.target.value)}
                              placeholder="Jane Smith"
                              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-500 mb-xs uppercase tracking-wider">Email *</label>
                            <input value={newTenantEmail} onChange={e => setNewTenantEmail(e.target.value)}
                              type="email" placeholder="jane@example.com"
                              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-500 mb-xs uppercase tracking-wider">Phone</label>
                            <input value={newTenantPhone} onChange={e => setNewTenantPhone(e.target.value)}
                              type="tel" placeholder="07700 000000"
                              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-500 mb-xs uppercase tracking-wider">Monthly rent (£)</label>
                            <input value={newTenancyRent} onChange={e => setNewTenancyRent(e.target.value)}
                              type="number" placeholder="750"
                              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-500 mb-xs uppercase tracking-wider">Tenancy start date *</label>
                            <input value={newTenancyStartDate} onChange={e => setNewTenancyStartDate(e.target.value)}
                              type="date"
                              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-500 mb-xs uppercase tracking-wider">Contract end date</label>
                            <input value={newTenancyEndDate} onChange={e => setNewTenancyEndDate(e.target.value)}
                              type="date"
                              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-500 mb-xs uppercase tracking-wider">Rent due day of month</label>
                            <input value={newTenancyRentDueDay} onChange={e => setNewTenancyRentDueDay(e.target.value)}
                              type="number" min="1" max="31" placeholder="1"
                              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-500 mb-xs uppercase tracking-wider">Deposit amount (£)</label>
                            <input value={newTenancyDeposit} onChange={e => setNewTenancyDeposit(e.target.value)}
                              type="number" placeholder="1500"
                              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-500 mb-xs uppercase tracking-wider">Deposit held by</label>
                            <input value={newTenancyDepositHeldBy} onChange={e => setNewTenancyDepositHeldBy(e.target.value)}
                              placeholder="e.g. DPS, TDS, mydeposits"
                              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-500 mb-xs uppercase tracking-wider">Deposit scheme ref</label>
                            <input value={newTenancyDepositRef} onChange={e => setNewTenancyDepositRef(e.target.value)}
                              placeholder="Scheme reference number"
                              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-neutral-500 mb-xs uppercase tracking-wider">Lease reference</label>
                            <input value={newTenancyLeaseRef} onChange={e => setNewTenancyLeaseRef(e.target.value)}
                              placeholder="e.g. AST-2024-001"
                              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                          </div>
                        </div>
                        <p className="text-xs text-neutral-400">If this email already exists in the system, the person record will be updated rather than duplicated.</p>

                        {/* Co-tenant toggle */}
                        {!showCoTenant ? (
                          <button
                            type="button"
                            onClick={() => setShowCoTenant(true)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                          >
                            + Add co-tenant (couple or joint tenancy)
                          </button>
                        ) : (
                          <div className="border-t border-neutral-200 pt-md space-y-md">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-neutral-700 uppercase tracking-wider">Co-tenant</p>
                              <button type="button" onClick={() => { setShowCoTenant(false); setCoTenantName(''); setCoTenantEmail(''); setCoTenantPhone('') }}
                                className="text-xs text-neutral-400 hover:text-neutral-700">✕ Remove</button>
                            </div>
                            <div className="grid gap-md sm:grid-cols-2">
                              <div>
                                <label className="block text-xs font-semibold text-neutral-500 mb-xs uppercase tracking-wider">Full name</label>
                                <input value={coTenantName} onChange={e => setCoTenantName(e.target.value)}
                                  placeholder="Alex Smith"
                                  className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-neutral-500 mb-xs uppercase tracking-wider">Email</label>
                                <input value={coTenantEmail} onChange={e => setCoTenantEmail(e.target.value)}
                                  type="email" placeholder="alex@example.com"
                                  className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-neutral-500 mb-xs uppercase tracking-wider">Phone</label>
                                <input value={coTenantPhone} onChange={e => setCoTenantPhone(e.target.value)}
                                  type="tel" placeholder="07700 000000"
                                  className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                              </div>
                            </div>
                          </div>
                        )}

                        <button
                          onClick={handleAssignTenant}
                          disabled={assignBusy}
                          className="w-full rounded-lg bg-neutral-900 text-white font-bold py-md hover:bg-neutral-800 disabled:opacity-40 transition-colors"
                        >
                          {assignBusy ? 'Saving…' : 'Assign tenant & mark room occupied'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tenant lifestyle */}
              {icebreakerAnswers && (
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Lifestyle &amp; schedule</h2>
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 divide-y divide-neutral-200 overflow-hidden">
                    {ICEBREAKER_QUESTIONS.filter(q => icebreakerAnswers[q.id]?.trim()).map(q => (
                      <div key={q.id} className="flex items-start gap-md p-md">
                        <span className="text-lg shrink-0 mt-0.5">{q.emoji}</span>
                        <div>
                          <p className="text-xs font-semibold text-neutral-500 mb-xs">{q.short}</p>
                          <p className="text-sm text-neutral-900">{icebreakerAnswers[q.id]}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-neutral-400 mt-sm">Set by tenant at onboarding and updateable via their profile.</p>
                </div>
              )}

              {/* Previous tenants */}
              {previousTenancies.length > 0 && (
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Previous tenants</h2>
                  <div className="space-y-sm">
                    {previousTenancies.map(t => (
                      <div key={t.id} className="flex items-center justify-between gap-md rounded-lg border border-neutral-200 bg-neutral-50 px-lg py-md">
                        <div>
                          <p className="text-sm font-semibold text-neutral-900">{displayName(t.person) || t.person?.email || 'Unknown'}</p>
                          <p className="text-xs text-neutral-500 mt-xs">
                            {fmtShort(t.start_date)} → {fmtShort(t.end_date)} {t.rent_amount ? `· £${t.rent_amount}/mo` : ''}
                          </p>
                        </div>
                        <span className="text-xs text-neutral-400 font-medium shrink-0">Closed</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── MAINTENANCE ─────────────────────────────────────────────────── */}
          {activeTab === 'maintenance' && (
            <div className="space-y-xl">
              {openJobs.length > 0 && (
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Open ({openJobs.length})</h2>
                  <div className="space-y-sm">
                    {openJobs.map(t => (
                      <div key={t.id} className="flex items-start gap-md rounded-lg border border-neutral-200 bg-neutral-50 p-md">
                        <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${ticketStatusDot(t.status)}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-neutral-900">{t.title}</p>
                          <p className="text-xs text-neutral-500 mt-xs">{fmtDate(t.created_at)}</p>
                        </div>
                        <span className={`shrink-0 text-xs font-semibold px-sm py-0.5 rounded-full ${priorityStyle(t.priority)}`}>{t.priority}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {closedJobs.length > 0 && (
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Completed</h2>
                  <div className="space-y-sm">
                    {closedJobs.map(t => (
                      <div key={t.id} className="flex items-start gap-md rounded-lg border border-neutral-100 bg-white p-md">
                        <span className="mt-1 w-2 h-2 rounded-full shrink-0 bg-emerald-400" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-700">{t.title}</p>
                          <p className="text-xs text-neutral-400 mt-xs">{fmtDate(t.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tickets.length === 0 && (
                <div className="text-center py-2xl text-neutral-400">
                  <div className="text-3xl mb-sm opacity-40">🔧</div>
                  <p className="text-sm font-medium">No maintenance history for this room</p>
                </div>
              )}

              {/* Purchases for this room */}
              {purchases.length > 0 && (
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Purchases</h2>
                  <div className="overflow-x-auto rounded-xl border border-neutral-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          <th className="px-md py-sm">Item</th>
                          <th className="px-md py-sm">Category</th>
                          <th className="px-md py-sm">Date</th>
                          <th className="px-md py-sm text-right">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchases.map(p => (
                          <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                            <td className="px-md py-sm">
                              <p className="font-medium text-neutral-900">{p.name || '—'}</p>
                              {p.make_model && <p className="text-xs text-neutral-500">{p.make_model}</p>}
                            </td>
                            <td className="px-md py-sm text-neutral-600 capitalize">{(p.category || '').replace(/_/g, ' ')}</td>
                            <td className="px-md py-sm text-neutral-500 text-xs">{fmtDate(p.purchased_date)}</td>
                            <td className="px-md py-sm text-right font-medium text-neutral-900">
                              {p.cost != null ? `£${Number(p.cost).toLocaleString()}` : <span className="text-neutral-400">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── LETTINGS ────────────────────────────────────────────────────── */}
          {activeTab === 'lettings' && (
            <div className="space-y-xl">
              {(room.status === 'available' || room.status === 'on_notice') ? (
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Marketing copy</h2>
                  {advertBanner && (
                    <div className="mb-md rounded-lg bg-blue-50 border border-blue-200 px-lg py-sm text-sm text-blue-800">{advertBanner}</div>
                  )}
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-lg space-y-md">
                    <div className="flex items-center gap-sm flex-wrap">
                      <span className="text-xs font-semibold text-neutral-500">Generate:</span>
                      <button
                        onClick={() => generateAdvert('listing')}
                        disabled={!!generatingAdvert}
                        className="px-md py-xs rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 transition"
                      >
                        {generatingAdvert === 'listing' ? '✨ Drafting…' : '✨ Advert'}
                      </button>
                      <button
                        onClick={() => generateAdvert('group')}
                        disabled={!!generatingAdvert}
                        className="px-md py-xs rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
                      >
                        {generatingAdvert === 'group' ? '✨ Drafting…' : '✨ Group post'}
                      </button>
                      {detectedChips.length > 0 && (
                        <span className="text-xs text-neutral-400" title={`Uses: ${detectedChips.join(', ')}`}>
                          ✨ Uses detected room features
                        </span>
                      )}
                    </div>
                    {detectedChips.length > 0 && (
                      <div className="flex flex-wrap gap-xs">
                        {detectedChips.map((chip, i) => (
                          <span key={i} className="px-sm py-0.5 rounded-full bg-purple-50 border border-purple-200 text-xs font-medium text-purple-700">{chip}</span>
                        ))}
                      </div>
                    )}
                    <textarea
                      value={advertDraft}
                      onChange={e => setAdvertDraft(e.target.value)}
                      rows={8}
                      placeholder="Generate an advert listing or a quick group post above — then edit and save…"
                      className="w-full rounded-lg border border-neutral-200 px-md py-sm text-sm text-neutral-900 resize-y focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none bg-white"
                    />
                    {advertDraft !== (room.marketing_description || '') && (
                      <button
                        onClick={saveAdvert}
                        disabled={savingAdvert}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        {savingAdvert ? 'Saving…' : 'Save copy →'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Marketing copy</h2>
                  <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-lg text-center">
                    <p className="text-sm text-neutral-500">This room is currently occupied. Marketing copy is only active when the room is available or on notice.</p>
                    {room.marketing_description && (
                      <div className="mt-md text-left">
                        <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-sm">Saved copy (for when available)</p>
                        <p className="text-sm text-neutral-700 whitespace-pre-wrap">{room.marketing_description}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PHOTOS ──────────────────────────────────────────────────────── */}
          {activeTab === 'photos' && (
            <div>
              <div className="flex items-center justify-between gap-md mb-md flex-wrap">
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400">Room photos</h2>
                <div className="flex items-center gap-sm flex-wrap">
                  {photos.length > 0 && (
                    <button
                      onClick={() => triggerAiScan()}
                      disabled={aiScanning || uploadingPhotos}
                      className="px-md py-xs rounded-lg border border-purple-200 bg-purple-50 text-purple-700 text-xs font-semibold hover:bg-purple-100 disabled:opacity-50 transition"
                    >
                      {aiScanning ? '✨ Scanning…' : '✨ AI Feature Scan'}
                    </button>
                  )}
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhotos}
                    className="px-md py-xs rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-700 disabled:opacity-50 transition"
                  >
                    {uploadingPhotos ? 'Uploading…' : '+ Upload photos'}
                  </button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </div>
              </div>

              {uploadPhotoMsg && (
                <div className={`mb-md rounded-lg px-lg py-sm text-sm ${uploadPhotoMsg.startsWith('✓') ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {uploadPhotoMsg}
                </div>
              )}

              {photos.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-md">
                  {photos.map(p => {
                    const url = p.file_url || (p.file_path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${p.file_path.startsWith('property-photos/') ? p.file_path : `property-photos/${p.file_path}`}` : null)
                    return (
                      <div key={p.id} className="group relative aspect-[4/3] rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100">
                        {url ? (
                          <img src={url} alt="Room photo" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">📷</div>
                        )}
                        <button
                          onClick={() => deletePhoto(p)}
                          className="absolute top-xs right-xs w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                          title="Remove photo"
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-2xl text-neutral-400">
                  <div className="text-3xl mb-sm opacity-40">📷</div>
                  <p className="text-sm font-medium">No photos for this room yet</p>
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    className="mt-md px-lg py-sm rounded-xl border border-dashed border-neutral-300 text-sm text-neutral-500 hover:border-neutral-500 hover:text-neutral-700 transition"
                  >
                    + Upload the first photo
                  </button>
                </div>
              )}

              {photos.length > 0 && !room.detected_features && !pendingScanFeatures && (
                <p className="text-xs text-neutral-400 mt-md">
                  The first photo is used as the room hero image. ✨ AI Feature Scan detects features (flooring, windows, wardrobe) for advert copy.
                </p>
              )}

              {/* ── Scan confirmation panel ───────────────────────────────── */}
              {pendingScanFeatures && (() => {
                const pf = pendingScanFeatures as Record<string, any>
                const featureRows = [
                  { key: 'flooring', label: 'Flooring' },
                  { key: 'natural_light', label: 'Light' },
                  { key: 'window_type', label: 'Windows' },
                  { key: 'window_treatment', label: 'Curtains/blinds' },
                  { key: 'wardrobe', label: 'Wardrobe' },
                ].filter(({ key }) => pf[key])
                const extras: string[] = Array.isArray(pf.extras) ? pf.extras : []
                return (
                  <div className="mt-lg rounded-xl border border-purple-200 bg-purple-50 p-lg space-y-md">
                    <div className="flex items-start justify-between gap-md">
                      <div>
                        <p className="text-sm font-semibold text-purple-900">✨ Features detected</p>
                        <p className="text-xs text-purple-600 mt-xs">Remove anything that looks wrong, then save.</p>
                      </div>
                      <button onClick={() => setPendingScanFeatures(null)} className="text-xs text-purple-400 hover:text-purple-700 shrink-0">Dismiss</button>
                    </div>
                    <div className="space-y-sm">
                      {featureRows.map(({ key, label }) => (
                        <div key={key} className="flex items-center gap-sm">
                          <span className="text-xs text-purple-500 w-28 shrink-0">{label}</span>
                          <span className="inline-flex items-center gap-xs px-sm py-0.5 rounded-full bg-white border border-purple-200 text-xs font-medium text-purple-800">
                            {String(pf[key])}
                            <button
                              onClick={() => {
                                const updated = { ...pendingScanFeatures }
                                delete updated[key]
                                const hasAny = Object.entries(updated).some(([, v]) => v && !(Array.isArray(v) && v.length === 0))
                                setPendingScanFeatures(hasAny ? updated : null)
                              }}
                              className="text-purple-300 hover:text-red-500 transition leading-none"
                            >✕</button>
                          </span>
                        </div>
                      ))}
                      {extras.length > 0 && (
                        <div className="flex items-start gap-sm">
                          <span className="text-xs text-purple-500 w-28 shrink-0 mt-0.5">Other</span>
                          <div className="flex flex-wrap gap-xs">
                            {extras.map((extra: string) => (
                              <span key={extra} className="inline-flex items-center gap-xs px-sm py-0.5 rounded-full bg-white border border-purple-200 text-xs font-medium text-purple-800">
                                {extra}
                                <button
                                  onClick={() => {
                                    const newExtras = extras.filter(e => e !== extra)
                                    const updated = { ...pendingScanFeatures, extras: newExtras }
                                    const hasAny = featureRows.some(({ key }) => updated[key]) || newExtras.length > 0
                                    setPendingScanFeatures(hasAny ? updated : null)
                                  }}
                                  className="text-purple-300 hover:text-red-500 transition leading-none"
                                >✕</button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Manual feature add */}
                    <div className="flex gap-xs pt-xs border-t border-purple-100">
                      <input
                        type="text"
                        value={manualFeatureInput}
                        onChange={e => setManualFeatureInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && manualFeatureInput.trim()) {
                            const current = Array.isArray(pendingScanFeatures?.extras) ? pendingScanFeatures!.extras : []
                            setPendingScanFeatures({ ...pendingScanFeatures!, extras: [...current, manualFeatureInput.trim()] })
                            setManualFeatureInput('')
                          }
                        }}
                        placeholder="Add a feature the AI missed…"
                        className="flex-1 rounded-lg border border-purple-200 bg-white px-sm py-xs text-xs text-neutral-800 placeholder-purple-300 focus:outline-none focus:border-purple-400"
                      />
                      <button
                        onClick={() => {
                          if (!manualFeatureInput.trim()) return
                          const current = Array.isArray(pendingScanFeatures?.extras) ? pendingScanFeatures!.extras : []
                          setPendingScanFeatures({ ...pendingScanFeatures!, extras: [...current, manualFeatureInput.trim()] })
                          setManualFeatureInput('')
                        }}
                        className="px-sm py-xs rounded-lg bg-purple-100 text-purple-700 text-xs font-semibold hover:bg-purple-200 transition shrink-0"
                      >
                        Add
                      </button>
                    </div>
                    <button
                      onClick={acceptScanFeatures}
                      className="px-md py-xs rounded-lg bg-purple-700 text-white text-xs font-semibold hover:bg-purple-800 transition"
                    >
                      Save these features
                    </button>
                  </div>
                )
              })()}

              {/* ── AI feature summary strip ──────────────────────────────── */}
              {room.detected_features && Object.entries(room.detected_features).some(([, v]) => v && !(Array.isArray(v) && v.length === 0)) && (() => {
                const df = room.detected_features as Record<string, any>
                const featureRows = [
                  { key: 'flooring', label: 'Flooring' },
                  { key: 'natural_light', label: 'Light' },
                  { key: 'window_type', label: 'Windows' },
                  { key: 'window_treatment', label: 'Curtains/blinds' },
                  { key: 'wardrobe', label: 'Wardrobe' },
                ].filter(({ key }) => df[key])
                const extras: string[] = Array.isArray(df.extras) ? df.extras : []
                return (
                  <div className="mt-xl pt-lg border-t border-neutral-100">
                    <div className="flex items-center justify-between gap-md mb-xs">
                      <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">✨ AI-detected features</p>
                      <button onClick={clearAllFeatures} className="text-xs text-neutral-400 hover:text-red-500 transition">
                        Clear all
                      </button>
                    </div>
                    <p className="text-xs text-neutral-400 mb-md">Remove anything that looks wrong — the rest feeds into advert copy.</p>
                    <div className="space-y-sm">
                      {featureRows.map(({ key, label }) => (
                        <div key={key} className="flex items-center gap-sm">
                          <span className="text-xs text-neutral-400 w-28 shrink-0">{label}</span>
                          <span className="inline-flex items-center gap-xs px-sm py-0.5 rounded-full bg-purple-50 border border-purple-200 text-xs font-medium text-purple-700">
                            {String(df[key])}
                            <button onClick={() => removeDetectedFeature(key)} className="text-purple-300 hover:text-red-500 transition leading-none">✕</button>
                          </span>
                        </div>
                      ))}
                      {extras.length > 0 && (
                        <div className="flex items-start gap-sm">
                          <span className="text-xs text-neutral-400 w-28 shrink-0 mt-0.5">Other</span>
                          <div className="flex flex-wrap gap-xs">
                            {extras.map((extra: string) => (
                              <span key={extra} className="inline-flex items-center gap-xs px-sm py-0.5 rounded-full bg-purple-50 border border-purple-200 text-xs font-medium text-purple-700">
                                {extra}
                                <button onClick={() => removeDetectedFeature('extras', extra)} className="text-purple-300 hover:text-red-500 transition leading-none">✕</button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Add more features manually */}
                    <div className="flex gap-xs mt-sm">
                      <input
                        type="text"
                        value={savedFeatureInput}
                        onChange={e => setSavedFeatureInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addSavedFeature(savedFeatureInput) }}
                        placeholder="Add a feature manually…"
                        className="flex-1 rounded-lg border border-neutral-200 bg-white px-sm py-xs text-xs text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-purple-300"
                      />
                      <button
                        onClick={() => addSavedFeature(savedFeatureInput)}
                        className="px-sm py-xs rounded-lg bg-neutral-100 text-neutral-600 text-xs font-semibold hover:bg-neutral-200 transition shrink-0"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── COMPLIANCE ──────────────────────────────────────────────────── */}
          {activeTab === 'compliance' && (
            <div>
              <div className="flex items-center justify-between gap-md mb-md flex-wrap">
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400">Tenant safety checks</h2>
                <div className="flex gap-xs">
                  {(['all', 'fire_door', 'smoke_alarm'] as ComplianceFilter[]).map(f => (
                    <button
                      key={f}
                      onClick={() => setComplianceFilter(f)}
                      className={`px-md py-xs rounded-lg text-xs font-semibold transition-colors border ${
                        complianceFilter === f
                          ? 'bg-neutral-900 text-white border-neutral-900'
                          : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
                      }`}
                    >
                      {f === 'all' ? 'All' : f === 'fire_door' ? '🚪 Fire Door' : '🟢 Smoke Alarm'}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-neutral-500 mb-lg">
                Photo checks submitted by tenants — room-scoped, spanning all tenancies. Most recent first.
              </p>

              {filteredChecks.length > 0 ? (
                <div className="space-y-sm">
                  {filteredChecks.map(check => (
                    <div key={check.id} className="flex gap-md items-start rounded-xl border border-neutral-200 bg-neutral-50 p-md">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl shrink-0 ${check.check_type === 'fire_door' ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                        {check.check_type === 'fire_door' ? '🚪' : '🟢'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-md flex-wrap">
                          <div>
                            <p className="text-sm font-semibold text-neutral-900">
                              {check.check_type === 'fire_door' ? 'Fire door' : 'Smoke alarm'}
                            </p>
                            <p className="text-xs text-neutral-500 mt-xs">
                              {fmtDate(check.request_sent_at)} · {check.tenantName}
                            </p>
                          </div>
                          <span className={`text-xs font-semibold px-sm py-0.5 rounded-full shrink-0 ${
                            check.tenant_response === 'confirmed_ok' ? 'bg-emerald-100 text-emerald-700' :
                            check.tenant_response === 'issue_reported' ? 'bg-red-100 text-red-700' :
                            'bg-neutral-100 text-neutral-500'
                          }`}>
                            {check.tenant_response === 'confirmed_ok' ? '✓ All clear' :
                             check.tenant_response === 'issue_reported' ? '⚠ Issue reported' :
                             check.response_received_at ? 'Responded' : 'Awaiting response'}
                          </span>
                        </div>
                        {check.issue_description && (
                          <p className="text-xs text-red-700 mt-sm bg-red-50 rounded-lg p-sm border border-red-100">{check.issue_description}</p>
                        )}
                        {check.photo_attachment_url && (
                          <a href={check.photo_attachment_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-xs mt-sm text-xs text-blue-600 hover:text-blue-800 font-medium">
                            📷 View photo
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-2xl text-neutral-400">
                  <div className="text-3xl mb-sm opacity-40">
                    {complianceFilter === 'fire_door' ? '🚪' : complianceFilter === 'smoke_alarm' ? '🟢' : '✅'}
                  </div>
                  <p className="text-sm font-medium">
                    No {complianceFilter === 'all' ? '' : complianceFilter === 'fire_door' ? 'fire door ' : 'smoke alarm '}checks recorded yet
                  </p>
                  <p className="text-xs mt-xs">Checks are submitted by tenants via the tenant app</p>
                </div>
              )}
            </div>
          )}

          {/* ── NOTES ───────────────────────────────────────────────────────── */}
          {activeTab === 'notes' && (
            <div className="space-y-xl">
              {/* Add note */}
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Add a note</h2>
                {noteBanner && (
                  <div className="mb-md rounded-lg bg-blue-50 border border-blue-200 px-lg py-sm text-sm text-blue-800">{noteBanner}</div>
                )}
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-md space-y-sm">
                  <p className="text-xs text-neutral-500">Notes here are scoped to this room and tied to the active context (current tenant). They are visible to admins only.</p>
                  <textarea
                    value={newNoteText}
                    onChange={e => setNewNoteText(e.target.value)}
                    rows={3}
                    placeholder="e.g. Tenant has asked to avoid viewings before 10am on weekdays…"
                    className="w-full rounded-lg border border-neutral-200 px-md py-sm text-sm text-neutral-900 resize-y focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 outline-none bg-white"
                  />
                  <button
                    onClick={addNote}
                    disabled={savingNote || !newNoteText.trim()}
                    className="px-md py-xs rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 transition"
                  >
                    {savingNote ? 'Saving…' : 'Add note'}
                  </button>
                </div>
              </div>

              {/* Existing notes */}
              {roomNotes.length > 0 && (
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Notes ({roomNotes.length})</h2>
                  <div className="space-y-sm">
                    {roomNotes.map(note => (
                      <div key={note.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-md">
                        <div className="flex items-center gap-sm mb-sm text-xs text-neutral-500">
                          <span className="font-semibold text-neutral-700">{note.authorName || 'Admin'}</span>
                          <span>·</span>
                          <span>{fmtDate(note.created_at)}</span>
                          {currentTenancy && <span className="ml-xs rounded-full bg-blue-50 border border-blue-100 px-sm py-0.5 text-blue-600">re: {displayName(currentTenancy.person) || 'current tenant'}</span>}
                        </div>
                        <p className="text-sm text-neutral-900 leading-relaxed">{note.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {roomNotes.length === 0 && (
                <div className="text-center py-xl text-neutral-400">
                  <p className="text-sm font-medium">No notes for this room yet</p>
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
