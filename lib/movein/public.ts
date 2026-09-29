// Shared by the tenant-facing pack routes (no login — the token is the key).
import type { NextRequest } from 'next/server'
import { svc } from './email'

export interface PackRow {
  id: string; tenancy_id: string; token: string; tenant_name: string; tenant_email: string
  documents: { key: string; label: string; group: string; source: string; available: boolean; path?: string; url?: string }[]
  summary: Record<string, any>; message: string | null; status: string; sent_by: string | null; sent_at: string
  first_viewed_at: string | null; confirmed_at: string | null; confirmed_name: string | null; tenant_questions: string | null
}

export async function packByToken(token: string): Promise<{ pack: PackRow | null; error?: string }> {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return { pack: null }
  const { data, error } = await svc().from('tenancy_packs').select('*').eq('token', token).maybeSingle()
  if (error) return { pack: null, error: error.message }
  return { pack: data as PackRow | null }
}

export const clientIp = (req: NextRequest) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || null

export async function logPackEvent(req: NextRequest, packId: string, event: 'viewed' | 'opened_document' | 'confirmed', documentKey?: string) {
  await svc().from('tenancy_pack_events').insert({
    pack_id: packId, event, document_key: documentKey ?? null, ip: clientIp(req), user_agent: (req.headers.get('user-agent') || '').slice(0, 300),
  })
}
