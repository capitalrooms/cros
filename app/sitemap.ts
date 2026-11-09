// sitemap.xml (9 Nov 2026): the website's pages, advice posts and the homes on the website — refreshed hourly.
import type { MetadataRoute } from 'next'
import { livePosts } from '@/lib/website/posts'
import { websiteHomes } from '@/lib/website/homes'
export const revalidate = 3600
const BASE = 'https://capitalrooms.co.uk'
const PAGES: [string, number, MetadataRoute.Sitemap[number]['changeFrequency']][] = [
  ['/', 1, 'weekly'], ['/landlords', 0.9, 'monthly'], ['/residential-lettings', 0.9, 'daily'], ['/shared-accommodation', 0.8, 'daily'],
  ['/tenants', 0.8, 'monthly'], ['/maintenance-services', 0.7, 'monthly'], ['/instant_valuation', 0.8, 'monthly'], ['/about-us', 0.6, 'yearly'],
  ['/testimonial', 0.6, 'monthly'], ['/blogs', 0.6, 'weekly'], ['/contact', 0.6, 'yearly'], ['/page/9-guarantor-affordability-calculator', 0.5, 'yearly'], ['/privacy_policy', 0.2, 'yearly'],
]
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const [posts, homes] = await Promise.all([livePosts().catch(() => []), websiteHomes().catch(() => [])])
  return [
    ...PAGES.map(([p, priority, changeFrequency]) => ({ url: BASE + (p === '/' ? '' : p), lastModified: now, changeFrequency, priority })),
    ...posts.map((p: any) => ({ url: `${BASE}/blogs/${p.slug}`, lastModified: new Date(p.shown_date || p.publish_at || now), changeFrequency: 'yearly' as const, priority: 0.5 })),
    ...homes.map(h => ({ url: BASE + h.href, lastModified: now, changeFrequency: 'daily' as const, priority: 0.7 })),
  ]
}
