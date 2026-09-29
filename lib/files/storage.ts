// Where files live, and moving a document out of the (private) inbox into the property's own folder.
//   inbox-docs          PRIVATE — documents emailed in (references, IDs, statements), move-in packs. Opened only
//                       through short-lived signed links (/api/admin/files/sign, the pack token route).
//   property-documents  a property's filed documents (certificates, agreements) — filing copies them here
//   finance-docs, landlord-docs, aml-data, valuations — PRIVATE
// Nobody but the office can list any folder (migration 194).
import type { SupabaseClient } from '@supabase/supabase-js'

export { PRIVATE_BUCKETS, parseStorageUrl } from '@/lib/files/paths'

const safeName = (n: string) => String(n || 'document').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(0, 80) || 'document'

/** Copy a file from the inbox into property-documents/{propertyId}/filed/… and return its URL there. */
export async function fileIntoProperty(s: SupabaseClient, inboxPath: string, propertyId: string | null, fileName?: string | null): Promise<string> {
  const { data: blob, error: dlErr } = await s.storage.from('inbox-docs').download(inboxPath)
  if (dlErr || !blob) throw new Error(`Couldn’t read the document from the inbox: ${dlErr?.message ?? 'not found'}`)
  const name = safeName(fileName || inboxPath.split('/').pop() || 'document')
  const dest = `${propertyId || 'unassigned'}/filed/${crypto.randomUUID()}-${name}`
  const { error: upErr } = await s.storage.from('property-documents').upload(dest, Buffer.from(await blob.arrayBuffer()), { contentType: blob.type || undefined, upsert: false })
  if (upErr) throw new Error(`Couldn’t file the document: ${upErr.message}`)
  return s.storage.from('property-documents').getPublicUrl(dest).data.publicUrl
}
