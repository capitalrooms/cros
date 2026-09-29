'use client'

// Finance health check: the data gaps that stop rent, statements and client money adding up — each with its fix.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'

interface Check { key: string; title: string; ok: boolean; count: number; detail: string; items: { label: string; href?: string }[]; fix?: { action?: string; href?: string; label: string } }

export default function FinanceCheckPage() {
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await adminFetch('/api/admin/finance-check')
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not run the checks')
      setChecks(j.checks)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not run the checks') }
  }, [])
  useEffect(() => { load() }, [load])

  async function run(action: string, label: string) {
    if (!window.confirm(`${label}?`)) return
    setBusy(action); setError(''); setNotice('')
    try {
      const r = await adminFetch('/api/admin/finance-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not do that')
      setNotice(j.message || `Filled ${j.filled} reference${j.filled === 1 ? '' : 's'}${j.skipped ? `; ${j.skipped} need doing by hand (no room number in the name)` : ''}.`); load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not do that') }
    finally { setBusy('') }
  }

  const problems = (checks ?? []).filter(c => !c.ok).length

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/accounts" />} title="Finance health check" />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Finance health check</h1>
          <p className="mt-xs text-sm text-neutral-600">{checks ? (problems ? `${problems} thing${problems === 1 ? '' : 's'} to sort so rent, statements and client money add up.` : 'Everything checks out.') : 'Checking…'}</p>
        </div>
        {error && <p className="rounded-xl bg-red-50 px-md py-sm text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-xl bg-green-50 px-md py-sm text-sm text-green-800">{notice}</p>}
        <div className="space-y-sm">
          {(checks ?? []).map(c => (
            <section key={c.key} className="rounded-2xl bg-white p-lg">
              <div className="flex flex-wrap items-start gap-md">
                <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${c.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{c.ok ? '✓' : c.count}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-neutral-900">{c.title}</h2>
                  <p className="text-sm text-neutral-600">{c.detail}</p>
                  {!c.ok && c.items.length > 0 && (
                    <button onClick={() => setOpen(open === c.key ? null : c.key)} className="mt-xs text-xs font-bold text-neutral-700 underline">{open === c.key ? 'Hide' : `Show ${c.items.length}`}</button>
                  )}
                  {open === c.key && (
                    <ul className="mt-sm columns-1 gap-lg text-sm sm:columns-2">
                      {c.items.map((i, n) => <li key={n} className="break-inside-avoid py-0.5">{i.href ? <Link href={i.href} className="underline">{i.label}</Link> : i.label}</li>)}
                    </ul>
                  )}
                </div>
                {!c.ok && c.fix && (c.fix.action
                  ? <button disabled={!!busy} onClick={() => run(c.fix!.action!, c.fix!.label)} className="rounded-lg bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:bg-neutral-300">{busy === c.fix.action ? 'Working…' : c.fix.label}</button>
                  : <Link href={c.fix.href!} className="rounded-lg border border-neutral-300 px-md py-sm text-sm font-bold text-neutral-800">{c.fix.label}</Link>)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
