'use client'
// A planner opened from its link — no sign-in (17 Nov 2026, Harry: "they can just come back to the link and pick up in
// the planner … it doesn't take him through to the contractor main screen"). Just that one board: read, add notes,
// links and photos, reply, tick off. lib/planner/link · app/api/planner/shared (x-planner-link).
import { use, useState } from 'react'
import LandlordPlanner from '@/components/LandlordPlanner'
import { display } from '@/app/components/garden/kit'

export default function PlannerLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  // set before the planner's first request
  useState(() => { if (typeof window !== 'undefined') (window as any).__crosPlannerLink = token; return true })
  return (
    <div className="garden min-h-screen bg-[#EEF2EC]" style={{ paddingTop: 'max(calc(env(safe-area-inset-top) + 14px), 20px)' }}>
      <div className="mx-auto max-w-3xl space-y-3 px-4 pb-16">
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-[#4E6158]">With Capital Rooms</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/lockup-ink.png" alt="Capital Rooms" style={{ height: 26, width: 'auto' }} />
        </div>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-[#14261F]" style={display}>Notes, jobs &amp; photos</h1>
        <p className="text-[14px] text-[#4E6158]">Add notes, links and photos, reply, and tick things off. Keep this link — it brings you straight back here.</p>
        <section className="rounded-[20px] bg-white p-4"><LandlordPlanner /></section>
      </div>
    </div>
  )
}
