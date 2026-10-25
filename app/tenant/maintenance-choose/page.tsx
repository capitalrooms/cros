// The "how would you like to report this?" choice (25 Oct 2026): it was a second choice before a tenant could say what
// was wrong — Report Maintenance or Smart Troubleshooting. Reporting now goes straight to "What needs to be fixed?",
// which offers the step-by-step troubleshooter as a link. An old link or bookmark lands there.
import { redirect } from 'next/navigation'

export default function MaintenanceChoose() {
  redirect('/tenant/maintenance')
}
