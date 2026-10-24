'use client'

// Your documents — the tenant's tenancy papers, rent statement, letters and the house's certificates, kept in the app
// and opened through a fresh private link each time (lib/tenant/documents, 22 Oct 2026).
import { useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'

interface Doc { id: string; group: string; label: string; date: string | null; note?: string }
const GROUPS = ['Your tenancy', 'Your rent', 'Letters & receipts', 'House certificates']
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })

export default function TenantDocumentsPage() {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    adminFetch('/api/tenant/documents').then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'Your documents couldn’t be loaded.'); setDocs([]); return }
      setDocs(d.documents ?? [])
    }).catch(() => { setError('Couldn’t reach us — check your connection.'); setDocs([]) })
  }, [])

  async function open(d: Doc) {
    const win = window.open('', '_blank')   // opened on the tap, so the browser allows it
    setBusy(d.id); setError(null)
    try {
      const r = await adminFetch(`/api/tenant/documents?open=${encodeURIComponent(d.id)}`)
      if (r.headers.get('content-type')?.includes('application/pdf')) {
        const url = URL.createObjectURL(await r.blob())
        if (win) win.location.href = url; else window.location.href = url
        return
      }
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.url) throw new Error(j.error ?? 'That document couldn’t be opened.')
      if (win) win.location.href = j.url; else window.location.href = j.url
    } catch (e) {
      win?.close()
      setError(e instanceof Error ? e.message : 'That document couldn’t be opened.')
    } finally { setBusy('') }
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-3xl">
      <AppBar left={<BackButton href="/tenant" />} />
      <main className="mx-auto max-w-lg px-lg py-lg">
        <h1 className="mb-xs text-2xl font-bold text-neutral-900">Your documents</h1>
        <p className="mb-lg text-sm text-neutral-500">Everything about your tenancy in one place. Tap to open — it’s always the current copy.</p>
        {error && <p className="mb-md rounded-xl border border-red-200 bg-red-50 p-md text-sm font-semibold text-red-800">{error}</p>}
        {docs === null ? <p className="text-sm text-neutral-400">Loading…</p>
          : docs.length === 0 ? <p className="rounded-2xl border border-neutral-200 bg-white p-lg text-sm text-neutral-500">Nothing here yet. Your tenancy documents appear once your move-in pack has been sent.</p>
          : <div className="space-y-lg">
            {GROUPS.map(g => {
              const items = docs.filter(d => d.group === g)
              return items.length ? (
                <section key={g}>
                  <h2 className="mb-sm text-xs font-bold uppercase tracking-wide text-neutral-500">{g}</h2>
                  <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                    {items.map(d => (
                      <li key={d.id}>
                        <button type="button" onClick={() => open(d)} disabled={busy === d.id} className="flex w-full items-center justify-between gap-md px-md py-md text-left hover:bg-neutral-50 disabled:opacity-60">
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-neutral-900">{d.label}</span>
                            <span className="block text-xs text-neutral-500">{[d.note, d.date ? day(d.date) : null].filter(Boolean).join(' · ')}</span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold text-blue-700">{busy === d.id ? 'Opening…' : 'Open'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null
            })}
          </div>}
      </main>
    </div>
  )
}
