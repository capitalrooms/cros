/**
 * PropertyHeader — shared dark header used across property list views.
 *
 * Renders the inner content row (name · address · HMO badge · metadata).
 * Each consuming page wraps this in its own outer container
 * (a <div> card or a <tr><td> table row) so the DOM context stays valid.
 *
 * Props
 *   id           — property UUID, used to build the href
 *   name         — property display name
 *   address      — street address (shown instead of name if different)
 *   propertyCode — short mono code, shown before the name
 *   propertyType — 'hmo' (purple badge) | 'single_let' (teal badge)
 *   roomCount    — total rooms; shown in the badge and metadata row
 *   occupiedCount— rooms with a live tenant (optional)
 *   bedrooms     — bedroom count for the metadata row (optional)
 *   bathrooms    — bathroom count for the metadata row (optional)
 *   compact      — true = single-line format (for table rows); false = card format with bigger name
 *   rightSlot    — page-specific buttons/controls placed to the right of the badge
 */

import Link from 'next/link'

export interface PropertyHeaderProps {
  id: string
  name: string
  address?: string | null
  propertyCode?: string | null
  propertyType?: 'hmo' | 'single_let'
  roomCount?: number
  occupiedCount?: number
  bedrooms?: number
  bathrooms?: number
  compact?: boolean
  rightSlot?: React.ReactNode
}

export default function PropertyHeader({
  id,
  name,
  address,
  propertyCode,
  propertyType = 'hmo',
  roomCount,
  occupiedCount,
  bedrooms,
  bathrooms,
  compact = false,
  rightSlot,
}: PropertyHeaderProps) {
  const isHmo = propertyType !== 'single_let'
  const displayName = address && address !== name ? address : name
  const subName    = address && address !== name ? name : null

  const badge = (
    <span
      className={`shrink-0 rounded px-md py-xs text-xs font-semibold ${
        isHmo ? 'bg-purple-600 text-white' : 'bg-teal-600 text-white'
      }`}
    >
      {isHmo
        ? `HMO · ${roomCount ?? 0} room${(roomCount ?? 0) !== 1 ? 's' : ''}`
        : 'Single let'}
    </span>
  )

  return (
    <Link
      href={`/admin/properties/${id}`}
      className="block hover:opacity-90 transition-opacity"
      onClick={(e) => e.stopPropagation()} // prevent double-fire when inside a clickable row
    >
      <div className={`flex items-center justify-between gap-md ${compact ? 'px-lg py-sm' : 'px-lg py-md'}`}>
        {/* Left: name + address + metadata */}
        <div className="min-w-0 flex-1">
          {compact ? (
            /* Single-line compact format for table rows */
            <div className="flex items-baseline gap-sm min-w-0">
              {propertyCode && (
                <span className="shrink-0 font-mono text-xs font-bold text-neutral-400">
                  {propertyCode}
                </span>
              )}
              <span className="font-bold text-white truncate">{displayName}</span>
              {subName && (
                <span className="text-xs text-neutral-400 truncate">{subName}</span>
              )}
            </div>
          ) : (
            /* Card format with bigger name and metadata row */
            <>
              <h2 className="text-xl font-bold text-white group-hover:underline">
                {displayName}
              </h2>
              {subName && (
                <p className="text-sm text-neutral-300 mt-xs">{subName}</p>
              )}
              {address && address !== name && address !== displayName && (
                <p className="text-sm text-neutral-300 mt-xs">{address}</p>
              )}
              {(bedrooms != null || roomCount != null || occupiedCount != null) && (
                <div className="flex flex-wrap gap-sm mt-md text-xs text-neutral-400">
                  {bedrooms != null && (
                    <span>{bedrooms} bed{bedrooms !== 1 ? 's' : ''}</span>
                  )}
                  {bathrooms != null && (
                    <>
                      <span>•</span>
                      <span>{bathrooms} bath{bathrooms !== 1 ? 's' : ''}</span>
                    </>
                  )}
                  {roomCount != null && (
                    <>
                      <span>•</span>
                      <span>{roomCount} room{roomCount !== 1 ? 's' : ''}</span>
                    </>
                  )}
                  {occupiedCount != null && (
                    <>
                      <span>•</span>
                      <span className="font-semibold text-white">{occupiedCount} occupied</span>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: page slot + badge */}
        <div className="flex shrink-0 items-center gap-sm">
          {rightSlot}
          {badge}
        </div>
      </div>
    </Link>
  )
}
