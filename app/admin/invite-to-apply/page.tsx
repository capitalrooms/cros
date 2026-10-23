'use client'

import NameInput, { emptyName, toLegalName, type NameValue } from '@/app/components/NameInput'
import { useEffect, useRef, useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import InviteApplicant from '@/components/InviteApplicant'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'

// the shared, signed-in client (lib/supabase) — a separate client here had no sign-in, so since the privacy rules
// (migration 192) it saw no properties, rooms or viewings
const supabase = createClient()

export default function InviteToApplyPage() {
  const searchParams = useSearchParams()
  const preselectedViewingId = searchParams.get('viewingId')

  const [viewings, setViewings] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [manual, setManual] = useState({ name: '', email: '', phone: '', property_id: '', room_id: '' })
  const [manualNm, setManualNm] = useState<NameValue>(emptyName())
  const [method, setMethod] = useState<'email' | 'sms' | 'both'>('email')
  const [mode, setMode] = useState<'apply' | 'fasttrack' | 'reserve'>('apply')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<any | null>(null)
  const [copied, setCopied] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)

  // Rooms filtered to the selected property in manual mode
  const filteredRooms = useMemo(
    () => manual.property_id ? rooms.filter(r => r.property_id === manual.property_id) : [],
    [manual.property_id, rooms]
  )

  const [loadError, setLoadError] = useState('')
  useEffect(() => {
    // the lists come from the server (/api/lettings/invite-to-apply GET) — reading the database from the page gave an
    // empty property list on a phone whose sign-in hadn't woken up yet (14 Oct 2026)
    const load = async (attempt = 1): Promise<void> => {
      const res = await fetch('/api/lettings/invite-to-apply').catch(() => null)
      const d = await res?.json().catch(() => null)
      if (!res?.ok || !d?.properties) {
        if (attempt < 3) { await new Promise(r => setTimeout(r, 800 * attempt)); return load(attempt + 1) }
        setLoadError(d?.error || 'The properties didn’t load. Check your connection, then pull down to refresh.')
        setLoading(false); return
      }
      setLoadError('')
      const loadedViewings = d.viewings || []
      setViewings(loadedViewings)
      setProperties(d.properties || [])
      setRooms(d.rooms || [])
      // Auto-select if navigated here with ?viewingId=
      if (preselectedViewingId) {
        const match = loadedViewings.find((v: any) => v.id === preselectedViewingId)
        if (match) setSelected(match)
      }
      setLoading(false)
    }
    load()
  }, [])

  const selectViewing = (v: any) => {
    setSelected(v)
    setManualMode(false)
    setResult(null)
  }

  const switchToManual = () => {
    setSelected(null)
    setManualMode(true)
    setResult(null)
  }

  const wholeChosen = !!manual.property_id && !!properties.find(p => p.id === manual.property_id)?.whole

  const contactEmail = manualMode ? manual.email : selected?.visitor_email
  const contactPhone = manualMode ? manual.phone : selected?.visitor_phone

  const canSend = manualMode
    ? manualNm.salutation && manualNm.first_name.trim() && manualNm.last_name.trim() && manual.room_id && (manual.email.trim() || manual.phone.trim())
    : !!selected

  const send = async () => {
    if (!canSend) return
    setSending(true)
    setResult(null)

    const body = manualMode
      ? { manual: { name: manual.name, salutation: manualNm.salutation, first_name: manualNm.first_name.trim(), last_name: manualNm.last_name.trim(), email: manual.email, phone: manual.phone, room_id: manual.room_id, property_id: manual.property_id }, method, mode }
      : { viewingId: selected.id, method, mode }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/lettings/invite-to-apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setResult(data)
    } catch (err) {
      setResult({ emailError: 'Network error — please try again', smsError: null })
    } finally {
      setSending(false)
    }
  }

  // Scroll result into view whenever it updates
  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [result])

  const copyLink = async () => {
    if (!result?.link) return
    await navigator.clipboard.writeText(result.link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" label="Dashboard" />} />
      <PageHero title="Invite to Apply" subtitle="Send a personalised application link by email or text after a viewing" />
      <div className="mx-auto max-w-6xl py-xl px-lg">

        {loadError && <p className="mb-lg rounded-xl border border-red-200 bg-red-50 p-md text-sm text-red-800">{loadError}</p>}
        {/* Step 1 — Pick a viewing or enter manually */}
        <div className="bg-white rounded-xl border border-neutral-200 p-lg mb-lg">
          <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-md">
            1 · Select a viewing
          </h2>
          {loading ? (
            <p className="text-sm text-neutral-400">Loading recent viewings…</p>
          ) : viewings.length === 0 ? (
            <p className="text-sm text-neutral-400">No viewings in the last 60 days.</p>
          ) : (
            <div className="space-y-sm max-h-72 overflow-y-auto pr-xs">
              {viewings.map((v) => {
                const room = (v.properties as any)?.whole ? 'Whole property' : (v.rooms as any)?.name || 'Room'
                const isLetOnly = (v.rooms as any)?.is_let_only
                const prop = (v.properties as any)?.address || (v.properties as any)?.name || ''
                const isSelected = !manualMode && selected?.id === v.id
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => selectViewing(v)}
                    className={`w-full text-left p-md rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-neutral-900 bg-neutral-50'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900 flex items-center gap-xs">
                          {v.visitor_name || 'Unknown visitor'}
                          {isLetOnly && <span className="text-xs bg-purple-100 text-purple-700 px-xs py-0.5 rounded font-medium">Let Only</span>}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {room}{prop ? ` · ${prop}` : ''} · {v.viewing_date}
                        </p>
                      </div>
                      <div className="flex gap-xs">
                        {v.visitor_email && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-xs py-0.5 rounded">✉ email</span>
                        )}
                        {v.visitor_phone && (
                          <span className="text-xs bg-green-100 text-green-700 px-xs py-0.5 rounded">📱 SMS</span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Other — manual entry toggle */}
          <button
            type="button"
            onClick={switchToManual}
            className={`mt-md w-full text-left p-md rounded-lg border-2 transition-all ${
              manualMode
                ? 'border-neutral-900 bg-neutral-50'
                : 'border-dashed border-neutral-300 hover:border-neutral-400'
            }`}
          >
            <p className="text-sm font-semibold text-neutral-700">+ Other — enter contact details manually</p>
            <p className="text-xs text-neutral-400 mt-xs">Use this if the applicant wasn't in the viewing diary</p>
          </button>

          {/* Manual entry form */}
          {manualMode && (
            <div className="mt-md space-y-sm border border-neutral-200 rounded-lg p-md bg-neutral-50">
              <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <NameInput value={manualNm} required titleRequired
                    onChange={n => { setManualNm(n); setManual(m => ({ ...m, name: toLegalName(n) })) }}
                    inputClass="w-full text-sm border border-neutral-300 rounded-lg px-sm py-xs focus:outline-none focus:border-neutral-500 bg-white"
                    labelClass="text-xs font-medium text-neutral-600 block mb-xs" />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-xs">
                    Email{(method === 'email' || method === 'both') ? <span className="text-red-500 ml-xs">*</span> : <span className="text-neutral-400 ml-xs font-normal">(for email invite)</span>}
                  </label>
                  <input
                    type="email"
                    value={manual.email}
                    onChange={e => setManual(m => ({ ...m, email: e.target.value }))}
                    placeholder="e.g. sarah@email.com"
                    className="w-full text-base sm:text-sm border border-neutral-300 rounded-lg px-sm py-xs focus:outline-none focus:border-neutral-500 bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-xs">
                    Phone{(method === 'sms' || method === 'both') ? <span className="text-red-500 ml-xs">*</span> : <span className="text-neutral-400 ml-xs font-normal">(for SMS)</span>}
                  </label>
                  <input
                    type="tel"
                    value={manual.phone}
                    onChange={e => setManual(m => ({ ...m, phone: e.target.value }))}
                    placeholder="e.g. 07700 900000"
                    className="w-full text-base sm:text-sm border border-neutral-300 rounded-lg px-sm py-xs focus:outline-none focus:border-neutral-500 bg-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-neutral-600 block mb-xs">Property *</label>
                  <select
                    value={manual.property_id}
                    onChange={e => {
                      const pid = e.target.value
                      const own = rooms.filter(r => r.property_id === pid)
                      // a whole house or flat has one unit — pick it, there's nothing to choose
                      const auto = properties.find(p => p.id === pid)?.whole && own.length === 1 ? own[0].id : ''
                      setManual(m => ({ ...m, property_id: pid, room_id: auto }))
                    }}
                    className="w-full text-base sm:text-sm border border-neutral-300 rounded-lg px-sm py-xs focus:outline-none focus:border-neutral-500 bg-white"
                  >
                    <option value="">Select property…</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.name || p.address}{p.whole ? ' — whole property' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              {wholeChosen ? (
                <p className="rounded-lg border border-neutral-200 bg-white px-sm py-xs text-sm text-neutral-700">
                  Whole property{filteredRooms[0]?.current_asking_rent ? ` · £${filteredRooms[0].current_asking_rent}/mo` : ''} — the invite and their application use property wording, not room wording.
                </p>
              ) : (
              <div>
                <label className="text-xs font-medium text-neutral-600 block mb-xs">
                  Room *
                  {!manual.property_id && <span className="text-neutral-400 ml-xs font-normal">(select a property first)</span>}
                </label>
                <select
                  value={manual.room_id}
                  onChange={e => setManual(m => ({ ...m, room_id: e.target.value }))}
                  disabled={!manual.property_id}
                  className="w-full text-base sm:text-sm border border-neutral-300 rounded-lg px-sm py-xs focus:outline-none focus:border-neutral-500 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select room…</option>
                  {filteredRooms.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name}{r.is_let_only ? ' — Let Only' : ''}{r.current_asking_rent ? ` (£${r.current_asking_rent}/mo)` : ''}
                    </option>
                  ))}
                </select>
                {manual.property_id && !filteredRooms.length && <p className="mt-xs text-xs text-amber-700">This property has no rooms set up yet — add them on the property first.</p>}
              </div>
              )}
              <p className="text-xs text-neutral-400">* Name, {wholeChosen ? 'property' : 'room'}, and at least email or phone are required</p>
            </div>
          )}
        </div>

        {/* Step 2 — what to send, the rent, and the exact email: the one panel Applicants uses too (components/InviteApplicant) */}
        {(selected || manualMode) && (
          <div className="bg-white rounded-xl border border-neutral-200 p-lg mb-lg">
            <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-md">2 · What to send</h2>
            {canSend
              ? <InviteApplicant key={selected?.id ?? `${manual.room_id}|${manual.email}|${manual.phone}|${manualNm.first_name}|${manualNm.last_name}`}
                  target={manualMode
                    ? { manual: { name: manual.name, salutation: manualNm.salutation, first_name: manualNm.first_name.trim(), last_name: manualNm.last_name.trim(), email: manual.email, phone: manual.phone, room_id: manual.room_id, property_id: manual.property_id } }
                    : { viewingId: selected.id }} />
              : <p className="text-sm text-neutral-500">Fill in their title, name, the room and an email or mobile above to see what they’ll get.</p>}
          </div>
        )}
      </div>
    </div>
  )
}
