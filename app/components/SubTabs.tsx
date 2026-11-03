// A row of pill tabs inside a page, for screens whose dark-band tabs (PageHero) are taken by the section they sit in —
// e.g. Contractor invoices and Capture inside Expenses (3 Nov 2026).
export default function SubTabs<K extends string>({ tabs, active, onChange }: { tabs: [K, string][]; active: K; onChange: (k: K) => void }) {
  return (
    <div className="flex flex-wrap gap-sm" role="tablist">
      {tabs.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={active === k} onClick={() => onChange(k)}
          className={`rounded-full px-md py-xs text-sm font-semibold ${active === k ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50'}`}>{l}</button>
      ))}
    </div>
  )
}
