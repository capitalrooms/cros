// The small markdown used for website posts (Website › Advice in CROS, and the public site): ## and ### headings,
// paragraphs, **bold**, *italic*, [links](https://…), ![pictures](/path or https://…) and "- " lists.
// Everything is escaped first, so nothing typed into a post can run as code on the site.
// Safe to import in the browser.

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const safeUrl = (u: string) => (/^(https?:\/\/|\/)/i.test(u.trim()) ? u.trim() : '#')

function inline(text: string): string {
  let s = esc(text)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => `<img src="${esc(safeUrl(url))}" alt="${alt}" loading="lazy" />`)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const href = safeUrl(url)
    const external = /^https?:\/\//i.test(href) && !/capitalrooms\.co\.uk/i.test(href)
    return `<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`
  })
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  return s.replace(/\n/g, '<br />')
}

/** Markdown → HTML for a post body. */
export function markdownToHtml(md: string): string {
  const blocks = String(md ?? '').replace(/\r\n/g, '\n').split(/\n{2,}/).map(b => b.trim()).filter(Boolean)
  return blocks.map(b => {
    if (/^###\s+/.test(b)) return `<h3>${inline(b.replace(/^###\s+/, ''))}</h3>`
    if (/^##\s+/.test(b)) return `<h2>${inline(b.replace(/^##\s+/, ''))}</h2>`
    if (/^#\s+/.test(b)) return `<h2>${inline(b.replace(/^#\s+/, ''))}</h2>`
    const lines = b.split('\n')
    if (lines.every(l => /^\s*[-*]\s+/.test(l))) return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`
    if (/^!\[[^\]]*\]\([^)]+\)$/.test(b)) return `<figure>${inline(b)}</figure>`
    return `<p>${inline(b)}</p>`
  }).join('\n')
}

/** Address-friendly version of a title: "Fire doors & why" → "fire-doors-why". */
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80)

/** Live on the site now: published, and any scheduled time has passed. */
export const isLive = (p: { status: string; publish_at?: string | null }) => p.status === 'published' && (!p.publish_at || new Date(p.publish_at).getTime() <= Date.now())
