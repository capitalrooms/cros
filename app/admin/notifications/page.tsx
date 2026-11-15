// Folded into Contacts (15 Nov 2026, Harry: "one screen for contacts … we don't need other places for this").
// Each contact's App · Email · Text and the property switches now sit on /admin/people.
import { redirect } from 'next/navigation'
export default function Notifications() { redirect('/admin/people?tab=tenants') }
