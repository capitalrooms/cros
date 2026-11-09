// The separate "smart troubleshooting" flow (9 Nov 2026) is now part of reporting a repair: every report suggests quick,
// safe things to try first (/api/tenant/repair-tips). Old links land on the one flow.
import { redirect } from 'next/navigation'
export default function OldSmartFlow() { redirect('/tenant/maintenance') }
