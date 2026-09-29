// The payment reference an applicant uses for a holding deposit: "HOLD" + the room's rent reference, e.g. HOLD208ROS05.
// Distinct from the rent reference (208ROS05) so the bank import never files a holding deposit as rent — its matcher
// only picks up a reference that isn't glued to other letters.
import { buildPaymentRef } from '@/lib/tenancy/paymentRef'

export function holdingDepositRef(propertyName: string | null | undefined, roomName: string | null | undefined, fallbackName?: string | null): string {
  if (propertyName) return `HOLD${buildPaymentRef(propertyName, roomName)}`
  const name = String(fallbackName || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8)
  return `HOLD${name || 'ROOM'}`
}
