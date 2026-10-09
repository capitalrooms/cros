'use client'
// An <img> / <a> for a stored file that may be in a private folder: it shows once a short-lived signed link is ready
// (lib/files/useStoredFile). Links outside the private folders are used as they are.
import { useStoredUrl } from '@/lib/files/useStoredFile'

export function StoredImg({ src, alt, className, style }: { src: string | null | undefined; alt: string; className?: string; style?: React.CSSProperties }) {
  const link = useStoredUrl(src)
  // eslint-disable-next-line @next/next/no-img-element
  return link ? <img src={link} alt={alt} className={className} style={style} /> : <span className={className} style={{ ...style, display: 'block', background: '#f2f2f2' }} aria-label={alt} />
}

export function StoredLink({ href, children, className }: { href: string | null | undefined; children: React.ReactNode; className?: string }) {
  const link = useStoredUrl(href)
  return <a href={link ?? undefined} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
}
