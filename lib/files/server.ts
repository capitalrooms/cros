// Server-only: reading and linking stored files now that the folders are private.
//   readStoredFile(url)       — the file's bytes: from our storage with the service key when it's ours (a public link
//                               no longer works), otherwise a normal download
//   signedLinkFor(url, secs)  — a signed link that works for `secs` (emails, the move-in pack, quote pages)
import { createServiceClient } from '@/lib/supabase'
import { parseStorageUrl } from '@/lib/files/paths'

export async function readStoredFile(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const ref = parseStorageUrl(url)
  if (ref) {
    const { data, error } = await createServiceClient().storage.from(ref.bucket).download(ref.path)
    if (error || !data) throw new Error(`Couldn’t read the file: ${error?.message ?? 'not found'}`)
    return { bytes: Buffer.from(await data.arrayBuffer()), contentType: data.type || 'application/octet-stream' }
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`Couldn’t download the file (${r.status})`)
  return { bytes: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get('content-type') || 'application/octet-stream' }
}

/** A link to one of our stored files that works for `seconds`; anything that isn't ours is returned as it was. */
export async function signedLinkFor(url: string | null | undefined, seconds: number): Promise<string | null> {
  if (!url) return null
  const ref = parseStorageUrl(url)
  if (!ref) return url
  const { data, error } = await createServiceClient().storage.from(ref.bucket).createSignedUrl(ref.path, seconds)
  return error || !data ? null : data.signedUrl
}

/** fetch() for a stored file: our own files are read with the service key (their public links stop working once the
 *  folder is private); anything else is fetched as before. Callers must have checked the caller is staff. */
export async function fetchStored(url: string): Promise<Response> {
  if (!parseStorageUrl(url)) return fetch(url, { signal: AbortSignal.timeout(20000) })
  try {
    const { bytes, contentType } = await readStoredFile(url)
    return new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': contentType } })
  } catch { return new Response(null, { status: 404 }) }
}
