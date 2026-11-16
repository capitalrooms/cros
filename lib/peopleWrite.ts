'use client'
// Changing a person from a screen (16 Nov 2026). The browser can't write to the people table, so these go to the
// server (app/api/admin/people/write and app/api/me/profile). They answer like Supabase does — { data, error } — so a
// screen swaps `supabase.from('people').update(x).eq('id', id)` for `savePerson(id, x)` and nothing else changes.
import { adminFetch } from '@/lib/adminFetch'

type Out = { data: any; error: { message: string; existingId?: string } | null }
async function call(url: string, body: unknown): Promise<Out> {
  const r = await adminFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  const j = r ? await r.json().catch(() => ({})) : {}
  if (!r?.ok) return { data: null, error: { message: (j as any).error || 'That didn’t save — check your connection and try again.', existingId: (j as any).existingId } }
  return { data: (j as any).data ?? null, error: null }
}
/** The office changes someone. */
export const savePerson = (id: string, fields: Record<string, unknown>) => call('/api/admin/people/write', { op: 'update', id, fields })
/** The office adds someone. */
export const addPerson = (fields: Record<string, unknown>) => call('/api/admin/people/write', { op: 'insert', fields })
/** The office removes someone (only if nothing in CROS points at them). */
export const removePerson = (id: string) => call('/api/admin/people/write', { op: 'delete', id })
/** Anyone changes their own name, title, phone (office: job title, direct line too). */
export const saveMyProfile = (fields: Record<string, unknown>) => call('/api/me/profile', fields)
