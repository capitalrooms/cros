'use client'

// One email's wording, from the Email hub (7 Nov 2026 — lib/email/wording). Stored wording: say what to change, get one
// or five versions (every {{detail}} kept), tick the one you like and it's the default from the next send; earlier
// versions stay to go back to. Built-in-code emails: the change is logged for the developer.
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

type V = { subject_line: string; template_text: string }
const strip = (t: string) => t.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

export default function EmailWording({ kind, name, onClose }: { kind: string; name: string; onClose: () => void }) {
  const [d, setD] = useState<{ stored: { slug: string; name: string; current: any; history: any[] }[]; requests: any[] } | null>(null)
  const [slug, setSlug] = useState('')
  const [ask, setAsk] = useState('')
  const [versions, setVersions] = useState<V[]>([])
  const [pick, setPick] = useState(-1)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const post = (body: unknown) => adminFetch('/api/admin/email-hub', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))
  const load = () => adminFetch(`/api/admin/email-hub?wording=${kind}`).then(r => r.json()).then(j => { setD(j); setSlug(s => s || j.stored?.[0]?.slug || '') })
  useEffect(() => { load() }, [kind])   // eslint-disable-line react-hooks/exhaustive-deps
  const cur = d?.stored.find(x => x.slug === slug)

  async function make(n: number) {
    setBusy(`m${n}`); setMsg(''); setVersions([]); setPick(-1)
    const { ok, j } = await post({ action: 'rewrite', kind, slug, instruction: ask, n })
    setBusy('')
    if (!ok) { setMsg(j.error ?? 'Couldn’t write new versions'); return }
    setVersions(j.versions); setPick(j.versions.length === 1 ? 0 : -1)
  }
  async function useIt(v: V, note: string) {
    setBusy('adopt')
    const { ok, j } = await post({ action: 'adopt', kind, slug, ...v })
    setBusy('')
    if (!ok) { setMsg(j.error ?? 'Couldn’t save'); return }
    setVersions([]); setAsk(''); setMsg(note); load()
  }
  async function request() {
    setBusy('req')
    const { ok, j } = await post({ action: 'request', kind, instruction: ask })
    setBusy('')
    if (!ok) { setMsg(j.error ?? 'Couldn’t save'); return }
    setAsk(''); setMsg('Logged — it’ll be changed in the next update.'); load()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-lg" onClick={onClose}>
      <div className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl md:rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-baseline justify-between gap-md border-b border-neutral-200 px-lg py-md">
          <h3 className="text-lg font-bold text-neutral-900">Wording · {name}</h3>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-neutral-500">Close</button>
        </div>
        <div className="min-h-0 flex-1 space-y-md overflow-y-auto p-lg text-sm">
          {!d ? <p className="text-neutral-500">Loading…</p> : !d.stored.length ? (
            <>
              <p className="text-neutral-700">This email’s wording is built into CROS rather than stored, so it can’t be rewritten here yet. Say what you’d like changed and it’ll be done in the next update.</p>
              <textarea rows={3} className="w-full rounded-lg border border-neutral-300 px-sm py-xs" value={ask} onChange={e => setAsk(e.target.value)} placeholder="e.g. Make the heading bolder · Remove the bit about parking" />
              <button type="button" disabled={!ask.trim() || !!busy} onClick={request} className="rounded-lg bg-neutral-900 px-md py-xs font-semibold text-white disabled:opacity-40">{busy === 'req' ? 'Saving…' : 'Log the change'}</button>
              {d.requests.length > 0 && <div><p className="text-xs font-bold uppercase tracking-wider text-neutral-500">Asked for</p><ul className="mt-1 space-y-0.5 text-xs text-neutral-600">{d.requests.map((r, i) => <li key={i}>{new Date(r.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {r.instruction}{r.done ? ' ✓ done' : ''}</li>)}</ul></div>}
            </>
          ) : (
            <>
              {d.stored.length > 1 && <div className="flex flex-wrap gap-xs">{d.stored.map(x => <button key={x.slug} type="button" onClick={() => { setSlug(x.slug); setVersions([]) }} className={`rounded-full px-md py-xs text-xs font-semibold ${slug === x.slug ? 'bg-neutral-900 text-white' : 'border border-neutral-300'}`}>{x.name}</button>)}</div>}
              {cur?.current && <div className="rounded-xl border border-neutral-200 p-md"><p className="text-xs font-bold uppercase tracking-wider text-neutral-500">In use now · since {new Date(cur.current.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</p>
                <p className="mt-1 font-semibold">{cur.current.subject_line}</p><pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-xs text-neutral-700">{strip(cur.current.template_text)}</pre></div>}
              <label className="block"><span className="font-semibold text-neutral-900">What would you like changed?</span>
                <textarea rows={2} className="mt-1 w-full rounded-lg border border-neutral-300 px-sm py-xs" value={ask} onChange={e => setAsk(e.target.value)} placeholder="e.g. Make it warmer and shorter · Remove the bit about parking · Put the date first" /></label>
              <div className="flex flex-wrap gap-xs">
                <button type="button" disabled={!!busy} onClick={() => make(1)} className="rounded-lg bg-neutral-900 px-md py-xs font-semibold text-white disabled:opacity-40">{busy === 'm1' ? 'Writing…' : 'Write a new version'}</button>
                <button type="button" disabled={!!busy} onClick={() => make(5)} className="rounded-lg border border-neutral-300 px-md py-xs font-semibold disabled:opacity-40">{busy === 'm5' ? 'Writing five…' : 'Give me 5 to choose from'}</button>
              </div>
              {versions.length > 0 && <div className="space-y-sm">
                {versions.map((v, i) => (
                  <label key={i} className={`block cursor-pointer rounded-xl border p-md ${pick === i ? 'border-neutral-900 ring-1 ring-neutral-900' : 'border-neutral-200'}`}>
                    <span className="flex items-center gap-xs"><input type="radio" checked={pick === i} onChange={() => setPick(i)} /> <span className="font-semibold">{versions.length > 1 ? `Version ${i + 1}: ` : ''}{v.subject_line}</span></span>
                    <pre className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap font-sans text-xs text-neutral-700">{strip(v.template_text)}</pre>
                  </label>
                ))}
                <button type="button" disabled={pick < 0 || busy === 'adopt'} onClick={() => useIt(versions[pick], 'Saved — this is the wording from the next email sent.')} className="rounded-lg bg-emerald-700 px-md py-xs font-semibold text-white disabled:opacity-40">{busy === 'adopt' ? 'Saving…' : 'Make this the default'}</button>
              </div>}
              {cur && cur.history.length > 0 && <details><summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-neutral-500">Earlier versions · {cur.history.length}</summary>
                <ul className="mt-1 space-y-xs">{cur.history.map((h: any) => <li key={h.id} className="rounded-lg border border-neutral-200 p-sm text-xs"><span className="font-semibold">{h.subject_line}</span> · {new Date(h.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  <button type="button" onClick={() => useIt({ subject_line: h.subject_line, template_text: h.template_text }, 'Gone back to that version.')} className="ml-xs font-semibold text-blue-700 hover:underline">Use this again</button></li>)}</ul></details>}
            </>
          )}
          {msg && <p className="rounded-lg bg-neutral-50 px-md py-xs text-neutral-800">{msg}</p>}
        </div>
      </div>
    </div>
  )
}
