// Storage locations that are safe to use in the browser (no server-only code here).
// Every folder holding people's documents or photos inside their homes is private (9 Oct 2026): opened only through
// short-lived signed links. property-photos (room marketing photos for listings) stays public on purpose.
export const PRIVATE_BUCKETS = new Set(['inbox-docs', 'finance-docs', 'landlord-docs', 'aml-data', 'valuations',
  'property-documents', 'maintenance-photos', 'job-photos', 'tenant-guides'])

/** { bucket, path } from a Supabase storage URL (public or signed), or null. */
export function parseStorageUrl(url: string | null | undefined): { bucket: string; path: string } | null {
  const m = String(url || '').match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/)
  return m ? { bucket: m[1], path: decodeURIComponent(m[2]) } : null
}

