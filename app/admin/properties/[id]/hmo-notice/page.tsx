'use client'

// HMO licence application notice for one property — filled in from the property, landlord and council; check,
// edit, then download (to print or post) or email it to the tenants living there now.
import { use, useCallback, useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { LONDON_COUNCILS } from '@/lib/councils/london'
import type { HmoNoticeFields } from '@/lib/letters/hmoNotice'

interface Tenant { personId: string; name: string; email: string; room: string }
interface Send { id: string; sentAt: string; recipients: { name: string; ok: boolean }[]; fields: HmoNoticeFields | null }
interface Data {
  property: { id: string; name: string; address: string }
  fields: HmoNoticeFields; councilDistrict: string | null; councilChecked: string | null; warnings: string[]
  councils: { key: string; name: string; checked: boolean }[]; tenants: Tenant[]; sends: Send[]; commsLive: boolean
}

const input = 'mt-xs w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900'
const label = 'block text-xs font-semibold text-neutral-700'
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default function HmoNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [f, setF] = useState<HmoNoticeFields | null>(null)
  const [people, setPeople] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await adminFetch(`/api/admin/hmo-notice/${id}`)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not load the property')
      setData(j); setF(j.fields); setPeople(new Set(j.tenants.map((t: Tenant) => t.personId)))
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the property') }
  }, [id])
  useEffect(() => { load() }, [load])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const set = <K extends keyof HmoNoticeFields>(k: K, v: HmoNoticeFields[K]) => setF(prev => prev ? { ...prev, [k]: v } : prev)
  const setIn = <K extends 'manager' | 'holder' | 'council'>(k: K, patch: Partial<HmoNoticeFields[K]>) => setF(prev => prev ? { ...prev, [k]: { ...prev[k], ...patch } } : prev)
  const pickCouncil = (key: string) => { const c = LONDON_COUNCILS[key]; if (c) setIn('council', { name: c.name, address: c.address.join(', '), phone: c.phone, email: c.email ?? '' }) }

  async function pdf(fields: HmoNoticeFields, mode: 'preview' | 'download') {
    setBusy(mode); setError('')
    try {
      const r = await adminFetch(`/api/admin/hmo-notice/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pdf', fields }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not make the letter')
      const url = URL.createObjectURL(await r.blob())
      if (mode === 'preview') setPreview(url)
      else {
        const a = document.createElement('a')
        a.href = url; a.download = `HMO-licence-notice-${(fields.propertyAddress.split(',')[0] || 'property').replace(/[^\w]+/g, '-')}-${fields.letterDate}.pdf`
        a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not make the letter') }
    finally { setBusy('') }
  }

  async function email(action: 'test' | 'send') {
    if (!f) return
    if (action === 'send' && !window.confirm(`Email the notice to ${people.size} tenant${people.size === 1 ? '' : 's'} at ${data?.property.name}?`)) return
    setBusy(action); setError(''); setNotice('')
    try {
      const r = await adminFetch(`/api/admin/hmo-notice/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, fields: f, personIds: [...people] }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not send')
      if (action === 'test') setNotice(`Test sent to ${j.sentTo}.`)
      else { setNotice(`Sent to ${j.sent} tenant${j.sent === 1 ? '' : 's'}${j.failed?.length ? ` — failed: ${j.failed.join(', ')}` : ''}.${j.warning ? ' ' + j.warning : ''}`); load() }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send') }
    finally { setBusy('') }
  }

  const back = <BackButton href={`/admin/properties/${id}`} />
  if (!data || !f) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={back} title="HMO licence notice" />
      <div className="mx-auto max-w-6xl px-lg py-xl">{error ? <p className="rounded-xl border border-red-200 bg-red-50 px-lg py-md text-sm text-red-700">{error}</p> : <p className="text-sm text-neutral-500">Loading…</p>}</div>
    </div>
  )

  const toggle = (pid: string, on: boolean) => { const n = new Set(people); if (on) n.add(pid); else n.delete(pid); setPeople(n) }
  const councilKey = Object.keys(LONDON_COUNCILS).find(k => LONDON_COUNCILS[k].name === f.council.name) ?? ''

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={back} title="HMO licence notice" />
      <PageHero eyebrow="Properties" title="HMO licence application notice" />
      <div className="mx-auto max-w-6xl px-lg py-xl">
        <div className="mb-md">
          <p className="mt-xs text-sm text-neutral-600">{data.property.address}</p>
        </div>

        {data.warnings.length > 0 && (
          <ul className="mb-md space-y-xs rounded-xl border border-amber-200 bg-amber-50 px-lg py-md text-sm text-amber-900">
            {data.warnings.map(w => <li key={w}>{w}</li>)}
          </ul>
        )}
        {error && <p className="mb-md rounded-xl border border-red-200 bg-red-50 px-lg py-md text-sm text-red-700">{error}</p>}
        {notice && <p className="mb-md rounded-xl border border-green-200 bg-green-50 px-lg py-md text-sm text-green-800">{notice}</p>}

        <div className="grid gap-md lg:grid-cols-[1fr_380px]">
          <div className="space-y-md">
            <section className="rounded-2xl bg-white p-lg">
              <h2 className="mb-sm text-base font-bold text-neutral-900">The letter</h2>
              <div className="grid gap-sm sm:grid-cols-3">
                <label className={label}>Application
                  <select className={input} value={f.kind} onChange={e => set('kind', e.target.value as HmoNoticeFields['kind'])}>
                    <option value="new">New licence</option><option value="renewal">Renewal</option>
                  </select>
                </label>
                <label className={label}>Letter date<input type="date" className={input} value={f.letterDate} onChange={e => set('letterDate', e.target.value)} /></label>
                <label className={label}>Submitted on or before<input type="date" className={input} value={f.submitBy} onChange={e => set('submitBy', e.target.value)} /></label>
              </div>
              <div className="mt-sm grid gap-sm sm:grid-cols-[1fr_180px]">
                <label className={label}>Property address (with postcode)<input className={input} value={f.propertyAddress} onChange={e => set('propertyAddress', e.target.value)} /></label>
                <label className={label}>Dear …<input className={input} value={f.salutation} onChange={e => set('salutation', e.target.value)} /></label>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-lg">
              <h2 className="mb-sm text-base font-bold text-neutral-900">Applicant (property manager)</h2>
              <div className="grid gap-sm sm:grid-cols-2">
                <label className={label}>Name<input className={input} value={f.manager.name} onChange={e => setIn('manager', { name: e.target.value })} /></label>
                <label className={label}>Job title<input className={input} value={f.manager.title} onChange={e => setIn('manager', { title: e.target.value })} /></label>
                <label className={`${label} sm:col-span-2`}>Address<input className={input} value={f.manager.address} onChange={e => setIn('manager', { address: e.target.value })} /></label>
                <label className={label}>Telephone<input className={input} value={f.manager.phone} onChange={e => setIn('manager', { phone: e.target.value })} /></label>
                <label className={label}>Email<input className={input} value={f.manager.email} onChange={e => setIn('manager', { email: e.target.value })} /></label>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-lg">
              <h2 className="mb-sm text-base font-bold text-neutral-900">Proposed licence holder</h2>
              <div className="grid gap-sm sm:grid-cols-2">
                <label className={`${label} sm:col-span-2`}>Name(s)<input className={input} value={f.holder.name} onChange={e => setIn('holder', { name: e.target.value })} /></label>
                <label className={`${label} sm:col-span-2`}>Address<input className={input} value={f.holder.address} onChange={e => setIn('holder', { address: e.target.value })} /></label>
                <label className={label}>Telephone<input className={input} value={f.holder.phone} onChange={e => setIn('holder', { phone: e.target.value })} /></label>
                <label className={label}>Email(s), comma separated<input className={input} value={f.holder.emails.join(', ')} onChange={e => setIn('holder', { emails: e.target.value.split(',').map(x => x.trim()) })} /></label>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-lg">
              <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
                <h2 className="text-base font-bold text-neutral-900">Council</h2>
                <select className="rounded-lg border border-neutral-300 bg-white px-md py-xs text-sm text-neutral-900" value={councilKey} onChange={e => pickCouncil(e.target.value)} aria-label="Choose a council">
                  <option value="">Choose a London council…</option>
                  {data.councils.map(c => <option key={c.key} value={c.key}>{c.key}{c.checked ? '' : ' (check details)'}</option>)}
                </select>
              </div>
              {councilKey && !LONDON_COUNCILS[councilKey].checked && <p className="mb-sm text-xs text-amber-800">These are the council’s main office details — check its licensing team’s address before sending.</p>}
              {councilKey && LONDON_COUNCILS[councilKey].checked && <p className="mb-sm text-xs text-neutral-500">Licensing team details checked {when(LONDON_COUNCILS[councilKey].checked + 'T12:00:00')}.</p>}
              <div className="grid gap-sm sm:grid-cols-2">
                <label className={`${label} sm:col-span-2`}>Name<input className={input} value={f.council.name} onChange={e => setIn('council', { name: e.target.value })} /></label>
                <label className={`${label} sm:col-span-2`}>Address<input className={input} value={f.council.address} onChange={e => setIn('council', { address: e.target.value })} /></label>
                <label className={label}>Telephone<input className={input} value={f.council.phone} onChange={e => setIn('council', { phone: e.target.value })} /></label>
                <label className={label}>Email<input className={input} value={f.council.email} onChange={e => setIn('council', { email: e.target.value })} /></label>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-lg">
              <h2 className="mb-sm text-base font-bold text-neutral-900">Questions to</h2>
              <div className="grid gap-sm sm:grid-cols-2">
                <label className={label}>Phone<input className={input} value={f.contactPhone} onChange={e => set('contactPhone', e.target.value)} /></label>
                <label className={label}>Email<input className={input} value={f.contactEmail} onChange={e => set('contactEmail', e.target.value)} /></label>
              </div>
            </section>
          </div>

          <aside className="space-y-md">
            <section className="rounded-2xl bg-white p-lg">
              <div className="grid grid-cols-2 gap-sm">
                <button onClick={() => pdf(f, 'preview')} disabled={!!busy} className="rounded-lg border border-neutral-300 px-md py-sm text-sm font-bold text-neutral-900 disabled:opacity-50">{busy === 'preview' ? 'Making…' : 'Preview'}</button>
                <button onClick={() => pdf(f, 'download')} disabled={!!busy} className="rounded-lg bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-50">{busy === 'download' ? 'Making…' : 'Download PDF'}</button>
              </div>
              <button onClick={() => email('test')} disabled={!!busy} className="mt-sm w-full rounded-lg border border-neutral-300 px-md py-sm text-sm font-semibold text-neutral-900 disabled:opacity-50">{busy === 'test' ? 'Sending…' : 'Email me a test'}</button>
            </section>

            <section className="rounded-2xl bg-white p-lg">
              <h2 className="mb-sm text-base font-bold text-neutral-900">Send to tenants</h2>
              {!data.commsLive && <p className="mb-sm rounded-lg bg-amber-50 px-md py-sm text-xs text-amber-900">Messages you send yourself are switched off in Settings — download the letter or send yourself a test.</p>}
              {data.tenants.length === 0 && <p className="text-sm text-neutral-500">No one with an email address lives here now.</p>}
              <div className="space-y-xs">
                {data.tenants.map(t => (
                  <label key={t.personId} className="flex items-start gap-sm text-sm text-neutral-900">
                    <input type="checkbox" className="mt-1" checked={people.has(t.personId)} onChange={e => toggle(t.personId, e.target.checked)} />
                    <span><span className="font-semibold">{t.name}</span>{t.room && <span className="text-neutral-500"> · {t.room}</span>}<br /><span className="text-xs text-neutral-500">{t.email}</span></span>
                  </label>
                ))}
              </div>
              {data.tenants.length > 0 && (
                <button onClick={() => email('send')} disabled={!!busy || !data.commsLive || people.size === 0} className="mt-md w-full rounded-lg bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-40">
                  {busy === 'send' ? 'Sending…' : `Email ${people.size} tenant${people.size === 1 ? '' : 's'}`}
                </button>
              )}
            </section>

            {data.sends.length > 0 && (
              <section className="rounded-2xl bg-white p-lg">
                <h2 className="mb-sm text-base font-bold text-neutral-900">Sent before</h2>
                <ul className="space-y-sm text-sm">
                  {data.sends.map(x => (
                    <li key={x.id} className="flex items-start justify-between gap-sm">
                      <span className="text-neutral-900">{when(x.sentAt)}<br /><span className="text-xs text-neutral-500">{x.recipients.filter(r => r.ok).map(r => r.name).join(', ')}</span></span>
                      {x.fields && <button onClick={() => pdf(x.fields!, 'download')} className="shrink-0 text-xs font-semibold text-neutral-900 underline">Letter sent</button>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>

        {preview && (
          <div className="mt-md overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between px-lg py-sm"><span className="text-sm font-bold text-neutral-900">Preview</span><button onClick={() => setPreview('')} className="text-sm text-neutral-600 underline">Close</button></div>
            <iframe src={preview} title="Letter preview" className="h-[900px] w-full" />
          </div>
        )}
      </div>
    </div>
  )
}
