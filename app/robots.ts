// robots.txt (9 Nov 2026). Everything may be crawled; the app's private pages say "noindex" themselves (root layout),
// which works better than hiding them here (a blocked page can't be seen to say noindex). The sitemap lists the website.
import type { MetadataRoute } from 'next'
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/admin', '/site/'] }], sitemap: 'https://capitalrooms.co.uk/sitemap.xml', host: 'https://capitalrooms.co.uk' }
}
