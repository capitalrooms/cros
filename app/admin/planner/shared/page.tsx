'use client'

// Shared planner — the office side: one board per person (cleaners, contractors, lettings; chosen landlords),
// with notes, properties, due dates, links and photos, and replies from them. Your own Planner is unchanged.

import { use } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import SharedPlanner from '@/components/SharedPlanner'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'

export default function SharedPlannerPage({ searchParams }: { searchParams: PageSearchParams }) {
  const board = one(use(searchParams).board)
  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/planner" />} title="Shared planner" />
      <PageHero title="Shared planner" subtitle="A board with each person — notes on properties, jobs to look at, photo ideas and links. They reply and tick things off in their app." />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        <SharedPlanner mode="office" initialBoard={board} />
      </div>
    </div>
  )
}
