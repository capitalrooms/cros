import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { siteBase } from '@/lib/website/base'
import { livePost, livePosts } from '@/lib/website/posts'
import { markdownToHtml } from '@/lib/website/markdown'
export const revalidate = 300

// first words of the body as plain text, for a description when a post has no summary (24 Nov 2026)
const plain = (md: string | null | undefined) => (md ?? '').replace(/@\[[^\]]*\]\([^)]*\)/g, '').replace(/[#*_>`\-\[\]()!]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 155)
const ORG = { '@type': 'Organization', name: 'Capital Rooms', url: 'https://capitalrooms.co.uk', logo: { '@type': 'ImageObject', url: 'https://capitalrooms.co.uk/site-icon-512.png' } }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await livePost((await params).slug)
  return p ? { title: p.title, description: p.excerpt || plain(p.body) || undefined, alternates: { canonical: `/blogs/${p.slug}` }, openGraph: { type: 'article', title: p.title, description: p.excerpt || plain(p.body) || undefined, images: p.cover_url ? [p.cover_url] : ['/og-capital-rooms.jpg'] } } : { title: 'Not found', robots: { index: false } }
}
export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const [b, p] = await Promise.all([siteBase(), livePost((await params).slug)])
  if (!p) notFound()
  const url = `https://capitalrooms.co.uk/blogs/${p.slug}`
  const published = p.shown_date || p.publish_at || null
  const article = {
    '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: p.excerpt || plain(p.body) || undefined,
    image: p.cover_url ? [p.cover_url] : undefined, datePublished: published ?? undefined, dateModified: published ?? undefined,
    author: ORG, publisher: ORG, mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://capitalrooms.co.uk/' },
    { '@type': 'ListItem', position: 2, name: 'Advice', item: 'https://capitalrooms.co.uk/blogs' },
    { '@type': 'ListItem', position: 3, name: p.title, item: url },
  ] }
  // three other live posts, same category first, so readers and search engines can move between them
  const others = ((await livePosts().catch(() => [])) as any[]).filter(o => o.slug !== p.slug)
  const related = [...others.filter(o => o.category === p.category), ...others.filter(o => o.category !== p.category)].slice(0, 3)
  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([article, crumbs]) }} />

    <article className="wrap" style={{ paddingTop: 56 }}>
      <p><Link href={`${b}/blogs`} style={{ fontWeight: 600 }}>← All advice</Link></p>
      <h1 className="h1 load2" style={{ margin: '18px 0 28px', maxWidth: 900, fontSize: 'clamp(40px,6vw,68px)' }}>{p.title}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {/* a post with its own video shows the video, not the cover picture as well */}
      {p.cover_url && !/^@\[video\]/m.test(p.body ?? '') && <img src={p.cover_url} alt={p.title} style={{ width: '100%', maxHeight: 520, objectFit: 'cover', objectPosition: p.cover_position || 'center 50%', borderRadius: 32, marginBottom: 40 }} />}
      <div className="prose" dangerouslySetInnerHTML={{ __html: markdownToHtml(p.body ?? '') }} />
    </article>
    {related.length > 0 && (
      <section className="wrap" style={{ padding: '56px 16px 80px' }} aria-label="Related advice">
        <h2 className="h2" style={{ fontSize: 28, marginBottom: 20 }}>More advice</h2>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 14 }}>
          {related.map(r => <li key={r.slug}><Link href={`${b}/blogs/${r.slug}`} style={{ fontWeight: 600, fontSize: 18 }}>{r.title}</Link>{r.excerpt && <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>{r.excerpt}</p>}</li>)}
        </ul>
      </section>
    )}
    </>
  )
}
