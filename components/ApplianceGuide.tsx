// An appliance's care guide as a tenant sees it (the office-approved guide, migration 269 — lib/house/careGuide):
// what to check, what the error codes mean, when to report it. Shown on the house information page and inside
// "Report a repair" when they pick that appliance (10 Nov 2026). Display only.
/* eslint-disable @typescript-eslint/no-explicit-any */

export default function ApplianceGuide({ guide, codeFilter }: { guide: any; codeFilter?: string }) {
  if (!guide) return null
  const code = (codeFilter ?? '').trim().toUpperCase()
  const codes: any[] = guide.errorCodes ?? []
  // they've typed an error code: that one first
  const sorted = code ? [...codes].sort((a, b) => Number(String(b.code).toUpperCase().includes(code)) - Number(String(a.code).toUpperCase().includes(code))) : codes
  return (
    <div className="space-y-sm text-sm leading-relaxed text-neutral-700">
      {guide.summary && <p>{guide.summary}</p>}
      {(guide.sections ?? []).map((sec: any) => (
        <div key={sec.title}>
          <p className="font-semibold text-neutral-900">{sec.title}</p>
          <ol className="mt-0.5 list-decimal space-y-0.5 pl-lg">{(sec.steps ?? []).map((t: string, i: number) => <li key={i}>{t}</li>)}</ol>
        </div>
      ))}
      {sorted.length > 0 && (
        <div>
          <p className="font-semibold text-neutral-900">Error codes</p>
          <ul className="mt-0.5 space-y-0.5">
            {sorted.map((e: any) => (
              <li key={e.code} className={code && String(e.code).toUpperCase().includes(code) ? 'rounded-md bg-amber-50 px-xs' : ''}><strong>{e.code}</strong>: {String(e.meaning ?? '').replace(/[.\s]+$/, '')}. {e.whatToDo}</li>
            ))}
          </ul>
        </div>
      )}
      {(guide.reportIf ?? []).length > 0 && (
        <div>
          <p className="font-semibold text-neutral-900">Report it to us if</p>
          <ul className="mt-0.5 list-disc pl-lg">{guide.reportIf.map((t: string) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}
      {guide.manualUrl && <a href={guide.manualUrl} target="_blank" rel="noreferrer" className="inline-block text-xs font-semibold text-blue-700 underline">The manufacturer’s manual ↗</a>}
    </div>
  )
}
