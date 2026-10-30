// The separate let-only list is retired (30 Oct 2026): let-only houses are in All Properties with the "Let only" filter,
// and open on the same house and room pages as managed ones. Old links land there. (The old page is in git history.)
import { redirect } from 'next/navigation'

export default function LetOnlyPropertiesPage() {
  redirect('/admin/active-rooms#let-only')
}
