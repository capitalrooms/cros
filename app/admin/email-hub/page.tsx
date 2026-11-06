'use client'

// The Email hub (6 Nov 2026, Harry: "an email out hub whereby every single type of email we can send is recorded …
// switch all emails to new theme, there could be a christmas theme one day"). Three things:
//   Themes   — the five looks (lib/email/themes), each previewed live; one is used for every email
//   Dates    — a theme for a stretch of dates (Christmas), which switches itself on and off
//   Emails   — every kind of email CROS sends, by who gets it (lib/email/registry); those marked can have their own theme
// Data: /api/admin/email-hub. Administrators only.
import { useEffect, useMemo, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'

type Theme = { key: string; name: string; from: string; bar: string; page: string; rule: string; band: string | null }
type Kind = { key: string; name: string; audience: string; when: string; own?: boolean }
type Look = { default: string; schedule: { theme: string; from: string; to: string }[]; perEmail: Record<string, string> }

const card = 'rounded-2xl border border-neutral-200 bg-white p-lg'
const btn = 'rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-40'
const btnDark = 'rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40'
const input = 'rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

function Preview({ theme, kind, height = 360 }: { theme: string; kind?: string; height?: number }) {
  const [html, setHtml] = useState('')
  useEffect(() => {
    let live = true
    adminFetch(`/api/admin/email-hub?preview=${theme}${kind ? `&kind=${kind}` : ''}`).then(r => r.text()).then(h => { if (live) setHtml(h) }).catch(() => {})
    return () => { live = false }
  }, [theme, kind])
  return html ? <iframe title={`Preview — ${theme}`} srcDoc={html} sandbox="" className="w-full rounded-lg border border-neutral-200 bg-white" style={{ height }} />
    : <div className="flex items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-xs text-neutral-500" style={{ height }}>Loading…</div>
}

export default function EmailHubPage() {
  const [d, setD] = useState<{ look: Look; themes: Theme[]; kinds: Kind[]; audiences: string[] } | null>(null)
  const [look, setLook] = useState<Look | null>(null)
  const [tab, setTab] = useState<'themes' | 'emails'>('themes')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [big, setBig] = useState<{ theme: string; kind?: string; title: string } | null>(null)

  useEffect(() => { adminFetch('/api/admin/email-hub').then(r => r.json()).then(j => { if (j.look) { setD(j); setLook(j.look) } else setMsg(j.error ?? 'Couldn’t load') }) }, [])

  async function save(next: Look, note: string) {
    setLook(next); setSaving(true); setMsg('')
    const r = await adminFetch('/api/admin/email-hub', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ look: next }) })
    const j = await r.json().catch(() => ({}))
    setSaving(false)
    if (r.ok) { setLook(j.look); setMsg(note) } else setMsg(j.error ?? 'Couldn’t save')
  }

  const name = (k: string) => d?.themes.find(t => t.key === k)?.name ?? k
  const nowTheme = useMemo(() => { if (!look) return null; const t = today(); return look.schedule.find(s => s.from <= t && t <= s.to)?.theme ?? look.default }, [look])
  const byAudience = useMemo(() => (d?.audiences ?? []).map(a => ({ a, kinds: (d?.kinds ?? []).filter(k => k.audience === a) })), [d])

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/communications" />} title="Email hub" />
      <PageHero trail={[{ label: 'Communications', href: '/admin/communications' }]} title="Email hub"
        subtitle="How every email from Capital Rooms looks — one theme for all, a theme for some dates, or one for a single email"
        stats={look && d ? [
          { label: 'In use today', value: name(nowTheme ?? 'house') },
          { label: 'Kinds of email', value: String(d.kinds.length) },
          { label: 'With their own theme', value: String(Object.keys(look.perEmail).length) },
        ] : undefined}
        tabs={[{ key: 'themes', label: 'Themes', active: tab === 'themes', onClick: () => setTab('themes') }, { key: 'emails', label: 'Every email', active: tab === 'emails', onClick: () => setTab('emails') }]} />
      <main className="mx-auto max-w-6xl space-y-md px-lg py-xl">
        {msg && <p className="rounded-xl border border-neutral-200 bg-white px-lg py-sm text-sm text-neutral-700">{msg}</p>}
        {!d || !look ? <p className="text-sm text-neutral-500">Loading…</p> : tab === 'themes' ? <>
          <section className="grid gap-md md:grid-cols-2 xl:grid-cols-3">
            {d.themes.map(t => (
              <div key={t.key} className={`${card} flex flex-col gap-sm ${look.default === t.key ? 'ring-2 ring-neutral-900' : ''}`}>
                <div className="flex items-baseline justify-between gap-sm">
                  <h2 className="text-base font-bold text-neutral-900">{t.name}</h2>
                  {look.default === t.key && <span className="rounded-full bg-neutral-900 px-sm py-[2px] text-[11px] font-bold text-white">For all emails</span>}
                  {nowTheme === t.key && look.default !== t.key && <span className="rounded-full bg-amber-100 px-sm py-[2px] text-[11px] font-bold text-amber-900">On today (dates)</span>}
                </div>
                <p className="text-xs text-neutral-500">From: {t.from}</p>
                <button type="button" onClick={() => setBig({ theme: t.key, title: t.name })} className="text-left" aria-label={`Open a large preview of ${t.name}`}>
                  <Preview theme={t.key} height={300} />
                </button>
                <div className="flex flex-wrap gap-xs">
                  <button type="button" className={btnDark} disabled={saving || look.default === t.key} onClick={() => save({ ...look, default: t.key }, `Every email now uses ${t.name}${look.schedule.length ? ' (outside the dates below)' : ''}.`)}>Use for all emails</button>
                  <button type="button" className={btn} onClick={() => setBig({ theme: t.key, title: t.name })}>Preview</button>
                </div>
              </div>
            ))}
          </section>

          <section className={card}>
            <h2 className="text-base font-bold text-neutral-900">On dates</h2>
            <p className="mt-xs text-sm text-neutral-600">A theme for a stretch of time — it switches itself on at the start and back to {name(look.default)} after.</p>
            <ul className="mt-sm divide-y divide-neutral-100">
              {look.schedule.map((s, i) => (
                <li key={i} className="flex flex-wrap items-center gap-sm py-sm text-sm">
                  <select className={input} value={s.theme} onChange={e => setLook({ ...look, schedule: look.schedule.map((x, j) => j === i ? { ...x, theme: e.target.value } : x) })}>
                    {d.themes.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
                  </select>
                  <span className="text-neutral-500">from</span>
                  <input type="date" className={input} value={s.from} onChange={e => setLook({ ...look, schedule: look.schedule.map((x, j) => j === i ? { ...x, from: e.target.value } : x) })} />
                  <span className="text-neutral-500">to</span>
                  <input type="date" className={input} value={s.to} onChange={e => setLook({ ...look, schedule: look.schedule.map((x, j) => j === i ? { ...x, to: e.target.value } : x) })} />
                  <span className="text-xs text-neutral-500">{s.from <= today() && today() <= s.to ? 'On now' : s.from > today() ? `Starts ${day(s.from)}` : 'Finished'}</span>
                  <button type="button" className="ml-auto text-xs font-semibold text-red-700 hover:underline" onClick={() => save({ ...look, schedule: look.schedule.filter((_, j) => j !== i) }, 'Dates removed.')}>Remove</button>
                </li>
              ))}
            </ul>
            <div className="mt-sm flex flex-wrap gap-xs">
              <button type="button" className={btn} onClick={() => { const y = new Date().getFullYear(); setLook({ ...look, schedule: [...look.schedule, { theme: 'christmas', from: `${y}-12-01`, to: `${y}-12-31` }] }) }}>+ Christmas, 1–31 December</button>
              <button type="button" className={btn} onClick={() => setLook({ ...look, schedule: [...look.schedule, { theme: look.default, from: today(), to: today() }] })}>+ Other dates</button>
              <button type="button" className={btnDark} disabled={saving} onClick={() => save(look, 'Dates saved.')}>Save dates</button>
            </div>
          </section>
        </> : (
          <section className="space-y-md">
            <p className="text-sm text-neutral-600">Every kind of email CROS sends. Those with a theme menu can have their own look; the rest use the theme for all emails (or the dated one) until they’re moved across.</p>
            {byAudience.map(({ a, kinds }) => (
              <div key={a} className={card}>
                <h2 className="text-base font-bold text-neutral-900">{a} <span className="text-sm font-normal text-neutral-500">· {kinds.length}</span></h2>
                <ul className="mt-sm divide-y divide-neutral-100">
                  {kinds.map(k => {
                    const own = look.perEmail[k.key]
                    return (
                      <li key={k.key} className="flex flex-wrap items-center gap-sm py-sm text-sm">
                        <span className="min-w-[220px] flex-1"><span className="font-semibold text-neutral-900">{k.name}</span><span className="block text-xs text-neutral-500">{k.when}</span></span>
                        {k.own ? (
                          <select className={input} value={own ?? ''} disabled={saving}
                            onChange={e => { const per = { ...look.perEmail }; if (e.target.value) per[k.key] = e.target.value; else delete per[k.key]; save({ ...look, perEmail: per }, `${k.name}: ${e.target.value ? name(e.target.value) : `follows the theme for all emails`}.`) }}>
                            <option value="">Theme for all emails ({name(nowTheme ?? look.default)})</option>
                            {d.themes.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
                          </select>
                        ) : <span className="text-xs text-neutral-500">Theme for all emails</span>}
                        <button type="button" className="text-xs font-semibold text-blue-700 hover:underline" onClick={() => setBig({ theme: own ?? nowTheme ?? look.default, kind: k.key, title: k.name })}>Preview</button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </section>
        )}
      </main>

      {big && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-lg" onClick={() => setBig(null)}>
          <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl md:rounded-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-md border-b border-neutral-200 px-lg py-md">
              <h3 className="text-lg font-bold text-neutral-900">{big.title} · {name(big.theme)}</h3>
              <div className="flex items-center gap-sm">
                {d && <select className={input} value={big.theme} onChange={e => setBig({ ...big, theme: e.target.value })}>{d.themes.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}</select>}
                <button type="button" onClick={() => setBig(null)} className="text-sm font-semibold text-neutral-500">Close</button>
              </div>
            </div>
            <div className="overflow-y-auto p-md"><Preview theme={big.theme} kind={big.kind} height={760} /></div>
          </div>
        </div>
      )}
    </div>
  )
}
