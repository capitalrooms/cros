// Content-Disposition for a download. HTTP headers must be ASCII, and file names here often hold people's
// and places' names ("Chloé", "Sept 2026 – Oct 2026", "O’Brien") — a raw non-ASCII character makes the
// route throw and the download silently fail. Send an ASCII fallback plus the exact UTF-8 name.
export function contentDisposition(filename: string, disposition: 'attachment' | 'inline' = 'attachment'): string {
  const clean = filename.replace(/[\r\n"\\]/g, '')
  const ascii = clean.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '-')
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`
}
