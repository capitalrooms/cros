'use client'

// Quick Notify for lettings staff: tell the tenants at a property (push + email + text, via
// /api/admin/quick-notify-lettings), or "Applicants & anyone else" — applicants, viewers, or people pasted from an
// email at a house that isn't on CROS (text and/or email, via /api/notify/contacts; 17 Oct 2026).
//
// Tenant messages never name the room — a viewing outs the tenant who is leaving (see LettingsViewingNotifyModal).

import { useMemo, useState } from 'react'
import PeoplePicker, { type Recipient } from '@/app/components/notify/PeoplePicker'
import AddressField from '@/app/components/AddressField'

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
const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

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
  const [textToo, setTextToo] = useState(true)
  const [alsoTell, setAlsoTell] = useState<Recipient[]>([])   // people at the house who aren't recorded as tenants

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
  const [people, setPeople] = useState<Recipient[]>(() => viewing && (viewing.visitor_email || viewing.visitor_phone)
    ? [{ name: viewing.visitor_name, email: viewing.visitor_email?.toLowerCase() ?? null, phone: viewing.visitor_phone, from: 'Viewing', propertyName: viewing.property_name }] : [])
  const [place, setPlace] = useState(viewing?.property_name ?? '')

  const propName = properties.find(p => p.id === propertyId)?.name ?? ''

  const tenantMsg = (): { subject: string; message: string } => {
    switch (tPreset) {
      case 'viewing_today':
        return {
          subject: 'A viewing at your home today',
          message: `Quick heads-up — we have a viewing at ${propName || 'your property'} today${tTime ? ` at around ${tTime}` : ''}. We will use a management set of keys. Thank you for your hospitality, and we will try not to disturb you for long.`,
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
    const where = place.trim() || 'the property'
    switch (aPreset) {
      case 'running_late': return `I'm running about ${lateBy} minutes late for your viewing at ${where} — sorry! I'll be with you as soon as I can.`
      case 'outside': return `I'm outside ${where} now for your viewing — see you at the door.`
      case 'moved': return `your viewing at ${where} has moved to ${newDate ? niceDate(newDate) : '[date]'}${newTime ? ` at ${newTime}` : ''}. Please let me know if that doesn't suit.`
      case 'custom': return aCustom
    }
  }
  const toContacts = async (list: Recipient[], subject: string, message: string, sms: boolean, email: boolean) => {
    const res = await fetch('/api/notify/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients: list.map(r => ({ name: r.name, email: r.email, phone: r.phone })), subject, message, sms, email }) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok && !d.texted && !d.emailed) throw new Error(d.error || (d.failed ?? []).map((f: any) => `${f.who}: ${f.text ?? f.email}`).join(' · ') || 'Could not send')
    return d as { texted: number; emailed: number; failed: { who: string; text?: string; email?: string }[] }
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
          body: JSON.stringify({ property_id: propertyId, subject, message, channels: pushOnly ? 'push_only' : textToo ? 'push_email_sms' : 'push_email' }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok || d.success === false) throw new Error(d.error || d.message || 'Could not send')
        const parts = [d.recipientCount ? `${d.recipientCount} tenant${d.recipientCount === 1 ? '' : 's'} at ${propName}${textToo && !pushOnly ? ` (${d.smsCount ?? 0} texted)` : ''}` : `no current tenants recorded at ${propName}`]
        let notSent = d.smsFailed?.length ? ` — not texted: ${d.smsFailed.join(', ')}` : ''
        if (alsoTell.length) {
          const o = await toContacts(alsoTell, subject, message, !pushOnly, !pushOnly)
          parts.push(`${alsoTell.length} other${alsoTell.length === 1 ? '' : 's'}`)
          if (o.failed.length) notSent += ` — not sent: ${o.failed.map(f => f.who).join(', ')}`
        }
        onSent(`Sent to ${parts.join(' and ')}${notSent}`)
      } else {
        const message = applicantMsg()
        if (!people.length) throw new Error('Choose who to send it to — search, type an email or mobile, or paste them')
        if (!message.trim()) throw new Error('Write a message')
        const d = await toContacts(people, place.trim() ? `Your viewing at ${place.trim()}` : 'A message from Capital Rooms', message, bySms, byEmail)
        const sent = [d.texted && `${d.texted} text${d.texted === 1 ? '' : 's'}`, d.emailed && `${d.emailed} email${d.emailed === 1 ? '' : 's'}`].filter(Boolean).join(' and ')
        onSent(`Sent ${sent}${d.failed.length ? ` — not sent: ${d.failed.map(f => `${f.who} (${f.text && f.text !== 'sent' ? f.text : f.email})`).join(', ')}` : ''}`)
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
  const preview = mode === 'tenants' ? tenantMsg() : { subject: '', message: `Hi ${(people[0]?.name || '').split(' ')[0] || 'there'}, ${applicantMsg()}` }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-lg" onClick={() => !sending && onClose()}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-lg shadow-2xl max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-md">
          <h2 className="text-xl font-bold text-neutral-900">Quick Notify</h2>
          <button onClick={onClose} className="text-2xl leading-none text-neutral-400 hover:text-neutral-900">×</button>
        </div>

        <div className="grid grid-cols-2 gap-xs mb-lg">
          <button type="button" className={chip(mode === 'tenants')} onClick={() => setMode('tenants')}>Tenants at a property</button>
          <button type="button" className={chip(mode === 'applicant')} onClick={() => setMode('applicant')}>Applicants &amp; anyone else</button>
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
              <button type="button" className={chip(tPreset === 'viewing_today')} onClick={() => setTPreset('viewing_today')}>Viewing today</button>
              <button type="button" className={chip(tPreset === 'running_late')} onClick={() => setTPreset('running_late')}>Running late</button>
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
            <div className="flex flex-wrap gap-x-lg gap-y-xs text-sm text-neutral-700">
              <label className="flex items-center gap-sm"><input type="checkbox" checked={textToo && !pushOnly} disabled={pushOnly} onChange={e => setTextToo(e.target.checked)} /> Text them too</label>
              <label className="flex items-center gap-sm"><input type="checkbox" checked={pushOnly} onChange={e => setPushOnly(e.target.checked)} /> App notification only</label>
            </div>
            <div>
              <label className={lbl}>Also tell <span className="font-normal normal-case text-neutral-400">(people there who aren’t on CROS — optional)</span></label>
              <PeoplePicker value={alsoTell} onChange={setAlsoTell} compact />
            </div>
            <p className="text-[11px] text-neutral-500">Goes to every current tenant at the property. Messages never mention which room is being shown.
              {' '}House not on CROS? <button type="button" className="font-semibold underline" onClick={() => setMode('applicant')}>Send to people instead</button>.</p>
          </div>
        ) : (
          <div className="space-y-md">
            <div>
              <label className={lbl}>Who</label>
              <PeoplePicker value={people} onChange={v => { setPeople(v); if (!place && v.find(r => r.propertyName)) setPlace(String(v.find(r => r.propertyName)!.propertyName)) }} />
            </div>
            <div>
              <label className={lbl}>Where <span className="font-normal normal-case text-neutral-400">(the house — type it if it isn’t on CROS)</span></label>
              <AddressField value={place} onChange={setPlace} className={field} placeholder="e.g. 95 Rope Street" />
            </div>
            <div className="flex flex-wrap gap-sm">
              <button type="button" className={chip(aPreset === 'running_late')} onClick={() => setAPreset('running_late')}>Running late</button>
              <button type="button" className={chip(aPreset === 'outside')} onClick={() => setAPreset('outside')}>I’m outside</button>
              <button type="button" className={chip(aPreset === 'moved')} onClick={() => setAPreset('moved')}>Time changed</button>
              <button type="button" className={chip(aPreset === 'custom')} onClick={() => setAPreset('custom')}>✏️ Custom</button>
            </div>
            {aPreset === 'running_late' && (
              <div className="flex flex-wrap gap-sm">
                {[5, 10, 15, 20, 30].map(n => <button key={n} type="button" className={chip(lateBy === n)} onClick={() => setLateBy(n)}>{n} min</button>)}
              </div>
            )}
            {aPreset === 'moved' && (
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-md">
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
            <div className="flex flex-wrap gap-lg text-sm text-neutral-700">
              <label className="flex items-center gap-sm"><input type="checkbox" checked={bySms} onChange={e => setBySms(e.target.checked)} /> Text <span className="text-neutral-400">({people.filter(r => r.phone).length})</span></label>
              <label className="flex items-center gap-sm"><input type="checkbox" checked={byEmail} onChange={e => setByEmail(e.target.checked)} /> Email <span className="text-neutral-400">({people.filter(r => r.email).length})</span></label>
            </div>
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
            disabled={sending || (mode === 'tenants' ? !propertyId : !people.length || !((bySms && people.some(r => r.phone)) || (byEmail && people.some(r => r.email))))}
            className="flex-1 rounded-xl bg-neutral-900 py-md text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40 transition-colors">
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
