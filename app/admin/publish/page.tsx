'use client'
// Publish (13 Nov 2026) — everything written once and sent out: market updates and news, by email (with the PDF letter),
// text, app notification, the website and social. Drafts first; the monthly market update drafts itself when new
// figures land. /api/admin/publish, lib/publish.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import PageHero from '@/components/PageHero'
import { adminFetch } from '@/lib/adminFetch'

type Item = { id: string; kind: string; title: string; status: string; period: string | null; channels: Record<string, boolean>; scheduled_for: string | null; sent_at: string | null; website_published_at: string | null; created_at: string; created_by: string | null; sent: number; failed: number }
const STATUS: Record<string, [string, string]> = {
  draft: ['Draft', 'bg-neutral-100 text-neutral-700'], approved: ['Approved', 'bg-sky-100 text-sky-900'], scheduled: ['Scheduled', 'bg-violet-100 text-violet-900'],
  sending: ['Sending', 'bg-amber-100 text-amber-900'], sent: ['Sent', 'bg-emerald-100 text-emerald-900'],
}
const CH: Record<string, string> = { email: 'Email', pdf: 'PDF', sms: 'Text', push: 'App', website: 'Website', social: 'Social' }
const day = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export default function PublishList() {
  const router = useRouter()
  const [items, setItems] = useState<Item[] | null>(null)
  const [setup, setSetup] = useState(false)
  const [tracking, setTracking] = useState(true)
  const [templates, setTemplates] = useState<{ key: string; name: string; note: string; picture: string; look: string }[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { adminFetch('/api/admin/publish').then(r => r.json()).then(j => { setSetup(!!j.setupNeeded); setTracking(j.trackingReady !== false); setTemplates(j.templates ?? []); setItems(j.items ?? []) }).catch(() => setItems([])) }, [])
  async function create(template: string) {
    setBusy(template); setErr('')
    const r = await adminFetch('/api/admin/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template, kind: template === 'market' ? 'market_update' : 'announcement' }) })
    const j = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setErr(j.error || 'Couldn’t start it'); return }
    router.push(`/admin/publish/${j.id}`)
  }
  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/communications" />} />
      <PageHero eyebrow="Communications" title="Publish" subtitle="Write it once, then choose who gets it and where — email with a PDF letter, text, app notification, the website and social. Every send is logged; anyone who unsubscribes is left off." />
      <main className="mx-auto max-w-6xl space-y-lg px-lg py-xl">
        {setup && <p className="rounded-xl border-2 border-neutral-900 bg-white p-md text-sm">Run migration 285 in Supabase to switch Publish on.</p>}
        {/* start from a template (13 Nov 2026 — the Mailchimp gap) */}
        <div>
          <p className="mb-sm text-xs font-bold uppercase tracking-wide text-neutral-500">Start something new</p>
          <div className="grid gap-sm sm:grid-cols-2 lg:grid-cols-3">
            {templates.map(t => {
              const [kind, key] = t.picture.split(':')
              const thumb = kind === 'illus' ? `/publish/illustrations/${key}.png` : kind === 'scene' ? `/email/insight/${key}.png` : null
              return (
                <button key={t.key} type="button" disabled={!!busy || setup} onClick={() => create(t.key)} className="group flex overflow-hidden rounded-2xl bg-white text-left ring-1 ring-neutral-200 transition hover:ring-neutral-900 disabled:opacity-50">
                  <span className={`w-24 shrink-0 ${t.look === 'christmas' ? 'bg-[#163A27]' : 'bg-[#F3F0E6]'}`}>{thumb ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={thumb} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center bg-[#1F3B2E] text-2xl text-[#C9A227]">£</span>}</span>
                  <span className="p-md"><span className="block font-bold text-neutral-900">{busy === t.key ? 'Setting it up…' : t.name}</span><span className="block text-xs text-neutral-600">{t.note}</span></span>
                </button>
              )
            })}
          </div>
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
        {!tracking && !setup && (
          <div className="rounded-xl bg-amber-50 p-md text-sm text-amber-950 ring-1 ring-amber-200">
            <p className="font-semibold">Switch on opens and clicks (once)</p>
            <ol className="mt-xs list-decimal space-y-0.5 pl-lg">
              <li>In Resend: <b>Domains</b> → capitalrooms.co.uk → turn on <b>Open tracking</b> and <b>Click tracking</b>.</li>
              <li>In Resend: <b>Webhooks</b> → Add endpoint → <code>https://capitalrooms.co.uk/api/webhooks/resend-events</code> → events <b>email.delivered, email.opened, email.clicked, email.bounced</b>.</li>
              <li>Copy its <b>signing secret</b> into Vercel as <code>RESEND_EVENTS_SECRET</code> (Settings → Environment Variables), then redeploy.</li>
            </ol>
          </div>
        )}
        <section className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
          {items && !items.length && <p className="p-lg text-sm text-neutral-600">Nothing yet — start one above.</p>}
          <ul className="divide-y divide-neutral-100">
            {(items ?? []).map(x => (
              <li key={x.id}>
                <Link href={`/admin/publish/${x.id}`} className="flex flex-wrap items-center gap-md px-md py-sm hover:bg-neutral-50">
                  <span className={`rounded-full px-sm py-0.5 text-xs font-semibold ${STATUS[x.status]?.[1] ?? ''}`}>{STATUS[x.status]?.[0] ?? x.status}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-neutral-900">{x.title}</span>
                    <span className="block text-xs text-neutral-500">{Object.entries(x.channels ?? {}).filter(([, v]) => v).map(([k]) => CH[k]).join(' · ') || 'No channels yet'}{x.created_by === 'CROS (monthly)' ? ' · drafted by CROS' : ''}</span>
                  </span>
                  <span className="text-right text-xs text-neutral-500">{x.status === 'sent' ? `Sent ${day(x.sent_at!)} · ${x.sent} delivered${x.failed ? `, ${x.failed} failed` : ''}` : x.status === 'scheduled' && x.scheduled_for ? `Goes ${new Date(x.scheduled_for).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : `Started ${day(x.created_at)}`}{x.website_published_at ? ' · on the website' : ''}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <p className="text-xs text-neutral-500">One-off market report for a single landlord? <Link href="/admin/market/report" className="font-semibold underline">Make a report</Link>.</p>
      </main>
    </div>
  )
}
