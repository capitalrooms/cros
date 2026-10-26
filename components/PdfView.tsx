'use client'

// A PDF shown inside a screen, for every phone (26 Oct 2026, Harry: "there is bleeding — make sure this doesn't happen
// with any users viewing documents"). In a frame, an iPhone shows a PDF at full page width and crops it, and Android
// Chrome can't show one at all. On phones and tablets the pages are drawn here (pdf.js, the build for older
// browsers) to the width of the screen, one under another; on a computer the browser's own viewer is kept, which has
// its own zoom and search. Either way there's an "Open full screen" link, and if drawing fails it falls back to it.
import { useEffect, useRef, useState } from 'react'

const isPhoneOrTablet = () =>
  typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 1024)

export default function PdfView({ src, title, className = '', height }: { src: string | null | undefined; title: string; className?: string; height?: number | string }) {
  const [mode, setMode] = useState<'frame' | 'pages' | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [pageCount, setPageCount] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => { setMode(isPhoneOrTablet() ? 'pages' : 'frame') }, [])

  useEffect(() => {
    if (mode !== 'pages' || !src || !box.current) return
    let cancelled = false
    const holder = box.current
    holder.innerHTML = ''
    setState('loading')
    ;(async () => {
      try {
        const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const doc = await pdfjs.getDocument({ url: src, withCredentials: false }).promise
        if (cancelled) return
        setPageCount(doc.numPages)
        const width = holder.clientWidth || 320
        const ratio = Math.min(window.devicePixelRatio || 1, 2.5)
        for (let n = 1; n <= Math.min(doc.numPages, 40); n++) {
          const page = await doc.getPage(n)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const vp = page.getViewport({ scale: (width / base.width) * ratio })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height)
          canvas.style.width = '100%'; canvas.style.height = 'auto'; canvas.style.display = 'block'
          canvas.style.background = '#fff'
          if (n > 1) canvas.style.marginTop = '8px'
          canvas.setAttribute('aria-label', `${title} — page ${n}`)
          holder.appendChild(canvas)
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
          if (n === 1) setState('ready')
        }
        setState('ready')
      } catch {
        if (!cancelled) setState('failed')
      }
    })()
    return () => { cancelled = true }
  }, [mode, src, title])

  if (!src) return <div className={`flex items-center justify-center text-sm text-neutral-400 ${className}`} style={{ height }}>Opening…</div>
  const open = <a href={src} target="_blank" rel="noopener noreferrer" className="block py-sm text-center text-sm font-semibold text-neutral-900 underline underline-offset-2">Open full screen</a>

  if (mode === 'frame') return (
    <div className={`flex flex-col ${className}`} style={{ height }}>
      <iframe src={src} title={title} className="w-full flex-1 border-0 bg-white" style={{ minHeight: height ? undefined : 480 }} />
    </div>
  )

  return (
    <div className={`flex flex-col ${className}`} style={{ height }}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-neutral-100 p-xs" style={{ WebkitOverflowScrolling: 'touch' }}>
        {state === 'loading' && <p className="py-lg text-center text-sm text-neutral-500">Opening the document…</p>}
        {state === 'failed' && <p className="py-lg text-center text-sm text-neutral-600">This document can’t be shown here.</p>}
        <div ref={box} />
        {pageCount > 40 && <p className="py-sm text-center text-xs text-neutral-500">Showing the first 40 of {pageCount} pages.</p>}
      </div>
      {open}
    </div>
  )
}
