/**
 * Capital Rooms reference number generator.
 *
 * Format:
 *   Room-level:     TYPE-{PROPCODE}-{ROOM}-{SEQ:3}   e.g. T-008CLH-R4-003
 *   Date-based:     TYPE-{PROPCODE}-{ROOM}-{YYMM}    e.g. RR-008CLH-R4-2609
 *   Property-level: TYPE-{PROPCODE}-{SEQ:3}           e.g. EXP-008CLH-042
 *
 * Sequence is per-room per-type, derived by counting existing records — never reused.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Extract a stable room identifier from the room name. "Room 4" → "R4", "Studio" → "S1" */
export function roomCode(roomName: string): string {
  const digits = roomName.match(/\d+/)
  if (digits) return `R${digits[0]}`
  if (/studio/i.test(roomName)) return 'S1'
  return roomName.replace(/\s+/g, '').slice(0, 3).toUpperCase()
}

/** Zero-pad a sequence number */
const pad = (n: number, width = 3) => String(n).padStart(width, '0')

/** YYMM suffix — e.g. September 2026 → "2609" */
const yymm = (date: Date) =>
  String(date.getFullYear()).slice(2) + String(date.getMonth() + 1).padStart(2, '0')

/**
 * Generate all three references for a new tenancy: lease_reference, deposit_reference,
 * holding_deposit_reference. They all share the same sequence number so they stay linked.
 *
 * Call this immediately before inserting a tenancy record.
 */
export async function genTenancyRefs(
  supabase: SupabaseClient,
  propertyCode: string,
  roomName: string,
  roomId: string,
): Promise<{ lease_reference: string; deposit_reference: string; holding_deposit_reference: string }> {
  const { count } = await supabase
    .from('tenancies')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
  const seq = pad((count ?? 0) + 1)
  const rc = roomCode(roomName)
  return {
    lease_reference:          `T-${propertyCode}-${rc}-${seq}`,
    deposit_reference:        `DEP-${propertyCode}-${rc}-${seq}`,
    holding_deposit_reference: `HD-${propertyCode}-${rc}-${seq}`,
  }
}

/**
 * Generate a rent receipt reference for a rent_charges row.
 * Date-based — no counter needed since a room has at most one charge per month.
 */
export function genRentRef(propertyCode: string, roomName: string, chargeMonth: Date): string {
  return `RR-${propertyCode}-${roomCode(roomName)}-${yymm(chargeMonth)}`
}

/**
 * Generate an expense reference. Property-level sequential counter.
 */
export async function genExpenseRef(
  supabase: SupabaseClient,
  propertyCode: string,
  propertyId: string,
): Promise<string> {
  const { count } = await supabase
    .from('recharge_expenses')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
  return `EXP-${propertyCode}-${pad((count ?? 0) + 1)}`
}

/**
 * Generate a landlord statement reference. Date-based.
 */
export function genStatementRef(propertyCode: string, periodDate: Date): string {
  return `STMT-${propertyCode}-${yymm(periodDate)}`
}

/**
 * Generate a maintenance job reference. Property-level sequential counter.
 */
export async function genJobRef(
  supabase: SupabaseClient,
  propertyCode: string,
  propertyId: string,
): Promise<string> {
  const { count } = await supabase
    .from('maintenance_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
  return `JOB-${propertyCode}-${pad((count ?? 0) + 1)}`
}
