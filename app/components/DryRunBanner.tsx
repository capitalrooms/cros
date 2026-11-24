// Shows on every page while dry run is on (lib/dryRun): the figures are real, but nothing can be written or sent.
export default function DryRunBanner() {
  if (process.env.NEXT_PUBLIC_CROS_DRY_RUN !== '1') return null
  return (
    <div role="status" className="sticky top-0 z-[60] bg-red-700 px-md py-xs text-center text-xs font-bold uppercase tracking-wider text-white">
      Dry run — real figures, nothing is written or sent
    </div>
  )
}
