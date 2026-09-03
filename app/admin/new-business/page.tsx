'use client'

import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const actions = [
  {
    href: '/admin/new-business/acquisition',
    emoji: '✉️',
    title: 'Send Acquisition Email',
    desc: 'Send a personalised introduction email to a prospective landlord. The template is fixed — only the name, greeting, and headshot swap per send.',
    badge: null,
    disabled: false,
  },
  {
    href: '/admin/valuations',
    emoji: '📄',
    title: 'Produce Valuation',
    desc: 'Generate a branded rental valuation letter — HMO or single let, current or post-refurbishment. Export as PDF.',
    badge: null,
    disabled: false,
  },
  {
    href: '/admin/new-business/onboarding',
    emoji: '🔐',
    title: 'Onboard Landlord',
    desc: 'Send a welcome pack, collect AML documents, verify identity, and track progress through to fully onboarded.',
    badge: null,
    disabled: false,
  },
]

export default function NewBusinessPage() {
  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-3xl px-lg py-2xl">
        <div className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">🏗 New Business</h1>
          <p className="text-sm text-neutral-500 mt-xs">
            Independent tools for winning, onboarding, and valuing new landlord instructions.
            Use any of these in any order — they are not a locked sequence.
          </p>
        </div>

        <div className="space-y-md">
          {actions.map((action) => (
            action.disabled ? (
              <div
                key={action.href}
                className="flex items-start gap-lg bg-white rounded-xl border border-neutral-200 p-lg opacity-60 cursor-not-allowed"
              >
                <div className="text-3xl shrink-0">{action.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-sm mb-xs">
                    <h2 className="text-base font-semibold text-neutral-900">{action.title}</h2>
                    {action.badge && (
                      <span className="text-xs bg-neutral-100 text-neutral-500 px-sm py-0.5 rounded-full border border-neutral-200">
                        {action.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-500 leading-relaxed">{action.desc}</p>
                </div>
              </div>
            ) : (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-start gap-lg bg-white rounded-xl border border-neutral-200 p-lg hover:border-neutral-300 hover:shadow-sm transition-all group"
              >
                <div className="text-3xl shrink-0">{action.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-sm mb-xs">
                    <h2 className="text-base font-semibold text-neutral-900 group-hover:text-neutral-700">
                      {action.title}
                    </h2>
                  </div>
                  <p className="text-sm text-neutral-500 leading-relaxed">{action.desc}</p>
                </div>
                <div className="text-neutral-300 group-hover:text-neutral-500 transition-colors shrink-0 self-center text-lg">→</div>
              </Link>
            )
          ))}
        </div>

        <div className="mt-2xl p-lg bg-neutral-50 border border-neutral-200 rounded-xl">
          <p className="text-xs text-neutral-500 leading-relaxed">
            <strong className="text-neutral-700">Note:</strong> A valuation can be sent to any landlord at any time, with no assumption it leads to a management instruction.
            Onboarding can start from a direct referral with no prior valuation or acquisition email.
            The acquisition email can include a valuation PDF as an optional attachment — use the "Produce Valuation" tool first, then attach the exported PDF when sending.
          </p>
        </div>
      </main>
    </div>
  )
}
