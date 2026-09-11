/**
 * StatTile
 *
 * Dark stat tile for DarkHeroHeader grids.
 * Used on lettings, cleaner, and contractor dashboards.
 *
 * Usage:
 *   <div className="grid grid-cols-3 gap-sm">
 *     <StatTile value={3} label="Today" valueColor="text-blue-400" />
 *     <StatTile value={1} label="Overdue" valueColor="text-red-400" />
 *     <StatTile value={12} label="Upcoming" />
 *   </div>
 */
export default function StatTile({
  value,
  label,
  valueColor = 'text-white',
}: {
  value: number
  label: string
  valueColor?: string
}) {
  return (
    <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-md text-center">
      <p className={`text-3xl font-black tabular-nums ${valueColor}`}>{value}</p>
      <p className="text-xs font-medium text-white/40 mt-xs">{label}</p>
    </div>
  )
}
