'use client'

// Letters & Invoices: write what you want in your own words and the assistant turns it into a formal letter
// on the Capital Rooms letterhead signed by you, or an invoice in the standard layout; check, download or email it.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { dearFromText, formalName, landlordFormalNames } from '@/lib/people'
import type { FormalLetter } from '@/lib/letters/formalLetter'
import { invoiceNumberFor, type DocInvoice } from '@/lib/invoices/fromDocumentGenerator'
import SavedDocuments from './SavedDocuments'
import AddressField from '@/app/components/AddressField'
import { READY_LETTERS, fillLetter, type LetterFacts } from '@/lib/letters/readyLetters'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Person {
  id: string
  role: string | null
  salutation: string | null
  first_name: string | null
  last_name: string | null
  full_name: string | null
  company?: string | null
  email: string | null
  joint_email?: string | null
  joint_first_name?: string | null
  home_address: string | null
}

interface PropertyOption { id: string; name: string; address: string | null; property_code: string | null }

interface Recipient { personId: string | null; name: string; address: string; email: string; role: string }
interface Signer { name: string; jobTitle: string; directPhone: string; includeSignature: boolean }
type Kind = 'letter' | 'notice' | 'fees' | 'other'
type DocType = 'letter' | 'invoice'
const money = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const KINDS: [Kind, string][] = [['letter', 'Letter'], ['notice', 'Formal notice'], ['fees', 'Fees or charges'], ['other', 'Other']]
const CLOSINGS = ['Yours sincerely', 'Yours faithfully', 'Kind regards', 'With best wishes']
const ROLE_LABEL: Record<string, string> = { landlord: 'Landlord', tenant: 'Tenant', contractor: 'Contractor', cleaner: 'Cleaner', applicant: 'Applicant' }
const EMPTY_RECIPIENT: Recipient = { personId: null, name: '', address: '', email: '', role: '' }

const placeholders = (l: FormalLetter | null) =>
  l ? Array.from(new Set(`${l.recipientName}\n${l.recipientAddress}\n${l.subject}\n${l.salutation}\n${l.body}`.match(/\[[^\]\n]{2,60}\]/g) ?? [])) : []

const input = 'w-full rounded-lg border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-400'
const narrow = 'rounded-lg border border-neutral-200 bg-white px-sm py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-400'
const label = 'block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs'

// ─── Recipient picker ─────────────────────────────────────────────────────────

function PersonPicker({ people, onPick }: { people: Person[]; onPick: (p: Person) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const q = query.trim().toLowerCase()
  const matches = (q
    ? people.filter(p => [formalName(p as any), p.full_name, p.company, p.email].some(v => (v || '').toLowerCase().includes(q)))
    : people
  ).slice(0, 40)

  return (
    <div ref={ref} className="relative">
      <input className={input} placeholder="Search landlords, tenants, contractors…" value={query}
        onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true) }} />
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {matches.length === 0 ? (
            <div className="px-md py-sm text-sm text-neutral-400">No one found — type their details below instead</div>
          ) : matches.map(p => (
            <button key={p.id} type="button" className="w-full text-left px-md py-sm hover:bg-neutral-50 text-sm"
              onMouseDown={e => { e.preventDefault(); onPick(p); setQuery(''); setOpen(false) }}>
              <span className="font-medium text-neutral-900">{p.role === 'landlord' ? landlordFormalNames(p as any) : formalName(p as any)}</span>
              <span className="text-neutral-400 ml-2">{ROLE_LABEL[p.role ?? ''] ?? p.role}{p.email ? ` · ${p.email}` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function GapFill({ gap, onFill }: { gap: string; onFill: (v: string) => void }) {
  const [v, setV] = useState('')
  return (
    <form className="flex flex-wrap items-center gap-sm" onSubmit={e => { e.preventDefault(); onFill(v) }}>
      <span className="w-48 shrink-0 font-mono text-xs text-amber-900">{gap}</span>
      <input className={`${narrow} min-w-0 flex-1`} value={v} onChange={e => setV(e.target.value)} placeholder={gap.slice(1, -1)} />
      <button type="submit" disabled={!v.trim()} className="rounded-lg bg-neutral-900 px-md py-sm text-xs font-bold text-white disabled:opacity-40">Fill in</button>
    </form>
  )
}

// ─── Ready-made letters ───────────────────────────────────────────────────────

function ReadyLetterPicker({ query, setQuery, saved, setupNeeded, forTenancy, onUse, onRemove }: {
  query: string; setQuery: (v: string) => void
  saved: { id: string; name: string; audience: string; subject: string; body: string; closing: string }[]; setupNeeded: boolean; forTenancy: boolean
  onUse: (t: { subject: string; body: string; closing: string }) => void; onRemove: (id: string, name: string) => void
}) {
  const [open, setOpen] = useState(forTenancy)
  const q = query.trim().toLowerCase()
  const hit = (name: string, subject: string) => !q || name.toLowerCase().includes(q) || subject.toLowerCase().includes(q)
  const groups = [...new Set(READY_LETTERS.map(l => l.group))]
  const mine = saved.filter(t => hit(t.name, t.subject)).sort((a, b) => a.name.localeCompare(b.name))
  const AUD: Record<string, string> = { tenant: 'Tenant', landlord: 'Landlord', contractor: 'Contractor', anyone: 'Anyone' }
  return (
    <div className="mb-lg rounded-xl border border-neutral-200 bg-neutral-50 p-md">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between text-left">
        <span><span className="font-semibold text-neutral-900">Start from a ready letter</span> <span className="text-xs text-neutral-500">— {READY_LETTERS.length} common letters{saved.length ? ` and ${saved.length} of yours` : ''}{forTenancy ? ', filled in from this tenancy' : ''}</span></span>
        <span className="text-sm text-neutral-500">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-md space-y-md">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search letters…" className={input} />
          {(mine.length > 0 || setupNeeded) && (
            <div>
              <p className={label}>Your templates</p>
              {setupNeeded ? <p className="text-xs text-amber-800">Saving your own templates needs migration 238 running in Supabase.</p> : (
                <div className="grid gap-xs sm:grid-cols-2">
                  {mine.map(t => (
                    <div key={t.id} className="flex items-center gap-xs rounded-lg border border-neutral-200 bg-white px-sm py-xs">
                      <button type="button" onClick={() => onUse(t)} className="min-w-0 flex-1 text-left text-sm"><span className="font-semibold text-neutral-900">{t.name}</span> <span className="text-xs text-neutral-400">{AUD[t.audience] ?? t.audience}</span></button>
                      <button type="button" onClick={() => onRemove(t.id, t.name)} aria-label={`Remove ${t.name}`} className="px-xs text-neutral-400 hover:text-red-700">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {groups.map(g => {
            const items = READY_LETTERS.filter(l => l.group === g && hit(l.name, l.subject))
            return items.length ? (
              <div key={g}>
                <p className={label}>{g}</p>
                <div className="grid gap-xs sm:grid-cols-2">
                  {items.map(l => (
                    <button key={l.id} type="button" onClick={() => onUse(l)} className="rounded-lg border border-neutral-200 bg-white px-sm py-xs text-left text-sm font-semibold text-neutral-900 hover:border-neutral-400">{l.name}</button>
                  ))}
                </div>
              </div>
            ) : null
          })}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentGenerator() {
  const supabase = createClient()
  const [step, setStep] = useState<'write' | 'check'>('write')
  const [docType, setDocType] = useState<DocType>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'invoice' ? 'invoice' : 'letter')
  const [invoice, setInvoice] = useState<DocInvoice | null>(null)
  const [properties, setProperties] = useState<PropertyOption[]>([])
  const [numberAuto, setNumberAuto] = useState(true)      // number follows date + property until edited by hand
  const [savedId, setSavedId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [saveNote, setSaveNote] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  // opened from a letting file (?tenancy=…): the tenant is filled in and what's made is filed with that tenancy
  const [tenancyId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const v = new URLSearchParams(window.location.search).get('tenancy')
    return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null
  })
  const [forTenancy, setForTenancy] = useState('')
  const [facts, setFacts] = useState<LetterFacts>({})
  // ready-made letters and the ones you've saved as templates (migration 238)
  const [saved, setSaved] = useState<{ id: string; name: string; audience: string; subject: string; body: string; closing: string }[]>([])
  const [templatesSetup, setTemplatesSetup] = useState(false)
  const [templateQuery, setTemplateQuery] = useState('')
  const [templating, setTemplating] = useState(false)

  // Step 1
  const [recipient, setRecipient] = useState<Recipient>(EMPTY_RECIPIENT)
  const [kind, setKind] = useState<Kind>('letter')
  const [instructions, setInstructions] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 2
  const [letter, setLetter] = useState<FormalLetter | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [changes, setChanges] = useState('')
  const [signer, setSigner] = useState<Signer>({ name: '', jobTitle: '', directPhone: '', includeSignature: true })
  const [hasSignature, setHasSignature] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [previewErr, setPreviewErr] = useState('')
  const [downloading, setDownloading] = useState(false)

  // Email
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [emailHtml, setEmailHtml] = useState('')
  const [fromLine, setFromLine] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    supabase.from('people').select('*').neq('role', 'inactive').order('last_name', { ascending: true })
      .then(({ data }) => {
        setPeople((data as Person[]) || [])
        if (!tenancyId) return
        supabase.from('tenancies').select('person_id, start_date, end_date, rent_amount, rent_due_day, payment_reference, rooms(name), properties(name, address, postcode)').eq('id', tenancyId).maybeSingle().then(({ data: t }) => {
          const tt = t as any
          const p = ((data as Person[]) || []).find(x => x.id === tt?.person_id)
          if (p) pickPerson(p)
          setForTenancy([tt?.rooms?.name, tt?.properties?.name].filter(Boolean).join(', '))
          const day = (iso?: string | null) => iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : undefined
          const n = Number(tt?.rent_due_day) || 1
          setFacts({
            tenant: p ? formalName(p as any) : undefined, room: tt?.rooms?.name || undefined,
            house: String(tt?.properties?.name ?? '').split('\n')[0] || undefined,
            address: [String(tt?.properties?.name ?? '').split('\n')[0], tt?.properties?.address, tt?.properties?.postcode].filter(Boolean).join(', ').replace(/\n/g, ', ') || undefined,
            rent: tt?.rent_amount ? money(Number(tt.rent_amount)) : undefined, payment_ref: tt?.payment_reference || undefined,
            start_date: day(tt?.start_date), end_date: day(tt?.end_date),
            due_day: `${n}${[11, 12, 13].includes(n) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`,
          })
        })
      })
    loadTemplates()
    supabase.from('properties').select('id, name, address, property_code').order('name')
      .then(({ data }) => setProperties((data as PropertyOption[]) || []))
    supabase.auth.getSession().then(({ data: { session } }) => {
      const e = session?.user?.email ?? ''
      setCc(c => c || e)
    })
  }, [])

  async function pickPerson(p: Person) {
    const name = p.role === 'landlord' ? landlordFormalNames(p as any) : formalName(p as any)
    let address = p.home_address ?? ''
    // Tenants rarely have a correspondence address on file — use the room they rent
    if (!address && p.role === 'tenant') {
      const { data } = await supabase.from('tenancies')
        .select('room:rooms(name, properties(name, address))')
        .eq('person_id', p.id).order('start_date', { ascending: false }).limit(1)
      const room = (data?.[0] as any)?.room
      const prop = room?.properties
      // the property's name holds the street ("12 Saltwell Street"); its address field is often just town and postcode
      const street = String(prop?.name ?? '').split('\n')[0].trim()
      const rest = String(prop?.address ?? '').trim()
      address = [room?.name, street && !rest.toLowerCase().includes(street.toLowerCase()) ? street : '', rest].filter(Boolean).join('\n')
    }
    setRecipient({
      personId: p.id, name, role: p.role ?? '',
      address: address.split(/\n|,\s*/).map(s => s.trim()).filter(Boolean).join('\n'),
      email: [p.email, p.joint_email].filter(Boolean).join(', '),
    })
  }

  // ── Ready-made letters and saved templates ───────────────────────────────

  async function loadTemplates() {
    const r = await adminFetch('/api/admin/letter-templates').catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setSaved(d.templates ?? []); setTemplatesSetup(!!d.setupNeeded)
  }
  // a ready letter goes straight to the check screen: the tenancy's facts filled in, anything else left in [brackets]
  function useTemplate(t: { subject: string; body: string; closing: string }) {
    if ((letter || invoice) && !window.confirm('Start from this letter? The draft you have open now will be replaced.')) return
    const f: LetterFacts = { ...facts, tenant: facts.tenant || recipient.name || undefined }
    const l: FormalLetter = {
      recipientName: recipient.name, recipientAddress: recipient.address, date: new Date().toISOString().slice(0, 10),
      subject: fillLetter(t.subject, f), salutation: recipient.name ? `Dear ${dearFromText(recipient.name)}` : 'Dear [name]',
      body: fillLetter(t.body, f), closing: t.closing,
    }
    setDocType('letter'); setInvoice(null); setLetter(l); setSavedId(null); setSaveNote(''); setMissing([]); setChanges(''); setSendResult(null)
    setTo(recipient.email); setEmailSubject(l.subject)
    setEmailMessage(`${l.salutation},\n\nPlease find attached our letter, “${l.subject}”.\n\nKind regards,`)
    setStep('check')
    for (const el of [document.querySelector('main'), window] as const) el?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function saveAsTemplate() {
    if (!letter) return
    setTemplating(true)
    try {
      const r = await adminFetch('/api/admin/letter-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ letter, documentId: savedId }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { alert(d.error ?? 'Could not save it as a template'); return }
      setSaveNote(`Saved as a template: “${d.template.name}”. It’s under Start from a ready letter.`); loadTemplates()
    } finally { setTemplating(false) }
  }
  async function removeTemplate(id: string, name: string) {
    if (!window.confirm(`Remove the template “${name}”?`)) return
    await adminFetch(`/api/admin/letter-templates?id=${id}`, { method: 'DELETE' })
    loadTemplates()
  }
  async function saveDraft() {
    const r = await saveDoc('json')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { alert(d.error ?? 'Could not save the draft'); return }
    if (d.doc?.id) setSavedId(d.doc.id)
    setSaveNote('Draft saved — it’s in Your letters & invoices below (Not emailed). Press Edit there to carry on.'); setRefreshKey(k => k + 1)
  }

  // ── Drafting ──────────────────────────────────────────────────────────────

  async function draft(redraft: boolean) {
    if (!instructions.trim()) return
    setDrafting(true); setError(null)
    try {
      const res = await adminFetch('/api/admin/document-generator/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructions, kind,
          recipient: { name: recipient.name, address: recipient.address, role: ROLE_LABEL[recipient.role]?.toLowerCase() ?? '' },
          ...(redraft && letter ? { current: letter, changes } : {}),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Could not draft the letter'); return }
      setLetter(d.letter)
      if (!redraft) { setSavedId(null); setSaveNote('') }
      setMissing(d.missing ?? [])
      setHasSignature(!!d.signer?.hasSignature)
      if (!redraft) {
        setSigner({ name: d.signer?.name ?? '', jobTitle: d.signer?.jobTitle ?? '', directPhone: d.signer?.directPhone ?? '', includeSignature: true })
        setTo(recipient.email)
      }
      setEmailSubject(d.letter.subject)
      setEmailMessage(d.coverEmail ?? '')
      setChanges(''); setSendResult(null)
      setStep('check')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not draft the letter')
    } finally {
      setDrafting(false)
    }
  }

  // First free number for that day and property: 20261002013REC, then 20261002013REC01…
  async function freeNumber(propertyId: string | null | undefined, date: string, name: string) {
    const code = properties.find(p => p.id === propertyId)?.property_code
    const base = invoiceNumberFor(code, name || 'Invoice', new Date(`${date}T12:00:00`))
    const r = await adminFetch(`/api/admin/documents/generated?next=${encodeURIComponent(base)}`).catch(() => null)
    const d = r && r.ok ? await r.json().catch(() => ({})) : {}
    return (d.number as string) || base
  }
  const matchProperty = (text: string) => {
    const t = text.toLowerCase()
    return t ? properties.find(p => {
      const street = p.name.split(/[,\n]/)[0].trim().toLowerCase()
      return street.length > 4 && t.includes(street)
    }) : undefined
  }
  async function renumber(next: Partial<DocInvoice>) {
    if (!invoice) return
    const merged = { ...invoice, ...next }
    updateInvoice(next)
    if (numberAuto) {
      const n = await freeNumber(merged.propertyId, merged.invoiceDate, merged.recipientName)
      setInvoice(v => (v ? { ...v, invoiceNumber: n } : v))
    }
  }

  async function draftInv(redraft: boolean) {
    if (!instructions.trim()) return
    setDrafting(true); setError(null)
    try {
      const res = await adminFetch('/api/admin/document-generator/invoice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'draft', instructions,
          recipient: { name: recipient.name, role: ROLE_LABEL[recipient.role]?.toLowerCase() ?? '' },
          ...(redraft && invoice ? { current: { title: invoice.title, items: invoice.items }, changes } : {}),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Could not prepare the invoice'); return }
      const today = new Date().toISOString().slice(0, 10)
      const matched = redraft ? undefined : matchProperty(`${d.invoice.propertyAddress} ${instructions}`)
      const propertyId = redraft ? invoice?.propertyId ?? null : matched?.id ?? null
      const number = redraft && invoice ? invoice.invoiceNumber : await freeNumber(propertyId, today, recipient.name)
      if (!redraft) { setSavedId(null); setNumberAuto(true); setSaveNote('') }
      setInvoice(prev => ({
        recipientName: prev && redraft ? prev.recipientName : recipient.name,
        recipientAddress: prev && redraft ? prev.recipientAddress : recipient.address,
        propertyAddress: matched ? (matched.address || matched.name).replace(/\n/g, ', ') : d.invoice.propertyAddress || (redraft ? prev?.propertyAddress : '') || '',
        propertyId,
        invoiceNumber: number,
        invoiceDate: prev && redraft ? prev.invoiceDate : today,
        title: d.invoice.title,
        items: d.invoice.items,
      }))
      setMissing(d.missing ?? [])
      if (!redraft) { setTo(recipient.email); setEmailSubject(`Invoice ${number} from Capital Rooms`) }
      setEmailMessage(d.coverEmail ?? '')
      setChanges(''); setSendResult(null)
      setStep('check')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare the invoice')
    } finally {
      setDrafting(false)
    }
  }

  const updateInvoice = (u: Partial<DocInvoice>) => setInvoice(v => (v ? { ...v, ...u } : v))
  const updateItem = (i: number, u: Partial<DocInvoice['items'][number]>) =>
    setInvoice(v => (v ? { ...v, items: v.items.map((it, j) => (j === i ? { ...it, ...u } : it)) } : v))
  const invoiceTotal = (invoice?.items ?? []).reduce((t, it) => t + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0)
  const unpriced = (invoice?.items ?? []).filter(it => it.unitPrice == null || Number.isNaN(Number(it.unitPrice))).map(it => `Price for “${it.description || 'a line'}”`)

  const updateLetter = (u: Partial<FormalLetter>) => setLetter(l => (l ? { ...l, ...u } : l))
  const signerBody = () => ({ name: signer.name, jobTitle: signer.jobTitle, directPhone: signer.directPhone, includeSignature: signer.includeSignature })

  // ── PDF preview (re-rendered shortly after each edit) ─────────────────────

  const previewKey = useMemo(() => JSON.stringify({ docType, letter, invoice, signer }), [docType, letter, invoice, signer])
  const urlRef = useRef('')
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])
  useEffect(() => {
    if (step !== 'check' || (docType === 'letter' ? !letter : !invoice)) return
    if (docType === 'invoice' && invoice && invoice.items.some(it => it.unitPrice == null)) { setPreviewErr('Add a price to every line to see the invoice'); return }
    const t = setTimeout(async () => {
      setPreviewing(true)
      try {
        const res = docType === 'invoice'
          ? await adminFetch('/api/admin/document-generator/invoice', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'pdf', invoice, inline: true }),
          })
          : await adminFetch('/api/admin/document-generator/pdf', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ letter, signer: signerBody(), inline: true }),
          })
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Could not show the preview') }
        const url = URL.createObjectURL(await res.blob())
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = url
        setPreviewUrl(url); setPreviewErr('')
      } catch (e) {
        setPreviewErr(e instanceof Error ? e.message : 'Could not show the preview')
      } finally { setPreviewing(false) }
    }, 800)
    return () => clearTimeout(t)
  }, [previewKey, step])

  // Saves the document to the list (or updates the saved copy) and returns its id.
  async function saveDoc(respond: 'json' | 'pdf') {
    return adminFetch('/api/admin/documents/generated', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: docType, id: savedId, recipientEmail: to || recipient.email, respond, tenancyId,
        ...(docType === 'invoice' ? { invoice } : { letter, signer: signerBody() }) }),
    })
  }

  async function downloadPdf() {
    if (docType === 'letter' ? !letter : !invoice) return
    setDownloading(true)
    try {
      const saved = await saveDoc('pdf')
      if (saved.ok) {
        const id = saved.headers.get('X-Document-Id')
        if (id) setSavedId(id)
        const name = decodeURIComponent(saved.headers.get('content-disposition')?.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? 'Document.pdf')
        const url = URL.createObjectURL(await saved.blob())
        const a = document.createElement('a'); a.href = url; a.download = name; a.click()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
        setSaveNote('Saved to your letters & invoices below.'); setRefreshKey(k => k + 1)
        return
      }
      const err = await saved.json().catch(() => ({}))
      if (saved.status !== 503) { alert(err.error ?? 'Could not save the document'); return }
      setSaveNote(`${err.error ?? 'Not saved'} — downloaded without saving.`)
      const res = docType === 'invoice'
        ? await adminFetch('/api/admin/document-generator/invoice', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'pdf', invoice }),
        })
        : await adminFetch('/api/admin/document-generator/pdf', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ letter, signer: signerBody() }),
        })
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Could not create the PDF'); return }
      const name = decodeURIComponent(res.headers.get('content-disposition')?.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? 'Letter.pdf')
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a'); a.href = url; a.download = name; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } finally { setDownloading(false) }
  }

  // ── Email ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (step !== 'check' || !emailMessage.trim()) { setEmailHtml(''); return }
    const t = setTimeout(async () => {
      const res = await adminFetch('/api/admin/document-generator/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview: true, message: emailMessage }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { setEmailHtml(d.html); setFromLine(d.from ?? '') }
    }, 600)
    return () => clearTimeout(t)
  }, [emailMessage, step])

  const split = (s: string) => s.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean)
  const gaps = docType === 'invoice' ? unpriced : placeholders(letter)
  // a [placeholder] filled in from the box above the letter: replaced wherever it appears
  function fillGap(gap: string, value: string) {
    if (!letter || !value.trim()) return
    const put = (t: string) => t.split(gap).join(value.trim())
    updateLetter({ recipientName: put(letter.recipientName), recipientAddress: put(letter.recipientAddress), subject: put(letter.subject), salutation: put(letter.salutation), body: put(letter.body) })
    if (emailSubject.includes(gap)) setEmailSubject(put(emailSubject))
    if (emailMessage.includes(gap)) setEmailMessage(put(emailMessage))
  }
  const worthChecking = docType === 'invoice' ? missing.filter(m => !/\bprice\b/i.test(m)) : missing

  async function send() {
    if (docType === 'letter' ? !letter : !invoice) return
    const recipients = split(to)
    if (!window.confirm(`Email this ${docType === 'invoice' ? `invoice (${money(invoiceTotal)})` : 'letter'} to ${recipients.join(', ')}${split(cc).length ? ` (cc ${split(cc).join(', ')})` : ''}?`)) return
    setSending(true); setSendResult(null)
    try {
      let documentId = savedId
      const saved = await saveDoc('json')
      const sd = await saved.json().catch(() => ({}))
      if (saved.ok && sd.doc?.id) { documentId = sd.doc.id; setSavedId(sd.doc.id) }
      else if (saved.status !== 503) { setSendResult({ ok: false, text: `${sd.error ?? 'Could not save the document'}. Nothing was sent.` }); return }
      const res = await adminFetch('/api/admin/document-generator/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: recipients, cc: split(cc), subject: emailSubject, message: emailMessage, documentId, ...(docType === 'invoice' ? { invoice } : { letter, signer: signerBody() }) }),
      })
      const d = await res.json().catch(() => ({}))
      setSendResult(res.ok
        ? { ok: true, text: `Sent to ${d.to.join(', ')}${d.cc?.length ? `, cc ${d.cc.join(', ')}` : ''} with ${d.attachment} attached` }
        : { ok: false, text: d.error ?? 'The email was not sent' })
      setRefreshKey(k => k + 1)
    } finally { setSending(false) }
  }

  // Reopen a saved letter / invoice to change it (16 Oct 2026). A letter opens as a new copy, so the list keeps a
  // record of exactly what was sent before; an invoice keeps its number and is updated in place.
  async function editSaved(d: { id: string; kind: string; number: string | null; recipient_email?: string | null; emailed_to?: string[] | null }) {
    if ((letter || invoice) && !window.confirm('Open this saved document? The draft you have open now will be replaced.')) return
    setError(null)
    const r = await adminFetch(`/api/admin/documents/generated?id=${d.id}&content=1`)
    const j = await r.json().catch(() => ({}))
    const c = j.content
    if (!r.ok || !c) { setError(j.error ?? 'That document could not be reopened'); return }
    const email = d.emailed_to?.join(', ') || d.recipient_email || ''
    if (d.kind === 'invoice') {
      setDocType('invoice' as DocType); setInvoice(c as DocInvoice); setLetter(null); setSavedId(d.id); setNumberAuto(false)
      setEmailSubject(`Invoice ${(c as DocInvoice).invoiceNumber ?? d.number} from Capital Rooms`)
    } else {
      if (!c.letter) { setError('That letter could not be reopened'); return }
      setDocType('letter' as DocType); setLetter(c.letter as FormalLetter); setInvoice(null); setSavedId(null)
      if (c.signer) setSigner(sg => ({ ...sg, ...c.signer }))
      setEmailSubject(c.letter.subject ?? '')
    }
    setTo(email); setCc(''); setMissing([]); setChanges(''); setSendResult(null); setSaveNote('')
    setEmailMessage(`Dear ${dearFromText(d.kind === 'invoice' ? (c as DocInvoice).recipientName : c.letter?.recipientName)},\n\nPlease find attached ${d.kind === 'invoice' ? `invoice ${(c as DocInvoice).invoiceNumber ?? d.number}` : 'our letter'}.\n\nKind regards,`)
    setStep('check')
    // the admin page scrolls inside <main>, not the window
    for (const el of [document.querySelector('main'), window] as const) el?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startAgain() {
    if (!window.confirm('Start a new document? The current draft will be cleared.')) return
    setStep('write'); setLetter(null); setInvoice(null); setSavedId(null); setNumberAuto(true); setSaveNote(''); setInstructions(''); setRecipient(EMPTY_RECIPIENT); setMissing([])
    setChanges(''); setError(null); setSendResult(null); setEmailMessage(''); setTo('')
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href={tenancyId ? `/admin/lettings/${tenancyId}?tab=letters` : '/admin/communications'} />} title="Letters & Invoices" />
      <PageHero title="Letters & Invoices" subtitle="Write a letter or an invoice in plain words — it comes out on the letterhead, ready to check, download or email" />
      <div className="mx-auto max-w-6xl px-lg py-xl">

        {tenancyId && (
          <p className="mb-lg rounded-xl border border-blue-200 bg-blue-50 px-lg py-sm text-sm text-blue-900">
            For the letting file{forTenancy ? ` — ${forTenancy}` : ''}. What you make here is filed there too.{' '}
            <a href={`/admin/lettings/${tenancyId}?tab=letters`} className="font-semibold underline">Back to the letting file</a>
          </p>
        )}

        {/* Step indicator */}
        <div className="flex flex-wrap items-center gap-3 mb-xl">
          {['Write', 'Check and send'].map((l, i) => {
            const n = i + 1
            const current = step === 'write' ? 1 : 2
            const go = n === 1 ? () => setStep('write') : (docType === 'invoice' ? invoice : letter) ? () => setStep('check') : null
            return (
              <div key={l} className={`flex items-center gap-2 ${go && n !== current ? 'cursor-pointer hover:opacity-80' : ''}`}
                onClick={go && n !== current ? go : undefined} role={go && n !== current ? 'button' : undefined}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${
                  n < current ? 'bg-green-600 text-white' : n === current ? 'bg-neutral-900 text-white' : 'bg-neutral-300 text-neutral-600'}`}>
                  {n < current ? '✓' : n}
                </div>
                <span className={`text-sm ${n === current ? 'font-semibold text-neutral-900' : 'text-neutral-500'}`}>{l}</span>
                {i < 1 && <div className="w-10 h-px bg-neutral-300" />}
              </div>
            )
          })}
          {(letter || invoice || instructions) && (
            <button type="button" onClick={startAgain} className="ml-auto text-sm font-semibold text-neutral-600 hover:text-neutral-900">
              Start a new document
            </button>
          )}
        </div>

        {error && <div className="mb-lg p-md bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

        {/* ═══ STEP 1: WRITE ═══ */}
        {step === 'write' && (
          <div className="space-y-lg">
            <div className="bg-white rounded-xl border border-neutral-200 p-lg space-y-md">
              <h2 className="font-semibold text-neutral-900">Who is it to?</h2>
              <PersonPicker people={people} onPick={pickPerson} />
              <div className="grid gap-md md:grid-cols-2">
                <div>
                  <label className={label}>Name</label>
                  <input className={input} value={recipient.name} placeholder="e.g. Mr Nigel Smith"
                    onChange={e => setRecipient(r => ({ ...r, name: e.target.value }))} />
                  <label className={`${label} mt-md`}>Email</label>
                  <input className={input} value={recipient.email} placeholder="For emailing the letter (optional)"
                    onChange={e => setRecipient(r => ({ ...r, email: e.target.value }))} />
                </div>
                <div>
                  <label className={label}>Address</label>
                  <AddressField multiline rows={4} className={input} value={recipient.address}
                    onChange={v => setRecipient(r => ({ ...r, address: v }))} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 p-lg">
              <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 mb-md bg-neutral-50">
                {([['letter', '✉️ Letter'], ['invoice', '🧾 Invoice']] as [DocType, string][]).map(([val, lbl]) => (
                  <button key={val} type="button" onClick={() => { setDocType(val); setStep('write') }}
                    className={`rounded-md px-md py-xs text-sm font-semibold ${docType === val ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:text-neutral-900'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
              {docType === 'invoice' ? (
                <>
                  <h2 className="font-semibold text-neutral-900 mb-sm">What is the invoice for?</h2>
                  <p className="text-sm text-neutral-500 mb-md">
                    Say what to charge in your own words — the items, amounts and quantities, and the property if it relates to one.
                    The assistant sets it out as an invoice in our standard layout with our bank details, numbered and dated.
                    It won’t make up prices: anything you didn’t give is flagged for you to fill in.
                  </p>
                  <textarea
                    className="w-full h-44 rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm text-sm text-neutral-900 resize-y focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    placeholder={'e.g. Rent collection for October at 4 Willis Road, 12 St David\'s and 34 Bow Road — £450 for all three.\nPlus an extra property visit on 12 October, £50.'}
                    value={instructions} onChange={e => setInstructions(e.target.value)} />
                  <div className="flex items-center justify-between mt-md gap-md">
                    <p className="text-xs text-neutral-400">{recipient.name ? `To ${recipient.name}` : 'Choose who it is to above (you can also add them later).'}</p>
                    <button onClick={() => draftInv(false)} disabled={drafting || !instructions.trim()}
                      className="px-lg py-sm rounded-lg bg-neutral-900 text-white text-sm font-semibold disabled:opacity-40">
                      {drafting ? 'Preparing…' : 'Prepare invoice →'}
                    </button>
                  </div>
                </>
              ) : (<>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-xs mb-md max-w-2xl">
                {KINDS.map(([val, lbl]) => (
                  <button key={val} type="button" onClick={() => setKind(val)}
                    className={`rounded-lg border px-sm py-xs text-sm font-medium ${kind === val ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
              <ReadyLetterPicker query={templateQuery} setQuery={setTemplateQuery} saved={saved} setupNeeded={templatesSetup}
                forTenancy={!!tenancyId} onUse={useTemplate} onRemove={removeTemplate} />
              <h2 className="font-semibold text-neutral-900 mb-sm">Or say what you want in your own words</h2>
              <p className="text-sm text-neutral-500 mb-md">
                Write it in your own words — notes, bullet points or a pasted email are fine. Include the facts that matter
                (amounts, dates, what you need from them). The assistant writes it up as a formal letter on our letterhead, signed by you.
                It won’t make up figures or dates: anything missing is left in [square brackets] for you to fill in.
              </p>
              <textarea
                className="w-full h-56 rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm text-sm text-neutral-900 resize-y focus:outline-none focus:ring-2 focus:ring-neutral-400"
                placeholder={'e.g. Let Nigel know our fees for let-only from 1 Jan 2027:\n- tenant find £750 + VAT per room\n- referencing £75 per tenant\n- guarantor added to agreement £25\nInvoiced when the tenant moves in, payable within 14 days. Thank him for his continued business.'}
                value={instructions} onChange={e => setInstructions(e.target.value)} />
              <div className="flex items-center justify-between mt-md gap-md">
                <p className="text-xs text-neutral-400">{recipient.name ? `To ${recipient.name}` : 'No recipient chosen — you can add one later.'}</p>
                <button onClick={() => draft(false)} disabled={drafting || !instructions.trim()}
                  className="px-lg py-sm rounded-lg bg-neutral-900 text-white text-sm font-semibold disabled:opacity-40">
                  {drafting ? 'Writing… (up to a minute)' : 'Draft document →'}
                </button>
              </div>
              </>)}
            </div>
          </div>
        )}

        {/* ═══ STEP 2: CHECK AND SEND ═══ */}
        {step === 'check' && (docType === 'invoice' ? invoice : letter) && (
          <div className="space-y-lg">
            {docType === 'letter' && gaps.length > 0 ? (
              <div className="p-md bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
                <p className="font-semibold">Fill in before sending</p>
                <p className="text-xs text-amber-800 mb-sm">The notes didn’t say these. Type each one and press Fill in — it goes in everywhere it appears. To drop one instead, edit the letter below or ask for a redraft without it.</p>
                <div className="space-y-xs">
                  {gaps.map(g => <GapFill key={g} gap={g} onFill={v => fillGap(g, v)} />)}
                </div>
              </div>
            ) : (gaps.length > 0 || worthChecking.length > 0) && (
              <div className="p-md bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
                <p className="font-semibold mb-xs">{gaps.length ? 'Fill in before sending:' : 'Worth checking:'}</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {(gaps.length ? gaps : worthChecking).map(m => <li key={m}>{m}</li>)}
                </ul>
              </div>
            )}

            <div className="grid gap-lg lg:grid-cols-2">
              {/* Editor */}
              {docType === 'invoice' && invoice ? (
              <div className="bg-white rounded-xl border border-neutral-200 p-lg space-y-md">
                <div className="grid gap-md sm:grid-cols-2">
                  <div>
                    <label className={label}>To</label>
                    <input className={input} value={invoice.recipientName} onChange={e => updateInvoice({ recipientName: e.target.value })} />
                    <div className="mt-xs"><AddressField multiline rows={3} className={input} value={invoice.recipientAddress}
                      onChange={v => updateInvoice({ recipientAddress: v })} /></div>
                  </div>
                  <div>
                    <label className={label}>Invoice number</label>
                    <input className={`${input} font-mono`} value={invoice.invoiceNumber} onChange={e => { setNumberAuto(false); updateInvoice({ invoiceNumber: e.target.value }) }} />
                    {!numberAuto && <button type="button" className="text-[11px] text-neutral-500 underline mt-xs" onClick={() => { setNumberAuto(true); renumber({}) }}>Use the automatic number</button>}
                    <label className={`${label} mt-md`}>Invoice date</label>
                    <input type="date" className={input} value={invoice.invoiceDate} onChange={e => renumber({ invoiceDate: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-md sm:grid-cols-2">
                  <div>
                    <label className={label}>Title</label>
                    <input className={input} value={invoice.title} onChange={e => updateInvoice({ title: e.target.value })} />
                  </div>
                  <div>
                    <label className={label}>Property (optional)</label>
                    <select className={input} value={invoice.propertyId ?? ''} onChange={e => {
                      const p = properties.find(x => x.id === e.target.value)
                      renumber({ propertyId: p?.id ?? null, propertyAddress: p ? (p.address || p.name).replace(/\n/g, ', ') : '' })
                    }}>
                      <option value="">Not one of our properties</option>
                      {properties.map(p => <option key={p.id} value={p.id}>{p.name.split('\n')[0]}{p.property_code ? ` · ${p.property_code}` : ''}</option>)}
                    </select>
                    {!invoice.propertyId && <div className="mt-xs"><AddressField className={input} value={invoice.propertyAddress} placeholder="Address to show (optional) — type it or the postcode" onChange={v => updateInvoice({ propertyAddress: v })} /></div>}
                  </div>
                </div>
                <div>
                  <label className={label}>Items</label>
                  <div className="space-y-sm">
                    {invoice.items.map((it, i) => (
                      <div key={i} className="rounded-lg border border-neutral-200 p-sm space-y-xs">
                        <div className="flex gap-xs">
                          <input className={input} value={it.description} placeholder="What for" onChange={e => updateItem(i, { description: e.target.value })} />
                          <button type="button" onClick={() => updateInvoice({ items: invoice.items.filter((_, j) => j !== i) })}
                            className="shrink-0 px-sm text-neutral-400 hover:text-red-600" title="Remove line">✕</button>
                        </div>
                        <input className={input} value={it.detail ?? ''} placeholder="Detail (optional), e.g. Room 3 — Jane Smith" onChange={e => updateItem(i, { detail: e.target.value })} />
                        <div className="flex items-center gap-xs">
                          <input type="number" min={1} className={`${narrow} w-16 shrink-0`} value={it.qty} onChange={e => updateItem(i, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                          <span className="text-sm text-neutral-500 shrink-0 whitespace-nowrap">× £</span>
                          <input type="number" step="0.01" className={`${narrow} w-28 shrink-0 ${it.unitPrice == null ? 'border-amber-400 bg-amber-50' : ''}`} value={it.unitPrice ?? ''} placeholder="Price"
                            onChange={e => updateItem(i, { unitPrice: e.target.value === '' ? null : Number(e.target.value) })} />
                          <span className="ml-auto text-sm font-semibold text-neutral-900 tabular-nums">{it.unitPrice == null ? '—' : money((Number(it.qty) || 0) * Number(it.unitPrice))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-sm">
                    <button type="button" onClick={() => updateInvoice({ items: [...invoice.items, { description: '', detail: '', qty: 1, unitPrice: null }] })}
                      className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">+ Add a line</button>
                    <p className="text-sm font-bold text-neutral-900 tabular-nums">Total {money(invoiceTotal)}</p>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-xs">No VAT is added (Capital Rooms is not VAT registered). Payment due within 14 days of the invoice date; our bank details are printed on it.</p>
                </div>
                <div className="pt-md border-t border-neutral-100">
                  <label className={label}>Ask for changes</label>
                  <div className="flex gap-sm">
                    <input className={input} value={changes} placeholder="e.g. split the fee per property, add the visit on 12 October at £50"
                      onChange={e => setChanges(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && changes.trim() && !drafting) draftInv(true) }} />
                    <button type="button" onClick={() => draftInv(true)} disabled={drafting || !changes.trim()}
                      className="flex-shrink-0 px-md py-sm rounded-lg border border-neutral-300 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-40">
                      {drafting ? 'Updating…' : 'Update'}
                    </button>
                  </div>
                </div>
              </div>
              ) : letter && (
              <div className="bg-white rounded-xl border border-neutral-200 p-lg space-y-md">
                <div className="grid gap-md sm:grid-cols-2">
                  <div>
                    <label className={label}>To</label>
                    <input className={input} value={letter.recipientName} onChange={e => updateLetter({ recipientName: e.target.value })} />
                    <div className="mt-xs"><AddressField multiline rows={3} className={input} value={letter.recipientAddress}
                      onChange={v => updateLetter({ recipientAddress: v })} /></div>
                  </div>
                  <div>
                    <label className={label}>Date</label>
                    <input type="date" className={input} value={letter.date} onChange={e => updateLetter({ date: e.target.value })} />
                    <label className={`${label} mt-md`}>Our ref (optional)</label>
                    <input className={input} value={letter.reference ?? ''} onChange={e => updateLetter({ reference: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className={label}>Re:</label>
                  <input className={input} value={letter.subject} onChange={e => updateLetter({ subject: e.target.value })} />
                </div>
                <div>
                  <label className={label}>Salutation</label>
                  <input className={input} value={letter.salutation} onChange={e => updateLetter({ salutation: e.target.value })} />
                </div>
                <div>
                  <label className={label}>Letter</label>
                  <textarea rows={16} className={`${input} font-mono text-[13px] leading-relaxed`} value={letter.body}
                    onChange={e => updateLetter({ body: e.target.value })} />
                  <p className="text-[11px] text-neutral-400 mt-xs">
                    Blank line = new paragraph · “- ” = bullet · “## ” = heading · “| a | b |” rows = table · **bold**
                  </p>
                </div>
                <div className="grid gap-md sm:grid-cols-2">
                  <div>
                    <label className={label}>Closing</label>
                    <select className={input} value={letter.closing} onChange={e => updateLetter({ closing: e.target.value })}>
                      {CLOSINGS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Signed by</label>
                    <input className={input} value={signer.name} onChange={e => setSigner(s => ({ ...s, name: e.target.value }))} />
                    <input className={`${input} mt-xs`} value={signer.jobTitle} placeholder="Job title"
                      onChange={e => setSigner(s => ({ ...s, jobTitle: e.target.value }))} />
                    <input className={`${input} mt-xs`} value={signer.directPhone} placeholder="Direct line (optional)"
                      onChange={e => setSigner(s => ({ ...s, directPhone: e.target.value }))} />
                    {hasSignature ? (
                      <label className="flex items-center gap-xs mt-xs text-sm text-neutral-700">
                        <input type="checkbox" checked={signer.includeSignature} onChange={e => setSigner(s => ({ ...s, includeSignature: e.target.checked }))} />
                        Include my signature
                      </label>
                    ) : (
                      <p className="text-[11px] text-neutral-400 mt-xs">Add your signature in <a href="/admin/profile" className="underline">your profile</a> to have it on your letters.</p>
                    )}
                  </div>
                </div>

                <div className="pt-md border-t border-neutral-100">
                  <label className={label}>Ask for changes</label>
                  <div className="flex gap-sm">
                    <input className={input} value={changes} placeholder="e.g. make it shorter, add that fees include VAT, more friendly"
                      onChange={e => setChanges(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && changes.trim() && !drafting) draft(true) }} />
                    <button type="button" onClick={() => draft(true)} disabled={drafting || !changes.trim()}
                      className="flex-shrink-0 px-md py-sm rounded-lg border border-neutral-300 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-40">
                      {drafting ? 'Redrafting…' : 'Redraft'}
                    </button>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-xs">Your edits above are kept. To change what the letter is about, go back to step 1.</p>
                </div>
              </div>
              )}

              {/* Preview */}
              <div className="bg-white rounded-xl border border-neutral-200 p-md flex flex-col">
                <div className="flex items-center justify-between mb-sm">
                  <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Preview {previewing && <span className="font-normal normal-case text-neutral-400">· updating…</span>}</p>
                  <span className="flex flex-wrap gap-xs">
                    <button type="button" onClick={saveDraft} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50">Save draft</button>
                    {docType === 'letter' && <button type="button" onClick={saveAsTemplate} disabled={templating} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-40">{templating ? 'Saving…' : 'Save as a template'}</button>}
                    <button type="button" onClick={downloadPdf} disabled={downloading}
                      className="rounded-lg bg-neutral-900 text-white px-md py-xs text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40">
                      {downloading ? 'Creating…' : 'Download PDF'}
                    </button>
                  </span>
                </div>
                {saveNote && <p className="text-xs text-green-700 mb-sm">{saveNote}</p>}
                {previewErr && <p className="text-sm text-red-700 mb-sm">{previewErr}</p>}
                {previewUrl
                  ? <iframe title="Preview" src={previewUrl} className="w-full flex-1 min-h-[720px] rounded border border-neutral-200" />
                  : <div className="flex-1 min-h-[720px] rounded border border-dashed border-neutral-200 flex items-center justify-center text-sm text-neutral-400">Preparing preview…</div>}
              </div>
            </div>

            {/* Email */}
            <div className="bg-white rounded-xl border border-neutral-200 p-lg space-y-md">
              <div>
                <p className="text-sm font-bold text-neutral-900">Email it</p>
                <p className="text-xs text-neutral-500 mt-xs">Sent from you{fromLine ? ` (${fromLine})` : ''} with the {docType === 'invoice' ? 'invoice' : 'letter'} attached as a PDF.</p>
              </div>
              <div className="grid gap-md md:grid-cols-2">
                <div className="space-y-sm">
                  <div>
                    <label className={label}>To</label>
                    <input className={input} value={to} onChange={e => setTo(e.target.value)} placeholder="name@example.com" />
                  </div>
                  <div>
                    <label className={label}>Cc</label>
                    <input className={input} value={cc} onChange={e => setCc(e.target.value)} />
                  </div>
                  <div>
                    <label className={label}>Subject</label>
                    <input className={input} value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                  </div>
                  <div>
                    <label className={label}>Message</label>
                    <textarea rows={8} className={input} value={emailMessage} onChange={e => setEmailMessage(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className={label}>How it will look</label>
                  {emailHtml
                    ? <iframe title="Email preview" srcDoc={emailHtml} sandbox="" className="w-full h-[420px] rounded border border-neutral-200 bg-white" />
                    : <div className="h-[420px] rounded border border-dashed border-neutral-200" />}
                </div>
              </div>
              {sendResult && (
                <div className={`rounded-lg border px-md py-xs text-sm ${sendResult.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{sendResult.text}</div>
              )}
              <div className="flex flex-wrap items-center justify-end gap-md pt-sm border-t border-neutral-100">
                {gaps.length > 0 && <span className="text-xs text-amber-700">{docType === 'invoice' ? 'Add a price to every line before sending.' : 'Fill in the [placeholders] before sending.'}</span>}
                {!to.trim() && <span className="text-xs text-neutral-400">Add the recipient’s email to send.</span>}
                <button type="button" onClick={send}
                  disabled={sending || gaps.length > 0 || !split(to).length || !emailSubject.trim() || !emailMessage.trim()}
                  className="rounded-lg bg-neutral-900 text-white px-lg py-sm text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40">
                  {sending ? 'Sending…' : 'Send email'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-xl">
          <SavedDocuments refreshKey={refreshKey} onEdit={editSaved} />
        </div>
      </div>
    </div>
  )
}
