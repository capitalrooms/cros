// Storage locations that are safe to use in the browser (no server-only code here).
export const PRIVATE_BUCKETS = new Set(['inbox-docs', 'finance-docs', 'landlord-docs', 'aml-data', 'valuations'])

/** { bucket, path } from a Supabase storage URL (public or signed), or null. */
export function parseStorageUrl(url: string | null | undefined): { bucket: string; path: string } | null {
  const m = String(url || '').match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/)
  return m ? { bucket: m[1], path: decodeURIComponent(m[2]) } : null
}

