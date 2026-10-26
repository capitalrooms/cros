// The old second job list (26 Oct 2026): nothing links here any more and it had its own, older ways of saving. Every
// job lives on the contractor home and its job screen now, so this address just goes there.
import { redirect } from 'next/navigation'

export default function OldJobsList() {
  redirect('/contractor')
}
