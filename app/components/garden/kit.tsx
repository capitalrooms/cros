'use client'
// "Garden Ask" building blocks (14 Nov 2026, Harry: "make them all look like that … exactly like your renderings"). The
// pieces the tenant, cleaner and contractor home screens are made from — the Ask bar, the big green card with its
// drawing (the arched door, the route of the day's cleans, the spanner), the two-up tiles, the green banner, and the
// white list card. Colours come from the .garden variables (app/globals.css), type from lib/fonts/garden.
// Canvas: https://claude.ai/artifact/NnYhVPdhe6hqp1tfaxeU9S (page "Garden Square colours × Ask-bar layout").
import Link from 'next/link'
import type { ReactNode } from 'react'

const FOREST = '#17332B', FOREST_DEEP = '#0F241D', FOREST_LIFT = '#1F3F35', MIST = '#B9CBBF'
export const display = { fontFamily: 'var(--font-display), var(--font-text), system-ui, sans-serif' } as const

export const Spark = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z" /></svg>
)

/** The pill at the top: tap to ask about the house (or the job). A bell beside it with a dot when there's something new. */
export function AskBar({ href, prompt, bellHref, unread = 0, bell }: { href: string; prompt: string; bellHref?: string; unread?: number; bell?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Link href={href} className="flex h-[50px] min-w-0 flex-1 items-center gap-2.5 rounded-full border-[1.5px] border-[#DCE5DD] bg-white pl-[7px] pr-4 text-[15px] shadow-[0_2px_0_#DCE5DD] active:translate-y-px">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: FOREST, color: 'var(--cr-gold)' }}><Spark /></span>
        <span className="truncate text-[#4E6158]">{prompt}</span>
      </Link>
      {bell}
      {!bell && bellHref && (
        <Link href={bellHref} aria-label={unread ? `Inbox, ${unread} new` : 'Inbox'} className="relative grid h-[50px] w-[50px] shrink-0 place-items-center rounded-full border-[1.5px] border-[#DCE5DD] bg-white text-[#14261F]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
          {unread > 0 && <span className="absolute right-[11px] top-[10px] h-[9px] w-[9px] rounded-full border-2 border-white" style={{ background: 'var(--cr-gold)' }} />}
        </Link>
      )}
    </div>
  )
}

/** "Good evening, Ama — you live at" + the big heading. */
export function Greeting({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-[#4E6158]">{eyebrow}</p>
      <h1 className="mt-0.5 text-[36px] font-extrabold leading-none tracking-[-0.03em] text-[#14261F] [text-wrap:balance]" style={display}>{title}</h1>
    </div>
  )
}

type Art = 'door' | 'tool' | { route: number; at: number }
function HeroArt({ art }: { art: Art }) {
  if (art === 'door') return (
    <svg width="104" height="156" viewBox="0 0 104 156" aria-hidden="true" className="absolute bottom-0 right-8">
      <path d="M6 156V52a46 46 0 0 1 92 0v104z" fill={FOREST_DEEP} />
      <path d="M16 156V54a36 36 0 0 1 72 0v102z" fill="var(--cr-gold)" />
      <rect x="28" y="62" width="48" height="36" rx="5" fill="none" stroke="rgba(23,51,43,.28)" strokeWidth="2" />
      <rect x="28" y="108" width="48" height="42" rx="5" fill="none" stroke="rgba(23,51,43,.28)" strokeWidth="2" />
      <circle cx="76" cy="103" r="4" fill="rgba(23,51,43,.4)" />
    </svg>
  )
  if (art === 'tool') return (
    <svg width="110" height="110" viewBox="0 0 24 24" fill="none" stroke="var(--cr-gold)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="absolute right-6 top-7">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  )
  // the day's cleans as a dotted route, stop by stop; done stops are filled, the next one in honey
  const n = Math.max(1, Math.min(5, art.route))
  const pts = Array.from({ length: n }, (_, i) => n === 1 ? [300, 92] : [240 + (i * 120) / (n - 1), 150 - (i * 116) / (n - 1)])
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')
  return (
    <svg viewBox="0 0 390 176" preserveAspectRatio="xMaxYMid meet" aria-hidden="true" className="absolute inset-0 h-full w-full">
      {n > 1 && <><path d={d} fill="none" stroke={FOREST_LIFT} strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" /><path d={d} fill="none" stroke="var(--cr-gold)" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" /></>}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="13" fill={i === art.at ? 'var(--cr-gold)' : i < art.at ? MIST : '#F1F5EE'} />
          <text x={p[0]} y={p[1] + 4.5} textAnchor="middle" fontFamily="var(--font-display), sans-serif" fontWeight="800" fontSize="13" fill={FOREST}>{i < art.at ? '✓' : i + 1}</text>
        </g>
      ))}
    </svg>
  )
}

/** The big green card: a label, a heading, a line under it, its drawing, and optional buttons along the bottom.
 *  Laid out in normal flow (14 Nov 2026 — a long job title ran over the buttons): the words take the left side, the
 *  drawing sits behind on the right, long headings step down a size and stop at three lines, and the card grows to fit. */
export function Hero({ eyebrow, title, sub, art, children, faces, height = 176, href }: {
  eyebrow: string; title: string; sub?: string; art: Art; children?: ReactNode; faces?: ReactNode; height?: number; href?: string
}) {
  const size = title.length > 60 ? 'text-[19px]' : title.length > 32 ? 'text-[21px]' : 'text-[24px]'
  const body = (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[26px]" style={{ background: FOREST, minHeight: height }}>
      {typeof art === 'string' && <svg width="250" height="250" viewBox="0 0 250 250" aria-hidden="true" className={`pointer-events-none absolute ${art === 'tool' ? '-right-[70px] -top-[50px]' : '-right-[66px] -top-[46px]'}`}><circle cx="125" cy="125" r="115" fill={FOREST_LIFT} /></svg>}
      <div className="pointer-events-none absolute inset-0"><HeroArt art={art} /></div>
      <div className={`relative flex flex-1 flex-col px-5 pt-5 ${faces ? 'pb-7' : 'pb-[18px]'}`}>
        <div className="max-w-[62%] text-[#F1F5EE]">
          <p className="text-xs font-semibold" style={{ color: MIST }}>{eyebrow}</p>
          <p className={`mt-0.5 ${size} line-clamp-3 font-extrabold leading-[1.08]`} style={display}>{title}</p>
          {sub && <p className="mt-1 line-clamp-2 text-xs leading-snug" style={{ color: MIST }}>{sub}</p>}
        </div>
        {children && <div className="mt-auto flex flex-wrap gap-2 pt-4">{children}</div>}
      </div>
    </div>
  )
  return (
    <div className="relative shrink-0">
      {href ? <Link href={href} className="block">{body}</Link> : body}
      {faces && <div className="absolute -bottom-[18px] left-[14px] flex">{faces}</div>}
    </div>
  )
}

/** A honey button with a raised edge (on the green card, in cards). */
export function HoneyButton({ children, onClick, href, disabled, className = '' }: { children: ReactNode; onClick?: () => void; href?: string; disabled?: boolean; className?: string }) {
  const cls = `inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-bold text-[#17332B] shadow-[0_3px_0_var(--cr-honey-edge)] active:translate-y-[2px] active:shadow-[0_1px_0_var(--cr-honey-edge)] disabled:opacity-50 ${className}`
  return href ? <Link href={href} className={cls} style={{ background: 'var(--cr-gold)' }}>{children}</Link>
    : <button type="button" onClick={onClick} disabled={disabled} className={cls} style={{ background: 'var(--cr-gold)' }}>{children}</button>
}
export function GhostButton({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const cls = 'inline-flex h-10 items-center justify-center rounded-full border border-white/30 px-4 text-sm font-bold text-[#F1F5EE]'
  return href ? <Link href={href} className={cls} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{children}</Link> : <button type="button" onClick={onClick} className={cls}>{children}</button>
}

/** An initial in a circle — housemates on the green card, stops, people. */
export function Dot({ label, bg, size = 44, ring = '#EEF2EC' }: { label: string; bg: string; size?: number; ring?: string }) {
  return <span className="-mr-2.5 grid shrink-0 place-items-center rounded-full font-extrabold text-[#14261F]" style={{ ...display, width: size, height: size, background: bg, border: `3px solid ${ring}`, fontSize: size * 0.36 }}>{label}</span>
}
export const DOT_FILLS = ['var(--cr-gold)', '#FDF1D8', '#E3ECE5', '#F6D9CF', '#DDE7F2']

/** One of the two-up tiles under the card. Long values step down a size so a long address never towers. */
export function Tile({ label, value, tone = 'sage', href, onClick }: { label: string; value: string; tone?: 'butter' | 'sage' | 'white'; href?: string; onClick?: () => void }) {
  const bg = tone === 'butter' ? '#FDF1D8' : tone === 'white' ? '#FFFFFF' : '#E3ECE5'
  const ink = tone === 'butter' ? '#7A5410' : '#4E6158'
  const size = value.length > 30 ? 'text-[16px]' : value.length > 20 ? 'text-[19px]' : 'text-[22px]'
  const inner = (
    <>
      <p className="text-xs font-bold" style={{ color: ink }}>{label}</p>
      <p className={`${size} font-extrabold leading-[1.08] text-[#14261F]`} style={display}>{value}</p>
    </>
  )
  const cls = 'flex h-full min-h-[104px] w-full flex-col justify-between gap-2 rounded-[20px] p-3.5 text-left'
  if (onClick) return <button type="button" onClick={onClick} className={cls} style={{ background: bg }}>{inner}</button>
  return href ? <Link href={href} className={cls} style={{ background: bg }}>{inner}</Link> : <div className={cls} style={{ background: bg }}>{inner}</div>
}

/** The green strip with a honey circle — "Say hello to Jess", a tenant's request, a heads-up. */
export function Banner({ badge, children, href, action }: { badge: ReactNode; children: ReactNode; href?: string; action?: ReactNode }) {
  const inner = (
    <>
      <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full text-[15px] font-extrabold text-[#17332B]" style={{ ...display, background: 'var(--cr-gold)' }}>{badge}</span>
      <div className="min-w-0 flex-1 text-sm leading-snug">{children}</div>
      {action ?? (href && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cr-gold)" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>)}
    </>
  )
  const cls = 'flex items-center gap-3 rounded-[20px] p-3.5 text-[#F1F5EE]'
  return href ? <Link href={href} className={cls} style={{ background: FOREST }}>{inner}</Link> : <div className={cls} style={{ background: FOREST }}>{inner}</div>
}

/** A section heading with an optional link on the right. */
export function SectionHead({ title, right }: { title: string; right?: ReactNode }) {
  return <div className="flex items-baseline justify-between px-1"><h2 className="text-lg font-bold text-[#14261F]" style={display}>{title}</h2>{right}</div>
}

/** A row in a white list card: an icon (or a number) in a sage square, a bold line and a grey line. */
export function Row({ icon, title, sub, right, href, last }: { icon: ReactNode; title: string; sub?: string; right?: ReactNode; href?: string; last?: boolean }) {
  const inner = (
    <>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#E3ECE5] text-[#17332B]">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-bold text-[#14261F]">{title}</span>{sub && <span className="block text-[13px] text-[#4E6158]">{sub}</span>}</span>
      {right}
    </>
  )
  const cls = `flex items-center gap-3 py-3 ${last ? '' : 'border-b border-[#E8EEE9]'}`
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>
}
export function ListCard({ children }: { children: ReactNode }) {
  return <div className="rounded-[22px] bg-white px-4 py-1">{children}</div>
}

export const PATHS = {
  tool: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  spark: 'M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  key: 'M8 19a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM11 12l8-8M16 7l2 2M14 9l2 2',
  alert: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01',
  bin: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
}
export const Ico = ({ d, size = 20, stroke = 'currentColor' }: { d: string; size?: number; stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
