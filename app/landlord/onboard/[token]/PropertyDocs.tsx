'use client'

// "Property documents" step of the landlord form: pick the property, drop in any documents. Each file is read by
// AI, named, and its key facts pulled out, so the landlord never types what's already on the paper.
import { useRef, useState } from 'react'
import {
  FACT_LABELS, PROPERTY_DOC_GROUPS, PROPERTY_DOC_TYPES, docsForProperty, propertyDocLabel, type PropertyDoc,
} from '@/lib/landlordOnboarding/propertyDocs'

const fmtDate = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
const SHOWN_FACTS = ['expiry_date', 'supplier', 'insurer', 'account_number', 'policy_number', 'certificate_number', 'licence_number', 'rating', 'tenant_names', 'rent', 'end_date', 'lease_end', 'council_tax_band', 'title_number']

interface Pending { id: string; name: string; error?: string }

export default function PropertyDocs({ token, properties, docs, onChange, upload, earlier }: {
  token: string
  properties: string[]                                       // display names, one per property
  docs: PropertyDoc[]
  onChange: (update: (docs: PropertyDoc[]) => PropertyDoc[]) => void
  upload: (file: File) => Promise<string>                    // returns the storage path
  earlier: { label: string; count: number }[]                // uploads made before this step existed
}) {
  const [active, setActive] = useState(0)
  const [pending, setPending] = useState<Pending[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const property = Math.min(active, Math.max(0, properties.length - 1))
  const mine = docsForProperty(docs, property)
  const have = new Set(mine.map(d => d.type))

  async function addFiles(files: File[]) {
    for (const file of files) {
      const id = `${Date.now()}-${Math.random()}`
      setPending(p => [...p, { id, name: file.name }])
      try {
        const path = await upload(file)
        const doc: PropertyDoc = { path, property, type: '', label: '', info: {}, scanned: false, uploaded_at: new Date().toISOString() }
        onChange(list => [...list.filter(d => d.path !== path), doc])
        setPending(p => p.filter(x => x.id !== id))
        // Read it in the background; the upload is already safe whatever happens here.
        fetch(`/api/landlord-onboarding/property-doc/${token}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, property }),
        })
          .then(r => r.json())
          .then(d => onChange(list => list.map(x => (x.path !== path ? x : d.doc ? { ...d.doc, property: x.property, removed: x.removed } : { ...x, scanned: true }))))
          .catch(() => onChange(list => list.map(x => (x.path === path ? { ...x, scanned: true } : x))))
      } catch (e) {
        setPending(p => p.map(x => (x.id === id ? { ...x, error: e instanceof Error ? e.message : 'Upload failed — please try again' } : x)))
      }
    }
  }

  const setType = (path: string, type: string) =>
    onChange(list => list.map(d => (d.path === path ? { ...d, type, label: '', user_type: true } : d)))
  const remove = (path: string) => {
    if (confirm('Remove this document?')) onChange(list => list.map(d => (d.path === path ? { ...d, removed: true } : d)))
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8 mb-6">
      <h2 className="text-base font-bold text-neutral-900 mb-1">Documents for your {properties.length > 1 ? 'properties' : 'property'}</h2>
      <p className="text-sm text-neutral-500 mb-5 leading-relaxed">
        Add anything you have — certificates, floor plans, tenancy agreements, lease papers, insurance, council tax or utility bills.
        We read each one for you and note what it is and the key details, so there’s nothing to type. Photos or PDFs are fine.
      </p>

      {properties.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {properties.map((name, i) => {
            const n = docsForProperty(docs, i).length
            return (
              <button key={i} type="button" onClick={() => setActive(i)}
                className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${i === property ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700 hover:border-neutral-400'}`}>
                {name}{n ? ` · ${n}` : ''}
              </button>
            )
          })}
        </div>
      )}

      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)) }}
        className="rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-6 text-center"
      >
        <p className="text-sm font-semibold text-neutral-800 mb-1">Add documents for {properties[property] || 'this property'}</p>
        <p className="text-xs text-neutral-500 mb-4">Choose several at once if you like · photo or PDF · up to 20 MB each</p>
        <button type="button" onClick={() => inputRef.current?.click()}
          className="rounded-xl bg-neutral-900 text-white px-6 py-3 text-sm font-semibold hover:bg-neutral-700 transition">
          📎 Choose files
        </button>
        <input ref={inputRef} type="file" multiple className="hidden"
          accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/*,application/pdf"
          onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) addFiles(f) }} />
      </div>

      {(pending.length > 0 || mine.length > 0) && (
        <ul className="mt-5 space-y-2">
          {pending.map(p => (
            <li key={p.id} className={`rounded-xl border px-4 py-3 text-sm ${p.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-neutral-200 text-neutral-500'}`}>
              {p.error ? <>⚠ {p.name}: {p.error} <button type="button" className="underline ml-1" onClick={() => setPending(x => x.filter(y => y.id !== p.id))}>Dismiss</button></> : <>⏳ Uploading {p.name}…</>}
            </li>
          ))}
          {mine.map(d => {
            const facts = SHOWN_FACTS.filter(k => d.info?.[k]).slice(0, 4)
            return (
              <li key={d.path} className="rounded-xl border border-neutral-200 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {!d.scanned ? (
                      <p className="text-sm font-semibold text-violet-700">✨ Reading this document…</p>
                    ) : (
                      <p className="text-sm font-semibold text-neutral-900">{d.label || (d.type ? propertyDocLabel(d.type) : 'We couldn’t read this one — please choose what it is')}</p>
                    )}
                    {facts.length > 0 && (
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {facts.map(k => `${FACT_LABELS[k]}: ${/date|end$/.test(k) ? fmtDate(d.info[k]) : d.info[k]}`).join(' · ')}
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={() => remove(d.path)} className="text-xs text-neutral-400 hover:text-red-600">Remove</button>
                </div>
                {d.scanned && (
                  <select value={d.type} onChange={e => setType(d.path, e.target.value)}
                    className="mt-2 w-full sm:w-auto rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700">
                    <option value="">Choose what this is…</option>
                    {PROPERTY_DOC_GROUPS.map(g => (
                      <optgroup key={g} label={g}>
                        {PROPERTY_DOC_TYPES.filter(t => t.group === g).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-6">
        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Useful to have{properties.length > 1 ? ` for ${properties[property]}` : ''}</p>
        <div className="flex flex-wrap gap-2">
          {PROPERTY_DOC_TYPES.filter(t => t.expected).map(t => (
            <span key={t.key} className={`rounded-full border px-3 py-1 text-xs ${have.has(t.key) ? 'border-green-200 bg-green-50 text-green-800' : 'border-neutral-200 text-neutral-500'}`}>
              {have.has(t.key) ? '✓ ' : ''}{t.label}
            </span>
          ))}
        </div>
        <p className="text-xs text-neutral-400 mt-2">None of these are required to submit — add what you have now and send the rest to us later.</p>
      </div>

      {earlier.length > 0 && (
        <div className="mt-6 rounded-xl bg-neutral-50 border border-neutral-200 px-4 py-3">
          <p className="text-xs font-semibold text-neutral-600 mb-1">Already uploaded</p>
          <ul className="text-xs text-neutral-600 space-y-0.5">{earlier.map(e => <li key={e.label}>✓ {e.label}{e.count > 1 ? ` (${e.count})` : ''}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
