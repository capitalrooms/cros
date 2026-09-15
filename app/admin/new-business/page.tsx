'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const STAGES = [
  { n: 1, label: 'New Enquiry',       colour: 'amber',  action: true  },
  { n: 2, label: 'Welcome Pack Sent', colour: 'blue',   action: false },
  { n: 3, label: 'Docs Received',     colour: 'amber',  action: true  },
  { n: 4, label: 'Verified',          colour: 'amber',  action: true  },
  { n: 5, label: 'Agreement Sent',    colour: 'blue',   action: false },
  { n: 6, label: 'Fully Onboarded',   colour: 'green',  action: false },
]

const STAGE_DOT: Record<string, string> = {
  amber: 'bg-amber-400',
  blue:  'bg-blue-400',
  green: 'bg-green-500',
}

const TOOLS = [
  {
    href:  '/admin/new-business/send-welcome',
    emoji: '🚀',
    title: 'Send welcome pack + agreement',
    desc:  'The recommended first step. Enter landlord + property details, review the management agreement, and send everything in one email.',
    primary: true,
  },
  {
    href:  '/admin/new-business/acquisition',
    emoji: '✉️',
    title: 'Send acquisition email',
    desc:  'Send a personalised introduction email to a prospective landlord before they commit.',
  },
  {
    href:  '/admin/valuations',
    emoji: '📄',
    title: 'Produce valuation',
    desc:  'Generate a branded rental valuation letter — HMO or single let, current or post-refurbishment.',
  },
  {
    href:  '/admin/new-business/management-agreement',
    emoji: '📋',
    title: 'Management agreement',
    desc:  'Generate a management agreement PDF to download — useful for re-generating or printing.',
  },
]

export default function NewBusinessPage() {
  const [stageCounts, setStageCounts] = useState<Record<number, number>>({})
  const [pipelineLoading, setPipelineLoading] = useState(true)

  useEffect(() => {
    fetch('/api/landlord-onboarding')
      .then(r => r.json())
      .then(d => {
        const counts: Record<number, number> = {}
        for (const row of d.rows ?? []) {
          if (row.stage > 0) counts[row.stage] = (counts[row.stage] ?? 0) + 1
        }
        setStageCounts(counts)
      })
      .catch(() => {})
      .finally(() => setPipelineLoading(false))
  }, [])

  const totalActive  = Object.values(stageCounts).reduce((s, n) => s + n, 0)
  const needsAction  = STAGES.filter(s => s.action).reduce((s, st) => s + (stageCounts[st.n] ?? 0), 0)

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-3xl px-lg py-2xl">
        <div className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">🏗 New Business</h1>
          <p className="text-sm text-neutral-500 mt-xs">
            Tools for winning and onboarding new landlord instructions.
          </p>
        </div>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-md px-xs">Actions</p>
        <div className="space-y-md mb-2xl">
          {TOOLS.map(tool => (
            <Link
              key={tool.href}
              href={tool.href}
              className={`flex items-start gap-lg rounded-2xl p-lg transition-all group ${
                tool.primary
                  ? 'bg-neutral-900 text-white hover:bg-neutral-800 shadow-sm'
                  : 'bg-white border border-neutral-200 hover:border-neutral-300 hover:shadow-sm'
              }`}
            >
              <div className="text-3xl shrink-0">{tool.emoji}</div>
              <div className="flex-1 min-w-0">
                <h2 className={`text-base font-bold mb-xs ${tool.primary ? 'text-white' : 'text-neutral-900'}`}>
                  {tool.title}
                </h2>
                <p className={`text-sm leading-relaxed ${tool.primary ? 'text-neutral-400' : 'text-neutral-500'}`}>
                  {tool.desc}
                </p>
              </div>
              <div className={`transition-colors shrink-0 self-center text-lg ${tool.primary ? 'text-neutral-500 group-hover:text-neutral-300' : 'text-neutral-300 group-hover:text-neutral-500'}`}>→</div>
            </Link>
          ))}
        </div>

        {/* ── Pipeline status ───────────────────────────────────────────── */}
        <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-md px-xs">Pipeline status</p>
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          {/* Header row */}
          <div className="flex items-center justify-between px-lg py-md border-b border-neutral-100">
            <div>
              <p className="text-sm font-bold text-neutral-900">AML Onboarding Pipeline</p>
              <p className="text-xs text-neutral-400 mt-xs">
                {pipelineLoading
                  ? 'Loading…'
                  : totalActive === 0
                    ? 'No landlords in the pipeline'
                    : `${totalActive} landlord${totalActive !== 1 ? 's' : ''} in pipeline${needsAction > 0 ? ` · ${needsAction} need${needsAction === 1 ? 's' : ''} action` : ''}`
                }
              </p>
            </div>
            <Link
              href="/admin/new-business/onboarding"
              className="text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition rounded-lg px-sm py-xs"
            >
              Open pipeline →
            </Link>
          </div>

          {/* Stage breakdown */}
          <div className="divide-y divide-neutral-50">
            {STAGES.map(stage => {
              const count = stageCounts[stage.n] ?? 0
              return (
                <div key={stage.n} className={`flex items-center gap-sm px-lg py-sm ${count > 0 && stage.action ? 'bg-amber-50/40' : ''}`}>
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${count > 0 ? STAGE_DOT[stage.colour] : 'bg-neutral-200'}`} />
                  <span className={`text-sm flex-1 ${count > 0 ? 'text-neutral-800' : 'text-neutral-300'}`}>
                    {stage.label}
                  </span>
                  {count > 0 ? (
                    <span className={`text-xs font-bold px-xs py-0.5 rounded-md ${
                      stage.action
                        ? 'bg-amber-100 text-amber-700'
                        : stage.colour === 'green'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                    }`}>
                      {count}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-300">—</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
