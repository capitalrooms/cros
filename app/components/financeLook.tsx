// Finance look C (3 Nov 2026, Harry chose "C · Olive & mustard"): olive, mustard and cream tiles with chunky
// buttons. Shared by the Finance home and the screens it leads to, so they all look like one place.
import Link from 'next/link'
import { Bricolage_Grotesque } from 'next/font/google'

export const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['700', '800'], display: 'swap' })

export const C = { ground: 'bg-[#F3F0E6]', olive: 'bg-[#4A5320] text-[#F3F0E6]', mustard: 'bg-[#E8B931] text-[#23261A]', paper: 'bg-[#FFFDF6] text-[#23261A]', ink: 'text-[#23261A]', muted: 'text-[#6B6A55]' }
export type Tone = 'olive' | 'mustard' | 'paper'
const BTN: Record<Tone, string> = { olive: 'bg-[#E8B931] text-[#23261A]', mustard: 'bg-[#23261A] text-[#F3F0E6]', paper: 'bg-[#4A5320] text-[#F3F0E6]' }
const BTN2: Record<Tone, string> = { olive: 'bg-white/15 text-[#F3F0E6]', mustard: 'bg-black/10 text-[#23261A]', paper: 'bg-[#EDE8D6] text-[#23261A]' }

export function Pill({ href, tone = 'paper', second, children, onClick }: { href?: string; tone?: Tone; second?: boolean; children: React.ReactNode; onClick?: () => void }) {
  const cls = `inline-flex items-center rounded-full px-md py-xs text-sm font-semibold shadow-[0_3px_0_rgba(0,0,0,0.18)] transition active:translate-y-[2px] active:shadow-none ${second ? BTN2[tone] + ' shadow-none' : BTN[tone]}`
  return href ? <Link href={href} className={cls}>{children}</Link> : <button type="button" onClick={onClick} className={cls}>{children}</button>
}

export function PageHead({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-lg flex flex-wrap items-end justify-between gap-md">
      <div>
        <p className={`text-sm ${C.muted}`}>{eyebrow}</p>
        <h1 className={`${display.className} text-4xl font-extrabold tracking-tight ${C.ink}`}>{title}</h1>
      </div>
      {right}
    </div>
  )
}
