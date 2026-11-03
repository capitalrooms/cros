'use client'

// The panel beside a list (rebuild A+B, 3 Nov 2026): open a month, a statement or an invoice without leaving the
// list — on a desktop it sits on the right, the list stays where it is; on a phone it rises as a sheet from the bottom.
// Esc, the × or a tap outside closes it. One panel at a time: opening another replaces what's in it.

import { useEffect, useRef, type ReactNode } from 'react'
import { display } from '@/app/components/financeLook'

export default function SidePanel({ open, title, eyebrow, onClose, children, footer }: {
  open: boolean; title: ReactNode; eyebrow?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[150] md:left-auto md:w-[420px]" role="dialog" aria-modal="true">
      {/* the shade only on a phone — on a desktop the list beside stays usable */}
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[#23261A]/45 md:hidden" />
      <div ref={ref} tabIndex={-1}
        className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[28px] bg-[#23261A] text-[#F3F0E6] shadow-[0_-12px_40px_rgba(35,38,26,0.35)] outline-none md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[420px] md:rounded-none md:rounded-l-[24px]">
        <span aria-hidden="true" className="mx-auto mt-sm h-[5px] w-11 shrink-0 rounded-full bg-[#F3F0E6]/30 md:hidden" />
        <header className="flex shrink-0 items-start justify-between gap-md px-lg pb-sm pt-md md:pt-lg">
          <div className="min-w-0">
            {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#F3F0E6]/60">{eyebrow}</p>}
            <h2 className={`${display.className} text-[22px] font-extrabold leading-tight`}>{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close panel" className="-mr-xs rounded-full px-sm text-2xl leading-none text-[#F3F0E6]/60 hover:text-[#F3F0E6]">×</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-lg pb-lg text-sm">{children}</div>
        {footer && <div className="shrink-0 border-t border-[#F3F0E6]/10 px-lg py-md pb-[max(env(safe-area-inset-bottom),16px)]">{footer}</div>}
      </div>
    </div>
  )
}

/** A label and value on one line in the panel. */
export function PanelRow({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: 'warn' | 'good' }) {
  return (
    <div className={`flex items-baseline justify-between gap-md border-b border-[#F3F0E6]/10 py-sm ${tone === 'warn' ? 'text-[#E8B931]' : tone === 'good' ? 'text-[#A9C98F]' : ''}`}>
      <span className="text-[#F3F0E6]/75">{label}</span><b className="text-right tabular-nums">{value}</b>
    </div>
  )
}

/** The mustard button in the panel's footer. */
export function PanelButton({ children, onClick, href, second }: { children: ReactNode; onClick?: () => void; href?: string; second?: boolean }) {
  const cls = `inline-flex items-center justify-center rounded-full px-lg py-sm text-sm font-bold ${second ? 'bg-[#F3F0E6]/12 text-[#F3F0E6]' : 'bg-[#E8B931] text-[#23261A]'}`
  return href ? <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}</a> : <button type="button" onClick={onClick} className={cls}>{children}</button>
}
