/**
 * RoomDetailTags — 3-state tag pills for en-suite, shared bathroom, and lounge.
 *
 * true  → confirmed present  → solid coloured pill
 * false → confirmed absent   → muted outline pill
 * null  → not specified      → dashed outline pill reading "? Not specified"
 *
 * Never renders null as "no" — that would misinform applicants.
 */

interface TagConfig {
  trueLabel: string
  falseLabel: string
}

const TAG_CONFIG: Record<string, TagConfig> = {
  has_ensuite:         { trueLabel: 'En-suite',        falseLabel: 'Shared bathroom' },
  has_shared_bathroom: { trueLabel: 'Shared bathroom', falseLabel: 'Private bathroom' },
  has_lounge:          { trueLabel: 'Lounge',          falseLabel: 'No lounge' },
}

interface Props {
  has_ensuite?: boolean | null
  has_shared_bathroom?: boolean | null
  has_lounge?: boolean | null
  className?: string
}

function Tag({ field, value }: { field: string; value: boolean | null | undefined }) {
  const cfg = TAG_CONFIG[field]
  if (!cfg) return null

  if (value === true) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
        ✓ {cfg.trueLabel}
      </span>
    )
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500 border border-neutral-200">
        {cfg.falseLabel}
      </span>
    )
  }
  // null / undefined → "not specified"
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-neutral-400 border border-dashed border-neutral-300"
      title={`${cfg.trueLabel}: not specified — details not yet confirmed`}
    >
      ? {cfg.trueLabel}
    </span>
  )
}

export default function RoomDetailTags({ has_ensuite, has_shared_bathroom, has_lounge, className = '' }: Props) {
  // Only render the lounge tag if en-suite and shared bathroom are both set or at least one is
  const allUnset = has_ensuite == null && has_shared_bathroom == null && has_lounge == null
  if (allUnset) return null

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {has_ensuite !== undefined && (
        <Tag field="has_ensuite" value={has_ensuite} />
      )}
      {/* Only show shared bathroom tag if ensuite info doesn't already answer it */}
      {has_shared_bathroom !== undefined && has_ensuite !== true && (
        <Tag field="has_shared_bathroom" value={has_shared_bathroom} />
      )}
      {has_lounge !== undefined && (
        <Tag field="has_lounge" value={has_lounge} />
      )}
    </div>
  )
}
