'use client'

import Link from 'next/link'

interface Props {
  name: string
  role: string
  personId: string
}

const ROLE_EMOJI: Record<string, string> = {
  tenant:     '🏠',
  contractor: '👷',
  cleaner:    '🧹',
  landlord:   '🤝',
}

export default function ViewAsBanner({ name, role, personId }: Props) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-md border-b-2 border-amber-500 bg-amber-400 px-lg py-sm">
      <div className="flex items-center gap-sm min-w-0">
        <span className="text-lg shrink-0">👁</span>
        <span className="font-bold text-amber-900 text-sm truncate">
          Viewing as {name}
        </span>
        <span className="shrink-0 text-xs font-bold bg-amber-200 text-amber-900 px-sm py-xs rounded-full">
          {ROLE_EMOJI[role] || '👤'} {role}
        </span>
        <span className="shrink-0 text-xs text-amber-800 hidden sm:inline">— admin preview only</span>
      </div>
      <div className="flex shrink-0 items-center gap-sm">
        <Link
          href={`/admin/view-as/${personId}`}
          className="text-xs font-semibold text-amber-900 bg-amber-200 hover:bg-amber-300 px-md py-xs rounded-lg transition-colors"
        >
          Profile
        </Link>
        <Link
          href="/admin/people"
          className="text-xs font-bold text-amber-900 bg-amber-200 hover:bg-amber-300 px-md py-xs rounded-lg transition-colors"
        >
          ✕ Exit
        </Link>
      </div>
    </div>
  )
}
