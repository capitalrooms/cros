// Server-side helpers for the public landlord onboarding form (token = access credential).
import { createClient } from '@supabase/supabase-js'

export const svc = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

export const DOCS_BUCKET = 'landlord-docs'
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const ALLOWED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export type FormDataRecord = Record<string, unknown> & { documents?: Record<string, string[]>; __sections_saved?: string[] }

export interface OnboardingRow {
  id: string
  stage: number
  form_data: FormDataRecord | null
  updated_at: string
  entity_type: string | null
  property_count: string | null
}

/** Client-supplied form data may not set server-owned keys (anything starting "__"). */
export function stripServerKeys(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data ?? {})) if (!k.startsWith('__')) out[k] = v
  return out
}

/** Union of document paths per type, so no upload is ever dropped by a stale client copy. */
export function mergeDocuments(a?: Record<string, string[]>, b?: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const src of [a ?? {}, b ?? {}]) {
    for (const [type, paths] of Object.entries(src)) {
      if (!Array.isArray(paths)) continue
      out[type] = Array.from(new Set([...(out[type] ?? []), ...paths.filter(p => typeof p === 'string')]))
    }
  }
  return out
}

export async function loadRow(token: string): Promise<OnboardingRow | null> {
  const { data } = await svc()
    .from('landlord_onboarding')
    .select('id, stage, form_data, updated_at, entity_type, property_count')
    .eq('token', token)
    .maybeSingle()
  return (data as OnboardingRow) ?? null
}

/**
 * Read-modify-write of form_data with optimistic concurrency on updated_at, so a section save
 * and several uploads landing at the same moment never overwrite each other.
 */
export async function updateFormData(
  token: string,
  mutate: (current: FormDataRecord, row: OnboardingRow) => { form_data: FormDataRecord; extra?: Record<string, unknown> },
): Promise<{ ok: true; row: OnboardingRow; form_data: FormDataRecord } | { ok: false; status: number; error: string }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const row = await loadRow(token)
    if (!row) return { ok: false, status: 404, error: 'Invalid link' }
    const { form_data, extra } = mutate(row.form_data ?? {}, row)
    const now = new Date().toISOString()
    let q = svc()
      .from('landlord_onboarding')
      .update({ form_data, updated_at: now, ...(extra ?? {}) })
      .eq('token', token)
    q = row.updated_at ? q.eq('updated_at', row.updated_at) : q.is('updated_at', null)
    const { data, error } = await q.select('id')
    if (error) return { ok: false, status: 500, error: error.message }
    if (data && data.length) return { ok: true, row, form_data }
    await new Promise(r => setTimeout(r, 60 + Math.random() * 140))
  }
  return { ok: false, status: 409, error: 'The form was busy saving — please try again' }
}
