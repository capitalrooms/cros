'use client';

// What needs to be fixed? — the first step of reporting a repair (25 Oct 2026: reached straight from "Report an issue",
// no "how would you like to report this?" choice first; one compact list instead of a long scroll of large cards).
import Link from 'next/link';
import { MAINTENANCE_CATEGORIES } from './categories';
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import LineIcon from '@/components/LineIcon'

export default function MaintenanceHub() {
  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        left={<BackButton href="/tenant" label="Home" />}
      />

      <main className="mx-auto max-w-xl px-lg py-xl">
        <h1 className="text-xl font-bold text-neutral-900">What needs fixing?</h1>
        <p className="mt-xs text-sm text-neutral-600">Pick the closest match — you’ll describe it on the next screen.</p>

        <ul className="mt-lg divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {MAINTENANCE_CATEGORIES.map((category) => (
            <li key={category.id}>
              <Link href={`/tenant/maintenance/report?category=${category.id}`} className="flex items-center gap-md px-lg py-md hover:bg-neutral-50">
                <span className="text-2xl" aria-hidden="true">{<LineIcon glyph={category.icon} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-neutral-900">{category.title}</span>
                  <span className="block truncate text-xs text-neutral-500">{category.description}</span>
                </span>
                <span className="text-neutral-400" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-lg space-y-sm text-sm">
          <Link href="/tenant/maintenance-smart" className="block rounded-xl border border-neutral-200 bg-white px-lg py-md text-neutral-800 hover:bg-neutral-50">
            <b>Not sure what’s wrong?</b> Answer a few questions and we’ll help you work it out — or report it from there.
          </Link>
          <Link href="/tenant/emergency" className="block rounded-xl border border-red-200 bg-red-50 px-lg py-md text-red-900 hover:bg-red-100">
            <b>Water pouring, no power or heating, a door that won’t lock?</b> Report an emergency
          </Link>
        </div>
      </main>
    </div>
  );
}
