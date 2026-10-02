'use client'

// Email new certificates to everyone living in the house — each tenant gets their own copy.
import { use, useCallback, useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'

interface Doc { key: string; label: string; url: string | null; uploadedAt: string | null; nextDue: string | null; recent: boolean }
interface Tenant { personId: string; name: string; email: string; room: string }
interface Send { id: string; subject: string; sent_at: string; documents: { label: string }[]; recipients: { name: string; ok: boolean }[] }
interface Data {
  property: { id: string; name: string; address: string }; documents: Doc[]; tenants: Tenant[]; sends: Send[]
  commsLive: boolean; defaults: { subject: string; message: string }; setupNeeded: string | null
}

const d = (iso: string | null) => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const input = 'mt-xs w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900'

export default function SendHouseDocuments({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [docs, setDocs] = useState<Set<string>>(new Set())
  const [people, setPeople] = useState<Set<string>>(new Set())
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [html, setHtml] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async (reset: boolean) => {
    try {
      const r = await adminFetch(`/api/admin/house-docs/${id}`)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not load the house')
      setData(j)
      if (reset) {
        setDocs(new Set(j.documents.filter((x: Doc) => x.recent && x.url).map((x: Doc) => x.key)))
        setPeople(new Set(j.tenants.map((t: Tenant) => t.personId)))
        setSubject(j.defaults.subject); setMessage(j.defaults.message)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the house') }
  }, [id])
  useEffect(() => { load(true) }, [load])

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string, on: boolean) => { const n = new Set(set); if (on) n.add(key); else n.delete(key); setter(n) }

  async function post(action: 'preview' | 'test' | 'send') {
    if (action === 'send' && !window.confirm(`Email ${people.size} tenant${people.size === 1 ? '' : 's'} at ${data?.property.name}?`)) return
    setBusy(action); setError(''); setNotice('')
    try {
      const r = await adminFetch(`/api/admin/house-docs/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, docKeys: [...docs], personIds: [...people], subject, message }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not send')
      if (action === 'preview') setHtml(j.html)
      else if (action === 'test') setNotice(`Test sent to ${j.sentTo?.[0]}.`)
      else { setNotice(`Sent to ${j.sent} tenant${j.sent === 1 ? '' : 's'}${j.failed?.length ? ` — failed: ${j.failed.join(', ')}` : ''}.${j.warning ? ' ' + j.warning : ''}`); load(false) }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send') }
    finally { setBusy('') }
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href={`/admin/properties/${id}`} />} title="Send documents to the house" />
      <PageHero eyebrow="Send documents to the house" title={data ? String(data.property.name ?? '').split('\n')[0] : 'Send documents'} subtitle={data?.property.address} />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        {!data ? (error ? <p className="rounded-xl bg-red-50 px-md py-sm text-sm text-red-700">{error}</p> : <p className="text-sm text-neutral-400">Loading…</p>) : (
          <>
            {data.setupNeeded && <p className="rounded-xl border border-amber-200 bg-amber-50 px-md py-sm text-sm text-amber-900">{data.setupNeeded}</p>}
            {error && <p className="rounded-xl bg-red-50 px-md py-sm text-sm text-red-700">{error}</p>}
            {notice && <p className="rounded-xl bg-green-50 px-md py-sm text-sm text-green-800">{notice}</p>}

            <div className="grid gap-lg lg:grid-cols-2">
              <section className="rounded-2xl bg-white p-lg">
                <h2 className="font-bold text-neutral-900">Certificates</h2>
                <p className="text-xs text-neutral-500">Ticked: uploaded in the last 60 days. Each tenant gets a link to view it and its next due date.</p>
                <ul className="mt-sm space-y-xs">
                  {data.documents.map(x => (
                    <li key={x.key} className="flex items-start gap-sm text-sm">
                      <input type="checkbox" className="mt-1" disabled={!x.url} checked={docs.has(x.key)} onChange={e => toggle(docs, setDocs, x.key, e.target.checked)} />
                      <span className="flex-1">
                        <span className={x.url ? 'text-neutral-900' : 'text-neutral-400'}>{x.label}</span>
                        <span className="block text-xs text-neutral-500">
                          {x.url ? `Uploaded ${d(x.uploadedAt)}` : 'Not uploaded'}{x.nextDue ? ` · next due ${d(x.nextDue)}` : ''}
                        </span>
                      </span>
                      {x.url && <a href={x.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-neutral-500 underline">Open</a>}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-2xl bg-white p-lg">
                <h2 className="font-bold text-neutral-900">Tenants ({data.tenants.length})</h2>
                <p className="text-xs text-neutral-500">Current tenants with an email address. Each gets their own email.</p>
                {data.tenants.length === 0 ? <p className="mt-sm text-sm text-neutral-500">No current tenants with an email address.</p> : (
                  <ul className="mt-sm space-y-xs">
                    {data.tenants.map(t => (
                      <li key={t.personId} className="flex items-center gap-sm text-sm">
                        <input type="checkbox" checked={people.has(t.personId)} onChange={e => toggle(people, setPeople, t.personId, e.target.checked)} />
                        <span className="flex-1 text-neutral-900">{t.name} <span className="text-neutral-500">· {t.room}</span></span>
                        <span className="text-xs text-neutral-500">{t.email}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="rounded-2xl bg-white p-lg">
              <div className="grid gap-lg lg:grid-cols-2">
                <div className="space-y-sm">
                  <label className="block text-xs font-semibold text-neutral-700">Subject<input className={input} value={subject} onChange={e => setSubject(e.target.value)} /></label>
                  <label className="block text-xs font-semibold text-neutral-700">Message<textarea rows={4} className={input} value={message} onChange={e => setMessage(e.target.value)} /></label>
                  {!data.commsLive && <p className="rounded-lg bg-amber-50 px-md py-sm text-xs text-amber-900">Tenant messages are paused in Settings, so “Send to tenants” is off. You can send yourself a test.</p>}
                  <div className="flex flex-wrap gap-sm">
                    <button onClick={() => post('send')} disabled={!!busy || !data.commsLive || !docs.size || !people.size} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:bg-neutral-300">{busy === 'send' ? 'Sending…' : `Send to ${people.size} tenant${people.size === 1 ? '' : 's'}`}</button>
                    <button onClick={() => post('test')} disabled={!!busy || !docs.size} className="rounded-lg border border-neutral-300 px-md py-sm text-sm font-bold text-neutral-800">{busy === 'test' ? 'Sending…' : 'Send test to me'}</button>
                    <button onClick={() => post('preview')} disabled={!!busy} className="rounded-lg px-md py-sm text-sm font-bold text-neutral-600 underline">{busy === 'preview' ? 'Building…' : 'Preview email'}</button>
                  </div>
                </div>
                {html ? <iframe title="Email preview" srcDoc={html} className="h-[460px] w-full rounded-lg border border-neutral-200 bg-white" />
                  : <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-neutral-300 text-sm text-neutral-400">Press “Preview email” to see it</div>}
              </div>
            </section>

            {data.sends.length > 0 && (
              <section className="rounded-2xl bg-white p-lg">
                <h2 className="font-bold text-neutral-900">Sent before</h2>
                <ul className="mt-sm divide-y divide-neutral-100 text-sm">
                  {data.sends.map(x => (
                    <li key={x.id} className="py-sm">
                      <span className="font-semibold text-neutral-900">{d(x.sent_at)}</span> · {x.documents.map(y => y.label).join(', ')}
                      <span className="block text-xs text-neutral-500">To {x.recipients.filter(r => r.ok).map(r => r.name).join(', ')}{x.recipients.some(r => !r.ok) ? ` · failed: ${x.recipients.filter(r => !r.ok).map(r => r.name).join(', ')}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
