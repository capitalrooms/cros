// Published advice posts for the website (CROS → Website). Server only; only live posts, only public fields.
import { createServiceClient } from '@/lib/supabase'
import { isLive } from '@/lib/website/markdown'
export async function livePosts() {
  const { data } = await (createServiceClient() as any).from('website_posts').select('slug, title, excerpt, cover_url, category, status, publish_at, shown_date').eq('status', 'published').order('shown_date', { ascending: false })
  return ((data ?? []) as any[]).filter(isLive)
}
export async function livePost(slug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null
  const { data } = await (createServiceClient() as any).from('website_posts').select('slug, title, excerpt, body, cover_url, category, status, publish_at, shown_date').eq('slug', slug).maybeSingle()
  return data && isLive(data) ? data : null
}
