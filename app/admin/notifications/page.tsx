'use client'
// Notifications — who gets what, in one place (14 Nov 2026, Harry: "we have too many places to go to simply control what
// and who gets notifications"). Tenants (for everyone, or property by property), landlords, contractors and cleaners
// (app / email / text each), and the office — with whether each person's phone has app notifications switched on.
// /api/admin/notifications. Administrators.
import { useEffect, useMemo, useState } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'

type Data = {
  tenants: { master: boolean; elected: boolean; emergencyUpdates: boolean; properties: { id: string; name: string; on: boolean }[] }
  landlords: { id: string; name: string; on: boolean; onApp: boolean }[]
  workers: { id: string; name: string; role: string; push: boolean; email: boolean; sms: boolean; onApp: boolean }[]
  office: { id: string; name: string; role: string; onApp: boolean }[]
}

function Switch({ on, onClick, label, busy }: { on: boolean; onClick: () => void; label: string; busy?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} aria-label={`${label}: ${on ? 'on' : 'off'}`} aria-pressed={on}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-emerald-600' : 'bg-neutral-300'}`}>
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
}
const AppBadge = ({ on }: { on: boolean }) => <span className={`rounded-full px-sm py-0.5 text-[11px] font-semibold ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-500'}`}>{on ? 'Phone set up' : 'Phone not set up'}</span>

export default function Notifications() {
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [q, setQ] = useState('')
  const load = () => adminFetch('/api/admin/notifications').then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Couldn’t load'); setD(j) }).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])

  async function save(key: string, body: Record<string, unknown>, apply: (d: Data) => Data) {
    if (!d) return
    setBusy(key); const before = d; setD(apply(d))
    const r = await adminFetch('/api/admin/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    setBusy('')
    if (!r?.ok) { setD(before); alert('That didn’t save — try again.') }
  }
  const match = (n: string) => !q.trim() || n.toLowerCase().includes(q.trim().toLowerCase())
  const props = useMemo(() => (d?.tenants.properties ?? []).filter(p => match(p.name)), [d, q])   // eslint-disable-line react-hooks/exhaustive-deps
  const card = 'mb-lg overflow-hidden rounded-2xl border border-neutral-200 bg-white'
  const head = 'border-b border-neutral-100 px-lg py-md'

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/communications" />} title="Notifications" />
      <div className="mx-auto max-w-6xl px-lg py-xl">
        <h1 className="text-2xl font-bold text-neutral-900">Notifications — who gets what</h1>
        <p className="mt-xs max-w-2xl text-sm text-neutral-600">Everything about who is told what, in one place. Changes apply straight away. A phone only shows app notifications once that person has tapped “Allow” — “phone set up” shows who has.</p>
        {err && <p className="mt-md rounded-xl bg-red-50 p-md text-sm text-red-700">{err}</p>}
        {!d && !err && <p className="mt-md text-sm text-neutral-500">Loading…</p>}
        {d && (<>
          <nav aria-label="On this page" className="my-lg flex flex-wrap gap-xs">
            {[['tenants', 'Tenants'], ['landlords', 'Landlords'], ['workers', 'Contractors & cleaners'], ['office', 'Office']].map(([id, l]) => <a key={id} href={`#${id}`} className="rounded-full bg-white px-md py-xs text-sm font-semibold text-neutral-800 ring-1 ring-neutral-200 hover:ring-neutral-900">{l}</a>)}
          </nav>

          {/* ── Tenants ── */}
          <section id="tenants" className={`${card} scroll-mt-lg`}>
            <div className={head}><h2 className="text-base font-bold text-neutral-900">Tenants</h2><p className="mt-xs text-xs text-neutral-500">Automatic updates — repairs approved and booked, “on our way”, finished jobs, viewings, reminders.</p></div>
            <div className="flex items-start gap-lg px-lg py-md">
              <Switch on={d.tenants.master} busy={busy === 'master'} label="Automatic messages for every property" onClick={() => save('master', { type: 'setting', key: 'comms_live', value: !d.tenants.master }, x => ({ ...x, tenants: { ...x.tenants, master: !x.tenants.master } }))} />
              <div><p className="text-sm font-semibold text-neutral-900">{d.tenants.master ? 'On for every property' : 'Paused — except the properties switched on below'}</p><p className="text-xs text-neutral-500">The main switch. Paused is the safe mode while you set CROS up.</p></div>
            </div>
            {!d.tenants.master && (
              <div className="border-t border-neutral-100 px-lg py-md">
                <div className="flex flex-wrap items-baseline justify-between gap-sm"><p className="text-sm font-semibold text-neutral-900">Property by property</p><span className="text-xs text-neutral-500">{d.tenants.properties.filter(p => p.on).length ? `On for ${d.tenants.properties.filter(p => p.on).length}` : 'None on yet'}</span></div>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a property or person" className="mt-sm w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" />
                <ul className="mt-sm grid gap-x-lg sm:grid-cols-2">
                  {props.map(p => (
                    <li key={p.id} className="flex items-center justify-between gap-md border-b border-neutral-100 py-sm">
                      <span className="min-w-0 truncate text-sm text-neutral-900">{p.name}</span>
                      <Switch on={p.on} busy={busy === p.id} label={`Messages for ${p.name}`} onClick={() => save(p.id, { type: 'property', id: p.id, on: !p.on }, x => ({ ...x, tenants: { ...x.tenants, properties: x.tenants.properties.map(y => y.id === p.id ? { ...y, on: !y.on } : y) } }))} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-start gap-lg border-t border-neutral-100 px-lg py-md">
              <Switch on={d.tenants.elected} busy={busy === 'elected'} label="Messages you send yourself" onClick={() => save('elected', { type: 'setting', key: 'elected_comms_live', value: !d.tenants.elected }, x => ({ ...x, tenants: { ...x.tenants, elected: !x.tenants.elected } }))} />
              <div><p className="text-sm font-semibold text-neutral-900">Messages you send yourself</p><p className="text-xs text-neutral-500">Quick Notify, certificates, licence notices and viewing notices — sent only when someone presses send.</p></div>
            </div>
            <div className="flex items-start gap-lg border-t border-neutral-100 px-lg py-md">
              <Switch on={d.tenants.emergencyUpdates} busy={busy === 'em'} label="Emergency updates to tenants" onClick={() => save('em', { type: 'setting', key: 'emergency_tenant_updates', value: !d.tenants.emergencyUpdates }, x => ({ ...x, tenants: { ...x.tenants, emergencyUpdates: !x.tenants.emergencyUpdates } }))} />
              <div><p className="text-sm font-semibold text-neutral-900">Emergency updates</p><p className="text-xs text-neutral-500">“We’re on it”, who’s coming and when — during an emergency.</p></div>
            </div>
          </section>

          {/* ── Landlords ── */}
          <section id="landlords" className={`${card} scroll-mt-lg`}>
            <div className={head}><h2 className="text-base font-bold text-neutral-900">Landlords</h2><p className="mt-xs text-xs text-neutral-500">Updates about their properties. Each landlord can choose which kinds in their own app.</p></div>
            <ul className="grid gap-x-lg px-lg py-sm sm:grid-cols-2">
              {d.landlords.filter(l => match(l.name)).map(l => (
                <li key={l.id} className="flex items-center justify-between gap-md border-b border-neutral-100 py-sm">
                  <span className="min-w-0"><span className="block truncate text-sm text-neutral-900">{l.name}</span><AppBadge on={l.onApp} /></span>
                  <Switch on={l.on} busy={busy === l.id} label={`Updates to ${l.name}`} onClick={() => save(l.id, { type: 'landlord', id: l.id, on: !l.on }, x => ({ ...x, landlords: x.landlords.map(y => y.id === l.id ? { ...y, on: !y.on } : y) }))} />
                </li>
              ))}
            </ul>
          </section>

          {/* ── Contractors & cleaners ── */}
          <section id="workers" className={`${card} scroll-mt-lg`}>
            <div className={head}><h2 className="text-base font-bold text-neutral-900">Contractors & cleaners</h2><p className="mt-xs text-xs text-neutral-500">New jobs, emergencies, cleans and tenants’ answers always go to their app inbox. Choose how else each person is reached. If nothing else reaches them, CROS texts anyway, so a job is never missed.</p></div>
            <div className="overflow-x-auto px-lg py-sm">
              <table className="w-full min-w-[520px] text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wider text-neutral-500"><th className="py-xs">Person</th><th className="py-xs">App</th><th className="py-xs">Email</th><th className="py-xs">Text</th><th className="py-xs">Phone</th></tr></thead>
                <tbody>
                  {d.workers.filter(w => match(w.name)).map(w => (
                    <tr key={w.id} className="border-t border-neutral-100">
                      <td className="py-sm pr-md"><span className="block text-neutral-900">{w.name}</span><span className="text-xs capitalize text-neutral-500">{w.role}</span></td>
                      {(['push', 'email', 'sms'] as const).map(f => (
                        <td key={f} className="py-sm"><Switch on={w[f]} busy={busy === w.id + f} label={`${f} for ${w.name}`} onClick={() => save(w.id + f, { type: 'person', id: w.id, field: f, on: !w[f] }, x => ({ ...x, workers: x.workers.map(y => y.id === w.id ? { ...y, [f]: !y[f] } : y) }))} /></td>
                      ))}
                      <td className="py-sm"><AppBadge on={w.onApp} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Office ── */}
          <section id="office" className={`${card} scroll-mt-lg`}>
            <div className={head}><h2 className="text-base font-bold text-neutral-900">Office</h2><p className="mt-xs text-xs text-neutral-500">New repairs, emergencies and messages go to the office bell and to phones that are set up. To set up a phone: open CROS from its home-screen icon and tap “Allow” when asked.</p></div>
            <ul className="grid gap-x-lg px-lg py-sm sm:grid-cols-2">
              {d.office.filter(o => match(o.name)).map(o => (
                <li key={o.id} className="flex items-center justify-between gap-md border-b border-neutral-100 py-sm">
                  <span className="min-w-0"><span className="block truncate text-sm text-neutral-900">{o.name}</span><span className="text-xs capitalize text-neutral-500">{o.role}</span></span>
                  <AppBadge on={o.onApp} />
                </li>
              ))}
            </ul>
          </section>
        </>)}
      </div>
    </div>
  )
}
