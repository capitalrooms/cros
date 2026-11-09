'use client'

// The room's listing at a glance, on the room / property record (9 Nov 2026, Harry: the listing and the record should
// link both ways). Reads the real listing — status, what's still missing, photos — and opens it with a way back here.
import Link from 'next/link'
import { useEffect, useState } from 'react'

const STATUS: Record<string, [string, string]> = {
  draft: ['Draft', 'bg-neutral-100 text-neutral-700'], ready: ['Ready', 'bg-blue-50 text-blue-800'], live: ['Live', 'bg-emerald-50 text-emerald-800'],
  let_agreed: ['Let agreed', 'bg-amber-50 text-amber-800'], let: ['Let', 'bg-neutral-100 text-neutral-600'], withdrawn: ['Withdrawn', 'bg-neutral-100 text-neutral-500'],
}

export default function ListingStatus({ roomId, from, className = '' }: { roomId: string; from: string; className?: string }) {
  const [d, setD] = useState<null | { listing: any; missing?: string[]; mediaCount?: number }>(null)
  useEffect(() => { fetch(`/api/lettings/listings?roomId=${roomId}`).then(r => r.ok ? r.json() : null).then(j => j && setD(j)).catch(() => {}) }, [roomId])
  const href = `/admin/listing/${roomId}?from=${encodeURIComponent(from)}`
  const l = d?.listing
  const st = l ? STATUS[l.status] ?? [l.status, 'bg-neutral-100 text-neutral-700'] : null
  return (
    <div className={`flex flex-wrap items-center justify-between gap-sm ${className}`}>
      <p className="text-[13px] text-neutral-600">
        {!d ? 'Listing…' : !l ? 'No listing yet — it opens filled in from this record' : <>
          <span className={`mr-xs rounded-full px-sm py-0.5 text-xs font-semibold ${st![1]}`}>Listing · {st![0]}</span>
          {d.mediaCount ?? 0} photo{d.mediaCount === 1 ? '' : 's'}{d.missing?.length ? <> · <b className="text-amber-800">{d.missing.length} thing{d.missing.length === 1 ? '' : 's'} to finish</b></> : ' · complete'}
        </>}
      </p>
      <Link href={href} className="rounded-lg border border-neutral-300 bg-white px-md py-1.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-50">{l ? 'Open the listing' : 'Open the listing'}</Link>
    </div>
  )
}
