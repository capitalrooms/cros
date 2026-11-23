// Readiness for the month, from the rent roll (lib/finance/rentRoll). One green list of the houses that are ready to
// process (every unit's rent is in, nothing blocking), and beneath it, for every house not yet ready, exactly what is
// still missing — house by house and unit by unit. Pure: no database. Tested by lib/finance/readiness.test.ts.
import type { RentRoll, RollProperty, RollRoom } from '@/lib/finance/rentRoll'

export type Blocker = { kind: 'no_charge' | 'unpaid' | 'part_paid' | 'over_paid'; room: string; tenant: string; amount: number; text: string }
export interface HouseReadiness {
  propertyId: string; name: string; landlord: string
  state: 'ready' | 'waiting' | 'not_started'
  unitsTotal: number; unitsReady: number
  blockers: Blocker[]
  missingTotal: number
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const gbp = (n: number) => `£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function blockerOf(r: RollRoom): Blocker | null {
  const tenant = r.tenant || 'No tenant'
  if (r.status === 'no_charge') return { kind: 'no_charge', room: r.room, tenant, amount: r.expected ?? 0, text: `${r.room}: no rent charge raised yet (${r.expected ? gbp(r.expected) + ' expected' : 'amount not set'})` }
  if (r.status === 'missing') return { kind: 'unpaid', room: r.room, tenant, amount: r2(-(r.difference ?? 0)), text: `${r.room} · ${tenant}: ${gbp(-(r.difference ?? 0))} not received` }
  if (r.status === 'part') return { kind: 'part_paid', room: r.room, tenant, amount: r2(-(r.difference ?? 0)), text: `${r.room} · ${tenant}: part paid, ${gbp(-(r.difference ?? 0))} short` }
  return null   // paid, over, on a statement already, or collected by the previous agent: nothing blocks
}

/** Every house for the month, ready or not. Ready = nothing outstanding for any unit. */
export function houseReadiness(roll: RentRoll): HouseReadiness[] {
  return roll.properties.map((p: RollProperty) => {
    const blockers = p.rooms.map(blockerOf).filter((b): b is Blocker => !!b)
    const ready = blockers.length === 0 || !!p.allIn || !!p.payPart
    const state: HouseReadiness['state'] = ready ? 'ready' : p.received > 0 ? 'waiting' : 'not_started'
    return {
      propertyId: p.id, name: p.name, landlord: p.landlord, state,
      unitsTotal: p.rooms.length, unitsReady: p.rooms.length - blockers.length,
      blockers, missingTotal: r2(blockers.reduce((n, b) => n + b.amount, 0)),
    }
  }).sort((a, b) => (a.state === b.state ? a.name.localeCompare(b.name) : a.state === 'ready' ? -1 : b.state === 'ready' ? 1 : a.state === 'waiting' ? -1 : 1))
}

export const readinessSummary = (rows: HouseReadiness[]) => ({
  houses: rows.length,
  ready: rows.filter(r => r.state === 'ready').length,
  waiting: rows.filter(r => r.state === 'waiting').length,
  notStarted: rows.filter(r => r.state === 'not_started').length,
})
