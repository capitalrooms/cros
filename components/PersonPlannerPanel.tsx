'use client'
// A person's shared planner on their own profile (4 Nov 2026, Harry looked for it on Jacob's page — "one screen per
// person"): whether there's a board, how much is open, a link into it, and Email them the board (with a test to you
// first). Starts a board if there isn't one. Office only.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/adminFetch'
import { EmailBoard } from '@/components/SharedPlanner'

export default function PersonPlannerPanel({ personId, name }: { personId: string; name: string }) {
  const [board, setBoard] = useState<{ id: string; title: string; open: number } | null | undefined>(undefined)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const r = await adminFetch('/api/planner/shared')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error ?? 'The planner didn’t load'); setBoard(null); return }
    setBoard(((d.boards ?? []) as any[]).find(b => b.personId === personId) ?? null)
  }, [personId])
  useEffect(() => { load() }, [load])
  async function post(body: Record<string, unknown>) {
    const r = await adminFetch('/api/planner/shared', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error ?? 'Not saved')
    return d
  }
  if (board === undefined) return null
  return (
    <section className="space-y-sm rounded-2xl border border-neutral-200 bg-white p-lg">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h2 className="text-lg font-bold text-neutral-900">Shared planner</h2>
        {board && <Link href={`/admin/planner/shared?board=${board.id}`} className="text-sm font-semibold text-blue-700 hover:underline">Open the board</Link>}
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {board ? (
        <>
          <p className="text-sm text-neutral-700">{board.title} · <b>{board.open}</b> open item{board.open === 1 ? '' : 's'}.</p>
          <EmailBoard boardId={board.id} member={name} post={post} />
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <p className="text-sm text-neutral-600">No shared planner with {name} yet.</p>
          <button type="button" onClick={async () => { try { await post({ action: 'create_board', personId }); await load() } catch (e) { setErr(e instanceof Error ? e.message : 'Not started') } }}
            className="rounded-xl bg-neutral-900 px-md py-xs text-sm font-bold text-white">Start a board with {name}</button>
        </div>
      )}
    </section>
  )
}
