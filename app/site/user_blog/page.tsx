// Old GNB post addresses (/user_blog?q=…) go to the same post on the new site.
import { redirect } from 'next/navigation'
import { siteBase } from '@/lib/website/base'
import map from '@/lib/website/oldPostMap.json'
export default async function OldPost({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q ?? ''
  const slug = (map as Record<string, string>)[q]
  redirect(`${await siteBase()}/blogs${slug ? `/${slug}` : ''}`)
}
