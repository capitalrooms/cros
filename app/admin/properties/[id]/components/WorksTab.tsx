'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Job {
  id: string
  title: string | null
  description: string | null
  category: string | null
  location: string | null
  cause: string | null
  completed_at: string | null
  final_price: number | null
  fix_quality: string | null
  return_needed: boolean | null
  return_reason: string | null
  aftercare_notes: string | null
  admin_note: string | null
  before_photo: string | null
  after_photo: string | null
  photos: any
  contractor?: { full_name: string | null } | null
  room?: { name: string | null } | null
}

interface WorksTabProps {
  propertyId: string
}

// Normalise the assorted photo fields into a flat list of image URLs.
function photoUrls(job: Job): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = []
  if (typeof job.before_photo === 'string' && job.before_photo) out.push({ label: 'Before', url: job.before_photo })
  if (typeof job.after_photo === 'string' && job.after_photo) out.push({ label: 'After', url: job.after_photo })
  const p = job.photos
  const arr = Array.isArray(p) ? p : typeof p === 'string' && p.startsWith('[') ? safeParse(p) : []
  for (const item of arr || []) {
    if (typeof item === 'string' && item) out.push({ label: 'Photo', url: item })
    else if (item && typeof item === 'object' && (item.url || item.src)) out.push({ label: item.label || 'Photo', url: item.url || item.src })
  }
  return out
}
function safeParse(s: string) { try { return JSON.parse(s) } catch { return [] } }

export default function WorksTab({ propertyId }: WorksTabProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<Job[]>([])
  const [selected, setSelected] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      // No FK relationship on contractor_id/room_id, so fetch plainly and
      // resolve contractor + room names in separate lookups.
      const { data, error: err } = await supabase
        .from('maintenance_tickets')
        .select('*')
        .eq('property_id', propertyId)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
      if (err) {
        setError('Could not load job history')
        setLoading(false)
        return
      }
      const tickets = data || []

      const contractorIds = [...new Set(tickets.map((t) => t.contractor_id).filter(Boolean))]
      const roomIds = [...new Set(tickets.map((t) => t.room_id).filter(Boolean))]

      const [{ data: people }, { data: rooms }] = await Promise.all([
        contractorIds.length
          ? supabase.from('people').select('id, full_name').in('id', contractorIds)
          : Promise.resolve({ data: [] as any[] }),
        roomIds.length
          ? supabase.from('rooms').select('id, name').in('id', roomIds)
          : Promise.resolve({ data: [] as any[] }),
      ])
      const peopleById = new Map((people || []).map((p: any) => [p.id, p]))
      const roomsById = new Map((rooms || []).map((r: any) => [r.id, r]))

      setJobs(
        tickets.map((t) => ({
          ...t,
          contractor: t.contractor_id ? { full_name: peopleById.get(t.contractor_id)?.full_name ?? null } : null,
          room: t.room_id ? { name: roomsById.get(t.room_id)?.name ?? null } : null,
        }))
      )
      setLoading(false)
    }
    load()
  }, [propertyId])

  if (loading) return <div className="p-xl text-sm text-neutral-400">Loading job history…</div>

  return (
    <div className="space-y-xl">
      <div>
        <h2 className="text-xl font-semibold text-white">Works Carried Out</h2>
        <p className="text-sm text-neutral-400 mt-xs">
          Completed jobs at this property. Cost shown where recorded — some invoices are settled outside the app.
        </p>
      </div>

      {error && <div className="p-md rounded-lg bg-red-950 border border-red-800 text-sm text-red-300">{error}</div>}

      {jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-700 bg-neutral-900 p-xl text-center">
          <p className="text-sm text-neutral-500">No completed jobs recorded yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-900 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <th className="px-md py-sm">Job</th>
                <th className="px-md py-sm">Where</th>
                <th className="px-md py-sm">Completed</th>
                <th className="px-md py-sm">Contractor</th>
                <th className="px-md py-sm text-right">Cost</th>
                <th className="px-md py-sm"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const pics = photoUrls(j)
                return (
                  <tr
                    key={j.id}
                    className="cursor-pointer border-t border-neutral-800 hover:bg-neutral-900"
                    onClick={() => setSelected(j)}
                  >
                    <td className="px-md py-sm">
                      <p className="font-medium text-white">{j.title || 'Untitled job'}</p>
                      {j.description && <p className="text-xs text-neutral-500 line-clamp-1 max-w-md">{j.description}</p>}
                    </td>
                    <td className="px-md py-sm text-neutral-300 text-xs">{j.room?.name || <span className="text-neutral-500">Whole property</span>}</td>
                    <td className="px-md py-sm text-neutral-400 text-xs">
                      {j.completed_at ? new Date(j.completed_at).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="px-md py-sm text-neutral-400 text-xs">{j.contractor?.full_name || '—'}</td>
                    <td className="px-md py-sm text-right">
                      {j.final_price != null
                        ? <span className="text-neutral-200">£{Number(j.final_price).toLocaleString()}</span>
                        : <span className="text-xs italic text-neutral-500">cost not recorded</span>}
                    </td>
                    <td className="px-md py-sm text-right text-xs text-neutral-500">
                      {pics.length > 0 && `📷 ${pics.length}`} ›
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-lg" onClick={() => setSelected(null)}>
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-neutral-900 border border-neutral-700 p-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-md mb-md">
              <div>
                <h3 className="text-lg font-bold text-white">{selected.title || 'Untitled job'}</h3>
                <p className="text-xs text-neutral-500 mt-xs">
                  {[selected.category, selected.room?.name || 'Whole property'].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-neutral-500 hover:text-white text-2xl leading-none shrink-0">×</button>
            </div>

            {/* Summary chips */}
            <div className="flex flex-wrap gap-sm mb-lg text-xs">
              <span className="rounded bg-neutral-800 px-sm py-0.5 text-neutral-300">
                Completed {selected.completed_at ? new Date(selected.completed_at).toLocaleDateString('en-GB') : '—'}
              </span>
              <span className="rounded bg-neutral-800 px-sm py-0.5 text-neutral-300">
                {selected.contractor?.full_name || 'Contractor not recorded'}
              </span>
              <span className={`rounded px-sm py-0.5 ${selected.final_price != null ? 'bg-green-900 text-green-200' : 'bg-neutral-800 text-neutral-400 italic'}`}>
                {selected.final_price != null ? `£${Number(selected.final_price).toLocaleString()}` : 'cost not recorded'}
              </span>
              {selected.fix_quality && <span className="rounded bg-neutral-800 px-sm py-0.5 text-neutral-300">Quality: {selected.fix_quality}</span>}
              {selected.return_needed && <span className="rounded bg-amber-900 px-sm py-0.5 text-amber-200">Return needed</span>}
            </div>

            {/* Detail fields */}
            <div className="space-y-md text-sm">
              {selected.description && <Field label="What the issue was" value={selected.description} />}
              {selected.cause && <Field label="Cause" value={selected.cause} />}
              {selected.return_reason && <Field label="Return reason" value={selected.return_reason} />}
              {selected.aftercare_notes && <Field label="Aftercare" value={selected.aftercare_notes} />}
              {selected.admin_note && <Field label="Admin note" value={selected.admin_note} />}
            </div>

            {/* Photos */}
            {photoUrls(selected).length > 0 && (
              <div className="mt-lg">
                <p className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-sm">Photos</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-sm">
                  {photoUrls(selected).map((pic, i) => (
                    <a key={i} href={pic.url} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pic.url} alt={pic.label} className="w-full h-28 object-cover rounded-lg border border-neutral-700" />
                      <p className="text-xs text-neutral-500 mt-xs">{pic.label}</p>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-xs">{label}</p>
      <p className="text-neutral-200 whitespace-pre-wrap">{value}</p>
    </div>
  )
}
