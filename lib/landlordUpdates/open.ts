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
