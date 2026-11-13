'use client'
// The in-app document viewer (13 Nov 2026) — used on the installed app, where opening a file in a new window could trap
// you with no way back (lib/files/openSafely). Full screen, with Close always at the top; "Open in browser" for the
// full document (a phone can show only a PDF's first page inside a page).
import { useEffect, useState } from 'react'
import { isInstalledApp, viewFile } from '@/lib/files/openSafely'

export default function FileViewer() {
  const [f, setF] = useState<{ url: string; name?: string } | null>(null)
  useEffect(() => {
    const on = (e: Event) => setF((e as CustomEvent).detail)
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setF(null) }
    window.addEventListener('cros:view-file', on); window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('cros:view-file', on); window.removeEventListener('keydown', esc) }
  }, [])
  // On the installed app, every "open in a new window" in CROS (about 20 places open a blank window on the tap, then
  // point it at the file) comes here instead — so no screen can strand you, including ones written before this.
  useEffect(() => {
    if (!isInstalledApp()) return
    const real = window.open.bind(window)
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const u = url ? String(url) : ''
      if (target && target !== '_blank') return real(url as any, target, features)
      if (!u || u === 'about:blank') {
        let closed = false
        return { closed: false, close() { closed = true }, focus() {}, location: { set href(v: string) { if (!closed) viewFile(v) }, get href() { return '' } } } as unknown as Window
      }
      if (u.startsWith('blob:') || u.startsWith('data:') || u.startsWith(location.origin) || u.startsWith('/')) { viewFile(u); return null }
      return real(url as any, target, features)   // another website: the phone shows it over the app with its own Done
    }) as typeof window.open
    return () => { window.open = real }
  }, [])
  // the phone's back gesture closes it too
  useEffect(() => {
    if (!f) return
    history.pushState({ crosViewer: true }, '')
    const back = () => setF(null)
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [f])
  if (!f) return null
  const close = () => { if (history.state?.crosViewer) history.back(); else setF(null) }
  const image = /\.(png|jpe?g|gif|webp|heic)(\?|$)/i.test(f.url) || /^data:image\//.test(f.url)
  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-neutral-900" role="dialog" aria-label={f.name || 'Document'}>
      <div className="flex items-center gap-2 bg-neutral-950 px-3 pb-2 text-white" style={{ paddingTop: 'max(env(safe-area-inset-top), 10px)' }}>
        <button type="button" onClick={close} className="flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-bold text-neutral-950">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M15 18l-6-6 6-6" /></svg> Close
        </button>
        <p className="min-w-0 flex-1 truncate text-sm text-white/80">{f.name || 'Document'}</p>
        {f.url.startsWith('blob:') || f.url.startsWith('data:')
          ? <a href={f.url} download={f.name || 'document.pdf'} className="shrink-0 rounded-full border border-white/30 px-3 py-2 text-xs font-semibold">Save or share</a>
          : <a href={f.url} target="_blank" rel="noreferrer" className="shrink-0 rounded-full border border-white/30 px-3 py-2 text-xs font-semibold">Open in browser</a>}
      </div>
      <div className="flex-1 overflow-auto bg-neutral-800" style={{ WebkitOverflowScrolling: 'touch' }}>
        {image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={f.url} alt={f.name || ''} className="mx-auto max-w-full" />
          : <iframe src={f.url} title={f.name || 'Document'} className="h-full w-full border-0 bg-white" />}
      </div>
    </div>
  )
}
