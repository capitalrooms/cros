// No broken pictures in our emails, ever (30 Oct 2026, Harry: "I never want this to happen again"). The offer-letter
// templates still pointed at a logo on a Supabase project that no longer exists (hwmwfmgqnjlogkfjnkwl…), so the black
// band at the top of "Thanks for viewing" emails showed a broken image. Every <img> in an email must live on one of our
// own addresses (or be carried inside the email, cid:). Anything else:
//   - a logo  → our own logo — white on a dark background, black on a light one
//   - anything else → taken out (a missing picture beats a broken one)
// Runs when an email is sent (lib/sendEmail deliverEmail) and when a template is saved (Message templates), and the
// health check reports templates that would need it. Plain string work — safe in the browser and on the server.

export const EMAIL_ASSET_BASE = 'https://cros-sigma.vercel.app'
export const LOGO_ON_LIGHT = `${EMAIL_ASSET_BASE}/brand/lockup-ink-on-white.png`
export const LOGO_ON_DARK = `${EMAIL_ASSET_BASE}/brand/lockup-white.png`
const OUR_HOSTS = ['cros-sigma.vercel.app', 'cros-capital-rooms.vercel.app', 'capitalrooms.co.uk', 'www.capitalrooms.co.uk']

function allowedHost(src: string, extraHosts: string[]): boolean {
  if (/^(cid:|data:image\/)/i.test(src)) return true
  try { const h = new URL(src).host.toLowerCase(); return [...OUR_HOSTS, ...extraHosts].includes(h) } catch { return false }
}

/** Is the background behind this point in the html dark? Looks at the nearest "background" before it. */
function darkBehind(html: string, at: number): boolean {
  const before = html.slice(Math.max(0, at - 600), at)
  const m = [...before.matchAll(/background(?:-color)?\s*:\s*#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)].pop()
  if (!m) return false
  let hex = m[1]; if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45
}

/** Fix every image that isn't ours. `extraHosts`: e.g. our current Supabase storage host. */
export function guardEmailImages(html: string, extraHosts: string[] = []): { html: string; fixed: string[]; removed: string[] } {
  const fixed: string[] = [], removed: string[] = []
  const out = html.replace(/<img\b[^>]*>/gi, (tag, offset: number) => {
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ?? ''
    if (src && allowedHost(src, extraHosts)) return tag
    const alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? ''
    if (/logo|capital\s*rooms/i.test(`${src} ${alt}`)) {
      fixed.push(src)
      const logo = darkBehind(html, offset) ? LOGO_ON_DARK : LOGO_ON_LIGHT
      return tag.replace(/\bsrc\s*=\s*["'][^"']*["']/i, `src="${logo}"`)
    }
    removed.push(src)
    return ''
  })
  return { html: out, fixed, removed }
}

/** Image addresses in a template that aren't ours (for the health check). */
export function foreignImages(html: string, extraHosts: string[] = []): string[] {
  return [...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]).filter(src => !allowedHost(src, extraHosts))
}
