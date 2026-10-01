'use client'

// The extra terms for a Rent collection & client account agreement — used on the Management agreement page and the
// onboarding Send welcome flow so both produce the same agreement.
import type { RentCollectionTerms } from '@/lib/managementAgreement/rentCollectionTerms'

const inp = 'w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900'
const lbl = 'block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs'

export default function RentCollectionFields({ value, onChange, isCompany }: {
  value: RentCollectionTerms
  onChange: (v: RentCollectionTerms) => void
  isCompany: boolean
}) {
  const set = <K extends keyof RentCollectionTerms>(k: K, v: RentCollectionTerms[K]) => onChange({ ...value, [k]: v })
  const num = (s: string) => (s === '' ? 0 : Math.max(0, Number(s) || 0))

  return (
    <div className="space-y-md">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        <div>
          <label className={lbl}>{isCompany ? 'Signs for the company *' : 'Signs for the client *'}</label>
          <input value={value.signatoryName} onChange={e => set('signatoryName', e.target.value)} className={inp} placeholder="e.g. Joe Rosen" />
        </div>
        <div>
          <label className={lbl}>Their role</label>
          <input value={value.signatoryRole} onChange={e => set('signatoryRole', e.target.value)} className={inp} placeholder="Director" />
        </div>
      </div>

      <div>
        <label className={lbl}>Service fee *</label>
        <input value={value.serviceFee} onChange={e => set('serviceFee', e.target.value)} className={inp}
          placeholder="e.g. £450 per month for all three properties, or 5% of rent collected" />
        <p className="text-xs text-neutral-400 mt-xs">Printed exactly as typed in the fees schedule.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
        <div>
          <label className={lbl}>Working float (£)</label>
          <input type="number" min={0} value={value.floatAmount} onChange={e => set('floatAmount', num(e.target.value))} className={inp} />
        </div>
        <div>
          <label className={lbl}>Shortfall paid within (days)</label>
          <input type="number" min={1} value={value.floatTopUpDays} onChange={e => set('floatTopUpDays', num(e.target.value))} className={inp} />
        </div>
        <div>
          <label className={lbl}>Inspect every (months)</label>
          <input type="number" min={1} value={value.inspectionMonths} onChange={e => set('inspectionMonths', num(e.target.value))} className={inp} />
        </div>
        <div>
          <label className={lbl}>Extra visit fee (£)</label>
          <input type="number" min={0} value={value.visitFee} onChange={e => set('visitFee', num(e.target.value))} className={inp} />
        </div>
      </div>

      <div>
        <label className={lbl}>Agreed fixed outgoings * <span className="normal-case font-normal text-neutral-400">— one per line</span></label>
        <textarea rows={5} value={value.fixedOutgoings.join('\n')} onChange={e => set('fixedOutgoings', e.target.value.split('\n'))} className={inp}
          placeholder={'Water — Thames Water (St David\'s)\nGas and electricity — OVO (all properties)\nInternet — BT / Hyperoptic (all properties)'} />
        <p className="text-xs text-neutral-400 mt-xs">The only payments you can make from the client account without a written instruction. Changes need written agreement.</p>
      </div>

      <div>
        <label className={lbl}>Letting fee (if instructed)</label>
        <input value={value.lettingFee} onChange={e => set('lettingFee', e.target.value)} className={inp} />
      </div>

      <div>
        <label className={lbl}>Matters before commencement that stay with the client <span className="normal-case font-normal text-neutral-400">— optional</span></label>
        <textarea rows={2} value={value.excludedMatters} onChange={e => set('excludedMatters', e.target.value)} className={inp}
          placeholder="e.g. Rent arrears case 451SDS05 and the Section 3 notice dated 15 October 2026" />
        <p className="text-xs text-neutral-400 mt-xs">All earlier arrears, notices and disputes are excluded anyway; list any you want named.</p>
      </div>
    </div>
  )
}
