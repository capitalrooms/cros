'use client'

// Shared planner — the office side: one board per person (cleaners, contractors, lettings; chosen landlords),
// with notes, properties, due dates, links and photos, and replies from them. Your own Planner is unchanged.

import { use } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import SharedPlanner from '@/components/SharedPlanner'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'

export default function SharedPlannerPage({ searchParams }: { searchParams: PageSearchParams }) {
  const board = one(use(searchParams).board)
  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/planner" />} title="Shared planner" />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Shared planner</h1>
          <p className="text-sm text-neutral-600">A board with each person — notes on properties, jobs to look at, photo ideas and links. They reply and tick things off in their app.</p>
        </div>
        <SharedPlanner mode="office" initialBoard={board} />
      </div>
    </div>
  )
}
