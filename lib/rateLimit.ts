// A simple fixed-window rate limit kept in the database (table rate_limits, migration 300). Returns true when the
// caller is allowed. Fails open if the table is missing, so a missing migration never locks people out of login.
import { createServiceClient } from '@/lib/supabase'

export async function allowRequest(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const s = createServiceClient() as any
    const now = Date.now()
    const { data } = await s.from('rate_limits').select('hits, window_start').eq('key', key).maybeSingle()
    const fresh = !data || now - new Date(data.window_start).getTime() > windowSeconds * 1000
    const hits = fresh ? 1 : (data.hits ?? 0) + 1
    await s.from('rate_limits').upsert({ key, hits, window_start: fresh ? new Date(now).toISOString() : data.window_start })
    return hits <= limit
  } catch {
    return true
  }
}
