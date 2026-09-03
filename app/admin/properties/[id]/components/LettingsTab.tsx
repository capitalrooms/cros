'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { buildIcs } from '@/lib/ics'

interface Viewing {
  id: string
  viewing_date: string
  viewing_slot: string | null
  visitor_name: string
  visitor_email: string | null
  visitor_phone: string | null
  room_id: string | null
  feedback: string | null
  viewing_status: string
  created_at: string
  room?: {
    name: string
  }
}

interface LettingsTabProps {
  propertyId: string
  rooms: Array<{ id: string; name: string }>
  propertyName?: string
  propertyAddress?: string
  propertyPostcode?: string
}

export default function LettingsTab({ propertyId, rooms, propertyName, propertyAddress, propertyPostcode }: LettingsTabProps) {
  const [viewings, setViewings] = useState<Viewing[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddingViewing, setIsAddingViewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showNotifyModal, setShowNotifyModal] = useState(false)
  const [selectedViewingForNotify, setSelectedViewingForNotify] = useState<Viewing | null>(null)
  const [notifyTemplate, setNotifyTemplate] = useState('viewing_notification')
  const [notifySending, setNotifySending] = useState(false)
  const [smsOffer, setSmsOffer] = useState<{ name: string; phone: string; date: string; slot: string | null; roomName: string } | null>(null)
  const [smsSending, setSmsSending] = useState(false)
  const [smsResult, setSmsResult] = useState<string | null>(null)
  // Offer to drop the booked viewing into the booker's own calendar (#8 Part B).
  const [calOffer, setCalOffer] = useState<{ title: string; date: string; time: string | null; location: string } | null>(null)
  const [calResult, setCalResult] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    visitor_name: '',
    visitor_email: '',
    visitor_phone: '',
    viewing_date: new Date().toISOString().split('T')[0],
    viewing_slot: '09:00',
    room_id: rooms[0]?.id || '',
    feedback: ''
  })

  const [roomList, setRoomList] = useState<Array<{
    id: string
    name: string
    status?: string
    current_asking_rent?: number | null
    available_date?: string | null
    has_ensuite?: boolean | null
    has_shared_bathroom?: boolean | null
    has_lounge?: boolean | null
    marketing_description?: string | null
  }>>(rooms)

  // Marketing copy state
  const [advertDrafts, setAdvertDrafts] = useState<Record<string, string>>({})
  const [generatingAdvert, setGeneratingAdvert] = useState<string | null>(null) // "roomId:format"
  const [savingAdvert, setSavingAdvert] = useState<string | null>(null)
  const [advertBanner, setAdvertBanner] = useState<string | null>(null)

  // Occasionally an applicant is shown a SECOND property in the same session.
  // Rather than a whole separate booking flow, we let the booker optionally add
  // one more property + room; it books a linked second viewing sharing the same
  // visitor and date. Kept intentionally lightweight (see 25 Aug notes #10).
  const [allProperties, setAllProperties] = useState<Array<{ id: string; name: string }>>([])
  const [secondEnabled, setSecondEnabled] = useState(false)
  const [secondRooms, setSecondRooms] = useState<Array<{ id: string; name: string }>>([])
  const [secondForm, setSecondForm] = useState({ property_id: '', room_id: '', viewing_slot: '' })

  const supabase = createClient()

  useEffect(() => {
    loadViewings()
    loadRooms()
    loadAllProperties()
  }, [propertyId])

  // Load the second property's rooms whenever it changes.
  useEffect(() => {
    if (!secondForm.property_id) { setSecondRooms([]); return }
    let active = true
    supabase.from('rooms').select('id, name').eq('property_id', secondForm.property_id).order('name').then(({ data }) => {
      if (!active) return
      setSecondRooms(data || [])
      setSecondForm((f) => ({ ...f, room_id: '' }))
    })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondForm.property_id])

  async function loadAllProperties() {
    // Everything except the property we're already on — that's the primary.
    const { data } = await supabase.from('properties').select('id, name').order('name')
    setAllProperties((data || []).filter((p: any) => p.id !== propertyId))
  }

  async function loadRooms() {
    const { data } = await supabase
      .from('rooms')
      .select('id, name, status, current_asking_rent, available_date, has_ensuite, has_shared_bathroom, has_lounge, marketing_description')
      .eq('property_id', propertyId)
      .order('name')
    const list = data && data.length > 0 ? data : rooms
    if (list && list.length > 0) {
      setRoomList(list)
      setFormData((f) => ({ ...f, room_id: f.room_id || list[0].id }))
      // Seed advert drafts from saved descriptions
      const drafts: Record<string, string> = {}
      for (const r of list) drafts[r.id] = (r as any).marketing_description || ''
      setAdvertDrafts(drafts)
    }
  }

  async function generateAdvert(room: any, format: 'listing' | 'group') {
    const key = `${room.id}:${format}`
    setGeneratingAdvert(key)
    try {
      const res = await fetch('/api/let-only/generate-advert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          room_id: room.id,
          property_id: propertyId,
          room_name: room.name,
          monthly_rent: room.current_asking_rent,
          available_date: room.available_date,
          has_ensuite: room.has_ensuite,
          has_shared_bathroom: room.has_shared_bathroom,
          has_lounge: room.has_lounge,
          detected_features: room.detected_features || null,
          address: propertyAddress || '',
          postcode: propertyPostcode || '',
        }),
      })
      const data = await res.json()
      if (data.advert) {
        setAdvertDrafts(prev => ({ ...prev, [room.id]: data.advert }))
      }
    } finally {
      setGeneratingAdvert(null)
    }
  }

  async function saveAdvert(roomId: string) {
    setSavingAdvert(roomId)
    await supabase
      .from('rooms')
      .update({ marketing_description: advertDrafts[roomId] || null })
      .eq('id', roomId)
    setRoomList(prev => prev.map(r => r.id === roomId ? { ...r, marketing_description: advertDrafts[roomId] } : r))
    setSavingAdvert(null)
    setAdvertBanner('Copy saved')
    setTimeout(() => setAdvertBanner(null), 2500)
  }

  async function loadViewings() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('viewings')
      .select('*, room:room_id(name)')
      .eq('property_id', propertyId)
      .gte('viewing_date', new Date().toISOString().split('T')[0])
      .order('viewing_date', { ascending: true })
      .limit(30)

    if (err) {
      setError('Failed to load viewings')
      console.error(err)
    } else {
      setViewings(data || [])
    }
    setLoading(false)
  }

  async function handleAddViewing() {
    if (!formData.visitor_name.trim()) {
      setError('Visitor name is required')
      return
    }

    if (!formData.viewing_date) {
      setError('Date is required')
      return
    }

    if (!formData.room_id) {
      setError('Please select a room')
      return
    }

    // Shared visitor + date across both viewings in a two-property session.
    const shared = {
      visitor_name: formData.visitor_name,
      visitor_email: formData.visitor_email || null,
      visitor_phone: formData.visitor_phone || null,
      viewing_date: formData.viewing_date,
      viewing_status: 'pending',
      feedback: formData.feedback || null,
    }

    const rows: any[] = [
      { ...shared, property_id: propertyId, room_id: formData.room_id || null, viewing_slot: formData.viewing_slot || null },
    ]

    const bookingSecond = secondEnabled && secondForm.property_id && secondForm.room_id
    if (bookingSecond) {
      rows.push({
        ...shared,
        property_id: secondForm.property_id,
        room_id: secondForm.room_id,
        // Default the second viewing a little later so they don't clash.
        viewing_slot: secondForm.viewing_slot || formData.viewing_slot || null,
      })
    }

    const { data, error: err } = await supabase
      .from('viewings')
      .insert(rows)
      .select()

    if (err) {
      setError('Failed to schedule viewing')
      console.error(err)
      return
    }

    if (data) {
      // Only the viewing(s) for THIS property belong in this tab's list; the
      // second (different property) shows on that property's own Lettings tab.
      const mine = data.filter((v: any) => v.property_id === propertyId)
      setViewings([...viewings, ...mine])
      // Offer to text the applicant a confirmation if we captured a phone number.
      if (formData.visitor_phone.trim()) {
        setSmsResult(null)
        setSmsOffer({
          name: formData.visitor_name,
          phone: formData.visitor_phone.trim(),
          date: formData.viewing_date,
          slot: formData.viewing_slot || null,
          roomName: roomList.find((r) => r.id === formData.room_id)?.name || '',
        })
      }

      // Offer to drop it into the booker's own calendar.
      const roomName = roomList.find((r) => r.id === formData.room_id)?.name || ''
      setCalResult(null)
      setCalOffer({
        title: `Viewing — ${formData.visitor_name}`,
        date: formData.viewing_date,
        time: formData.viewing_slot || null,
        location: [roomName, propertyAddress || propertyName].filter(Boolean).join(', '),
      })
      setFormData({
        visitor_name: '',
        visitor_email: '',
        visitor_phone: '',
        viewing_date: new Date().toISOString().split('T')[0],
        viewing_slot: '09:00',
        room_id: roomList[0]?.id || '',
        feedback: ''
      })
      setSecondEnabled(false)
      setSecondForm({ property_id: '', room_id: '', viewing_slot: '' })
      setIsAddingViewing(false)
      const secondName = bookingSecond ? allProperties.find((p) => p.id === secondForm.property_id)?.name : null
      setSuccess(
        secondName
          ? `Two viewings booked for ${formData.visitor_name} — this property and ${secondName}`
          : `Viewing scheduled for ${formData.visitor_name}`
      )
      setTimeout(() => setSuccess(null), 4000)
    }
  }

  async function handleSendSms() {
    if (!smsOffer) return
    setSmsSending(true)
    setSmsResult(null)
    try {
      const location = [smsOffer.roomName, propertyAddress || propertyName]
        .filter(Boolean)
        .join(', ')
      const res = await fetch('/api/sms/send-viewing-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: smsOffer.phone,
          visitorName: smsOffer.name,
          roomAddress: location,
          viewingDate: smsOffer.date,
          viewingTime: smsOffer.slot || 'the arranged time',
          senderName: 'Capital Rooms',
        }),
      })
      const json = await res.json()
      if (json.sent) {
        setSmsResult(`✅ Text sent to ${json.phone}`)
        setTimeout(() => { setSmsOffer(null); setSmsResult(null) }, 3000)
      } else if (json.reason) {
        setSmsResult(`⚠️ Not sent — Twilio isn't configured yet. Add the TWILIO_* env vars to enable texts.`)
      } else {
        setSmsResult(`⚠️ ${json.error || 'Could not send text'}`)
      }
    } catch (err) {
      setSmsResult(`⚠️ ${err instanceof Error ? err.message : 'Could not send text'}`)
    } finally {
      setSmsSending(false)
    }
  }

  // Build the .ics in the browser and download it — opens straight into the
  // booker's Google/Apple calendar. No server auth or email config needed, so
  // it always works; emailing the invite (via /api/calendar/invite) stays as a
  // future option once server-side auth + RESEND_API_KEY are wired.
  function handleAddToCalendar() {
    if (!calOffer) return
    try {
      const ics = buildIcs({
        uid: `${Date.now()}-${Math.random().toString(36).slice(2)}@capitalrooms.cros`,
        title: calOffer.title,
        description: 'Booked in CROS',
        location: calOffer.location,
        date: calOffer.date,
        time: calOffer.time || undefined,
        durationMinutes: 30,
      })
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'viewing.ics'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setCalResult('✅ Calendar file downloaded — open it to add the viewing.')
      setTimeout(() => { setCalOffer(null); setCalResult(null) }, 3000)
    } catch {
      setCalResult('⚠️ Could not create the calendar file.')
    }
  }

  async function handleSendNotification() {
    if (!selectedViewingForNotify) return

    setNotifySending(true)
    try {
      const response = await fetch('/api/admin/quick-notify-lettings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          subject: 'Viewing Scheduled',
          message: `Hi All, we have a viewing scheduled for ${selectedViewingForNotify.room?.name} on ${formatDate(selectedViewingForNotify.viewing_date)}${selectedViewingForNotify.viewing_slot ? ` at ${selectedViewingForNotify.viewing_slot}` : ''}. We will try to keep disruption to the communal areas minimal during this period.`,
          selector_type: 'single',
          viewing_id: selectedViewingForNotify.id,
          viewing_period_start: null,
          viewing_period_end: null,
          new_arrival_time: null
        })
      })

      if (!response.ok) {
        throw new Error('Failed to send notification')
      }

      setSuccess('Notification sent to all tenants!')
      setShowNotifyModal(false)
      setSelectedViewingForNotify(null)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('Failed to send notification')
      console.error(err)
    } finally {
      setNotifySending(false)
    }
  }

  const upcomingViewings = viewings.filter(v => !v.viewing_status || v.viewing_status !== 'closed')
  const completedViewings = viewings.filter(v => v.viewing_status === 'closed')

  const availableCount = roomList.filter(r => r.status === 'available').length
  const onNoticeCount = roomList.filter(r => r.status === 'on_notice').length
  const noneToLet = availableCount === 0 && onNoticeCount === 0

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'interested': return 'bg-green-100 text-green-700'
      case 'not_interested': return 'bg-red-100 text-red-700'
      case 'pending': return 'bg-blue-100 text-blue-700'
      case 'scheduled': return 'bg-blue-100 text-blue-700'
      case 'closed': return 'bg-neutral-900 text-neutral-400'
      default: return 'bg-neutral-900 text-neutral-400'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'interested': return 'Interested'
      case 'not_interested': return 'Not Interested'
      case 'pending': return 'Pending'
      case 'scheduled': return 'Scheduled'
      case 'closed': return 'Closed'
      default: return 'Pending'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-xl">
        <div className="text-sm text-neutral-400">Loading viewings...</div>
      </div>
    )
  }

  return (
    <div className="space-y-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">Lettings</h2>
          <p className="text-sm text-neutral-400 mt-xs">Manage property viewings and track leads</p>
        </div>
        <button
          onClick={() => setIsAddingViewing(true)}
          className="px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition"
        >
          + Schedule Viewing
        </button>
      </div>

      {/* Availability summary — makes the "why is this empty" clear */}
      {noneToLet ? (
        <div className="p-lg rounded-lg bg-neutral-900 border border-neutral-800">
          <p className="text-sm text-neutral-300">
            🏠 No rooms currently available at this property — every room is occupied.
          </p>
        </div>
      ) : (
        <div className="p-lg rounded-lg bg-neutral-900 border border-neutral-800 flex flex-wrap gap-lg">
          {availableCount > 0 && (
            <span className="text-sm font-semibold text-green-400">🟢 {availableCount} available now</span>
          )}
          {onNoticeCount > 0 && (
            <span className="text-sm font-semibold text-amber-400">📋 {onNoticeCount} on notice (coming up)</span>
          )}
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="p-lg rounded-lg bg-red-950 border border-red-800">
          <p className="text-sm font-semibold text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-lg rounded-lg bg-green-950 border border-green-800">
          <p className="text-sm font-semibold text-green-400">✓ {success}</p>
        </div>
      )}

      {/* SMS confirmation offer (shown after booking a viewing with a phone number) */}
      {smsOffer && (
        <div className="p-lg rounded-lg bg-blue-950 border border-blue-800 flex flex-col gap-md sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-200">
              Text a confirmation to {smsOffer.name}?
            </p>
            <p className="text-xs text-blue-300/80 mt-xs">{smsOffer.phone}</p>
            {smsResult && <p className="text-xs text-blue-100 mt-sm">{smsResult}</p>}
          </div>
          <div className="flex gap-sm shrink-0">
            <button
              onClick={() => { setSmsOffer(null); setSmsResult(null) }}
              disabled={smsSending}
              className="px-lg py-sm rounded-lg border border-blue-700 text-sm font-semibold text-blue-200 hover:bg-blue-900 disabled:opacity-50"
            >
              No thanks
            </button>
            <button
              onClick={handleSendSms}
              disabled={smsSending}
              className="px-lg py-sm rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {smsSending ? 'Sending…' : 'Send text'}
            </button>
          </div>
        </div>
      )}

      {/* Calendar invite offer (shown after booking a viewing) */}
      {calOffer && (
        <div className="p-lg rounded-lg bg-neutral-900 border border-neutral-700 flex flex-col gap-md sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Add this viewing to your calendar?</p>
            <p className="text-xs text-neutral-400 mt-xs">
              Downloads a calendar file — open it to add the viewing to your own Google/Apple calendar.
            </p>
            {calResult && <p className="text-xs text-neutral-200 mt-sm">{calResult}</p>}
          </div>
          <div className="flex gap-sm shrink-0">
            <button
              onClick={() => { setCalOffer(null); setCalResult(null) }}
              className="px-lg py-sm rounded-lg border border-neutral-600 text-sm font-semibold text-neutral-200 hover:bg-neutral-800"
            >
              No thanks
            </button>
            <button
              onClick={handleAddToCalendar}
              className="px-lg py-sm rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
            >
              📅 Add to my calendar
            </button>
          </div>
        </div>
      )}

      {/* Add Viewing Modal */}
      {isAddingViewing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
          <div className="bg-neutral-900 rounded-xl shadow-lg p-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-lg">Schedule New Viewing</h3>

            <div className="space-y-lg">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Visitor Name *
                </label>
                <input
                  type="text"
                  value={formData.visitor_name}
                  onChange={(e) => setFormData({ ...formData, visitor_name: e.target.value })}
                  placeholder="e.g., Sarah Johnson"
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.visitor_email}
                  onChange={(e) => setFormData({ ...formData, visitor_email: e.target.value })}
                  placeholder="sarah@example.com"
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.visitor_phone}
                  onChange={(e) => setFormData({ ...formData, visitor_phone: e.target.value })}
                  placeholder="+44 7123 456789"
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Room
                </label>
                <select
                  value={formData.room_id}
                  onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a room...</option>
                  {roomList.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-md">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={formData.viewing_date}
                    onChange={(e) => setFormData({ ...formData, viewing_date: e.target.value })}
                    className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                    Time
                  </label>
                  <input
                    type="time"
                    value={formData.viewing_slot}
                    onChange={(e) => setFormData({ ...formData, viewing_slot: e.target.value })}
                    className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Notes
                </label>
                <textarea
                  value={formData.feedback}
                  onChange={(e) => setFormData({ ...formData, feedback: e.target.value })}
                  placeholder="Any special notes about this viewing..."
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              {/* Optional: show this applicant a second property in the same session */}
              <div className="rounded-lg border border-neutral-700 p-md">
                <label className="flex cursor-pointer items-center gap-sm">
                  <input
                    type="checkbox"
                    checked={secondEnabled}
                    onChange={(e) => setSecondEnabled(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-semibold text-white">Also showing another property this session</span>
                </label>

                {secondEnabled && (
                  <div className="mt-md space-y-md">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                        Second property
                      </label>
                      <select
                        value={secondForm.property_id}
                        onChange={(e) => setSecondForm({ ...secondForm, property_id: e.target.value })}
                        className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select a property…</option>
                        {allProperties.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-md">
                      <div className="min-w-0">
                        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                          Room
                        </label>
                        <select
                          value={secondForm.room_id}
                          onChange={(e) => setSecondForm({ ...secondForm, room_id: e.target.value })}
                          disabled={!secondForm.property_id}
                          className="w-full min-w-0 px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                          <option value="">{secondForm.property_id ? 'Select a room…' : 'Pick a property first'}</option>
                          {secondRooms.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-0">
                        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                          Time
                        </label>
                        <input
                          type="time"
                          value={secondForm.viewing_slot}
                          onChange={(e) => setSecondForm({ ...secondForm, viewing_slot: e.target.value })}
                          className="w-full min-w-0 px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-neutral-500">
                      Same visitor and date. Leave the time blank to reuse the first slot.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-md mt-lg">
              <button
                onClick={() => {
                  setIsAddingViewing(false)
                  setError(null)
                }}
                className="flex-1 px-lg py-md border border-neutral-700 text-white rounded-lg font-semibold text-sm hover:bg-neutral-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddViewing}
                className="flex-1 px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition"
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Marketing copy ── */}
      {(() => {
        const marketingRooms = roomList.filter(r => r.status === 'available' || r.status === 'on_notice')
        if (marketingRooms.length === 0) return null
        return (
          <div>
            <div className="flex items-center justify-between mb-lg pb-sm border-b border-neutral-700">
              <h3 className="text-sm font-bold uppercase text-neutral-400">✨ Room Marketing</h3>
              {advertBanner && (
                <span className="text-xs text-green-400 font-semibold">{advertBanner}</span>
              )}
            </div>
            <div className="space-y-md">
              {marketingRooms.map(room => (
                <div key={room.id} className="rounded-xl border border-neutral-700 bg-neutral-900 p-lg">
                  <div className="flex items-start justify-between gap-md mb-md">
                    <div>
                      <p className="font-semibold text-white">{room.name}</p>
                      <div className="flex flex-wrap gap-md mt-xs text-xs text-neutral-400">
                        {room.current_asking_rent && <span>£{Number(room.current_asking_rent).toLocaleString()} pcm</span>}
                        {room.available_date && (
                          <span>Available {new Date(room.available_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        )}
                        {room.status === 'on_notice' && (
                          <span className="text-amber-400 font-semibold">📋 On notice</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-sm shrink-0 flex-wrap justify-end">
                      <button
                        onClick={() => generateAdvert(room, 'listing')}
                        disabled={!!generatingAdvert}
                        className="text-xs text-purple-400 hover:text-purple-300 font-semibold disabled:opacity-50"
                        title={room.detected_features ? 'Uses saved room features + photos' : 'Upload a room photo to enable photo-based generation'}
                      >
                        {generatingAdvert === `${room.id}:listing` ? '✨ Drafting…' : '✨ Advert'}
                      </button>
                      <span className="text-neutral-600 text-xs">|</span>
                      <button
                        onClick={() => generateAdvert(room, 'group')}
                        disabled={!!generatingAdvert}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold disabled:opacity-50"
                      >
                        {generatingAdvert === `${room.id}:group` ? '✨ Drafting…' : '✨ Group post'}
                      </button>
                    </div>
                  </div>
                  {room.detected_features && Object.keys(room.detected_features).length > 0 && (
                    <div className="mb-sm flex flex-wrap gap-xs">
                      {Object.entries(room.detected_features as Record<string, any>).map(([k, v]) => {
                        if (!v || (Array.isArray(v) && v.length === 0)) return null
                        const display = Array.isArray(v) ? v.join(', ') : String(v)
                        return (
                          <span key={k} className="rounded-full bg-purple-900/40 border border-purple-700/50 px-sm py-0.5 text-xs text-purple-300">
                            {display}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  <textarea
                    value={advertDrafts[room.id] || ''}
                    onChange={e => setAdvertDrafts(prev => ({ ...prev, [room.id]: e.target.value }))}
                    rows={5}
                    placeholder="Generate an advert or group post with the buttons above, then edit and save…"
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-md py-sm text-sm text-neutral-100 placeholder:text-neutral-500 resize-y focus:border-purple-500 focus:ring-2 focus:ring-purple-900 outline-none"
                  />
                  {(advertDrafts[room.id] || '') !== (room.marketing_description || '') && (
                    <button
                      onClick={() => saveAdvert(room.id)}
                      disabled={savingAdvert === room.id}
                      className="mt-xs text-xs text-blue-400 hover:text-blue-300 font-semibold disabled:opacity-50"
                    >
                      {savingAdvert === room.id ? 'Saving…' : 'Save copy'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Upcoming Viewings */}
      <div>
        <h3 className="text-sm font-bold uppercase text-neutral-400 mb-lg pb-lg border-b border-neutral-100">
          📅 Upcoming Viewings ({upcomingViewings.length})
        </h3>

        {upcomingViewings.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-neutral-700 bg-neutral-900 p-xl text-center">
            <div className="text-3xl mb-md opacity-50">👀</div>
            <p className="text-sm font-semibold text-white mb-md">No viewings scheduled</p>
            <p className="text-xs text-neutral-400 mb-lg">Schedule your first viewing to start tracking leads</p>
            <button
              onClick={() => setIsAddingViewing(true)}
              className="px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition mx-auto"
            >
              + Schedule Viewing
            </button>
          </div>
        ) : (
          <div className="space-y-md">
            {upcomingViewings.map((viewing) => (
              <div key={viewing.id} className="rounded-lg border border-neutral-700 bg-neutral-900 p-lg hover:shadow-md transition">
                <div className="flex items-start justify-between gap-lg mb-md">
                  <div className="flex-1">
                    <p className="font-semibold text-white">{viewing.visitor_name}</p>
                    <p className="text-xs text-neutral-400 mt-xs">
                      {formatDate(viewing.viewing_date)}
                      {viewing.viewing_slot && ` at ${viewing.viewing_slot}`}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-md py-sm rounded-full whitespace-nowrap ${getStatusColor(viewing.viewing_status)}`}>
                    {getStatusLabel(viewing.viewing_status)}
                  </span>
                </div>

                {viewing.room && (
                  <p className="text-xs text-neutral-400 mb-md">📍 {viewing.room.name}</p>
                )}

                <div className="flex flex-wrap gap-md text-xs mb-md">
                  {viewing.visitor_email && (
                    <button
                      onClick={() => navigator.clipboard.writeText(viewing.visitor_email || '')}
                      className="text-blue-400 hover:text-blue-300 font-semibold"
                      title="Click to copy"
                    >
                      📧 {viewing.visitor_email}
                    </button>
                  )}
                  {viewing.visitor_phone && (
                    <button
                      onClick={() => navigator.clipboard.writeText(viewing.visitor_phone || '')}
                      className="text-blue-400 hover:text-blue-300 font-semibold"
                      title="Click to copy"
                    >
                      📱 {viewing.visitor_phone}
                    </button>
                  )}
                </div>

                {viewing.feedback && (
                  <p className="text-xs text-neutral-400 mb-md italic">💬 {viewing.feedback}</p>
                )}

                <div className="flex gap-sm flex-wrap">
                  <button
                    onClick={() => {
                      setSelectedViewingForNotify(viewing)
                      setShowNotifyModal(true)
                    }}
                    className="text-xs font-semibold text-green-400 hover:text-green-300"
                  >
                    📢 Notify Tenants
                  </button>
                  <button className="text-xs font-semibold text-blue-400 hover:text-blue-300">
                    Update Status
                  </button>
                  <button className="text-xs font-semibold text-blue-400 hover:text-blue-300">
                    Send Follow-up
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past Viewings */}
      {completedViewings.length > 0 && (
        <div>
          <h3 className="text-sm font-bold uppercase text-neutral-400 mb-lg pb-lg border-b border-neutral-100">
            ✅ Completed ({completedViewings.length})
          </h3>

          <div className="space-y-md">
            {completedViewings.map((viewing) => (
              <div key={viewing.id} className="rounded-lg border border-neutral-700 bg-neutral-900 p-lg">
                <div className="flex items-start justify-between gap-lg">
                  <div className="flex-1">
                    <p className="font-semibold text-white">{viewing.visitor_name}</p>
                    <p className="text-xs text-neutral-400 mt-xs">{formatDate(viewing.viewing_date)}</p>
                  </div>
                  <span className={`text-xs font-semibold px-md py-sm rounded-full ${getStatusColor(viewing.viewing_status)}`}>
                    {getStatusLabel(viewing.viewing_status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notify Tenants Modal */}
      {showNotifyModal && selectedViewingForNotify && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
          <div className="bg-neutral-900 rounded-xl shadow-lg p-lg max-w-md w-full border border-neutral-700">
            <h3 className="text-lg font-semibold text-white mb-lg">📢 Notify Tenants</h3>

            <div className="space-y-lg mb-lg">
              <div>
                <p className="text-sm text-neutral-400 mb-sm">Room:</p>
                <p className="font-semibold text-white">{selectedViewingForNotify.room?.name || 'Unknown Room'}</p>
              </div>
              <div>
                <p className="text-sm text-neutral-400 mb-sm">Viewing Date & Time:</p>
                <p className="font-semibold text-white">
                  {formatDate(selectedViewingForNotify.viewing_date)}
                  {selectedViewingForNotify.viewing_slot && ` at ${selectedViewingForNotify.viewing_slot}`}
                </p>
              </div>
              <div className="bg-neutral-900 p-md rounded-lg">
                <p className="text-xs text-neutral-400 mb-sm">Message Preview:</p>
                <p className="text-xs text-white">
                  Hi All, we have a viewing scheduled for {selectedViewingForNotify.room?.name} on {formatDate(selectedViewingForNotify.viewing_date)}{selectedViewingForNotify.viewing_slot && ` at ${selectedViewingForNotify.viewing_slot}`}. We will try to keep disruption to the communal areas minimal during this period.
                </p>
              </div>
            </div>

            <div className="flex gap-md">
              <button
                onClick={() => {
                  setShowNotifyModal(false)
                  setSelectedViewingForNotify(null)
                }}
                className="flex-1 px-lg py-md border border-neutral-700 text-white rounded-lg font-semibold text-sm hover:bg-neutral-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSendNotification}
                disabled={notifySending}
                className="flex-1 px-lg py-md bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700 disabled:opacity-50 transition"
              >
                {notifySending ? 'Sending...' : '✓ Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
