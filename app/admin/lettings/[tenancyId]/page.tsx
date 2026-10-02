'use client'

// The letting file — one page per tenancy, from let agreed to moved out (/admin/lettings/<tenancy>).
// Progress · Terms · Money · Documents · Letters & invoices · Notice & renewal · Activity.
// Every route that shows a tenancy opens this page; Back returns to where you came from (?from=).
// Data: /api/admin/lettings/[tenancyId] (lib/lettings/lettingFile). Nothing on this page sends anything by itself.

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import type { LettingFile, StepId } from '@/lib/lettings/lettingFile'
import { ProgressTab, TermsTab, MoneyTab, DocumentsTab, LettersTab, NoticeTab, ActivityTab, openPdf, gbp, day } from './parts'

const TABS = [
  ['progress', 'Progress'], ['terms', 'Terms'], ['money', 'Money'], ['documents', 'Documents'],
  ['letters', 'Letters & invoices'], ['notice', 'Notice & renewal'], ['activity', 'Activity'],
] as const
type Tab = typeof TABS[number][0]

const STAGE_LABEL: Record<string, string> = { let_agreed: 'Let agreed', live: 'Live', on_notice: 'On notice', ended: 'Ended', fell_through: 'Fell through' }


// Back goes where you came from — only to our own admin or lettings pages
const safeFrom = (v: string | undefined) => (v && /^\/(admin|lettings)(\/|$|\?)/.test(v) ? v : '/admin/tenancies')

export default function LettingFilePage({ params, searchParams }: { params: Promise<{ tenancyId: string }>; searchParams: PageSearchParams }) {
  const { tenancyId } = use(params)
  const sp = use(searchParams)
  const t = one(sp.tab)
  return <LettingFileScreen tenancyId={tenancyId} from={safeFrom(one(sp.from))} initialTab={TABS.some(x => x[0] === t) ? t as Tab : undefined} done={one(sp.done)} />
}

function LettingFileScreen({ tenancyId, from, initialTab, done }: { tenancyId: string; from: string; initialTab?: Tab; done?: string }) {
  const [file, setFile] = useState<LettingFile | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab | null>(initialTab ?? null)
  const [step, setStep] = useState<StepId | null>(null)
  const [banner, setBanner] = useState(done ?? '')

  const load = useCallback(async () => {
    const r = await adminFetch(`/api/admin/lettings/${tenancyId}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Could not open the letting file'); return }
    setFile(d.file); setError('')
  }, [tenancyId])
  useEffect(() => { load() }, [load])

  // a new let opens on its progress; a tenancy that started before the letting file opens on its terms
  const activeTab: Tab = tab ?? (file ? (file.stage === 'let_agreed' ? 'progress' : 'terms') : 'progress')

  async function patch(body: Record<string, unknown>) {
    const r = await adminFetch(`/api/admin/lettings/${tenancyId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error ?? 'Could not save that')
    await load()
  }

  if (error) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href={from} />} title="Letting file" />
      <div className="mx-auto max-w-6xl px-lg py-xl"><p className="rounded-xl border border-red-200 bg-red-50 px-lg py-md text-sm text-red-800">{error}</p></div>
    </div>
  )
  if (!file) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href={from} />} title="Letting file" />
      <div className="mx-auto max-w-6xl px-lg py-xl"><p className="text-sm text-neutral-500">Opening the letting file…</p></div>
    </div>
  )

  const tn = file.tenancy
  const where = [file.room.name, file.property.name].filter(Boolean).join(', ')
  const agreementLabel = tn.agreement_type === 'assured_periodic' ? 'assured periodic' : String(tn.agreement_type ?? '').replace(/_/g, ' ')
  const money = file.money
  const balanceDue = money && !tn.move_in_monies_received_at ? money.amountDue : null

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href={from} />} title="Letting file" />
      <PageHero
        eyebrow={<>Letting{file.room.unitCode ? ` · ${file.room.unitCode}` : ''} · {STAGE_LABEL[file.stage]} · {file.property.lettingType === 'let_only' ? 'Let only' : 'Fully managed'}</>}
        title={where}
        subtitle={<>{file.tenant.formalName || file.tenant.name} · {file.stage === 'let_agreed' ? 'from' : 'since'} {day(tn.start_date)} · {gbp(tn.rent_amount)} pcm{agreementLabel ? ` · ${agreementLabel}` : ''}{file.landlord ? ` · landlord ${file.landlord.name}` : ''}</>}
        stats={[
          ...(file.liveHold ? [{ label: `Holding deposit · ${file.liveHold.status === 'applied' ? 'applied' : 'received'} ${day(file.liveHold.received_on)}`, value: gbp(file.liveHold.amount) }] : []),
          ...(balanceDue != null && file.stage === 'let_agreed' ? [{ label: `Balance due by ${day(tn.start_date)}`, value: gbp(balanceDue), tone: 'warn' as const }] : []),
          ...(file.account && file.stage !== 'let_agreed' ? [{ label: 'Rent account', value: file.account.balance > 0.004 ? `${gbp(file.account.balance)} owed` : file.account.balance < -0.004 ? `${gbp(-file.account.balance)} credit` : 'Clear', tone: (file.account.balance > 0.004 ? 'bad' : 'good') as 'bad' | 'good' }] : []),
          { label: 'Deposit', value: gbp(tn.deposit_amount) },
        ]}
      />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        {file.stage === 'fell_through' && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-lg py-sm text-sm text-red-800">Fell through {day(tn.let_cancelled_at)}: {tn.let_cancelled_reason}</p>
        )}
        {banner && (
          <div className="flex items-start justify-between gap-md rounded-xl border border-green-200 bg-green-50 px-lg py-sm text-sm font-semibold text-green-800">
            <span>{banner}</span><button type="button" onClick={() => setBanner('')} className="text-green-700">×</button>
          </div>
        )}

        {/* ── Tabs ── */}
        <nav className="-mx-lg overflow-x-auto px-lg">
          <div className="inline-flex gap-xs rounded-xl bg-white p-[3px] ring-1 ring-neutral-200 whitespace-nowrap">
            {TABS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`rounded-lg px-md py-xs text-sm font-semibold ${activeTab === k ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:text-neutral-900'}`}>
                {label}{k === 'letters' && file.documents.length ? ` (${file.documents.length})` : ''}
              </button>
            ))}
          </div>
        </nav>

        <div className="grid grid-cols-1 gap-lg lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            {activeTab === 'progress' && <ProgressTab file={file} step={step ?? file.currentStep} setStep={setStep} patch={patch} reload={load} />}
            {activeTab === 'terms' && <TermsTab file={file} patch={patch} />}
            {activeTab === 'money' && <MoneyTab file={file} />}
            {activeTab === 'documents' && <DocumentsTab file={file} />}
            {activeTab === 'letters' && <LettersTab file={file} />}
            {activeTab === 'notice' && <NoticeTab file={file} patch={patch} />}
            {activeTab === 'activity' && <ActivityTab file={file} />}
          </div>

          {/* ── People & shortcuts ── */}
          <aside className="space-y-md">
            <section className="rounded-2xl border border-neutral-200 bg-white p-md">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-sm">People</h2>
              <ul className="space-y-sm text-sm">
                <li className="flex items-baseline justify-between gap-sm">
                  <span className="min-w-0"><span className="font-semibold text-neutral-900">{file.tenant.name}</span><span className="block text-xs text-neutral-500">{file.stage === 'let_agreed' ? 'Incoming' : file.stage === 'on_notice' ? 'Tenant · on notice' : 'Tenant'}{file.tenant.occupation ? ` · ${file.tenant.occupation}` : ''}</span></span>
                  <Link href={`/admin/tenant/${file.tenant.id}`} className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">Profile</Link>
                </li>
                {file.landlord && (
                  <li className="flex items-baseline justify-between gap-sm">
                    <span className="min-w-0"><span className="font-semibold text-neutral-900">{file.landlord.name}</span><span className="block text-xs text-neutral-500">Landlord</span></span>
                    <Link href={`/admin/landlord/${file.landlord.id}`} className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">Profile</Link>
                  </li>
                )}
                {file.outgoing && (
                  <li className="flex items-baseline justify-between gap-sm">
                    <span className="min-w-0"><span className="font-semibold text-neutral-900">{file.outgoing.name}</span><span className="block text-xs text-neutral-500">Outgoing · moves out {day(file.outgoing.endDate)}</span></span>
                    <Link href={`/admin/lettings/${file.outgoing.id}?from=${encodeURIComponent(`/admin/lettings/${tenancyId}`)}`} className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">File</Link>
                  </li>
                )}
                {file.incoming && (
                  <li className="flex items-baseline justify-between gap-sm">
                    <span className="min-w-0"><span className="font-semibold text-neutral-900">{file.incoming.name}</span><span className="block text-xs text-neutral-500">Incoming · from {day(file.incoming.startDate)}</span></span>
                    <Link href={`/admin/lettings/${file.incoming.id}?from=${encodeURIComponent(`/admin/lettings/${tenancyId}`)}`} className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">File</Link>
                  </li>
                )}
              </ul>
            </section>
            <section className="rounded-2xl border border-neutral-200 bg-white p-md">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-sm">Go to</h2>
              <div className="flex flex-col gap-xs text-sm">
                <Link href={`/admin/properties/${file.property.id}?tab=units&room=${file.room.id}`} className="font-semibold text-blue-700 hover:underline">The room on its property</Link>
                <Link href={`/admin/move-in/${tenancyId}`} className="font-semibold text-blue-700 hover:underline">Move-in pack</Link>
                <button type="button" onClick={() => openPdf(`/api/admin/tenancies/${tenancyId}/statement-of-account`)} className="text-left font-semibold text-blue-700 hover:underline">Statement of account (PDF)</button>
                {file.stage !== 'let_agreed' && file.stage !== 'fell_through' && <Link href={`/admin/rent-increase/${tenancyId}`} className="font-semibold text-blue-700 hover:underline">Rent review</Link>}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
