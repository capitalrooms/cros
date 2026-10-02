'use client'

// Quick Notify for lettings staff: tell the tenants at a property (push + email, via
// /api/admin/quick-notify-lettings) or the applicant coming to a viewing (text and/or email, via
// /api/lettings/notify-applicant).
//
// Tenant messages never name the room — a viewing outs the tenant who is leaving (see LettingsViewingNotifyModal).

import { useMemo, useState } from 'react'

export interface NotifyProperty { id: string; name: string }
export interface NotifyViewing {
  id: string
  viewing_date: string
  viewing_slot: string | null
  visitor_name: string | null
  visitor_email: string | null
  visitor_phone: string | null
  property_id: string | null
  property_name: string
}

export type NotifyMode = 'tenants' | 'applicant'

interface Props {
  properties: NotifyProperty[]
  viewings: NotifyViewing[]
  initialMode?: NotifyMode
  initialPropertyId?: string
  initialViewingId?: string
  onClose: () => void
  onSent: (summary: string) => void
}

type TenantPreset = 'viewing_today' | 'running_late' | 'custom'
type ApplicantPreset = 'running_late' | 'outside' | 'moved' | 'custom'

const hhmm = (slot: string | null) => (slot ? slot.slice(0, 5) : '')
const niceDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
const todayISO = () => new Date().toISOString().slice(0, 10)

export default function LettingsQuickNotify({ properties, viewings, initialMode = 'tenants', initialPropertyId, initialViewingId, onClose, onSent }: Props) {
  const [mode, setMode] = useState<NotifyMode>(initialMode)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  // ── Tenants ──
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? '')
  const [tPreset, setTPreset] = useState<TenantPreset>('viewing_today')
  const [tTime, setTTime] = useState('')
  const [tCustom, setTCustom] = useState({ subject: '', message: '' })
  const [pushOnly, setPushOnly] = useState(false)

  // ── Applicant ──
  const upcoming = useMemo(() => viewings.filter(v => v.viewing_date >= todayISO())
    .sort((a, b) => `${a.viewing_date}${a.viewing_slot ?? ''}`.localeCompare(`${b.viewing_date}${b.viewing_slot ?? ''}`)), [viewings])
  const [viewingId, setViewingId] = useState(initialViewingId ?? upcoming[0]?.id ?? '')
  const viewing = viewings.find(v => v.id === viewingId)
  const [aPreset, setAPreset] = useState<ApplicantPreset>('running_late')
  const [lateBy, setLateBy] = useState(10)
  const [newDate, setNewDate] = useState(viewing?.viewing_date ?? '')
  const [newTime, setNewTime] = useState(hhmm(viewing?.viewing_slot ?? null))
  const [aCustom, setACustom] = useState('')
  const [bySms, setBySms] = useState(true)
  const [byEmail, setByEmail] = useState(true)

  const propName = properties.find(p => p.id === propertyId)?.name ?? ''

  const tenantMsg = (): { subject: string; message: string } => {
    switch (tPreset) {
      case 'viewing_today':
        return {
          subject: 'A viewing at your home today',
          message: `🔑 Quick heads-up — we have a viewing at ${propName || 'your property'} today${tTime ? ` at around ${tTime}` : ''}. We will use a management set of keys. Thank you for your hospitality, and we will try not to disturb you for long.`,
        }
      case 'running_late':
        return {
          subject: 'A viewing at your home is running late',
          message: `Quick heads-up — a viewing at your property is running a little behind${tTime ? ` and is now expected around ${tTime}` : ''}. Sorry for any disruption to the communal areas, and thanks for your patience.`,
        }
      case 'custom':
        return tCustom
    }
  }

  const applicantMsg = (): string => {
    const place = viewing?.property_name || 'the property'
    switch (aPreset) {
      case 'running_late': return `I'm running about ${lateBy} minutes late for your viewing at ${place} — sorry! I'll be with you as soon as I can.`
      case 'outside': return `I'm outside ${place} now for your viewing — see you at the door.`
      case 'moved': return `your viewing at ${place} has moved to ${newDate ? niceDate(newDate) : '[date]'}${newTime ? ` at ${newTime}` : ''}. Please let me know if that doesn't suit.`
      case 'custom': return aCustom
    }
  }

  async function send() {
    setSending(true); setError('')
    try {
      if (mode === 'tenants') {
        const { subject, message } = tenantMsg()
        if (!propertyId) throw new Error('Choose the property')
        if (!subject.trim() || !message.trim()) throw new Error('Write a subject and message')
        const res = await fetch('/api/admin/quick-notify-lettings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ property_id: propertyId, subject, message, channels: pushOnly ? 'push_only' : 'push_email' }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok || d.success === false) throw new Error(d.error || d.message || 'Could not send')
        onSent(d.recipientCount ? `✅ Sent to ${d.recipientCount} tenant${d.recipientCount === 1 ? '' : 's'} at ${propName}` : `No current tenants at ${propName} to notify`)
      } else {
        const message = applicantMsg()
        if (!viewingId) throw new Error('Choose the viewing')
        if (!message.trim()) throw new Error('Write a message')
        const res = await fetch('/api/lettings/notify-applicant', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewing_id: viewingId, message, sms: bySms && !!viewing?.visitor_phone, email: byEmail && !!viewing?.visitor_email }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok && !d.smsSent && !d.emailSent) throw new Error(d.error || [d.smsError, d.emailError].filter(Boolean).join(' · ') || 'Could not send')
        const sent = [d.smsSent && 'text', d.emailSent && 'email'].filter(Boolean).join(' and ')
        const failed = [!d.smsSent && d.smsError, !d.emailSent && d.emailError].filter(Boolean).join(' · ')
        onSent(`✅ ${viewing?.visitor_name || 'Applicant'} sent a ${sent}${failed ? ` (not sent: ${failed})` : ''}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send')
    } finally {
      setSending(false)
    }
  }

  const chip = (active: boolean) =>
    `rounded-lg border px-md py-sm text-xs font-semibold transition-colors ${active ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500'}`
  const field = 'w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 bg-white'
  const lbl = 'block text-xs font-bold uppercase tracking-wide text-neutral-700 mb-xs'
  const preview = mode === 'tenants' ? tenantMsg() : { subject: '', message: `Hi ${(viewing?.visitor_name || '').split(' ')[0] || 'there'}, ${applicantMsg()}` }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-lg" onClick={() => !sending && onClose()}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-md">
          <h2 className="text-xl font-bold text-neutral-900">⚡ Quick Notify</h2>
          <button onClick={onClose} className="text-2xl leading-none text-neutral-400 hover:text-neutral-900">×</button>
        </div>

        <div className="grid grid-cols-2 gap-xs mb-lg">
          <button type="button" className={chip(mode === 'tenants')} onClick={() => setMode('tenants')}>🏠 Tenants at a property</button>
          <button type="button" className={chip(mode === 'applicant')} onClick={() => setMode('applicant')}>👤 Applicant for a viewing</button>
        </div>

        {error && <div className="mb-md rounded-xl border border-red-200 bg-red-50 px-md py-sm text-sm text-red-800">{error}</div>}

        {mode === 'tenants' ? (
          <div className="space-y-md">
            <div>
              <label className={lbl}>Property</label>
              <select className={field} value={propertyId} onChange={e => setPropertyId(e.target.value)}>
                <option value="">Select a property…</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-sm">
              <button type="button" className={chip(tPreset === 'viewing_today')} onClick={() => setTPreset('viewing_today')}>🔑 Viewing today</button>
              <button type="button" className={chip(tPreset === 'running_late')} onClick={() => setTPreset('running_late')}>⏰ Running late</button>
              <button type="button" className={chip(tPreset === 'custom')} onClick={() => setTPreset('custom')}>✏️ Custom</button>
            </div>
            {tPreset !== 'custom' ? (
              <div>
                <label className={lbl}>{tPreset === 'running_late' ? 'Now expected around' : 'Time (optional)'}</label>
                <input type="time" className={field} value={tTime} onChange={e => setTTime(e.target.value)} />
              </div>
            ) : (
              <>
                <div>
                  <label className={lbl}>Subject</label>
                  <input className={field} value={tCustom.subject} onChange={e => setTCustom(c => ({ ...c, subject: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl}>Message</label>
                  <textarea rows={4} className={field} value={tCustom.message} onChange={e => setTCustom(c => ({ ...c, message: e.target.value }))} />
                </div>
              </>
            )}
            <label className="flex items-center gap-sm text-sm text-neutral-700">
              <input type="checkbox" checked={pushOnly} onChange={e => setPushOnly(e.target.checked)} />
              App notification only (no email)
            </label>
            <p className="text-[11px] text-neutral-500">Goes to every current tenant at the property. Messages never mention which room is being shown.</p>
          </div>
        ) : (
          <div className="space-y-md">
            <div>
              <label className={lbl}>Viewing</label>
              {upcoming.length === 0 ? (
                <p className="text-sm text-neutral-500">No upcoming viewings.</p>
              ) : (
                <select className={field} value={viewingId} onChange={e => {
                  const v = viewings.find(x => x.id === e.target.value)
                  setViewingId(e.target.value); setNewDate(v?.viewing_date ?? ''); setNewTime(hhmm(v?.viewing_slot ?? null))
                }}>
                  {upcoming.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.viewing_date === todayISO() ? 'Today' : new Date(`${v.viewing_date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {v.viewing_slot ? ` ${hhmm(v.viewing_slot)}` : ''} — {v.visitor_name || 'Viewer'} · {v.property_name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex flex-wrap gap-sm">
              <button type="button" className={chip(aPreset === 'running_late')} onClick={() => setAPreset('running_late')}>⏰ Running late</button>
              <button type="button" className={chip(aPreset === 'outside')} onClick={() => setAPreset('outside')}>📍 I’m outside</button>
              <button type="button" className={chip(aPreset === 'moved')} onClick={() => setAPreset('moved')}>📅 Time changed</button>
              <button type="button" className={chip(aPreset === 'custom')} onClick={() => setAPreset('custom')}>✏️ Custom</button>
            </div>
            {aPreset === 'running_late' && (
              <div className="flex flex-wrap gap-sm">
                {[5, 10, 15, 20, 30].map(n => <button key={n} type="button" className={chip(lateBy === n)} onClick={() => setLateBy(n)}>{n} min</button>)}
              </div>
            )}
            {aPreset === 'moved' && (
              <div className="grid grid-cols-2 gap-md">
                <div><label className={lbl}>New date</label><input type="date" className={field} value={newDate} onChange={e => setNewDate(e.target.value)} /></div>
                <div><label className={lbl}>New time</label><input type="time" className={field} value={newTime} onChange={e => setNewTime(e.target.value)} /></div>
              </div>
            )}
            {aPreset === 'custom' && (
              <div>
                <label className={lbl}>Message</label>
                <textarea rows={3} className={field} value={aCustom} placeholder="Starts after “Hi {name},”" onChange={e => setACustom(e.target.value)} />
              </div>
            )}
            {viewing && (
              <div className="flex flex-wrap gap-lg text-sm text-neutral-700">
                <label className={`flex items-center gap-sm ${viewing.visitor_phone ? '' : 'opacity-40'}`}>
                  <input type="checkbox" disabled={!viewing.visitor_phone} checked={bySms && !!viewing.visitor_phone} onChange={e => setBySms(e.target.checked)} />
                  Text {viewing.visitor_phone ? `(${viewing.visitor_phone})` : '— no number'}
                </label>
                <label className={`flex items-center gap-sm ${viewing.visitor_email ? '' : 'opacity-40'}`}>
                  <input type="checkbox" disabled={!viewing.visitor_email} checked={byEmail && !!viewing.visitor_email} onChange={e => setByEmail(e.target.checked)} />
                  Email {viewing.visitor_email ? '' : '— no address'}
                </label>
              </div>
            )}
          </div>
        )}

        {preview.message.trim() && (
          <div className="mt-lg rounded-xl bg-neutral-50 border border-neutral-200 p-md">
            <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-xs">They will see</p>
            {preview.subject && <p className="text-sm font-semibold text-neutral-900">{preview.subject}</p>}
            <p className="text-sm text-neutral-700 whitespace-pre-wrap">{preview.message}</p>
          </div>
        )}

        <div className="flex gap-md pt-lg">
          <button onClick={onClose} disabled={sending} className="flex-1 rounded-xl border border-neutral-300 py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">Cancel</button>
          <button onClick={send}
            disabled={sending || (mode === 'tenants' ? !propertyId : !viewingId || !((bySms && viewing?.visitor_phone) || (byEmail && viewing?.visitor_email)))}
            className="flex-1 rounded-xl bg-neutral-900 py-md text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40 transition-colors">
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
