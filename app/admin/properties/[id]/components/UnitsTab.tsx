'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { adminFetch } from '@/lib/adminFetch'
import { genTenancyRefs } from '@/lib/references'
import SetOnNoticeModal, { OnNoticeData } from '@/app/components/SetOnNoticeModal'
import { buildPaymentRef } from '@/lib/tenancy/paymentRef'
import { fiveWeeksDeposit, oneWeekRent } from '@/lib/tenancy/deposit'
import { resolveFee, describeFee } from '@/lib/fees/managementFee'

/* ─── Types ─────────────────────────────────────────────── */

interface RoomRow {
  id: string
  name: string
  unit_code: string | null
  property_id: string
  room_type: string | null
  description: string | null
  status: string | null
  current_asking_rent: number | null
  currentTenant: { name: string; email: string } | null
  tenancyInfo: { start_date: string; rent_amount: number | null } | null
  tenancyId: string | null
  /** Populated for on-notice rooms so Edit Notice can pre-fill the modal */
  tenancyEndDate: string | null
  tenancyNoticeReceivedDate: string | null
}

interface TenancyDetail {
  id: string
  start_date: string
  end_date: string | null
  rent_amount: number | null
  deposit_amount: number | null
  deposit_held_by: string | null
  deposit_scheme_ref: string | null
  lease_reference: string | null
  person_id: string
  person: {
    id: string
    full_name: string | null
    first_name: string | null
    last_name: string | null
    email: string
    phone: string | null
    occupation: string | null
  } | null
}

interface RoomDetail extends RoomRow {
  tenancy: TenancyDetail | null
  /** Future tenancy already lined up (start_date > today) */
  nextTenancy: TenancyDetail | null
}

interface RoomPhoto {
  id: string
  url: string
}

interface UnitsTabProps {
  propertyId: string
  bedrooms: number
  initialRoomId?: string
  propertyName?: string
  propertyAddress?: string
  propertyCode?: string | null
}

interface CleanerOption {
  id: string
  name: string
  email?: string
  phone?: string
}

interface ContractorOption {
  id: string
  name: string
  email?: string
}

type View = 'list' | 'room'

/* ─── Helpers ────────────────────────────────────────────── */

function tenantDisplayName(p: TenancyDetail['person']): string {
  if (!p) return '—'
  return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email
}

function initials(p: TenancyDetail['person']): string {
  if (!p) return '?'
  const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email
  return name.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join('')
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtRent(r: number | null | undefined): string {
  if (!r) return '—'
  return `£${r.toLocaleString()} pcm`
}

function statusPill(room: RoomRow) {
  if (room.currentTenant) {
    const isOnNotice = room.tenancyInfo?.start_date &&
      room.status === 'on_notice'
    if (isOnNotice) {
      return <span className="text-xs font-semibold px-sm py-xs rounded-full bg-amber-100 text-amber-800">On notice</span>
    }
    return <span className="text-xs font-semibold px-sm py-xs rounded-full bg-green-100 text-green-800">Occupied</span>
  }
  return <span className="text-xs font-semibold px-sm py-xs rounded-full bg-neutral-100 text-neutral-500">Vacant</span>
}

/* ─── Component ──────────────────────────────────────────── */

export default function UnitsTab({ propertyId, bedrooms, initialRoomId, propertyName, propertyAddress, propertyCode }: UnitsTabProps) {
  // a tenancy's letting file; Back returns to this room on this property
  const lettingFile = (tenancyId: string) => `/admin/lettings/${tenancyId}?from=${encodeURIComponent(`/admin/properties/${propertyId}?tab=units&room=${selectedRoom?.id ?? ''}`)}`
  const router = useRouter()
  const supabase = createClient()

  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [roomPhotos, setRoomPhotos] = useState<Record<string, RoomPhoto[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Drill-down
  const [view, setView] = useState<View>('list')
  const [selectedRoom, setSelectedRoom] = useState<RoomDetail | null>(null)
  const [pastTenancies, setPastTenancies] = useState<TenancyDetail[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  // Mark on notice modal (first-time checkout flow)
  const [onNoticeForRoom, setOnNoticeForRoom] = useState<RoomRow | null>(null)
  const [cleaners, setCleaners] = useState<CleanerOption[]>([])
  const [contractors, setContractors] = useState<ContractorOption[]>([])

  // Lightweight on-notice quick-edit (marketing rent / dates — no emails)
  const [quickEditNotice, setQuickEditNotice] = useState<RoomRow | null>(null)
  const [quickEditRent, setQuickEditRent] = useState('')
  const [quickEditMoveOut, setQuickEditMoveOut] = useState('')
  const [quickEditSaving, setQuickEditSaving] = useState(false)

  // Inline marketing rent edit (in Option D right panel)
  const [editingMktgRent, setEditingMktgRent] = useState(false)
  const [mktgRentValue, setMktgRentValue] = useState('')

  // Confirm departure (on-notice → available)
  const [confirmDepartureRoom, setConfirmDepartureRoom] = useState<RoomRow | null>(null)
  const [actualDepartureDate, setActualDepartureDate] = useState('')
  const [departureConfirming, setDepartureConfirming] = useState(false)

  // Add new tenancy (available → occupied)
  const [addingTenancyRoom, setAddingTenancyRoom] = useState<RoomRow | null>(null)
  const [newTenancyPersonSearch, setNewTenancyPersonSearch] = useState('')
  const [newTenancyPersonResults, setNewTenancyPersonResults] = useState<{ id: string; name: string; email: string }[]>([])
  const [newTenancyPerson, setNewTenancyPerson] = useState<{ id: string; name: string; email: string } | null>(null)
  const [newTenancyStart, setNewTenancyStart] = useState('')
  const [newTenancyEnd, setNewTenancyEnd] = useState('')
  const [newTenancyTermMonths, setNewTenancyTermMonths] = useState('')
  const [newTenancyRent, setNewTenancyRent] = useState('')
  const [newTenancyRentFrequency, setNewTenancyRentFrequency] = useState<'monthly'|'weekly'|'fortnightly'>('monthly')
  const [newTenancyRentDueDay, setNewTenancyRentDueDay] = useState('1')
  const [newTenancyRentInAdvance, setNewTenancyRentInAdvance] = useState('1')
  const [newTenancyDeposit, setNewTenancyDeposit] = useState('')
  const [newTenancyDepositHeldBy, setNewTenancyDepositHeldBy] = useState<'agent'|'landlord'>('agent')
  const [newTenancyDepositSchemeRef, setNewTenancyDepositSchemeRef] = useState('')
  const [newTenancyType, setNewTenancyType] = useState<'standard'|'short_term'>('standard')
  const [newTenancyAgreementType, setNewTenancyAgreementType] = useState<string>('assured_periodic')
  const [newTenancyIsPeriodic, setNewTenancyIsPeriodic] = useState(true)
  const [newTenancyHoldingDeposit, setNewTenancyHoldingDeposit] = useState('')
  const [newTenancyRentReviewDate, setNewTenancyRentReviewDate] = useState('')
  const [newTenancyNoticePeriodMonths, setNewTenancyNoticePeriodMonths] = useState('2')
  const [newTenancyBreakClauseMonths, setNewTenancyBreakClauseMonths] = useState('')
  const [newTenancyTerminationDate, setNewTenancyTerminationDate] = useState('')
  const [newTenancySpecialClauses, setNewTenancySpecialClauses] = useState('')
  const [newTenancyPermittedOccupiers, setNewTenancyPermittedOccupiers] = useState('')
  const [newTenancyOfficeNotes, setNewTenancyOfficeNotes] = useState('')
  const [newTenancyLeaseRef, setNewTenancyLeaseRef] = useState('')
  const [newTenancyPaymentRef, setNewTenancyPaymentRef] = useState('')
  // letting fee: % of the monthly rent, % of the rent over the whole term, a fixed amount, or none
  const [newTenancyFeeMode, setNewTenancyFeeMode] = useState<'pct_month' | 'pct_term' | 'fixed' | 'none'>('pct_month')
  const [newTenancyFeeValue, setNewTenancyFeeValue] = useState('75')
  // management fee: the property's standard fee unless this tenancy was agreed differently
  const [newTenancyMgmtType, setNewTenancyMgmtType] = useState<'property' | 'pct_received' | 'pct_charged' | 'fixed'>('property')
  const [newTenancyMgmtValue, setNewTenancyMgmtValue] = useState('')
  const [propertyFee, setPropertyFee] = useState<any>(null)
  useEffect(() => {
    supabase.from('properties').select('management_fee_type, management_fee_pct, management_fee_fixed').eq('id', propertyId).maybeSingle()
      .then(({ data }) => setPropertyFee(data ?? null))
  }, [propertyId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [newTenancySaving, setNewTenancySaving] = useState(false)
  const [showTenancyExtended, setShowTenancyExtended] = useState(false)

  // Applicant pre-fill
  const [roomApplicant, setRoomApplicant] = useState<{ id: string; name: string; email: string; phone: string | null; offered_rent: number | null } | null>(null)

  // Add / edit modals
  const [isAddingRoom, setIsAddingRoom] = useState(false)
  const [editingRoom, setEditingRoom] = useState<RoomRow | null>(null)
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomDescription, setNewRoomDescription] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => { loadRooms() }, [propertyId])

  // Auto-open a specific room when initialRoomId is provided (e.g. from All Units deep link)
  useEffect(() => {
    if (initialRoomId && rooms.length > 0) {
      const room = rooms.find(r => r.id === initialRoomId)
      if (room) openRoom(room)
    }
  }, [initialRoomId, rooms])

  /* ── Data loading ── */

  async function loadRooms() {
    setLoading(true)
    const { data: roomsData, error: roomsErr } = await supabase
      .from('rooms')
      .select('id, name, unit_code, property_id, room_type, description, status, current_asking_rent, created_at, updated_at')
      .eq('property_id', propertyId)
      .order('unit_code', { ascending: true, nullsLast: true })

    if (roomsErr) {
      setError('Failed to load rooms')
      setLoading(false)
      return
    }

    const today = new Date().toISOString().split('T')[0]
    const enriched = await Promise.all(
      (roomsData || []).map(async (room) => {
        const { data: tenancy } = await supabase
          .from('tenancies')
          .select('id, person_id, start_date, end_date, notice_received_date, rent_amount, people!person_id(id, full_name, first_name, last_name, email)')
          .eq('room_id', room.id)
          .lte('start_date', today)   // the tenant living there now — not someone let agreed to move in later
          .or(`end_date.is.null,end_date.gte.${today}`)
          .order('end_date', { ascending: false, nullsFirst: true })
          .limit(1)
          .maybeSingle()

        const p = tenancy?.people as any
        const tenantName = p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.email || null

        return {
          ...room,
          currentTenant: tenantName ? { name: tenantName, email: p?.email || '' } : null,
          tenancyInfo: tenancy ? { start_date: tenancy.start_date, rent_amount: tenancy.rent_amount } : null,
          tenancyId: tenancy?.id || null,
          tenancyEndDate: (tenancy as any)?.end_date ?? null,
          tenancyNoticeReceivedDate: (tenancy as any)?.notice_received_date ?? null,
          current_asking_rent: (room as any).current_asking_rent ?? null,
        } as RoomRow
      })
    )

    enriched.sort((a, b) =>
      String(a.unit_code || a.name || '').localeCompare(String(b.unit_code || b.name || ''), undefined, { numeric: true })
    )
    setRooms(enriched)

    // Fetch room-tagged photos in one batch
    const roomIds = enriched.map(r => r.id)
    if (roomIds.length > 0) {
      const { data: photosData } = await supabase
        .from('property_photos')
        .select('id, file_url, room_id')
        .in('room_id', roomIds)
      const byRoom: Record<string, RoomPhoto[]> = {}
      for (const p of (photosData || []) as any[]) {
        if (p.room_id) (byRoom[p.room_id] ||= []).push({ id: p.id, url: p.file_url })
      }
      setRoomPhotos(byRoom)
    }

    setLoading(false)
  }

  async function loadCleanersAndContractors() {
    const supabase2 = createClient()
    const [{ data: cleanerData }, { data: contractorData }] = await Promise.all([
      supabase2.from('people').select('id, first_name, last_name, full_name, email, phone').eq('role', 'cleaner').order('first_name'),
      supabase2.from('people').select('id, first_name, last_name, full_name, email').eq('role', 'contractor').order('first_name'),
    ])
    setCleaners((cleanerData || []).map((p: any) => ({
      id: p.id,
      name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email,
      email: p.email,
      phone: p.phone,
    })))
    setContractors((contractorData || []).map((p: any) => ({
      id: p.id,
      name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email,
      email: p.email,
    })))
  }

  function openOnNotice(room: RoomRow, e: React.MouseEvent) {
    e.stopPropagation() // don't also open the room drill-down
    loadCleanersAndContractors()
    setOnNoticeForRoom(room)
  }

  function openQuickEditNotice(room: RoomRow, e: React.MouseEvent) {
    e.stopPropagation()
    setQuickEditNotice(room)
    setQuickEditRent(room.current_asking_rent ? String(room.current_asking_rent) : '')
    setQuickEditMoveOut(room.tenancyEndDate ?? '')
  }

  async function handleSaveQuickEditNotice() {
    if (!quickEditNotice) return
    setQuickEditSaving(true)
    setError(null)
    try {
      // Update marketing rent on the room
      const askingRent = quickEditRent && !isNaN(Number(quickEditRent)) && Number(quickEditRent) > 0
        ? Number(quickEditRent) : null
      const { error: roomErr } = await supabase
        .from('rooms')
        .update({ current_asking_rent: askingRent })
        .eq('id', quickEditNotice.id)
      if (roomErr) throw roomErr

      // Update move-out date on the tenancy if it changed
      if (quickEditMoveOut && quickEditNotice.tenancyId && quickEditMoveOut !== quickEditNotice.tenancyEndDate) {
        const { error: tenErr } = await supabase
          .from('tenancies')
          .update({ end_date: quickEditMoveOut })
          .eq('id', quickEditNotice.tenancyId)
        if (tenErr) throw tenErr
      }

      await loadRooms()
      setQuickEditNotice(null)
      setSuccess('Notice details updated')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setQuickEditSaving(false)
    }
  }

  // ── Confirm departure: tenant has physically left, room becomes available ──
  async function handleConfirmDeparture() {
    if (!confirmDepartureRoom) return
    setDepartureConfirming(true)
    setError(null)
    try {
      // Update the tenancy end_date to the actual departure date if provided
      if (actualDepartureDate && confirmDepartureRoom.tenancyId) {
        await supabase.from('tenancies').update({ end_date: actualDepartureDate }).eq('id', confirmDepartureRoom.tenancyId)
      }
      // If a future tenancy is already lined up, go straight to occupied; otherwise available
      const hasNextTenant = !!(selectedRoom?.id === confirmDepartureRoom.id && selectedRoom.nextTenancy)
      const { error: roomErr } = await supabase.from('rooms').update({ status: hasNextTenant ? 'occupied' : 'available' }).eq('id', confirmDepartureRoom.id)
      if (roomErr) throw roomErr
      await loadRooms()
      setConfirmDepartureRoom(null)
      // If we're in drill-down, reload the room detail
      if (selectedRoom?.id === confirmDepartureRoom.id) {
        const refreshed = await supabase.from('rooms').select('id, name, unit_code, property_id, room_type, description, status, current_asking_rent').eq('id', confirmDepartureRoom.id).maybeSingle()
        if (refreshed.data) setSelectedRoom({ ...selectedRoom, ...(refreshed.data as any), tenancy: null })
      }
      setSuccess('Tenancy closed — room is now available')
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: any) {
      setError(err.message || 'Failed to confirm departure')
    } finally {
      setDepartureConfirming(false)
    }
  }

  // ── Load active applicant for room when modal opens ──
  useEffect(() => {
    if (!addingTenancyRoom) { setRoomApplicant(null); return }
    supabase
      .from('applicants')
      .select('id, full_name, email, phone, offered_rent, pipeline_stage')
      .eq('room_id', addingTenancyRoom.id)
      .in('pipeline_stage', ['offer_sent', 'offer_accepted', 'referencing', 'applied'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setRoomApplicant({ id: data.id, name: data.full_name, email: data.email, phone: data.phone, offered_rent: data.offered_rent })
      })
  }, [addingTenancyRoom])

  // ── Person search for add tenancy modal ──
  async function searchPeople(q: string) {
    if (q.length < 2) { setNewTenancyPersonResults([]); return }
    const { data } = await supabase
      .from('people')
      .select('id, first_name, last_name, full_name, email')
      .or(`full_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(8)
    setNewTenancyPersonResults((data || []).map((p: any) => ({
      id: p.id,
      name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email,
      email: p.email,
    })))
  }

  // months in the tenancy term: the term box, or worked out from the start and end dates
  function tenancyTermMonths(): number | null {
    if (Number(newTenancyTermMonths) > 0) return Number(newTenancyTermMonths)
    if (!newTenancyStart || !newTenancyEnd) return null
    const a = new Date(newTenancyStart + 'T12:00:00'), b = new Date(newTenancyEnd + 'T12:00:00')
    const m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() - 1 ? 0 : -1)
    return m > 0 ? m : null
  }
  /** The letting fee in £ for the chosen basis, or null when it can't be worked out yet. */
  function lettingFeeAmount(): number | null {
    const v = Number(newTenancyFeeValue), rent = Number(newTenancyRent)
    if (newTenancyFeeMode === 'none') return 0
    if (newTenancyFeeMode === 'fixed') return newTenancyFeeValue.trim() ? Math.round(v * 100) / 100 : null
    if (!rent || !newTenancyFeeValue.trim()) return null
    if (newTenancyFeeMode === 'pct_month') return Math.round(rent * v) / 100
    const months = tenancyTermMonths()
    return months ? Math.round(rent * months * v) / 100 : null
  }

  // ── Add new tenancy: create record + mark room occupied ──
  async function handleAddNewTenancy() {
    if (!addingTenancyRoom || !newTenancyPerson || !newTenancyStart || !newTenancyRent) {

      setError('Tenant, start date, and rent are required'); return
    }
    setNewTenancySaving(true)
    setError(null)
    try {
      // Auto-generate CR references if a property code exists and none was manually entered
      const refs = propertyCode
        ? await genTenancyRefs(supabase, propertyCode, addingTenancyRoom.name, addingTenancyRoom.id)
        : null
      const { error: tenErr } = await supabase.from('tenancies').insert({
        room_id: addingTenancyRoom.id,
        property_id: propertyId,
        person_id: newTenancyPerson.id,
        start_date: newTenancyStart,
        // an Assured Periodic Tenancy has no end date: it continues until notice is recorded
        end_date: newTenancyAgreementType === 'assured_periodic' ? null : (newTenancyEnd || null),
        rent_amount: Number(newTenancyRent),
        rent_due_day: Number(newTenancyRentDueDay) || 1,
        rent_frequency: newTenancyRentFrequency,
        rent_in_advance: Number(newTenancyRentInAdvance) || 1,
        deposit_amount: newTenancyDeposit ? Number(newTenancyDeposit) : null,
        deposit_held_by: newTenancyDepositHeldBy,
        deposit_scheme_ref: newTenancyDepositSchemeRef || null,
        agreement_type: newTenancyAgreementType,
        is_periodic: newTenancyIsPeriodic,
        holding_deposit_received: newTenancyHoldingDeposit ? Number(newTenancyHoldingDeposit) : null,
        // the fee as an amount (it was sent as true/false, so every save failed): what's typed, else the suggested
        // ¾ of a month's rent; 0 = no fee
        letting_fee_charged: lettingFeeAmount(),
        ...(newTenancyMgmtType === 'property' || newTenancyMgmtValue === '' ? {} : {
          management_fee_type: newTenancyMgmtType,
          management_fee_pct: newTenancyMgmtType === 'fixed' ? null : Number(newTenancyMgmtValue),
          management_fee_fixed: newTenancyMgmtType === 'fixed' ? Number(newTenancyMgmtValue) : null,
        }),
        rent_review_date: newTenancyRentReviewDate || null,
        notice_period_months: newTenancyNoticePeriodMonths ? Number(newTenancyNoticePeriodMonths) : null,
        break_clause_months: newTenancyBreakClauseMonths ? Number(newTenancyBreakClauseMonths) : null,
        termination_date: newTenancyTerminationDate || null,
        special_clauses: newTenancySpecialClauses || null,
        permitted_occupiers: newTenancyPermittedOccupiers || null,
        office_notes: newTenancyOfficeNotes || null,
        lease_reference: newTenancyLeaseRef || refs?.lease_reference || null,
        deposit_reference: refs?.deposit_reference || null,
        holding_deposit_reference: refs?.holding_deposit_reference || null,
        payment_reference: newTenancyPaymentRef.trim() || (propertyName ? buildPaymentRef(propertyName, addingTenancyRoom.name) : null),
      })
      if (tenErr) throw tenErr
      // Always mark occupied when a new tenancy is created — clears any stale on_notice from the previous tenant
      const { error: roomErr } = await supabase.from('rooms').update({ status: 'occupied' }).eq('id', addingTenancyRoom.id)
      if (roomErr) throw roomErr
      await loadRooms()
      setAddingTenancyRoom(null)
      setNewTenancyPerson(null)
      setNewTenancyPersonSearch('')
      setNewTenancyStart('')
      setNewTenancyEnd('')
      setNewTenancyTermMonths('')
      setNewTenancyRent('')
      setNewTenancyRentFrequency('monthly')
      setNewTenancyRentDueDay('1')
      setNewTenancyRentInAdvance('1')
      setNewTenancyDeposit('')
      setNewTenancyDepositHeldBy('agent')
      setNewTenancyDepositSchemeRef('')
      setNewTenancyType('standard')
      setNewTenancyAgreementType('assured_periodic')
      setNewTenancyIsPeriodic(true)
      setNewTenancyHoldingDeposit('')
      setNewTenancyFeeMode('pct_month')
      setNewTenancyFeeValue('75')
      setNewTenancyMgmtType('property'); setNewTenancyMgmtValue('')
      setRoomApplicant(null)
      setNewTenancyRentReviewDate('')
      setNewTenancyNoticePeriodMonths('2')
      setNewTenancyBreakClauseMonths('')
      setNewTenancyTerminationDate('')
      setNewTenancySpecialClauses('')
      setNewTenancyPermittedOccupiers('')
      setNewTenancyOfficeNotes('')
      setNewTenancyLeaseRef('')
      setShowTenancyExtended(false)
      setSuccess(`Tenancy created for ${newTenancyPerson.name}`)
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: any) {
      setError(err.message || 'Failed to create tenancy')
    } finally {
      setNewTenancySaving(false)
    }
  }

  async function handleConfirmOnNotice(noticeData: OnNoticeData) {
    if (!onNoticeForRoom) return
    const cleaner = cleaners.find(c => c.id === noticeData.cleanerId)
    const res = await adminFetch('/api/tenancies/set-on-notice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenancyId: onNoticeForRoom.tenancyId,
        roomId: onNoticeForRoom.id,
        moveOutDate: noticeData.moveOutDate,
        noticeReceivedDate: noticeData.noticeReceivedDate,
        newAskingRent: noticeData.newAskingRent,
        emailTenant: noticeData.emailTenant,
        tenantEmail: onNoticeForRoom.currentTenant?.email,
        tenantName: onNoticeForRoom.currentTenant?.name,
        checkoutEmailHtml: noticeData.checkoutEmailHtml,
        emailCleaner: noticeData.emailCleaner,
        cleanerId: noticeData.cleanerId,
        cleanerEmail: cleaner?.email,
        cleanerName: cleaner?.name,
        notesForLettings: noticeData.notesForLettings,
        pendingJobs: noticeData.pendingJobs ?? [],
        jobContractorId: noticeData.jobContractorId,
        propertyId,
        roomName: onNoticeForRoom.name,
        propertyAddress: propertyAddress || '',
      }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to mark on notice')
    }
    setOnNoticeForRoom(null)
    setSuccess('Tenancy marked as on notice')
    loadRooms() // refresh status pills
    if (selectedRoom?.id === onNoticeForRoom.id) setView('list') // exit drill-down
  }

  async function openRoom(room: RoomRow) {
    setDetailLoading(true)
    setSelectedRoom({ ...room, tenancy: null, nextTenancy: null })
    setPastTenancies([])
    setView('room')

    const today = new Date().toISOString().split('T')[0]
    const TENANCY_SELECT = `id, start_date, end_date, rent_amount, deposit_amount, deposit_held_by, deposit_scheme_ref, lease_reference, person_id, people!person_id(id, full_name, first_name, last_name, email, phone, occupation)`

    // Current tenancy: started on or before today, not yet ended
    const [{ data: currentRaw }, { data: nextRaw }, { data: pastRaw }] = await Promise.all([
      supabase.from('tenancies').select(TENANCY_SELECT)
        .eq('room_id', room.id)
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('start_date', { ascending: false })
        .limit(1).maybeSingle(),
      // Next/future tenancy: start_date strictly after today
      supabase.from('tenancies').select(TENANCY_SELECT)
        .eq('room_id', room.id)
        .gt('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)   // not a let that fell through
        .order('start_date', { ascending: true })
        .limit(1).maybeSingle(),
      // Past tenancies: ended before today
      supabase.from('tenancies').select(TENANCY_SELECT)
        .eq('room_id', room.id)
        .not('end_date', 'is', null)
        .lt('end_date', today)
        .order('end_date', { ascending: false }),
    ])

    function mapTenancy(raw: any): TenancyDetail | null {
      if (!raw) return null
      return {
        id: raw.id, start_date: raw.start_date, end_date: raw.end_date,
        rent_amount: raw.rent_amount, deposit_amount: raw.deposit_amount,
        deposit_held_by: raw.deposit_held_by, deposit_scheme_ref: raw.deposit_scheme_ref,
        lease_reference: raw.lease_reference, person_id: raw.person_id,
        person: raw.people || null,
      }
    }

    setSelectedRoom({ ...room, tenancy: mapTenancy(currentRaw), nextTenancy: mapTenancy(nextRaw) })
    setPastTenancies((pastRaw || []).map(mapTenancy).filter(Boolean) as TenancyDetail[])
    setDetailLoading(false)
  }

  // Mark a room let / available again without deleting anything (let-only rooms, or rooms let outside CROS)
  async function setRoomAvailability(room: RoomRow, status: 'occupied' | 'available') {
    let available_date: string | null | undefined = undefined
    if (status === 'available') {
      const d = window.prompt('Available from (YYYY-MM-DD)', new Date().toISOString().slice(0, 10))
      if (d === null) return
      available_date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date().toISOString().slice(0, 10)
    }
    const { error: e } = await supabase.from('rooms').update({ status, ...(available_date ? { available_date } : {}) }).eq('id', room.id)
    if (e) { setError(e.message); return }
    setSuccess(status === 'available' ? `${room.name} is available again — it’s back on Available Rooms` : `${room.name} marked as let`)
    setSelectedRoom(r => r && r.id === room.id ? { ...r, status } : r)
    loadRooms()
  }

  /* ── CRUD ── */

  async function handleAddRoom() {
    if (!newRoomName.trim()) { setError('Room name is required'); return }
    const { data, error: err } = await supabase
      .from('rooms')
      .insert({ property_id: propertyId, name: newRoomName, description: newRoomDescription || null })
      .select()
    if (err) { setError('Failed to create room'); return }
    if (data) {
      await loadRooms()
      setNewRoomName(''); setNewRoomDescription(''); setIsAddingRoom(false)
      setSuccess(`Room "${newRoomName}" created`)
      setTimeout(() => setSuccess(null), 3000)
    }
  }

  async function handleUpdateRoom() {
    if (!editingRoom?.name.trim()) { setError('Room name is required'); return }
    const askingRent = editingRoom.current_asking_rent && !isNaN(Number(editingRoom.current_asking_rent)) && Number(editingRoom.current_asking_rent) > 0
      ? Number(editingRoom.current_asking_rent) : null
    const { error: err } = await supabase
      .from('rooms').update({ name: editingRoom.name, description: editingRoom.description || null, unit_code: editingRoom.unit_code || null, room_type: editingRoom.room_type || null, current_asking_rent: askingRent })
      .eq('id', editingRoom.id)
    if (err) { setError('Failed to update room'); return }
    await loadRooms()
    setEditingRoom(null)
    setSuccess('Room updated')
    setTimeout(() => setSuccess(null), 3000)
  }

  async function handleDeleteRoom(roomId: string, roomName: string) {
    if (!confirm(`Delete room "${roomName}"? This cannot be undone.`)) return
    setDeleting(roomId)
    const { error: err } = await supabase.from('rooms').delete().eq('id', roomId)
    if (err) { setError('Failed to delete room'); setDeleting(null); return }
    setRooms(rooms.filter(r => r.id !== roomId))
    setSuccess('Room deleted')
    setTimeout(() => setSuccess(null), 3000)
    setDeleting(null)
    if (selectedRoom?.id === roomId) { setView('list'); setSelectedRoom(null) }
  }

  /* ── Render ── */

  if (loading) {
    return <div className="flex items-center justify-center py-2xl"><p className="text-sm text-neutral-400">Loading rooms…</p></div>
  }

  const tenantName = selectedRoom?.tenancy ? tenantDisplayName(selectedRoom.tenancy.person) : null

  return (
    <div>
      {/* Toast messages */}
      {error && (
        <div className="mb-lg p-md rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-500 mt-xs">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="mb-lg p-md rounded-lg bg-green-50 border border-green-200">
          <p className="text-sm text-green-700">✓ {success}</p>
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <div>
          <div className="flex items-center justify-between mb-lg">
            <p className="text-sm text-neutral-500">{rooms.length} room{rooms.length !== 1 ? 's' : ''} · {bedrooms} bedroom{bedrooms !== 1 ? 's' : ''} in record</p>
            <button
              onClick={() => setIsAddingRoom(true)}
              className="px-lg py-sm bg-neutral-900 text-white rounded-lg font-semibold text-sm hover:bg-neutral-700 transition"
            >
              + Add room
            </button>
          </div>

          {rooms.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 p-xl text-center">
              <p className="text-sm font-semibold text-neutral-700 mb-sm">No rooms yet</p>
              <p className="text-xs text-neutral-400 mb-lg">Add rooms to start managing this property</p>
              <button onClick={() => setIsAddingRoom(true)} className="px-lg py-sm bg-neutral-900 text-white rounded-lg font-semibold text-sm hover:bg-neutral-700 transition">
                + Add room
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 border-b border-neutral-200">
                    <th className="px-lg py-sm">Room</th>
                    <th className="px-lg py-sm hidden md:table-cell">Type</th>
                    <th className="px-lg py-sm">Tenant</th>
                    <th className="px-lg py-sm hidden sm:table-cell">Rent</th>
                    <th className="px-lg py-sm hidden lg:table-cell">Start</th>
                    <th className="px-lg py-sm hidden xl:table-cell">End</th>
                    <th className="px-lg py-sm text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr
                      key={room.id}
                      onClick={() => openRoom(room)}
                      className="border-t border-neutral-100 hover:bg-neutral-50 cursor-pointer transition-colors"
                    >
                      <td className="px-lg py-md">
                        <div className="flex items-center gap-sm">
                          {/* Room photo thumbnail */}
                          {roomPhotos[room.id]?.[0] ? (
                            <img
                              src={roomPhotos[room.id][0].url}
                              alt=""
                              className="w-10 h-10 rounded-md object-cover flex-shrink-0 bg-neutral-100"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-md bg-neutral-100 flex items-center justify-center flex-shrink-0 text-neutral-300 text-xs">
                              🖼
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-neutral-900">{room.unit_code || room.name}</p>
                            {room.unit_code && <p className="text-xs text-neutral-400">{room.name}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-lg py-md hidden md:table-cell text-neutral-500 text-xs">{room.room_type || '—'}</td>
                      <td className="px-lg py-md">
                        {room.currentTenant
                          ? <span className="font-medium text-neutral-900">{room.currentTenant.name || room.currentTenant.email}</span>
                          : <span className="text-neutral-400 italic">Vacant</span>}
                      </td>
                      <td className="px-lg py-md hidden sm:table-cell text-neutral-600">{fmtRent(room.tenancyInfo?.rent_amount)}</td>
                      <td className="px-lg py-md hidden lg:table-cell text-neutral-400 text-xs">{fmtDate(room.tenancyInfo?.start_date)}</td>
                      <td className="px-lg py-md hidden xl:table-cell text-xs">
                        {room.tenancyEndDate
                          ? <span className="text-amber-600 font-medium">{fmtDate(room.tenancyEndDate)}</span>
                          : <span className="text-neutral-300">—</span>}
                      </td>
                      <td className="px-lg py-md text-right">
                        <div className="flex items-center justify-end gap-sm">
                          {room.currentTenant && room.tenancyId && !room.tenancyNoticeReceivedDate && (
                            <button
                              onClick={(e) => openOnNotice(room, e)}
                              className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-sm py-xs hover:bg-amber-100 transition-colors whitespace-nowrap"
                            >
                              Mark on notice
                            </button>
                          )}
                          {room.currentTenant && room.tenancyNoticeReceivedDate && (
                            <button
                              onClick={(e) => openQuickEditNotice(room, e)}
                              className="text-xs font-semibold text-neutral-600 bg-white border border-neutral-300 rounded-lg px-sm py-xs hover:bg-neutral-50 transition-colors whitespace-nowrap"
                            >
                              ✏️ Edit notice
                            </button>
                          )}
                          {statusPill(room)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── ROOM DETAIL VIEW (Option D) ── */}
      {view === 'room' && selectedRoom && (
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-xs text-sm mb-lg">
            <button onClick={() => { setView('list'); setSelectedRoom(null) }} className="text-blue-600 hover:underline font-medium">
              ← All rooms
            </button>
            <span className="text-neutral-300">/</span>
            <span className="text-neutral-900 font-semibold">{selectedRoom.unit_code || selectedRoom.name}</span>
          </div>

          {detailLoading ? (
            <div className="flex items-center justify-center py-2xl"><p className="text-sm text-neutral-400">Loading…</p></div>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">

              {/* ── Stat bar ── */}
              <div className="grid grid-cols-4 border-b border-neutral-100">
                {[
                  { label: 'Room', value: selectedRoom.unit_code || selectedRoom.name, mono: true },
                  { label: 'Rent', value: selectedRoom.tenancy?.rent_amount ? `£${selectedRoom.tenancy.rent_amount.toLocaleString()} pcm` : '—' },
                  { label: 'Move-out', value: selectedRoom.tenancyEndDate ? fmtDate(selectedRoom.tenancyEndDate) : '—', amber: !!selectedRoom.tenancyEndDate },
                  { label: 'Status', status: true },
                ].map(({ label, value, mono, amber, status }) => (
                  <div key={label} className="px-lg py-md border-r border-neutral-100 last:border-r-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-xs">{label}</p>
                    {status
                      ? <div>{statusPill(selectedRoom)}</div>
                      : <p className={`text-sm font-semibold ${amber ? 'text-amber-700' : 'text-neutral-900'} ${mono ? 'font-mono text-xs tracking-wide text-neutral-500' : ''}`}>{value}</p>
                    }
                  </div>
                ))}
              </div>

              {/* ── Body: left tenant / right actions ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2">

                {/* LEFT — who's in the room */}
                <div className="px-xl py-lg border-b border-neutral-100 lg:border-b-0 lg:border-r">

                  {/* Current tenant */}
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-md">
                    {selectedRoom.status === 'on_notice' ? 'Outgoing tenant' : 'Current tenant'}
                  </p>

                  {selectedRoom.tenancy?.person ? (
                    <>
                      <div className="flex items-center gap-md mb-lg">
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                          {initials(selectedRoom.tenancy.person)}
                        </div>
                        <div>
                          <p className="font-semibold text-neutral-900">{tenantName}</p>
                          <p className="text-xs text-neutral-400">{selectedRoom.tenancy.person.email}</p>
                          {selectedRoom.tenancy.person.phone && <p className="text-xs text-neutral-400">{selectedRoom.tenancy.person.phone}</p>}
                        </div>
                        <button
                          onClick={() => router.push(`/admin/tenant/${selectedRoom.tenancy!.person?.id}`)}
                          className="ml-auto text-xs font-semibold text-neutral-600 border border-neutral-200 rounded-lg px-sm py-xs hover:bg-neutral-50 transition whitespace-nowrap"
                        >Profile →</button>
                      </div>

                      <div className="grid grid-cols-3 gap-sm mb-lg">
                        <div className="bg-neutral-50 rounded-lg px-sm py-xs">
                          <p className="text-[10px] text-neutral-400 mb-0.5">Rent</p>
                          <p className="text-sm font-semibold text-neutral-900">{fmtRent(selectedRoom.tenancy.rent_amount)}</p>
                        </div>
                        <div className="bg-neutral-50 rounded-lg px-sm py-xs">
                          <p className="text-[10px] text-neutral-400 mb-0.5">Start</p>
                          <p className="text-sm font-semibold text-neutral-900">{fmtDate(selectedRoom.tenancy.start_date)}</p>
                        </div>
                        <div className="bg-neutral-50 rounded-lg px-sm py-xs">
                          <p className="text-[10px] text-neutral-400 mb-0.5">End</p>
                          <p className={`text-sm font-semibold ${selectedRoom.tenancy.end_date ? 'text-amber-700' : 'text-neutral-400'}`}>
                            {fmtDate(selectedRoom.tenancy.end_date) || 'Rolling'}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-sm flex-wrap">
                        <button onClick={() => router.push(lettingFile(selectedRoom.tenancy!.id))}
                          className="text-xs font-semibold text-white bg-blue-700 border border-blue-700 rounded-lg px-sm py-xs hover:bg-blue-600 transition">
                          Letting file →
                        </button>
                        {/* the same Rent Review screen as the Lettings → Rent Reviews list */}
                        <button onClick={() => router.push(`/admin/rent-increase/${selectedRoom.tenancy!.id}`)}
                          className="text-xs font-semibold text-neutral-600 border border-neutral-200 rounded-lg px-sm py-xs hover:bg-neutral-50 transition">
                          Rent review
                        </button>
                        {!selectedRoom.tenancyNoticeReceivedDate && selectedRoom.tenancyId && (
                          <button onClick={(e) => openOnNotice(selectedRoom, e)}
                            className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-sm py-xs hover:bg-amber-100 transition">
                            Mark on notice
                          </button>
                        )}
                        {selectedRoom.tenancyNoticeReceivedDate && (
                          <button onClick={(e) => openQuickEditNotice(selectedRoom, e)}
                            className="text-xs font-semibold text-neutral-600 border border-neutral-200 rounded-lg px-sm py-xs hover:bg-neutral-50 transition">
                            ✏️ Edit notice
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-neutral-200 px-md py-lg text-center space-y-sm">
                      <p className="text-sm text-neutral-400">No current tenant</p>
                      {/* Rooms are never deleted — a let-only room (or one let outside CROS) is marked let, then made
                          available again later with its photos and marketing kept */}
                      {selectedRoom.status === 'available' ? (
                        <button onClick={() => setRoomAvailability(selectedRoom, 'occupied')}
                          className="text-xs font-semibold text-neutral-700 border border-neutral-300 rounded-lg px-sm py-xs hover:bg-neutral-50">
                          Mark as let
                        </button>
                      ) : (
                        <button onClick={() => setRoomAvailability(selectedRoom, 'available')}
                          className="text-xs font-semibold text-white bg-neutral-900 rounded-lg px-sm py-xs hover:bg-neutral-700">
                          Make available again
                        </button>
                      )}
                    </div>
                  )}

                  {/* Previous tenants */}
                  {pastTenancies.length > 0 && (
                    <div className="mt-lg pt-lg border-t border-neutral-100">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-md">Previous tenants</p>
                      <div className="space-y-sm">
                        {pastTenancies.map((pt) => {
                          const ptName = pt.person
                            ? (pt.person.full_name || [pt.person.first_name, pt.person.last_name].filter(Boolean).join(' ') || pt.person.email)
                            : 'Unknown'
                          return (
                            <div key={pt.id} className="flex items-center gap-md rounded-lg border border-neutral-100 bg-neutral-50 px-md py-sm">
                              <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-500 font-semibold text-xs flex-shrink-0">
                                {ptName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-neutral-700 truncate">{ptName}</p>
                                <p className="text-xs text-neutral-400">
                                  {fmtDate(pt.start_date)} – {fmtDate(pt.end_date!)}
                                  {pt.rent_amount ? ` · £${pt.rent_amount.toLocaleString()} pcm` : ''}
                                </p>
                              </div>
                              <button
                                onClick={() => router.push(lettingFile(pt.id))}
                                className="text-xs text-neutral-500 border border-neutral-200 rounded px-sm py-xs hover:bg-neutral-100 flex-shrink-0"
                              >File →</button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Incoming tenant (future tenancy already lined up) */}
                  {selectedRoom.nextTenancy?.person && (
                    <div className="mt-lg pt-lg border-t border-neutral-100">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mb-md">Incoming tenant</p>
                      <div className="flex items-center gap-md">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 font-bold text-sm flex-shrink-0">
                          {initials(selectedRoom.nextTenancy.person)}
                        </div>
                        <div>
                          <p className="font-semibold text-neutral-900">
                            {selectedRoom.nextTenancy.person.full_name || [selectedRoom.nextTenancy.person.first_name, selectedRoom.nextTenancy.person.last_name].filter(Boolean).join(' ')}
                          </p>
                          <p className="text-xs text-neutral-400">{selectedRoom.nextTenancy.person.email}</p>
                        </div>
                        <button onClick={() => router.push(lettingFile(selectedRoom.nextTenancy!.id))}
                          className="ml-auto text-xs font-semibold text-white bg-blue-700 rounded-lg px-sm py-xs hover:bg-blue-600 transition whitespace-nowrap">Letting file →</button>
                      </div>
                      <div className="grid grid-cols-2 gap-sm mt-md">
                        <div className="bg-emerald-50 rounded-lg px-sm py-xs">
                          <p className="text-[10px] text-emerald-600 mb-0.5">Moves in</p>
                          <p className="text-sm font-semibold text-emerald-800">{fmtDate(selectedRoom.nextTenancy.start_date)}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-lg px-sm py-xs">
                          <p className="text-[10px] text-emerald-600 mb-0.5">Rent</p>
                          <p className="text-sm font-semibold text-emerald-800">{fmtRent(selectedRoom.nextTenancy.rent_amount)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT — what to do next */}
                <div className="px-xl py-lg bg-neutral-50">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-md">What to do next</p>

                  <div className="space-y-sm">

                    {/* Marketing rent — always visible */}
                    <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-md py-sm gap-md">
                      <div className="flex items-center gap-md min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-base flex-shrink-0">💰</div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-neutral-900">Marketing rent</p>
                          <p className="text-xs text-neutral-400">Shown to prospective tenants in lettings</p>
                        </div>
                      </div>
                      {editingMktgRent ? (
                        <div className="flex items-center gap-xs flex-shrink-0">
                          <span className="text-sm text-neutral-500">£</span>
                          <input
                            type="number"
                            value={mktgRentValue}
                            onChange={e => setMktgRentValue(e.target.value)}
                            autoFocus
                            className="w-20 border border-neutral-300 rounded-md px-xs py-0.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-neutral-900"
                          />
                          <button
                            onClick={async () => {
                              const v = Number(mktgRentValue)
                              if (v > 0) {
                                await supabase.from('rooms').update({ current_asking_rent: v }).eq('id', selectedRoom.id)
                                setSelectedRoom({ ...selectedRoom, current_asking_rent: v })
                                await loadRooms()
                              }
                              setEditingMktgRent(false)
                            }}
                            className="text-xs font-semibold bg-neutral-900 text-white rounded-md px-sm py-0.5"
                          >Save</button>
                          <button onClick={() => setEditingMktgRent(false)} className="text-xs text-neutral-400">✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setMktgRentValue(selectedRoom.current_asking_rent ? String(selectedRoom.current_asking_rent) : ''); setEditingMktgRent(true) }}
                          className="text-xs font-semibold text-neutral-600 border border-neutral-200 rounded-lg px-sm py-xs hover:bg-neutral-50 transition flex-shrink-0"
                        >
                          {selectedRoom.current_asking_rent ? `£${selectedRoom.current_asking_rent}/mo` : 'Set rent'}
                        </button>
                      )}
                    </div>

                    {/* On-notice actions */}
                    {selectedRoom.status === 'on_notice' && (
                      <button
                        onClick={() => {
                          setConfirmDepartureRoom(selectedRoom)
                          setActualDepartureDate(selectedRoom.tenancyEndDate ?? new Date().toISOString().split('T')[0])
                        }}
                        className="w-full flex items-center gap-md rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-md py-sm transition text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-amber-200 flex items-center justify-center text-base flex-shrink-0">✓</div>
                        <div>
                          <p className="text-sm font-semibold text-amber-900">Confirm tenant has left</p>
                          <p className="text-xs text-amber-700">Closes tenancy · marks room available</p>
                        </div>
                      </button>
                    )}

                    {/* Line up next tenant — available even while on notice */}
                    {!selectedRoom.nextTenancy && (
                      <button
                        onClick={() => {
                          setAddingTenancyRoom(selectedRoom)
                          setNewTenancyStart(selectedRoom.tenancyEndDate
                            ? new Date(new Date(selectedRoom.tenancyEndDate).getTime() + 86400000).toISOString().split('T')[0]
                            : new Date().toISOString().split('T')[0])
                        }}
                        className={`w-full flex items-center gap-md rounded-xl border px-md py-sm transition text-left ${
                          selectedRoom.status === 'on_notice'
                            ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                            : 'border-neutral-200 bg-white hover:bg-neutral-50'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${selectedRoom.status === 'on_notice' ? 'bg-emerald-200' : 'bg-neutral-100'}`}>+</div>
                        <div>
                          <p className={`text-sm font-semibold ${selectedRoom.status === 'on_notice' ? 'text-emerald-900' : 'text-neutral-900'}`}>
                            {selectedRoom.status === 'on_notice' ? 'Line up next tenant' : 'Add new tenancy'}
                          </p>
                          <p className={`text-xs ${selectedRoom.status === 'on_notice' ? 'text-emerald-700' : 'text-neutral-400'}`}>
                            {selectedRoom.status === 'on_notice' ? 'Can be done before current tenant leaves' : 'Assign a tenant and start date'}
                          </p>
                        </div>
                      </button>
                    )}

                    {/* Available state: no actions beyond adding tenant */}
                    {selectedRoom.status === 'available' && (
                      <div className="rounded-xl border border-dashed border-neutral-300 px-md py-sm text-center">
                        <p className="text-xs text-neutral-400">Room is available — add a tenancy above to re-let it</p>
                      </div>
                    )}

                    {/* Room details row */}
                    <div className="pt-sm border-t border-neutral-200">
                      <div className="flex items-center gap-sm flex-wrap">
                        <span className="text-xs text-neutral-400">{selectedRoom.room_type || 'Type not set'}</span>
                        {selectedRoom.description && <span className="text-xs text-neutral-300">·</span>}
                        {selectedRoom.description && <span className="text-xs text-neutral-400 truncate max-w-[180px]">{selectedRoom.description}</span>}
                        <button onClick={() => setEditingRoom(selectedRoom)} className="ml-auto text-xs text-blue-600 hover:underline">Edit room</button>
                      </div>
                    </div>

                    {/* Section links */}
                    <div className="flex flex-wrap gap-xs pt-xs">
                      {[['Maintenance','🔧'],['Photos','📷'],['Compliance','✅'],['Notes','📝']].map(([label, icon]) => (
                        <button key={label}
                          onClick={() => router.push(`/admin/properties/${propertyId}/rooms/${selectedRoom.id}`)}
                          className="flex items-center gap-xs text-xs text-neutral-500 border border-neutral-200 bg-white rounded-lg px-sm py-xs hover:bg-neutral-50 transition">
                          <span>{icon}</span>{label}
                        </button>
                      ))}
                      <button
                        onClick={() => handleDeleteRoom(selectedRoom.id, selectedRoom.name)}
                        disabled={deleting === selectedRoom.id}
                        className="text-xs text-red-400 hover:text-red-600 transition disabled:opacity-50 ml-auto">
                        {deleting === selectedRoom.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CONFIRM DEPARTURE MODAL ── */}
      {confirmDepartureRoom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
          <div className="bg-white rounded-xl shadow-xl p-xl max-w-sm w-full border border-neutral-200">
            <div className="flex items-center justify-between mb-lg">
              <h3 className="text-lg font-semibold text-neutral-900">Confirm departure</h3>
              <button onClick={() => setConfirmDepartureRoom(null)} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none">✕</button>
            </div>
            <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-md py-sm mb-lg">
              <p className="text-sm font-semibold text-neutral-800">{confirmDepartureRoom.currentTenant?.name}</p>
              <p className="text-xs text-neutral-500">{confirmDepartureRoom.unit_code || confirmDepartureRoom.name}</p>
            </div>
            <p className="text-sm text-neutral-600 mb-lg">Confirming departure will close this tenancy and mark the room as available for re-letting.</p>
            <div className="mb-lg">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm block">Actual departure date</label>
              <input
                type="date"
                value={actualDepartureDate}
                onChange={e => setActualDepartureDate(e.target.value)}
                className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                autoFocus
              />
              <p className="text-xs text-neutral-400 mt-xs">Updates the tenancy end date to the actual day they left.</p>
            </div>
            {error && <p className="mb-md text-sm text-red-600">{error}</p>}
            <div className="flex gap-md">
              <button onClick={() => setConfirmDepartureRoom(null)} className="flex-1 px-lg py-sm border border-neutral-200 text-neutral-700 rounded-lg font-semibold text-sm hover:bg-neutral-50 transition">Cancel</button>
              <button onClick={handleConfirmDeparture} disabled={departureConfirming} className="flex-1 px-lg py-sm bg-amber-700 text-white rounded-lg font-semibold text-sm hover:bg-amber-800 transition disabled:opacity-50">
                {departureConfirming ? 'Confirming…' : 'Confirm departure'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD NEW TENANCY MODAL ── */}
      {addingTenancyRoom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl border border-neutral-200 my-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-xl py-lg border-b border-neutral-100">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">New tenancy</p>
                <h3 className="text-lg font-bold text-neutral-900">{addingTenancyRoom.name}{propertyName ? `, ${propertyName.split(/\n+/).map(l => l.trim().replace(/,$/, '')).filter(Boolean).join(', ')}` : ''}</h3>
                <p className="text-xs text-neutral-500 mt-0.5">{addingTenancyRoom.unit_code ? `${addingTenancyRoom.unit_code} · ` : ''}{addingTenancyRoom.room_type ? String(addingTenancyRoom.room_type).replace(/_/g, ' ') : 'Room'}</p>
              </div>
              <button onClick={() => setAddingTenancyRoom(null)} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none">✕</button>
            </div>

            <div className="px-xl py-lg space-y-xl">

              {/* Applicant match banner */}
              {roomApplicant && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-md py-sm">
                  <div className="flex items-start justify-between gap-md">
                    <div>
                      <p className="text-xs font-semibold text-blue-900 mb-xs">Active applicant for this room</p>
                      <p className="text-sm font-semibold text-neutral-900">{roomApplicant.name}</p>
                      <p className="text-xs text-neutral-500">{roomApplicant.email}</p>
                      {roomApplicant.offered_rent && (
                        <p className="text-xs text-blue-700 mt-xs">Offered rent: <span className="font-semibold">£{roomApplicant.offered_rent.toLocaleString()}/mo</span></p>
                      )}
                    </div>
                    <a
                      href={`/admin/applicants/${roomApplicant.id}/create-tenancy`}
                      className="shrink-0 rounded-lg bg-blue-600 px-md py-sm text-xs font-semibold text-white hover:bg-blue-700 transition inline-block">
                      Set up tenancy →
                    </a>
                  </div>
                </div>
              )}

              {/* Tenant */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Tenant *</p>
                {newTenancyPerson ? (
                  <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-md py-sm">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{newTenancyPerson.name}</p>
                      <p className="text-xs text-neutral-500">{newTenancyPerson.email}</p>
                    </div>
                    <button onClick={() => { setNewTenancyPerson(null); setNewTenancyPersonSearch('') }} className="text-xs text-neutral-400 hover:text-neutral-600">Change</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={newTenancyPersonSearch}
                      onChange={e => { setNewTenancyPersonSearch(e.target.value); searchPeople(e.target.value) }}
                      placeholder="Search by name or email…"
                      className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                      autoFocus
                    />
                    {newTenancyPersonResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-xs bg-white border border-neutral-200 rounded-lg shadow-lg z-10 overflow-hidden">
                        {newTenancyPersonResults.map(p => (
                          <button key={p.id} onClick={() => { setNewTenancyPerson(p); setNewTenancyPersonResults([]) }}
                            className="w-full text-left px-md py-sm hover:bg-neutral-50 transition border-b border-neutral-100 last:border-0">
                            <p className="text-sm font-medium text-neutral-900">{p.name}</p>
                            <p className="text-xs text-neutral-400">{p.email}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── CORE DETAILS ── */}

              {/* Agreement type */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Agreement type</p>
                <div className="grid grid-cols-2 gap-sm">
                  {([
                    ['assured_periodic',  'Assured Periodic Tenancy'],
                    ['fixed_term',        'Fixed-term (initial period)'],
                    ['company_let',       'Company Let'],
                    ['licence',           'Licence Agreement'],
                  ] as const).map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => {
                        setNewTenancyAgreementType(val)
                        if (val === 'assured_periodic') { setNewTenancyType('standard'); setNewTenancyIsPeriodic(true) }
                        else if (val === 'fixed_term') { setNewTenancyType('short_term'); setNewTenancyIsPeriodic(true) }
                        else { setNewTenancyType('standard'); setNewTenancyIsPeriodic(false) }
                      }}
                      className={`rounded-lg border px-md py-sm text-sm font-medium text-left transition ${newTenancyAgreementType === val ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {newTenancyAgreementType === 'fixed_term' && (
                  <p className="text-[11px] text-neutral-400 mt-xs">Set an end date below — tenancy becomes periodic once the initial term expires.</p>
                )}
              </div>

              {/* Letting fee */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Letting fee (charged to landlord)</p>
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm mb-sm space-y-sm">
                  <div className="flex flex-wrap gap-xs">
                    {([
                      ['pct_month', '% of monthly rent', '75'],
                      ['pct_term', '% of rent for the term', '10'],
                      ['fixed', 'Fixed fee', ''],
                      ['none', 'No fee', ''],
                    ] as const).map(([mode, label, dflt]) => (
                      <button key={mode} type="button"
                        onClick={() => { setNewTenancyFeeMode(mode); if (newTenancyFeeMode !== mode) setNewTenancyFeeValue(dflt) }}
                        className={`rounded-lg border px-sm py-xs text-xs font-semibold ${newTenancyFeeMode === mode ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {newTenancyFeeMode !== 'none' && (
                    <div className="flex flex-wrap items-center gap-sm">
                      <span className="flex items-center rounded-lg border border-neutral-200 bg-white px-sm">
                        {newTenancyFeeMode === 'fixed' && <span className="text-sm text-neutral-400">£</span>}
                        <input type="number" step="0.01" min="0" inputMode="decimal" value={newTenancyFeeValue}
                          onChange={e => setNewTenancyFeeValue(e.target.value)}
                          className="w-20 py-xs px-xs text-sm text-neutral-900 focus:outline-none" />
                        {newTenancyFeeMode !== 'fixed' && <span className="text-sm text-neutral-400">%</span>}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {newTenancyFeeMode === 'pct_month' && 'of the monthly rent'}
                        {newTenancyFeeMode === 'pct_term' && (tenancyTermMonths() ? `of the rent over ${tenancyTermMonths()} months` : 'of the rent over the term — set the end date or term below')}
                        {newTenancyFeeMode === 'fixed' && 'fixed fee'}
                      </span>
                    </div>
                  )}
                  <p className="text-sm font-semibold text-neutral-900">
                    {newTenancyFeeMode === 'none' ? 'No letting fee'
                      : lettingFeeAmount() != null ? `Letting fee: £${lettingFeeAmount()!.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : newTenancyRent ? 'Letting fee: —' : 'Enter the rent to work out the fee'}
                  </p>
                </div>
              </div>

              {/* Management fee — the property's standard fee unless agreed differently for this tenancy */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Management fee (charged to landlord)</p>
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm flex flex-wrap items-center gap-sm">
                  <select value={newTenancyMgmtType} onChange={e => setNewTenancyMgmtType(e.target.value as any)} className="rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm">
                    <option value="property">Property’s standard fee — {describeFee(resolveFee(null, propertyFee))}</option>
                    <option value="pct_received">Different: % of rent received</option>
                    <option value="pct_charged">Different: % of rent charged</option>
                    <option value="fixed">Different: fixed £ a month</option>
                  </select>
                  {newTenancyMgmtType !== 'property' && (
                    <span className="flex items-center gap-xs text-sm">
                      {newTenancyMgmtType === 'fixed' && '£'}
                      <input type="number" min="0" step={newTenancyMgmtType === 'fixed' ? '0.01' : '0.5'} value={newTenancyMgmtValue} onChange={e => setNewTenancyMgmtValue(e.target.value)}
                        className="w-20 rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm" />
                      {newTenancyMgmtType !== 'fixed' && '%'}
                    </span>
                  )}
                  {newTenancyMgmtType === 'property' && resolveFee(null, propertyFee).source === 'none' && (
                    <span className="text-xs font-semibold text-red-700">The property has no fee set — set one here or on the property’s details.</span>
                  )}
                </div>
              </div>

              {/* Dates */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Dates</p>
                <div className="grid grid-cols-2 gap-md mb-sm">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-xs">Start date *</label>
                    <input type="date" value={newTenancyStart}
                      onChange={e => {
                        setNewTenancyStart(e.target.value)
                        if (newTenancyTermMonths && e.target.value) {
                          const d = new Date(e.target.value)
                          d.setMonth(d.getMonth() + Number(newTenancyTermMonths))
                          d.setDate(d.getDate() - 1)
                          setNewTenancyEnd(d.toISOString().split('T')[0])
                        }
                      }}
                      className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-xs">{newTenancyAgreementType === 'assured_periodic' ? 'Expected stay (months) — optional, for the letting fee' : 'Term (months) — auto-fills end date'}</label>
                    <input type="number" min="1" max="60" value={newTenancyTermMonths}
                      onChange={e => {
                        setNewTenancyTermMonths(e.target.value)
                        if (e.target.value && newTenancyStart) {
                          const d = new Date(newTenancyStart)
                          d.setMonth(d.getMonth() + Number(e.target.value))
                          d.setDate(d.getDate() - 1)
                          setNewTenancyEnd(d.toISOString().split('T')[0])
                        }
                      }}
                      placeholder="e.g. 12"
                      className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                  </div>
                </div>
                {/* An Assured Periodic Tenancy has no end date — it runs until notice is given (recorded with Mark on notice) */}
                {newTenancyAgreementType === 'assured_periodic' ? (
                  <p className="text-xs text-neutral-500">No end date — the tenancy runs until notice is given.</p>
                ) : (
                <div>
                  <label className="block text-xs text-neutral-500 mb-xs">
                    End date {newTenancyType === 'short_term' ? '*' : '(optional — leave blank for rolling)'}
                  </label>
                  <input type="date" value={newTenancyEnd} onChange={e => { setNewTenancyEnd(e.target.value); setNewTenancyTermMonths('') }}
                    className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                </div>
                )}
                {newTenancyType === 'standard' && newTenancyAgreementType !== 'assured_periodic' && (
                  <label className="flex items-center gap-sm mt-sm cursor-pointer">
                    <input type="checkbox" checked={newTenancyIsPeriodic} onChange={e => setNewTenancyIsPeriodic(e.target.checked)}
                      className="rounded border-neutral-300" />
                    <span className="text-xs text-neutral-600">Periodic — automatically rolls month-to-month after end date</span>
                  </label>
                )}
              </div>

              {/* Rent */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Rent</p>
                <div className="grid grid-cols-3 gap-md mb-sm">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-xs">Amount (£) *</label>
                    <div className="relative">
                      <span className="absolute left-sm top-1/2 -translate-y-1/2 text-neutral-400 text-sm">£</span>
                      <input type="number" value={newTenancyRent} onChange={e => setNewTenancyRent(e.target.value)} placeholder="925"
                        className="w-full pl-6 pr-sm py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-xs">Frequency</label>
                    <select value={newTenancyRentFrequency} onChange={e => setNewTenancyRentFrequency(e.target.value as any)}
                      className="w-full px-sm py-sm border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900">
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="fortnightly">Fortnightly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-xs">Due day</label>
                    <select value={newTenancyRentDueDay} onChange={e => setNewTenancyRentDueDay(e.target.value)}
                      className="w-full px-sm py-sm border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900">
                      {Array.from({length:28},(_,i)=>i+1).map(d => (
                        <option key={d} value={d}>{d}{d===1?'st':d===2?'nd':d===3?'rd':'th'}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-xs">Rent in advance (months)</label>
                  <select value={newTenancyRentInAdvance} onChange={e => setNewTenancyRentInAdvance(e.target.value)}
                    className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900">
                    {[1,2,3,6].map(n => <option key={n} value={n}>{n} month{n>1?'s':''} {n===1?'(standard)':n===2?'(two months upfront)':'('+n+' months upfront)'}</option>)}
                  </select>
                  {newTenancyRent && (() => {
                    const rentDue = Number(newTenancyRent) * Number(newTenancyRentInAdvance)
                    const depositBalance = newTenancyDeposit
                      ? Math.max(0, Number(newTenancyDeposit) - (newTenancyHoldingDeposit ? Number(newTenancyHoldingDeposit) : 0))
                      : 0
                    const total = rentDue + depositBalance
                    return (
                      <p className="text-[11px] text-neutral-400 mt-xs">
                        Rent due: £{rentDue.toLocaleString()}
                        {newTenancyDeposit ? ` + £${depositBalance.toLocaleString()} deposit balance = £${total.toLocaleString()} total due on move-in` : ''}
                        {newTenancyHoldingDeposit && newTenancyDeposit ? ` (holding deposit of £${Number(newTenancyHoldingDeposit).toLocaleString()} already received)` : ''}
                      </p>
                    )
                  })()}
                </div>
              </div>

              {/* Deposit */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Deposit</p>

                {/* Live deposit calculator */}
                {newTenancyRent && (() => {
                  const monthly = Number(newTenancyRent)
                  const fiveWks = fiveWeeksDeposit(monthly)   // monthly × 12 ÷ 52 × 5, to the penny
                  const oneMonth = monthly
                  const oneWeek = oneWeekRent(monthly)
                  return (
                    <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-md py-sm mb-md">
                      <div className="grid grid-cols-3 gap-md text-center">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-xs">5 weeks' rent</p>
                          <p className="text-base font-semibold text-neutral-900">£{fiveWks.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          <p className="text-[10px] text-neutral-400">Legal max (TFA 2019)</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-xs">1 month</p>
                          <p className="text-base font-semibold text-neutral-900">£{oneMonth.toLocaleString()}</p>
                          <p className="text-[10px] text-neutral-400">Equivalent</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-xs">Max holding deposit</p>
                          <p className="text-base font-semibold text-amber-700">£{oneWeek.toLocaleString()}</p>
                          <p className="text-[10px] text-neutral-400">1 week (statutory cap)</p>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* Full deposit charged */}
                <div className="mb-sm">
                  <label className="block text-xs text-neutral-500 mb-xs">Full deposit charged</label>
                  <div className="flex gap-sm items-center">
                    <div className="relative flex-1">
                      <span className="absolute left-sm top-1/2 -translate-y-1/2 text-neutral-400 text-sm">£</span>
                      <input type="number" value={newTenancyDeposit} onChange={e => setNewTenancyDeposit(e.target.value)} placeholder="0"
                        className="w-full pl-6 pr-sm py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                    </div>
                    {newTenancyRent && (
                      <>
                        <button type="button"
                          onClick={() => setNewTenancyDeposit(fiveWeeksDeposit(Number(newTenancyRent)).toFixed(2))}
                          className="px-sm py-sm border border-neutral-200 rounded-lg text-xs text-neutral-600 hover:bg-neutral-50 whitespace-nowrap">
                          Set 5 wks
                        </button>
                        <button type="button"
                          onClick={() => setNewTenancyDeposit(String(Number(newTenancyRent)))}
                          className="px-sm py-sm border border-neutral-200 rounded-lg text-xs text-neutral-600 hover:bg-neutral-50 whitespace-nowrap">
                          Set 1 month
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Held by */}
                <div className="mb-sm">
                  <label className="block text-xs text-neutral-500 mb-xs">Held by</label>
                  <div className="grid grid-cols-2 gap-sm">
                    {(['agent','landlord'] as const).map(v => (
                      <button key={v} type="button"
                        onClick={() => setNewTenancyDepositHeldBy(v)}
                        className={`rounded-lg border px-md py-sm text-sm font-medium transition ${newTenancyDepositHeldBy === v ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
                        {v === 'agent' ? 'Agent' : 'Landlord'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Holding deposit */}
                <div className="mb-sm">
                  <label className="block text-xs text-neutral-500 mb-xs">Holding deposit received</label>
                  <div className="flex gap-sm items-center">
                    <div className="relative flex-1">
                      <span className="absolute left-sm top-1/2 -translate-y-1/2 text-neutral-400 text-sm">£</span>
                      <input type="number" value={newTenancyHoldingDeposit} onChange={e => setNewTenancyHoldingDeposit(e.target.value)} placeholder="0"
                        className="w-full pl-6 pr-sm py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                    </div>
                    {newTenancyRent && (
                      <button type="button"
                        onClick={() => setNewTenancyHoldingDeposit(oneWeekRent(Number(newTenancyRent)).toFixed(2))}
                        className="px-sm py-sm border border-neutral-200 rounded-lg text-xs text-neutral-600 hover:bg-neutral-50 whitespace-nowrap">
                        Set max (1 wk)
                      </button>
                    )}
                  </div>
                  {newTenancyDeposit && newTenancyHoldingDeposit && (
                    <p className="text-[11px] text-neutral-500 mt-xs">
                      Balance due on move-in: <span className="font-semibold text-neutral-900">£{(Number(newTenancyDeposit) - Number(newTenancyHoldingDeposit)).toLocaleString()}</span> deposit remainder
                    </p>
                  )}
                </div>

                {/* Scheme ref */}
                <div>
                  <label className="block text-xs text-neutral-500 mb-xs">Deposit scheme reference</label>
                  <input type="text" value={newTenancyDepositSchemeRef} onChange={e => setNewTenancyDepositSchemeRef(e.target.value)}
                    placeholder="DPS / TDS / MyDeposits ref — complete after protection"
                    className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                </div>
              </div>

              {/* ── EXTENDED DETAILS toggle ── */}
              <div className="border-t border-neutral-100 pt-md">
                <button type="button" onClick={() => setShowTenancyExtended(v => !v)}
                  className="flex items-center gap-sm text-sm font-semibold text-blue-600 hover:text-blue-800 transition">
                  <span className={`transition-transform text-xs ${showTenancyExtended ? 'rotate-90' : ''}`}>▶</span>
                  {showTenancyExtended ? 'Hide extended details' : 'Add extended details'}
                  <span className="text-xs font-normal text-neutral-400 ml-xs">— notice, break clause, review date, clauses, notes</span>
                </button>

                {showTenancyExtended && (
                  <div className="mt-lg space-y-xl">

                    {/* Notice & break */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Notice &amp; break</p>
                      <div className="grid grid-cols-2 gap-md">
                        <div>
                          <label className="block text-xs text-neutral-500 mb-xs">Notice period (months)</label>
                          <input type="number" min="0" value={newTenancyNoticePeriodMonths} onChange={e => setNewTenancyNoticePeriodMonths(e.target.value)}
                            placeholder="2"
                            className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                        </div>
                        <div>
                          <label className="block text-xs text-neutral-500 mb-xs">Break clause (months from start)</label>
                          <input type="number" min="0" value={newTenancyBreakClauseMonths} onChange={e => setNewTenancyBreakClauseMonths(e.target.value)}
                            placeholder="e.g. 6"
                            className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                        </div>
                      </div>
                    </div>

                    {/* Review & termination */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Review &amp; termination</p>
                      <div className="grid grid-cols-2 gap-md">
                        <div>
                          <label className="block text-xs text-neutral-500 mb-xs">Rent review date</label>
                          <input type="date" value={newTenancyRentReviewDate} onChange={e => setNewTenancyRentReviewDate(e.target.value)}
                            className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                          <p className="text-[11px] text-neutral-400 mt-xs">When the next rent increase can be applied</p>
                        </div>
                        <div>
                          <label className="block text-xs text-neutral-500 mb-xs">Termination date</label>
                          <input type="date" value={newTenancyTerminationDate} onChange={e => setNewTenancyTerminationDate(e.target.value)}
                            className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                          <p className="text-[11px] text-neutral-400 mt-xs">Stops periodic rolling — any rent after this date is removed</p>
                        </div>
                      </div>
                    </div>

                    {/* Lease ref */}
                    <div>
                      <label className="block text-xs text-neutral-500 mb-xs">Tenancy reference</label>
                      <input type="text" value={newTenancyLeaseRef} onChange={e => setNewTenancyLeaseRef(e.target.value)}
                        placeholder="e.g. TEN-2024-CLH04"
                        className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                    </div>

                    {/* Special clauses */}
                    <div>
                      <label className="block text-xs text-neutral-500 mb-xs">Special / additional clauses</label>
                      <textarea value={newTenancySpecialClauses} onChange={e => setNewTenancySpecialClauses(e.target.value)}
                        rows={3} placeholder="Any additional terms to be included in the tenancy agreement…"
                        className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                    </div>

                    {/* Permitted occupiers */}
                    <div>
                      <label className="block text-xs text-neutral-500 mb-xs">Permitted occupiers</label>
                      <input type="text" value={newTenancyPermittedOccupiers} onChange={e => setNewTenancyPermittedOccupiers(e.target.value)}
                        placeholder="Names of any additional permitted occupiers (not on the tenancy)"
                        className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                    </div>

                    {/* Payment reference */}
                    <div>
                      <label className="block text-xs text-neutral-500 mb-xs">Payment reference <span className="text-neutral-400">(tenant uses this when paying rent)</span></label>
                      <input type="text" value={newTenancyPaymentRef} onChange={e => setNewTenancyPaymentRef(e.target.value.toUpperCase())}
                        placeholder={propertyName ? `${buildPaymentRef(propertyName, addingTenancyRoom?.name)} — used if left blank` : "e.g. 208ROS05"}
                        className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                    </div>

                    {/* Office notes */}
                    <div>
                      <label className="block text-xs text-neutral-500 mb-xs">Office notes (internal only)</label>
                      <textarea value={newTenancyOfficeNotes} onChange={e => setNewTenancyOfficeNotes(e.target.value)}
                        rows={3} placeholder="Internal notes — not visible to tenant or landlord…"
                        className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                    </div>

                  </div>
                )}
              </div>

            </div>

            {error && <p className="px-xl pb-md text-sm text-red-600">{error}</p>}

            <div className="flex gap-md px-xl py-lg border-t border-neutral-100">
              <button onClick={() => { setAddingTenancyRoom(null); setError(null) }}
                className="flex-1 px-lg py-sm border border-neutral-200 text-neutral-700 rounded-lg font-semibold text-sm hover:bg-neutral-50 transition">
                Cancel
              </button>
              <button onClick={handleAddNewTenancy} disabled={newTenancySaving || !newTenancyPerson || !newTenancyStart || !newTenancyRent}
                className="flex-1 px-lg py-sm bg-emerald-700 text-white rounded-lg font-semibold text-sm hover:bg-emerald-800 transition disabled:opacity-50">
                {newTenancySaving ? 'Creating…' : 'Create tenancy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ON NOTICE QUICK EDIT (marketing rent + move-out date, no emails) ── */}
      {quickEditNotice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
          <div className="bg-white rounded-xl shadow-xl p-xl max-w-sm w-full border border-neutral-200">
            <div className="flex items-center justify-between mb-lg">
              <h3 className="text-lg font-semibold text-neutral-900">Edit notice details</h3>
              <button onClick={() => setQuickEditNotice(null)} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none">✕</button>
            </div>

            {/* Room summary */}
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-md py-sm mb-lg">
              <p className="text-xs font-semibold text-amber-800">📋 On notice — {quickEditNotice.unit_code || quickEditNotice.name}</p>
              <p className="text-xs text-amber-700 mt-0.5">{quickEditNotice.currentTenant?.name}</p>
            </div>

            <div className="space-y-lg">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm block">Marketing rent (£/month)</label>
                <input
                  type="number"
                  value={quickEditRent}
                  onChange={e => setQuickEditRent(e.target.value)}
                  placeholder="e.g. 950"
                  autoFocus
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 text-neutral-900"
                />
                <p className="text-xs text-neutral-400 mt-xs">This is the rent shown to prospective tenants in lettings.</p>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm block">Move-out date</label>
                <input
                  type="date"
                  value={quickEditMoveOut}
                  onChange={e => setQuickEditMoveOut(e.target.value)}
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 text-neutral-900"
                />
              </div>
            </div>

            {error && <p className="mt-md text-sm text-red-600">{error}</p>}

            <div className="flex gap-md mt-xl">
              <button
                onClick={() => { setQuickEditNotice(null); setError(null) }}
                className="flex-1 px-lg py-sm border border-neutral-200 text-neutral-700 rounded-lg font-semibold text-sm hover:bg-neutral-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuickEditNotice}
                disabled={quickEditSaving}
                className="flex-1 px-lg py-sm bg-neutral-900 text-white rounded-lg font-semibold text-sm hover:bg-neutral-700 transition disabled:opacity-50"
              >
                {quickEditSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MARK ON NOTICE MODAL ── */}
      {onNoticeForRoom && (
        <SetOnNoticeModal
          tenancy={{
            id: onNoticeForRoom.tenancyId || '',
            person: onNoticeForRoom.currentTenant
              ? { name: onNoticeForRoom.currentTenant.name, email: onNoticeForRoom.currentTenant.email, phone: '' }
              : undefined,
            room: { name: onNoticeForRoom.name },
            property: { name: propertyName || '', address: propertyAddress || '' },
            rent_amount: onNoticeForRoom.tenancyInfo?.rent_amount || 0,
          }}
          cleaners={cleaners}
          contractors={contractors}
          onClose={() => setOnNoticeForRoom(null)}
          onConfirm={handleConfirmOnNotice}
          initialMoveOutDate={onNoticeForRoom.tenancyEndDate ?? undefined}
          initialNoticeReceivedDate={onNoticeForRoom.tenancyNoticeReceivedDate ?? undefined}
        />
      )}

            {/* ── ADD ROOM MODAL ── */}
      {isAddingRoom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
          <div className="bg-white rounded-xl shadow-xl p-xl max-w-md w-full border border-neutral-200">
            <h3 className="text-lg font-semibold text-neutral-900 mb-lg">Add room</h3>
            <div className="space-y-lg">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm block">Room name *</label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g. Room 1, Bedroom 3"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 text-neutral-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm block">Description (optional)</label>
                <textarea
                  value={newRoomDescription}
                  onChange={(e) => setNewRoomDescription(e.target.value)}
                  placeholder="e.g. Double room with en-suite"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 text-neutral-900"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-md mt-xl">
              <button onClick={() => { setIsAddingRoom(false); setNewRoomName(''); setNewRoomDescription(''); setError(null) }} className="flex-1 px-lg py-sm border border-neutral-200 text-neutral-700 rounded-lg font-semibold text-sm hover:bg-neutral-50 transition">Cancel</button>
              <button onClick={handleAddRoom} className="flex-1 px-lg py-sm bg-neutral-900 text-white rounded-lg font-semibold text-sm hover:bg-neutral-700 transition">Create room</button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT ROOM MODAL ── */}
      {editingRoom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
          <div className="bg-white rounded-xl shadow-xl p-xl max-w-md w-full border border-neutral-200">
            <h3 className="text-lg font-semibold text-neutral-900 mb-lg">Edit room</h3>
            <div className="space-y-lg">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm block">Room name *</label>
                <input
                  type="text"
                  value={editingRoom.name}
                  onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 text-neutral-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm block">Unit code</label>
                <input
                  type="text"
                  value={editingRoom.unit_code || ''}
                  onChange={(e) => setEditingRoom({ ...editingRoom, unit_code: e.target.value })}
                  placeholder="e.g. CR-001-R1"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 text-neutral-900"
                />
                <p className="text-xs text-amber-600 mt-xs">⚠ Only update if essential — unit codes rarely change.</p>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm block">Room type</label>
                <select
                  value={editingRoom.room_type || ''}
                  onChange={(e) => setEditingRoom({ ...editingRoom, room_type: e.target.value || null })}
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 text-neutral-900 bg-white"
                >
                  <option value="">— Not set —</option>
                  <option value="Small Double Room">Small Double Room</option>
                  <option value="Medium Double Room">Medium Double Room</option>
                  <option value="Large Double Room">Large Double Room</option>
                  <option value="Small Double Ensuite">Small Double Ensuite</option>
                  <option value="Medium Double Ensuite">Medium Double Ensuite</option>
                  <option value="Large Double Ensuite">Large Double Ensuite</option>
                  <option value="Single Room">Single Room</option>
                  <option value="Single Let">Single Let</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm block">Marketing rent (£/month)</label>
                <input
                  type="number"
                  value={editingRoom.current_asking_rent ?? ''}
                  onChange={(e) => setEditingRoom({ ...editingRoom, current_asking_rent: e.target.value ? Number(e.target.value) : null })}
                  placeholder="e.g. 925"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 text-neutral-900"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm block">Description</label>
                <textarea
                  value={editingRoom.description || ''}
                  onChange={(e) => setEditingRoom({ ...editingRoom, description: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 text-neutral-900"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-md mt-xl">
              <button onClick={() => { setEditingRoom(null); setError(null) }} className="flex-1 px-lg py-sm border border-neutral-200 text-neutral-700 rounded-lg font-semibold text-sm hover:bg-neutral-50 transition">Cancel</button>
              <button onClick={handleUpdateRoom} className="flex-1 px-lg py-sm bg-neutral-900 text-white rounded-lg font-semibold text-sm hover:bg-neutral-700 transition">Save changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
