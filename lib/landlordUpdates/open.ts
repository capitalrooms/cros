// The landlord's private page for one update (/lu/<token>): find it by its link, refuse it once it has expired.
import { createServiceClient } from '@/lib/supabase'

export async function openUpdate(token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return { error: 'This link isn’t complete.', status: 404 }
  const s = createServiceClient()
  const { data: u } = await s.from('landlord_updates').select('*').eq('share_token', token).maybeSingle() as { data: any }
  if (!u) return { error: 'This link isn’t complete.', status: 404 }
  if (u.share_expires_at && new Date(u.share_expires_at) < new Date()) return { error: 'This link has expired. Please ask us for a new one.', status: 410 }
  return { s, u }
}

/** The documents one update shared, from the tenancy's files or the application's uploads, in the order chosen. */
export async function sharedDocs(s: ReturnType<typeof createServiceClient>, ids: string[]) {
  if (!ids?.length) return []
  const { DOC_LABEL, applicantDocType } = await import('@/lib/landlordUpdates/updates')
  const [{ data: pd }, { data: ad }] = await Promise.all([
    s.from('property_documents').select('id, document_type, file_name, storage_url').in('id', ids),
    s.from('applicant_documents').select('id, doc_type, file_name, file_url, ai_summary, mime_type').in('id', ids),
  ])
  const all = [
    ...((pd ?? []) as any[]).map(d => ({ id: d.id as string, label: DOC_LABEL[d.document_type] ?? 'Document', fileName: String(d.file_name ?? ''), url: d.storage_url as string | null, mime: '' })),
    ...((ad ?? []) as any[]).map(d => { const t = applicantDocType(d.doc_type); return { id: d.id as string, label: DOC_LABEL[t] ?? (d.ai_summary ? String(d.ai_summary).slice(0, 60) : 'Document'), fileName: String(d.file_name ?? ''), url: d.file_url as string | null, mime: String(d.mime_type ?? '') } }),
  ]
  const kindOf = (d: { fileName: string; mime: string }) => /pdf/i.test(d.mime) || /\.pdf$/i.test(d.fileName) ? 'pdf' : /image\//i.test(d.mime) || /\.(jpe?g|png|gif|webp|heic)$/i.test(d.fileName) ? 'image' : 'other'
  // agreement first, then the order the office ticked them
  return ids.map(id => all.find(d => d.id === id)).filter(Boolean).map(d => ({ ...d!, kind: kindOf(d!) as 'pdf' | 'image' | 'other' }))
    .sort((a, b) => Number(b.label === 'Signed tenancy agreement') - Number(a.label === 'Signed tenancy agreement'))
}
