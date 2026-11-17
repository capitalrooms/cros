'use client'
// The fire evacuation plan in the tenant app (17 Nov 2026) — the same text as the printed plan, as a simple card.
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

type Plan = { onDiscovery?: string[]; escapeRoutes?: string[]; callForHelp?: string[]; evacuate?: string[]; assemblyPoint?: string | null; doNot?: string[]; other?: string[] }
export default function TenantFirePlan() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => { adminFetch('/api/tenant/fire-plan').then(r => r.ok ? r.json() : null).then(d => setPlan(d?.plan ?? null)).catch(() => {}) }, [])
  if (!plan || !((plan.escapeRoutes?.length ?? 0) + (plan.evacuate?.length ?? 0) + (plan.onDiscovery?.length ?? 0))) return null
  const Sec = ({ t, xs, n = true }: { t: string; xs?: string[]; n?: boolean }) => xs?.length ? (
    <div className="mt-3"><p className="text-[13px] font-bold text-[#14261F]">{t}</p>
      <ol className={`mt-1 space-y-1 pl-5 text-[14px] leading-snug text-[#14261F] ${n ? 'list-decimal' : 'list-disc'}`}>{xs.map(x => <li key={x}>{x}</li>)}</ol></div>) : null
  return (
    <section className="rounded-[20px] bg-white p-4">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between text-left" aria-expanded={open}>
        <span><span className="block text-[15px] font-bold text-[#8E2318]">Fire evacuation plan</span><span className="block text-[12px] text-[#4E6158]">{plan.assemblyPoint ? `Assembly point: ${plan.assemblyPoint}` : 'What to do if there’s a fire'}</span></span>
        <span className="text-[#4E6158]" aria-hidden="true">{open ? '⌃' : '⌄'}</span>
      </button>
      {open && (<>
        <Sec t="Escape routes" xs={plan.escapeRoutes} />
        <Sec t="If you discover a fire or hear the alarm" xs={plan.onDiscovery} />
        <Sec t="Call for help" xs={plan.callForHelp} />
        <Sec t="Evacuate the building" xs={plan.evacuate} />
        {plan.assemblyPoint && <p className="mt-3 rounded-xl bg-[#EEF2EC] p-3 text-[14px]"><b>Assembly point:</b> {plan.assemblyPoint}</p>}
        <Sec t="Do not" xs={plan.doNot} n={false} />
        <Sec t="Also" xs={plan.other} n={false} />
      </>)}
    </section>
  )
}
